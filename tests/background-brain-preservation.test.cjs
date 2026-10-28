'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs'),{sectionedReport}=require('../source/sectioned-report.cjs'),drafts=require('../source/assistant-drafts.cjs'),captures=require('../source/capture-workflows.cjs');
const GIB=1024**3,turn=()=>new Promise(r=>setTimeout(r,5));
function setup(t,source,{missingSmall=false}={}){
 let core,pending,memory=3*GIB;const controller=new AbortController();
 t.after(async()=>{controller.abort();core?.resources.notify();await pending?.catch(()=>{});});
 const f=fixture(t);core=f.core;const calls=[],rows=['small','medium','high'].map((tier,i)=>({tier,id:'synthetic-'+tier,name:'Synthetic '+tier,file:'synthetic-'+tier+'.gguf',bytes:[1282439584,2*GIB,4*GIB][i],installed:!(missingSmall&&tier==='small')}));
 core.saveSettings({hipaa:false,publicModeConfirmed:true,processingMode:'smart-hybrid',allowCloud:true,localTier:'auto',localMaxTier:'high',localContext:2048,localMaxOutput:192,workerPaused:false,ramRecoverySeconds:0});
 core.saveSettings({approved:true,approvalFingerprint:core.summary().providerApprovalFingerprint});
 core.modelManager={catalog:()=>rows,verifyTier:async tier=>rows.find(r=>r.tier===tier)};
 core.router.local={state:'unloaded',validate:s=>rows.find(r=>r.file===s.localModelPath).bytes,modelName:s=>s.localModelPath,close(){},stop(){},waitStopped:async()=>{},generate:async(s,m,o)=>{const tier=rows.find(r=>r.file===s.localModelPath).tier;calls.push({tier,m:structuredClone(m)});return {text:JSON.stringify({required_tier:'high',answer:source,evidence:[source],uncertainties:[]}),localTokens:4,incomplete:false};}};
 core.resources.memory=()=>memory;
 return {...f,cloudCalls:f.calls,calls,controller,start(p){pending=p;p.catch(()=>{});return p;},setFree(n){memory=n;core.resources.notify();}};
}
async function waitForPause(f){for(let i=0;i<100&&f.core.resources.background?.state!=='paused';i++)await turn();}
for(const missingSmall of [false,true])test('sectioned report preserves its brain/checkpoint'+(missingSmall?' with cloud eligible and Small unavailable':''),{timeout:10000},async t=>{
 const source='SYNTHETIC remaining source: inventory count 42.',f=setup(t,source,{missingSmall}),messages=[{role:'user',content:[{type:'input_text',text:'Compare the complete evidence.'},{type:'input_text',text:'UNTRUSTED DOCUMENT REFERENCE: '+source}]}],saved={text:'SYNTHETIC completed first section.',provider:'local',model:'Synthetic high',incomplete:false};
 const checkpoint={sectionPlan:[{document:1,index:1,messages},{document:1,index:2,messages}],sections:[saved]};
 const work=f.start(f.core.resources.task('background',()=>sectionedReport(f.core,{prompt:'Compare the supplied sections.',hipaa:false},[],checkpoint,()=>f.core.store.put('synthetic_checkpoint','report',checkpoint),f.controller.signal),{signal:f.controller.signal}));
 await waitForPause(f);assert.equal(f.calls.length,0,'RAM must not authorize a smaller brain');assert.equal(f.cloudCalls.length,0,'RAM is not permission to use the approved cloud');assert.equal(f.core.resources.background?.state,'paused');assert.equal(checkpoint.sections.length,1);assert.deepEqual(f.core.store.get('synthetic_checkpoint','report').sections,[saved]);
 f.setFree(9*GIB);const result=await work;assert.deepEqual(f.calls.map(c=>c.tier),['high']);assert.equal(f.cloudCalls.length,0);assert.deepEqual(f.calls[0].m,messages);assert.deepEqual(checkpoint.sections[0],saved);assert.equal(checkpoint.sections.length,2);assert.match(result.text,/completed first section/);assert.match(result.text,/inventory count 42/);assert.equal(f.calls.length,1);assert.equal(f.core.requests.size,0);
});
for(const cancel of [false,true])test('automatic draft retains required escalation while RAM waits'+(cancel?' and lock cancels it':''),{timeout:10000},async t=>{
 const source='SYNTHETIC complete note: review the conference door.',f=setup(t,source),capture=captures.create(f.core,{sourceId:require('node:crypto').randomUUID(),text:source}).capture,before=f.core.store.list('todo');
 const work=f.start(drafts.retry(f.core,{kind:'capture_note',id:capture.id}));await waitForPause(f);
 assert.deepEqual(f.calls.map(c=>c.tier),['small']);assert.equal(f.core.resources.background?.state,'paused');assert.equal(f.core.store.get('capture_note',capture.id).assistantDraft.status,'working');assert.equal(f.core.requests.size,1);
 if(cancel){const rejected=assert.rejects(work,{code:'CANCELLED'});f.core.lock();await rejected;f.setFree(9*GIB);assert.deepEqual(f.calls.map(c=>c.tier),['small']);assert.equal(f.core.store.get('capture_note',capture.id).assistantDraft.status,'needs-review');}
 else{f.setFree(9*GIB);await work;assert.deepEqual(f.calls.map(c=>c.tier),['small','high']);const row=f.core.store.get('capture_note',capture.id);assert.equal(row.assistantDraft.status,'ready');assert.match(row.assistantDraft.model,/high/i);assert.ok(f.calls[1].m[0].content.some(p=>p.text.includes(source)));}
 assert.equal(f.core.resources.background,null);assert.equal(f.core.requests.size,0);assert.equal(f.calls.filter(c=>c.tier==='small').length,1);assert.equal(f.cloudCalls.length,0);assert.equal(f.core.resources.ai,null);assert.equal(f.core.store.list('usage').filter(u=>!['local','deterministic'].includes(u.provider)).length,0);assert.deepEqual(f.core.store.list('todo'),before);
});
