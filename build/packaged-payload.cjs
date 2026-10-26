'use strict';
// Validate the actual archive, including unpacked OCR CPU fallbacks. This is a
// build-time check; the application does not depend on the archive tooling.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const engines=['tesseract-core','tesseract-core-lstm','tesseract-core-simd','tesseract-core-simd-lstm','tesseract-core-relaxedsimd','tesseract-core-relaxedsimd-lstm'];
const required=[
 'source/ocr-thread.cjs','node_modules/tesseract.js/src/index.js',
 'node_modules/tesseract.js/src/worker-script/node/index.js','node_modules/tesseract.js/src/worker-script/node/getCore.js',
 'node_modules/tesseract.js/LICENSE.md','node_modules/tesseract.js-core/LICENSE',
 'node_modules/pdfjs-dist/LICENSE','node_modules/pdfjs-dist/legacy/build/pdf.mjs','node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
 'node_modules/exceljs/excel.js','node_modules/exceljs/lib/exceljs.nodejs.js','node_modules/exceljs/LICENSE',
 ...engines.flatMap(name=>['js','wasm'].map(ext=>'node_modules/tesseract.js-core/'+name+'.'+ext))
];
function validate(stage){
 const asar=require('@electron/asar'),archive=path.join(stage,'resources/app.asar');
 const entries=asar.listPackage(archive).map(name=>name.replace(/^[\\/]/,'').replaceAll('\\','/'));
 const names=new Set(entries);
 for(const name of required){
  assert.ok(names.has(name),'Packaged runtime file missing: '+name);
  const stat=asar.statFile(archive,name.split('/').join(path.sep));assert.ok(stat.size>0,'Packaged runtime file empty: '+name);
  if(name.includes('tesseract')||name==='source/ocr-thread.cjs'){
   assert.equal(stat.unpacked,true,'OCR runtime must be unpacked: '+name);
   assert.equal(fs.statSync(archive+'.unpacked/'+name).size,stat.size,'Unpacked OCR payload mismatch: '+name);
  }
 }
 const unwanted=entries.filter(name=>/^node_modules\/(?:@google\/genai|@mozilla\/readability)(?:\/|$)/.test(name)||/^node_modules\/.*\.(?:js|mjs|cjs)\.map$/.test(name)||/^node_modules\/tesseract\.js-core\/.*\.wasm\.js$/.test(name));
 assert.deepEqual(unwanted,[],'Unused SDK, build-only parser or duplicate/debug payload in application');
 for(const folder of ['cmaps','standard_fonts','iccs','wasm'])assert.ok(entries.some(name=>name.startsWith('node_modules/pdfjs-dist/'+folder+'/')),'PDF resources missing: '+folder);
 for(const browser of ['','firefox/'])for(const file of ['readability.js','readability-LICENSE.md'])assert.ok(fs.statSync(path.join(stage,'resources/chrome_extension',browser,'vendor',file)).size>0,'Browser parser/license missing');
 return {checkedRuntimeFiles:required.length,entries:entries.length,archiveBytes:fs.statSync(archive).size};
}
module.exports={validate,required};
