'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {LocalBrain}=require('../source/local-brain.cjs');
const {HYBRID_DEFAULTS}=require('../source/hybrid-settings.cjs');
const GIB=1024**3;
function engine(t,{mode='balanced',free=8*GIB,keepBrainMinutes=0}={}){
 const settings={...HYBRID_DEFAULTS,resourceMode:mode,localModelPath:'/synthetic-model.gguf',localContext:4096,localMaxOutput:192,keepBrainMinutes};
 const launches=[],requests=[];
 const brain=new LocalBrain({runtime:'/synthetic-engine',settings:()=>settings,memory:()=>free,spawnProcess:(exe,args)=>{launches.push(args);const c=new EventEmitter();c.exitCode=null;c.signalCode=null;c.kill=()=>{c.signalCode='SIGTERM';c.emit('exit',null,'SIGTERM');};return c;},fetcher:async(url,opts)=>{if(url.endsWith('/health'))return {ok:true};requests.push(JSON.parse(opts.body));return {ok:true,json:async()=>({choices:[{message:{content:'Synthetic answer'},finish_reason:'stop'}],usage:{prompt_tokens:20,completion_tokens:3}})};}});
 brain.validate=()=>1282439584;brain.port=async()=>12345;t.after(()=>brain.close());return {brain,settings,launches,requests};
}
test('balanced inference uses smaller batches with the exact same model, context, output budget and input',async t=>{
 const {brain,settings,launches,requests}=engine(t),input='Synthetic full input. '.repeat(40);
 await brain.generate(settings,[{role:'user',content:input}]);
 const args=launches[0],value=flag=>args[args.indexOf(flag)+1];
 assert.equal(value('--batch-size'),'64');assert.equal(value('--ubatch-size'),'32');
 assert.equal(value('--model'),settings.localModelPath);assert.equal(value('--ctx-size'),'4096');assert.equal(value('--parallel'),'1');assert.equal(value('--gpu-layers'),'0');
 assert.equal(requests[0].messages[1].content,input);assert.equal(requests[0].max_tokens,192);assert.ok(!args.includes('q8_0'));
});
test('performance mode retains the existing standard batches',async t=>{
 const {brain,settings,launches}=engine(t,{mode:'performance'});await brain.load(settings);const args=launches[0];assert.equal(args[args.indexOf('--batch-size')+1],'128');assert.equal(args[args.indexOf('--ubatch-size')+1],'64');
});
test('inactive balanced model is unloaded after a short grace period when RAM is tight',async t=>{
 const {brain,settings}=engine(t);await brain.load(settings);brain.memory=()=>2*GIB;brain.lastUsed=Date.now()-35000;brain.maintain();assert.equal(brain.child,null);assert.equal(brain.state,'unloaded');assert.equal(settings.localIdleMinutes,5);
});
test('memory saving idle unload does not interrupt a request or override explicit follow-up warmth',async t=>{
 for(const scenario of ['busy','loading','warm','healthy']){
  const {brain,settings}=engine(t);await brain.load(settings);brain.memory=()=>scenario==='healthy'?8*GIB:2*GIB;brain.lastUsed=Date.now()-35000;
  if(scenario==='busy')brain.busy=true;if(scenario==='loading')brain.loadPending=Promise.resolve();if(scenario==='warm')settings.keepBrainMinutes=2;
  brain.maintain();assert.ok(brain.child,scenario);brain.loadPending=null;brain.busy=false;
 }
});
test('critical RAM pressure still stops a busy model with the original watchdog floor',async t=>{
 const {brain,settings}=engine(t);await brain.load(settings);brain.busy=true;brain.memory=()=>0.9*GIB;brain.maintain();assert.equal(brain.child,null);assert.equal(brain.lastError.code,'LOW_MEMORY');
});
