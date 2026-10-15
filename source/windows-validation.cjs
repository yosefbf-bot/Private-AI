'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const rawFs=require('original-fs');
const sha=f=>crypto.createHash('sha256').update(rawFs.readFileSync(f)).digest('hex');
async function run({core,win,reportPath,exe,asar}){
 if(process.platform!=='win32')throw Error('Windows validation must execute on Windows');
 assert.equal(path.resolve(core.root),path.join(path.dirname(reportPath),'app-data'),'Acceptance must use isolated app-data');
 const evidence={version:require('../package.json').version,platform:process.platform,windowsApplicationExecuted:true,actualModelInferenceExecuted:false,passed:false,started:new Date().toISOString(),executableSHA256:sha(exe),applicationArchiveSHA256:sha(asar),checks:[]};
 // Hold only optional timed enrichment in this synthetic foreground/retention
 // fixture. Otherwise newly configured inference can start a separate note
 // draft just before exit; real interrupted work must retain its recovery gate.
 const lifecycle=require('./windows-validation-lifecycle.cjs');
 evidence.validationIsolation=lifecycle.quiesceAutomaticEnrichment(core);
 try{
  core.saveSettings({processingMode:'local-only',allowCloud:false,workspace:path.join(path.dirname(reportPath),'reports'),approved:true});
  const deadline=Date.now()+45000;let ready=false;
  while(Date.now()<deadline){if(win.isDestroyed())throw Error('Window destroyed');try{ready=await win.webContents.executeJavaScript("!!document.querySelector('#sidebar') && !!window.privateAI && !!document.querySelector('#content')");}catch{}if(ready&&!win.webContents.isLoading())break;await new Promise(r=>setTimeout(r,200));}
  assert.equal(ready,true);evidence.checks.push('packaged renderer loaded with isolated preload');
  win.webContents.setBackgroundThrottling(false);
  const capture=async()=>{
   // Hidden/minimized Windows test launches can retain an older compositor frame.
   await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   await new Promise(r=>setTimeout(r,250));
   return win.webContents.capturePage();
  };
  evidence.rendererReadyMs=Date.now()-Date.parse(evidence.started);
  await new Promise(r=>setTimeout(r,1500));
  evidence.loadedApplicationWorkingSetKiB=require('electron').app.getAppMetrics().reduce((n,p)=>n+(p.memory?.workingSetSize||0),0);
  const summary=await win.webContents.executeJavaScript("window.privateAI.call('summary')");assert.equal(summary.ok,true);evidence.checks.push('renderer IPC summary succeeded');
  const created=await win.webContents.executeJavaScript("window.privateAI.call('createChat',{temporary:true})");assert.equal(created.ok,true);
  evidence.availableMemoryBeforeChatBytes=core.resources.memory();
  const result=await win.webContents.executeJavaScript("window.privateAI.call('send',"+JSON.stringify({chatId:created.result.id,prompt:'/calc 12+7'})+")");assert.equal(result.ok,true);
  const deterministicAnswer=result.result.chat.messages.at(-1);
  assert.equal(deterministicAnswer.error,undefined,'Deterministic packaged chat failed: '+(deterministicAnswer.error?.code||'unknown'));
  assert.match(deterministicAnswer.text,/19/);evidence.checks.push('packaged renderer IPC deterministic request completed');
  const messaging=await win.webContents.executeJavaScript("window.privateAI.call('messagingStatus')");assert.equal(messaging.ok,true);assert.equal(messaging.result.settings.readAll,true);assert.equal(messaging.result.settings.enabled,false);evidence.checks.push('packaged messaging permissions initialized');
  await win.webContents.executeJavaScript("document.querySelector('[data-view=\"messaging\"]').click()");
  let controls=false;for(let n=0;n<50;n++){controls=await win.webContents.executeJavaScript("!!document.querySelector('[name=\"wa-readAll\"]') && !!document.querySelector('[name=\"wa-disableAllWriting\"]')");if(controls)break;await new Promise(r=>setTimeout(r,100));}assert.equal(controls,true);evidence.checks.push('packaged Messaging page renders independent controls');
  const image=await capture();fs.writeFileSync(path.join(path.dirname(reportPath),'application.png'),image.toPNG());
  assert.ok(fs.existsSync(path.join(core.root,'vault.dpapi')));assert.ok(core.store.db);evidence.checks.push('real Windows DPAPI vault and SQLite startup completed');
  const vaultHash=sha(path.join(core.root,'vault.dpapi'));
  const marker=core.store.get('validation','checkpoint');
  if(marker){
   assert.equal(marker.vaultHash,vaultHash,'Restart must preserve the DPAPI vault');
   for(const row of marker.rows)assert.deepEqual(core.store.get(row.kind,row.id),row.value,'Restart preserves '+row.kind);
   evidence.checks.push('second process restart preserved synthetic encrypted records and the original DPAPI vault');
  }else{
   assert.equal(core.store.list('snf_resident').length,0,'No automatic sample residents');
   assert.equal(core.store.list('speaker_profile').length,0,'No automatic speaker profiles');
   const project=core.projectSave({name:'SYNTHETIC validation project',instructions:'Installation acceptance only'});
   const chat=core.createChat({project:project.id});chat.messages=[{role:'user',text:'SYNTHETIC persistence check'}];core.saveChat(chat);
   const rows=[{kind:'project',id:project.id},{kind:'chat',id:chat.id}];
   for(const kind of ['file','snf_resident','wf_mapping','schedule','peer']){
    const id='validation-'+kind;core.store.put(kind,id,{id,name:'SYNTHETIC validation only',label:'SYNTHETIC validation only',text:'SYNTHETIC validation',size:20,headers:[],mapping:{},revision:1,prompt:'SYNTHETIC do not execute',enabled:false,synthetic:true});rows.push({kind,id});
   }
   // Synthetic-only credential checks exercise encryption; never read installed credentials.
   core.store.put('secret','validation-only',{value:'SYNTHETIC-NOT-A-CREDENTIAL'});rows.push({kind:'secret',id:'validation-only'});
   for(const row of rows)row.value=core.store.get(row.kind,row.id);
   core.store.put('validation','checkpoint',{vaultHash,rows});
   evidence.checks.push('empty production namespace has no seeded residents or speakers; synthetic persistence fixtures saved');
  }
  const {safeStorage}=require('electron');
  const restored=path.join(path.dirname(reportPath),'restore-'+Date.now());fs.mkdirSync(restored);
  core.store.backup(path.join(restored,'privateai.db'));fs.copyFileSync(path.join(core.root,'vault.dpapi'),path.join(restored,'vault.dpapi'));
  const cipher=require('./startup-storage.cjs').loadVault(restored,safeStorage,false);
  const db=new (require('./database.cjs').Store)(path.join(restored,'privateai.db'),cipher);
  try{const checkpoint=core.store.get('validation','checkpoint');assert.deepEqual(db.get('validation','checkpoint'),checkpoint);for(const row of checkpoint.rows)assert.deepEqual(db.get(row.kind,row.id),row.value);}finally{db.close();}
  assert.equal(sha(path.join(restored,'vault.dpapi')),vaultHash);
  evidence.checks.push('synthetic SQLite backup restored with copied DPAPI vault under the same Windows account');
  const selfCheck=await win.webContents.executeJavaScript("window.privateAI.call('selfCheck')");
  assert.equal(selfCheck.ok,true);evidence.selfCheck=selfCheck.result;
  if(selfCheck.result.checks.some(c=>c.status!=='pass'))evidence.syntheticDocumentDiagnostic=await new Promise((resolve,reject)=>{
   const child=require('electron').utilityProcess.fork(path.join(__dirname,'windows-validation-worker.cjs'),[],{stdio:'ignore'});
   const timer=setTimeout(()=>{child.kill();reject(Error('Synthetic PDF diagnostic timeout'));},30000);
   child.once('message',m=>{clearTimeout(timer);child.kill();resolve(m);});child.once('error',reject);
  });
  assert.ok(selfCheck.result.checks.every(c=>c.status==='pass'),'Bundled self-check must pass every check');
  evidence.checks.push('packaged helper, ACL, named pipe, encrypted backup, DOCX/XLSX/PDF self-checks passed');
  const views={search:'Search',dashboard:'Dashboard',captures:'Notes',meetings:'Meetings',workspace:'Library',decisions:'Decision log',metrics:'Set up data sources','clinical-imports':'Clinical imports',snf:'SNF Clinical Surveillance Command Center',automation:'Automation',projects:'A place for each project',files:'Your working files',agents:'Your reusable assistants',worker:'Let another PC handle the work',settings:'Make Private AI yours',processing:'AI Processing',usage:'API Usage',browser:'Browser reports',apps:'Your apps. Your permission.',guide:'User guide'};
  const parents={projects:'workspace',files:'workspace',agents:'automation',worker:'automation',processing:'settings',usage:'settings'};
  const navigate=async view=>{
   if(parents[view])await navigate(parents[view]);
   let clicked=false;
   for(let n=0;n<100&&!clicked;n++){
    clicked=await win.webContents.executeJavaScript(`document.querySelectorAll('#sidebar details').forEach(e=>e.open=true);(()=>{const b=document.querySelector('[data-act="view"][data-view="${view}"]');if(!b)return false;b.click();return true})()`);
    if(!clicked)await new Promise(r=>setTimeout(r,100));
   }
   assert.ok(clicked,'Visible route to '+view);
   for(let n=0;n<300;n++){
    await new Promise(r=>setTimeout(r,100));
    const page=await win.webContents.executeJavaScript(`({heading:document.querySelector('#content h1')?.innerText||'',content:document.querySelector('#content').innerText,guideReady:!!document.querySelector('#guide-search'),searchReady:!!document.querySelector('#saved-search-form')})`);
    if(page.heading.includes(views[view])&&(view!=='guide'||page.guideReady)&&(view!=='search'||page.searchReady))return page;
   }
   throw Error('Expected page '+view);
  };
  evidence.navigation=[];
  assert.deepEqual(await win.webContents.executeJavaScript("Array.from(document.querySelectorAll('.primary-nav button'),button=>button.dataset.view)"),['search','dashboard','captures','meetings','workspace']);
  assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('#sidebar [data-view=actions],#sidebar [data-view=today],#sidebar [data-view=operations],#sidebar [data-view=playbooks],#sidebar [data-view=worker]').length"),0);
  for(const view of Object.keys(views)){
   const page=await navigate(view);assert.doesNotMatch(page.content,/Error loading|is not defined|Cannot read properties/);
   evidence.navigation.push({view,heading:page.heading});
   if(['dashboard','meetings','settings','processing'].includes(view))fs.writeFileSync(path.join(path.dirname(reportPath),'screen-'+view+'.png'),(await capture()).toPNG());
   if(view==='settings'){
    await win.webContents.executeJavaScript("(()=>{const choice=document.querySelector('[name=appearance]');choice.value='dark';choice.dispatchEvent(new Event('change',{bubbles:true}));})()");
    assert.equal(await win.webContents.executeJavaScript("document.documentElement.dataset.theme"),'dark');
    fs.writeFileSync(path.join(path.dirname(reportPath),'screen-settings-dark.png'),(await capture()).toPNG());
   }
  }
  evidence.checks.push('20 packaged primary and secondary views rendered; Search, one Dashboard, Notes, Meetings, Library and dark appearance verified');
  const call=async(op,data={})=>win.webContents.executeJavaScript('window.privateAI.call('+JSON.stringify(op)+','+JSON.stringify(data)+')');
  assert.equal((await call('setPassphrase',{passphrase:'SYNTHETIC validation passphrase'})).ok,true);
  try{
   assert.equal((await call('lock')).ok,true);assert.equal((await call('createChat')).error.code,'LOCKED');
   assert.equal((await call('unlock',{passphrase:'SYNTHETIC wrong passphrase'})).ok,false);
   assert.equal((await call('unlock',{passphrase:'SYNTHETIC validation passphrase'})).ok,true);
   assert.equal((await call('summary')).ok,true);
  }finally{core.store.delete('secret','applock');core.unlock();}
  evidence.checks.push('real desktop IPC lock blocks requests, rejects wrong passphrase and unlocks with the test passphrase');
  require('whatsapp-web.js');evidence.checks.push('packaged account connector dependency resolves');
  const sourceSummary=(await call('summary')).result;
  assert.equal(sourceSummary.integrations.find(x=>x.id==='pcc').showDashboard,false);
  assert.equal((await call('integrationSave',{id:'pcc',settings:{enabled:true,mode:'manual'}})).result.state,'manual_import');
  assert.equal((await call('snfFeedStatus')).result.monitoringEnabled,true);
  assert.equal((await call('integrationSave',{id:'pcc',settings:{enabled:false}})).result.state,'disabled');
  assert.equal((await call('snfFeedStatus')).result.monitoringEnabled,false);
  evidence.checks.push('real desktop IPC toggles optional PCC while general clinical tools remain available');
  evidence.sharedCompanion=await require('./windows-companion-validation.cjs').run({core,win,reportPath});
  evidence.checks.push('packaged shared companion capture, evidence, action, draft, reminder, selected-chat, lock and revocation acceptance passed');
  if(process.env.PRIVATE_AI_VALIDATION_DOCUMENT_TOOLS==='1'){
   evidence.documentTools=await require('./windows-document-validation.cjs').run({core,win,reportPath});
   evidence.checks.push('packaged offline image/scanned PDF OCR and real BGE/sqlite-vec renderer IPC search passed with originals and source citations retained');
  }
  // Optional real inference uses only isolated synthetic input. Never confuse
  // the built-in template helper with a loaded model or silently use a cloud key.
  if(process.env.PRIVATE_AI_VALIDATION_MODEL){
   const model=path.resolve(process.env.PRIVATE_AI_VALIDATION_MODEL);
   const localContext=Number(process.env.PRIVATE_AI_VALIDATION_CONTEXT||2048),localMaxOutput=Number(process.env.PRIVATE_AI_VALIDATION_OUTPUT||256);
   const automatic=process.env.PRIVATE_AI_VALIDATION_AUTOMATIC==='1';
   if(automatic){
    assert.equal(path.basename(model),require('./model-manager.cjs').MODELS.find(m=>m.id==='qwen3-1.7b').file);
    // A lower admission ceiling exercises the reported condition without ever
    // replacing actual system pressure with invented available RAM.
    const actualMemory=core.resources.memory,actualLocalMemory=core.router.local.memory;
    core.resources.memory=()=>Math.min(3*1024**3,actualMemory());
    core.router.local.memory=()=>Math.min(3*1024**3,actualLocalMemory());
    evidence.automaticAdmissionCapBytes=3*1024**3;
   }
   core.saveSettings({localModelPath:model,localTier:automatic?'auto':'selected',localContext:automatic?4096:localContext,localMaxOutput,keepBrainMinutes:0});
   assert.equal(core.key(),null);
   if(automatic){
    const loaded=await call('localLoad');assert.equal(loaded.ok,true,JSON.stringify(loaded.error));
    assert.equal(core.router.local.activeSettings.localContext,2048);
    assert.equal(core.settings().localContext,4096);
    evidence.checks.push('Automatic Load model IPC fits verified Small at 2048 under a 3 GiB admission ceiling; saved context retained');
   }
   const created=await call('createChat',{temporary:true});assert.equal(created.ok,true);
   const response=await call('send',{chatId:created.result.id,prompt:'Use only this synthetic source. Medication feed: unavailable. Medication status: unknown. What is the medication status? Reply briefly using that word; do not infer absence.'});
   const answer=response.result?.chat.messages.at(-1);
   const hashFile=async file=>{const hash=crypto.createHash('sha256');for await(const chunk of rawFs.createReadStream(file))hash.update(chunk);return hash.digest('hex');};
   evidence.actualModelInferenceExecuted=answer?.processing?.provider==='local'&&answer?.processing?.reason!=='local_offline_assistant'&&!!answer.text&&!answer.error;
   evidence.inference={model:path.basename(model),modelSHA256:await hashFile(model),runtimeSHA256:await hashFile(core.router.local.runtime),localContext,localMaxOutput,response:answer?.text,error:answer?.error,provider:answer?.processing?.provider};
   assert.equal(response.ok,true);assert.equal(answer?.error,undefined);assert.equal(evidence.actualModelInferenceExecuted,true);assert.match(answer.text,/unknown/i);
   if(automatic){
    assert.equal(answer.processing.routing.selectedTier,'small');
    assert.equal(answer.processing.routing.contextTokens,2048);
    assert.equal(core.settings().localContext,4096);
    assert.ok(answer.processing.routing.attempts.filter(a=>a.status==='completed').length<=2);
    evidence.inference.automaticRouting=answer.processing.routing;
    evidence.inference.configuredContext=4096;evidence.inference.localContext=2048;
    evidence.checks.push('Automatic renderer IPC/Core real Small inference retained full synthetic input and disclosed the fitted context');
   }
   assert.equal(core.store.list('usage').filter(x=>!['local','deterministic'].includes(x.provider)).length,0);
   evidence.checks.push('real local inference through renderer IPC/Core/router with no key and PCC disabled; synthetic missing information stays unknown');
   core.router.local.stop('validation-complete');await core.router.local.waitStopped();
  }
  evidence.shutdown=lifecycle.assertNoActiveRequests(core);
  evidence.checks.push('controlled foreground acceptance held optional timed enrichment and reached zero active requests; concurrent enrichment shutdown is not established');
  evidence.passed=true;
 }catch(e){evidence.error={message:e.message,code:e.code||null};throw e;}finally{if(process.env.PRIVATE_AI_VALIDATION_MODEL){core.router.local?.stop('validation-finished');await core.router.local?.waitStopped();}evidence.completed=new Date().toISOString();fs.writeFileSync(reportPath,JSON.stringify(evidence,null,2));}
 return evidence;
}
module.exports={run};
