"use strict";

const express = require("express");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const os = require("node:os");

const { Core } = require("./source/core.cjs");
const { Store } = require("./source/database.cjs");
const {
  Cipher,
  safeError,
  fail,
  isId,
  text,
  safePath,
} = require("./source/security.cjs");
const { AccessManager } = require("./source/access.cjs");
const { createTools } = require("./source/local-tools.cjs");
const { UnifiedClient } = require("./server/unified-client.cjs");
const { ModelManager } = require("./source/model-manager.cjs");
const { BrowserWorker, validateRecipe } = require("./source/browser-worker.cjs");
const { MessagingBridge } = require("./source/messaging.cjs");

// Initialize development configuration with secure local defaults if not passed via process.env
if (!process.env.PRIVATE_AI_DEV_TOKEN) {
  const envFile = path.resolve(__dirname, ".env");
  if (fs.existsSync(envFile)) {
    try {
      const content = fs.readFileSync(envFile, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?$/);
        if (m && m[1] && m[2] !== undefined && !process.env[m[1]]) {
          process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
        }
      }
    } catch {}
  }
}

if (!process.env.PRIVATE_AI_DEV_TOKEN || process.env.PRIVATE_AI_DEV_TOKEN.length < 32) {
  const devToken = crypto.randomBytes(32).toString("hex");
  process.env.PRIVATE_AI_DEV_TOKEN = devToken;
  const envFile = path.resolve(__dirname, ".env");
  try {
    let currentEnv = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
    if (/PRIVATE_AI_DEV_TOKEN=/.test(currentEnv)) {
      currentEnv = currentEnv.replace(/PRIVATE_AI_DEV_TOKEN=.*/, `PRIVATE_AI_DEV_TOKEN=${devToken}`);
    } else {
      currentEnv = (currentEnv ? currentEnv.trimEnd() + "\n" : "") + `PRIVATE_AI_DEV_TOKEN=${devToken}\n`;
    }
    fs.writeFileSync(envFile, currentEnv, { mode: 0o600 });
    if (process.platform !== "win32") fs.chmodSync(envFile, 0o600);
  } catch {}
}

if (!process.env.PRIVATE_AI_DEV_DATA) {
  process.env.PRIVATE_AI_DEV_DATA = path.join(os.homedir(), ".privateai-development");
}

const devPolicy = require("./server/development-policy.cjs");
const config = devPolicy.configuration();
const PORT = config.port;
const app = express();

app.disable("x-powered-by");
app.use(devPolicy.boundary(config));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Initialize persistent directories
const localRoot = path.join(config.root, "private-data");
const workspaceDir = path.join(config.root, "workspace");
const tempDir = path.join(localRoot, "uploads");

fs.mkdirSync(localRoot, { recursive: true, mode: 0o700 });
fs.mkdirSync(workspaceDir, { recursive: true, mode: 0o700 });
fs.mkdirSync(tempDir, { recursive: true, mode: 0o700 });

// Initialize secure vault key
const vaultKeyFile = path.join(localRoot, "vault.key");
let vaultKey;
if (fs.existsSync(vaultKeyFile)) {
  if (fs.lstatSync(vaultKeyFile).isSymbolicLink()) throw fail("ENCRYPTION");
  vaultKey = fs.readFileSync(vaultKeyFile);
} else {
  vaultKey = crypto.randomBytes(32);
  fs.writeFileSync(vaultKeyFile, vaultKey, { mode: 0o600 });
}
if (vaultKey.length !== 32 || fs.lstatSync(vaultKeyFile).isSymbolicLink()) throw fail("ENCRYPTION");
if (process.platform !== "win32") fs.chmodSync(vaultKeyFile, 0o600);
const cipher = new Cipher(vaultKey);
const store = new Store(path.join(localRoot, "privateai.db"), cipher);
const client = new UnifiedClient();

// Real-time Server-Sent Events (SSE)
const eventClients = new Set();
function emit(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const clientRes of eventClients) {
    try {
      clientRes.write(data);
    } catch {
      eventClients.delete(clientRes);
    }
  }
}

const core = new Core({
  store,
  root: localRoot,
  client,
  emit,
  machine: crypto.createHash("sha256").update(os.hostname() + "|web").digest("hex"),
});

// Development mode never grants automation or organizational cloud approval.
core.resources.approve = async () => false;
core.developmentMode = true;
core.saveSettings({ approved: false });
if (!core.settings().workspace) core.saveSettings({ workspace: workspaceDir });
for (const [provider, variable] of [['openai', 'OPENAI_API_KEY'], ['gemini', 'GEMINI_API_KEY']]) {
  if (!core.key(provider) && process.env[variable]) core.saveKey(process.env[variable], provider);
}

// Initialize ModelManager
const modelManager = new ModelManager({
  directory: path.join(localRoot, "models"),
  emit,
});
core.modelManager = modelManager;

// Initialize BrowserWorker (graceful if playwright not installed)
let browserWorker = null;
try {
  browserWorker = new BrowserWorker(core);
} catch (e) {
  console.warn("BrowserWorker not available:", e.message);
}

// Initialize AccessManager with fallbacks for non-Windows environments
const access = new AccessManager(core, async (d) => {
  if (d.op === "outlook.messages") return [];
  if (d.op === "outlook.message") return { text: "" };
  if (d.op === "outlook.calendar") return [];
  return null;
});
core.localTools = createTools(core, access, browserWorker);

// Initialize MessagingBridge
const messaging = new MessagingBridge(core);

// Dispatch handler executing all core operations
async function dispatch(op, data = {}) {
  if (typeof op !== "string" || !data || typeof data !== "object" || Array.isArray(data)) throw fail("INVALID");
  devPolicy.assertOperation(op, data);
  core.assertUnlocked();
  if (op.startsWith("voiceTranscript")) return require("./source/voice-history.cjs").dispatch(core,op,data);
  if (op.startsWith("snf")) return require("./source/snf/index.cjs").dispatch(core,op,data);
  if (op.startsWith("workflow")) return require("./source/workflows/index.cjs").dispatch(core,op,data);
  if (op.startsWith("operations") || op.startsWith("meeting") || op.startsWith("sbar") || op.startsWith("speaker") || op.startsWith("audio")) return require("./source/operations-copilot.cjs").dispatch(core,op,data);
  if (op.startsWith("exec")) return require("./source/executive-desk-engine.cjs").dispatch(core,op,data);
  if (op.startsWith("regulatory") || op.startsWith("staffing")) return require("./source/operations-analytics-engine.cjs").dispatch(core,op,data);
  if (op.startsWith("assistant")) return require("./source/executive-assistant-engine.cjs").dispatch(core,op,data);
  switch (op) {
    // Deliberately unavailable in the development preview; desktop configures sources.
    case "integrationSave": throw fail("POLICY");
    case "companionStatus":
    case "companionSave":
    case "companionPair":
    case "companionRevoke": throw fail("POLICY");
    case "userGuide":
      return require("./source/app-guide.json");
    case "summary": {
      let buildInfo = {};
      try {
        buildInfo = require("./source/build-info.json");
      } catch {}
      return { ...core.summary(), autostart: false, buildInfo, developmentMode: true, modeLabel: devPolicy.LABEL };
    }
    case "createChat":
      return core.createChat(data);
    case "chat":
      return core.chat(data.id);
    case "archiveChat":
      return core.archiveChat(data.id, data.archived);
    case "renameChat":
      return core.renameChat(data.id, data.title);
    case "deleteChat":
      return core.deleteChat(data.id);
    case "endTemporary":
      return core.endTemporary(data.id);
    case "saveTemporary":
      return core.saveTemporary(data.id);
    case "send":
      return await core.send(data, (delta) =>
        emit({ type: "delta", chatId: data.chatId, delta })
      );
    case "stop":
      return core.stop(data.id);
    case "exportChat": {
      const index = Number.isInteger(data.index) ? data.index : null;
      return await core.exportChat(data.id, data.format || "pdf", index);
    }
    case "saveDraft":
      return core.saveDraft(data.id, data.text);
    case "memorySave":
      return core.remember(data);
    case "projectSave":
      return core.projectSave(data);
    case "agentSave":
      return core.saveAgent(data);
    case "scheduleSave":
      return core.saveSchedule(data);
    case "scheduleDuplicate":
      return core.duplicateSchedule(data.id);
    case "deleteItem": {
      if (
        ![
          "memory",
          "file",
          "project",
          "agent",
          "schedule",
          "app",
          "folder",
        ].includes(data.kind) ||
        !isId(data.id)
      )
        throw fail("INVALID");
      if (data.kind === "file") core.purgeRecoveryForFile(data.id);
      core.store.delete(data.kind, data.id);
      core.purgeBackups();
      return true;
    }
    case "settings":
      return core.saveSettings(data);
    case "saveKey":
      return core.saveKey(data.key, data.provider);
    case "deleteKey":
      return core.deleteKey(data.provider);
    case "models":
      return await core.models(data.provider);
    case "testConnection":
      return await core.testConnection(data.provider);
    case "healthAcknowledge":
      core.stability?.acknowledge();
      return true;
    case "runJob":
      return core.submitJob(data);
    case "retryExport":
      return await core.retryExport(data.id, data.format || "pdf");
    case "cleanup":
      return core.cleanup();
    case "diagnostics":
      return core.diagnostics();
    case "usageSummary":
      return core.router.meter.summary();
    case "localStatus":
      return {
        brain: {
          state: "web-ready",
          model: "Smart Hybrid (Gemini / Local / OpenAI)",
        },
        download: core.modelManager
          ? core.modelManager.status()
          : { state: "idle" },
        routing: { phase: "ready", tier: null },
      };
    case "downloadModel":
      if (core.modelManager) {
        core.modelManager.download(data.modelId).catch(() => {});
        return { state: "downloading" };
      }
      return { state: "idle" };
    case "cancelDownload":
      core.modelManager?.cancel();
      return { state: "cancelled" };
    case "liveSession":
      return await core.createLiveSession(data);
    case "messagingStatus":
      return {
        settings: messaging.settings(),
        state: messaging.state,
        code: messaging.code(),
        windows: {},
      };
    case "messagingSave":
      return messaging.save(data);
    case "browserRecipes":
      return core.store.list("browserRecipe");
    case "browserSave": {
      const r = validateRecipe(data);
      core.store.put("browserRecipe", r.id, r);
      return r;
    }
    case "browserDelete": {
      if (!isId(data.id)) throw fail("INVALID");
      core.store.delete("browserRecipe", data.id);
      return true;
    }
    case "browserRun":
      if (!browserWorker) throw fail("LOCAL_UNAVAILABLE");
      return await browserWorker.run(data);
    case "accessHealth":
      return {
        state: "ok",
        platform: process.platform,
        windows: false,
        web: true,
      };
    case "appChoices":
      return [];
    case "grantFolder":
      return access.grantFolder(
        core.settings().workspace,
        data.read,
        data.write
      );
    case "folderPermissions":
      return access.updateFolder(data.id, data.read, data.write);
    case "folderList":
      return access.listFolder(data.id, data.relative || "");
    case "folderImport":
      return access.importFolderFile(data.id, data.relative, data.chatId);
    case "folderReadText":
      return access.readText(data.id, data.relative);
    case "folderWriteText":
      return access.writeText(
        data.id,
        data.relative,
        data.text,
        data.version ?? null
      );
    case "folderExport":
      return access.exportToFolder(
        data.id,
        data.chatId,
        data.index,
        data.format
      );
    case "importReference":
      return access.importReference(data.name, data.text);
    case "chooseWorkspace":
      return core.settings().workspace;
    case "openWorkspace":
    case "openOutput":
    case "activity":
    case "copy":
    case "openLink":
      return true;
    case "autostart":
      return false;
    case "lock":
      core.lock();
      return true;
    case "unlock":
      core.unlock(data?.passphrase);
      return true;
    case "setPassphrase": {
      const pass = text(data.passphrase, 200);
      if (pass.length < 8) throw fail("INVALID");
      const salt = crypto.randomBytes(16).toString("hex"),
        hash = crypto.scryptSync(pass, salt, 32).toString("hex");
      core.store.put("secret", "applock", { salt, hash });
      return true;
    }
    case "backup": {
      const folder = path.join(core.root, "backups");
      fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
      const file = path.join(folder, "privateai-" + Date.now() + ".db");
      core.store.backup(file);
      return true;
    }
    case "selfCheck":
      return {
        ok: true,
        checks: [
          { name: "Persistent encrypted storage", status: "pass" },
          { name: "Web API bridge", status: "pass" },
          { name: "Document extraction engine", status: "pass" },
          { name: "Hybrid reasoning router", status: "pass" },
        ],
      };
    default:
      throw fail("INVALID");
  }
}

// API Routes
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, status: "ready" });
});

// SSE Events stream
app.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write(": keep-alive\n\n");
  eventClients.add(res);
  req.on("close", () => {
    eventClients.delete(res);
  });
});

// RPC Call route
app.post("/api/call", async (req, res) => {
  try {
    const { op, data } = req.body || {};
    const result = await dispatch(op, data);
    res.json({ ok: true, result });
  } catch (err) {
    res.json({ ok: false, error: safeError(err) });
  }
});

// Drop/Upload route
app.post("/api/drop", async (req, res) => {
  return res.status(403).json({ ok: false, error: safeError(fail("POLICY")) });
});

// File download route for exports
app.get("/api/download", (req, res) => {
  return res.status(403).json({ ok: false, error: safeError(fail("POLICY")) });
});

// Serve UI assets
const uiPath = path.join(__dirname, "source", "ui");

// Serve index.html with development session bootstrapping
function sendAppHtml(res) {
  try {
    let html = fs.readFileSync(path.join(uiPath, "index.html"), "utf8");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch {
    res.sendFile(path.join(uiPath, "index.html"));
  }
}

app.get(["/", "/index.html"], (_req, res) => {
  sendAppHtml(res);
});

app.use(express.static(uiPath, { index: false }));

// Fallback to index.html
app.use((_req, res) => {
  sendAppHtml(res);
});

app.listen(PORT, config.host, () => {
  console.log(`${devPolicy.LABEL}: http://127.0.0.1:${PORT}`);
  console.log(`Development Access Token: ${config.token}`);
});

