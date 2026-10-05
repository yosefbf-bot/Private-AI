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
  await page.getByRole('heading',{name:/Administrator Today/}).waitFor();
  assert.match(await page.locator('#development-mode-banner').textContent(),/Not for PHI/);
  const blocked=await page.evaluate(()=>window.privateAI.call('integrationSave',{id:'pcc',settings:{enabled:true,mode:'manual'}}));assert.equal(blocked.ok,false);assert.equal(blocked.error.code,'POLICY');
  for(const op of ['companionStatus','companionSave','companionPair','companionRevoke']){const result=await page.evaluate(op=>window.privateAI.call(op,{}),op);assert.equal(result.ok,false);assert.equal(result.error.code,'POLICY');}
  assert.match(await page.locator('.today-page').textContent(),/incomplete|missing|stale/i);
  const criticalCard=page.locator('.today-kpi-card').filter({hasText:'Critical Alerts'});
  assert.match(await criticalCard.innerText(),/Incomplete/i);
  assert.doesNotMatch(await criticalCard.innerText(),/\bClear\b/i);
  assert.equal(await criticalCard.evaluate(el=>el.classList.contains('kpi-success')),false);
  await page.locator('#today-ops-sub').filter({hasText:'Staffing data unavailable'}).waitFor();
  const operationsCard=page.locator('#today-operations-summary-card');
  const operationsText=await operationsCard.innerText();
  assert.match(operationsText,/Imported resident count unavailable/);
  assert.match(operationsText,/Occupancy unavailable/);
  assert.match(operationsText,/HPPD unavailable/);
  assert.doesNotMatch(operationsText,/Unknown%|0 active residents|Staffing data available/);
  assert.equal(await operationsCard.locator('.today-ops-hppd').evaluate(el=>getComputedStyle(el).color),'rgb(100, 116, 139)','Unavailable HPPD must use neutral styling');
  assert.equal(await operationsCard.evaluate(el=>el.classList.contains('kpi-success')),false);
  await page.locator('#btn-toggle-demo').click();
  await page.locator('#btn-return-prod').waitFor();
  await page.locator('#section-data-health').waitFor();assert.equal(await page.locator('#btn-goto-pcc').isVisible(),true);
  await page.locator('.today-page [data-act-evidence]').first().click();await page.locator('[data-evidence-target]:not([hidden])').first().waitFor();
  await page.locator('.today-page [data-act-followup]').first().click();
  const form=page.locator('dialog.today-modal form');await form.locator('[name=reviewer]').fill('Synthetic UI reviewer');await form.locator('[name=status]').selectOption('waiting');await form.locator('[name=note]').fill('Synthetic review pending');await form.getByRole('button',{name:/Save/i}).click();await page.locator('dialog.today-modal').waitFor({state:'detached'});
  await page.locator('.today-page').getByText('Synthetic review pending',{exact:false}).first().waitFor();
  fs.mkdirSync(path.join(__dirname,'../build/screenshots'),{recursive:true});await page.screenshot({path:path.join(__dirname,'../build/screenshots/hardening-today-demo.png')});
  await page.locator('#btn-goto-snf').click();await page.locator('.snf-headline').waitFor();await page.locator('.snf-page').getByText('DEMO DATA — NOT FOR CLINICAL USE',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Today / Demo workspace'}).click();await page.locator('#btn-reset-demo').click();await page.locator('#btn-toggle-demo').waitFor();
  assert.doesNotMatch(await page.locator('.today-page').textContent(),/Eleanor Vance|Dorothy Zimmerman/);
  assert.equal(await page.locator('#sidebar [data-view=pcc]').isVisible(),false);
  assert.equal(await page.locator('#section-data-health').count(),0);
  await page.getByRole('button',{name:'Clinical imports',exact:true}).first().click();await page.getByRole('heading',{name:'Clinical imports',exact:true}).waitFor();
  // Development mode must visibly block production import flow.
  await page.locator('#content').getByText('Live clinical imports are disabled.',{exact:false}).waitFor();
  assert.match(await page.locator('#content').textContent(),/Development mode|No imports yet|disabled/i);
  await page.locator('#sidebar [data-view="today"]').click();
  await page.locator('#content [data-view="execdesk"]').click();
  await page.getByRole('heading',{name:'Administrator Command & Operations Center',exact:true}).waitFor();
  assert.match(await page.locator('.exec-desk-page').innerText(),/Production — saved\/imported records only/);
  assert.deepEqual((await page.evaluate(()=>window.privateAI.call('execRoomReadinessList'))).result,[]);
  await page.locator('#btn-open-commute-briefing').click();
  await page.evaluate(()=>{window.__remoteSpeechCalls=0;window.speechSynthesis.getVoices=()=>[{localService:false,name:'Synthetic remote voice'}];window.speechSynthesis.speak=()=>window.__remoteSpeechCalls++;});
  await page.locator('#btn-play-commute-audio').click();
  assert.equal(await page.evaluate(()=>window.__remoteSpeechCalls),0);
  assert.match(await page.locator('#toast').innerText(),/local Windows voice is required/);
  await page.locator('#btn-close-commute').click();
  await page.screenshot({path:path.join(__dirname,'../build/screenshots/executive-production.png')});
  await page.locator('#operations-sidebar-btn').click();
  await page.locator('[data-ops-tab=analytics]').click();
  await page.getByRole('heading',{name:'Staffing, Overtime Reduction & Regulatory Sentinel',exact:true}).waitFor();
  await page.getByText('No staffing source imported.',{exact:false}).waitFor();
  assert.doesNotMatch(await page.locator('.ops-analytics-page').innerText(),/All Clear|Tanya Rogers|33D0654321/);
  assert.deepEqual((await page.evaluate(()=>window.privateAI.call('regulatoryList'))).result,[]);
  await page.locator('#btn-import-onshift-csv').click();
  assert.equal(await page.locator('#btn-load-sample-csv').isDisabled(),true);
  await page.locator('#btn-close-csv').click();
  await page.screenshot({path:path.join(__dirname,'../build/screenshots/analytics-production.png')});
  await page.locator('#operations-sidebar-btn').click();
  await page.locator('.ops-page').first().waitFor();
  assert.doesNotMatch(await page.locator('.ops-page').first().textContent(),/Pinecrest|106 Census|3\.62/);
  const created=await page.evaluate(()=>window.privateAI.call('sbarGenerate',{residentName:'Synthetic UI Resident'}));
  assert.equal(created.ok,true);
  await page.locator('#operations-sidebar-btn').click();
  await page.locator('[data-ops-tab=sbar]').click();
  await page.locator('#sbar-edit-situation-concern').fill('Synthetic UI updated concern');
  assert.equal(await page.locator('#ops-review-sbar-btn').isDisabled(),true);
  await page.locator('#ops-save-sbar-btn').click();
  await page.waitForFunction(async id=>{const r=await window.privateAI.call('sbarGet',{id});return r.result?.situation.concern==='Synthetic UI updated concern';},created.result.id);
  await page.locator('#automation-sidebar-btn').click();await page.locator('.auto-center-page').waitFor();
  const clinicalMenu=page.locator('#sidebar details').filter({has:page.getByText('Clinical & data sources',{exact:true})});
  if(!await clinicalMenu.evaluate(el=>el.open))await clinicalMenu.locator('summary').click();
  for(const [view,heading,notice] of [
   ['actions','Action Center','First review establishes a baseline.'],
   ['decisions','Decision log','No decisions recorded.'],
   ['metrics','Set up data sources','Live imports are available in the production desktop workspace.'],
   ['workspace','Projects & documents','Document search is available in the production desktop workspace.'],
   ['playbooks','Playbooks & cloud budgets','Playbook execution and budget changes require the production desktop workspace.']
  ]){
   await page.locator(`#sidebar [data-view="${view}"]`).click();
   await page.getByRole('heading',{name:heading,exact:true}).waitFor();
   await page.locator('#workflow-body').getByText(notice,{exact:false}).waitFor();
  }
  assert.equal(errors.length,0,errors.join('\n'));console.log('PASS: authenticated dev server, Today, demo isolation, evidence, follow-up, Surveillance, Operations/SBAR edit persistence, Automation and five workflow pages.');
 }catch(error){
  console.error('Browser errors:',errors.join('\n'));
  const failedPage=browser?.contexts()[0]?.pages()[0];
  if(failedPage&&!failedPage.isClosed())console.error('Visible page:',(await failedPage.locator('#content').innerText()).slice(0,1500));
  throw error;
 }finally{await browser?.close();child.kill();if(child.exitCode===null&&child.signalCode===null)await new Promise(r=>{child.once('exit',r);setTimeout(r,1000);});fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});

