'use strict';
// Explicit integration check: install matching Playwright browsers, then run this file.
// Uses only temporary profiles, encrypted fixtures and intercepted synthetic HTTPS pages.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs'),{BrowserWorker,validateRecipe}=require('../source/browser-worker.cjs');
const {chromium,firefox}=require('playwright-core');
(async()=>{
 const {extractVisible}=await import('../chrome_extension/capture.mjs');
 const targets=(process.env.PRIVATE_AI_TEST_BROWSERS||'edge,chrome,firefox,chromium').split(',');
 for(const selected of targets){
  const cleanup=[],{core}=fixture({after:fn=>cleanup.push(fn)});core.resources.approve=async()=>true;
  let uiBrowser,worker;
  try{
   const engine=selected==='firefox'?firefox:chromium;
   const wrapper={launchPersistentContext:async(profile,options)=>{
    const context=await engine.launchPersistentContext(profile,{...options,headless:true});
    const create=context.newPage.bind(context);
    context.newPage=async()=>{
     const page=await create();page.on('pageerror',e=>console.error('Synthetic page error:',e.message));page.on('download',()=>console.log(selected+': download event'));await page.route('https://report.privateai.invalid/**',r=>r.request().url().endsWith('/download')?r.fulfill({headers:{'content-type':'text/plain','content-disposition':'attachment; filename=report.txt'},body:'Synthetic report'}):r.fulfill({contentType:'text/html',body:`<input id="pw" type="password"><main><button id="ready" hidden>Signed in</button><button id="export" onclick="location.href='/download'">Download</button></main><script>document.querySelector('#pw').value='SYNTHETIC_PASSWORD';Object.defineProperty(document.querySelector('#pw'),'value',{get(){throw Error('Credential value was read')}});setTimeout(()=>document.querySelector('#ready').hidden=false,200)</script>`}));return page;
    };return context;
   }};
   worker=new BrowserWorker(core,{chromium:wrapper,firefox:wrapper});
   console.log(selected+': running synthetic workflow');const out=await worker.run({name:'Synthetic report',browser:selected,url:'https://report.privateai.invalid/report',steps:[{op:'login',selector:'#ready'},{op:'download',selector:'#export'}]});
   assert.equal(out.complete,true);assert.equal(fs.readFileSync(path.join(core.settings().workspace,out.relative),'utf8'),'Synthetic report');assert.doesNotMatch(JSON.stringify(out),/SYNTHETIC_PASSWORD/);
   uiBrowser=await engine.launch({headless:true,...(selected==='edge'?{channel:'msedge'}:selected==='chrome'?{channel:'chrome'}:{})});
   const page=await uiBrowser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.setContent('<main><p id="safe">Public report text</p><input type="password" value="SYNTHETIC_PASSWORD"><textarea>SYNTHETIC_TEXTAREA_SECRET</textarea><div contenteditable="true">SYNTHETIC_EDITABLE_SECRET</div><bitwarden-overlay>SYNTHETIC_MANAGER_SECRET</bitwarden-overlay><div autocomplete="current-password">SYNTHETIC_AUTOCOMPLETE_SECRET</div><p hidden>SYNTHETIC_HIDDEN_SECRET</p></main>');
   const full=await page.evaluate(extractVisible,false);assert.equal(full.text,'Public report text');
   await page.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.body);const s=window.getSelection();s.removeAllRanges();s.addRange(range);});
   const selection=await page.evaluate(extractVisible,true);assert.equal(selection.text,'Public report text');
   await page.evaluate(()=>{const r=document.createRange(),n=document.querySelector('#safe').firstChild;r.setStart(n,7);r.setEnd(n,13);window.getSelection().removeAllRanges();window.getSelection().addRange(r);});assert.equal((await page.evaluate(extractVisible,true)).text,'report');
   const calls=[];await page.exposeFunction('fixtureCall',async(op,data)=>{
    calls.push({op,data});if(op==='browserRecipes')return core.store.list('browserRecipe');
    if(op==='browserSave'){const r=validateRecipe(data);core.store.put('browserRecipe',r.id,r);return r;}
    if(op==='browserOpen')return true;throw Error(op);
   });
   await page.setContent('<main id="content"></main>');
   await page.evaluate(async source=>{
    const {createBrowserUI}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(source));
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const ui=createBrowserUI({api:window.fixtureCall,esc,toast:()=>{}});
    document.querySelector('#content').innerHTML=await ui.html();
    document.addEventListener('click',async e=>{const b=e.target.closest('[data-act]');if(b&&await ui.handle(b.dataset.act,b.dataset.id))document.querySelector('#content').innerHTML=await ui.html();});
   },fs.readFileSync(path.join(__dirname,'../source/ui/browser-recipes.mjs'),'utf8'));
   await page.locator('[name=recipeBrowser]').selectOption(selected);await page.locator('[name=recipeName]').fill('Synthetic saved workflow');await page.locator('[name=recipeUrl]').fill('https://report.privateai.invalid');await page.locator('[name=recipeSelector]').fill('#export');await page.locator('[name=recipeLogin]').fill('#ready');await page.locator('[data-act=browser-save]').click();await page.getByText('Synthetic saved workflow',{exact:true}).waitFor();
   await page.locator('[data-act=browser-edit]').click();await page.waitForFunction(expected=>document.querySelector('[name=recipeBrowser]').value===expected,selected);assert.equal(await page.locator('[name=recipeLogin]').inputValue(),'#ready');
   await page.locator('[name=recipeName]').fill('Synthetic edited workflow');await page.locator('[data-act=browser-save]').click();await page.getByText('Synthetic edited workflow',{exact:true}).waitFor();assert.equal(core.store.list('browserRecipe').length,1);
   await page.locator('[data-act=browser-open][data-id]').click();await page.waitForTimeout(50);assert.equal(calls.find(c=>c.op==='browserOpen').data.browser,selected);assert.deepEqual(errors,[]);
   console.log('PASS '+selected+': synthetic download/sign-in wait, protected capture and browser choice save/edit/reload/use.');
  }finally{await worker?.close();await uiBrowser?.close();for(const fn of cleanup.reverse())fn();}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
