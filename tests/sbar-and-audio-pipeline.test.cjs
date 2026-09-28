const {measuredSample}=require('./measured-speaker-fixture.cjs');
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SBAREngine,
  FACILITY_PROTOCOLS,
  SBAR_TEMPLATES,
  COMMUNICATION_TARGETS
} = require('../source/sbar-engine.cjs');
const {
  NON_SPEECH_PATTERNS,
  AudioEnhancementService,
  AudioQualityAssessor,
  SpeakerDiarizationService,
  SpeakerRecognitionService
} = require('../source/meeting-audio-pipeline.cjs');
const {
  OperationsCopilotEngine,
  dispatch
} = require('../source/operations-copilot.cjs');
const devPolicy = require('../server/development-policy.cjs');

// Mock Core for testing
function createMockCore() {
  const storeMap = new Map();
  const todos = [];
  const events = [];

  const store = {
    list(kind) {
      const items = [];
      for (const [k, v] of storeMap.entries()) {
        if (k.startsWith(`${kind}:`)) items.push(v);
      }
      return items;
    },
    get(kind, id) {
      return storeMap.get(`${kind}:${id}`) || null;
    },
    put(kind, id, val) {
      storeMap.set(`${kind}:${id}`, JSON.parse(JSON.stringify(val)));
      return val;
    },
    delete(kind, id) {
      storeMap.delete(`${kind}:${id}`);
      return true;
    },
    audit(event) {
      events.push({ type: 'audit', event, time: Date.now() });
    }
  };

  const core = {
    store,
    assertUnlocked() {},
    saveTodo(input) {
      const t = {
        id: `todo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: input.title,
        description: input.description,
        priority: input.priority || 'normal',
        dueAt: input.dueAt,
        status: 'pending',
        createdAt: Date.now()
      };
      todos.push(t);
      store.put('todo', t.id, t);
      return t;
    },
    emit(event) {
      events.push(event);
    }
  };

  return { core, storeMap, todos, events };
}

test('Interactive SBAR & Shift-Handoff Generator Test Suite', async (t) => {
  await t.test('Complete resident info produces structured SBAR with source attribution', () => {
    const { core } = createMockCore();
    const engine = new SBAREngine(core);

    const draft = engine.generateSbarDraft({
      residentName: 'Eleanor Vance',
      residentRoom: '104-A',
      templateKey: 'fall',
      target: 'attending_physician',
      vitals: { temp: '98.6°F', bp: '120/78', pulse: '74', resp: '16', o2sat: '97%' },
      allergies: 'Penicillin (Hives)',
      baselineCognition: 'BIMS 14/15 — Cognitively Intact',
      primaryDiagnoses: [{ name: 'Hypertension' }, { name: 'Osteoarthritis' }]
    });

    assert.ok(draft.id);
    assert.equal(draft.residentName, 'Eleanor Vance');
    assert.equal(draft.status, 'draft');
    assert.equal(draft.situation.vitalSigns.values.temp, '98.6°F');
    assert.ok(draft.situation.source, 'Situation must have source attribution');
    assert.ok(draft.background.allergies.source, 'Allergies must have source attribution');
    assert.ok(draft.adaptedCommunicationText.includes('S — SITUATION'));
    assert.ok(draft.adaptedCommunicationText.includes('B — BACKGROUND'));
    assert.ok(draft.adaptedCommunicationText.includes('A — ASSESSMENT'));
    assert.ok(draft.adaptedCommunicationText.includes('R — REQUEST'));
  });

  await t.test('Missing vitals are flagged in missingCriticalItems and not fabricated', () => {
    const { core } = createMockCore();
    const engine = new SBAREngine(core);

    const draft = engine.generateSbarDraft({
      residentName: 'Harold Green',
      residentRoom: '202-B',
      vitals: null // Intentionally missing
    });

    assert.equal(draft.situation.vitalSigns.values, null);
    assert.match(draft.situation.vitalSigns.status, /not documented/);
    const missingVitals = draft.missingCriticalItems.find(m => m.field === 'Current Vitals');
    assert.ok(missingVitals, 'Must flag missing vitals');
    assert.match(draft.adaptedCommunicationText, /Vitals not documented in current sources/);
  });

  await t.test('Stale data (>4h vitals) triggers STALE DATA WARNING', () => {
    const { core } = createMockCore();
    const engine = new SBAREngine(core);

    const eightHoursAgo = Date.now() - (8 * 3600000);
    const draft = engine.generateSbarDraft({
      residentName: 'Alice Young',
      residentRoom: '110',
      vitalsReportDate: eightHoursAgo,
      vitals: { temp: '99.1°F', bp: '110/70', pulse: '80', resp: '18', o2sat: '95%' }
    });

    assert.equal(draft.dataFreshness.isStale, true);
    assert.equal(draft.dataFreshness.badge, 'STALE');
    assert.ok(draft.dataFreshness.ageMinutes >= 480);
    assert.ok(draft.missingCriticalItems.some(m => m.field === 'Vital Freshness'));
  });

  await t.test('Missing allergy data explicitly warns and does not hallucinate', () => {
    const { core } = createMockCore();
    const engine = new SBAREngine(core);

    const draft = engine.generateSbarDraft({
      residentName: 'Thomas Clark',
      residentRoom: '105'
    });

    assert.equal(draft.background.allergies.value, 'No allergy data available in current imported information');
    assert.ok(draft.missingCriticalItems.some(m => m.field === 'Allergies'));
  });

  await t.test('Clinical recommendation safety: Private AI does NOT invent unverified orders or tests', () => {
    const { core } = createMockCore();
    const engine = new SBAREngine(core);

    // General provider notification template has no default automatic clinical interventions
    const draft = engine.generateSbarDraft({
      residentName: 'Mary Bennett',
      residentRoom: '301',
      templateKey: 'general_provider'
    });

    // Verify recommendations contain ONLY safe communication requests
    for (const rec of draft.recommendations) {
      assert.equal(rec.safetyType, 'safe_communication');
      assert.ok(
        rec.text.startsWith('Request provider evaluation') ||
        rec.text.startsWith('Request review of current') ||
        rec.text.startsWith('Please advise regarding'),
        `Unexpected unsupported recommendation: ${rec.text}`
      );
    }

    // Ensure it NEVER independently generated STAT labs or diagnostics
    const textAll = draft.recommendations.map(r => r.text).join(' ');
    assert.doesNotMatch(textAll, /STAT CBC|STAT BMP|bilateral hip X-ray/i);
  });

  await t.test('Packaged example protocols cannot authorize clinical recommendations', () => {
    const {core} = createMockCore(); const engine = new SBAREngine(core);
    const draft = engine.generateSbarDraft({residentName: 'Synthetic Resident', templateKey: 'fall'});
    assert.equal(draft.recommendations.filter(r => r.safetyType === 'facility_protocol').length, 0);
    assert.ok(engine.listProtocols().every(p => !p.isCurrent && p.status === 'review_needed'));
    assert.ok(draft.recommendations.every(r => r.safetyType === 'safe_communication'));
  });

  await t.test('Standing Provider Orders populate existing order label', () => {
    const { core } = createMockCore();
    const engine = new SBAREngine(core);

    const draft = engine.generateSbarDraft({
      residentName: 'Samuel Hayes',
      residentRoom: '114',
      standingOrders: [
        { text: 'Acetaminophen 650mg PO q6h PRN for mild pain or temp > 100.4°F', physician: 'Dr. Smith' }
      ]
    });

    const standingRec = draft.recommendations.find(r => r.safetyType === 'existing_provider_order');
    assert.ok(standingRec);
    assert.match(standingRec.sourceLabel, /require clinician verification/);
    assert.equal(standingRec.verified, false);
  });

  await t.test('Communication Target Adaptation modifies wording appropriately', () => {
    const { core } = createMockCore();
    const engine = new SBAREngine(core);

    // Family target
    const familyDraft = engine.generateSbarDraft({
      residentName: 'Dorothy Miller',
      residentRoom: '215',
      target: 'family_representative'
    });
    assert.match(familyDraft.adaptedCommunicationText, /Hello\. This is the nursing team contacting you regarding/);
    assert.doesNotMatch(familyDraft.adaptedCommunicationText, /resting comfortably|already contacted|Pinecrest/);
    assert.doesNotMatch(familyDraft.adaptedCommunicationText, /S — SITUATION/); // Non-technical plain English

    // Hospital / EMS target
    const emsDraft = engine.generateSbarDraft({
      residentName: 'Dorothy Miller',
      residentRoom: '215',
      target: 'hospital_ems'
    });
    assert.match(emsDraft.adaptedCommunicationText, /EMERGENCY MEDICAL HANDOFF/);
    assert.match(emsDraft.adaptedCommunicationText, /CODE STATUS:/);
    assert.match(emsDraft.adaptedCommunicationText, /TRANSFER REASON:/);
  });

  await t.test('Interactive SBAR Lifecycle: Save, Review, and Finalize', () => {
    const { core, events } = createMockCore();
    const engine = new SBAREngine(core);

    const draft = engine.generateSbarDraft({ residentName: 'Walter Evans', residentRoom: '109' });
    assert.equal(draft.status, 'draft');

    // Review
    const reviewed = engine.reviewSbar(draft.id, 'Amanda Lewis, RN', 'Verified objective vitals');
    assert.equal(reviewed.status, 'reviewed');
    assert.equal(reviewed.reviewedBy, 'Amanda Lewis, RN');
    assert.ok(events.some(e => e.type === 'sbar_reviewed'));

    // Finalize
    const finalized = engine.finalizeSbar(draft.id, 'Sarah Jenkins, DON', 'Finalized for provider callback');
    assert.equal(finalized.status, 'finalized');
    assert.equal(finalized.finalizedBy, 'Sarah Jenkins, DON');
    assert.ok(events.some(e => e.type === 'sbar_finalized'));

    // Finalized SBAR cannot be downgraded without revisionReason
    assert.throws(() => {
      engine.saveSbar({ id: draft.id, status: 'draft' });
    }, err => err.code === 'POLICY');
  });

  await t.test('Notification tracking & Follow-Up Engine integrates with Universal Action Inbox', () => {
    const { core, todos, events } = createMockCore();
    const engine = new SBAREngine(core);

    const draft = engine.generateSbarDraft({ residentName: 'Clara Hughes', residentRoom: '210' });

    // Log notification where provider is awaiting callback
    const res = engine.logNotification(draft.id, {
      recipientName: 'Dr. Robert Smith',
      method: 'phone',
      outcome: 'awaiting_callback',
      readback: 'not_applicable',
      callbackIntervalMinutes: 30,
      autoCreateFollowUp: true
    });

    assert.ok(res.success);
    assert.equal(res.closeTheLoopStage, 'awaiting_callback');
    assert.ok(res.proposedFollowUp);
    assert.equal(todos.length, 1, 'Must create item in Universal Action Inbox');
    assert.equal(todos[0].priority, 'urgent');
    assert.match(todos[0].title, /MD Callback Follow-Up/);
    assert.ok(events.some(e => e.type === 'clinical_followup_created'));
    assert.ok(events.some(e => e.type === 'provider_response_pending'));
  });

  await t.test('Close-the-Loop Progression tracks full clinical chain', () => {
    const { core } = createMockCore();
    const engine = new SBAREngine(core);

    const draft = engine.generateSbarDraft({ residentName: 'Arthur Dent', residentRoom: '42' });

    // Step 1: Physician notified
    engine.advanceCloseTheLoop(draft.id, { stage: 'physician_notified', note: 'Notified on-call MD' });
    let sbar = engine.getSbar(draft.id);
    assert.equal(sbar.closeTheLoop.stage, 'physician_notified');
    assert.equal(sbar.closeTheLoop.isComplete, false);

    // Step 2: Orders received
    engine.advanceCloseTheLoop(draft.id, { stage: 'orders_received', note: 'CXR and UA orders received' });
    sbar = engine.getSbar(draft.id);
    assert.equal(sbar.closeTheLoop.stage, 'orders_received');
    assert.equal(sbar.closeTheLoop.isComplete, false);

    // Step 3: Closed / Documented
    engine.advanceCloseTheLoop(draft.id, { stage: 'closed', note: 'Orders carried out, resident stable' });
    sbar = engine.getSbar(draft.id);
    assert.equal(sbar.closeTheLoop.stage, 'closed');
    assert.equal(sbar.closeTheLoop.isComplete, true);
  });

  await t.test('Structured Shift-Change Handoff generates all 12 required sections', () => {
    const { core } = createMockCore();
    // Seed some test records in store
    core.store.put('snf_alert', 'alt_fall', {
      id: 'alt_fall',
      code: 'FALL_INCIDENT',
      residentName: 'Grace Hopper',
      residentRoom: '101',
      severity: 'critical',
      status: 'new',
      message: 'Unwitnessed fall near bedside',
      firstDetected: Date.now() - 3600000
    });

    const engine = new SBAREngine(core);
    const handoff = engine.generateShiftHandoff({ shift: 'day' });

    assert.ok(handoff.id);
    assert.equal(handoff.shift, 'day');
    const sec = handoff.sections;

    // Verify all 12 sections exist
    assert.ok(Array.isArray(sec.newOrChangedResidents), '1. New / Changed Residents');
    assert.ok(Array.isArray(sec.acuteConcerns), '2. Acute Concerns');
    assert.ok(Array.isArray(sec.residentsRequiringMonitoring), '3. Residents Requiring Monitoring');
    assert.ok(Array.isArray(sec.newOrders), '4. New Orders');
    assert.ok(Array.isArray(sec.pendingLabsTests), '5. Pending Labs/Tests');
    assert.ok(Array.isArray(sec.fallsIncidents), '6. Falls / Incidents');
    assert.ok(Array.isArray(sec.hospitalTransfersReturns), '7. Hospital Transfers / Returns');
    assert.ok(Array.isArray(sec.behavioralPsychotropicConcerns), '8. Behavioral / Psychotropic Concerns');
    assert.ok(Array.isArray(sec.woundsSkin), '9. Wounds / Skin');
    assert.ok(Array.isArray(sec.followUpsPending), '10. Follow-Ups Pending');
    assert.ok(Array.isArray(sec.itemsRequiringProviderContact), '11. Items Requiring Provider Contact');
    assert.ok(Array.isArray(sec.itemsRequiringFamilyNotification), '12. Items Requiring Family Notification');

    assert.equal(sec.fallsIncidents.length, 1);
    assert.equal(sec.fallsIncidents[0].residentName, 'Grace Hopper');
  });
});

test('Enhanced Meeting Audio Pipeline & Speaker Recognition Test Suite', async (t) => {
  await t.test('Audio Enhancement Service filters low-frequency rumble and applies gain normalization', () => {
    const enhancer = new AudioEnhancementService();

    // High rumble frame (e.g. HVAC noise)
    const result = enhancer.enhanceFrame({
      energy: 0.08,
      lowFreqEnergy: 0.05,
      clipping: 0
    });

    assert.equal(result.isSpeech, true);
    assert.ok(result.gainApplied > 0);
    assert.equal(result.isClipped, false);
  });

  await t.test('Audio Quality Assessor correctly identifies Good, Fair, and Poor audio', () => {
    const assessor = new AudioQualityAssessor();

    // 1. Quiet conference room
    const good = assessor.assess({ noiseFloorDb: -48, snrDb: 25, clippingCount: 0, crossTalkRatio: 0.02 });
    assert.equal(good.status, 'Good');
    assert.equal(good.warning, null);

    // 2. High HVAC / ambient noise
    const fair = assessor.assess({ noiseFloorDb: -30, snrDb: 18, clippingCount: 2, crossTalkRatio: 0.1 });
    assert.equal(fair.status, 'Fair');

    // 3. Severe noise + clipping + cross-talk
    const poor = assessor.assess({ noiseFloorDb: -26, snrDb: 7, clippingCount: 45, crossTalkRatio: 0.45 });
    assert.equal(poor.status, 'Poor');
    assert.ok(poor.warning.includes('Meeting audio quality may reduce transcription'));
  });

  await t.test('Non-speech patterns detect overhead facility page and exclude from commitments', () => {
    const { core } = createMockCore();
    const opsEngine = new OperationsCopilotEngine(core);

    const meeting = opsEngine.createMeeting({ title: 'Morning Huddle — Audio Test' });

    // Ingest statement containing facility overhead announcement
    const updated = opsEngine.addTranscriptEntry(meeting.id, {
      speaker: 'Nurse',
      text: 'Attention all staff: Overhead paging Code Blue to Room 204 immediately.'
    });

    const entry = updated.transcript[0];
    assert.equal(entry.isOverheadPage, true);
    assert.equal(entry.speaker, '[Facility Announcement]');
    assert.ok(entry.flags.some(f => f.category === 'overhead_page'));

    // Crucial requirement: Overhead page must NOT create action items or commitments
    assert.equal(updated.actionItems.length, 0, 'Overhead page must be excluded from action items');
    assert.equal(updated.clinicalRadar.length, 0, 'Overhead page must be excluded from clinical radar commitments');
  });

  await t.test('Cross-talk overlapping speech is tagged as Multiple speakers and blocks false single-speaker commitments', () => {
    const { core } = createMockCore();
    const opsEngine = new OperationsCopilotEngine(core);

    const meeting = opsEngine.createMeeting({ title: 'IDT Session' });

    // Ingest overlapping crosstalk
    const updated = opsEngine.addTranscriptEntry(meeting.id, {
      speaker: 'Dr. Smith',
      text: '[Simultaneous crosstalk and overlapping voices in conference room]'
    });

    const entry = updated.transcript[0];
    assert.equal(entry.isCrossTalk, true);
    assert.equal(entry.speaker, '[Multiple speakers]');
    assert.equal(updated.actionItems.length, 0, 'Cross-talk must not create action items without confirmation');
  });

  await t.test('Speaker Recognition: Multi-sample persistent voice profiles and confidence grading', () => {
    const { core } = createMockCore();
    const speakerService = new SpeakerRecognitionService(core);

    assert.deepEqual(speakerService.listProfiles(), []);
    const profile = speakerService.createProfile({name: 'Sarah Jenkins', role: 'DON'});
    for (let i = 0; i < 3; i++) speakerService.addVerifiedSample(profile.id, measuredSample({pitchMean:210}));
    const sarah = speakerService.getProfile(profile.id);
    assert.equal(sarah.samples.length, 3);
    assert.equal(sarah.quality, 'Ready for experimental suggestions');

    // 1. Identify Sarah with matching pitch and formant features
    const matchSarah = speakerService.identifySpeaker(measuredSample({pitchMean:210}), [{ name: 'Sarah Jenkins', role: 'DON' }]);

    assert.equal(matchSarah.confidenceLevel, 'possible');
    assert.equal(matchSarah.matchStrength, 'strong');
    assert.equal(matchSarah.label, 'Sarah Jenkins');
    assert.equal(matchSarah.needsConfirmation, true);

    // 2. Identify unknown guest voice with very distant pitch/spectral features
    const matchUnknown = speakerService.identifySpeaker(measuredSample({pitchMean:350}), []);

    assert.equal(matchUnknown.confidenceLevel, 'weak');
    assert.equal(matchUnknown.label, 'Unknown Speaker');
  });

  await t.test('Sample Quality Filter rejects low SNR, overlapping, or short clips', () => {
    const { core } = createMockCore();
    const speakerService = new SpeakerRecognitionService(core);
    const profId = speakerService.createProfile({name: 'Test Speaker'}).id;

    // Reject short clip (< 1.5s)
    const shortRes = speakerService.addVerifiedSample(profId, measuredSample({durationSeconds:0.8,voicedSeconds:0.5}));
    assert.equal(shortRes.accepted, false);
    assert.match(shortRes.reason, /clear speech/);

    // Reject overlapping clip
    const overlapRes = speakerService.addVerifiedSample(profId, measuredSample({isOverlapping:true}));
    assert.equal(overlapRes.accepted, false);
    assert.match(overlapRes.reason, /overlapping/);

    // Reject low SNR clip (< 12dB)
    const noisyRes = speakerService.addVerifiedSample(profId, measuredSample({snrDb:6}));
    assert.equal(noisyRes.accepted, false);
    assert.match(noisyRes.reason, /noisy/);

    // Accept clean verified sample
    const cleanRes = speakerService.addVerifiedSample(profId, measuredSample());
    assert.equal(cleanRes.accepted, true);
    assert.ok(cleanRes.sample.id);
  });

  await t.test('Speaker correction does not invent acoustic samples', () => {
    const { core, events } = createMockCore();
    const opsEngine = new OperationsCopilotEngine(core);
    const speakerService = new SpeakerRecognitionService(core);

    const meeting = opsEngine.createMeeting({ title: 'Morning Standup' });
    const updated = opsEngine.addTranscriptEntry(meeting.id, {
      speaker: 'Probably Michael Chang ?',
      text: 'I will coordinate the 5-day MDS schedule for new Medicare admissions today.'
    });

    const entryId = updated.transcript[0].id;

    // User corrects tentative attribution to David Miller
    const res = speakerService.applyCorrectionAndLearn({
      meetingId: meeting.id,
      transcriptEntryId: entryId,
      correctedSpeaker: 'David Miller',
      correctedRole: 'Administrator',
      learnForFuture: true,
      segmentDuration: 3.2
    });

    assert.equal(res.success, true);
    assert.equal(res.entry.speaker, 'David Miller');
    assert.equal(res.learningResult.accepted, false);
    assert.deepEqual(speakerService.listProfiles(), []);
    assert.ok(events.some(e => e.type === 'speaker_identity_corrected'));
  });

  await t.test('RPC Dispatcher routes all new SBAR and Meeting Audio operations', () => {
    const { core } = createMockCore();

    // SBAR operations
    const sbar = dispatch(core, 'sbarGenerate', { residentName: 'Jane Test' });
    assert.ok(sbar.id);
    const list = dispatch(core, 'sbarList', {});
    assert.equal(list.length, 1);
    const protocols = dispatch(core, 'sbarProtocols', {});
    assert.ok(protocols.length >= 4);

    // Audio operations
    const audioCheck = dispatch(core, 'audioCheckQuality', { snrDb: 22 });
    assert.equal(audioCheck.status, 'Unmeasured');
    const speakerProfiles = dispatch(core, 'speakerProfilesList', {});
    assert.deepEqual(speakerProfiles, []);
  });

  await t.test('Development Policy ALLOWED permits all new operations', () => {
    const newOps = [
      'sbarGenerate', 'sbarSave', 'sbarReview', 'sbarFinalize',
      'sbarList', 'sbarGet', 'sbarDelete', 'sbarLogNotification',
      'sbarAdvanceLoop', 'sbarProtocols', 'sbarProtocolGet',
      'sbarProtocolSave', 'sbarTemplates', 'sbarShiftHandoff',
      'sbarSnapshot48h', 'audioCheckQuality', 'speakerProfilesList',
      'speakerProfileGet', 'speakerProfileSave', 'speakerProfileDelete',
      'speakerSampleAdd', 'speakerSampleRemove', 'speakerIdentify',
      'speakerReviewGet', 'speakerReviewConfirmAll', 'speakerCorrectionLearn'
    ];

    for (const op of newOps) {
      assert.doesNotThrow(() => {
        devPolicy.assertOperation(op, {});
      }, `Operation ${op} must be permitted by development policy`);
    }
  });
});

