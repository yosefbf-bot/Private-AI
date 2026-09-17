const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto");
const { fixture } = require("./helpers.cjs");
const {
  newIdentity,
  sealJob,
  openJob,
  publicIdentity,
  nextRun,
} = require("../source/worker.cjs");
const { Cipher, uuid } = require("../source/security.cjs");
const { startBridge, connectBridge } = require("../source/bridge.cjs");
test("Each PC receives a distinct identity and keys", () => {
  const a = newIdentity(),
    b = newIdentity();
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.encPrivate, b.encPrivate);
  assert.notEqual(a.signPrivate, b.signPrivate);
});
test("Job manifests are encrypted to one receiver and signed by a trusted sender", () => {
  const a = newIdentity(),
    b = newIdentity(),
    other = newIdentity(),
    payload = { id: uuid(), prompt: "SYNTHETIC_PRIVATE_JOB" };
  const e = sealJob(a, b, payload);
  assert.equal(JSON.stringify(e).includes(payload.prompt), false);
  assert.deepEqual(openJob(b, publicIdentity(a), e), payload);
  assert.throws(() => openJob(other, publicIdentity(a), e));
  assert.throws(() => openJob(b, publicIdentity(other), e));
  const modified = { ...e, box: e.box.slice(0, -3) + "xyz" };
  assert.throws(() => openJob(b, a, modified));
});
test("A local claim is single-use and survives app restart", (t) => {
  const { core } = fixture(t),
    id = uuid();
  assert.equal(core.store.claim(id), true);
  assert.equal(core.store.claim(id), false);
});
test("Two Workers seeing the same shared queue run a task only on the assigned PC", async (t) => {
  const sender = fixture(t),
    receiver = fixture(t),
    other = fixture(t);
  const shared = sender.core.settings().workspace;
  for (const f of [receiver, other])
    f.core.saveSettings({
      workspace: shared,
      role: "worker",
      workerEnabled: true,
    });
  sender.core.store.put(
    "peer",
    receiver.core.identity().id,
    publicIdentity(receiver.core.identity()),
  );
  receiver.core.store.put(
    "peer",
    sender.core.identity().id,
    publicIdentity(sender.core.identity()),
  );
  other.core.store.put(
    "peer",
    sender.core.identity().id,
    publicIdentity(sender.core.identity()),
  );
  const job = sender.core.jobPayload({
    prompt: "Synthetic report",
    format: "txt",
  });
  sender.core.worker.queue(job, receiver.core.identity().id);
  await Promise.all([receiver.core.worker.tick(), other.core.worker.tick()]);
  assert.equal(receiver.calls.length, 1);
  assert.equal(other.calls.length, 0);
  sender.core.worker.syncStatuses();
  assert.equal(sender.core.store.get("job", job.id).status, "completed");
  assert.ok(
    fs.existsSync(
      path.join(shared, sender.core.store.get("job", job.id).output),
    ),
  );
});
test("A replayed queue file does not run the API request again", async (t) => {
  const sender = fixture(t),
    receiver = fixture(t),
    shared = sender.core.settings().workspace;
  receiver.core.saveSettings({
    workspace: shared,
    role: "worker",
    workerEnabled: true,
  });
  sender.core.store.put(
    "peer",
    receiver.core.identity().id,
    publicIdentity(receiver.core.identity()),
  );
  receiver.core.store.put(
    "peer",
    sender.core.identity().id,
    publicIdentity(sender.core.identity()),
  );
  const j = sender.core.jobPayload({
    prompt: "Synthetic replay check",
    format: "txt",
  });
  sender.core.worker.queue(j, receiver.core.identity().id);
  const file = path.join(shared, "Tasks", "Queued", j.id + ".json"),
    bytes = fs.readFileSync(file);
  await receiver.core.worker.tick();
  fs.writeFileSync(file, bytes);
  await receiver.core.worker.tick();
  assert.equal(receiver.calls.length, 1);
});
test("An untrusted sender cannot start Worker requests", async (t) => {
  const a = fixture(t),
    b = fixture(t);
  b.core.saveSettings({
    workspace: a.core.settings().workspace,
    role: "worker",
    workerEnabled: true,
  });
  a.core.store.put(
    "peer",
    b.core.identity().id,
    publicIdentity(b.core.identity()),
  );
  a.core.worker.queue(
    a.core.jobPayload({ prompt: "Not trusted", format: "txt" }),
    b.core.identity().id,
  );
  await b.core.worker.tick();
  assert.equal(b.calls.length, 0);
});
test("Expired queued handoffs do not consume API credits and the sender can clean them",async t=>{
  const sender=fixture(t),receiver=fixture(t),shared=sender.core.settings().workspace;
  receiver.core.saveSettings({workspace:shared,role:"worker",workerEnabled:true});
  sender.core.store.put("peer",receiver.core.identity().id,publicIdentity(receiver.core.identity()));
  receiver.core.store.put("peer",sender.core.identity().id,publicIdentity(sender.core.identity()));
  const job=sender.core.jobPayload({prompt:"Expired synthetic report",format:"txt"});job.expiresAt=Date.now()-1;
  sender.core.worker.queue(job,receiver.core.identity().id);
  await receiver.core.worker.tick();assert.equal(receiver.calls.length,0);
  const result=sender.core.worker.cleanup();assert.equal(result.queuedExpired,1);
  assert.equal(sender.core.store.get("job",job.id).status,"expired");
  assert.equal(fs.existsSync(path.join(shared,"Tasks/Queued",job.id+".json")),false);
});
test("A paused Worker does not execute queued or scheduled work", async (t) => {
  const { core, calls } = fixture(t);
  core.saveSettings({
    role: "worker",
    workerEnabled: true,
    workerPaused: true,
  });
  const s = core.saveSchedule({
    name: "Due",
    prompt: "Report",
    format: "txt",
    frequency: "daily",
    time: "08:00",
  });
  core.store.put("schedule", s.id, { ...s, next: Date.now() - 1000 });
  await core.worker.tick();
  assert.equal(calls.length, 0);
});
test("Missed schedule catches up once and advances next execution before running", async (t) => {
  const { core, calls } = fixture(t);
  core.saveSettings({ role: "worker", workerEnabled: true });
  const s = core.saveSchedule({
    name: "Due",
    prompt: "Report",
    format: "txt",
    frequency: "daily",
    time: "08:00",
  });
  core.store.put("schedule", s.id, { ...s, next: Date.now() - 5 * 86400000 });
  await core.worker.tick();
  await core.worker.tick();
  assert.equal(calls.length, 1);
  assert.ok(core.store.get("schedule", s.id).next > Date.now());
});
test("Enabled background jobs can run while the interactive app is locked", async (t) => {
  const { core, calls } = fixture(t);
  core.saveSettings({ role: "worker", workerEnabled: true });
  const s = core.saveSchedule({
    name: "Due",
    prompt: "Report",
    format: "txt",
    frequency: "daily",
    time: "08:00",
  });
  core.store.put("schedule", s.id, { ...s, next: Date.now() - 1000 });
  core.lock();
  await core.worker.tick();
  assert.equal(calls.length, 1);
  assert.throws(
    () => core.summary(),
    (e) => e.code === "LOCKED",
  );
});
test("Weekday scheduling skips weekends", () => {
  const friday = new Date(2026, 8, 11, 12, 0);
  const next = new Date(
    nextRun({ frequency: "weekdays", time: "08:00" }, friday.getTime()),
  );
  assert.equal(next.getDay(), 1);
});
test("Protected bridge round trip authenticates and encrypts messages", async (t) => {
  const pipe =
      process.platform === "win32"
        ? "\\\\.\\pipe\\PrivateAI-test-" + uuid()
        : { host: "127.0.0.1", port: 0 },
    cipher = new Cipher(crypto.randomBytes(32));
  const b = startBridge(pipe, cipher, async (op, data) => ({ op, ...data }));
  await new Promise((r) => b.server.once("listening", r));
  let resolve;
  const response = new Promise((r) => (resolve = r));
  const link = await connectBridge(
    process.platform === "win32"
      ? pipe
      : { host: "127.0.0.1", port: b.server.address().port },
    cipher,
    (message) => {
      if (message.type === "result") resolve(message);
    },
  );
  t.after(() => {
    link.close();
    b.close();
  });
  link.send({ id: "request", op: "test", data: { text: "Synthetic" } });
  const result = await response;
  assert.deepEqual(result.result, { op: "test", text: "Synthetic" });
});
test("Protected bridge rejects a caller without the same local key", async (t) => {
  const pipe =
    process.platform === "win32"
      ? "\\\\.\\pipe\\PrivateAI-test-" + uuid()
      : { host: "127.0.0.1", port: 0 };
  const b = startBridge(pipe, new Cipher(crypto.randomBytes(32)), () =>
    assert.fail("must not dispatch"),
  );
  await new Promise((r) => b.server.once("listening", r));
  t.after(() => b.close());
  await assert.rejects(
    connectBridge(
      process.platform === "win32"
        ? pipe
        : { host: "127.0.0.1", port: b.server.address().port },
      new Cipher(crypto.randomBytes(32)),
      () => {},
    ),
  );
});
