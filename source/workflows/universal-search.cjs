'use strict';
// Read saved encrypted sources on demand. No secondary index, filesystem read,
// provider call, attachment decoding, clinical interpretation or source mutation.
const crypto = require('node:crypto');
const { fail, isId } = require('../security.cjs');
const { signature } = require('./actions.cjs');
const documents = require('./documents.cjs');
const actions = require('./actions.cjs');
const TYPES = Object.freeze(['chats', 'notes', 'meetings', 'projects', 'documents', 'tasks', 'reports']);
const SCAN_LIMIT = 1000;
const STOP = Symbol('bounded source scan');
const value = v => typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '';
const inactive = row => row.archived === true || row.temporary === true || row.deleted === true;
const clinical = row => row.clinical === true || !!row.residentId || !!row.residentName || !!row.sbarId ||
  ['clinical', 'resident', 'sbar'].includes(row.category) || ['clinical', 'sbar'].includes(row.source) ||
  /^MD Callback Follow-Up:|^\[(?:SBAR|Clinical)\]/i.test(value(row.title));
const updated = row => [row.updatedAt, row.updated, row.completed, row.createdAt, row.created, row.date]
  .find(v => typeof v === 'number' && Number.isFinite(v)) ?? null;

function search(core, data = {}) {
  if (core.locked) throw fail('LOCKED');
  core.assertUnlocked();
  if (!data || typeof data !== 'object' || Array.isArray(data) ||
      Object.keys(data).some(k => !['query', 'types', 'projectId', 'includeClinical', 'limit'].includes(k))) throw fail('INVALID');
  if (typeof data.query !== 'string' || data.query.length > 200 || !data.query.trim()) throw fail('INVALID');
  const query = data.query.trim(), terms = query.toLowerCase().split(/\s+/);
  const types = data.types ?? [...TYPES], limit = data.limit ?? 50;
  if (!Array.isArray(types) || !types.length || types.length > TYPES.length || new Set(types).size !== types.length ||
      types.some(t => !TYPES.includes(t)) || !Number.isSafeInteger(limit) || limit < 1 || limit > 50 ||
      data.includeClinical !== undefined && typeof data.includeClinical !== 'boolean') throw fail('INVALID');
  const snf = require('../snf/demo.cjs').forCore(core).current();
  if (core.developmentMode || snf?.demoMode || core.executiveDemo) throw fail('POLICY');
  const includeClinical = data.includeClinical === true;
  if (includeClinical && (core.settings().snfEnabled === false || !snf?.store)) throw fail('POLICY');
  const store = core.store, projectId = data.projectId || null;
  if (data.projectId !== undefined && data.projectId !== null && (typeof data.projectId !== 'string' || !isId(data.projectId))) throw fail('INVALID');
  const project = projectId ? store.get('project', projectId) : null;
  if (projectId && (!project || inactive(project))) throw fail('NOT_FOUND');
  const projectFiles = project ? new Set(Array.isArray(project.fileIds) ? project.fileIds : []) : null;
  const inProject = row => !projectId || row.projectId === projectId || row.project === projectId;
  const expiry = store.db?.prepare('SELECT expires FROM records WHERE kind=? AND id=?');
  const expired = (kind, id) => { const at = expiry?.get(kind, id)?.expires; return typeof at === 'number' && at <= Date.now(); };
  const results = [], countsByType = Object.fromEntries([...types, ...(includeClinical ? ['clinical'] : [])].map(type => [type, 0])), sources = [];
  let totalMatches = 0, countsExact = true;
  const assertActive = () => {
    if (core.locked) throw fail('LOCKED');
    core.assertUnlocked();
    if (core.developmentMode || require('../snf/demo.cjs').forCore(core).current() !== snf || snf?.demoMode ||
        includeClinical && core.settings().snfEnabled === false) throw fail('POLICY');
  };
  const order = (a, b) => (b.updated ?? 0) - (a.updated ?? 0) || a.type.localeCompare(b.type) || a.sourceId.localeCompare(b.sourceId);
  const retain = result => {
    assertActive();
    totalMatches++; countsByType[result.type] = (countsByType[result.type] || 0) + 1;
    results.push(result); results.sort(order); if (results.length > limit) results.pop();
  };
  const matchFields = fields => {
    let matched = null;
    const digest = crypto.createHash('sha256');
    for (const [field, raw] of fields) {
      const text = value(raw); digest.update(field).update('\0').update(text).update('\0');
      if (!matched && terms.every(term => text.toLowerCase().includes(term))) {
        const at = Math.max(0, text.toLowerCase().indexOf(terms[0]) - 100);
        matched = { field, excerpt: text.slice(at, at + 400), start: at, end: Math.min(text.length, at + 400) };
      }
    }
    return { matched, contentRevision: digest.digest('hex') };
  };
  const add = (type, kind, row, fields, route, revision) => {
    if (inactive(row) || expired(kind, row.id) || !inProject(row) || !includeClinical && clinical(row)) return;
    const { matched, contentRevision } = matchFields(fields);
    if (!matched) return;
    retain({ type, sourceKind: kind, sourceId: row.id, revision: revision || signature({ id: row.id, contentRevision, updated: updated(row) }),
      title: value(row.title || row.name || row.subject || row.employeeName || kind).slice(0, 200), updated: updated(row),
      excerpt: matched.excerpt, sourceField: matched.field, start: matched.start, end: matched.end,
      route: { ...route, sourceId: row.id }, clinical: clinical(row) || type === 'clinical', reviewRequired: true });
  };
  const scan = (kind, type, visit) => {
    let scanned = 0;
    const coverage = { kind, type, availableRecords: store.count(kind), scannedRecords: 0, complete: true, recordLimit: SCAN_LIMIT };
    sources.push(coverage);
    try {
      // Store.project iterates/decrypts one source at a time. Retain no original
      // records in its returned array; only the shared bounded results survive.
      store.project(kind, row => {
        if (scanned >= SCAN_LIMIT) throw STOP;
        scanned++; assertActive(); visit(row); return null;
      });
    } catch (error) { if (error !== STOP) throw error; coverage.complete = false; countsExact = false; }
    coverage.scannedRecords = scanned;
  };
  const chatMeta = new Map(store.summaries('chat').map(row => [row.id, row]));
  const ownerEligibility = new Map();
  const eligibleChat = id => {
    if (ownerEligibility.has(id)) return ownerEligibility.get(id);
    const meta = chatMeta.get(id);
    if (!meta || inactive(meta) || expired('chat', id)) return false;
    const row = store.get('chat', id), allowed = !!row && !inactive(row);
    ownerEligibility.set(id, allowed); return allowed;
  };
  if (types.includes('chats')) {
    let scanned = 0;
    const metas = [...chatMeta.values()].filter(row => !inactive(row) && inProject(row) && !expired('chat', row.id));
    sources.push({ kind: 'chat', type: 'chats', availableRecords: metas.length, scannedRecords: Math.min(metas.length, SCAN_LIMIT), complete: metas.length <= SCAN_LIMIT, recordLimit: SCAN_LIMIT });
    if (metas.length > SCAN_LIMIT) countsExact = false;
    for (const meta of metas) {
      if (scanned++ >= SCAN_LIMIT) break;
      assertActive(); const chat = store.get('chat', meta.id); if (!chat) continue;
      ownerEligibility.set(chat.id, !inactive(chat));
      function* fields() { yield ['title', chat.title]; for (let i = 0; i < (chat.messages || []).length; i++) yield ['messages.' + i + '.text', chat.messages[i].text]; }
      add('chats', 'chat', chat, fields(), { view: 'chat', chatId: chat.id });
    }
  }
  if (types.includes('projects')) scan('project', 'projects', row => {
    if (projectId && row.id !== projectId) return;
    add('projects', 'project', { ...row, projectId: row.id }, [['name', row.name], ['instructions', row.instructions]], { view: 'projects', projectId: row.id });
  });
  if (types.includes('notes')) {
    scan('capture_note', 'notes', row => add('notes', 'capture_note', row,
      [['text', row.text], ['location', row.location], ['assistantDraft.text', row.assistantDraft?.status === 'ready' ? row.assistantDraft.text : '']],
      { view: 'captures', captureId: row.id }));
    scan('capture_draft', 'notes', row => {
      const parent = row.captureId && store.get('capture_note', row.captureId);
      if (!parent || inactive(parent) || expired('capture_note', parent.id) || !inProject(parent) ||
          !includeClinical && clinical(parent) || !parent.draftIds?.includes(row.id)) return;
      add('notes', 'capture_draft', { ...row, projectId: parent.projectId || parent.project || null }, [['subject', row.subject], ['body', row.body]],
        { view: 'captures', captureId: parent.id, draftId: row.id });
    });
  }
  if (types.includes('meetings')) scan('meeting', 'meetings', row => {
    function* fields() {
      yield ['title', row.title]; yield ['summary', row.summary];
      yield ['assistantDraft.text', row.assistantDraft?.status === 'ready' ? row.assistantDraft.text : ''];
      for (let i = 0; i < (row.transcript || []).length; i++) yield ['transcript.' + i + '.text', row.transcript[i].text];
    }
    add('meetings', 'meeting', row, fields(), { view: 'meetings', meetingId: row.id });
  });
  if (types.includes('documents')) {
    const metas = store.summaries('file').filter(row => !inactive(row) && (!projectFiles || projectFiles.has(row.id)) &&
      !expired('file', row.id) && (!row.ownerChat || eligibleChat(row.ownerChat)));
    sources.push({ kind: 'file', type: 'documents', availableRecords: metas.length, scannedRecords: Math.min(metas.length, SCAN_LIMIT), complete: metas.length <= SCAN_LIMIT, recordLimit: SCAN_LIMIT });
    if (metas.length > SCAN_LIMIT) countsExact = false;
    for (const meta of metas.slice(0, SCAN_LIMIT)) {
      assertActive();
      const selected = Object.create(core);
      selected.store = { summaries: () => [meta], get: (kind, id) => {
        const row = store.get(kind, id);
        return row && !inactive(row) && (includeClinical || !clinical(row)) ? row : null;
      } };
      const found = documents.search(selected, { query, fileId: meta.id });
      const filenameMatch = matchFields([['name', meta.name]]).matched;
      if (!found.totalMatches && filenameMatch && found.coverage.length) {
        retain({ type: 'documents', sourceKind: 'file', sourceId: meta.id,
          revision: signature({ name: meta.name, updated: meta.updated, size: meta.size }),
          title: value(meta.name).slice(0, 200), updated: updated(meta), excerpt: filenameMatch.excerpt,
          sourceField: 'name', start: filenameMatch.start, end: filenameMatch.end, sectionId: null, page: null,
          citation: 'Saved filename match; extracted text did not match.',
          route: { view: 'workspace', sourceId: meta.id, fileId: meta.id }, reviewRequired: true });
      }
      // Existing word search counts all section matches while retaining 50.
      totalMatches += found.totalMatches;
      countsByType.documents = (countsByType.documents || 0) + found.totalMatches;
      for (const section of found.results) {
        const { matched } = matchFields([['text', section.text]]);
        if (!matched) continue;
        results.push({ type: 'documents', sourceKind: 'file', sourceId: section.fileId, revision: section.revision,
          title: value(section.name).slice(0, 200), updated: section.updated ?? null, excerpt: matched.excerpt,
          sourceField: 'text', start: section.start + matched.start, end: section.start + matched.end,
          sectionId: section.id, page: section.page, citation: section.citation,
          route: { view: 'workspace', sourceId: section.fileId, fileId: section.fileId, sectionId: section.id }, reviewRequired: true });
        results.sort(order); if (results.length > limit) results.pop();
      }
    }
  }
  if (types.includes('tasks')) scan('todo', 'tasks', row => {
    const meta = store.get('wf_action_meta', 'todo:' + row.id) || {};
    if (inactive(row) || !inProject(row) || !includeClinical && (clinical(row) || clinical(meta))) return;
    // Reuse the canonical workflow queue/revision for this one todo. Meeting
    // suggestions stay in their meeting until converted; no action duplication.
    const selected = Object.create(snf || {});
    selected.store = { list: kind => kind === 'todo' ? [row] : [], get: (kind, id) => store.get(kind, id) };
    selected.alertVisible = () => false;
    const task = actions.queue(core, selected, { includeClosed: true })[0];
    if (!task) return;
    add('tasks', 'todo', row, [['title', task.title], ['description', row.description], ['owner', task.owner], ['note', task.note]],
      { view: 'dashboard', taskId: row.id, key: task.key }, task.revision);
  });
  if (types.includes('reports')) scan('job', 'reports', row => add('reports', 'job', row,
    [['title', row.title], ['reason', row.reason], ['resultText', row.status === 'failed' ? row.resultText : ''],
      ['savedAnswer.text', row.status === 'failed' ? row.savedAnswer?.text : '']], { view: 'automation', jobId: row.id }));
  if (includeClinical) {
    scan('snf_resident', 'clinical', row => add('clinical', 'snf_resident', row, [['name', row.name], ['room', row.room], ['unit', row.unit]], { view: 'snf', residentId: row.id }));
    scan('snf_alert', 'clinical', row => {
      if (!snf.alertVisible(row)) return;
      add('clinical', 'snf_alert', row, [['title', row.title], ['message', row.message], ['residentName', row.residentName], ['code', row.code]],
        { view: 'snf', alertId: row.id, residentId: row.residentId || null });
    });
    scan('sbar', 'clinical', row => add('clinical', 'sbar', row, [['residentName', row.residentName], ['situation.concern', row.situation?.concern],
      ['situation.immediateObservations', row.situation?.immediateObservations]], { view: 'operations', tab: 'sbar', sbarId: row.id }));
  }
  assertActive();
  return { query, types, projectId, includeClinical, results, totalMatches, countsByType, countsExact,
    truncated: totalMatches > results.length || !countsExact,
    coverage: { sources, clinical: { requested: includeClinical, searched: includeClinical, sourceAvailability: 'unknown', freshness: 'unknown' },
      recordLimitPerSource: SCAN_LIMIT, excerptLimit: 400,
      notice: 'Counts cover scanned saved items and extracted document sections. When a source scan limit is reached, totals are lower bounds. Clinical live-feed freshness and completeness are unknown.' },
    notice: 'Local word search of saved text only; no cloud or filesystem search. Archived/temporary/deleted sources, attachment bytes, credentials and pairing records are excluded. Reports cover saved job metadata and retained failed drafts; import completed exports into Library to search their text. Operational canonical todos are searched once; unconverted meeting actions remain in their meeting. Source matches are not factual verification.' };
}
module.exports = { search, TYPES, SCAN_LIMIT };
