'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const rawFs=require('original-fs');
const sha=f=>crypto.createHash('sha256').update(rawFs.readFileSync(f)).digest('hex');
async function run({core,win,reportPath,exe,asar}){
 if(process.platform!=='win32')throw Error('Windows validation must execute on Windows');
 assert.equal(path.resolve(core.root),path.join(path.dirname(reportPath),'app-data'),'Acceptance must use isolated app-data');
 const evidence={version:require('../package.json').version,platform:process.platform,windowsApplicationExecuted:true,passed:false,started:new Date().toISOString(),executableSHA256:sha(exe),applicationArchiveSHA256:sha(asar),checks:[]};
 try{
  core.saveSettings({processingMode:'local-only',allowCloud:false,workspace:path.join(path.dirname(reportPath),'reports'),approved:true});
  const deadline=Date.now()+45000;let ready=false;
  while(Date.now()<deadline){if(win.isDestroyed())throw Error('Window destroyed');try{ready=await win.webContents.executeJavaScript("!!document.querySelector('#sidebar') && !!window.privateAI && !!document.querySelector('#content')");}catch{}if(ready&&!win.webContents.isLoading())break;await new Promise(r=>setTimeout(r,200));}
  assert.equal(ready,true);evidence.checks.push('packaged renderer loaded with isolated preload');
  evidence.rendererReadyMs=Date.now()-Date.parse(evidence.started);
  await new Promise(r=>setTimeout(r,1500));
  evidence.loadedApplicationWorkingSetKiB=require('electron').app.getAppMetrics().reduce((n,p)=>n+(p.memory?.workingSetSize||0),0);
  const summary=await win.webContents.executeJavaScript("window.privateAI.call('summary')");assert.equal(summary.ok,true);evidence.checks.push('renderer IPC summary succeeded');
  const created=await win.webContents.executeJavaScript("window.privateAI.call('createChat',{temporary:true})");assert.equal(created.ok,true);
  const result=await win.webContents.executeJavaScript("window.privateAI.call('send',"+JSON.stringify({chatId:created.result.id,prompt:'/calc 12+7'})+")");assert.equal(result.ok,true);assert.match(result.result.chat.messages.at(-1).text,/19/);evidence.checks.push('packaged renderer IPC deterministic request completed');
  const messaging=await win.webContents.executeJavaScript("window.privateAI.call('messagingStatus')");assert.equal(messaging.ok,true);assert.equal(messaging.result.settings.readAll,true);assert.equal(messaging.result.settings.enabled,false);evidence.checks.push('packaged messaging permissions initialized');
  await win.webContents.executeJavaScript("document.querySelector('[data-view=\"messaging\"]').click()");
  let controls=false;for(let n=0;n<50;n++){controls=await win.webContents.executeJavaScript("!!document.querySelector('[name=\"wa-readAll\"]') && !!document.querySelector('[name=\"wa-disableAllWriting\"]')");if(controls)break;await new Promise(r=>setTimeout(r,100));}assert.equal(controls,true);evidence.checks.push('packaged Messaging page renders independent controls');
  const image=await win.webContents.capturePage();fs.writeFileSync(path.join(path.dirname(reportPath),'application.png'),image.toPNG());
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
  const views=['today','actions','decisions','workspace','playbooks','metrics','pcc','snf','operations','automation','projects','files','agents','schedules','worker','settings','processing','usage','browser','apps','guide'];
  for(const view of views){
   await win.webContents.executeJavaScript(`document.querySelectorAll('#sidebar details').forEach(e=>e.open=true);document.querySelector('#sidebar [data-view="${view}"]').click()`);
   let content='';for(let n=0;n<100;n++){await new Promise(r=>setTimeout(r,50));content=await win.webContents.executeJavaScript("document.querySelector('#content').innerText");if(content.trim()&&!/^Loading/.test(content.trim()))break;}
   assert.ok(content.trim()&&!/^Loading/.test(content.trim()),'Page completed: '+view);assert.doesNotMatch(content,/Error loading|is not defined|Cannot read properties/);
   if(['today','operations','settings','processing'].includes(view))fs.writeFileSync(path.join(path.dirname(reportPath),'screen-'+view+'.png'),(await win.webContents.capturePage()).toPNG());
  }
  evidence.checks.push('21 packaged navigation views rendered without loading/error states; four screenshots captured');
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
  evidence.passed=true;
 }catch(e){evidence.error={message:e.message,code:e.code||null};throw e;}finally{evidence.completed=new Date().toISOString();fs.writeFileSync(reportPath,JSON.stringify(evidence,null,2));}
 return evidence;
}
module.exports={run};
