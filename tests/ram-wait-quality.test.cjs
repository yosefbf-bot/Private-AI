'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
const GIB=1024**3;
function setup(t,{tier='auto',cap='high',free=2*GIB,respond}={}){
 const f=fixture(t);let memory=free;const calls=[];
 const rows=['small','medium','high','extra'].map((tier,i)=>({id:'synthetic-'+tier,tier,name:'Synthetic '+tier,file:'synthetic-'+tier+'.gguf',bytes:[1282439584,2*GIB,4*GIB,6*GIB][i],installed:true}));
 f.core.saveSettings({processingMode:'local-only',allowCloud:false,localTier:tier,localMaxTier:cap,localContext:2048,localMaxOutput:192,ramRecoverySeconds:0});
 f.core.modelManager={catalog:()=>rows,verifyTier:async tier=>rows.find(r=>r.tier===tier)};
 f.core.router.local={state:'unloaded',validate:s=>rows.find(r=>r.file===s.localModelPath).bytes,modelName:s=>s.localModelPath,close(){},stop(){},waitStopped:async()=>{},generate:async(s,m,o)=>{const tier=rows.find(r=>r.file===s.localModelPath).tier;calls.push({tier,s,m,o});return respond(tier,calls.length,s,m,o);}};
 f.core.resources.memory=()=>memory;const chat=f.core.createChat();
 return {...f,chat,rows,calls,setFree:value=>{memory=value;f.core.resources.notify();}};
}
async function offer(f,prompt='Hello from a synthetic complete request.',extra={}){
 const result=await f.core.send({chatId:f.chat.id,prompt,...extra}),m=result.chat.messages.at(-1);
 assert.equal(m.error?.code,'LOW_MEMORY');assert.ok(m.memoryWait?.token);return m.memoryWait.token;
}
async function settle(f){for(let i=0;i<200&&f.core.requests.has(f.chat.id);i++)await new Promise(r=>setTimeout(r,5));assert.equal(f.core.requests.has(f.chat.id),false,'Wait must settle');return f.core.chat(f.chat.id).messages.at(-1);}
const answer=(extra={})=>({text:JSON.stringify({answer:'Synthetic completed reply.',evidence:[],uncertainties:[],...extra}),localTokens:7});
async function upload(f,source){const fs=require('node:fs'),path=require('node:path'),file=path.join(f.dir,'synthetic-source.txt');fs.writeFileSync(file,source);return (await f.core.importFile(file)).id;}

test('RAM continuation retains automatic required-tier escalation and the complete input',async t=>{
 const f=setup(t,{respond:tier=>answer(tier==='small'?{required_tier:'high',uncertainties:['Needs synthesis']}:{})}),token=await offer(f);
 await f.core.queueChatWhenMemoryFree({chatId:f.chat.id,token});f.setFree(12*GIB);const m=await settle(f);
 assert.deepEqual(f.calls.map(c=>c.tier),['small','high']);assert.equal(m.processing.routing.selectedTier,'high');assert.equal(m.error,undefined);
 for(const c of f.calls){assert.match(JSON.stringify(c.m),/Hello from a synthetic complete request/);assert.equal(c.s.localMaxOutput,192);assert.equal(c.s.allowCloud,false);}
 assert.equal(f.core.chat(f.chat.id).messages.length,2);
});

test('completed Small inference is reused when the required High brain must wait',async t=>{
 const f=setup(t,{free:3*GIB,respond:tier=>answer(tier==='small'?{required_tier:'high'}:{})}),token=await offer(f);
 assert.deepEqual(f.calls.map(c=>c.tier),['small']);await f.core.queueChatWhenMemoryFree({chatId:f.chat.id,token});f.setFree(12*GIB);const m=await settle(f);
 assert.deepEqual(f.calls.map(c=>c.tier),['small','high'],'Completed inference must never execute twice');assert.equal(m.processing.routing.selectedTier,'high');assert.equal(m.processing.meter.localTokens,14);
});

test('RAM-blocked classification can still recommend Extra without answering an excerpt',async t=>{
 const f=setup(t,{cap:'extra',respond:tier=>tier==='small'?{text:'{"required_tier":"extra"}',localTokens:3}:answer()}),prompt='Analyze and compare the entire synthetic inventory.',token=await offer(f,prompt);
 await f.core.queueChatWhenMemoryFree({chatId:f.chat.id,token});f.setFree(20*GIB);const m=await settle(f);
 assert.deepEqual(f.calls.map(c=>c.tier),['small','extra']);assert.equal(m.processing.routing.selectedTier,'extra');assert.match(JSON.stringify(f.calls[1].m),/Analyze and compare the entire synthetic inventory/);assert.doesNotMatch(JSON.stringify(f.calls[1].m),/task_excerpt/);
});

test('queued hybrid output retains its review threshold without invoking a cloud provider',async t=>{
 const source='SYNTHETIC inventory alpha has 12 blue boxes.';
 const f=setup(t,{tier:'high',respond:()=>answer({answer:'Alpha has 12 blue boxes; other counts are unknown.',evidence:[source],uncertainties:['Other counts unavailable']})});
 f.core.saveSettings({processingMode:'smart-hybrid',allowCloud:true,escalationThreshold:85});f.core.client.generate=()=>assert.fail('Low memory is never cloud authorization');
 const file=await upload(f,source),token=await offer(f,'Use the supplied evidence.',{fileIds:[file]});await f.core.queueChatWhenMemoryFree({chatId:f.chat.id,token});f.setFree(12*GIB);const m=await settle(f);
 assert.equal(m.processing.reliability.score,70);
 assert.match(m.text,/Local draft — not sufficiently verified/);assert.equal(m.processing.reliability.label,'Review required');assert.equal(m.processing.routing.reviewRequired,true);assert.equal(m.processing.routing.qualityThreshold,85);assert.equal(f.calls.length,1);
});

test('cancelling during the required escalation prevents an answer or duplicate inference',async t=>{
 const f=setup(t,{respond:()=>answer({required_tier:'high'})}),token=await offer(f);
 await f.core.queueChatWhenMemoryFree({chatId:f.chat.id,token});f.setFree(3*GIB);
 for(let i=0;i<100&&f.calls.length===0;i++)await new Promise(r=>setTimeout(r,5));assert.equal(f.calls.length,1);f.core.stop(f.chat.id);f.setFree(12*GIB);const m=await settle(f);
 assert.equal(m.memoryWait.state,'cancelled');assert.equal(f.calls.length,1);assert.ok(m.error);assert.equal(f.core.resources.ai,null);assert.equal(f.core.resources.background,null);
});

test('the waiting status names the actual required brain during escalation',async t=>{
 const f=setup(t,{respond:tier=>answer(tier==='small'?{required_tier:'high'}:{})}),token=await offer(f);
 await f.core.queueChatWhenMemoryFree({chatId:f.chat.id,token});f.setFree(3*GIB);
 for(let i=0;i<100&&f.core.chat(f.chat.id).messages.at(-1).memoryWait.tier!=='high';i++)await new Promise(r=>setTimeout(r,5));
 const waiting=f.core.chat(f.chat.id).messages.at(-1).memoryWait;assert.equal(waiting.tier,'high');assert.equal(waiting.model,'Synthetic high');assert.equal(f.calls.length,1);
 f.setFree(12*GIB);assert.equal((await settle(f)).processing.routing.selectedTier,'high');assert.equal(f.calls.length,2);
});

test('a different catalog model cannot take over a saved routing checkpoint',async t=>{
 const f=setup(t,{free:3*GIB,respond:()=>answer({required_tier:'high'})}),token=await offer(f);
 f.rows[0]={...f.rows[0],id:'replacement-small',file:'replacement-small.gguf'};
 await f.core.queueChatWhenMemoryFree({chatId:f.chat.id,token});f.setFree(12*GIB);const m=await settle(f);
 assert.equal(m.error.code,'CHANGED');assert.equal(f.calls.length,1);assert.equal(m.memoryWait.state,'failed');
});

test('failed inference attempts also retain the original two-call budget after a RAM wait',async t=>{
 const f=setup(t,{free:3*GIB,respond:(tier,n)=>{if(n===1)throw require('../source/security.cjs').fail('LOCAL_UNAVAILABLE');return answer(tier==='small'?{required_tier:'high'}:{});}}),token=await offer(f);
 assert.deepEqual(f.calls.map(c=>c.tier),['small']);await f.core.queueChatWhenMemoryFree({chatId:f.chat.id,token});f.setFree(12*GIB);const m=await settle(f);
 assert.deepEqual(f.calls.map(c=>c.tier),['small','medium']);assert.equal(m.processing.routing.selectedTier,'medium');
});

test('an early RAM offer retains its original eligible warm brain after other work changes it',async t=>{
 const f=setup(t,{free:0.9*GIB,respond:()=>answer()}),high=f.rows[2];f.core.saveSettings({keepBrainMinutes:1});
 f.core.router.warmTier={tier:'high',time:Date.now()};Object.assign(f.core.router.local,{state:'ready',activeSettings:{...f.core.settings(),localModelPath:high.file}});
 const token=await offer(f);assert.equal(f.core.chatMemoryWait.offers.get(token).row.tier,'high');
 f.core.router.warmTier={tier:'small',time:Date.now()};f.core.router.local.state='unloaded';
 await f.core.queueChatWhenMemoryFree({chatId:f.chat.id,token});f.setFree(12*GIB);const m=await settle(f);
 assert.deepEqual(f.calls.map(c=>c.tier),['high']);assert.equal(m.processing.routing.selectedTier,'high');
});

test('changing the quality threshold invalidates an old wait offer',async t=>{
 const f=setup(t,{respond:()=>answer()}),token=await offer(f);f.core.saveSettings({escalationThreshold:90});
 await assert.rejects(f.core.queueChatWhenMemoryFree({chatId:f.chat.id,token}));assert.equal(f.calls.length,0);
});

test('restart retains the request but never silently repeats a session-only RAM continuation',async t=>{
 let restarted;t.after(()=>restarted?.close());const f=setup(t,{respond:()=>answer()}),token=await offer(f);
 await f.core.queueChatWhenMemoryFree({chatId:f.chat.id,token});f.core.close();
 const {Store}=require('../source/database.cjs'),{Core}=require('../source/core.cjs'),path=require('node:path');
 restarted=new Core({root:f.root,store:new Store(path.join(f.root,'privateai.db'),f.cipher),client:{generate:()=>assert.fail('Restart is not authorization to replay')},machine:'synthetic-machine'});
 const c=restarted.chat(f.chat.id);assert.equal(c.messages.length,2);assert.match(c.messages[0].text,/Hello from a synthetic complete request/);assert.equal(c.messages[1].memoryWait.state,'interrupted');assert.equal(restarted.requests.size,0);assert.equal(f.calls.length,0);
});

for(const kind of ['facts','calculations','citations','missing-data'])test('queued '+kind+' preserves the exact supplied source and normal evidence evaluation',async t=>{
 const source='SYNTHETIC stock count: alpha 12; beta 7; total 19. Medication feed unavailable; medication status unknown.';
 const f=setup(t,{tier:'high',respond:()=>answer({answer:kind==='missing-data'?'Medication status is unknown.':'Alpha 12 plus beta 7 is total 19.',evidence:[source]})});
 const file=await upload(f,source),token=await offer(f,'Use only the supplied document; verify '+kind+'.',{fileIds:[file]}),entry=f.core.chatMemoryWait.offers.get(token),expected=structuredClone(entry.input.messages);
 await f.core.queueChatWhenMemoryFree({chatId:f.chat.id,token});f.setFree(12*GIB);const m=await settle(f);
 assert.deepEqual(f.calls[0].m,expected);assert.equal(f.calls[0].s.localMaxOutput,192);assert.equal(m.processing.reliability.score,86);assert.equal(m.processing.routing.reviewRequired,false);assert.equal(m.incomplete,undefined);
 assert.match(m.text,kind==='missing-data'?/unknown/:/12.*7.*19/);assert.equal(f.calls.length,1);
});
