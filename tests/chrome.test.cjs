const { test } = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path");
test("Include page OFF does not query tabs or execute page extraction", async () => {
  const { buildQuestion } = await import("../chrome_extension/capture.mjs");
  let queries = 0,
    extracts = 0;
  const browser = {
    tabs: {
      query: async () => {
        queries++;
        throw Error();
      },
    },
    scripting: {
      executeScript: async () => {
        extracts++;
        throw Error();
      },
    },
  };
  assert.deepEqual(
    await buildQuestion(
      { prompt: "General question", includePage: false },
      browser,
    ),
    { prompt: "General question" },
  );
  assert.equal(queries, 0);
  assert.equal(extracts, 0);
});
test("Page capture runs only for an explicitly enabled request", async () => {
  const { buildQuestion } = await import("../chrome_extension/capture.mjs");
  const calls = [];
  const browser = {
    tabs: {
      query: async () => [
        { id: 3, title: "not sent", url: "https://not-sent.example" },
      ],
    },
    scripting: {
      executeScript: async (options) => {
        calls.push(options);
        assert.equal(options.target.tabId, 3);
        return [{ result: { text: "Selected reference" } }];
      },
    },
  };
  const question = await buildQuestion(
    { prompt: "Explain", includePage: true },
    browser,
  );
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].files,['vendor/readability.js']);
  assert.equal(typeof calls[1].func,'function');
  assert.deepEqual(question.page, {
    text: "Selected reference",
    confirmed: true,
  });
  assert.equal(question.url, undefined);
  assert.equal(question.title, undefined);
  calls.length=0;
  await buildQuestion({prompt:'Explain',includePage:true,selectionOnly:true},browser);
  assert.equal(calls.length,1);assert.equal(calls[0].files,undefined);assert.deepEqual(calls[0].args,[true]);
});
test("Blank questions cannot trigger extraction even with the checkbox enabled", async () => {
  const { buildQuestion } = await import("../chrome_extension/capture.mjs");
  await assert.rejects(
    buildQuestion(
      { prompt: " ", includePage: true },
      { tabs: { query: () => assert.fail() } },
    ),
  );
});

test('Bitwarden vault and extension pages are rejected before capture executes',async()=>{
 const {buildQuestion}=await import('../chrome_extension/capture.mjs');
 for(const url of ['https://vault.bitwarden.com/#/vault','https://vault.bitwarden.eu/#/vault','chrome-extension://synthetic/vault.html','moz-extension://synthetic/vault.html'])
  await assert.rejects(buildQuestion({prompt:'Summarize',includePage:true},{tabs:{query:async()=>[{id:3,url}]},scripting:{executeScript:()=>assert.fail('vault captured')}}),/Password-manager pages are excluded/);
});
test("Manifest has no automatic content scripts, all-site access, browsing history, or storage permissions", () => {
  const m = require("../chrome_extension/manifest.json");
  assert.equal(m.content_scripts, undefined);
  assert.equal(m.host_permissions, undefined);
  for (const p of [
    "tabs",
    "history",
    "storage",
    "cookies",
    "debugger",
    "webRequest",
    "<all_urls>",
  ])
    assert.equal(m.permissions.includes(p), false);
  assert.equal(m.manifest_version, 3);
  assert.ok(m.permissions.includes("activeTab"));
  assert.ok(m.permissions.includes("nativeMessaging"));
});
test("Background worker registers no page-reading or navigation listeners", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../chrome_extension/background.mjs"),
    "utf8",
  );
  for (const token of [
    "executeScript",
    "tabs.onUpdated",
    "webNavigation",
    "MutationObserver",
    "fetch(",
  ])
    assert.equal(src.includes(token), false);
});
test("Extension code has no direct provider endpoint or API-key configuration", () => {
  for (const name of [
    "panel.mjs",
    "background.mjs",
    "capture.mjs",
    "manifest.json",
  ]) {
    const src = fs.readFileSync(
      path.join(__dirname, "../chrome_extension", name),
      "utf8",
    );
    assert.equal(src.includes("api.openai.com"), false);
    assert.equal(src.includes("sk-"), false);
    assert.equal(src.includes("storage.local"), false);
  }
});
test("Desktop security uses sandboxed isolated UI and no HTTP listener", () => {
  const src = fs
    .readFileSync(path.join(__dirname, "../source/main.cjs"), "utf8")
    .replace(/\s/g, "")
    .replaceAll('"', "'");
  for (const value of [
    "contextIsolation:true",
    "nodeIntegration:false",
    "sandbox:true",
    "webSecurity:true",
  ])
    assert.ok(src.includes(value));
  assert.equal(src.includes("require('node:http')"), false);
  assert.equal(src.includes("'0.0.0.0'"), false);
  assert.equal(src.includes("rejectUnauthorized:false"), false);
  assert.equal(src.includes("python.exe"), false);
  assert.equal(src.includes("powershell"), false);
  assert.ok(src.includes("senderFrame.url!==uiURL"));
  assert.ok(src.includes("!browserHosts.allowedInvocation(process.argv,localRoot)"));
});
