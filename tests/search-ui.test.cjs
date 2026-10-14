'use strict';
// Renderer/event boundary tests; real Core/SQLite search below. These do not
// establish browser layout or desktop IPC acceptance, which are checked separately.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { fixture } = require('./helpers.cjs');
const { search } = require('../source/workflows/universal-search.cjs');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const sources = ['chats', 'notes', 'meetings', 'projects', 'documents', 'tasks', 'reports'];
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function element() {
  return { innerHTML: '', textContent: '', value: '', checked: false, disabled: false, dataset: {}, handlers: {}, attributes: {},
    addEventListener(event, handler) { this.handlers[event] = handler; },
    setAttribute(key, value) { this.attributes[key] = value; },
    emit(event) { return this.handlers[event]?.({ preventDefault() {} }); } };
}
function container() {
  const nodes = new Map();
  const root = { isConnected: true, html: '', querySelector: selector => nodes.get(selector), get innerHTML() { return this.html; },
    set innerHTML(value) {
      this.html = value; nodes.clear();
      if (!value.includes('id="saved-search-form"')) return;
      for (const selector of ['#saved-search-form', '#saved-search-query', '#saved-search-project', '#saved-search-clinical', '#saved-search-submit', '#saved-search-status', '#saved-search-results']) nodes.set(selector, element());
      const checks = sources.map(type => ({ value: type, checked: true }));
      nodes.get('#saved-search-form').checks = checks;
      nodes.get('#saved-search-form').querySelectorAll = selector => selector === 'input[name="source"]:checked' ? checks.filter(input => input.checked) : [];
      nodes.get('#saved-search-clinical').disabled = /id="saved-search-clinical" type="checkbox" disabled/.test(value);
      const selected = value.match(/<option value="([^"]*)" selected>/);
      nodes.get('#saved-search-project').value = selected?.[1] || '';
      const results = nodes.get('#saved-search-results');
      let html = '';
      Object.defineProperty(results, 'innerHTML', { get: () => html, set(newValue) {
        html = newValue;
        results.buttons = [...newValue.matchAll(/<button type="button" data-search-open="(\d+)"([^>]*)>/g)].map(match => {
          const button = element(); button.dataset.searchOpen = match[1]; button.disabled = match[2].includes('disabled'); return button;
        });
      } });
      results.querySelectorAll = selector => selector === '[data-search-open]' ? results.buttons || [] : [];
    } };
  return root;
}
const empty = overrides => ({ results: [], totalMatches: 0, countsExact: true, truncated: false, coverage: { sources: [] }, ...overrides });
const controls = root => ({ form: root.querySelector('#saved-search-form'), query: root.querySelector('#saved-search-query'),
  project: root.querySelector('#saved-search-project'), clinical: root.querySelector('#saved-search-clinical'),
  submit: root.querySelector('#saved-search-submit'), status: root.querySelector('#saved-search-status'), results: root.querySelector('#saved-search-results') });
async function ui(options) { return (await import('../source/ui/search.mjs')).createSearchUI({ esc, toast() {}, ...options }); }

test('search UI uses real local saved sources, escapes evidence and opens only the source route', async t => {
  const { core, calls } = fixture(t, { generate: () => assert.fail('Search must not call an AI provider') });
  core.deleteKey('openai'); core.saveSettings({ processingMode: 'local-only', allowCloud: false });
  const note = { id: crypto.randomUUID(), text: 'Synthetic needle <script>PRIVATE_TEST()</script>', revision: 1, updated: Date.now() };
  core.store.put('capture_note', note.id, note);
  const requests = [], opened = [], root = container();
  const view = await ui({ api: async (op, data) => {
    requests.push({ op, data });
    if (op === 'workflowSummary') return { projects: [] };
    assert.equal(op, 'workflowSearch'); return search(core, data);
  }, openSource: async route => { opened.push({ ...route }); route.view = 'changed-by-handler'; } });
  await view.render(root);
  assert.match(root.innerHTML, /<details class="manual-details"><summary>Sources and collection/);
  const c = controls(root); c.query.value = ' needle '; await c.form.emit('submit');
  assert.deepEqual(requests[1].data, { query: 'needle', types: sources, includeClinical: false, limit: 50 });
  assert.match(c.results.innerHTML, /needle &lt;script&gt;PRIVATE_TEST\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(c.results.innerHTML, /<script>/);
  assert.match(c.results.innerHTML, /Field: text · Characters 0–/);
  await c.results.buttons[0].emit('click');
  assert.deepEqual(opened, [{ view: 'captures', captureId: note.id, sourceId: note.id }]);
  assert.equal(core.store.count('todo'), 0); assert.deepEqual(calls, []);
  assert.deepEqual(core.store.get('capture_note', note.id), note);
});

test('document source navigation carries only the searched query with its cloned source route', async t => {
  const { core } = fixture(t), id = crypto.randomUUID(), root = container(), opened = [];
  core.store.put('file', id, { id, name: 'Synthetic policy.txt', text: '[Page 3]\nSynthetic needle passage', bytes: '', hipaa: true });
  const view = await ui({ api: async (op, data) => op === 'workflowSummary' ? { projects: [] } : search(core, data), openSource: route => opened.push(route) });
  await view.render(root); const c = controls(root); c.query.value = 'needle';
  c.form.checks.forEach(input => input.checked = input.value === 'documents'); await c.form.emit('submit');
  await c.results.buttons[0].emit('click');
  assert.equal(opened[0].view, 'workspace'); assert.equal(opened[0].fileId, id);
  assert.equal(opened[0].sourceId, id); assert.equal(opened[0].query, 'needle');
  assert.ok(opened[0].sectionId); assert.equal(core.store.count('todo'), 0);
});

test('source filters, selected collection and clinical permission are explicit inputs', async t => {
  const { core } = fixture(t), selected = core.projectSave({ name: 'Synthetic <b>selected</b> collection' }), other = core.projectSave({ name: 'Synthetic other' });
  for (const projectId of [selected.id, other.id, null]) { const id = crypto.randomUUID(); core.store.put('capture_note', id, { id, text: 'Synthetic needle', projectId }); }
  const requests = [], root = container();
  const view = await ui({ api: async (op, data) => op === 'workflowSummary'
    ? { projects: [selected, { id: crypto.randomUUID(), name: 'Hidden archived collection', archived: true }] }
    : (requests.push(data), search(core, data)), state: () => ({ settings: { snfEnabled: false } }) });
  await view.render(root, { projectId: selected.id });
  assert.match(root.innerHTML, /Synthetic &lt;b&gt;selected&lt;\/b&gt; collection/);
  assert.doesNotMatch(root.innerHTML, /Hidden archived collection/);
  const c = controls(root); c.query.value = 'needle'; c.clinical.checked = true;
  c.form.checks.forEach(input => input.checked = input.value === 'notes'); await c.form.emit('submit');
  assert.deepEqual(requests[0], { query: 'needle', types: ['notes'], includeClinical: false, limit: 50, projectId: selected.id });
  assert.equal(c.results.buttons.length, 1);
  assert.match(c.status.textContent, /^1 saved-text match/);
  const enabled = container(), enabledView = await ui({ api: async (op, data) => op === 'workflowSummary' ? { projects: [] } : (requests.push(data), empty()) });
  await enabledView.render(enabled); const e = controls(enabled); e.query.value = 'needle'; e.clinical.checked = true; await e.form.emit('submit');
  assert.equal(requests.at(-1).includeClinical, true);
});

test('empty query, overlong query and an empty source selection never perform a lookup', async () => {
  const requests = [], root = container(), view = await ui({ api: async (op, data) => { requests.push({ op, data }); return { projects: [] }; } });
  await view.render(root); const c = controls(root);
  for (const value of ['', '   ', 'x'.repeat(201)]) { c.query.value = value; await c.form.emit('submit'); assert.match(c.status.textContent, /between 1 and 200/); }
  c.query.value = 'needle'; c.form.checks.forEach(input => input.checked = false); await c.form.emit('submit');
  assert.match(c.status.textContent, /at least one source/); assert.equal(requests.length, 1);
});

test('coverage remains a lower bound, unknown clinical coverage is explicit and display stays bounded', async () => {
  const root = container(), rows = Array.from({ length: 60 }, (_, i) => ({ title: 'Synthetic ' + i, type: 'notes', excerpt: 'Synthetic needle', sourceField: 'text', updated: null, route: { view: i ? 'captures' : 'unsupported' } }));
  const view = await ui({ api: async op => op === 'workflowSummary' ? { projects: [] } : empty({ results: rows, totalMatches: 1000,
    countsExact: false, truncated: true, includeClinical: true, coverage: { notice: 'Counts are lower bounds.', sources: [{ type: 'notes', kind: 'capture_note', scannedRecords: 1000, availableRecords: 1001, complete: false }] } }), openSource: () => {} });
  await view.render(root); const c = controls(root); c.query.value = 'needle'; await c.form.emit('submit');
  assert.match(c.status.textContent, /At least 1000 saved-text matches. Showing 50; refine/);
  assert.equal(c.results.buttons.length, 50); assert.equal(c.results.buttons[0].disabled, true);
  assert.match(c.results.innerHTML, /1000 scanned of 1001 saved records · Source scan limit reached/);
  assert.match(c.results.innerHTML, /Clinical live-feed freshness and completeness are unknown/);
  assert.match(c.results.innerHTML, /Stored: Not recorded/);
});

test('navigation stops a pending initial load from restoring the old search page', async () => {
  const pending = deferred(), root = container(), view = await ui({ api: () => pending.promise });
  const loading = view.render(root); view.stop(); root.innerHTML = '<h1>New chat</h1>';
  pending.resolve({ projects: [] }); await loading; assert.equal(root.innerHTML, '<h1>New chat</h1>');
});

test('new query and scope invalidate old results while a newer lookup remains authoritative', async () => {
  const one = deferred(), two = deferred(), root = container(); let calls = 0;
  const view = await ui({ api: op => op === 'workflowSummary' ? { projects: [] } : ++calls === 1 ? one.promise : two.promise });
  await view.render(root); const c = controls(root); c.query.value = 'first'; const first = c.form.emit('submit');
  c.query.value = 'second'; await c.form.emit('input'); const second = c.form.emit('submit');
  two.resolve(empty({ totalMatches: 2 })); await second;
  one.resolve(empty({ totalMatches: 99, results: [{ title: 'Stale private source', route: { view: 'captures' } }] })); await first;
  assert.match(c.status.textContent, /^2 saved-text matches/); assert.doesNotMatch(c.results.innerHTML, /Stale private source/);
  assert.equal(c.submit.disabled, false); assert.equal(c.form.attributes['aria-busy'], 'false');
});

test('navigation and changed filters suppress late search failures and cannot reopen old sources', async () => {
  const pending = deferred(), root = container(), notices = [], opened = [];
  const view = await ui({ api: op => op === 'workflowSummary' ? { projects: [] } : pending.promise, toast: text => notices.push(text), openSource: route => opened.push(route) });
  await view.render(root); const c = controls(root); c.query.value = 'needle'; const running = c.form.emit('submit');
  c.form.checks[0].checked = false; await c.form.emit('change');
  view.stop(); root.innerHTML = '<h1>Meetings</h1>'; pending.reject(Error('PRIVATE_PROMPT_OR_PATH')); await running;
  assert.equal(root.innerHTML, '<h1>Meetings</h1>'); assert.deepEqual(notices, []); assert.deepEqual(opened, []);
});

test('locked, Demo and development restrictions show a truthful unavailable state', async () => {
  for (const summary of [{ demo: true }, { developmentMode: true }]) {
    const requests = [], root = container(), view = await ui({ api: async op => { requests.push(op); return summary; } });
    await view.render(root); assert.match(root.innerHTML, /unavailable in Development or Demo mode/);
    assert.equal(root.querySelector('#saved-search-form'), undefined); assert.deepEqual(requests, ['workflowSummary']);
  }
  const root = container(), view = await ui({ api: async () => { throw Object.assign(Error('PRIVATE_SECRET_PATH'), { code: 'LOCKED' }); } });
  await view.render(root); assert.match(root.innerHTML, /Unlock Private AI/); assert.doesNotMatch(root.innerHTML, /PRIVATE_SECRET_PATH/);
});

test('lookup failures expose no private error payload and can be retried', async () => {
  const root = container(); let calls = 0;
  const view = await ui({ api: async op => op === 'workflowSummary' ? { projects: [] } : ++calls === 1 ? Promise.reject(Error('PRIVATE_PROMPT_OR_TOKEN')) : empty() });
  await view.render(root); const c = controls(root); c.query.value = 'needle'; await c.form.emit('submit');
  assert.equal(c.status.textContent, 'Search could not be completed. Please try again.');
  assert.doesNotMatch(c.results.innerHTML, /PRIVATE_PROMPT_OR_TOKEN/); assert.equal(c.submit.disabled, false);
  await c.form.emit('submit'); assert.match(c.results.innerHTML, /does not establish that the information or clinical condition is absent/);
});
