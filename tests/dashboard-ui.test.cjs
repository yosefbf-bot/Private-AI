'use strict';
// Actual Dashboard callbacks at a DOM/transport boundary. Delayed writes,
// refreshes and dialogs model navigation while user-approved work is pending.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const source = {
  developmentMode: true,
  changes: { items: [{ id: 'synthetic-task', key: 'todo:synthetic-task', kind: 'todo', title: 'Synthetic follow-up', closed: false, revision: 'task-revision' }], unavailable: [] },
  notices: { items: [{ key: 'job:synthetic-job', title: 'Synthetic interrupted job', status: 'unread', revision: 'notice-revision', route: { view: 'automation', jobId: 'synthetic-job' } }] },
};
function dom() {
  const task = { dataset: { review: 'todo:synthetic-task' }, disabled: false };
  const notice = { dataset: { noticeReview: 'job:synthetic-job' }, disabled: false };
  const query = { value: '' }, tasks = { innerHTML: '', insertAdjacentHTML() {} };
  return { container: { isConnected: true, innerHTML: '',
    querySelector(selector) { return selector === '#dashboard-search' ? query : selector === '#dashboard-tasks' ? tasks : null; },
    querySelectorAll(selector) { return selector === '[data-review]' ? [task] : selector === '[data-notice-review]' ? [notice] : []; },
  }, task, notice };
}
async function fixture({ stage, kind, reject = false } = {}) {
  const pending = deferred(), started = deferred(), calls = [], notices = [], d = dom();
  const op = kind === 'notice' ? 'workflowNoticeUpdate' : 'workflowActionSave';
  const values = kind === 'notice' ? { ack: 'on', until: '' } : { owner: 'Synthetic owner', due: '', note: 'Synthetic review note', reviewer: 'Synthetic reviewer' };
  const { createDashboardUI } = await import('../source/ui/dashboard.mjs');
  const view = createDashboardUI({
    api: async (operation, data) => {
      calls.push({ operation, data });
      if (operation === 'workflowSummary') return source;
      assert.equal(operation, op);
      if (stage === 'save') { started.resolve(); await pending.promise; }
      return {};
    },
    esc: value => String(value ?? ''), toast: message => notices.push(message), field: () => '', textarea: () => '',
    form: async () => { if (stage === 'form') { started.resolve(); await pending.promise; } return values; },
    refresh: async () => { if (stage === 'refresh') { started.resolve(); await pending.promise; } },
    renderPage: () => assert.fail('A save must not change source views'),
  });
  await view.render(d.container);
  const running = (kind === 'notice' ? d.notice : d.task).onclick();
  await started.promise;
  view.stop(); d.container.innerHTML = '<h1>New chat</h1>';
  if (reject) pending.reject(Error('Synthetic delayed transport failure'));
  else pending.resolve();
  await running;
  return { ...d, calls, notices, op };
}

for (const kind of ['follow-up', 'notice']) {
  test(`Dashboard ${kind} save cannot restore the old view after navigation`, async () => {
    const f = await fixture({ kind, stage: 'save' });
    assert.equal(f.container.innerHTML, '<h1>New chat</h1>');
    assert.equal(f.calls.filter(call => call.operation === f.op).length, 1, 'Already-approved write may finish exactly once');
    assert.equal(f.calls.filter(call => call.operation === 'workflowSummary').length, 1, 'No stale rerender requests');
    assert.deepEqual(f.notices, []);
  });
  test(`Dashboard ${kind} dialog cannot submit after its view was stopped`, async () => {
    const f = await fixture({ kind, stage: 'form' });
    assert.equal(f.container.innerHTML, '<h1>New chat</h1>');
    assert.equal(f.calls.filter(call => call.operation === f.op).length, 0);
    assert.deepEqual(f.notices, []);
  });
  test(`Dashboard ${kind} delayed error cannot show a stale toast after navigation`, async () => {
    const f = await fixture({ kind, stage: 'save', reject: true });
    assert.equal(f.container.innerHTML, '<h1>New chat</h1>');
    assert.deepEqual(f.notices, []);
  });
}

test('Dashboard follow-up refresh cannot restore the old view after navigation', async () => {
  const f = await fixture({ kind: 'follow-up', stage: 'refresh' });
  assert.equal(f.container.innerHTML, '<h1>New chat</h1>');
  assert.equal(f.calls.filter(call => call.operation === f.op).length, 1);
  assert.equal(f.calls.filter(call => call.operation === 'workflowSummary').length, 1);
});
