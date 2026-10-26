'use strict';
// Optional pinned Windows CPU speech runtime. Audio is piped in memory, never
// written to an unencrypted working file or sent to a speech/cloud provider.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {fail,isId}=require('./security.cjs');
const assets=require('./speech-assets.json');
const {scopedCore}=require('./executive-workspace.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const folder=core=>path.join(core.root,'local-speech');
const active=new WeakSet(),requestTokens=new WeakMap();
async function fileHash(file){const h=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest('hex');}
async function verified(core){
  try{
    const dir=folder(core);
    for(const [name,digest] of Object.entries({...assets.runtime.files,'ggml-tiny.en.bin':assets.model.sha256})) {
      const file=path.join(dir,name),stat=fs.lstatSync(file);
      if(!stat.isFile()||stat.isSymbolicLink()||await fileHash(file)!==digest)return false;
    }
    return !fs.lstatSync(dir).isSymbolicLink();
  }catch{return false;}
}
function run(exe,args,{input,signal,timeout=120000}={}){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(fail('CANCELLED'));
    let output='',bad=false;
    const child=spawn(exe,args,{windowsHide:true,stdio:['pipe','pipe','ignore'],cwd:path.dirname(exe)});
    const abort=()=>{bad=true;child.kill();};
    const timer=setTimeout(abort,timeout);signal?.addEventListener('abort',abort,{once:true});
    child.stdout.on('data',b=>{if(output.length+b.length>20000)abort();else output+=b.toString('utf8');});
    child.stdin.on('error',()=>{});
    child.once('error',()=>{bad=true;});
    child.once('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(signal?.aborted)reject(fail('CANCELLED'));else if(bad||code!==0)reject(fail('LOCAL_ENGINE'));else resolve(output);});
    child.stdin.end(input);
  });
}
async function download(file,spec,signal){
  const response=await fetch(spec.url,{signal});
  if(!response.ok||!response.body)throw fail('DOWNLOAD');
  const fd=fs.openSync(file,'wx',0o600);let count=0;
  try{for await(const chunk of response.body){count+=chunk.length;if(count>spec.bytes)throw fail('LIMIT');fs.writeSync(fd,chunk);}}finally{fs.closeSync(fd);}
  if(count!==spec.bytes||await fileHash(file)!==spec.sha256)throw fail('INTEGRITY');
}
async function setup(core,signal){
  if(process.platform!=='win32'||process.arch!=='x64')throw fail('UNSUPPORTED');
  if(await verified(core))return {ready:true};
  const staging=fs.mkdtempSync(path.join(core.root,'speech-setup-'));
  try{
    await download(path.join(staging,'runtime.zip'),assets.runtime,signal);
    await download(path.join(staging,'ggml-tiny.en.bin'),assets.model,signal);
    // Only fixed manifest members are extracted. No archive-supplied path is used.
    const ps=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
    const script=`Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead($env:PAI_SPEECH_ZIP); try { foreach($n in '${Object.keys(assets.runtime.files).join(',')}'.Split(',')) { $e=@($z.Entries | Where-Object {$_.FullName -eq ('Release/'+$n)}); if($e.Count -ne 1){throw 'Invalid runtime archive'}; [IO.Compression.ZipFileExtensions]::ExtractToFile($e[0],(Join-Path $env:PAI_SPEECH_STAGE $n),$false) } } finally {$z.Dispose()}`;
    await new Promise((resolve,reject)=>{
      const child=spawn(ps,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,stdio:'ignore',env:{...process.env,PAI_SPEECH_ZIP:path.join(staging,'runtime.zip'),PAI_SPEECH_STAGE:staging}});
      const abort=()=>child.kill(),timer=setTimeout(abort,30000);signal.addEventListener('abort',abort,{once:true});
      child.once('error',()=>{});child.once('close',code=>{clearTimeout(timer);signal.removeEventListener('abort',abort);code===0&&!signal.aborted?resolve():reject(fail('DOWNLOAD'));});
    });
    for(const [name,digest] of Object.entries(assets.runtime.files))if(await fileHash(path.join(staging,name))!==digest)throw fail('INTEGRITY');
    if(signal.aborted)throw fail('CANCELLED');
    const dest=folder(core);if(fs.existsSync(dest)){
      if(fs.lstatSync(dest).isSymbolicLink())throw fail('STORAGE');
    }else fs.mkdirSync(dest,{mode:0o700});
    for(const name of [...Object.keys(assets.runtime.files),'ggml-tiny.en.bin']){
      const target=path.join(dest,name);if(fs.existsSync(target)&&fs.lstatSync(target).isSymbolicLink())throw fail('STORAGE');
      fs.copyFileSync(path.join(staging,name),target);
    }
    return {ready:await verified(core)};
  }finally{fs.rmSync(staging,{recursive:true,force:true});}
}
function wav(data){
  if(typeof data!=='string'||data.length>900000||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))throw fail('INVALID');
  const b=Buffer.from(data,'base64');
  if(b.length<364||b.length>640044||b.toString('base64')!==data||b.toString('ascii',0,4)!=='RIFF'||b.readUInt32LE(4)!==b.length-8||b.toString('ascii',8,16)!=='WAVEfmt '||b.readUInt32LE(16)!==16||b.readUInt16LE(20)!==1||b.readUInt16LE(22)!==1||b.readUInt32LE(24)!==16000||b.readUInt32LE(28)!==32000||b.readUInt16LE(32)!==2||b.readUInt16LE(34)!==16||b.toString('ascii',36,40)!=='data'||b.readUInt32LE(40)!==b.length-44||(b.length-44)%2)throw fail('INVALID');
  return b;
}
function saveChunk(core,data){
    if(!isId(data.meetingId)||!isId(data.chunkId))throw fail('INVALID');
    const meeting=core.store.get('meeting',data.meetingId);
    if(!meeting||meeting.status!=='live')throw fail('INVALID');
    const id=hash(data.meetingId+':'+data.chunkId),old=core.store.get('meeting_audio',id);
    const bytes=data.audio?wav(data.audio):old?wav(old.audio):null;
    if(!bytes)throw fail('INVALID');
    if(old&&old.sha256!==hash(bytes))throw fail('CHANGED');

    if(!old){
      const sizes=core.store.summaries('meeting_audio');
      if(sizes.filter(x=>x.meetingId===meeting.id).length>=180||sizes.reduce((n,x)=>n+x.bytes,0)+bytes.length>512*1024**2)throw fail('LIMIT');
      core.store.put('meeting_audio',id,{id,meetingId:meeting.id,chunkId:data.chunkId,sha256:hash(bytes),bytes:bytes.length,audio:bytes.toString('base64'),status:'pending',created:Date.now()});
    }
    return {id,bytes,meeting,old};
}
async function transcribe(core,bytes,signal){
  if(!await verified(core))throw fail('SPEECH_SETUP');
  if(core.resources.browser)throw fail('BUSY');
  await core.resources.releaseModel();await core.resources.checkpoint(1.5*1024**3);
  const result=(await run(path.join(folder(core),'whisper-cli.exe'),['-m',path.join(folder(core),'ggml-tiny.en.bin'),'-f','-','-of','unused','-nt','-t','2','-ng'],{input:bytes,signal})).trim();
  core.assertUnlocked();if(signal.aborted)throw fail('CANCELLED');
  if(result.length>5000)throw fail('LIMIT');return result;
}
async function dispatch(live,op,data={},options={}){
  live.assertUnlocked();
  if(live.developmentMode)throw fail('POLICY');
  const core=options.production?live:scopedCore(live);
  if(core.executiveDemo)throw fail('POLICY');
  if(op==='speechStatus')return {ready:await verified(core),supported:process.platform==='win32'&&process.arch==='x64',model:'Tiny English · local CPU'};
  if(op==='speechCancel'){if(!data.requestId||requestTokens.get(live)===data.requestId)live.requests.get('local-speech')?.abort();return true;}
  if(op==='speechChunks'){
    if(!isId(data.meetingId)||!core.store.get('meeting',data.meetingId))throw fail('NOT_FOUND');
    return core.store.summaries('meeting_audio').filter(r=>r.meetingId===data.meetingId).sort((a,b)=>a.created-b.created);
  }
  if(op==='speechWrite'){const {id}=saveChunk(core,data);return {id,saved:true};}
  if(!['speechSetup','speechTranscribe','speechDictate'].includes(op))throw fail('INVALID');
  if(active.has(live))throw fail('BUSY');
  if(op==='speechDictate'&&!isId(data.requestId))throw fail('INVALID');
  requestTokens.set(live,data.requestId||null);
  active.add(live);const controller=new AbortController();live.requests.set('local-speech',controller);
  try{
    if(op==='speechSetup')return await setup(core,controller.signal);
    if(op==='speechDictate') {
      const bytes=wav(data.audio);
      return await live.resources.task(options.background?'background':'foreground',()=>live.resources.withAI(async()=>({text:await transcribe(core,bytes,controller.signal)})),{signal:controller.signal});
    }
    const {id,bytes,meeting,old}=saveChunk(core,data);
    if(old?.status==='transcribed')return {id,replayed:true,text:old.text};
    return await live.resources.task(options.background?'background':'foreground',()=>live.resources.withAI(async()=>{
      const result=await transcribe(core,bytes,controller.signal);

      live.assertUnlocked();if(controller.signal.aborted)throw fail('CANCELLED');
      if(result.length>5000)throw fail('LIMIT');
      core.store.transaction(()=>{
        if(result){const m=new (require('./operations-copilot.cjs').OperationsCopilotEngine)(core).addTranscriptEntry(meeting.id,{speaker:'Unknown Speaker',text:result});const entry=m.transcript.at(-1);entry.audioChunkId=id;entry.transcription='local-whisper-tiny.en';core.store.put('meeting',m.id,m);}
        core.store.put('meeting_audio',id,{...core.store.get('meeting_audio',id),status:'transcribed',text:result});
      });
      return {id,text:result,replayed:false};
    }),{signal:controller.signal});
  }finally{active.delete(live);requestTokens.delete(live);live.requests.delete('local-speech');}
}
async function processPending(core){
  if(!core.store.db||core.locked||core.developmentMode||core.settings().workerPaused||active.has(core)||require('./snf/demo.cjs').forCore(core).current().demoMode)return;
  const meetings=core.store.summaries('meeting').filter(m=>m.companionSourceId&&m.status==='live');
  if(!meetings.length)return;
  const owned=new Set(meetings.map(m=>m.id));
  let chunks=core.store.summaries('meeting_audio');
  const pending=chunks.filter(a=>owned.has(a.meetingId)&&a.status!=='transcribed'&&!(a.retryAt>Date.now())).sort((a,b)=>a.created-b.created);
  if(pending.length){
    const item=pending[0];
    try{
      await dispatch(core,'speechTranscribe',item,{production:true,background:true});
      if(core.locked||!core.store.db)return;
      // Audio may have arrived during transcription. Refresh once after await;
      // idle passes share one snapshot instead of rescanning for each meeting.
      chunks=core.store.summaries('meeting_audio');
    }
    catch(e){
      if(!core.locked&&core.store.db){const row=core.store.get('meeting_audio',item.id);if(row)core.store.put('meeting_audio',row.id,{...row,retryAt:Date.now()+60000});}
      return;
    }
  }
  if(core.locked||!core.store.db)return;
  const uploading=new Set(core.store.summaries('meeting_upload').map(a=>a.meetingId));
  for(const meeting of meetings.filter(m=>m.finishRequested)){
    const audio=chunks.filter(a=>a.meetingId===meeting.id);
    if(audio.length!==meeting.expectedChunkCount||audio.some(a=>a.status!=='transcribed')||uploading.has(meeting.id))continue;
    const current=core.store.get('meeting',meeting.id);
    if(!current||current.status!=='live'||!current.finishRequested||current.expectedChunkCount!==meeting.expectedChunkCount)continue;
    const engine=new (require('./operations-copilot.cjs').OperationsCopilotEngine)(core);
    // Finalization creates review drafts; task creation remains explicit review.
    engine.finalizeMeeting(meeting.id);
  }
}
module.exports={dispatch,verified,wav,run,processPending};
