"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {fixture}=require("./helpers.cjs"),{uuid}=require("../source/security.cjs");
const disclosure=require("../source/workflows/disclosure-review.cjs"),docs=require("../source/workflows/documents.cjs");
function file(core,text) {const row={id:uuid(),name:"Synthetic disclosure source.txt",text,bytes:Buffer.from(text).toString("base64"),hipaa:true,updated:Date.now()};core.store.put("file",row.id,row);return row;}

test("local identifier suggestions retain exact source ranges and bounded review context",t=>{
  const {core,calls}=fixture(t),text="🙂 SYNTHETIC: SSN 123-45-6789; contact tester@example.invalid; phone (212) 555-0100; DOB: 01/02/2000; MRN: SYN12345.";
  const f=file(core,text),result=disclosure.review(core,{fileId:f.id});
  assert.deepEqual(result.spans.map(x=>x.type),["ssn","email","phone","dob","mrn"]);
  assert.equal(result.spans.find(x=>x.type==="mrn").value,"SYN12345");
  for (const span of result.spans) {assert.equal(span.value,text.slice(span.start,span.end));assert.ok(span.snippet.includes(span.value));assert.ok(span.snippet.length<=200);}
  assert.equal(result.coverage.incomplete,false);assert.equal(calls.length,0);
  assert.match(result.notice,/may miss names/);assert.match(result.notice,/No matches does not mean PHI-free/);
});

test("privacy review explicitly tolerates false positives and cannot establish absence of sensitive clinical details",t=>{
  const {core}=fixture(t),benign=file(core,"SYNTHETIC harmless example address support@example.invalid.");
  assert.equal(disclosure.review(core,{fileId:benign.id}).spans[0].type,"email");
  const missed=file(core,"SYNTHETIC Jane Example has a clinical condition at Fictional Avenue. MRN: unknown. Reference date 2020-01-02.");
  const result=disclosure.review(core,{fileId:missed.id});assert.equal(result.spans.length,0);
  assert.match(result.notice,/No matches does not mean PHI-free/);assert.match(result.notice,/permissions still apply/);
});

test("redaction creates only the selected source-bound copy and preserves originals and privacy settings",t=>{
  const {core,calls}=fixture(t),text="SYNTHETIC email tester@example.invalid and SSN 123-45-6789",f=file(core,text);
  const settings=core.settings(),result=disclosure.review(core,{fileId:f.id}),email=result.spans.find(x=>x.type==="email");
  const copy=disclosure.redactCopy(core,{fileId:f.id,revision:result.revision,selectedSpans:[email.id]});
  assert.equal(copy.text,"SYNTHETIC email [REDACTED] and SSN 123-45-6789");
  assert.equal(copy.redactions,1);assert.deepEqual(copy.counts,{email:1});assert.equal(copy.originalPreserved,true);
  assert.deepEqual(core.store.get("file",f.id),f);assert.deepEqual(core.settings(),settings);assert.equal(calls.length,0);
  assert.equal(docs.sourceRevision(f),copy.sourceRevision);
});

test("edited source text, original bytes, HIPAA tag or name invalidates privacy copy review",t=>{
  const {core}=fixture(t),f=file(core,"SYNTHETIC tester@example.invalid"),result=disclosure.review(core,{fileId:f.id});
  for (const change of [{text:f.text+" modified"},{bytes:"different"},{hipaa:false},{name:"Different source.txt"}]) {
    core.store.put("file",f.id,{...f,...change});
    assert.throws(()=>disclosure.redactCopy(core,{fileId:f.id,revision:result.revision,selectedSpans:[result.spans[0].id]}),{code:"REVIEW_CHANGED"});
    core.store.put("file",f.id,f);
  }
});

test("invented or stale candidate selection cannot produce a misleading reviewed copy",t=>{
  const {core}=fixture(t),f=file(core,"SYNTHETIC tester@example.invalid"),result=disclosure.review(core,{fileId:f.id});
  for (const selectedSpans of [[],["invented"],[{start:0,end:3}],Array(101).fill(result.spans[0].id)]) {
    assert.throws(()=>disclosure.redactCopy(core,{fileId:f.id,revision:result.revision,selectedSpans}));
  }
  assert.deepEqual(core.store.get("file",f.id),f);
});

test("manual ranges bind exact Unicode-safe positions, merge overlap and invalidate when changed",t=>{
  const {core}=fixture(t),f=file(core,"SYNTHETIC 🙂 tester@example.invalid");
  const emoji=f.text.indexOf("🙂");
  assert.throws(()=>disclosure.review(core,{fileId:f.id,manualSpans:[{start:emoji+1,end:emoji+2}]}),{code:"INVALID"});
  const manualSpans=[{start:emoji,end:emoji+2},{start:f.text.indexOf("tester"),end:f.text.length}];
  const reviewed=disclosure.review(core,{fileId:f.id,manualSpans});
  const copy=disclosure.redactCopy(core,{fileId:f.id,revision:reviewed.revision,manualSpans:reviewed.manualSpans,selectedSpans:reviewed.spans.map(x=>x.id)});
  assert.equal(copy.text,"SYNTHETIC [REDACTED] [REDACTED]");assert.equal(copy.redactions,2);assert.equal(copy.selectedCandidates,3);
  assert.throws(()=>disclosure.redactCopy(core,{fileId:f.id,revision:reviewed.revision,manualSpans:[],selectedSpans:reviewed.spans.map(x=>x.id)}),{code:"REVIEW_CHANGED"});
});

test("identifier review bounds candidate count and text without claiming complete coverage",t=>{
  const {core}=fixture(t),f=file(core,Array.from({length:101},(_,n)=>`test${n}@example.invalid`).join(" "));
  const result=disclosure.review(core,{fileId:f.id});assert.equal(result.spans.length,100);
  assert.equal(result.coverage.incomplete,true);assert.match(result.notice,/additional patterns may remain/);
  assert.throws(()=>disclosure.analyze("x".repeat(disclosure.MAX_TEXT+1)),{code:"LIMIT"});
  assert.equal(disclosure.analyze("x".repeat(disclosure.MAX_TEXT)).spans.length,0);
  assert.throws(()=>disclosure.review(core,{fileId:f.id,manualSpans:Array(101).fill({start:0,end:1})}),{code:"INVALID"});
});

test("redacted copy expansion cannot exceed the existing extracted-text limit or mutate its original",t=>{
  const {core}=fixture(t),f=file(core,"S"+"x".repeat(disclosure.MAX_TEXT-1));
  const reviewed=disclosure.review(core,{fileId:f.id,manualSpans:[{start:0,end:1}]});
  assert.throws(()=>disclosure.redactCopy(core,{fileId:f.id,revision:reviewed.revision,manualSpans:reviewed.manualSpans,selectedSpans:[reviewed.spans[0].id]}),{code:"LIMIT"});
  assert.deepEqual(core.store.get("file",f.id),f);
});

test("privacy review denies locked, deleted and out-of-project sources",t=>{
  const {core}=fixture(t),f=file(core,"SYNTHETIC tester@example.invalid"),project=core.projectSave({name:"Other project",fileIds:[]});
  assert.throws(()=>disclosure.review(core,{fileId:f.id,projectId:project.id}),{code:"POLICY"});
  core.lock();assert.throws(()=>disclosure.review(core,{fileId:f.id}),{code:"LOCKED"});core.unlock();
  core.store.delete("file",f.id);assert.throws(()=>disclosure.review(core,{fileId:f.id}),{code:"NOT_FOUND"});
});
