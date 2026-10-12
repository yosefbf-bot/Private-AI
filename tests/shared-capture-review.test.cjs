'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { fixture } = require('./helpers.cjs');
const captures = require('../source/capture-workflows.cjs');
const { MessagingBridge } = require('../source/messaging.cjs');
const { WhatsAppAccount } = require('../source/whatsapp-account.cjs');
const { CompanionGateway } = require('../source/companion-gateway.cjs');
const { testCertificate, freePort, request } = require('./companion-fixture.cjs');
const https = require('node:https');

test('retention preserves current and legacy uncertain delivery claims while follow-ups remain pending', async t => {
  const { core } = fixture(t);
  const bridge = new MessagingBridge(core);
  t.after(() => bridge.close());
  const target = { adapter: 'web', groupId: '123456789@g.us', groupName: 'SYNTHETIC selected conversation' };
  const sender = '123456789@c.us';
  core.store.put('messaging', 'settings', {
    enabled: true, adapter: 'web', allowTasks: true, warningAccepted: true,
    disableAllWriting: false,
    conversations: [{ ...target, mode: 'read-write', backgroundReplies: true, senders: [sender] }]
  });
  const actor = bridge.actor(target, sender);
  const records = [];
  for (const legacy of [false, true]) {
    const result = captures.create(core, { sourceId: legacy ? 'synthetic-legacy-delivery' : 'synthetic-current-delivery', text: 'SYNTHETIC reminder to contact the reviewer', kind: 'reminder', dueAt: Date.now() - 1000 }, actor);
    core.store.put('capture_whatsapp_route', result.capture.id, { id: result.capture.id, actorKey: captures.actorKey(actor), ...target, sender });
    const notice = captures.notifications(core, actor).notifications.find(n => n.actionId === result.actions[0].id);
    const delivery = { id: notice.id, status: legacy ? 'sending' : 'uncertain', channel: 'whatsapp', at: Date.now(), ...(legacy ? {} : { captureId: result.capture.id, actionId: notice.actionId }) };
    core.store.put('capture_delivery', notice.id, delivery);
    records.push({ result, notice, delivery });
  }
  core.store.cleanup(100, Date.now() + 101 * 86400000);
  for (const { result, notice, delivery } of records) {
    assert.ok(core.store.get('capture_note', result.capture.id));
    assert.ok(core.store.get('wf_action_meta', 'todo:' + result.actions[0].id));
    assert.equal(core.store.get('capture_notification', notice.id).status, 'pending');
    assert.equal(core.store.get('capture_delivery', notice.id).status, delivery.status);
  }
  let sent = 0;
  await bridge.reminders({ send: async () => { sent++; } });
  assert.equal(sent, 0, 'Cleanup must not turn an uncertain or interrupted send into a fresh delivery');
});

test('another paired actor cannot read evidence, edit actions, or prepare drafts for an owned capture', t => {
  const { core } = fixture(t);
  const owner = { kind: 'companion', id: crypto.randomUUID() };
  const other = { kind: 'companion', id: crypto.randomUUID() };
  const bytes = Buffer.from('SYNTHETIC source evidence');
  const evidence = captures.writeEvidence(core, {
    uploadId: crypto.randomUUID(), index: 0, total: 1, name: 'synthetic-evidence.txt', mime: 'text/plain',
    bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), data: bytes.toString('base64')
  }, owner);
  const result = captures.create(core, { sourceId: 'synthetic-owned-note', text: 'SYNTHETIC review follow-up', evidenceIds: [evidence.evidenceId] }, owner);
  assert.equal(captures.list(core, other).captures.length, 0);
  assert.throws(() => captures.readEvidence(core, { id: evidence.evidenceId }, other), { code: 'NOT_FOUND' });
  assert.throws(() => captures.create(core, { sourceId: 'synthetic-foreign-evidence', text: 'SYNTHETIC unauthorized link', evidenceIds: [evidence.evidenceId] }, other), { code: 'INVALID' });
  assert.throws(() => captures.update(core, { id: result.actions[0].id, revision: result.actions[0].revision, owner: 'SYNTHETIC foreign reviewer' }, other), { code: 'NOT_FOUND' });
  assert.throws(() => captures.saveDraft(core, { captureId: result.capture.id, channel: 'outlook', body: 'SYNTHETIC unauthorized draft' }, other), { code: 'NOT_FOUND' });
  assert.equal(core.store.get('todo', result.actions[0].id).owner, '');
});

test('Action Center edits invalidate a previously fetched companion review revision', t => {
  const { core } = fixture(t);
  const actor = { kind: 'companion', id: crypto.randomUUID() };
  const result = captures.create(core, { sourceId: 'synthetic-stale-review', text: 'SYNTHETIC review follow-up' }, actor);
  core.saveTodo({ id: result.actions[0].id, owner: 'SYNTHETIC desktop reviewer' });
  assert.throws(() => captures.update(core, { id: result.actions[0].id, revision: result.actions[0].revision, owner: 'SYNTHETIC stale reviewer' }, actor), { code: 'REVIEW_CHANGED' });
  assert.equal(core.store.get('todo', result.actions[0].id).owner, 'SYNTHETIC desktop reviewer');
});

test('existing reminders obey global and per-action controls and changed deadlines', t => {
  const { core } = fixture(t);
  const actor = { kind: 'companion', id: crypto.randomUUID() };
  const created = captures.create(core, { sourceId: 'synthetic-reminder-controls', text: 'SYNTHETIC follow-up review', dueAt: Date.now() - 1000 }, actor);
  const notice = captures.notifications(core, actor).notifications[0];
  core.saveSettings({ autoReminders: false });
  assert.equal(captures.notifications(core, actor).notifications.length, 0);
  core.saveTodo({ id: created.actions[0].id, reminderEnabled: false });
  core.saveSettings({ autoReminders: true });
  assert.equal(captures.notifications(core, actor).notifications.length, 0);
  core.saveTodo({ id: created.actions[0].id, reminderEnabled: true });
  assert.equal(captures.notifications(core, actor).notifications[0].id, notice.id);
  core.saveTodo({ id: created.actions[0].id, dueAt: Date.now() + 3600000 });
  assert.equal(captures.notifications(core, actor).notifications.length, 0);
  captures.acknowledge(core, { id: notice.id }, actor);
  assert.equal(core.store.get('todo', created.actions[0].id).status, 'pending', 'Acknowledging old delivery never completes current work');
  core.saveTodo({ id: created.actions[0].id, dueAt: Date.now() - 2000 });
  const next = captures.notifications(core, actor).notifications;
  assert.equal(next.length, 1);
  assert.notEqual(next[0].id, notice.id);
  assert.equal(next[0].status, 'pending');
});

test('acknowledged reminder pages cannot starve older pending work', t => {
  const { core } = fixture(t);
  const actor = { kind: 'companion', id: crypto.randomUUID() };
  const dueAt = Date.now() - 1000;
  for (let i = 0; i < 101; i++) captures.create(core, { sourceId: 'synthetic-reminder-page-' + i, text: 'SYNTHETIC follow-up review ' + i, dueAt }, actor);
  const first = captures.notifications(core, actor);
  assert.equal(first.notifications.length, 100);
  assert.equal(first.truncated, true);
  for (const notice of first.notifications) captures.acknowledge(core, { id: notice.id }, actor);
  const second = captures.notifications(core, actor);
  assert.equal(second.notifications.filter(n => n.status === 'pending').length, 1);
  assert.equal(second.notifications[0].status, 'pending', 'Pending delivery precedes recently acknowledged records');
  assert.ok(!first.notifications.some(n => n.id === second.notifications[0].id));
});

test('review edits preserve disabled reminders and the first explicit deadline enables an unknown reminder', t => {
  const { core } = fixture(t);
  const actor = { kind: 'companion', id: crypto.randomUUID() };
  const created = captures.create(core, { sourceId: 'synthetic-disabled-review', text: 'SYNTHETIC follow-up review', dueAt: Date.now() - 1000 }, actor);
  core.saveTodo({ id: created.actions[0].id, reminderEnabled: false });
  let item = captures.list(core, actor).actions[0];
  item = captures.update(core, { id: item.id, revision: item.revision, owner: 'SYNTHETIC reviewer', note: 'Reviewed the source.' }, actor);
  assert.equal(core.store.get('todo', item.id).reminderEnabled, false);
  item = captures.update(core, { id: item.id, revision: item.revision, dueAt: Date.now() - 2000, note: 'Corrected the deadline.' }, actor);
  assert.equal(core.store.get('todo', item.id).reminderEnabled, false);
  assert.equal(captures.notifications(core, actor).notifications.length, 0);
  const unknown = captures.create(core, { sourceId: 'synthetic-first-deadline', text: 'SYNTHETIC follow-up without a deadline' }, actor).actions[0];
  assert.equal(core.store.get('todo', unknown.id).reminderEnabled, false);
  captures.update(core, { id: unknown.id, revision: unknown.revision, dueAt: Date.now() - 1000, note: 'Confirmed first deadline.' }, actor);
  assert.equal(core.store.get('todo', unknown.id).reminderEnabled, true);
  assert.equal(captures.notifications(core, actor).notifications.length, 1);
});

test('capture deadlines reject unrepresentable dates without changing source or canonical follow-ups', t => {
  const { core } = fixture(t);
  const actor = { kind: 'companion', id: crypto.randomUUID() };
  assert.throws(() => captures.create(core, { sourceId: 'synthetic-invalid-date', text: 'SYNTHETIC follow-up', dueAt: Number.MAX_SAFE_INTEGER }, actor), { code: 'INVALID' });
  assert.equal(core.store.count('capture_note'), 0);
  assert.equal(core.store.count('todo'), 0);
  const item = captures.create(core, { sourceId: 'synthetic-valid-date', text: 'SYNTHETIC follow-up', dueAt: Date.now() + 3600000 }, actor).actions[0];
  assert.throws(() => captures.update(core, { id: item.id, revision: item.revision, dueAt: Number.MAX_SAFE_INTEGER }, actor), { code: 'INVALID' });
  assert.equal(core.store.get('todo', item.id).dueAt, item.dueAt);
  assert.doesNotThrow(() => new Date(item.dueAt).toISOString());
});

test('locked WhatsApp due reminders queue once and require foreground approval even with old background grants', async t => {
  const { core } = fixture(t);
  const bridge = new MessagingBridge(core);
  t.after(() => bridge.close());
  const target = { adapter: 'web', groupId: '123456789@g.us', groupName: 'SYNTHETIC selected conversation', mode: 'commands', backgroundReplies: true, senders: ['123456789@c.us'] };
  bridge.verified.add(JSON.stringify(['web', target.groupId, target.groupName]));
  bridge.save({ enabled: true, warningAccepted: true, allowTasks: true, readAll: false, conversations: [target] });
  const account = new WhatsAppAccount(core), messages = [];
  account.state = 'connected';
  account.client = {
    getChatById: async id => ({ id, name: target.groupName, fetchMessages: async () => [] }),
    sendMessage: async (id, body) => { messages.push(body); return { id: 'synthetic-sent-' + messages.length, fromMe: true, to: id, body }; }
  };
  bridge.adapters.web = account;
  const capture = await bridge.captureCommand(account, { ...bridge.settings(), ...target, generation: bridge.generation }, { id: 'synthetic-locked-reminder', sender: target.senders[0], time: Date.now() }, '/remind 2026-01-01T09:00:00Z SYNTHETIC due follow-up');
  assert.match(capture, /Saved note/);
  core.locked = true;
  await bridge.tick();
  assert.equal(messages.length, 0, 'Locked sends remain off by default');
  core.locked = false;
  bridge.save({ allowWhileLocked: true, conversations: [{ ...target, backgroundReplies: false }] });
  core.locked = true;
  await bridge.tick();
  assert.equal(messages.length, 0, 'The lock opt-in does not grant background conversation writes');
  core.locked = false;
  core.locked = true;
  await bridge.tick();
  assert.equal(messages.length, 0);
  assert.equal(core.store.list('messageOut').length, 1);
  assert.throws(() => core.summary(), {code:'LOCKED'});
  core.locked = false;core.resources.approve = async () => true;
  await bridge.approve(bridge.outbox()[0].id);
  assert.equal(messages.length, 1);
  assert.match(messages[0], /saved follow-up is due/);
  assert.doesNotMatch(messages[0], /SYNTHETIC due follow-up/);
  assert.equal(core.store.list('capture_delivery')[0].status, 'sent');
  core.locked = true;assert.throws(() => core.summary(), { code: 'LOCKED' }, 'General desktop access remains locked');
  await bridge.tick();
  assert.equal(messages.length, 1, 'Confirmed reminders are not repeated');
});

test('draft bounds reject additional records while allowing existing drafts to be revised', t => {
  const { core } = fixture(t);
  const actor = { kind: 'companion', id: crypto.randomUUID() };
  const created = captures.create(core, { sourceId: 'synthetic-draft-bound', text: 'SYNTHETIC follow-up review' }, actor);
  const drafts = Array.from({ length: 6 }, (_, index) => captures.saveDraft(core, { id: crypto.randomUUID(), captureId: created.capture.id, channel: index % 2 ? 'outlook' : 'whatsapp', body: 'SYNTHETIC draft ' + index }, actor));
  assert.throws(() => captures.saveDraft(core, { id: crypto.randomUUID(), captureId: created.capture.id, channel: 'outlook', body: 'SYNTHETIC excess draft' }, actor), { code: 'LIMIT' });
  const updated = captures.saveDraft(core, { id: drafts[0].id, revision: drafts[0].revision, captureId: created.capture.id, channel: drafts[0].channel, body: 'SYNTHETIC revised draft' }, actor);
  assert.equal(updated.revision, 2);
  assert.equal(core.store.count('capture_draft'), 6);
  assert.equal(core.store.get('capture_note', created.capture.id).draftIds.length, 6);
});

test('WhatsApp media requires an approved sender, exact conversation, bounded size and current policy', async t => {
  const { core, calls } = fixture(t);
  const bridge = new MessagingBridge(core);
  t.after(() => bridge.close());
  const selected = { adapter: 'web', groupId: '123456789@g.us', groupName: 'SYNTHETIC approved group', senders: ['123456789@c.us'], mode: 'read-write', backgroundReplies: true };
  bridge.verified.add(JSON.stringify([selected.adapter, selected.groupId, selected.groupName]));
  bridge.save({ enabled: true, warningAccepted: true, allowTasks: true, conversations: [selected] });
  const account = new WhatsAppAccount(core);
  bridge.adapters.web = account;
  account.state = 'connected';
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2dr8AAAAASUVORK5CYII=', 'base64');
  let downloaded = 0;
  let lookups = 0;
  const raw = { id: { _serialized: 'synthetic-photo' }, from: selected.groupId, author: selected.senders[0], fromMe: false, body: '/round SYNTHETIC inspection observation', timestamp: Math.floor(Date.now() / 1000), type: 'image', hasMedia: true, _data: { size: png.length }, downloadMedia: async () => { downloaded++; return { mimetype: 'image/png', data: png.toString('base64') }; } };
  account.client = { getMessageById: async () => { lookups++; return raw; }, destroy: async () => {} };
  const target = { ...bridge.settings(), ...selected, generation: bridge.generation, sender: selected.senders[0] };
  await assert.rejects(account.readMedia({ ...target, sender: '987654321@c.us' }, 'synthetic-photo'), { code: 'POLICY' });
  assert.equal(lookups, 0, 'Unapproved actors cannot start media lookup');
  raw.from = '987654321@g.us';
  await assert.rejects(account.readMedia(target, 'synthetic-photo'), { code: 'MESSAGING' });
  raw.from = selected.groupId;
  raw._data.size = undefined;
  await assert.rejects(account.readMedia(target, 'synthetic-photo'), { code: 'LIMIT' });
  assert.equal(downloaded, 0);
  raw._data.size = png.length;
  const message = { id: 'synthetic-photo', sender: selected.senders[0], hasMedia: true, time: Date.now() };
  const reply = await bridge.captureCommand(account, target, message, '/round SYNTHETIC inspection observation');
  assert.match(reply, /Attachment preserved as evidence/);
  assert.equal(core.store.count('capture_note'), 1);
  assert.equal(core.store.count('capture_evidence'), 1);
  assert.equal(calls.length, 0, 'Preserving photo evidence does not imply AI image interpretation');
  raw.downloadMedia = async () => { bridge.save({ disableAllWriting: true }); return { mimetype: 'image/png', data: png.toString('base64') }; };
  await assert.rejects(account.readMedia(target, 'synthetic-photo'), { code: 'POLICY' });
  assert.equal(core.store.count('capture_evidence'), 1, 'Revocation prevents additional evidence persistence');
});

test('locked notification-only access remains device-scoped and rejects revocation during an acknowledgment body', async t => {
  const { core } = fixture(t);
  const gateway = new CompanionGateway(core, { certificateFactory: testCertificate });
  t.after(() => gateway.close());
  await gateway.configure({ enabled: true, host: '127.0.0.1', port: await freePort() });
  const first = gateway.pair({ name: 'SYNTHETIC first phone', scopes: { workflow: true, notifications: true }, notificationsWhileLocked: true });
  const other = gateway.pair({ name: 'SYNTHETIC other phone', scopes: { workflow: true, notifications: true }, notificationsWhileLocked: true });
  const actor = { kind: 'companion', id: first.id };
  const created = captures.create(core, { sourceId: 'synthetic-locked-notice', text: 'SYNTHETIC private inspection detail', dueAt: Date.now() - 1000 }, actor);
  const notice = captures.notifications(core, actor).notifications[0];
  const restricted = { ...first, key: first.notificationKey };
  const foreign = { ...other, key: other.notificationKey };
  core.lock();
  assert.equal((await request(gateway, foreign, '/notifications')).body.notifications.length, 0);
  assert.equal((await request(gateway, foreign, '/notifications/ack', { id: notice.id })).status, 404);
  assert.equal((await request(gateway, restricted, '/actions')).status, 403);
  assert.equal((await request(gateway, first, '/notifications')).status, 423);
  const metadata = await request(gateway, restricted, '/notifications');
  assert.equal(metadata.status, 200);
  assert.equal(metadata.body.notifications[0].id, notice.id);
  assert.doesNotMatch(JSON.stringify(metadata.body), /inspection|private|detail|title|text/);
  assert.throws(() => core.summary(), { code: 'LOCKED' });

  let authenticateStarted;
  const started = new Promise(resolve => { authenticateStarted = resolve; });
  const authenticate = gateway.authenticate.bind(gateway);
  gateway.authenticate = req => { const value = authenticate(req); authenticateStarted(); return value; };
  const body = JSON.stringify({ id: notice.id });
  const settings = gateway.settings();
  const certificate = new crypto.X509Certificate(Buffer.from(first.certificate, 'base64')).toString();
  let upload;
  const response = new Promise((resolve, reject) => {
    upload = https.request({ host: settings.host, port: settings.port, path: '/mobile/api/v1/notifications/ack', method: 'POST', ca: certificate, agent: false, headers: { 'X-Pair-Key': first.notificationKey, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    upload.on('error', reject);
    upload.write(body.slice(0, -1));
  });
  await started;
  const device = core.store.get('companion_device', first.id);
  core.store.put('companion_device', first.id, { ...device, notificationKeyHash: crypto.randomBytes(32).toString('hex') });
  upload.end(body.slice(-1));
  assert.equal(await response, 403);
  assert.equal(core.store.get('capture_notification', notice.id).status, 'pending');
  assert.equal(core.store.get('todo', created.actions[0].id).status, 'pending');
  assert.throws(() => core.summary(), { code: 'LOCKED' });
});
