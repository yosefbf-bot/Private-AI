"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const {fixture}=require("./helpers.cjs"),{uuid}=require("../source/security.cjs");
const docs=require("../source/workflows/documents.cjs"),{Store}=require("../source/database.cjs"),{Core}=require("../source/core.cjs");
const date=days=>{const value=new Date();value.setDate(value.getDate()+days);return docs.localCalendarDay(value.getTime());};
function file(core,extra={}) {const f={id:uuid(),name:"Synthetic policy.txt",text:"SYNTHETIC original policy evidence.",bytes:Buffer.from("SYNTHETIC original document bytes").toString("base64"),hipaa:true,updated:Date.now(),...extra};core.store.put("file",f.id,f);return f;}
function save(core,f,metadata) {const r=docs.review(core,{fileId:f.id});return docs.saveReview(core,{fileId:f.id,revision:r.revision,metadata});}

test("undated documents remain unknown despite an upload timestamp",t=>{
  const {core}=fixture(t),f=file(core),review=docs.review(core,{fileId:f.id});
  assert.equal(review.metadata.sourceDate,null);assert.equal(review.metadata.effectiveDate,null);
  assert.equal(review.freshness.status,"unknown");assert.equal(review.freshness.currency,"unknown");
  assert.deepEqual(review.approval,{attested:false,proof:false});assert.match(review.freshness.notice,/upload\/update time does not establish/);
});

test("owner-recorded document review persists encrypted across reopening without altering originals or project links",t=>{
  const {core,root,cipher,calls}=fixture(t),f=file(core,{ownerChat:uuid(),ocr:{verified:false}});
  const project=core.projectSave({name:"Synthetic facility policy"});docs.link(core,{projectId:project.id,fileIds:[f.id]});
  const result=save(core,f,{sourceDate:"2020-02-29",effectiveDate:"2020-03-01",version:"Synthetic v2",reviewDate:date(0),reviewDue:date(7),reviewer:"SYNTHETIC_PRIVATE_REVIEWER",approvedAttestation:true});
  const stored=core.store.get("file",f.id),{referenceReview,...original}=stored;
  assert.deepEqual(original,f);assert.equal(referenceReview.sourceRevision,result.sourceRevision);
  assert.equal(result.freshness.status,"review-recorded");assert.equal(result.freshness.currency,"unknown");
  assert.deepEqual(result.approval,{attested:true,proof:false});assert.equal(calls.length,0);
  assert.deepEqual(core.store.get("project",project.id).fileIds,[f.id]);
  core.store.db.exec("PRAGMA wal_checkpoint(FULL)");
  for (const name of ["privateai.db","privateai.db-wal"]) if (fs.existsSync(path.join(root,name))) {
    const bytes=fs.readFileSync(path.join(root,name));assert.equal(bytes.includes(Buffer.from("SYNTHETIC_PRIVATE_REVIEWER")),false);
    assert.equal(bytes.includes(Buffer.from(f.text)),false);
  }
  core.close();const reopened=new Core({root,store:new Store(path.join(root,"privateai.db"),cipher),machine:"synthetic-machine"});
  try {assert.deepEqual(docs.review(reopened,{fileId:f.id}).metadata,result.metadata);assert.deepEqual(reopened.store.get("project",project.id).fileIds,[f.id]);}
  finally {reopened.close();}
});

test("strict calendar dates, named review and chronology fail without changing a file",t=>{
  const {core}=fixture(t),f=file(core),r=docs.review(core,{fileId:f.id});
  for (const metadata of [
    {sourceDate:"2025-02-29"},{effectiveDate:"2020-02-30"},{sourceDate:"2026-2-3"},
    {sourceDate:"0000-01-01"},{reviewDate:date(1)},
    {reviewDate:date(0),reviewDue:date(-1)},
    {approvedAttestation:true,reviewDate:date(0)},
    {approvedAttestation:true,reviewer:"Synthetic reviewer"},
    {reviewer:"Synthetic\nReviewer"},{version:"a".repeat(151)},{approvedAttestation:"true"},
  ]) assert.throws(()=>docs.saveReview(core,{fileId:f.id,revision:r.revision,metadata}),{code:"INVALID"});
  assert.deepEqual(core.store.get("file",f.id),f);
});

test("document review rejects concurrent metadata edits and every material source change",t=>{
  const {core}=fixture(t),f=file(core),r=docs.review(core,{fileId:f.id});
  const latest=docs.saveReview(core,{fileId:f.id,revision:r.revision,metadata:{version:"Synthetic reviewed revision"}});
  assert.throws(()=>docs.saveReview(core,{fileId:f.id,revision:r.revision,metadata:{version:"Stale edit"}}),{code:"REVIEW_CHANGED"});
  assert.equal(docs.review(core,{fileId:f.id}).metadata.version,latest.metadata.version);
  for (const changes of [{text:f.text+" Changed."},{bytes:"changed original"},{name:"Changed name.txt"},{hipaa:false},{updated:f.updated+1}]) {
    const original=core.store.get("file",f.id);core.store.put("file",f.id,{...original,...changes});
    assert.throws(()=>docs.saveReview(core,{fileId:f.id,revision:latest.revision,metadata:{}}),{code:"REVIEW_CHANGED"});
    assert.equal(docs.review(core,{fileId:f.id}).freshness.status,"source-changed");
    core.store.put("file",f.id,original);
  }
});

test("review overdue and future effective dates are disclosed without claiming clinical or regulatory validity",t=>{
  const {core}=fixture(t),f=file(core);
  let result=save(core,f,{reviewDate:date(-2),reviewDue:date(-1),reviewer:"Synthetic reviewer"});
  assert.equal(result.freshness.status,"review-overdue");assert.equal(result.freshness.requiresReview,true);
  result=save(core,f,{effectiveDate:date(1)});assert.equal(result.freshness.status,"not-yet-effective");
  assert.equal(result.freshness.currency,"unknown");assert.match(result.freshness.notice,/not independent proof/);
});

test("owner-local calendar boundaries govern review due, effective dates and future attestations",t=>{
  const {core}=fixture(t),f=file(core),previousZone=process.env.TZ,previousNow=Date.now;
  let now=Date.parse("2026-10-14T01:30:00Z");
  process.env.TZ="America/New_York";Date.now=()=>now;
  try {
    assert.equal(docs.localCalendarDay(),"2026-10-13");
    let reviewed=save(core,f,{reviewDate:"2026-10-13",reviewDue:"2026-10-13",reviewer:"Synthetic reviewer",approvedAttestation:true});
    assert.equal(reviewed.freshness.status,"review-recorded","A local due-today review is not overdue just because UTC crossed midnight");
    reviewed=save(core,f,{effectiveDate:"2026-10-14",reviewDate:"2026-10-13",reviewDue:"2026-10-13",reviewer:"Synthetic reviewer"});
    assert.equal(reviewed.freshness.status,"not-yet-effective");
    assert.throws(()=>save(core,f,{reviewDate:"2026-10-14",reviewer:"Synthetic reviewer",approvedAttestation:true}),{code:"INVALID"});
    now=Date.parse("2026-10-14T04:30:00Z");
    assert.equal(docs.localCalendarDay(),"2026-10-14");
    assert.equal(docs.review(core,{fileId:f.id}).freshness.status,"review-overdue");
  } finally {Date.now=previousNow;if(previousZone===undefined)delete process.env.TZ;else process.env.TZ=previousZone;}
});

test("document selection intersects explicit project and file scope, and deletion removes review access",t=>{
  const {core}=fixture(t),inside=file(core),outside=file(core,{name:"Other project.txt"});
  const project=core.projectSave({name:"Synthetic scoped project"});docs.link(core,{projectId:project.id,fileIds:[inside.id]});
  assert.equal(docs.review(core,{fileId:inside.id,projectId:project.id}).fileId,inside.id);
  for (const fn of [docs.review,docs.search]) assert.throws(()=>fn(core,{fileId:outside.id,projectId:project.id}),{code:"POLICY"});
  save(core,inside,{version:"Retained with original only"});core.store.delete("file",inside.id);
  assert.throws(()=>docs.review(core,{fileId:inside.id}),{code:"NOT_FOUND"});
  core.lock();assert.throws(()=>docs.review(core,{fileId:outside.id}),{code:"LOCKED"});
});

test("legacy or malformed project membership never widens search to global documents",t=>{
  const {core}=fixture(t),f=file(core),project={id:uuid(),name:"Synthetic legacy project"};
  for (const membership of [undefined,null,"unexpected",{}]) {
    core.store.put("project",project.id,{...project,...(membership===undefined?{}:{fileIds:membership})});
    assert.equal(docs.search(core,{projectId:project.id,query:"evidence"}).results.length,0);
    assert.throws(()=>docs.review(core,{projectId:project.id,fileId:f.id}),{code:"POLICY"});
  }
  assert.equal(docs.search(core,{query:"evidence"}).results.length,1,"Explicit global scope remains available to the unlocked owner");
  for (const value of [false,0,{},[]]) {
    assert.throws(()=>docs.search(core,{projectId:value,query:"evidence"}),{code:"INVALID"});
    assert.throws(()=>docs.search(core,{fileId:value,query:"evidence"}),{code:"INVALID"});
  }
});

test("lexical results and coverage expose saved review status with original source citations",t=>{
  const {core}=fixture(t),f=file(core);save(core,f,{reviewDate:date(-2),reviewDue:date(-1),reviewer:"Synthetic reviewer"});
  const results=docs.search(core,{fileId:f.id,query:"evidence"});
  assert.equal(results.coverage[0].freshness.status,"review-overdue");assert.equal(results.results[0].freshness.status,"review-overdue");
  assert.equal(results.results[0].text,f.text);assert.match(results.results[0].citation,/Synthetic policy.txt.*characters/);
});

test("new document and disclosure operations retain authoritative development and Demo denial",async t=>{
  const {core}=fixture(t),{dispatch}=require("../source/workflows/index.cjs"),f=file(core);
  const operations=["workflowDocumentReview","workflowDocumentReviewSave","workflowDisclosureReview","workflowDisclosureRedact"];
  core.developmentMode=true;
  for (const op of operations) await assert.rejects(dispatch(core,op,{fileId:f.id}),{code:"POLICY"});
  core.developmentMode=false;await require("../source/snf/demo.cjs").forCore(core).set({mode:"demo"});
  for (const op of operations) await assert.rejects(dispatch(core,op,{fileId:f.id}),{code:"POLICY"});
});
