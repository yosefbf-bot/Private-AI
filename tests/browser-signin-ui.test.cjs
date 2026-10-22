'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs'),{BrowserCredentials}=require('../source/browser-credentials.cjs'),{validateRecipe}=require('../source/browser-worker.cjs'),{BrowserReports,digest}=require('../source/browser-reports.cjs');
test('Windows Edge sign-in controls clear before RPC, preserve config and show safe recovery in both themes',{skip:process.platform!=='win32',timeout:60000},async t=>{
 const cleanup=[],{core,cipher}=fixture({after:fn=>cleanup.push(fn)});let browser;
 t.after(async()=>{await browser?.close();for(const f of cleanup.reverse())f();});
 core.browserCredentials=new BrowserCredentials(core,{safeStorage:{isEncryptionAvailable:()=>true,encryptString:v=>cipher.seal(v,'synthetic-ui'),decryptString:b=>cipher.open(b,'synthetic-ui')},verifyProtection:()=>{},platform:'win32'});
 core.browserReports=new BrowserReports(core,{});
 const recipe=validateRecipe({name:'Synthetic UI report',url:'https://example.com/report',steps:[{op:'login',selector:'#ready'},{op:'download',selector:'#download'}],autoLogin:{formActions:['https://example.com/submit'],steps:[{op:'username',url:'https://example.com/login',selector:'#user'},{op:'password',url:'https://example.com/login',selector:'#password'},{op:'click',url:'https://example.com/login',selector:'#submit'}]}});core.store.put('browserRecipe',recipe.id,recipe);
 browser=await require('playwright-core').chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1100,height:850}});let saved=0,granted=false;
 await page.exposeFunction('fixtureAPI',async(op,data={})=>{
  if(op==='browserRecipes')return core.browserReports.list();
  if(op==='browserCredentialSave'){
   assert.deepEqual(await page.locator('[data-browser-credentials] input').evaluateAll(els=>els.map(e=>e.value)),['','']);
   assert.equal(data.username,'synthetic-ui-owner');assert.equal(data.password,'synthetic-ui-password');saved++;return core.browserCredentials.save(recipe,data);
  }
  if(op==='browserGrant'){granted=data.allowLocked;return core.browserReports.grant(data.id,digest(recipe),data.enabled,data.allowLocked);}
  if(op==='browserRun'){assert.equal(data.walkthrough,true);core.store.put('browserIssue',recipe.id,{id:recipe.id,hash:digest(recipe),phase:'signin',step:2,code:'BROWSER_LOGIN'});throw Error('Sign-in needs attention.');}
  if(op==='browserOpen')return true;
  if(op==='browserCredentialDelete')return core.browserCredentials.remove(data.id);
  throw Error('Unexpected synthetic UI operation');
 });
 await page.setContent('<main id="content"></main>');await page.addStyleTag({path:path.join(__dirname,'../source/ui/style.css')});
 await page.evaluate(async code=>{
  const {createBrowserUI}=await import('data:text/javascript;base64,'+code);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.ui=createBrowserUI({api:(op,data)=>window.fixtureAPI(op,data),esc,toast:()=>{}});
  window.render=async()=>{document.querySelector('#content').innerHTML=await window.ui.html();};await window.render();
  document.addEventListener('click',async e=>{const b=e.target.closest('[data-act]');if(b&&await window.ui.handle(b.dataset.act,b.dataset.id))await window.render();});
 },Buffer.from(fs.readFileSync(path.join(__dirname,'../source/ui/browser-recipes.mjs'),'utf8')).toString('base64'));
 await page.locator('[data-act=browser-edit]').click();assert.deepEqual(JSON.parse(await page.locator('[name=recipeAutoLogin]').inputValue()),recipe.autoLogin);
 const openCredentials=async()=>page.getByText('Automatic sign-in credentials',{exact:true}).click();
 await openCredentials();await page.locator('[data-credential-username]').fill('synthetic-ui-owner');await page.locator('[data-credential-password]').fill('synthetic-ui-password');await page.locator('[data-act=browser-credential-save]').click();
 await page.waitForFunction(()=>document.body.textContent.includes('Credentials saved. Test the actual sign-in before approval.'));assert.equal(saved,1);assert.equal(await page.locator('[data-act=browser-grant]').isDisabled(),true);
 core.store.put('browserLoginVerified',recipe.id,{id:recipe.id,hash:digest(recipe),revision:core.browserCredentials.status(recipe).revision});await page.evaluate(()=>window.render());assert.equal(await page.getByText('Saved sign-in tested; finish a successful report download before approval.',{exact:true}).count(),1);assert.equal(await page.locator('[data-act=browser-grant]').isDisabled(),true);
 core.store.put('browserVerified',recipe.id,{id:recipe.id,hash:digest(recipe)});await page.evaluate(()=>window.render());
 await page.getByText('Run on a schedule',{exact:true}).click();await page.locator('[data-browser-allow-locked]').check();await page.locator('[data-act=browser-grant]').click();await page.getByText('Revoke unattended access',{exact:true}).waitFor({state:'attached'});assert.equal(granted,true);
 await page.locator('[data-act=browser-walkthrough]').first().click();await page.getByText('Workflow needs attention',{exact:true}).waitFor();assert.match(await page.locator('[aria-current=step]').innerText(),/Stopped here: password/);
 for(const theme of ['light','dark']){await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);assert.equal(await page.locator('[aria-current=step]').isVisible(),true);assert.doesNotMatch(await page.locator('body').innerHTML(),/synthetic-ui-password|synthetic-ui-owner/);}
 assert.deepEqual(await page.locator('[data-browser-credentials] input').evaluateAll(els=>els.map(e=>e.value)),['','']);
 core.store.put('browserIssue',recipe.id,{id:recipe.id,hash:digest(recipe),phase:'report',step:1,code:'BROWSER_UPDATE'});await page.evaluate(()=>window.render());
 for(const theme of ['light','dark']){await page.evaluate(value=>document.documentElement.dataset.theme=value,theme);assert.equal(await page.getByText('Browser update required',{exact:true}).isVisible(),true);assert.match(await page.locator('body').innerText(),/Chromium engine 155 or newer/);assert.equal(await page.locator('[aria-current=step]').count(),0);}
});
