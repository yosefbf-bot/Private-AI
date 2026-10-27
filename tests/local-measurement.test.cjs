'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {options,metrics,runCase,measure,plan}=require('../scripts/measure-local-ram.cjs');
const GIB=1024**3;
const row={tier:'small',name:'Synthetic Small',bytes:1282439584,file:'synthetic.gguf',installed:true};
test('measurement rejects unsafe options and never enables cache compression',()=>{
 for(const args of [['--contexts','1'],['--repetitions','100'],['--profiles','q8_0']])assert.throws(()=>options(args));
 const args=options(['--runtime',require('node:path').resolve('engine.exe'),'--out',require('node:path').resolve('evidence.json')]);assert.deepEqual(args.profiles,['standard','smaller']);assert.equal(plan(args,[row]).length,54);
});
test('measurement refuses low memory before verification, spawning or inference',async()=>{
 const r=await runCase({tier:'small',context:2048,profile:'standard',repetition:1,row},{memory:()=>1.2*GIB,manager:{verifyTier:()=>assert.fail('No reads needed for refused load')},createBrain:()=>assert.fail('Unsafe load must not be attempted')});assert.equal(r.status,'refused');assert.equal(r.reason,'LOW_MEMORY');
});
test('unavailable benchmark tiers are not invented or loaded',async()=>{
 assert.equal((await runCase({tier:'extra',context:2048,profile:'standard',repetition:1},{createBrain:()=>assert.fail()})).status,'unavailable');
});
test('benchmark skips runtime probe when every load is safely refused',async()=>{
 const opts={runtime:'engine.exe',tiers:['small'],contexts:[2048],profiles:['standard'],repetitions:1};
 const report=await measure(opts,{memory:()=>GIB,manager:{catalog:()=>[row]},runtimeProbe:()=>assert.fail('No native runtime probe needed')});assert.equal(report.runtimeProbe.status,'not-run');assert.equal(report.results[0].status,'refused');
});
test('failed native preflight cannot be counted as successful model execution',async()=>{
 const report=await measure({runtime:'engine.exe',tiers:['small'],contexts:[2048],profiles:['standard'],repetitions:1},{memory:()=>20*GIB,manager:{catalog:()=>[row]},runtimeProbe:async()=>({status:'failed',reason:'timeout'}),caseRunner:()=>assert.fail('Failed preflight must prevent all launches')});assert.equal(report.results[0].status,'not-run');
});
test('cancelled benchmark does not start later cases',async()=>{
 const controller=new AbortController();controller.abort();const report=await measure({runtime:'engine.exe',tiers:['small'],contexts:[2048],profiles:['standard'],repetitions:1},{memory:()=>GIB,manager:{catalog:()=>[row]},signal:controller.signal});assert.equal(report.cancelled,true);assert.equal(report.results.length,0);
});
test('measurement counters allowlist excludes text, paths and unexpected telemetry',()=>{
 assert.deepEqual(metrics({privateBytes:42,peakCommitBytes:99,rawError:'secret',prompt:'private',path:'sensitive',cpuMilliseconds:NaN}),{privateBytes:42,peakCommitBytes:99});
});
test('measurement retains same complete synthetic request and always releases its brain',async()=>{
 let closed=0,stopped=0;const calls=[];
 const record=await runCase({tier:'small',context:2048,profile:'smaller',repetition:1,row},{runtime:'engine.exe',memory:()=>20*GIB,manager:{verifyTier:async()=>{}},sample:async()=>({peakWorkingSetBytes:100}),createBrain:()=>({child:{pid:123},load:async s=>calls.push({s}),generate:async(s,m)=>{calls.push({s,m});return {text:'Synthetic private answer must not appear in evidence',incomplete:false};},close:()=>closed++,waitStopped:async()=>{stopped++;},stop:()=>{}})});
 assert.equal(record.status,'passed');assert.equal(calls[1].s.localModelPath,row.file);assert.match(calls[1].m[0].content,/alpha has 12 blue boxes/);assert.equal(closed,1);assert.equal(stopped,1);assert.ok(!JSON.stringify(record).includes('Synthetic private answer'));assert.ok(!JSON.stringify(record).includes('alpha'));
});
