'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs'),speech=require('../source/local-speech.cjs'),ops=require('../source/operations-copilot.cjs');
async function sample(){const {encodeWav}=await import('../source/ui/meeting-recorder.mjs');return encodeWav(Float32Array.from({length:16000},(_,i)=>Math.sin(i/12)*0.2));}
test('meeting audio persists encrypted, rejects changed replay and remains pending without speech assets',async t=>{
  const {core,root,calls}=fixture(t),m=ops.dispatch(core,'meetingSave',{type:'general'});
  assert.deepEqual(m.attendees,[]);assert.deepEqual(m.agenda,[]);
  const data={meetingId:m.id,chunkId:crypto.randomUUID(),audio:await sample()};
  const first=await speech.dispatch(core,'speechWrite',data);
  assert.deepEqual(await speech.dispatch(core,'speechWrite',data),first);
  assert.equal(core.store.count('meeting_audio'),1);
  assert.throws(()=>ops.dispatch(core,'meetingFinalize',{meetingId:m.id}),{code:'SPEECH_PENDING'});
  await assert.rejects(speech.dispatch(core,'speechWrite',{...data,audio:data.audio.slice(0,80)+'AAAA'+data.audio.slice(84)}),{code:'CHANGED'});
  await assert.rejects(speech.dispatch(core,'speechTranscribe',data),{code:'SPEECH_SETUP'});
  assert.equal((await speech.dispatch(core,'speechChunks',{meetingId:m.id}))[0].status,'pending');
  assert.equal(ops.dispatch(core,'meetingGet',{id:m.id}).transcript.length,0);assert.equal(calls.length,0);
  for(const name of fs.readdirSync(root).filter(x=>/\.db(?:-wal)?$/.test(x)))assert.equal(fs.readFileSync(path.join(root,name)).includes(data.audio.slice(100,200)),false);
  ops.dispatch(core,'meetingDelete',{id:m.id});assert.equal(core.store.count('meeting_audio'),0);
});
test('local audio has strict PCM limits and is unavailable to locked, demo and development workspaces',async t=>{
  const {core}=fixture(t),audio=await sample();
  assert.equal(speech.wav(audio).length,32044);
  for(const invalid of ['',audio+'!',Buffer.from('RIFF').toString('base64'),'A'.repeat(900001)])assert.throws(()=>speech.wav(invalid),{code:'INVALID'});
  core.lock();await assert.rejects(speech.dispatch(core,'speechStatus'),{code:'LOCKED'});core.unlock();
  core.developmentMode=true;await assert.rejects(speech.dispatch(core,'speechSetup'),{code:'POLICY'});core.developmentMode=false;
  await require('../source/snf/demo.cjs').forCore(core).set({mode:'demo'});
  await assert.rejects(speech.dispatch(core,'speechWrite',{meetingId:crypto.randomUUID(),chunkId:crypto.randomUUID(),audio}),{code:'POLICY'});
  for(const op of ['speechStatus','speechSetup','speechWrite','speechTranscribe','speechChunks','speechCancel'])assert.throws(()=>require('../server/development-policy.cjs').assertOperation(op,{}),{code:'POLICY'});
});
test('meeting microphone cancellation releases a late grant without capturing',async()=>{
  const {recordMeeting}=await import('../source/ui/meeting-recorder.mjs');let grant,stops=0,calls=0;
  const controller=new AbortController();
  const recording=recordMeeting({signal:controller.signal,onChunk:()=>calls++,onState:()=>{},onError:()=>{},mediaDevices:{getUserMedia:()=>new Promise(r=>grant=r)},AudioContextClass:class {constructor(){throw Error('Must not create audio context');}}});
  controller.abort();grant({getTracks:()=>[{stop:()=>stops++}]});await assert.rejects(recording,/cancelled/);
  assert.equal(stops,1);assert.equal(calls,0);
});

test('background speech refreshes metadata after await when new audio arrives before finalization',async t=>{
 const {core}=fixture(t);core.saveSettings({workerPaused:false});
 const meeting=ops.dispatch(core,'meetingSave',{type:'general'}),audio=await sample();
 core.store.put('meeting',meeting.id,{...meeting,companionSourceId:'synthetic-phone',finishRequested:true,expectedChunkCount:1});
 const first=await speech.dispatch(core,'speechWrite',{meetingId:meeting.id,chunkId:crypto.randomUUID(),audio});
 let begin,finish;const started=new Promise(r=>begin=r),gate=new Promise(r=>finish=r);
 const task=core.resources.task;core.resources.task=async()=>{
  begin();await gate;
  const row=core.store.get('meeting_audio',first.id);core.store.put('meeting_audio',first.id,{...row,status:'transcribed',text:'Synthetic recording'});
  return {id:first.id,text:'Synthetic recording'};
 };t.after(()=>{finish();core.resources.task=task;});
 const work=speech.processPending(core);await started;
 const second=await speech.dispatch(core,'speechWrite',{meetingId:meeting.id,chunkId:crypto.randomUUID(),audio});
 finish();await assert.doesNotReject(work);
 assert.equal(core.store.get('meeting',meeting.id).status,'live');
 assert.equal(core.store.get('meeting_audio',second.id).status,'pending');
});
