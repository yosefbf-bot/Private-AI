'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {LocalBrain}=require('../source/local-brain.cjs');
const {fixture}=require('./helpers.cjs');
test('an unloaded brain has no maintenance timer; stop cancels the loaded timer',()=>{
 const b=new LocalBrain({runtime:'unused',settings:()=>({localIdleMinutes:2}),memory:()=>8*1024**3});
 try{assert.equal(b.timer,null);b.armMaintenance();assert.ok(b.timer);b.stop('idle');assert.equal(b.timer,null);}finally{b.close();}
});
test('idle pressure respects configured RAM reserve but does not interrupt a healthy active answer',()=>{
 let kills=0;const b=new LocalBrain({runtime:'unused',settings:()=>({localIdleMinutes:5,ramReserveMB:2048}),memory:()=>1.8*1024**3});
 try{b.child={kill(){kills++;}};b.state='ready';b.lastUsed=Date.now();b.busy=true;b.maintain();assert.equal(kills,0);b.busy=false;b.maintain();assert.equal(kills,1);assert.equal(b.state,'unloaded');}finally{b.close();}
});
test('a scheduled primary PC stays alive without an open window or worker role',t=>{
 const {core}=fixture(t),{needsBackground}=require('../source/app-lifecycle.cjs');
 assert.equal(needsBackground(core),false);core.store.put('schedule','synthetic',{enabled:true,next:Date.now()+60000});
 assert.equal(needsBackground(core),true);core.store.delete('schedule','synthetic');assert.equal(needsBackground(core),false);
 assert.equal(needsBackground(core,{companion:true}),true);
 core.requests.set('synthetic',new AbortController());assert.equal(needsBackground(core),true);
});
