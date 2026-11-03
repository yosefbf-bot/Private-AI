'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fail}=require('./security.cjs');
const MODEL=Object.freeze({id:'qwen3-4b',name:'Qwen3-4B Q4_K_M',file:'Qwen3-4B-Q4_K_M.gguf',bytes:2497280256,sha256:'7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5',url:'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/bc640142c66e1fdd12af0bd68f40445458f3869b/Qwen3-4B-Q4_K_M.gguf?download=true',license:'Apache-2.0'});
const SMALL=Object.freeze({id:'qwen3-1.7b',name:'Qwen3-1.7B Q4_K_M',file:'Qwen_Qwen3-1.7B-Q4_K_M.gguf',bytes:1282439584,sha256:'72c5c3cb38fa32d5256e2fe30d03e7a64c6c79e668ad84057e3bd66e250b24fb',url:'https://huggingface.co/bartowski/Qwen_Qwen3-1.7B-GGUF/resolve/dcb19155b962dbb6389f4691a982043a8e651022/Qwen_Qwen3-1.7B-Q4_K_M.gguf?download=true',license:'Apache-2.0'});
const ADVANCED=Object.freeze({id:'qwen35-9b',name:'Qwen3.5-9B Q4_K_M',file:'Qwen3.5-9B-Q4_K_M.gguf',bytes:5680522464,sha256:'03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8',url:'https://huggingface.co/unsloth/Qwen3.5-9B-GGUF/resolve/3885219b6810b007914f3a7950a8d1b469d598a5/Qwen3.5-9B-Q4_K_M.gguf?download=true',license:'Apache-2.0'});
const MODELS=Object.freeze([SMALL,MODEL,ADVANCED]);
const TIERS=Object.freeze([{tier:'small',label:'Small / Low — 1.7B',id:SMALL.id},{tier:'high',label:'High — 4B',id:MODEL.id},{tier:'advanced',label:'Advanced — 9B',id:ADVANCED.id}]);
class ModelManager{
 constructor({directory,fetcher=globalThis.fetch,emit=()=>{},models=MODELS}){Object.assign(this,{directory,fetcher,emit,models});this.selected=MODEL;this.progress={state:'idle',received:0,total:MODEL.bytes};this.verified=new Map();}
 catalog(settings={}){
  return TIERS.map(t=>{const model=this.models.find(m=>m.id===t.id);if(!model)return null;
   const candidates=[settings[t.tier+'ModelPath'],settings.localModelPath&&path.basename(settings.localModelPath)===model.file?settings.localModelPath:null,path.join(this.directory,model.file)].filter(Boolean);
   const file=candidates.find(f=>{try{return fs.statSync(f).isFile();}catch{return false;}})||candidates[0];
   let installed=false;try{installed=fs.statSync(file).size===model.bytes;}catch{}
   return {...t,name:model.name,bytes:model.bytes,file,installed,downloadGB:Math.round(model.bytes/1e9*100)/100};
  }).filter(Boolean);
 }
 async verifyTier(tier,settings,signal){
  const row=this.catalog(settings).find(t=>t.tier===tier);if(!row?.installed)throw fail('LOCAL_FILE_MISSING');
  const model=this.models.find(m=>m.id===row.id),stat=fs.statSync(row.file,{bigint:true}),signature=[stat.size,stat.mtimeNs,stat.ctimeNs,stat.ino].join('|');
  // A file written in the current filesystem timestamp tick can change without
  // changing its stat signature. Only memoize hashes of settled, older files.
  const reuseBefore=BigInt(Date.now()-1000)*1000000n,settled=stat.mtimeNs<reuseBefore&&stat.ctimeNs<reuseBefore;
  if(settled&&this.verified.get(row.file)===signature)return row;
  this.verified.delete(row.file);
  const hash=crypto.createHash('sha256');let size=0;
  for await(const chunk of fs.createReadStream(row.file)){if(signal?.aborted)throw fail('CANCELLED');size+=chunk.length;if(size>model.bytes)throw fail('LOCAL_MODEL');hash.update(chunk);}
  const after=fs.statSync(row.file,{bigint:true});if(signature!==[after.size,after.mtimeNs,after.ctimeNs,after.ino].join('|')||size!==model.bytes||hash.digest('hex')!==model.sha256)throw fail('LOCAL_MODEL');
  if(settled)this.verified.set(row.file,signature);return row;
 }
 status(){return {...this.progress,model:this.selected.name,modelId:this.selected.id,installed:fs.existsSync(path.join(this.directory,this.selected.file))};}
 cancel(){this.controller?.abort();}
 async download(id=MODEL.id){
  const MODEL=this.models.find(m=>m.id===id);if(!MODEL)throw fail('INVALID');
  if(this.controller)throw fail('BUSY');fs.mkdirSync(this.directory,{recursive:true});const target=path.join(this.directory,MODEL.file);
  
  
  const temp=target+'.'+crypto.randomUUID()+'.partial',controller=new AbortController();this.controller=controller;this.selected=MODEL;this.progress={state:'downloading',received:0,total:MODEL.bytes};let fd,last=0;
  try{
   if(fs.existsSync(target)){
    this.progress.state='verifying';const hash=crypto.createHash('sha256');let size=0;
    for await(const chunk of fs.createReadStream(target)){if(controller.signal.aborted)throw fail('CANCELLED');size+=chunk.length;if(size>MODEL.bytes)throw fail('LOCAL_MODEL');hash.update(chunk);}
    if(size!==MODEL.bytes||hash.digest('hex')!==MODEL.sha256)throw fail('LOCAL_MODEL');this.progress.state='installed';return target;
   }
   const space=fs.statfsSync(this.directory);if(space.bavail*space.bsize<MODEL.bytes+512*1024**2)throw fail('STORAGE');
   // This explicit model download contains no user prompts or account secrets.
   const r=await this.fetcher(MODEL.url,{signal:controller.signal,credentials:'omit',redirect:'follow'});if(!r.ok||!r.body)throw fail('NETWORK');
   fd=await fs.promises.open(temp,'wx',0o600);const hash=crypto.createHash('sha256');
   for await(const chunk of r.body){
    if(controller.signal.aborted)throw fail('CANCELLED');
    const b=Buffer.from(chunk);this.progress.received+=b.length;if(this.progress.received>MODEL.bytes)throw fail('LOCAL_MODEL');hash.update(b);
    let offset=0;while(offset<b.length){if(controller.signal.aborted)throw fail('CANCELLED');const {bytesWritten}=await fd.write(b,offset,b.length-offset);if(!bytesWritten)throw fail('STORAGE');offset+=bytesWritten;}
    if(Date.now()-last>500){this.emit({type:'model-download',...this.status()});last=Date.now();}
   }
   if(controller.signal.aborted)throw fail('CANCELLED');
   if(this.progress.received!==MODEL.bytes||hash.digest('hex')!==MODEL.sha256)throw fail('LOCAL_MODEL');
   await fd.sync();await fd.close();fd=undefined;
   if(controller.signal.aborted)throw fail('CANCELLED');
   // Publish without an await between the final cancellation check and rename.
   fs.renameSync(temp,target);this.progress.state='installed';return target;
  }catch(e){this.progress.state=controller.signal.aborted?'cancelled':'failed';if(e.code)throw e;throw fail('NETWORK');}
  finally{if(fd!==undefined)try{await fd.close();}catch{}try{await fs.promises.unlink(temp);}catch{}this.controller=null;this.emit({type:'model-download',...this.status()});}
 }
}
module.exports={MODEL,SMALL,ADVANCED,MODELS,TIERS,ModelManager};
