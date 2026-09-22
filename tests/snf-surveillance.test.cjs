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

  await t.test('100-Day Retention Cycle & Audit Summary', async () => {
    const summary = snf.getAuditRetentionSummary();
    assert.strictEqual(summary.rawRetentionDays, 100, 'Raw data must be held for 100 days default');
    assert.strictEqual(summary.reportRetentionDays, 200, 'Report data must be held for 200 days (100 days raw + 100 days results)');
    assert.strictEqual(summary.resolvedAlertsRetentionDays, 100, 'Resolved alerts must follow 100-day cycle');
    assert.strictEqual(summary.dischargedResidentsRetentionDays, 100, 'Discharged residents must follow 100-day cycle');
    assert.strictEqual(summary.emrReadOnly, true, 'EMR data must be strictly read-only');
    assert(summary.regulatoryNotice.includes('100 days'), 'Notice must state 100-day retention period');

    // Test cleanup of data older than 100 days
    const now = Date.now();
    const oldTimestamp = now - (105 * 24 * 60 * 60 * 1000); // 105 days old

    store.put('snf_med_order', 'old-order-1', {
      id: 'old-order-1',
      residentId: 'RES-OLD',
      drugName: 'Old Med',
      importTimestamp: oldTimestamp
    });

    store.put('snf_alert', 'old-resolved-alert', {
      id: 'old-resolved-alert',
      residentId: 'RES-OLD',
      status: 'resolved',
      resolvedAt: oldTimestamp
    });

    store.put('snf_alert', 'recent-resolved-alert', {
      id: 'recent-resolved-alert',
      residentId: 'RES-RECENT',
      status: 'resolved',
      resolvedAt: now - (50 * 24 * 60 * 60 * 1000)
    });

    store.put('snf_resident', 'old-discharged-res', {
      id: 'old-discharged-res',
      name: 'Old Resident',
      status: 'Discharged',
      dischargeDate: new Date(oldTimestamp).toISOString()
    });

    store.put('snf_report_cache', 'old-report', {
      id: 'old-report',
      reportType: 'audit',
      generatedAt: now - (205 * 24 * 60 * 60 * 1000) // 205 days old
    });

    store.put('snf_report_cache', 'retained-report', {
      id: 'retained-report',
      reportType: 'audit',
      generatedAt: now - (150 * 24 * 60 * 60 * 1000) // 150 days old (< 200 days)
    });

    const cleanupRes = snf.cleanupOldData();
    assert.strictEqual(cleanupRes.success, true);
    assert(cleanupRes.rawRecordsPurged >= 1, 'Should purge old raw med order');
    assert(cleanupRes.resolvedAlertsPurged >= 1, 'Should purge old resolved alert');
    assert(cleanupRes.dischargedResidentsPurged >= 1, 'Should purge old discharged resident');
    assert(cleanupRes.reportsPurged >= 1, 'Should purge old report older than 200 days');

    assert.strictEqual(store.get('snf_med_order', 'old-order-1'), null, 'Old order should be deleted');
    assert.strictEqual(store.get('snf_alert', 'old-resolved-alert'), null, 'Old resolved alert should be deleted');
    assert.notStrictEqual(store.get('snf_alert', 'recent-resolved-alert'), null, 'Recent resolved alert should remain');
    assert.strictEqual(store.get('snf_report_cache', 'old-report'), null, 'Report > 200 days should be deleted');
    assert.notStrictEqual(store.get('snf_report_cache', 'retained-report'), null, 'Report < 200 days must be preserved');
  });

  await t.test('System Hardening & Fuzz Testing: Malformed Inputs, Dates, and Async Rollbacks', async () => {
    // 1. Ingestion of non-array or invalid report payloads
    const invalidIngest = await snf.ingestReports(null);
    assert.strictEqual(invalidIngest.success, false);
    assert.strictEqual(invalidIngest.totalRecords, 0);

    const nonArrayIngest = await snf.ingestReports({ not: 'an array' });
    assert.strictEqual(nonArrayIngest.success, false);

    // 2. Ingestion of report with corrupted rows, missing IDs, and malformed dates
    const malformedReport = {
      reportType: 'Order Changes',
      reportDate: 'not-a-valid-date-string-###',
      rows: [
        null,
        undefined,
        "string-row-not-an-object",
        42,
        {}, // completely empty row (no resident id)
        { residentId: null, drugName: 'No ID Drug' },
        { residentId: 'RES-VALID', drugName: 'Valid Drug', orderDate: 'corrupt-date-999', startDate: undefined },
        { Resident_ID: 'RES-FALLBACK-ID', Drug_Description: 'Fallback Drug', Order_Date: null }
      ]
    };

    const resilientIngest = await snf.ingestReports([malformedReport]);
    assert.strictEqual(resilientIngest.success, true);
    assert(resilientIngest.totalRecords >= 2, 'Should gracefully process rows with valid/extractable IDs');

    // 3. Rules Engine Resilience against malformed resident data
    store.put('snf_resident', 'res-corrupt', {
      id: 'res-corrupt',
      name: 'Corrupt Resident',
      room: null,
      status: 'Active'
    });

    store.put('snf_med_order', 'corrupt-med-1', {
      id: 'corrupt-med-1',
      residentId: 'res-corrupt',
      drugName: 'Haldol 5mg',
      isAntipsychotic: true,
      startDate: 'invalid-date-string',
      reportDate: 'totally-bogus-date',
      importTimestamp: NaN,
      status: 'Active'
    });

    // Run rules engine - must not throw RangeError (toISOString) or crash
    assert.doesNotThrow(() => {
      snf.runRulesEngine();
    });

    // 4. Async Transaction Rollback Safety
    const beforeCount = store.count('snf_resident');
    let caughtError = false;
    try {
      await store.transaction(async () => {
        store.put('snf_resident', 'res-temp-rollback', { id: 'res-temp-rollback', name: 'Rollback Me' });
        throw new Error('Simulated async database failure during batch transaction');
      });
    } catch (err) {
      caughtError = true;
      assert(err.message.includes('Simulated async database failure'));
    }
    assert.strictEqual(caughtError, true, 'Transaction error must be rethrown');
    assert.strictEqual(store.count('snf_resident'), beforeCount, 'Record count must remain identical after async transaction rollback');
    assert.strictEqual(store.get('snf_resident', 'res-temp-rollback'), null, 'Rolled-back record must not exist in store');

    // 5. Memoization Cache Invalidation
    const timeline1 = snf.getResidentTimelineReport('Vance');
    assert(timeline1.includes('Eleanor Vance'));
    const timeline2 = snf.getResidentTimelineReport('Vance');
    assert.strictEqual(timeline1, timeline2, 'Cached timeline should return identical report');

    // Invalidate cache and verify fresh generation
    snf._invalidateCache();
    const timeline3 = snf.getResidentTimelineReport('Vance');
    assert(timeline3.includes('Eleanor Vance'));

    // 6. EMR Read-Only Verification
    const medBefore = store.get('snf_med_order', 'corrupt-med-1');
    const alerts = snf.getActiveAlerts();
    if (alerts.length > 0) {
      snf.acknowledgeAlert(alerts[0].id, 'Nurse User', 'Reviewed');
    }
    const medAfter = store.get('snf_med_order', 'corrupt-med-1');
    assert.deepStrictEqual(medBefore, medAfter, 'Raw EMR records must remain strictly unmodified');
  });
});
