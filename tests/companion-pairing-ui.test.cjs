'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve};};
async function fixture(api) {
  const {createCompanionPairingUI}=await import('../source/ui/companion-pairing.mjs');
  const modal=deferred(),draws=[];
  const ctx={fillRect:(...v)=>draws.push(v),clearRect:()=>draws.push('clear')};
  const elements={'pairing-qr':{getContext:()=>ctx},'pairing-link':{value:'synthetic invitation',textContent:'synthetic invitation'},'pairing-manual':{},'pairing-progress':{},'pairing-countdown':{}};
  let tick,clock=0,cleared=0,forms=0;
  const ui=createCompanionPairingUI({api,form:()=>{forms++;return modal.promise;},esc:v=>v,document:{getElementById:id=>elements[id]},now:()=>clock,setTimer:fn=>{tick=fn;return 1;},clearTimer:()=>cleared++});
  return {ui,elements,draws,modal,tick:()=>tick(),clock:v=>clock=v,forms:()=>forms,cleared:()=>cleared};
}
function invitation() {
  const id=require('node:crypto').randomUUID(),token=require('node:crypto').randomBytes(32).toString('base64url');
  return {id,expires:Date.now()+180000,pairingUrl:`privateai://pair/v2?version=2&host=127.0.0.1&port=8443&fingerprint=${'a'.repeat(64)}&id=${id}&token=${token}&expires=${Date.now()+180000}`};
}
test('leaving while invitation creation awaits cancels it without rendering its secret',async()=>{
  const pending=deferred(),calls=[];
  const f=await fixture(async(op,data)=>{calls.push([op,data]);return op==='companionInvite'?pending.promise:{};});
  const opened=f.ui.open({name:'Synthetic phone'});f.ui.stop();const invite=invitation();pending.resolve(invite);await opened;
  assert.equal(f.forms(),0);assert.equal(f.draws.length,0);assert.ok(calls.some(([op,data])=>op==='companionInviteCancel'&&data.id===invite.id));
});
test('pending QR is erased when exchange commits, and Connected requires authenticated status',async()=>{
  let status={state:'pending'},calls=[];
  const f=await fixture(async(op,data)=>{calls.push(op);return op==='companionInvite'?invitation():op==='companionInviteStatus'?status:{};});
  const opened=f.ui.open({name:'Synthetic phone'});await new Promise(setImmediate);
  assert.equal(f.forms(),1);assert.ok(f.draws.length>100);assert.match(f.elements['pairing-progress'].textContent||'Waiting',/Waiting/);
  status={state:'pending',awaitingConnection:true};await f.tick();
  assert.equal(f.elements['pairing-link'].value,'');assert.equal(f.elements['pairing-link'].textContent,'');assert.equal(f.elements['pairing-qr'].hidden,true);assert.doesNotMatch(f.elements['pairing-progress'].textContent,/^Connected/);
  status={state:'paired'};await f.tick();assert.match(f.elements['pairing-progress'].textContent,/^Connected/);
  f.modal.resolve(null);await opened;assert.ok(calls.includes('companionInviteCancel'));assert.ok(!calls.includes('companionRevoke'));
});
test('navigation during an in-flight status cannot restore a QR or show stale success',async()=>{
  const response=deferred();let count=0;
  const f=await fixture(async(op)=>op==='companionInvite'?invitation():op==='companionInviteStatus'?(++count===1?{state:'pending'}:response.promise):{});
  const opened=f.ui.open({});await new Promise(setImmediate);const checking=f.tick();f.ui.stop();response.resolve({state:'paired'});await checking;
  assert.equal(f.elements['pairing-link'].value,'');assert.equal(f.elements['pairing-link'].textContent,'');assert.equal(f.elements['pairing-qr'].hidden,true);assert.doesNotMatch(f.elements['pairing-progress'].textContent||'',/^Connected/);
  f.modal.resolve(null);await opened;
});
test('monotonic expiry erases credentials and gives recovery guidance without a device revoke',async()=>{
  const calls=[];const f=await fixture(async op=>{calls.push(op);return op==='companionInvite'?invitation():{state:'pending'};});
  const opened=f.ui.open({});await new Promise(setImmediate);f.clock(180001);await f.tick();
  assert.equal(f.elements['pairing-link'].value,'');assert.equal(f.elements['pairing-link'].textContent,'');assert.equal(f.elements['pairing-qr'].hidden,true);assert.match(f.elements['pairing-progress'].textContent,/expired.*revoke/s);assert.ok(!calls.includes('companionRevoke'));
  f.modal.resolve(null);await opened;
});


test('consumed invitation can confirm after the original QR deadline without false expiry',async()=>{
 let status={state:'pending',awaitingConnection:true};const calls=[];
 const f=await fixture(async op=>{calls.push(op);return op==='companionInvite'?invitation():status;});
 const opened=f.ui.open({});await new Promise(setImmediate);f.clock(180001);await f.tick();
 assert.match(f.elements['pairing-progress'].textContent,/Waiting for the phone/);assert.ok(!calls.includes('companionInviteCancel'));
 status={state:'paired'};await f.tick();assert.match(f.elements['pairing-progress'].textContent,/^Connected/);
 f.modal.resolve(null);await opened;
});

test('delayed first poll accepts authoritative Connected even beyond QR expiry',async()=>{
 let status={state:'pending'};
 const f=await fixture(async op=>op==='companionInvite'?invitation():status);
 const opened=f.ui.open({});await new Promise(setImmediate);status={state:'paired'};f.clock(180001);await f.tick();
 assert.match(f.elements['pairing-progress'].textContent,/^Connected/);assert.equal(f.elements['pairing-link'].textContent,'');
 f.modal.resolve(null);await opened;
});
