"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { atomicWrite } = require("../source/security.cjs");
const { loadVault, startupMessage } = require("../source/startup-storage.cjs");

function folder(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "Private AI startup test "));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

// Model the documented Windows FlushFileBuffers requirement and the rule that
// replacement happens only after the temporary file's handle has been closed.
// Real file bytes are used; this does not claim native Windows execution.
function windowsFileRules(t) {
  const handles = new Map();
  const open = fs.openSync, close = fs.closeSync;
  const sync = fs.fsyncSync, rename = fs.renameSync;
  t.mock.method(fs, "openSync", (file, flags, ...args) => {
    const fd = open(file, flags, ...args);
    const writable = typeof flags === "string"
      ? /[wa+]/.test(flags)
      : !!(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR));
    handles.set(fd, { file, writable });
    return fd;
  });
  t.mock.method(fs, "closeSync", (fd) => {
    close(fd);
    handles.delete(fd);
  });
  t.mock.method(fs, "fsyncSync", (fd) => {
    if (!handles.get(fd)?.writable)
      throw Object.assign(new Error("FlushFileBuffers needs GENERIC_WRITE"), { code: "EPERM" });
    return sync(fd);
  });
  t.mock.method(fs, "renameSync", (from, to) => {
    assert.ok(![...handles.values()].some(h => h.file === from), "close before rename");
    return rename(from, to);
  });
  return handles;
}

test("first-run encrypted file can flush under Windows handle rules", (t) => {
  const root = folder(t);
  const handles = windowsFileRules(t);
  const target = path.join(root, "vault.dpapi");
  const bytes = Buffer.from([0, 128, 255, 42]);
  atomicWrite(target, bytes);
  assert.deepEqual(fs.readFileSync(target), bytes);
  assert.deepEqual(fs.readdirSync(root), ["vault.dpapi"]);
  assert.equal(handles.size, 0);
});

test("replacement keeps only complete new bytes and releases every handle", (t) => {
  const root = folder(t), target = path.join(root, "encrypted report.bin");
  fs.writeFileSync(target, "previous");
  const handles = windowsFileRules(t);
  atomicWrite(target, "replacement");
  assert.equal(fs.readFileSync(target, "utf8"), "replacement");
  assert.deepEqual(fs.readdirSync(root), [path.basename(target)]);
  assert.equal(handles.size, 0);
});

for (const [method, code] of [["fsyncSync", "EIO"], ["renameSync", "EBUSY"], ["writeFileSync", "ENOSPC"]]) {
  test(`${method} failure preserves existing bytes and cleans up`, (t) => {
    const root = folder(t), target = path.join(root, "vault.dpapi");
    fs.writeFileSync(target, "existing encrypted data");
    const handles = windowsFileRules(t);
    const reject = () => {
      throw Object.assign(new Error("SYNTHETIC_PRIVATE_PATH"), { code });
    };
    if (fs[method].mock) fs[method].mock.mockImplementation(reject);
    else t.mock.method(fs, method, reject);
    assert.throws(() => atomicWrite(target, "new data"), e => e.code === "STORAGE" && !e.message.includes("SYNTHETIC_PRIVATE_PATH"));
    assert.equal(fs.readFileSync(target, "utf8"), "existing encrypted data");
    assert.deepEqual(fs.readdirSync(root), ["vault.dpapi"]);
    assert.equal(handles.size, 0);
  });
}

// A synthetic DPAPI interface isolates key lifecycle behavior. Windows DPAPI
// itself must still be checked on the user's Windows account.
function syntheticDpapi() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: s => Buffer.from("SYNTHETIC:" + s),
    decryptString: b => {
      if (!b.toString().startsWith("SYNTHETIC:")) throw new Error("wrong profile");
      return b.toString().slice(10);
    },
  };
}

test("first run creates a vault that reopens without changing its key", (t) => {
  const root = folder(t), dpapi = syntheticDpapi();
  windowsFileRules(t);
  const first = loadVault(root, dpapi, true, "win32");
  const file = path.join(root, "vault.dpapi"), original = fs.readFileSync(file);
  const encrypted = first.seal({ sample: 42 }, "test");
  const second = loadVault(root, dpapi, true, "win32");
  assert.deepEqual(second.open(encrypted, "test"), { sample: 42 });
  assert.deepEqual(fs.readFileSync(file), original);
});

for (const name of ["privateai.db", "privateai.db-wal", "privateai.db-shm"]) {
  test(`missing vault with ${name} never generates a new encryption key`, (t) => {
    const root = folder(t), dpapi = syntheticDpapi();
    fs.writeFileSync(path.join(root, name), "existing encrypted database bytes");
    const encrypt = t.mock.method(dpapi, "encryptString");
    assert.throws(() => loadVault(root, dpapi, true, "win32"), e => e.code === "VAULT_MISSING");
    assert.equal(encrypt.mock.callCount(), 0);
    assert.deepEqual(fs.readdirSync(root), [name]);
    assert.equal(fs.readFileSync(path.join(root, name), "utf8"), "existing encrypted database bytes");
  });
}

test("unreadable vault is preserved and is never replaced", (t) => {
  const root = folder(t), dpapi = syntheticDpapi(), file = path.join(root, "vault.dpapi");
  fs.writeFileSync(file, "original wrong-profile ciphertext");
  const encrypt = t.mock.method(dpapi, "encryptString");
  assert.throws(() => loadVault(root, dpapi, true, "win32"), e => e.code === "ENCRYPTION");
  assert.equal(encrypt.mock.callCount(), 0);
  assert.equal(fs.readFileSync(file, "utf8"), "original wrong-profile ciphertext");
});

test("unavailable Windows encryption leaves the folder empty", (t) => {
  const root = folder(t), dpapi = syntheticDpapi();
  dpapi.isEncryptionAvailable = () => false;
  assert.throws(() => loadVault(root, dpapi, true, "win32"), e => e.code === "ENCRYPTION");
  assert.deepEqual(fs.readdirSync(root), []);
});

test("native companion does not create a vault before desktop setup", (t) => {
  const root = folder(t);
  assert.throws(() => loadVault(root, syntheticDpapi(), false, "win32"), e => e.code === "ENCRYPTION");
  assert.deepEqual(fs.readdirSync(root), []);
});

test("startup diagnostics distinguish stages and redact arbitrary error details", () => {
  const error = Object.assign(new Error("SYNTHETIC_SECRET /Users/PrivateName"), {
    code: "STORAGE", cause: Object.assign(new Error("SYNTHETIC_KEY"), { code: "EPERM" }),
  });
  const message = startupMessage(error, "vault");
  assert.ok(message.includes("PAI-201-VAULT-STORAGE-EPERM"));
  assert.ok(message.includes("Do not delete"));
  assert.ok(!message.includes("SYNTHETIC"));
  assert.ok(!message.includes("PrivateName"));
  const unknown = startupMessage({ code: "SYNTHETIC_SECRET", message: "SYNTHETIC_SECRET" }, "SYNTHETIC_SECRET");
  assert.ok(unknown.includes("PAI-201-STARTUP-UNKNOWN"));
  assert.ok(!unknown.includes("SYNTHETIC"));
  assert.ok(startupMessage(error, "permission_check").includes("PERMISSION_CHECK"));
});
