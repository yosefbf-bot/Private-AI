'use strict';
const fs=require('node:fs/promises');
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {safePath,fail}=require('./security.cjs');
const LIMIT=45000000;
if(!isMainThread&&workerData?.queuedEnvelope){
 let busy=false;
 parentPort.on('message',async({name})=>{
  if(busy)return;busy=true;let result=null,handle;
  try{
   if(!/^[a-f0-9-]{36}\.json$/.test(name))throw Error();
   const file=safePath(workerData.root,'Tasks/Queued/'+name);
   handle=await fs.open(file,'r');const before=await handle.stat();
   if(!before.isFile()||before.size>LIMIT)throw Error();
   // Bound allocation/read even if a synchronized file grows while open.
   const bytes=Buffer.alloc(before.size);let offset=0;
   while(offset<bytes.length){const r=await handle.read(bytes,offset,bytes.length-offset,offset);if(!r.bytesRead)throw Error();offset+=r.bytesRead;}
   const after=await handle.stat();if(after.size!==before.size||after.mtimeMs!==before.mtimeMs||after.ctimeMs!==before.ctimeMs)throw Error();
   const env=JSON.parse(bytes.toString('utf8'));
   // Foreign payloads never cross into the main-thread heap. Signature, peer,
   // expiry, validation and atomic claiming remain in the existing worker flow.
   if(env&&env.receiver===workerData.receiver&&name===env.id+'.json')result=env;
  }catch{}finally{await handle?.close().catch(()=>{});busy=false;parentPort.postMessage(result);}
 });
}
class QueuedEnvelopeReader{
 constructor(root,receiver){this.root=root;this.receiver=receiver;this.worker=null;this.pending=null;}
 read(name){
  if(this.pending)return Promise.reject(fail('BUSY'));
  if(!this.worker)this.worker=new Worker(__filename,{workerData:{queuedEnvelope:true,root:this.root,receiver:this.receiver},resourceLimits:{maxOldGenerationSizeMb:192,maxYoungGenerationSizeMb:16,stackSizeMb:4}});
  const worker=this.worker;
  return new Promise((resolve,reject)=>{
   let settled=false;
   const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);worker.off('message',message);worker.off('error',errorHandler);worker.off('exit',exit);this.pending=null;error?reject(fail('STORAGE')):resolve(result);};
   const message=result=>finish(false,result),errorHandler=()=>{finish(true);this.close();},exit=()=>{if(this.worker===worker)this.worker=null;finish(true);};
   const timer=setTimeout(()=>{finish(true);this.close();},30000);
   this.pending=()=>finish(true);worker.once('message',message);worker.once('error',errorHandler);worker.once('exit',exit);worker.postMessage({name});
  });
 }
 async close(){this.pending?.();const worker=this.worker;this.worker=null;if(worker)await worker.terminate();}
}
async function queuedNames(root){
 const names=[],dir=await fs.opendir(safePath(root,'Tasks/Queued'));
 try{for await(const entry of dir){if(/^[a-f0-9-]{36}\.json$/.test(entry.name))names.push(entry.name);if(names.length===200)break;}}finally{await dir.close().catch(()=>{});}
 return names;
}
module.exports={QueuedEnvelopeReader,queuedNames,LIMIT};
