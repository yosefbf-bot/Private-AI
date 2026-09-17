"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Cipher, atomicWrite, fail, CODES } = require("./security.cjs");

function loadVault(root, safeStorage, create, platform = process.platform) {
  if (platform !== "win32" || !safeStorage.isEncryptionAvailable())
    throw fail("ENCRYPTION");
  const file = path.join(root, "vault.dpapi");
  if (!fs.existsSync(file)) {
    // A replacement key would make old encrypted records unreadable. Never
    // initialize a new vault over an existing database, even an empty one.
    if (["privateai.db", "privateai.db-wal", "privateai.db-shm"].some(name => fs.existsSync(path.join(root, name))))
      throw fail("VAULT_MISSING");
    if (!create) throw fail("ENCRYPTION");
    let wrapped;
    try {
      wrapped = safeStorage.encryptString(crypto.randomBytes(32).toString("base64"));
    } catch (e) {
      throw Object.assign(fail("ENCRYPTION"), { cause: e });
    }
    atomicWrite(file, wrapped);
  }
  try {
    return new Cipher(Buffer.from(safeStorage.decryptString(fs.readFileSync(file)), "base64"));
  } catch (e) {
    throw Object.assign(fail("ENCRYPTION"), { cause: e });
  }
}

const STAGES = Object.freeze({
  folder: "Creating the private data folder",
  identity: "Reading your Windows account identity",
  permissions: "Protecting the private data folder",
  permission_check: "Verifying private folder permissions",
  vault: "Opening the Windows-encrypted key file",
  database: "Opening the encrypted database",
  services: "Starting local app services",
  window: "Opening the app window",
});
const OS_CODES = new Set(["EACCES", "EPERM", "ENOSPC", "EBUSY", "EIO", "ENOENT", "EEXIST", "ENOTDIR", "EROFS", "EMFILE", "ENFILE"]);

function startupMessage(error, stage) {
  const name = Object.hasOwn(STAGES, stage) ? stage : "startup";
  const code = Object.hasOwn(CODES, error?.code) ? error.code : "UNKNOWN";
  const nativeCode = [error?.cause?.code, error?.code].find(c => OS_CODES.has(c));
  const message = CODES[code] || "Private AI could not finish startup. Check the diagnostic code below.";
  // Only fixed labels and allowlisted codes reach the dialog. No error stack,
  // account name, file path, key bytes, prompt, or database content is included.
  return message + "\n\nStep: " + (STAGES[name] || "Starting Private AI") +
    "\nDiagnostic code: PAI-201-" + name.toUpperCase() + "-" + code + (nativeCode ? "-" + nativeCode : "") +
    "\n\nExisting data has not been reset. Do not delete the PrivateAI2 data folder. If this persists, send a screenshot of this dialog.";
}

module.exports = { loadVault, startupMessage };
