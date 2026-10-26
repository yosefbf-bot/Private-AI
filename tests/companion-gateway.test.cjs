'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
const {CompanionGateway,privateAddress}=require('../source/companion-gateway.cjs');
const {testCertificate,freePort,request}=require('./companion-fixture.cjs');
const {fail}=require('../source/security.cjs');
async function setup(t) {
  const f=fixture(t);f.core.deleteKey();f.core.saveSettings({workerPaused:false,processingMode:'local-only'});f.core.resources.memory=()=>8*1024**3;
  const gateway=new CompanionGateway(f.core,{certificateFactory:testCertificate});t.after(()=>gateway.close());
  await gateway.configure({enabled:true,host:'127.0.0.1',port:await freePort()});
  const pairing=gateway.pair({name:'Synthetic phone',scopes:{chat:true,tasks:true,alerts:true}});
  return {...f,gateway,pairing};
}

test('phone task limit is applied before metadata decryption and repeated status uses encrypted totals',async t=>{
 const {core,cipher,gateway,pairing}=await setup(t);
 for(let i=0;i<130;i++)core.store.put('job','synthetic-'+i,{status:i<10?'queued':'completed',resultText:'PRIVATE_RESULT',title:'Private title'},{updated:i});
 const open=cipher.open.bind(cipher),reads=[];cipher.open=(p,a)=>{reads.push(a);return open(p,a);};
 const result=await request(gateway,pairing,'/tasks');
 assert.equal(result.status,200);assert.equal(result.body.total,130);assert.equal(result.body.truncated,true);assert.equal(result.body.tasks.length,100);
 assert.equal(result.body.tasks[0].id,'synthetic-129');assert.equal(result.body.tasks.at(-1).id,'synthetic-30');
 assert.equal(reads.filter(a=>a.startsWith('meta:job:')).length,100);assert.equal(reads.filter(a=>a.startsWith('job:')).length,0);
 assert.doesNotMatch(JSON.stringify(result.body),/PRIVATE|Private title|hasResultText/);
 assert.equal((await request(gateway,pairing,'/status')).body.activeJobs,10);reads.length=0;
 assert.equal((await request(gateway,pairing,'/status')).body.activeJobs,10);assert.equal(reads.filter(a=>/^(meta:job:|job:)/.test(a)).length,0);
 core.store.put('job','synthetic-0',{status:'completed'});assert.equal((await request(gateway,pairing,'/status')).body.activeJobs,9);
});
test('gateway is off by default, starts without cloud/PCC, and refuses broad/public/absent binds',async t=>{
  const {core,calls}=fixture(t);core.deleteKey();
  const gateway=new CompanionGateway(core,{certificateFactory:()=>assert.fail('Disabled startup must not create a certificate')});
  await gateway.start();assert.equal(gateway.server,null);assert.equal(gateway.status().state,'off');assert.equal(calls.length,0);
  for(const host of ['0.0.0.0','8.8.8.8','example.com','169.254.1.1','::'])await assert.rejects(gateway.configure({enabled:true,host}),{code:'INVALID'});
  assert.equal(privateAddress('100.64.1.5'),true);assert.equal(privateAddress('100.128.1.5'),false);
  const isolated=new CompanionGateway(core,{networkInterfaces:()=>[]});await assert.rejects(isolated.configure({enabled:true,host:'192.168.99.99'}),{code:'COMPANION_BIND'});
});
test('TLS is verified, every endpoint authenticates, and status contains actual/unknown values',async t=>{
  const {gateway,pairing,core}=await setup(t);
  await assert.rejects(request(gateway,{key:pairing.key},'/status'),/self-signed|certificate/i);
  for(const endpoint of ['/status','/tasks','/alerts','/chat/send']) {
    const body=endpoint.endsWith('send')?{prompt:'/calc 1+1'}:undefined;
    assert.equal((await request(gateway,{...pairing,key:''},endpoint,body)).status,401);
    assert.equal((await request(gateway,{...pairing,key:'x'.repeat(43)},endpoint,body)).status,401);
  }
  const status=await request(gateway,pairing,'/status');assert.equal(status.status,200);assert.equal(status.body.status,'ONLINE');
  assert.equal(status.body.loadedModel,null);assert.equal(status.body.gpuUsage,null);assert.equal(status.body.cpuUsage,null);assert.equal(status.body.vramUsedGb,null);assert.equal(status.body.activeJobs,0);assert.equal(status.headers['cache-control'],'no-store');
  core.router.local={status:()=>({state:'ready',model:'Synthetic test model'}),close(){}};
  assert.equal((await request(gateway,pairing,'/status')).body.loadedModel,'Synthetic test model');
});
test('pairing issues independent secrets once, stores encrypted material and persists across gateway restart',async t=>{
  const {gateway,pairing,core,root}=await setup(t);
  const other=gateway.pair({name:'Second synthetic phone'});assert.notEqual(other.key,pairing.key);
  const u=new URL(pairing.pairingUrl);assert.equal(u.protocol,'privateai:');assert.equal(u.searchParams.get('key'),pairing.key);assert.equal(u.searchParams.get('scheme'),'https');assert.equal(u.searchParams.get('fingerprint'),pairing.fingerprint);
  assert.ok(u.searchParams.get('certificate'));assert.doesNotMatch(JSON.stringify(gateway.status()),new RegExp(pairing.key));
  assert.equal(core.store.get('companion_device',pairing.id).key,undefined);
  for(const name of fs.readdirSync(root).filter(x=>/\.db(?:-wal)?$/.test(x)))assert.equal(fs.readFileSync(path.join(root,name)).includes(Buffer.from(pairing.key)),false);
  gateway.stop();await gateway.start();assert.equal((await request(gateway,pairing,'/status')).status,200);
  gateway.revoke(pairing.id);assert.equal((await request(gateway,pairing,'/status')).status,401);assert.equal((await request(gateway,other,'/status')).status,200);
});
test('lock and disable deny all phone endpoints without deleting chats or pairing history',async t=>{
  const {gateway,pairing,core}=await setup(t);
  assert.equal((await request(gateway,pairing,'/chat/send',{prompt:'/calc 12+7'})).body.reply,'12+7 = 19');
  const count=core.store.count('chat');core.lock();
  for(const endpoint of ['/status','/tasks','/alerts','/chat/send'])assert.equal((await request(gateway,pairing,endpoint,endpoint.endsWith('send')?{prompt:'Hello'}:undefined)).status,423);
  core.unlock();await gateway.configure({enabled:false});assert.equal(gateway.status().state,'off');
  await assert.rejects(request(gateway,pairing,'/status'));
  assert.equal(core.store.count('chat'),count);assert.equal(gateway.devices().length,1);
  await gateway.configure({enabled:true});assert.equal((await request(gateway,pairing,'/status')).status,200);
});
test('request scope, origin/host, body/field limits and metadata-only attachment rejection fail explicitly',async t=>{
  const {gateway,pairing}=await setup(t),statusOnly=gateway.pair({name:'Status only',scopes:{}});
  for(const endpoint of ['/tasks','/alerts','/chat/send'])assert.equal((await request(gateway,statusOnly,endpoint,endpoint.endsWith('send')?{prompt:'Hello'}:undefined)).status,403);
  assert.equal((await request(gateway,pairing,'/status',undefined,{headers:{Origin:'https://untrusted.example'}})).status,403);
  await assert.rejects(request(gateway,pairing,'/status',undefined,{headers:{Host:'untrusted.example'}}),{code:'ERR_TLS_CERT_ALTNAME_INVALID'});
  assert.equal((await request(gateway,pairing,'/status',undefined,{servername:'',headers:{Host:'untrusted.example'}})).status,403);
  assert.equal((await request(gateway,pairing,'/status?key=example')).status,403);
  for(const data of [{prompt:'Hello',attachmentName:'test.pdf'},{prompt:'Hello',attachmentType:'application/pdf'}])assert.equal((await request(gateway,pairing,'/chat/send',data)).status,422);
  for(const data of ['{invalid}',{prompt:' '},{prompt:'hello',fileIds:[]},{prompt:'x'.repeat(40001)},{prompt:'hi',sessionId:'../path'},{prompt:'hi',requestId:3}])assert.equal((await request(gateway,pairing,'/chat/send',data)).status,400);
  const huge=JSON.stringify({prompt:'x'.repeat(200000)});assert.equal((await request(gateway,pairing,'/chat/send',huge,{headers:{'Content-Length':Buffer.byteLength(huge)}})).status,413);
  assert.equal((await request(gateway,pairing,'/missing')).status,404);
});
test('task and alert APIs project saved data without identifiers, paths or missing-PCC false alerts',async t=>{
  const {gateway,pairing,core}=await setup(t);
  core.store.put('job','synthetic-job',{id:'synthetic-job',status:'failed',name:'Confidential title',output:'C:\\private\\report.docx'});
  core.store.put('snf_alert','synthetic-clinical',{id:'synthetic-clinical',status:'open',severity:'high',category:'medication',description:'Confidential clinical detail',residentId:'sensitive-id',ruleId:'CLINICAL-TEST'});
  core.store.put('snf_alert','synthetic-feed',{id:'synthetic-feed',status:'open',severity:'high',code:'STALE-census'});
  const tasks=await request(gateway,pairing,'/tasks'),alerts=await request(gateway,pairing,'/alerts');
  assert.equal(tasks.body.tasks[0].status,'failed');assert.equal(alerts.body.total,1);assert.equal(alerts.body.alerts[0].severity,'high');
  assert.equal(alerts.body.monitoringEnabled,false);assert.equal(alerts.body.isSurveillanceComplete,false);
  assert.doesNotMatch(JSON.stringify([tasks.body,alerts.body]),/Confidential|sensitive-id|report\.docx|synthetic-clinical/);
});
test('text chat reuses real Core history per phone/session and never accepts arbitrary desktop chat IDs',async t=>{
  const {gateway,pairing,core}=await setup(t);
  const other=gateway.pair({name:'Another phone'});
  for(const [p,session,prompt] of [[pairing,'a','/calc 1+2'],[pairing,'a','/calc 3+4'],[pairing,'b','/calc 5+6'],[other,'a','/calc 7+8']])assert.equal((await request(gateway,p,'/chat/send',{prompt,sessionId:session})).status,200);
  const sessions=core.store.list('companion_session');assert.equal(sessions.length,3);
  const counts=sessions.map(s=>core.chat(s.chatId).messages.length).sort();assert.deepEqual(counts,[2,2,4]);
  assert.equal((await request(gateway,pairing,'/chat/send',{prompt:'Hello',chatId:sessions[2].chatId})).status,400);
});
test('stable request IDs replay the saved response without another generation and reject different input',async t=>{
  const {gateway,pairing,core}=await setup(t),data={prompt:'/calc 10*2',requestId:'synthetic-request'};
  const first=await request(gateway,pairing,'/chat/send',data),again=await request(gateway,pairing,'/chat/send',data);
  assert.deepEqual(again.body,first.body);assert.equal(core.store.list('chat')[0].messages.length,2);
  assert.equal((await request(gateway,pairing,'/chat/send',{...data,prompt:'/calc 10*3'})).status,409);
});
test('deleted chats cannot be replayed and expired companion records follow existing encrypted retention',async t=>{
  const {gateway,pairing,core}=await setup(t),data={prompt:'/calc 5+5',requestId:'retention-example'};
  assert.equal((await request(gateway,pairing,'/chat/send',data)).status,200);
  const c=core.store.list('chat')[0];core.deleteChat(c.id);
  assert.equal((await request(gateway,pairing,'/chat/send',data)).status,404);
  core.store.cleanup(100,Date.now()+2*86400000);assert.equal(core.store.count('companion_request'),0);
  core.store.cleanup(100,Date.now()+101*86400000);assert.equal(core.store.count('companion_session'),0);
  assert.equal(core.store.count('companion_device'),1);assert.ok(core.store.get('secret','companion_tls'));
});
test('mobile text retains provider rules and reports actual model errors, without desktop tool invocation',async t=>{
  const {gateway,pairing,core,calls}=await setup(t);let invoked=0;
  core.localTools=async()=>{invoked++;return 'must not run';};
  const denied=await request(gateway,pairing,'/chat/send',{prompt:'/report Synthetic'});assert.equal(denied.status,503);assert.equal(invoked,0);
  core.router.local={validate:()=>0,modelName:()=> 'Synthetic test',status:()=>({state:'unloaded'}),close(){},generate:async()=>{throw fail('LOCAL_CPU');}};
  const failure=await request(gateway,pairing,'/chat/send',{prompt:'Reason about these supplied facts'});
  assert.equal(failure.status,503);assert.equal(failure.body.error.code,'LOCAL_CPU');assert.equal(failure.body.reply,undefined);assert.equal(calls.length,0);
  core.saveSettings({workerPaused:true});assert.equal((await request(gateway,pairing,'/chat/send',{prompt:'/calc 1+1'})).body.error.code,'COMPANION_PAUSED');
});
test('revocation during inference cancels and rejects buffered output; busy requests do not fork work',async t=>{
  const {gateway,pairing,core}=await setup(t);let release,started;
  const entered=new Promise(r=>started=r),wait=new Promise(r=>release=r);
  core.router.local={validate:()=>0,modelName:()=> 'Synthetic',status:()=>({state:'unloaded'}),close(){},async generate(){started();await wait;return {text:JSON.stringify({answer:'Buffered synthetic response',evidence:[],uncertainties:['Unknown']}),localTokens:4};}};
  const inFlight=request(gateway,pairing,'/chat/send',{prompt:'Synthetic model request'});await entered;
  assert.equal((await request(gateway,pairing,'/chat/send',{prompt:'/calc 2+2',sessionId:'another'})).status,409);
  gateway.revoke(pairing.id);release();const result=await inFlight;
  assert.equal(result.status,401);assert.equal(result.body.reply,undefined);assert.equal(gateway.active.size,0);
});
test('startup bind failure is contained and failed reconfiguration is disabled',async t=>{
  const {gateway,core}=await setup(t);
  const collision=new CompanionGateway(core,{certificateFactory:testCertificate});t.after(()=>collision.close());
  await assert.rejects(collision.start(),{code:'COMPANION_BIND'});assert.equal(collision.status().state,'error');
  assert.doesNotThrow(()=>core.summary());
  const bad=new CompanionGateway(core,{certificateFactory:async()=>{throw fail('COMPANION_TLS');}});t.after(()=>bad.close());
  gateway.stop();core.store.delete('secret','companion_tls');
  await assert.rejects(bad.configure({enabled:true}),{code:'COMPANION_TLS'});assert.equal(bad.settings().enabled,false);
});

test('gateway propagates compatible and Anthropic truncation from real Core and adapter output',async t=>{
 const {gateway,pairing,core}=await setup(t),{OpenAIClient}=require('../source/api.cjs');
 for(const provider of ['deepseek','anthropic']) {
  core.saveKey(provider==='anthropic'?'sk-ant-synthetic':'sk-synthetic',provider);
  core.saveSettings({provider,model:'synthetic',processingMode:'cloud-first',allowCloud:true,hipaa:false,publicModeConfirmed:true});
  core.client=new OpenAIClient(async()=>new Response(provider==='anthropic'?
    'data: {"type":"content_block_delta","delta":{"text":"Partial companion answer"}}\n\ndata: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}\n\ndata: {"type":"message_stop"}\n\n':
    'data: {"choices":[{"delta":{"content":"Partial companion answer"},"finish_reason":"length"}]}\n\n'));
  const result=await request(gateway,pairing,'/chat/send',{prompt:'Discuss the supplied synthetic design tradeoffs.',sessionId:'truncate-'+provider});
  assert.equal(result.status,200);assert.equal(result.body.reply,'Partial companion answer');assert.equal(result.body.incomplete,true);
 }
});

test('gateway blocks remote-backed Ollama in protected modes and preserves ordinary local inference',async t=>{
 const {gateway,pairing,core}=await setup(t),{OpenAIClient}=require('../source/api.cjs');let inference=0;
 core.saveSettings({provider:'ollama',model:'ordinary',hipaa:true});
 let remote=true,available=true;
 core.client=new OpenAIClient(async url=>{
  if(url.endsWith('/api/tags')) return available?Response.json({models:[{name:'ordinary',...(remote?{remote_host:'synthetic-remote'}:{})}]}):new Response('',{status:404});
  if(url.endsWith('/api/show')) return available?Response.json({details:{family:'synthetic-local'}}):new Response('',{status:404});
  inference++;return new Response('data: {"choices":[{"delta":{"content":"Synthetic local companion answer"},"finish_reason":"stop"}]}\n\n');
 });
 const send=sessionId=>request(gateway,pairing,'/chat/send',{prompt:'Discuss the supplied synthetic design tradeoffs.',sessionId});
 assert.equal((await send('remote-metadata')).body.error.code,'POLICY');assert.equal(inference,0);
 core.saveSettings({model:'synthetic-cloud'});assert.equal((await send('cloud-alias')).body.error.code,'AI_SETUP');assert.equal(inference,0);
 core.saveSettings({model:'ordinary'});remote=false;
 const local=await send('ordinary-local');assert.equal(local.status,200);assert.equal(local.body.reply,'Synthetic local companion answer');
 available=false;const limited=await send('unavailable-metadata');assert.equal(limited.status,200);assert.match(limited.body.processing.policyNotice,/provenance is unverified/);
});
