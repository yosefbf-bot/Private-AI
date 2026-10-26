"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const CODES = Object.freeze({
  DOCUMENT_SETUP: "Set up local document tools in Library, or retry the verified asset download. Documents and searches are not sent online.",
  DOCUMENT_SEARCH: "Local semantic search could not finish. Retry with a smaller collection or use word search. No cloud search was made.",
  OCR_FAILED: "Offline OCR could not finish. Retry a smaller or clearer file, or import a text version. No cloud OCR was made.",
  COMPANION_TLS: "The companion certificate could not be created or is expired. Enable the gateway again on Windows, then pair your phone with the new certificate. Certificate validation must remain enabled.",
  COMPANION_BIND: "The companion gateway could not listen on the selected address and port. Select a current private network address, check for a port conflict, and save again.",
  COMPANION_AUTH: "Pair this phone in the desktop app or replace its revoked pairing key.",
  COMPANION_ATTACHMENT: "Attachment names do not upload file contents. This companion endpoint currently accepts text only. Import the file on the desktop.",
  COMPANION_PAUSED: "Background work is paused on the desktop. Review Health & recovery and resume it before sending companion requests.",
  AI_SETUP: "Choose a local model in AI Processing or configure an optional AI provider in Settings. Local tools, clinical references and saved data remain available.",
  LOCAL_CAPABILITY: "This local path supports text. Extract document text or choose an approved provider that supports the requested image or web capability.",
  PROVIDER_CHANGED: "The provider settings or credentials changed while this request was waiting. Review the current settings and retry.",
  INTEGRATION_UNAVAILABLE: "This data source or operation is disabled or unavailable. General clinical analysis and saved data remain available.",
  BROWSER_SETUP: "The selected browser could not start. Install Chrome/Edge/Brave/Vivaldi, or have your administrator install the matching managed Firefox/Chromium automation runtime. No other browser was substituted.",
  BROWSER_UPDATE: "Update the selected browser before downloading reports. Windows Chromium-based report browsers require engine version 155 or newer because older versions can crash when reusing download history. Close the report browser, update through the browser or your administrator, then test the workflow and approve it again. Your saved reports, sessions and credentials have not been deleted.",
  BROWSER_LOGIN: "Sign-in needs attention. Open Browser reports to view the stopped step, complete verification or update saved credentials, then test and approve again. Passwords must not be entered in workflow steps.",
  BROWSER_CREDENTIAL: "Protected sign-in is unavailable or needs setup. In Browser reports, edit the workflow, save its credentials on this Windows PC, then test automatic sign-in. Existing credentials have not been exported or reset.",
  REVIEW_CHANGED: "The saved data changed. Reload and review the current revision before continuing.",
  BUDGET: "The local cloud budget blocked this request. Review the monthly limits and pricing in Settings → Cloud usage limits.",
  NOT_FOUND: "This item is no longer available. Reload the page.",
  OUTPUT_CHECK: "The draft is missing required output sections. Review the saved job before exporting.",
  MODEL_COOLDOWN: "Repeated local model failures. Loading is paused for up to one minute. Review Diagnostics and RAM settings before trying again.",
  RECOVERY: "This interrupted operation requires review. It was not automatically repeated.",
  LOCAL_ONLY: "This task could not be completed reliably locally. Cloud use is disabled; no OpenAI request was sent.",
  LOCAL_DEPENDENCY: "A local engine component is missing or incompatible. Reinstall the complete current Private AI package. No separate Microsoft runtime setup is needed; keep your model and chat data.",
  LOCAL_ENGINE_MISSING: "The local engine files are missing. Reinstall the complete Private AI package; do not delete your models or chat data.",
  LOCAL_FILE_MISSING: "The selected GGUF file is missing. Choose its current location or download the model again.",
  LOCAL_CPU: "The local engine cannot use this PC's processor instructions. Send the local startup diagnostic for a compatible engine build.",
  LOCAL_ENGINE_START: "The local engine exited before becoming ready. See the local startup diagnostic below; your model file has not been deleted.",
  LOCAL_ENGINE_TIMEOUT: "The local engine did not become ready within three minutes. Close heavy applications, retry, and check the local startup diagnostic.",
  LOCAL_ENGINE_ACCESS: "Windows could not launch the local engine. Check Windows Security or your organization's application controls; do not disable protections.",
  LOCAL_UNAVAILABLE: "The local model or requested local tool is unavailable. Check AI Processing and app permissions.",
  REPORT_RATE_LIMIT: "The report website requested fewer requests. This schedule has been paused; review its access policy and timing before resuming.",
  BROWSER_REVIEW: "Test this report workflow manually, then explicitly allow unattended runs. Changed workflows require a new test and approval.",
  SPEECH_PENDING: "Saved meeting audio is awaiting transcription. Retry it in Meetings before finishing.",
  SPEECH_SETUP: "Set up local transcription in Meetings before processing saved audio.",
  SPEECH_FAILED: "Local transcription could not finish. The saved audio can be retried in Meetings.",
  LOCAL_MODEL: "This file is not a supported GGUF model. Choose a valid model in AI Processing.",
  LOCAL_CONTEXT: "This request is too large for the local context limit. Use a smaller document or allow cloud processing.",
  LOW_MEMORY: "Available RAM is too low for these settings, or browser automation is using it. Close heavy apps or finish the browser task, set Local context tokens to 2048, save, and retry Load model.",
  MESSAGING: "Messaging is unavailable or the selected conversation could not be verified. No automatic retry was made.",
  INTERFERENCE: "Deferred: this action may affect windows, focus, input, or a shared app session. Unattended execution is blocked. Open Private AI and run the action manually to review its warning and approve it.",
  DEFERRED: "Action deferred safely; it was not executed. Run it manually later when you can review the interruption warning.",
  ACCESS:
    "Local app access could not finish. Classic Outlook is required for mailbox access. Other apps must expose supported Windows accessibility controls. If writing, check the app before trying again; the change may already have completed.",
  CHANGED:
    "The file already exists or changed since you opened it. Reopen it before saving, or choose a new name.",
  PATH: "Choose an allowed folder outside Private AI's private storage. Shortcuts, linked folders, and paths outside the grant are not allowed.",
  APP: "This program changed, moved, or could not open. Choose its executable again in Apps.",
  INVALID:
    "That request could not be used. Please check the entries and try again.",
  LOCKED: "Private AI is locked. Unlock it in the desktop app.",
  KEY: "The selected optional provider needs an API key. Configure it in Settings or choose a local model in AI Processing.",
  AUTH: "OpenAI did not accept this API key. Replace it in Settings.",
  UNLOCK: "That app passphrase was not accepted. Please try again.",
  CREDITS:
    "Your API account has insufficient quota or billing credit. Check OpenAI API billing.",
  RATE: "The API account is busy or rate limited. Wait a moment and try again.",
  MODEL:
    "This model or setting is unavailable for your account. Choose a model or adjust reasoning in Settings.",
  NETWORK:
    "The connection could not be completed. Check your network and try again. A request already sent may still be billed.",
  API: "OpenAI could not complete the request. Try again later; a request already sent may still be billed.",
  CANCELLED: "Stopped. Text already received has been kept.",
  STORAGE:
    "Private AI could not safely access its local storage. Check available space and file permissions.",
  ENCRYPTION:
    "Windows encryption is unavailable or the data belongs to another Windows profile. Existing data has been preserved.",
  VAULT_MISSING:
    "The encryption key is missing, but local database files already exist. Restore the original vault.dpapi with its matching database using the same Windows account. Do not delete or reset the data folder.",
  FILE: "This file could not be read. It may be locked, encrypted, damaged, or unsupported.",
  LIMIT: "This item is too large. Use a smaller file or selection.",
  REQUEST_LIMIT: "The latest message and its attachments exceed the 40 MB request limit. Remove an attachment or use a smaller selection.",
  WORKSPACE:
    "The work folder is unavailable or overlaps private app storage. Select an available folder in Settings.",
  PEER: "This PC is not connected as a trusted Worker. Connect the two PCs in Worker settings first.",
  POLICY: "This feature is unavailable in the current privacy settings.",
  BUSY: "A request is already running here. Stop it or wait for it to finish.",
  SETUP:
    "Complete the privacy setup and choose a model in Settings before sending.",
  INTERRUPTED:
    "The job was interrupted. It was not automatically repeated, to avoid duplicate work or charges.",
  EXPIRED:
    "This queued job expired before it ran. Create a new job if you still need the report.",
  VERSION:
    "This data was created by a newer Private AI version. Update the app; your data has not been changed.",
});
function fail(code) {
  const e = new Error(CODES[code] || CODES.INVALID);
  e.code = CODES[code] ? code : "INVALID";
  return e;
}
function safeError(e) {
  return {
    code: CODES[e?.code] ? e.code : "API",
    message: CODES[e?.code] || CODES.API,
  };
}
const uuid = () => crypto.randomUUID();
const isId = (v) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
function text(v, max = 200000) {
  if (typeof v !== "string" || v.length > max) throw fail("INVALID");
  return v;
}
function within(root, candidate) {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    rel === "" ||
    (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel))
  );
}
function safePath(root, relative) {
  if (
    typeof relative !== "string" ||
    !relative ||
    path.isAbsolute(relative) ||
    /[\x00-\x1f:]/.test(relative)
  )
    throw fail("WORKSPACE");
  const result = path.resolve(root, relative);
  for (const part of relative.split(/[\\/]/).filter(Boolean)) {
    if (
      part !== "." &&
      part !== ".." &&
      (/[. ]$/.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))
    )
      throw fail("WORKSPACE");
  }
  if (!within(root, result)) throw fail("WORKSPACE");
  let current = path.resolve(root);
  if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
    throw fail("WORKSPACE");
  for (const part of path
    .relative(root, result)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink())
      throw fail("WORKSPACE");
  }
  if (
    fs.existsSync(root) &&
    fs.existsSync(result) &&
    !within(fs.realpathSync(root), fs.realpathSync(result))
  )
    throw fail("WORKSPACE");
  return result;
}
function atomicWrite(file, bytes) {
  const temp = file + "." + uuid() + ".tmp";
  let created = false;
  try {
    // Windows FlushFileBuffers requires GENERIC_WRITE. Keep the original
    // writable handle through write + flush, then close it before replacement.
    const fd = fs.openSync(temp, "wx", 0o600);
    created = true;
    try {
      fs.writeFileSync(fd, bytes);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(temp, file);
  } catch (e) {
    try {
      if (created) fs.unlinkSync(temp);
    } catch {}
    throw Object.assign(fail("STORAGE"), { cause: e });
  }
}
class Cipher {
  constructor(key) {
    if (!Buffer.isBuffer(key) || key.length !== 32) throw fail("ENCRYPTION");
    this.key = key;
  }
  seal(value, aad) {
    const nonce = crypto.randomBytes(12);
    const c = crypto.createCipheriv("aes-256-gcm", this.key, nonce);
    c.setAAD(Buffer.from(aad));
    const b = Buffer.isBuffer(value)
      ? value
      : Buffer.from(JSON.stringify(value));
    return Buffer.concat([
      Buffer.from([1]),
      nonce,
      c.update(b),
      c.final(),
      c.getAuthTag(),
    ]);
  }
  open(buffer, aad, json = true) {
    try {
      const b = Buffer.from(buffer);
      if (b.length < 29 || b[0] !== 1) throw Error();
      const d = crypto.createDecipheriv(
        "aes-256-gcm",
        this.key,
        b.subarray(1, 13),
      );
      d.setAAD(Buffer.from(aad));
      d.setAuthTag(b.subarray(-16));
      const plain = Buffer.concat([d.update(b.subarray(13, -16)), d.final()]);
      return json ? JSON.parse(plain.toString("utf8")) : plain;
    } catch {
      throw fail("ENCRYPTION");
    }
  }
  mac(value) {
    return crypto.createHmac("sha256", this.key).update(value).digest("hex");
  }
}
function encodeFrame(obj) {
  const data = Buffer.from(JSON.stringify(obj));
  if (data.length > 900000) throw fail("LIMIT");
  const n = Buffer.alloc(4);
  n.writeUInt32LE(data.length);
  return Buffer.concat([n, data]);
}
class FrameReader {
  constructor(onMessage, onError, max = 900000) {
    this.buffer = Buffer.alloc(0);
    this.onMessage = onMessage;
    this.onError = onError;
    this.max = max;
    this.failed = false;
  }
  push(chunk) {
    if (this.failed) return;
    try {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      while (this.buffer.length >= 4) {
        const n = this.buffer.readUInt32LE(0);
        if (n < 2 || n > this.max) throw fail("LIMIT");
        if (this.buffer.length < 4 + n) return;
        const msg = JSON.parse(this.buffer.subarray(4, 4 + n));
        this.buffer = this.buffer.subarray(4 + n);
        if (!msg || typeof msg !== "object" || Array.isArray(msg))
          throw fail("INVALID");
        this.onMessage(msg);
      }
    } catch (e) {
      this.failed = true;
      this.buffer = Buffer.alloc(0);
      this.onError(e);
    }
  }
}
module.exports = {
  Cipher,
  fail,
  safeError,
  CODES,
  uuid,
  isId,
  text,
  within,
  safePath,
  atomicWrite,
  encodeFrame,
  FrameReader,
};

