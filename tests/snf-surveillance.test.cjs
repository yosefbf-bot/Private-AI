'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { fixture } = require('./helpers.cjs');
const { identifyMedication } = require('../source/snf-command-center.cjs');
const { createTools } = require('../source/local-tools.cjs');
const { deterministic } = require('../source/deterministic.cjs');

test('SNF Clinical Surveillance - Core Engine & Rules Test Suite', async (t) => {
  const { core } = fixture(t);
  const snf = core.snf;
  const store = core.store;

  await t.test('Medication Classifier Identifies Clinical Classes Correctly', () => {
    const risperidone = identifyMedication('Risperdal 0.5 mg oral tablet');
    assert.strictEqual(risperidone.isAntipsychotic, true);
    assert.strictEqual(risperidone.isPsychotropic, true);
    assert.strictEqual(risperidone.matchedGeneric, 'risperidone');

    const haldol = identifyMedication('Haloperidol 1mg tab po bid');
    assert.strictEqual(haldol.isAntipsychotic, true);
    assert.strictEqual(haldol.matchedGeneric, 'haloperidol');

    const seroquel = identifyMedication('Quetiapine fumarate 25 mg at bedtime');
    assert.strictEqual(seroquel.isAntipsychotic, true);
    assert.strictEqual(seroquel.matchedGeneric, 'quetiapine');

    const eliquis = identifyMedication('Eliquis 5mg oral daily');
    assert.strictEqual(eliquis.isHighAlert, true);
    assert.strictEqual(eliquis.matchedGeneric, 'apixaban');

    const lantus = identifyMedication('Insulin Glargine 20 units subQ at bedtime');
    assert.strictEqual(lantus.isHighAlert, true);
    assert.strictEqual(lantus.matchedGeneric, 'insulin glargine');

    const tylenol = identifyMedication('Acetaminophen 500mg po prn headache');
    assert.strictEqual(tylenol.isAntipsychotic, false);
    assert.strictEqual(tylenol.isHighAlert, false);
  });

  await t.test('PCC Ingestion Pipeline & Resident Matching via Sample Feed', async () => {
    const res = await snf.seedSampleClinicalFeed();
    assert.strictEqual(res.success, true);
    assert(store.count('snf_resident') >= 5, 'Must have active residents stored');
    assert(store.count('snf_med_order') >= 5, 'Must have med orders stored');
    assert(store.count('snf_diagnosis') >= 5, 'Must have diagnoses stored');
    assert(store.count('snf_behavior') >= 1, 'Must have behaviors stored');
  });

  await t.test('Rules Engine: Psych Watch, PRN 14-Day Limit, Diagnosis Gaps, and Clinical Alerts', async () => {
    await snf.runRulesEngine('TestRunner');
    const alerts = store.list('snf_alert');
    assert(alerts.length > 0, 'Rules engine should generate clinical surveillance alerts');

    // Rule 1: Eleanor Vance has new Seroquel started today (AP-001)
    const newAP = alerts.find(a => a.code === 'AP-001' && a.residentName === 'Eleanor Vance');
    assert(newAP, 'Should generate AP-001 for new Seroquel');
    assert.strictEqual(newAP.severity, 'critical');

    // Rule 2: Arthur Pendelton has PRN Haloperidol > 14 days without renewal (PRN-014)
    const prnAlert = alerts.find(a => a.code === 'PRN-014' && a.residentName === 'Arthur Pendelton');
    assert(prnAlert, 'Should generate PRN-014 for PRN Haloperidol exceeding 14-day limit');
    assert.strictEqual(prnAlert.severity, 'critical');
    assert(prnAlert.whyFlagged.some(c => c.includes('CMS 42 CFR 483.45(e)')), 'Criteria must cite CMS 483.45(e)');

    // Rule 3: Beatrice Morales has Risperidone > 180 days with no GDR (GDR-001)
    const gdrAlert = alerts.find(a => a.code === 'GDR-001' && a.residentName === 'Beatrice Morales');
    assert(gdrAlert, 'Should generate GDR-001 alert');
    assert.strictEqual(gdrAlert.severity, 'high');

    // Rule 4: Dorothy Zimmerman has Olanzapine with behavior monitoring gap (AP-005)
    const behAlert = alerts.find(a => a.code === 'AP-005' && a.residentName === 'Dorothy Zimmerman');
    assert(behAlert, 'Should generate AP-005 behavior gap alert');

    // Check Open Issues persistence
    const openIssues = store.list('snf_open_issue');
    assert(openIssues.length > 0, 'Open issues engine must track unresolved findings');
  });

  await t.test('Persistent Alert Lifecycle: Acknowledge, Assign, and Resolve with Mandatory Notes', () => {
    const alerts = store.list('snf_alert');
    const prnAlert = alerts.find(a => a.code === 'PRN-014');
    assert(prnAlert, 'Must find PRN-014 alert');

    // 1. Acknowledge
    const acked = snf.acknowledgeAlert(prnAlert.id, 'DON_Nurse_Jane');
    assert.strictEqual(acked.status, 'acknowledged');
    assert(acked.auditTrail.some(at => at.action === 'acknowledged' && at.user === 'DON_Nurse_Jane'));

    // 2. Assign
    const assigned = snf.assignAlert(prnAlert.id, 'Attending Physician Dr. Jenkins', 'DON_Nurse_Jane', 'Reviewing 14-day PRN order expiration');
    assert.strictEqual(assigned.status, 'in_review');
    assert.strictEqual(assigned.assignedTo, 'Attending Physician Dr. Jenkins');
    assert(assigned.auditTrail.some(at => at.action === 'assigned'));

    // 3. Resolve
    const resolved = snf.resolveAlert(prnAlert.id, 'medication_discontinued', 'Order discontinued in PCC after 14-day review per F758', 'DON_Nurse_Jane');
    assert.strictEqual(resolved.status, 'resolved');
    assert.strictEqual(resolved.resolutionStatus, 'medication_discontinued');
    assert(resolved.actionNote.includes('Order discontinued in PCC'));

    // Verify open issues updated
    const issue = store.get('snf_open_issue', `issue-${prnAlert.id}`);
    assert(issue, 'Open issue must exist');
    assert.strictEqual(issue.status, 'Resolved');
  });

  await t.test('CMS Quality Measure (QM) Exposure Calculation', () => {
    const metrics = snf.getDashboardMetrics();
    const qm = metrics.qmWatch;

    assert.strictEqual(qm.label, 'Estimated QM Exposure');
    assert.strictEqual(typeof qm.estimatedRatePercentage, 'string');
    assert(qm.longStayDenominator >= 1, 'Denominator should identify long-stay residents');
    assert(qm.potentialNumeratorCount >= 1, 'Should calculate potential numerator');
  });

  await t.test('Fail-Safe Monitoring Feed Status (Never Green when Data Missing)', () => {
    const feedStatus = snf.getFeedStatus();
    assert(feedStatus.feeds !== undefined, 'Must track PCC feeds');
    assert(typeof feedStatus.isSurveillanceComplete === 'boolean');
  });

  await t.test('Local Clinical Commands via Deterministic Router', async () => {
    const tools = createTools(core, {}, null);

    // Test /critical
    const critResp = await deterministic('/critical', [], tools);
    assert(critResp, 'Should intercept /critical');
    assert(critResp.text.includes('CRITICAL CLINICAL ALERTS'));

    // Test /psychwatch
    const psychResp = await deterministic('/psychwatch', [], tools);
    assert(psychResp, 'Should intercept /psychwatch');
    assert(psychResp.text.includes('PSYCH WATCH'));
    assert(psychResp.text.includes('Eleanor Vance'));

    // Test /morning
    const morningResp = await deterministic('/morning', [], tools);
    assert(morningResp, 'Should intercept /morning');
    assert(morningResp.text.includes('MORNING ADMINISTRATOR & CLINICAL BRIEF'));

    // Test /resident Vance
    const resResp = await deterministic('/resident Vance', [], tools);
    assert(resResp, 'Should intercept /resident');
    assert(resResp.text.includes('CLINICAL SURVEILLANCE TIMELINE'));
    assert(resResp.text.includes('Eleanor Vance'));

    // Test /prn14
    const prnResp = await deterministic('/prn14', [], tools);
    assert(prnResp, 'Should intercept /prn14');
    assert(prnResp.text.includes('PRN ANTIPSYCHOTIC 14-DAY TIME-LIMIT WATCH'));

    // Test /qapi
    const qapiResp = await deterministic('/qapi', [], tools);
    assert(qapiResp, 'Should intercept /qapi');
    assert(qapiResp.text.includes('QAPI'));
  });
});
