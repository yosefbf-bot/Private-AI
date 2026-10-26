"use strict";
// Administrative attention is metadata over existing sources, never task/clinical resolution.
const {fail}=require('../security.cjs'),{signature}=require('./actions.cjs');
const kinds=new Set(['job','schedule','message']);
function list(core,snf,{key}={}){
 core.assertUnlocked();const store=snf.store,restricted=!!snf.demoMode||!!core.developmentMode,sources=[];
 const add=(kind,id,title,detail,source,view)=>sources.push({key:kind+':'+id,kind,id,title,detail,revision:signature(source),route:{view,...(kind==='job'?{jobId:id}:kind==='schedule'?{scheduleId:id}:{})}});
 if(!restricted){
  core.store.summaries('job').forEach(j=>{if(j.status==='failed')add('job',j.id,j.title||'Report needs review',j.error==='INTERRUPTED'?'Interrupted report requires review; it was not automatically repeated.':'A report failed. Review its saved state before retrying.',{status:j.status,error:j.error,completed:j.completed,checkpoint:j.step||undefined},'automation');return null;});
  for(const s of core.store.list('schedule'))if(s.error)add('schedule',s.id,s.name||'Schedule needs review','This schedule could not continue. Review its source and permissions.',{enabled:s.enabled,error:s.error,lastRun:s.lastRun},'automation');
  for(const m of core.store.recent('messageOut',100))if(['pending-approval','delivery-uncertain'].includes(m.status))add('message',m.id,'WhatsApp delivery needs review',m.status==='pending-approval'?'A prepared message awaits your approval. Nothing has been sent.':'Delivery is uncertain. Check WhatsApp before considering another send.',{status:m.status,revision:m.revision,time:m.time},'messaging');
 }
 const isActive=n=>n.status!=='acknowledged'&&!(n.status==='snoozed'&&n.snoozedUntil>Date.now());
 const items=sources.map(n=>{const saved=store.get('wf_notice_review',n.key);const same=saved?.revision===n.revision;return {...n,status:same?saved.status:'unread',snoozedUntil:same?saved.snoozedUntil||null:null};});
 items.sort((a,b)=>Number(isActive(b))-Number(isActive(a)));
 return {items:(key?items.filter(n=>n.key===key):items).slice(0,100),total:items.length,truncated:items.length>100,active:items.filter(isActive).length,notice:'Administrative acknowledgments do not complete tasks, resolve clinical alerts, send messages or prove complete monitoring. Source coverage includes existing job/schedule records and the newest 100 outgoing message records.'};
}
function update(core,snf,data){
 core.assertUnlocked();if(!data||Object.keys(data).some(k=>!['key','revision','status','snoozedUntil'].includes(k))||typeof data.key!=='string'||data.key.length>200||!kinds.has(data.key.split(':')[0])||!['unread','acknowledged','snoozed'].includes(data.status))throw fail('INVALID');
 const row=list(core,snf,{key:data.key}).items.find(n=>n.key===data.key);if(!row)throw fail('NOT_FOUND');if(data.revision!==row.revision)throw fail('REVIEW_CHANGED');
 const until=data.status==='snoozed'?data.snoozedUntil:null;if(data.status==='snoozed'&&(!Number.isSafeInteger(until)||until<=Date.now()||until>Date.now()+30*86400000))throw fail('INVALID');
 const expires=core.settings().retentionDays?Date.now()+core.settings().retentionDays*86400000:null;
 snf.store.put('wf_notice_review',row.key,{revision:row.revision,status:data.status,snoozedUntil:until,at:Date.now()},{expires});return {key:row.key,status:data.status,snoozedUntil:until};
}
module.exports={list,update};
