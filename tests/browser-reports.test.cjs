"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture}=require('./helpers.cjs');
const {BrowserWorker,validateRecipe}=require('../source/browser-worker.cjs');
const {BrowserReports,digest}=require('../source/browser-reports.cjs');
function setup(t){
 const f=fixture(t),{core}=f;core.resources.approve=async()=>true;core.resources.memory=()=>8*1024**3;
 let launches=[],clicks=0,saveHook=()=>{};
 const engine={launchPersistentContext:async(_profile,options)=>{
  launches.push(options);let url='about:blank';
  const page={url:()=>url,goto:async value=>url=value,on:()=>{},locator:()=>({count:async()=>1,click:async()=>{clicks++;},waitFor:async()=>{}}),
   waitForEvent:async()=>({suggestedFilename:()=> 'synthetic.csv',saveAs:async path=>{saveHook();fs.writeFileSync(path,'item,count\nsynthetic,1');},failure:async()=>null})};
  return {browser:()=>({version:()=> '155.0.4283.62'}),pages:()=>[page],newPage:async()=>page,on:()=>{},route:async()=>{},unroute:async()=>{},close:async()=>{}};
 }};
 const browser=new BrowserWorker(core,{chromium:engine});t.after(()=>browser.close());core.browserReports=new BrowserReports(core,browser);
 const recipe=validateRecipe({name:'Synthetic report',url:'https://example.com/report',steps:[{op:'download',selector:'#download'}]});core.store.put('browserRecipe',recipe.id,recipe);
 const due=(overrides={})=>{const s=core.browserReports.save({browserRecipeId:recipe.id,frequency:'daily',...overrides});core.store.put('schedule',s.id,{...s,next:Date.now()-10000});return s;};
 const approve=async()=>{await browser.run(recipe);const plan=core.browserReports.plan(recipe.id);core.browserReports.grant(recipe.id,plan.hash,true);};
 return {...f,browser,recipe,due,approve,launches,get clicks(){return clicks;},setHook:fn=>saveHook=fn};
}
test('unattended permission requires a successful unchanged manual recipe and stays separate from browser interference permission',async t=>{
 const x=setup(t);assert.throws(()=>x.core.browserReports.plan(x.recipe.id),{code:'BROWSER_REVIEW'});
 await x.approve();assert.equal(x.launches[0].headless,false);assert.equal(x.core.browserReports.list()[0].unattended,true);
 x.core.resources.approve=()=>assert.fail('Scheduled pull must not open a prompt');x.due();await x.core.worker.tick();
 assert.equal(x.launches[1].headless,true);assert.equal(x.core.store.list('job')[0].status,'completed');
 await assert.rejects(x.core.resources.task('background',()=>x.core.resources.preflight('browser')),{code:'INTERFERENCE'});
 for(const op of ['browserGrant','browserSchedule'])assert.throws(()=>require('../server/development-policy.cjs').assertOperation(op,{}),{code:'POLICY'});
});
test('scheduled pulls serialize with a persisted five-minute gap and survive service restart',async t=>{
 const x=setup(t);await x.approve();x.due();x.due({frequency:'weekly',weekdays:[1]});
 await Promise.all([x.core.browserReports.tick(),x.core.browserReports.tick()]);assert.equal(x.clicks,2);
 x.core.browserReports=new BrowserReports(x.core,x.browser);await x.core.browserReports.tick();assert.equal(x.clicks,2);
 const previous=x.core.store.get('browserPull','last');assert.equal(previous.gapMinutes,5);
 x.core.store.put('browserPull','last',{...previous,finished:Date.now()-301000});await x.core.browserReports.tick();assert.equal(x.clicks,3);
 assert.equal(x.core.store.list('job').filter(j=>j.status==='completed').length,2);
});
test('PCC off, app lock and pause preserve pending schedules without pulling reports',async t=>{
 const x=setup(t);x.recipe.sourceProvider='pcc';x.core.store.put('browserRecipe',x.recipe.id,x.recipe);
 await assert.rejects(x.browser.run(x.recipe),{code:'INTEGRATION_UNAVAILABLE'});
 x.core.integrations.configure('pcc',{enabled:true,mode:'manual'});await x.approve();x.core.integrations.configure('pcc',{enabled:false});const s=x.due();
 await x.core.browserReports.tick();assert.equal(x.clicks,1);assert.equal(x.core.store.get('schedule',s.id).enabled,true);
 x.core.integrations.configure('pcc',{enabled:true,mode:'manual'});x.core.locked=true;await x.core.browserReports.tick();assert.equal(x.clicks,1);
 x.core.locked=false;x.core.saveSettings({workerPaused:true});await x.core.browserReports.tick();assert.equal(x.clicks,1);
 x.core.saveSettings({workerPaused:false});await x.core.browserReports.tick();assert.equal(x.clicks,2);
});
test('editing or revoking approval pauses a due workflow without a browser action',async t=>{
 const x=setup(t);await x.approve();const s=x.due();x.core.store.put('browserRecipe',x.recipe.id,{...x.recipe,url:'https://example.com/changed'});
 await x.core.browserReports.tick();assert.equal(x.clicks,1);assert.equal(x.core.store.get('schedule',s.id).enabled,false);assert.equal(x.core.store.list('job')[0].error,'BROWSER_REVIEW');
 assert.equal(x.core.browserReports.list()[0].unattended,false);
});
test('revocation while download is saving prevents publication and closes its browser',async t=>{
 const x=setup(t);await x.approve();x.due();x.setHook(()=>x.core.browserReports.grant(x.recipe.id,null,false));
 await x.core.browserReports.tick();assert.equal(x.core.store.list('job')[0].status,'failed');assert.equal(x.browser.context,null);
 assert.equal(fs.readdirSync(x.core.settings().workspace+'/Reports').filter(n=>n.endsWith('.partial')).length,0);
});
test('daily weekly and monthly browser schedules preserve spacing on edit/duplicate',async t=>{
 const x=setup(t);for(const frequency of ['daily','weekly','monthly']){
  const s=x.core.saveSchedule({browserRecipeId:x.recipe.id,frequency,gapMinutes:5});
  const edit=x.core.saveSchedule({...s,gapMinutes:10});assert.equal(edit.gapMinutes,10);
  const duplicate=x.core.duplicateSchedule(s.id);assert.equal(duplicate.enabled,false);assert.equal(duplicate.browserRecipeId,x.recipe.id);assert.equal(duplicate.frequency,frequency);
 }
 assert.throws(()=>x.due({gapMinutes:0}),{code:'INVALID'});
});
