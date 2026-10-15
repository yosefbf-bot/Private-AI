"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers.cjs'),{Core}=require('../source/core.cjs'),{Store}=require('../source/database.cjs');
const captures=require('../source/capture-workflows.cjs'),{fail}=require('../source/security.cjs');
const {quiesceAutomaticEnrichment,assertNoActiveRequests}=require('../source/windows-validation-lifecycle.cjs');
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function setup(t){
 t.mock.timers.enable({apis:['setInterval']});
 const cleanup=[],f=fixture({after:fn=>cleanup.push(fn)}),context={...f,current:f.core};
 t.after(()=>{if(context.current.store.db)context.current.close();for(const fn of cleanup)fn();});
 f.core.saveSettings({processingMode:'local-only',allowCloud:false,localTier:'selected',localModelPath:'synthetic-model.gguf',workerPaused:false});
 f.core.resources.memory=()=>8*1024**3;
 return context;
}
function reopen(f){
 f.current=new Core({root:f.root,store:new Store(path.join(f.root,'privateai.db'),f.cipher),machine:'synthetic-machine'});
 return f.current;
}
test('ordinary active automatic draft shutdown retains the unclean marker and recovery pause',async t=>{
 const f=setup(t),core=f.core;let begin;
 const entered=new Promise(resolve=>begin=resolve);
 core.router.local={close(){}};
 core.router.generate=async(_key,_settings,_messages,{signal})=>{begin();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(fail('CANCELLED')),{once:true}));};
 captures.create(core,{sourceId:'synthetic-active-draft-shutdown',text:'Synthetic note for an optional local draft.'});
 t.mock.timers.tick(10000);await entered;
 assert.equal(core.requests.size,1);
 assert.throws(()=>assertNoActiveRequests(core),error=>error.code==='VALIDATION_BUSY'&&error.message.endsWith('count=1; kinds=assistant-draft'));
 core.close();await turn();
 const next=reopen(f);assert.equal(next.stability.safe,true);assert.equal(next.settings().workerPaused,true);
 assert.equal(next.stability.incidents.at(-1).event,'unclean-start');
});
test('quiesced isolated timer cannot start enrichment and a completed foreground fixture restarts cleanly',async t=>{
 const f=setup(t),core=f.core;let automaticStarts=0;
 core.router.local={generate:async()=>{automaticStarts++;throw fail('LOCAL_UNAVAILABLE');},modelName:()=> 'synthetic',close(){}};
 const capture=captures.create(core,{sourceId:'synthetic-quiesced-shutdown',text:'Synthetic note must remain available without background inference.'}).capture;
 assert.deepEqual(quiesceAutomaticEnrichment(core),{automaticSpeechAndDraftTimerQuiesced:true,concurrentEnrichmentShutdownVerified:false});
 t.mock.timers.tick(30000);await turn();
 assert.equal(automaticStarts,0);assert.equal(core.store.get('capture_note',capture.id).assistantDraft,undefined);
 assert.equal(core.settings().workerPaused,false);
 const chat=core.createChat(),response=await core.send({chatId:chat.id,prompt:'/calc 2+3'});assert.match(response.chat.messages.at(-1).text,/5/);
 assert.deepEqual(assertNoActiveRequests(core),{activeRequests:0,requestKinds:[]});
 core.close();const next=reopen(f);
 assert.equal(next.stability.safe,false);assert.equal(next.settings().workerPaused,false);
 assert.equal(next.chat(chat.id).messages.length,2);assert.equal(next.store.get('capture_note',capture.id).assistantDraft,undefined);
});
test('active-request diagnostics remain bounded and do not cancel, delete or disclose identifiers',()=>{
 const privateData='SYNTHETIC sensitive path, prompt, token and identifier';
 const requests=new Map([['assistant-draft:'+privateData,{}],['local-speech',{}],[privateData,{}]]);
 assert.throws(()=>assertNoActiveRequests({requests}),error=>{
  assert.equal(error.code,'VALIDATION_BUSY');assert.equal(error.message,'Controlled Windows acceptance still has active requests: count=3; kinds=assistant-draft,local-speech,other');assert.equal(error.message.includes(privateData),false);return true;
 });
 assert.equal(requests.size,3);
});
