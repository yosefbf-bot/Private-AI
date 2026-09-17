"use strict";
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { fail, uuid, isId } = require("./security.cjs");
async function executableInfo(file) {
  if (
    typeof file !== "string" ||
    !path.isAbsolute(file) ||
    path.extname(file).toLowerCase() !== ".exe"
  )
    throw fail("APP");
  const actual = fs.realpathSync(file),
    stat = fs.statSync(actual);
  if (!stat.isFile() || stat.size > 1000000000) throw fail("APP");
  const fd = fs.openSync(actual, "r");
  try {
    const magic = Buffer.alloc(2);
    fs.readSync(fd, magic, 0, 2, 0);
    if (magic.toString() !== "MZ") throw fail("APP");
  } finally {
    fs.closeSync(fd);
  }
  const hash = crypto.createHash("sha256");
  for await (const piece of fs.createReadStream(actual)) hash.update(piece);
  return { path: actual, sha256: hash.digest("hex") };
}
async function registerApp(core, file) {
  core.assertUnlocked();
  try {
    const info = await executableInfo(file);
    core.assertUnlocked();
    const existing = core.store
      .list("app")
      .find((a) => a.path.toLowerCase() === info.path.toLowerCase());
    const record = {
      ...info,
      id: existing?.id || uuid(),
      name: path.basename(file, ".exe"),
      capability: "Open program only",
    };
    core.store.put("app", record.id, record);
    core.store.audit("app_registered");
    return { id: record.id, name: record.name };
  } catch {
    throw fail("APP");
  }
}
async function openApp(core, id, launcher = spawn) {
  core.assertUnlocked();
  if (!isId(id)) throw fail("INVALID");
  const app = core.store.get("app", id);
  if (!app) throw fail("APP");
  try {
    const info = await executableInfo(app.path);
    if (info.sha256 !== app.sha256) throw fail("APP");
    core.assertUnlocked();
    if (!core.store.get("app", id)) throw fail("POLICY");
    await new Promise((resolve, reject) => {
      const child = launcher(info.path, [], {
        detached: true,
        stdio: "ignore",
        shell: false,
      });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
    core.store.audit("app_opened");
    return true;
  } catch {
    throw fail("APP");
  }
}
module.exports = { executableInfo, registerApp, openApp };
