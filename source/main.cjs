"use strict";
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  safeStorage,
  session,
  shell,
  Menu,
  Tray,
  powerMonitor,
  nativeImage,
  clipboard,
} = require("electron");
const path = require("node:path"),
  fs = require("node:fs"),
  crypto = require("node:crypto"),
  os = require("node:os");
const { spawn, execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const {
  fail,
  safeError,
  atomicWrite,
  FrameReader,
  encodeFrame,
  safePath,
  uuid,
} = require("./security.cjs");
const { Store } = require("./database.cjs");
const { Core } = require("./core.cjs");
const { startBridge, connectBridge } = require("./bridge.cjs");
const extension = require("./extension-id.json");
const { localChecks } = require("./self-check.cjs");
const { protectPrivateFolder, verifyPrivateAcl } = require("./windows-acl.cjs");
const {LocalBrain}=require("./local-brain.cjs");
const {ModelManager,MODELS,TIERS}=require("./model-manager.cjs");
const {cloudAllowed}=require("./hybrid-settings.cjs");
const {createTools}=require("./local-tools.cjs");
const {BrowserWorker,validateRecipe,validateBrowserTarget}=require("./browser-worker.cjs");
const {MessagingBridge}=require("./messaging.cjs");
const {CompanionGateway}=require("./companion-gateway.cjs");
const {WhatsAppWeb}=require("./whatsapp-web.cjs");
const {WhatsAppWindows}=require("./whatsapp-windows.cjs");
const memorySampler=new (require('./process-memory.cjs').ProcessMemorySampler)();
let modelManager,browserWorker,messaging,companion,rendererRecoveries=0,rendererNeedsReload=false;
const { loadVault, startupMessage } = require("./startup-storage.cjs");
const { AccessManager, helperCall } = require("./access.cjs");
let access;
const { registerApp, openApp } = require("./apps.cjs");
let userSid, startupStage = "folder";
const browserHosts=require('./browser-hosts.cjs');
const origin=browserHosts.origin;
const isNative=browserHosts.isInvocation(process.argv);
app.setName("Private AI");
const validationArg=process.argv.find(a=>a.startsWith('--release-validation='));
const validationReport=validationArg?validationArg.slice('--release-validation='.length):null;
if(validationReport&&(!path.isAbsolute(validationReport)||path.basename(validationReport)!=='application-evidence.json'))throw Error('Validation report requires an absolute path ending application-evidence.json');
const localRoot = validationReport ? path.join(path.dirname(validationReport),'app-data') :
  process.platform === "win32"
    ? path.join(
        process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
        "PrivateAI2",
      )
    : path.join(os.homedir(), ".privateai2");
app.setPath("userData", localRoot);
app.setPath("sessionData", path.join(localRoot, "session"));
const pipe =
  process.platform === "win32"
    ? "\\\\.\\pipe\\PrivateAI-" +
      crypto
        .createHash("sha256")
        .update(localRoot.toLowerCase())
        .digest("hex")
        .slice(0, 24)
    : path.join(localRoot, "privateai.sock");
let core,
  win,
  tray,
  bridge,
  timer,
  quitting = false,
  maintenance = Date.now(),
  nativeLink;
const desktopTemporary = new Set();
const uiURL = pathToFileURL(path.join(__dirname, "ui", "index.html")).href;
function systemExe(name) {
  return path.join(process.env.SystemRoot || "C:\\Windows", "System32", name);
}
function protectFolder() {
  fs.mkdirSync(localRoot, { recursive: true });
  if (process.platform !== "win32") throw fail("ENCRYPTION");
  try {
    startupStage = "identity";
    const out = execFileSync(
      systemExe("whoami.exe"),
      ["/user", "/fo", "csv", "/nh"],
      { windowsHide: true, encoding: "utf8" },
    );
    const sid = out.match(/S-1-5-(?:\d+-)*\d+/)?.[0];
    if (!sid) throw Error();
    startupStage = "permissions";
    protectPrivateFolder(localRoot,sid);
    return sid;
  } catch (e) {
    throw Object.assign(fail("STORAGE"), { cause: e });
  }
}
function loadCipher(create) {
  return loadVault(localRoot, safeStorage, create);
}
function emit(event) {
  if (event.type === 'locked') { if(!browserWorker?.canContinueLocked?.())browserWorker?.close(); companion?.invalidateInvites(); }
  if(event.type==='job_finished')messaging?.jobFinished(event.jobId).catch(()=>{});
  if (win && !win.isDestroyed()) win.webContents.send("privateai:event", event);
  bridge?.broadcast(event);
}
function showWindow() {
  if (!core) return;
  if (win && !win.isDestroyed()) {
    if(rendererNeedsReload){rendererNeedsReload=false;win.loadURL(uiURL);}
    win.show();
    win.focus();
    return;
  }
  win = new BrowserWindow({
    show: !validationReport,
    width: 1180,
    height: 800,
    minWidth: 780,
    minHeight: 600,
    title: "Private AI",
    backgroundColor: "#f7f8fa",
    icon: path.join(__dirname, "ui", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: !app.isPackaged,
      partition: "privateai-memory",
    },
  });
  win.setMenuBarVisibility(false);
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on('render-process-gone',()=>{
    core.stability.incident('renderer-gone');core.stability.pause();
    for(const [id,c] of core.requests)if(!core.store.get('job',id))c.abort();
    core.temporary.clear();desktopTemporary.clear();
    rendererNeedsReload=true;
    if(rendererRecoveries++===0&&!quitting){rendererNeedsReload=false;win.loadURL(uiURL);}
  });
  win.on('unresponsive',()=>{core.stability.incident('renderer-hung');core.stability.pause();});
  win.loadURL(uiURL);
  win.on("close", (event) => {
    for (const id of desktopTemporary) core.endTemporary(id);
    desktopTemporary.clear();
    if (!quitting && (core.settings().workerEnabled||messaging?.settings().enabled)) {
      event.preventDefault();
      win.hide();
    }
  });
  win.on("closed", () => {
    win = null;
  });
}
function requireUI(event) {
  if (
    !event.senderFrame ||
    event.senderFrame.url !== uiURL ||
    event.senderFrame !== event.sender.mainFrame ||
    !win ||
    event.sender !== win.webContents
  )
    throw fail("POLICY");
}
function createTray() {
  tray = new Tray(
    nativeImage.createFromPath(path.join(__dirname, "ui", "icon.png")),
  );
  tray.setToolTip("Private AI");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Private AI", click: showWindow },
      {
        label: "Pause background jobs",
        click: () => {
          core.store.put("settings","main",{...core.settings(),workerPaused:true});
          core.store.audit("settings");
          emit({ type: "jobs_changed" });
        },
      },
      {
        label: "Quit Private AI",
        click: () => {
          app.quit();
        },
      },
    ]),
  );
  tray.on("double-click", showWindow);
}
function resources(name) {
  return app.isPackaged
    ? path.join(process.resourcesPath, name)
    : path.join(__dirname, "..", name);
}
function registerChrome() {
  core.assertUnlocked();
  if (!app.isPackaged) throw fail("SETUP");
  try {
    for(const host of browserHosts.manifests(localRoot,process.execPath)){
      atomicWrite(host.file,JSON.stringify(host.value,null,2));
      for(const key of host.keys)execFileSync(systemExe('reg.exe'),['add',key,'/ve','/t','REG_SZ','/d',host.file,'/f'],{windowsHide:true,stdio:'ignore'});
    }
    execFileSync(
      systemExe("reg.exe"),
      [
        "add",
        "HKCU\\Software\\PrivateAI",
        "/v",
        "RegisteredExecutable",
        "/t",
        "REG_SZ",
        "/d",
        process.execPath,
        "/f",
      ],
      { windowsHide: true, stdio: "ignore" },
    );
  } catch {
    throw fail("POLICY");
  }
  core.store.audit("chrome_connected");
  shell.openPath(resources("chrome_extension"));
  return { id: extension.id };
}
function knownOutput(relative) {
  const root = core.settings().workspace;
  if (!root) throw fail("WORKSPACE");
  const p = safePath(root, relative);
  if (!/\.(docx|pdf|xlsx|csv|txt|md)$/i.test(p)) throw fail("FILE");
  const known =
    core.store.list("output").some((o) => o.relative === relative) ||
    core.store.list("job").some((j) => j.output === relative);
  if (!known) throw fail("POLICY");
  return p;
}
const NATIVE_ALLOWED = new Set([
  "ping",
  "summary",
  "createChat",
  "chat",
  "send",
  "stop",
  "renameChat",
  "deleteChat",
  "endTemporary",
  "saveTemporary",
  "exportChat",
  "openDesktop",
  "liveSession",
]);
function compactChat(c) {
  const messages = [];
  let size = 0,
    historyLimited = c.messages.length > 30;
  for (const m of c.messages.slice(-30).reverse()) {
    const item = {
      role: m.role,
      text: m.text.slice(0, 22000),
      error: m.error,
      usage: m.usage,
      incomplete: m.incomplete,
    };
    if (item.text.length < m.text.length) historyLimited = true;
    const n = Buffer.byteLength(JSON.stringify(item));
    if (size + n > 350000) {
      historyLimited = true;
      break;
    }
    size += n;
    messages.unshift(item);
  }
  return {
    id: c.id,
    title: c.title,
    hipaa: c.hipaa,
    temporary: c.temporary,
    messages,
    historyLimited,
  };
}
async function confirmWrite(message, detail, maximum=4000) {
  core.assertUnlocked();
  if(maximum!==4000&&String(detail).length>maximum)throw fail('LIMIT');
  const result = await dialog.showMessageBox(win, {
    type: "warning",
    title: "Review this write",
    message,
    detail: String(detail).slice(0, maximum),
    buttons: ["Cancel", "Confirm write"],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });
  core.assertUnlocked();
  if (result.response !== 1) throw fail("CANCELLED");
}
async function dispatch(
  op,
  data = {},
  stream = () => {},
  native = false,
  context,
) {
  if (
    typeof op !== "string" ||
    !data ||
    typeof data !== "object" ||
    Array.isArray(data)
  )
    throw fail("INVALID");
  if (native && !NATIVE_ALLOWED.has(op)) throw fail("POLICY");
  if (op === "openDesktop") {
    showWindow();
    return true;
  }
  if (op === "unlock") {
    if (native) throw fail("POLICY");
    if (core.store.get("secret", "applock")) {
      const hash = core.store.get("secret", "applock");
      const pass = crypto.scryptSync(
        require("./security.cjs").text(data.passphrase || "", 200),
        hash.salt,
        32,
      );
      if (!crypto.timingSafeEqual(pass, Buffer.from(hash.hash, "hex")))
        throw fail("UNLOCK");
    } else if (core.locked) throw fail("LOCKED");
    return core.unlock();
  }
  core.assertUnlocked();
  if (op !== "summary") core.touch();
  if (op === "assistantDraftRetry") return require("./assistant-drafts.cjs").retry(core,data);
  if (op.startsWith("speech")) return require("./local-speech.cjs").dispatch(core,op,data);
  if (op.startsWith("voiceTranscript")) return require("./voice-history.cjs").dispatch(core,op,data);
  if (op.startsWith("snf")) return require("./snf/index.cjs").dispatch(core,op,data);
  if (op.startsWith("workflow")) return require("./workflows/index.cjs").dispatch(core,op,data);
  if (op.startsWith("capture")) return require("./capture-workflows.cjs").dispatch(core,op,data);
  if (/^(operations|meeting|sbar|speaker|audio)/.test(op)) return require("./operations-copilot.cjs").dispatch(core,op,data);
  if (op.startsWith("exec")) return require("./executive-desk-engine.cjs").dispatch(core,op,data);
  if (/^(regulatory|staffing)/.test(op)) return require("./operations-analytics-engine.cjs").dispatch(core,op,data);
  if (op.startsWith("assistant")) return require("./executive-assistant-engine.cjs").dispatch(core,op,data);
  switch (op) {
    case "userGuide": return require('./app-guide.cjs').guide;
    case "discardRecovery": return core.discardRecovery(data.id);
    case "saveDraft": return core.saveDraft(data.id,data.text);
    case "healthAcknowledge": core.stability.acknowledge();return true;
    case "resumeJob": {
      const j=core.store.get('job',data.id);
      if(!j||!j.recoveryInput||j.status!=='failed')throw fail('RECOVERY');
      await confirmWrite('Resume this interrupted report?', 'The original saved inputs, extraction, and answers will be reused; source files are not refreshed. If an answer was requested but not saved, resuming may repeat an API request and incur another charge. Existing output is checked before publication. Background work must be resumed first.');
      return core.resumeJob(data.id);
    }
    case "messagingStatus": return {...messaging.status(),code:messaging.code(),windows:core.store.get("messaging","windows")||{}};
    case "messagingSave": return messaging.save(data);
    case "messagingDisable": return messaging.save({enabled:false});
    case "messagingOpenWeb": await messaging.adapters.web.open(); return true;
    case "messagingPair": return messaging.pair(data.adapter,data.groupId);
    case "messagingConversations": return messaging.list(data.adapter);
    case "messagingOutbox": return messaging.outbox();
    case "messagingApprove": return messaging.approve(data.id);
    case "messagingReadings": return messaging.readings();
    case "messagingClearReadings": messaging.clearReadings();return true;
    case "messagingWindows": {
      access.require("app",data.appId,"read");
      if(!Number.isSafeInteger(data.pid)||data.pid<=0)throw fail("INVALID");
      core.store.put("messaging","windows",{appId:data.appId,pid:data.pid});return true;
    }
    case "browserRecipes": return core.browserReports.list();
    case "browserGrant": {
      if(data.enabled===false)return core.browserReports.grant(data.id,null,false);
      const plan=core.browserReports.plan(data.id);
      await confirmWrite('Allow this tested report workflow to run unattended?',
        (data.allowLocked===true?'ALLOW LOCKED RETRIEVAL: this exact headless report may run while Windows or Private AI is locked. General chat, phone and AI analysis remain locked.\n':'Runs require Private AI unlocked.\n')+'Only report retrieval is authorized. MFA, verification or errors stop the run. Changed workflows or credentials require a new test and approval. No email/WhatsApp sending permission.\n\nReport: '+plan.recipe.name+'\nWebsite: '+plan.recipe.url+'\nBrowser: '+plan.recipe.browser+'\nWorkflow hash: '+plan.hash+'\n\nProtected automatic sign-in configuration:\n'+JSON.stringify(plan.recipe.autoLogin||null,null,2)+'\n\nReport steps:\n'+JSON.stringify(plan.recipe.steps,null,2),32768);
      if(core.browserReports.plan(data.id).credentialRevision!==plan.credentialRevision)throw fail('REVIEW_CHANGED');
      return core.browserReports.grant(data.id,plan.hash,true,data.allowLocked===true);
    }
    case "browserSchedule": return core.browserReports.save(data);
    case "browserSave": {if(browserWorker.busy||browserWorker.opening)throw fail('BUSY');const r=validateRecipe(data),old=core.store.get('browserRecipe',r.id);if(old&&require('./browser-reports.cjs').digest(old)!==require('./browser-reports.cjs').digest(r))core.browserCredentials.invalidate(r.id);core.store.put("browserRecipe",r.id,r);return r;}
    case "browserCredentialSave": {
      if(browserWorker.busy||browserWorker.opening)throw fail('BUSY');
      const r=core.browserReports.recipe(data.id),hash=require('./browser-reports.cjs').digest(r);
      if(!r.autoLogin)throw fail('INVALID');
      await confirmWrite('Save protected sign-in for this report?',r.name+'\n\n'+JSON.stringify(r.autoLogin,null,2)+'\n\nThe username and password will be encrypted for this Windows account in a separate private file. Website code at these approved destinations receives them during sign-in. This does not protect against malware running as you. No routine vault unlock is required. Saving revokes prior tests and unattended approval. Test the actual sign-in, then approve this workflow again.',32768);
      if(browserWorker.busy||browserWorker.opening)throw fail('BUSY');
      if(require('./browser-reports.cjs').digest(core.browserReports.recipe(data.id))!==hash)throw fail('REVIEW_CHANGED');
      return core.browserCredentials.save(r,data);
    }
    case "browserCredentialDelete": await browserWorker.close();return core.browserCredentials.remove(data.id);
    case "browserDelete": await browserWorker.close();if(core.store.get('browserCredential',data.id))core.browserCredentials.remove(data.id);core.browserCredentials.invalidate(data.id);core.store.delete('browserIssue',data.id);core.store.delete("browserRecipe",data.id);return true;
    case "browserOpen": {const r=validateBrowserTarget(data);await browserWorker.open(r.url,r.origins,false,r.browser);return true;}
    case "browserClose": await browserWorker.close();return true;
    case "browserRun": {const r=core.store.get("browserRecipe",data.id);if(!r)throw fail("INVALID");if(data.walkthrough===true)await confirmWrite('Walk through this report?', 'The visible report browser can remain open at a failed step so you can help. Close it when finished. Passwords, screenshots, page content and session URLs are not saved in the issue report. This does not authorize unattended access.');return browserWorker.run(r,{walkthrough:data.walkthrough===true,testSignin:data.testSignin===true});}
    case "localStatus": return {brain:core.router.local.status(),download:modelManager.status(),routing:core.router.tierStatus||{phase:'idle',tier:null}};
    case "localUnload": core.router.local.stop(); return true;
    case "localLoad": {
      core.stability.assertModel();
      const s=core.settings(),catalog=modelManager.catalog(s);let row;
      const { getRAMProfile } = require('./ram-profile.cjs');
      const ram = getRAMProfile();
      const dynCap = TIERS.findIndex(x=>x.tier===ram.tierCap);
      const userCap = s.localMaxTier&&s.localMaxTier!=='auto'?TIERS.findIndex(x=>x.tier===s.localMaxTier):-1;
      const cap = userCap>=0?Math.min(userCap,dynCap):dynCap;
      if(s.localTier==='auto')row=catalog.find(t=>t.installed&&TIERS.findIndex(x=>x.tier===t.tier)<=cap);
      else if(s.localTier!=='selected'){row=catalog.find(t=>t.tier===s.localTier&&t.installed);if(!row)throw fail('LOCAL_FILE_MISSING');}
      const selected=row?{...s,localModelPath:row.file}:s;
      await core.resources.task('foreground',()=>core.resources.withAI(async effective=>{if(row)await modelManager.verifyTier(row.tier,s);return core.router.local.load(effective).catch(e=>{if(/^LOCAL_ENGINE/.test(e.code||''))core.stability.modelFailure();throw e;});},{localSettings:selected,allowContextReduction:s.localTier==='auto'}));return core.router.local.status();
    }
    case "chooseLocalModel": {
      if(data.tier!==undefined&&!TIERS.some(t=>t.tier===data.tier))throw fail('INVALID');
      const choice=await dialog.showOpenDialog(win,{properties:["openFile"],filters:[{name:"GGUF model",extensions:["gguf"]}]});
      if(choice.canceled)return null;
      if(data.tier){const field=data.tier+'ModelPath';await modelManager.verifyTier(data.tier,{...core.settings(),[field]:choice.filePaths[0]});return core.saveSettings({[field]:choice.filePaths[0]});}
      if(core.router.local.busy||core.router.local.loadPending)throw fail('BUSY');core.router.local.stop();return core.saveSettings({localModelPath:choice.filePaths[0],localTier:'selected'});
    }
    case "downloadModel": {
      const modelId=data.modelId||'qwen3-4b';if(!MODELS.some(m=>m.id===modelId))throw fail('INVALID');
      if(core.router.local.busy||modelManager.controller)throw fail('BUSY');
      if(modelId==='llama32-3b'){
        const choice=await dialog.showMessageBox(win,{type:'info',title:'Llama 3.2 model license',message:'Use Llama 3.2 under Meta’s Community License and Acceptable Use Policy.',detail:'Built with Llama. This optional download uses a third-party GGUF conversion by bartowski. Read the included terms before accepting. Qwen remains available.',buttons:['Read terms','Accept and continue','Cancel'],defaultId:2,cancelId:2,noLink:true});
        if(choice.response===0)await shell.openPath(resources('docs/LLAMA_TERMS.html'));
        if(choice.response!==1)return {cancelled:true};
      }
      modelManager.download(modelId).then(modelPath=>{const tier=TIERS.find(t=>t.id===modelId).tier;core.saveSettings({[tier+'ModelPath']:modelPath});emit({type:"model-download",state:"selected"});}).catch(e=>emit({type:"model-download",state:"failed",error:safeError(e)}));return modelManager.status();
    }
    case "cancelModelDownload": modelManager.cancel(); return true;
    case "integrationSave": return core.integrations.configure(data.id, data.settings);
    case "companionStatus": return companion.status();
    case "companionSave": return companion.configure(data);
    case "companionPair": return companion.pair(data);
    case "companionInvite": return companion.invite(data);
    case "companionInviteCancel": return companion.cancelInvite(data.id);
    case "companionInviteStatus": return companion.inviteStatus(data.id);
    case "companionRevoke": return companion.revoke(data.id);
    case "companionGrant": return companion.grant(data);
    case "usageSummary": return core.router.meter.summary();
    case "ping":
      return { ok: true };
    case "summary": {
      const s = core.summary();
      if (native)
        return {
          settings: { hipaa: s.settings.hipaa, model: s.settings.model,processingMode:s.settings.processingMode },
          chats: s.chats.slice(0, 60),
        };
      return { ...s, companion: companion.status(), autostart: app.getLoginItemSettings().openAtLogin };
    }
    case "createChat": {
      const c = core.createChat(data);
      if (c.temporary)
        (native ? context.temporaryChats : desktopTemporary).add(c.id);
      return c;
    }
    case "chat":
      return native ? compactChat(core.chat(data.id)) : core.chat(data.id);
    case "archiveChat": return core.archiveChat(data.id,data.archived);
    case "renameChat": {
      const c = core.renameChat(data.id, data.title);
      return native ? compactChat(c) : c;
    }
    case "deleteChat":
      return core.deleteChat(data.id);
    case "endTemporary":
      return core.endTemporary(data.id);
    case "saveTemporary": {
      const c = core.saveTemporary(data.id);
      return native ? compactChat(c) : c;
    }
    case "send": {
      const result = await core.send(data, (delta) =>
        stream({ type: "delta", chatId: data.chatId, delta }),
      );
      if(!native&&(!win||!win.isFocused())){
        const last=result.chat.messages.at(-1);if(last?.role==="assistant"&&!last.error)messaging?.desktopResult(last.text,["default","never","send"].includes(data.forwardMessaging)?data.forwardMessaging:"default");
      }
      core.assertUnlocked();
      if (native) result.chat = compactChat(result.chat);
      return result;
    }
    case "stop":
      return core.stop(data.id);
    case "liveSession":
      return await core.createLiveSession(data);
    case "exportChat": {
      let index = data.index ?? null;
      if (native) {
        const messages = core.chat(data.id).messages;
        index = messages.findLastIndex((m) => m.role === "assistant");
        if (index < 0) throw fail("INVALID");
      }
      const out = await core.exportChat(data.id, data.format, index);
      return native ? { name: out.name } : out;
    }
    case "copy":
      clipboard.writeText(require("./security.cjs").text(data.text, 2000000));
      return true;
    case "activity":
      return true;
    case "accessHealth":
      return access.helper({ op: "health" });
    case "appChoices":
      return access.choicesForApps();
    case "grantRunningApp":
      return access.grantRunningApp(data.choiceId, data.read, data.write);
    case "appPermissions":
      return access.updateApp(data.id, data.read, data.write);
    case "appWindows":
      return access.appAction(data.id, "windows");
    case "readApp":
      return access.appAction(data.id, "ui.read", data);
    case "appFields":
      return access.appAction(data.id, "ui.fields", data);
    case "writeAppDraft": {
      const grant = access.require("app", data.id, "write");
      await confirmWrite(
        "Replace the selected editable field in " + grant.name + "?",
        "This writes text only. Private AI does not press Send. Review the selected field in the program.\n\n" +
          data.text,
      );
      return access.appAction(data.id, "ui.writeDraft", data);
    }
    case "outlookPermissions":
      return access.setOutlook(data);
    case "outlookMessages":
      return access.outlook("outlook.messages");
    case "outlookMessage":
      return access.outlook("outlook.message", {
        id: data.id,
        storeId: data.storeId,
      });
    case "outlookCalendar":
      return access.outlook("outlook.calendar", {
        start: data.start,
        end: data.end,
      });
    case "outlookDraft":
      await confirmWrite(
        "Save a draft in Outlook?",
        "No message will be sent.\nTo: " +
          data.to +
          "\nSubject: " +
          data.subject +
          "\n\n" +
          data.body,
      );
      return access.outlook("outlook.draft", {
        to: data.to,
        subject: data.subject,
        body: data.body,
      });
    case "outlookAppointment":
      await confirmWrite(
        "Create this Outlook appointment?",
        "No invitations will be sent. Times use this PC's local timezone.\n" +
          data.subject +
          "\n" +
          data.start +
          " — " +
          data.end +
          "\n" +
          data.location +
          "\n\n" +
          data.body,
      );
      return access.outlook("outlook.appointment", {
        subject: data.subject,
        start: data.start,
        end: data.end,
        location: data.location,
        body: data.body,
      });
    case "outlookDelete":
      await confirmWrite(
        "Delete this Outlook message?",
        "User approval required.\n\n" +
          "Subject: " + (data.subject || "(No subject)") + "\n" +
          "From: " + (data.sender || "Unknown") + "\n" +
          "Received: " + (data.received || "") + "\n\n" +
          "This message will be moved to Deleted Items in Outlook.",
      );
      return access.outlook("outlook.delete", {
        id: data.id,
        storeId: data.storeId,
      });
    case "outlookCleanup": {
      const count = Array.isArray(data.items) ? data.items.length : 0;
      await confirmWrite(
        `Clean up and delete ${count} Outlook message(s)?`,
        "User approval required.\n\n" +
          "Review matching messages to clean up:\n" +
          (data.items || []).slice(0, 5).map(m => `• ${m.subject || '(No subject)'} — ${m.sender || ''}`).join("\n") +
          (count > 5 ? `\n...and ${count - 5} more items.` : "") +
          "\n\nAll selected items will be moved to Deleted Items in Outlook.",
      );
      return access.outlook("outlook.cleanup", {
        messageIds: (data.items || []).map(m => ({ id: m.id, storeId: m.storeId })),
      });
    }
    case "grantFolder": {
      const result = await dialog.showOpenDialog(win, {
        title: "Choose a folder to allow",
        properties: ["openDirectory", "createDirectory"],
      });
      return result.canceled
        ? null
        : access.grantFolder(result.filePaths[0], data.read, data.write);
    }
    case "folderPermissions":
      return access.updateFolder(data.id, data.read, data.write);
    case "folderList":
      return access.listFolder(data.id, data.relative || "");
    case "folderImport":
      return access.importFolderFile(data.id, data.relative, data.chatId);
    case "folderReadText":
      return access.readText(data.id, data.relative);
    case "folderWriteText": {
      const { file } = access.folderPath(data.id, data.relative, "write");
      await confirmWrite("Save this text file?", file + "\n\n" + data.text);
      return access.writeText(
        data.id,
        data.relative,
        data.text,
        data.version ?? null,
      );
    }
    case "folderExport":
      return access.exportToFolder(
        data.id,
        data.chatId,
        data.index,
        data.format,
      );
    case "importReference":
      return access.importReference(data.name, data.text);
    case "addApp": {
      const result = await dialog.showOpenDialog(win, {
        title: "Choose a program you want Private AI to open",
        properties: ["openFile"],
        filters: [{ name: "Windows programs", extensions: ["exe"] }],
      });
      return result.canceled ? null : registerApp(core, result.filePaths[0]);
    }
    case "openApp":
      await core.resources.preflight('desktop');
      return openApp(core, data.id);
    case "publishWorker":
      core.worker.publish();
      return true;
    case "settings":
      return core.saveSettings(data);
    case "saveKey":
      return core.saveKey(data.key, data.provider);
    case "deleteKey":
      return core.deleteKey(data.provider);
    case "models":
      return core.models(data?.provider);
    case "testConnection":
      return core.testConnection(data?.provider);
    case "chooseWorkspace": {
      const r = await dialog.showOpenDialog(win, {
        title: "Choose your Private AI work folder",
        properties: ["openDirectory", "createDirectory"],
      });
      if (r.canceled) return null;
      return core.saveSettings({ workspace: r.filePaths[0] }).workspace;
    }
    case "openWorkspace": {
      if (!core.settings().workspace) throw fail("WORKSPACE");
      return shell.openPath(core.settings().workspace);
    }
    case "openOutput":
      return shell.openPath(knownOutput(data.relative));
    case "pickFiles": {
      const r = await dialog.showOpenDialog(win, {
        title: "Attach files",
        properties: ["openFile", "multiSelections"],
        filters: [
          {
            name: "Documents and images",
            extensions: [
              "eml",
              "msg",
              "ics",
              "pdf",
              "docx",
              "xlsx",
              "csv",
              "txt",
              "md",
              "png",
              "jpg",
              "jpeg",
              "webp",
            ],
          },
        ],
      });
      if (r.canceled) return [];
      if (r.filePaths.length > 6) throw fail("LIMIT");
      const results = [];
      for (const file of r.filePaths)
        results.push(
          await core.importFile(file, data.temporaryChat, data.chatId || null),
        );
      return results;
    }
    case "memorySave":
      return core.remember(data);
    case "projectSave":
      return core.projectSave(data);
    case "agentSave":
      return core.saveAgent(data);
    case "scheduleDuplicate": return core.duplicateSchedule(data.id);
    case "scheduleSave":
      return core.saveSchedule(data);
    case "todoSave":
      return core.saveTodo(data);
    case "todoToggle":
      return core.toggleTodoStatus(data.id);
    case "todoCheckReminders":
      return core.checkReminders();
    case "deleteItem":
      if (
        ![
          "memory",
          "file",
          "project",
          "agent",
          "schedule",
          "app",
          "folder",
          "todo",
        ].includes(data.kind) ||
        !require("./security.cjs").isId(data.id)
      )
        throw fail("INVALID");
      if(data.kind==="file")core.purgeRecoveryForFile(data.id);
      core.store.delete(data.kind, data.id);
      core.purgeBackups();
      return true;
    case "runJob":
      return core.submitJob(data);
    case "retryExport":
      return core.retryExport(data.id, data.format || "docx");
    case "trustPeer":
      return core.worker.trust(data.id, data.fingerprint);
    case "revokePeer":
      core.store.delete("peer", data.id);
      core.store.audit("peer_revoked");
      return true;
    case "workerName": {
      const i = core.identity();
      i.label = require("./security.cjs").text(data.name, 80);
      core.store.put("identity", "self", i);
      core.worker.publish();
      return true;
    }
    case "cleanup":
      return core.cleanup();
    case "registerChrome":
      return registerChrome();
    case "disconnectChrome":
      for(const key of browserHosts.keys)try{execFileSync(systemExe('reg.exe'),['delete',key,'/f'],{windowsHide:true,stdio:'ignore'});}catch{}
      return true;
    case "autostart":
      if (!app.isPackaged) throw fail("SETUP");
      app.setLoginItemSettings({
        openAtLogin: data.enabled === true,
        path: process.execPath,
        args: ["--background"],
      });
      return app.getLoginItemSettings().openAtLogin;
    case "lock":
      if (!core.store.get("secret", "applock")) throw fail("SETUP");
      core.lock();
      return true;
    case "setPassphrase": {
      const pass = require("./security.cjs").text(data.passphrase, 200);
      if (pass.length < 8) throw fail("INVALID");
      const salt = crypto.randomBytes(16).toString("hex"),
        hash = crypto.scryptSync(pass, salt, 32).toString("hex");
      core.store.put("secret", "applock", { salt, hash });
      return true;
    }
    case "diagnostics": {
      const report = JSON.stringify(core.diagnostics(), null, 2);
      const r = await dialog.showSaveDialog(win, {
        title: "Save diagnostic report",
        defaultPath: "PrivateAI-Diagnostics.json",
        filters: [{ name: "Diagnostic report", extensions: ["json"] }],
      });
      if (r.canceled) return null;
      atomicWrite(r.filePath, report);
      return { saved: true };
    }
    case "selfCheck":
      return localChecks(core, {
        safeStorage,
        pipe,
        verifyPermissions: () => verifyPrivateAcl(localRoot, userSid),
        helperHealth: () => access.helper({ op: "health" }),
      });
    case "backup": {
      const folder = path.join(localRoot, "backups");
      fs.mkdirSync(folder, { recursive: true });
      const file = path.join(folder, "privateai-" + Date.now() + ".db");
      core.store.backup(file);
      const names = fs
        .readdirSync(folder)
        .filter((n) => /^privateai-\d+\.db$/.test(n))
        .sort()
        .reverse();
      let deferred = 0;
      for (const name of names.slice(2))
        try {
          fs.unlinkSync(path.join(folder, name));
        } catch {
          deferred++;
        }
      core.store.put("maintenance", "backupCleanup", { deferred });
      shell.openPath(folder);
      return true;
    }
    case "openLink": {
      let url;
      try {
        url = new URL(data.url);
      } catch {
        throw fail("INVALID");
      }
      if (url.protocol !== "https:" || url.username || url.password)
        throw fail("POLICY");
      await shell.openExternal(url.href);
      return true;
    }
    default:
      throw fail("INVALID");
  }
}
async function nativeHost() {
  if (!browserHosts.allowedInvocation(process.argv,localRoot)) {
    app.exit(1);
    return;
  }
  if (!fs.existsSync(path.join(localRoot, "vault.dpapi"))) {
    spawn(process.execPath, ["--show"], {
      detached: true,
      stdio: "ignore",
    }).unref();
    app.exit(1);
    return;
  }
  const cipher = loadCipher(false);
  let link;
  try {
    link = await connectBridge(pipe, cipher, (message) =>
      process.stdout.write(encodeFrame(message)),
    );
  } catch {
    spawn(process.execPath, ["--background"], {
      detached: true,
      stdio: "ignore",
    }).unref();
    for (let i = 0; i < 30 && !link; i++) {
      await new Promise((r) => setTimeout(r, 300));
      try {
        link = await connectBridge(pipe, cipher, (message) =>
          process.stdout.write(encodeFrame(message)),
        );
      } catch {}
    }
  }
  if (!link) {
    app.exit(1);
    return;
  }
  nativeLink = link;
  const reader = new FrameReader(
    (message) => link.send(message),
    () => app.exit(1),
  );
  process.stdin.on("data", (c) => reader.push(c));
  process.stdin.on("end", () => app.exit(0));
  process.stdin.resume();
}
if (!isNative && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app
    .whenReady()
    .then(async () => {
      if (isNative) return nativeHost();
      const sid = protectFolder();
      userSid = sid;
      startupStage = "permission_check";
      verifyPrivateAcl(localRoot, sid);
      startupStage = "vault";
      const cipher = loadCipher(true);
      startupStage = "services";
      session
        .fromPartition("privateai-memory")
        .setPermissionRequestHandler((_wc, _p, callback) => callback(false));
      session
        .fromPartition("privateai-memory")
        .setPermissionCheckHandler(() => false);
      session
        .fromPartition("privateai-memory")
        .webRequest.onBeforeRequest(
          { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
          (_d, cb) => cb({ cancel: true }),
        );
      const apiSession = session.fromPartition("privateai-api-memory", {
        cache: false,
      });
      const client = new (require("./api.cjs").OpenAIClient)((url, options) => {
        const policy=require('./providers.cjs');
        const settings=core?.settings()||{provider:'openai'};
        const target=new URL(url), expected=new URL(policy.endpointFor(settings.provider||'openai',settings));
        if(target.origin!==expected.origin||target.username||target.password)throw fail('POLICY');
        if(!['local','ollama'].includes(settings.provider)&&!cloudAllowed(settings))throw fail('LOCAL_ONLY');
        return apiSession.fetch(url, {
          ...options,
          cache: "no-store",
          credentials: "omit",
        });
      });
      startupStage = "database";
      core = new Core({
        store: new Store(path.join(localRoot, "privateai.db"), cipher),
        root: localRoot,
        client,
        emit,
        machine: crypto
          .createHash("sha256")
          .update(os.hostname() + "|" + sid)
          .digest("hex"),
      });
      startupStage = "services";
      core.resources.approve=async detail=>{
        // Never bring an unattended primary-PC window forward to ask permission.
        if(!win||win.isDestroyed()||!win.isVisible()||!win.isFocused()||core.locked)return false;
        const result=await dialog.showMessageBox(win,{type:'warning',title:'Possible interruption to your PC work',message:'Review before running this automation',detail:detail+'\n\nDefer leaves the action unexecuted. Run it manually later when it will not interrupt your work. Approval is for this invocation only.',buttons:['Defer safely','Run now — I approve','Cancel'],defaultId:0,cancelId:2,noLink:true});
        return result.response===1&&!core.locked;
      };
      access = new AccessManager(core, (data) =>
        helperCall(
          path.join(
            app.isPackaged
              ? resources("desktop-helper")
              : resources("build/desktop-helper"),
            "PrivateAI.Access.exe",
          ),
          data,
        ),
      );
      core.router.local=new LocalBrain({runtime:path.join(resources(app.isPackaged?"local-runtime":"build/local-runtime"),"llama-server.exe"),settings:()=>core.settings(),emit});
      modelManager=new ModelManager({directory:path.join(process.env.LOCALAPPDATA||os.homedir(),"PrivateAIModels"),fetcher:(url,opts)=>session.fromPartition("privateai-download-memory",{cache:false}).fetch(url,opts),emit});
      core.modelManager=modelManager;
      browserWorker=new BrowserWorker(core);
      core.browserCredentials=new (require('./browser-credentials.cjs').BrowserCredentials)(core,{safeStorage,verifyProtection:()=>verifyPrivateAcl(localRoot,sid),platform:process.platform});
      core.browserReports=new (require("./browser-reports.cjs").BrowserReports)(core,browserWorker);
      core.localTools=createTools(core,access,browserWorker);
      messaging=new MessagingBridge(core);
      messaging.adapters.web=new WhatsAppWeb(core);
      messaging.adapters.windows=new WhatsAppWindows(core,access);
      messaging.adapters.windows.webFallback=messaging.adapters.web;
      companion = new CompanionGateway(core);
      bridge = startBridge(
        pipe,
        cipher,
        (op, data, stream, context) =>
          dispatch(op, data, stream, true, context),
        (context) => {
          for (const id of context.temporaryChats) core.endTemporary(id);
        },
      );
      bridge.server.on("error", () => {
        dialog.showErrorBox(
          "Private AI",
          "The protected local connection could not start. Close other Private AI copies and reopen.",
        );
        app.quit();
      });
      ipcMain.handle("privateai:call", async (event, request) => {
        try {
          requireUI(event);
          if (!request || typeof request !== "object") throw fail("INVALID");
          return {
            ok: true,
            result: await dispatch(request.op, request.data, (event) =>
              emit(event),
            ),
          };
        } catch (e) {
          return { ok: false, error: safeError(e) };
        }
      });
      ipcMain.handle("privateai:drop", async (event, data) => {
        try {
          requireUI(event);
          core.assertUnlocked();
          if (
            !Array.isArray(data?.paths) ||
            !data.paths.length ||
            data.paths.length > 6 ||
            data.paths.some((p) => typeof p !== "string" || !path.isAbsolute(p))
          )
            throw fail("INVALID");
          const results = [];
          for (const file of data.paths)
            results.push(
              await core.importFile(
                file,
                data.temporary ? data.chatId : null,
                data.chatId,
              ),
            );
          return { ok: true, result: results };
        } catch (e) {
          return { ok: false, error: safeError(e) };
        }
      });
      createTray();
      if (core.store.get("secret", "applock")) core.locked = true;
      // Optional gateway failures stay in Settings; offline/keyless startup remains usable.
      companion.start().catch(() => {});
      timer = setInterval(() => {
        memorySampler.poll(core.router.local,(settings,bytes)=>{const row=modelManager.catalog(settings).find(t=>t.file===settings.localModelPath);if(row)core.stability.observePeak(row.tier,settings.localContext,bytes);}).catch(()=>{});
        core.worker.tick().catch(() => core.stability.incident("service-failed"));
        if (
          !core.locked &&
          core.store.get("secret", "applock") &&
          Date.now() - core.lastActivity > core.settings().lockMinutes * 60000
        )
          core.lock();
        if (Date.now() - maintenance > 3600000) {
          maintenance = Date.now();
          try {
            core.performCleanup();
          } catch {
            core.store.audit("request_failed");
          }
        }
      }, 15000);
      powerMonitor.on('suspend',()=>{core.stability.incident('sleep');core.stability.pause();for(const c of core.requests.values())c.abort();core.router.local.stop('sleep');});
      powerMonitor.on('resume',()=>{core.stability.incident('wake');core.stability.pause();emit({type:'jobs_changed'});});
      powerMonitor.on("lock-screen", () => core.lock());
      powerMonitor.on("unlock-screen", () => {
        if (!core.store.get("secret", "applock")) {
          core.unlock();
          emit({ type: "unlocked" });
        }
      });
      startupStage = "window";
      if (!process.argv.includes("--background")||validationReport) showWindow();
      if(validationReport){
        await require('./windows-validation.cjs').run({core,win,reportPath:validationReport,exe:process.execPath,asar:path.join(process.resourcesPath,'app.asar')});
        app.quit();
      }
    })
    .catch((e) => {
      if(validationReport){fs.mkdirSync(path.dirname(validationReport),{recursive:true});if(!fs.existsSync(validationReport))fs.writeFileSync(validationReport,JSON.stringify({platform:process.platform,windowsApplicationExecuted:true,passed:false,stage:startupStage,error:safeError(e),validationError:{message:e.message,stack:e.stack}},null,2));}
      if (!isNative&&!validationReport)
        dialog.showErrorBox(
          "Private AI could not start",
          startupMessage(e, startupStage),
        );
      app.exit(1);
    });
}
app.on("window-all-closed", () => {
  if (!quitting && !isNative && !core?.settings().workerEnabled && !messaging?.settings().enabled && !companion?.settings().enabled) app.quit();
});
app.on("before-quit", () => {
  if (quitting) return;
  quitting = true;
  if (timer) clearInterval(timer);
  bridge?.close();
  nativeLink?.close();
  modelManager?.cancel();
  messaging?.close();
  companion?.close();
  browserWorker?.close();
  try {
    core?.close();
  } catch {}
});
process.on("uncaughtException", () => {
  try{core?.stability.incident("service-failed");}catch{}
  if (!isNative)
    dialog.showErrorBox(
      "Private AI",
      "An unexpected problem occurred. Restart Private AI and review Diagnostics. Unfinished work may need recovery.",
    );
  app.exit(1);
});
process.on("unhandledRejection", () => {try{core?.stability.incident("promise-failed");core?.stability.pause();emit({type:"jobs_changed"});}catch{}});


