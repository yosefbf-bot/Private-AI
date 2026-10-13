'use strict';
// Synthetic real-browser acceptance. No mailbox, browser profile or owner data.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core'),{fixture}=require('./helpers.cjs'),{uuid}=require('../source/security.cjs');
const cleanups=[],checks=[],errors=[];
(async()=>{
 const {core}=fixture({after:fn=>cleanups.push(fn)},{generate:()=>assert.fail('No cloud inference')});
 const assets=require('../source/document-tools-assets.cjs'),from=process.env.PRIVATE_AI_DOCUMENT_ASSETS;
 if(!from)throw Error('Set PRIVATE_AI_DOCUMENT_ASSETS to verified synthetic test assets');
 fs.mkdirSync(assets.folder(core),{recursive:true});for(const kind of ['embedding','ocr'])fs.copyFileSync(path.join(from,assets.assets[kind].file),path.join(assets.folder(core),assets.assets[kind].file));
 core.router.local?.close();core.router.local=new (require('../source/local-brain.cjs').LocalBrain)({runtime:process.env.PRIVATE_AI_LOCAL_RUNTIME,settings:()=>core.settings(),fetcher:(url,options)=>{assert.equal(new URL(url).hostname,'127.0.0.1');return fetch(url,options);}});
 core.saveSettings({processingMode:'local-only',allowCloud:false});
 const project=core.projectSave({name:'Synthetic selected references'});
 for(const [name,text]of [['Falls.txt','[Page 2]\nClear slippery surfaces and obstacles from walking routes.'],['Payroll.txt','Payroll overtime requires review against the staffing roster.']]){const row={id:uuid(),name,text,updated:Date.now(),hipaa:true,bytes:''};core.store.put('file',row.id,row);project.fileIds.push(row.id);}core.store.put('project',project.id,project);
 const server=http.createServer((req,res)=>{
  if(req.url==='/'){res.setHeader('content-type','text/html');res.end('<!doctype html><main id="content"></main>');return;}
  const file=path.resolve(__dirname,'..','.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(path.resolve(__dirname,'../source/ui')+path.sep)){res.statusCode=404;res.end();return;}
  try{res.setHeader('content-type',file.endsWith('.mjs')?'text/javascript':'text/plain');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));cleanups.push(()=>server.close());
 const browser=await chromium.launch({headless:true,channel:'msedge'});cleanups.push(()=>browser.close());const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
 const origin='http://127.0.0.1:'+server.address().port;await page.goto(origin);
 await page.exposeFunction('fixtureCall',(op,data={})=>op==='stop'?core.stop(data.id):require('../source/workflows/index.cjs').dispatch(core,op,data));
 await page.evaluate(async()=>{
  const {createWorkflowUI}=await import('/source/ui/workflows.mjs');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.testUI=createWorkflowUI({api:window.fixtureCall,esc,toast:message=>window.lastNotice=message});await window.testUI.render(document.querySelector('#content'),'workspace');
 });
 assert.equal(await page.locator('[name=mode]').inputValue(),'semantic');await page.locator('#wf-project').selectOption(project.id);
 await page.locator('[name=query]').fill('How can we reduce residents slipping and falling?');await page.locator('#wf-search button[type=submit]').click();
 await page.locator('#wf-search-results .card').first().waitFor();assert.match(await page.locator('#wf-search-results .card').first().innerText(),/Falls.txt.*page 2/s);assert.match(await page.locator('#wf-search-results').innerText(),/not clinical confidence/);checks.push('real Core/SQLite/BGE meaning search from Library with project scope and citations');
 await page.locator('[name=mode]').selectOption('words');await page.locator('[name=query]').fill('overtime');await page.locator('#wf-search button[type=submit]').click();await page.waitForFunction(()=>document.querySelector('#wf-search-results').textContent.includes('Payroll.txt'));checks.push('existing word search remains in the same Library');
 let began;const started=new Promise(resolve=>began=resolve),original=core.router.local.embeddings.bind(core.router.local);
 core.router.local.embeddings=async(_s,_input,{signal})=>{began();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(Error('cancelled'),{code:'CANCELLED'})),{once:true}));};
 await page.locator('[name=mode]').selectOption('semantic');await page.locator('[name=query]').fill('Synthetic cancellation');await page.locator('#wf-search button[type=submit]').click();await started;
 await page.evaluate(()=>{window.testUI.stop();document.querySelector('#content').innerHTML='<h1>New chat</h1>';});
 for(let i=0;i<100&&core.requests.size;i++)await new Promise(resolve=>setTimeout(resolve,20));assert.equal(core.requests.size,0);assert.equal(await page.locator('#content').innerText(),'New chat');core.router.local.embeddings=original;checks.push('navigation cancels search and cannot restore the old Library view');
 const {extractVisible,buildQuestion}=await import('../chrome_extension/capture.mjs');let touched=false;
 assert.deepEqual(await buildQuestion({prompt:'Synthetic',includePage:false},{tabs:{query:()=>{touched=true;}}}),{prompt:'Synthetic'});assert.equal(touched,false);
 const article='<title>Synthetic safety reference</title><nav>UNWANTED_NAVIGATION</nav><article><h1>Fall prevention reference</h1>'+Array.from({length:8},()=>'<p>A synthetic facility policy explains reviewing walkways, documenting hazards and checking the original record. This is source text for testing article extraction only.</p>').join('')+'<p id="selected">Exact selected passage</p><p hidden>PRIVATE_HIDDEN</p><input value="PRIVATE_INPUT"><textarea>PRIVATE_TEXTAREA</textarea><div contenteditable="true">PRIVATE_EDITABLE</div><bitwarden-overlay>PRIVATE_VAULT</bitwarden-overlay></article>';
 await page.route('https://synthetic.privateai.invalid/**',route=>route.fulfill({contentType:'text/html',body:article}));await page.goto('https://synthetic.privateai.invalid/article?token=PRIVATE_QUERY#PRIVATE_FRAGMENT');await page.addScriptTag({content:fs.readFileSync(path.resolve(__dirname,'../chrome_extension/vendor/readability.js'),'utf8')});
 const before=await page.locator('body').innerHTML(),capture=await page.evaluate(extractVisible,false);
 assert.equal(capture.extraction,'article');assert.match(capture.text,/Source page .*https:\/\/synthetic.privateai.invalid\/article\n/);assert.match(capture.text,/Fall prevention/);assert.doesNotMatch(capture.text,/PRIVATE_|UNWANTED_NAVIGATION/);assert.equal(await page.locator('body').innerHTML(),before);
 await page.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('#selected'));window.getSelection().removeAllRanges();window.getSelection().addRange(range);});assert.equal((await page.evaluate(extractVisible,true)).text,'Exact selected passage');checks.push('Readability parses filtered visible article; hidden/form/vault text, URL credentials and unselected text excluded; source DOM intact');
 await page.setContent('<main><table><tr><td>Resident A</td><td>Unknown feed</td></tr></table><input value="PRIVATE_FORM"></main>');const table=await page.evaluate(extractVisible,false);assert.equal(table.extraction,'visible');assert.match(table.text,/Unknown feed/);assert.doesNotMatch(table.text,/PRIVATE_FORM/);checks.push('table/portal capture preserves the existing visible-text fallback');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks,cloudInferenceCalls:0}));
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{for(const cleanup of cleanups.reverse())await cleanup();});
