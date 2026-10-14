'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto'), path = require('node:path');
const { fixture } = require('./helpers.cjs');
const { search, SCAN_LIMIT } = require('../source/workflows/universal-search.cjs');
const documents = require('../source/workflows/documents.cjs');
const id = () => crypto.randomUUID();
function put(core, kind, row, options) { row = { id: id(), updated: Date.now(), ...row }; core.store.put(kind, row.id, row, options); return row; }
function seed(core) {
  const project = core.projectSave({ name: 'Synthetic needle project' });
  const chat = core.createChat({ project: project.id });
  chat.title = 'Synthetic needle chat'; chat.messages = [{ role: 'user', text: 'Synthetic needle saved message', localFiles: [{ bytes: 'SYNTHETIC_PRIVATE_ATTACHMENT' }] }]; core.saveChat(chat);
  const note = put(core, 'capture_note', { text: 'Synthetic needle note', projectId: project.id, revision: 1, actionIds: [], draftIds: [] });
  const draft = put(core, 'capture_draft', { captureId: note.id, subject: 'Synthetic draft', body: 'Synthetic needle draft', revision: 1 });
  note.draftIds = [draft.id]; core.store.put('capture_note', note.id, note);
  const meeting = put(core, 'meeting', { title: 'Synthetic meeting', projectId: project.id, transcript: [{ text: 'Synthetic needle discussion' }], actionItems: [], status: 'completed' });
  const file = put(core, 'file', { name: 'Synthetic reference.txt', text: '[Page 1]\nSynthetic needle evidence.', size: 50, bytes: 'SYNTHETIC_PRIVATE_ATTACHMENT', hipaa: true });
  documents.link(core, { projectId: project.id, fileIds: [file.id] });
  const todo = core.saveTodo({ title: 'Synthetic needle task' }); core.store.put('todo', todo.id, { ...todo, projectId: project.id });
  const job = put(core, 'job', { title: 'Synthetic needle report', projectId: project.id, status: 'completed', recoveryInput: { prompt: 'SYNTHETIC_PRIVATE_RECOVERY', files: [{ bytes: 'SYNTHETIC_PRIVATE_ATTACHMENT' }] } });
  return { project, chat, note, draft, meeting, file, todo, job };
}

test('universal search returns bounded structured source matches using existing document search and canonical todos', t => {
  const { core } = fixture(t), seeded = seed(core);
  const original = documents.search; let documentCalls = 0;
  t.mock.method(documents, 'search', (...args) => { documentCalls++; return original(...args); });
  const result = search(core, { query: 'needle' });
  assert.deepEqual(new Set(result.results.map(r => r.type)), new Set(['chats', 'notes', 'meetings', 'projects', 'documents', 'tasks', 'reports']));
  assert.equal(documentCalls, 1);
  assert.equal(result.countsByType.tasks, 1);
  assert.equal(result.countsExact, true);
  assert.equal(result.totalMatches, result.results.length);
  for (const row of result.results) { assert.ok(row.excerpt.length <= 400); assert.match(row.revision, /^[a-f0-9]{64}$/); assert.equal(row.route.sourceId, row.sourceId); }
  assert.deepEqual(result.results.find(r => r.sourceKind === 'meeting').route, { view: 'meetings', meetingId: seeded.meeting.id, sourceId: seeded.meeting.id });
  assert.equal(result.results.find(r => r.sourceKind === 'todo').route.key, 'todo:' + seeded.todo.id);
  assert.equal(result.results.find(r => r.sourceKind === 'capture_draft').route.captureId, seeded.note.id);
});

test('universal input rejects invalid query, filters, scope and limits without widening scope', t => {
  const { core } = fixture(t);
  for (const data of [{ query: '' }, { query: 'x'.repeat(201) }, { query: 12 }, { query: 'x', types: ['secret'] },
    { query: 'x', types: [] }, { query: 'x', types: ['chats', 'chats'] }, { query: 'x', limit: 51 },
    { query: 'x', limit: 0 }, { query: 'x', projectId: '../outside' }, { query: 'x', projectId: '' },
    { query: 'x', includeClinical: 'true' }, { query: 'x', native: true }])
    assert.throws(() => search(core, data), { code: 'INVALID' });
  assert.throws(() => search(core, { query: 'x', projectId: id() }), { code: 'NOT_FOUND' });
});

test('project search excludes unknown and unrelated project sources', t => {
  const { core } = fixture(t), seeded = seed(core), other = core.projectSave({ name: 'Synthetic other' });
  put(core, 'capture_note', { text: 'Needle unrelated note', projectId: other.id });
  put(core, 'capture_note', { text: 'Needle unknown project note' });
  put(core, 'meeting', { title: 'Needle unknown project meeting', transcript: [] });
  core.saveTodo({ title: 'Needle unknown project task' });
  const otherFile = put(core, 'file', { name: 'Needle unrelated file.txt', text: 'Needle unrelated text', bytes: '' });
  documents.link(core, { projectId: other.id, fileIds: [otherFile.id] });
  const result = search(core, { query: 'needle', projectId: seeded.project.id });
  assert.equal(result.results.some(r => /unrelated|unknown project/i.test(r.excerpt)), false);
  assert.equal(result.countsByType.tasks, 1);
  assert.equal(result.results.filter(r => r.type === 'documents').length, 1);
});

test('archived and temporary chats, owned attachments, expired records and orphan drafts are excluded', t => {
  const { core } = fixture(t);
  for (const flag of ['archived', 'temporary']) {
    const chat = put(core, 'chat', { title: 'Needle hidden chat', messages: [{ text: 'Needle hidden message' }], [flag]: true });
    put(core, 'file', { name: 'Needle hidden owned file.txt', text: 'Needle hidden attachment', ownerChat: chat.id, bytes: '' });
  }
  core.createChat({ temporary: true }).messages.push({ text: 'Needle temporary in memory' });
  put(core, 'capture_note', { text: 'Needle expired source' }, { expires: Date.now() - 1 });
  put(core, 'capture_draft', { captureId: id(), body: 'Needle orphan draft' });
  assert.equal(search(core, { query: 'needle' }).totalMatches, 0);
});

test('dedicated clinical sources and tagged tasks require explicit permission and report unknown coverage', t => {
  const { core } = fixture(t);
  put(core, 'snf_resident', { name: 'Synthetic needle resident', room: 'Synthetic room' });
  put(core, 'sbar', { residentName: 'Synthetic needle resident', situation: { concern: 'Synthetic needle concern' } });
  const task = core.saveTodo({ title: 'MD Callback Follow-Up: Synthetic needle resident' });
  assert.equal(search(core, { query: 'needle' }).totalMatches, 0);
  const result = search(core, { query: 'needle', includeClinical: true });
  assert.ok(result.results.some(r => r.type === 'clinical'));
  assert.ok(result.results.some(r => r.sourceId === task.id));
  assert.equal(result.coverage.clinical.sourceAvailability, 'unknown');
  assert.equal(result.coverage.clinical.freshness, 'unknown');
  const project = core.projectSave({ name: 'Synthetic project' });
  assert.equal(search(core, { query: 'needle', includeClinical: true, projectId: project.id }).totalMatches, 0);
  core.saveSettings({ snfEnabled: false });
  assert.throws(() => search(core, { query: 'needle', includeClinical: true }), { code: 'POLICY' });
});

test('universal search fails closed for lock including background allowance, Demo and development', async t => {
  const { core } = fixture(t); seed(core);
  core.store.put('messaging', 'settings', { enabled: true, allowWhileLocked: true });
  core.lock();
  assert.throws(() => core.backgroundContext.run(core.backgroundToken, () => search(core, { query: 'needle' })), { code: 'LOCKED' });
  core.unlock(); core.developmentMode = true;
  assert.throws(() => search(core, { query: 'needle' }), { code: 'POLICY' });
  core.developmentMode = false;
  await require('../source/snf/demo.cjs').forCore(core).set({ mode: 'demo' });
  assert.throws(() => search(core, { query: 'needle' }), { code: 'POLICY' });
});

test('search streams source projections, retains at most 50 matches and reports scan limits honestly', t => {
  const { core } = fixture(t);
  const original = core.store.list.bind(core.store);
  t.mock.method(core.store, 'list', kind => { assert.ok(!['chat', 'file', 'meeting', 'todo'].includes(kind), 'Full source collections must not be materialized'); return original(kind); });
  for (let i = 0; i < SCAN_LIMIT + 1; i++) put(core, 'capture_note', { text: 'Synthetic needle ' + 'evidence '.repeat(90) });
  const result = search(core, { query: 'needle', types: ['notes'] });
  assert.equal(result.results.length, 50);
  assert.equal(result.totalMatches, SCAN_LIMIT);
  assert.equal(result.countsExact, false);
  assert.equal(result.truncated, true);
  assert.ok(result.results.every(r => r.excerpt.length <= 400));
  assert.match(result.coverage.notice, /lower bounds/);
});

test('search never matches private stores, attachment bytes, recovery arrays or temporary source fields', t => {
  const { core } = fixture(t); seed(core);
  for (const kind of ['secret', 'identity', 'peer', 'companion_device', 'capture_evidence'])
    put(core, kind, { key: 'SYNTHETIC_PRIVATE_CANARY', bytes: 'SYNTHETIC_PRIVATE_CANARY', label: 'SYNTHETIC_PRIVATE_CANARY' });
  assert.equal(search(core, { query: 'SYNTHETIC_PRIVATE_CANARY' }).totalMatches, 0);
  assert.equal(search(core, { query: 'SYNTHETIC_PRIVATE_ATTACHMENT' }).totalMatches, 0);
  assert.equal(search(core, { query: 'SYNTHETIC_PRIVATE_RECOVERY' }).totalMatches, 0);
});

test('source revisions and deletion survive restart without any persisted search index or plaintext copy', t => {
  const f = fixture(t), core = f.core;
  const note = put(core, 'capture_note', { text: 'Synthetic needle source' });
  const tables = () => core.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
  const before = tables(), revision = search(core, { query: 'needle', types: ['notes'] }).results[0].revision;
  core.store.put('capture_note', note.id, { ...note, text: 'Synthetic needle revised source' });
  assert.notEqual(search(core, { query: 'needle', types: ['notes'] }).results[0].revision, revision);
  assert.deepEqual(tables(), before);
  for (const r of core.store.db.prepare('SELECT payload FROM records').all()) assert.equal(Buffer.from(r.payload).includes(Buffer.from('Synthetic needle')), false);
  core.store.delete('capture_note', note.id);
  core.close();
  const { Store } = require('../source/database.cjs'), { Core } = require('../source/core.cjs');
  const reopened = new Core({ root: f.root, store: new Store(path.join(f.root, 'privateai.db'), f.cipher), machine: 'synthetic-machine' });
  try { assert.equal(search(reopened, { query: 'needle', types: ['notes'] }).totalMatches, 0); }
  finally { reopened.close(); }
});
