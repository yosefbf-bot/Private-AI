'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const rawFs=require('original-fs');
const sha=f=>crypto.createHash('sha256').update(rawFs.readFileSync(f)).digest('hex');
async function run({core,win,reportPath,exe,asar}){
 if(process.platform!=='win32')throw Error('Windows validation must execute on Windows');
 const evidence={version:require('../package.json').version,platform:process.platform,windowsApplicationExecuted:true,passed:false,started:new Date().toISOString(),executableSHA256:sha(exe),applicationArchiveSHA256:sha(asar),checks:[]};
 try{
  core.saveSettings({processingMode:'local-only',allowCloud:false,workspace:path.join(path.dirname(reportPath),'reports'),approved:true});
  const deadline=Date.now()+45000;let ready=false;
  while(Date.now()<deadline){if(win.isDestroyed())throw Error('Window destroyed');try{ready=await win.webContents.executeJavaScript("!!document.querySelector('#sidebar') && !!window.privateAI && !!document.querySelector('#content')");}catch{}if(ready&&!win.webContents.isLoading())break;await new Promise(r=>setTimeout(r,200));}
  assert.equal(ready,true);evidence.checks.push('packaged renderer loaded with isolated preload');
  const summary=await win.webContents.executeJavaScript("window.privateAI.call('summary')");assert.equal(summary.ok,true);evidence.checks.push('renderer IPC summary succeeded');
  const created=await win.webContents.executeJavaScript("window.privateAI.call('createChat',{temporary:true})");assert.equal(created.ok,true);
  const result=await win.webContents.executeJavaScript("window.privateAI.call('send',"+JSON.stringify({chatId:created.result.id,prompt:'/calc 12+7'})+")");assert.equal(result.ok,true);assert.match(result.result.chat.messages.at(-1).text,/19/);evidence.checks.push('packaged renderer IPC deterministic request completed');
  const messaging=await win.webContents.executeJavaScript("window.privateAI.call('messagingStatus')");assert.equal(messaging.ok,true);assert.equal(messaging.result.settings.readAll,true);assert.equal(messaging.result.settings.enabled,false);evidence.checks.push('packaged messaging permissions initialized');
  await win.webContents.executeJavaScript("document.querySelector('[data-view=\"messaging\"]').click()");
  let controls=false;for(let n=0;n<50;n++){controls=await win.webContents.executeJavaScript("!!document.querySelector('[name=\"wa-readAll\"]') && !!document.querySelector('[name=\"wa-disableAllWriting\"]')");if(controls)break;await new Promise(r=>setTimeout(r,100));}assert.equal(controls,true);evidence.checks.push('packaged Messaging page renders independent controls');
  const image=await win.webContents.capturePage();fs.writeFileSync(path.join(path.dirname(reportPath),'application.png'),image.toPNG());
  assert.ok(fs.existsSync(path.join(core.root,'vault.dpapi')));assert.ok(core.store.db);evidence.checks.push('real Windows DPAPI vault and SQLite startup completed');
  require('whatsapp-web.js');evidence.checks.push('packaged account connector dependency resolves');
  evidence.passed=true;
 }catch(e){evidence.error={message:e.message,code:e.code||null};throw e;}finally{evidence.completed=new Date().toISOString();fs.writeFileSync(reportPath,JSON.stringify(evidence,null,2));}
 return evidence;
}
module.exports={run};
