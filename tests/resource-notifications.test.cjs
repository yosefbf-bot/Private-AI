'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {Resources}=require('../source/resources.cjs');
const GIB=2**30,turn=()=>new Promise(r=>setImmediate(r));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function fixture(){let ram=8*GIB;const settings={workerPaused:false,ramRecoverySeconds:0},core={settings:()=>settings,emit(){},router:{}};const resources=new Resources(core,{memory:()=>ram});core.resources=resources;return {resources,settings,core,setRAM:v=>ram=v};}
test('ownership and pause wait without polling; notifications and cancellation leave no waiters',async t=>{
 const {resources:r,settings}=fixture(),gate=deferred(),ctrl=new AbortController();t.after(()=>{ctrl.abort();gate.resolve();});
 const held=r.task('foreground',()=>r.withAI(()=>gate.promise));await turn();
 const waiting=r.task('foreground',()=>r.withAI(()=>assert.fail('cancelled work ran')),{signal:ctrl.signal});
 const rejected=assert.rejects(waiting,{code:'CANCELLED'});await turn();
 assert.equal(r.waiters.size,1);assert.equal(r.ramTimer,null);ctrl.abort();await rejected;gate.resolve();await held;
 settings.workerPaused=true;const pausedCtrl=new AbortController();t.after(()=>pausedCtrl.abort());
 let ran=false;const paused=r.task('background',()=>{ran=true;},{signal:pausedCtrl.signal});await turn();
 assert.equal(r.waiters.size,1);assert.equal(r.ramTimer,null);settings.workerPaused=false;r.notify();await paused;
 assert.equal(ran,true);assert.equal(r.waiters.size,0);assert.equal(r.ramTimer,null);
});
test('operation RAM admission never holds AI while waiting for foreground or memory',async t=>{
 const {resources:r,setRAM}=fixture();setRAM(1.2*GIB);const ctrl=new AbortController();t.after(()=>ctrl.abort());
 let ran=false;const bg=r.task('background',()=>r.withAI(()=>{ran=true;},{minimum:1.5*GIB}),{signal:ctrl.signal});
 const done=bg.catch(e=>{if(!ctrl.signal.aborted)throw e;});await turn();
 assert.equal(ran,false);assert.equal(r.ai,null);assert.ok(r.ramTimer);
 await r.task('foreground',()=>r.withAI(()=>assert.equal(ran,false)));
 setRAM(3*GIB);r.notify();await done;assert.equal(ran,true);assert.equal(r.waiters.size,0);assert.equal(r.ramTimer,null);
});
test('RAM waiters share one timer and cancellation removes it',async t=>{
 const {resources:r,setRAM}=fixture();setRAM(.5*GIB);const ctrl=new AbortController();t.after(()=>ctrl.abort());
 const wait=()=>r.context.run({kind:'background',signal:ctrl.signal},()=>r.checkpoint());
 const a=wait(),b=wait(),checks=[assert.rejects(a,{code:'CANCELLED'}),assert.rejects(b,{code:'CANCELLED'})];
 await turn();assert.equal(r.waiters.size,2);const timer=r.ramTimer;assert.ok(timer);assert.equal(r.ramWaiters,2);
 ctrl.abort();await Promise.all(checks);assert.equal(r.ramTimer,null);assert.equal(r.waiters.size,0);
});
test('revision and abort rechecks prevent a notification-registration race',async()=>{
 const {resources:r}=fixture(),revision=r.revision;r.notify();await r.waitForChange(revision);
 const ctrl=new AbortController();ctrl.abort();await assert.rejects(r.waitForChange(r.revision,{signal:ctrl.signal}),{code:'CANCELLED'});
 assert.equal(r.waiters.size,0);
});
test('speech admission can reclaim idle weights and rechecks memory and foreground after exit',async t=>{
 const {resources:r,core,setRAM}=fixture(),exit=deferred(),ctrl=new AbortController();t.after(()=>{ctrl.abort();exit.resolve();});
 setRAM(1.2*GIB);core.router.local={child:{},busy:false,stop(){this.child=null;},waitStopped:()=>exit.promise};
 let ran=false;const bg=r.task('background',()=>r.withAI(()=>{ran=true;},{minimum:1.5*GIB,releaseLocal:true,excludeBrowser:true}),{signal:ctrl.signal});
 const done=bg.catch(e=>{if(!ctrl.signal.aborted)throw e;});await turn();
 const fgGate=deferred();t.after(()=>fgGate.resolve());const fg=r.task('foreground',()=>r.withAI(()=>fgGate.promise));
 setRAM(3*GIB);exit.resolve();await turn();assert.equal(ran,false);fgGate.resolve();await fg;await done;assert.equal(ran,true);
});
test('browser release wakes local admission without an ownership timer',async t=>{
 const {resources:r}=fixture(),owner={},ctrl=new AbortController();t.after(()=>{ctrl.abort();r.releaseBrowser(owner);});
 await r.reserveBrowser(owner,'synthetic');let ran=false;
 const pending=r.task('foreground',()=>r.withAI(()=>{ran=true;},{excludeBrowser:true}),{signal:ctrl.signal});
 const done=pending.catch(e=>{if(!ctrl.signal.aborted)throw e;});await turn();assert.equal(ran,false);assert.equal(r.ramTimer,null);
 r.releaseBrowser(owner);await done;assert.equal(ran,true);
});

test('RAM loss or foreground arrival during awaited preparation cannot launch background speech',async t=>{
 for(const pressure of [true,false]){
  const {resources:r,setRAM}=fixture(),prepared=deferred(),ctrl=new AbortController();t.after(()=>{ctrl.abort();prepared.resolve();});let preparing,ran=false;
  const entered=new Promise(resolve=>preparing=resolve);
  const bg=r.task('background',()=>r.withAI(()=>{ran=true;},{minimum:1.5*GIB,prepare:()=>{preparing();return prepared.promise;}}),{signal:ctrl.signal});
  const done=bg.catch(e=>{if(!ctrl.signal.aborted)throw e;});await entered;
  const foreground=deferred();t.after(()=>foreground.resolve());let fg;
  if(pressure)setRAM(1.2*GIB);else fg=r.task('foreground',()=>r.withAI(()=>foreground.promise));
  prepared.resolve();await turn();assert.equal(ran,false);if(pressure)assert.equal(r.ai,null);
  setRAM(3*GIB);r.notify();foreground.resolve();await fg;await done;assert.equal(ran,true);
 }
});
test('real settings and recovery pause publish resource changes',t=>{
 const {core}=require('./helpers.cjs').fixture(t);let revision=core.resources.revision;
 core.saveSettings({workerPaused:true});assert.ok(core.resources.revision>revision);revision=core.resources.revision;
 core.stability.pause();assert.ok(core.resources.revision>revision);
});
