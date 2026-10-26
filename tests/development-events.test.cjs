'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http'),express=require('express');
const {boundary}=require('../server/development-policy.cjs');
const {DevelopmentEvents,MAX_SUBSCRIBERS,MAX_PENDING_BYTES}=require('../server/development-events.cjs');

async function fixture(t,sessionMs=3600000) {
  const app=express(),events=new DevelopmentEvents(),token='synthetic-development-session-token';
  app.enable('case sensitive routing');app.use(boundary({token},{sessionMs}));
  app.get('/api/events',(req,res)=>events.add(req,res));
  const server=http.createServer(app),requests=new Set();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(async()=>{
    events.close();for(const req of requests)req.destroy();server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  });
  const open=(route,{method='GET',headers={}}={})=>new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:server.address().port,path:route,method,agent:false,headers:{host:'127.0.0.1:3000',...headers}},res=>resolve({req,res}));
    requests.add(req);req.on('error',reject);req.on('close',()=>requests.delete(req));req.end();
  });
  const session=async()=>{
    const {res}=await open('/api/session',{method:'POST',headers:{authorization:'Bearer '+token,'x-private-ai':'development'}});
    let body='';for await(const chunk of res)body+=chunk;return JSON.parse(body).session;
  };
  const subscribe=async id=>{
    const {req,res}=await open('/api/events?session='+id);
    let data='';res.on('data',chunk=>data+=chunk);
    const closed=new Promise(resolve=>{res.once('close',resolve);res.on('error',()=>{});});
    return {req,res,closed,data:()=>data};
  };
  return {events,session,subscribe};
}
async function within(promise) {
  let timer;
  try {return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Subscriber did not disconnect')),3000);})]);}
  finally {clearTimeout(timer);}
}

test('SSE subscriber closes on real session expiry without requiring another event',async t=>{
  const f=await fixture(t,500),id=await f.session(),client=await f.subscribe(id);
  assert.equal(client.res.statusCode,200);
  await within(client.closed);assert.equal(f.events.clients.size,0);
  f.events.emit({type:'must-not-arrive'});assert.doesNotMatch(client.data(),/must-not-arrive/);
  const denied=await f.subscribe(id);assert.equal(denied.res.statusCode,401);
});

test('session eviction immediately closes its existing HTTP subscriber',async t=>{
  const f=await fixture(t),id=await f.session(),client=await f.subscribe(id);
  for(let i=0;i<20;i++)await f.session();
  await within(client.closed);assert.equal(f.events.clients.size,0);
  f.events.emit({type:'after-eviction'});assert.doesNotMatch(client.data(),/after-eviction/);
  const denied=await f.subscribe(id);assert.equal(denied.res.statusCode,401);
});

test('concurrent SSE subscribers are capped and a disconnected slot can be reused',async t=>{
  const f=await fixture(t),id=await f.session(),clients=[];
  for(let i=0;i<MAX_SUBSCRIBERS;i++)clients.push(await f.subscribe(id));
  assert.equal(f.events.clients.size,MAX_SUBSCRIBERS);
  const rejected=await f.subscribe(id);assert.equal(rejected.res.statusCode,429);
  const last=clients.pop();last.req.destroy();await within(last.closed);
  // A short HTTP roundtrip also lets the server observe the TCP close.
  await f.session();
  const accepted=await f.subscribe(id);assert.equal(accepted.res.statusCode,200);
  assert.equal(f.events.clients.size,MAX_SUBSCRIBERS);
});

test('a stalled HTTP reader is disconnected at the fixed pending-write budget',async t=>{
  const f=await fixture(t),id=await f.session(),client=await f.subscribe(id);
  client.res.pause();
  const event={type:'synthetic-backlog',delta:'x'.repeat(16*1024)};
  // Synchronous writes fill Node's pending queue before the socket can drain.
  for(let i=0;i<MAX_PENDING_BYTES/(16*1024)+5;i++)f.events.emit(event);
  assert.equal(f.events.clients.size,0);
  client.res.resume();await within(client.closed);
  const replacement=await f.subscribe(id);assert.equal(replacement.res.statusCode,200);
});
