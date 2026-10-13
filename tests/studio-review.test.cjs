'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {fixture} = require('./helpers.cjs');
const {dispatch, OperationsCopilotEngine, SBAREngine, SpeakerRecognitionService} = require('../source/operations-copilot.cjs');
const {configuration, boundary, isAllowedHost, isAllowedOrigin} = require('../server/development-policy.cjs');

test('empty production operations report unknown measurements and no fabricated staff or approvals', t => {
  const {core} = fixture(t);
  const result = dispatch(core, 'operationsSummary');
  assert.equal(result.census.activeResidents, null);
  assert.equal(result.census.totalBeds, null);
  assert.equal(result.staffing.rnCompliant, null);
  assert.equal(result.commandCenter.automationHealth.audioPipelineReady, false);
  assert.equal(result.dataHealth.isSurveillanceComplete, false);
  assert.deepEqual(dispatch(core, 'speakerProfilesList'), []);
  const brief = dispatch(core, 'operationsHuddleBrief').text;
  assert.doesNotMatch(brief, /PINECREST|COMPLIANT|106|3\.62/);
  assert.match(brief, /not an all-clear/);
});

test('operations recognizes the existing antipsychotic rule IDs and real imported residents', t => {
  const {core} = fixture(t);
  core.store.put('snf_resident', 'r1', {id: 'r1', status: 'Active'});
  core.store.put('snf_alert', 'a1', {id: 'a1', code: 'AP-001', severity: 'critical', status: 'snoozed'});
  const result = dispatch(core, 'operationsSummary');
  assert.equal(result.census.activeResidents, 1);
  assert.equal(result.surveillance.activePsychAlerts, 1);
  assert.equal(result.surveillance.criticalAlertsCount, 1);
});

test('an alert never supplies invented vital signs, diagnoses, medication, or code status', t => {
  const {core} = fixture(t);
  core.store.put('snf_alert', 'a1', {id:'a1', residentId:'r1', residentName:'Synthetic Resident', code:'AP-001', message:'Review imported order', firstDetected:Date.now()});
  const draft = dispatch(core, 'sbarGenerate', {alertId:'a1'});
  assert.equal(draft.residentId, 'r1');
  assert.equal(draft.situation.vitalSigns.values, null);
  assert.equal(draft.dataFreshness.badge, 'UNKNOWN');
  assert.deepEqual(draft.background.primaryDiagnoses, []);
  assert.deepEqual(draft.background.activeMedications, []);
  assert.match(draft.background.codeStatus.value, /Not available/);
  assert.doesNotMatch(JSON.stringify(draft), /100\.8|Metformin|Full Code|Pain score 2|Past 4 hours/);
  assert.throws(() => dispatch(core, 'sbarGenerate', {alertId:'a1', residentId:'r2'}));
});

test('SBAR snapshot uses exact resident ID and importer medication schema with ISO dates', t => {
  const {core} = fixture(t); const engine = new SBAREngine(core);
  core.store.put('snf_med_order', 'm1', {id:'m1', residentId:'r1', drugName:'Synthetic medication', startDate:new Date().toISOString(), sourceReport:'synthetic.csv', originalRow:2});
  core.store.put('snf_alert', 'a1', {id:'a1', residentId:'r10', residentName:'r1', firstDetected:Date.now()});
  const result = engine.get48HourSnapshot('r1');
  assert.equal(result.alerts.length, 0);
  assert.equal(result.medChanges.length, 1);
  assert.equal(result.medChanges[0].medicationName, 'Synthetic medication');
  assert.equal(result.medChanges[0].sourceReport, 'synthetic.csv');
  assert.throws(() => engine.get48HourSnapshot(null));
});

test('SBAR finalization requires review, edits invalidate review, and status cannot bypass the finalization lock', t => {
  const {core} = fixture(t); const engine = new SBAREngine(core);
  const draft = engine.generateSbarDraft({residentName:'Synthetic Resident'});
  assert.throws(() => engine.finalizeSbar(draft.id, 'Test Reviewer'));
  assert.throws(() => engine.reviewSbar(draft.id, ''));
  engine.reviewSbar(draft.id, 'Test Reviewer');
  const edited = engine.saveSbar({id:draft.id, situation:{concern:'Updated concern'}});
  assert.equal(edited.status, 'draft');
  assert.equal(edited.reviewedAt, null);
  assert.match(edited.adaptedCommunicationText, /Updated concern/);
  assert.throws(() => engine.finalizeSbar(draft.id, 'Test Reviewer'));
  engine.reviewSbar(draft.id, 'Test Reviewer'); engine.finalizeSbar(draft.id, 'Test Reviewer');
  assert.throws(() => engine.saveSbar({id:draft.id, status:'finalized', situation:{concern:'Bypass'}}));
  const revision = engine.saveSbar({id:draft.id, revisionReason:'Corrected source', situation:{concern:'Revised'}});
  assert.equal(revision.status, 'draft');
  assert.equal(revision.finalizedAt, null);
  assert.match(revision.auditTrail.at(-1).note, /Corrected source/);
});

test('demo meetings, speaker records, SBARs and generated followups cannot enter the production store', async t => {
  const {core} = fixture(t);
  await require('../source/snf/index.cjs').dispatch(core, 'snfDemo', {mode:'demo'});
  const meeting = dispatch(core, 'meetingSave', {title:'Synthetic Demo Meeting'});
  const updated = dispatch(core, 'meetingAddTranscript', {meetingId:meeting.id, speaker:'Test Speaker', text:'I will review the imported report today.'});
  const todo = dispatch(core, 'meetingConvertActionItem', {meetingId:meeting.id, actionItemId:updated.actionItems[0].id});
  dispatch(core, 'sbarGenerate', {residentName:'Synthetic Demo Resident'});
  dispatch(core, 'speakerProfileSave', {name:'Synthetic Demo Speaker'});
  assert.equal(todo.todo.demo, true);
  for (const kind of ['meeting','todo','sbar','speaker_profile']) assert.equal(core.store.list(kind).length, 0, kind);
  assert.match(dispatch(core, 'operationsHuddleBrief').text, /DEMO DATA/);
  await require('../source/snf/index.cjs').dispatch(core, 'snfDemo', {mode:'production',reset:true});
  assert.deepEqual(dispatch(core, 'meetingList'), []);
  assert.deepEqual(dispatch(core, 'sbarList'), []);
});

test('repeated meeting action conversion creates one followup', t => {
  const {core} = fixture(t); const engine = new OperationsCopilotEngine(core);
  const meeting = engine.createMeeting();
  const updated = engine.addTranscriptEntry(meeting.id, {speaker:'Test', text:'I will review the staffing report today.'});
  const itemId = updated.actionItems[0].id;
  const first = engine.convertActionItemToTodo(meeting.id, itemId);
  const second = engine.convertActionItemToTodo(meeting.id, itemId);
  assert.equal(first.todo.id, second.todo.id);
  assert.equal(core.store.list('todo').length, 1);
});

test('speaker profile operations require measured features and do not seed fake people', t => {
  const {core} = fixture(t); const service = new SpeakerRecognitionService(core);
  assert.deepEqual(service.listProfiles(), []);
  const profile = service.createProfile({name:'Test Speaker'});
  assert.equal(service.addVerifiedSample(profile.id, {}).accepted, false);
  assert.equal(service.identifySpeaker({}).confidenceLevel, 'weak');
  assert.equal(service.getProfile(profile.id).samples.length, 0);
});

test('meeting microphone fails closed without settings and under HIPAA or Local Only', async () => {
  const {browserSpeechAllowed} = await import('../source/ui/speech-policy.mjs');
  assert.equal(browserSpeechAllowed(null), false);
  assert.equal(browserSpeechAllowed({hipaa:true}), false);
  assert.equal(browserSpeechAllowed({hipaa:false, processingMode:'local-only'}), false);
  assert.equal(browserSpeechAllowed({hipaa:false, processingMode:'smart-hybrid'}), false);
  const {createOperationsCopilotUI} = await import('../source/ui/operations-copilot.mjs');
  let attempts = 0;
  global.window = {SpeechRecognition: class {constructor(){attempts++;}}};
  try {
    const ui = createOperationsCopilotUI({api:()=>{},esc:String,toast:()=>{},getState:()=>({settings:{hipaa:true}})});
    ui.toggleSpeechRecognition({});
    assert.equal(attempts, 0);
  } finally { delete global.window; }
});

test('development access requires token possession and exact host/origin, including preview', () => {
  const config = configuration({PRIVATE_AI_DEV_TOKEN:'synthetic-token-'.repeat(4), PRIVATE_AI_DEV_DATA:'/tmp/privateai-studio-review', PRIVATE_AI_DEV_PREVIEW_ORIGIN:'https://my-preview.run.app'});
  assert.equal(isAllowedHost('[::1]:3000'), true);
  assert.equal(isAllowedHost('attacker.run.app'), false);
  assert.equal(isAllowedHost('my-preview.run.app',config.previewOrigin), true);
  assert.equal(isAllowedOrigin('http://localhost:4444','localhost:3000'), false);
  assert.equal(isAllowedOrigin('http://localhost:3000','localhost:3000'), true);
  const gate = boundary(config);
  function run(path, headers={}) {
    let status=200, passed=false, body;
    const response={setHeader(){},status(code){status=code;return this;},json(data){body=data;return this;}};
    gate({path, method:'GET',headers:{host:'localhost:3000',...headers}},response,()=>{passed=true;});
    return {status,passed,body};
  }
  assert.equal(run('/api/dev-token').status,404);
  assert.equal(run('/api/health').status,401);
  assert.equal(run('/api/health',{host:'attacker.run.app','x-forwarded-host':'localhost:3000'}).status,403);
  assert.equal(run('/api/health',{'sec-fetch-site':'cross-site'}).status,403);
  assert.equal(run('/',{host:'my-preview.run.app',origin:'https://my-preview.run.app'}).passed,true);
  assert.throws(()=>configuration({...process.env, PRIVATE_AI_DEV_TOKEN:'x'.repeat(32),PRIVATE_AI_DEV_PREVIEW_ORIGIN:'https://my-preview.run.app/path'}));
});

test('legacy SBAR data is preserved but cannot be signed off as verified evidence', t => {
  const {core}=fixture(t); const engine=new SBAREngine(core);
  const draft=engine.generateSbarDraft({residentName:'Synthetic Resident'});
  delete draft.evidenceVersion; core.store.put('sbar',draft.id,draft);
  assert.equal(engine.listSbars()[0].legacyUnverified,true);
  assert.throws(()=>engine.reviewSbar(draft.id,'Test Reviewer'));
  assert.ok(core.store.get('sbar',draft.id));
});

test('retention removes completed meetings and closed SBARs but preserves pending commitments and callbacks', t => {
  const {core}=fixture(t); const now=Date.now(), updated=now-40*86400000;
  const entries=[['meeting','done',{status:'completed',actionItems:[]}],['meeting','pending',{status:'completed',actionItems:[{status:'pending'}]}],['sbar','closed',{closeTheLoop:{isComplete:true}}],['sbar','callback',{closeTheLoop:{isComplete:false}}]];
  for(const [kind,id,value] of entries)core.store.put(kind,id,{id,...value},{updated});
  const result=core.store.cleanup(30,now);
  assert.equal(result.meetings,1); assert.equal(result.sbars,1);
  assert.ok(core.store.get('meeting','pending')); assert.ok(core.store.get('sbar','callback'));
  assert.equal(core.store.get('meeting','done'),null); assert.equal(core.store.get('sbar','closed'),null);
});

test('git-less repository scanner detects .env instead of stripping its leading dot', t => {
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'privateai-export-scan-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.writeFileSync(path.join(dir,'.env'),'PRIVATE_AI_DEV_TOKEN=synthetic-test-value');
  const result=spawnSync(process.execPath,[path.resolve(__dirname,'../scripts/check-repository.cjs')],{cwd:dir,encoding:'utf8'});
  assert.notEqual(result.status,0); assert.match(result.stderr,/\.env: runtime or secret file/);
  assert.doesNotMatch(result.stderr,/synthetic-test-value/);
});
