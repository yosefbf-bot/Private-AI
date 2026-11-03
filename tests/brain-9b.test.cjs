'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
const {ModelManager,MODELS,TIERS}=require('../source/model-manager.cjs');
const {localInput,LocalBrain}=require('../source/local-brain.cjs');
const {HYBRID_DEFAULTS}=require('../source/hybrid-settings.cjs');

test('9B has a separately pinned identity without replacing active model settings',t=>{
 const {core,dir}=fixture(t),nine=MODELS.find(m=>m.id==='qwen35-9b');assert.ok(nine);
 assert.equal(nine.bytes,5680522464);assert.equal(nine.sha256,'03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8');
 assert.match(nine.url,/3885219b6810b007914f3a7950a8d1b469d598a5/);
 const manager=new ModelManager({directory:dir});
 core.saveSettings({highModelPath:path.join(dir,'four.gguf'),advancedModelPath:path.join(dir,'new-9b.gguf'),localTier:'advanced',localMaxTier:'advanced'});
 const s=core.settings();assert.equal(s.localTier,'advanced');assert.equal(s.localMaxTier,'advanced');
 const catalog=manager.catalog(s);assert.equal(catalog.find(m=>m.tier==='advanced').file,s.advancedModelPath);
 assert.equal(catalog.find(m=>m.tier==='high').file,s.highModelPath);assert.equal(catalog.length,3);
 assert.equal(TIERS.find(t=>t.tier==='advanced').id,'qwen35-9b');assert.equal(HYBRID_DEFAULTS.localMaxTier,'high');
});

test('Qwen3.5 uses template controls without the obsolete soft switch, including renamed tier files',async()=>{
 for(const name of ['Qwen3.5-9B-Q4_K_M.gguf','renamed.gguf']){
  const s={...HYBRID_DEFAULTS,localModelPath:name,advancedModelPath:name};
  assert.doesNotMatch(localInput(s,[{role:'user',content:'Synthetic question'}]).system,/\/no_think/);
  let body;const brain=new LocalBrain({runtime:'unused',settings:()=>s,fetcher:async(_url,opts)=>{body=JSON.parse(opts.body);return {ok:true,json:async()=>({choices:[{message:{content:'Synthetic final answer'},finish_reason:'stop'}]})};}});
  brain.load=async()=>{};
  try{const answer=await brain.generate(s,[{role:'user',content:'Synthetic question'}]);assert.equal(answer.text,'Synthetic final answer');assert.equal(body.chat_template_kwargs.enable_thinking,false);assert.equal(body.max_tokens,s.localMaxOutput);}finally{brain.close();}
 }
 assert.match(localInput({...HYBRID_DEFAULTS,localModelPath:'Qwen3-4B-Q4_K_M.gguf'},[{role:'user',content:'Hello'}]).system,/\/no_think/);
});

test('9B memory peaks protect future loads and do not disappear from accounting',t=>{
 const {core}=fixture(t);core.modelManager={catalog:()=>[{tier:'advanced',file:'nine.gguf'}]};
 core.stability.observePeak('advanced',2048,7*1024**3);core.stability.observe('advanced',2048,6*1024**3);
 assert.equal(core.stability.minimumFor({localModelPath:'nine.gguf',localContext:4096}),7*1024**3);
 assert.equal(core.stability.snapshot().systemFreeRAMDropBytes['advanced:2048'],6*1024**3);
});
