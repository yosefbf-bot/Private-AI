'use strict';
const {fail}=require('./security.cjs');
function range(which){const a=new Date();a.setHours(0,0,0,0);if(which==='tomorrow')a.setDate(a.getDate()+1);const b=new Date(a);b.setDate(b.getDate()+1);const day=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");return {start:day(a),end:day(a)};}
function formatCalendar(rows){
 if(!rows.length)return 'No appointments were returned for this date.';
 const sorted=[...rows].sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
 const lines=sorted.map(x=>`- ${x.subject||'(No subject)'} — ${x.start||''} to ${x.end||''}`),conflicts=[];
 for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++){
  const a=sorted[i],b=sorted[j];if(a.allDay||b.allDay)continue;
  if(Date.parse(a.start)<Date.parse(b.end)&&Date.parse(b.start)<Date.parse(a.end))conflicts.push(`- ${a.subject||'(No subject)'} overlaps ${b.subject||'(No subject)'}`);
 }
 return lines.join('\n')+'\n\n'+(conflicts.length?'Potential time conflicts:\n'+conflicts.join('\n'):'No timed overlaps detected in the returned appointments.');
}
function createTools(core,access,browser){return async prompt=>{
 const p=prompt.trim().toLowerCase();
 if(p==='/diagnose'||/^(?:troubleshoot|diagnose|help troubleshoot) private[ -]?ai[.!?]?$/.test(p))return diagnose(core);
 if(p==='/status')return `Worker: ${core.settings().workerPaused?'paused':'available'}.\nLocal model: ${core.router.local?.status().state||'unavailable'}.\nProcessing: ${core.settings().processingMode}.\nQueued tasks: ${core.store.list('job').filter(j=>j.status==='queued').length}.`;
 if(p==='/unread'||/^check .*unread emails/.test(p)){
  const rows=await access.outlook("outlook.messages",{unread:true});
  return rows.length?rows.map(x=>`- ${x.subject||'(No subject)'} — ${x.sender||''} — ${x.received||''}`).join('\n'):'No unread messages were returned by Outlook.';
 }
 if(p.startsWith('/calendar')||/my (?:schedule|calendar)/.test(p)){
  const {start,end}=range(p.includes('tomorrow')?'tomorrow':'today');const rows=await access.outlook("outlook.calendar",{start,end});
  return formatCalendar(rows);
 }
 if(p.startsWith('/report ')){if(!browser)throw fail('LOCAL_UNAVAILABLE');const name=prompt.slice(8).trim(),recipe=core.store.list('browserRecipe').find(r=>r.name===name);if(!recipe)throw fail('INVALID');const out=await browser.run(recipe);return 'Report saved: '+out.relative;}
 throw fail('INVALID');
};}
function diagnose(core){
 const s=core.settings(),local=core.router.local?.status(),wa=core.store.get('messaging','settings')||{};
 const facts=[`Processing mode: ${s.processingMode}.`,`Cloud use permitted by processing settings: ${require('./hybrid-settings.cjs').cloudAllowed(s)?'yes':'no'}.`,`API key saved: ${core.key()?'yes':'no'} (validity not tested).`,`Work folder configured: ${s.workspace?'yes':'no'} (writability not tested).`,`Background work: ${s.workerPaused?'paused':'enabled'}.`,`Local model state: ${local?.state||'unavailable'}.`,`WhatsApp bridge configured: ${wa.enabled?'enabled':'disabled'} (live connection not tested).`];
 const steps=[];
 if(s.workerPaused)steps.push('If scheduled or remote work is waiting, review Health & recovery, then use Resume background work when ready.');
 if(!s.workspace)steps.push('Choose an approved work folder in Settings before running reports or exporting.');
 if(s.processingMode!=='cloud-first'&&(!local||local.state!=='ready'))steps.push('For local questions, open AI Processing, verify an installed model is selected, and inspect its load status. If memory is low, close heavy apps and reduce local context before retrying.');
 if(require('./hybrid-settings.cjs').cloudAllowed(s)&&(!core.key()||!s.model))steps.push('For cloud questions, configure the API key and model in Settings. This check does not test billing, credentials, or connectivity.');
 if(wa.enabled&&(wa.disableAllWriting??wa.readOnly))steps.push('WhatsApp has Disable all writing enabled. Replies are blocked; review this override only if you intend to allow sending.');
 if(wa.enabled)steps.push('For WhatsApp issues, open Messaging to inspect the live connection, selected conversation, approved sender, task permission, and reply switches.');
 steps.push('For a specific failure, provide the error code and what you were doing. Use /help followed by models, browser, messaging, schedules, or diagnostics for the relevant procedure.');
 return 'Private AI troubleshooting — local read-only checks\n\nObserved app configuration:\n'+facts.map(x=>'- '+x).join('\n')+'\n\nSuggested next steps:\n'+steps.map((x,i)=>(i+1)+'. '+x).join('\n')+'\n\nNo settings were changed, no connection or installer was tested, and no model/API request was made. These checks do not inspect other applications or resident records.';
}
module.exports={createTools,range,formatCalendar,diagnose};
