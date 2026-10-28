'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{createRequire}=require('node:module');
const {fixture}=require('./helpers.cjs'),{main:processDocument}=require('../source/files-worker.cjs');
const tools=require('../source/document-tools-assets.cjs');
async function pdf(pages){
 const PDFDocument=require('pdfkit'),doc=new PDFDocument(),chunks=[];
 const ready=new Promise((resolve,reject)=>{doc.on('data',b=>chunks.push(b));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 pages.forEach((text,i)=>{if(i)doc.addPage();if(text)doc.text(text);});doc.end();return ready;
}
// Exercise the production Core method and real PDF.js over real Core/SQLite.
// Only the unavailable process boundary runs in-process in this harness.
function inProcessCore(t){
 const {core}=fixture(t),calls=[],filename=path.resolve(__dirname,'../source/core.cjs'),realRequire=createRequire(filename),module={exports:{}};
 const requireDocument=name=>name==='./files.cjs'?{...realRequire(name),processFile:async(args,options)=>{calls.push(args);if(options?.signal?.aborted)throw realRequire('./security.cjs').fail('CANCELLED');return processDocument(args);}}:realRequire(name);
 vm.compileFunction(fs.readFileSync(filename,'utf8'),['require','module','exports','__dirname'],{filename})(requireDocument,module,module.exports,path.dirname(filename));
 core.extractDocument=module.exports.Core.prototype.extractDocument.bind(core);return {core,calls};
}

test('text PDFs import below the OCR memory floor without loading or reserving OCR',async t=>{
 const {core,calls}=inProcessCore(t);core.resources.memory=()=>1.3*1024**3;
 t.mock.method(tools,'verified',()=>assert.fail('Embedded text must precede OCR asset verification'));
 t.mock.method(core.resources,'withAI',()=>assert.fail('Text PDFs do not need an OCR reservation'));
 const result=await core.extractDocument({op:'extract',ext:'.pdf',bytes:await pdf(['Synthetic embedded PDF text. All measured facts remain unknown.'])});
 assert.match(result.text,/Synthetic embedded PDF text/);assert.deepEqual(result.unreadablePages,[]);assert.equal(result.incomplete,false);assert.equal(calls.length,1);assert.equal(calls[0].ocrDirectory,undefined);assert.equal(core.requests.size,0);
});

test('mixed PDFs extract embedded pages first and retain OCR admission under constrained memory',async t=>{
 const {core,calls}=inProcessCore(t);core.resources.memory=()=>1.3*1024**3;t.mock.method(tools,'verified',async()=>true);
 await assert.rejects(core.extractDocument({op:'extract',ext:'.pdf',bytes:await pdf(['Synthetic embedded source text.', ''])}),{code:'LOW_MEMORY'});
 assert.equal(calls.length,1);assert.equal(calls[0].pdfTextOnly,true);assert.equal(core.requests.size,0);assert.equal(core.resources.ai,null);
});

test('mixed PDFs OCR only textless pages and preserve unreadable-page and incomplete-source reporting',async t=>{
 const {core,calls}=inProcessCore(t);core.resources.memory=()=>4*1024**3;t.mock.method(tools,'verified',async()=>true);
 const runtime=require('../source/pdf-runtime.cjs'),load=runtime.loadPdf;let secondText=0;const secondPages=[],scales=[],cleaned=[];
 t.mock.method(runtime,'loadPdf',async()=>{const pdf=await load();return {...pdf,getDocument(options){const job=pdf.getDocument(options);return {promise:job.promise.then(doc=>new Proxy(doc,{get(target,key){if(key==='getPage')return async p=>{const page=await target.getPage(p);if(calls.length===2)secondPages.push(p);return new Proxy(page,{get(target,key){if(key==='getViewport')return options=>{if(calls.length===2)scales.push(options.scale);return target.getViewport(options);};if(key==='cleanup')return()=>{if(calls.length===2)cleaned.push(p);return target.cleanup();};if(key==='getTextContent')return async(...args)=>{if(calls.length===2)secondText++;return target.getTextContent(...args);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}})),destroy:()=>job.destroy()};}};});
 const engine=require('../source/offline-ocr.cjs');let recognitions=0,closed=0;
 let active=0,peak=0;t.mock.method(engine,'create',async()=>({recognize:async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return {text:++recognitions===1?'Synthetic OCR source text.':''};},close:async()=>closed++}));
 const result=await core.extractDocument({op:'extract',ext:'.pdf',bytes:await pdf(['Synthetic embedded source text.','',''])});
 assert.equal(calls.length,2);assert.deepEqual(calls[1].ocrPages,[2,3]);assert.equal(recognitions,2);assert.equal(closed,1);
 assert.match(result.text,/Synthetic embedded source text/);assert.match(result.text,/Synthetic OCR source text/);assert.match(result.text,/Source incomplete; unreadable content remains unknown/);
 assert.deepEqual(result.unreadablePages,[3]);assert.equal(result.incomplete,true);assert.equal(result.ocr.pages,2);assert.deepEqual(result.ocr.unreadablePages,[3]);assert.equal(result.ocr.verified,false);assert.equal(core.requests.size,0);
 assert.equal(secondText,0,'carried text must not be extracted again');assert.deepEqual(secondPages,[2,3],'only selected OCR pages need loading');
 assert.equal(peak,1,'OCR pages stay serial');assert.deepEqual(scales,[2,2],'render quality is unchanged');assert.deepEqual(cleaned,[2,3],'each page is released before the next');
});

test('missing OCR preserves partial embedded text with explicit unavailable-page notices',async t=>{
 const {core}=inProcessCore(t);core.resources.memory=()=>1.3*1024**3;t.mock.method(tools,'verified',async()=>false);
 const result=await core.extractDocument({op:'extract',ext:'.pdf',bytes:await pdf(['Synthetic embedded source text.',''])});
 assert.deepEqual(result.unreadablePages,[2]);assert.equal(result.incomplete,true);assert.match(result.text,/No usable text.*Source incomplete/);assert.equal(result.ocr,undefined);
 await assert.rejects(core.extractDocument({op:'extract',ext:'.pdf',bytes:await pdf([''])}),{code:'FILE'});
});
