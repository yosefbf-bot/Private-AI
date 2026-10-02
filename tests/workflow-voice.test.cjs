'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers.cjs');
const {measuredSample}=require('./measured-speaker-fixture.cjs');
const {dispatch,OperationsCopilotEngine}=require('../source/operations-copilot.cjs');
const {SpeakerRecognitionService}=require('../source/meeting-audio-pipeline.cjs');
const {HybridRouter}=require('../source/hybrid-router.cjs');
const report=(type,rows)=>({type,date:new Date().toISOString(),rows});
function enroll(core,name='Synthetic Speaker',patch={}){
 const service=new SpeakerRecognitionService(core),p=service.createProfile({name});
 for(let i=0;i<3;i++)assert.equal(service.addVerifiedSample(p.id,measuredSample(patch)).accepted,true);
 return p;
}
test('missing admission/transfer/fall facts and CSV false values remain distinct from evidence',async t=>{
 const {core}=fixture(t);await core.snf.ingestReports([
 report('census',[{residentId:'test-resident',name:'Synthetic'}]),
 ...['admissions','transfers','falls'].map(type=>report(type,[{residentId:'test-resident'}])),
 report('clinical24',[{residentId:'test-resident',providerNotified:'false',familyNotified:'no'}])]);
 assert.equal(core.store.list('snf_admission')[0].primaryDiagnosis,null);
 assert.equal(core.store.list('snf_admission')[0].admittedFrom,null);
 assert.equal(core.store.list('snf_transfer')[0].hospital,null);
 assert.equal(core.store.list('snf_transfer')[0].reason,null);
 assert.equal(core.store.list('snf_fall')[0].injuryLevel,null);
 assert.equal(core.store.list('snf_fall')[0].witnessed,null);
 assert.equal(core.store.list('snf_clinical24')[0].providerNotified,false);
 assert.equal(core.store.list('snf_clinical24')[0].familyNotified,false);
});
test('ambiguous resident lookup requires stable ID and exact IDs win over name matches',async t=>{
 const {core}=fixture(t);await core.snf.ingestReports([report('census',[{residentId:'test-a',name:'Alex Testsmith'},{residentId:'test-b',name:'Taylor Testsmith'}])]);
 assert.match(core.snf.getResidentTimelineReport('Testsmith'),/Multiple residents match/);
 assert.match(core.snf.getResidentTimelineReport('test-b'),/TIMELINE: Taylor Testsmith/);
});
test('handoff includes all followups and monitoring residents with correct totals',t=>{
 const {core}=fixture(t);
 for(let i=0;i<15;i++){core.saveTodo({title:'Synthetic '+i});core.store.put('snf_alert','a'+i,{id:'a'+i,status:'new',severity:'high',title:'Synthetic concern',residentName:'Synthetic '+i});}
 const handoff=dispatch(core,'sbarShiftHandoff');assert.equal(handoff.summary.totalPendingFollowUps,15);
 assert.equal(handoff.sections.followUpsPending.length,15);assert.equal(handoff.sections.residentsRequiringMonitoring.length,15);
});
test('meeting task completion and reopening synchronize, including legacy links and summaries',t=>{
 const {core}=fixture(t),ops=new OperationsCopilotEngine(core),meeting=ops.createMeeting();
 const updated=ops.addTranscriptEntry(meeting.id,{speaker:'Synthetic reviewer',speakerConfirmed:true,text:'I will review the report tomorrow.'});
 const item=updated.actionItems[0];assert.ok(item);assert.equal(item.dueDate,null);
 const converted=ops.convertActionItemToTodo(meeting.id,item.id);core.toggleTodoStatus(converted.todo.id);
 assert.equal(core.store.get('meeting',meeting.id).actionItems[0].status,'completed');
 assert.equal(ops.getOperationsSummary().meetings.pendingActionItemsCount,0);
 core.toggleTodoStatus(converted.todo.id);assert.equal(ops.getMeeting(meeting.id).actionItems[0].status,'in_progress');
 assert.equal(ops.getOperationsSummary().meetings.pendingActionItemsCount,1);
});
test('briefing uses recorded tasks; generic checklist is opt-in and labeled',t=>{
 const {core}=fixture(t);core.saveTodo({title:'Review synthetic invoice'});
 const brief=dispatch(core,'operationsHuddleBrief').text;
 assert.match(brief,/Review synthetic invoice/);assert.doesNotMatch(brief,/OPTIONAL GENERAL CHECKLIST|MDS:/);
 assert.match(dispatch(core,'operationsHuddleBrief',{includeChecklist:true}).text,/NOT GENERATED FINDINGS OR ASSIGNMENTS/);
});
test('clinical text uses local inference with evidence instructions and review requirements',async t=>{
 const {core}=fixture(t);core.saveSettings({processingMode:'local-only',localTier:'selected'});
 let calls=0;const local={generate:async()=>{calls++;return {text:JSON.stringify({answer:'Synthetic medicine',evidence:['Synthetic medicine'],uncertainties:[]})};},modelName:()=> 'test'};
 // Isolate routing from the separately-tested runtime/RAM loader.
 const resources=core.resources;core.resources=null;
 try{
 const router=new HybridRouter(core,{local});
 const messages=prompt=>[{role:'user',content:[{type:'input_text',text:prompt},{type:'input_text',text:'UNTRUSTED DOCUMENT REFERENCE: Synthetic medicine'}]}];
 const response=await router.generate('',core.settings(),messages('List medication names from the supplied report.'));
 assert.equal(response.provider,'local');assert.equal(calls,1);
 const clinical=await router.generate('',core.settings(),messages('Review medication treatment documentation.'));
 assert.equal(clinical.provider,'local');assert.match(clinical.reliability.label,/review/i);assert.equal(calls,2);
 }finally{core.resources=resources;}
});
test('non-OpenAI cloud usage retains tokens and reports unpriced instead of free/local',t=>{
 const {core}=fixture(t),meter=new (require('../source/usage-meter.cjs').UsageMeter)(core);
 const row=meter.record({provider:'groq',model:'synthetic',usage:{inputTokens:10,outputTokens:5}},core.settings());
 assert.equal(row.inputTokens,10);assert.equal(row.estimatedCost,null);
 assert.equal(meter.summary().today.cloud,1);assert.equal(meter.summary().today.local,0);assert.equal(meter.summary().today.unpriced,1);
});
test('speaker suggestions require three independent confirmed recordings and never self-verify',t=>{
 const {core}=fixture(t),service=new SpeakerRecognitionService(core),p=service.createProfile({name:'Synthetic Speaker'});
 const first=measuredSample();assert.equal(service.addVerifiedSample(p.id,first).accepted,true);
 assert.equal(service.addVerifiedSample(p.id,first).accepted,false);
 assert.equal(service.identifySpeaker(measuredSample()).label,'Unknown Speaker');
 for(let i=0;i<2;i++)assert.equal(service.addVerifiedSample(p.id,measuredSample()).accepted,true);
 const match=service.identifySpeaker(measuredSample());assert.equal(match.label,p.name);
 assert.equal(match.needsConfirmation,true);assert.equal(match.speakerVerified,false);assert.equal(match.confidenceLevel,'possible');
 assert.equal(match.confidenceScore,undefined);
});
test('noisy, overlapping, short, unconfirmed, stale and malformed samples cannot enroll',t=>{
 const {core}=fixture(t),service=new SpeakerRecognitionService(core),p=service.createProfile({name:'Synthetic'});
 for(const patch of [{snrDb:5},{isOverlapping:true},{durationSeconds:1},{singleSpeakerConfirmed:false},{identityConfirmed:false},{verifiedBy:''},{capturedAt:1},{spectrum:[NaN]},{pitchMean:Infinity},{clippingRatio:.1}])
 assert.equal(service.addVerifiedSample(p.id,measuredSample(patch)).accepted,false,JSON.stringify(patch));
 assert.equal(service.getProfile(p.id).samples.length,0);
});
test('similar voices abstain, roster cannot force identity, and old two-feature samples are excluded',t=>{
 const {core}=fixture(t);enroll(core,'Synthetic A');enroll(core,'Synthetic B');const service=new SpeakerRecognitionService(core);
 assert.equal(service.identifySpeaker(measuredSample(),[{name:'Synthetic A'}]).label,'Unknown Speaker');
 assert.equal(service.identifySpeaker(measuredSample({snrDb:3})).label,'Unknown Speaker');
 const p=service.createProfile({name:'Legacy'});core.store.put('speaker_profile',p.id,{...p,samples:[{pitchMean:180,spectralCentroid:1400,verifiedBy:'Legacy'}]});
 assert.equal(service.listProfiles().find(x=>x.id===p.id).samples.length,0);
});
test('measured transcript suggestions leave owners unassigned until explicit per-entry confirmation',t=>{
 const {core}=fixture(t);enroll(core);const meeting=dispatch(core,'meetingSave');
 const updated=dispatch(core,'meetingAddTranscript',{meetingId:meeting.id,text:'I will review the report tomorrow.',speaker:'Override name',speakerConfirmed:true,acousticFeatures:measuredSample()});
 const entry=updated.transcript[0];assert.equal(entry.speaker,'Synthetic Speaker');assert.equal(entry.speakerVerified,false);
 assert.equal(updated.actionItems[0].assignee,null);assert.throws(()=>dispatch(core,'speakerReviewConfirmAll',{meetingId:meeting.id}));
 dispatch(core,'speakerCorrectionLearn',{meetingId:meeting.id,transcriptEntryId:entry.id,correctedSpeaker:'Confirmed Person',learnForFuture:true});
 const stored=core.store.get('meeting',meeting.id);assert.equal(stored.transcript[0].attribution,'manual');assert.equal(stored.actionItems[0].assignee,'Confirmed Person');
 assert.equal(core.store.list('speaker_profile')[0].samples.length,3);
 assert.match(dispatch(core,'meetingFinalize',{meetingId:meeting.id}).summary,/manually confirmed/);
 const completedAt=core.store.get('meeting',meeting.id).completedAt;
 dispatch(core,'speakerCorrectionLearn',{meetingId:meeting.id,transcriptEntryId:entry.id,correctedSpeaker:'Corrected After Meeting'});
 const corrected=core.store.get('meeting',meeting.id);assert.match(corrected.summary,/Corrected After Meeting/);
 assert.doesNotMatch(corrected.summary,/Confirmed Person/);assert.equal(corrected.completedAt,completedAt);

});
test('sample revocation removes recognition eligibility and cannot alter another profile',t=>{
 const {core}=fixture(t);const p=enroll(core),service=new SpeakerRecognitionService(core),sample=service.getProfile(p.id).samples[0];
 service.removeSample(p.id,sample.id);assert.equal(service.identifySpeaker(measuredSample()).label,'Unknown Speaker');
});
test('speaker capture abort handles late microphone permission without leaving a live stream',async()=>{
 const {captureSpeakerSample}=await import('../source/ui/speaker-capture.mjs');
 const controller=new AbortController();let grant,stopped=0;
 const result=captureSpeakerSample({signal:controller.signal,mediaDevices:{getUserMedia:()=>new Promise(resolve=>{grant=resolve;})},AudioContextClass:class{}});
 controller.abort();grant({getTracks:()=>[{stop:()=>stopped++}]});
 await assert.rejects(result,/cancelled/);assert.equal(stopped,1);
});
test('local frame measurement identifies synthetic periodic speech and rejects silence',async()=>{
 const {estimatePitch,measureFrame}=await import('../source/ui/speaker-capture.mjs');
 const rate=16000,wave=Float32Array.from({length:2048},(_,i)=>.1*Math.sin(2*Math.PI*200*i/rate));
 const pitch=estimatePitch(wave,rate);assert.ok(Math.abs(pitch-200)<3,`Measured ${pitch}`);
 assert.equal(estimatePitch(new Float32Array(2048),rate),null);
 const frame=measureFrame(wave,new Float32Array(1024).fill(-50),rate);assert.ok(frame.rms>0);assert.ok(Math.abs(Math.hypot(...frame.spectrum)-1)<1e-6);
});
test('answer checks show concrete evidence flags without numeric accuracy',async()=>{
 const {responseChecks}=await import('../source/ui/response-layout.mjs');
 const labels=responseChecks({provider:'local',reliability:{score:86,reasons:['Evidence quotations were found in the supplied source.','Some context was not available.']}});
 assert.deepEqual(labels,['Source quotation matched','Input incomplete','Review required']);
});
