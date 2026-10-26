'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');

async function clinicalFixture(core){
 const date=new Date().toISOString();
 const residents=Array.from({length:8},(_,i)=>({residentId:'synthetic-'+i,name:'Synthetic resident '+i}));
 await core.snf.ingestReports([
  {type:'census',filename:'synthetic-census.csv',date,rows:residents},
  {type:'med_profile',filename:'synthetic-meds.csv',date,rows:residents.map(r=>({residentId:r.residentId,medication:'quetiapine',dose:'25 mg',startDate:date}))}
 ]);
}

test('clinical evidence reads each feed once per rule run and retains exact evidence hashes',async t=>{
 const {core,cipher}=fixture(t);await clinicalFixture(core);
 const open=cipher.open.bind(cipher),reads=new Map();
 cipher.open=(payload,aad)=>{if(aad.startsWith('snf_med_order:'))reads.set(aad,(reads.get(aad)||0)+1);return open(payload,aad);};
 await core.snf.runRulesEngine();
 assert.equal(reads.size,8);
 assert.ok([...reads.values()].every(n=>n===1),'Each medication must be decrypted once, not again for each alert: '+JSON.stringify([...reads.values()]));
 cipher.open=open;
 const alerts=core.store.list('snf_alert');assert.ok(alerts.length>=8);
 const {capture}=require('../source/snf/rules/evidence.cjs');
 for(const alert of alerts){
  const fresh=capture.call(core.snf,alert.code,alert.residentId,alert.message,alert.whyFlagged);
  for(const [key,value] of Object.entries(fresh))assert.deepEqual(alert[key],value,'Evidence must match uncached capture: '+key);
 }
 const previous=alerts.find(a=>a.code==='AP-002'&&a.residentId==='synthetic-0');assert.ok(previous);
 const order=core.store.list('snf_med_order').find(r=>r.residentId==='synthetic-0');
 core.store.put('snf_med_order',order.id,{...order,dose:'50 mg'});
 await core.snf.runRulesEngine();
 const updated=core.store.get('snf_alert',previous.id);
 assert.notEqual(updated.evaluationId,previous.evaluationId,'A later run must see newly edited source data');
 assert.ok(updated.evaluationHistory.includes(previous.evaluationId));
 assert.equal(updated.inputData.med_profile[0].dose,'50 mg');
});

test('job overview reads encrypted metadata without hydrating recovery inputs or saved answers',t=>{
 const {core,cipher}=fixture(t);
 const recoveryInput={text:'SYNTHETIC_PRIVATE_RECOVERY '.repeat(20000)};
 const savedAnswer={text:'SYNTHETIC_PRIVATE_ANSWER '.repeat(20000)};
 core.store.put('job','synthetic-job',{title:'Synthetic job',status:'paused',target:'synthetic-peer',recoveryInput,savedAnswer,checkpoint:{phase:'extracting'},created:123});
 const open=cipher.open.bind(cipher),reads=[];
 cipher.open=(payload,aad)=>{if(aad.startsWith('job:'))reads.push(aad);return open(payload,aad);};
 for(let i=0;i<2;i++){
  const job=core.summary().jobs.find(j=>j.id==='synthetic-job');
  assert.equal(job.title,'Synthetic job');assert.equal(job.status,'paused');assert.equal(job.step,'extracting');assert.equal(job.recoverable,true);
  assert.equal(job.target,'synthetic-peer');assert.equal(job.created,123);
  assert.doesNotMatch(JSON.stringify(job),/SYNTHETIC_PRIVATE|recoveryInput|savedAnswer|checkpoint/);
 }
 assert.deepEqual(reads,[],'Repeated status reads must not open full job payloads');
 assert.ok(core.store.db.prepare("SELECT payload FROM record_meta WHERE kind='job' AND id='synthetic-job'").get(),'Summary remains encrypted in the existing metadata table');
});

test('legacy job metadata backfills once without changing recovery data, timestamps or later edits',t=>{
 const {core,cipher}=fixture(t),value={title:'Synthetic legacy',status:'failed',recoveryInput:{text:'SYNTHETIC recovery'},checkpoint:{phase:'reasoning'}};
 core.store.put('job','synthetic-legacy',value,{updated:123,expires:9999999999999});
 core.store.db.prepare("DELETE FROM record_meta WHERE kind='job'").run();
 const before=core.store.db.prepare("SELECT * FROM records WHERE kind='job'").get();
 const open=cipher.open.bind(cipher);let reads=0;
 cipher.open=(payload,aad)=>{if(aad==='job:synthetic-legacy')reads++;return open(payload,aad);};
 assert.equal(core.store.summaries('job')[0].recoverable,true);
 assert.equal(core.store.summaries('job')[0].step,'reasoning');
 assert.equal(reads,1);
 assert.deepEqual(core.store.db.prepare("SELECT * FROM records WHERE kind='job'").get(),before);
 core.store.put('job','synthetic-legacy',{...value,status:'completed',recoveryInput:null,checkpoint:null});
 const current=core.store.summaries('job')[0];
 assert.equal(current.status,'completed');assert.equal(current.recoverable,false);assert.equal(current.step,null);
 core.store.delete('job','synthetic-legacy');
 assert.deepEqual(core.store.summaries('job'),[]);
});

test('record-only writes from an older release invalidate job metadata without resurrecting deleted jobs',t=>{
 const {core,cipher,root}=fixture(t),{Store}=require('../source/database.cjs'),{Core}=require('../source/core.cjs');
 for(const id of ['synthetic-finished','synthetic-deleted'])core.store.put('job',id,{title:id,status:'running',recoveryInput:{text:'SYNTHETIC retained'}});
 // Simulate an older writer that knows records but has no job metadata support.
 // Retain the row timestamp to ensure correctness does not rely on clock changes.
 core.store.db.prepare("UPDATE records SET payload=? WHERE kind='job' AND id=?").run(cipher.seal({title:'Synthetic complete',status:'completed',recoveryInput:{text:'SYNTHETIC retained'}},'job:synthetic-finished'),'synthetic-finished');
 core.store.db.prepare("DELETE FROM records WHERE kind='job' AND id=?").run('synthetic-deleted');
 core.close();
 const store=new Store(require('node:path').join(root,'privateai.db'),cipher),reopened=new Core({root,store,machine:'synthetic-machine'});
 try{
  assert.equal(store.get('job','synthetic-finished').status,'completed');
  assert.equal(store.get('job','synthetic-finished').recoveryInput.text,'SYNTHETIC retained');
  assert.equal(store.get('job','synthetic-deleted'),null);
  assert.deepEqual(store.summaries('job').map(j=>[j.id,j.status]),[['synthetic-finished','completed']]);
 }finally{reopened.close();}
});
