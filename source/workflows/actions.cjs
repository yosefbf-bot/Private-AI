"use strict";
const { uuid, fail } = require("../security.cjs");
const { canonical, hash } = require("../snf/import/validation.cjs");
const { markExport } = require("../snf/demo.cjs");
const signature = (value) => hash(canonical(value));
const clean = (v, max = 4000) =>
  String(v ?? "")
    .trim()
    .slice(0, max);
function queue(core, snf, { includeClosed = false } = {}) {
  const store = snf.store,
    rows = [],
    todos = store.list("todo"),
    byTodo = new Map(todos.map((t) => [t.id, t]));
  for (const a of store.list("snf_alert"))
    rows.push({
      key: "alert:" + a.id,
      kind: "alert",
      id: a.id,
      title: a.title || a.message,
      residentId: a.residentId,
      residentName: a.residentName,
      group: a.residentId || "facility",
      category: a.code?.split("-")[0] || "clinical",
      severity: a.severity,
      status: a.status,
      closed: a.status === "resolved",
      owner: a.owner || a.assignedTo || "",
      dueAt: a.dueDate || null,
      sourceDate: a.firstDetected,
      source: a,
    });
  const links = new Map();
  for (const meeting of store.list("meeting"))
    for (const action of meeting.actionItems || []) {
      const link = {
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        actionId: action.id,
      };
      if (action.convertedTodoId && byTodo.has(action.convertedTodoId)) {
        links.set(action.convertedTodoId, [
          ...(links.get(action.convertedTodoId) || []),
          link,
        ]);
        continue;
      }
      rows.push({
        key: "meeting:" + meeting.id + ":" + action.id,
        kind: "meeting",
        id: action.id,
        meetingId: meeting.id,
        title: action.task,
        status: action.status,
        closed: ["completed", "cancelled"].includes(action.status),
        owner: action.assignee || "",
        dueAt: action.dueDate || null,
        sourceDate: meeting.date,
        links: [link],
        source: action,
      });
    }
  for (const t of todos)
    rows.push({
      key: "todo:" + t.id,
      kind: "todo",
      id: t.id,
      title: t.title,
      status: t.status,
      closed: t.status === "completed",
      owner: t.owner || "",
      dueAt: t.dueAt || null,
      priority: t.priority,
      sourceDate: t.createdAt,
      links: links.get(t.id) || [],
      source: t,
    });
  for (const s of store.list("sbar")) {
    rows.push({
      key: "sbar:" + s.id,
      kind: "sbar",
      id: s.id,
      title: "SBAR: " + (s.situation?.concern || s.residentName || "Review"),
      residentId: s.residentId,
      residentName: s.residentName,
      status: s.closeTheLoop?.stage || s.status,
      closed: !!s.closeTheLoop?.isComplete,
      dueAt: null,
      sourceDate: s.createdAt,
      source: s,
    });
  }
  return rows
    .filter((r) => includeClosed || !r.closed)
    .map((row) => {
      const meta = store.get("wf_action_meta", row.key) || {};
      const out = {
        ...row,
        owner: row.kind === "sbar" ? meta.owner || "" : row.owner || "",
        dueAt: row.kind === "sbar" ? meta.dueAt || null : row.dueAt || null,
        note: meta.note || "",
        updatedAt: meta.updatedAt || null,
      };
      out.revision = signature({ source: row.source, meta });
      out.overdue = !out.closed && !!out.dueAt && out.dueAt < Date.now();
      return out;
    })
    .sort(
      (a, b) =>
        Number(b.severity === "critical") - Number(a.severity === "critical") ||
        Number(b.overdue) - Number(a.overdue) ||
        (a.dueAt || Infinity) - (b.dueAt || Infinity),
    );
}
function update(core, snf, data) {
  const item = queue(core, snf, { includeClosed: true }).find(
    (i) => i.key === data.key,
  );
  if (!item) throw fail("NOT_FOUND");
  if (item.revision !== data.revision) throw fail("REVIEW_CHANGED");
  const reviewer = clean(data.reviewer, 100);
  if (!reviewer) throw fail("INVALID");
  const owner = clean(data.owner, 100),
    note = clean(data.note),
    dueAt = data.dueAt == null ? null : Number(data.dueAt);
  if (dueAt !== null && (!Number.isFinite(dueAt) || dueAt <= 0))
    throw fail("INVALID");
  const complete = data.complete === true;
  if (["sbar", "alert"].includes(item.kind) && complete) throw fail("POLICY"); // The SBAR review/notification workflow owns clinical closure.
  if (complete && !note) throw fail("INVALID");
  const store = snf.store;
  store.transaction(() => {
    if (item.kind === "alert")
      snf.updateAlert(
        item.id,
        {
          owner,
          dueDate: dueAt,
          note,
          ...(complete
            ? {
                status: "resolved",
                resolutionReason: clean(data.resolutionReason),
              }
            : {}),
        },
        reviewer,
      );
    if (item.kind === "todo") {
      const selected = Object.create(core);
      selected.store = store;
      selected.emit = snf.demoMode ? () => {} : core.emit.bind(core);
      selected.saveTodo({
        ...item.source,
        owner,
        dueAt,
        followUpDate: null,
        description: note || item.source.description,
        status: complete ? "completed" : item.source.status,
      });
    }
    if (item.kind === "meeting") {
      const m = store.get("meeting", item.meetingId),
        a = m.actionItems.find((a) => a.id === item.id);
      a.assignee = owner;
      a.dueDate = dueAt;
      if (complete) {
        a.status = "completed";
        a.completedAt = Date.now();
        a.completionNote = note;
      }
      m.updatedAt = Date.now();
      store.put("meeting", m.id, m);
    }
    const old = store.get("wf_action_meta", item.key) || {};
    store.put("wf_action_meta", item.key, {
      id: item.key,
      owner,
      dueAt,
      note,
      updatedAt: Date.now(),
      history: [
        ...(old.history || []),
        { at: Date.now(), reviewer, note, complete, owner, dueAt },
      ],
    });
  });
  return queue(core, snf, { includeClosed: true }).find(
    (i) => i.key === item.key,
  );
}
function changes(core, snf) {
  const rows = queue(core, snf, { includeClosed: true }),
    previous = snf.store.get("wf_review", "last");
  const before = new Map((previous?.items || []).map((i) => [i.key, i]));
  const currentKeys = new Set(rows.map((r) => r.key));
  const changed = rows.map((r) => ({
    ...r,
    change: !previous
      ? "baseline"
      : !before.has(r.key)
        ? "new"
        : !before.get(r.key).closed && r.closed
          ? "resolved"
          : before.get(r.key).revision !== r.revision
            ? "changed"
            : "unchanged",
  }));
  return {
    reviewedAt: previous?.reviewedAt || null,
    items: changed,
    unavailable: (previous?.items || [])
      .filter((i) => !currentKeys.has(i.key))
      .map((i) => ({
        key: i.key,
        change: "unavailable",
        note: "Source no longer available; not assumed resolved.",
      })),
    token: signature(
      rows.map(({ key, revision, closed }) => ({ key, revision, closed })),
    ),
  };
}
function markReviewed(core, snf, data) {
  const snapshot = changes(core, snf);
  if (data.token !== snapshot.token) throw fail("REVIEW_CHANGED");
  if (!clean(data.reviewer, 100)) throw fail("INVALID");
  const value = {
    id: "last",
    reviewedAt: Date.now(),
    reviewer: clean(data.reviewer, 100),
    items: snapshot.items.map(({ key, revision, closed }) => ({
      key,
      revision,
      closed,
    })),
  };
  snf.store.put("wf_review", "last", value);
  return value;
}
function decision(snf, data) {
  const old = data.id ? snf.store.get("wf_decision", data.id) : null;
  if (data.id && !old) throw fail("NOT_FOUND");
  if (old && data.revision !== old.revision) throw fail("REVIEW_CHANGED");
  if (
    !clean(data.title, 160) ||
    !clean(data.reason) ||
    !clean(data.reviewer, 100)
  )
    throw fail("INVALID");
  const dueAt = data.dueAt == null ? null : Number(data.dueAt);
  if (dueAt !== null && (!Number.isFinite(dueAt) || dueAt <= 0))
    throw fail("INVALID");
  const row = {
    id: old?.id || uuid(),
    title: clean(data.title, 160),
    reason: clean(data.reason),
    owner: clean(data.owner, 100),
    dueAt,
    status: data.status === "closed" ? "closed" : "open",
    sourceKey: clean(data.sourceKey, 200),
    reviewer: clean(data.reviewer, 100),
    updatedAt: Date.now(),
    revision: (old?.revision || 0) + 1,
    history: [
      ...(old?.history || []),
      ...(old ? [{ ...old, history: undefined }] : []),
    ],
  };
  snf.store.put("wf_decision", row.id, row);
  return row;
}
function packet(core, snf, data) {
  const item = queue(core, snf, { includeClosed: true }).find(
    (i) => i.key === data.key,
  );
  if (!item) throw fail("NOT_FOUND");
  const evidence =
    item.kind === "alert"
      ? (item.source.evaluationHistory || [])
          .map((id) => snf.store.get("snf_rule_evaluation", id))
          .filter(Boolean)
      : [];
  const rows = evidence.flatMap((e) =>
    (e.sources || []).map((s) => ({
      source: s,
      row: s.rowId ? snf.store.get("snf_import_row", s.rowId) : null,
    })),
  );
  const coverage = JSON.parse(
    JSON.stringify(snf.getFeedStatus(), (key, value) =>
      key === "ageHours" ? undefined : value,
    ),
  );
  const generatedAt = data.generatedAt ?? Date.now();
  if (
    !Number.isFinite(generatedAt) ||
    generatedAt > Date.now() ||
    generatedAt < Date.now() - 10 * 60 * 1000
  )
    throw fail("EXPIRED");
  const linkedSources = (item.links || []).map((link) => {
    const meeting = snf.store.get("meeting", link.meetingId);
    return {
      ...link,
      date: meeting?.date || null,
      action: meeting?.actionItems?.find((a) => a.id === link.actionId) || null,
    };
  });
  const payload = {
    linkedSources,
    version: 1,
    generatedAt,
    demo: !!snf.demoMode,
    item,
    evidence,
    rows,
    coverage,
    decisions: snf.store
      .list("wf_decision")
      .filter((d) => d.sourceKey === item.key),
  };
  const text = markExport(
    "# Evidence review packet\n\nReview before sharing. Imported data only; missing evidence is not proof of absence.\n\n" +
      JSON.stringify(payload, null, 2),
    snf.demoMode,
  );
  return {
    text,
    token: signature(payload),
    sha256: hash(text),
    generatedAt: payload.generatedAt,
    demo: payload.demo,
  };
}
module.exports = {
  queue,
  update,
  changes,
  markReviewed,
  decision,
  packet,
  signature,
  clean,
};
