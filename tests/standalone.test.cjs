"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { fixture } = require("./helpers.cjs");
const { fail, uuid } = require("../source/security.cjs");
const { OpenAIClient } = require("../source/api.cjs");
const { EVIDENCE_INSTRUCTIONS } = require("../source/routing-capabilities.cjs");

function local(core, respond) {
  const calls = [];
  core.resources.memory = () => 8 * 1024 ** 3;
  core.router.local = {
    validate: () => 0, modelName: () => "Synthetic local model",
    status: () => ({ state: "unloaded" }), close() {},
    async generate(settings, messages, options) {
      calls.push({ settings, messages, options });
      return respond ? respond(settings, messages, options) : {
        text: JSON.stringify({ answer: "The medication status is unknown from the supplied information.", evidence: [], uncertainties: ["No complete medication list supplied"] }), localTokens: 25
      };
    }
  };
  return calls;
}
async function ask(core, prompt, extra = {}) {
  const c = core.createChat();
  return (await core.send({ chatId: c.id, prompt, ...extra })).chat.messages.at(-1);
}

for (const processingMode of ["smart-hybrid", "local-first", "cloud-first", "local-only"]) {
  test(`${processingMode}: clinical/regulatory text uses local AI without an API key`, async t => {
    const { core, calls } = fixture(t);
    core.deleteKey(); core.saveSettings({ processingMode });
    const attempts = local(core);
    const answer = await ask(core, "Review this resident medication summary and identify regulatory evidence gaps.");
    assert.equal(answer.error, undefined);
    assert.equal(answer.processing.provider, "local");
    assert.match(answer.text, /status is unknown/);
    assert.equal(attempts.length, 1);
    assert.ok(attempts[0].options.instructions.includes(EVIDENCE_INSTRUCTIONS));
    assert.equal(calls.length, 0);
    assert.equal(core.settings().processingMode, processingMode);
  });
}

test("missing cloud model or HIPAA approval leaves local analysis usable without changing permissions", async t => {
  const { core, calls } = fixture(t); local(core);
  for (const settings of [{ model: "" }, { model: "test-model", approved: false }]) {
    core.saveSettings({ ...settings, processingMode: "cloud-first" });
    const before = core.settings();
    assert.equal((await ask(core, "Explain the supplied clinical observations")).processing.provider, "local");
    assert.deepEqual(core.settings(), before);
  }
  assert.equal(calls.length, 0);
});

test("no model or key does not prevent files, projects, guide and local commands", async t => {
  const { core, calls, dir } = fixture(t); core.deleteKey();
  assert.doesNotThrow(() => core.summary());
  const project = core.projectSave({ name: "Synthetic facility", instructions: "Flag missing data" });
  const file = path.join(dir, "census.csv"); fs.writeFileSync(file, "Unit,Count\nA,12\n");
  const imported = await core.importFile(file);
  assert.ok(core.store.get("file", imported.id));
  assert.equal(core.summary().projects[0].id, project.id);
  assert.equal((await ask(core, "/calc 12+7")).text, "12+7 = 19");
  assert.equal((await ask(core, "/help files")).processing.provider, "deterministic");
  const unavailable = await ask(core, "Review the facility situation");
  assert.equal(unavailable.error.code, "AI_SETUP");
  assert.equal(calls.length, 0);
});

test("configured Cloud First retains explicit provider choice and evidence instructions", async t => {
  const { core, calls } = fixture(t); const attempts = local(core);
  core.saveSettings({ processingMode: "cloud-first" });
  const answer = await ask(core, "Review the medication documentation");
  assert.equal(answer.processing.provider, "openai"); assert.equal(attempts.length, 0);
  assert.ok(calls[0].opts.instructions.includes(EVIDENCE_INSTRUCTIONS));
  assert.equal(calls[0].settings.hipaa, true);
});

test("unsupported local web and image operations remain explicit; HIPAA web restriction remains", async t => {
  const { core, calls } = fixture(t); const attempts = local(core); core.deleteKey();
  assert.equal((await ask(core, "Look for current guidance", { web: true })).error.code, "POLICY");
  core.saveSettings({ hipaa: false, publicModeConfirmed: true });
  const messages = [{ role: "user", content: [{ type: "input_image", image_url: "data:image/png;base64,AA==" }] }];
  await assert.rejects(core.router.generate(core.key(), core.settings(), messages), { code: "LOCAL_CAPABILITY" });
  assert.equal((await ask(core, "Search live websites", { web: true })).error.code, "LOCAL_CAPABILITY");
  assert.equal(attempts.length + calls.length, 0);
});

test("offline OpenAI failure falls back through real client boundary to local text and records attempted usage", async t => {
  let requests = 0;
  const client = new OpenAIClient(async () => { requests++; throw new TypeError("Synthetic offline network"); });
  const { core } = fixture(t, client); const attempts = local(core);
  core.saveSettings({ processingMode: "cloud-first" });
  const answer = await ask(core, "Review the uploaded medication documentation");
  assert.equal(answer.error, undefined); assert.equal(answer.processing.provider, "local");
  assert.equal(answer.processing.reason, "cloud_unavailable_local_fallback");
  assert.match(answer.text, /provider request was attempted/);
  assert.equal(requests, 1); assert.equal(attempts.length, 1);
  const usage = core.store.list("usage");
  assert.equal(usage.filter(r => r.provider === "openai" && r.failed && r.usageUnknown).length, 1);
  assert.equal(usage.filter(r => r.provider === "local").length, 1);
});

test("failed escalation reuses the existing local draft without a second model call or duplicate token entry", async t => {
  const { core } = fixture(t, { generate: async () => { throw fail("NETWORK"); } });
  const attempts = local(core);
  const answer = await ask(core, "Review this resident summary");
  assert.equal(answer.processing.provider, "local"); assert.equal(attempts.length, 1);
  assert.equal(core.store.list("usage").filter(r => r.provider === "local").length, 1);
  assert.equal(core.store.list("usage").find(r => r.provider === "local").localTokens, 25);
});

test("partial cloud output is preserved without mixing in or retrying a local answer", async t => {
  const { core } = fixture(t, { generate: async (_key, _s, _m, opts) => { opts.onDelta("Partial cloud text"); throw fail("NETWORK"); } });
  const attempts = local(core); core.saveSettings({ processingMode: "cloud-first" });
  const answer = await ask(core, "Review a document");
  assert.equal(answer.error.code, "NETWORK"); assert.equal(answer.text, "Partial cloud text");
  assert.equal(attempts.length, 0);
});

test("cancellation or policy refusal never triggers offline fallback", async t => {
  const { core } = fixture(t); const attempts = local(core);
  core.saveSettings({ processingMode: "cloud-first" });
  for (const code of ["CANCELLED", "POLICY", "AUTH", "CREDITS"]) {
    core.client.generate = async () => { throw fail(code); };
    assert.equal((await ask(core, "Review this document")).error.code, code);
  }
  assert.equal(attempts.length, 0);
});

test("deleting a key while local reasoning runs prevents stale-key escalation", async t => {
  const { core, calls } = fixture(t);
  local(core, () => { core.deleteKey(); return { text: "Local draft", localTokens: 7 }; });
  assert.equal((await ask(core, "Review this medication report")).error.code, "CANCELLED");
  assert.equal(calls.length, 0);
});

test("changed credentials at the queued cloud boundary are rejected without a request or usage charge", async t => {
  const { core, calls } = fixture(t);
  core.saveSettings({ hipaa: false, publicModeConfirmed: true, processingMode: "cloud-first" });
  core.resources.withAI = async fn => { core.saveKey("sk-synthetic-replacement"); return fn(); };
  const answer = await ask(core, "Explain a situation");
  assert.equal(answer.error.code, "CANCELLED");
  assert.equal(calls.length, 0); assert.equal(core.store.list("usage").length, 0);
});

test("uploaded generic report reaches the same keyless local router in an exported report job", async t => {
  const { core, calls, dir } = fixture(t); core.deleteKey(); const attempts = local(core);
  const source = path.join(dir, "synthetic-medications.csv");
  fs.writeFileSync(source, "Resident,Medication status\nSynthetic A,Unknown\n");
  const file = await core.importFile(source);
  const id = uuid();
  await core.runJob({ id, title: "Synthetic documentation review", prompt: "Review medication documentation and flag unknown information", fileIds: [file.id], format: "txt" });
  const job = core.store.get("job", id);
  assert.equal(job.status, "completed", job.reason);
  assert.equal(job.processing.provider, "local"); assert.equal(calls.length, 0);
  assert.ok(attempts[0].messages[0].content.some(p => /Synthetic A,Unknown/.test(p.text)));
  assert.match(fs.readFileSync(path.join(core.settings().workspace, job.output), "utf8"), /status is unknown/);
  assert.equal(core.integrations.status("pcc").state, "not_configured");
});

test("provider summaries distinguish configuration from authorization without revealing keys", t => {
  const { core } = fixture(t);
  core.modelManager = { catalog: () => [{ tier: "small", installed: true }] };
  core.deleteKey();
  const summary = core.summary();
  assert.equal(summary.providerCapabilities.local.configured, true);
  assert.equal(summary.providerCapabilities.selected.ready, false);
  assert.equal(summary.providerCapabilities.selected.reason, "KEY");
  assert.doesNotMatch(JSON.stringify(summary.providerCapabilities), /sk-/);
});


test('Ollama is a local provider in Local Only; non-OpenAI cloud providers retain explicit routing and budgets',async t=>{
 const {core,calls}=fixture(t);core.saveSettings({provider:'ollama',model:'synthetic-local-model',processingMode:'local-only'});
 assert.equal(core.summary().providerCapabilities.selected.ready,true);
 const answer=await ask(core,'Review the supplied record');assert.equal(answer.processing.provider,'ollama');assert.equal(calls[0].settings.provider,'ollama');
 core.saveSettings({provider:'groq',hipaa:false,publicModeConfirmed:true,model:'synthetic-groq',processingMode:'cloud-first',allowCloud:true});
 core.saveKey('gsk_'+ 'synthetic-'+'X'.repeat(20),'groq');
 const cloud=await ask(core,'Review the supplied record');assert.equal(cloud.processing.provider,'groq');assert.equal(calls.at(-1).settings.provider,'groq');
 require('../source/workflows/budget.cjs').save(core,{enabled:true,maxRequests:0});
 const blocked=await ask(core,'Review the supplied record');assert.equal(blocked.error.code,'BUDGET');
});

test('built-in helper stays available without pretending templates are model inference',async t=>{
 const {core,calls}=fixture(t);core.deleteKey();core.saveSettings({provider:'local',processingMode:'local-only'});
 const answer=await ask(core,'Draft a general memo about reviewing source records');
 assert.equal(answer.processing.provider,'local');assert.match(answer.text,/no model inference/);assert.equal(answer.processing.reliability.score,null);assert.equal(calls.length,0);
});

 test('Ollama waits for report-browser ownership and retires only the app-owned model',async t=>{
 const {core,calls}=fixture(t);core.saveSettings({provider:'ollama',model:'synthetic-local-model',processingMode:'cloud-first'});core.resources.memory=()=>8*1024**3;
 const owner={};await core.resources.reserveBrowser(owner,'Synthetic report browser');let stopped=0;
 core.router.local={child:{},busy:false,close(){}};core.router.local.stop=()=>{stopped++;core.router.local.child=null;};core.router.local.waitStopped=async()=>{};
 const pending=ask(core,'Review the supplied record');await new Promise(r=>setImmediate(r));assert.equal(calls.length,0);assert.equal(stopped,0);assert.equal(core.resources.ramTimer,null);
 core.resources.releaseBrowser(owner);await pending;assert.equal(calls.length,1);assert.equal(stopped,1);assert.equal(core.resources.ai,null);
 });
