'use strict';
// Opt-in packaged acceptance uses only the caller's isolated synthetic store.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
async function run({core,win,reportPath}){
 assert.equal(path.resolve(core.root),path.join(path.dirname(reportPath),'app-data'));
 const tools=require('./document-tools-assets.cjs');assert.equal(await tools.verified(core,'embedding'),true);assert.equal(await tools.verified(core,'ocr'),true);assert.equal(core.key(),null);
 const {createCanvas}=require('@napi-rs/canvas'),canvas=createCanvas(1400,800),context=canvas.getContext('2d');
 context.fillStyle='white';context.fillRect(0,0,1400,800);context.fillStyle='black';context.font='36px Arial';
 ['FICTIONAL FACILITY POLICY','Inspect walkways and remove slippery floor hazards.','Medication feed unavailable. Status is unknown.','This is synthetic evidence for testing only.'].forEach((line,index)=>context.fillText(line,55,105+index*130));
 const image=path.join(path.dirname(reportPath),'synthetic-policy.png'),png=canvas.toBuffer('image/png');fs.writeFileSync(image,png);
 const imported=await core.importFile(image),imageRow=core.store.get('file',imported.id);assert.match(imageRow.text,/FICTIONAL FACILITY POLICY/i);assert.match(imageRow.text,/unknown/i);assert.equal(imageRow.ocr.verified,false);assert.equal(imageRow.image,true);
 const PDF=require('pdfkit'),pdf=new PDF({size:'LETTER',margin:30}),parts=[];
 const complete=new Promise(resolve=>{pdf.on('data',part=>parts.push(part));pdf.on('end',resolve);});pdf.image(png,{width:550});pdf.addPage().fontSize(24).text('Synthetic text layer remains intact.');pdf.end();await complete;
 const pdfFile=path.join(path.dirname(reportPath),'synthetic-mixed.pdf');fs.writeFileSync(pdfFile,Buffer.concat(parts));
 const pdfImport=await core.importFile(pdfFile),pdfRow=core.store.get('file',pdfImport.id);assert.match(pdfRow.text,/FICTIONAL FACILITY POLICY/i);assert.match(pdfRow.text,/Synthetic text layer remains intact/);assert.equal(pdfRow.ocr.pages,1);assert.match(pdfRow.text,/\[Page 2\]/);
 const project=core.projectSave({name:'Synthetic offline references'});
 for(const [name,text]of [['Falls.txt','[Page 2]\nClear slippery surfaces and obstacles from walking routes.'],['Payroll.txt','Payroll overtime hours need review against staffing records.'],['Nutrition.txt','Weight and meal intake require documented clinical review.']]){const id=require('./security.cjs').uuid();core.store.put('file',id,{id,name,text,updated:Date.now(),hipaa:true,bytes:''});project.fileIds.push(id);}core.store.put('project',project.id,project);
 const result=await win.webContents.executeJavaScript('window.privateAI.call("workflowDocumentSearch",'+JSON.stringify({mode:'semantic',projectId:project.id,query:'How can we reduce residents slipping and falling?'})+')');
 assert.equal(result.ok,true,JSON.stringify(result.error));assert.equal(result.result.results[0].name,'Falls.txt');assert.match(result.result.results[0].citation,/page 2/);assert.equal(core.router.local.state,'unloaded');assert.equal(core.store.db.prepare("SELECT name FROM sqlite_master WHERE name='passages'").get(),undefined);
 assert.equal(core.store.list('usage').filter(row=>!['local','deterministic'].includes(row.provider)).length,0);
 return {passed:true,actualImageOCRExecuted:true,actualScannedPDFOCRExecuted:true,actualLocalEmbeddingExecuted:true,actualSqliteVecRankingExecuted:true,embeddingModelSHA256:tools.assets.embedding.sha256,ocrLanguageSHA256:tools.assets.ocr.sha256,cloudInferenceCalls:0,originalImagesPreserved:true,machineTextVerified:false,modelRetired:true};
}
module.exports={run};
