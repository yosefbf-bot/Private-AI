const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path");
const { fixture } = require("./helpers.cjs");
const { Store } = require("../source/database.cjs");
const { uuid } = require("../source/security.cjs");
test("HIPAA and 100-day retention are defaults; no automatic memory", (t) => {
  const { core } = fixture(t);
  assert.equal(core.settings().hipaa, true);
  assert.equal(core.settings().retentionDays, 100);
  assert.equal(core.settings().memoryEnabled, false);
});
test("Chat save, stream, close, and reopen preserve content", async (t) => {
  const { core, cipher, root } = fixture(t);
  const c = core.createChat();
  let streamed = "";
  await core.send(
    { chatId: c.id, prompt: "Synthetic confidential example" },
    (d) => (streamed += d),
  );
  assert.equal(streamed, "Synthetic answer.");
  core.store.close();
  core.store = new Store(path.join(root, "privateai.db"), cipher);
  assert.equal(
    core.chat(c.id).messages[0].text,
    "Synthetic confidential example",
  );
  assert.equal(core.chat(c.id).messages[1].text, streamed);
});
test("Database and WAL do not contain plaintext key, prompts, or answers", async (t) => {
  const { core, root } = fixture(t);
  const c = core.createChat();
  await core.send({ chatId: c.id, prompt: "SYNTHETIC_SECRET_SENTINEL" });
  for (const name of fs.readdirSync(root)) {
    const data = fs.readFileSync(path.join(root, name));
    assert.equal(
      data.includes(Buffer.from("SYNTHETIC_SECRET_SENTINEL")),
      false,
    );
    assert.equal(
      data.includes(Buffer.from("sk-synthetic-NOT-A-REAL-KEY")),
      false,
    );
    assert.equal(data.includes(Buffer.from("Synthetic answer.")), false);
  }
});
test("Temporary chat never enters persistent chat history or memory", async (t) => {
  const { core, calls } = fixture(t);
  core.saveSettings({ memoryEnabled: true });
  core.remember({ content: "SYNTHETIC_MEMORY" });
  const c = core.createChat({ temporary: true });
  await core.send({ chatId: c.id, prompt: "SYNTHETIC_TEMP" });
  assert.equal(core.store.list("chat").length, 0);
  assert.equal(calls[0].opts.instructions.includes("SYNTHETIC_MEMORY"), false);
  core.endTemporary(c.id);
  assert.throws(() => core.chat(c.id));
});
test("Temporary attachment remains memory-only and can be saved explicitly", async (t) => {
  const { core, dir } = fixture(t);
  const file = path.join(dir, "synthetic.txt");
  fs.writeFileSync(file, "Temporary document");
  const c = core.createChat({ temporary: true });
  const f = await core.importFile(file, c.id);
  assert.equal(core.store.list("file").length, 0);
  await core.send({ chatId: c.id, prompt: "Review", fileIds: [f.id] });
  core.saveTemporary(c.id);
  assert.equal(core.chat(c.id).temporary, false);
  assert.ok(core.store.get("file", f.id));
  assert.equal(core.chat(c.id).pendingFiles, undefined);
});
test("Retention removes expired local records but preserves originals and reports", (t) => {
  const { core, dir } = fixture(t);
  const old = Date.now() - 100 * 86400000,
    c = core.createChat();
  core.store.put("chat", c.id, c, { updated: old });
  const f = uuid();
  core.store.put("file", f, { id: f, name: "old copy" }, { updated: old });
  const original = path.join(dir, "original.txt"),
    report = path.join(core.settings().workspace, "Reports", "report.txt");
  fs.writeFileSync(original, "keep");
  fs.writeFileSync(report, "keep");
  const r = core.cleanup();
  assert.equal(r.chats, 1);
  assert.equal(r.files, 1);
  assert.ok(fs.existsSync(original));
  assert.ok(fs.existsSync(report));
});
test("Retention measures last saved activity, not just creation date", (t) => {
  const { core } = fixture(t),
    c = core.createChat();
  core.store.put("chat", c.id, c, { updated: Date.now() - 200 * 86400000 });
  core.renameChat(c.id, "Still active");
  core.cleanup();
  assert.ok(core.chat(c.id));
});
test("Memory expiration is independent of indefinite chat retention", (t) => {
  const { core } = fixture(t);
  core.saveSettings({ retentionDays: 0 });
  const m = core.remember({ content: "Expired synthetic memory" });
  core.store.put("memory", m.id, m, { expires: Date.now() - 1 });
  core.cleanup();
  assert.equal(core.store.get("memory", m.id), null);
});
test("Logs and diagnostic output exclude secrets and arbitrary error content", async (t) => {
  const { core } = fixture(t);
  core.store.audit("request", {
    prompt: "DO_NOT_LOG",
    key: "DO_NOT_LOG",
    model: "DO_NOT_LOG",
    inputTokens: 12,
  });
  const c = core.createChat();
  await core.send({ chatId: c.id, prompt: "DO_NOT_LOG" });
  const diagnostic = JSON.stringify(core.diagnostics());
  assert.equal(diagnostic.includes("DO_NOT_LOG"), false);
  assert.equal(diagnostic.includes("sk-synthetic"), false);
  assert.ok(core.store.verifyAudit());
});
test("Audit tampering is detected", (t) => {
  const { core } = fixture(t);
  core.store.audit("request", { count: 1 });
  core.store.db
    .prepare("UPDATE audit SET detail='{}' WHERE event='request'")
    .run();
  assert.equal(core.store.verifyAudit(), false);
});
test("Schema migration preserves existing encrypted chat and settings", (t) => {
  const { core, root, cipher } = fixture(t),
    c = core.createChat();
  core.renameChat(c.id, "Before upgrade");
  core.store.db.exec(
    "DROP TABLE claims; DROP TABLE record_meta; PRAGMA user_version=1",
  );
  core.store.close();
  core.store = new Store(path.join(root, "privateai.db"), cipher);
  assert.equal(core.chat(c.id).title, "Before upgrade");
  assert.equal(core.settings().retentionDays, 100);
  assert.equal(
    core.store.db.prepare("PRAGMA user_version").get().user_version,
    3,
  );
});
test("Unsupported newer schema is rejected without overwriting records", (t) => {
  const { core, root, cipher } = fixture(t);
  core.store.db.exec("PRAGMA user_version=99");
  core.store.close();
  assert.throws(
    () => new Store(path.join(root, "privateai.db"), cipher),
    (e) => e.code === "VERSION",
  );
});
test("Replacing the API key invalidates HIPAA setup confirmation", (t) => {
  const { core } = fixture(t);
  core.saveKey("sk-another-synthetic-key");
  assert.equal(core.settings().approved, false);
  assert.throws(
    () => core.canSend(true),
    (e) => e.code === "SETUP",
  );
});
test("Changing API project invalidates prior approval", (t) => {
  const { core } = fixture(t);
  core.saveSettings({ projectId: "proj-synthetic" });
  assert.equal(core.settings().approved, false);
});
test("Existing HIPAA chats retain restrictions after public mode is selected", async (t) => {
  const { core, calls } = fixture(t),
    c = core.createChat();
  core.saveSettings({ hipaa: false, publicModeConfirmed: true });
  await core.send({ chatId: c.id, prompt: "Test" });
  assert.equal(calls[0].settings.hipaa, true);
  assert.equal(c.hipaa, true);
});
test("Public mode does not automatically include HIPAA memory", async (t) => {
  const { core, calls } = fixture(t);
  core.remember({ content: "HIPAA_ONLY_MEMORY" });
  core.saveSettings({
    memoryEnabled: true,
    hipaa: false,
    publicModeConfirmed: true,
  });
  const c = core.createChat();
  await core.send({ chatId: c.id, prompt: "Public question" });
  assert.equal(calls[0].opts.instructions.includes("HIPAA_ONLY_MEMORY"), false);
});
test("Public chat cannot attach a HIPAA working file", async (t) => {
  const { core, dir, calls } = fixture(t);
  const file = path.join(dir, "sample.txt");
  fs.writeFileSync(file, "sample");
  const f = await core.importFile(file);
  core.saveSettings({ hipaa: false, publicModeConfirmed: true });
  const c = core.createChat();
  await assert.rejects(
    core.send({ chatId: c.id, prompt: "Review", fileIds: [f.id] }),
    (e) => e.code === "POLICY",
  );
  assert.equal(calls.length, 0);
});
test("Manual deletion removes an exclusively owned attachment but not its original", async (t) => {
  const { core, dir } = fixture(t),
    c = core.createChat();
  const file = path.join(dir, "source.txt");
  fs.writeFileSync(file, "sample");
  const f = await core.importFile(file, null, c.id);
  core.deleteChat(c.id);
  assert.equal(core.store.get("file", f.id), null);
  assert.ok(fs.existsSync(file));
});
test("Backup reader handles are released; files can be removed immediately", (t) => {
  const { core, dir, cipher } = fixture(t),
    c = core.createChat();
  core.renameChat(c.id, "Backup");
  const dest = path.join(dir, "backup.db");
  core.store.backup(dest);
  const backup = new Store(dest, cipher);
  try {
    assert.equal(backup.get("chat", c.id).title, "Backup");
  } finally {
    backup.close();
  }
  fs.unlinkSync(dest);
  assert.equal(fs.existsSync(dest), false);
});
test("Deletion and retention purge app-owned old backups", (t) => {
  const { core, root } = fixture(t),
    c = core.createChat();
  fs.mkdirSync(path.join(root, "backups"));
  const dest = path.join(root, "backups", "privateai-123.db");
  core.store.backup(dest);
  core.deleteChat(c.id);
  assert.equal(fs.existsSync(dest), false);
});
test("Malformed chat and settings inputs fail without API calls", async (t) => {
  const { core, calls } = fixture(t);
  assert.throws(() => core.saveSettings({ retentionDays: -1 }));
  assert.throws(() => core.chat("../../anything"));
  await assert.rejects(core.send({ chatId: core.createChat().id, prompt: 34 }));
  assert.equal(calls.length, 0);
});
test("Editing a prompt replaces only its later conversation branch", async (t) => {
  const { core } = fixture(t),
    c = core.createChat();
  await core.send({ chatId: c.id, prompt: "First" });
  await core.send({ chatId: c.id, prompt: "Second" });
  await core.send({ chatId: c.id, prompt: "Corrected", editIndex: 2 });
  const messages = core.chat(c.id).messages;
  assert.equal(messages.length, 4);
  assert.equal(messages[0].text, "First");
  assert.equal(messages[2].text, "Corrected");
});
