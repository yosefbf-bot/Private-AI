'use strict';
const {chromium}=require('playwright'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'privateai-ui-')),token=crypto.randomBytes(32).toString('hex');
 const child=spawn(process.execPath,['server.cjs'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PRIVATE_AI_DEV_TOKEN:token,PRIVATE_AI_DEV_DATA:root},stdio:['ignore','pipe','pipe']});
 let browser;const errors=[];
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Development server start timeout')),10000);child.stdout.on('data',d=>{if(d.toString().includes('127.0.0.1:3000')){clearTimeout(timer);resolve();}});child.on('exit',c=>{clearTimeout(timer);reject(Error('Development server exited '+c+'; '+errors.join(' ')));});child.stderr.on('data',d=>{if(!d.toString().includes('ExperimentalWarning'))errors.push(d.toString());});});
  assert.equal((await fetch('http://127.0.0.1:3000/api/health')).status,401);
  browser=await chromium.launch({executablePath:process.env.PRIVATE_AI_TEST_CHROMIUM,headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='prompt'?d.accept(token):d.accept());
  // Use a small existing icon for deterministic visual smoke fixtures.
  await page.route(/\/(?:logo|icon)\.png$/,route=>route.fulfill({path:path.join(__dirname,'../chrome_extension/icon128.png')}));
  await page.goto('http://127.0.0.1:3000');
  await page.locator('dialog input[type=password]').fill(token);
  await page.getByRole('button',{name:'Connect',exact:true}).click();
  await page.getByRole('heading',{name:'What would you like to work on?'}).waitFor();
  assert.match(await page.locator('#development-mode-banner').textContent(),/Not for PHI/);
  for(const op of ['integrationSave','companionStatus','companionSave','companionPair','companionRevoke','speechSetup','speechDictate','assistantDraftRetry','browserGrant','browserSchedule']){
    const result=await page.evaluate(op=>window.privateAI.call(op,{}),op);assert.equal(result.ok,false);assert.equal(result.error.code,'POLICY');
  }
  await page.locator('#sidebar [data-view=dashboard]').click();await page.getByRole('heading',{name:'Dashboard',exact:true}).waitFor();
  assert.match(await page.locator('#content').innerText(),/does not establish complete monitoring/);
  assert.equal(await page.locator('#sidebar [data-view=pcc]').isVisible(),false);
  const call=(op,data={})=>page.evaluate(async([op,data])=>{const r=await window.privateAI.call(op,data);if(!r.ok)throw Error(r.error.code);return r.result;},[op,data]);
  assert.deepEqual(await call('execRoomReadinessList'),[]);assert.deepEqual(await call('regulatoryList'),[]);
  // Preserve Demo source/evidence and clinical closure checks through the engine;
  // those removed executive dashboards are no longer routine UI destinations.
  await call('snfDemo',{mode:'demo'});
  await page.locator('#sidebar [data-view=captures]').click();await page.locator('#sidebar [data-view=dashboard]').click();
  await page.getByText('DEMO DATA — NOT FOR CLINICAL USE',{exact:true}).first().waitFor();
  await call('snfDemo',{mode:'production'});
  await page.locator('#sidebar .more-tools > summary').click();
  await page.locator('#sidebar .more-tools details > summary').click();
  await page.locator('#sidebar [data-view="clinical-imports"]').click();
  await page.getByRole('heading',{name:'Clinical imports',exact:true}).waitFor();
  await page.getByText('Live clinical imports are disabled.',{exact:false}).first().waitFor();
  const created=await call('sbarGenerate',{residentName:'Synthetic UI Resident'});
  await page.locator('#sidebar [data-view=dashboard]').click();
  await page.locator('#dashboard-tasks [data-review]').first().click();
  await page.locator('#sbar-edit-situation-concern').fill('Synthetic UI updated concern');
  assert.equal(await page.locator('#ops-review-sbar-btn').isDisabled(),true);
  await page.locator('#ops-save-sbar-btn').click();
  await page.waitForFunction(async id=>{const r=await window.privateAI.call('sbarGet',{id});return r.result?.situation.concern==='Synthetic UI updated concern';},created.id);
  for(const [view,heading,notice] of [
   ['decisions','Decision log','No decisions recorded.'],
   ['metrics','Set up data sources','Live imports are available in the production desktop workspace.'],
   ['workspace','Library','Document search is available in the production desktop workspace.']
  ]){
   await page.locator(`#sidebar [data-view="${view}"]`).click();
   await page.getByRole('heading',{name:heading,exact:true}).waitFor();
   await page.getByText(notice,{exact:false}).first().waitFor();
  }
  const voices=await page.evaluate(async()=>{const {VoiceManager}=await import('/voice.mjs');const vm=new VoiceManager({getState:()=>({settings:{hipaa:true,processingMode:'local-only'}})});vm.availableVoices=[{name:'Synthetic remote voice',lang:'en-US',localService:false}];return vm.getBestVoiceForPreset('nova','american');});assert.equal(voices,null);
  fs.mkdirSync(path.join(__dirname,'../build/screenshots'),{recursive:true});await page.screenshot({path:path.join(__dirname,'../build/screenshots/assistant-hardening.png')});
  assert.equal(errors.length,0,errors.join('\n'));console.log('PASS: authenticated development boundary, offline-only speech, one dashboard, Demo isolation, source-linked SBAR edit, optional PCC and preserved advanced workflows.');
 }catch(error){
  console.error('Browser errors:',errors.join('\n'));
  const failedPage=browser?.contexts()[0]?.pages()[0];
  if(failedPage&&!failedPage.isClosed())console.error('Visible page:',(await failedPage.locator('#content').innerText()).slice(0,1500));
  throw error;
 }finally{await browser?.close();child.kill();if(child.exitCode===null&&child.signalCode===null)await new Promise(r=>{child.once('exit',r);setTimeout(r,1000);});fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});

