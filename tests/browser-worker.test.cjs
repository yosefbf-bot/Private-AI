'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
const {BrowserWorker,validateRecipe}=require('../source/browser-worker.cjs');
const {launchOptions,profilePath}=require('../source/browser-options.cjs');
const base={name:'Synthetic report',url:'https://example.com/report',steps:[{op:'download',selector:'#download'}]};
function harness(t){
 const {core}=fixture(t),launches=[];core.resources.approve=async()=>true;core.resources.memory=()=>8*1024**3;
 const make=engine=>({launchPersistentContext:async(profile,options)=>{
  let current='about:blank';const handlers={};const page={url:()=>current,goto:async url=>{current=url;}};
  const context={handlers,page,closed:false,pages:()=>[page],newPage:async()=>page,on:(event,fn)=>handlers[event]=fn,route:async(_,fn)=>{context.guard=fn;},unroute:async()=>{context.guard=null;},close:async()=>{context.closed=true;handlers.close?.();}};
  launches.push({engine,profile,options,context});return context;
 }});
 const worker=new BrowserWorker(core,{chromium:make('chromium'),firefox:make('firefox')});t.after(()=>worker.close());return {core,worker,launches};
}
test('browser choice persists in encrypted recipes; legacy recipes retain Edge',t=>{
 const {core}=fixture(t);assert.equal(validateRecipe(base).browser,'edge');
 for(const browser of ['chrome','edge','firefox','chromium','brave','vivaldi']){
  const r=validateRecipe({...base,browser,steps:[{op:'login',selector:'#ready',password:'must-not-persist'},...base.steps]});core.store.put('browserRecipe',r.id,r);
  assert.equal(core.store.get('browserRecipe',r.id).browser,browser);assert.equal(r.steps[0].password,undefined);
 }
 for(const browser of ['safari','../chrome','toString',null])assert.throws(()=>validateRecipe({...base,browser}),{code:'INVALID'});
 assert.throws(()=>validateRecipe({...base,steps:[{op:'fill',selector:'input[type=password]',value:'synthetic'},...base.steps]}),{code:'BROWSER_LOGIN'});
});
test('profiles, engine switching and manual setup preserve isolation and reinstall the run guard',async t=>{
 const {core,worker,launches}=harness(t);
 await worker.open(base.url,['https://example.com'],false,'edge');assert.equal(launches[0].profile,path.join(core.root,'browser-profile'));assert.equal(launches[0].options.channel,'msedge');assert.equal(launches[0].context.guard,null);
 await worker.open(base.url,['https://example.com'],false,'chrome');assert.equal(launches[0].context.closed,true);assert.equal(launches[1].options.channel,'chrome');assert.notEqual(launches[1].profile,launches[0].profile);
 await worker.open(base.url,['https://example.com'],true,'firefox');assert.equal(launches[2].engine,'firefox');assert.equal(launches[2].options.firefoxUserPrefs['signon.rememberSignons'],true);
 const result=[];for(const url of ['https://example.com/report','https://other.invalid','http://example.com'])await launches[2].context.guard({request:()=>({url:()=>url}),continue:()=>result.push('allow'),abort:()=>result.push('block')});assert.deepEqual(result,['allow','block','block']);
 launches[0].context.handlers.close();assert.equal(worker.browser,'firefox');assert.equal(core.resources.browser.owner,worker);
 await worker.close();assert.equal(core.resources.browser,null);
});
test('launch configuration enables installed managers without plaintext password store flags',()=>{
 const options=launchOptions('chrome');assert.ok(options.ignoreDefaultArgs.includes('--disable-extensions'));assert.ok(options.ignoreDefaultArgs.includes('--password-store=basic'));assert.equal(options.args,undefined);
 assert.throws(()=>launchOptions('brave',{},()=>false),{code:'BROWSER_SETUP'});
 const b=launchOptions('brave',{LOCALAPPDATA:'synthetic-root'},()=>true);assert.match(b.executablePath,/BraveSoftware/);
 assert.notEqual(profilePath('root','firefox'),profilePath('root','chrome'));
});
test('missing engine fails visibly and releases its reservation without falling back',async t=>{
 const {core}=fixture(t);core.resources.approve=async()=>true;core.resources.memory=()=>8*1024**3; // Reach the synthetic missing-engine branch regardless of host RAM; resource guards have dedicated tests.
 const worker=new BrowserWorker(core,{firefox:{launchPersistentContext:async()=>{throw Error('private diagnostic');}},chromium:{launchPersistentContext:()=>assert.fail('fallback')}});
 await assert.rejects(worker.open(base.url,['https://example.com'],false,'firefox'),e=>e.code==='BROWSER_SETUP'&&!e.message.includes('private diagnostic'));assert.equal(core.resources.browser,null);
});
test('login waits for a post-login control without requiring it to exist first or reading credentials',async t=>{
 const {worker,launches}=harness(t);await worker.open(base.url,['https://example.com']);
 const events=[];launches[0].context.page.locator=selector=>({waitFor:async options=>{events.push([selector,options.timeout]);},count:async()=>selector==='#download'?0:assert.fail('login counted too early')});
 await assert.rejects(worker.run({...base,steps:[{op:'login',selector:'#ready'},...base.steps]}),{code:'ACCESS'});
 assert.deepEqual(events,[['#ready',300000]]);assert.equal(launches[0].context.closed,true);
});
test('runtime password field classification blocks a disguised selector before fill',async t=>{
 const {worker,launches}=harness(t);await worker.open(base.url,['https://example.com']);
 launches[0].context.page.locator=()=>({count:async()=>1,evaluate:async()=>true,fill:()=>assert.fail('password filled')});
 await assert.rejects(worker.run({...base,steps:[{op:'fill',selector:'#field1',value:'synthetic'},...base.steps]}),{code:'BROWSER_LOGIN'});
});
test('locking the app during sign-in prevents subsequent browser actions',async t=>{
 const {core,worker,launches}=harness(t);await worker.open(base.url,['https://example.com']);
 launches[0].context.page.locator=()=>({waitFor:async()=>{core.locked=true;},count:()=>assert.fail('continued after lock')});
 await assert.rejects(worker.run({...base,steps:[{op:'login',selector:'#ready'},...base.steps]}),{code:'LOCKED'});assert.equal(worker.context,null);
});

for(const mode of ['lock','cancel','close'])test('late browser launch is retired before navigation after '+mode,async t=>{
 const {core,worker,launches}=harness(t),launch=worker.engines.chromium.launchPersistentContext,controller=new AbortController();
 worker.engines.chromium.launchPersistentContext=async(...args)=>{const context=await launch(...args);if(mode==='lock')core.lock();if(mode==='cancel')controller.abort();if(mode==='close')await worker.close();return context;};
 await assert.rejects(core.resources.task('foreground',()=>worker.open(base.url,['https://example.com']),{signal:controller.signal}),{code:mode==='lock'?'LOCKED':'CANCELLED'});
 assert.equal(launches[0].context.page.url(),'about:blank');assert.equal(launches[0].context.closed,true);assert.equal(worker.context,null);assert.equal(core.resources.browser,null);
});

test('scheduled permission revocation during launch prevents initial navigation',async t=>{
 const {core,worker,launches}=harness(t),launch=worker.engines.chromium.launchPersistentContext;let permitted=true;
 core.browserReports={allowed:()=>{if(!permitted)throw require('../source/security.cjs').fail('POLICY');}};
 worker.engines.chromium.launchPersistentContext=async(...args)=>{const context=await launch(...args);permitted=false;return context;};
 await assert.rejects(worker.run(base,{scheduled:true}),{code:'POLICY'});
 assert.equal(launches[0].context.page.url(),'about:blank');assert.equal(launches[0].context.closed,true);assert.equal(core.resources.browser,null);
});

test('lock while resolving a browser control prevents its click',async t=>{
 const {core,worker,launches}=harness(t);await worker.open(base.url,['https://example.com']);
 launches[0].context.page.locator=()=>({count:async()=>{core.lock();return 1;},click:()=>assert.fail('clicked after lock')});
 await assert.rejects(worker.run({...base,steps:[{op:'click',selector:'#open'},...base.steps]}),{code:'LOCKED'});
 assert.equal(launches[0].context.closed,true);assert.equal(core.resources.browser,null);
});

test('browser network guard blocks previously trusted requests after lock',async t=>{
 const {core,worker,launches}=harness(t);await worker.open(base.url,['https://example.com'],true);
 core.lock();let outcome='';await launches[0].context.guard({request:()=>({url:()=>base.url}),continue:()=>{outcome='allowed';},abort:()=>{outcome='blocked';}});
 assert.equal(outcome,'blocked');
});
