'use strict';
// Isolated synthetic evidence for the changed UI; no AI/model, network account, or PHI.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {fixture}=require('../tests/helpers.cjs'),captures=require('../source/capture-workflows.cjs');
const after=[],{core}=fixture({after:fn=>after.push(fn)});
let browser;
const server=http.createServer((req,res)=>{
  if(req.url==='/captures.mjs'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(__dirname,'../source/ui/captures.mjs')));return;}
  res.setHeader('Content-Type','text/html');res.end('<div id="content"></div><script type="module">import {createCaptureUI} from "/captures.mjs";window.createCaptureUI=createCaptureUI;</script>');
});
(async()=>{
  for(let i=0;i<40;i++)captures.create(core,{sourceId:'synthetic-bounded-notes-'+i,text:'SYNTHETIC bounded note '+i+' '+ '#'.repeat(11800)});
  const bounded=captures.list(core);assert.equal(bounded.truncated,true);assert.ok(bounded.captures.length<100);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({executablePath:process.env.PRIVATE_AI_TEST_CHROMIUM,headless:true});
  const page=await browser.newPage();await page.exposeFunction('captureList',()=>captures.list(core));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>!!window.createCaptureUI);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.evaluate(async()=>{
    const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const ui=window.createCaptureUI({api:op=>op==='captureList'?window.captureList():Promise.reject(Error('unexpected mutation')),esc,toast:()=>{},form:async()=>null,field:()=>'',textarea:()=>'',select:()=>'',refresh:async()=>{}});
    await ui.render(document.getElementById('content'));
  });
  assert.equal(await page.locator('#content article.card').count(),bounded.captures.length);
  await page.getByText('Showing a bounded set of recent notes; use Action Center for other follow-ups.',{exact:true}).waitFor();
  await page.getByText('Evidence (optional; up to 5 MiB)',{exact:false}).waitFor();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({checks:3,storedNotes:40,renderedNotes:bounded.captures.length,truncated:true,browser:await browser.version(),scope:'Real Core/SQLite + isolated synthetic Edge component; no packaged acceptance'}));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await browser?.close();server.close();for(const fn of after)fn();});
