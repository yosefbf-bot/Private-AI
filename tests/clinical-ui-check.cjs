'use strict';
// Real rendered clinical controls with synthetic Core/SQLite data only.
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),{fixture}=require('./helpers.cjs');
test('clinical UI safety',async t=>{
 const {core}=fixture(t),root=path.resolve(__dirname,'..');let delayed=null,release=null,started=null;
 const dispatch=async(op,data)=>{
  if(op===delayed){delayed=null;started?.();await new Promise(r=>release=r);}
  if(op.startsWith('snf'))return require('../source/snf/index.cjs').dispatch(core,op,data);
  if(op==='workflowSummary')return require('../source/workflows/index.cjs').dispatch(core,op,data);
  return require('../source/operations-copilot.cjs').dispatch(core,op,data);
 };
 const server=http.createServer((req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<main id="content"></main>');return;}
  const file=path.resolve(root,'.'+req.url);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const browser=await chromium.launch({headless:true,executablePath:process.env.PRIVATE_AI_TEST_CHROMIUM});t.after(()=>browser.close());
 const page=await browser.newPage();page.setDefaultTimeout(5000);await page.exposeFunction('testCall',dispatch);
 const init=async module=>{
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(async module=>{
   window.messages=[];window.copies=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>copies.push(text)},configurable:true});
   const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
   const mod=await import('/source/ui/'+module+'.mjs');const factory=mod.createSNFUI||mod.createOperationsCopilotUI||mod.createImportCenter;
   window.view=factory({api:window.testCall,esc,toast:m=>messages.push(m),refresh:async()=>{},renderPage:()=>{},form:async()=>null});
  },module);
 };
 const report=(type,rows)=>({type,date:new Date().toISOString(),rows});
 await core.snf.ingestReports([report('census',[{residentId:'synthetic',name:'Synthetic Review Resident'}]),report('med_changes',[{residentId:'synthetic',medication:'acetaminophen',changeType:'New Order'}])]);
 const alert=core.store.list('snf_alert').find(a=>a.severity==='medium');assert.ok(alert,'Uses actual Review rule output');
 await t.test('review filters show actual rule output and recover after an empty search',async()=>{
  await init('snf-ui');await page.evaluate(id=>view.render(document.querySelector('#content'),{alertId:id}),alert.id);
  await page.locator('[data-filter=review]').click();assert.equal(await page.locator('.snf-alert-card').count(),1);
  await page.locator('#snf-alert-search').fill('not found');assert.equal(await page.locator('.snf-alert-card').count(),0);
  await page.locator('#snf-alert-search').fill('acetaminophen');assert.equal(await page.locator('.snf-alert-card').count(),1);
  assert.doesNotMatch(await page.textContent('#content'),/All clinical surveillance items in this view are resolved/);
 });
 await t.test('reference protocols and both copy controls obey review safeguards',async()=>{
  const sbar=await dispatch('sbarGenerate',{residentName:'Synthetic Resident'});
  await init('operations-copilot');await page.evaluate(id=>view.render(document.querySelector('#content'),{sbarId:id,tab:'sbar'}),sbar.id);
  assert.equal(await page.inputValue('#ops-notify-recipient'),'');
  assert.equal(await page.locator('#ops-add-protocol-rec-btn').isDisabled(),true);
  await page.locator('#sbar-edit-situation-concern').fill('Unsaved synthetic change');
  for(const id of ['ops-copy-sbar-btn','ops-copy-adapted-btn'])assert.equal(await page.locator('#'+id).isDisabled(),true,id);
  assert.equal(await page.locator('#ops-adapted-text').getAttribute('readonly'),'');
  const row=core.store.get('sbar',sbar.id);delete row.evidenceVersion;core.store.put('sbar',row.id,row);
  await page.evaluate(id=>view.render(document.querySelector('#content'),{sbarId:id,tab:'sbar'}),sbar.id);
  for(const id of ['ops-copy-sbar-btn','ops-copy-adapted-btn'])assert.equal(await page.locator('#'+id).isDisabled(),true,id);
  assert.deepEqual(await page.evaluate(()=>copies),[]);
 });
 await t.test('unsaved edits and manual recommendations cannot be signed off after rerender',async()=>{
  const sbar=await dispatch('sbarGenerate',{residentName:'Synthetic Resident'});
  await init('operations-copilot');await page.evaluate(id=>view.render(document.querySelector('#content'),{sbarId:id,tab:'sbar'}),sbar.id);
  await page.locator('#sbar-edit-situation-concern').fill('Unsaved change');await page.locator('#ops-toggle-sources-btn').click();
  assert.equal(await page.locator('#ops-review-sbar-btn').isDisabled(),true);
  await dispatch('sbarReview',{id:sbar.id,reviewer:'Synthetic Reviewer'});
  await page.evaluate(id=>view.render(document.querySelector('#content'),{sbarId:id,tab:'sbar'}),sbar.id);
  await page.locator('#sbar-edit-situation-concern').fill('Unsaved reviewed change');await page.locator('#ops-toggle-sources-btn').click();
  assert.equal(await page.locator('#ops-finalize-sbar-btn').isDisabled(),true);
  await page.evaluate(id=>view.render(document.querySelector('#content'),{sbarId:id,tab:'sbar'}),sbar.id);
  page.once('dialog',d=>d.accept('Synthetic request'));await page.locator('#ops-add-manual-rec-btn').click();
  assert.equal(await page.locator('#ops-finalize-sbar-btn').isDisabled(),true);
  assert.equal(core.store.get('sbar',sbar.id).status,'reviewed');
 });
 await t.test('handoff displays normalized incident detail and missing-data uncertainty',async()=>{
  await core.snf.ingestReports([report('falls',[{residentId:'synthetic',eventDate:new Date().toISOString(),location:'Synthetic corridor',injuryLevel:'Unknown'}]),
   report('transfers',[{residentId:'synthetic',eventDate:new Date().toISOString(),destination:'Synthetic hospital',reason:'Synthetic transfer reason'}]),
   report('wounds',[{residentId:'synthetic',site:'Synthetic heel'}]),report('labs',[{residentId:'synthetic',testName:'Synthetic lab',criticalValue:true}])]);
  await init('operations-copilot');await page.evaluate(()=>{view.renderFullView=function(container){container.innerHTML=this.renderHandoffView({});this.attachEvents(container);};return view.render(document.querySelector('#content'),{tab:'handoff'});});
  await page.locator('#ops-gen-shift-handoff-btn').click();await page.waitForFunction(()=>document.querySelector('.ops-handoff-12grid'));
  const text=await page.textContent('#content');
  for(const detail of ['Synthetic corridor','Synthetic hospital','Synthetic heel','Synthetic lab','does not establish absence','Source:'])assert.ok(text.includes(detail),detail);
  assert.doesNotMatch(text,/Zero falls reported|No ER runs/);
 });
 for(const [module,op,options] of [['operations-copilot','operationsSummary',{tab:'sbar'}],['snf/import-center','snfImports',{}]]){
  await t.test(`${module} cannot repaint after lock or navigation`,async()=>{
   await init(module);delayed=op;const began=new Promise(r=>started=r);
   const load=page.evaluate(options=>view.render(document.querySelector('#content'),options),options);await began;
   await page.evaluate(()=>{view.stop?.();document.querySelector('#content').innerHTML='<h1>Locked</h1>';});release();await load;
   assert.equal(await page.textContent('#content'),'Locked');
  });
 }
 await t.test('an alert callback cannot repaint or load more clinical data after lock',async()=>{
  await init('snf-ui');await page.evaluate(id=>view.render(document.querySelector('#content'),{alertId:id}),alert.id);
  delayed='snfAcknowledgeAlert';const began=new Promise(r=>started=r);
  await page.locator('[data-act=ack-alert]').click();await began;
  await page.evaluate(()=>{view.stop();document.querySelector('#content').innerHTML='<h1>Locked</h1>';});release();
  await page.waitForFunction(()=>window.messages.length>0||document.querySelector('#content').textContent==='Locked');
  // Flush the queued IPC and UI promises without a timing-dependent sleep.
  await page.evaluate(async()=>{await window.testCall('snfAlerts');await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  assert.equal(await page.textContent('#content'),'Locked');
 });
});
