'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
const {Core}=require('../source/core.cjs');
const {Store}=require('../source/database.cjs');
const {HYBRID_DEFAULTS,validateHybrid,migrateModelSettings}=require('../source/hybrid-settings.cjs');
const {MODELS,TIERS,ModelManager}=require('../source/model-manager.cjs');

test('only Small, High and Advanced can be downloaded; retired IDs never reach the network',async t=>{
 const {dir}=fixture(t);let fetches=0;
 const manager=new ModelManager({directory:dir,fetcher:async()=>{fetches++;assert.fail('Retired download reached the network');}});
 assert.deepEqual(TIERS.map(t=>t.tier),['small','high','advanced']);
 assert.deepEqual(MODELS.map(m=>m.id).sort(),['qwen3-1.7b','qwen3-4b','qwen35-9b']);
 for(const id of ['llama32-3b','qwen3-8b'])await assert.rejects(manager.download(id),{code:'INVALID'});
 assert.equal(fetches,0);
});

test('retired settings migrate once on startup without touching history, approvals or active model paths',t=>{
 const {core,root,cipher}=fixture(t),before={...core.settings(),localTier:'medium',localMaxTier:'extra',mediumModelPath:'C:\\models\\renamed-3.gguf',extraModelPath:'C:\\models\\renamed-8.gguf',localModelPath:'C:\\models\\renamed-3.gguf',highModelPath:'C:\\models\\four.gguf',advancedModelPath:'C:\\models\\nine.gguf',processingMode:'local-only',allowCloud:false};
 core.store.put('settings','main',before);core.store.put('chat','synthetic',{id:'synthetic',messages:[{role:'user',content:'Synthetic retained note'}]});
 const oldChat=core.store.get('chat','synthetic');core.close();
 const store=new Store(path.join(root,'privateai.db'),cipher);let writes=0;const put=store.put.bind(store);store.put=(kind,...args)=>{if(kind==='settings')writes++;return put(kind,...args);};
 const next=new Core({root,store,machine:'synthetic-machine'});let notice;try{
 const s=next.settings();assert.equal(writes,1);assert.equal(s.localTier,'high');assert.equal(s.localMaxTier,'advanced');assert.equal(s.localModelPath,'');
 assert.equal(s.mediumModelPath,undefined);assert.equal(s.extraModelPath,undefined);
 for(const key of ['highModelPath','advancedModelPath','processingMode','allowCloud','localContext','localMaxOutput','ramReserveMB','approval'])assert.deepEqual(s[key],before[key]);
 assert.match(s.localModelMigrationNotice,/3B.*High.*8B.*Advanced/);
 const expected={...before,localTier:'high',localMaxTier:'advanced',localModelPath:'',localModelMigrationNotice:s.localModelMigrationNotice};delete expected.mediumModelPath;delete expected.extraModelPath;
 assert.deepEqual(store.get('settings','main'),expected,'Every unrelated persisted setting must remain identical');
 assert.deepEqual(store.get('chat','synthetic'),oldChat);
 next.settings();next.settings();assert.equal(writes,1,'Settings reads must not write');
 assert.deepEqual(store.get('settings','main'),migrateModelSettings(store.get('settings','main')));
 assert.deepEqual(new ModelManager({directory:root}).catalog(s).map(r=>r.installed),[false,false,false]);
 notice=s.localModelMigrationNotice;
 }finally{next.close();}
 const again=new Core({root,store:new Store(path.join(root,'privateai.db'),cipher),machine:'synthetic-machine'});try{
 assert.equal(again.settings().localModelMigrationNotice,notice);assert.equal(again.settings().localTier,'high');
 }finally{again.close();}
});

test('migration preserves valid caps and unrelated custom models, but handles renamed retired custom selections',()=>{
 const empty=migrateModelSettings({...HYBRID_DEFAULTS,localTier:'selected',mediumModelPath:'',extraModelPath:''});
 assert.equal(empty.localTier,'selected');assert.equal(empty.localModelMigrationNotice,undefined);
 assert.equal(migrateModelSettings({...HYBRID_DEFAULTS,localMaxTier:'medium'}).localMaxTier,'high');
 for(const cap of ['small','high','advanced']){
  const original={...HYBRID_DEFAULTS,localMaxTier:cap,localTier:'selected',localModelPath:'C:\\models\\custom.gguf'};
  assert.deepEqual(migrateModelSettings(original),original);
  const migrated=migrateModelSettings({...original,localModelPath:'C:\\MODELS\\renamed.gguf',extraModelPath:'c:/models/renamed.gguf'});
  assert.equal(migrated.localTier,'advanced');assert.equal(migrated.localMaxTier,cap);assert.equal(migrated.localModelPath,'');
 }
 for(const localTier of ['medium','extra'])assert.throws(()=>validateHybrid({localTier},HYBRID_DEFAULTS),{code:'INVALID'});
 for(const file of ['Llama-3.2-3B-Instruct-Q4_K_M.gguf','Qwen3-8B-Q4_K_M.gguf'])assert.throws(()=>validateHybrid({localTier:'selected',localModelPath:'C:\\models\\'+file},HYBRID_DEFAULTS),{code:'INVALID'});
 assert.equal(validateHybrid({localTier:'selected',localModelPath:'C:\\models\\custom.gguf'},HYBRID_DEFAULTS).localModelPath,'C:\\models\\custom.gguf');
});
