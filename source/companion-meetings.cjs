'use strict';
// Phone-owned recordings use the same encrypted meeting/audio stores and local
// analytics as desktop meetings. Source IDs are scoped to the paired device.
const crypto=require('node:crypto');
const {fail,isId,text}=require('./security.cjs');
const {OperationsCopilotEngine}=require('./operations-copilot.cjs');
const speech=require('./local-speech.cjs');
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
function record(core,device,sourceId){
  if(!isId(sourceId))throw fail('INVALID');
  const row=core.store.get('companion_meeting',digest(device.id+':'+sourceId));
  if(!row||!core.store.get('meeting',row.meetingId))throw fail('NOT_FOUND');
  return row;
}
function summary(core,row){
  const meeting=core.store.get('meeting',row.meetingId);
  return {sourceId:row.sourceId,id:meeting.id,title:meeting.title,status:meeting.status,finishRequested:!!meeting.finishRequested,date:meeting.date,
    pendingAudio:core.store.summaries('meeting_audio').filter(a=>a.meetingId===meeting.id&&a.status!=='transcribed').length,
    summary:meeting.assistantDraft?.status==='ready'?`LOCAL AI DRAFT — REVIEW REQUIRED${meeting.assistantDraft.partial?' — PARTIAL TRANSCRIPT':''}\n${meeting.assistantDraft.text}\n\n${meeting.summary||''}`:meeting.summary||'',actions:(meeting.actionItems||[]).map(a=>({id:a.id,title:a.task,status:a.status,owner:a.assignee||'',dueAt:a.dueDate||null}))};
}
async function dispatch(core,device,op,data={}){
  core.assertUnlocked();
  if(core.developmentMode||require('./snf/demo.cjs').forCore(core).current().demoMode)throw fail('POLICY');
  if(device.notificationOnly||!device.scopes.workflow)throw fail('POLICY');
  if(op==='list')return {meetings:core.store.list('companion_meeting').filter(r=>r.deviceId===device.id&&core.store.get('meeting',r.meetingId)).slice(0,30).map(r=>summary(core,r))};
  if(!isId(data.sourceId))throw fail('INVALID');
  const key=digest(device.id+':'+data.sourceId);
  if(op==='create'){
    if(Object.keys(data).some(k=>!['sourceId','title'].includes(k)))throw fail('INVALID');
    const title=text(data.title||'Meeting',150),old=core.store.get('companion_meeting',key);
    if(old){if(old.title!==title)throw fail('CHANGED');return summary(core,record(core,device,data.sourceId));}
    if(core.store.count('companion_meeting')>=1000)throw fail('LIMIT');
    return core.store.transaction(()=>{
      const meeting=new OperationsCopilotEngine(core).createMeeting({type:'general',title});
      core.store.put('meeting',meeting.id,{...meeting,companionSourceId:data.sourceId});
      const row={id:key,deviceId:device.id,sourceId:data.sourceId,meetingId:meeting.id,title};
      core.store.put('companion_meeting',key,row);return summary(core,row);
    });
  }
  const row=record(core,device,data.sourceId),meeting=core.store.get('meeting',row.meetingId);
  if(op==='get')return summary(core,row);
  if(op==='finish'){
    if(!Number.isInteger(data.expectedChunkCount)||data.expectedChunkCount<0||data.expectedChunkCount>180)throw fail('INVALID');
    if(meeting.finishRequested&&meeting.expectedChunkCount!==data.expectedChunkCount)throw fail('CHANGED');
    if(core.store.summaries('meeting_audio').filter(a=>a.meetingId===meeting.id).length!==data.expectedChunkCount||core.store.project('meeting_upload',a=>a.meetingId===meeting.id).some(Boolean))throw fail('SPEECH_PENDING');
    if(meeting.status!=='completed')core.store.put('meeting',meeting.id,{...meeting,finishRequested:true,expectedChunkCount:data.expectedChunkCount});
    return summary(core,row);
  }
  if(op!=='audio')throw fail('INVALID');
  if(!isId(data.chunkId)||!Number.isInteger(data.index)||!Number.isInteger(data.total)||data.total<1||data.total>8||data.index<0||data.index>=data.total||!Number.isInteger(data.bytes)||data.bytes<364||data.bytes>640044||!(/^[a-f0-9]{64}$/).test(data.sha256)||typeof data.data!=='string'||data.data.length>110000||!(/^[A-Za-z0-9+/]*={0,2}$/).test(data.data))throw fail('INVALID');
  const bytes=Buffer.from(data.data,'base64');if(bytes.length<1||bytes.length>80*1024||bytes.toString('base64')!==data.data||data.total!==Math.ceil(data.bytes/(80*1024))||bytes.length!==(data.index===data.total-1?data.bytes-data.index*80*1024:80*1024))throw fail('INVALID');
  const audioId=digest(meeting.id+':'+data.chunkId),saved=core.store.get('meeting_audio',audioId);
  if(saved){if(saved.sha256!==data.sha256||saved.bytes!==data.bytes)throw fail('CHANGED');return {chunkId:data.chunkId,index:data.index,complete:true,audioId,sha256:saved.sha256,bytes:saved.bytes,status:saved.status};}
  if(meeting.status!=='live'||meeting.finishRequested)throw fail('POLICY');
  const uploadId=digest(device.id+':'+data.sourceId+':'+data.chunkId),old=core.store.get('meeting_upload',uploadId);
  if(old&&(old.sha256!==data.sha256||old.bytes!==data.bytes||old.total!==data.total))throw fail('CHANGED');
  if(!old&&core.store.count('meeting_upload')>=30)throw fail('LIMIT');
  const upload=old||{id:uploadId,meetingId:meeting.id,sha256:data.sha256,bytes:data.bytes,total:data.total,parts:{}};
  if(upload.parts[data.index]&&upload.parts[data.index]!==data.data)throw fail('CHANGED');
  upload.parts[data.index]=data.data;core.store.put('meeting_upload',uploadId,upload,{expires:Date.now()+86400000});
  if(Object.keys(upload.parts).length!==data.total)return {chunkId:data.chunkId,index:data.index,complete:false};
  const audio=Buffer.concat(Array.from({length:data.total},(_,i)=>Buffer.from(upload.parts[i],'base64')));
  if(audio.length!==data.bytes||digest(audio)!==data.sha256)throw fail('CHANGED');
  await speech.dispatch(core,'speechWrite',{meetingId:meeting.id,chunkId:data.chunkId,audio:audio.toString('base64')},{production:true});
  core.store.delete('meeting_upload',uploadId);
  return {chunkId:data.chunkId,index:data.index,complete:true,audioId,sha256:data.sha256,bytes:data.bytes,status:'pending'};
}
module.exports={dispatch};
