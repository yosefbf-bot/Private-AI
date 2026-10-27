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

test('reference protocol and operator-entered recommendations never gain verification on save',t=>{
 const {core}=fixture(t),sbar=dispatch(core,'sbarGenerate',{residentName:'Synthetic Resident'});
 const protocol=dispatch(core,'sbarProtocols')[0];assert.equal(protocol.isCurrent,false);
 const result=dispatch(core,'sbarSave',{id:sbar.id,recommendations:[{text:'Synthetic request',safetyType:'facility_protocol',protocolRef:{protocolId:protocol.id},verified:true,sourceLabel:'Approved Facility Protocol'},
  {text:'Synthetic manual request',safetyType:'user_selected',verified:true}]});
 assert.equal(result.recommendations[0].verified,false);assert.match(result.recommendations[0].sourceLabel,/reference.*facility approval not recorded/i);
 assert.equal(result.recommendations[1].verified,false);
});


test('precise incident times survive normalization while missing and date-only occurrence times remain unknown',async t=>{
 const {core}=fixture(t),recent=new Date(Date.now()-12*3600000).toISOString(),day=recent.slice(0,10);
 await core.snf.ingestReports([report('census',[{residentId:'synthetic-r',name:'Synthetic Resident'}]),
  ...['falls','transfers'].map(type=>report(type,[
   {id:type+'-timed',residentId:'synthetic-r',eventDate:recent},
   {id:type+'-undated',residentId:'synthetic-r'},
   {id:type+'-date-only',residentId:'synthetic-r',eventDate:day}]))]);
 const handoff=dispatch(core,'sbarShiftHandoff');
 for(const [key,unknown,type] of [['fallsIncidents','fallsTimingUnknown','falls'],['hospitalTransfersReturns','transfersTimingUnknown','transfers']]){
  assert.deepEqual(handoff.sections[key].map(r=>r.originalData.id),[type+'-timed']);
  assert.equal(handoff.sections[key][0].occurrenceTime,recent);
  assert.deepEqual(handoff.sections[unknown].map(r=>r.originalData.id).sort(),[type+'-date-only',type+'-undated']);
  assert.ok(handoff.sections[unknown].every(r=>r.occurrenceTime===null));
 }
 const sbar=dispatch(core,'sbarGenerate',{residentId:'synthetic-r'});
 assert.equal(sbar.background.recentFalls.count,1);assert.equal(sbar.background.recentFalls.timingUnknownCount,2);
 assert.ok(sbar.background.recentFalls.evidence[0].provenance.rowId);
});

test('copied SBAR communication preserves unknown incident timing, including an unknown-only feed',async t=>{
 const {core}=fixture(t);
 await core.snf.ingestReports([report('census',[{residentId:'synthetic-unknown',name:'Synthetic Unknown'}]),report('falls',[{residentId:'synthetic-unknown',location:'Synthetic site'}])]);
 const sbar=dispatch(core,'sbarGenerate',{residentId:'synthetic-unknown'});
 assert.equal(sbar.background.recentFalls.count,0);assert.equal(sbar.background.recentFalls.timingUnknownCount,1);
 assert.match(sbar.adaptedCommunicationText,/Timing unknown: 1/);
 assert.match(sbar.adaptedCommunicationText,/does not establish absence/);
});
