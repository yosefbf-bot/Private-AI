'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs'),{fail}=require('../source/security.cjs');
const {exportFile}=require('../source/files.cjs');
function setup(t,format='md'){
 const f=fixture(t),{core}=f;core.resources.memory=()=>8*1024**3;
 core.saveSettings({sectionedReports:true,processingMode:'local-only',localContext:2048,localMaxOutput:256});
 const j=core.jobPayload({title:'Synthetic multipart',prompt:'Synthetic analysis',format});j.files=[{name:'Synthetic.txt',ext:'.txt',bytes:Buffer.from('Synthetic evidence '.repeat(300)).toString('base64')}];
 let calls=0;core.router.generate=async()=>{calls++;return {text:'start '+('💠 Synthetic complete evidence\n'.repeat(8000))+' end',provider:'local',incomplete:true};};
 return {...f,j,calls:()=>calls};
}
test('large sectioned reports publish bounded complete parts and an index; saved-answer retry never regenerates',async t=>{
 const {core,j,calls}=setup(t),put=core.store.put.bind(core.store);let injected=false;
 core.store.put=(kind,id,value,...rest)=>{
  if(kind==='job'&&value.checkpoint?.multipartExport?.entries?.[1]?.intent&&!injected){injected=true;throw fail('STORAGE');}
  return put(kind,id,value,...rest);
 };
 await core.runJob(j);let row=core.store.get('job',j.id);assert.equal(row.status,'failed');assert.equal(row.error,'STORAGE');
 const source=row.resultText,generated=calls();assert.ok(source.length>421263);assert.ok(injected);
 const first=row.checkpoint.multipartExport.entries[0].intent,firstBytes=fs.readFileSync(path.join(core.settings().workspace,first.relative));
 core.saveSettings({sectionedReports:false,contextChars:4000});await core.runJob(row.recoveryInput);
 row=core.store.get('job',j.id);assert.equal(row.status,'completed',row.reason);assert.equal(calls(),generated);
 assert.deepEqual(fs.readFileSync(path.join(core.settings().workspace,first.relative)),firstBytes);
 const index=fs.readFileSync(path.join(core.settings().workspace,row.output),'utf8');assert.match(index,/incomplete/i);
 const links=[...index.matchAll(/\[Complete text part \d+\]\(([^)]+)\)/g)].map(m=>decodeURIComponent(m[1]));assert.ok(links.length>1);
 const parts=links.map(x=>fs.readFileSync(path.join(core.settings().workspace,'Reports',x),'utf8'));
 assert.ok(parts.every(x=>x.length<=350000));assert.equal(parts.join(''),source);
 assert.equal(fs.readdirSync(path.join(core.settings().workspace,'Reports')).length,links.length+1);
});
test('multipart recovery refuses changed published parts and normal oversized exports remain rejected',async t=>{
 const {core,j,calls}=setup(t),put=core.store.put.bind(core.store);let once=true;
 core.store.put=(kind,id,value,...rest)=>{if(kind==='job'&&value.status==='completed'&&once){once=false;throw fail('STORAGE');}return put(kind,id,value,...rest);};
 await core.runJob(j);let row=core.store.get('job',j.id);assert.equal(row.status,'failed');
 const generated=calls(),first=row.checkpoint.multipartExport.entries[0].intent;
 fs.appendFileSync(path.join(core.settings().workspace,first.relative),'changed');
 await core.runJob(row.recoveryInput);row=core.store.get('job',j.id);assert.equal(row.error,'CHANGED');assert.equal(calls(),generated);
 await assert.rejects(core.retryExport(j.id,'md'),{code:'RECOVERY'});
 await assert.rejects(exportFile(core.settings().workspace,{content:'x'.repeat(350001),format:'md'}),{code:'LIMIT'});
});

for(const format of ['csv','xlsx'])test(`${format}: missing prepared parts keep their paths and tabular multipart retains the complete narrative`,async t=>{
 const {core}=fixture(t),{exportSectioned}=require('../source/sectioned-export.cjs'),checkpoint={};
 const content='Narrative including all limitations. 💠\n'.repeat(11000)+'\n| Item | Value |\n| --- | --- |\n| Synthetic | 42 |\n',options={content,format,jobId:'synthetic',checkpoint,saveStep:()=>{},checkpointResources:async()=>{},incomplete:null,policyNotice:'Synthetic local provenance is unverified.'};
 const first=await exportSectioned(core.settings().workspace,options),entry=checkpoint.multipartExport.entries[0],relative=entry.intent.relative;
 fs.unlinkSync(path.join(core.settings().workspace,relative));
 const again=await exportSectioned(core.settings().workspace,options);assert.equal(again.relative,first.relative);assert.equal(entry.intent.relative,relative);
 const parts=checkpoint.multipartExport.entries.filter(e=>e.completeText).map(e=>fs.readFileSync(path.join(core.settings().workspace,e.intent.relative),'utf8'));assert.equal(parts.join(''),content);
 const table=checkpoint.multipartExport.entries.find(e=>e.format===format),bytes=fs.readFileSync(path.join(core.settings().workspace,table.intent.relative));
 const tableText=format==='csv'?bytes.toString('utf8'):(await require('../source/files.cjs').processFile({op:'extract',ext:'.xlsx',bytes})).text;
 assert.match(tableText,/Synthetic.*42/);assert.match(tableText,/Provider provenance limitation: Synthetic local provenance is unverified/);
 assert.match(fs.readFileSync(again.path,'utf8'),/completeness is unknown/);
});
