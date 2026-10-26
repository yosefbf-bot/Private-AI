"use strict";
const { DatabaseSync } = require("node:sqlite");
const { fail, uuid } = require("./security.cjs");
const {fileInputMetadata}=require('./request-budget.cjs');
const EVENTS = new Set([
  "app_registered",
  "app_opened",
  "startup",
  "shutdown",
  "request",
  "request_failed",
  "cleanup",
  "key_saved",
  "key_deleted",
  "settings",
  "export",
  "import",
  "chat_deleted",
  "peer_trusted",
  "peer_revoked",
  "job_started",
  "job_completed",
  "job_failed",
  "locked",
  "unlocked",
  "backup",
  "chrome_connected",
  "app_registered",
  "app_opened",
  "access_permissions",
  "access_read",
  "access_action",
  "sbar_created",
  "sbar_reviewed",
  "sbar_finalized",
  "provider_notification_logged",
  "provider_response_pending",
  "provider_response_received",
  "clinical_followup_created",
  "audio_quality_warning",
  "speaker_profile_updated",
  "speaker_identity_corrected",
  "meeting_commitment_confirmed",
]);
const META = {
  companion_meeting: ["id", "meetingId", "deviceId", "sourceId"],
  meeting_upload: ["id", "meetingId"],
  meeting_audio: ["id", "meetingId", "chunkId", "status", "created", "bytes", "sha256", "retryAt"],
  chat: ["id", "title", "project", "updated", "hipaa", "archived"],
  file: ["id", "name", "size", "updated", "hipaa", "ownerChat"],
  job: [],
};
class Store {
  constructor(file, cipher) {
    this.cipher = cipher;
    this._stmts = new Map();
    this.db = new DatabaseSync(file);
    try {
      this.db.exec(
        "PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA secure_delete=ON; PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-32000; PRAGMA mmap_size=67108864;",
      );
      this.migrate();
      this.db.exec(
        "CREATE INDEX IF NOT EXISTS idx_records_kind_updated ON records(kind, updated DESC); CREATE INDEX IF NOT EXISTS idx_meta_kind_updated ON record_meta(kind, updated DESC);",
      );
      let check = Object.values(this.db.prepare("PRAGMA quick_check(1)").get())[0];
      if (check !== "ok") {
        try {
          this.db.exec("REINDEX;");
          check = Object.values(this.db.prepare("PRAGMA quick_check(1)").get())[0];
        } catch {}
      }
      if (check !== "ok") throw fail("STORAGE");
    } catch (e) {
      this.db.close();
      throw e;
    }
  }
  _stmt(sql) {
    let stmt = this._stmts.get(sql);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this._stmts.set(sql, stmt);
    }
    return stmt;
  }
  transaction(fn) {
    if (this.db.isTransaction) {
      return fn();
    }
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const res = fn();
      if (res && typeof res.then === "function") {
        return Promise.resolve(res)
          .then((val) => {
            if (this.db && this.db.isTransaction) {
              this.db.exec("COMMIT");
            }
            return val;
          })
          .catch((err) => {
            if (this.db && this.db.isTransaction) {
              this.db.exec("ROLLBACK");
            }
            throw err;
          });
      }
      this.db.exec("COMMIT");
      return res;
    } catch (e) {
      if (this.db && this.db.isTransaction) {
        this.db.exec("ROLLBACK");
      }
      throw e;
    }
  }
  migrate() {
    const v = this.db.prepare("PRAGMA user_version").get().user_version;
    if (v > 3) throw fail("VERSION");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (v < 1)
        this.db.exec(
          "CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,updated INTEGER NOT NULL,expires INTEGER,payload BLOB NOT NULL,PRIMARY KEY(kind,id)); CREATE INDEX expiry ON records(expires); CREATE TABLE audit(seq INTEGER PRIMARY KEY AUTOINCREMENT,time INTEGER NOT NULL,event TEXT NOT NULL,detail TEXT NOT NULL,prev TEXT NOT NULL,mac TEXT NOT NULL); PRAGMA user_version=1;",
        );
      if (v < 2)
        this.db.exec(
          "CREATE TABLE claims(id TEXT PRIMARY KEY,claimed INTEGER NOT NULL); PRAGMA user_version=2;",
        );
      if (v < 3) {
        this.db.exec(
          "CREATE TABLE record_meta(kind TEXT NOT NULL,id TEXT NOT NULL,updated INTEGER NOT NULL,payload BLOB NOT NULL,PRIMARY KEY(kind,id));",
        );
        for (const kind of Object.keys(META))
          for (const r of this.db
            .prepare("SELECT id,updated,payload FROM records WHERE kind=?")
            .iterate(kind))
            this.putMeta(
              kind,
              r.id,
              this.cipher.open(r.payload, kind + ":" + r.id),
              r.updated,
            );
        this.db.exec("PRAGMA user_version=3");
      }
      // Schema-3 releases without job summaries may still write this database
      // after a rollback. Invalidate projections at the SQL boundary too; the
      // current writer rebuilds metadata in the same transaction as its record.
      this.db.exec(`
        CREATE TRIGGER IF NOT EXISTS invalidate_job_meta_insert AFTER INSERT ON records WHEN NEW.kind='job'
        BEGIN DELETE FROM record_meta WHERE kind='job' AND id=NEW.id; END;
        CREATE TRIGGER IF NOT EXISTS invalidate_job_meta_update AFTER UPDATE ON records WHEN OLD.kind='job' OR NEW.kind='job'
        BEGIN DELETE FROM record_meta WHERE kind='job' AND id IN (OLD.id,NEW.id); END;
        CREATE TRIGGER IF NOT EXISTS invalidate_job_meta_delete AFTER DELETE ON records WHEN OLD.kind='job'
        BEGIN DELETE FROM record_meta WHERE kind='job' AND id=OLD.id; END;
      `);
      this.db.exec("COMMIT");
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  put(kind, id, value, { updated = Date.now(), expires = null } = {}) {
    const transaction = !!META[kind] && !this.db.isTransaction;
    if (transaction) this.db.exec("BEGIN IMMEDIATE");
    try {
      this._stmt(
        "INSERT INTO records VALUES(?,?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET updated=excluded.updated,expires=excluded.expires,payload=excluded.payload",
      ).run(
        kind,
        id,
        updated,
        expires,
        this.cipher.seal(value, kind + ":" + id),
      );
      if (META[kind]) this.putMeta(kind, id, value, updated);
      if (transaction) this.db.exec("COMMIT");
      return value;
    } catch (e) {
      if (transaction) this.db.exec("ROLLBACK");
      throw e;
    }
  }
  putMeta(kind, id, value, updated) {
    const summary = Object.fromEntries(
      META[kind].map((k) => [k, k === "id" ? id : value[k]]),
    );
    if(kind==='file')Object.assign(summary,fileInputMetadata(value));
    if(kind==='job'){
      // Match the existing overview projection, encrypted separately from large
      // recovery inputs/answers. Backfill old records once through summaries().
      const {recoveryInput,checkpoint,savedAnswer,...job}=value;
      Object.assign(summary,job,{id,recoverable:!!recoveryInput&&!job.remote,step:checkpoint?.phase||null});
    }
    this._stmt(
      "INSERT INTO record_meta VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET updated=excluded.updated,payload=excluded.payload",
    ).run(
      kind,
      id,
      updated,
      this.cipher.seal(summary, "meta:" + kind + ":" + id),
    );
  }
  summaries(kind) {
    if (!META[kind]) throw fail("INVALID");
    // Additive metadata backfill for records from earlier application versions.
    this.transaction(() => {
      for (const r of this._stmt("SELECT r.id,r.updated,r.payload FROM records r LEFT JOIN record_meta m ON m.kind=r.kind AND m.id=r.id WHERE r.kind=? AND m.id IS NULL").iterate(kind))
        this.putMeta(kind,r.id,this.cipher.open(r.payload,kind+":"+r.id),r.updated);
    });
    return this._stmt(
      "SELECT id,payload FROM record_meta WHERE kind=? ORDER BY updated DESC",
    )
      .all(kind)
      .map((r) => this.cipher.open(r.payload, "meta:" + kind + ":" + r.id));
  }
  get(kind, id) {
    const r = this._stmt("SELECT * FROM records WHERE kind=? AND id=?").get(
      kind,
      id,
    );
    // Return the encrypted record exactly as saved. Row activity timestamps are
    // metadata, not a content edit or a replacement for a legacy payload field.
    return r ? this.cipher.open(r.payload, kind + ":" + id) : null;
  }
  summary(kind,id){
    if(!META[kind])throw fail('INVALID');
    const row=this._stmt('SELECT updated,payload FROM record_meta WHERE kind=? AND id=?').get(kind,id);
    return row?{...this.cipher.open(row.payload,'meta:'+kind+':'+id),updated:row.updated}:null;
  }
  touchChat(id,updated=Date.now()){
    return this.transaction(()=>{
      const meta=this.summary('chat',id);if(!meta)throw fail('INVALID');
      const result=this._stmt("UPDATE records SET updated=? WHERE kind='chat' AND id=?").run(updated,id);
      if(!result.changes)throw fail('INVALID');
      this.putMeta('chat',id,{...meta,updated},updated);
    });
  }
  project(kind, select) {
    const result = [];
    for (const r of this._stmt(
      "SELECT id,payload FROM records WHERE kind=? ORDER BY updated DESC",
    ).iterate(kind))
      result.push(
        select({ ...this.cipher.open(r.payload, kind + ":" + r.id), id: r.id }),
      );
    return result;
  }
  count(kind) {
    return this._stmt("SELECT COUNT(*) AS n FROM records WHERE kind=?").get(
      kind,
    ).n;
  }
  list(kind) {
    return this._stmt(
      "SELECT * FROM records WHERE kind=? ORDER BY updated DESC",
    )
      .all(kind)
      .map((r) => ({
        ...this.cipher.open(r.payload, kind + ":" + r.id),
        id: r.id,
        ...(kind==='chat'?{updated:r.updated}:{}),
      }));
  }
  recent(kind, limit = 200) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
      throw fail("INVALID");
    return this._stmt(
      "SELECT id,payload FROM records WHERE kind=? AND (expires IS NULL OR expires>?) ORDER BY updated DESC LIMIT ?",
    )
      .all(kind, Date.now(), limit)
      .map((r) => ({
        ...this.cipher.open(r.payload, kind + ":" + r.id),
        id: r.id,
      }));
  }
  deleteKind(kind) {
    if (kind !== "messageIn") throw fail("INVALID");
    this._stmt("DELETE FROM records WHERE kind=?").run(kind);
  }
  delete(kind, id) {
    const transaction = !!META[kind] && !this.db.isTransaction;
    if (transaction) this.db.exec("BEGIN IMMEDIATE");
    try {
      this._stmt("DELETE FROM records WHERE kind=? AND id=?").run(kind, id);
      if (META[kind])
        this._stmt("DELETE FROM record_meta WHERE kind=? AND id=?").run(
          kind,
          id,
        );
      if(kind==='chat')this._stmt("DELETE FROM records WHERE kind='chatDraft' AND id=?").run(id);
      if (transaction) this.db.exec("COMMIT");
    } catch (e) {
      if (transaction) this.db.exec("ROLLBACK");
      throw e;
    }
  }
  claim(id) {
    try {
      this._stmt("INSERT INTO claims VALUES(?,?)").run(id, Date.now());
      return true;
    } catch (e) {
      if (this._stmt("SELECT id FROM claims WHERE id=?").get(id)) return false;
      throw e;
    }
  }
  audit(event, detail = {}) {
    if (!EVENTS.has(event)) return;
    const clean = {};
    for (const k of [
      "count",
      "inputTokens",
      "outputTokens",
      "durationMs",
      "httpStatus",
    ])
      if (Number.isSafeInteger(detail[k]) && detail[k] >= 0)
        clean[k] = detail[k];
    const time = Date.now(),
      body = JSON.stringify(clean),
      prev =
        this.db.prepare("SELECT mac FROM audit ORDER BY seq DESC LIMIT 1").get()
          ?.mac || "";
    const mac = this.cipher.mac([time, event, body, prev].join("|"));
    this.db
      .prepare(
        "INSERT INTO audit(time,event,detail,prev,mac) VALUES(?,?,?,?,?)",
      )
      .run(time, event, body, prev, mac);
  }
  auditSummary() {
    return this.db
      .prepare(
        "SELECT time,event,detail FROM audit ORDER BY seq DESC LIMIT 100",
      )
      .all()
      .map((x) => ({ ...x, detail: JSON.parse(x.detail) }));
  }
  verifyAudit() {
    let prev = "";
    for (const r of this.db.prepare("SELECT * FROM audit ORDER BY seq").all()) {
      if (
        r.prev !== prev ||
        r.mac !== this.cipher.mac([r.time, r.event, r.detail, r.prev].join("|"))
      )
        return false;
      prev = r.mac;
    }
    return true;
  }
  cleanup(days, now = Date.now()) {
    const counts = { chats: 0, files: 0, memory: 0, jobs: 0, usage: 0, messages: 0, reports: 0, voiceTranscripts: 0, meetings: 0, sbars: 0, workflows: 0 };
    const cutoff = days ? now - days * 86400000 : null;
    // Reports and results from raw data are held for an additional 100 days (e.g., 100 + 100 = 200 days default)
    const reportCutoff = days ? now - (days + 100) * 86400000 : null;
    this.db.exec("BEGIN IMMEDIATE");
    let committed = false;
    try {
      const captureKinds = ['capture_note','capture_draft','capture_evidence','capture_upload','capture_notification','capture_delivery','capture_whatsapp_route','meeting_upload'];
      const communicationKinds = ['wf_communication_source','wf_communication_candidate'];
      const activeCaptures = this.list('capture_note').filter(c=>c.actionIds.some(id=>this.get('todo',id)?.status==='pending'));
      const activeCaptureIds = new Set(activeCaptures.map(c=>c.id));
      const activeEvidenceIds = new Set(activeCaptures.flatMap(c=>c.evidenceIds));
      // Older delivery claims had no source fields. Their retained notification
      // still identifies the unresolved source and must prevent an uncertain send retry.
      const activeDeliveryIds = new Set(this.list('capture_notification').filter(n=>activeCaptureIds.has(n.captureId)).map(n=>n.id));
      for (const kind of ["chat", "file", "memory", "job", "usage", "messageOut", "messageIn", "messagingSession", "companion_request", "companion_session", "voice_transcript", "meeting", "sbar", "wf_decision", "wf_metric_import", "wf_action_meta", "wf_playbook_run",...captureKinds,...communicationKinds])
        for (const r of this.db
          .prepare("SELECT id,updated,expires FROM records WHERE kind=?")
          .all(kind)) {
          // Only files/jobs that could expire need their encrypted body opened.
          // Communications deliberately retain their observation-time rules below.
          if(['file','job'].includes(kind)&&!(r.expires&&r.expires<=now)&&!(cutoff&&r.updated<=cutoff))continue;
          const value = ["job", "file", "meeting", "sbar", "wf_decision",'wf_action_meta',...captureKinds,...communicationKinds].includes(kind) ? this.get(kind, r.id) : null;
          if (kind==='capture_note' && activeCaptureIds.has(r.id) || kind==='capture_evidence' && activeEvidenceIds.has(r.id) || kind==='capture_whatsapp_route' && activeCaptureIds.has(r.id) || kind==='capture_delivery' && activeDeliveryIds.has(r.id) || ['capture_draft','wf_action_meta','capture_notification','capture_delivery'].includes(kind) && activeCaptureIds.has(value?.captureId)) continue;
          if (kind === "wf_decision" && value?.status !== "closed") continue;
          if (kind === "meeting" && (value?.status !== "completed" || value?.actionItems?.some(a => !["completed", "cancelled"].includes(a.status)))) continue;
          if (kind === "sbar" && !value?.closeTheLoop?.isComplete) continue;
          if (kind === "job" && ["queued", "running", "waiting", "paused"].includes(value?.status))
            continue;

          let targetCutoff = cutoff;
          const isReportFile = kind === "file" && (value?.subfolder === "Reports" || value?.isReport || value?.ext === ".pdf" || value?.name?.endsWith(".pdf") || value?.name?.includes("Report"));
          const isReportJob = kind === "job" && (value?.output?.includes("Reports") || value?.format === "pdf" || value?.title?.toLowerCase().includes("report"));
          if (isReportFile || isReportJob) {
            targetCutoff = reportCutoff;
          }
          // Legacy cached checks renewed updated/expires without new source facts.
          // Bound those snapshots by their original observation, keeping canonical
          // pending captures, tasks and their evidence under the existing holds.
          const updated = communicationKinds.includes(kind) && Number.isSafeInteger(value?.observedAt) && value.observedAt > 0 ? value.observedAt : r.updated;

          if (
            (r.expires && r.expires <= now) ||
            (targetCutoff && kind !== "memory" && updated <= targetCutoff)
          ) {
            if(kind === "meeting")for(const childKind of ["meeting_audio","meeting_upload","companion_meeting"])for(const child of this.summaries(childKind))if(child.meetingId===r.id)this.delete(childKind,child.id);
            this.delete(kind, r.id);
            if (isReportFile || isReportJob) {
              counts.reports++;
            } else {
              counts[
                { chat: "chats", file: "files", memory: "memory", job: "jobs", usage: "usage", messageOut: "messages", messageIn: "messages", messagingSession: "messages", companion_request: "messages", companion_session: "messages", voice_transcript: "voiceTranscripts", meeting: "meetings", sbar: "sbars", wf_decision: "workflows", wf_metric_import: "workflows", wf_action_meta: "workflows", wf_playbook_run: "workflows",...Object.fromEntries([...captureKinds,...communicationKinds].map(k=>[k,'workflows'])) }[
                  kind
                ]
              ]++;
            }
          }
        }
      this.db.exec("COMMIT");
      committed = true;
      this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      this.audit("cleanup", {
        count: Object.values(counts).reduce((a, b) => a + b, 0),
      });
      return counts;
    } catch (e) {
      if (!committed) this.db.exec("ROLLBACK");
      throw e;
    }
  }
  backup(file) {
    this.db.exec("PRAGMA wal_checkpoint(FULL)");
    this.db.prepare("VACUUM INTO ?").run(file);
    this.audit("backup");
  }
  close() {
    if (this.db) {
      this._stmts.clear();
      this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      this.db.close();
      this.db = null;
    }
  }
}
module.exports = { Store };


