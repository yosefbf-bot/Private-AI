// One overview, using the existing deduplicated, revision-checked action queue.
export function createDashboardUI({api,esc,toast,form,field,textarea,refresh,renderPage}) {
  let generation=0;
  const when=v=>v?new Date(v).toLocaleString():'No deadline';
  const localDate=v=>v?new Date(v-new Date(v).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
  return {async render(container) {
    const ticket=++generation;
    const data=await api('workflowSummary');
    if(ticket!==generation || !container.isConnected)return;
    const open=data.changes.items.filter(x=>!x.closed), alerts=open.filter(x=>x.kind==='alert'), tasks=open.filter(x=>x.kind!=='alert');
    container.innerHTML=`<div class="page assistant-page"><h1>Dashboard</h1><p class="help">Your follow-ups, reminders and alerts in one place.</p>${data.demo?'<p class="error-note">DEMO DATA — NOT FOR CLINICAL USE</p>':''}<div class="dashboard-counts"><span><strong>${tasks.filter(x=>x.overdue).length}</strong> overdue</span><span><strong>${tasks.length}</strong> open follow-ups</span><span><strong>${alerts.length}</strong> recorded alerts</span></div><section><div class="section-heading"><h2>Follow-ups</h2><button data-act="view" data-view="captures">＋ Add a note</button></div><label class="field">Find a follow-up<input id="dashboard-search" type="search" placeholder="Search title or owner"></label><div id="dashboard-tasks"></div><details><summary>Completed items (${data.changes.items.filter(x=>x.closed).length})</summary>${data.changes.items.filter(x=>x.closed).slice(0,50).map(x=>`<p>${esc(x.title)} · ${esc(x.status)}</p>`).join('')}</details></section><section><div class="section-heading"><h2>Alerts</h2>${alerts.length?'<button data-act="view" data-view="snf">Review clinical evidence</button>':''}</div>${alerts.slice(0,20).map(x=>`<article class="followup-row"><strong>${esc(x.title)}</strong><span>${esc(x.severity)} · ${esc(x.status)}</span></article>`).join('')||'<p class="help">No alerts in the available records. This does not establish complete monitoring.</p>'}${alerts.length>20?'<p>Open clinical review to see all alerts.</p>':''}${data.changes.unavailable.length?'<p class="error-note">Some previous sources are unavailable; they were not treated as resolved.</p>':''}</section></div>`;
    const draw=()=>{
      const query=container.querySelector('#dashboard-search').value.toLowerCase();
      const matches=tasks.filter(x=>[x.title,x.owner].join(' ').toLowerCase().includes(query));
      container.querySelector('#dashboard-tasks').innerHTML=matches.slice(0,100).map(x=>`<article class="followup-row"><div><strong>${esc(x.title)}</strong><p class="help">${esc(x.owner||'Unassigned')} · ${esc(when(x.dueAt))}${x.overdue?' · Overdue':''}</p></div><button data-review="${esc(x.key)}">Review</button></article>`).join('')||'<p class="help">No matching follow-ups. Capture a note to start.</p>';
      if(matches.length>100)container.querySelector('#dashboard-tasks').insertAdjacentHTML('beforeend','<p>Showing 100 matches. Refine your search to see others.</p>');
      container.querySelectorAll('[data-review]').forEach(button=>button.onclick=async()=>{
        button.disabled=true;
        try {
          const item=tasks.find(x=>x.key===button.dataset.review);
          if(item.kind==='sbar'){renderPage('operations',{tab:'sbar',sbarId:item.id});return;}
          const r=await form('Review follow-up',`<p>${esc(item.title)}</p>${field('Owner','owner',item.owner)}${field('Reminder deadline','due',localDate(item.dueAt),'datetime-local')}${textarea('Progress / completion note','note',item.note)}${field('Reviewed by','reviewer')}${['todo','meeting'].includes(item.kind)?'<label class="check"><input type="checkbox" name="complete"> Complete this follow-up (note required)</label>':'<p>Resolve this clinical item in its source review workflow.</p>'}`);
          if(r){await api('workflowActionSave',{...r,key:item.key,revision:item.revision,dueAt:r.due?new Date(r.due).getTime():null,complete:r.complete==='on'});await refresh();await this.render(container);}
        }catch(e){toast(e.message);}finally{button.disabled=false;}
      });
    };
    container.querySelector('#dashboard-search').oninput=draw;draw();
  },stop(){generation++;}};
}
