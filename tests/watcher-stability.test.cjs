"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
const {observeWatch,normalize}=require('../source/schedules.cjs');
const {Core}=require('../source/core.cjs'),{Store}=require('../source/database.cjs');
function watcher(t){const x=fixture(t);x.core.saveSettings({role:'worker',workerEnabled:true});const file=path.join(x.core.settings().workspace,'incoming.csv');fs.writeFileSync(file,'baseline');const schedule=x.core.saveSchedule({name:'Watch supplied attachments',prompt:'Review the selected attachments',format:'txt',frequency:'watch',intervalMinutes:1,watchPath:'incoming.csv',settleSeconds:30});return {...x,file,schedule};}
const due=(core,id)=>core.store.put('schedule',id,{...core.store.get('schedule',id),next:Date.now()-1});
const poll=async(core,id)=>{due(core,id);await core.worker.tick();return core.store.get('schedule',id);};
test('watcher requires stable observations; slow writes restart waiting and unchanged polls do not rerun',async t=>{
 const {core,file,schedule,calls}=watcher(t);t.mock.timers.enable({apis:['Date'],now:Date.now()});
 assert.equal((await poll(core,schedule.id)).watchStatus,'baseline');
 fs.writeFileSync(file,'first partial');assert.equal((await poll(core,schedule.id)).watchStatus,'settling');
 t.mock.timers.tick(20000);fs.writeFileSync(file,'second partial larger');await poll(core,schedule.id);
 t.mock.timers.tick(29000);await poll(core,schedule.id);assert.equal(calls.length,0);
 t.mock.timers.tick(1000);assert.equal((await poll(core,schedule.id)).watchStatus,'ready');assert.equal(calls.length,1);
 await poll(core,schedule.id);assert.equal(calls.length,1);
});
test('deletion never runs; recreated file settles before one run',async t=>{
 const {core,file,schedule,calls}=watcher(t);t.mock.timers.enable({apis:['Date'],now:Date.now()});await poll(core,schedule.id);
 fs.unlinkSync(file);assert.equal((await poll(core,schedule.id)).watchStatus,'missing');assert.equal(calls.length,0);
 fs.writeFileSync(file,'recreated');await poll(core,schedule.id);assert.equal(calls.length,0);
 t.mock.timers.tick(30000);await poll(core,schedule.id);assert.equal(calls.length,1);
});
test('settling state survives encrypted Store/Core restart without duplicate execution',async t=>{
 const {core,root,cipher,file,schedule}=watcher(t);t.mock.timers.enable({apis:['Date'],now:Date.now()});await poll(core,schedule.id);fs.writeFileSync(file,'changed before interruption');await poll(core,schedule.id);core.close();let runs=0;
 const reopened=new Core({root,store:new Store(path.join(root,'privateai.db'),cipher),machine:'synthetic-machine',client:{generate:async()=>{runs++;return {text:'Synthetic restarted watcher',usage:{inputTokens:1,outputTokens:1}};}}});
 try{reopened.saveSettings({workerPaused:false});t.mock.timers.tick(30000);await poll(reopened,schedule.id);await poll(reopened,schedule.id);assert.equal(runs,1);}finally{reopened.close();}
});
test('pause preserves observation; authorized generic watchers retain existing locked-background execution',async t=>{
 const {core,file,schedule,calls}=watcher(t);t.mock.timers.enable({apis:['Date'],now:Date.now()});await poll(core,schedule.id);fs.writeFileSync(file,'changed');await poll(core,schedule.id);t.mock.timers.tick(30000);
 core.saveSettings({workerPaused:true});await poll(core,schedule.id);assert.equal(calls.length,0);assert.equal(core.store.get('schedule',schedule.id).watchStatus,'settling');
 core.saveSettings({workerPaused:false});core.lock();await poll(core,schedule.id);assert.equal(calls.length,1);assert.equal(core.locked,true);
});
test('editing schedule and changing approved workspace each establish a new baseline',async t=>{
 const {core,dir,file,schedule,calls}=watcher(t);await poll(core,schedule.id);fs.writeFileSync(file,'new edit');await poll(core,schedule.id);
 const edited=core.saveSchedule({...core.store.get('schedule',schedule.id),settleSeconds:45});assert.equal(edited.watchObservation,undefined);assert.equal(edited.settleSeconds,45);await poll(core,schedule.id);assert.equal(calls.length,0);
 const other=path.join(dir,'Other approved work');core.saveSettings({workspace:other});fs.writeFileSync(path.join(other,'incoming.csv'),'different workspace');assert.equal((await poll(core,schedule.id)).watchStatus,'baseline');assert.equal(calls.length,0);
});
test('path substitution through a junction/symlink disables watcher without running',async t=>{
 const {core,dir,schedule,calls}=watcher(t),workspace=core.settings().workspace,folder=path.join(workspace,'watched'),outside=path.join(dir,'Outside');fs.mkdirSync(folder);fs.mkdirSync(outside);fs.writeFileSync(path.join(folder,'report.csv'),'initial');fs.writeFileSync(path.join(outside,'report.csv'),'outside');
 const scoped=core.saveSchedule({...schedule,watchPath:'watched/report.csv'});await poll(core,scoped.id);fs.renameSync(folder,path.join(workspace,'old watched'));fs.symlinkSync(outside,folder,process.platform==='win32'?'junction':'dir');
 const disabled=await poll(core,scoped.id);assert.equal(disabled.enabled,false);assert.equal(calls.length,0);assert.ok(disabled.error);
});
test('clock rollback or repeated same timestamp cannot satisfy stability',t=>{
 const {core,file,schedule}=watcher(t),workspace=core.settings().workspace;let current={...schedule,...observeWatch(schedule,workspace,{now:100000}).state};fs.writeFileSync(file,'change');current={...current,...observeWatch(current,workspace,{now:110000}).state};
 assert.equal(observeWatch(current,workspace,{now:110000}).ready,false);const reset=observeWatch(current,workspace,{now:90000});assert.equal(reset.ready,false);assert.equal(reset.state.watchObservation.since,90000);
 assert.throws(()=>normalize({...schedule,settleSeconds:29}),e=>e.code==='INVALID');assert.throws(()=>normalize({...schedule,settleSeconds:3601}),e=>e.code==='INVALID');
});
