'use strict';
// Only public, pinned runtime assets are downloaded. Documents/queries never
// enter these requests; indexing and OCR remain local after optional setup.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fail,uuid}=require('./security.cjs');
const assets=require('./document-tools-assets.json');
const active=new WeakSet();
const folder=core=>path.join(core.root,'local-document-tools');
function ordinary(file){
 let current=path.resolve(file);
 for(;;){if(fs.existsSync(current)&&fs.lstatSync(current).isSymbolicLink())throw fail('PATH');const parent=path.dirname(current);if(parent===current)break;current=parent;}
}
async function hash(file){const h=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest('hex');}
async function verified(core,kind){
 const spec=assets[kind];if(!spec?.file)return false;
 try{const file=path.join(folder(core),spec.file);ordinary(file);const s=fs.lstatSync(file);return s.isFile()&&s.size===spec.bytes&&await hash(file)===spec.sha256;}catch{return false;}
}
async function status(core){
 core.assertUnlocked();
 const [embedding,ocr]=await Promise.all([verified(core,'embedding'),verified(core,'ocr')]);
 return {embedding,ocr,embeddingBytes:assets.embedding.bytes,ocrBytes:assets.ocr.bytes,setupInProgress:active.has(core),localOnly:true};
}
function allowed(url){
 const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)throw fail('DOCUMENT_SETUP');
 if(!['huggingface.co','raw.githubusercontent.com','cdn-lfs.huggingface.co'].includes(u.hostname)&&!u.hostname.endsWith('.hf.co'))throw fail('DOCUMENT_SETUP');
 return u;
}
async function response(url,signal,fetcher){
 for(let n=0;n<6;n++){
  allowed(url);const r=await fetcher(url,{redirect:'manual',signal});
  if([301,302,303,307,308].includes(r.status)){const next=r.headers.get('location');await r.body?.cancel?.();if(!next)throw fail('DOCUMENT_SETUP');url=new URL(next,url).href;continue;}
  if(!r.ok||!r.body)throw fail('DOCUMENT_SETUP');return r;
 }
 throw fail('DOCUMENT_SETUP');
}
async function setup(core,kind='all',{fetcher=globalThis.fetch}={}){
 core.assertUnlocked();if(!['all','embedding','ocr'].includes(kind))throw fail('INVALID');
 if(active.has(core))throw fail('BUSY');active.add(core);
 const id=uuid(),controller=new AbortController();core.requests?.set(id,controller);
 const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(600000)]);
 try{
  const directory=folder(core);ordinary(directory);fs.mkdirSync(directory,{recursive:true});ordinary(directory);
  for(const name of kind==='all'?['embedding','ocr']:[kind]){
   if(await verified(core,name))continue;
   const spec=assets[name],file=path.join(directory,spec.file),temp=file+'.'+uuid()+'.partial';
   ordinary(file);let handle;
   try{
    handle=await fs.promises.open(temp,'wx',0o600);
    const r=await response(spec.url,signal,fetcher),h=crypto.createHash('sha256');let bytes=0;
    for await(const chunk of r.body){
     core.assertUnlocked();if(signal.aborted)throw fail('CANCELLED');
     bytes+=chunk.length;if(bytes>spec.bytes)throw fail('DOCUMENT_SETUP');h.update(chunk);
     let offset=0;while(offset<chunk.length){const written=await handle.write(chunk,offset,chunk.length-offset);if(!written.bytesWritten)throw fail('DOCUMENT_SETUP');offset+=written.bytesWritten;}
    }
    if(bytes!==spec.bytes||h.digest('hex')!==spec.sha256)throw fail('DOCUMENT_SETUP');
    await handle.sync();await handle.close();handle=null;core.assertUnlocked();ordinary(file);fs.renameSync(temp,file);
   }finally{await handle?.close().catch(()=>{});try{fs.unlinkSync(temp);}catch{}}
  }
  core.emit?.({type:'document_tools_changed'});return await status(core);
 }catch(e){if(controller.signal.aborted)throw fail('CANCELLED');if(e.code&&require('./security.cjs').CODES[e.code])throw e;throw fail('DOCUMENT_SETUP');}
 finally{core.requests?.delete(id);active.delete(core);}
}
module.exports={assets,folder,ordinary,hash,verified,status,setup};
