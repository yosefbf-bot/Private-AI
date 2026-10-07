'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
const {Core}=require('../source/core.cjs'),{Store}=require('../source/database.cjs');
const {publicIdentity}=require('../source/worker.cjs');

test('indefinite retention survives Core cleanup and reopening, including local backups and Worker metadata',t=>{
 const f=fixture(t),c=f.core;c.saveSettings({retentionDays:0});
 const old=Date.now()-401*86400000,chat=c.createChat();
 c.store.put('chat',chat.id,chat,{updated:old});
 const job=c.jobPayload({prompt:'Synthetic retained job',format:'txt'});assert.equal(job.expiresAt,undefined);
 assert.equal(c.validateJob(JSON.parse(JSON.stringify(job))),true);
 for(const expiresAt of [null,0,-1,'never',NaN])assert.throws(()=>c.validateJob({...job,expiresAt}));
 c.worker.status(job.id,'completed');
 const status=path.join(c.settings().workspace,'Tasks/Completed',job.id+'.json');fs.utimesSync(status,old/1000,old/1000);
 const backups=path.join(f.root,'backups');fs.mkdirSync(backups);const backup=path.join(backups,'privateai-123.db');c.store.backup(backup);
 c.performCleanup();assert.ok(c.store.get('chat',chat.id));assert.ok(fs.existsSync(status));assert.ok(fs.existsSync(backup));
 c.close();const reopened=new Core({root:f.root,store:new Store(path.join(f.root,'privateai.db'),f.cipher),machine:'synthetic-machine'});
 try {assert.equal(reopened.settings().retentionDays,0);assert.ok(reopened.store.get('chat',chat.id));assert.ok(fs.existsSync(backup));
  reopened.saveSettings({retentionDays:100});reopened.performCleanup();assert.equal(reopened.store.get('chat',chat.id),null);assert.equal(fs.existsSync(status),false);
 }finally{reopened.close();}
});

test('DOCX extraction and Mammoth CLI remain compatible with the secure parser override',async t=>{
 const f=fixture(t),{Document,Packer,Paragraph}=require('docx');
 const file=path.join(f.root,'Synthetic document with spaces.docx');
 fs.writeFileSync(file,await Packer.toBuffer(new Document({sections:[{children:[new Paragraph('Synthetic DOCX regression content')]}]})));
 const mammoth=require('mammoth');assert.match((await mammoth.extractRawText({path:file})).value,/Synthetic DOCX regression content/);
 const cli=require.resolve('mammoth/bin/mammoth'),{execFileSync}=require('node:child_process');
 assert.match(execFileSync(process.execPath,[cli,file],{encoding:'utf8',timeout:15000}),/<p>Synthetic DOCX regression content<\/p>/);
 assert.match(execFileSync(process.execPath,[cli,'--help'],{encoding:'utf8',timeout:15000}),/usage:/i);
 const parser=require.resolve('argparse/package.json',{paths:[path.dirname(cli)]});assert.equal(require(parser).version,'2.0.1');
});

test('temporary Worker status-write failure preserves completed work and retries without restarting or rerunning',async t=>{
 const sender=fixture(t),receiver=fixture(t),shared=sender.core.settings().workspace;
 receiver.core.saveSettings({workspace:shared,role:'worker',workerEnabled:true});
 sender.core.store.put('peer',receiver.core.identity().id,publicIdentity(receiver.core.identity()));
 receiver.core.store.put('peer',sender.core.identity().id,publicIdentity(sender.core.identity()));
 const job=sender.core.jobPayload({prompt:'Synthetic offline status report',format:'txt'});
 sender.core.worker.queue(job,receiver.core.identity().id);
 const publish=receiver.core.worker.status.bind(receiver.core.worker);
 receiver.core.worker.status=(id,state,extra)=>{if(state==='completed')throw Error('Synthetic status write unavailable');return publish(id,state,extra);};
 await receiver.core.worker.tick();
 const completed=receiver.core.store.get('job',job.id);
 assert.equal(completed.status,'completed');assert.ok(fs.existsSync(path.join(shared,completed.output)));
 assert.equal(receiver.core.worker.pendingStatuses.has(job.id),true);
 const updated=receiver.core.store.db.prepare("SELECT updated FROM records WHERE kind='job' AND id=?").get(job.id).updated;
 receiver.core.worker.status=publish;await receiver.core.worker.tick();sender.core.worker.syncStatuses();
 assert.equal(sender.core.store.get('job',job.id).status,'completed');assert.equal(receiver.calls.length,1);
 assert.equal(receiver.core.store.db.prepare("SELECT updated FROM records WHERE kind='job' AND id=?").get(job.id).updated,updated);
});

test('voice reports unavailable recognition without capturing microphone input',async()=>{
 const {VoiceManager,LiveVoiceState}=await import('../source/ui/voice.mjs');const previous=global.window,descriptor=Object.getOwnPropertyDescriptor(global,'navigator');
 let captures=0;global.window={addEventListener(){}};
 Object.defineProperty(global,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>{captures++;throw Error('Must not capture');}}}});
 const v=new VoiceManager({getState:()=>({settings:{hipaa:false,processingMode:'local-first'}})});
 try{await v.startAudioVisualizer({});v.startListening();assert.equal(captures,0);assert.equal(v.state,LiveVoiceState.ERROR);assert.equal(v.listeningRequested,false);}
 finally{v.endSession();global.window=previous;if(descriptor)Object.defineProperty(global,'navigator',descriptor);else delete global.navigator;}
});

for(const interruptedState of ['running','completed'])test('Worker restart reconciles '+interruptedState+' status without repeating work',async t=>{
 const sender=fixture(t),receiver=fixture(t),shared=sender.core.settings().workspace;
 receiver.core.saveSettings({workspace:shared,role:'worker',workerEnabled:true});
 sender.core.store.put('peer',receiver.core.identity().id,publicIdentity(receiver.core.identity()));
 receiver.core.store.put('peer',sender.core.identity().id,publicIdentity(sender.core.identity()));
 const job=sender.core.jobPayload({prompt:'Synthetic recovery report',format:'txt'});
 sender.core.worker.queue(job,receiver.core.identity().id);receiver.core.store.claim(job.id);
 const updated=Date.now()-18*86400000;
 receiver.core.store.put('job',job.id,{...job,status:interruptedState,remote:true,...(interruptedState==='completed'?{output:'Reports/synthetic.txt',completed:updated}: {})},{updated});
 receiver.core.worker.status(job.id,'running');sender.core.worker.syncStatuses();receiver.core.close();
 let calls=0;const reopened=new Core({root:receiver.root,store:new Store(path.join(receiver.root,'privateai.db'),receiver.cipher),machine:'synthetic-machine',client:{generate:()=>{calls++;throw Error('must not rerun');}}});
 try {
  reopened.saveSettings({workerPaused:true});const publish=reopened.worker.status.bind(reopened.worker);
  reopened.worker.status=()=>{throw Error('Synthetic shared folder temporarily unavailable');};await reopened.worker.tick();
  assert.equal(reopened.worker.pendingStatuses.has(job.id),true);
  reopened.worker.status=publish;await reopened.worker.tick();sender.core.worker.syncStatuses();
  const actual=sender.core.store.get('job',job.id);assert.equal(actual.status,interruptedState==='running'?'failed':'completed');
  if(interruptedState==='running')assert.equal(actual.error,'INTERRUPTED');else assert.equal(actual.output,'Reports/synthetic.txt');
  assert.equal(reopened.worker.pendingStatuses.has(job.id),false);
  if(interruptedState==='completed')assert.equal(reopened.store.db.prepare("SELECT updated FROM records WHERE kind='job' AND id=?").get(job.id).updated,updated);
  reopened.saveSettings({workerPaused:false});await reopened.worker.tick();assert.equal(calls,0);
  assert.equal(fs.existsSync(path.join(shared,'Tasks/Queued',job.id+'.json')),false);
 }finally{reopened.close();}
});

test('voice stop, privacy revocation, late callbacks and unavailable policy fail closed',async t=>{
 const {VoiceManager}=await import('../source/ui/voice.mjs');
 const previous=global.window;let starts=0,aborts=0,transcripts=0;
 let state={settings:{hipaa:false,processingMode:'local-first'}},chat=null,open=true;
 global.window={addEventListener(){},SpeechRecognition:class {start(){starts++;}stop(){}abort(){aborts++;this.onend?.();}}};
 const v=new VoiceManager({getState:()=>state,getChat:()=>chat,canCapture:()=>open,onTranscript:()=>transcripts++});
 try {
  v.startListening();assert.equal(starts,1);v.recognition.onend();assert.equal(starts,2);
  v.stopListening();v.recognition.onend();assert.equal(starts,2);assert.ok(aborts);
  for(const policy of [null,{}, {settings:{hipaa:true,processingMode:'local-first'}},{settings:{hipaa:false,processingMode:'local-only'}}]){
   state={settings:{hipaa:false,processingMode:'local-first'}};v.startListening();const count=starts;state=policy;
   v.recognition.onend();v.startListening();assert.equal(starts,count);assert.equal(v.listeningRequested,false);
  }
  state={settings:{hipaa:false,processingMode:'local-first'}};v.startListening();chat={hipaa:true};v.enforcePolicy();assert.equal(v.listeningRequested,false);
  chat=null;v.startListening();const count=starts;v.resumeListeningAfterResponse();open=false;v.endSession();
  const texts=transcripts;v.recognition.onresult({results:[],resultIndex:0});assert.equal(transcripts,texts);
  await new Promise(r=>setTimeout(r,400));assert.equal(starts,count);
 }finally{v.endSession();global.window=previous;}
});

test('late microphone permission after close or policy revocation releases every track',async()=>{
 const {VoiceManager}=await import('../source/ui/voice.mjs');const previous=global.window,descriptor=Object.getOwnPropertyDescriptor(global,'navigator');
 let resolve,stopped=0;const stream={getTracks:()=>[{stop:()=>stopped++}]};
 global.window={addEventListener(){},SpeechRecognition:class{start(){}stop(){}abort(){}}};Object.defineProperty(global,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:()=>new Promise(r=>{resolve=r;})}}});
 let state={settings:{hipaa:false,processingMode:'local-first'}};const v=new VoiceManager({getState:()=>state});
 try{
  const pending=v.startAudioVisualizer({});v.endSession();resolve(stream);await pending;assert.equal(stopped,1);assert.equal(v.mediaStream,null);
  const second=v.startAudioVisualizer({});state=null;resolve(stream);await second;assert.equal(stopped,2);assert.equal(v.mediaStream,null);
 }finally{v.endSession();global.window=previous;if(descriptor)Object.defineProperty(global,'navigator',descriptor);else delete global.navigator;}
});
