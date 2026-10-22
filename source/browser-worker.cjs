'use strict';
const fs=require('node:fs'),path=require('node:path');
const {fail,uuid,safePath,text}=require('./security.cjs');
const {workspace}=require('./files.cjs');
const {browsers,browserId,launchOptions,profilePath,checkReportBrowser}=require('./browser-options.cjs');
const {validateLogin,signIn}=require('./browser-login.cjs');
function validateBrowserTarget(input){
 const url=new URL(text(input.url,2000));if(url.protocol!=='https:'||url.username||url.password)throw fail('INVALID');
 const origins=[...new Set([url.origin,...(input.origins||[])])];if(origins.length>8||origins.some(v=>new URL(v).protocol!=='https:'||new URL(v).origin!==v))throw fail('INVALID');
 return {url:url.href,origins,browser:browserId(input.browser)};
}
function validateRecipe(input){
 const name=text(input.name,80).trim(),target=validateBrowserTarget(input);if(!name)throw fail('INVALID');
 const steps=input.steps||[];if(!Array.isArray(steps)||!steps.length||steps.length>20)throw fail('INVALID');
 for(const s of steps){if(!['click','fill','wait','login','download'].includes(s.op)||typeof s.selector!=='string'||!s.selector.trim()||s.selector.length>300)throw fail('INVALID');if(s.op==='fill'){text(s.value,500);if(/password|passwd|current-password|new-password|one-time-code/i.test(s.selector))throw fail('BROWSER_LOGIN');}}
 if(steps.filter(s=>s.op==='download').length!==1||steps.at(-1).op!=='download')throw fail('INVALID');
 if(!['generic','pcc'].includes(input.sourceProvider||'generic'))throw fail('INVALID');
 if(input.id!==undefined&&!require('./security.cjs').isId(input.id))throw fail('INVALID');
 const autoLogin=validateLogin(input.autoLogin,target.origins);
 if(autoLogin&&(steps[0].op!=='login'||steps.filter(s=>s.op==='login').length!==1||browsers[target.browser].engine!=='chromium'))throw fail('INVALID');
 return {id:input.id||uuid(),name,...target,sourceProvider:input.sourceProvider||'generic',steps:steps.map(s=>({op:s.op,selector:s.selector,...(s.op==='fill'?{value:s.value}:{})})),...(autoLogin?{autoLogin}:{})};
}
class BrowserWorker{
 constructor(core,{chromium=require('playwright-core').chromium,firefox=require('playwright-core').firefox}={}){this.core=core;this.engines={chromium,firefox};this.busy=false;this.context=null;this.browser=null;this.generation=0;}
 async open(url,origins,running=false,selected='edge',scheduled=false,guard=()=>{},protectedLogin=false){
  ({url,origins}=validateBrowserTarget({url,origins,browser:selected}));
  if(this.opening||this.busy&&!running)throw fail('BUSY');this.opening=true;
  const generation=++this.generation,check=()=>{if(!scheduled)this.core.assertUnlocked();else if(!this.scheduledGuard)throw fail('BROWSER_REVIEW');this.core.resources.cancel();if(generation!==this.generation)throw fail('CANCELLED');guard();};
  try{
   check();
   if(!running)await this.core.resources.preflight('browser');
   check();
   if(this.context&&(this.browser!==selected||protectedLogin||this.network))await this.close(false);
   check();
   if(!this.context){
    const browser=browsers[selected];await this.core.resources.reserveBrowser(this,'Report browser ('+browser.name+')');check();
    const options={...launchOptions(selected),serviceWorkers:'block',...(scheduled?{headless:true,viewport:{width:1280,height:900}}:{})};
    if(protectedLogin){options.ignoreDefaultArgs=options.ignoreDefaultArgs.filter(a=>a!=='--disable-extensions');options.args=['--disable-extensions'];}
    try{this.context=await this.engines[browser.engine].launchPersistentContext(profilePath(this.core.root,selected),options);}catch{throw fail('BROWSER_SETUP');}
    this.browser=selected;const opened=this.context;
    opened.on('close',()=>{if(this.context===opened){this.context=null;this.browser=null;this.core.resources.releaseBrowser(this);}});
   }
   check();
   if(running)checkReportBrowser(this.context,selected);
   await this.context.unroute('**/*');
   check();
   // Manual setup permits the user to install/unlock their password manager.
   // The automated run always reapplies its trusted-origin boundary first.
   let selectedPage;
   this.network=protectedLogin?require('./browser-login-network.cjs').protectedNetwork({recipe:this.activeRecipe,check,page:()=>selectedPage}):null;
   if(running)await this.context.route('**/*',this.network?this.network.handler:route=>{let allowed=false;try{check();const u=new URL(route.request().url());allowed=u.protocol==='https:'&&origins.includes(u.origin);}catch{}return allowed?route.continue():route.abort();});
   if(protectedLogin){if(!this.context.routeWebSocket)throw fail('BROWSER_SETUP');await this.context.routeWebSocket('**/*',socket=>socket.close());}
   check();
   const page=selectedPage=this.context.pages().find(p=>{try{return origins.includes(new URL(p.url()).origin);}catch{return false;}})||await this.context.newPage();check();await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});await this.network?.settle();check();return page;
  }catch(e){try{this.network?.assert();}catch(networkError){e=networkError;}if(!['DEFERRED','INTERFERENCE'].includes(e.code))await this.close();if(e.code)throw e;throw fail('ACCESS');}finally{this.opening=false;}
 }
 async run(input,{scheduled=false,lease,walkthrough=false,testSignin=false}={}){
  if(this.busy)throw fail('BUSY');const recipe=validateRecipe(input);
  const scheduledGuard=()=>this.core.browserReports.checkLease(lease,recipe);
  if(scheduled){if(this.context||!this.core.browserReports)throw fail('BUSY');scheduledGuard();}else await this.core.resources.preflight('browser');
  if(this.busy||this.opening)throw fail('BUSY');this.busy=true;let temp,keep=false,phase='report',stepIndex=0;
  this.scheduledGuard=scheduled?scheduledGuard:null;
  this.activeRecipe=recipe;
  try{const root=workspace(this.core.settings().workspace,this.core.root),page=await this.open(recipe.url,recipe.origins,true,recipe.browser,scheduled,()=>{if(scheduled)scheduledGuard();},!!recipe.autoLogin);
   const generation=this.generation;
   let rateLimited=false;page.on?.('response',response=>{if(response.status()===429)rateLimited=true;});
   const check=()=>{this.network?.assert();if(!this.context||generation!==this.generation)throw fail('CANCELLED');if(rateLimited)throw fail('REPORT_RATE_LIMIT');if(scheduled)scheduledGuard();else this.core.assertUnlocked();this.core.resources.cancel();if(!recipe.origins.includes(new URL(page.url()).origin))throw fail('POLICY');};
   for(const [index,step] of recipe.steps.entries()){phase='report';stepIndex=index;await this.core.resources.checkpoint();check();const locator=page.locator(step.selector);
    // Wait for a post-login control; never inspect the password value or manager UI.
    if(step.op==='login'){
     const used=await signIn(this.core,page,recipe,locator,check,i=>{phase='signin';stepIndex=i;},()=>this.network?.settle(),this.network);
     if(testSignin&&!used)throw fail('BROWSER_CREDENTIAL');
     try{await locator.waitFor({state:'visible',timeout:scheduled?5000:300000});}catch{throw fail('BROWSER_LOGIN');}check();continue;
    }
    if(await locator.count()!==1)throw fail('ACCESS');check();
    if(step.op==='click')await locator.click({timeout:20000});
    if(step.op==='fill'){
     const sensitive=await locator.evaluate(el=>el.matches('input[type="password" i],[autocomplete="current-password" i],[autocomplete="new-password" i],[autocomplete="one-time-code" i]')||/password|passwd|passcode|otp/i.test((el.getAttribute('name')||'')+' '+(el.id||'')));
     if(sensitive)throw fail('BROWSER_LOGIN');check();await locator.fill(step.value,{timeout:20000});
    }
    if(step.op==='wait')await locator.waitFor({state:'visible',timeout:30000});
    if(step.op!=='download'){await this.network?.settle();check();}
    if(step.op==='download'){
     const waiting=page.waitForEvent('download',{timeout:60000});waiting.catch(()=>{});await locator.click({timeout:20000});await this.network?.settle(waiting);const download=await waiting;check();const ext=path.extname(download.suggestedFilename()).toLowerCase();if(!['.pdf','.xlsx','.xls','.csv','.tsv','.docx','.txt'].includes(ext))throw fail('FILE');
     const name='Report-'+new Date().toISOString().slice(0,10)+'-'+uuid()+ext,relative='Reports/'+name,file=safePath(root,relative);temp=file+'.partial';await download.saveAs(temp);if(await download.failure())throw fail('FILE');check();if(fs.statSync(temp).size>100*1024**2)throw fail('LIMIT');fs.renameSync(temp,file);temp=null;if(!scheduled)this.core.store.put('browserVerified',recipe.id,{id:recipe.id,hash:require('./browser-reports.cjs').digest(recipe),tested:Date.now()});this.core.store.delete('browserIssue',recipe.id);return {relative,complete:true};
    }
   }
  }catch(e){
   const code=require('./security.cjs').safeError(e.code?e:fail('ACCESS')).code;
   keep=!!walkthrough&&!scheduled&&!this.core.locked&&!!this.context&&this.generation>0&&!['CANCELLED','LOCKED','POLICY','BROWSER_REVIEW'].includes(code);
   if(this.core.store.db)this.core.store.put('browserIssue',recipe.id,{id:recipe.id,hash:require('./browser-reports.cjs').digest(recipe),phase,step:stepIndex+1,code,observed:Date.now()});
   throw fail(code);
  }finally{if(temp)try{fs.unlinkSync(temp);}catch{}this.busy=false;this.scheduledGuard=null;this.activeRecipe=null;if(!keep)await this.close();}
 }
 canContinueLocked(){try{if(!this.scheduledGuard)return false;this.scheduledGuard();return true;}catch{return false;}}
 async close(cancelOpening=true){if(cancelOpening)this.generation++;const context=this.context;this.context=null;this.browser=null;try{await context?.close();}catch{}this.network?.clear();this.network=null;this.core.resources.releaseBrowser(this);}
}
module.exports={BrowserWorker,validateRecipe,validateBrowserTarget};
