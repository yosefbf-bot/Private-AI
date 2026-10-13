'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {LocalBrain}=require('../source/local-brain.cjs'),{processFile}=require('../source/files.cjs');
const {locations,safeRelative}=require('../scripts/secret-scan.cjs');
function brain(t,transform){
 const requests=[],launches=[];
 const engine=new LocalBrain({runtime:'/engine/server',settings:()=>({localIdleMinutes:5}),memory:()=>10*1024**3,spawnProcess:(_file,args,options)=>{launches.push({args,options});const child=new EventEmitter();child.kill=()=>{child.exitCode=0;child.emit('exit',0,null);};return child;},fetcher:async(url,options)=>{
  assert.equal(new URL(url).hostname,'127.0.0.1');assert.equal(options.redirect,'error');assert.match(options.headers.Authorization,/^Bearer /);
  const body=options.body?JSON.parse(options.body):null;requests.push({url,body});
  if(url.endsWith('/health'))return {ok:true};
  if(url.endsWith('/tokenize'))return {ok:true,json:async()=>({tokens:transform?.tokens||[1,2]})};
  assert.ok(url.endsWith('/v1/embeddings'));const v=Array(384).fill(0);v[0]=2;
  return {ok:true,json:async()=>transform?.result||{data:body.input.map((_,index)=>({index,embedding:v}))}};
 }});
 engine.validate=()=>1000000;engine.port=async()=>12345;t.after(()=>engine.close());return {engine,requests,launches};
}
const settings={localModelPath:'/synthetic/embedding.gguf',localContext:512,localMaxOutput:64,resourceMode:'balanced'};
test('embedding runtime remains authenticated and local, normalizes vectors and retires before chat reload',async t=>{
 const {engine,requests,launches}=brain(t);const vectors=await engine.embeddings(settings,['Synthetic complete passage']);
 assert.equal(vectors[0].length,384);assert.equal(vectors[0][0],1);assert.ok(launches[0].args.includes('--embedding'));assert.equal(launches[0].options.stdio[2],'ignore');assert.ok(!launches[0].args.includes(engine.token));
 assert.equal(requests[1].body.content,'Synthetic complete passage');engine.stop();await engine.waitStopped();assert.equal(engine.activeSettings,null);
 await engine.load({...settings,localModelPath:'/synthetic/chat.gguf',localContext:2048});assert.ok(!launches[1].args.includes('--embedding'));assert.equal(engine.embeddingMode,false);
});
test('embedding context overflow rejects full input without a truncated embedding call',async t=>{
 const {engine,requests}=brain(t,{tokens:Array(513).fill(1)});await assert.rejects(engine.embeddings(settings,['Synthetic complete passage']),{code:'LOCAL_CONTEXT'});
 assert.ok(!requests.some(row=>row.url.endsWith('/v1/embeddings')));assert.equal(engine.busy,false);
});
test('malformed embedding vectors and pre-cancelled requests fail closed',async t=>{
 const {engine,requests}=brain(t,{result:{data:[{index:0,embedding:[1]}]}});
 await assert.rejects(engine.embeddings(settings,['Synthetic passage']),{code:'DOCUMENT_SEARCH'});
 const count=requests.length,controller=new AbortController();controller.abort();await assert.rejects(engine.embeddings(settings,['Synthetic passage'],{signal:controller.signal}),{code:'CANCELLED'});assert.equal(requests.length,count);assert.equal(engine.busy,false);
});
for(const phase of ['completed','pre-spawn abort'])test('document isolation waits for actual worker exit: '+phase,async t=>{
 const processModule=require('node:child_process'),original=processModule.fork,child=new EventEmitter();let killed=0,settled=false,sent=0;
 child.kill=()=>{killed++;};child.send=()=>{sent++;};processModule.fork=()=>child;t.after(()=>processModule.fork=original);
 const controller=new AbortController(),pending=processFile({op:'extract',ext:'.txt',bytes:Buffer.from('Synthetic')},{signal:controller.signal});pending.then(()=>settled=true,()=>settled=true);
 if(phase==='pre-spawn abort'){controller.abort();child.pid=123;child.emit('spawn');assert.equal(sent,0);}else{child.pid=123;child.emit('spawn');child.emit('message',{ok:true,result:{text:'Synthetic'}});assert.equal(sent,1);}
 await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);assert.ok(killed>0);
 child.exitCode=0;child.emit('exit',0,null);
 if(phase==='pre-spawn abort')await assert.rejects(pending,{code:'CANCELLED'});else assert.equal((await pending).text,'Synthetic');
});
test('secret scan output retains locations without exposing secret, match or commit messages',()=>{
 const rows=locations([{RuleID:'synthetic',File:'source/example.cjs',StartLine:12,Commit:'a'.repeat(40),Secret:'private value',Match:'private match',Message:'private commit message'}]);
 assert.deepEqual(rows,[{rule:'synthetic',file:'source/example.cjs',line:12,commit:'a'.repeat(40)}]);assert.ok(!JSON.stringify(rows).includes('private'));
 for(const name of ['../outside','x/../../outside','C:\\private','/private'])assert.throws(()=>safeRelative(name));assert.equal(safeRelative('source/example.cjs'),'source/example.cjs');
});
