"use strict";
const crypto=require('node:crypto');
const {fail,isId,uuid,text,safeError,safePath}=require('./security.cjs');
const schedules=require('./schedules.cjs');
const {validateRecipe}=require('./browser-worker.cjs');
const digest=recipe=>crypto.createHash('sha256').update(JSON.stringify(validateRecipe(recipe))).digest('hex');
class BrowserReports {
 constructor(core,browser){this.core=core;this.browser=browser;this.busy=false;this.leases=new WeakMap();}
 recipe(id){const row=this.core.store.get('browserRecipe',id);if(!row)throw fail('NOT_FOUND');return row;}
 plan(id){
  this.core.assertUnlocked();const recipe=this.recipe(id),hash=digest(recipe);
  if(this.core.store.get('browserVerified',id)?.hash!==hash)throw fail('BROWSER_REVIEW');
  if(recipe.autoLogin){const status=this.core.browserCredentials?.status(recipe),proof=this.core.store.get('browserLoginVerified',id);if(!status?.matching||proof?.hash!==hash||proof.revision!==status.revision)throw fail('BROWSER_CREDENTIAL');}
  return {recipe,hash,credentialRevision:recipe.autoLogin?this.core.browserCredentials.status(recipe).revision:null};
 }
 grant(id,hash,enabled,allowLocked=false){
  this.core.assertUnlocked();if(typeof enabled!=='boolean'||typeof allowLocked!=='boolean')throw fail('INVALID');
  if(enabled&&this.plan(id).hash!==hash)throw fail('REVIEW_CHANGED');
  if(enabled)this.core.store.put('browserGrant',id,{id,hash,allowLocked,revision:uuid(),approved:Date.now()});
  else this.core.store.delete('browserGrant',id);
  return {enabled};
 }
 save(input){
  this.core.assertUnlocked();const recipe=this.recipe(input.browserRecipeId);
  if(this.core.developmentMode)throw fail('POLICY');
  const normalized=schedules.normalize(input);
  if(!['daily','weekdays','weekly','monthly','once'].includes(normalized.frequency))throw fail('INVALID');
  const gap=Number(input.gapMinutes??5);if(!Number.isInteger(gap)||gap<1||gap>1440)throw fail('INVALID');
  const row={id:isId(input.id)?input.id:uuid(),name:text(input.name||recipe.name,100),browserRecipeId:recipe.id,
   ...normalized,gapMinutes:gap,analysisPrompt:text(input.analysisPrompt||'',12000),enabled:input.enabled!==false,hipaa:true};
  row.next=schedules.nextRun(row);if(row.enabled&&row.next===null)throw fail('INVALID');
  this.core.store.put('schedule',row.id,row);return row;
 }
 allowed(recipe){
  const c=this.core;
  if(c.developmentMode||c.settings().workerPaused)throw fail('POLICY');
  if(recipe.sourceProvider==='pcc'&&!c.integrations.status('pcc').enabled)throw fail('INTEGRATION_UNAVAILABLE');
  const saved=this.recipe(recipe.id),grant=c.store.get('browserGrant',recipe.id);
  if(!grant||grant.hash!==digest(recipe)||grant.hash!==digest(saved))throw fail('BROWSER_REVIEW');
  if(c.locked&&!grant.allowLocked)throw fail('LOCKED');
  if(recipe.autoLogin){const status=c.browserCredentials?.status(recipe),proof=c.store.get('browserLoginVerified',recipe.id);if(!status?.matching||proof?.hash!==grant.hash||proof.revision!==status.revision)throw fail('BROWSER_CREDENTIAL');}
  return true;
 }
 issueLease(recipe,schedule,jobId){this.allowed(recipe);const lease={};this.leases.set(lease,{hash:digest(recipe),grant:JSON.stringify(this.core.store.get('browserGrant',recipe.id)),schedule:JSON.stringify(schedule),scheduleId:schedule.id,jobId});return lease;}
 checkLease(lease,recipe){const held=lease&&this.leases.get(lease);if(!held||held.hash!==digest(recipe)||held.grant!==JSON.stringify(this.core.store.get('browserGrant',recipe.id))||held.schedule!==JSON.stringify(this.core.store.get('schedule',held.scheduleId))||!this.core.requests.has(held.jobId))throw fail('BROWSER_REVIEW');if(this.core.requests.get(held.jobId).signal.aborted)throw fail('CANCELLED');return this.allowed(recipe);}
 list(){return this.core.store.list('browserRecipe').map(r=>{const hash=digest(r),grant=this.core.store.get('browserGrant',r.id),credential=this.core.browserCredentials?.status(r);return {...r,tested:this.core.store.get('browserVerified',r.id)?.hash===hash,unattended:grant?.hash===hash,allowLocked:grant?.hash===hash&&grant.allowLocked===true,credential:credential?{available:credential.available,saved:credential.saved,matching:credential.matching,tested:this.core.store.get('browserLoginVerified',r.id)?.revision===credential.revision&&!!credential.revision}:null,issue:this.core.store.get('browserIssue',r.id)||null};});}
 async analyzePending(){
  const c=this.core;if(c.locked)return false;
  const queued=c.store.summaries('job').filter(j=>j.browserAnalysis?.state==='queued');
  if(queued.length){const states=c.store.summaries('report_analysis');for(const summary of queued){
   const related=states.filter(a=>a.reportId===summary.reportId&&(!summary.browserAnalysis.ids||summary.browserAnalysis.ids.includes(a.id)));
   if(!related.length||related.some(a=>['pending','running'].includes(a.state)))continue;
   const row=c.store.get('job',summary.id),failed=related.find(a=>a.state!=='completed');row.browserAnalysis={...row.browserAnalysis,state:failed?'needs_review':'completed',...(failed?{error:failed.error||'OUTPUT_CHECK'}:{})};c.store.put('job',row.id,row);
  }}
  const summary=c.store.summaries('job').find(j=>j.browserAnalysis?.state==='pending'&&(!j.reportId||!c.store.get('report_history',j.reportId)||c.store.get('report_history',j.reportId).workspace===c.settings().workspace));if(!summary)return false;
  const row=c.store.get('job',summary.id);
  if(row.reportId&&c.reportHistory){try{const queued=c.reportHistory.queue({ids:[row.reportId]},row.browserAnalysis.prompt);row.browserAnalysis.state='queued';row.browserAnalysis.ids=queued.ids;}catch(e){row.browserAnalysis.state='needs_review';row.browserAnalysis.error=safeError(e).code;}c.store.put('job',row.id,row);return true;}
  row.browserAnalysis.state='running';c.store.put('job',row.id,row);
  try{const file=await c.importFile(safePath(c.settings().workspace,row.output));c.assertUnlocked();row.analysisJobId=uuid();c.store.put('job',row.id,row);await c.runJob({id:row.analysisJobId,title:'Analyze: '+row.title,prompt:row.browserAnalysis.prompt,format:'md',fileIds:[file.id],hipaa:true},false,true);const result=c.store.get('job',row.analysisJobId);row.browserAnalysis.state=result?.status==='completed'?'completed':'needs_review';if(row.browserAnalysis.state!=='completed')row.browserAnalysis.error=result?.error||'OUTPUT_CHECK';}
  catch(e){row.browserAnalysis.state='needs_review';row.browserAnalysis.error=safeError(e).code;}
  if(c.store.db)c.store.put('job',row.id,row);return true;
 }
 async tick(){
  const c=this.core;
  if(this.busy||c.developmentMode||c.settings().workerPaused||this.browser.context||this.browser.busy)return false;
  this.busy=true;try{if(await this.analyzePending())return true;}finally{this.busy=false;}
  const due=c.store.list('schedule').filter(s=>s.browserRecipeId&&s.enabled&&s.next!==null&&s.next<=Date.now()).sort((a,b)=>a.next-b.next).find(s=>{
   const recipe=c.store.get('browserRecipe',s.browserRecipeId);
   return (!c.locked||c.store.get('browserGrant',s.browserRecipeId)?.allowLocked===true)&&(!recipe||recipe.sourceProvider!=='pcc'||c.integrations.status('pcc').enabled);
  });
  if(!due)return false;
  const previous=c.store.get('browserPull','last');
  if(previous&&Date.now()-previous.finished<Math.max(due.gapMinutes||5,previous.gapMinutes||5)*60000)return false;
  this.busy=true;
  const id=uuid(),controller=new AbortController();c.requests.set(id,controller);
  const row={id,title:due.name,sourceScheduleId:due.id,browserRecipeId:due.browserRecipeId,status:'waiting',started:Date.now(),remote:false};
  c.store.transaction(()=>{
   const next=schedules.nextRun(due);c.store.put('schedule',due.id,{...due,next,enabled:next!==null,lastRun:Date.now()});
   c.store.put('job',id,row);
   // A crash after dispatch must not immediately trigger another website pull.
   c.store.put('browserPull','last',{finished:Date.now(),gapMinutes:due.gapMinutes||5});
  });
  try{
   await c.resources.task('background',async()=>{
    const recipe=this.recipe(due.browserRecipeId);this.allowed(recipe);
    row.status='running';c.store.put('job',id,row);
    const lease=this.issueLease(recipe,c.store.get('schedule',due.id),id);
    const out=await this.browser.run(recipe,{scheduled:true,lease});
    row.status='completed';row.output=out.relative;row.reportId=out.reportId||null;row.completed=Date.now();c.store.put('job',id,row);
    if(due.analysisPrompt){
     row.browserAnalysis={state:'pending',prompt:due.analysisPrompt};c.store.put('job',id,row);
    }
   },{signal:controller.signal});
  }catch(e){
   if(!c.store.db)return false;
   row.status='failed';row.error=safeError(e).code;row.reason=safeError(e).message;row.completed=Date.now();c.store.put('job',id,row);
   // Require an explicit review after any failure; no repeated login attempts.
   const current=c.store.get('schedule',due.id);if(current)c.store.put('schedule',due.id,{...current,enabled:false,error:row.reason});
   // A second schedule must never retry a failing shared credential/workflow.
   c.store.delete('browserGrant',due.browserRecipeId);
   for(const linked of c.store.list('schedule').filter(s=>s.browserRecipeId===due.browserRecipeId&&s.enabled))c.store.put('schedule',linked.id,{...linked,enabled:false,error:row.reason});
  }finally{
   if(c.store.db)c.store.put('browserPull','last',{finished:Date.now(),gapMinutes:due.gapMinutes||5});c.requests.delete(id);this.busy=false;
   c.emit({type:'jobs_changed'});c.emit({type:'job_finished',jobId:id});
  }
  return true;
 }
}
module.exports={BrowserReports,digest};
