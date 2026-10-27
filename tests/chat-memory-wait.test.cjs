'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
const GIB=1024**3;
function setup(t){
 const f=fixture(t),calls=[];let free=2*GIB;
 f.core.saveSettings({processingMode:'local-only',allowCloud:false,localTier:'small',localMaxTier:'small',localContext:2048,localMaxOutput:192,ramRecoverySeconds:0});
 const row={tier:'small',name:'Synthetic Small',file:'synthetic-small.gguf',bytes:1282439584,installed:true};
 f.core.modelManager={catalog:()=>[row],verifyTier:async()=>row};
 f.core.router.local={state:'unloaded',validate:()=>row.bytes,modelName:()=>row.name,close(){},stop(){},waitStopped:async()=>{},generate:async(settings,messages,options)=>{calls.push({settings,messages,options});return {text:JSON.stringify({answer:'Synthetic completed reply.',evidence:[],uncertainties:[]}),localTokens:5};}};
 f.core.resources.memory=()=>free;
 const c=f.core.createChat();return {...f,c,calls,setFree:n=>{free=n;f.core.resources.notify();}};
}
async function offered(f){const result=await f.core.send({chatId:f.c.id,prompt:'Synthetic complete request for the selected brain.'});const answer=result.chat.messages.at(-1);assert.equal(answer.error.code,'LOW_MEMORY');assert.equal(typeof answer.memoryWait?.token,'string');assert.equal(f.calls.length,0);return answer.memoryWait.token;}
async function settled(core,id){for(let i=0;i<100;i++){if(!core.requests.has(id))return;await new Promise(r=>setTimeout(r,5));}assert.fail('Memory-wait request did not settle');}
test('RAM wait resumes the original local request exactly once without appending chat turns',async t=>{
 const f=setup(t),token=await offered(f);const queued=await f.core.queueChatWhenMemoryFree({chatId:f.c.id,token});assert.equal(queued.chat.messages.at(-1).memoryWait.state,'waiting');assert.equal(f.calls.length,0);
 await assert.rejects(f.core.queueChatWhenMemoryFree({chatId:f.c.id,token}));
 f.setFree(8*GIB);await settled(f.core,f.c.id);const c=f.core.chat(f.c.id);assert.equal(c.messages.length,2);assert.equal(c.messages[1].text,'Local draft — not sufficiently verified.\n\nSynthetic completed reply.');assert.equal(c.messages[1].error,undefined);assert.equal(f.calls.length,1);assert.equal(f.calls[0].settings.localModelPath,'synthetic-small.gguf');assert.match(JSON.stringify(f.calls[0].messages),/Synthetic complete request for the selected brain/);assert.equal(f.calls[0].settings.localContext,2048);assert.equal(f.calls[0].settings.allowCloud,false);
});
test('stopping a RAM wait prevents a later model call and retains the original prompt',async t=>{
 const f=setup(t),token=await offered(f);await f.core.queueChatWhenMemoryFree({chatId:f.c.id,token});f.core.stop(f.c.id);f.setFree(8*GIB);await settled(f.core,f.c.id);assert.equal(f.calls.length,0);assert.equal(f.core.chat(f.c.id).messages.length,2);assert.match(f.core.chat(f.c.id).messages[0].text,/Synthetic complete request/);
});
test('lock cancels RAM waits and stale offers cannot restart after unlock',async t=>{
 const f=setup(t),token=await offered(f);await f.core.queueChatWhenMemoryFree({chatId:f.c.id,token});f.core.lock();f.setFree(8*GIB);await settled(f.core,f.c.id);assert.equal(f.calls.length,0);f.core.unlock();await assert.rejects(f.core.queueChatWhenMemoryFree({chatId:f.c.id,token}));
});
test('changed model settings invalidate a saved wait offer instead of choosing another brain',async t=>{
 const f=setup(t),token=await offered(f);f.core.saveSettings({localContext:4096});f.setFree(8*GIB);await assert.rejects(f.core.queueChatWhenMemoryFree({chatId:f.c.id,token}));assert.equal(f.calls.length,0);
});
test('deleted chats cannot be resurrected by queued completion',async t=>{
 const f=setup(t),token=await offered(f);await f.core.queueChatWhenMemoryFree({chatId:f.c.id,token});f.core.deleteChat(f.c.id);f.setFree(8*GIB);await settled(f.core,f.c.id);assert.equal(f.calls.length,0);assert.equal(f.core.store.get('chat',f.c.id),null);
});
test('archiving a RAM-wait chat releases background ownership without waiting for more memory',async t=>{
 const f=setup(t),token=await offered(f);await f.core.queueChatWhenMemoryFree({chatId:f.c.id,token});
 await new Promise(r=>setTimeout(r,5));f.core.archiveChat(f.c.id);await settled(f.core,f.c.id);
 assert.equal(f.core.resources.background,null);assert.equal(f.calls.length,0);assert.equal(f.core.chat(f.c.id).archived,true);assert.equal(f.core.chatMemoryWait.offers.size,0);
});
test('memory error metadata is numeric and cannot expose arbitrary error properties',()=>{
 const {safeError,fail}=require('../source/security.cjs'),error=fail('LOW_MEMORY');error.ram={requiredBytes:3*GIB,availableBytes:2*GIB,secret:'private'};error.localSettings={localModelPath:'sensitive'};assert.deepEqual(safeError(error).ram,{requiredBytes:3*GIB,availableBytes:2*GIB});assert.ok(!JSON.stringify(safeError(error)).includes('sensitive'));
});
test('temporary-chat RAM waits remain temporary and stop when the chat ends',async t=>{
 const f=setup(t);f.c=f.core.createChat({temporary:true});const token=await offered(f);await f.core.queueChatWhenMemoryFree({chatId:f.c.id,token});assert.equal(f.core.store.get('chat',f.c.id),null);f.core.endTemporary(f.c.id);f.setFree(8*GIB);await settled(f.core,f.c.id);assert.equal(f.calls.length,0);assert.equal(f.core.temporary.has(f.c.id),false);
});
test('editing the saved request rejects the old wait offer',async t=>{
 const f=setup(t),token=await offered(f),c=f.core.chat(f.c.id);c.messages[0].text='Synthetic changed request';f.core.saveChat(c);f.setFree(8*GIB);await assert.rejects(f.core.queueChatWhenMemoryFree({chatId:f.c.id,token}));assert.equal(f.calls.length,0);
});
test('expired wait snapshots are released without rewriting history on read',async t=>{
 const f=setup(t),token=await offered(f),entry=f.core.chatMemoryWait.offers.get(token);entry.created=Date.now()-16*60000;let writes=0;const put=f.core.store.put.bind(f.core.store);f.core.store.put=(...args)=>{writes++;return put(...args);};const c=f.core.chat(f.c.id);assert.equal(c.messages.at(-1).memoryWait.state,'interrupted');assert.equal(writes,0);assert.equal(f.core.chatMemoryWait.offers.has(token),false);
});
test('an approved background chat waits for its brain without needing a desktop wait button',async t=>{
 const f=setup(t);let waits=0;f.core.resources.sleep=async()=>{f.setFree(8*GIB);if(++waits>2)assert.fail('Background recovery must progress');};
 const result=await f.core.runMessagingBackground(()=>f.core.send({chatId:f.c.id,prompt:'Synthetic complete background request.'}));
 assert.equal(result.chat.messages.at(-1).error,undefined);assert.equal(result.chat.messages.at(-1).memoryWait,undefined);assert.equal(f.calls.length,1);assert.equal(waits,1);
});
