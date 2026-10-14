'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fixture}=require('./helpers.cjs'),{uuid}=require('../source/security.cjs');
const tools=require('../source/document-tools-assets.cjs'),docs=require('../source/workflows/documents.cjs');
const semantic=require('../source/workflows/semantic-search.cjs'),{dispatch}=require('../source/workflows/index.cjs');
function file(core,name,text,extra={}){const row={id:uuid(),name,text,updated:Date.now(),hipaa:true,bytes:'',...extra};core.store.put('file',row.id,row);return row;}
function engine(t,core,action){
 const verified=tools.verified;tools.verified=async()=>true;t.after(()=>tools.verified=verified);
 const calls=[];core.resources.memory=()=>10*1024**3;
 core.router.local={state:'unloaded',child:null,validate:()=>tools.assets.embedding.bytes,close(){},stop(){this.state='unloaded';},async waitStopped(){},async embeddings(s,inputs,options){calls.push({s,inputs});await action?.(inputs,options);return inputs.map(text=>{const v=new Float32Array(384);v[/fall|floor|slip/i.test(text)?0:1]=1;return v;});}};
 return calls;
}
test('word search decrypts files sequentially and retains bounded results with complete match count',t=>{
 const {core}=fixture(t);for(let n=0;n<70;n++)file(core,'Policy '+String(n).padStart(2,'0')+'.txt','[Page 2]\nSynthetic documented policy.',{bytes:'unused large original '.repeat(5000)});
 const list=core.store.list.bind(core.store);core.store.list=kind=>{assert.notEqual(kind,'file','Metadata selection must precede attachment decryption');return list(kind);};
 const result=docs.search(core,{query:'documented'});assert.equal(result.totalMatches,70);assert.equal(result.results.length,50);assert.equal(result.coverage.length,70);assert.match(result.results[0].citation,/page 2/);
});
test('semantic search uses real sqlite-vec, project scope and exact source citations without plaintext persistence',async t=>{
 const {core,root,calls:cloud}=fixture(t);const first=file(core,'Safety.txt','[Page 3]\nFloor hazards require review. Medication feed unavailable; status unknown.');
 file(core,'Other.txt','Staffing records are incomplete.');const project={id:uuid(),name:'Selected sources',fileIds:[first.id]};core.store.put('project',project.id,project);
 const calls=engine(t,core);const result=await dispatch(core,'workflowDocumentSearch',{projectId:project.id,mode:'semantic',query:'risk of falling'});
 assert.equal(result.mode,'semantic');assert.equal(result.results.length,1);assert.equal(result.results[0].fileId,first.id);assert.match(result.results[0].citation,/page 3.*characters/);assert.equal(result.results[0].text,first.text.slice(result.results[0].start,result.results[0].end));
 assert.match(result.notice,/not clinical confidence/);assert.equal(cloud.length,0);assert.equal(core.requests.size,0);
 const firstInputCount=calls.reduce((n,c)=>n+c.inputs.length,0);await dispatch(core,'workflowDocumentSearch',{projectId:project.id,mode:'semantic',query:'risk of falling'});assert.equal(calls.reduce((n,c)=>n+c.inputs.length,0)-firstInputCount,1,'Only the new question needs an embedding');
 assert.equal(core.store.db.prepare("SELECT name FROM sqlite_master WHERE name='passages'").get(),undefined);
 assert.equal(fs.readFileSync(path.join(root,'privateai.db')).includes(Buffer.from('Floor hazards require review')),false);
});
test('semantic search rejects source deletion during indexing and never returns a deleted source',async t=>{
 const {core}=fixture(t),row=file(core,'Deleted source.txt','A floor hazard was documented.');let deleted=false;
 engine(t,core,()=>{if(!deleted){deleted=true;core.store.delete('file',row.id);}});
 await assert.rejects(dispatch(core,'workflowDocumentSearch',{mode:'semantic',query:'fall'}),{code:'REVIEW_CHANGED'});
 assert.equal((await dispatch(core,'workflowDocumentSearch',{mode:'semantic',query:'fall'})).results.length,0);assert.equal(core.requests.size,0);
});
test('locking or stopping semantic search cancels it and clears transient state',async t=>{
 const {core}=fixture(t);file(core,'Safety.txt','Review floor hazards.');const id=uuid();
 engine(t,core,(_inputs,{signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(Object.assign(Error('cancelled'),{code:'CANCELLED'})),{once:true});core.stop(id);}));
 await assert.rejects(dispatch(core,'workflowDocumentSearch',{mode:'semantic',query:'fall',requestId:id}),{code:'CANCELLED'});assert.equal(core.requests.size,0);
 core.lock();await assert.rejects(dispatch(core,'workflowDocumentToolsStatus'),{code:'LOCKED'});core.unlock();
});

test('Stop during asset verification cancels before any model starts',async t=>{
 const {core}=fixture(t);file(core,'Safety.txt','Review floor hazards.');const id=uuid(),calls=engine(t,core);
 tools.verified=async()=>{assert.ok(core.requests.has(id));core.stop(id);return true;};
 await assert.rejects(dispatch(core,'workflowDocumentSearch',{mode:'semantic',query:'fall',requestId:id}),{code:'CANCELLED'});
 assert.equal(calls.length,0);assert.equal(core.requests.size,0);
});
test('document tools preserve development/Demo and invalid-mode boundaries',async t=>{
 const {core}=fixture(t);core.developmentMode=true;
 for(const op of ['workflowDocumentToolsSetup','workflowDocumentToolsStatus','workflowDocumentSearch'])await assert.rejects(dispatch(core,op,{mode:'semantic',query:'fall'}),{code:'POLICY'});
 core.developmentMode=false;await assert.rejects(dispatch(core,'workflowDocumentSearch',{mode:'cloud'}),{code:'INVALID'});
 assert.equal((await dispatch(core,'workflowDocumentSearch',{mode:'semantic',query:''})).results.length,0,'Coverage requires neither a model nor network');
});
test('semantic fragments retain Unicode, source spans and the full passage',()=>{
 const text=('Sample 🙂 clinical reference. ').repeat(100),part={start:17,text};const rows=semantic.fragments(part);
 assert.equal(rows.map(r=>r.text).join(''),text);for(const row of rows){assert.ok(Buffer.byteLength(row.text)<=480);assert.equal(row.text,text.slice(row.start-17,row.end-17));assert.equal(row.text.includes('\ufffd'),false);}
});
test('asset setup rejects redirect escapes and cleans interrupted/corrupt partial files',async t=>{
 const {core}=fixture(t);let count=0;
 await assert.rejects(tools.setup(core,'ocr',{fetcher:async()=>{count++;return {status:302,headers:{get:()=> 'http://unapproved.invalid/model'},body:{cancel:async()=>{}}};}}),{code:'DOCUMENT_SETUP'});assert.equal(count,1);
 await assert.rejects(tools.setup(core,'ocr',{fetcher:async()=>({ok:true,status:200,body:(async function*(){yield Buffer.from('not the pinned model');})()})}),{code:'DOCUMENT_SETUP'});
 assert.deepEqual(fs.readdirSync(tools.folder(core)),[]);assert.equal(core.requests.size,0);
});
test('local-only and forced-local chat use OCR text while retaining the original image',t=>{
 const {core}=fixture(t),c=core.createChat(),f=file(core,'Synthetic.png','SYNTHETIC OCR: medication information is unknown.',{image:true,mime:'image/png',bytes:Buffer.from('original').toString('base64'),ocr:{verified:false}});
 c.messages.push({role:'user',text:'Read this source',fileIds:[f.id]});
 core.saveSettings({processingMode:'local-only'});let input=core.buildInput(c);assert.equal(input.messages[0].content.some(p=>p.type==='input_image'),false);assert.match(JSON.stringify(input.messages),/MACHINE OCR.*verify/);assert.match(JSON.stringify(input.messages),/unknown/);
 core.saveSettings({processingMode:'smart-hybrid'});input=core.buildInput(c,{forceLocal:true});assert.equal(input.messages[0].content.some(p=>p.type==='input_image'),false);assert.equal(core.store.get('file',f.id).bytes,f.bytes);
});
