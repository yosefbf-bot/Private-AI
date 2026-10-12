'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {fixture}=require('./helpers.cjs'),drafts=require('../source/assistant-drafts.cjs'),captures=require('../source/capture-workflows.cjs');
function local(core,generate){
 core.saveSettings({localTier:'selected',localModelPath:'synthetic-model.gguf',workerPaused:false});
 core.resources.withAI=async fn=>fn();
 core.router.local={generate,modelName:()=> 'synthetic-local',close(){}};
}
test('automatic draft uses real local-only router, preserves source/actions and never calls optional cloud',async t=>{
 const {core,calls}=fixture(t);let count=0;
 local(core,async()=>{count++;return {text:JSON.stringify({answer:'Draft: Review the door issue. Owner and deadline unknown.',evidence:['The conference door is broken.'],uncertainties:['Owner unknown']})};});
 const saved=captures.create(core,{sourceId:crypto.randomUUID(),text:'The conference door is broken.'});
 const before=core.store.get('todo',saved.actions[0].id);
 await drafts.processPending(core);const row=core.store.get('capture_note',saved.capture.id);
 assert.equal(row.assistantDraft.status,'ready');assert.match(row.assistantDraft.text,/Owner and deadline unknown/);
 assert.deepEqual(core.store.get('todo',saved.actions[0].id),before);assert.equal(calls.length,0);
 await drafts.processPending(core);await drafts.retry(core,{kind:'capture_note',id:row.id});assert.equal(count,1);
});
test('paused, locked, unavailable and Demo drafting never infer or send; failed drafts require explicit retry',async t=>{
 const {core,calls}=fixture(t);let count=0;
 const capture=captures.create(core,{sourceId:crypto.randomUUID(),text:'Check the conference door.'}).capture;
 await drafts.processPending(core);assert.equal(core.store.get('capture_note',capture.id).assistantDraft,undefined);
 local(core,async()=>{count++;throw Object.assign(new Error('synthetic secret must not be stored'),{code:'LOCAL_ENGINE'});});
 core.saveSettings({workerPaused:true});await drafts.processPending(core);core.saveSettings({workerPaused:false});
 core.lock();await drafts.processPending(core);core.unlock();
 const spaces=require('../source/snf/demo.cjs').forCore(core);await spaces.set({mode:'demo'});await drafts.processPending(core);await spaces.set({mode:'production'});assert.equal(count,0);
 await drafts.processPending(core);await drafts.processPending(core);assert.equal(count,1);assert.equal(calls.length,0);
 const row=core.store.get('capture_note',capture.id);assert.equal(row.assistantDraft.status,'needs-review');assert.equal(JSON.stringify(row).includes('synthetic secret'),false);
});
test('locking during a draft rejects late output and leaves canonical follow-ups untouched',async t=>{
 const {core}=fixture(t);let begin,finish;const started=new Promise(r=>begin=r),gate=new Promise(r=>finish=r);
 local(core,async()=>{begin();await gate;return {text:JSON.stringify({answer:'late draft',evidence:[],uncertainties:[]})};});
 const capture=captures.create(core,{sourceId:crypto.randomUUID(),text:'Check the conference door.'}).capture;
 const work=drafts.retry(core,{kind:'capture_note',id:capture.id});await started;core.lock();finish();await assert.rejects(work);
 core.unlock();assert.equal(core.store.get('capture_note',capture.id).assistantDraft.status,'needs-review');assert.equal(core.store.count('todo'),1);
});

test('interrupted local draft is marked for review without repeating inference',async t=>{
 const {core,calls}=fixture(t),capture=captures.create(core,{sourceId:crypto.randomUUID(),text:'Check the door.'}).capture;
 core.store.put('capture_note',capture.id,{...capture,assistantDraft:{status:'working',inputHash:'synthetic'}});
 drafts.recover(core);assert.equal(core.store.get('capture_note',capture.id).assistantDraft.status,'needs-review');assert.equal(calls.length,0);
});
