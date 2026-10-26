'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fail,safePath,safeError,text,uuid,isId}=require('./security.cjs');
const {day,date,folder,period}=require('./report-parameters.cjs');
const DAY=86400000;
const NOTICE='Review required. These are source-record comparisons, not diagnoses, proof of causation, staff performance scores or complete surveillance. Missing reports/fields remain unknown; requested report dates are not verified source coverage. Counts describe supplied evidence only.';
const fingerprint=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function normalizeTracking(input){
 const allowed=['mode','metric','dateColumn','residentColumn','staffColumn','unitColumn','valueColumn','eventIdColumn','sheet'];
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k)))throw fail('INVALID');
 const out={mode:input.mode||'snapshot',metric:text(input.metric,100).trim(),dateColumn:text(input.dateColumn,100).trim()};
 if(!['snapshot','events'].includes(out.mode)||!out.metric||!out.dateColumn)throw fail('INVALID');
 for(const k of allowed.filter(k=>!['mode','metric','dateColumn'].includes(k)))if(input[k]!==undefined){out[k]=text(input[k],100).trim();if(!out[k])throw fail('INVALID');}
 if(!out.residentColumn&&!out.staffColumn&&!out.unitColumn||out.mode==='snapshot'&&!out.valueColumn||out.mode==='events'&&!out.eventIdColumn)throw fail('INVALID');
 return out;
}
async function fileHash(file){
 const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');
}
function observations(table,spec){
 const fields=['dateColumn','residentColumn','staffColumn','unitColumn','valueColumn','eventIdColumn'].map(k=>spec[k]).filter(Boolean);
 if(fields.some(k=>!table.headers.includes(k)))throw fail('REVIEW_CHANGED');
 const result=[];let unknownRows=0;
 for(const [index,row] of table.rows.entries()){
  let when;try{when=day(date(String(row[spec.dateColumn]||'').trim()));}catch{unknownRows++;continue;}
  const entities=Object.fromEntries(['resident','staff','unit'].map(k=>[k,String(row[spec[k+'Column']]??'').trim()]).filter(([,v])=>v));
  let value=null,eventId=null;
  if(spec.mode==='snapshot'){const raw=String(row[spec.valueColumn]??'').trim();if(!/^-?\d+(?:\.\d+)?$/.test(raw)||!Number.isFinite(Number(raw))){unknownRows++;continue;}value=Number(raw);}
  else {eventId=String(row[spec.eventIdColumn]??'').trim();if(!eventId){unknownRows++;continue;}}
  if(!Object.keys(entities).length||Object.values(entities).some(v=>v.length>200)||eventId?.length>200){unknownRows++;continue;}
  result.push({date:when,entities,value,eventId,row:table.rowNumbers?.[index]??index+2});
 }
 return {rows:result,unknownRows};
}
class ReportHistory{
 constructor(core){this.core=core;this.busy=false;
  // A stopped process must not silently replay an uncertain model request.
  for(const r of core.store.list('report_analysis'))if(r.state==='running')core.store.put('report_analysis',r.id,{...r,state:'needs_review',error:'INTERRUPTED'});
  for(const s of core.store.list('schedule'))if(s.reportQuery&&s.analysisState==='running')core.store.put('schedule',s.id,{...s,enabled:false,analysisState:'needs_review',error:'INTERRUPTED'});
 }
 days(){const n=this.core.settings().retentionDays;return n>0?Math.min(n,100):100;}
 available(){this.core.assertUnlocked();if(this.core.developmentMode||require('./snf/demo.cjs').forCore(this.core).current().demoMode)throw fail('POLICY');}
 production(){if(this.core.developmentMode||require('./snf/demo.cjs').forCore(this.core).current().demoMode)throw fail('POLICY');}
 async record(recipe,out,{now=Date.now(),guard=()=>{}}={}){
  guard();
  this.production();
  const c=this.core,root=c.settings().workspace,file=safePath(root,out.relative),size=fs.statSync(file).size;
  const sourceRevision=fingerprint({sourceProvider:recipe.sourceProvider||'generic',url:recipe.url||null,origins:recipe.origins||[],steps:recipe.steps||[],autoLogin:recipe.autoLogin||null});
  const id=uuid(),hash=await fileHash(file),row={id,recipeId:recipe.id,sourceRevision,name:recipe.name,sourceProvider:recipe.sourceProvider||'generic',relative:out.relative,workspace:root,size,hash,created:now,downloadDate:out.downloadDate,requestedPeriod:out.requestedPeriod,choices:out.choices||{},tracking:recipe.report?.tracking||null,state:'pending',hipaa:true};
  guard();if(root!==c.settings().workspace)throw fail('CHANGED');
  c.store.transaction(()=>{c.store.put('report_history',id,row,{updated:now});
   if(recipe.report?.analysisPrompt){const analysisId=uuid();c.store.put('report_analysis',analysisId,{id:analysisId,reportId:id,state:'pending',prompt:recipe.report.analysisPrompt,created:now});}
  });return id;
 }
 async catalogFolder(relative,guard=()=>{}){
  this.available();const name=folder(relative),root=this.core.settings().workspace,dir=safePath(root,name);
  const entries=fs.readdirSync(dir,{withFileTypes:true});if(entries.length>1000)throw fail('LIMIT');
  const files=entries.filter(e=>e.isFile()&&/\.(pdf|csv|xlsx|docx|txt|md)$/i.test(e.name));
  if(!files.length)throw fail('FILE');const known=this.list({folder:name}),recipe={id:'folder-'+fingerprint(name),name:'Folder: '+name,sourceProvider:'generic'};
  let added=0;
  const check=()=>{this.available();guard();if(root!==this.core.settings().workspace)throw fail('CHANGED');};
  for(const entry of files){await this.core.resources.checkpoint();check();const relative=name+'/'+entry.name,file=safePath(root,relative);if(fs.statSync(file).size>20000000)throw fail('LIMIT');const hash=await fileHash(file);check();
   if(known.some(r=>r.relative===relative&&r.hash===hash))continue;
   await this.record(recipe,{relative,downloadDate:day(new Date()),requestedPeriod:null,choices:{}},{guard:check});added++;
  }
  return {catalogued:files.length,added,excluded:entries.length-files.length,recursive:false};
 }
 list(query={}){
  this.available();const now=Date.now(),cutoff=now-this.days()*DAY;
  let range;if(query.date)range=period(query.date,new Date(now));
  const selectedFolder=query.folder?folder(query.folder):null;
  const rows=this.core.store.summaries('report_history').filter(r=>r.created>=cutoff&&r.created<=now&&r.workspace===this.core.settings().workspace&&(!range||r.downloadDate>=range.start&&r.downloadDate<=range.end)&&(!selectedFolder||r.relative.startsWith(selectedFolder+'/'))&&(!query.recipeId||r.recipeId===query.recipeId));
  if(rows.length>1000)throw fail('LIMIT');return rows.sort((a,b)=>b.created-a.created);
 }
 async index(id){
  this.available();const c=this.core,r=c.store.get('report_history',id);if(!r)throw fail('NOT_FOUND');
  if(r.state==='indexed')return r;
  if(r.workspace!==c.settings().workspace)throw fail('CHANGED');
  if(r.created<Date.now()-this.days()*DAY)throw fail('EXPIRED');
  const file=safePath(r.workspace,r.relative);if(r.size>20000000||fs.statSync(file).size>20000000)throw fail('LIMIT');if(await fileHash(file)!==r.hash)throw fail('CHANGED');this.available();
  const duplicate=this.list().find(x=>x.id!==id&&x.state==='indexed'&&x.hash===r.hash&&x.recipeId===r.recipeId&&x.sourceRevision&&x.sourceRevision===r.sourceRevision&&fingerprint(x.tracking)===fingerprint(r.tracking)&&fingerprint(x.choices)===fingerprint(r.choices)&&c.store.get('report_history_rows',x.id)&&c.store.summaries('file').some(f=>f.id===x.fileId));
  if(duplicate){Object.assign(r,{state:'indexed',duplicateOf:duplicate.id,fileId:duplicate.fileId,unknownRows:duplicate.unknownRows,incomplete:duplicate.incomplete,sourceRows:duplicate.sourceRows});c.store.transaction(()=>{c.store.put('report_history_rows',id,{id,rows:c.store.get('report_history_rows',duplicate.id).rows});c.store.put('report_history',id,r);});return r;}
  if(r.size>20000000)throw fail('LIMIT');
  await c.resources.checkpoint();
  const imported=await c.importFile(file);let committed=false;
  try{
   this.available();if(await fileHash(file)!==r.hash)throw fail('CHANGED');
   const f=c.store.get('file',imported.id);let parsed={rows:[],unknownRows:0};
   if(r.tracking){const table=await require('./files.cjs').processFile({op:'reportTable',ext:f.ext,bytes:Buffer.from(f.bytes,'base64'),sheet:r.tracking.sheet},{signal:c.resources.current()?.signal});parsed=observations(table,r.tracking);}
   this.available();Object.assign(r,{state:'indexed',fileId:f.id,indexed:Date.now(),unknownRows:parsed.unknownRows,sourceRows:parsed.rows.length,incomplete:!!f.incomplete});
   c.store.transaction(()=>{c.store.put('report_history_rows',id,{id,rows:parsed.rows});c.store.put('report_history',id,r);});committed=true;
   // Retain a small reviewable result, not every decrypted report in RAM.
   try{const comparison=this.trends({recipeId:r.recipeId});
    c.store.put('report_comparison',id,{id,created:Date.now(),notice:NOTICE,groups:comparison.groups.filter(g=>g.sources.some(s=>s.reportId===id)),unknownRows:comparison.unknownRows});
   }catch(e){r.comparisonError=safeError(e).code;c.store.put('report_history',id,r);}
   return r;
  }catch(e){if(!committed&&c.store.db)c.store.delete('file',imported.id);throw e;}
 }
 trends(query={}){
  this.available();const days=query.days===undefined?this.days():Number(query.days);if(!Number.isInteger(days)||days<1||days>this.days())throw fail('INVALID');
  if(query.entityType&&!['resident','staff','unit'].includes(query.entityType)||query.entityId!==undefined&&(!query.entityType||!text(query.entityId,200).trim()))throw fail('INVALID');
  const now=new Date(),cutoff=new Date(now);cutoff.setDate(cutoff.getDate()-days+1);const start=day(cutoff),end=day(now),groups=new Map();let unknownRows=0,pending=0,incomplete=0,pointsCount=0;
  const seen=new Set();let observed=0;
  for(const report of this.list({recipeId:query.recipeId})){
    if(report.state!=='indexed'){pending++;continue;}
    const evidence=fingerprint([report.recipeId,report.sourceRevision||report.id,report.hash,report.tracking,report.choices]);if(seen.has(evidence))continue;seen.add(evidence);
    if(report.incomplete)incomplete++;
   unknownRows+=report.unknownRows||0;if(!report.tracking)continue;
   const spec=report.tracking,rows=this.core.store.get('report_history_rows',report.id)?.rows||[];
   for(const row of rows){
    if(++observed>100000)throw fail('LIMIT');
    if(row.date<start||row.date>end)continue;
    for(const [type,identity] of Object.entries(row.entities)){
     if(query.entityType&&query.entityType!==type||query.entityId&&query.entityId!==identity)continue;
     const key=fingerprint([report.recipeId,report.sourceRevision||report.id,spec,report.choices,type,identity]);let group=groups.get(key);
     if(!group){if(groups.size>=20000)throw fail('LIMIT');group={recipeId:report.recipeId,sourceRevision:report.sourceRevision||null,report:report.name,entityType:type,entityId:identity,metric:spec.metric,mode:spec.mode,points:new Map(),conflicts:0};groups.set(key,group);}
     // Snapshot: one entity/date. Event: stable source event ID across overlapping
     // exports. Contradictory duplicate evidence is excluded, never counted twice.
     const pk=spec.mode==='events'?row.eventId:row.date,previous=group.points.get(pk),value={date:row.date,value:row.value,eventId:row.eventId,reportId:report.id,row:row.row};
     if(previous&&(previous.date!==value.date||previous.value!==value.value)){if(!previous.conflict)group.conflicts++;previous.conflict=true;}
     else if(!previous){if(++pointsCount>100000)throw fail('LIMIT');group.points.set(pk,value);}
    }
   }
  }
  const result=[];
  for(const group of groups.values()){
   const points=[...group.points.values()].filter(p=>!p.conflict).sort((a,b)=>a.date.localeCompare(b.date));if(!points.length&& !group.conflicts)continue;
   const latest=points.at(-1)||null,previous=points.at(-2)||null,baseline=points.slice(0,-1).map(p=>p.value).filter(v=>v!==null);let anomaly=false;
   if(baseline.length>=5&&group.mode==='snapshot'&&latest){const mean=baseline.reduce((a,b)=>a+b,0)/baseline.length,variance=baseline.reduce((n,v)=>n+(v-mean)**2,0)/baseline.length;anomaly=variance>0&&Math.abs(latest.value-mean)>3*Math.sqrt(variance);}
   const {points:_,...details}=group;
   result.push({...details,observations:points.length,latest,change:group.mode==='snapshot'&&latest&&previous?latest.value-previous.value:null,repeated:group.mode==='events'&&points.length>1,anomaly,reviewRequired:true,sources:points.slice(-20).map(p=>({reportId:p.reportId,row:p.row,date:p.date})),sourceListLimited:points.length>20});
  }
  return {days,start,end,groups:result,unknownRows,pending,incomplete,notice:NOTICE};
 }
 queue(query={},prompt='Summarize the supplied report. Identify changes, missing information and follow-ups; cite source rows/pages. Do not infer clinical absence from missing data.'){
  this.available();text(prompt,12000);if(!prompt.trim())throw fail('INVALID');
  if(query.ids!==undefined&&(!Array.isArray(query.ids)||!query.ids.length||query.ids.length>1000||query.ids.some(id=>!isId(id))))throw fail('INVALID');
  const reports=query.ids?this.list().filter(r=>query.ids.includes(r.id)):this.list(query);
  if(!reports.length)throw fail('NOT_FOUND');
  const active=new Map(this.core.store.summaries('report_analysis').filter(j=>['pending','running'].includes(j.state)).map(j=>[j.reportId,j]));
  const jobs=[];for(const report of reports){
   const existing=active.get(report.id);
   if(existing){jobs.push(existing.id);continue;}
   const row={id:uuid(),reportId:report.id,state:'pending',prompt,created:Date.now()};this.core.store.put('report_analysis',row.id,row);active.set(report.id,row);jobs.push(row.id);
  }
  this.core.emit({type:'jobs_changed'});return {queued:jobs.length,ids:jobs,notice:'Each selected report is queued once, processed sequentially and linked to its source. This is not a completed analysis.'};
 }
 saveSchedule(input){
  this.available();const query=input.reportQuery;
  if(!query||typeof query!=='object'||Array.isArray(query)||Object.keys(query).some(k=>!['date','folder'].includes(k))||!!query.date===!!query.folder)throw fail('INVALID');
  const reportQuery=query.folder?{folder:folder(query.folder)}:{date:text(query.date,50)};if(reportQuery.date)period(reportQuery.date);
  const spec=require('./schedules.cjs').normalize(input);if(!['once','daily','weekdays','weekly','monthly'].includes(spec.frequency))throw fail('INVALID');
  const prompt=text(input.prompt||'Summarize changes, missing information and follow-ups in the supplied report. Cite sources.',12000);if(!prompt.trim())throw fail('INVALID');
  const old=isId(input.id)?this.core.store.get('schedule',input.id):null;
  const row={id:isId(input.id)?input.id:uuid(),name:text(input.name||'Analyze selected reports',100),reportQuery,workspace:old?.reportQuery?old.workspace:this.core.settings().workspace,prompt,format:'md',hipaa:true,...spec,enabled:input.enabled!==false};
  row.next=require('./schedules.cjs').nextRun(row);if(row.enabled&&row.next===null)throw fail('INVALID');this.core.store.put('schedule',row.id,row);return row;
 }
 async runSchedule(id){
  this.available();const c=this.core,s=c.store.get('schedule',id);if(!s?.reportQuery)throw fail('NOT_FOUND');if(s.workspace!==c.settings().workspace)throw fail('WORKSPACE');
  const snapshot=JSON.stringify(s),check=()=>{this.available();if(s.workspace!==c.settings().workspace||JSON.stringify(c.store.get('schedule',id))!==snapshot)throw fail('CHANGED');};
  const intake=s.reportQuery.folder?await this.catalogFolder(s.reportQuery.folder,check):null;check();return {...this.queue(s.reportQuery,s.prompt),intake};
 }
 async scheduleDue(){
  const c=this.core,s=c.store.list('schedule').filter(s=>s.reportQuery&&s.enabled&&s.workspace===c.settings().workspace&&s.next!==null&&s.next<=Date.now()).sort((a,b)=>a.next-b.next)[0];if(!s)return false;
  const next=require('./schedules.cjs').nextRun(s),claimed={...s,next,enabled:next!==null,lastRun:Date.now(),analysisState:'running',runToken:uuid()};c.store.put('schedule',s.id,claimed);
  const unchanged=()=>JSON.stringify(c.store.get('schedule',s.id))===JSON.stringify(claimed);
  const check=()=>{this.available();if(!unchanged()||c.settings().workspace!==s.workspace||c.settings().workerPaused)throw fail('CHANGED');};
  try{
   const intake=s.reportQuery.folder?await c.resources.task('background',()=>this.catalogFolder(s.reportQuery.folder,check)):null;check();
   const selected=this.list(s.reportQuery),result=selected.length?this.queue({ids:selected.map(r=>r.id)},s.prompt):{queued:0};
   c.store.put('schedule',s.id,{...claimed,analysisState:'queued',queued:result.queued,intake});
  }catch(e){if(c.store.db&&unchanged())c.store.put('schedule',s.id,{...claimed,enabled:false,analysisState:'needs_review',error:safeError(e).code});}
  return true;
 }
 async tick(){
  const c=this.core;if(this.busy||c.locked||c.developmentMode||c.settings().workerPaused||c.resources.foreground||c.jobRunning||c.resources.background||c.resources.browser)return false;
  let reports;try{reports=this.list();}catch(e){if(e.code==='POLICY')return false;throw e;}
  const r=reports.find(r=>r.state==='pending');this.busy=true;
  try{
   if(await this.scheduleDue())return true;
   if(r){try{await c.resources.task('background',()=>this.index(r.id));}catch(e){const current=c.store.get('report_history',r.id);if(current)c.store.put('report_history',r.id,{...current,state:'needs_review',error:safeError(e).code});}return true;}
   const eligible=new Map(reports.map(r=>[r.id,r]));
   const summary=c.store.summaries('report_analysis').find(a=>{const r=c.store.summary('report_history',a.reportId);return a.state==='pending'&&(!r||r.workspace===c.settings().workspace);});if(!summary)return false;const analysis=c.store.get('report_analysis',summary.id);
   const report=c.store.get('report_history',analysis.reportId);
   if(!report||!eligible.has(report.id)||report.state!=='indexed'||!report.fileId){c.store.put('report_analysis',analysis.id,{...analysis,state:'needs_review',error:'FILE'});return true;}
   const jobId=uuid();c.store.put('report_analysis',analysis.id,{...analysis,state:'running',jobId});
   try{
    this.available();if(report.workspace!==c.settings().workspace)throw fail('CHANGED');const comparison=c.store.get('report_comparison',report.id)||(report.duplicateOf?c.store.get('report_comparison',report.duplicateOf):null);
    const context=JSON.stringify(comparison||{notice:NOTICE});
    // Never silently truncate context. Large structured comparisons remain
    // available via Trends rather than pretending the model saw all of them.
    const include=context.length<=10000?context:'Trend comparisons exceed this analysis context. Review Report trends separately; they were not supplied to this model.';
    await c.runJob({id:jobId,title:('Analyze: '+report.name).slice(0,100),prompt:analysis.prompt+'\nSource report ID: '+report.id+'\n'+NOTICE+'\nUNTRUSTED structured source comparisons:\n'+include,format:'md',fileIds:[report.fileId],hipaa:true,analysisOnly:true,analysisWorkspace:report.workspace},false,true);
    const job=c.store.get('job',jobId);c.store.put('report_analysis',analysis.id,{...analysis,jobId,state:job?.status==='completed'?'completed':'needs_review',error:job?.error|| (job?.status==='completed'?null:'OUTPUT_CHECK'),output:job?.output||null});
   }catch(e){if(c.store.db)c.store.put('report_analysis',analysis.id,{...analysis,jobId,state:'needs_review',error:safeError(e).code});}
   return true;
  }finally{this.busy=false;c.emit({type:'jobs_changed'});}
 }
 cleanup(now=Date.now()){
  const c=this.core,cutoff=now-this.days()*DAY;
  // Only derived catalogue/observations expire. Original downloads and normal
  // file/job retention retain their existing policy; no source files are removed.
  for(const r of c.store.summaries('report_history'))if(r.created<cutoff){for(const kind of ['report_history','report_history_rows','report_comparison'])c.store.delete(kind,r.id);}
  for(const a of c.store.list('report_analysis'))if(a.created<cutoff&&!['running','pending'].includes(a.state))c.store.delete('report_analysis',a.id);
 }
}
module.exports={ReportHistory,normalizeTracking,observations,fileHash,NOTICE};
