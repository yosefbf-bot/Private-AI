"use strict";
const crypto=require('node:crypto');
const {fail,isId,uuid,text,safeError,safePath}=require('./security.cjs');
const schedules=require('./schedules.cjs');
const {validateRecipe}=require('./browser-worker.cjs');
const digest=recipe=>crypto.createHash('sha256').update(JSON.stringify(validateRecipe(recipe))).digest('hex');
class BrowserReports {
 constructor(core,browser){this.core=core;this.browser=browser;this.busy=false;}
 recipe(id){const row=this.core.store.get('browserRecipe',id);if(!row)throw fail('NOT_FOUND');return row;}
 plan(id){
  this.core.assertUnlocked();const recipe=this.recipe(id),hash=digest(recipe);
  if(this.core.store.get('browserVerified',id)?.hash!==hash)throw fail('BROWSER_REVIEW');
  return {recipe,hash};
 }
 grant(id,hash,enabled){
  this.core.assertUnlocked();if(typeof enabled!=='boolean')throw fail('INVALID');
  if(enabled&&this.plan(id).hash!==hash)throw fail('REVIEW_CHANGED');
  if(enabled)this.core.store.put('browserGrant',id,{id,hash,approved:Date.now()});
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
  if(c.locked||c.developmentMode||c.settings().workerPaused)throw fail('POLICY');
  if(recipe.sourceProvider==='pcc'&&!c.integrations.status('pcc').enabled)throw fail('INTEGRATION_UNAVAILABLE');
  const saved=this.recipe(recipe.id),grant=c.store.get('browserGrant',recipe.id);
  if(!grant||grant.hash!==digest(recipe)||grant.hash!==digest(saved))throw fail('BROWSER_REVIEW');
  return true;
 }
 list(){return this.core.store.list('browserRecipe').map(r=>({...r,tested:this.core.store.get('browserVerified',r.id)?.hash===digest(r),unattended:this.core.store.get('browserGrant',r.id)?.hash===digest(r)}));}
 async tick(){
  const c=this.core;
  if(this.busy||c.locked||c.developmentMode||c.settings().workerPaused||this.browser.context||this.browser.busy)return false;
  const due=c.store.list('schedule').filter(s=>s.browserRecipeId&&s.enabled&&s.next!==null&&s.next<=Date.now()).sort((a,b)=>a.next-b.next).find(s=>{
   const recipe=c.store.get('browserRecipe',s.browserRecipeId);
   return !recipe||recipe.sourceProvider!=='pcc'||c.integrations.status('pcc').enabled;
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
    const out=await this.browser.run(recipe,{scheduled:true});
    row.status='completed';row.output=out.relative;row.completed=Date.now();c.store.put('job',id,row);
    if(due.analysisPrompt){
     const file=await c.importFile(safePath(c.settings().workspace,out.relative));
     row.analysisJobId=uuid();c.store.put('job',id,row);
     await c.runJob({id:row.analysisJobId,title:'Analyze: '+due.name,prompt:due.analysisPrompt,format:'md',fileIds:[file.id],hipaa:true},false,true);
    }
   },{signal:controller.signal});
  }catch(e){
   if(!c.store.db)return false;
   row.status='failed';row.error=safeError(e).code;row.reason=safeError(e).message;row.completed=Date.now();c.store.put('job',id,row);
   // Require an explicit review after any failure; no repeated login attempts.
   const current=c.store.get('schedule',due.id);if(current)c.store.put('schedule',due.id,{...current,enabled:false,error:row.reason});
  }finally{
   if(c.store.db)c.store.put('browserPull','last',{finished:Date.now(),gapMinutes:due.gapMinutes||5});c.requests.delete(id);this.busy=false;
   c.emit({type:'jobs_changed'});c.emit({type:'job_finished',jobId:id});
  }
  return true;
 }
}
module.exports={BrowserReports,digest};
