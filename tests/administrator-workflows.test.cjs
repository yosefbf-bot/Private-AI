"use strict";
const test = require("node:test"),
  assert = require("node:assert/strict");
const { fixture } = require("./helpers.cjs");
const { dispatch } = require("../source/workflows/index.cjs");
const fs = require("node:fs"),
  path = require("node:path");
async function imported(core, dir, content) {
  const file = path.join(dir, "synthetic.txt");
  fs.writeFileSync(file, content);
  return core.importFile(file);
}
const ops = require("../source/operations-copilot.cjs");
const budgets = require("../source/workflows/budget.cjs");
const get = (core) => dispatch(core, "workflowSummary");
test("unified queue deduplicates meeting tasks; revisions, owners and review deltas survive reload", async (t) => {
  const { core } = fixture(t);
  const m = ops.dispatch(core, "meetingSave", { title: "Synthetic huddle" });
  const spoken = ops.dispatch(core, "meetingAddTranscript", {
    meetingId: m.id,
    text: "I will review the report.",
    speaker: "Synthetic reviewer",
    speakerConfirmed: true,
  });
  const { todo } = ops.dispatch(core, "meetingConvertActionItem", {
    meetingId: m.id,
    actionItemId: spoken.actionItems[0].id,
  });
  let s = await get(core);
  assert.equal(s.changes.items.length, 1);
  assert.equal(s.changes.items[0].links.length, 1);
  await dispatch(core, "workflowReview", {
    token: s.changes.token,
    reviewer: "Synthetic reviewer",
  });
  const item = s.changes.items[0];
  await dispatch(core, "workflowActionSave", {
    key: item.key,
    revision: item.revision,
    owner: "Synthetic owner",
    dueAt: Date.now() + 86400000,
    note: "Reviewed source",
    reviewer: "Synthetic reviewer",
  });
  assert.equal(core.store.get("todo", todo.id).owner, "Synthetic owner");
  await assert.rejects(
    dispatch(core, "workflowActionSave", {
      key: item.key,
      revision: item.revision,
      reviewer: "Synthetic",
    }),
    { code: "REVIEW_CHANGED" },
  );
  s = await get(core);
  assert.equal(s.changes.items[0].change, "changed");
  await dispatch(core, "workflowActionSave", {
    ...s.changes.items[0],
    complete: true,
    reviewer: "Synthetic reviewer",
    note: "Work checked",
  });
  s = await get(core);
  assert.equal(s.changes.items[0].change, "resolved");
  assert.equal(
    core.store.get("meeting", m.id).actionItems[0].status,
    "completed",
  );
  await assert.rejects(
    dispatch(core, "workflowReview", { token: "stale", reviewer: "Synthetic" }),
    { code: "REVIEW_CHANGED" },
  );
});
test("clinical closure stays in source; decision revisions and evidence packets carry demo labels", async (t) => {
  const { core } = fixture(t);
  await require("../source/snf/index.cjs").dispatch(core, "snfDemo", {
    mode: "demo",
  });
  let s = await get(core);
  const alert = s.changes.items.find((r) => r.kind === "alert");
  assert.ok(alert);
  await assert.rejects(
    dispatch(core, "workflowActionSave", {
      ...alert,
      complete: true,
      note: "test",
      reviewer: "Synthetic",
    }),
    { code: "POLICY" },
  );
  const d = await dispatch(core, "workflowDecisionSave", {
    title: "Synthetic decision",
    reason: "Review source tomorrow",
    reviewer: "Synthetic",
    sourceKey: alert.key,
  });
  const revised = await dispatch(core, "workflowDecisionSave", {
    ...d,
    reason: "Source reviewed",
    status: "closed",
  });
  assert.equal(revised.revision, 2);
  assert.equal(revised.history.length, 1);
  const packet = await dispatch(core, "workflowPacket", { key: alert.key });
  assert.match(packet.text, /DEMO DATA/);
  assert.match(packet.text, /Source reviewed/);
  assert.ok(packet.sha256);
  assert.equal(core.store.list("wf_decision").length, 0);
  await assert.rejects(dispatch(core, "workflowMetricImport", {}), {
    code: "POLICY",
  });
});
test("carryover references existing assignments and reads current status without cloning", async (t) => {
  const { core } = fixture(t);
  let m = ops.dispatch(core, "meetingSave");
  m = ops.dispatch(core, "meetingAddTranscript", {
    meetingId: m.id,
    text: "I will review the report.",
    speaker: "Synthetic",
    speakerConfirmed: true,
  });
  const linked = ops.dispatch(core, "meetingConvertActionItem", {
    meetingId: m.id,
    actionItemId: m.actionItems[0].id,
  });
  const next = ops.dispatch(core, "meetingSave");
  assert.equal(next.carryoverRefs.length, 1);
  assert.equal(next.actionItems.length, 0);
  core.toggleTodoStatus(linked.todo.id);
  assert.equal(
    ops.dispatch(core, "meetingGet", { id: next.id }).carryover[0].status,
    "completed",
  );
  assert.match(
    ops.dispatch(core, "meetingFinalize", { meetingId: next.id }).summary,
    /CARRYOVER/,
  );
});
test("reviewed PCC schema rejects drift and retains immutable mapping provenance", async (t) => {
  const { core } = fixture(t);
  const p = await dispatch(core, "workflowMappingSave", {
    name: "Synthetic census",
    type: "census",
    headers: ["ID", "Resident"],
    mapping: { ID: "residentId", Resident: "name" },
    reviewer: "Synthetic",
  });
  const req = {
    id: p.id,
    revision: p.revision,
    type: "census",
    headers: p.headers,
    rows: [{ ID: "synthetic-1", Resident: "Synthetic resident" }],
    reviewer: "Synthetic",
    date: new Date().toISOString(),
    filename: "synthetic.csv",
  };
  await assert.rejects(
    dispatch(core, "workflowMappedImport", {
      ...req,
      headers: ["ID", "Renamed"],
    }),
    { code: "REVIEW_CHANGED" },
  );
  const result = await dispatch(core, "workflowMappedImport", req);
  assert.equal(result.success, true);
  assert.equal(
    core.store.get("snf_import_batch", result.batchId).mapping.revision,
    1,
  );
  assert.equal(core.store.list("snf_resident")[0].name, "Synthetic resident");
  await dispatch(core, "workflowMappingSave", { ...p, name: "Reviewed again" });
  assert.equal(
    core.store.get("wf_mapping_revision", p.id + ":1").name,
    "Synthetic census",
  );
  await assert.rejects(dispatch(core, "workflowMappedImport", req), {
    code: "REVIEW_CHANGED",
  });
});
test("measured imports preview invalid rows and calculate only attested complete-day HPPD", async (t) => {
  const { core } = fixture(t);
  const ingest = async (r) => {
    const preview = await dispatch(core, "workflowMetricPreview", r);
    return dispatch(core, "workflowMetricImport", {
      ...r,
      token: preview.token,
    });
  };
  const date = new Date().toISOString().slice(0, 10),
    common = { reviewer: "Synthetic", filename: "synthetic.csv" };
  const c = {
    ...common,
    type: "census",
    rows: [
      {
        date,
        unit: "Synthetic unit",
        census: 10,
        capacity: 20,
        medicare: 2,
        medicaid: 7,
        other: 1,
      },
    ],
  };
  await ingest(c);
  assert.equal((await ingest(c)).duplicate, true);
  const staffing = {
    ...common,
    type: "staffing",
    rows: [
      { date, unit: "Synthetic unit", shift: "day", role: "RN", hours: 24 },
    ],
  };
  await ingest(staffing);
  assert.equal((await get(core)).metrics.days[0].hppd, null);
  await ingest({ ...staffing, completeDay: true });
  assert.equal((await get(core)).metrics.days[0].hppd, 2.4);
  const bad = {
    ...c,
    rows: [{ date, unit: "Synthetic", census: "", medicare: 2 }],
  };
  assert.equal(
    (await dispatch(core, "workflowMetricPreview", bad)).rejected.length,
    1,
  );
  await assert.rejects(ingest(bad), { code: "INVALID" });
  const badPayer = {
    ...c,
    rows: [{ date, unit: "Synthetic", census: 1, medicare: 2 }],
  };
  assert.equal(
    (await dispatch(core, "workflowMetricPreview", badPayer)).rejected.length,
    1,
  );
});
test("document search cites exact extracted page sections and project links survive project editor", async (t) => {
  const { core, dir } = fixture(t);
  const f = await imported(
    core,
    dir,
    "[Page 1]\nSynthetic finding\n[Page 2]\nAnother finding",
  );
  const p = core.projectSave({ name: "Synthetic project" });
  await dispatch(core, "workflowProjectFiles", {
    projectId: p.id,
    fileIds: [f.id],
  });
  core.projectSave({ ...p, name: "Renamed" });
  const r = await dispatch(core, "workflowDocumentSearch", {
    projectId: p.id,
    query: "Another",
  });
  assert.equal(r.totalMatches, 1);
  assert.equal(r.results[0].page, 2);
  assert.match(r.results[0].citation, /page 2/);
  core.store.delete("file", f.id);
  assert.equal(
    (
      await dispatch(core, "workflowDocumentSearch", {
        projectId: p.id,
        query: "Another",
      })
    ).totalMatches,
    0,
  );
});
test("playbook preview invalidates changed inputs, records revision and prevents repeated run token", async (t) => {
  const { core, dir } = fixture(t);
  const f = await imported(core, dir, "Synthetic source.");
  const p = await dispatch(core, "workflowPlaybookSave", {
    name: "Synthetic report",
    prompt: "Extract findings.",
    fileIds: [f.id],
    requiredSections: ["Findings"],
    reviewer: "Synthetic",
  });
  const preview = await dispatch(core, "workflowPlaybookPreview", { id: p.id });
  const original = core.store.get("file", f.id);
  core.store.put("file", f.id, { ...original, text: "Changed source." });
  await assert.rejects(
    dispatch(core, "workflowPlaybookRun", {
      ...preview,
      reviewer: "Synthetic",
    }),
    { code: "REVIEW_CHANGED" },
  );
  const fresh = await dispatch(core, "workflowPlaybookPreview", { id: p.id });
  let captured;
  core.runJob = async (j) => {
    captured = j;
  };
  const run = await dispatch(core, "workflowPlaybookRun", {
    ...fresh,
    reviewer: "Synthetic",
  });
  assert.equal(captured.playbook.revision, 1);
  assert.equal(run.id, captured.id);
  await assert.rejects(
    dispatch(core, "workflowPlaybookRun", { ...fresh, reviewer: "Synthetic" }),
    { code: "RECOVERY" },
  );
  assert.equal(
    require("../source/workflows/playbooks.cjs").checkOutput(
      captured,
      "No headings",
    ).passed,
    false,
  );
  assert.equal(
    require("../source/workflows/playbooks.cjs").checkOutput(
      captured,
      "## Findings\nSynthetic",
    ).passed,
    true,
  );
});
test("cloud budget persists reservations before concurrent requests and blocks unpriced workloads", async (t) => {
  const { core, calls } = fixture(t);
  budgets.save(core, { enabled: true, maxRequests: 1 });
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      budgets.generate(
        core,
        core.key(),
        { ...core.settings(), provider: "openai" },
        [{ role: "user", content: "Synthetic" }],
      ),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(calls.length, 1);
  assert.equal(budgets.status(core).ledger.requests, 1);
  budgets.save(core, {
    enabled: true,
    maxAllowance: 1,
    provider: "openai",
    model: core.settings().model,
    inputRate: 1,
    outputRate: 2,
  });
  await assert.rejects(
    budgets.generate(core, "", { ...core.settings(), provider: "groq" }, [
      { role: "user", content: "Synthetic" },
    ]),
    { code: "BUDGET" },
  );
  await assert.rejects(
    budgets.generate(
      core,
      "",
      core.settings(),
      [{ role: "user", content: "Synthetic" }],
      { web: true },
    ),
    { code: "BUDGET" },
  );
  core.client.generate = async () => {
    throw Error("Network failed");
  };
  await assert.rejects(
    budgets.generate(core, "", core.settings(), [
      { role: "user", content: "Synthetic" },
    ]),
  );
  assert.equal(budgets.status(core).ledger.requests, 2);
});
test("development and demo restrict execution and imports independently of the transport allowlist", async (t) => {
  const { core } = fixture(t);
  core.developmentMode = true;
  for (const op of [
    "workflowMappedImport",
    "workflowMetricPreview",
    "workflowMetricImport",
    "workflowPlaybookRun",
    "workflowBudgetSave",
    "workflowDocumentSearch",
    "workflowProjectFiles",
  ])
    await assert.rejects(dispatch(core, op, {}), { code: "POLICY" });
  assert.ok((await get(core)).developmentMode);
  core.locked = true;
  await assert.rejects(get(core), { code: "LOCKED" });
});
test("legacy todo edits preserve completion and owner; deadline edits update reminder and meeting downstream", (t) => {
  const { core } = fixture(t);
  const initial = core.saveTodo({
    title: "Synthetic",
    owner: "Synthetic owner",
    status: "completed",
    dueAt: Date.now() - 1000,
  });
  const edit = core.saveTodo({
    id: initial.id,
    title: "Changed notes",
    description: "Synthetic edit",
  });
  assert.equal(edit.status, "completed");
  assert.equal(edit.owner, "Synthetic owner");
  assert.equal(edit.dueAt, initial.dueAt);
  const future = Date.now() + 86400000;
  const next = core.saveTodo({
    id: initial.id,
    followUpDate: new Date(future).toISOString(),
    status: "pending",
  });
  assert.equal(next.dueAt, future);
  assert.equal(core.checkReminders().length, 0);
});
test("SBAR closure appears resolved since review; removed sources remain unavailable", async (t) => {
  const { core } = fixture(t);
  core.store.put("sbar", "synthetic", {
    id: "synthetic",
    status: "draft",
    closeTheLoop: { stage: "sbar_drafted", isComplete: false },
  });
  let s = await get(core);
  await dispatch(core, "workflowReview", {
    token: s.changes.token,
    reviewer: "Synthetic",
  });
  core.store.put("sbar", "synthetic", {
    id: "synthetic",
    status: "finalized",
    closeTheLoop: { stage: "closed", isComplete: true },
  });
  s = await get(core);
  assert.equal(s.changes.items[0].change, "resolved");
  core.store.delete("sbar", "synthetic");
  s = await get(core);
  assert.equal(s.changes.unavailable[0].change, "unavailable");
});
test("real report pipeline processes beyond single-context limit with resumable bounded sections", async (t) => {
  const { core, dir } = fixture(t);
  core.saveSettings({
    sectionedReports: true,
    localContext: 2048,
    localMaxOutput: 256,
    contextChars: 12000,
    processingMode: "local-only",
    allowCloud: false,
  });
  const f = await imported(core, dir, "Synthetic evidence. ".repeat(2100));
  let calls = 0;
  core.router.generate = async () => {
    calls++;
    return {
      text: "Synthetic section result.",
      provider: "local",
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  };
  const job = core.jobPayload({
    title: "Synthetic section test",
    prompt: "Summarize supplied text.",
    fileIds: [f.id],
    format: "md",
  });
  await core.runJob(job);
  const done = core.store.get("job", job.id);
  assert.equal(done.status, "completed", done.reason);
  assert.ok(calls > 12);
  assert.match(
    fs.readFileSync(path.join(core.settings().workspace, done.output), "utf8"),
    /separate analyses/,
  );
});
test("required output checks block export and retain the saved playbook draft for review", async (t) => {
  const { core, dir } = fixture(t);
  const f = await imported(core, dir, "Synthetic facts.");
  const job = core.jobPayload({
    title: "Synthetic playbook",
    prompt: "Extract findings.",
    fileIds: [f.id],
    format: "md",
  });
  job.playbook = {
    id: "synthetic",
    revision: 1,
    requiredSections: ["Findings"],
  };
  core.router.generate = async () => ({
    text: "Missing required heading",
    provider: "local",
    usage: {},
  });
  await core.runJob(job);
  const saved = core.store.get("job", job.id);
  assert.equal(saved.status, "failed");
  assert.equal(saved.error, "OUTPUT_CHECK");
  assert.equal(saved.savedAnswer.text, "Missing required heading");
  assert.equal(core.store.get("output", job.id), null);
});
test("budget guard is reached by routed requests and connection tests; realtime falls back without a call", async (t) => {
  const { core, calls } = fixture(t);
  core.saveSettings({ processingMode: "cloud-first", allowCloud: true });
  budgets.save(core, { enabled: true, maxRequests: 0 });
  await assert.rejects(
    core.router.generate(core.key(), core.settings(), [
      { role: "user", content: "Write a synthetic paragraph for this test." },
    ]),
    { code: "BUDGET" },
  );
  await assert.rejects(core.testConnection("openai"), { code: "BUDGET" });
  assert.equal(calls.length, 0);
  const realtime = await core.createLiveSession();
  assert.equal(realtime.provider, "local-offline");
  assert.equal(realtime.ready, false);
  assert.equal(calls.length, 0);
});
