import {recordMeeting} from "./meeting-recorder.mjs";
export function createMeetingsUI({api,esc,toast,form,field,textarea,refresh,renderPage}) {
  let selected=null, generation=0, recorder=null, captureController=null;
  const stop=({discard=false}={})=>{generation++;recorder?.stop(!discard);captureController?.abort();captureController=null;recorder=null;};
  return {stop,async render(container,options={}) {
    if(recorder){await recorder.stop();recorder=null;}
    captureController?.abort();captureController=null;
    const ticket=++generation;
    if(options.meetingId)selected=options.meetingId;
    const [meetings,workspace]=await Promise.all([api('meetingList'),api('workflowSummary')]);
    if(ticket!==generation || !container.isConnected)return;
    const meeting=meetings.find(m=>m.id===selected);
    container.innerHTML=`<div class="page assistant-page"><div class="section-heading"><h1>Meetings</h1>${workspace.demo?'<p class="error-note">DEMO DATA — NOT FOR CLINICAL USE</p>':''}<button class="primary" id="meeting-new">New meeting</button></div><p class="help">Record what was discussed, review the summary, and track follow-ups.</p>${meeting?`<button id="meeting-back">← All meetings</button><h2>${esc(meeting.title)}</h2><p class="help">${esc(new Date(meeting.date).toLocaleString())} · ${esc(meeting.status)}</p>${meeting.status==='live'?`<div id="meeting-recording"></div><form id="meeting-note">${textarea('Add notes or paste a transcript','text')}<details><summary>Speaker (optional)</summary>${field('Name, if known','speaker')}<label class="check"><input type="checkbox" name="confirmed"> I confirm this speaker for this entry</label></details><button class="primary" type="submit">Add notes</button></form><button id="meeting-finish">Finish and prepare summary</button>`:''}${meeting.assistantDraft?.status==='ready'?`<details open><summary>Local AI draft · Review required${meeting.assistantDraft.partial?' · Partial transcript':''}</summary><pre class="meeting-summary">${esc(meeting.assistantDraft.text)}</pre></details>`:''}${meeting.status==='completed'?'<button id="meeting-ai-draft">Prepare local AI draft</button><p class="help">A configured local model prepares a summary and suggested plan. Review owners, deadlines and factual accuracy.</p>':''}${meeting.summary?`<details open><summary>Draft summary</summary><pre class="meeting-summary">${esc(meeting.summary)}</pre></details>`:''}<section><h2>Follow-ups</h2>${(meeting.actionItems||[]).map(a=>`<article class="followup-row"><div><strong>${esc(a.task)}</strong><p class="help">${esc(a.assignee||'Unassigned')} · ${esc(a.status)}</p></div>${a.convertedTodoId?'<span>In Dashboard</span>':`<button data-track="${esc(a.id)}">Track follow-up</button>`}</article>`).join('')||'<p class="help">No suggested follow-ups yet.</p>'}</section><details><summary>Transcript (${meeting.transcript.length} entries)</summary>${meeting.transcript.map(t=>`<article class="followup-row"><div><strong>${esc(t.speaker||'Unknown speaker')}${t.speakerVerified?'':' · Unverified'}</strong><p>${esc(t.text)}</p></div></article>`).join('')}</details><details><summary>Speaker review</summary><p>Recognition suggestions need confirmation. Unknown and overlapping speakers stay unverified.</p><button id="meeting-speakers">Review speaker attribution</button><button id="meeting-profiles">Manage verified voice profiles</button></details>`:meetings.length?meetings.map(m=>`<article class="followup-row"><div><strong>${esc(m.title)}</strong><p class="help">${esc(new Date(m.date).toLocaleString())} · ${esc(m.status)}</p></div><button data-meeting="${esc(m.id)}">Open</button></article>`).join(''):'<p>No meetings yet. Start a meeting or paste your notes.</p>'}</div>`;
    const bind=(selector,fn)=>container.querySelectorAll(selector).forEach(el=>el.onclick=async()=>{el.disabled=true;try{await fn(el);}catch(e){toast(e.message);}finally{el.disabled=false;}});
    const reload=()=>this.render(container);
    bind('#meeting-new',async()=>{const r=await form('New meeting',field('Title (optional)','title'));if(r){selected=(await api('meetingSave',{title:r.title||'Meeting',type:'general'})).id;await reload();}});
    bind('[data-meeting]',async el=>{selected=el.dataset.meeting;await reload();});
    bind('#meeting-back',async()=>{stop();selected=null;await reload();});
    bind('#meeting-finish',async()=>{if(recorder)await recorder.stop();stop();const chunks=await api('speechChunks',{meetingId:meeting.id}).catch(()=>[]);if(chunks.some(x=>x.status!=='transcribed'))throw Error('Retry pending audio before finishing the meeting.');await api('meetingFinalize',{meetingId:meeting.id});await refresh();await reload();});
    bind('#meeting-ai-draft',async()=>{await api('assistantDraftRetry',{kind:'meeting',id:meeting.id});await reload();});
    bind('[data-track]',async el=>{await api('meetingConvertActionItem',{meetingId:meeting.id,actionItemId:el.dataset.track});await refresh();await reload();});
    bind('#meeting-speakers',()=>renderPage('operations',{tab:'speaker_review',meetingId:meeting.id}));
    bind('#meeting-profiles',()=>renderPage('operations',{tab:'voice_profiles'}));
    const audioPanel=container.querySelector('#meeting-recording');
    if(audioPanel){
      let status;try{status=await api('speechStatus');}catch{status={supported:false};}
      if(ticket!==generation)return;
      audioPanel.innerHTML=status.supported?`<div class="section"><p id="record-status">${status.ready?'Local transcription ready · English':'Set up local transcription once (about 87 MB). Audio stays on this PC.'}</p><button id="record-start">${status.ready?'Record meeting':'Set up local transcription'}</button><button id="record-stop" hidden>Stop recording</button><p class="help">Record with participants’ permission. Review transcript accuracy and speaker names.</p><div id="audio-pending"></div></div>`:'<p class="help">Local recording is available in the Windows desktop app. You can paste meeting notes here.</p>';
      const pending=async()=>{const chunks=await api('speechChunks',{meetingId:meeting.id});if(ticket!==generation)return;audioPanel.querySelector('#audio-pending').innerHTML=chunks.filter(c=>c.status!=='transcribed').map(c=>`<p>Saved audio awaiting transcription <button data-audio-retry="${esc(c.chunkId)}">Retry</button></p>`).join('');bind('[data-audio-retry]',async el=>{await api('speechTranscribe',{meetingId:meeting.id,chunkId:el.dataset.audioRetry});await reload();});};
      if(status.supported){await pending();bind('#record-start',async()=>{
        if(!status.ready){audioPanel.querySelector('#record-status').textContent='Downloading and verifying local speech assets…';await api('speechSetup');await reload();return;}
        const start=audioPanel.querySelector('#record-start'),end=audioPanel.querySelector('#record-stop');
        captureController=new AbortController();start.hidden=true;end.hidden=false;
        try{recorder=await recordMeeting({signal:captureController.signal,onSave:chunk=>api('speechWrite',{meetingId:meeting.id,...chunk}),onChunk:chunk=>api('speechTranscribe',{meetingId:meeting.id,...chunk}),onState:message=>{if(ticket===generation)audioPanel.querySelector('#record-status').textContent=message;},onError:e=>toast(e.message)});}
        catch(e){start.hidden=false;end.hidden=true;throw e;}
      });bind('#record-stop',async()=>{if(recorder)await recorder.stop();recorder=null;await reload();});}
    }
    const note=container.querySelector('#meeting-note');
    if(note)note.onsubmit=async e=>{e.preventDefault();const button=note.querySelector('button[type="submit"]');button.disabled=true;try{const r=Object.fromEntries(new FormData(note));if(!r.text.trim())throw Error('Write a note first.');await api('meetingAddTranscript',{meetingId:meeting.id,text:r.text,speaker:r.speaker||'Unknown',speakerConfirmed:r.confirmed==='on'&&!!r.speaker});await reload();}catch(err){toast(err.message);}finally{button.disabled=false;}};
  }};
}
