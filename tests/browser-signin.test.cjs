'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fixture}=require('./helpers.cjs');
const {BrowserCredentials}=require('../source/browser-credentials.cjs');
const {BrowserWorker,validateRecipe}=require('../source/browser-worker.cjs');
const {BrowserReports,digest}=require('../source/browser-reports.cjs');
const {signIn}=require('../source/browser-login.cjs');
const {fail}=require('../source/security.cjs');
const username='synthetic-owner',password='synthetic-only-signin-value';
const login={formActions:['https://example.com/submit'],steps:[{op:'username',url:'https://example.com/login',selector:'#user'},{op:'password',url:'https://example.com/login',selector:'#password'},{op:'click',url:'https://example.com/login',selector:'#submit'}]};
function setup(t){
 const f=fixture(t),{core}=f,key=crypto.randomBytes(32);let protections=0;
 const safeStorage={isEncryptionAvailable:()=>true,encryptString:value=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),body=Buffer.concat([c.update(value),c.final()]);return Buffer.concat([iv,c.getAuthTag(),body]);},decryptString:bytes=>{const d=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));d.setAuthTag(bytes.subarray(12,28));return Buffer.concat([d.update(bytes.subarray(28)),d.final()]).toString();}};
 core.browserCredentials=new BrowserCredentials(core,{safeStorage,platform:'win32',verifyProtection:()=>protections++});
 const recipe=validateRecipe({name:'Synthetic protected report',url:'https://example.com/report',autoLogin:login,steps:[{op:'login',selector:'#ready'},{op:'download',selector:'#download'}]});core.store.put('browserRecipe',recipe.id,recipe);
 const save=()=>core.browserCredentials.save(recipe,{username,password});
 return {...f,recipe,save,safeStorage,protections:()=>protections};
}
test('protected sign-in validates exact HTTPS destinations, bounded steps and real IDs',()=>{
 const input={name:'Synthetic',url:'https://example.com/report',steps:[{op:'login',selector:'#ready'},{op:'download',selector:'#download'}],autoLogin:login};
 assert.deepEqual(validateRecipe(input).autoLogin,login);
 for(const mutation of [r=>r.id='../bad',r=>r.browser='firefox',r=>r.autoLogin.steps[0].password=password,r=>r.autoLogin.steps[1].op='fill',r=>r.autoLogin.steps[0].url='http://example.com/login',r=>r.autoLogin.steps[0].url='https://elsewhere.invalid/login',r=>r.autoLogin.steps[0].url='https://example.com/login?token=hidden',r=>r.autoLogin.steps[0].url='https://example.com/login#token',r=>r.steps.shift()]){
  const row=structuredClone(input);mutation(row);assert.throws(()=>validateRecipe(row),{code:'INVALID'});
 }
});
test('separate protected file survives service restart and is absent from recipe, database and metadata',async t=>{
 const x=setup(t);x.save();const file=path.join(x.core.root,'report-signins',x.recipe.id+'.dpapi');
 for(const bytes of [fs.readFileSync(file),fs.readFileSync(x.core.store.file||path.join(x.core.root,'privateai.db'))]){assert.ok(!bytes.includes(Buffer.from(password)));assert.ok(!bytes.includes(Buffer.from(username)));}
 const before=x.core.browserCredentials.status(x.recipe);x.core.browserCredentials=new BrowserCredentials(x.core,{safeStorage:x.safeStorage,platform:'win32',verifyProtection:()=>{}});
 await x.core.browserCredentials.use(x.recipe,async secret=>{assert.equal(secret.password,password);assert.equal(secret.username,username);assert.equal(secret.revision,before.revision);});
 assert.ok(x.protections()>0);assert.doesNotMatch(JSON.stringify(x.core.store.list('browserCredential')),new RegExp(password));assert.doesNotMatch(JSON.stringify(x.recipe),new RegExp(password));
});
test('recipe binding, copied files, corrupt ciphertext and unavailable protection fail closed',async t=>{
 const x=setup(t);x.save();const file=path.join(x.root,'report-signins',x.recipe.id+'.dpapi');
 const changed={...x.recipe,name:'changed'};await assert.rejects(x.core.browserCredentials.use(changed,()=>assert.fail('changed credentials used')),{code:'BROWSER_CREDENTIAL'});
 const copied={...x.recipe,id:crypto.randomUUID()};x.core.store.put('browserCredential',copied.id,{...x.core.store.get('browserCredential',x.recipe.id),id:copied.id,hash:digest(copied)});fs.copyFileSync(file,path.join(x.root,'report-signins',copied.id+'.dpapi'));
 await assert.rejects(x.core.browserCredentials.use(copied,()=>assert.fail('copied credentials used')),{code:'BROWSER_CREDENTIAL'});
 fs.writeFileSync(file,'invalid ciphertext');await assert.rejects(x.core.browserCredentials.use(x.recipe,()=>assert.fail('corrupt used')),{code:'BROWSER_CREDENTIAL'});
 x.safeStorage.isEncryptionAvailable=()=>false;assert.throws(()=>x.save(),{code:'ENCRYPTION'});
});
test('credential update and deletion revoke every proof and grant without touching chats',t=>{
 const x=setup(t);x.save();const chat=x.core.createChat({title:'Kept synthetic chat'}),first=x.core.browserCredentials.status(x.recipe).revision;
 for(const kind of ['browserGrant','browserVerified','browserLoginVerified'])x.core.store.put(kind,x.recipe.id,{id:x.recipe.id,hash:digest(x.recipe)});
 x.save();assert.notEqual(x.core.browserCredentials.status(x.recipe).revision,first);
 for(const kind of ['browserGrant','browserVerified','browserLoginVerified'])assert.equal(x.core.store.get(kind,x.recipe.id),null);
 x.core.browserCredentials.remove(x.recipe.id);assert.equal(x.core.browserCredentials.status(x.recipe).saved,false);assert.equal(x.core.chat(chat.id).id,chat.id);
 x.core.lock();assert.throws(()=>x.save(),{code:'LOCKED'});
});
function pageHarness({cached=false,allowed=true,fillError=false,target='https://example.com/login',hook=()=>{}}={}){
 const fills=[],events=[];let readyVisible=cached,current=target;
 const ready={isVisible:async()=>readyVisible,waitFor:async()=>{if(!readyVisible)throw Error('synthetic verification required');}};
 const page={url:()=>current,locator:selector=>({waitFor:async()=>hook('wait',selector),count:async()=>1,isEnabled:async()=>true,evaluate:async()=>allowed,fill:async value=>{hook('fill',selector);if(fillError)throw Error(password+' https://example.com/login?session=secret');fills.push([selector,value]);},click:async()=>{hook('click',selector);events.push(selector);readyVisible=true;current='https://example.com/report';}})};
 return {page,ready,fills,events};
}
test('bounded automatic login uses only broker values and records proof after actual submit and ready',async t=>{
 const x=setup(t);x.save();const h=pageHarness(),progress=[];
 assert.equal(await signIn(x.core,h.page,x.recipe,h.ready,()=>x.core.assertUnlocked(),i=>progress.push(i)),true);
 assert.deepEqual(h.fills,[['#user',username],['#password',password]]);assert.deepEqual(h.events,['#submit']);assert.deepEqual(progress,[0,1,2]);
 const proof=x.core.store.get('browserLoginVerified',x.recipe.id);assert.equal(proof.revision,x.core.browserCredentials.status(x.recipe).revision);assert.doesNotMatch(JSON.stringify(proof),new RegExp(password));
});
test('cached session does not decrypt credentials or establish credential test proof',async t=>{
 const x=setup(t),h=pageHarness({cached:true});x.core.browserCredentials.use=()=>assert.fail('cached session read password');
 assert.equal(await signIn(x.core,h.page,x.recipe,h.ready,()=>{},()=>{}),false);assert.deepEqual(h.fills,[]);assert.equal(x.core.store.get('browserLoginVerified',x.recipe.id),null);
});
for(const mode of ['wrong-site','unsafe-form','sensitive-error','lock'])test('protected sign-in fails safely for '+mode,async t=>{
 const x=setup(t);x.save();const h=pageHarness({target:mode==='wrong-site'?'https://example.com/other':'https://example.com/login',allowed:mode!=='unsafe-form',fillError:mode==='sensitive-error',hook:()=>{if(mode==='lock')x.core.lock();}});
 await assert.rejects(signIn(x.core,h.page,x.recipe,h.ready,()=>x.core.assertUnlocked(),()=>{}),e=>e.code===(mode==='lock'?'LOCKED':'BROWSER_LOGIN')&&!e.message.includes(password)&&!e.message.includes('session=secret'));
 assert.equal(x.core.store.get('browserLoginVerified',x.recipe.id),null);if(['wrong-site','unsafe-form','lock'].includes(mode))assert.deepEqual(h.fills,[]);
});
function reportHarness(t,{failure=false,lockDuringLaunch=false}={}){
 const x=setup(t),{core,recipe}=x;let submits=0,launches=0;
 core.resources.memory=()=>8*1024**3;core.resources.approve=async()=>true;
 const engine={launchPersistentContext:async(_profile,options)=>{
  launches++;if(lockDuringLaunch)core.lock();let current='about:blank';const h=pageHarness({fillError:failure,hook:(op)=>{if(op==='click')submits++;}}),context={closed:false,on(){},route:async()=>{},unroute:async()=>{},routeWebSocket:async()=>{},close:async()=>{context.closed=true;}};
  const p={...h.page,url:()=>current,goto:async url=>{current=url.endsWith('/report')?'https://example.com/login':url;},on(){},waitForEvent:async()=>({suggestedFilename:()=> 'synthetic.csv',saveAs:async file=>fs.writeFileSync(file,'synthetic\n'),failure:async()=>null})};
  p.locator=selector=>selector==='#ready'?h.ready:selector==='#download'?{count:async()=>1,click:async()=>{}}:{...h.page.locator(selector),click:async()=>{await h.page.locator(selector).click();current='https://example.com/report';}};
  context.pages=()=>[p];context.newPage=async()=>p;context.options=options;return context;
 }};
 const browser=new BrowserWorker(core,{chromium:engine});core.browserReports=new BrowserReports(core,browser);t.after(()=>browser.close());
 x.save();const verified=()=>{const hash=digest(recipe);core.store.put('browserVerified',recipe.id,{id:recipe.id,hash});core.store.put('browserLoginVerified',recipe.id,{id:recipe.id,hash,revision:core.browserCredentials.status(recipe).revision});};
 const due=(overrides={})=>{const s=core.browserReports.save({browserRecipeId:recipe.id,frequency:'daily',...overrides});core.store.put('schedule',s.id,{...s,next:Date.now()-1});return s;};
 return {...x,browser,verified,due,submits:()=>submits,launches:()=>launches};
}
test('scheduled calls require an opaque lease, not a caller boolean',async t=>{
 const x=reportHarness(t);x.verified();x.core.browserReports.grant(x.recipe.id,digest(x.recipe),true,true);
 await assert.rejects(x.browser.run(x.recipe,{scheduled:true,lease:{}}),{code:'BROWSER_REVIEW'});assert.equal(x.launches(),0);
});
test('actual password test plus download permits approved locked report while general Core stays locked',async t=>{
 const x=reportHarness(t);await x.browser.run(x.recipe,{testSignin:true});assert.equal(x.submits(),1);
 const plan=x.core.browserReports.plan(x.recipe.id);x.core.browserReports.grant(x.recipe.id,plan.hash,true,true);const s=x.due({analysisPrompt:'Summarize supplied synthetic data'});
 x.core.lock();await x.core.browserReports.tick();assert.equal(x.submits(),2);assert.equal(x.core.locked,true);assert.throws(()=>x.core.createChat({}),{code:'LOCKED'});
 const row=x.core.store.list('job')[0];assert.equal(row.status,'completed');assert.equal(row.browserAnalysis.state,'pending');assert.equal(x.core.store.list('file').length,0);assert.ok(x.core.store.get('schedule',s.id).next>Date.now());
});
test('locking during scheduled launch preserves only the explicitly approved headless capability',async t=>{
 const x=reportHarness(t,{lockDuringLaunch:true});x.verified();x.core.browserReports.grant(x.recipe.id,digest(x.recipe),true,true);x.due();await x.core.browserReports.tick();assert.equal(x.submits(),1);assert.equal(x.core.locked,true);assert.equal(x.core.store.list('job')[0].status,'completed');
});
test('failed shared credentials disable all linked schedules and cannot auto retry',async t=>{
 const x=reportHarness(t,{failure:true});x.verified();x.core.browserReports.grant(x.recipe.id,digest(x.recipe),true,true);x.due();x.due();await x.core.browserReports.tick();
 assert.equal(x.launches(),1);assert.ok(x.core.store.list('schedule').every(s=>!s.enabled));assert.equal(x.core.store.get('browserGrant',x.recipe.id),null);
 await x.core.browserReports.tick();assert.equal(x.launches(),1);const issue=x.core.store.get('browserIssue',x.recipe.id);assert.equal(issue.phase,'signin');assert.equal(issue.step,1);assert.doesNotMatch(JSON.stringify(issue),/synthetic-only|session=|https:/);
});
test('credential metadata cannot substitute cached download proof for a real sign-in test',t=>{
 const x=reportHarness(t);x.core.store.put('browserVerified',x.recipe.id,{id:x.recipe.id,hash:digest(x.recipe)});assert.throws(()=>x.core.browserReports.plan(x.recipe.id),{code:'BROWSER_CREDENTIAL'});
});
test('deferred analysis retains failed outcome rather than claiming completed',async t=>{
 const x=reportHarness(t);x.verified();x.core.browserReports.grant(x.recipe.id,digest(x.recipe),true,true);x.due({analysisPrompt:'Synthetic instructions'});x.core.lock();await x.core.browserReports.tick();
 x.core.unlock();x.core.runJob=async input=>{x.core.store.put('job',input.id,{id:input.id,status:'failed',error:'AI_SETUP'});};
 await x.core.browserReports.tick();const parent=x.core.store.list('job').find(j=>j.browserAnalysis);assert.equal(parent.browserAnalysis.state,'needs_review');assert.equal(parent.browserAnalysis.error,'AI_SETUP');assert.equal(parent.status,'completed','Downloaded report remains available independently of failed analysis');
});
test('one-time dispatch may finish but owner schedule edits immediately invalidate its lease',async t=>{
 const x=reportHarness(t);x.verified();x.core.browserReports.grant(x.recipe.id,digest(x.recipe),true,true);const s=x.due({frequency:'once',at:new Date(Date.now()+60000).toISOString()});
 x.core.store.put('schedule',s.id,{...x.core.store.get('schedule',s.id),at:new Date(Date.now()-1000).toISOString()});
 await x.core.browserReports.tick();assert.equal(x.core.store.list('job')[0].status,'completed');assert.equal(x.core.store.get('schedule',s.id).enabled,false);
 const id=crypto.randomUUID();x.core.requests.set(id,new AbortController());const held=x.core.store.get('schedule',s.id),lease=x.core.browserReports.issueLease(x.recipe,held,id);x.core.store.put('schedule',s.id,{...held,name:'changed'});assert.throws(()=>x.core.browserReports.checkLease(lease,x.recipe),{code:'BROWSER_REVIEW'});x.core.requests.delete(id);
});
