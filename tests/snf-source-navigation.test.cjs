'use strict';
// Synthetic renderer snapshots with the real Core/SQLite dashboard shape.
// Delayed responses exercise shared state and real tab callbacks, not source text.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers.cjs');
const { dispatch } = require('../source/snf/index.cjs');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function dom(t) {
  const previous = global.document;
  const elements = Object.fromEntries(['bar-crit-num', 'bar-high-num', 'bar-review-num', 'bar-crit-banner', 'bar-pcc-freshness', 'snf-sidebar-badge'].map(id => [id, { textContent: '', hidden: false, className: '' }]));
  global.document = { getElementById: id => elements[id] || null };
  t.after(() => { if (previous === undefined) delete global.document; else global.document = previous; });
  const tabs = ['alerts', 'medchanges'].map(tab => ({ dataset: { tab }, handlers: {}, addEventListener(event, handler) { this.handlers[event] = handler; } }));
  const container = { isConnected: true, innerHTML: '', querySelector: () => null,
    querySelectorAll: selector => selector === '.snf-tab' ? tabs : [] };
  return { container, elements, clickTab: tab => tabs.find(row => row.dataset.tab === tab).handlers.click() };
}
async function snapshots(t) {
  const { core } = fixture(t);
  const names = ['snfDashboard', 'snfAlerts', 'snfOpenIssues', 'snfMedChanges', 'snfPsychWatch', 'snfPCCReports'];
  const values = await Promise.all(names.map(op => dispatch(core, op, {})));
  const base = Object.fromEntries(names.map((op, index) => [op, values[index]]));
  const make = (label, demo, count) => ({ ...base,
    snfDashboard: { ...base.snfDashboard, demo,
      alerts: { ...base.snfDashboard.alerts, critical: count, high: 0, review: 0, totalUnresolved: count },
      productionAlerts: { critical: count, high: 0, review: 0, totalUnresolved: count } },
    snfAlerts: [{ id: label + '-id', title: label, residentName: 'Synthetic resident', severity: 'critical', status: 'new', createdAt: Date.now() }],
  });
  return { old: make('SYNTHETIC_OLD_SOURCE_CANARY', false, 9), current: make('Synthetic current Demo source', true, 1) };
}

for (const firstOperation of ['render', 'refresh']) {
  test(`obsolete SNF ${firstOperation} cannot replace newer workspace state or alerts on subsequent tab clicks`, async t => {
    const data = await snapshots(t), d = dom(t), old = deferred(), messages = [];
    let selected = 'old';
    const { createSNFUI } = await import('../source/ui/snf-ui.mjs');
    const view = createSNFUI({ api: async op => {
      const requested = selected;
      if (requested === 'old') await old.promise;
      return data[requested][op];
    }, esc, toast: message => messages.push(message), renderPage: () => {} });
    const first = firstOperation === 'render'
      ? view.render(d.container, { alertId: data.old.snfAlerts[0].id })
      : view.refresh();
    selected = 'current';
    await view.render(d.container, { alertId: data.current.snfAlerts[0].id });
    assert.match(d.container.innerHTML, /Synthetic current Demo source/);
    assert.match(d.container.innerHTML, /DEMO DATA — NOT FOR CLINICAL USE/);
    assert.equal(d.elements['bar-crit-num'].textContent, 1);
    old.resolve(); await first;
    await d.clickTab('medchanges'); await d.clickTab('alerts');
    assert.match(d.container.innerHTML, /Synthetic current Demo source/, 'A tab redraw must continue using the newer source snapshot');
    assert.match(d.container.innerHTML, /DEMO DATA — NOT FOR CLINICAL USE/, 'Newer workspace label remains');
    assert.doesNotMatch(d.container.innerHTML, /SYNTHETIC_OLD_SOURCE_CANARY/);
    assert.equal(d.elements['bar-crit-num'].textContent, 1, 'Obsolete metrics cannot change the shared alert bar');
    assert.deepEqual(messages, []);
  });
}

test('stopped SNF navigation cannot restore its old page or alert-bar counts', async t => {
  const data = await snapshots(t), d = dom(t), pending = deferred();
  const { createSNFUI } = await import('../source/ui/snf-ui.mjs');
  const view = createSNFUI({ api: async op => { await pending.promise; return data.old[op]; }, esc, toast: () => assert.fail('No stale toast'), renderPage: () => {} });
  const running = view.render(d.container, { alertId: data.old.snfAlerts[0].id });
  view.stop(); d.container.innerHTML = '<h1>New chat</h1>'; pending.resolve(); await running;
  assert.equal(d.container.innerHTML, '<h1>New chat</h1>');
  assert.equal(d.elements['bar-crit-num'].textContent, '');
});

test('obsolete SNF load failure cannot replace a newer page or show a stale error', async t => {
  const data = await snapshots(t), d = dom(t), pending = deferred(), messages = [];
  let selected = 'old';
  const { createSNFUI } = await import('../source/ui/snf-ui.mjs');
  const view = createSNFUI({ api: async op => { const requested = selected; if (requested === 'old') await pending.promise; return data[requested][op]; }, esc, toast: message => messages.push(message), renderPage: () => {} });
  const old = view.render(d.container, { alertId: data.old.snfAlerts[0].id });
  selected = 'current'; await view.render(d.container, { alertId: data.current.snfAlerts[0].id });
  pending.reject(Error('Synthetic obsolete source failure')); await old;
  assert.match(d.container.innerHTML, /Synthetic current Demo source/); assert.deepEqual(messages, []);
});

test('stopped resident-source navigation cannot display a late timeline response', async t => {
  const data = await snapshots(t), d = dom(t), timeline = deferred(), started = deferred();
  const { createSNFUI } = await import('../source/ui/snf-ui.mjs');
  const view = createSNFUI({ api: async (op, input) => {
    if (op === 'snfResidentTimeline') { assert.equal(input.query, 'synthetic-resident-id'); started.resolve(); return timeline.promise; }
    return data.current[op];
  }, esc, toast: () => assert.fail('No stale timeline error'), renderPage: () => {} });
  const running = view.render(d.container, { residentId: 'synthetic-resident-id' });
  await started.promise; view.stop(); d.container.innerHTML = '<h1>Notes</h1>';
  timeline.resolve({ text: 'SYNTHETIC_PRIVATE_TIMELINE_CANARY' }); await running;
  assert.equal(d.container.innerHTML, '<h1>Notes</h1>');
});
