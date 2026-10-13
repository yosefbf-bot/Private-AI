'use strict';
// No persisted vector/text index. Only bounded vectors are cached in process
// memory; each selected collection gets a fresh, transient sqlite-vec table.
const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {fail,uuid,isId}=require('../security.cjs');
const {signature,clean}=require('./actions.cjs');
const docs=require('./documents.cjs'),tools=require('../document-tools-assets.cjs');
const MAX_PASSAGES=2048,MAX_CACHE=4096,CHUNK_BYTES=480;
const states=new WeakMap();
function state(core){let value=states.get(core);if(!value){value={cache:new Map(),epoch:0,busy:false};states.set(core,value);}return value;}
function clear(core){const s=states.get(core);if(s){s.epoch++;s.cache.clear();}states.delete(core);}
function extension(){
 const spec=tools.assets.sqliteVec,expected=spec.hashes[process.platform+'-'+process.arch];if(!expected)throw fail('DOCUMENT_SEARCH');
 const from=require('sqlite-vec').getLoadablePath();
 // SQLite's native loader needs a physical filename outside Electron's ASAR.
 const file=from.replace(/([\\/][^\\/]+\.asar)(?=[\\/])/,'$1.unpacked');
 if(!fs.existsSync(file)||fs.lstatSync(file).isSymbolicLink()||!fs.statSync(file).isFile())throw fail('DOCUMENT_SEARCH');
 return {file,expected};
}
async function database(){
 const native=extension();if(await tools.hash(native.file)!==native.expected)throw fail('DOCUMENT_SEARCH');
 const db=new DatabaseSync(':memory:',{allowExtension:true});
 try{db.loadExtension(native.file);db.enableLoadExtension(false);if(db.prepare('SELECT vec_version() AS version').get().version!==tools.assets.sqliteVec.version)throw fail('DOCUMENT_SEARCH');
  db.exec('PRAGMA temp_store=MEMORY; CREATE VIRTUAL TABLE passages USING vec0(embedding float[384]);');return db;
 }catch(e){db.close();if(e.code)throw e;throw fail('DOCUMENT_SEARCH');}
}
function fragments(part){
 const result=[];let at=part.start,text='',bytes=0;
 for(const character of part.text){
  const count=Buffer.byteLength(character);
  if(bytes+count>CHUNK_BYTES&&text){result.push({start:at,end:at+text.length,text});at+=text.length;text='';bytes=0;}
  text+=character;bytes+=count;
 }
 if(text)result.push({start:at,end:at+text.length,text});return result;
}
async function search(core,data={},options={}){
 core.assertUnlocked();const query=clean(data.query,200).trim();
 const lexical=docs.search(core,data);
 if(!query)return {...lexical,mode:'semantic',notice:'Choose a collection and enter a question to find local source passages.'};
 if(!core.router?.local)throw fail('LOCAL_ENGINE_MISSING');
 const current=state(core);if(current.busy)throw fail('BUSY');current.busy=true;
 const epoch=current.epoch,rows=[],revisions=[],project=data.projectId?core.store.get('project',data.projectId):null;
 const projectRevision=project?signature(project.fileIds||[]):null;
 let incomplete=false;
 const id=data.requestId||uuid();if(!isId(id)||core.requests?.has(id)) {current.busy=false;throw fail('INVALID');}
 const controller=new AbortController();core.requests?.set(id,controller);
 const inherited=options.signal||core.resources.current()?.signal;
 const signal=AbortSignal.any([controller.signal,...(inherited?[inherited]:[]),AbortSignal.timeout(300000)]);
 const check=()=>{core.assertUnlocked();if(signal.aborted||epoch!==current.epoch)throw fail('CANCELLED');};
 let db;
 try{
  check();
  if(!await tools.verified(core,'embedding'))throw fail('DOCUMENT_SETUP');
  check();
  outer:for(const f of docs.selectedFiles(core,data)){
   const revision=signature(f.text||'');revisions.push({id:f.id,revision,updated:f.updated});
   for(const part of docs.sections(f))for(const fragment of fragments(part)){
    if(rows.length>=MAX_PASSAGES){incomplete=true;break outer;}
    if(!fragment.text.trim())continue;
    rows.push({fileId:f.id,name:f.name,updated:f.updated,revision,id:part.id,page:part.page,...fragment,
     citation:`${f.name} — ${part.page?'page '+part.page+', ':''}section ${part.id}, characters ${fragment.start+1}–${fragment.end}`});
   }
  }
  if(!rows.length)return {...lexical,results:[],totalMatches:0,mode:'semantic',notice:'No extracted text is available in this selection.'};
  const s={...core.settings(),localModelPath:path.join(tools.folder(core),tools.assets.embedding.file),localContext:tools.assets.embedding.context,localMaxOutput:64};
  const vectors=[];
  await core.resources.task('foreground',()=>core.resources.withAI(async()=>{
   check();
   try{
    for(let offset=0;offset<rows.length;offset+=16){
     check();await core.resources.checkpoint();
     const batch=rows.slice(offset,offset+16),retained=new Map(batch.map(row=>[signature(row.text),current.cache.get(signature(row.text))])),missing=batch.filter(row=>!retained.get(signature(row.text))),inputs=missing.map(row=>row.text);
     if(inputs.length){
      const found=await core.router.local.embeddings(s,inputs,{signal});
      check();missing.forEach((row,index)=>{const key=signature(row.text);current.cache.set(key,found[index]);retained.set(key,found[index]);});
      while(current.cache.size>MAX_CACHE)current.cache.delete(current.cache.keys().next().value);
     }
     vectors.push(...batch.map(row=>retained.get(signature(row.text))));
    }
    check();const [question]=await core.router.local.embeddings(s,['Represent this sentence for searching relevant passages: '+query],{signal});
    check();db=await database();check();const insert=db.prepare('INSERT INTO passages(rowid,embedding) VALUES(?,?)');
    for(let i=0;i<vectors.length;i++)insert.run(BigInt(i+1),new Uint8Array(vectors[i].buffer,vectors[i].byteOffset,vectors[i].byteLength));
    const matches=db.prepare('SELECT rowid,distance FROM passages WHERE embedding MATCH ? AND k=? ORDER BY distance').all(new Uint8Array(question.buffer,question.byteOffset,question.byteLength),BigInt(Math.min(10,rows.length)));
    // Abort if an import/deletion/project edit invalidated these citations.
    for(const revision of revisions){const file=core.store.get('file',revision.id);if(!file||file.updated!==revision.updated||signature(file.text||'')!==revision.revision)throw fail('REVIEW_CHANGED');}
    if(projectRevision!==null&&signature(core.store.get('project',data.projectId)?.fileIds||[])!==projectRevision)throw fail('REVIEW_CHANGED');
    check();
    const results=matches.map(match=>({...rows[Number(match.rowid)-1],score:Math.max(-1,Math.min(1,1-match.distance*match.distance/2)),retrieval:'local-semantic'}));
    lexical.results=results;lexical.totalMatches=results.length;
   }finally{core.router.local.stop('local-search-complete');await core.router.local.waitStopped();}
  },{localSettings:s,waitForMemory:false}),{signal});
  return {...lexical,mode:'semantic',semanticPassages:rows.length,incomplete,
   notice:`Local meaning search suggests relevant extracted passages; ranking is not clinical confidence or whole-document analysis. Verify source currency and OCR against originals.${incomplete?' Coverage is limited to '+MAX_PASSAGES+' passages; select a smaller collection for complete coverage.':''}`};
 }catch(e){if(signal.aborted)throw fail('CANCELLED');if(e.code&&require('../security.cjs').CODES[e.code])throw e;throw fail('DOCUMENT_SEARCH');}
 finally{db?.close();core.requests?.delete(id);current.busy=false;}
}
module.exports={search,clear,fragments,database,MAX_PASSAGES,MAX_CACHE};
