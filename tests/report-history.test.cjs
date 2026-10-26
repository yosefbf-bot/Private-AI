'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
const {ReportHistory}=require('../source/report-history.cjs');
const {validateRecipe}=require('../source/browser-worker.cjs');
function setup(t){const f=fixture(t),history=new ReportHistory(f.core);f.core.resources.memory=()=>8*1024**3;const recipe=validateRecipe({name:'Synthetic weights',url:'https://example.com/report',steps:[{op:'download',selector:'#download'}],report:{tracking:{mode:'snapshot',metric:'Weight kg',dateColumn:'date',residentColumn:'residentId',unitColumn:'unit',staffColumn:'staffId',valueColumn:'weight'}}});return {...f,history,recipe};}
async function add(x,name,content,now=Date.now()){
 const relative='Reports/'+name;fs.writeFileSync(path.join(x.core.settings().workspace,relative),content);
 const out={relative,downloadDate:require('../source/report-parameters.cjs').day(new Date(now)),requestedPeriod:{start:'2026-01-01',end:'2026-01-01'},choices:{}};
 const id=await x.history.record(x.recipe,out,{now});return {id,out};
}
test('encrypted history deduplicates identical source content without using requested dates as clinical facts',async t=>{
 const x=setup(t),a=await add(x,'one.csv','date,residentId,unit,staffId,weight\n2026-10-25,R-1,North,S-1,70');
 await x.history.index(a.id);const b=await add(x,'two.csv','date,residentId,unit,staffId,weight\n2026-10-25,R-1,North,S-1,70');await x.history.index(b.id);
 assert.equal(x.history.list().length,2);assert.equal(x.core.store.get('report_history',b.id).duplicateOf,a.id);
 const trends=x.history.trends({entityType:'resident',entityId:'R-1'});assert.equal(trends.groups[0].observations,1);assert.equal(trends.groups[0].latest.date,'2026-10-25');assert.equal(trends.groups[0].latest.value,70);
 assert.equal(fs.readFileSync(path.join(x.root,'privateai.db')).includes(Buffer.from('Synthetic weights')),false);
});
test('new reports compare explicit source values by resident staff and unit; absent fields remain unknown',async t=>{
 const x=setup(t),today=require('../source/report-parameters.cjs').day(new Date());
 for(let i=0;i<6;i++){const d=new Date();d.setDate(d.getDate()-6+i);const a=await add(x,'old'+i+'.csv',`date,residentId,unit,staffId,weight\n${require('../source/report-parameters.cjs').day(d)},R-1,North,S-1,${70+i%2}`);await x.history.index(a.id);}
 const a=await add(x,'new.csv',`date,residentId,unit,staffId,weight\n${today},R-1,North,S-1,90\n${today},R-2,North,,`);await x.history.index(a.id);
 const trends=x.history.trends({entityType:'resident',entityId:'R-1'});assert.equal(trends.groups.length,1);assert.equal(trends.groups[0].latest.value,90);assert.equal(trends.groups[0].anomaly,true);assert.equal(trends.groups[0].reviewRequired,true);
 assert.equal(x.history.trends({entityType:'staff',entityId:'S-1'}).groups.length,1);
 const unknown=x.history.trends({entityType:'resident',entityId:'R-2'});assert.equal(unknown.groups.length,0);assert.ok(unknown.unknownRows>0);
 assert.match(trends.notice,/not.*caus|not.*performance/i);
});
test('changed downloads fail before indexing; history obeys100-day window and never deletes source files',async t=>{
 const x=setup(t),a=await add(x,'changed.csv','date,residentId,weight\n2026-10-25,R-1,70');fs.appendFileSync(path.join(x.core.settings().workspace,a.out.relative),'\n2026-10-26,R-1,71');
 await assert.rejects(x.history.index(a.id),{code:'CHANGED'});
 const old=await add(x,'old.csv','date,residentId,unit,staffId,weight\n2026-01-01,R-1,North,S-1,70',Date.now()-101*86400000);
 assert.equal(x.history.list().some(r=>r.id===old.id),false);x.history.cleanup();assert.equal(x.core.store.get('report_history',old.id),null);assert.ok(fs.existsSync(path.join(x.core.settings().workspace,old.out.relative)));
});
test('locking or pausing leaves pending history work untouched; restart marks uncertain analysis for review',async t=>{
 const x=setup(t),a=await add(x,'one.csv','date,residentId,unit,staffId,weight\n2026-10-25,R-1,North,S-1,70');
 x.core.locked=true;assert.equal(await x.history.tick(),false);x.core.locked=false;x.core.saveSettings({workerPaused:true});assert.equal(await x.history.tick(),false);
 assert.equal(x.core.store.get('report_history',a.id).state,'pending');
 x.core.store.put('report_analysis','synthetic',{id:'synthetic',state:'running',created:Date.now()});new ReportHistory(x.core);assert.equal(x.core.store.get('report_analysis','synthetic').state,'needs_review');
});
