'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {LocalBrain,requiredMemory,exitFailure}=require('../source/local-brain.cjs');
test('both bundled models fit the video RAM budget at default context',()=>{for(const size of [2497280256,2019377696]){assert.ok(requiredMemory(size,4096)<4.8*1024**3);assert.ok(requiredMemory(size,4096)>size+1024**3);}});
test('Windows failure codes distinguish dependencies and unsupported CPU',()=>{assert.equal(exitFailure(-1073741515),'LOCAL_DEPENDENCY');assert.equal(exitFailure(0xc0000139),'LOCAL_DEPENDENCY');assert.equal(exitFailure(0xc000001d),'LOCAL_CPU');assert.equal(exitFailure(1),'LOCAL_ENGINE_START');});
test('startup exit retains safe diagnostic and isolates model failure',async t=>{const b=new LocalBrain({runtime:'/engine/server',settings:()=>({localIdleMinutes:5}),memory:()=>20*1024**3,fetcher:async()=>{throw Error('private raw error');},spawnProcess:()=>{const c=new EventEmitter();c.kill=()=>{};setImmediate(()=>c.emit('exit',0xc0000135,null));return c;}});t.after(()=>b.close());b.validate=()=>1000000;b.port=async()=>12345;await assert.rejects(b.load({localModelPath:'/private/model',localContext:2048,resourceMode:'balanced'}),e=>e.code==='LOCAL_DEPENDENCY');assert.equal(b.status().state,'failed');assert.equal(b.lastError.exitCode,'0xc0000135');assert.ok(!JSON.stringify(b.lastError).includes('private'));});
test('repeated Load shares one pending engine startup',async t=>{let launches=0;const b=new LocalBrain({runtime:'/engine/server',settings:()=>({localIdleMinutes:5}),memory:()=>20*1024**3,fetcher:async()=>({ok:true}),spawnProcess:()=>{launches++;const c=new EventEmitter();c.kill=()=>{};return c;}});t.after(()=>b.close());b.validate=()=>1000000;b.port=async()=>12345;const s={localModelPath:'/model',localContext:2048,resourceMode:'balanced'};await Promise.all([b.load(s),b.load(s)]);assert.equal(launches,1);assert.equal(b.state,'ready');});
test('manual Load survives maintenance while health is still loading',async t=>{
 const b=new LocalBrain({runtime:'/engine/server',settings:()=>({localIdleMinutes:5}),memory:()=>4.8*1024**3,spawnProcess:()=>{const c=new EventEmitter();c.kill=()=>{throw Error('startup was incorrectly stopped');};return c;}});
 t.after(()=>b.close());b.validate=()=>2497280256;b.port=async()=>12345;
 let polls=0;b.fetcher=async()=>{polls++;b.lastUsed=0;b.maintain();return {ok:polls>=2};};
 await b.load({localModelPath:'/qwen.gguf',localContext:4096,resourceMode:'balanced'});
 assert.ok(polls>=2);assert.equal(b.state,'ready');assert.ok(b.lastUsed>0);assert.equal(b.lastError,null);
});
test('low RAM during loading is reported as memory pressure, not cancellation',async t=>{
 const b=new LocalBrain({runtime:'/engine/server',settings:()=>({localIdleMinutes:5}),memory:()=>8*1024**3,spawnProcess:()=>{const c=new EventEmitter();c.kill=()=>{};return c;}});
 t.after(()=>b.close());b.validate=()=>2019377696;b.port=async()=>12345;
 b.fetcher=async()=>{b.memory=()=>512*1024**2;b.maintain();return {ok:true};};
 await assert.rejects(b.load({localModelPath:'/llama.gguf',localContext:4096,resourceMode:'balanced'}),e=>e.code==='LOW_MEMORY');
 assert.equal(b.state,'failed');assert.equal(b.lastError.code,'LOW_MEMORY');assert.equal(b.child,null);
});
test('Unload during port allocation never launches a late child',async t=>{
 let release,spawns=0;const b=new LocalBrain({runtime:'/engine/server',settings:()=>({localIdleMinutes:5}),memory:()=>8*1024**3,spawnProcess:()=>{spawns++;}});
 t.after(()=>b.close());b.validate=()=>2019377696;b.port=()=>new Promise(r=>release=r);
 const loading=b.load({localModelPath:'/llama.gguf',localContext:4096,resourceMode:'balanced'});b.stop();release(12345);
 await assert.rejects(loading,e=>e.code==='CANCELLED');assert.equal(spawns,0);assert.equal(b.state,'unloaded');assert.equal(b.lastError,null);
});
test('late health success after Unload cannot resurrect Ready',async t=>{
 const b=new LocalBrain({runtime:'/engine/server',settings:()=>({localIdleMinutes:5}),memory:()=>8*1024**3,spawnProcess:()=>{const c=new EventEmitter();c.kill=()=>{};return c;}});
 t.after(()=>b.close());b.validate=()=>2019377696;b.port=async()=>12345;b.fetcher=async()=>{b.stop();return {ok:true};};
 await assert.rejects(b.load({localModelPath:'/llama.gguf',localContext:4096,resourceMode:'balanced'}),e=>e.code==='CANCELLED');assert.equal(b.state,'unloaded');assert.equal(b.lastError,null);
});
