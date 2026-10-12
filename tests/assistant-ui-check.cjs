'use strict';
// Real Core/SQLite and browser UI, synthetic data only; no external account calls.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright'),{fixture}=require('./helpers.cjs');
const cleanup=[],{core}=fixture({after:f=>cleanup.push(f)}),root=path.resolve(__dirname,'..');
let browser;const errors=[],calls=[];
async function dispatch(op,data={}){
  calls.push(op);
  for(const [prefix,module] of [['workflow','workflows/index'],['capture','capture-workflows'],['meeting','operations-copilot'],['speaker','operations-copilot'],['snf','snf/index'],['speech','local-speech']])if(op.startsWith(prefix))return require('../source/'+module+'.cjs').dispatch(core,op,data);
  if(op==='summary')return {...core.summary(),autostart:false};
  if(op==='activity')return true;
  if(op==='createChat')return core.createChat(data);
  if(op==='chat')return core.chat(data.id);
  if(op==='pickFiles'){const file=path.join(core.root,'synthetic-policy.txt');fs.writeFileSync(file,'SYNTHETIC facility policy: review the conference door before use.');return [await core.importFile(file)];}
  if(op==='projectSave')return core.projectSave(data);
  if(op==='saveDraft')return core.saveDraft(data.id,data.text);
  if(op==='settings')return core.saveSettings(data);
  throw Error('Unexpected test RPC: '+op);
}
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{res.setHeader('Content-Type',({'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,executablePath:process.env.PRIVATE_AI_TEST_CHROMIUM});
  const page=await browser.newPage({viewport:{width:1392,height:950}});page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('testCall',async(op,data)=>{try{return {ok:true,result:await dispatch(op,data)};}catch(e){return {ok:false,error:require('../source/security.cjs').safeError(e)};}});
  await page.addInitScript(()=>{window.privateAI={call:(...args)=>window.testCall(...args),onEvent:cb=>window.__deliver=cb};navigator.mediaDevices.getUserMedia=async()=>{throw Error('Synthetic test does not open the physical microphone.');};});
  await page.goto('http://127.0.0.1:'+server.address().port+'/source/ui/index.html');
  await page.getByRole('heading',{name:'What would you like to work on?'}).waitFor();
  assert.equal(await page.locator('.primary-nav button').count(),4);
  assert.equal(await page.locator('#sidebar [data-view=operations],#sidebar [data-view=actions],#sidebar [data-view=playbooks],#sidebar [data-view=worker]').count(),0);
  await page.locator('#sidebar [data-view=captures]').click();await page.locator('#capture-form textarea').fill('Please call maintenance about the broken conference room door.');
  assert.equal(await page.locator('.manual-details').getAttribute('open'),null);
  await page.locator('#capture-form button[type=submit]').click();await page.getByText('Note and review items saved.',{exact:true}).waitFor();
  await page.locator('#sidebar [data-view=dashboard]').click();await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
  assert.equal(await page.locator('#dashboard-tasks [data-review]').count(),1);
  const out=process.env.PRIVATE_AI_UI_EVIDENCE||path.join(root,'Validation/assistant-first-2026-10-07');fs.mkdirSync(out,{recursive:true});
  await page.screenshot({path:path.join(out,'dashboard.png'),fullPage:true});
  await page.locator('#sidebar [data-view=meetings]').click();await page.locator('#meeting-new').click();await page.locator('#modal-content input[name=title]').fill('Synthetic maintenance meeting');await page.locator('#modal-submit').click();
  await page.locator('#meeting-note textarea').fill('We will call maintenance about the door.');await page.locator('#meeting-note button[type=submit]').click();
  await page.locator('[data-track]').click();assert.equal(core.store.count('todo'),2);
  await page.locator('#meeting-finish').click();await page.getByText('Draft summary',{exact:true}).waitFor();assert.equal(core.store.list('meeting')[0].status,'completed');
  await page.screenshot({path:path.join(out,'meetings.png'),fullPage:true});
  await page.locator('#sidebar [data-view=workspace]').click();await page.locator('#wf-policies').click();await page.getByText('Facility policies selected.',{exact:false}).waitFor();
  assert.equal(core.store.list('project').filter(p=>p.name==='Facility policies').length,1);await page.locator('#wf-policies').click();assert.equal(core.store.count('project'),1);
  await page.locator('#wf-upload').click();await page.getByText('Files added to the collection.',{exact:true}).waitFor();
  const policy=core.store.list('project')[0];assert.equal(policy.fileIds.length,1);assert.match(core.store.get('file',policy.fileIds[0]).text,/SYNTHETIC/);
  await page.locator('#sidebar [data-view=captures]').click();await page.locator('#sidebar [data-view=workspace]').click();await page.locator('#wf-project').selectOption(policy.id);assert.equal(core.store.get('project',policy.id).fileIds.length,1);
  await page.locator('#sidebar .more-tools > summary').click();await page.locator('#sidebar [data-view=automation]').click();await page.getByRole('heading',{name:'Automation',exact:true}).waitFor();
  await page.getByRole('button',{name:'Worker settings',exact:true}).click();await page.getByRole('heading',{name:"Let another PC handle the work"}).first().waitFor();
  await page.locator('#sidebar [data-view=settings]').click();
  await page.locator('[name=appearance]').selectOption('dark');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.reload();await page.getByRole('heading',{name:'What would you like to work on?'}).waitFor();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  await page.screenshot({path:path.join(out,'chat-dark.png'),fullPage:true});
  await page.locator('#sidebar [data-view=dashboard]').click();await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
  await page.screenshot({path:path.join(out,'dashboard-dark.png'),fullPage:true});
  await page.locator('#sidebar [data-view=meetings]').click();await page.getByRole('heading',{name:'Meetings',exact:true}).waitFor();
  await page.screenshot({path:path.join(out,'meetings-dark.png'),fullPage:true});
  await page.locator('#sidebar [data-view=settings]').click();assert.equal(await page.locator('[name=appearance]').inputValue(),'dark');
  await page.locator('[name=appearance]').selectOption('system');await page.emulateMedia({colorScheme:'light'});
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
  await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  await page.locator('[name=appearance]').selectOption('light');await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({checks:20,scope:'Synthetic Core/SQLite + Edge: chat default, navigation, note, dashboard, meeting, follow-up, library, automation',browser:await browser.version()}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();for(const fn of cleanup)fn();});
