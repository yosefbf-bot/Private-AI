'use strict';
const {pathToFileURL}=require('node:url');
async function loadPdf(){
 const pdf=await import('pdfjs-dist/legacy/build/pdf.mjs');
 // PDF.js does not select its Node worker default inside Electron utility
 // processes. Resolve the shipped worker explicitly, including inside app.asar.
 pdf.GlobalWorkerOptions.workerSrc=pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
 return pdf;
}
module.exports={loadPdf};
