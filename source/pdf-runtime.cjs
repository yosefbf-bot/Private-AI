'use strict';
const {pathToFileURL}=require('node:url');
async function loadPdf(){
 // Electron utility processes are not classified as Node by PDF.js. Supply the
 // local raster types before import, without a DOM or an online browser service.
 for(const name of ['DOMMatrix','ImageData','Path2D'])if(typeof globalThis[name]==='undefined')globalThis[name]=require('@napi-rs/canvas')[name];
 const pdf=await import('pdfjs-dist/legacy/build/pdf.mjs');
 // PDF.js does not select its Node worker default inside Electron utility
 // processes. Resolve the shipped worker explicitly, including inside app.asar.
 pdf.GlobalWorkerOptions.workerSrc=pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
 return pdf;
}
class LocalCanvasFactory {
 create(width,height){require('./offline-ocr.cjs').pixels(Math.ceil(width),Math.ceil(height));const canvas=require('@napi-rs/canvas').createCanvas(width,height);return {canvas,context:canvas.getContext('2d')};}
 reset(target,width,height){require('./offline-ocr.cjs').pixels(Math.ceil(width),Math.ceil(height));if(!target.canvas)throw Error('FILE');target.canvas.width=width;target.canvas.height=height;}
 destroy(target){if(target.canvas){target.canvas.width=1;target.canvas.height=1;}target.canvas=null;target.context=null;}
}
module.exports={loadPdf,LocalCanvasFactory};
