"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  uuid,
  isId,
  fail,
  safePath,
  atomicWrite,
  Cipher,
} = require("./security.cjs");
function newIdentity() {
  const enc = crypto.generateKeyPairSync("x25519"),
    sig = crypto.generateKeyPairSync("ed25519");
  const exp = (key, type) => key.export({ type, format: "pem" });
  return {
    id: uuid(),
    label: "My PC",
    encPublic: exp(enc.publicKey, "spki"),
    encPrivate: exp(enc.privateKey, "pkcs8"),
    signPublic: exp(sig.publicKey, "spki"),
    signPrivate: exp(sig.privateKey, "pkcs8"),
  };
}
function publicIdentity(i) {
  return {
    id: i.id,
    label: i.label,
    encPublic: i.encPublic,
    signPublic: i.signPublic,
  };
}
function fingerprint(i) {
  return crypto
    .createHash("sha256")
    .update(i.encPublic + "\n" + i.signPublic)
    .digest("hex")
    .slice(0, 24)
    .match(/.{4}/g)
    .join("-");
}
function sealJob(sender, receiver, payload) {
  if (!isId(payload.id) || !isId(receiver.id)) throw fail("INVALID");
  const e = crypto.generateKeyPairSync("x25519"),
    ephemeral = e.publicKey.export({ type: "spki", format: "pem" });
  const shared = crypto.diffieHellman({
    privateKey: e.privateKey,
    publicKey: crypto.createPublicKey(receiver.encPublic),
  });
  const key = Buffer.from(
    crypto.hkdfSync(
      "sha256",
      shared,
      Buffer.from(payload.id),
      Buffer.from("PrivateAI-job-v1"),
      32,
    ),
  );
  const header = {
    version: 1,
    id: payload.id,
    sender: sender.id,
    receiver: receiver.id,
    ephemeral,
  };
  const aad = JSON.stringify(header);
  const box = new Cipher(key).seal(payload, aad).toString("base64");
  const signed = JSON.stringify({ ...header, box });
  return {
    ...header,
    box,
    signature: crypto
      .sign(null, Buffer.from(signed), sender.signPrivate)
      .toString("base64"),
  };
}
function openJob(receiver, sender, envelope) {
  try {
    if (
      envelope.version !== 1 ||
      envelope.receiver !== receiver.id ||
      envelope.sender !== sender.id ||
      !isId(envelope.id)
    )
      throw Error();
    const { signature, ...signed } = envelope;
    if (
      !crypto.verify(
        null,
        Buffer.from(JSON.stringify(signed)),
        sender.signPublic,
        Buffer.from(signature, "base64"),
      )
    )
      throw Error();
    const { box, ...header } = signed;
    const shared = crypto.diffieHellman({
      privateKey: crypto.createPrivateKey(receiver.encPrivate),
      publicKey: crypto.createPublicKey(header.ephemeral),
    });
    const key = Buffer.from(
      crypto.hkdfSync(
        "sha256",
        shared,
        Buffer.from(envelope.id),
        Buffer.from("PrivateAI-job-v1"),
        32,
      ),
    );
    const payload = new Cipher(key).open(
      Buffer.from(box, "base64"),
      JSON.stringify(header),
    );
    if (payload.id !== envelope.id) throw Error();
    return payload;
  } catch {
    throw fail("PEER");
  }
}
const {nextRun,watchFingerprint}=require('./schedules.cjs');
class WorkerManager {
  constructor(core) {
    this.core = core;
    this.busy = false;
    this.lastPublish = 0;
    this.lastPoll = 0;
  }
  publish() {
    const c = this.core,
      s = c.settings();
    if (!s.workspace) return;
    const identity = c.identity();
    const info = {
      ...publicIdentity(identity),
      fingerprint: fingerprint(identity),
      role: s.role,
      accepting: s.workerEnabled && !s.workerPaused,
      seen: Date.now(),
    };
    atomicWrite(
      safePath(s.workspace, "Tasks/Workers/" + identity.id + ".json"),
      JSON.stringify(info),
    );
  }
  peers() {
    const c = this.core,
      root = c.settings().workspace;
    if (!root) return [];
    try {
      return fs
        .readdirSync(safePath(root, "Tasks/Workers"))
        .filter((n) => /^[a-f0-9-]{36}\.json$/.test(n))
        .slice(0, 50)
        .flatMap((n) => {
          try {
            const file = safePath(root, "Tasks/Workers/" + n);
            if (fs.statSync(file).size > 5000) return [];
            const p = JSON.parse(fs.readFileSync(file));
            if (
              !isId(p.id) ||
              p.id === c.identity().id ||
              n !== p.id + ".json" ||
              typeof p.label !== "string" ||
              p.label.length > 80
            )
              return [];
            crypto.createPublicKey(p.encPublic);
            crypto.createPublicKey(p.signPublic);
            const pin = c.store.get("peer", p.id);
            return [
              {
                ...publicIdentity(p),
                fingerprint: fingerprint(p),
                online: Date.now() - p.seen < 120000,
                accepting: p.accepting === true,
                trusted: !!pin && fingerprint(pin) === fingerprint(p),
                changed: !!pin && fingerprint(pin) !== fingerprint(p),
              },
            ];
          } catch {
            return [];
          }
        });
    } catch {
      return [];
    }
  }
  trust(id, print) {
    const p = this.peers().find((p) => p.id === id && p.fingerprint === print);
    if (!p) throw fail("PEER");
    this.core.store.put("peer", id, publicIdentity(p));
    this.core.store.audit("peer_trusted");
  }
  queue(payload, target) {
    const c = this.core,
      root = c.settings().workspace,
      peer = c.store.get("peer", target);
    if (!root || !peer) throw fail("PEER");
    const envelope = sealJob(c.identity(), peer, payload);
    const file = safePath(root, "Tasks/Queued/" + payload.id + ".json");
    if (fs.existsSync(file)) throw fail("INVALID");
    atomicWrite(file, JSON.stringify(envelope));
    c.store.put("job", payload.id, {
      id: payload.id,
      title: payload.title,
      status: "queued",
      target,
      created: Date.now(),
      expiresAt: payload.expiresAt,
    });
  }
  status(id, state, extra = {}) {
    const c = this.core,
      root = c.settings().workspace;
    if (!root) return;
    const worker = c.identity().id;
    const record = { id, worker, status: state, time: Date.now(), ...extra };
    const body = JSON.stringify(record);
    const envelope = {
      record,
      signature: crypto
        .sign(null, Buffer.from(body), c.identity().signPrivate)
        .toString("base64"),
    };
    const folder =
      state === "completed"
        ? "Completed"
        : ['running','waiting','paused'].includes(state)
          ? "InProgress"
          : "Failed";
    atomicWrite(
      safePath(root, "Tasks/" + folder + "/" + id + ".json"),
      JSON.stringify(envelope),
    );
  }
  syncStatuses() {
    const c = this.core,
      root = c.settings().workspace;
    if (!root) return;
    for (const job of c.store
      .project("job",j=>j.target?j:null).filter(Boolean)
      .filter((j) => j.target && ["queued", "running", "waiting", "paused"].includes(j.status))
      .slice(0, 100)) {
      const peer = c.store.get("peer", job.target);
      if (!peer) continue;
      for (const folder of ["Completed", "Failed", "InProgress"]) {
        try {
          const f = safePath(root, "Tasks/" + folder + "/" + job.id + ".json");
          if (!fs.existsSync(f) || fs.statSync(f).size > 10000) continue;
          const e = JSON.parse(fs.readFileSync(f));
          if (
            e.record.id !== job.id ||
            e.record.worker !== job.target ||
            !crypto.verify(
              null,
              Buffer.from(JSON.stringify(e.record)),
              peer.signPublic,
              Buffer.from(e.signature, "base64"),
            )
          )
            continue;
          c.store.put("job", job.id, {
            ...job,
            ...e.record,
            output: e.record.output || null,
          });
          break;
        } catch {}
      }
    }
  }
  cleanup(now = Date.now()) {
    const c = this.core,
      root = c.settings().workspace;
    if (!root) return { queuedExpired: 0, tempFiles: 0 };
    const counts = { queuedExpired: 0, tempFiles: 0 };
    for (const job of c.store
      .project("job",j=>j.target?j:null).filter(Boolean)
      .filter(
        (j) =>
          j.target &&
          j.status === "queued" &&
          j.expiresAt &&
          j.expiresAt <= now,
      )) {
      c.store.put("job", job.id, {
        ...job,
        status: "expired",
        error: "EXPIRED",
        completed: now,
      });
      try {
        fs.unlinkSync(safePath(root, "Tasks/Queued/" + job.id + ".json"));
      } catch {}
      counts.queuedExpired++;
    }
    // Only app-generated unfinished writes and signed metadata are eligible.
    // Completed reports and user source documents never enter this cleanup.
    for (const folder of [
      "Reports",
      "Exports",
      "Tasks/Queued",
      "Tasks/InProgress",
      "Tasks/Completed",
      "Tasks/Failed",
      "Tasks/Workers",
    ]) {
      const dir = safePath(root, folder);
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir).slice(0, 5000)) {
        const isPartial =
          /^\.[a-f0-9-]{36}\.partial$/.test(name) ||
          /\.[a-f0-9-]{36}\.tmp$/.test(name);
        const isStatus =
          /^Tasks\/(InProgress|Completed|Failed)$/.test(folder) &&
          /^[a-f0-9-]{36}\.json$/.test(name);
        if (!isPartial && !isStatus) continue;
        try {
          const file = safePath(root, folder + "/" + name),
            stat = fs.statSync(file);
          const age = now - stat.mtimeMs;
          if (isPartial && stat.isFile() && age > 86400000) {
            fs.unlinkSync(file);
            counts.tempFiles++;
          } else if (
            isStatus &&
            stat.isFile() &&
            stat.size < 10000 &&
            age > (c.settings().retentionDays || 90) * 86400000
          ) {
            const envelope = JSON.parse(fs.readFileSync(file));
            if (
              envelope.record?.worker === c.identity().id &&
              crypto.verify(
                null,
                Buffer.from(JSON.stringify(envelope.record)),
                c.identity().signPublic,
                Buffer.from(envelope.signature, "base64"),
              )
            )
              fs.unlinkSync(file);
          }
        } catch {}
      }
    }
    return counts;
  }
  async tick() {
    const c = this.core,
      s = c.settings();
    if (this.busy) return;
    this.busy = true;
    try {
      if (Date.now() - this.lastPublish > 45000) {
        try {
          this.publish();
        } catch {}
        this.lastPublish = Date.now();
      }
      this.syncStatuses();
      if (
        !s.workerEnabled ||
        s.workerPaused ||
        !["worker", "both"].includes(s.role) ||
        c.jobRunning
      )
        return;
      const due = c.store
        .list("schedule")
        .find((j) => j.enabled && j.next!==null && j.next <= Date.now());
      if (due) {
        let fingerprint;
        if(due.frequency==='watch'){
          try{fingerprint=watchFingerprint(due,s.workspace);}catch(e){c.store.put('schedule',due.id,{...due,enabled:false,error:require('./security.cjs').safeError(e).message});return;}
          if(due.watchFingerprint===undefined||due.watchFingerprint===fingerprint){c.store.put('schedule',due.id,{...due,watchFingerprint:fingerprint,next:nextRun(due)});return;}
        }
        const runId = uuid(),next=nextRun(due);
        c.store.put("schedule", due.id, {
          ...due, next, enabled:next!==null,
          ...(fingerprint!==undefined?{watchFingerprint:fingerprint}:{}),
          lastRun: Date.now(),
        });
        try {
          await c.runJob({ ...due, id: runId, title: due.name }, false, true);
        } catch (e) {
          c.store.put("job", runId, {
            id: runId,
            title: due.name,
            status: "failed",
            error: require("./security.cjs").safeError(e).code,
            completed: Date.now(),
          });
        }
        return;
      }
      if (!s.workspace) return;
      const files = fs
        .readdirSync(safePath(s.workspace, "Tasks/Queued"))
        .filter((n) => /^[a-f0-9-]{36}\.json$/.test(n))
        .slice(0, 200);
      for (const name of files) {
        const f = safePath(s.workspace, "Tasks/Queued/" + name);
        let env;
        try {
          if (fs.statSync(f).size > 45000000) continue;
          env = JSON.parse(fs.readFileSync(f));
        } catch {
          continue;
        }
        if (env.receiver !== c.identity().id || name !== env.id + ".json")
          continue;
        const peer = c.store.get("peer", env.sender);
        if (!peer) continue;
        let payload;
        try {
          payload = openJob(c.identity(), peer, env);
          c.validateJob(payload);
        } catch {
          continue;
        }
        if (payload.expiresAt && payload.expiresAt <= Date.now()) {
          try {
            this.status(env.id, "failed", { error: "EXPIRED" });
            fs.unlinkSync(f);
          } catch {}
          continue;
        }
        if (!c.store.claim(env.id)) {
          try {
            fs.unlinkSync(f);
          } catch {}
          continue;
        }
        try {
          this.status(env.id, "running", { started: Date.now() });
          await c.runJob(payload, true, true);
          try {
            fs.unlinkSync(f);
          } catch {}
        } catch {
          try {
            this.status(env.id, "failed", { error: "INTERRUPTED" });
          } catch {}
        }
        break;
      }
    } finally {
      this.busy = false;
    }
  }
}
module.exports = {
  newIdentity,
  publicIdentity,
  fingerprint,
  sealJob,
  openJob,
  nextRun,
  WorkerManager,
};
