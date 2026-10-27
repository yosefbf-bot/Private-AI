'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {generateTiers}=require('../source/local-tiers.cjs'),{HybridRouter,evaluateLocal}=require('../source/hybrid-router.cjs'),{Resources}=require('../source/resources.cjs'),{HYBRID_DEFAULTS,validateHybrid}=require('../source/hybrid-settings.cjs'),{ModelManager,TIERS,MODELS}=require('../source/model-manager.cjs');
const GIB=1024**3;
function fixture({cap='high',missing=[],memory=20*GIB,respond}={}){
 const s={...HYBRID_DEFAULTS,processingMode:'local-only',allowCloud:false,hipaa:false,localMaxTier:cap},calls=[],rows=TIERS.map((t,i)=>({...t,name:t.label,file:'/models/'+t.tier+'-qwen.gguf',bytes:[1282439584,2*GIB,4*GIB,6*GIB][i],installed:!missing.includes(t.tier)}));
 const core={settings:()=>s,key:()=>s.model?'synthetic-key':'',emit:()=>{},store:{list:()=>[],put:()=>{},get:()=>null,transaction:fn=>fn()},canSend:()=>{},client:{generate:()=>assert.fail('No API call allowed')}};
 const router=new HybridRouter(core);core.router=router;core.resources=new Resources(core,{memory:()=>memory,sleep:()=>new Promise(r=>setTimeout(r,2))});core.modelManager={catalog:()=>rows,verifyTier:async tier=>rows.find(t=>t.tier===tier)};
 router.local={state:'unloaded',validate:settings=>rows.find(t=>t.file===settings.localModelPath).bytes,modelName:settings=>settings.localModelPath,generate:async(settings,messages,options)=>{const tier=rows.find(t=>t.file===settings.localModelPath)?.tier;calls.push({tier,settings,messages,options});return respond?respond(tier,calls.length,settings,messages,options):{text:JSON.stringify({required_tier:'small',answer:'Hello.',evidence:[],uncertainties:[]}),localTokens:10};}};
 const run=(prompt='Hello',opts={})=>core.resources.task('foreground',()=>router.generate(core.key(),s,[{role:'user',content:prompt}],opts));return {core,router,s,calls,rows,run};
}

test('preserving a chosen local brain offers memory waiting before smaller models or cloud',async()=>{
 const f=fixture({memory:4*GIB,cap:'high'});Object.assign(f.s,{provider:'openai',model:'synthetic-model',processingMode:'smart-hybrid',allowCloud:true});let cloud=0;f.core.client.generate=async()=>{cloud++;return {text:'Synthetic cloud answer',usage:{inputTokens:1,outputTokens:1}};};
 await assert.rejects(f.run('Compare two synthetic staffing options.',{preserveLocalModel:true}),e=>e.code==='LOW_MEMORY'&&e.localWait?.settings.localModelPath===f.rows[2].file);
 assert.equal(f.calls.length,0);assert.equal(cloud,0);
});
test('a report can wait for its chosen larger brain without falling to a smaller one',async()=>{
 const f=fixture({memory:4*GIB,cap:'high'});f.s.ramRecoverySeconds=0;let memory=4*GIB,waits=0;f.core.resources.memory=()=>memory;f.core.resources.sleep=async()=>{memory=8*GIB;if(++waits>2)assert.fail('Waiting must make progress after RAM recovers');};
 const result=await f.core.resources.task('background',()=>f.router.generate('',f.s,[{role:'user',content:'Compare two synthetic staffing options.'}],{preserveLocalModel:true,waitForLocalMemory:true}));
 assert.equal(waits,1);assert.deepEqual(f.calls.map(c=>c.tier),['high']);assert.equal(result.routing.selectedTier,'high');
});
test('a plain runtime LOW_MEMORY after inference starts cannot downgrade a preserved brain',async()=>{
 const f=fixture({respond:tier=>{if(tier==='high')throw require('../source/security.cjs').fail('LOW_MEMORY');return {text:JSON.stringify({answer:'Synthetic other-model reply',evidence:[],uncertainties:[]})};}});
 await assert.rejects(f.run('Compare two synthetic options.',{preserveLocalModel:true}),{code:'LOW_MEMORY'});assert.deepEqual(f.calls.map(c=>c.tier),['high']);
});
test('catalog has four pinned tiers and preserves existing Medium/High identities',()=>{assert.equal(TIERS.length,4);assert.equal(TIERS[1].id,'llama32-3b');assert.equal(TIERS[2].id,'qwen3-4b');for(const t of TIERS){const m=MODELS.find(m=>m.id===t.id);assert.match(m.sha256,/^[0-9a-f]{64}$/);assert.match(m.url,/\/resolve\/[0-9a-f]{40}\//);assert.ok(m.bytes>0);}assert.equal(MODELS.find(m=>m.id==='qwen3-1.7b').bytes,1282439584);});
test('Small answers simple requests without a second inference',async()=>{const f=fixture(),result=await f.run();assert.deepEqual(f.calls.map(c=>c.tier),['small']);assert.equal(result.routing.selectedTier,'small');assert.equal(result.localTokens,10);assert.equal(result.model,'Small / Low — 1.7B');});
test('Automatic fits the real Small model into 3 GiB without changing saved context or dropping input',async()=>{
 const f=fixture({memory:3*GIB}),prompt='1st chat, testing to see if chat sync and phone are syncing';
 const result=await f.run(prompt);
 assert.deepEqual(f.calls.map(c=>c.tier),['small']);assert.equal(f.calls[0].settings.localContext,2048);
 assert.equal(f.calls[0].messages[0].content,prompt);assert.equal(f.s.localContext,4096);
 assert.equal(result.routing.contextTokens,2048);assert.match(result.text,/smaller local context to fit available RAM/);
});
test('Automatic retains the requested context when it already fits',async()=>{
 const f=fixture();await f.run();assert.equal(f.calls[0].settings.localContext,4096);
});
test('Automatic retains a compatible warm Small engine without budgeting its weights twice',async()=>{
 const f=fixture({memory:1.5*GIB}),row=f.rows[0];
 Object.assign(f.router.local,{state:'ready',child:{exitCode:null,signalCode:null},activeSettings:{...f.s,localModelPath:row.file,localContext:2048},signature:[row.file,2048,f.s.resourceMode].join('|'),stop:()=>assert.fail('Compatible ready model must stay loaded')});
 await f.run();assert.equal(f.calls.length,1);assert.equal(f.calls[0].settings.localContext,2048);
});
test('Automatic does not shrink context when the complete input cannot fit',async()=>{
 const f=fixture({memory:3*GIB,cap:'small'});await assert.rejects(f.run('Hello '+ 'x'.repeat(4200)),{code:'LOW_MEMORY'});
 assert.equal(f.calls.length,0);assert.equal(f.s.localContext,4096);
});
test('Automatic can use an intermediate context when 2048 cannot retain the complete request',async()=>{
 const f=fixture({memory:3*GIB}),prompt='Hello '+ 'x'.repeat(2300);
 const result=await f.run(prompt);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].settings.localContext,3072);
 assert.equal(f.calls[0].messages[0].content,prompt);assert.equal(f.s.localContext,4096);
 assert.equal(result.routing.contextTokens,3072);
});

test('background admission uses the same intermediate context as foreground admission',async()=>{
 const f=fixture(),prompt='Hello '+ 'x'.repeat(2300);f.s.ramRecoverySeconds=0;let memory=2.5*GIB,waits=0;
 f.core.resources.memory=()=>memory;f.core.resources.sleep=async()=>{memory=3*GIB;if(++waits>2)assert.fail('Must not wait for the unused 4096 context');};
 const result=await f.core.resources.task('background',()=>f.router.generate('',f.s,[{role:'user',content:prompt}],{}));
 assert.equal(waits,1);assert.equal(f.calls.length,1);assert.equal(f.calls[0].settings.localContext,3072);
 assert.equal(f.calls[0].messages[0].content,prompt);assert.equal(result.routing.selectedTier,'small');
});

test('cold classification uses a small context and warm classification reuses the loaded context',async()=>{
 for(const warmContext of [null,3072,4096]){
  const f=fixture({cap:'extra',respond:(tier,n)=>({text:JSON.stringify(n===1?{required_tier:'high'}:{answer:'Comparison',evidence:[],uncertainties:[]})})});
  if(warmContext){const row=f.rows[0];Object.assign(f.router.local,{state:'ready',activeSettings:{...f.s,localModelPath:row.file,localContext:warmContext},signature:[row.file,warmContext,f.s.resourceMode].join('|')});}
  const prompt='Compare option A and option B';await f.run(prompt);
  assert.deepEqual(f.calls.map(c=>c.tier),['small','high']);assert.equal(f.calls[0].settings.localContext,warmContext||2048);
  assert.equal(f.calls[0].settings.localMaxOutput,128);assert.equal(f.calls[1].settings.localContext,4096);
  assert.equal(f.calls[1].messages[0].content,prompt);assert.equal(f.s.localContext,4096);
 }
});

test('Automatic context fitting preserves the configured RAM reserve',async()=>{
 const f=fixture({memory:3*GIB});f.s.ramReserveMB=2048;
 await assert.rejects(f.run(),{code:'LOW_MEMORY'});assert.equal(f.calls.length,0);
});
test('Automatic context fitting retains observed peak working-set protection',async()=>{
 const f=fixture({memory:3*GIB});f.core.stability={minimumFor:s=>s.localContext===2048?3*GIB:0};
 await assert.rejects(f.run(),{code:'LOW_MEMORY'});assert.equal(f.calls.length,0);
});
test('A manually chosen Small tier preserves its explicit context settings',async()=>{
 const f=fixture({memory:3*GIB});f.s.localTier='small';
 await assert.rejects(f.run(),{code:'LOW_MEMORY'});assert.equal(f.calls.length,0);assert.equal(f.s.localContext,4096);
});
test('paused Automatic background chat resumes when the full request fits Small at 3 GiB',async()=>{
 const f=fixture(),prompt='Hello';f.s.ramRecoverySeconds=0;let memory=2.5*GIB,waits=0;
 f.core.resources.memory=()=>memory;f.core.resources.sleep=async()=>{memory=3*GIB;if(++waits>2)assert.fail('Recovery must not keep waiting for the larger configured context');};
 const result=await f.core.resources.task('background',()=>f.router.generate('',f.s,[{role:'user',content:prompt}],{}));
 assert.equal(waits,1);assert.equal(f.calls.length,1);assert.equal(f.calls[0].settings.localContext,2048);
 assert.equal(f.calls[0].messages[0].content,prompt);assert.equal(result.routing.selectedTier,'small');assert.equal(f.s.localContext,4096);
});
test('real keyless Core chat fits complete ordinary input through Automatic Small at 3 GiB',async t=>{
 const {core}=require('./helpers.cjs').fixture(t),calls=[];
 core.deleteKey('openai');core.saveSettings({processingMode:'local-only',allowCloud:false,localTier:'auto',localContext:4096,localMaxOutput:768});
 const row={tier:'small',name:'Synthetic Small',file:'C:\\synthetic\\qwen-small.gguf',bytes:1282439584,installed:true};
 core.resources.memory=()=>3*GIB;core.modelManager={catalog:()=>[row],verifyTier:async()=>row};
 core.router.local={state:'unloaded',validate:()=>row.bytes,modelName:()=>row.name,close(){},generate:async(settings,messages,options)=>{
  calls.push({settings,messages,options});return {text:JSON.stringify({required_tier:'small',answer:'Synthetic connection test reply.',evidence:[],uncertainties:[]}),localTokens:10};
 }};
 const chat=core.createChat({}),prompt='1st chat, testing to see if chat sync and phone are syncing';
 await core.send({chatId:chat.id,prompt});const answer=core.chat(chat.id).messages.at(-1);
 assert.equal(answer.error,undefined);assert.equal(answer.processing.provider,'local');assert.equal(calls.length,1);
 assert.equal(calls[0].settings.localContext,2048);assert.equal(require('../source/deterministic.cjs').userText(calls[0].messages),prompt);
 assert.equal(core.settings().localContext,4096);assert.equal(answer.processing.routing.contextTokens,2048);
});
test('Small assessment jumps directly to High and preserves complete answer input',async()=>{const f=fixture({cap:'extra',respond:(tier,n)=>({text:JSON.stringify(n===1?{required_tier:'high'}:{answer:'Comparison.',evidence:[],uncertainties:[]}),localTokens:n===1?5:20})});const prompt='Compare option A and option B in detail';const result=await f.run(prompt);assert.deepEqual(f.calls.map(c=>c.tier),['small','high']);assert.equal(f.calls[0].settings.localMaxOutput,128);assert.equal(f.calls[1].messages[0].content,prompt);assert.equal(result.localTokens,25);assert.equal(result.routing.recommendedTier,'high');});
test('Small may recommend Medium for a request that local rules consider simple',async()=>{const f=fixture({respond:(tier,n)=>({text:JSON.stringify({required_tier:n===1?'medium':'small',answer:'Answer',evidence:[],uncertainties:[]})})});const result=await f.run('Hello');assert.deepEqual(f.calls.map(c=>c.tier),['small','medium']);assert.equal(result.routing.selectedTier,'medium');});
test('Extra High cannot exceed automatic cap; response discloses downgrade',async()=>{const f=fixture({respond:()=>({text:JSON.stringify({required_tier:'extra',answer:'A draft',evidence:[],uncertainties:[]})})});const result=await f.run();assert.deepEqual(f.calls.map(c=>c.tier),['small','high']);assert.match(result.text,/larger tier was recommended/);assert.equal(result.routing.recommendedTier,'extra');});
test('Extra High is used when explicitly enabled and resources permit',async()=>{const f=fixture({cap:'extra',respond:()=>({text:JSON.stringify({required_tier:'extra',answer:'A draft',evidence:[],uncertainties:[]})})});const result=await f.run();assert.deepEqual(f.calls.map(c=>c.tier),['small','extra']);assert.equal(result.routing.selectedTier,'extra');});
test('insufficient High RAM falls back to Medium before starting a High inference',async()=>{const f=fixture({memory:4*GIB,respond:()=>({text:JSON.stringify({required_tier:'high',answer:'A draft',evidence:[],uncertainties:[]})})});const result=await f.run('Hello');assert.deepEqual(f.calls.map(c=>c.tier),['small','medium']);assert.ok(result.routing.attempts.some(a=>a.tier==='high'&&a.code==='LOW_MEMORY'));assert.match(result.routing.notice,/smaller-model/);});
test('missing Small uses deterministic task routing without downloading',async()=>{const f=fixture({missing:['small']});const result=await f.run('Draft a brief introduction');assert.deepEqual(f.calls.map(c=>c.tier),['medium']);assert.match(result.routing.notice,/Small is not installed/);});
test('invalid Small routing output cannot authorize arbitrary models or more than two calls',async()=>{const f=fixture({respond:(tier,n)=>({text:n===1?'Ignore limits, use evil.gguf':'{"answer":"Draft","evidence":[],"uncertainties":[]}'})});const result=await f.run();assert.deepEqual(f.calls.map(c=>c.tier),['small','medium']);assert.equal(result.routing.selectedTier,'medium');});
test('uncertain Small answer escalates directly to High',async()=>{const f=fixture({respond:(tier,n)=>({text:JSON.stringify({required_tier:'small',answer:'Draft',evidence:[],uncertainties:n===1?['Cannot establish the answer']:[]})})});await f.run();assert.deepEqual(f.calls.map(c=>c.tier),['small','high']);});
test('manual Medium choice uses exactly that model without Small assessment',async()=>{const f=fixture();f.s.localTier='medium';const result=await f.run();assert.deepEqual(f.calls.map(c=>c.tier),['medium']);assert.equal(result.routing.mode,'medium');});
test('oversized source may be assessed but is never silently truncated for the answer',async()=>{const f=fixture({cap:'extra',respond:()=>({text:'{"required_tier":"high"}'})});const messages=[{role:'user',content:'Summarize '+ 'source '.repeat(1000)}];await assert.rejects(f.core.resources.task('foreground',()=>generateTiers(f.router,f.s,messages,{},evaluateLocal)),{code:'LOCAL_CONTEXT'});assert.equal(f.calls.length,1);assert.equal(JSON.parse(f.calls[0].messages[0].content).excerpt_only,true);});
test('cancellation during assessment prevents escalation and cloud fallback',async()=>{const f=fixture({respond:()=>{throw Object.assign(new Error('stop'),{code:'CANCELLED'});}});f.s.allowCloud=true;f.s.processingMode='smart-hybrid';await assert.rejects(f.run(),{code:'CANCELLED'});assert.equal(f.calls.length,1);});
test('Cloud First and deterministic commands do not waste Small calls',async()=>{const f=fixture();await f.run('/calc 4*5');assert.equal(f.calls.length,0);f.s.processingMode='cloud-first';f.s.allowCloud=true;f.s.model='synthetic-cloud-model';f.core.client.generate=async()=>({text:'Cloud',usage:{inputTokens:1,outputTokens:1}});await f.run('Hello');assert.equal(f.calls.length,0);});
test('hash verification reuses unchanged files but rejects a modified model',async t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tier-verify-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const content=Buffer.from('GGUF synthetic model'),file='Llama-3.2-3B-Instruct-Q4_K_M.gguf';fs.writeFileSync(path.join(dir,file),content);const models=[{id:'llama32-3b',name:'Medium',file,bytes:content.length,sha256:crypto.createHash('sha256').update(content).digest('hex')}];const manager=new ModelManager({directory:dir,models});assert.equal(manager.catalog()[0].installed,true);await manager.verifyTier('medium',{});await manager.verifyTier('medium',{});fs.writeFileSync(path.join(dir,file),Buffer.alloc(content.length,1));await assert.rejects(manager.verifyTier('medium',{}),{code:'LOCAL_MODEL'});});
test('invalid tier settings are rejected without changing the defaults',()=>{assert.throws(()=>validateHybrid({localTier:'unknown'},{}),{code:'INVALID'});assert.throws(()=>validateHybrid({localMaxTier:'unlimited'},{}),{code:'INVALID'});const s=validateHybrid({},{});assert.equal(s.localTier,'auto');assert.equal(s.localMaxTier,'high');});
test('switching tiers waits for old engine exit before starting the next model',async()=>{const f=fixture(),order=[],child={exitCode:null,signalCode:null};f.router.local.child=child;f.router.local.state='ready';f.router.local.signature='previous model';f.router.local.stop=()=>{order.push('stop');f.router.local.child=null;setTimeout(()=>{child.signalCode='SIGTERM';order.push('exit');},8);};await f.core.resources.task('foreground',()=>f.core.resources.withAI(async()=>order.push('next-model'),{localSettings:{...f.s,localModelPath:f.rows[0].file}}));assert.deepEqual(order,['stop','exit','next-model']);});
test('foreground chat can run between Small assessment and larger background inference',async()=>{const f=fixture({cap:'extra',respond:(tier,n)=>({text:JSON.stringify(n===1?{required_tier:'high'}:{answer:'Report',evidence:[],uncertainties:[]})})});let release,foreground;
 const original=f.router.local.generate;f.router.local.generate=async(...args)=>{const result=await original(...args);if(f.calls.length===1)foreground=f.core.resources.context.exit(()=>f.core.resources.task('foreground',()=>new Promise(r=>release=r)));return result;};
 const background=f.core.resources.task('background',()=>generateTiers(f.router,f.s,[{role:'user',content:'Compare A and B'}],{},evaluateLocal));
 while(!release)await new Promise(r=>setImmediate(r));await new Promise(r=>setTimeout(r,8));assert.deepEqual(f.calls.map(c=>c.tier),['small']);release();await Promise.all([foreground,background]);assert.deepEqual(f.calls.map(c=>c.tier),['small','high']);});
test('tier interface renders named sizes, controls, and optional model downloads',async()=>{const {createHybridUI}=await import('../source/ui/hybrid.mjs');const f=fixture(),state={settings:f.s,localBrain:{state:'unloaded'},localTiers:f.rows.map(t=>({...t,downloadGB:1})),tierRouting:{phase:'idle'}};const ui=createHybridUI({api:async()=>{},refresh:async()=>{},esc:v=>String(v),state:()=>state,toast:()=>{},render:()=>{}});const html=ui.processing();for(const value of ['name="localTier"','name="localMaxTier"','Small / Low — 1.7B','Medium — 3B','High — 4B','Extra High — 8B','hybrid-tier-small','hybrid-locate-medium','tier-routing-state'])assert.ok(html.includes(value),value);assert.equal((html.match(/id="local-brain-state"/g)||[]).length,1);});

test('deterministic routing at or above a positive cap goes straight to the complete answer input',async()=>{
 for(const [cap,prompt,tier] of [['medium','Draft a letter','medium'],['high','Compare A and B','high'],['high','Reconcile multiple reports','high'],['extra','Reconcile multiple reports','extra'],['small','Compare A and B','small']]){
  const f=fixture({cap,respond:()=>({text:'{"answer":"Synthetic draft","evidence":[],"uncertainties":[]}'})});const result=await f.run(prompt);
  assert.deepEqual(f.calls.map(c=>c.tier),[tier]);assert.equal(f.calls[0].messages[0].content,prompt);assert.equal(f.calls[0].options.instructions.includes('Classify the quoted task'),false);
  assert.equal(result.routing.selectedTier,tier);assert.equal(result.routing.attempts[0].phase,'answer');
 }
});

test('cap-bound routing preserves missing-tier and memory fallback without a redundant classification call',async()=>{
 const missing=fixture({missing:['high']});const result=await missing.run('Compare A and B');assert.deepEqual(missing.calls.map(c=>c.tier),['medium']);assert.match(result.routing.notice,/smaller-model/);
 const low=fixture({memory:4*GIB});const fallback=await low.run('Compare A and B');assert.deepEqual(low.calls.map(c=>c.tier),['medium']);assert.ok(fallback.routing.attempts.some(a=>a.tier==='high'&&a.code==='LOW_MEMORY'));assert.match(fallback.routing.notice,/smaller-model/);
 const simple=fixture({cap:'small'});await simple.run('Hello');assert.equal(simple.calls.length,1);assert.match(simple.calls[0].options.instructions,/required_tier/,'Desired Small still receives its normal evidence-aware assessment');
});

test('deterministic cap rejects oversized complete input without assessment or truncation',async()=>{
 const f=fixture(),source='Summarize '+ 'source '.repeat(10000),messages=[{role:'user',content:source}];
 await assert.rejects(f.core.resources.task('foreground',()=>generateTiers(f.router,f.s,messages,{},evaluateLocal)),{code:'LOCAL_CONTEXT'});
 assert.equal(f.calls.length,0);assert.equal(messages[0].content,source);
});

test('hash verification rejects a same-tick modification even when stat timestamps collide',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tier-tick-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const content=Buffer.from('GGUF synthetic same tick'),file='Llama-3.2-3B-Instruct-Q4_K_M.gguf',target=path.join(dir,file);fs.writeFileSync(target,content);
 const manager=new ModelManager({directory:dir,models:[{id:'llama32-3b',file,bytes:content.length,sha256:crypto.createHash('sha256').update(content).digest('hex')}]});
 const stat=fs.statSync,initial=stat(target,{bigint:true});
 t.mock.method(fs,'statSync',(p,options)=>p===target&&options?.bigint?initial:stat(p,options));
 await manager.verifyTier('medium',{});fs.writeFileSync(target,Buffer.alloc(content.length,1));
 await assert.rejects(manager.verifyTier('medium',{}),{code:'LOCAL_MODEL'});assert.equal(manager.verified.has(target),false);
});

test('settled unchanged models reuse the verified hash while changed signatures require verification',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tier-settled-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const content=Buffer.from('GGUF synthetic settled model'),file='Llama-3.2-3B-Instruct-Q4_K_M.gguf',target=path.join(dir,file);fs.writeFileSync(target,content);
 const manager=new ModelManager({directory:dir,models:[{id:'llama32-3b',file,bytes:content.length,sha256:crypto.createHash('sha256').update(content).digest('hex')}]});
 const now=Date.now();t.mock.method(Date,'now',()=>now+5000);let reads=0;const read=fs.createReadStream;
 t.mock.method(fs,'createReadStream',(...args)=>{reads++;return read(...args);});
 await manager.verifyTier('medium',{});await manager.verifyTier('medium',{});assert.equal(reads,1);
 fs.writeFileSync(target,Buffer.alloc(content.length,1));fs.utimesSync(target,new Date(now+2000),new Date(now+2000));
 await assert.rejects(manager.verifyTier('medium',{}),{code:'LOCAL_MODEL'});assert.equal(reads,2);
});
