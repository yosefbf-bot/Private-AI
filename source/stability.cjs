"use strict";
const os=require('node:os');
const {getRAMProfile}=require('./ram-profile.cjs');
const {fail}=require('./security.cjs');
const VERSION=require('../package.json').version;
const EVENTS=new Set(['unclean-start','renderer-gone','renderer-hung','promise-failed','model-failed','model-timeout','sleep','wake','service-failed','job-interrupted']);
// Allowlisted technical fields only. Never persist exception messages/stacks,
// prompts, URLs, paths, window titles, or device/user identifiers here.
class Stability {
 constructor(core,{now=()=>Date.now()}={}){this.core=core;this.now=now;this.failures=[];this.blockedUntil=0;this.memorySamples={};this.modelPeaks={};this.incidents=[];this.started=now();this.safe=false;}
 start(){this.incidents=(this.core.store.get('maintenance','healthEvents')?.events||[]).filter(e=>EVENTS.has(e.event)&&Number.isSafeInteger(e.time)&&this.now()-e.time<Math.min(7,this.core.settings().retentionDays||7)*86400000).slice(-50);const previous=this.core.store.get('maintenance','sessionHealth');if(previous&&!previous.clean){this.safe=true;this.incident('unclean-start');this.pause();}this.core.store.put('maintenance','healthEvents',{events:this.incidents});this.core.store.put('maintenance','sessionHealth',{version:VERSION,clean:false,started:this.now()});}
 pause(){this.core.store.put('settings','main',{...this.core.settings(),workerPaused:true});}
 incident(event){if(!EVENTS.has(event))return;this.incidents.push({event,time:this.now()});this.incidents=this.incidents.slice(-50);try{this.core.store.put('maintenance','healthEvents',{events:this.incidents});}catch{} }
 modelFailure(){const now=this.now();this.failures=this.failures.filter(t=>now-t<300000);this.failures.push(now);this.incident('model-failed');if(this.failures.length>=3){this.blockedUntil=now+60000;this.pause();}}
 observePeak(tier,context,bytes){if(!["small","medium","high","extra"].includes(tier)||!Number.isInteger(context)||context<1024||context>16384||!Number.isSafeInteger(bytes)||bytes<=0)return;const key=tier+":"+context;this.modelPeaks[key]=Math.max(this.modelPeaks[key]||0,bytes);}
 minimumFor(settings){
  const row=this.core.modelManager?.catalog(settings).find(t=>t.file===settings.localModelPath);if(!row)return 0;
  // Increasing context must never sidestep an observed smaller-context peak.
  let minimum=0;for(const [key,bytes] of Object.entries(this.modelPeaks)){const [tier,context]=key.split(':');if(tier===row.tier&&Number(context)<=settings.localContext)minimum=Math.max(minimum,bytes);}
  return minimum;
 }
 assertModel(){if(this.now()<this.blockedUntil)throw fail('MODEL_COOLDOWN');}
 acknowledge(){this.core.assertUnlocked();this.safe=false;this.core.emit?.({type:'jobs_changed'});}
 observe(tier,context,bytes){if(!['small','medium','high','extra'].includes(tier)||!Number.isFinite(bytes)||bytes<0)return;const key=tier+':'+context;this.memorySamples[key]=Math.max(this.memorySamples[key]||0,Math.ceil(bytes));}
 snapshot(){return {version:VERSION,uptimeSeconds:Math.floor((this.now()-this.started)/1000),safeStartup:this.safe,modelCooldownSeconds:Math.max(0,Math.ceil((this.blockedUntil-this.now())/1000)),totalRAMGB:Math.round(os.totalmem()/2**30*10)/10,availableRAMGB:Math.round(this.core.resources.memory()/2**30*10)/10,appMemoryMB:Math.round(process.memoryUsage().rss/2**20),ramProfile:getRAMProfile(),observedModelPeakWorkingSetBytes:{...this.modelPeaks},systemFreeRAMDropBytes:{...this.memorySamples},events:this.incidents.slice(-20)};}
 close(){this.core.store.put('maintenance','sessionHealth',{version:VERSION,clean:true,closed:this.now()});}
}
module.exports={Stability};
