"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {fixture}=require("./helpers.cjs"),{uuid}=require("../source/security.cjs");
const docs=require("../source/workflows/documents.cjs"),semantic=require("../source/workflows/semantic-search.cjs"),tools=require("../source/document-tools-assets.cjs");
const date=days=>{const value=new Date();value.setDate(value.getDate()+days);return docs.localCalendarDay(value.getTime());};
function setup(t,action) {
  const result=fixture(t),core=result.core,f={id:uuid(),name:"Synthetic policy.txt",text:"[Page 2]\nSynthetic source explains fall prevention.",bytes:"",hipaa:true,updated:Date.now()};core.store.put("file",f.id,f);
  const verified=tools.verified;tools.verified=async()=>true;t.after(()=>tools.verified=verified);
  const inputs=[];core.resources.memory=()=>8*1024**3;
  core.router.local={state:"unloaded",child:null,validate:()=>tools.assets.embedding.bytes,close(){},stop(){this.state="unloaded";},async waitStopped(){},async embeddings(_s,rows){inputs.push(...rows);await action?.(core,f);return rows.map(()=>{const v=new Float32Array(384);v[0]=1;return v;});}};
  return {...result,f,inputs};
}
function save(core,f,metadata) {const review=docs.review(core,{fileId:f.id});return docs.saveReview(core,{fileId:f.id,revision:review.revision,metadata});}

test("meaning search carries owner-review freshness without re-embedding unchanged source passages",async t=>{
  const {core,f,inputs,calls}=setup(t);
  const first=await semantic.search(core,{fileId:f.id,query:"fall prevention"});assert.equal(first.results[0].freshness.status,"unknown");
  save(core,f,{version:"Synthetic owner revision",reviewDate:date(-2),reviewDue:date(-1),reviewer:"Synthetic reviewer"});
  const before=inputs.length,last=await semantic.search(core,{fileId:f.id,query:"fall prevention"});
  assert.equal(last.results[0].freshness.status,"review-overdue");assert.equal(last.results[0].freshness.currency,"unknown");
  assert.equal(last.coverage[0].freshness.status,"review-overdue");assert.match(last.results[0].citation,/Synthetic policy.txt.*page 2/);
  assert.equal(inputs.length-before,1,"Only the new question needs an embedding after metadata review");assert.equal(calls.length,0);
});

for (const change of ["version","approval withdrawal","name"]) test("meaning search rejects stale citation review after asynchronous "+change,async t=>{
  let changed=false;
  const {core,f}=setup(t,(c,file)=>{
    if (changed) return;changed=true;
    if (change==="name") c.store.put("file",file.id,{...c.store.get("file",file.id),name:"Synthetic changed name.txt"});
    else {const previous=docs.review(c,{fileId:file.id});docs.saveReview(c,{fileId:file.id,revision:previous.revision,metadata:{...previous.metadata,...(change==="version"?{version:"Synthetic changed source version"}:{approvedAttestation:false})}});}
  });
  save(core,f,{version:"Synthetic initial version",reviewDate:date(0),reviewer:"Synthetic reviewer",approvedAttestation:true});
  await assert.rejects(semantic.search(core,{fileId:f.id,query:"fall prevention"}),{code:"REVIEW_CHANGED"});
  assert.equal(core.requests.size,0);assert.equal(core.router.local.state,"unloaded");
  const retry=await semantic.search(core,{fileId:f.id,query:"fall prevention"});assert.equal(retry.results.length,1);
  if (change==="name") assert.match(retry.results[0].citation,/Synthetic changed name.txt/);
});
