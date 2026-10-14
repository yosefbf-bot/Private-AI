"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs'),{dispatch}=require('../source/workflows/index.cjs'),{forCore}=require('../source/snf/demo.cjs');
const notices=require('../source/workflows/notices.cjs'),{Store}=require('../source/database.cjs'),{Core}=require('../source/core.cjs'),path=require('node:path');
const snf=core=>forCore(core).current();
function failed(core,id='synthetic-job'){core.store.put('job',id,{id,title:'Synthetic failure',status:'failed',error:'INTERRUPTED',completed:Date.now()});}
test('acknowledgment and snoozing alter only notice metadata; source/task/clinical state remain intact',async t=>{
 const {core}=fixture(t);failed(core);core.saveTodo({title:'Synthetic clinical follow-up'});core.store.put('snf_alert','synthetic-alert',{id:'synthetic-alert',title:'Synthetic critical',severity:'critical',status:'active'});
 const beforeTasks=core.store.list('todo'),beforeAlert=core.store.get('snf_alert','synthetic-alert');let row=notices.list(core,snf(core)).items[0];
 await dispatch(core,'workflowNoticeUpdate',{key:row.key,revision:row.revision,status:'acknowledged'});assert.equal(notices.list(core,snf(core)).active,0);assert.equal(core.store.get('job','synthetic-job').status,'failed');assert.deepEqual(core.store.list('todo'),beforeTasks);assert.deepEqual(core.store.get('snf_alert','synthetic-alert'),beforeAlert);
 await dispatch(core,'workflowNoticeUpdate',{key:row.key,revision:row.revision,status:'snoozed',snoozedUntil:Date.now()+60000});assert.equal(notices.list(core,snf(core)).active,0);
 core.store.put('job','synthetic-job',{...core.store.get('job','synthetic-job'),completed:Date.now()+1});assert.equal(notices.list(core,snf(core)).active,1);await assert.rejects(dispatch(core,'workflowNoticeUpdate',{key:row.key,revision:row.revision,status:'acknowledged'}),{code:'REVIEW_CHANGED'});
});
test('notice review persists in encrypted store and expired snooze becomes active',async t=>{
 const {core,root,cipher}=fixture(t);failed(core);const row=notices.list(core,snf(core)).items[0];t.mock.timers.enable({apis:['Date'],now:Date.now()});notices.update(core,snf(core),{key:row.key,revision:row.revision,status:'snoozed',snoozedUntil:Date.now()+1000});core.close();const reopened=new Core({root,store:new Store(path.join(root,'privateai.db'),cipher),machine:'synthetic-machine'});try{assert.equal(notices.list(reopened,snf(reopened)).active,0);t.mock.timers.tick(1001);assert.equal(notices.list(reopened,snf(reopened)).active,1);}finally{reopened.close();}
});
test('Demo/development cannot expose or acknowledge production notice sources; locked reads fail',async t=>{
 const {core}=fixture(t);failed(core);const row=notices.list(core,snf(core)).items[0];await forCore(core).set({mode:'demo'});assert.equal(notices.list(core,snf(core)).items.length,0);await assert.rejects(dispatch(core,'workflowNoticeUpdate',{key:row.key,revision:row.revision,status:'acknowledged'}),{code:'NOT_FOUND'});assert.equal(core.store.get('wf_notice_review',row.key),null);
 await forCore(core).set({mode:'production'});core.developmentMode=true;assert.equal(notices.list(core,snf(core)).items.length,0);core.developmentMode=false;core.lock();assert.throws(()=>notices.list(core,snf(core)),{code:'LOCKED'});
});
test('uncertain/pending delivery notices never approve or retry messages; bounded active results precede acknowledged history',t=>{
 const {core}=fixture(t);for(let i=0;i<105;i++)failed(core,'synthetic-'+i);const rows=notices.list(core,snf(core));assert.equal(rows.items.length,100);assert.equal(rows.total,105);assert.equal(rows.truncated,true);for(const row of rows.items)notices.update(core,snf(core),{key:row.key,revision:row.revision,status:'acknowledged'});assert.equal(notices.list(core,snf(core)).items[0].status,'unread');
 core.store.put('messageOut','synthetic-msg',{id:'synthetic-msg',status:'delivery-uncertain',time:Date.now(),body:'Synthetic secret body'});const message=notices.list(core,snf(core)).items.find(n=>n.kind==='message');assert.ok(message);assert.equal(JSON.stringify(message).includes('Synthetic secret body'),false);notices.update(core,snf(core),{key:message.key,revision:message.revision,status:'acknowledged'});assert.equal(core.store.get('messageOut','synthetic-msg').status,'delivery-uncertain');assert.throws(()=>notices.update(core,snf(core),{key:message.key,revision:message.revision,status:'snoozed',snoozedUntil:Date.now()-1}),{code:'INVALID'});
});
