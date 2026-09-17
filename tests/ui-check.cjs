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
  switch (op) {
    case "userGuide": return require("../source/app-guide.json");
    case "saveDraft": return core.saveDraft(data.id,data.text);
    case "healthAcknowledge": core.stability.acknowledge();return true;
    case "messagingStatus":
      return {settings:require("../source/messaging.cjs").DEFAULT,state:"off",code:"synthetic-code",windows:{pid:null}};
    case "browserRecipes": return [];
    case "localStatus": return {brain:{state:"failed",error:{code:"LOCAL_DEPENDENCY",message:"Engine component missing",exitCode:"0xc0000135"}}};
    case "downloadModel": requestedModel=data.modelId; return {state:"downloading"};
    case "summary":
      return { ...core.summary(), autostart: false };
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
    window.privateAI = {
      call: (...args) => window.testCall(...args),
      onEvent: (cb) => (window.__deliver = cb),
    };
  });
  await desktop.goto(base + "/source/ui/index.html");
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
  await desktop.locator('#top-actions [data-view="health"]').click();
  await desktop.locator('h1').filter({hasText:'Health & recovery'}).waitFor();
  await desktop.locator('[name="ramReserveMB"]').fill('1536');
  await desktop.locator('[name="keepBrainMinutes"]').fill('2');
  await desktop.locator('[data-act="health-save"]').click();
  await desktop.waitForFunction(()=>document.querySelector('[name="ramReserveMB"]').value==='1536');
  assert.equal(core.settings().ramReserveMB,1536);
  assert.equal(core.settings().keepBrainMinutes,2);
  await desktop.screenshot({path:path.join(root,'build/screenshots/health-recovery.png')});
  checks.push('Health screen saves validated settings through the real Core');
  await desktop.locator('.new-chat').click();

  await desktop
    .locator("#prompt")
    .fill("Prepare a weekly operations report from these synthetic notes.");
  await desktop.locator("#send").click();
  await desktop.locator(".usage").first().waitFor();
  assert.equal(await desktop.locator(".message.assistant table").count(), 1);
  checks.push("Streaming answer renders a table and token counts");
  await desktop.screenshot({
    path: path.join(root, "build/screenshots/desktop-chat.png"),
  });
  const noted = core.createChat({});
  noted.messages = [{role:"assistant",text:"The recommended larger model was unavailable or did not fit. Review this Small-model draft.\n\nLocal draft — not sufficiently verified. No OpenAI call was made.\n\nYes. Open **User guide** in the sidebar for instructions on models, files, schedules and privacy. You can also ask me how to use a feature."}];
  core.saveChat(noted);
  await desktop.reload();
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
  assert.equal(await desktop.locator('#guide-topics details').count(),24);
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
  await desktop.locator('#sidebar [data-view="projects"]').click();
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
  await desktop.locator('#sidebar [data-view="schedules"]').click();
  await desktop.locator('[data-act="schedule-new"]').click();
  await desktop.locator('[name="name"]').fill("Morning report");
  await desktop
    .locator('[name="prompt"]')
    .fill("Draft a short status report with follow-up items.");
  await desktop.locator("#modal-submit").click();
  await desktop
    .getByRole("heading", { name: "Morning report", exact: true })
    .waitFor();
  checks.push("Schedule creation saves through the real Core");
  await desktop.locator('#sidebar [data-view="worker"]').click();
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
    .getByText("Outlook message.txt", { exact: false })
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
  await desktop.locator('#sidebar [data-view="processing"]').click();
  await desktop.locator('[name="processingMode"]').selectOption('local-only');
  await desktop.locator('[data-act="hybrid-save"]').click();
  await desktop.waitForFunction(()=>document.querySelector('#model-label').textContent==='Local Only');
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
  await desktop.locator('#sidebar [data-view="usage"]').click();
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
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    server.close();
    for (const fn of after) fn();
  });
