'use strict';
// Runs inside the isolated document utility process. Images, rendered PDF pages
// and OCR work files stay in memory. No CDN/core/language fallback is permitted.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const spec=require('./document-tools-assets.json').ocr;
const MAX_PIXELS=16000000,MAX_OCR_PAGES=40;
function physical(file){return file.replace(/([\\/][^\\/]+\.asar)(?=[\\/])/,'$1.unpacked');}
function pixels(width,height){if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>16000||height>16000||width*height>MAX_PIXELS)throw Error('LIMIT');}
function dimensions(b,ext){
 if(ext==='.png'&&b.length>=24)return [b.readUInt32BE(16),b.readUInt32BE(20)];
 if(['.jpg','.jpeg'].includes(ext)){
  let at=2;
  while(at+4<=b.length){if(b[at++]!==255)throw Error('FILE');while(b[at]===255)at++;const marker=b[at++];if(marker===0xd9||marker===0xda)break;if(marker===0x01||(marker>=0xd0&&marker<=0xd8))continue;
   const length=b.readUInt16BE(at);if(length<2||at+length>b.length)throw Error('FILE');
   if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){if(length<8)throw Error('FILE');return [b.readUInt16BE(at+5),b.readUInt16BE(at+3)];}at+=length;
  }
 }
 if(ext==='.webp'&&b.length>=30){
  const kind=b.subarray(12,16).toString();
  if(kind==='VP8X')return [1+b.readUIntLE(24,3),1+b.readUIntLE(27,3)];
  if(kind==='VP8L'&&b[20]===0x2f){const value=b.readUInt32LE(21);return [(value&0x3fff)+1,((value>>>14)&0x3fff)+1];}
  if(kind==='VP8 '&&b.subarray(23,26).equals(Buffer.from([0x9d,1,0x2a])))return [b.readUInt16LE(26)&0x3fff,b.readUInt16LE(28)&0x3fff];
 }
 throw Error('FILE');
}
async function create(directory){
 if(typeof directory!=='string'||!path.isAbsolute(directory)||fs.lstatSync(directory).isSymbolicLink())throw Error('OCR_FAILED');
 const language=path.join(directory,spec.file),stat=fs.lstatSync(language);
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==spec.bytes)throw Error('OCR_FAILED');
 const h=crypto.createHash('sha256');for await(const part of fs.createReadStream(language))h.update(part);
 if(h.digest('hex')!==spec.sha256)throw Error('OCR_FAILED');
 const core=physical(path.dirname(require.resolve('tesseract.js-core/tesseract-core-lstm.wasm.js')));
 const workerPath=physical(require.resolve('./ocr-thread.cjs'));
 let worker;
 try{
  worker=await require('tesseract.js').createWorker('eng',1,{langPath:directory,corePath:core,workerPath,gzip:false,cacheMethod:'none',logging:false,logger:()=>{},errorHandler:()=>{}});
  await worker.setParameters({tessedit_pageseg_mode:'3',preserve_interword_spaces:'1'});
  return {async recognize(bytes){
   try{const result=await worker.recognize(bytes,{}, {text:true});const text=result.data.text||'';if(text.length>350000)throw Error('LIMIT');return {text,confidence:Number.isFinite(result.data.confidence)?result.data.confidence:null};}
   catch(e){if(e.message==='LIMIT')throw e;throw Error('OCR_FAILED');}
  },async close(){await worker.terminate();}};
 }catch{await worker?.terminate().catch(()=>{});throw Error('OCR_FAILED');}
}
module.exports={create,dimensions,pixels,physical,MAX_PIXELS,MAX_OCR_PAGES};
