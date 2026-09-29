'use strict';
// No caller input or user files. Diagnostic used only by isolated Windows acceptance.
(async()=>{
 const result={stage:'pdf-export',passed:false};
 try{
  const bytes=await require('./report-format.cjs').pdf('Synthetic Windows document check. Total: 42.','Synthetic acceptance');
  result.stage='pdf-module';const pdf=await require('./pdf-runtime.cjs').loadPdf();
  result.stage='pdf-extract';const job=pdf.getDocument({data:new Uint8Array(bytes),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,verbosity:0});
  try{const doc=await job.promise;const text=(await (await doc.getPage(1)).getTextContent()).items.map(i=>i.str).join(' ');if(!text.includes('42'))throw Error('Synthetic text missing');}finally{await job.destroy();}
  result.passed=true;
 }catch(e){result.error={name:e.name,message:e.message};}
 process.parentPort.postMessage(result);
})().catch(()=>process.exit(1));
