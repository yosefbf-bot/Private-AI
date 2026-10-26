'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers.cjs');
const {Store}=require('../source/database.cjs');
const {fail}=require('../source/security.cjs');
const {processFile}=require('../source/files.cjs');
const {sectionedReport}=require('../source/sectioned-report.cjs');
const NOTICE='Ollama model metadata could not be fully read. Local provenance is unverified; cloud-indicated model names remain blocked.';
const SOURCE='Synthetic source evidence. '.repeat(220);
function setup(t,sectioned=false){
 const f=fixture(t);f.core.resources.memory=()=>8*1024**3;
 f.core.saveSettings({provider:'ollama',model:'ordinary',processingMode:'local-only',allowCloud:false,sectionedReports:sectioned,localContext:2048,localMaxOutput:256});
 return f;
}
function reload(f){
 f.core.store.close();
 f.core.store=new Store(path.join(f.root,'privateai.db'),f.cipher);
}
function job(core,sectioned,format='txt'){
 const j=core.jobPayload({title:'Synthetic provenance report',prompt:'Summarize the supplied synthetic evidence.',format});
 if(sectioned)j.files=[{name:'synthetic-evidence.txt',ext:'.txt',bytes:Buffer.from(SOURCE).toString('base64')}];
 return j;
}
function answer(usage={inputTokens:3,outputTokens:2}){
 return {text:'Synthetic section findings.\n\n| Item | Value |\n| --- | --- |\n| Synthetic | 42 |',provider:'ollama',model:'ordinary',usage,policyNotice:NOTICE};
}

test('mixed known and unknown section usage keeps each affected total unknown',async t=>{
 const {core}=setup(t);
 for(const unknown of ['inputTokens','outputTokens']){
  let calls=0;const checkpoint={};
  core.router.generate=async()=>answer({inputTokens:3,outputTokens:2,...(++calls===2?{[unknown]:null}:{})});
  const result=await sectionedReport(core,{prompt:'Summarize'},[{type:'input_text',text:'Summarize'},{type:'input_text',text:SOURCE}],checkpoint,()=>{},new AbortController().signal);
  assert.ok(calls>1);
  assert.equal(result.usage[unknown],null);
  const known=unknown==='inputTokens'?'outputTokens':'inputTokens';
  assert.equal(result.usage[known],calls*(known==='inputTokens'?3:2));
 }
});

test('missing section usage stays unknown and explicitly measured zero totals remain zero',async t=>{
 const {core}=setup(t),parts=[{type:'input_text',text:'Summarize'},{type:'input_text',text:SOURCE}];
 for(const usage of [undefined,{inputTokens:0,outputTokens:0}]){
  core.router.generate=async()=>({...answer(),usage});
  const result=await sectionedReport(core,{prompt:'Summarize'},parts,{},()=>{},new AbortController().signal);
  assert.deepEqual(result.usage,usage?{inputTokens:0,outputTokens:0}:{inputTokens:null,outputTokens:null});
 }
});

test('resumed sections preserve unknown usage and the earlier provenance notice after SQLite reload',async t=>{
 const f=setup(t,true),{core}=f,j=job(core,true),requests=[];let calls=0;
 core.router.generate=async(_key,_settings,messages)=>{
  requests.push(JSON.stringify(messages));calls++;
  if(calls===2)throw fail('NETWORK');
  return calls===1?answer({inputTokens:null,outputTokens:2}):{...answer(),policyNotice:null};
 };
 await core.runJob(j);
 let record=core.store.get('job',j.id);
 assert.equal(record.status,'failed');assert.equal(record.error,'NETWORK');
 assert.equal(record.checkpoint.sections.length,1);
 assert.equal(record.checkpoint.sections[0].usage.inputTokens,null);
 assert.equal(record.checkpoint.sections[0].policyNotice,NOTICE);
 const sectionCount=record.checkpoint.sectionPlan.length;assert.ok(sectionCount>1);
 reload(f);record=core.store.get('job',j.id);
 await core.runJob(record.recoveryInput);
 reload(f);record=core.store.get('job',j.id);
 assert.equal(record.status,'completed',record.reason);
 assert.equal(calls,sectionCount+1);
 assert.equal(requests.filter(request=>request===requests[0]).length,1,'The saved first section must not be generated again');
 assert.deepEqual(record.usage,{inputTokens:null,outputTokens:sectionCount*2});
 assert.equal(record.processing.policyNotice,NOTICE);
 assert.ok(fs.readFileSync(path.join(core.settings().workspace,record.output),'utf8').includes(NOTICE));
});

test('incomplete sections and the saved section plan survive settings changes and SQLite recovery',async t=>{
 const f=setup(t,true),{core}=f,j=job(core,true);let calls=0;
 core.router.generate=async()=>{if(++calls===2)throw fail('NETWORK');return {...answer(),incomplete:calls===1};};
 await core.runJob(j);let record=core.store.get('job',j.id);
 assert.equal(record.checkpoint.sections[0].incomplete,true);
 const count=record.checkpoint.sectionPlan.length;reload(f);
 core.saveSettings({sectionedReports:false});await core.runJob(core.store.get('job',j.id).recoveryInput);
 record=core.store.get('job',j.id);assert.equal(record.status,'completed',record.reason);assert.equal(calls,count+1);
 assert.equal(record.processing.incomplete,true);
 assert.match(fs.readFileSync(path.join(core.settings().workspace,record.output),'utf8'),/section 1[^\n]*incomplete/i);
});

test('finished sections need no context readmission and legacy completeness stays unknown',async t=>{
 const {core}=setup(t),checkpoint={sectionPlan:[{document:1,messages:[{role:'user',content:'X'.repeat(100000)}]}],sections:[answer()]};
 core.router.generate=async()=>assert.fail('no regeneration');
 const result=await sectionedReport(core,{prompt:'Synthetic'},[],checkpoint,()=>{},new AbortController().signal);
 assert.equal(result.incomplete,null);assert.match(result.text,/completeness.*unknown/i);
});

for(const sectioned of [false,true])test(`${sectioned?'sectioned':'ordinary'} job retains provenance through saved-answer recovery, export and reload`,async t=>{
 const f=setup(t,sectioned),{core}=f,j=job(core,sectioned);let calls=0;
 core.router.generate=async()=>{calls++;return answer();};
 const original=core.store.put.bind(core.store);let fault=true;
 core.store.put=(kind,id,value,options)=>{
  if(kind==='job'&&value.status==='completed'&&fault){fault=false;throw fail('STORAGE');}
  return original(kind,id,value,options);
 };
 await core.runJob(j);
 let record=core.store.get('job',j.id);
 assert.equal(record.status,'failed');assert.equal(record.error,'STORAGE');
 assert.equal(record.savedAnswer.policyNotice,NOTICE);
 assert.ok(record.resultText.includes(NOTICE));
 if(sectioned){
  assert.ok(record.checkpoint.sections.length>1);
  assert.ok(record.checkpoint.sections.every(section=>section.policyNotice===NOTICE));
 }else assert.equal(calls,1);
 const initialCalls=calls,relative=record.checkpoint.exportIntent.relative;
 const bytes=fs.readFileSync(path.join(core.settings().workspace,relative));
 assert.ok(bytes.toString('utf8').includes('Provider provenance limitation:'));
 assert.equal(bytes.toString('utf8').split(NOTICE).length-1,1,'Repeated section notices should be combined');
 reload(f);record=core.store.get('job',j.id);
 assert.equal(record.savedAnswer.policyNotice,NOTICE);
 await core.runJob(record.recoveryInput);
 reload(f);record=core.store.get('job',j.id);
 assert.equal(record.status,'completed',record.reason);assert.equal(calls,initialCalls);
 assert.equal(record.processing.policyNotice,NOTICE);
 assert.equal(record.output,relative);
 assert.deepEqual(fs.readFileSync(path.join(core.settings().workspace,record.output)),bytes);
 assert.equal(record.checkpoint,undefined);assert.equal(record.savedAnswer,undefined);
 assert.deepEqual(fs.readdirSync(path.join(core.settings().workspace,'Reports')),[path.basename(relative)]);
});

test('CSV and XLSX job exports retain provenance that appears outside the source table',async t=>{
 const {core}=setup(t);core.router.generate=async()=>answer();
 for(const format of ['csv','xlsx']){
  const j=job(core,false,format);await core.runJob(j);
  const record=core.store.get('job',j.id);assert.equal(record.status,'completed',record.reason);
  const bytes=fs.readFileSync(path.join(core.settings().workspace,record.output));
  const text=format==='csv'?bytes.toString('utf8'):(await processFile({op:'extract',ext:'.xlsx',bytes})).text;
  assert.ok(text.includes('Provider provenance limitation: '+NOTICE));assert.ok(text.includes('42'));
 }
});
