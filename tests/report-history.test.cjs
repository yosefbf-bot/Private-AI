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
 const x=setup(t),today=require('../source/report-parameters.cjs').day(new Date()),csv=`date,residentId,unit,staffId,weight\n${today},R-1,North,S-1,70`,a=await add(x,'one.csv',csv);
 await x.history.index(a.id);const b=await add(x,'two.csv',csv);await x.history.index(b.id);
 assert.equal(x.history.list().length,2);assert.equal(x.core.store.get('report_history',b.id).duplicateOf,a.id);
 const trends=x.history.trends({entityType:'resident',entityId:'R-1'});assert.equal(trends.groups[0].observations,1);assert.equal(trends.groups[0].latest.date,today);assert.equal(trends.groups[0].latest.value,70);
 assert.equal(fs.readFileSync(path.join(x.root,'privateai.db')).includes(Buffer.from('Synthetic weights')),false);
});

test('pending analysis stays in its workspace and expired browser analysis cannot block later ticks',async t=>{
 const x=setup(t),a=await add(x,'workspace.csv','date,residentId,unit,staffId,weight\n2026-01-01,R-1,North,S-1,70');await x.history.index(a.id);
 x.history.queue({ids:[a.id]});let calls=0;x.core.runJob=async()=>{calls++;};
 const original=x.core.settings().workspace,other=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'private-ai-history-'));t.after(()=>fs.rmSync(other,{recursive:true,force:true}));x.core.saveSettings({workspace:other});
 assert.equal(await x.history.tick(),false);assert.equal(calls,0);assert.equal(x.core.store.list('report_analysis')[0].state,'pending');
 const {BrowserReports}=require('../source/browser-reports.cjs'),browser=new BrowserReports(x.core,{});
 x.core.store.put('job','browser-test',{id:'browser-test',reportId:a.id,browserAnalysis:{state:'pending',prompt:'Synthetic analysis'}});
 assert.equal(await browser.analyzePending(),false);
 x.core.saveSettings({workspace:original});x.core.store.delete('report_history',a.id);
 assert.equal(await browser.analyzePending(),true);assert.equal(x.core.store.get('job','browser-test').browserAnalysis.state,'needs_review');assert.equal(await browser.analyzePending(),false);
});

test('workflow source revisions isolate identical IDs and identical bytes from another facility',async t=>{
 const x=setup(t),today=require('../source/report-parameters.cjs').day(new Date()),csv=`date,residentId,unit,staffId,weight\n${today},R-1,North,S-1,70`;
 const a=await add(x,'facility-a.csv',csv);await x.history.index(a.id);
 x.recipe=validateRecipe({...x.recipe,url:'https://other.example/report',origins:[],steps:[{op:'click',selector:'#facility-b'},{op:'download',selector:'#download'}]});
 const b=await add(x,'facility-b.csv',csv);await x.history.index(b.id);
 assert.equal(x.core.store.get('report_history',b.id).duplicateOf,undefined);const groups=x.history.trends({entityType:'resident',entityId:'R-1'}).groups;
 assert.equal(groups.length,2);assert.notEqual(groups[0].sourceRevision,groups[1].sourceRevision);
});

test('workspace changes at the resource boundary stop analysis before inference or export',async t=>{
 const x=setup(t),a=await add(x,'queued.csv','date,residentId,unit,staffId,weight\n2026-01-01,R-1,North,S-1,70');await x.history.index(a.id);x.history.queue({ids:[a.id]});
 const other=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'private-ai-boundary-'));t.after(()=>fs.rmSync(other,{recursive:true,force:true}));
 const task=x.core.resources.task.bind(x.core.resources);x.core.resources.task=async(kind,fn,options)=>task(kind,async()=>{x.core.saveSettings({workspace:other});return fn();},options);
 await x.history.tick();const analysis=x.core.store.list('report_analysis')[0];assert.equal(analysis.state,'needs_review');assert.equal(analysis.error,'CHANGED');assert.equal(x.calls.length,0);assert.equal(analysis.output,null);
});

test('CSV and XLSX citations preserve blank rows and failed comparison preserves the imported evidence',async t=>{
 const x=setup(t),today=require('../source/report-parameters.cjs').day(new Date()),csv=`date,residentId,unit,staffId,weight\n\n${today},R-1,North,S-1,70`;
 const a=await add(x,'blank.csv',csv);await x.history.index(a.id);assert.equal(x.core.store.get('report_history_rows',a.id).rows[0].row,3);
 const Excel=require('exceljs'),wb=new Excel.Workbook(),sheet=wb.addWorksheet('Evidence');sheet.addRow(['date','residentId','unit','staffId','weight']);sheet.getRow(4).values=[today,'R-1','North','S-1',71];
 const b=await add(x,'blank.xlsx',Buffer.from(await wb.xlsx.writeBuffer()));x.history.trends=()=>{throw Object.assign(Error('bounded'),{code:'LIMIT'});};
 const indexed=await x.history.index(b.id);assert.equal(indexed.comparisonError,'LIMIT');assert.ok(x.core.store.get('file',indexed.fileId));assert.equal(x.core.store.get('report_history_rows',b.id).rows[0].row,4);
});

test('overlapping events deduplicate, contradictory values remain unknown and aggregate work is bounded',async t=>{
 const x=setup(t),today=require('../source/report-parameters.cjs').day(new Date());
 x.recipe.report.tracking={mode:'events',metric:'Synthetic falls',dateColumn:'date',residentColumn:'residentId',unitColumn:'unit',eventIdColumn:'eventId'};
 for(const [name,id] of [['a','E-1'],['b','E-1'],['c','E-2']]){const r=await add(x,name+'.csv',`date,residentId,unit,eventId\n${today},R-1,North,${id}`);await x.history.index(r.id);}
 assert.equal(x.history.trends({entityType:'unit',entityId:'North'}).groups[0].observations,2);
 const r=x.history.list()[0];x.core.store.put('report_history_rows',r.id,{id:r.id,rows:Array.from({length:50001},(_,n)=>({date:today,entities:{resident:'R-1',unit:'North'},eventId:'unique-'+n,value:null,row:n+2}))});
 assert.throws(()=>x.history.trends(),{code:'LIMIT'});
});

test('daily report-selection schedules re-evaluate dates, claim once and pause for lock/background pause',async t=>{
 const x=setup(t),a=await add(x,'scheduled.csv','date,residentId,unit,staffId,weight\n2026-01-01,R-1,North,S-1,70');await x.history.index(a.id);
 const saved=x.core.saveSchedule({name:'Daily report analysis',reportQuery:{date:'today'},prompt:'Summarize synthetic evidence',frequency:'daily',time:'23:59'});
 x.core.store.put('schedule',saved.id,{...saved,next:Date.now()-1});x.core.locked=true;assert.equal(await x.history.tick(),false);x.core.locked=false;
 x.core.saveSettings({workerPaused:true});assert.equal(await x.history.tick(),false);x.core.saveSettings({workerPaused:false});
 assert.equal(await x.history.tick(),true);assert.equal(x.core.store.list('report_analysis').length,1);assert.ok(x.core.store.get('schedule',saved.id).next>Date.now());
 assert.equal(x.core.store.list('report_analysis')[0].reportId,a.id);assert.equal(x.core.store.list('report_analysis')[0].prompt,'Summarize synthetic evidence');
 const duplicate=x.core.duplicateSchedule(saved.id);assert.deepEqual(duplicate.reportQuery,{date:'today'});assert.equal(duplicate.enabled,false);
});

test('schedule pause/copy/run preserve workspace scope and intake cannot resurrect edited or deleted schedules',async t=>{
 const x=setup(t),saved=x.core.saveSchedule({name:'Bound folder',reportQuery:{folder:'Reports'},frequency:'daily'}),original=x.core.settings().workspace;
 const other=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'private-ai-schedule-'));t.after(()=>fs.rmSync(other,{recursive:true,force:true}));x.core.saveSettings({workspace:other});
 const paused=x.core.saveSchedule({...saved,enabled:false});assert.equal(paused.workspace,original);await assert.rejects(x.history.runSchedule(saved.id),{code:'WORKSPACE'});assert.throws(()=>x.core.duplicateSchedule(saved.id),{code:'WORKSPACE'});
 x.core.saveSettings({workspace:original});
 for(const action of ['delete','pause','edit']){
  const schedule=x.core.saveSchedule({...saved,enabled:true});x.core.store.put('schedule',schedule.id,{...schedule,next:Date.now()-1});
  x.history.catalogFolder=async()=>{if(action==='delete')x.core.store.delete('schedule',schedule.id);else x.core.saveSchedule({...schedule,enabled:action!=='pause',name:action==='edit'?'Edited':schedule.name});return {};};
  assert.equal(await x.history.tick(),true);const current=x.core.store.get('schedule',schedule.id);
  if(action==='delete')assert.equal(current,null);else if(action==='pause')assert.equal(current.enabled,false);else assert.equal(current.name,'Edited');
  assert.equal(x.core.store.list('report_analysis').length,0);
 }
});

test('sectioned report analyses retain the read-only tool boundary for every section',async t=>{
 const x=setup(t);x.core.saveSettings({localContext:2048,localMaxOutput:256});let calls=0;
 x.core.router.generate=async(_key,_settings,_messages,options)=>{assert.equal(options.allowTools,false);calls++;return {text:'Synthetic section',provider:'local',usage:{inputTokens:0,outputTokens:0}};};
 const {sectionedReport}=require('../source/sectioned-report.cjs');
 await sectionedReport(x.core,{prompt:'Analyze supplied evidence',analysisOnly:true,hipaa:true},[{type:'input_text',text:'Analyze supplied evidence'},{type:'input_text',text:'Synthetic source evidence. '.repeat(250)}],{},()=>{},new AbortController().signal);
 assert.ok(calls>1);
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
