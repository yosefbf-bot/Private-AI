"use strict";
const { test } = require("node:test"), assert = require("node:assert/strict");
const path = require("node:path");
const { fixture: baseFixture } = require("./helpers.cjs");
function fixture(t){const f=baseFixture(t);f.core.integrations=new (require("../source/integrations.cjs").Integrations)(f.core);return f;}
const { Store } = require("../source/database.cjs");

// Synthetic adapters exercise the future integration boundary. These are not
// PCC parsers, real feeds, or evidence of clinical-engine correctness.
test("unconfigured PCC has no adapter, sync, dashboard, schedule or fabricated finding", async t => {
  const { core } = fixture(t);
  const status = core.integrations.status("pcc");
  assert.equal(status.state, "not_configured");
  for (const key of ["adapterAvailable", "canImport", "canSync", "canSchedule", "showDashboard"]) assert.equal(status[key], false);
  assert.equal(status.sourceAvailability, "unavailable");
  for (const operation of ["import", "sync", "scheduled"]) await assert.rejects(core.integrations.read("pcc", operation, {}), { code: "INTEGRATION_UNAVAILABLE" });
  assert.equal(core.store.count("alert"), 0);
  assert.equal(core.store.count("integration"), 0);
});

test("enabled configuration alone cannot pretend an absent connector is connected", t => {
  const { core } = fixture(t);
  const status = core.integrations.configure("pcc", { enabled: true, mode: "sync" });
  assert.equal(status.state, "not_configured"); assert.equal(status.canSync, false);
});

test("disabled PCC prevents all adapter work while general reasoning remains usable", async t => {
  const { core } = fixture(t); let calls = 0;
  core.integrations.register("pcc", { readImport: () => calls++, readSync: () => calls++ });
  core.integrations.configure("pcc", { enabled: false, mode: "sync" });
  for (const op of ["import", "sync", "scheduled"]) await assert.rejects(core.integrations.read("pcc", op, {}), { code: "INTEGRATION_UNAVAILABLE" });
  const c = core.createChat();
  assert.equal((await core.send({ chatId: c.id, prompt: "/calc 6*7" })).chat.messages.at(-1).text, "6*7 = 42");
  assert.equal(calls, 0); assert.equal(core.integrations.status("pcc").state, "disabled");
});

test("manual-import capability gates sync and preserves producer evidence states without interpreting them", async t => {
  const { core } = fixture(t);
  const evidence = { source: "synthetic adapter", availability: ["unknown", "unavailable", "stale", "incomplete", "confirmed_absence"] };
  core.integrations.register("pcc", { readImport: async () => evidence, readSync: () => assert.fail("Sync in manual mode") });
  const status = core.integrations.configure("pcc", { enabled: true, mode: "manual" });
  assert.equal(status.state, "manual_import"); assert.equal(status.canImport, true);
  assert.equal(await core.integrations.read("pcc", "import", {}), evidence);
  await assert.rejects(core.integrations.read("pcc", "scheduled", {}), { code: "INTEGRATION_UNAVAILABLE" });
  assert.equal(core.store.count("alert"), 0);
});

test("disable and re-enable preserve encrypted records, settings and SQLite version through reopen", async t => {
  const { core, root, cipher } = fixture(t);
  core.store.put("integration", "pcc", { enabled: true, mode: "manual", futureMapping: "SYNTHETIC_PRIVATE_MAPPING" });
  const preserved = { resident: "SYNTHETIC_PRIVATE_RESIDENT", status: "unknown" };
  for (const kind of ["pccImport", "rule", "alert"]) core.store.put(kind, "kept", preserved);
  const beforeSettings = core.settings();
  const bytes = core.store.db.prepare("SELECT payload FROM records WHERE kind='pccImport'").get().payload;
  core.integrations.configure("pcc", { enabled: false });
  assert.equal(core.store.get("integration", "pcc").futureMapping, "SYNTHETIC_PRIVATE_MAPPING");
  assert.deepEqual(core.settings(), beforeSettings);
  assert.deepEqual(core.store.db.prepare("SELECT payload FROM records WHERE kind='pccImport'").get().payload, bytes);
  core.store.close(); core.store = new Store(path.join(root, "privateai.db"), cipher);
  assert.equal(core.store.db.prepare("PRAGMA user_version").get().user_version, 3);
  assert.equal(core.integrations.status("pcc").state, "disabled");
  for (const kind of ["pccImport", "rule", "alert"]) assert.deepEqual(core.store.get(kind, "kept"), preserved);
  core.integrations.register("pcc", { readImport: async () => preserved });
  core.integrations.configure("pcc", { enabled: true });
  assert.deepEqual(await core.integrations.read("pcc", "import", {}), preserved);
});

test("disabling an active source aborts it and rejects a late result even if adapter ignores cancellation", async t => {
  const { core } = fixture(t); let release, signal;
  core.integrations.register("pcc", { readSync: (_input, options) => { signal = options.signal; return new Promise(r => release = r); } });
  core.integrations.configure("pcc", { enabled: true, mode: "sync" });
  const result = core.integrations.read("pcc", "scheduled", {});
  assert.equal(core.integrations.status("pcc").state, "sync_active");
  core.integrations.configure("pcc", { enabled: false });
  assert.equal(signal.aborted, true);
  release({ shouldNeverPublish: true });
  await assert.rejects(result, { code: "CANCELLED" });
  assert.equal(core.integrations.status("pcc").state, "disabled");
  assert.equal(core.store.count("alert"), 0);
});

test("sync error describes integration health only and a successful adapter read clears it", async t => {
  const { core } = fixture(t); let broken = true;
  core.integrations.register("pcc", { readSync: async () => { if (broken) throw Error("synthetic offline"); return { medicationFeed: "unavailable" }; } });
  core.integrations.configure("pcc", { enabled: true, mode: "sync" });
  await assert.rejects(core.integrations.read("pcc", "sync", {}));
  assert.equal(core.integrations.status("pcc").state, "sync_error");
  assert.equal(core.store.count("alert"), 0);
  broken = false; await core.integrations.read("pcc", "sync", {});
  assert.equal(core.integrations.status("pcc").state, "sync_configured");
  assert.equal(core.integrations.status("pcc").sourceAvailability, "unknown");
});

test("integration settings reject arbitrary module paths and remain behind app lock", t => {
  const { core } = fixture(t);
  assert.throws(() => core.integrations.configure("pcc", { modulePath: "somewhere" }), { code: "INVALID" });
  assert.throws(() => core.integrations.configure("__proto__", { enabled: true }), { code: "INVALID" });
  core.locked = true;
  assert.throws(() => core.integrations.configure("pcc", { enabled: true }), { code: "LOCKED" });
});
