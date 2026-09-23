'use strict';
const {chromium}=require('playwright'),{spawn}=require('node:child_process'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'privateai-ui-')),token=crypto.randomBytes(32).toString('hex');
 const child=spawn(process.execPath,['server.cjs'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PRIVATE_AI_DEV_TOKEN:token,PRIVATE_AI_DEV_DATA:root},stdio:['ignore','pipe','pipe']});
 let browser;const errors=[];
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Development server start timeout')),10000);child.stdout.on('data',d=>{if(d.toString().includes('127.0.0.1:3000')){clearTimeout(timer);resolve();}});child.on('exit',c=>{clearTimeout(timer);reject(Error('Development server exited '+c+'; '+errors.join(' ')));});child.stderr.on('data',d=>{if(!d.toString().includes('ExperimentalWarning'))errors.push(d.toString());});});
  assert.equal((await fetch('http://127.0.0.1:3000/api/health')).status,401);
  browser=await chromium.launch({executablePath:process.env.PRIVATE_AI_TEST_CHROMIUM,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote','--single-process']});
  const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='prompt'?d.accept(token):d.accept());
  // Connector cannot materialize >1 MB branding blobs; use existing repo icon for QA only.
  await page.route(/\/(?:logo|icon)\.png$/,route=>route.fulfill({path:path.join(__dirname,'../chrome_extension/icon128.png')}));
  await page.goto('http://127.0.0.1:3000');
  await page.getByRole('heading',{name:'Today',exact:true}).waitFor();
  assert.match(await page.locator('#development-mode-banner').textContent(),/Not for PHI/);
  assert.match(await page.locator('.today-page').textContent(),/Surveillance incomplete/);
  await page.getByRole('button',{name:'Open isolated Demo Mode'}).click();
  await page.getByRole('button',{name:'Return to production',exact:true}).waitFor();
  await page.locator('.today-page [data-evidence]').first().click();await page.locator('[data-evidence-output] pre').first().waitFor();
  await page.locator('.today-page [data-follow-up]').first().click();
  const form=page.locator('dialog form');await form.locator('[name=reviewer]').fill('Synthetic UI reviewer');await form.locator('[name=status]').selectOption('waiting');await form.locator('[name=note]').fill('Synthetic review pending');await form.getByRole('button',{name:'Save follow-up'}).click();await page.locator('dialog').waitFor({state:'detached'});
  fs.mkdirSync(path.join(__dirname,'../build/screenshots'),{recursive:true});await page.screenshot({path:path.join(__dirname,'../build/screenshots/hardening-today-demo.png')});
  await page.getByRole('button',{name:'Full SNF Command Center'}).click();await page.locator('.snf-headline').waitFor();assert.match(await page.locator('.snf-page').textContent(),/DEMO DATA/);
  await page.getByRole('button',{name:'Today / Demo workspace'}).click();await page.getByRole('button',{name:'Delete demo data and return'}).click();await page.getByRole('button',{name:'Open isolated Demo Mode'}).waitFor();
  assert.doesNotMatch(await page.locator('.today-page').textContent(),/Eleanor Vance|Dorothy Zimmerman/);
  await page.getByRole('button',{name:'PCC Import Center',exact:true}).first().click();await page.getByRole('heading',{name:'PCC Import Center'}).waitFor();
  // Development mode must visibly block production import flow.
  assert.match(await page.locator('#content').textContent(),/Development mode|No imports yet|disabled/i);
  assert.equal(errors.length,0,errors.join('\n'));console.log('PASS: authenticated dev server, Today, demo isolation, evidence, follow-up, reset and navigation.');
 }finally{await browser?.close();child.kill();if(child.exitCode===null&&child.signalCode===null)await new Promise(r=>{child.once('exit',r);setTimeout(r,1000);});fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
