"use strict";
// Real Edge + real encrypted Core/SQLite on an isolated ephemeral loopback fixture.
// No production server, accounts, downloads, models, native apps or owner data.
const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),assert=require("node:assert/strict");
const {chromium}=require("playwright-core"),{fixture}=require("./helpers.cjs"),{uuid,safeError}=require("../source/security.cjs");
const docs=require("../source/workflows/documents.cjs"),workflows=require("../source/workflows/index.cjs");
const cleanup=[],checks=[],errors=[],rpcCalls=[],{core,calls}=fixture({after:fn=>cleanup.push(fn)});
core.deleteKey("openai");core.saveSettings({processingMode:"local-only",allowCloud:false});
const original={id:uuid(),name:"Synthetic selected policy.txt",text:"[Page 1]\nSYNTHETIC policy reference.\n[Page 2]\nSSN 123-45-6789. Contact tester@example.invalid. Phone (212) 555-0100. DOB: 01/02/2000. MRN: SYN12345. <img src=x onerror=window.syntheticInjection=true>",bytes:Buffer.from("SYNTHETIC original bytes").toString("base64"),hipaa:true,updated:Date.now()};
core.store.put("file",original.id,original);
const other={...original,id:uuid(),name:"Other synthetic source.txt",text:"Unrelated synthetic source with unknown coverage."};core.store.put("file",other.id,other);
const project=core.projectSave({name:"Synthetic policy collection"});docs.link(core,{projectId:project.id,fileIds:[original.id]});
const empty=core.projectSave({name:"Synthetic empty collection"});
const uiRoot=path.resolve(__dirname,"../source/ui"),evidence=process.env.PRIVATE_AI_UI_EVIDENCE || path.resolve(__dirname,"../Validation/four-phase-2026-10-14/document-ui");
let browser,server,holdNextPrivacy=false,releasePrivacy=null;
const waitFor=async predicate=>{for(let attempt=0;attempt<200;attempt++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,20));}throw Error("Synthetic UI state did not become available");};
(async()=>{
  server=http.createServer((request,response)=>{
    if(request.url==="/"){response.setHeader("content-type","text/html");response.end('<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/source/ui/style.css"></head><body><main id="content"></main></body></html>');return;}
    let file;try{file=path.resolve(__dirname,"..","."+decodeURIComponent(request.url.split("?")[0]));}catch{response.statusCode=400;response.end();return;}
    if(!file.startsWith(uiRoot+path.sep)){response.statusCode=404;response.end();return;}
    try{response.setHeader("content-type",file.endsWith(".mjs")?"text/javascript":file.endsWith(".css")?"text/css":"text/plain");response.end(fs.readFileSync(file));}catch{response.statusCode=404;response.end();}
  });await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));cleanup.push(()=>new Promise(resolve=>server.close(resolve)));
  browser=await chromium.launch({headless:true,executablePath:process.env.PRIVATE_AI_TEST_CHROMIUM || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"});cleanup.push(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1280,height:950}});page.on("pageerror",error=>errors.push(error.message));
  await page.exposeFunction("fixtureRPC",async(op,data={})=>{
    rpcCalls.push(op);
    try{
      const result=op==="stop"?core.stop(data.id):await workflows.dispatch(core,op,data);
      if(op==="workflowDisclosureReview" && holdNextPrivacy){holdNextPrivacy=false;return await new Promise(resolve=>{releasePrivacy=()=>resolve({ok:true,result});});}
      return {ok:true,result};
    }catch(error){return {ok:false,error:safeError(error)};}
  });
  await page.goto("http://127.0.0.1:"+server.address().port);
  const section=docs.sections(original).find(row=>row.page===2).id;
  await page.evaluate(async({fileId,sectionId})=>{
    const {createWorkflowUI}=await import("/source/ui/workflows.mjs");
    const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const field=(label,name,value="",type="text")=>`<label class="field">${esc(label)}<input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}"></label>`;
    window.notices=[];window.testUI=createWorkflowUI({esc,field,toast:message=>window.notices.push(message),api:async(op,data)=>{const result=await window.fixtureRPC(op,data);if(!result.ok)throw Error(result.error.message);return result.result;},refresh:async()=>{}});
    Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText:async text=>window.syntheticClipboard=text}});
    await window.testUI.render(document.querySelector("#content"),"workspace",{fileId,sectionId,query:"tester@example.invalid"});
  },{fileId:original.id,sectionId:section});
  const detail=page.locator(`[data-file-details="${original.id}"]`);
  assert.equal(await page.locator("[data-file-details]").count(),1);assert.equal(await detail.getAttribute("open"),"");
  await detail.locator("[data-source-review]").waitFor({state:"attached"});
  assert.match(await detail.locator("[data-source-status]").innerText(),/Currency unknown/);
  assert.equal(await page.locator(`[data-section-file="${original.id}"][data-section-id="${section}"]`).count(),1);
  checks.push("Universal source navigation scopes one file, opens its review and retains requested section");
  await detail.locator("details").filter({has:page.locator("[data-source-review]")}).locator("summary").first().click();
  const metadata=detail.locator("[data-source-review]"),version="Synthetic v1 <script>window.syntheticInjection=true</script>";
  await metadata.locator('[name="sourceDate"]').fill("2000-01-01");await metadata.locator('[name="effectiveDate"]').fill("2000-01-02");
  await metadata.locator('[name="reviewDate"]').fill(docs.localCalendarDay());await metadata.locator('[name="reviewDue"]').fill(docs.localCalendarDay());
  await metadata.locator('[name="version"]').fill(version);await metadata.locator('[name="reviewer"]').fill("Synthetic owner reviewer");await metadata.locator('[name="approvedAttestation"]').check();
  await metadata.locator('button[type="submit"]').click();
  await page.waitForFunction(()=>window.notices.some(message=>message.includes("Source review saved")));
  assert.equal(await detail.locator('[name="version"]').inputValue(),version);
  assert.equal(core.store.get("file",original.id).referenceReview.version,version);
  const {referenceReview,...unchanged}=core.store.get("file",original.id);assert.deepEqual(unchanged,original);
  assert.match(await detail.innerText(),/Independent proof not established/);assert.equal(await page.evaluate(()=>window.syntheticInjection),undefined);
  checks.push("Metadata save reloads actual encrypted fields without changing original bytes, timestamps, HIPAA or executing HTML");
  let snapshot=docs.review(core,{fileId:original.id});docs.saveReview(core,{fileId:original.id,revision:snapshot.revision,metadata:{...snapshot.metadata,version:"Synthetic newer owner review"}});
  await detail.locator("details").filter({has:page.locator("[data-source-review]")}).locator("summary").first().click();
  await detail.locator('[name="version"]').fill("Synthetic stale form");await detail.locator('[data-source-review] button[type="submit"]').click();
  await page.waitForFunction(()=>window.notices.some(message=>/changed/i.test(message) && !message.includes("Original document unchanged")));
  assert.equal(core.store.get("file",original.id).referenceReview.version,"Synthetic newer owner review");
  await detail.locator("[data-doc-reload]").click();await page.waitForFunction(()=>document.querySelector('[name="version"]')?.value==="Synthetic newer owner review");
  checks.push("Stale metadata save fails and explicit reload recovers current source review");
  await detail.locator("[data-privacy-details] > summary").click();await detail.locator("[data-privacy-refresh]").click();
  const privacy=detail.locator("[data-privacy-panel]");await privacy.locator("[data-privacy-span]").first().waitFor();
  assert.match(await privacy.innerText(),/does not mean PHI-free/);assert.equal(await privacy.locator("[data-privacy-span]:checked").count(),0);
  await privacy.locator("label.check").filter({has:page.locator("strong",{hasText:/^email$/})}).locator("input").check();
  await privacy.locator("[data-redacted-generate]").click();await privacy.locator('[aria-label="Redacted copy"]').waitFor();
  assert.equal(await privacy.locator('[aria-label="Redacted copy"]').inputValue(),original.text.replace("tester@example.invalid","[REDACTED]"));
  await privacy.locator("[data-redacted-copy]").click();await page.waitForFunction(()=>typeof window.syntheticClipboard==="string");
  assert.equal(await page.evaluate(()=>window.syntheticClipboard),original.text.replace("tester@example.invalid","[REDACTED]"));
  assert.equal(core.store.get("file",original.id).text,original.text);assert.equal(core.store.get("file",original.id).bytes,original.bytes);assert.equal(calls.length,0);
  checks.push("Selected candidate produces copied redacted text only after fresh source validation; original and Local Only stay intact");
  await privacy.locator("details > summary").click();const start=original.text.indexOf("SYNTHETIC");
  await privacy.locator('[name="manualStart"]').fill(String(start+1));await privacy.locator('[name="manualEnd"]').fill(String(start+9));
  await privacy.locator("[data-manual-add]").click();await privacy.locator("strong",{hasText:/^manual$/}).waitFor();
  await privacy.locator("label.check").filter({has:page.locator("strong",{hasText:/^manual$/})}).locator("input").check();
  await privacy.locator("[data-redacted-generate]").click();await privacy.locator('[aria-label="Redacted copy"]').waitFor();
  assert.equal(await privacy.locator('[aria-label="Redacted copy"]').inputValue(),original.text.replace("SYNTHETIC","[REDACTED]"));
  assert.equal(core.store.get("file",original.id).text,original.text);checks.push("Manual inclusive positions become exact backend ranges; only explicitly selected ranges are replaced");
  fs.mkdirSync(evidence,{recursive:true});await page.screenshot({path:path.join(evidence,"library-source-review.png"),fullPage:true});
  await page.locator("#wf-all-files").click();await page.waitForFunction(()=>document.querySelectorAll("[data-file-details]").length===2);
  await page.locator("#wf-project").selectOption(empty.id);await page.waitForFunction(()=>document.querySelectorAll("[data-file-details]").length===0);
  await page.locator("#wf-project").selectOption(project.id);await page.waitForFunction(()=>document.querySelectorAll("[data-file-details]").length===1);
  const loaded=page.locator(`[data-file-details="${original.id}"]`);await loaded.locator(":scope > summary").click();await loaded.locator("[data-source-review]").waitFor({state:"attached"});
  checks.push("Explicit collection navigation clears single-file focus and empty collections never show unrelated files");
  await loaded.locator("[data-privacy-details] > summary").click();holdNextPrivacy=true;await loaded.locator("[data-privacy-refresh]").click();await waitFor(()=>!!releasePrivacy);
  await page.evaluate(()=>{window.testUI.stop();document.querySelector("#content").innerHTML="<h1>New chat</h1>";});core.lock();releasePrivacy();releasePrivacy=null;
  await page.waitForTimeout(100);assert.equal(await page.locator("#content").innerText(),"New chat");core.unlock();
  assert.deepEqual(errors,[]);assert.equal(calls.length,0);assert.equal(core.settings().processingMode,"local-only");
  assert.equal(rpcCalls.some(op=>/outlook|whatsapp|Send|Export|Setup/.test(op)),false);
  checks.push("Navigation/lock discards delayed privacy response without restoring the Library or calling external integrations");
  console.log(JSON.stringify({passed:true,checks,cloudInferenceCalls:0,sourceOriginalPreserved:true,ephemeralLoopback:true}));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{releasePrivacy?.();for(const fn of cleanup.reverse())await fn();});
