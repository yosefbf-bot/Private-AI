'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
const {dispatch}=require('../source/operations-copilot.cjs');
const {forCore}=require('../source/snf/demo.cjs');
const report=(type,rows)=>({type,filename:`synthetic-${type}.csv`,date:new Date().toISOString(),rows});

test('clinical commands and deterministic routing use only the selected Demo workspace',async t=>{
 const {core}=fixture(t);
 await core.snf.ingestReports([report('census',[{residentId:'live-canary',name:'PRIVATE_LIVE_CANARY'}])]);
 const tools=require('../source/local-tools.cjs').createTools(core,{},{});
 await forCore(core).set({mode:'demo'});
 const original=core.snf.getResidentTimelineReport;
 core.snf.getResidentTimelineReport=()=>assert.fail('Demo command read production');
 t.after(()=>{core.snf.getResidentTimelineReport=original;});
 for(const command of ['/resident live-canary','/critical','/psychwatch','/newmeds','/behaviorgap','/diagnosisgap','/gdr','/prn14','/medchange','/unresolved','/morning','/7day','/qapi']){
  const result=await require('../source/deterministic.cjs').deterministic(command,[],tools);
  assert.match(result.text,/^DEMO DATA — NOT FOR CLINICAL USE/);assert.doesNotMatch(result.text,/PRIVATE_LIVE_CANARY/);
 }
});

test('overlapping meeting saves reject stale agenda edits without losing transcript or actions',t=>{
 const {core}=fixture(t),initial=dispatch(core,'meetingSave',{type:'general'});
 dispatch(core,'meetingAddTranscript',{meetingId:initial.id,text:'I will inspect the synthetic room tomorrow.'});
 const before=core.store.get('meeting',initial.id);assert.equal(before.transcript.length,1);assert.ok(before.actionItems.length);
 assert.throws(()=>dispatch(core,'meetingSave',{id:initial.id,revision:initial.revision,agenda:[]}),{code:'REVIEW_CHANGED'});
 assert.deepEqual(core.store.get('meeting',initial.id),before);
 const latest=dispatch(core,'meetingGet',{id:initial.id});
 const saved=dispatch(core,'meetingSave',{id:initial.id,revision:latest.revision,agenda:[{id:'synthetic-agenda',title:'Review',completed:false}]});
 assert.deepEqual(saved.transcript,before.transcript);assert.deepEqual(saved.actionItems,before.actionItems);
 assert.notEqual(saved.revision,latest.revision);
 assert.throws(()=>dispatch(core,'meetingSave',{id:initial.id,agenda:[]}),{code:'REVIEW_CHANGED'});
});

test('stale meeting saves cannot reopen a completed meeting, even with the current revision',t=>{
 const {core}=fixture(t),initial=dispatch(core,'meetingSave',{type:'general'});
 dispatch(core,'meetingFinalize',{meetingId:initial.id});
 assert.throws(()=>dispatch(core,'meetingSave',{...initial,status:'live'}),{code:'REVIEW_CHANGED'});
 const current=dispatch(core,'meetingGet',{id:initial.id});
 assert.throws(()=>dispatch(core,'meetingSave',{id:current.id,revision:current.revision,status:'live'}),{code:'POLICY'});
 assert.equal(dispatch(core,'meetingGet',{id:initial.id}).status,'completed');
});

test('handoff incident sections use imported evidence, preserving provenance and unknown coverage',async t=>{
 const {core}=fixture(t);
 await core.snf.ingestReports([report('census',[{residentId:'synthetic-r',name:'Synthetic Resident'}]),
  report('falls',[{residentId:'synthetic-r',eventDate:new Date().toISOString()}]),
  report('transfers',[{residentId:'synthetic-r',eventDate:new Date().toISOString()}]),
  report('wounds',[{residentId:'synthetic-r',site:'Synthetic site'}]),
  report('labs',[{residentId:'synthetic-r',testName:'Synthetic test',criticalValue:true}])]);
 const result=dispatch(core,'sbarShiftHandoff');
 for(const key of ['fallsIncidents','hospitalTransfersReturns','woundsSkin','pendingLabsTests']){
  assert.equal(result.sections[key].length,1,key);assert.ok(result.sections[key][0].provenance?.rowId,key);
 }
 assert.equal(result.sections.fallsIncidents[0].injuryLevel,null);
 assert.equal(result.sections.hospitalTransfersReturns[0].reason,null);
 assert.match(result.coverage.notice,/does not establish|unknown/i);
 assert.equal(result.sections.itemsRequiringFamilyNotification[0].notificationStatus,'unknown');
});

test('clinical notification requires a real entered recipient and records unknown actor explicitly',t=>{
 const {core}=fixture(t),sbar=dispatch(core,'sbarGenerate',{residentName:'Synthetic Resident'});
 assert.throws(()=>dispatch(core,'sbarLogNotification',{sbarId:sbar.id,recipientName:' '}),{code:'INVALID'});
 dispatch(core,'sbarLogNotification',{sbarId:sbar.id,recipientName:'Synthetic Recipient',outcome:'awaiting_callback'});
 const saved=dispatch(core,'sbarGet',{id:sbar.id}).notifications[0];
 assert.equal(saved.recipientName,'Synthetic Recipient');assert.equal(saved.user,'Unknown');assert.equal(saved.actorAttribution,'unknown');
});

test('clinical alert audit records supplied actor or unknown, never a fabricated clinician',t=>{
 const {core}=fixture(t),id='synthetic-alert';core.store.put('snf_alert',id,{id,severity:'review',status:'new',code:'AP-004',firstDetected:Date.now()});
 core.snf.acknowledgeAlert(id);
 let last=core.store.get('snf_alert',id).auditTrail.at(-1);assert.equal(last.user,'Unknown');assert.equal(last.actorAttribution,'unknown');
 core.snf.assignAlert(id,'Synthetic assignee','Synthetic reviewer');
 last=core.store.get('snf_alert',id).auditTrail.at(-1);assert.equal(last.user,'Synthetic reviewer');assert.equal(last.actorAttribution,'operator_entered');
});
