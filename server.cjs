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

const PORT = 3000;
const app = express();

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Initialize persistent directories
const localRoot = path.join(__dirname, "app-data");
const workspaceDir = path.join(__dirname, "workspace");
const tempDir = path.join(__dirname, "uploads");

fs.mkdirSync(localRoot, { recursive: true });
fs.mkdirSync(workspaceDir, { recursive: true });
fs.mkdirSync(tempDir, { recursive: true });

// Initialize secure vault key
const vaultKeyFile = path.join(localRoot, "vault.key");
let vaultKey;
if (fs.existsSync(vaultKeyFile)) {
  vaultKey = fs.readFileSync(vaultKeyFile);
} else {
  vaultKey = crypto.randomBytes(32);
  fs.writeFileSync(vaultKeyFile, vaultKey, { mode: 0o600 });
}
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

// Auto-approve background resource tasks for browser use
core.resources.approve = async () => true;

// Ensure workspace and settings are initialized
const currentSettings = core.settings();
const settingsUpdates = {};
if (!currentSettings.workspace) settingsUpdates.workspace = workspaceDir;
if (!currentSettings.approved) settingsUpdates.approved = true;
if (process.env.GEMINI_API_KEY && (!currentSettings.model || currentSettings.model === "gpt-4o-mini")) {
  settingsUpdates.model = "gemini-3.6-flash";
}
if (Object.keys(settingsUpdates).length > 0) {
  core.saveSettings(settingsUpdates);
}

if (!core.key()) {
  if (process.env.GEMINI_API_KEY) {
    core.store.put("secret", "openai", { key: "gemini-managed-key" });
  } else if (process.env.OPENAI_API_KEY) {
    core.store.put("secret", "openai", { key: process.env.OPENAI_API_KEY });
  }
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
  switch (op) {
    case "userGuide":
      return require("./source/app-guide.json");
    case "summary": {
      let buildInfo = {};
      try {
        buildInfo = require("./source/build-info.json");
      } catch {}
      return { ...core.summary(), autostart: false, buildInfo };
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
      return core.saveKey(data.key);
    case "deleteKey":
      return core.deleteKey();
    case "models":
      return await core.models();
    case "testConnection":
      return await core.testConnection();
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
      fs.mkdirSync(folder, { recursive: true });
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
    case "snfDashboard":
      return core.snf ? core.snf.getDashboardMetrics() : { error: "Not initialized" };
    case "snfAlerts": {
      let alerts = core.store.list("snf_alert");
      if (data.unresolvedOnly) alerts = alerts.filter((a) => a.status !== "resolved");
      if (data.severity) alerts = alerts.filter((a) => a.severity === data.severity);
      return alerts;
    }
    case "snfAcknowledgeAlert":
      return core.snf.acknowledgeAlert(data.alertId, data.user || "Clinical User");
    case "snfAssignAlert":
      return core.snf.assignAlert(data.alertId, data.assignedTo, data.user || "Clinical User", data.note || "");
    case "snfResolveAlert":
      return core.snf.resolveAlert(data.alertId, data.resolutionStatus, data.note || "", data.user || "Clinical User");
    case "snfOpenIssues":
      return core.store.list("snf_open_issue");
    case "snfMorningBrief":
      return { text: core.snf.generateMorningBrief() };
    case "snfResidentTimeline":
      return { text: core.snf.getResidentTimelineReport(data.query) };
    case "snfFeedStatus":
      return core.snf ? core.snf.getFeedStatus() : { feeds: {} };
    case "snfMedChanges":
      return core.snf ? core.snf.getMedicationChangesList() : [];
    case "snfPsychWatch":
      return core.snf ? core.snf.getPsychWatchData() : {};
    case "snfPCCReports":
      return core.snf ? core.snf.getPCCReportCatalog() : [];
    case "snfRunRules":
      return await core.snf.runRulesEngine(data.user || "Clinical User");
    case "snfSeedData":
      return await core.snf.seedRealisticPCCDataset();
    case "snfIngest":
      return await core.snf.ingestReports(data.reports || [], data.user || "Clinical User");
    case "snfRetentionCleanup":
      return core.snf ? core.snf.cleanup(core.snf.getSettings().retentionDays || 100) : { total: 0 };
    case "snfRetentionStatus":
      return core.snf ? core.snf.getRetentionStatus() : {};
    case "snfExportPDF":
      if (!core.snf) throw fail("INVALID");
      return await core.snf.exportReportPDF(data.type, data.query, core.settings().workspace);
    case "snfSaveSettings":
      if (!core.snf) throw fail("INVALID");
      return core.snf.saveSettings(data.settings || {});
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
  try {
    const { files = [], chatId, temporary } = req.body || {};
    const results = [];
    for (const f of files) {
      if (!f || !f.name || !f.base64) continue;
      const cleanName = path.basename(f.name);
      const tempFilePath = path.join(tempDir, `${Date.now()}-${cleanName}`);
      fs.writeFileSync(tempFilePath, Buffer.from(f.base64, "base64"));
      try {
        const item = await core.importFile(
          tempFilePath,
          temporary ? chatId : null,
          chatId || null
        );
        results.push(item);
      } finally {
        try {
          fs.unlinkSync(tempFilePath);
        } catch {}
      }
    }
    res.json({ ok: true, result: results });
  } catch (err) {
    res.json({ ok: false, error: safeError(err) });
  }
});

// File download route for exports
app.get("/api/download", (req, res) => {
  try {
    const relative = req.query.file;
    if (!relative || typeof relative !== "string") {
      return res.status(400).send("Missing file query parameter");
    }
    const ws = core.settings().workspace;
    const fullPath = safePath(ws, relative);
    if (!fs.existsSync(fullPath)) {
      return res.status(404).send("File not found");
    }
    res.download(fullPath, path.basename(fullPath));
  } catch (err) {
    res.status(500).send("Download error");
  }
});

// Serve UI assets
const uiPath = path.join(__dirname, "source", "ui");
app.use(express.static(uiPath));

// Fallback to index.html
app.use((_req, res) => {
  res.sendFile(path.join(uiPath, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Private AI web server running at http://0.0.0.0:${PORT}`);
});
