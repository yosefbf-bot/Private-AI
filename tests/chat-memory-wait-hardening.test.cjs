'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
const {fail}=require('../source/security.cjs');
const GIB=1024**3;
function setup(t){
 const f=fixture(t);let memory=2*GIB,calls=0;
 const row={tier:'small',name:'Synthetic Small',file:'synthetic-small.gguf',bytes:1282439584,installed:true};
 f.core.saveSettings({processingMode:'local-only',allowCloud:false,localTier:'small',localContext:2048,localMaxOutput:192,ramRecoverySeconds:0});
 f.core.modelManager={catalog:()=>[row],verifyTier:async()=>row};
 f.core.router.local={state:'unloaded',validate:()=>row.bytes,close(){},generate:async()=>{calls++;return {text:JSON.stringify({answer:'Synthetic reply',evidence:[],uncertainties:[]})};}};
 f.core.resources.memory=()=>memory;const chat=f.core.createChat();return {...f,chat,row,setMemory:n=>{memory=n;f.core.resources.notify();},calls:()=>calls};
}
async function offer(f){const result=await f.core.send({chatId:f.chat.id,prompt:'Synthetic complete request.'});return result.chat.messages.at(-1).memoryWait?.token;}
test('a failed queue status write cannot prevent locking or retaining the original message',async t=>{
 const f=setup(t);assert.ok(await offer(f));const put=f.core.store.put.bind(f.core.store);f.core.store.put=(kind,...args)=>{if(kind==='chat')throw fail('STORAGE');return put(kind,...args);};
 assert.doesNotThrow(()=>f.core.lock());assert.equal(f.core.locked,true);assert.equal(f.core.chatMemoryWait.offers.size,0);assert.equal(f.core.store.get('chat',f.chat.id).messages.length,2);
});
test('a failed queue status write cannot prevent shutdown',async t=>{
 const f=setup(t);assert.ok(await offer(f));const put=f.core.store.put.bind(f.core.store);f.core.store.put=(kind,...args)=>{if(kind==='chat')throw fail('STORAGE');return put(kind,...args);};
 assert.doesNotThrow(()=>f.core.close());assert.equal(f.core.chatMemoryWait.offers.size,0);assert.equal(f.core.store.db,null);
});
test('a failed queue setup rolls back the request claim instead of leaving BUSY forever',async t=>{
 const f=setup(t),token=await offer(f);assert.ok(token);const put=f.core.store.put.bind(f.core.store);let failed=false;f.core.store.put=(kind,...args)=>{if(kind==='chat'&&!failed){failed=true;throw fail('STORAGE');}return put(kind,...args);};
 await assert.rejects(f.core.queueChatWhenMemoryFree({chatId:f.chat.id,token}));assert.equal(f.core.requests.has(f.chat.id),false);assert.equal(f.core.chatMemoryWait.offers.has(token),false);
});
test('selected catalog model has the same foreground RAM-wait offer',async t=>{
 const f=setup(t);f.core.saveSettings({localTier:'selected',localModelPath:f.row.file});assert.equal(typeof await offer(f),'string');assert.equal(f.calls(),0);
});
test('a request below the initial reserve can wait without running a model or tools',async t=>{
 const f=setup(t);f.setMemory(0.9*GIB);const token=await offer(f);assert.equal(typeof token,'string');assert.equal(f.calls(),0);
 await f.core.queueChatWhenMemoryFree({chatId:f.chat.id,token});f.core.stop(f.chat.id);
 for(let i=0;i<100&&f.core.requests.has(f.chat.id);i++)await new Promise(r=>setTimeout(r,5));assert.equal(f.calls(),0);
});
test('a cloud-first request below the reserve does not offer a different local route',async t=>{
 const f=setup(t);f.core.saveSettings({processingMode:'cloud-first',allowCloud:true});f.setMemory(0.9*GIB);
 const result=await f.core.send({chatId:f.chat.id,prompt:'Synthetic full request.'});assert.equal(result.chat.messages.at(-1).error.code,'LOW_MEMORY');assert.equal(result.chat.messages.at(-1).memoryWait,undefined);assert.equal(f.calls(),0);
});
test('a changed request invalidates its stale offer without claiming an AI request',async t=>{
 const f=setup(t),token=await offer(f),chat=f.core.chat(f.chat.id);chat.messages[0].text='Synthetic changed request';f.core.saveChat(chat);
 await assert.rejects(f.core.queueChatWhenMemoryFree({chatId:chat.id,token}),e=>e.code==='CHANGED');assert.equal(f.core.requests.has(chat.id),false);assert.equal(f.core.chatMemoryWait.offers.has(token),false);assert.equal(f.core.chat(chat.id).messages.at(-1).memoryWait.state,'interrupted');
});
test('automatic routing can offer the same complete simple request below the reserve',async t=>{
 const f=setup(t);f.core.saveSettings({localTier:'auto',localMaxTier:'high'});f.setMemory(0.9*GIB);assert.equal(typeof await offer(f),'string');assert.equal(f.calls(),0);
});
test('RAM blocked triage queues the full analysis for its selected answer brain',async t=>{
 const f=setup(t),high={...f.row,tier:'high',name:'Synthetic High',file:'synthetic-high.gguf',bytes:2490000000};f.core.modelManager.catalog=()=>[f.row,high];f.core.saveSettings({localTier:'auto',localMaxTier:'extra'});
 const result=await f.core.send({chatId:f.chat.id,prompt:'Analyze and compare the complete synthetic inputs.'}),wait=result.chat.messages.at(-1).memoryWait;
 assert.equal(wait?.tier,'high');const entry=f.core.chatMemoryWait.offers.get(wait.token);assert.match(JSON.stringify(entry.input.messages),/Analyze and compare the complete synthetic inputs/);assert.doesNotMatch(JSON.stringify(entry.input.messages),/task_excerpt/);assert.equal(f.calls(),0);
});
test('below-reserve web requests cannot become plain local inference',async t=>{
 const f=setup(t);f.core.saveSettings({hipaa:false,publicModeConfirmed:true,processingMode:'smart-hybrid',allowCloud:true});f.chat=f.core.createChat();f.setMemory(0.9*GIB);
 const result=await f.core.send({chatId:f.chat.id,prompt:'Synthetic web research request.',web:true});assert.equal(result.chat.messages.at(-1).error.code,'LOW_MEMORY');assert.equal(result.chat.messages.at(-1).memoryWait,undefined);assert.equal(f.calls(),0);
});
