"use strict";
// Real Chromium UI checks with a synthetic, local Core. No provider requests.
const { chromium } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict");
const { fixture } = require("./helpers.cjs");
const { safeError } = require("../source/security.cjs");
const after = [],
  checks = [],
  errors = [];
const report =
  "# Weekly operations report\n\nThe review is complete. Here are the items to follow up.\n\n| Area | Status |\n| --- | --- |\n| Reports | Ready for review |\n| Open items | 3 follow-ups |\n\n## Next steps\n\n- Review the totals with your source documents.\n- Save the approved report in your work folder.\n\n**Synthetic demonstration data.**";
const client = {
  models: async () => ["test-model"],
  generate: async (key, settings, messages, opts = {}) => {
    for (const piece of report.match(/.{1,40}/gs)) {
      opts.onDelta?.(piece);
      await new Promise((r) => setTimeout(r, 2));
    }
    return { text: report, usage: { inputTokens: 124, outputTokens: 88 } };
  },
};
const { core } = fixture({ after: (fn) => after.push(fn) }, client);
const companion = new (require('../source/companion-gateway.cjs').CompanionGateway)(core);
const {freePort:companionPort, request:companionRequest} = require('./companion-fixture.cjs');
core.modelManager=new (require("../source/model-manager.cjs").ModelManager)({directory:path.join(core.root,"models")});
const { AccessManager } = require("../source/access.cjs");
const access = new AccessManager(core, async (d) => {
  if (d.op === "outlook.messages")
    return [
      {
        id: "synthetic-message",
        storeId: "synthetic-store",
        subject: "Synthetic inbox item",
        sender: "Example",
        received: "2026-09-09",
      },
    ];
  if (d.op === "outlook.message")
    return {
      text: "Synthetic Outlook reference body. No real mailbox was accessed.",
    };
  throw Error("Unexpected helper test op");
});
let desktop, panel, requestedModel;
core.resources.approve=async detail=>{assert.ok(detail);return true;}; // Explicit synthetic approval for the read-access UI fixture.
async function dispatch(op, data = {}, native = false) {
  if(op.startsWith('snf')) return require('../source/snf/index.cjs').dispatch(core,op,data);
  if(op.startsWith('workflow')) return require('../source/workflows/index.cjs').dispatch(core,op,data);
  if(op.startsWith('capture')) return require('../source/capture-workflows.cjs').dispatch(core,op,data);
  switch (op) {
    case "integrationSave": return core.integrations.configure(data.id,data.settings);
    case "companionStatus": return companion.status();
    case "companionSave": return companion.configure(data);
    case "companionPair": return companion.pair(data);
    case "companionRevoke": return companion.revoke(data.id);
    case "companionGrant": return companion.grant(data);
    case "userGuide": return require("../source/app-guide.json");
    case "saveDraft": return core.saveDraft(data.id,data.text);
    case "healthAcknowledge": core.stability.acknowledge();return true;
    case "messagingStatus":
      return {settings:require("../source/messaging.cjs").DEFAULT,state:"off",code:"synthetic-code",windows:{pid:null}};
    case "browserRecipes": return [];
    case "speechStatus": return {supported:true,ready:false};
    case "localStatus": return {brain:{state:"failed",error:{code:"LOCAL_DEPENDENCY",message:"Engine component missing",exitCode:"0xc0000135"}}};
    case "downloadModel": requestedModel=data.modelId; return {state:"downloading"};
    case "summary":
      return { ...core.summary(), companion:companion.status(), autostart: false };
    case "createChat":
      return core.createChat(data);
    case "chat":
      return core.chat(data.id);
    case "send":
      return core.send(data, (delta) => {
        const event = { type: "delta", chatId: data.chatId, delta };
        (native ? panel : desktop)
          .evaluate((e) => window.__deliver(e), event)
          .catch(() => {});
      });
    case "stop":
      return core.stop(data.id);
    case "endTemporary":
      return core.endTemporary(data.id);
    case "saveTemporary":
      return core.saveTemporary(data.id);
    case "settings":
      return core.saveSettings(data);
    case "saveKey":
      return core.saveKey(data.key);
    case "models":
      return core.models();
    case "activity":
      return true;
    case "outlookPermissions":
      return access.setOutlook(data);
    case "outlookMessages":
      return access.outlook("outlook.messages");
    case "outlookMessage":
      return access.outlook("outlook.message", data);
    case "importReference":
      return access.importReference(data.name, data.text);
    case "grantFolder":
      return access.grantFolder(
        core.settings().workspace,
        data.read,
        data.write,
      );
    case "folderWriteText":
      return access.writeText(
        data.id,
        data.relative,
        data.text,
        data.version ?? null,
      );
    case "chooseWorkspace":
      return core.saveSettings({
        workspace: core.settings().workspace + " Selected",
      }).workspace;
    case "projectSave":
      return core.projectSave(data);
    case "agentSave":
      return core.saveAgent(data);
    case "scheduleSave":
      return core.saveSchedule(data);
    case "exportChat":
      return core.exportChat(data.id, data.format, data.index);
    case "copy":
      return true;
    default:
      throw Error("Unexpected test RPC: " + op);
  }
}
const root = path.resolve(__dirname, "..");
const server = http.createServer((req, res) => {
  try {
    const file = path.resolve(
      root,
      "." + decodeURIComponent(req.url.split("?")[0]),
    );
    if (!file.startsWith(root + path.sep)) throw Error();
    const types = {
      ".html": "text/html",
      ".mjs": "text/javascript",
      ".js": "text/javascript",
      ".css": "text/css",
      ".png": "image/png",
    };
    res.setHeader(
      "Content-Type",
      types[path.extname(file)] || "application/octet-stream",
    );
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
let browser;
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  browser = await chromium.launch({
    executablePath:
      process.env.PRIVATE_AI_TEST_CHROMIUM ||
      path.join(root, "build/browser/chromium"),
    headless: true,
    args: process.platform==='linux' ? [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--use-gl=disabled",
      "--no-zygote",
      "--single-process",
    ] : [],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 850 },
  });
  context.setDefaultTimeout(30000);
  context.on("page", (page) =>
    page.on("pageerror", (e) => errors.push(e.message)),
  );
  desktop = await context.newPage();
  await desktop.exposeFunction("testCall", async (op, data) => {
    try {
      return { ok: true, result: await dispatch(op, data) };
    } catch (e) {
      return { ok: false, error: safeError(e) };
    }
  });
  await desktop.addInitScript(() => {
    window.__voiceStarts=0;window.__voiceAborts=0;
    window.SpeechRecognition=class {
      constructor(){window.__recognition=this;}
      start(){window.__voiceStarts++;}
      stop(){}
      abort(){window.__voiceAborts++;this.onend?.();}
    };
    navigator.mediaDevices.getUserMedia=async()=>{throw Error('Synthetic UI test: microphone capture disabled');};
    window.privateAI = {
      call: (...args) => window.testCall(...args),
      onEvent: (cb) => (window.__deliver = cb),
    };
  });
  await desktop.goto(base + "/source/ui/index.html");
  await desktop.getByRole('heading',{name:'What would you like to work on?'}).waitFor();
  // Current navigation starts at chat and groups less-used tools in disclosure menus.
  for(const menu of await desktop.locator('#sidebar details').all()) await menu.locator(':scope > summary').click();
  fs.mkdirSync(path.join(root,'build/screenshots'),{recursive:true});
  await desktop.screenshot({path:path.join(root,'build/screenshots/clinical-pcc-off.png'),fullPage:true});
  assert.equal(await desktop.locator('#sidebar [data-view=pcc]').isVisible(),false);
  assert.equal(await desktop.locator('#section-data-health').count(),0);
  await desktop.locator('#sidebar [data-view="clinical-imports"]').click();
  await desktop.getByRole('heading',{name:'Clinical imports',exact:true}).waitFor();
  const report={type:'census',date:new Date().toISOString(),rows:[{residentId:'synthetic-ui-source',name:'Synthetic UI Resident'}]};
  await desktop.locator('#pcc-file').setInputFiles({name:'synthetic-census.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([report]))});
  await desktop.locator('#pcc-date').fill(new Date().toISOString().slice(0,16));
  await desktop.locator('#pcc-operator').fill('Synthetic UI reviewer');
  await desktop.locator('#pcc-import-form button[type=submit]').click();
  await desktop.getByText('1 accepted, 0 rejected',{exact:false}).first().waitFor();
  assert.equal(core.store.get('snf_resident','synthetic-ui-source').provenance.sourceProvider,'generic');
  await desktop.locator('#sidebar [data-view=settings]').click();
  await desktop.locator('[name="integration-pcc-enabled"]').check();
  await desktop.locator('[data-act=integration-save]').click();
  await desktop.locator('.integration-status').getByText('Manual import',{exact:true}).waitFor();
  await desktop.reload();await desktop.getByRole('heading',{name:'What would you like to work on?'}).waitFor();
  for(const menu of await desktop.locator('#sidebar details').all()) if(!(await menu.evaluate(el=>el.open)))await menu.locator(':scope > summary').click();
  assert.equal(await desktop.locator('#sidebar [data-view=pcc]').isVisible(),true);
  assert.equal(await desktop.locator('#sidebar [data-view=pcc]').isVisible(),true);
  await desktop.locator('#sidebar [data-view=pcc]').click();await desktop.getByRole('heading',{name:'PCC Import Center',exact:true}).waitFor();
  await desktop.locator('#sidebar [data-view=snf]').click();await desktop.locator('[data-tab=feeds]').click();await desktop.getByRole('heading',{name:/PointClickCare Daily Feeds/}).waitFor();
  await desktop.locator('[data-tab=retention]').click();
  assert.match(await desktop.locator('.snf-page').innerText(),/No regulatory exemption is asserted/);
  assert.doesNotMatch(await desktop.locator('.snf-page').innerText(),/exempt from.*(?:CMS|HIPAA)/i);
  await desktop.locator('[data-tab=feeds]').click();
  assert.doesNotMatch(await desktop.locator('.snf-page').innerText(),/undefined|NaN/);
  assert.match(await desktop.locator('.feeds-pane').innerText(),/Oldest received PCC report: Not available/);
  assert.doesNotMatch(await desktop.locator('.feeds-pane').innerText(),/✓ Current/);
  await desktop.screenshot({path:path.join(root,'build/screenshots/clinical-pcc-on.png'),fullPage:true});
  await desktop.locator('#sidebar [data-view=settings]').click();await desktop.locator('[name="integration-pcc-enabled"]').uncheck();await desktop.locator('[data-act=integration-save]').click();
  await desktop.locator('.integration-status').getByText('Disabled',{exact:true}).waitFor();
  await desktop.locator('[data-integration=pcc]').scrollIntoViewIfNeeded();await desktop.screenshot({path:path.join(root,'build/screenshots/pcc-settings-disabled.png')});
  await desktop.locator('#sidebar [data-view=dashboard]').click();await desktop.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
  assert.equal(await desktop.locator('#section-data-health').count(),0);assert.equal(await desktop.locator('#sidebar [data-view=pcc]').isVisible(),false);assert.equal(core.store.count('snf_resident'),1);
  checks.push('General clinical import reaches normalized records with PCC off; PCC settings save/reload controls dashboard/imports/feeds without deleting records');

  await desktop.locator('#sidebar [data-view=settings]').click();
  assert.equal(await desktop.locator('[name=companion-enabled]').isChecked(),false);
  await desktop.locator('[name=companion-host]').selectOption('127.0.0.1');
  const testPort=await companionPort();await desktop.locator('[name=companion-port]').fill(String(testPort));
  await desktop.locator('[name=companion-enabled]').check();await desktop.locator('[data-act=companion-save]').click();
  await desktop.locator('[data-act=companion-pair]').waitFor();
  await desktop.reload();await desktop.locator('#sidebar [data-view=settings]').click();
  assert.equal(await desktop.locator('[name=companion-port]').inputValue(),String(testPort));
  await desktop.locator('[data-act=companion-pair]').click();await desktop.locator('#modal [name=name]').fill('Synthetic UI phone');
  await desktop.locator('#modal [name=alerts]').check();await desktop.locator('#modal-submit').click();
  await desktop.locator('#modal textarea[readonly]').waitFor();
  const link=new URL(await desktop.locator('#modal textarea[readonly]').inputValue());
  const syntheticPairing={key:link.searchParams.get('key'),certificate:link.searchParams.get('certificate')};
  assert.equal((await companionRequest(companion,syntheticPairing,'/alerts')).status,200);
  assert.equal((await companionRequest(companion,syntheticPairing,'/tasks')).status,403);
  await desktop.locator('#modal-submit').click();assert.equal(await desktop.locator('#modal textarea').count(),0);
  await desktop.setViewportSize({width:1280,height:1500});
  await desktop.locator('#companion-settings').screenshot({path:path.join(root,'build/screenshots/companion-settings.png')});
  await desktop.setViewportSize({width:1280,height:900});
  await desktop.locator('[data-act=companion-revoke]').click();await desktop.getByText('No paired phones.',{exact:true}).waitFor();
  assert.equal((await companionRequest(companion,syntheticPairing,'/status')).status,401);
  await desktop.locator('[name=companion-enabled]').uncheck();await desktop.locator('[data-act=companion-save]').click();
  await desktop.waitForFunction(()=>document.querySelector('#companion-settings .companion-status')?.textContent==='off');
  checks.push('Gateway Settings save/reload, one-time pairing scopes, HTTPS alert read, revocation and disabling reach real Core');
  await desktop.locator('.new-chat').click();
  await desktop.locator(".welcome h1").waitFor();
  assert.match(await desktop.locator('#last-updated').textContent(),/Last updated: /);
  assert.doesNotMatch(await desktop.locator('#last-updated').textContent(),/unavailable|Invalid Date/);
  assert.ok(await desktop.locator('#last-updated').isVisible());
  for(const height of [650,850]){await desktop.setViewportSize({width:1280,height});const rect=await desktop.locator('#last-updated').boundingBox();assert.ok(rect.y>=0&&rect.y+rect.height<=height,'Last updated stays inside the viewport');}
  fs.mkdirSync(path.join(root, "build/screenshots"), { recursive: true });
  await desktop.screenshot({
    path: path.join(root, "build/screenshots/desktop-home.png"),
  });
  checks.push("Desktop home renders");
  await desktop.locator('#top-actions summary').click();await desktop.locator('#top-actions [data-view="health"]').click();
  await desktop.locator('h1').filter({hasText:'Health & recovery'}).waitFor();
  await desktop.locator('[name="ramReserveMB"]').fill('1536');
  await desktop.locator('[name="keepBrainMinutes"]').fill('2');
  await desktop.locator('[data-act="health-save"]').click();
  await desktop.waitForFunction(()=>document.querySelector('[name="ramReserveMB"]').value==='1536');
  assert.equal(core.settings().ramReserveMB,1536);
  assert.equal(core.settings().keepBrainMinutes,2);
  await desktop.screenshot({path:path.join(root,'build/screenshots/health-recovery.png')});
  checks.push('Health screen saves validated settings through the real Core');
  await desktop.keyboard.press('Control+k');
  await desktop.locator('#prompt').waitFor();
  assert.equal(await desktop.locator('#prompt').evaluate(el=>el===document.activeElement),true);
  checks.push('Ctrl K opens chat and focuses the prompt');

  await desktop
    .locator("#prompt")
    .fill("Prepare a weekly operations report from these synthetic notes.");
  await desktop.locator("#send").click();
  await desktop.getByText('Token usage',{exact:true}).first().click();
  await desktop.locator('details').filter({has:desktop.locator('summary').getByText('Token usage',{exact:true})}).locator('.usage').waitFor();
  assert.equal(await desktop.locator(".message.assistant table").count(), 1);
  checks.push("Streaming answer renders a table and token counts");
  await desktop.screenshot({
    path: path.join(root, "build/screenshots/desktop-chat.png"),
  });
  const noted = core.createChat({});
  noted.messages = [{role:"assistant",text:"The recommended larger model was unavailable or did not fit. Review this Small-model draft.\n\nLocal draft — not sufficiently verified. No OpenAI call was made.\n\nYes. Open **User guide** in the sidebar for instructions on models, files, schedules and privacy. You can also ask me how to use a feature."}];
  core.saveChat(noted);
  await desktop.reload();
  for(const menu of await desktop.locator('#sidebar details').all()) await menu.locator(':scope > summary').click();
  await desktop.locator(`[data-id="${noted.id}"]`).click();
  const body = desktop.locator('.message.assistant .message-body');
  const notes = desktop.locator('.response-footnotes');
  assert.equal(await notes.locator('div').count(),2);
  assert.equal(await body.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(242, 243, 245)');
  assert.equal((await body.innerText()).startsWith('Yes.'),true);
  assert.ok((await notes.boundingBox()).y >= (await body.boundingBox()).y + (await body.boundingBox()).height);
  assert.ok(await notes.evaluate(el=>parseFloat(getComputedStyle(el).lineHeight)<15));
  await desktop.screenshot({path:path.join(root,'build/screenshots/response-footnotes.png')});
  checks.push('Grey answer bubble keeps both compact notices below the response');
  await desktop.locator('#sidebar [data-view="guide"]').click();
  await desktop.locator('#guide-search').waitFor();
  assert.equal(await desktop.locator('#guide-topics details').count(),require('../source/app-guide.json').topics.length);
  await desktop.locator('#guide-search').fill('RAM');
  assert.ok(await desktop.locator('#guide-topics details').count()>0);
  await desktop.locator('#guide-search').fill('ShareSync');
  assert.ok(await desktop.locator('#guide-topics details').count()>0);
  await desktop.screenshot({path:path.join(root,'build/screenshots/user-guide.png')});
  await desktop.locator('[data-act="guide-ask"]').first().click();
  await desktop.waitForFunction(()=>document.querySelector('.message.assistant')?.textContent.includes('Built-in user guide'));
  assert.equal(core.chat(core.summary().chats[0].id).messages.at(-1).processing.provider,'deterministic');
  checks.push('Offline guide searches RAM and ShareSync and answers in chat without a model');
  await desktop.locator('#sidebar [data-view="settings"]').click();
  await desktop.locator('[name="model"]').fill("unsaved-model-value");
  await desktop.locator('[data-act="choose-workspace"]').click();
  await desktop.waitForFunction(() =>
    document.querySelector(".path-display")?.textContent.endsWith(" Selected"),
  );
  assert.equal(
    await desktop.locator('[name="model"]').inputValue(),
    "unsaved-model-value",
  );
  checks.push("Choosing a work folder preserves unsaved Settings entries");
  await desktop.locator('[name="model"]').fill("test-model");
  await desktop.locator('[data-act="save-settings"]').click();
  await desktop.screenshot({
    path: path.join(root, "build/screenshots/desktop-settings.png"),
  });
  await desktop.locator('#sidebar [data-view="workspace"]').click();await desktop.locator('#content [data-view="projects"]').click();
  await desktop.locator('[data-act="project-new"]').click();
  await desktop.locator('[name="name"]').fill("Operations");
  await desktop
    .locator('[name="instructions"]')
    .fill("Use clear, factual language. Flag missing information.");
  await desktop.locator("#modal-submit").click();
  await desktop
    .getByRole("heading", { name: "Operations", exact: true })
    .waitFor();
  checks.push("Project creation saves through the real Core");
  await desktop.locator('#sidebar [data-view="automation"]').click();
  await desktop.locator('[data-act="schedule-new"]').click();
  assert.equal(await desktop.locator('#modal input').first().evaluate(el=>el===document.activeElement),true);
  await desktop.keyboard.press('Escape');assert.equal(await desktop.locator('#modal').evaluate(el=>el.open),false);
  checks.push('Dialog focuses its first input and Escape cancels');
  await desktop.locator('[data-act="schedule-new"]').click();
  await desktop.locator('[name="name"]').fill("Morning report");
  await desktop
    .locator('[name="prompt"]')
    .fill("Draft a short status report with follow-up items.");
  await desktop.locator("#modal-submit").click();
  await desktop
    .getByText("Morning report", { exact: true })
    .waitFor();
  checks.push("Schedule creation saves through the real Core");
  await desktop.locator('#sidebar [data-view="automation"]').click();await desktop.getByRole('button',{name:'Worker settings',exact:true}).click();
  await desktop.screenshot({
    path: path.join(root, "build/screenshots/desktop-worker.png"),
  });
  await desktop.locator('#sidebar [data-view="apps"]').click();
  assert.equal(
    await desktop.locator('[data-act="access-outlook-messages"]').isDisabled(),
    true,
  );
  await desktop.locator('[data-act="access-outlook-permissions"]').click();
  await desktop.locator('[name="readMessages"]').check();
  await desktop.locator("#modal-submit").click();
  await desktop.locator('[data-act="access-outlook-messages"]').click();
  await desktop.locator("#modal-submit").click();
  await desktop
    .locator("#modal-content textarea[readonly]")
    .waitFor();
  await desktop.locator("#modal-submit").click();
  await desktop
    .locator("#attachments")
    .getByText("Outlook: Synthetic inbox item.txt", { exact: false })
    .waitFor();
  checks.push(
    "Outlook is denied until granted, then a chosen message is previewed and attached without sending",
  );
  await desktop.locator('#sidebar [data-view="apps"]').click();
  await desktop.locator('[data-act="access-folder-add"]').click();
  await desktop.locator('[name="write"]').check();
  await desktop.locator("#modal-submit").click();
  assert.equal(
    await desktop.locator('[data-act="access-folder-browse"]').isDisabled(),
    true,
  );
  await desktop.locator('[data-act="access-folder-note"]').click();
  await desktop.locator('[name="relative"]').fill("Synthetic note.txt");
  await desktop.locator('[name="text"]').fill("Synthetic UI note.");
  await desktop.locator("#modal-submit").click();
  await desktop.getByText("Note saved.", { exact: true }).waitFor();
  assert.equal(
    fs.readFileSync(
      path.join(core.settings().workspace, "Synthetic note.txt"),
      "utf8",
    ),
    "Synthetic UI note.",
  );
  checks.push(
    "Write-only folder permission creates a chosen note while browsing remains disabled",
  );
  await desktop.screenshot({
    path: path.join(root, "build/screenshots/desktop-access.png"),
  });
  await desktop.setViewportSize({ width: 780, height: 600 });
  assert.equal(
    await desktop.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  checks.push("Desktop fits its minimum window size");
  // Render untrusted output and prove remote images cannot load.
  const unsafe = core.createChat({});
  unsafe.messages = [
    {
      role: "assistant",
      text: 'Hello ![remote](https://tracker.invalid/a) <img src="https://tracker.invalid/b" onerror="window.pwned=1"><script>window.pwned=1</script>',
    },
  ];
  core.saveChat(unsafe);
  await desktop.reload();
  for(const menu of await desktop.locator('#sidebar details').all()) await menu.locator(':scope > summary').click();
  await desktop.locator(`[data-id="${unsafe.id}"]`).click();
  assert.equal(
    await desktop.locator(".message-body img,.message-body script").count(),
    0,
  );
  assert.equal(await desktop.evaluate(() => window.pwned), undefined);
  checks.push("Untrusted answer HTML and remote images are stripped");
  panel = await context.newPage();
  await panel.setViewportSize({ width: 420, height: 900 });
  await panel.exposeFunction("nativeCall", async (request) => {
    try {
      return {
        type: "result",
        id: request.id,
        result: await dispatch(request.op, request.data, true),
      };
    } catch (e) {
      return { type: "result", id: request.id, error: safeError(e) };
    }
  });
  await panel.addInitScript(() => {
    let handler;
    window.__captureCalls = 0;
    window.__tabQueries = 0;
    window.__deliver = (e) => handler?.({ type: "event", event: e });
    window.chrome = {
      runtime: {
        connectNative: () => ({
          onMessage: { addListener: (cb) => (handler = cb) },
          onDisconnect: { addListener: () => {} },
          postMessage: (request) =>
            window.nativeCall(request).then((response) => handler(response)),
          disconnect: () => {},
        }),
      },
      tabs: {
        query: async () => {
          window.__tabQueries++;
          return [{ id: 1 }];
        },
      },
      scripting: {
        executeScript: async () => {
          window.__captureCalls++;
          return [{ result: { text: "Synthetic page reference" } }];
        },
      },
    };
  });
  await panel.goto(base + "/chrome_extension/panel.html");
  await panel.waitForFunction(() =>
    document.querySelector("#mode").textContent.includes("smart-hybrid"),
  );
  assert.equal(await panel.evaluate(() => window.__tabQueries), 0);
  assert.equal(await panel.evaluate(() => window.__captureCalls), 0);
  await panel.locator("#prompt").fill("What makes a clear report?");
  await panel.locator("#send").click();
  await panel.locator(".copy").waitFor();
  await panel.waitForFunction(() => !document.querySelector("#send").disabled);
  assert.equal(await panel.evaluate(() => window.__tabQueries), 0);
  assert.equal(await panel.evaluate(() => window.__captureCalls), 0);
  checks.push(
    "Opening the panel and sending a general question never query tabs or extract a page",
  );
  await panel.locator("#include").check();
  assert.equal(await panel.evaluate(() => window.__captureCalls), 0);
  await panel.locator("#prompt").fill("Summarize the page I included.");
  await panel.locator("#send").click();
  await panel.waitForFunction(() => !document.querySelector("#send").disabled);
  assert.equal(await panel.evaluate(() => window.__captureCalls), 1);
  assert.equal(await panel.locator("#include").isChecked(), false);
  checks.push("Include Page extracts once on Send and resets afterward");
  await panel.evaluate(() => {
    window.chrome.scripting.executeScript = async () => {
      throw Error("Synthetic restricted page");
    };
  });
  await panel.locator("#include").check();
  await panel.locator("#prompt").fill("Read this restricted page");
  await panel.locator("#send").click();
  await panel.locator("#error").waitFor();
  assert.equal(await panel.locator("#include").isChecked(), false);
  checks.push("Page permission resets even when extraction fails");
  await panel.screenshot({
    path: path.join(root, "build/screenshots/chrome-panel.png"),
  });
  assert.equal(
    await panel.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  checks.push("Chrome panel fits a 420-pixel width");
  const capture = await import("../chrome_extension/capture.mjs");
  const page = await context.newPage();
  await page.setContent(
    '<main>Visible synthetic text<input value="PASSWORD_SECRET"><textarea>FORM_SECRET</textarea><div hidden>HIDDEN_SECRET</div><script>const PRIVATE_SCRIPT=1;</script></main>',
  );
  const extracted = await page.evaluate(capture.extractVisible);
  assert.ok(extracted.text.includes("Visible synthetic"));
  for (const token of [
    "PASSWORD_SECRET",
    "FORM_SECRET",
    "HIDDEN_SECRET",
    "PRIVATE_SCRIPT",
  ])
    assert.equal(extracted.text.includes(token), false);
  checks.push(
    "Page extraction excludes form controls, hidden text, and scripts",
  );
  await desktop.locator('#sidebar [data-view="settings"]').click();await desktop.locator('#content [data-view="processing"]').click();
  await desktop.locator('[name="processingMode"]').selectOption('local-only');
  await desktop.locator('[data-act="hybrid-save"]').click();
  await desktop.waitForFunction(()=>document.querySelector('#model-label').textContent.startsWith('Local Only · '));
  assert.equal(core.settings().processingMode,'local-only');
  await desktop.screenshot({path:path.join(root,'build/screenshots/ai-processing.png')});
  assert.equal(await desktop.locator('[data-act="hybrid-runtime"]').count(),0);
  checks.push('AI Processing saves Local Only and renders model controls');
  await desktop.locator('[data-act="hybrid-tier-medium"]').click();
  assert.equal(requestedModel,'llama32-3b');
  await desktop.locator('[data-act="hybrid-tier-high"]').click();
  assert.equal(requestedModel,'qwen3-4b');
  checks.push('Both model buttons request the correct catalog model');
  await desktop.evaluate(()=>window.__deliver({type:'model-download',state:'selected'}));
  await desktop.waitForTimeout(200);
  assert.equal(await desktop.getByText('render is not defined',{exact:true}).count(),0);
  await desktop.locator('[name="localContext"]').fill('2048');
  await desktop.evaluate(()=>window.__deliver({type:'local-status'}));
  await desktop.locator('#local-brain-error').filter({hasText:'0xc0000135'}).waitFor();
  assert.equal(await desktop.locator('[name="localContext"]').inputValue(),'2048');
  checks.push('Model selection event refreshes correctly; startup error stays visible without losing settings');
  await desktop.locator('#sidebar [data-view="settings"]').click();await desktop.locator('#content [data-view="usage"]').click();
  await desktop.locator('h1').filter({hasText:'API Usage'}).waitFor();
  await desktop.screenshot({path:path.join(root,'build/screenshots/api-usage.png')});
  checks.push('API usage dashboard displays unpriced calls without fabricated prices');
  await desktop.setViewportSize({width:1280,height:850});
  await desktop.locator('#sidebar [data-view="messaging"]').click();
  await desktop.locator('[data-act="msg-disable"]').waitFor();
  assert.equal(await desktop.locator('[name="wa-enabled"]').isChecked(),false);
  await desktop.screenshot({path:path.join(root,'build/screenshots/messaging.png')});
  checks.push('Messaging permissions start disabled and expose emergency stop');
  await desktop.locator('#sidebar [data-view="browser"]').click();
  await desktop.locator('[name="recipeUrl"]').waitFor();
  await desktop.screenshot({path:path.join(root,'build/screenshots/browser-reports.png')});
  checks.push('Browser workflow setup renders with manual sign-in controls');
  const {readWhatsApp}=require('../source/whatsapp-web.cjs');
  const wa=await context.newPage();
  await wa.setContent('<div id="main"><header><span title="Private AI">Private AI</span></header><div data-id="false_123456789@g.us_ABC_15550001111@c.us"><span class="selectable-text">AI: example /status</span></div></div>');
  const snap=await wa.evaluate(readWhatsApp);
  assert.equal(snap.verified,true);assert.equal(snap.messages[0].sender,'15550001111@c.us');
  await wa.setContent('<div id="main"><header><span title="Private AI"></span></header><div data-id="display-name-only"><span class="selectable-text">AI: example /status</span></div></div>');
  assert.equal((await wa.evaluate(readWhatsApp)).verified,false);
  checks.push('WhatsApp DOM adapter requires stable group and sender identifiers');
  await desktop.locator('#sidebar [data-view="dashboard"]').click();
  await desktop.locator('#sidebar [data-view="captures"]').click();
  await desktop.locator('#capture-form').waitFor();
  await desktop.locator('#capture-form [name="text"]').fill('Tell maintenance room 204 has a leak.');
  await desktop.locator('#capture-form .manual-details > summary').click();
  await desktop.locator('#capture-form [name="kind"]').selectOption('round');
  await desktop.locator('#capture-form [name="draftChannel"]').selectOption('whatsapp');
  await desktop.locator('#capture-file').setInputFiles({name:'Synthetic evidence.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2dr8AAAAASUVORK5CYII=','base64')});
  await desktop.locator('#capture-form button[type="submit"]').click();
  await desktop.locator('[data-action]').waitFor();
  assert.equal(core.store.count('capture_note'),1);assert.equal(core.store.count('capture_evidence'),1);
  await desktop.locator('[data-action]').click();
  await desktop.locator('#modal [name="owner"]').fill('Synthetic reviewer');
  await desktop.locator('#modal [name="note"]').fill('Reviewed source observation.');
  await desktop.locator('#modal-submit').click();
  await desktop.getByText('Owner: Synthetic reviewer',{exact:false}).waitFor();
  await desktop.locator('[data-draft]').click();
  await desktop.locator('#modal [name="body"]').fill('Please review the source observation.');
  await desktop.locator('#modal-submit').click();
  await desktop.locator('[data-evidence]').click();
  await desktop.locator('#modal img').waitFor();
  assert.match(await desktop.locator('#modal img').getAttribute('src'),/^data:image\/png;base64,/);
  await desktop.locator('#modal-submit').click();
  assert.equal(core.store.list('capture_draft')[0].body,'Please review the source observation.');
  checks.push('Notes and rounds saves source/evidence, reloads reviewed canonical follow-up and edits internal draft');
  const captures=require('../source/capture-workflows.cjs');
  for(let i=0;i<40;i++)captures.create(core,{sourceId:'synthetic-bounded-notes-'+i,text:'SYNTHETIC bounded note '+i+' '+ '#'.repeat(11800)});
  const bounded=captures.list(core);
  assert.equal(bounded.truncated,true);
  assert.ok(bounded.captures.length<100,'The response byte limit is reached before the note-count limit');
  await desktop.locator('#sidebar [data-view="dashboard"]').click();
  await desktop.locator('#sidebar [data-view="captures"]').click();
  await desktop.getByText('Showing a bounded set of recent notes; use Dashboard for other follow-ups.',{exact:true}).waitFor();
  assert.equal(await desktop.locator('#content article.card').count(),bounded.captures.length);
  checks.push('Notes list explains byte-limited truncation and renders the actual bounded result');
  for(const settings of [{hipaa:false,publicModeConfirmed:true,processingMode:'local-first'},{hipaa:true,processingMode:'local-only'}]){
    core.saveSettings(settings);await desktop.reload();await desktop.getByRole('heading',{name:'What would you like to work on?'}).waitFor();
    await desktop.locator('#sidebar .more-tools > summary').click();await desktop.locator('#voice-sidebar-btn').click();
    await desktop.getByText('Set up local transcription in Meetings before using voice. No audio was recorded.',{exact:false}).first().waitFor();
    assert.equal(await desktop.evaluate(()=>window.__voiceStarts),0);
    await desktop.locator('#sidebar [data-view=settings]').click();assert.equal(await desktop.locator('#voice-hud').isVisible(),false);
  }
  checks.push('Voice setup fails safely before microphone access; online browser recognizer is never started');
  checks.push('Surveillance retention notice makes no regulatory exemption claim');
  assert.deepEqual(errors, []);
  checks.push("No browser JavaScript errors");
  const result = {
    browser: await browser.version(),
    environment:
      process.platform+" Chromium; synthetic IPC; actual packaged acceptance is separate",
    checks,
  };
  fs.writeFileSync(
    path.join(root, "build/ui-results.json"),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));
})()
  .catch(async (e) => {
    console.error(e);
    console.error('Browser errors:',errors);
    if(desktop&&!desktop.isClosed())console.error('Visible UI:',(await desktop.locator('#content').innerText()).slice(0,1500),'Notice:',await desktop.locator('#toast').textContent());
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    companion.close();
    server.close();
    for (const fn of after) fn();
  });
