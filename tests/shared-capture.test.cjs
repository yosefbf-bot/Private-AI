'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs'),captures=require('../source/capture-workflows.cjs');
const {CompanionGateway}=require('../source/companion-gateway.cjs');
const {testCertificate,freePort,request}=require('./companion-fixture.cjs');
const {MessagingBridge}=require('../source/messaging.cjs');
const actor={kind:'companion',id:'synthetic-device'},other={kind:'companion',id:'other-device'};
const input={sourceId:'synthetic-note',text:'Tell maintenance room 204 has a leak; dietary room 115 has cold soup.',kind:'round'};
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2dr8AAAAASUVORK5CYII=','base64');
function evidence(core,who=actor){const data={uploadId:crypto.randomUUID(),index:0,total:1,name:'Synthetic evidence.png',mime:'image/png',bytes:image.length,sha256:crypto.createHash('sha256').update(image).digest('hex'),data:image.toString('base64')};return {data,result:captures.writeEvidence(core,data,who)};}
async function setup(t){const f=fixture(t);f.core.deleteKey();f.core.saveSettings({workerPaused:false,processingMode:'local-only'});f.core.resources.memory=()=>8*1024**3;const gateway=new CompanionGateway(f.core,{certificateFactory:testCertificate});t.after(()=>gateway.close());await gateway.configure({enabled:true,host:'127.0.0.1',port:await freePort()});const pairing=gateway.pair({name:'Synthetic workflow phone',scopes:{chat:true,workflow:true,notifications:true}});return {...f,gateway,pairing};}
test('captures commit canonical review todos once, preserving exact source locations and unknown deadlines',t=>{
 const {core,calls}=fixture(t);core.deleteKey();const created=captures.create(core,input,actor),replay=captures.create(core,input,actor);
 assert.equal(created.actions.length,2);assert.equal(core.store.count('todo'),2);assert.equal(replay.replayed,true);assert.deepEqual(replay.actions,created.actions);
 for(const a of created.actions){assert.equal(a.reviewRequired,true);assert.equal(a.owner,'');assert.equal(a.dueAt,null);assert.ok(a.unknownFields.includes('dueAt'));assert.equal(input.text.slice(a.evidence.start,a.evidence.end),a.evidence.text);}
 const metas=created.capture.actionIds.map(id=>core.store.get('wf_action_meta','todo:'+id));assert.deepEqual(metas.map(m=>m.location),['Room 204','Room 115']);
 assert.equal(calls.length,0);assert.equal(core.store.count('snf_alert'),0);assert.equal(core.store.count('exec_dept_task'),0);
 assert.throws(()=>captures.create(core,{...input,text:'Changed'},actor),{code:'CHANGED'});
 assert.equal(captures.list(core,other).captures.length,0);assert.equal(captures.list(core).captures.length,1);
});
test('stale edits, cross-device updates and draft exports cannot silently change clinical or external state',t=>{
 const {core}=fixture(t),created=captures.create(core,{...input,draftChannel:'outlook'},actor),a=created.actions[0];
 assert.equal(created.drafts[0].status,'draft');assert.equal(created.drafts[0].recipient,'');assert.equal(created.drafts[0].channel,'outlook');
 assert.throws(()=>captures.update(core,{id:a.id,revision:a.revision,note:'Review'},other),{code:'NOT_FOUND'});
 assert.throws(()=>captures.update(core,{id:a.id,revision:a.revision,complete:true},actor),{code:'INVALID'});
 const updated=captures.update(core,{id:a.id,revision:a.revision,owner:'Synthetic reviewer',dueAt:Date.now()+60000,note:'Explicit review'},actor);
 assert.equal(updated.reviewRequired,false);assert.equal(core.store.get('todo',a.id).owner,'Synthetic reviewer');
 assert.throws(()=>captures.update(core,{id:a.id,revision:a.revision,note:'Stale'},actor),{code:'REVIEW_CHANGED'});
 const saved=captures.saveDraft(core,{id:created.drafts[0].id,revision:1,captureId:created.capture.id,channel:'outlook',body:'Synthetic reviewed draft'},actor);
 assert.equal(saved.revision,2);assert.throws(()=>captures.saveDraft(core,{...saved},actor),{code:'INVALID'});
 assert.equal(core.store.count('snf_alert'),0);
});
test('bounded evidence verifies bytes, survives replay and stays encrypted and scoped',t=>{
 const {core,root}=fixture(t),{data,result}=evidence(core);
 assert.equal(result.complete,true);assert.deepEqual(captures.writeEvidence(core,data,actor),result);
 assert.throws(()=>captures.writeEvidence(core,{...data,data:Buffer.from('different').toString('base64')},actor),{code:'CHANGED'});
 assert.equal(captures.readEvidence(core,{id:result.evidenceId},actor).data,data.data);
 assert.throws(()=>captures.readEvidence(core,{id:result.evidenceId},other),{code:'NOT_FOUND'});
 assert.throws(()=>captures.create(core,{...input,evidenceIds:[result.evidenceId]},other),{code:'INVALID'});
 for(const patch of [{bytes:5*1024**2+1},{name:'../private.txt'},{mime:'text/html'},{index:2},{data:'bad!'}])assert.throws(()=>captures.writeEvidence(core,{...data,...patch},actor));
 for(const file of fs.readdirSync(root).filter(f=>/\.db(?:-wal)?$/.test(f)))assert.equal(fs.readFileSync(path.join(root,file)).includes(image),false);
});
test('capture evidence and source links remain while pending, then obey retention after closure',t=>{
 const {core}=fixture(t),{result}=evidence(core),created=captures.create(core,{...input,evidenceIds:[result.evidenceId]},actor);
 core.store.cleanup(100,Date.now()+101*86400000);
 assert.equal(captures.list(core,actor).actions.length,2);assert.ok(core.store.get('capture_evidence',result.evidenceId));
 for(const a of captures.list(core,actor).actions)captures.update(core,{id:a.id,revision:a.revision,note:'Synthetic completion',complete:true},actor);
 core.store.cleanup(100,Date.now()+101*86400000);
 assert.equal(core.store.count('capture_note'),0);assert.equal(core.store.count('capture_evidence'),0);assert.equal(core.store.count('wf_action_meta'),0);
});
test('due notifications survive PC emission and only acknowledge explicit delivery',t=>{
 const {core}=fixture(t),created=captures.create(core,{sourceId:'reminder',text:'Remind me to contact the physician.',kind:'reminder',dueAt:Date.now()-1000},actor);
 core.checkReminders();assert.equal(core.store.get('todo',created.actions[0].id).notified,true);
 const notices=captures.notifications(core,actor);assert.equal(notices.notifications.length,1);assert.equal(notices.notifications[0].status,'pending');
 assert.equal(captures.notifications(core,other).notifications.length,0);assert.throws(()=>captures.acknowledge(core,{id:notices.notifications[0].id},other),{code:'NOT_FOUND'});
 captures.acknowledge(core,{id:notices.notifications[0].id},actor);assert.equal(captures.notifications(core,actor).notifications[0].status,'acknowledged');
 const a=captures.list(core,actor).actions[0];captures.update(core,{id:a.id,revision:a.revision,dueAt:Date.now()-2000,note:'Confirmed new deadline'},actor);
 assert.equal(captures.notifications(core,actor).notifications.filter(n=>n.status==='pending').length,1);
});
test('real HTTPS capture/evidence/actions/drafts/notifications endpoints enforce scopes, revisions and lock',async t=>{
 const {core,gateway,pairing}=await setup(t),readOnly=gateway.pair({name:'Status only',scopes:{}});
 const endpoints=['/captures/create','/actions/update','/drafts/save','/evidence/write','/evidence/read','/notifications/ack'];
 for(const endpoint of endpoints)assert.equal((await request(gateway,readOnly,endpoint,{})).status,403);
 assert.equal((await request(gateway,readOnly,'/actions')).status,403);assert.equal((await request(gateway,readOnly,'/notifications')).status,403);
 const created=await request(gateway,pairing,'/captures/create',{...input,dueAt:Date.now()-1000});assert.equal(created.status,200,JSON.stringify(created.body));
 const replay=await request(gateway,pairing,'/captures/create',{...input,dueAt:created.body.capture.dueAt});assert.equal(replay.body.replayed,true);
 const a=created.body.actions[0];assert.equal((await request(gateway,pairing,'/actions/update',{id:a.id,revision:a.revision,note:'Reviewed',owner:'Synthetic'})).status,200);
 assert.equal((await request(gateway,pairing,'/drafts/save',{captureId:created.body.capture.id,channel:'whatsapp',body:'Synthetic draft'})).status,200);
 const uploaded=await request(gateway,pairing,'/evidence/write',evidence(core).data);assert.equal(uploaded.status,200);
 assert.equal((await request(gateway,pairing,'/evidence/read',{id:uploaded.body.evidenceId})).body.data,image.toString('base64'));
 const notices=await request(gateway,pairing,'/notifications');assert.equal(notices.body.notifications.length,2);
 assert.equal((await request(gateway,pairing,'/notifications/ack',{id:notices.body.notifications[0].id})).body.status,'acknowledged');
 const otherPhone=gateway.pair({name:'Other workflow phone',scopes:{workflow:true}});assert.equal((await request(gateway,otherPhone,'/actions')).body.captures.length,0);
 assert.equal((await request(gateway,otherPhone,'/evidence/read',{id:uploaded.body.evidenceId})).status,404);
 core.lock();assert.equal((await request(gateway,pairing,'/actions')).status,423);
});
test('explicit PC chat grants allow continuation and revoke both history and response replay',async t=>{
 const {core,gateway,pairing}=await setup(t),chat=core.createChat(),privateChat=core.createChat();
 await core.send({chatId:chat.id,prompt:'/calc 2+3'});await core.send({chatId:privateChat.id,prompt:'/calc 99+1'});
 assert.equal((await request(gateway,pairing,'/conversations')).body.conversations.length,0);
 assert.equal((await request(gateway,pairing,'/conversations/history',{sessionId:'shared_'+privateChat.id})).status,403);
 gateway.grant({id:pairing.id,sharedChats:[chat.id]});
 const list=await request(gateway,pairing,'/conversations');assert.equal(list.body.conversations[0].sessionId,'shared_'+chat.id);
 const data={sessionId:'shared_'+chat.id,prompt:'/calc 4+5',requestId:'shared-request'};
 assert.equal((await request(gateway,pairing,'/chat/send',data)).body.reply,'4+5 = 9');assert.equal(core.chat(chat.id).messages.length,4);
 const history=await request(gateway,pairing,'/conversations/history',{sessionId:data.sessionId});assert.equal(history.body.messages.length,4);assert.ok(history.body.messages.every(m=>m.id));
 gateway.grant({id:pairing.id,sharedChats:[]});assert.equal((await request(gateway,pairing,'/chat/send',data)).status,403);assert.equal((await request(gateway,pairing,'/conversations/history',{sessionId:data.sessionId})).status,403);
});
test('WhatsApp selected sender captures notes and tracks reminders without read-all granting execution',async t=>{
 const {core}=fixture(t);const bridge=new MessagingBridge(core);t.after(()=>bridge.close());
 const target={adapter:'web',groupId:'12345678@g.us',groupName:'Synthetic approved group',mode:'read-write',senders:['12345678@c.us'],backgroundReplies:true};
 bridge.verified.add(JSON.stringify(['web',target.groupId,target.groupName]));bridge.save({enabled:true,warningAccepted:true,allowTasks:true,conversations:[target]});
 const messages=[],adapter={send:async(_target,body)=>messages.push(body)};
 const m={id:'synthetic-message',sender:'12345678@c.us',time:Date.now()},tgt={...bridge.settings(),...target,generation:bridge.generation};
 const reply=await bridge.captureCommand(adapter,tgt,m,'/remind 2026-01-01T09:00:00Z Call the pharmacy.');assert.match(reply,/Saved note/);assert.equal(core.store.count('todo'),1);
 await bridge.captureCommand(adapter,tgt,m,'/remind 2026-01-01T09:00:00Z Call the pharmacy.');assert.equal(core.store.count('todo'),1);
 await bridge.reminders(adapter);assert.equal(messages.length,0);await bridge.reminders(adapter);assert.equal(bridge.outbox().length,1);bridge.adapters.web=adapter;await bridge.approve(bridge.outbox()[0].id);assert.equal(messages.length,1);await bridge.reminders(adapter);assert.equal(messages.length,1);
 assert.equal(core.store.list('capture_delivery')[0].status,'sent');
 bridge.save({disableAllWriting:true});assert.equal(await bridge.captureCommand(adapter,tgt,m,'Hello'),null);await assert.rejects(bridge.captureCommand(adapter,tgt,{...m,id:'another'},'/note New note'),{code:'POLICY'});
});
test('phone local-only constraint prevents cloud inference even when desktop routing allows it',async t=>{
 const {core,calls,gateway,pairing}=await setup(t);core.saveKey('sk-synthetic-NOT-A-REAL-KEY');core.saveSettings({processingMode:'cloud-first',allowCloud:true,approved:true,customInstructions:'Private global instructions must not be included.'});
 let localInstructions;
 core.router.local={validate:()=>0,modelName:()=> 'Synthetic local model',status:()=>({state:'ready'}),close(){},generate:async(s,messages,options)=>{assert.equal(s.allowCloud,false);assert.equal(s.processingMode,'local-only');localInstructions=options.instructions;return {text:JSON.stringify({answer:'Synthetic local response',evidence:[],uncertainties:['Unknown']}),localTokens:3};}};
 const answer=await request(gateway,pairing,'/chat/send',{prompt:'Review this supplied text.',requestId:'local-only-request',requireLocal:true,requireHipaa:true});
 assert.equal(answer.status,200,JSON.stringify(answer.body));assert.equal(answer.body.processing.provider,'local');assert.equal(calls.length,0);assert.doesNotMatch(localInstructions,/Private global instructions/);
 assert.equal((await request(gateway,pairing,'/chat/send',{prompt:'Review this supplied text.',requestId:'local-only-request',requireLocal:false})).status,409);
 core.saveSettings({hipaa:false,publicModeConfirmed:true});assert.equal((await request(gateway,pairing,'/chat/send',{prompt:'A new question',requireHipaa:true})).status,403);
});
test('notification-only keys are revokable, content-blind and cannot bypass the general lock',async t=>{
 const {core,gateway,pairing}=await setup(t),body={sourceId:'notification-synthetic',text:'Synthetic private clinical observation.',kind:'reminder',dueAt:Date.now()-1000};
 await request(gateway,pairing,'/captures/create',body);
 const restricted={...pairing,key:pairing.notificationKey};
 for(const endpoint of ['/status','/tasks','/alerts','/actions','/conversations'])assert.equal((await request(gateway,restricted,endpoint)).status,403);
 for(const endpoint of ['/chat/send','/captures/create','/evidence/read','/actions/update','/drafts/save'])assert.equal((await request(gateway,restricted,endpoint,{})).status,403);
 const notices=await request(gateway,restricted,'/notifications');assert.equal(notices.status,200);assert.equal(notices.body.notifications.length,1);assert.doesNotMatch(JSON.stringify(notices.body),/clinical|observation|resident|text|title/);
 core.lock();assert.equal((await request(gateway,restricted,'/notifications')).status,423);assert.equal((await request(gateway,pairing,'/notifications')).status,423);core.unlock();
 const granted=gateway.pair({name:'Background notification phone',scopes:{workflow:true,notifications:true},notificationsWhileLocked:true});
 await request(gateway,granted,'/captures/create',{...body,sourceId:'notification-background'});const bg={...granted,key:granted.notificationKey};
 core.lock();const metadata=await request(gateway,bg,'/notifications');assert.equal(metadata.status,200,JSON.stringify(metadata.body));assert.equal(metadata.body.notifications.length,1);
 assert.throws(()=>core.summary(),{code:'LOCKED'});assert.equal((await request(gateway,granted,'/actions')).status,423);
 assert.equal((await request(gateway,bg,'/notifications/ack',{id:metadata.body.notifications[0].id})).body.status,'acknowledged');
 core.unlock();gateway.revoke(granted.id);assert.equal((await request(gateway,bg,'/notifications')).status,401);
});


test('targeted source navigation reads old canonical capture within actor and Demo scope',async t=>{
 const {core}=fixture(t),selected=captures.create(core,input,actor);
 for(let i=0;i<105;i++)captures.create(core,{sourceId:'synthetic-navigation-'+i,text:'Synthetic newer note'},actor);
 assert.equal(captures.list(core,actor).captures.some(c=>c.id===selected.capture.id),false);
 const read=captures.list(core,actor,{captureId:selected.capture.id});assert.equal(read.captures.length,1);assert.equal(read.captures[0].id,selected.capture.id);
 assert.throws(()=>captures.list(core,other,{captureId:selected.capture.id}),{code:'NOT_FOUND'});assert.throws(()=>captures.list(core,undefined,{captureId:'../outside'}),{code:'INVALID'});
 await require('../source/snf/demo.cjs').forCore(core).set({mode:'demo'});assert.throws(()=>captures.list(core,undefined,{captureId:selected.capture.id}),{code:'NOT_FOUND'});
 core.lock();assert.throws(()=>captures.list(core,undefined,{captureId:selected.capture.id}),{code:'LOCKED'});
});
