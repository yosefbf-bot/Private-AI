'use strict';
// Closing the UI must not stop approved scheduled work on a Primary PC.
// This does not wake a sleeping PC, unlock the app, or resume paused work.
function needsBackground(core,{messaging=false,companion=false,native=false}={}){
 if(!core)return false;
 return native||messaging||companion||core.settings().workerEnabled||core.requests.size>0||
  core.store.list('schedule').some(s=>s.enabled&&s.next!=null)||
  core.store.summaries('report_history').some(r=>r.state==='pending')||
  core.store.summaries('report_analysis').some(r=>['pending','running'].includes(r.state))||
  core.store.summaries('job').some(j=>['queued','waiting','running','paused'].includes(j.status));
}
module.exports={needsBackground};
