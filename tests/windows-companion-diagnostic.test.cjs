"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {assertHTTP}=require('../source/windows-companion-validation.cjs');
const {fixture}=require('./helpers.cjs'),{Core}=require('../source/core.cjs'),{Store}=require('../source/database.cjs');
const {CompanionGateway}=require('../source/companion-gateway.cjs');
const {testCertificate,freePort,request}=require('./companion-fixture.cjs');

test('acceptance HTTP failure identifies only a fixed operation, status and approved code',()=>{
 const privateData='SYNTHETIC secret prompt, pairing key, filename and resident identifier';
 assert.throws(()=>assertHTTP('/chat/send',{status:409,body:{error:{code:'COMPANION_PAUSED',message:privateData},reply:privateData}},200),error=>{
  assert.equal(error.code,'VALIDATION_HTTP');
  assert.equal(error.message,'HTTP chat_send status 409; code COMPANION_PAUSED; expected 200');
  assert.equal(error.message.includes(privateData),false);return true;
 });
 assert.throws(()=>assertHTTP('/chat/send?key='+privateData,{status:privateData,body:{error:{code:privateData,message:privateData}}},privateData),error=>{
  assert.equal(error.message,'HTTP unknown status unknown; code UNKNOWN; expected unknown');return true;
 });
 assert.throws(()=>assertHTTP('/conversations/history',{status:200,body:{error:{code:'constructor'}}},403),error=>{
  assert.equal(error.message,'HTTP conversation_history status 200; code UNKNOWN; expected 403');return true;
 });
 assert.doesNotThrow(()=>assertHTTP('/status',{status:200,body:{sensitive:privateData}},200));
});

test('selected PC chat and intentional pause retain their policy across clean Core SQLite restarts',async t=>{
 const cleanup=[],f=fixture({after:fn=>cleanup.push(fn)});let core=f.core,gateway;
 t.after(()=>{gateway?.close();if(core.store.db)core.close();for(const fn of cleanup)fn();});
 core.deleteKey();core.saveSettings({processingMode:'local-only',allowCloud:false,hipaa:true,workerPaused:false});
 const start=async()=>{
  core.resources.memory=()=>8*1024**3;
  gateway=new CompanionGateway(core,{certificateFactory:testCertificate});
  await gateway.configure({enabled:true,host:'127.0.0.1',port:await freePort()});
 };
 const restart=async()=>{
  await gateway.configure({enabled:false});gateway.close();gateway=null;core.close();
  core=new Core({root:f.root,store:new Store(path.join(f.root,'privateai.db'),f.cipher),machine:'synthetic-machine',client:{generate:async()=>assert.fail('No cloud request may occur')}});
  assert.equal(core.stability.safe,false,'A completed clean shutdown must retain a clean health marker');
  await start();
 };
 await start();
 const phone=gateway.pair({name:'Synthetic selected chat restart',scopes:{chat:true}});
 const selected=core.createChat(),privateChat=core.createChat();
 await core.send({chatId:selected.id,prompt:'/calc 2+3'});await core.send({chatId:privateChat.id,prompt:'/calc 90+1'});
 gateway.grant({id:phone.id,sharedChats:[selected.id]});
 const data={sessionId:'shared_'+selected.id,prompt:'/calc 4+5',requestId:'synthetic-restart-chat',requireLocal:true,requireHipaa:true};
 const sent=await request(gateway,phone,'/chat/send',data);assertHTTP('/chat/send',sent,200);assert.match(sent.body.reply,/9/);
 assert.equal(core.chat(selected.id).messages.length,4);
 await restart();
 assert.equal(core.settings().workerPaused,false);
 const listed=await request(gateway,phone,'/conversations');assertHTTP('/conversations',listed,200);
 assert.ok(listed.body.conversations.some(row=>row.sessionId===data.sessionId));
 assert.ok(!listed.body.conversations.some(row=>row.sessionId==='shared_'+privateChat.id));
 const replay=await request(gateway,phone,'/chat/send',data);assertHTTP('/chat/send',replay,200);assert.deepEqual(replay.body,sent.body);
 assert.equal(core.chat(selected.id).messages.length,4);
 core.saveSettings({workerPaused:true});await restart();
 assert.equal(core.settings().workerPaused,true,'Restart must not silently resume a persisted pause');
 const paused=await request(gateway,phone,'/chat/send',data);assertHTTP('/chat/send',paused,409);assert.equal(paused.body.error.code,'COMPANION_PAUSED');
 assert.equal(core.chat(selected.id).messages.length,4);
 assertHTTP('/conversations/history',await request(gateway,phone,'/conversations/history',{sessionId:data.sessionId}),200);
 core.saveSettings({workerPaused:false});
 assertHTTP('/chat/send',await request(gateway,phone,'/chat/send',{...data,requestId:'synthetic-after-reviewed-resume'}),200);
 assert.equal(core.chat(selected.id).messages.length,6);
 gateway.grant({id:phone.id,sharedChats:[]});
 assertHTTP('/chat/send',await request(gateway,phone,'/chat/send',data),403);
 assertHTTP('/conversations/history',await request(gateway,phone,'/conversations/history',{sessionId:data.sessionId}),403);
 assert.equal(core.chat(selected.id).messages.length,6);assert.equal(f.calls.length,0);
});
