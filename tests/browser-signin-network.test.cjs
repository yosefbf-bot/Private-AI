'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {protectedNetwork}=require('../source/browser-login-network.cjs');
function harness({method='GET',url='https://login.example.com/login',status=200,location,main=true,guard=()=>{}}={}){
 const requests=[],navigations=[],fulfilled=[],frame={};let aborted=false;
 const page={mainFrame:()=>frame,goto:async value=>navigations.push(value)};
 const net=protectedNetwork({recipe:{origins:['https://login.example.com','https://report.example.com'],autoLogin:{formActions:['https://login.example.com/submit']}},check:guard,page:()=>page});
 const route={request:()=>({url:()=>url,method:()=>method,isNavigationRequest:()=>main,frame:()=>frame}),fetch:async options=>{requests.push(options);return {status:()=>status,headers:()=>({...(location?{location}:{})})};},fulfill:async options=>fulfilled.push(options),abort:async()=>{aborted=true;}};
 return {net,route,requests,navigations,fulfilled,aborted:()=>aborted};
}
test('protected requests never allow automatic redirect forwarding',async()=>{
 const h=harness({method:'POST',url:'https://login.example.com/submit',status:302,location:'https://report.example.com/report'});await h.net.handler(h.route);
 assert.equal(h.requests[0].maxRedirects,0);assert.equal(h.fulfilled[0].status,200);assert.deepEqual(h.navigations,[]);await h.net.settle();assert.deepEqual(h.navigations,['https://report.example.com/report']);
});
for(const config of [
 {method:'POST',url:'https://report.example.com/other'},
 {method:'POST',url:'https://login.example.com/submit?token=hidden'},
 {method:'GET',url:'https://unapproved.invalid/'},
 {method:'PUT',url:'https://login.example.com/submit'}
])test('unapproved credential dispatch is blocked before fetch '+config.method+' '+new URL(config.url).pathname,async()=>{
 const h=harness(config);await h.net.handler(h.route);assert.equal(h.requests.length,0);assert.equal(h.aborted(),true);await assert.rejects(h.net.settle(),{code:'POLICY'});
});
for(const config of [
 {method:'POST',url:'https://login.example.com/submit',status:307,location:'https://login.example.com/elsewhere'},
 {status:302,location:'https://unapproved.invalid/'},
 {status:302,location:'http://login.example.com/login'},
 {status:302,location:'https://user:secret@login.example.com/login'},
 {status:302,location:'/login',main:false}
])test('unsafe redirect is never supplied to browser '+JSON.stringify(config),async()=>{
 const h=harness(config);await h.net.handler(h.route);assert.equal(h.fulfilled.length,0);assert.equal(h.navigations.length,0);assert.equal(h.aborted(),true);await assert.rejects(h.net.settle(),{code:'POLICY'});
});
test('revocation after response fetch prevents fulfillment or redirect',async()=>{
 let checks=0;const h=harness({guard:()=>{if(++checks===2)throw require('../source/security.cjs').fail('BROWSER_REVIEW');}});await h.net.handler(h.route);assert.equal(h.fulfilled.length,0);await assert.rejects(h.net.settle(),{code:'BROWSER_REVIEW'});
});
test('site rate limit remains a specific safe failure',async()=>{
 const h=harness({status:429});await h.net.handler(h.route);await assert.rejects(h.net.settle(),{code:'REPORT_RATE_LIMIT'});
});
test('submit-handler method rewrite cannot send a GET navigation before the reviewed redirect',async()=>{
 const h=harness({method:'GET',url:'https://login.example.com/other?user=encoded'});h.net.expectSubmit();await h.net.handler(h.route);assert.equal(h.requests.length,0);await assert.rejects(h.net.settle(),{code:'POLICY'});
});
test('credentials in any request URL are rejected before dispatch',async()=>{
 const h=harness({url:'https://login.example.com/image?value=synthetic%20secret'});h.net.protect({username:'synthetic-owner',password:'synthetic secret'});await h.net.handler(h.route);assert.equal(h.requests.length,0);await assert.rejects(h.net.settle(),{code:'POLICY'});
});
test('a latched unsafe request blocks every later request before fetch',async()=>{
 const h=harness({status:429});await h.net.handler(h.route);await h.net.handler(h.route);assert.equal(h.requests.length,1);
});

test('redirect settlement waits for an in-flight navigation fulfillment before advancing',async()=>{
 const h=harness({status:302,location:'/report'});let release,entered;
 const reached=new Promise(resolve=>{entered=resolve;}),blocked=new Promise(resolve=>{release=resolve;});
 h.route.fulfill=async options=>{h.fulfilled.push(options);entered();await blocked;};
 const handling=h.net.handler(h.route);await reached;
 let settled=false;const settling=h.net.settle().then(()=>{settled=true;});
 try{await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false,'Cannot finish while the redirect handler is still publishing its destination');}
 finally{release();await handling;await settling;}
 assert.deepEqual(h.navigations,['https://login.example.com/report']);
});

test('settlement also drains a navigation started while an earlier handler is finishing',async()=>{
 const h=harness();let releaseFirst,releaseSecond,entered,calls=0;
 const reached=new Promise(resolve=>{entered=resolve;}),firstHeld=new Promise(resolve=>{releaseFirst=resolve;}),secondHeld=new Promise(resolve=>{releaseSecond=resolve;});
 h.route.fetch=async()=>{if(++calls===1)return {status:()=>200,headers:()=>({})};await secondHeld;return {status:()=>302,headers:()=>({location:'/report'})};};
 h.route.fulfill=async options=>{if(options.response){entered();await firstHeld;}};
 const first=h.net.handler(h.route);await reached;
 let settled=false;const settling=h.net.settle().then(()=>{settled=true;}),second=h.net.handler(h.route);
 releaseFirst();await first;
 try{await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false,'A navigation started during settlement must also finish');}
 finally{releaseSecond();await second;await settling;}
 assert.deepEqual(h.navigations,['https://login.example.com/report']);
});

for(const status of [200,302,429])test(`fetched response ${status} is disposed after fulfillment or rejection`,async()=>{
 const h=harness({status,location:'/report'}),events=[],fetch=h.route.fetch;
 h.route.fetch=async(...args)=>({...await fetch(...args),dispose:async()=>events.push('dispose')});
 h.route.fulfill=async()=>{events.push('fulfill');await new Promise(setImmediate);events.push('consumed');};
 await h.net.handler(h.route);assert.deepEqual(events,status===429?['dispose']:['fulfill','consumed','dispose']);
});

test('failed fulfillment still releases the fetched response',async()=>{
 const h=harness(),fetch=h.route.fetch;let disposed=0;
 h.route.fetch=async(...args)=>({...await fetch(...args),dispose:async()=>disposed++});h.route.fulfill=async()=>{throw Error('synthetic');};
 await h.net.handler(h.route);assert.equal(disposed,1);await assert.rejects(h.net.settle(),{code:'POLICY'});
});
