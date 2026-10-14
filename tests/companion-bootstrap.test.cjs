'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict'), crypto=require('node:crypto'), https=require('node:https'), fs=require('node:fs'), path=require('node:path');
const {fixture}=require('./helpers.cjs');
const {CompanionGateway}=require('../source/companion-gateway.cjs');
const {createCertificate,describeCertificate}=require('../source/companion-tls.cjs');
const {testCertificate,freePort,request}=require('./companion-fixture.cjs');

async function setup(t) {
  const f=fixture(t), clock={monotonic:0,wall:Date.now()}; f.core.deleteKey();
  const gateway=new CompanionGateway(f.core,{certificateFactory:testCertificate,monotonicNow:()=>clock.monotonic,wallNow:()=>clock.wall}); t.after(()=>gateway.close());
  await gateway.configure({enabled:true,host:'127.0.0.1',port:await freePort()});
  const trust=describeCertificate(f.core.store.get('secret','companion_tls'),'127.0.0.1');
  return {...f,gateway,clock,trust};
}
function invite(gateway,input={}) { return gateway.invite({name:'Synthetic QR phone',...input}); }
function body(invitation) { const url=new URL(invitation.pairingUrl); return {version:2,id:invitation.id,token:url.searchParams.get('token')}; }
function exchange(gateway,trust,invitation) { return request(gateway,trust,'/pair/exchange',body(invitation)); }
async function partialExchange(gateway,trust,invitation,mutate) {
  const s=gateway.settings(), ca=new crypto.X509Certificate(Buffer.from(trust.certificate,'base64')).toString();
  let entered; const received=new Promise(resolve=>entered=resolve);
  gateway.server.once('request',req=>req.once('data',entered));
  const data=body(invitation), prefix=JSON.stringify(data).slice(0,-2);
  let req;
  const answer=new Promise((resolve,reject)=>{
    req=https.request({host:s.host,port:s.port,path:'/mobile/api/v1/pair/exchange',method:'POST',ca,agent:false,headers:{'Content-Type':'application/json'}},res=>{
      let raw='';res.on('data',chunk=>raw+=chunk);res.on('end',()=>{try{resolve({status:res.statusCode,body:JSON.parse(raw)});}catch(e){reject(e);}});
    }); req.on('error',reject); req.write(prefix);
  });
  await received; await mutate(); req.end('"}'); return answer;
}

test('v2 invite is local, short-lived, permission-bound, hash-only and creates no device before exchange',async t=>{
  const {gateway,clock,core,root,trust,calls}=await setup(t), chat=core.createChat();
  const scopes={chat:true,workflow:true,notifications:true}, sharedChats=[chat.id];
  const invitation=invite(gateway,{scopes,sharedChats,notificationsWhileLocked:true}), data=body(invitation), url=new URL(invitation.pairingUrl);
  assert.equal(url.protocol,'privateai:');assert.equal(url.host,'pair');assert.equal(url.pathname,'/v2');
  assert.deepEqual([...url.searchParams.keys()],['version','host','port','fingerprint','id','token','expires']);
  assert.equal(url.searchParams.get('version'),'2');assert.equal(url.searchParams.get('host'),'127.0.0.1');assert.equal(url.searchParams.get('fingerprint'),trust.fingerprint);
  assert.match(data.token,/^[A-Za-z0-9_-]{43}$/);assert.equal(invitation.expires,clock.wall+180000);assert.equal(gateway.devices().length,0);
  assert.doesNotMatch(JSON.stringify([...gateway.invites.values()]),new RegExp(data.token));assert.equal(invitation.key,undefined);
  scopes.alerts=true;sharedChats.length=0;invitation.scopes.tasks=true;invitation.sharedChats.length=0;
  const result=await exchange(gateway,trust,invitation); assert.equal(result.status,200);
  assert.equal(result.body.version,2);assert.equal(result.body.scopes.alerts,false);assert.equal(result.body.scopes.tasks,false);assert.equal(result.body.scopes.workflow,true);assert.deepEqual(result.body.sharedChats,[chat.id]);
  assert.equal(result.body.notificationsWhileLocked,true);assert.equal(typeof result.body.expires,'string');assert.equal(result.body.fingerprint,trust.fingerprint);
  assert.match(result.body.key,/^[A-Za-z0-9_-]{43}$/);assert.match(result.body.notificationKey,/^[A-Za-z0-9_-]{43}$/);assert.notEqual(result.body.key,result.body.notificationKey);
  assert.equal(core.store.get('companion_device',result.body.id).key,undefined);
  for(const name of fs.readdirSync(root).filter(name=>/\.db(?:-wal)?$/.test(name))) {
    const bytes=fs.readFileSync(path.join(root,name));for(const secret of [data.token,result.body.key,result.body.notificationKey])assert.equal(bytes.includes(Buffer.from(secret)),false);
  }
  assert.doesNotMatch(JSON.stringify([gateway.status(),gateway.inviteStatus(invitation.id)]),new RegExp(data.token+'|'+result.body.key));
  assert.equal(calls.length,0);
});

test('exchange remains pending until actual full-key HTTPS status confirms connection',async t=>{
  const {gateway,trust}=await setup(t), invitation=invite(gateway,{scopes:{notifications:true}});
  assert.deepEqual(gateway.inviteStatus(invitation.id),{id:invitation.id,state:'pending',expires:invitation.expires,awaitingConnection:false});
  const paired=(await exchange(gateway,trust,invitation)).body;
  assert.equal(gateway.inviteStatus(invitation.id).awaitingConnection,true);assert.equal(gateway.inviteStatus(invitation.id).deviceId,undefined);
  assert.equal((await request(gateway,{...paired,key:paired.notificationKey},'/status')).status,403);
  assert.equal(gateway.inviteStatus(invitation.id).state,'pending');
  assert.equal((await request(gateway,paired,'/status')).status,200);
  assert.deepEqual(gateway.inviteStatus(invitation.id),{id:invitation.id,state:'paired',expires:invitation.expires,awaitingConnection:false,deviceId:paired.id});
  gateway.revoke(paired.id);assert.equal(gateway.inviteStatus(invitation.id).state,'cancelled');assert.equal(gateway.inviteStatus(invitation.id).deviceId,undefined);
});

test('concurrent real HTTPS exchanges issue exactly one device and reject all later replay',async t=>{
  const {gateway,trust}=await setup(t), invitation=invite(gateway);
  const results=await Promise.all([exchange(gateway,trust,invitation),exchange(gateway,trust,invitation)]);
  assert.deepEqual(results.map(result=>result.status).sort(),[200,401]);assert.equal(gateway.devices().length,1);
  assert.equal((await exchange(gateway,trust,invitation)).status,401);assert.equal(gateway.devices().length,1);
});

test('monotonic expiry is exact and independent of owner wall-clock changes',async t=>{
  const {gateway,trust,clock}=await setup(t), expired=invite(gateway);
  clock.wall-=86400000;clock.monotonic=180000;
  assert.equal((await exchange(gateway,trust,expired)).status,401);assert.equal(gateway.inviteStatus(expired.id).state,'expired');assert.equal(gateway.devices().length,0);
  const fresh=invite(gateway);clock.wall+=365*86400000;clock.monotonic+=179999;
  assert.equal((await exchange(gateway,trust,fresh)).status,200);
});

test('Cancel and dialog cleanup invalidate tokens without revoking issued durable devices',async t=>{
  const {gateway,trust}=await setup(t), cancelled=invite(gateway);
  assert.equal(gateway.cancelInvite(cancelled.id).state,'cancelled');assert.equal((await exchange(gateway,trust,cancelled)).status,401);
  const invitation=invite(gateway), paired=(await exchange(gateway,trust,invitation)).body;
  assert.equal((await request(gateway,paired,'/status')).status,200);
  gateway.cancelInvite(invitation.id);assert.equal(gateway.inviteStatus(invitation.id).state,'cancelled');
  assert.equal((await request(gateway,paired,'/status')).status,200);assert.equal(gateway.devices().length,1);
});

test('consumed QR expiry cannot undo an issued device or manufacture a connected result',async t=>{
  const {gateway,trust,clock}=await setup(t), invitation=invite(gateway), paired=(await exchange(gateway,trust,invitation)).body;
  clock.monotonic=180001;
  assert.equal(gateway.inviteStatus(invitation.id).state,'pending');assert.equal(gateway.inviteStatus(invitation.id).awaitingConnection,true);
  assert.equal((await exchange(gateway,trust,invitation)).status,401);assert.equal((await request(gateway,paired,'/status')).status,200);
  assert.equal(gateway.inviteStatus(invitation.id).state,'paired');
});

test('bounded invitations and terminal receipts expire without reviving cancelled codes',async t=>{
  const {gateway,clock}=await setup(t), initial=[invite(gateway),invite(gateway),invite(gateway)];
  assert.throws(()=>invite(gateway),{code:'LIMIT'});gateway.cancelInvite(initial[0].id);assert.doesNotThrow(()=>invite(gateway));
  clock.monotonic=180000;
  for(let i=0;i<40;i++)gateway.cancelInvite(invite(gateway).id);
  assert.ok(gateway.invites.size<=32);clock.monotonic+=600000;
  assert.equal(gateway.inviteStatus(initial[0].id).state,'cancelled');assert.equal(gateway.invites.size,0);
});

test('desktop lock hook invalidates invitation even after unlock, while existing notification-only polling survives',async t=>{
  const {gateway,trust,core}=await setup(t), existing=gateway.pair({name:'Existing synthetic phone',scopes:{notifications:true},notificationsWhileLocked:true}), invitation=invite(gateway);
  core.lock();gateway.invalidateInvites();
  assert.equal((await exchange(gateway,trust,invitation)).status,423);
  assert.equal((await request(gateway,{...existing,key:existing.notificationKey},'/notifications')).status,200);
  assert.throws(()=>gateway.invite({name:'Locked'}),{code:'LOCKED'});core.unlock();
  assert.equal(gateway.inviteStatus(invitation.id).state,'cancelled');assert.equal((await exchange(gateway,trust,invitation)).status,401);
  assert.equal((await request(gateway,existing,'/status')).status,200);
});

test('lock after request body starts prevents issuance and cannot be bypassed by later unlock',async t=>{
  const {gateway,trust,core}=await setup(t), invitation=invite(gateway);
  const result=await partialExchange(gateway,trust,invitation,()=>{core.lock();gateway.invalidateInvites();});
  assert.equal(result.status,423);assert.equal(gateway.devices().length,0);core.unlock();
  assert.equal((await exchange(gateway,trust,invitation)).status,401);
});

test('stop, reconfiguration and process restart invalidate only bootstrap while durable manual devices remain',async t=>{
  const {gateway,trust,core}=await setup(t), manual=gateway.pair({name:'Manual compatibility'}), beforeStop=invite(gateway);
  gateway.stop();await gateway.start();assert.equal((await exchange(gateway,trust,beforeStop)).status,401);
  assert.equal((await request(gateway,manual,'/status')).status,200);
  const beforeConfigure=invite(gateway);await gateway.configure({enabled:true});assert.equal((await exchange(gateway,trust,beforeConfigure)).status,401);
  const beforeRestart=invite(gateway);gateway.close();
  const restarted=new CompanionGateway(core,{certificateFactory:testCertificate});t.after(()=>restarted.close());await restarted.start();
  assert.equal((await exchange(restarted,trust,beforeRestart)).status,401);assert.equal((await request(restarted,manual,'/status')).status,200);
});

test('generation change after body await fails closed even if the server is still listening',async t=>{
  const {gateway,trust}=await setup(t), invitation=invite(gateway);
  const result=await partialExchange(gateway,trust,invitation,()=>{gateway.generation++;});
  assert.equal(result.status,401);assert.equal(gateway.devices().length,0);
});

test('certificate or address changes invalidate the invitation before any credential is issued',async t=>{
  const {gateway,trust,core}=await setup(t), original=core.store.get('secret','companion_tls'), changed=invite(gateway);
  core.store.put('secret','companion_tls',await createCertificate('127.0.0.1'));
  assert.equal((await exchange(gateway,trust,changed)).status,409);assert.equal(gateway.inviteStatus(changed.id).state,'cancelled');assert.equal(gateway.devices().length,0);
  core.store.put('secret','companion_tls',original);
  const moved=invite(gateway), saved=gateway.settings();core.store.put('companion','settings',{...saved,port:saved.port+1});
  // The actual listening socket stays on the old address, so exercise the synchronous post-body boundary.
  assert.throws(()=>gateway.exchangeInvite(body(moved),gateway.generation),{code:'CHANGED'});assert.equal(gateway.devices().length,0);
  core.store.put('companion','settings',saved);
});

test('wrong certificate fails the real TLS handshake before a pairing request reaches the endpoint',async t=>{
  const {gateway}=await setup(t), invitation=invite(gateway), wrong=describeCertificate(await createCertificate('127.0.0.1'),'127.0.0.1');let requests=0;
  gateway.server.on('request',()=>requests++);
  await assert.rejects(exchange(gateway,wrong,invitation),/certificate|self.signed/i);
  assert.equal(requests,0);assert.equal(gateway.devices().length,0);assert.equal(gateway.inviteStatus(invitation.id).state,'pending');
});

test('certificate errors and unknown internal exceptions return no sensitive input or credential details',async t=>{
  const {gateway,trust,core}=await setup(t), invitation=invite(gateway), original=core.store.get('secret','companion_tls');
  core.store.put('secret','companion_tls',{...original,privateKey:'invalid synthetic private key'});
  const result=await exchange(gateway,trust,invitation);assert.equal(result.status,503);assert.equal(result.body.error.code,'COMPANION_TLS');assert.equal(gateway.devices().length,0);
  assert.doesNotMatch(JSON.stringify(result.body),new RegExp(body(invitation).token+'|invalid synthetic private key'));
});

test('owner grants and scope overrides are validated; unknown endpoints never gain unauthenticated access',async t=>{
  const {gateway,trust,core}=await setup(t);
  for(const input of [null,{name:' '},{name:'x',scopes:{admin:true}},{name:'x',scopes:{chat:'yes'}},{name:'x',notificationsWhileLocked:true},{name:'x',sharedChats:['missing']},{name:'x',key:'override'}])assert.throws(()=>gateway.invite(input),{code:'INVALID'});
  const invitation=invite(gateway), original=body(invitation);
  for(const data of [{...original,scopes:{alerts:true}},{...original,name:'Override'},{...original,version:3},{...original,id:'bad'},{...original,token:'short'}])assert.equal((await request(gateway,trust,'/pair/exchange',data)).status,400);
  for(const endpoint of ['/status','/pair/exchange','/pair/exchange/other','/tasks'])assert.equal((await request(gateway,trust,endpoint)).status,401);
  assert.equal(core.store.count('companion_device'),0);assert.equal((await exchange(gateway,trust,invitation)).status,200);
});

test('tiny JSON limit, browser origins and query parameters apply to the unauthenticated route',async t=>{
  const {gateway,trust}=await setup(t), invitation=invite(gateway), data=body(invitation);
  assert.equal((await request(gateway,trust,'/pair/exchange',data,{headers:{Origin:'https://untrusted.example'}})).status,403);
  assert.equal((await request(gateway,trust,'/pair/exchange',data,{headers:{'Sec-Fetch-Site':'cross-site'}})).status,403);
  assert.equal((await request(gateway,trust,'/pair/exchange?token=secret',data)).status,403);
  assert.equal((await request(gateway,trust,'/pair/exchange',data,{servername:'',headers:{Host:'wrong.example'}})).status,403);
  assert.equal((await request(gateway,trust,'/pair/exchange','{invalid')).status,400);
  assert.equal((await request(gateway,trust,'/pair/exchange','[]')).status,400);
  assert.equal((await request(gateway,trust,'/pair/exchange',JSON.stringify({...data,padding:'x'.repeat(2200)}))).status,413);
  assert.equal((await request(gateway,trust,'/pair/exchange',data,{headers:{'Content-Encoding':'gzip'}})).status,415);
  assert.equal(gateway.devices().length,0);
});

test('preauthentication throttling is bounded and expires using monotonic time',async t=>{
  const {gateway,trust,clock}=await setup(t), invitation=invite(gateway), bad={...body(invitation),token:'x'.repeat(43)};
  for(let i=0;i<12;i++)assert.equal((await request(gateway,trust,'/pair/exchange',bad)).status,401);
  assert.equal((await exchange(gateway,trust,invitation)).status,429);clock.monotonic+=60001;
  assert.equal((await exchange(gateway,trust,invitation)).status,200);
  gateway.inviteRate.clear();for(let i=0;i<64;i++)gateway.throttleInvite('synthetic-'+i);
  assert.throws(()=>gateway.throttleInvite('over-capacity'),{status:429});assert.equal(gateway.inviteRate.size,64);
});

test('shared-chat eligibility and device capacity are rechecked after receiving the body',async t=>{
  const {gateway,trust,core}=await setup(t), chat=core.createChat(), invitation=invite(gateway,{sharedChats:[chat.id]});
  const result=await partialExchange(gateway,trust,invitation,()=>core.store.put('chat',chat.id,{...core.chat(chat.id),archived:true}));
  assert.equal(result.status,400);assert.equal(gateway.devices().length,0);
  const capacity=invite(gateway);
  const filled=await partialExchange(gateway,trust,capacity,()=>{for(let i=0;i<10;i++)gateway.pair({name:'Synthetic capacity '+i});});
  assert.equal(filled.status,413);assert.equal(gateway.devices().length,10);assert.throws(()=>invite(gateway),{code:'LIMIT'});
});

test('genuine SQLite commit failure rolls back the device and leaves the token unconsumed',async t=>{
  const {gateway,trust,core}=await setup(t), invitation=invite(gateway), execute=core.store.db.exec.bind(core.store.db);
  core.store.db.exec=sql=>{if(sql==='COMMIT')throw new Error('Synthetic sensitive commit detail '+body(invitation).token);return execute(sql);};
  const failed=await exchange(gateway,trust,invitation);assert.equal(failed.status,503);assert.equal(core.store.count('companion_device'),0);assert.equal(core.store.db.isTransaction,false);
  assert.equal(gateway.inviteStatus(invitation.id).awaitingConnection,false);assert.doesNotMatch(JSON.stringify(failed.body),new RegExp(body(invitation).token+'|Synthetic sensitive commit detail'));
  core.store.db.exec=execute;assert.equal((await exchange(gateway,trust,invitation)).status,200);assert.equal(core.store.count('companion_device'),1);
});

test('an outer asynchronous transaction cannot publish a credential before its eventual commit',async t=>{
  const {gateway,trust,core}=await setup(t), invitation=invite(gateway);let release;
  const pending=core.store.transaction(()=>new Promise(resolve=>release=resolve));assert.equal(core.store.db.isTransaction,true);
  const result=await exchange(gateway,trust,invitation);assert.equal(result.status,409);assert.equal(core.store.count('companion_device'),0);
  release();await pending;assert.equal((await exchange(gateway,trust,invitation)).status,200);
});

test('lost exchange response does not recreate credentials; explicit owner recovery remains possible',async t=>{
  const {gateway,trust,core}=await setup(t), invitation=invite(gateway), exchangeOriginal=gateway.exchangeInvite.bind(gateway);let issued;
  gateway.server.once('request',(_req,res)=>{gateway.exchangeInvite=(data,generation)=>{issued=exchangeOriginal(data,generation);res.destroy();return issued;};});
  await assert.rejects(exchange(gateway,trust,invitation),/socket|ECONNRESET/i);gateway.exchangeInvite=exchangeOriginal;
  assert.equal(core.store.count('companion_device'),1);assert.equal(gateway.inviteStatus(invitation.id).awaitingConnection,true);
  assert.equal((await exchange(gateway,trust,invitation)).status,401);assert.equal(core.store.count('companion_device'),1);
  gateway.cancelInvite(invitation.id);assert.equal(core.store.count('companion_device'),1);gateway.revoke(issued.id);assert.equal(core.store.count('companion_device'),0);
});
