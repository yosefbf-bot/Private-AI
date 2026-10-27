"use strict";
// Real Chromium UI checks with a synthetic, local Core. No provider requests.
const { chromium } = require("playwright");
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http"),
  assert = require("node:assert/strict");
const { fixture } = require("./helpers.cjs");
const { safeError, fail } = require("../source/security.cjs");
const after = [],
  checks = [],
  errors = [];
const report =
  "# Weekly operations report\n\nThe review is complete. Here are the items to follow up.\n\n| Area | Status |\n| --- | --- |\n| Reports | Ready for review |\n| Open items | 3 follow-ups |\n\n## Next steps\n\n- Review the totals with your source documents.\n- Save the approved report in your work folder.\n\n**Synthetic demonstration data.**";
let generationCalls = 0, sendRequests = 0, longStream = false, finishLongStream;
const longReport='# Synthetic long stream\n\n**Formatted while streaming** and `code`.\n\n| Item | Value |\n| --- | --- |\n| Synthetic | Unknown |\n\n'+('Synthetic streaming reference. '.repeat(2800))+'\n\n<img src=x onerror="window.__streamInjected=1"><svg onload="window.__streamInjected=1"></svg><script>window.__streamInjected=1</script>STREAM_END';
const approvalRequests = [];
const client = {
  models: async () => ["test-model"],
  generate: async (key, settings, messages, opts = {}) => {
    generationCalls++;
    const output=longStream?longReport:report;
    for (const piece of output.match(longStream?/.{1,2000}/gs:/.{1,40}/gs)) {
      opts.onDelta?.(piece);
      await new Promise((r) => setTimeout(r, 2));
    }
    if(longStream)await new Promise(resolve=>finishLongStream=resolve);
    return { text: output, usage: { inputTokens: 124, outputTokens: 88 } };
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
  if(op==='workerSnapshot')return core.workerSnapshot();
  if(op.startsWith('snf')) return require('../source/snf/index.cjs').dispatch(core,op,data);
  if(op.startsWith('workflow')) return require('../source/workflows/index.cjs').dispatch(core,op,data);
  if(op.startsWith('capture')) return require('../source/capture-workflows.cjs').dispatch(core,op,data);
  switch (op) {
    case "integrationSave": return core.integrations.configure(data.id,data.settings);
    case "companionStatus": return companion.status();
    case "companionSave": return companion.configure(data);
    case "companionPair": return companion.pair(data);
    case "companionInvite": return companion.invite(data);
    case "companionInviteCancel": return companion.cancelInvite(data.id);
    case "companionInviteStatus": return companion.inviteStatus(data.id);
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
    case "archiveChat": return core.archiveChat(data.id,data.archived);
    case "queueChatWhenMemoryFree": return core.queueChatWhenMemoryFree(data);
    case "send":
      sendRequests++;
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
      if (data.approved === true) approvalRequests.push(data.approvalFingerprint);
      return core.saveSettings(data);
    case "saveKey":
      return core.saveKey(data.key, data.provider);
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
  await desktop.locator('#companion-settings details').getByText('Older companion app / manual setup').click();
  await desktop.locator('[data-act=companion-pair-legacy]').click();await desktop.locator('#modal [name=name]').fill('Synthetic UI phone');
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
  await desktop.locator('[data-act=companion-pair]').click();await desktop.locator('#modal [name=name]').fill('Synthetic QR UI phone');
  await desktop.locator('#modal [name=alerts]').check();await desktop.locator('#modal-submit').click();
  await desktop.locator('#pairing-qr').waitFor();
  const invitation=new URL(await desktop.locator('#pairing-link').inputValue());
  assert.equal(invitation.pathname,'/v2');assert.equal(invitation.searchParams.has('key'),false);assert.equal(invitation.searchParams.has('certificate'),false);
  assert.ok(invitation.href.length<1024);assert.equal(await desktop.locator('#pairing-qr').evaluate(c=>c.width>300&&c.width===c.height),true);
  await desktop.locator('#pairing-regenerate').click();await desktop.waitForFunction(id=>new URL(document.querySelector('#pairing-link').value).searchParams.get('id')!==id,invitation.searchParams.get('id'));
  assert.equal(companion.inviteStatus(invitation.searchParams.get('id')).state,'cancelled');
  const currentInvitation=new URL(await desktop.locator('#pairing-link').inputValue());
  const exchanged=await companionRequest(companion,{certificate:syntheticPairing.certificate},'/pair/exchange',{version:2,id:currentInvitation.searchParams.get('id'),token:currentInvitation.searchParams.get('token')});
  assert.equal(exchanged.status,200);assert.equal((await companionRequest(companion,exchanged.body,'/tasks')).status,403);
  assert.equal((await companionRequest(companion,exchanged.body,'/status')).status,200);
  await desktop.getByText('Connected — your phone verified this PC and completed an authenticated status check.',{exact:true}).waitFor();
  assert.equal(await desktop.locator('#pairing-link').inputValue(),'');assert.equal(await desktop.locator('#pairing-link').textContent(),'');assert.equal(await desktop.locator('#pairing-qr').isVisible(),false);
  await desktop.locator('#modal-submit').click();await desktop.getByText('Synthetic QR UI phone',{exact:true}).waitFor();
  assert.equal((await companionRequest(companion,exchanged.body,'/status')).status,200,'Closing successful wizard must preserve pairing.');
  await desktop.locator('[data-act=companion-revoke]').click();await desktop.getByText('No paired phones.',{exact:true}).waitFor();
  assert.equal((await companionRequest(companion,exchanged.body,'/status')).status,401);
  checks.push('Actual local QR render/regeneration, atomic HTTPS exchange, scoped denial, authenticated Connected, DOM cleanup, durable Done and explicit revoke');
  await desktop.locator('[name=companion-enabled]').uncheck();await desktop.locator('[data-act=companion-save]').click();
  await desktop.waitForFunction(()=>document.querySelector('#companion-settings .companion-status')?.textContent==='off');
  checks.push('Gateway Settings save/reload, legacy reusable pairing scopes, HTTPS alert read, revocation and disabling reach real Core');
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
  const savedDraft = core.saveDraft.bind(core), sendsBeforeDraftFailure = sendRequests, generationsBeforeDraftFailure = generationCalls;
  let rejectedDraftClears = 0;
  core.saveDraft = (id, text) => {
    if (text === "" && rejectedDraftClears === 0) { rejectedDraftClears++; throw fail('STORAGE'); }
    return savedDraft(id, text);
  };
  try {
    // Await the shipped onclick promise, including its error recovery and finally block.
    await desktop.evaluate(() => document.getElementById('send').onclick());
    assert.equal(rejectedDraftClears, 1);
    assert.equal(sendRequests, sendsBeforeDraftFailure, 'A failed draft clear must not send a request');
    assert.equal(generationCalls, generationsBeforeDraftFailure);
    assert.equal(await desktop.locator('#prompt').inputValue(), 'Prepare a weekly operations report from these synthetic notes.');
    assert.equal(await desktop.locator('#prompt').isEnabled(), true);
    assert.equal(await desktop.locator('#attach').isEnabled(), true);
    assert.equal(await desktop.locator('#send').isVisible(), true);
    assert.equal(await desktop.locator('#stop').isHidden(), true);
    assert.equal(await desktop.locator('.message').count(), 0);
    assert.equal(await desktop.locator('#compose-status').textContent(), '');
    assert.equal(await desktop.locator('#toast').textContent(), safeError(fail('STORAGE')).message);
  } finally { core.saveDraft = savedDraft; }
  await desktop.locator("#send").click();
  await desktop.getByText('Token usage',{exact:true}).first().click();
  await desktop.locator('details').filter({has:desktop.locator('summary').getByText('Token usage',{exact:true})}).locator('.usage').waitFor();
  assert.equal(await desktop.locator(".message.assistant table").count(), 1);
  assert.equal(sendRequests, sendsBeforeDraftFailure + 1, 'The recovered Send action must submit exactly once');
  assert.equal(generationCalls, generationsBeforeDraftFailure + 1);
  checks.push('Rejected draft save preserves the prompt and controls, releases Send, and allows exactly one subsequent request');
  checks.push("Streaming answer renders a table and token counts");
  await desktop.screenshot({
    path: path.join(root, "build/screenshots/desktop-chat.png"),
  });
  longStream=true;
  try{
    await desktop.locator('#prompt').fill('Describe this synthetic streaming demonstration.');await desktop.locator('#send').click();
    await desktop.waitForFunction(()=>document.querySelector('.message:last-child .message-body')?.textContent.includes('STREAM_END'));
    assert.equal(await desktop.locator('#stop').isVisible(),true,'The fixture holds completion while checking the streamed answer');
    const streamed=desktop.locator('.message:last-child .message-body');
    assert.equal(await streamed.locator('h1').innerText(),'Synthetic long stream');assert.equal(await streamed.locator('strong').innerText(),'Formatted while streaming');
    assert.equal(await streamed.locator('table').count(),1);assert.equal(await streamed.locator('code').innerText(),'code');
    assert.equal(await streamed.locator('img,svg,script').count(),0);assert.equal(await desktop.evaluate(()=>window.__streamInjected||0),0);
    finishLongStream();await desktop.locator('#stop').waitFor({state:'hidden'});
    assert.equal(await desktop.locator('.message:last-child .message-body table').count(),1);assert.equal(await desktop.locator('.message:last-child .message-body img, .message:last-child .message-body svg, .message:last-child .message-body script').count(),0);
    checks.push('Long streamed Markdown retains headings, bold, code and tables before completion with unchanged HTML sanitization');
  }finally{longStream=false;finishLongStream?.();finishLongStream=undefined;}
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
  const approvalsBeforeReplacement = approvalRequests.length, generationsBeforeReplacement = generationCalls;
  const previousFingerprint = core.summary().providerApprovalFingerprint;
  assert.equal(await desktop.locator('[name="approved"]').isChecked(), true);
  await desktop.locator('[name="apiKey"]').fill('sk-synthetic-ui-replacement');
  await desktop.locator('[data-act="save-key"]').click();
  await desktop.waitForFunction(() => document.querySelector('#toast').textContent === 'API key for openai saved securely.');
  assert.equal(core.key('openai'), 'sk-synthetic-ui-replacement');
  assert.equal(await desktop.locator('[name="approved"]').isChecked(), false);
  await desktop.locator('[data-act="save-settings"]').click();
  await desktop.waitForFunction(() => document.querySelector('#toast').textContent === 'Settings saved.');
  await desktop.reload();
  await desktop.getByRole('heading', {name:'What would you like to work on?'}).waitFor();
  for (const menu of await desktop.locator('#sidebar details').all()) if (!await menu.evaluate(el => el.open)) await menu.locator(':scope > summary').click();
  await desktop.locator('#sidebar [data-view="settings"]').click();
  assert.equal(await desktop.locator('[name="approved"]').isChecked(), false);
  assert.equal(core.settings().approved, false);
  assert.equal(core.store.get('settings', 'main').providerApproval, undefined);
  assert.notEqual(core.summary().providerApprovalFingerprint, previousFingerprint);
  assert.equal(approvalRequests.length, approvalsBeforeReplacement, 'Key replacement, saving and reload must never submit approval');
  assert.throws(() => core.canSend(true, true), {code:'SETUP'});
  await desktop.locator('.new-chat').click();
  await desktop.getByRole('heading', {name:'What would you like to work on?'}).waitFor();
  await desktop.locator('#prompt').fill('Discuss these supplied synthetic design tradeoffs after credential replacement.');
  await desktop.locator('#send').click();
  await desktop.getByText(safeError(fail('AI_SETUP')).message, {exact:true}).waitFor();
  assert.equal(generationCalls, generationsBeforeReplacement, 'Unapproved credentials must not reach inference');
  await desktop.locator('#sidebar [data-view="settings"]').click();
  const reviewedFingerprint = core.summary().providerApprovalFingerprint;
  await desktop.locator('[name="approved"]').click();
  await desktop.getByRole('heading', {name:'Approve the saved provider configuration?'}).waitFor();
  assert.ok((await desktop.locator('#modal-content').textContent()).includes(reviewedFingerprint));
  await desktop.locator('#modal-submit').click();
  await desktop.waitForFunction(() => document.querySelector('[name="approved"]')?.checked === true);
  assert.equal(core.settings().approved, true);
  assert.equal(approvalRequests.length, approvalsBeforeReplacement + 1);
  assert.equal(approvalRequests.at(-1), reviewedFingerprint);
  assert.equal(core.settings().providerApproval.fingerprint, reviewedFingerprint);
  assert.doesNotThrow(() => core.canSend(true, true));
  checks.push('Replacing an approved key, saving and reloading cannot reapprove it; inference stays blocked until explicit saved-fingerprint approval');
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
          onDisconnect: { addListener: cb => {window.__disconnectPanel=cb;} },
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
        executeScript: async (options) => {
          if(options.files){window.__parserLoads=(window.__parserLoads||0)+1;return [];}
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
  assert.equal(await panel.evaluate(() => window.__parserLoads), 1);
  assert.equal(await panel.locator("#include").isChecked(), false);
  checks.push("Include Page loads the local parser and extracts once on Send, then resets");
  longStream=true;await panel.locator('#prompt').fill('Synthetic extended panel stream');await panel.locator('#send').click();
  await panel.waitForFunction(()=>document.querySelectorAll('.message').length===6);
  await panel.evaluate(()=>{window.__firstPanelMessage=document.querySelector('.message');document.querySelector('#messages').scrollTop=0;window.__panelReplacements=0;window.__panelObserver=new MutationObserver(records=>{for(const record of records)if(record.target===document.querySelector('#messages'))window.__panelReplacements++;});window.__panelObserver.observe(document.querySelector('#messages'),{childList:true,subtree:true});});
  await panel.waitForFunction(()=>document.querySelector('.message:last-child .message-body')?.textContent.includes('STREAM_END'));
  assert.equal(await panel.evaluate(()=>window.__firstPanelMessage===document.querySelector('.message')),true);
  assert.equal(await panel.evaluate(()=>window.__panelReplacements),0,'Streaming must not replace earlier messages');
  assert.equal(await panel.locator('#messages').evaluate(el=>el.scrollTop),0,'Reading position stays at older messages');
  await panel.evaluate(()=>window.__panelObserver.disconnect());finishLongStream();longStream=false;await panel.waitForFunction(()=>!document.querySelector('#send').disabled);
  checks.push('Extension stream updates only the active answer and preserves earlier DOM/reading position');
  longStream=true;await panel.locator('#prompt').fill('Synthetic interrupted panel stream');await panel.locator('#send').click();
  await panel.waitForFunction(()=>document.querySelector('.message:last-child .message-body')?.textContent.includes('STREAM_END'));
  await panel.evaluate(()=>window.__disconnectPanel());await panel.waitForFunction(()=>!document.querySelector('#send').disabled&&!document.querySelector('#prompt').disabled);
  assert.match(await panel.locator('#error').textContent(),/disconnected/);finishLongStream();longStream=false;
  await panel.locator('#reconnect').click();await panel.waitForFunction(()=>document.querySelector('#mode').textContent.includes('smart-hybrid'));
  checks.push('Extension disconnect rejects pending sends and restores controls without replay');


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
  // Actual app navigation and controls over the synthetic real encrypted Core.
  const phase3File={id:require('node:crypto').randomUUID(),name:'Synthetic Phase3 policy.txt',text:'Syntheticphase3 policy passage contact person@example.test',bytes:Buffer.from('Synthetic original file').toString('base64'),hipaa:true,updated:Date.now()};core.store.put('file',phase3File.id,phase3File);
  const phase3Project=core.projectSave({name:'Synthetic Phase3 collection'});require('../source/workflows/documents.cjs').link(core,{projectId:phase3Project.id,fileIds:[phase3File.id]});
  await desktop.locator('#sidebar [data-view="search"]').click();await desktop.locator('#saved-search-query').fill('syntheticphase3');await desktop.locator('#saved-search-submit').click();
  const docMatch=desktop.locator('#saved-search-results article').filter({hasText:phase3File.name}).first();await docMatch.locator('[data-search-open]').click();
  await desktop.locator(`[data-file-details="${phase3File.id}"] [data-document-panel] [data-doc-reload]`).waitFor();
  assert.equal(await desktop.locator('#wf-file-focus').isVisible(),true);assert.equal(await desktop.locator('[data-file-details]').count(),1);
  assert.equal(await desktop.locator(`[data-section-file="${phase3File.id}"]`).count()>0,true);
  checks.push('Search opens the selected Library file and matching section through real app navigation');
  core.store.put('messaging','settings',{enabled:true,adapter:'web',readAll:true,disableAllWriting:true,conversations:[]});
  core.store.put('messageIn','synthetic-ui-correspondence',{id:'synthetic-ui-correspondence',adapter:'web',groupId:'123456789@g.us',incoming:true,text:'Please reply about the syntheticphase3 policy.'});
  core.store.put('job','synthetic-ui-notice',{id:'synthetic-ui-notice',title:'Synthetic Phase3 interrupted job',status:'failed',error:'INTERRUPTED',completed:Date.now()});
  await desktop.locator('#sidebar [data-view="dashboard"]').click();await desktop.locator('[data-notice-review]').filter({hasText:'Acknowledge'}).first().click();await desktop.locator('#modal [name="ack"]').check();await desktop.locator('#modal-submit').click();
  await desktop.getByText('No administrative notices in the available records.',{exact:true}).waitFor();assert.equal(core.store.get('job','synthetic-ui-notice').status,'failed');
  await desktop.locator('#correspondence-panel > summary').click();await desktop.locator('#communication-settings').click();await desktop.locator('#modal [name="enabled"]').check();await desktop.locator('#modal [name="intervalMinutes"]').fill('5');await desktop.locator('#modal-submit').click();
  await desktop.locator('#correspondence-panel > summary').waitFor();await desktop.locator('#correspondence-panel > summary').click();await desktop.locator('#communication-settings').click();assert.equal(await desktop.locator('#modal [name="enabled"]').isChecked(),true);assert.equal(await desktop.locator('#modal [name="intervalMinutes"]').inputValue(),'5');await desktop.locator('#modal-cancel').click();
  await desktop.locator('#communication-check').click();await desktop.locator('#correspondence-panel > summary').click();await desktop.locator('[data-communication-review]').click();
  await desktop.locator('#modal [name="owner"]').fill('Synthetic correspondence reviewer');await desktop.locator('#modal [name="draftChannel"]').selectOption('outlook');await desktop.locator('#modal-submit').click();
  await desktop.getByText('Synthetic correspondence reviewer',{exact:false}).first().waitFor();
  await desktop.locator('#correspondence-panel > summary').click();await desktop.locator('[data-communication-note]').click();await desktop.locator('[data-capture-id]').waitFor();assert.equal(await desktop.locator('[data-capture-id]').count(),1);assert.equal(await desktop.locator('[data-draft]').count(),1);
  assert.equal(core.store.count('messageOut'),0);checks.push('Dashboard notice acknowledgment preserves failed source; cached correspondence settings reload and create one reviewed canonical note/draft without sending');
  for(const settings of [{hipaa:false,publicModeConfirmed:true,processingMode:'local-first'},{hipaa:true,processingMode:'local-only'}]){
    core.saveSettings(settings);await desktop.reload();await desktop.getByRole('heading',{name:'What would you like to work on?'}).waitFor();
    await desktop.locator('#sidebar .more-tools > summary').click();await desktop.locator('#voice-sidebar-btn').click();
    await desktop.getByText('Set up local transcription in Meetings before using voice. No audio was recorded.',{exact:false}).first().waitFor();
    assert.equal(await desktop.evaluate(()=>window.__voiceStarts),0);
    await desktop.locator('#sidebar [data-view=settings]').click();assert.equal(await desktop.locator('#voice-hud').isVisible(),false);
  }
  checks.push('Voice setup fails safely before microphone access; online browser recognizer is never started');
  core.store.put('job','synthetic-lazy-draft',{title:'Synthetic saved draft',status:'failed',playbook:{id:'synthetic',revision:1},savedAnswer:{text:'SYNTHETIC LAZY DRAFT <script>not executable</script>'}});
  for(const theme of ['light','dark']){
    await desktop.evaluate(async theme=>{
      const {createWorkflowUI}=await import('/source/ui/workflows.mjs');
      const host=document.createElement('div');host.id='lazy-draft-fixture';document.querySelector('#content').replaceChildren(host);
      document.documentElement.dataset.theme=theme;
      const esc=s=>{const el=document.createElement('span');el.textContent=String(s??'');return el.innerHTML;};
      const api=async(op,data)=>{const r=await window.privateAI.call(op,data);if(!r.ok)throw Error(r.error.code);return r.result;};
      await createWorkflowUI({api,esc,toast:message=>{throw Error(message);}}).render(host,'playbooks');
    },theme);
    const host=desktop.locator('#lazy-draft-fixture');
    assert.doesNotMatch(await host.innerHTML(),/SYNTHETIC LAZY DRAFT/);
    await host.locator('details').filter({hasText:'Synthetic saved draft'}).locator('summary').click();
    await host.getByRole('button',{name:'Read saved draft'}).click();
    await host.getByRole('textbox',{name:'Saved draft'}).waitFor();
    assert.equal(await host.getByRole('textbox',{name:'Saved draft'}).inputValue(),'SYNTHETIC LAZY DRAFT <script>not executable</script>');
    assert.equal(await host.locator('script').count(),0);
    await host.evaluate(el=>el.remove());
  }
  checks.push('Light/dark playbook draft loads only on request through real Core; full saved text is preserved and rendered without HTML execution');
  checks.push('Surveillance retention notice makes no regulatory exemption claim');
  // Exercise the shipped composer and queue UI with real Core/SQLite and a
  // synthetic local engine. Native inference is measured separately.
  const GIB=1024**3,priorEmit=core.emit,cloudCallsBeforeRAM=generationCalls;
  let freeRAM=2*GIB;const localCalls=[],row={tier:'small',name:'Synthetic Small',file:'synthetic-small.gguf',bytes:1282439584,installed:true};
  core.saveSettings({processingMode:'local-only',allowCloud:false,localTier:'small',localMaxTier:'small',localContext:2048,localMaxOutput:192,ramReserveMB:1024,ramRecoverySeconds:0,keepBrainMinutes:0});
  core.modelManager={catalog:()=>[row],verifyTier:async()=>row};
  core.router.local={state:'unloaded',status:()=>({state:'unloaded',availableMemoryGB:freeRAM/GIB}),validate:()=>row.bytes,modelName:()=>row.name,close(){},stop(){},generate:async(settings,messages)=>{localCalls.push({settings,messages});return {text:JSON.stringify({answer:'Synthetic queued local completion.',evidence:[],uncertainties:[]})};}};
  core.resources.memory=()=>freeRAM;
  core.emit=event=>{priorEmit(event);desktop.evaluate(e=>window.__deliver(e),event).catch(()=>{});};
  await desktop.reload();await desktop.getByRole('heading',{name:'What would you like to work on?'}).waitFor();
  await desktop.locator('#prompt').fill('Synthetic complete RAM wait input.');await desktop.locator('#send').click();
  await desktop.locator('[data-act=ram-wait]').waitFor();
  assert.equal(await desktop.locator('.processing-time').count(),0,'A failed request must not look completed');
  for(const theme of ['light','dark']){
    await desktop.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    assert.ok(await desktop.locator('[data-act=ram-wait]').isVisible());
    assert.match(await desktop.locator('.message.assistant').innerText(),/GiB needed.*GiB was free/s);
    await desktop.screenshot({path:path.join(root,`build/screenshots/ram-wait-${theme}.png`)});
  }
  await desktop.locator('[data-act=ram-wait]').click();await desktop.locator('[data-act=ram-cancel]').waitFor();
  freeRAM=8*GIB;core.resources.notify();
  await desktop.getByText('Synthetic queued local completion.',{exact:false}).first().waitFor();
  assert.equal(await desktop.locator('[data-act=ram-cancel]').count(),0);assert.equal(localCalls.length,1);
  assert.equal(localCalls[0].settings.localModelPath,row.file);assert.equal(localCalls[0].settings.localContext,2048);assert.match(JSON.stringify(localCalls[0].messages),/Synthetic complete RAM wait input/);
  checks.push('RAM wait renders in light/dark, keeps the same brain/full input, and refreshes completion without another turn');
  await desktop.locator('.new-chat').click();freeRAM=2*GIB;
  await desktop.locator('#prompt').fill('Synthetic cancelled RAM request.');await desktop.locator('#send').click();await desktop.locator('[data-act=ram-wait]').click();await desktop.locator('[data-act=ram-cancel]').click();
  freeRAM=8*GIB;core.resources.notify();await desktop.waitForFunction(()=>!document.querySelector('[data-act=ram-cancel]'));assert.equal(localCalls.length,1);
  checks.push('Cancelling the visible RAM wait cannot run it when memory later returns');
  await desktop.locator('.new-chat').click();freeRAM=2*GIB;
  await desktop.locator('#prompt').fill('Synthetic archived RAM request.');await desktop.locator('#send').click();await desktop.locator('[data-act=ram-wait]').click();await desktop.locator('[data-act=ram-cancel]').waitFor();
  const archivedWait=[...core.chatMemoryWait.offers.values()][0];assert.ok(archivedWait);
  await desktop.locator('[data-act=chat-archive]').click();await desktop.getByRole('heading',{name:'What would you like to work on?'}).waitFor();
  for(let i=0;i<100&&core.requests.has(archivedWait.chatId);i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(core.requests.has(archivedWait.chatId),false);assert.equal(core.resources.background,null);assert.equal(core.chat(archivedWait.chatId).archived,true);assert.equal(localCalls.length,1);
  checks.push('Archiving a waiting chat frees the background slot immediately while RAM is still low');
  await desktop.locator('.new-chat').click();freeRAM=2*GIB;
  await desktop.locator('#prompt').fill('Synthetic stale RAM request.');await desktop.locator('#send').click();await desktop.locator('[data-act=ram-wait]').waitFor();
  const offeredEntry=[...core.chatMemoryWait.offers.values()][0],changed=core.chat(offeredEntry.chatId);changed.messages[0].text='Synthetic edited input';core.saveChat(changed);
  await desktop.locator('[data-act=ram-wait]').click();await desktop.getByText('This wait is no longer available.',{exact:false}).waitFor();
  assert.equal(await desktop.locator('[data-act=ram-wait]').count(),0);assert.equal(generationCalls,cloudCallsBeforeRAM);assert.equal(localCalls.length,1);
  checks.push('Stale RAM offers disappear after rejection; no smaller brain or cloud request is made');
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
