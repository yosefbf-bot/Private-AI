'use strict';
// Opt-in packaged acceptance only. The caller verifies an isolated Windows data root.
// All mutations use the ordinary renderer IPC or authenticated HTTPS boundaries.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),https=require('node:https'),net=require('node:net'),path=require('node:path'),tls=require('node:tls');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
async function bounded(work,ms=15000){
 let timer;
 try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Acceptance timeout')),ms);})]);}
 finally{clearTimeout(timer);}
}
async function freePort(){
 const server=net.createServer();
 await bounded(new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);}));
 const port=server.address().port;
 await bounded(new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve())));
 return port;
}
function request(pairing,endpoint,body,{key=pairing.key,fingerprint=pairing.fingerprint}={}){
 const target=new URL(pairing.baseUrl),certificate=new crypto.X509Certificate(Buffer.from(pairing.certificate,'base64'));
 const bytes=body===undefined?null:Buffer.from(JSON.stringify(body));
 assert.equal(target.protocol,'https:');assert.equal(target.hostname,'127.0.0.1');
 assert.equal(target.username,'');assert.equal(target.password,'');
 assert.equal(certificate.checkIP(target.hostname),target.hostname);
 assert.equal(hash(certificate.raw),pairing.fingerprint);
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
  const req=https.request({host:target.hostname,port:Number(target.port),path:'/mobile/api/v1'+endpoint,method:bytes?'POST':'GET',ca:certificate.toString(),agent:false,minVersion:'TLSv1.2',
   // Keep normal CA/date/host verification, then additionally pin the pairing identity.
   checkServerIdentity:(host,peer)=>tls.checkServerIdentity(host,peer)||(hash(peer.raw)!==fingerprint?Object.assign(Error('Pinned certificate mismatch'),{code:'VALIDATION_TLS_IDENTITY'}):undefined),
   headers:{...(key?{'X-Pair-Key':key}:{}),...(bytes?{'Content-Type':'application/json','Content-Length':bytes.length}:{})}},res=>{
    let size=0;const chunks=[];
    res.on('data',chunk=>{size+=chunk.length;if(size>1024*1024){req.destroy(Error('Acceptance response limit'));return;}chunks.push(chunk);});
    res.on('error',error=>finish(error));
    res.on('end',()=>{try{finish(null,{status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString('utf8'))});}catch(error){finish(error);}});
   });
  const timer=setTimeout(()=>req.destroy(Error('Acceptance HTTPS timeout')),15000);
  req.on('socket',socket=>socket.once('secureConnect',()=>{
   const peer=socket.getPeerCertificate();
   if(!socket.authorized||!peer.raw||hash(peer.raw)!==fingerprint||!new crypto.X509Certificate(peer.raw).checkIP(target.hostname))req.destroy(Error('Acceptance TLS identity rejected'));
  }));
  req.on('error',error=>finish(error));if(bytes)req.write(bytes);req.end();
 });
}
async function run({core,win,reportPath}){
 assert.equal(process.platform,'win32');
 assert.equal(path.resolve(core.root),path.join(path.dirname(reportPath),'app-data'));
 const result={passed:false,syntheticOnly:true,transport:'packaged renderer IPC and pinned loopback HTTPS',checks:[],restartPersistenceVerified:false};
 const ids=[],runId=crypto.randomUUID(),phrase='SYNTHETIC packaged companion '+runId;
 const stopAt=Date.now()+90000;let cleaning=false;
 const remaining=()=>{if(cleaning)return 5000;const ms=Math.min(15000,stopAt-Date.now());if(ms<=0)throw Error('Acceptance timeout');return ms;};
 const rawCall=(op,data={})=>{const ms=remaining();return bounded(win.webContents.executeJavaScript('window.privateAI.call('+JSON.stringify(op)+','+JSON.stringify(data)+')'),ms);};
 const call=async(op,data={})=>{const response=await rawCall(op,data);assert.equal(response.ok,true,'IPC '+op);return response.result;};
 const ipcDenied=async(op,data,code)=>{const response=await rawCall(op,data);assert.equal(response.ok,false);assert.equal(response.error.code,code);};
 const ok=async(pairing,endpoint,body,options)=>{remaining();const response=await request(pairing,endpoint,body,options);assert.equal(response.status,200,'HTTPS '+endpoint);return response.body;};
 const denied=async(pairing,endpoint,body,status,options)=>{remaining();assert.equal((await request(pairing,endpoint,body,options)).status,status,'HTTPS denied '+endpoint);};
 let phase='isolated preconditions',initialGateway,originalLock,initialReminders,ownedLock=false,error=null;
 try{
  const summary=await call('summary');
  assert.ok(Object.entries(summary.savedProviders).filter(([provider])=>provider!=='local').every(([,present])=>present===false));
  assert.equal(summary.settings.processingMode,'local-only');assert.equal(summary.settings.allowCloud,false);
  assert.equal(summary.integrations.find(row=>row.id==='pcc').showDashboard,false);
  assert.equal((await call('snfFeedStatus')).monitoringEnabled,false);
  initialGateway=await call('companionStatus');assert.equal(initialGateway.settings.enabled,false);
  originalLock=core.store.get('secret','applock');initialReminders=summary.settings.autoReminders;
  const prior=core.store.get('validation','shared-companion-checkpoint');
  if(prior){for(const row of prior.rows)assert.deepEqual(core.store.get(row.kind,row.id),row.value);result.restartPersistenceVerified=true;result.checks.push('second process preserved synthetic shared notes, evidence, drafts and canonical follow-ups');}
  result.checks.push('keyless local-only PCC-off packaged startup retains general clinical and capture access');

  phase='gateway and certificate';
  const port=await freePort();await call('companionSave',{enabled:true,host:'127.0.0.1',port});
  const pair=async data=>{const paired=await call('companionPair',data);ids.push(paired.id);return paired;};
  const phone=await pair({name:'SYNTHETIC packaged workflow phone',scopes:{chat:true,workflow:true,notifications:true},notificationsWhileLocked:true});
  const other=await pair({name:'SYNTHETIC separate phone',scopes:{workflow:true,notifications:true}});
  const limited=await pair({name:'SYNTHETIC status-only phone',scopes:{}});
  assert.equal((await ok(phone,'/status')).status,'ONLINE');
  await denied(phone,'/status',undefined,401,{key:null});
  await assert.rejects(request(phone,'/status',undefined,{fingerprint:'0'.repeat(64)}));
  await denied(limited,'/actions',undefined,403);
  await denied(limited,'/captures/create',{},403);
  result.checks.push('real generated TLS certificate passes normal CA/host validation and pinning; wrong identity, missing key and missing scope are denied');

  phase='multi-chunk encrypted evidence';
  const evidenceBytes=Buffer.alloc(96*1024,83),sha256=hash(evidenceBytes),uploadId=crypto.randomUUID();
  const upload={uploadId,total:2,name:'SYNTHETIC packaged evidence.txt',mime:'text/plain',bytes:evidenceBytes.length,sha256};
  const first={...upload,index:0,data:evidenceBytes.subarray(0,80*1024).toString('base64')},last={...upload,index:1,data:evidenceBytes.subarray(80*1024).toString('base64')};
  assert.equal((await ok(phone,'/evidence/write',first)).complete,false);
  assert.equal((await ok(phone,'/evidence/write',first)).complete,false);
  const evidence=await ok(phone,'/evidence/write',last);assert.equal(evidence.complete,true);
  assert.equal((await ok(phone,'/evidence/write',first)).evidenceId,evidence.evidenceId);
  await denied(phone,'/evidence/write',{...first,data:Buffer.alloc(80*1024,84).toString('base64')},409);
  assert.equal(hash(Buffer.from((await ok(phone,'/evidence/read',{id:evidence.evidenceId})).data,'base64')),sha256);
  assert.equal(hash(Buffer.from((await call('captureEvidenceRead',{id:evidence.evidenceId})).data,'base64')),sha256);
  await denied(other,'/evidence/read',{id:evidence.evidenceId},404);
  result.checks.push('real HTTPS multi-chunk evidence completes once, rejects changed replay, preserves bytes and denies another device; desktop IPC reads the same evidence');

  phase='captures, canonical actions and exact revisions';
  const note={sourceId:'packaged-round-'+runId,text:'Tell maintenance room 204 has a SYNTHETIC leak; dietary room 115 has SYNTHETIC cold soup.',kind:'round',evidenceIds:[evidence.evidenceId],draftChannel:'outlook'};
  const created=await ok(phone,'/captures/create',note);assert.equal(created.actions.length,2);
  const replay=await ok(phone,'/captures/create',note);assert.equal(replay.replayed,true);assert.equal(replay.capture.id,created.capture.id);
  for(const action of created.actions){assert.equal(action.owner,'');assert.equal(action.dueAt,null);assert.equal(action.reviewRequired,true);assert.ok(action.unknownFields.includes('dueAt'));assert.equal(note.text.slice(action.evidence.start,action.evidence.end),action.evidence.text);assert.ok(core.store.get('todo',action.id));}
  assert.deepEqual(created.actions.map(action=>core.store.get('wf_action_meta','todo:'+action.id).location),['Room 204','Room 115']);
  await denied(phone,'/captures/create',{...note,text:note.text+' Changed'},409);
  await denied(other,'/actions/update',{id:created.actions[0].id,revision:created.actions[0].revision,note:'SYNTHETIC review'},404);
  const reviewed=await call('captureActionUpdate',{id:created.actions[0].id,revision:created.actions[0].revision,owner:'SYNTHETIC reviewer',note:'SYNTHETIC desktop review'});
  assert.notEqual(reviewed.revision,created.actions[0].revision);assert.equal(reviewed.reviewRequired,false);
  await denied(phone,'/actions/update',{id:reviewed.id,revision:created.actions[0].revision,note:'SYNTHETIC stale edit'},409);
  const updated=await ok(phone,'/actions/update',{id:reviewed.id,revision:reviewed.revision,note:'SYNTHETIC phone review'});
  assert.equal((await call('captureList')).actions.find(action=>action.id===updated.id).revision,updated.revision);
  assert.ok(!(await ok(other,'/actions')).captures.some(capture=>capture.id===created.capture.id));
  result.checks.push('phone and desktop share one canonical review queue, exact source spans and unknown deadlines; replay, actor isolation and stale revision gates hold');

  phase='internal drafts';
  const draft=created.drafts[0];assert.equal(draft.status,'draft');assert.equal(draft.channel,'outlook');assert.equal(draft.recipient,'');
  const saved=await ok(phone,'/drafts/save',{id:draft.id,captureId:created.capture.id,revision:draft.revision,channel:'outlook',body:'SYNTHETIC reviewed internal draft. Unknown facts require review.'});
  await ipcDenied('captureDraftSave',{id:saved.id,captureId:created.capture.id,revision:draft.revision,channel:'outlook',body:'SYNTHETIC stale draft'},'REVIEW_CHANGED');
  const secondDraft=await call('captureDraftSave',{captureId:created.capture.id,channel:'whatsapp',body:'SYNTHETIC reviewed internal WhatsApp draft. Nothing sent.'});
  assert.equal(secondDraft.status,'draft');assert.equal((await call('captureList')).drafts.find(row=>row.id===saved.id).body,saved.body);
  result.checks.push('Outlook and WhatsApp drafts persist internally across both transports; stale draft revisions fail and no external dispatch is called');

  phase='source-scoped reminders and controls';
  await call('settings',{autoReminders:true});
  const reminder=await ok(phone,'/captures/create',{sourceId:'packaged-reminder-'+runId,text:'SYNTHETIC confidential follow-up note '+runId,kind:'reminder',dueAt:Date.now()-1000});
  const notice=(await ok(phone,'/notifications')).notifications.find(row=>row.actionId===reminder.actions[0].id);assert.ok(notice);assert.equal(notice.status,'pending');
  assert.ok(!(await ok(other,'/notifications')).notifications.some(row=>row.id===notice.id));
  await denied(other,'/notifications/ack',{id:notice.id},404);
  await call('settings',{autoReminders:false});assert.ok(!(await ok(phone,'/notifications')).notifications.some(row=>row.id===notice.id));
  await call('settings',{autoReminders:true});
  const reminderTodo=core.store.get('todo',reminder.actions[0].id);
  await call('todoSave',{...reminderTodo,reminderEnabled:false});
  assert.ok(!(await ok(phone,'/notifications')).notifications.some(row=>row.id===notice.id));
  await call('todoSave',{...core.store.get('todo',reminderTodo.id),reminderEnabled:true});
  result.checks.push('real due reminders retain their source device and honor global and per-action disable controls');

  phase='selected PC chat continuation and revocation';
  const selectedChat=await call('createChat'),privateChat=await call('createChat');
  await call('send',{chatId:selectedChat.id,prompt:'/calc 2+3'});
  await call('send',{chatId:privateChat.id,prompt:'/calc 90+1'});
  await denied(phone,'/conversations/history',{sessionId:'shared_'+privateChat.id},403);
  await call('companionGrant',{id:phone.id,sharedChats:[selectedChat.id]});
  assert.ok((await ok(phone,'/conversations')).conversations.some(row=>row.sessionId==='shared_'+selectedChat.id));
  const chatRequest={sessionId:'shared_'+selectedChat.id,prompt:'/calc 4+5',requestId:'packaged-chat-'+runId,requireLocal:true,requireHipaa:true};
  assert.match((await ok(phone,'/chat/send',chatRequest)).reply,/9/);
  const history=await ok(phone,'/conversations/history',{sessionId:chatRequest.sessionId});assert.equal(history.messages.length,4);assert.ok(history.messages.every(row=>row.id));
  assert.match((await ok(phone,'/chat/send',chatRequest)).reply,/9/);
  assert.equal((await call('chat',{id:selectedChat.id})).messages.length,4);
  await call('companionGrant',{id:phone.id,sharedChats:[]});
  await denied(phone,'/chat/send',chatRequest,403);await denied(phone,'/conversations/history',{sessionId:chatRequest.sessionId},403);
  result.checks.push('only explicitly selected PC chats continue over actual HTTPS; replay adds no duplicate messages and removing the grant denies history and cached replies');

  phase='full lock versus restricted generic metadata';
  await call('setPassphrase',{passphrase:phrase});ownedLock=true;
  await call('lock');await ipcDenied('captureList',{},'LOCKED');
  await denied(phone,'/actions',undefined,423);await denied(phone,'/notifications',undefined,423);
  await denied(other,'/notifications',undefined,423,{key:other.notificationKey});
  await denied(phone,'/actions',undefined,403,{key:phone.notificationKey});
  const generic=await ok(phone,'/notifications',undefined,{key:phone.notificationKey});
  assert.ok(generic.notifications.some(row=>row.id===notice.id));
  for(const row of generic.notifications)assert.deepEqual(Object.keys(row).sort(),['actionId','created','id','status','type']);
  assert.equal(JSON.stringify(generic).includes(runId),false);
  assert.equal((await ok(phone,'/notifications/ack',{id:notice.id},{key:phone.notificationKey})).status,'acknowledged');
  await ipcDenied('unlock',{passphrase:'SYNTHETIC wrong companion passphrase'},'UNLOCK');
  await call('unlock',{passphrase:phrase});
  assert.equal(core.store.get('todo',reminder.actions[0].id).status,'pending');
  await call('companionRevoke',{id:phone.id});
  await denied(phone,'/actions',undefined,401);await denied(phone,'/notifications',undefined,401,{key:phone.notificationKey});
  result.checks.push('ordinary desktop lock denies full access; separate opted-in metadata credential remains content-blind, acknowledgment does not complete work, and revocation removes both credentials');

  phase='packaged Notes navigation and form save';
  await bounded(win.webContents.executeJavaScript('document.querySelector(\'#sidebar [data-view="captures"]\').click()'));
  const uiText='SYNTHETIC packaged UI note '+runId;
  for(let attempt=0;attempt<100;attempt++){
   if(await bounded(win.webContents.executeJavaScript('document.querySelector(\'#content h1\')?.textContent===\'Notes and rounds\' && !!document.querySelector(\'#capture-form\')')))break;
   if(attempt===99)throw Error('Notes navigation timeout');await sleep(100);
  }
  await bounded(win.webContents.executeJavaScript('document.querySelector(\'#capture-form [name="text"]\').value='+JSON.stringify(uiText)+';document.querySelector(\'#capture-form button[type="submit"]\').click()'));
  let uiCapture;
  for(let attempt=0;attempt<100;attempt++){
   uiCapture=(await call('captureList')).captures.find(row=>row.text===uiText);
   if(uiCapture&&await bounded(win.webContents.executeJavaScript('document.querySelector(\'#content\').textContent.includes('+JSON.stringify(uiText)+')')))break;
   if(attempt===99)throw Error('Notes form save timeout');await sleep(100);
  }
  assert.equal(uiCapture.actor.kind,'desktop');
  assert.ok(await bounded(win.webContents.executeJavaScript('document.querySelector(\'#content\').textContent.includes('+JSON.stringify(uiText)+')')));
  result.checks.push('packaged Notes and rounds route and actual form submit save an independent desktop note through protected IPC');

  phase='disabled gateway and durable synthetic checkpoint';
  await call('companionSave',{enabled:false,host:'127.0.0.1',port});await sleep(100);
  assert.equal((await call('companionStatus')).state,'off');
  await assert.rejects(request(other,'/actions'));
  const rows=[{kind:'capture_note',id:created.capture.id},{kind:'capture_evidence',id:evidence.evidenceId},{kind:'capture_draft',id:saved.id},{kind:'capture_draft',id:secondDraft.id},...created.actions.flatMap(action=>[{kind:'todo',id:action.id},{kind:'wf_action_meta',id:'todo:'+action.id}])];
  for(const row of rows)row.value=core.store.get(row.kind,row.id);
  core.store.put('validation','shared-companion-checkpoint',{rows});
  result.checks.push('disabling the real gateway closes its listener; shared encrypted records are retained for the next process restart');
  result.passed=true;
 }catch(_){error=Object.assign(Error('Packaged companion acceptance failed at '+phase),{code:'VALIDATION_COMPANION'});}
 finally{
  // Only this isolated acceptance's pairings and lock are changed. Never use a test unlock.
  cleaning=true;
  try{
   if(core.locked&&ownedLock)await call('unlock',{passphrase:phrase});
   for(const id of ids)await call('companionRevoke',{id});
   if(initialGateway)await call('companionSave',{...initialGateway.settings,enabled:false});
   if(initialReminders!==undefined)await call('settings',{autoReminders:initialReminders});
   if(ownedLock){if(originalLock)core.store.put('secret','applock',originalLock);else core.store.delete('secret','applock');}
  }catch(_){error=Object.assign(Error('Packaged companion acceptance cleanup failed'),{code:'VALIDATION_COMPANION'});result.passed=false;}
 }
 if(error)throw error;
 return result;
}
module.exports={run};
