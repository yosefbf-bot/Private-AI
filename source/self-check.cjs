"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Store } = require("./database.cjs");
const { Cipher, uuid, safePath, atomicWrite } = require("./security.cjs");
const { processFile, workspace } = require("./files.cjs");
const { connectBridge } = require("./bridge.cjs");

// Synthetic data only. These checks never make an OpenAI request.
async function localChecks(
  core,
  { safeStorage, pipe, verifyPermissions, helperHealth },
) {
  const checks = [];
  const {assessMemory}=require('./memory-health.cjs');
  let memoryHealth=assessMemory(null);
  const check = async (name, task) => {
    try {
      await task();
      checks.push({ name, status: "pass" });
    } catch {
      checks.push({ name, status: "needs attention" });
    }
  };
  const dir = safePath(core.root, "self-check-" + uuid());
  fs.mkdirSync(dir);
  try {
    await check("Windows file write, disk flush, and replacement", () => {
      const file = path.join(dir, "write-check.bin");
      try {
        atomicWrite(file, "Synthetic first write");
        atomicWrite(file, "Synthetic replacement");
        if (fs.readFileSync(file, "utf8") !== "Synthetic replacement") throw Error();
      } finally {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      }
    });
    await check("Windows encryption", () => {
      const value = crypto.randomBytes(32).toString("hex");
      if (
        !safeStorage.isEncryptionAvailable() ||
        safeStorage.decryptString(safeStorage.encryptString(value)) !== value
      )
        throw Error();
    });
    await check("Private folder permissions", verifyPermissions);
    if (helperHealth)
      await check("Bundled Windows app-access helper", async () => {
        const health=await helperHealth();if (!health.windows) throw Error();
        memoryHealth=assessMemory(health.memory);
      });
    await check("Encrypted database, backup, and file cleanup", () => {
      const file = path.join(dir, "check.db"),
        backup = path.join(dir, "backup.db");
      const cipher = new Cipher(crypto.randomBytes(32));
      let db = new Store(file, cipher);
      try {
        db.put("check", "synthetic", { value: "PRIVATE_AI_SYNTHETIC_CHECK" });
        db.backup(backup);
      } finally {
        db.close();
      }
      db = new Store(backup, cipher);
      try {
        if (db.get("check", "synthetic").value !== "PRIVATE_AI_SYNTHETIC_CHECK")
          throw Error();
      } finally {
        db.close();
      }
      if (
        fs
          .readFileSync(file)
          .includes(Buffer.from("PRIVATE_AI_SYNTHETIC_CHECK"))
      )
        throw Error();
      for (const name of fs.readdirSync(dir))
        fs.unlinkSync(path.join(dir, name));
    });
    await check("Protected local desktop connection", async () => {
      let link, timer;
      try {
        await new Promise(async (resolve, reject) => {
          timer = setTimeout(reject, 15000);
          try {
            link = await connectBridge(pipe, core.store.cipher, (message) => {
              if (message.type === "result" && message.id === "self-check")
                message.result?.ok ? resolve() : reject();
            });
            link.send({ id: "self-check", op: "ping", data: {} });
          } catch {
            reject();
          }
        });
      } finally {
        clearTimeout(timer);
        link?.close();
      }
    });
    for (const ext of [".docx", ".xlsx", ".pdf"]) {
      await check(
        ext.slice(1).toUpperCase() + " reading and writing",
        async () => {
          const file = await processFile({
            op: "export",
            ext,
            title: "Synthetic check",
            content: "Private AI synthetic report. Total: 42.",
            rows: [["Total"], ["42"]],
          });
          const result = await processFile({
            op: "extract",
            ext,
            bytes: file.bytes,
          });
          if (!result.text.includes("42")) throw Error();
        },
      );
    }
    if (core.settings().workspace)
      await check("Selected work folder and cleanup", () => {
        const root = workspace(core.settings().workspace, core.root);
        const file = safePath(root, "Reports/." + uuid() + ".partial");
        try {
          fs.writeFileSync(file, "Synthetic local check", { flag: "wx" });
        } finally {
          if (fs.existsSync(file)) fs.unlinkSync(file);
        }
      });
    else
      checks.push({
        name: "Selected work folder",
        status: "choose a folder in Settings",
      });
    await check("Audit log integrity", () => {
      if (!core.store.verifyAudit()) throw Error();
    });
  } finally {
    await check("Diagnostic scratch cleanup", () =>
      fs.rmSync(dir, { recursive: true, force: true }),
    );
  }
  const result = {
    checkedAt: new Date().toISOString(),
    platform: process.platform,
    architecture: process.arch,
    networkRequests: 0,
    memoryHealth,
    checks,
  };
  core.store.put("maintenance", "localChecks", result);
  return result;
}
module.exports = { localChecks };
