'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {fail}=require('./security.cjs');
async function transferSize(folder){
 if(!folder)return 0;
 const files=await fs.readdir(folder);if(files.length>100)throw fail('LIMIT');
 let bytes=0;for(const name of files){try{const s=await fs.stat(path.join(folder,name));if(s.isFile())bytes+=s.size;}catch(e){if(e.code!=='ENOENT')throw e;}}
 return bytes;
}
async function saveDownload(download,file,check,{folder,stallMs=120000,pollMs=1000,now=Date.now,progress=()=>transferSize(folder),close=async()=>{}}={}){
 let timer,stopped=false,previous=0,lastProgress=now();
 const saving=Promise.resolve().then(()=>download.saveAs(file));saving.catch(()=>{});
 const watchdog=new Promise((_,reject)=>{
  const poll=async()=>{try{check();const bytes=await progress();if(stopped)return;if(bytes>100*1024**2)throw fail('LIMIT');if(bytes>previous){lastProgress=now();previous=bytes;}if(now()-lastProgress>=stallMs)throw fail('NETWORK');timer=setTimeout(poll,pollMs);}catch(e){reject(e);}};
  timer=setTimeout(poll,pollMs);
 });
 try{await Promise.race([saving,watchdog]);check();if(await download.failure())throw fail('FILE');}
 catch(e){
  // Cancellation must settle the browser's write before caller deletes partials.
  try{await download.cancel();}catch{await close();}
  await Promise.allSettled([saving]);throw e;
 }finally{stopped=true;clearTimeout(timer);}
}
module.exports={saveDownload,transferSize};
