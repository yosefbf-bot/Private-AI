import {createCorrespondenceUI} from './correspondence.mjs';
// One overview, using the existing deduplicated, revision-checked action queue.
export function createDashboardUI({api,esc,toast,form,field,textarea,select,refresh,renderPage}) {
  let generation=0;
  const communicationUI=createCorrespondenceUI({api,esc,toast,form,field,textarea,select,refresh,renderPage});
  const when=v=>v?new Date(v).toLocaleString():'No deadline';
  const localDate=v=>v?new Date(v-new Date(v).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
  return {async refresh(container,options={}) {
    const ticket=generation,data=await api('workflowSummary');
    if(ticket!==generation||!container.isConnected)return true;
    if(!options.canCommit())return false;
    await this.render(container,{...options,data});return true;
  },async render(container,options={}) {
    const ticket=++generation,active=()=>ticket===generation&&container.isConnected;
    const data=options.data||await api('workflowSummary');
    options={...options};delete options.data;
    if(ticket!==generation || !container.isConnected)return;
    const open=data.changes.items.filter(x=>!x.closed), alerts=open.filter(x=>x.kind==='alert'), tasks=open.filter(x=>x.kind!=='alert');
    if(options.taskId){const selected=data.changes.items.find(x=>x.id===options.taskId&&x.kind==='todo');if(selected&&!tasks.includes(selected))tasks.push(selected);}
    const notices=data.notices?.items.filter(n=>n.status!=='acknowledged'&&!(n.status==='snoozed'&&n.snoozedUntil>Date.now()))||[];
    container.innerHTML=`<div class="page assistant-page"><h1>Dashboard</h1><p class="help">Your follow-ups, reminders and alerts in one place.</p>${data.demo?'<p class="error-note">DEMO DATA — NOT FOR CLINICAL USE</p>':''}<div class="dashboard-counts"><span><strong>${tasks.filter(x=>x.overdue).length}</strong> overdue</span><span><strong>${tasks.length}</strong> open follow-ups</span><span><strong>${alerts.length}</strong> recorded alerts</span></div><section><h2>Needs attention</h2>${notices.slice(0,20).map(n=>`<article class="followup-row"><div><strong>${esc(n.title)}</strong><p class="help">${esc(n.detail)}</p></div><div><button data-notice-open="${esc(n.key)}">Open source</button><button data-notice-review="${esc(n.key)}">Acknowledge / snooze</button></div></article>`).join('')||'<p class="help">No administrative notices in the available records.</p>'}<p class="help">${esc(data.notices?.notice||'Acknowledgment does not complete follow-ups or resolve clinical alerts.')}</p>${notices.length>20?'<p>Showing 20 attention items; open run history or Messaging for remaining sources.</p>':''}${data.notices?.truncated?'<p>Only the first 100 source notices were loaded; review run history for older items.</p>':''}</section><section><div class="section-heading"><h2>Follow-ups</h2><button data-act="view" data-view="captures">＋ Add a note</button></div><label class="field">Find a follow-up<input id="dashboard-search" type="search" placeholder="Search title or owner"></label><div id="dashboard-tasks"></div><details><summary>Completed items (${data.changes.items.filter(x=>x.closed).length})</summary>${data.changes.items.filter(x=>x.closed).slice(0,50).map(x=>`<p>${esc(x.title)} · ${esc(x.status)}</p>`).join('')}</details></section><section><div class="section-heading"><h2>Alerts</h2>${alerts.length?'<button data-act="view" data-view="snf">Review clinical evidence</button>':''}</div>${alerts.slice(0,20).map(x=>`<article class="followup-row"><strong>${esc(x.title)}</strong><span>${esc(x.severity)} · ${esc(x.status)}</span></article>`).join('')||'<p class="help">No alerts in the available records. This does not establish complete monitoring.</p>'}${alerts.length>20?'<p>Open clinical review to see all alerts.</p>':''}${data.changes.unavailable.length?'<p class="error-note">Some previous sources are unavailable; they were not treated as resolved.</p>':''}</section></div>`;
    if(!data.demo&&!data.developmentMode){const section=document.createElement('section');section.id='dashboard-correspondence';container.querySelector('.assistant-page').append(section);communicationUI.render(section,{onSaved:async()=>{if(active())await this.render(container,options);}}).catch(e=>{if(ticket===generation&&section.isConnected)section.textContent=e.message;});}
    const draw=()=>{
      const query=container.querySelector('#dashboard-search').value.toLowerCase();
      const matches=tasks.filter(x=>[x.title,x.owner].join(' ').toLowerCase().includes(query));
      container.querySelector('#dashboard-tasks').innerHTML=matches.slice(0,100).map(x=>`<article class="followup-row" data-task-key="${esc(x.key)}"><div><strong>${esc(x.title)}</strong><p class="help">${esc(x.owner||'Unassigned')} · ${esc(when(x.dueAt))}${x.overdue?' · Overdue':''}</p></div><button data-review="${esc(x.key)}">Review</button></article>`).join('')||'<p class="help">No matching follow-ups. Capture a note to start.</p>';
      if(matches.length>100)container.querySelector('#dashboard-tasks').insertAdjacentHTML('beforeend','<p>Showing 100 matches. Refine your search to see others.</p>');
      container.querySelectorAll('[data-review]').forEach(button=>button.onclick=async()=>{
        button.disabled=true;
        try {
          const item=tasks.find(x=>x.key===button.dataset.review);
          if(item.kind==='sbar'){renderPage('operations',{tab:'sbar',sbarId:item.id});return;}
          const r=await form('Review follow-up',`<p>${esc(item.title)}</p>${field('Owner','owner',item.owner)}${field('Reminder deadline','due',localDate(item.dueAt),'datetime-local')}${textarea('Progress / completion note','note',item.note)}${field('Reviewed by','reviewer')}${['todo','meeting'].includes(item.kind)?'<label class="check"><input type="checkbox" name="complete"> Complete this follow-up (note required)</label>':'<p>Resolve this clinical item in its source review workflow.</p>'}`);
          if(r&&active()){await api('workflowActionSave',{...r,key:item.key,revision:item.revision,dueAt:r.due?new Date(r.due).getTime():null,complete:r.complete==='on'});if(active()){await refresh();if(active())await this.render(container);}}
        }catch(e){if(active())toast(e.message);}finally{button.disabled=false;}
      });
    };
    container.querySelectorAll('[data-notice-open]').forEach(button=>button.onclick=()=>{const n=notices.find(n=>n.key===button.dataset.noticeOpen);if(n)renderPage(n.route.view,n.route);});
    container.querySelectorAll('[data-notice-review]').forEach(button=>button.onclick=async()=>{
      const n=notices.find(n=>n.key===button.dataset.noticeReview);if(!n)return;button.disabled=true;
      try{const r=await form('Administrative notice',`<p>${esc(n.title)}</p><p>Acknowledgment changes only this notice. It does not send messages, complete tasks or resolve clinical evidence.</p><label><input type="checkbox" name="ack"> Acknowledge this notice</label>${field('Or remind me again','until','','datetime-local')}`);
        if(r&&active()){await api('workflowNoticeUpdate',{key:n.key,revision:n.revision,status:r.until?'snoozed':r.ack==='on'?'acknowledged':'unread',snoozedUntil:r.until?new Date(r.until).getTime():null});if(active())await this.render(container);}
      }catch(e){if(active())toast(e.message);}finally{button.disabled=false;}
    });
    container.querySelector('#dashboard-search').value=options.query||'';container.querySelector('#dashboard-search').oninput=draw;draw();
    if(options.taskId){const target=container.querySelectorAll('[data-task-key]');const row=[...target].find(el=>el.dataset.taskKey===('todo:'+options.taskId));if(row){row.tabIndex=-1;row.focus();row.scrollIntoView({block:'center'});}else toast('This follow-up is outside the current Dashboard list or no longer available.');}
  },stop(){generation++;communicationUI.stop();}};
}
