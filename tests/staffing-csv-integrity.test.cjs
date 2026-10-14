'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers.cjs');
const { dispatch } = require('../source/operations-analytics-engine.cjs');

const parse = (core, csvText) => dispatch(core, 'staffingParseCsv', { csvText, filename: 'synthetic.csv' });
const analyze = (core, records) => dispatch(core, 'staffingAnalyze', { records });

test('staffing CSV shares quote handling and maps identifiers, schedules and totals to distinct fields', t => {
  const { core } = fixture(t);
  const source = 'Employee ID,Employee Name,Scheduled Hours,Total Hours,Regular Hours,Overtime Hours,Hourly Rate,Agency,Unit\r\nE1,"O\'Connor, ""Synthetic""\nAide",8,8.5,8,.5,0,No,"North, Wing"';
  const parsed = parse(core, source);
  assert.equal(parsed.success, true, parsed.error);
  assert.equal(parsed.records.length, 1);
  const row = parsed.records[0];
  assert.equal(row.employeeId, 'E1');
  assert.equal(row.employeeName, 'O\'Connor, "Synthetic"\nAide');
  assert.equal(row.unit, 'North, Wing');
  assert.equal(row.scheduledHours, 8);
  assert.equal(row.actualHours, 8.5);
  assert.equal(row.overtimeHours, 0.5);
  assert.equal(row.hourlyRate, 0);
  assert.equal(row.isAgency, false);
  for (const field of ['role', 'shift', 'date', 'punchIn', 'punchOut']) assert.equal(row[field], null, field);
});

test('minimal staffing data retains explicit zero and leaves every absent optional field unknown', t => {
  const { core } = fixture(t);
  const parsed = parse(core, 'Employee Name,Worked Hours\nSynthetic ShiftKey Agency,0');
  assert.equal(parsed.success, true);
  const row = parsed.records[0];
  assert.equal(row.actualHours, 0);
  for (const field of ['employeeId', 'role', 'unit', 'shift', 'date', 'scheduledHours', 'regularHours', 'overtimeHours', 'hourlyRate', 'isAgency'])
    assert.equal(row[field], null, field);
  const result = analyze(core, parsed.records);
  assert.equal(result.periodSummary.totalHoursWorked, 0);
  for (const field of ['totalOvertimeHours', 'totalAgencyHours', 'estimatedTotalOTSpend', 'estimatedTotalAgencySpend', 'overtimePercentage'])
    assert.equal(result.periodSummary[field], null, field);
  assert.equal(result.fteHiringGaps.totalFteDeficit, null);
  assert.equal(result.fteHiringGaps.cnaFteDeficit, null);
  assert.equal(result.fteHiringGaps.projectedMonthlySavings, null);
  assert.equal(result.incidentalPunchAudit.totalLeakMinutes, null);
  assert.equal(result.coverage.datedRows, 0);
  assert.deepEqual(result.assumptions.datesCovered, []);
  assert.equal(result.approachingOTAvailable, false);
});

test('required staffing columns and cells fail safely without returning or committing partial rows', t => {
  const { core } = fixture(t);
  const before = core.store.db.prepare('SELECT COUNT(*) n FROM records').get().n;
  for (const source of [
    'Employee ID,Actual Hours\nE1,8',
    'Employee #,Worked Hours\nE1,8',
    'Employee Name,Scheduled Hours\nSynthetic,8',
    'Employee Name,Actual Hours\nSynthetic A,8\nSynthetic B,',
    'Employee Name,Actual Hours\nSynthetic A,8\n,8'
  ]) {
    const parsed = parse(core, source);
    assert.equal(parsed.success, false, source);
    assert.deepEqual(parsed.records, []);
    assert.equal(core.store.db.prepare('SELECT COUNT(*) n FROM records').get().n, before);
  }
});

test('staffing headers and row shapes reject duplicate aliases, malformed quotes and column counts', t => {
  const { core } = fixture(t);
  for (const source of [
    'Employee Name,Actual Hours,actual_hours\nSynthetic,8,8',
    'Employee Name,Actual Hours,Worked Hours\nSynthetic,8,8',
    'Employee Name,,Actual Hours\nSynthetic,x,8',
    'Employee Name,Actual Hours\n"Synthetic,8',
    'Employee Name,Actual Hours\nSynthetic,8,extra',
    'Employee Name,Actual Hours\nSynthetic',
    'Employee Name,Actual Hours\nTotal,80'
  ]) {
    const parsed = parse(core, source);
    assert.equal(parsed.success, false, source);
    assert.deepEqual(parsed.records, []);
    assert.equal(parsed.error.includes('Synthetic'), false, 'Errors do not echo source cells');
  }
});

test('staffing numeric fields reject malformed, negative and nonfinite values without defaulting', t => {
  const { core } = fixture(t);
  for (const value of ['-1', 'Infinity', 'NaN', '8hours', '1e3', '$26', '1'.repeat(310)]) {
    for (const field of ['Actual Hours', 'Scheduled Hours', 'Regular Hours', 'Overtime Hours', 'Hourly Rate']) {
      const parsed = parse(core, field === 'Actual Hours' ? 'Employee Name,Actual Hours\nSynthetic,' + value :
        'Employee Name,Actual Hours,' + field + '\nSynthetic,8,' + value);
      assert.equal(parsed.success, false, field + ': ' + value);
      assert.deepEqual(parsed.records, []);
    }
  }
  const zeros = parse(core, 'Employee Name,Actual Hours,Scheduled Hours,Regular Hours,Overtime Hours,Hourly Rate,Agency\nSynthetic,0,0,0,0,0,No');
  assert.equal(zeros.success, true);
  const result = analyze(core, zeros.records);
  assert.equal(result.periodSummary.totalOvertimeHours, 0);
  assert.equal(result.periodSummary.totalAgencyHours, 0);
  assert.equal(result.fteHiringGaps.totalFteDeficit, 0);
});

test('staffing regular and overtime breakdown must agree with worked hours', t => {
  const { core } = fixture(t);
  for (const row of ['Synthetic,8,8,2', 'Synthetic,8,9,0', 'Synthetic,8,0,9'])
    assert.equal(parse(core, 'Employee Name,Actual Hours,Regular Hours,Overtime Hours\n' + row).success, false);
  assert.equal(parse(core, 'Employee Name,Actual Hours,Regular Hours,Overtime Hours\nSynthetic,.3,.1,.2').success, true);
});

test('staffing imports retain the existing text, row and column limits', t => {
  const { core } = fixture(t);
  assert.equal(parse(core, 'x'.repeat(350001)).success, false);
  assert.equal(parse(core, 'Employee Name,Actual Hours\n' + 'A,0\n'.repeat(10001)).success, false);
  const headers = ['Employee Name', 'Actual Hours', ...Array.from({ length: 199 }, (_, i) => 'Extra ' + i)];
  assert.equal(parse(core, headers.join(',') + '\n' + ['Synthetic', '0', ...Array(199).fill('')].join(',')).success, false);
});

test('imported-period planning divides by 40 and excludes agency overtime already counted in worked hours', t => {
  const { core } = fixture(t);
  const parsed = parse(core, 'Employee Name,Role,Actual Hours,Regular Hours,Overtime Hours,Agency,Hourly Rate\nSynthetic Core,CNA,48,8,40,No,24\nSynthetic Agency,CNA,40,32,8,Yes,52');
  assert.equal(parsed.success, true);
  const result = analyze(core, parsed.records);
  assert.equal(result.periodSummary.totalHoursWorked, 88);
  assert.equal(result.periodSummary.totalOvertimeHours, 48);
  assert.equal(result.periodSummary.totalAgencyHours, 40);
  assert.equal(result.periodSummary.estimatedTotalAgencySpend, 2080);
  assert.equal(result.periodSummary.estimatedTotalOTSpend, null, 'A base rate alone does not establish overtime compensation');
  assert.equal(result.fteHiringGaps.totalFteDeficit, 2);
  assert.equal(result.fteHiringGaps.cnaFteDeficit, 2);
  assert.equal(result.fteHiringGaps.lpnFteDeficit, 0);
  assert.equal(result.fteHiringGaps.projectedMonthlySavings, null);
  assert.equal(result.assumptions.standardFteHours, 40);
  assert.match(result.periodSummary.periodLabel, /Imported period/);
  assert.equal(result.assumptions.weeklyPeriodConfirmed, false);
  assert.deepEqual(result.approachingOTRadar, []);
});

test('schedule variance stays a source review flag and punch minutes alone cannot establish early arrival', t => {
  const { core } = fixture(t);
  const parsed = parse(core, 'Employee Name,Actual Hours,Scheduled Hours,Clock In,Hourly Rate\nSynthetic On-time,8,8,14:45,\nSynthetic Variance,8.5,8,06:42,');
  const result = analyze(core, parsed.records);
  assert.equal(result.incidentalPunchAudit.flaggedOccurrences.length, 1);
  assert.equal(result.incidentalPunchAudit.flaggedOccurrences[0].employeeName, 'Synthetic Variance');
  assert.equal(result.incidentalPunchAudit.flaggedOccurrences[0].leakMinutes, 30);
  assert.equal(result.incidentalPunchAudit.flaggedOccurrences[0].estimatedCost, null);
  assert.equal(result.incidentalPunchAudit.estimatedLeakCost, null);
  assert.doesNotMatch(result.incidentalPunchAudit.flaggedOccurrences[0].reasons, /Early punch|Creeping late/);
  const zeroRate = analyze(core, [{ employeeName: 'Synthetic', actualHours: 8.5, scheduledHours: 8, hourlyRate: 0 }]);
  assert.equal(zeroRate.incidentalPunchAudit.flaggedOccurrences[0].estimatedCost, 0);
});

test('analysis keeps partial coverage unknown and rejects malformed direct numeric records', t => {
  const { core } = fixture(t);
  const result = analyze(core, [
    { employeeName: 'Synthetic A', actualHours: 8, scheduledHours: 8, overtimeHours: 0, isAgency: false },
    { employeeName: 'Synthetic B', actualHours: null, scheduledHours: null, overtimeHours: null, isAgency: null }
  ]);
  assert.equal(result.periodSummary.totalHoursWorked, null);
  assert.equal(result.periodSummary.knownHoursWorked, 8);
  assert.equal(result.periodSummary.totalOvertimeHours, null);
  assert.equal(result.periodSummary.knownOvertimeHours, 0);
  assert.equal(result.incidentalPunchAudit.totalLeakMinutes, null);
  assert.equal(result.incidentalPunchAudit.coverageComplete, false);
  assert.equal(result.fteHiringGaps.totalFteDeficit, null);
  assert.equal(analyze(core, []).fteHiringGaps.cnaFteDeficit, null);
  for (const value of ['8', -1, Infinity, NaN])
    assert.throws(() => analyze(core, [{ employeeName: 'Synthetic', actualHours: value }]), { code: 'INVALID' });
  assert.throws(() => analyze(core, {}), { code: 'INVALID' });
  assert.throws(() => analyze(core, [{ employeeName: 'Synthetic overflow', actualHours: 1e308, scheduledHours: 0 }]), { code: 'INVALID' });
});

test('staffing UI renders missing coverage and costs as unknown without an overtime or payroll all-clear', async t => {
  const { core } = fixture(t);
  const result = analyze(core, parse(core, 'Employee Name,Actual Hours\nSynthetic,8').records);
  const { createOperationsAnalyticsUI } = await import('../source/ui/operations-analytics.mjs');
  const api = async op => ({ snfDashboard: { demo: false }, staffingAnalyze: result,
    regulatoryList: [], regulatorySummary: {}, assistantConflictRadar: [], staffingReplacementMatch: [] })[op];
  const container = { innerHTML: '', querySelectorAll: () => [], querySelector: () => null };
  const ui = createOperationsAnalyticsUI({ api, esc: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;'), toast() {} });
  await ui.render(container);
  assert.match(container.innerHTML, /Unknown Staff/);
  assert.match(container.innerHTML, /Overtime hours: Unknown/);
  assert.match(container.innerHTML, /Agency hours: Unknown/);
  assert.match(container.innerHTML, /Unavailable/);
  assert.match(container.innerHTML, /Imported period/);
  assert.match(container.innerHTML, /coverage incomplete/);
  assert.doesNotMatch(container.innerHTML, /No employees at imminent risk|No significant incidental punch leakage|\$0|0 FTEs/);
});
