'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers.cjs');
const { dispatch } = require('../source/operations-analytics-engine.cjs');
const rule = (patch = {}) => ({ reviewed: true, periodHoursConfirmed: true, thresholdHours: 40, multiplier: 1.5, ...patch });
const candidate = (patch = {}) => ({ name: 'Synthetic candidate', role: 'CNA', currentHours: 35,
  hourlyRate: 20, isAgency: false, overtimeRule: rule(), ...patch });
const match = (core, roster, openShift = { role: 'CNA', hours: 8 }) => dispatch(core, 'staffingReplacementMatch', { openShift, roster });

test('replacement comparison keeps missing inputs unknown and never creates a production roster', t => {
  const { core } = fixture(t);
  const before = core.store.db.prepare('SELECT COUNT(*) n FROM records').get().n;
  assert.deepEqual(match(core, undefined), []);
  const [row] = match(core, [{ name: 'Synthetic incomplete', role: 'CNA' }]);
  for (const field of ['currentHours', 'hourlyRate', 'isAgency', 'hoursAfterShift', 'willIncurOT', 'otHoursAdded', 'regularHoursAdded', 'estimatedShiftCost', 'tier'])
    assert.equal(row[field], null, field);
  assert.equal(row.reviewRequired, true);
  assert.doesNotMatch(row.recommendation, /Optimal|PRN|\$24|0 overtime hours/);
  assert.equal(core.store.db.prepare('SELECT COUNT(*) n FROM records').get().n, before);
});

test('replacement projections require a reviewed compensation rule and confirmed period hours', t => {
  const { core } = fixture(t);
  for (const overtimeRule of [null, {}, rule({ reviewed: false }), rule({ periodHoursConfirmed: false }),
    rule({ thresholdHours: null }), rule({ multiplier: null })]) {
    const [row] = match(core, [candidate({ overtimeRule })]);
    assert.equal(row.currentHours, 35);
    assert.equal(row.hoursAfterShift, 43);
    assert.equal(row.willIncurOT, null);
    assert.equal(row.otHoursAdded, null);
    assert.equal(row.estimatedShiftCost, null);
    assert.equal(row.tier, null);
  }
  const [rateMissing] = match(core, [candidate({ hourlyRate: null })]);
  assert.equal(rateMissing.otHoursAdded, 3);
  assert.equal(rateMissing.estimatedShiftCost, null);
  const [hoursMissing] = match(core, [candidate({ currentHours: null })]);
  assert.equal(hoursMissing.otHoursAdded, null);
  assert.equal(hoursMissing.estimatedShiftCost, null);
  const [agencyMissing] = match(core, [candidate({ isAgency: null })]);
  assert.equal(agencyMissing.tier, null);
  assert.equal(agencyMissing.reviewRequired, true);
});

test('explicit zero hours and rates survive replacement calculations', t => {
  const { core } = fixture(t);
  const [row] = match(core, [candidate({ currentHours: 0, hourlyRate: 0 })]);
  assert.equal(row.currentHours, 0);
  assert.equal(row.hourlyRate, 0);
  assert.equal(row.hoursAfterShift, 8);
  assert.equal(row.willIncurOT, false);
  assert.equal(row.otHoursAdded, 0);
  assert.equal(row.estimatedShiftCost, 0);
  assert.equal(row.tier, 1);
  assert.equal(row.status, null, 'Threshold comparison does not infer PRN employment status');
});

test('agency comparison uses its explicit rate and reviewed rule instead of a fixed bill rate', t => {
  const { core } = fixture(t);
  const [row] = match(core, [candidate({ isAgency: true, currentHours: 0, hourlyRate: 10, overtimeRule: rule({ multiplier: 1 }) })]);
  assert.equal(row.estimatedShiftCost, 80);
  assert.equal(row.tier, 4);
  assert.equal(row.reviewRequired, true);
  assert.doesNotMatch(row.recommendation, /highest cost|\$54/);
  assert.equal(match(core, [candidate({ isAgency: true, hourlyRate: null })])[0].estimatedShiftCost, null);
  assert.equal(match(core, [candidate({ isAgency: true, overtimeRule: null })])[0].estimatedShiftCost, null);
});

test('mixed regular and overtime portions are priced consistently for the supplied shift length', t => {
  const { core } = fixture(t);
  const [mixed] = match(core, [candidate()], { role: 'CNA', hours: 12 });
  assert.equal(mixed.hoursAfterShift, 47);
  assert.equal(mixed.otHoursAdded, 7);
  assert.equal(mixed.regularHoursAdded, 5);
  assert.equal(mixed.estimatedShiftCost, 310);
  assert.match(mixed.recommendation, /12-hour shift/);
  assert.doesNotMatch(mixed.recommendation, /Full 8|will be paid/);
  const [allOT] = match(core, [candidate({ currentHours: 45 })], { role: 'CNA', hours: 4 });
  assert.equal(allOT.otHoursAdded, 4);
  assert.equal(allOT.regularHoursAdded, 0);
  assert.equal(allOT.estimatedShiftCost, 120);
  const [differentRule] = match(core, [candidate({ currentHours: 58, overtimeRule: rule({ thresholdHours: 60, multiplier: 2 }) })], { role: 'CNA', hours: 4 });
  assert.equal(differentRule.otHoursAdded, 2);
  assert.equal(differentRule.estimatedShiftCost, 120);
});

test('replacement input rejects numeric strings, negatives, nonfinite values and malformed shapes safely', t => {
  const { core } = fixture(t);
  for (const value of ['38', -1, Infinity, NaN]) {
    for (const field of ['currentHours', 'hourlyRate'])
      assert.throws(() => match(core, [candidate({ [field]: value })]), { code: 'INVALID' });
    for (const field of ['thresholdHours', 'multiplier'])
      assert.throws(() => match(core, [candidate({ overtimeRule: rule({ [field]: value }) })]), { code: 'INVALID' });
  }
  for (const hours of [undefined, null, 0, '8', -1, Infinity, NaN])
    assert.throws(() => match(core, [candidate()], { role: 'CNA', hours }), { code: 'INVALID' });
  for (const roster of [{}, [null], [[]], [candidate({ isAgency: 'No' })], [candidate({ overtimeRule: [] })],
    [candidate({ overtimeRule: rule({ reviewed: 'true' }) })]])
    assert.throws(() => match(core, roster), { code: 'INVALID' });
  assert.throws(() => match(core, [candidate()], { hours: 8 }), { code: 'INVALID' });
  assert.throws(() => match(core, Array(10001).fill(candidate())), { code: 'INVALID' });
  assert.throws(() => match(core, [candidate({ currentHours: 1e308 })], { role: 'CNA', hours: 1e308 }), { code: 'INVALID' });
});

test('incomplete candidates and costs cannot sort as zero-cost preferred choices', t => {
  const { core } = fixture(t);
  const result = match(core, [
    candidate({ name: 'Synthetic missing rate', currentHours: 0, hourlyRate: null }),
    candidate({ name: 'Synthetic complete', currentHours: 0, hourlyRate: 20 }),
    candidate({ name: 'Synthetic zero', currentHours: 0, hourlyRate: 0 }),
    candidate({ name: 'Synthetic unknown coverage', currentHours: null })
  ]);
  assert.deepEqual(result.map(row => row.name), ['Synthetic zero', 'Synthetic complete', 'Synthetic missing rate', 'Synthetic unknown coverage']);
  assert.equal(result.at(-1).tier, null);
  assert.equal(result.at(-1).otHoursAdded, null);
});

test('Demo sample rules remain explicit and cannot fill missing rules on a supplied roster', async t => {
  const { core } = fixture(t);
  const workspace = require('../source/snf/demo.cjs').forCore(core);
  await workspace.set({ mode: 'demo' });
  const before = core.store.db.prepare('SELECT COUNT(*) n FROM records').get().n;
  const samples = match(core, undefined);
  assert.ok(samples.length);
  assert.ok(samples.every(row => row.demo && row.overtimeRule.reviewed && row.overtimeRule.periodHoursConfirmed));
  assert.ok(samples.every(row => row.reviewRequired));
  const [supplied] = match(core, [candidate({ overtimeRule: null })]);
  assert.equal(supplied.otHoursAdded, null);
  assert.equal(supplied.estimatedShiftCost, null);
  assert.equal(core.store.db.prepare('SELECT COUNT(*) n FROM records').get().n, before, 'Comparison is read-only in the selected Demo workspace');
  await workspace.set({ mode: 'production' });
  assert.deepEqual(match(core, undefined), []);
  core.lock();
  assert.throws(() => match(core, [candidate()]), { code: 'LOCKED' });
});

test('replacement UI shows empty source and nullable calculations without price or availability claims', async t => {
  const { core } = fixture(t);
  const { createOperationsAnalyticsUI } = await import('../source/ui/operations-analytics.mjs');
  let roster = [], clicks, roleValue = 'CNA', hoursValue = '8';
  const requests = [], notices = [];
  const api = async (op, data = {}) => {
    if (op === 'staffingReplacementMatch') { requests.push(data.openShift); return match(core, roster, data.openShift); }
    return { snfDashboard: { demo: false }, staffingAnalyze: dispatch(core, 'staffingAnalyze', {}),
      regulatoryList: [], regulatorySummary: {}, assistantConflictRadar: [] }[op];
  };
  const container = { innerHTML: '', querySelectorAll: () => [], querySelector(selector) {
    if (selector === '#btn-re-rank-matches') return { addEventListener: (_event, handler) => { clicks = handler; } };
    if (selector === '#select-open-role') return { value: roleValue };
    if (selector === '#select-open-hours') return { value: hoursValue };
    return null;
  } };
  const ui = createOperationsAnalyticsUI({ api, esc: value => String(value).replace(/</g, '&lt;'), toast: message => notices.push(message) });
  await ui.render(container, { subTab: 'replacement_matcher' });
  assert.match(container.innerHTML, /No reviewed matching roster data supplied/);
  assert.doesNotMatch(container.innerHTML, /automatically finds|Optimal PRN|Agency \(\$54/);
  roster = [{ name: 'Synthetic unknown', role: 'CNA' }];
  await clicks();
  assert.match(container.innerHTML, /Unknown — review source/);
  assert.match(container.innerHTML, /Unavailable/);
  assert.doesNotMatch(container.innerHTML, /\$24|\$54|0 hrs OT|\$0/);
  roster = [candidate()]; hoursValue = '12';
  await clicks();
  assert.deepEqual(requests.at(-1), { role: 'CNA', hours: 12 });
  assert.match(container.innerHTML, /\$310/);
  assert.match(container.innerHTML, /7 hrs/);
  assert.match(container.innerHTML, /value="12\.0" selected/);
  const count = requests.length; hoursValue = '8oops';
  await clicks();
  assert.equal(requests.length, count, 'Invalid control data does not fall back to eight hours');
  assert.match(notices.at(-1), /supported role and shift length/);
});
