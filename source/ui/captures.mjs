export function createCaptureUI({api,esc,toast,form,field,textarea,select,refresh}) {
  const localDate = value => value ? new Date(value-new Date(value).getTimezoneOffset()*60000).toISOString().slice(0,16) : '';
  return {async render(container) {
    const state = await api('captureList');
    container.innerHTML = `<div class="page"><h1>Notes and rounds</h1>${state.demo?'<p class="error-note">DEMO DATA — NOT FOR CLINICAL USE</p>':''}<p>Notes from this PC, your paired phone and approved WhatsApp conversations share one action queue. Suggestions require review; unknown facts stay unknown. Drafts are kept here until you choose to use them.</p><button data-act="view" data-view="actions">Action Center</button>
    <section class="section"><h2>Capture a note</h2><form id="capture-form">${select('Kind','kind',[['note','Note'],['round','Facility round'],['reminder','Reminder']],'note')}${textarea('What did you observe or want to follow up?','text')}${field('Location (optional)','location')}${field('Owner (optional)','owner')}${field('Reminder deadline (optional; this PC’s time zone)','dueAt','','datetime-local')}${select('Prepare a draft (optional)','draftChannel',[['','None'],['outlook','Outlook'],['whatsapp','WhatsApp']],'')}<label class="field">Evidence (optional; up to 5 MB)<input id="capture-file" type="file" accept="image/png,image/jpeg,application/pdf,text/plain"></label><p>Pictures are preserved as evidence. They are not interpreted by the local text model.</p><button type="submit">Save note and review items</button></form></section>
    <section class="section"><h2>Saved notes</h2>${state.captures.length?state.captures.map(c=>`<article class="card"><h3>${esc(c.kind)} · ${esc(c.actor?.kind || 'desktop')}</h3><p>${esc(c.text)}</p><p>Location: ${esc(c.location || 'Not provided')} · Observed: ${esc(c.observedAt?new Date(c.observedAt).toLocaleString():'Not provided')} · Saved: ${esc(new Date(c.created).toLocaleString())}</p>${c.evidenceIds.map(id=>`<button data-evidence="${esc(id)}">Review evidence</button>`).join('')}${state.actions.filter(a=>a.captureId===c.id).map(a=>`<div class="section"><strong>${esc(a.title)}</strong><p>${esc(a.status)} · Owner: ${esc(a.owner || 'Unassigned')} · Due: ${esc(a.dueAt?new Date(a.dueAt).toLocaleString():'Not set')}${a.reviewRequired?' · Needs review':''}</p><button data-action="${esc(a.id)}">Review / update follow-up</button></div>`).join('')}${state.drafts.filter(d=>d.captureId===c.id).map(d=>`<p>${esc(d.channel)} draft · Nothing sent <button data-draft="${esc(d.id)}">Review draft</button></p>`).join('')}</article>`).join(''):'<p>No captured notes yet.</p>'}${state.truncated?'<p>Showing the latest 100 notes.</p>':''}</section></div>`;
    const reload = async()=>{await refresh();await this.render(container);};
    const on = (selector,fn)=>container.querySelectorAll(selector).forEach(el=>el.addEventListener('click',async()=>{el.disabled=true;try{await fn(el);}catch(e){toast(e.message);}finally{el.disabled=false;}}));
    const captureForm = container.querySelector('#capture-form');
    const sourceId = crypto.randomUUID();
    let evidenceUpload = null;
    captureForm.addEventListener('submit',async event=>{
      event.preventDefault(); const button=captureForm.querySelector('button[type="submit"]');button.disabled=true;
      try {
        const values=Object.fromEntries(new FormData(captureForm)),evidenceIds=[],file=container.querySelector('#capture-file').files[0];
        if(file){
          if(file.size<1||file.size>5*1024**2||!['image/jpeg','image/png','application/pdf','text/plain'].includes(file.type))throw Error('Choose a supported evidence file up to 5 MB.');
          const bytes=new Uint8Array(await file.arrayBuffer()),digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),sha256=Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
          if(!evidenceUpload || evidenceUpload.sha256!==sha256 || evidenceUpload.name!==file.name)evidenceUpload={uploadId:crypto.randomUUID(),sha256,name:file.name};
          const uploadId=evidenceUpload.uploadId,total=Math.ceil(bytes.length/(80*1024));
          for(let index=0;index<total;index++){
            let raw='';for(const b of bytes.subarray(index*80*1024,(index+1)*80*1024))raw+=String.fromCharCode(b);
            const result=await api('captureEvidenceWrite',{uploadId,index,total,name:file.name,mime:file.type,bytes:bytes.length,sha256,data:btoa(raw)});
            if(result.complete&&!evidenceIds.includes(result.evidenceId))evidenceIds.push(result.evidenceId);
          }
        }
        await api('captureCreate',{sourceId,kind:values.kind,text:values.text,location:values.location,owner:values.owner,dueAt:values.dueAt?new Date(values.dueAt).getTime():null,evidenceIds,...(values.draftChannel?{draftChannel:values.draftChannel}:{})});
        toast('Note and review items saved.'); await reload();
      } catch(e){toast(e.message);} finally{button.disabled=false;}
    });
    on('[data-action]',async el=>{
      const item=state.actions.find(a=>a.id===el.dataset.action),r=await form('Review follow-up',`<p>${esc(item.description)}</p>${field('Owner','owner',item.owner)}${field('Deadline (this PC’s time zone)','dueAt',localDate(item.dueAt),'datetime-local')}${textarea('Review / completion note','note',item.note)}<label class="check"><input name="complete" type="checkbox"> Mark this follow-up completed</label><p>This changes the administrative follow-up only. Any clinical alert stays in its source workflow.</p>`);
      if(r){await api('captureActionUpdate',{id:item.id,revision:item.revision,owner:r.owner,dueAt:r.dueAt?new Date(r.dueAt).getTime():null,note:r.note,complete:!!r.complete});await reload();}
    });
    on('[data-draft]',async el=>{
      const draft=state.drafts.find(d=>d.id===el.dataset.draft),r=await form('Review '+draft.channel+' draft',`${field('Recipient (check before using)','recipient',draft.recipient)}${field('Subject','subject',draft.subject)}${textarea('Draft body','body',draft.body)}${draft.channel==='outlook'?'<label class="check"><input type="checkbox" name="outlook"> Also create a draft in Classic Outlook after desktop confirmation</label>':'<p>Copy the reviewed text into your selected WhatsApp conversation when ready. Nothing is sent automatically.</p>'}`);
      if(r){await api('captureDraftSave',{id:draft.id,revision:draft.revision,captureId:draft.captureId,channel:draft.channel,recipient:r.recipient,subject:r.subject,body:r.body});if(r.outlook)await api('outlookDraft',{to:r.recipient,subject:r.subject,body:r.body});await reload();}
    });
    on('[data-evidence]',async el=>{
      const e=await api('captureEvidenceRead',{id:el.dataset.evidence});
      await form('Saved evidence',`<p>${esc(e.name)} · ${esc(e.bytes)} bytes</p><p>SHA-256: ${esc(e.sha256)}</p>${e.mime.startsWith('image/')?`<img alt="Captured evidence; not an AI interpretation" src="data:${esc(e.mime)};base64,${esc(e.data)}" style="max-width:100%;max-height:70vh">`:e.mime==='text/plain'?`<pre style="white-space:pre-wrap">${esc(new TextDecoder().decode(Uint8Array.from(atob(e.data),c=>c.charCodeAt(0))))}</pre>`:'<p>PDF evidence is preserved. Import the original into Files for document analysis.</p>'}`,'Done');
    });
  }};
}
