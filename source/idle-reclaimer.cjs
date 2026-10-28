'use strict';
function idleEligible(s){return (s.hidden===true||s.locked===true)&&s.recording===false&&s.requests===0&&s.foreground===0&&s.background===false&&s.ai===false&&s.browser===false&&s.modelBusy===false&&s.modelLoading===false&&s.otherWindow===false;}
class IdleReclaimer{
 constructor({eligible,trim,delayMs=1500}){Object.assign(this,{eligible,trim,delayMs});this.timer=null;this.pending=false;this.last=null;}
 cancel(){clearTimeout(this.timer);this.timer=null;this.controller?.abort();}
 schedule(){this.cancel();this.timer=setTimeout(()=>{this.timer=null;this.reclaim();},this.delayMs);this.timer.unref?.();}
 async reclaim(){
  if(this.pending)return null;this.cancel();if(!this.eligible())return null;this.pending=true;const controller=new AbortController();this.controller=controller;
  try{const raw=await this.trim({signal:controller.signal,authorize:()=>!controller.signal.aborted&&this.eligible()}),result={};if(controller.signal.aborted||!this.eligible())return null;for(const key of ['trimmed','skipped','workingSetBeforeBytes','workingSetAfterBytes','privateCommitBeforeBytes','privateCommitAfterBytes'])if(Number.isSafeInteger(raw?.[key])&&raw[key]>=0)result[key]=raw[key];this.last={...result,at:Date.now()};return this.last;}
  catch{return null;}finally{if(this.controller===controller)this.controller=null;this.pending=false;}
 }
}
module.exports={IdleReclaimer,idleEligible};
