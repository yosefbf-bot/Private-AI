'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {options,watchdogPolicy,createEvaluationBrain,memoryPressure,evaluationFailureReason}=require('../scripts/evaluate-local-quality.cjs');
const {LocalBrain}=require('../source/local-brain.cjs');
const MIB=1024**2;
const base=['--runtime',path.resolve('llama-server.exe'),'--out',path.resolve('synthetic.json')];
const oneCase=['--tiers','high','--contexts','2048','--repetitions','1','--cases','chat-01'];
const reduced=floor=>options([...base,...oneCase,'--watchdog-floor-mib',String(floor),'--idle-pc-confirmed','true']);

test('ordinary evaluation keeps the unchanged production brain and 1024 MiB watchdog',t=>{
 const o=options(base),policy=watchdogPolicy(o);
 assert.equal(policy.floorBytes,1024*MIB);assert.equal(policy.lowered,false);assert.equal(policy.idlePcConfirmed,false);
 let killed=0;const brain=createEvaluationBrain({runtime:'unused',settings:()=>({localIdleMinutes:5}),memory:()=>768*MIB},o);
 t.after(()=>brain.close());assert.equal(Object.getPrototypeOf(brain),LocalBrain.prototype);
 brain.child={kill(){killed++;},exitCode:0};brain.busy=true;brain.maintain();
 assert.equal(killed,1);assert.equal(brain.lastError.code,'LOW_MEMORY');
});

test('a reduced watchdog requires fresh explicit idle acknowledgement and a single bounded normal case',()=>{
 for(const floor of [256,512]){
  assert.equal(watchdogPolicy(reduced(floor)).floorBytes,floor*MIB);
  assert.throws(()=>options([...base,...oneCase,'--watchdog-floor-mib',String(floor)]));
  assert.throws(()=>options([...base,...oneCase,'--watchdog-floor-mib',String(floor),'--idle-pc-confirmed','false']));
 }
 for(const value of ['0','255','257','768','1025','NaN','512.5'])assert.throws(()=>options([...base,...oneCase,'--watchdog-floor-mib',value,'--idle-pc-confirmed','true']));
 for(const overrides of [{condition:'system',allocateBytes:64*MIB},{condition:'commit',capBytes:2048*MIB},{condition:'working-set',capBytes:2048*MIB},{tiers:['small','high']},{contexts:[2048,4096]},{repetitions:2},{caseIds:[]},{caseIds:['chat-01','chat-02']}])assert.throws(()=>watchdogPolicy({...reduced(512),...overrides}));
 assert.throws(()=>watchdogPolicy({...reduced(512),idlePcConfirmed:'true'}));
});

test('temporary test maintenance uses real memory and the selected floor without changing production methods or settings',t=>{
 for(const floor of [256,512]){
  let free=(floor+1)*MIB,killed=0;const settings={localIdleMinutes:5,ramReserveMB:1024,resourceMode:'balanced',keepBrainMinutes:15};
  const snapshot={...settings},memory=()=>free;
  const brain=createEvaluationBrain({runtime:'unused',settings:()=>settings,memory},reduced(floor));t.after(()=>brain.close());
  assert.equal(brain.memory,memory);assert.equal(brain.generate,LocalBrain.prototype.generate);assert.equal(brain.load,LocalBrain.prototype.load);
  brain.child={kill(){killed++;},exitCode:0};brain.state='ready';brain.lastUsed=Date.now();
  brain.maintain();assert.equal(killed,0,'idle gap may use the explicitly selected test floor');
  brain.busy=true;free=floor*MIB;brain.maintain();assert.equal(killed,0);
  free=(floor-1)*MIB;brain.maintain();assert.equal(killed,1);assert.equal(brain.lastError.code,'LOW_MEMORY');
  assert.deepEqual(settings,snapshot);
 }
});

test('temporary test maintenance still unloads expired idle models and rejects unknown memory',t=>{
 for(const scenario of ['idle','unknown']){
  let killed=0;const brain=createEvaluationBrain({runtime:'unused',settings:()=>({localIdleMinutes:5,resourceMode:'balanced',keepBrainMinutes:15}),memory:()=>scenario==='unknown'?NaN:600*MIB},reduced(512));t.after(()=>brain.close());
  brain.child={kill(){killed++;},exitCode:0};brain.state='ready';brain.lastUsed=Date.now()-301000;brain.maintain();assert.equal(killed,1);
  assert.equal(brain.state,scenario==='unknown'?'failed':'unloaded');
 }
});

test('reduced test floor does not bypass model startup admission',async t=>{
 let spawned=0;const brain=createEvaluationBrain({runtime:'unused',settings:()=>({localIdleMinutes:5}),memory:()=>768*MIB,spawnProcess:()=>{spawned++;}},reduced(512));t.after(()=>brain.close());
 brain.validate=()=>2.5*1024**3;
 await assert.rejects(brain.load({localModelPath:'synthetic.gguf',localContext:2048,resourceMode:'balanced'}),e=>e.code==='LOW_MEMORY');assert.equal(spawned,0);
});

test('both watchdog sample paths preserve release/failure stops at the explicit floor',()=>{
 for(const floor of [256,512,1024]){
  assert.equal(memoryPressure(floor*MIB,floor*MIB),false);
  assert.equal(memoryPressure((floor-1)*MIB,floor*MIB),true);
  assert.equal(memoryPressure(4*1024*MIB,floor*MIB,true),true);
  for(const value of [NaN,undefined,Infinity,-1])assert.equal(memoryPressure(value,floor*MIB),true);
 }
});

test('evaluation failures retain safe diagnostic codes without raw messages or paths',()=>{
 assert.equal(evaluationFailureReason({code:'LOCAL_UNAVAILABLE',message:'private prompt'}),'LOCAL_UNAVAILABLE');
 assert.equal(evaluationFailureReason(new Error('INCOMPLETE_EVENT')),'INCOMPLETE_EVENT');
 assert.equal(evaluationFailureReason(new Error('private path and credentials')),'EVALUATION_STOPPED');
 assert.equal(evaluationFailureReason({code:'private filename'}),'EVALUATION_STOPPED');
 assert.equal(evaluationFailureReason({code:'CANCELLED'},true),'CASE_TIMEOUT');
 assert.equal(evaluationFailureReason({cause:{code:'UND_ERR_SOCKET',message:'private endpoint'}}),'TRANSPORT_UND_ERR_SOCKET');
 assert.equal(evaluationFailureReason({cause:{code:'private endpoint'}}),'EVALUATION_STOPPED');
});
