'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {validate,required}=require('../build/packaged-payload.cjs');
async function fixture(t,extra=[]){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'privateai-payload-')),input=path.join(root,'input'),stage=path.join(root,'stage');
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const write=(file)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'synthetic non-runtime fixture');};
 for(const name of [...required,...extra,...['cmaps','standard_fonts','iccs','wasm'].map(folder=>'node_modules/pdfjs-dist/'+folder+'/fixture')])write(path.join(input,name));
 for(const browser of ['','firefox/'])for(const file of ['readability.js','readability-LICENSE.md'])write(path.join(stage,'resources/chrome_extension',browser,'vendor',file));
 await require('@electron/asar').createPackageWithOptions(input,path.join(stage,'resources/app.asar'),{unpack:'**/*'});
 return stage;
}
test('actual archive validation retains OCR CPU fallbacks, PDF assets and browser parser licenses',async t=>{
 const stage=await fixture(t);assert.equal(validate(stage).checkedRuntimeFiles,required.length);
});
test('archive validation rejects a missing unpacked non-SIMD OCR engine',async t=>{
 const stage=await fixture(t);fs.unlinkSync(path.join(stage,'resources/app.asar.unpacked/node_modules/tesseract.js-core/tesseract-core-lstm.wasm'));
 assert.throws(()=>validate(stage),{code:'ENOENT'});
});
test('archive validation rejects duplicate browser WASM and debug payloads',async t=>{
 const stage=await fixture(t,['node_modules/tesseract.js-core/tesseract-core.wasm.js','node_modules/example/index.js.map']);
 assert.throws(()=>validate(stage),/Unused SDK/);
});
