"use strict";
const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  { EventEmitter } = require("node:events");
const { fixture } = require("./helpers.cjs"),
  { AccessManager } = require("../source/access.cjs"),
  { registerApp, openApp } = require("../source/apps.cjs"),
  { processFile } = require("../source/files.cjs"),
  { restrictedDacl } = require("../source/windows-acl.cjs");
function setup(
  t,
  helper = async () => {
    throw Error("unexpected helper call");
  },
) {
  const f = fixture(t);
  f.core.resources.approve=async()=>true; // Simulated explicit desktop approval.
  return { ...f, access: new AccessManager(f.core, helper) };
}
test("Folder grants default to neither read nor write", (t) => {
  const { core, access } = setup(t),
    g = access.grantFolder(core.settings().workspace);
  assert.throws(() => access.listFolder(g.id), { code: "POLICY" });
  assert.throws(() => access.writeText(g.id, "note.txt", "text"), {
    code: "POLICY",
  });
});
test("Allowed folders reject private storage, traversal and symlinks", (t) => {
  const { core, root, dir, access } = setup(t);
  assert.throws(() => access.grantFolder(root, true, true));
  assert.throws(() => access.grantFolder(dir, true, true));
  const g = access.grantFolder(core.settings().workspace, true, true);
  assert.throws(() => access.readText(g.id, "../private.txt"));
  fs.symlinkSync(root, path.join(g.path, "escape"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => access.readText(g.id, "escape/key.txt"));
});
test("Write-only folder creates a note, denies reads and never overwrites an existing name", (t) => {
  const { core, access } = setup(t),
    g = access.grantFolder(core.settings().workspace, false, true);
  access.writeText(g.id, "Note.txt", "first");
  assert.throws(() => access.readText(g.id, "Note.txt"), { code: "POLICY" });
  assert.throws(() => access.writeText(g.id, "Note.txt", "second"), {
    code: "CHANGED",
  });
  assert.equal(fs.readFileSync(path.join(g.path, "Note.txt"), "utf8"), "first");
});
test("A stale text edit preserves someone else's changes", (t) => {
  const { core, access } = setup(t),
    g = access.grantFolder(core.settings().workspace, true, true);
  access.writeText(g.id, "Note.md", "first");
  const old = access.readText(g.id, "Note.md");
  fs.writeFileSync(path.join(g.path, "Note.md"), "changed elsewhere");
  assert.throws(() => access.writeText(g.id, "Note.md", "stale", old.version), {
    code: "CHANGED",
  });
  const current = access.readText(g.id, "Note.md");
  access.writeText(g.id, "Note.md", "reviewed", current.version);
  assert.equal(access.readText(g.id, "Note.md").text, "reviewed");
});
test("Outlook read/write permissions are independent and no Send operation exists", async (t) => {
  const calls = [],
    { access } = setup(t, async (d) => {
      calls.push(d);
      return { saved: true, sent: false };
    });
  for (const op of [
    "outlook.messages",
    "outlook.calendar",
    "outlook.draft",
    "outlook.appointment",
  ])
    await assert.rejects(access.outlook(op), { code: "POLICY" });
  access.setOutlook({ readMessages: true });
  await access.outlook("outlook.messages");
  await assert.rejects(access.outlook("outlook.calendar"), { code: "POLICY" });
  await assert.rejects(access.outlook("outlook.draft"), { code: "POLICY" });
  access.setOutlook({ writeDrafts: true });
  await access.outlook("outlook.draft", {
    to: "synthetic@example.invalid",
    subject: "test",
    body: "synthetic",
  });
  await assert.rejects(access.outlook("outlook.send"), { code: "POLICY" });
  assert.equal(calls.length, 2);
});
test("Revoking Outlook access during a read prevents returned content", async (t) => {
  let finish;
  const { access } = setup(t, () => new Promise((r) => (finish = r)));
  access.setOutlook({ readMessages: true });
  const task = access.outlook("outlook.messages");
  while(!finish)await new Promise(r=>setImmediate(r));
  access.setOutlook({});
  finish([{ subject: "hidden after revocation" }]);
  await assert.rejects(task, { code: "POLICY" });
});
test("App reads require a grant and a matching executable fingerprint", async (t) => {
  const calls = [],
    { dir, core, access } = setup(t, async (d) => {
      calls.push(d);
      return { text: "visible synthetic" };
    });
  const exe = path.join(dir, "Allowed.exe");
  fs.writeFileSync(exe, "MZ-synthetic");
  const a = await registerApp(core, exe);
  await assert.rejects(access.appAction(a.id, "ui.read", { pid: 123 }), {
    code: "POLICY",
  });
  access.updateApp(a.id, true, false);
  await access.appAction(a.id, "ui.read", { pid: 123 });
  await assert.rejects(
    access.appAction(a.id, "ui.writeDraft", { pid: 123, text: "no" }),
    { code: "POLICY" },
  );
  fs.appendFileSync(exe, "changed");
  await assert.rejects(access.appAction(a.id, "ui.read", { pid: 123 }), {
    code: "APP",
  });
  assert.equal(calls.length, 1);
});
test("Program launch uses an exact path with no arguments or shell", async (t) => {
  const { core, dir } = setup(t),
    exe = path.join(dir, "My App.exe");
  fs.writeFileSync(exe, "MZ test");
  const a = await registerApp(core, exe);
  let call;
  await openApp(core, a.id, (file, args, options) => {
    call = { file, args, options };
    const c = new EventEmitter();
    c.unref = () => {};
    queueMicrotask(() => c.emit("spawn"));
    return c;
  });
  assert.equal(call.file, exe);
  assert.deepEqual(call.args, []);
  assert.equal(call.options.shell, false);
});
test("Local app references create encrypted HIPAA attachments without API calls", (t) => {
  const { core, root, calls, access } = setup(t),
    r = access.importReference("Chosen message", "SYNTHETIC_PRIVATE_REFERENCE");
  assert.equal(r.chat.hipaa, true);
  assert.equal(core.file(r.file.id).ownerChat, r.chat.id);
  assert.equal(calls.length, 0);
  core.store.db.exec("PRAGMA wal_checkpoint(FULL)");
  assert.equal(
    fs
      .readFileSync(path.join(root, "privateai.db"))
      .includes(Buffer.from("SYNTHETIC_PRIVATE_REFERENCE")),
    false,
  );
  assert.equal(
    JSON.stringify(core.store.auditSummary()).includes(
      "SYNTHETIC_PRIVATE_REFERENCE",
    ),
    false,
  );
});
test("Windows private ACL verifier rejects unprotected or extra-principal grants", () => {
  const sid = "S-1-5-21-123-456-789-1001";
  assert.equal(
    restrictedDacl(`D:P(A;OICI;FA;;;${sid})(A;OICI;FA;;;SY)`, sid),
    true,
  );
  assert.equal(
    restrictedDacl(`D:(A;OICI;FA;;;${sid})(A;OICI;FA;;;SY)`, sid),
    false,
  );
  assert.equal(
    restrictedDacl(`D:P(A;OICI;FA;;;${sid})(A;OICI;FA;;;SY)(A;;FA;;;WD)`, sid),
    false,
  );
});
test("EML import decodes a selected message without reading attachments", async () => {
  const bytes = Buffer.from(
    'From: sender@example.invalid\r\nTo: reader@example.invalid\r\nSubject: Synthetic test\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="abc"\r\n\r\n--abc\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nHello=20reader\r\n--abc\r\nContent-Type: text/plain\r\nContent-Disposition: attachment; filename="secret.txt"\r\n\r\nATTACHMENT_NOT_TO_READ\r\n--abc--\r\n',
  );
  const r = await processFile({ op: "extract", ext: ".eml", bytes });
  assert.ok(r.text.includes("Hello reader"));
  assert.equal(r.text.includes("ATTACHMENT_NOT_TO_READ"), false);
});
test("MSG import reads a synthetic real compound-document message", async () => {
  const { burn } = require("@kenjiuno/msgreader/lib/Burner"),
    { TypeEnum: T } = require("@kenjiuno/msgreader/lib/Reader");
  const entries = [
    { name: "Root Entry", type: T.ROOT, length: 0, children: [1, 2, 3] },
  ];
  for (const [name, value] of [
    ["001A", "IPM.Note"],
    ["0037", "Synthetic MSG subject"],
    ["1000", "Synthetic MSG body"],
  ]) {
    const b = Uint8Array.from(Buffer.from(value + "\0", "utf16le"));
    entries.push({
      name: "__substg1.0_" + name + "001F",
      type: T.DOCUMENT,
      length: b.length,
      binaryProvider: () => b,
    });
  }
  const r = await processFile({
    op: "extract",
    ext: ".msg",
    bytes: burn(entries),
  });
  assert.ok(r.text.includes("Synthetic MSG subject"));
  assert.ok(r.text.includes("Synthetic MSG body"));
});
test("ICS is a reference only, not an executable calendar import", async () => {
  const r = await processFile({
    op: "extract",
    ext: ".ics",
    bytes: Buffer.from(
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nSUMMARY:Synthetic event\r\nEND:VEVENT\r\nEND:VCALENDAR",
    ),
  });
  assert.ok(r.text.includes("Synthetic event"));
  await assert.rejects(
    processFile({ op: "extract", ext: ".ics", bytes: Buffer.from("invalid") }),
  );
});
test("Chat and file lists decrypt metadata only, not entire documents", (t) => {
  const { core } = setup(t);
  core.createChat();
  const old = core.store.cipher.open.bind(core.store.cipher);
  core.store.cipher.open = (payload, aad) => {
    assert.equal(/^(file|chat):/.test(aad), false);
    return old(payload, aad);
  };
  assert.ok(core.summary().chats.length);
});
test("Old webpage snapshots are not sent again on a follow-up", (t) => {
  const { core } = setup(t),
    c = core.createChat();
  c.messages = [
    {
      role: "user",
      text: "first",
      page: { text: "SYNTHETIC_PAGE", confirmed: true },
    },
    { role: "assistant", text: "answer" },
    { role: "user", text: "follow up" },
  ];
  assert.equal(
    JSON.stringify(core.buildInput(c)).includes("SYNTHETIC_PAGE"),
    false,
  );
});


test('selected Outlook message triage is opt-in and follows both permission checks',async t=>{
 const triage=require('../source/workflows/correspondence.cjs');
 const {core,access}=setup(t,async()=>({text:'Please reply about this synthetic selected email.'}));
 access.setOutlook({readMessages:true});await access.outlook('outlook.message',{id:'synthetic-id',storeId:'synthetic-store'});assert.equal(core.store.count('wf_communication_source'),0);
 triage.save(core,{enabled:true,outlook:true});await access.outlook('outlook.messages');assert.equal(core.store.count('wf_communication_source'),0);
 await access.outlook('outlook.message',{id:'synthetic-id',storeId:'synthetic-store'});assert.equal(triage.list(core).candidates.length,1);assert.equal(core.store.count('todo'),0);assert.equal(core.store.count('messageOut'),0);
 const original=core.store.list('wf_communication_source');access.helper=async()=>{access.setOutlook({readMessages:false});return {text:'URGENT unapproved new source'};};
 await assert.rejects(access.outlook('outlook.message',{id:'new-id',storeId:'synthetic-store'}),{code:'POLICY'});assert.deepEqual(core.store.list('wf_communication_source'),original);
});
