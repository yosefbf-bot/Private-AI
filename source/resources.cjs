'use strict';
const os = require('node:os');
const {AsyncLocalStorage} = require('node:async_hooks');
const {fail} = require('./security.cjs');
const {budgetSettings}=require('./local-brain.cjs');
const GIB = 1024 ** 3;
const defaultSleep=ms=>new Promise(r=>setTimeout(r,ms));
const WARNINGS = {
 browser: 'Microsoft Edge: opens or controls a visible report browser window and may take focus. Clicking or filling fields changes the report session. A separate profile does not guarantee focus isolation. No system clipboard or global desktop input is requested by this workflow.',
 messaging: 'Microsoft Edge / WhatsApp Web: may open or focus a window and changes the selected messaging session. Sending fills its composer and clicks Send; it may conflict with your own use of that session. A separate profile does not guarantee focus isolation.',
 outlook: 'Microsoft Outlook: this operation uses your signed-in Outlook session. Outlook may open a window or display a prompt; focus effects cannot be guaranteed. Existing Outlook permissions still apply.',
 desktop: 'Desktop automation may open or change windows, take focus, or use mouse/keyboard input. Desktop input may affect whichever app is in focus, not necessarily the intended app. Clipboard or shared-session effects cannot be ruled out for an unverified helper. Other affected apps are not known with certainty.'
};
class Resources {
 constructor(core, {memory=()=>Math.min(os.freemem(), process.availableMemory?.() || Infinity), sleep=defaultSleep}={}) {
  this.core=core; this.memory=memory; this.sleep=sleep; this.context=new AsyncLocalStorage(); this.foreground=0; this.background=null; this.ai=null; this.browser=null; this.approve=null; this.sequence=0;
  this.residentBrowsers=new Map();this.revision=0;this.waiters=new Set();this.ramWaiters=0;this.ramTimer=null;
 }
 notify(){this.revision++;for(const wake of [...this.waiters])wake();}
 waitForChange(revision,{ram=false,signal=this.current()?.signal}={}){
  return new Promise((resolve,reject)=>{
   let settled=false;
   const finish=()=>{if(settled)return;settled=true;this.waiters.delete(finish);signal?.removeEventListener('abort',finish);if(ram&&!--this.ramWaiters){clearTimeout(this.ramTimer);this.ramTimer=null;}signal?.aborted?reject(fail('CANCELLED')):resolve();};
   this.waiters.add(finish);if(ram)this.ramWaiters++;signal?.addEventListener('abort',finish,{once:true});
   // Recheck after subscription: a notification is only a reason to retry, not admission.
   if(signal?.aborted||revision!==this.revision){finish();return;}
   // Preserve the existing injectable virtual-wait test adapter. Production
   // ownership/pause waits have no timer; only RAM recovery samples periodically.
   if(this.sleep!==defaultSleep){Promise.resolve().then(()=>this.sleep(500)).then(finish,finish);}
   else if(ram&&!this.ramTimer)this.ramTimer=setTimeout(()=>{this.ramTimer=null;this.notify();},500);
  });
 }
 blocked(task=this.current()){return task?.kind==='background'&&(this.core.settings().workerPaused||this.foreground>0);}
 releaseAI(task){if(this.ai===task){this.ai=null;this.notify();}}
 current(){return this.context.getStore();}
 isBackground(){return this.current()?.kind==='background'||!!this.core.backgroundToken&&this.core.backgroundContext?.getStore()===this.core.backgroundToken;}
 snapshot(){return {foreground:this.foreground, background:this.background ? {state:this.background.state,reason:this.background.reason} : {state:this.core.settings().workerPaused?'paused':'waiting',reason:this.core.settings().workerPaused?'Background work is paused. Review Health & recovery before resuming.':'No background task running.'},browser:this.browser?.label||null,residentBrowsers:[...this.residentBrowsers.values()],availableMemoryGB:Math.round(this.memory()/GIB*10)/10};}
 state(task,state,reason){if(!task||task.state===state&&task.reason===reason)return;task.state=state;task.reason=reason;task.update?.(state,reason);this.core.emit?.({type:'jobs_changed'});}
 async task(kind,fn,{signal,update}={}){
  if(this.current())return fn();
  const task={id:++this.sequence,kind,signal,update,state:'waiting',reason:''};
  if(kind==='foreground'){this.foreground++;this.notify();}
  try{return await this.context.run(task,async()=>{
   if(kind==='background'){
    while(this.background){const revision=this.revision;this.cancel(task);this.state(task,'waiting','Another background task is running.');await this.waitForChange(revision);}
    this.background=task;
    await this.checkpoint();
   }
   return await fn();
  });}finally{if(kind==='foreground')this.foreground--;if(this.background===task)this.background=null;this.notify();this.core.emit?.({type:'jobs_changed'});}
 }
 cancel(task=this.current()){if(task?.signal?.aborted)throw fail('CANCELLED');}
 async checkpoint(minimum=GIB,{releaseLocal=false}={}){
  const task=this.current();let pressure=false,recoveredAt=0;
  const operationMinimum=minimum;
  for(;;){
   minimum=Math.max(operationMinimum,(this.core.settings().ramReserveMB||1024)*1024**2);
   const revision=this.revision;let ramWait=false;
   this.cancel(task);
   let reason='',state='waiting';
   if(task?.kind==='background'&&this.core.settings().workerPaused){state='paused';reason='Background work is paused; resumes at a safe task boundary.';}
   else if(task?.kind==='background'&&this.foreground)reason='Foreground chat has priority; waiting for your chat to finish.';
   else if(this.memory()<minimum){
    pressure=true;recoveredAt=0;
    const local=this.core.router?.local;
    if((releaseLocal||task?.kind==='background')&&local?.child&&!local.busy&&!local.loadPending&&!this.ai&&!this.browser){
     const owner=task||{id:++this.sequence};this.ai=owner;
     try{await this.releaseModel();}finally{this.releaseAI(owner);}continue;
    }
    if(task?.kind!=='background')throw fail('LOW_MEMORY');
    ramWait=true;
    state='paused';reason=`Low RAM: ${(this.memory()/GIB).toFixed(1)} GB available; ${(minimum/GIB).toFixed(1)} GB estimated minimum for this phase.`;
   }
   if(!reason&&pressure&&task?.kind==='background'){
    if(!recoveredAt)recoveredAt=Date.now();
    if(Date.now()-recoveredAt<(this.core.settings().ramRecoverySeconds??0)*1000){ramWait=true;state='paused';reason='RAM recovered; waiting for sustained headroom before resuming.';}
   }
   if(!reason){this.state(task,'running','');return;}
   if(!ramWait)recoveredAt=0;
   this.state(task,state,reason);await this.waitForChange(revision,{ram:ramWait});
  }
 }
 localMemoryFailure(settings,minimum=GIB){
  const reserve=(this.core.settings().ramReserveMB||1024)*1024**2,local=this.core.router.local;
  const budget=budgetSettings(settings);
  const needed=Math.max(minimum,reserve,require('./local-brain.cjs').requiredMemory(local.validate(settings),budget.localContext)+Math.max(0,reserve-GIB),(this.core.stability?.minimumFor(budget)||0)+reserve);
  const error=fail('LOW_MEMORY');error.ram={requiredBytes:Math.ceil(needed),availableBytes:Math.max(0,Math.floor(this.memory()))};Object.defineProperty(error,'localAdmission',{value:{...settings}});return error;
 }
 async withAI(fn,{localSettings,waitForMemory=true,allowContextReduction=false,allowCompactContext=false,contextFits=()=>true,minimum=GIB,releaseLocal=false,excludeBrowser=false,prepare}={}){
  const task=this.current()||{id:++this.sequence,kind:'foreground'};
  for(;;){
   try{await this.checkpoint(minimum,{releaseLocal});}catch(e){if(e.code==='LOW_MEMORY'&&localSettings)throw this.localMemoryFailure(localSettings,minimum);throw e;}this.cancel(task);
   if(this.blocked(task)||this.memory()<Math.max(minimum,(this.core.settings().ramReserveMB||1024)*1024**2))continue;
   const revision=this.revision;
   if(this.ai||((localSettings||excludeBrowser)&&this.browser)){
    this.state(task,'waiting',this.browser?'Close the active browser session before AI reasoning.':'Waiting for the active AI call to finish safely.');await this.waitForChange(revision,{signal:task.signal});continue;
   }
   this.ai=task;
  try{
   if(releaseLocal)await this.releaseModel();
   if(prepare)await prepare();
   this.cancel(task);if(this.blocked(task)||this.memory()<Math.max(minimum,(this.core.settings().ramReserveMB||1024)*1024**2))continue;
   if(localSettings){const local=this.core.router.local;
    const signature=s=>[s.localModelPath,s.localContext,s.resourceMode].join('|');
    const fitsContext=s=>s.localContext>s.localMaxOutput+256&&contextFits(s);
    // Reuse a compatible smaller-context engine without counting resident weights
    // as another cold allocation. The full request must still fit its context.
    const active=local?.activeSettings;
    if(allowContextReduction&&local.state==='ready'&&active&&active.localModelPath===localSettings.localModelPath&&active.resourceMode===localSettings.resourceMode&&active.localContext>=(allowCompactContext?1024:2048)&&active.localContext<localSettings.localContext){
     const candidate={...localSettings,localContext:active.localContext,...(active.localMemoryContext?{localMemoryContext:active.localMemoryContext}:{})};
     if(fitsContext(candidate))localSettings=candidate;
    }
    if(local?.state!=='ready'||local.signature!==signature(localSettings)){
    if(local.child)await this.releaseModel();
    const reserve=(this.core.settings().ramReserveMB||1024)*1024**2;
    const memoryNeeded=s=>{const budget=budgetSettings(s);return Math.max(require('./local-brain.cjs').requiredMemory(local.validate(s),budget.localContext)+Math.max(0,reserve-GIB),(this.core.stability?.minimumFor(budget)||0)+reserve);};
    let minimum=memoryNeeded(localSettings);
    // Automatic mode may use a smaller KV/context allocation, never less working
    // headroom, a lower learned peak, or a truncated request. Saved settings stay intact.
    if(allowContextReduction&&this.memory()<minimum&&localSettings.localContext>(allowCompactContext?1024:2048)){
     const candidate=require('./local-brain.cjs').contextCandidates(localSettings,{compact:allowCompactContext}).find(fitsContext);
     if(candidate){localSettings=candidate;minimum=memoryNeeded(candidate);}
    }
    // Do not hold the AI lane while a paused background task waits for RAM/chat.
    if(this.memory()<minimum){if(!waitForMemory)throw this.localMemoryFailure(localSettings,minimum);this.releaseAI(task);await this.checkpoint(minimum);continue;}
   }}
   this.cancel(task);if(this.blocked(task))continue;
   this.state(task,'running','');return localSettings?await fn(localSettings):await fn();
  }finally{this.releaseAI(task);}
  }
 }
 async preflight(kind,target,body,context=''){
  if(kind==='messaging'&&target){
   const policy=require('./messaging-policy.cjs');
   policy.assertWritable(this.core,target);
   policy.assertSendAllowed(this.core,target);
   if(typeof body!=="string"||!body.trim())throw fail("POLICY");
  }
  const detail=(kind==="messaging"&&target?"Send this WhatsApp message?\nTo: "+target.groupName+" ("+target.groupId+")\n\n"+body+"\n\n":"")+(context?context+'\n\n':'')+(WARNINGS[kind]||WARNINGS.desktop);
  if(this.isBackground() || this.core.locked || !this.approve)throw fail('INTERFERENCE');
  if(!await this.approve(detail))throw fail('DEFERRED');
 }
 async releaseModel(){
  const local=this.core.router?.local;if(!local)return;
  if(local.busy||local.loadPending)throw fail('BUSY');
  const child=local.child;local.stop('browser-task');
  if(local.waitStopped){await local.waitStopped();return;}
  if(child){
   // kill() signals termination; wait for actual exit before using freed RAM.
   const deadline=Date.now()+10000;
   while(child.exitCode===null&&child.signalCode===null){if(Date.now()>deadline)throw fail('BUSY');await this.sleep(100);}
  }
 }
 async reserveBrowser(owner,label){
  if(this.browser)throw fail('BUSY');
  // Reserve synchronously before awaiting process exit; no second session can launch.
  if(this.ai||this.core.router?.local?.busy||this.core.router?.local?.loadPending)throw fail('BUSY');
  this.browser={owner,label};if(this.core.router?.local)this.core.router.local.browserBusy=true;
  try{await this.releaseModel();await this.checkpoint(1.5*GIB);}catch(e){this.releaseBrowser(owner);throw e;}
 }
 // Resident messaging is accounted by actual free RAM, not an exclusive AI-blocking token.
 retainBrowser(owner,label){this.residentBrowsers.set(owner,label);this.releaseBrowser(owner);this.notify();}
 retireBrowser(owner){this.residentBrowsers.delete(owner);this.releaseBrowser(owner);this.notify();}
 releaseBrowser(owner){if(this.browser?.owner!==owner)return;this.browser=null;if(this.core.router?.local)this.core.router.local.browserBusy=false;this.notify();}
}
module.exports={Resources,WARNINGS};
