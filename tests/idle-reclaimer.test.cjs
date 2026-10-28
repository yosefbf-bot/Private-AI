'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {IdleReclaimer,idleEligible}=require('../source/idle-reclaimer.cjs');
const delay=()=>new Promise(r=>setTimeout(r,15));
test('idle eligibility excludes recording, UI activity, jobs, models and browser work',()=>{
 const s={hidden:true,locked:false,recording:false,requests:0,foreground:0,background:false,ai:false,browser:false,modelBusy:false,modelLoading:false,otherWindow:false};
 assert.equal(idleEligible(s),true);assert.equal(idleEligible({...s,hidden:false}),false);assert.equal(idleEligible({...s,hidden:false,locked:true}),true);
 for(const key of ['recording','requests','foreground','background','ai','browser','modelBusy','modelLoading','otherWindow'])assert.equal(idleEligible({...s,[key]:true}),false,key);
 assert.equal(idleEligible({hidden:true}),false,'unknown busy state must not authorize a trim');
});
test('one-shot reclamation cancels on restore, rechecks idleness and never repeats on a timer',async()=>{
 let eligible=true,calls=0;const r=new IdleReclaimer({eligible:()=>eligible,trim:async()=>{calls++;return {trimmed:2};},delayMs:1});
 r.schedule();r.cancel();await delay();assert.equal(calls,0);
 r.schedule();eligible=false;await delay();assert.equal(calls,0);
 eligible=true;r.schedule();r.schedule();await delay();assert.equal(calls,1);assert.equal(r.timer,null);await delay();assert.equal(calls,1);assert.equal(r.last.trimmed,2);
});
test('overlapping requests cannot start simultaneous trim helpers and failures stay optional',async()=>{
 let release,calls=0;const gate=new Promise(r=>release=r),r=new IdleReclaimer({eligible:()=>true,trim:async()=>{calls++;await gate;throw Error('unavailable');}});
 const first=r.reclaim();await r.reclaim();assert.equal(calls,1);release();await first;assert.equal(r.pending,false);assert.equal(r.last,null);
});
test('busy completion may schedule a delayed idle check after request cleanup',async()=>{
 let busy=true,calls=0;const r=new IdleReclaimer({eligible:()=>!busy,trim:async()=>{calls++;return {trimmed:1};},delayMs:1});
 r.schedule();busy=false;await delay();assert.equal(calls,1);
});
test('restore or new work revokes a slow helper before readiness authorizes trimming',async()=>{
 for(const transition of ['restore','recording']){
  let idle=true,release,mutations=0,entered=false;const ready=new Promise(r=>release=r);
  const r=new IdleReclaimer({eligible:()=>idle,trim:async(options={})=>{entered=true;await ready;if(!options.signal?.aborted&&(options.authorize?.()??true))mutations++;return {trimmed:1};}});
  const pending=r.reclaim();assert.equal(entered,true);idle=false;if(transition==='restore')r.cancel();release();await pending;assert.equal(mutations,0);assert.equal(r.last,null);
 }
});
