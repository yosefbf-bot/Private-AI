'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  OperationsCopilotEngine,
  MEETING_TEMPLATES,
  CLINICAL_ENTITIES_PATTERNS,
  dispatch
} = require('../source/operations-copilot.cjs');
const devPolicy = require('../server/development-policy.cjs');

// Mock Core for testing operations-copilot engine
function createMockCore() {
  const storeMap = new Map();
  const todos = [];

  const store = {
    transaction(fn) { return fn(); },
    summaries(kind) { return this.list(kind); },
    // Unrelated operations tests use an in-memory store; real encrypted
    // aggregate invalidation/snapshot behavior is covered by Batch 1 tests.
    aggregate(kind,build) { return build(this.list(kind).map(({rows,...header})=>({...header,rowCount:rows.length,snapshotKeys:[...new Set(rows.map(r=>JSON.stringify([r.date,r.unit])))]}))); },
    project(kind, fn) { return this.list(kind).map(fn); },
    list(kind) {
      const items = [];
      for (const [k, v] of storeMap.entries()) {
        if (k.startsWith(`${kind}:`)) items.push(v);
      }
      return items;
    },
    get(kind, id) {
      return storeMap.get(`${kind}:${id}`) || null;
    },
    put(kind, id, val) {
      storeMap.set(`${kind}:${id}`, JSON.parse(JSON.stringify(val)));
      return val;
    },
    delete(kind, id) {
      storeMap.delete(`${kind}:${id}`);
      return true;
    }
  };

  const core = {
    store,
    assertUnlocked() {},
    saveTodo(input) {
      const t = {
        id: `todo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: input.title,
        description: input.description,
        priority: input.priority || 'normal',
        dueAt: input.dueAt,
        status: 'pending',
        createdAt: Date.now()
      };
      todos.push(t);
      store.put('todo', t.id, t);
      return t;
    },
    snf: {
      getAlertSummary() {
        return { critical: 1, high: 2, total: 3 };
      }
    }
  };

  return { core, storeMap, todos };
}

test('Operations Intelligence & Meeting Copilot Module Suite', async (t) => {
  await t.test('Meeting Templates define standard agendas and attendees', () => {
    assert.ok(MEETING_TEMPLATES.morning_huddle, 'morning_huddle template must exist');
    assert.ok(MEETING_TEMPLATES.clinical_idt, 'clinical_idt template must exist');
    assert.ok(MEETING_TEMPLATES.shift_handoff, 'shift_handoff template must exist');
    assert.ok(MEETING_TEMPLATES.safety_qaa, 'safety_qaa template must exist');

    assert.ok(Array.isArray(MEETING_TEMPLATES.morning_huddle.agenda), 'Agenda must be an array');
    assert.ok(MEETING_TEMPLATES.morning_huddle.agenda.length >= 4, 'Must have at least 4 agenda items');
    assert.ok(Array.isArray(MEETING_TEMPLATES.morning_huddle.defaultAttendees), 'Default attendees must be an array');
  });

  await t.test('Clinical Entities Patterns detect key clinical risk phrases', () => {
    const testCases = [
      { text: 'Resident in Rm 102 had an unwitnessed fall out of bed.', expectedCat: 'fall' },
      { text: 'Noticed a new unstageable pressure ulcer on sacrum with slough.', expectedCat: 'wound' },
      { text: 'Physician ordered a dose reduction for Seroquel 25mg at bedtime.', expectedCat: 'psychotropic' },
      { text: 'Urine culture came back positive for UTI; starting Rocephin IV.', expectedCat: 'infection' },
      { text: 'Vitals showed acute hypotension with O2 sat 86%; 911 ER transfer called.', expectedCat: 'vitals' }
    ];

    for (const tc of testCases) {
      const match = CLINICAL_ENTITIES_PATTERNS.find(p => p.regex.test(tc.text));
      assert.ok(match, `Should match clinical entity in: "${tc.text}"`);
      assert.equal(match.category, tc.expectedCat, `Category should match ${tc.expectedCat}`);
    }
  });

  await t.test('OperationsCopilotEngine calculates summary and metrics', () => {
    const { core } = createMockCore();
    // Seed some test alerts
    core.store.put('snf_alert', 'alert_1', {
      id: 'alert_1',
      code: 'FALL_INCIDENT',
      severity: 'critical',
      status: 'new',
      message: 'Unwitnessed fall in bathroom',
      firstDetected: Date.now() - 3600000
    });
    core.store.put('snf_alert', 'alert_2', {
      id: 'alert_2',
      code: 'WOUND_PRESSURE',
      severity: 'high',
      status: 'new',
      message: 'Stage 3 pressure ulcer left heel',
      firstDetected: Date.now() - 7200000
    });

    const engine = new OperationsCopilotEngine(core);
    const summary = engine.getOperationsSummary();

    assert.ok(summary.census, 'Summary must have census');
    assert.equal(summary.census.totalBeds, null);
    assert.equal(summary.census.occupancyRate, null);
    assert.equal(summary.census.activeResidents, null);
    assert.equal(summary.surveillance.criticalAlertsCount, 1);
    assert.equal(summary.surveillance.highAlertsCount, 1);
    assert.equal(summary.surveillance.fallAlerts24h, 1);
    assert.ok(summary.staffing, 'Summary must have staffing metrics');
    assert.equal(summary.staffing.rnCompliant, null);
    assert.deepEqual(summary.surveyRadar, [], 'Must not fabricate validated survey scores');
  });

  await t.test('OperationsCopilotEngine generates a scannable Morning Huddle Brief', () => {
    const { core } = createMockCore();
    core.store.put('snf_alert', 'alert_crit', {
      id: 'alert_crit',
      code: 'ACUTE_TRANSFER',
      residentName: 'John Doe',
      residentRoom: '204-B',
      severity: 'critical',
      status: 'new',
      message: 'Resident transferred to emergency department due to acute respiratory distress'
    });

    const engine = new OperationsCopilotEngine(core);
    const brief = engine.generateMorningHuddleBrief();

    assert.ok(brief.text, 'Brief must have text');
    assert.match(brief.text, /MORNING STANDUP & INTERDISCIPLINARY HUDDLE BRIEFING/);
    assert.match(brief.text, /FACILITY CENSUS & CAPACITY/);
    assert.match(brief.text, /RECORDED FOLLOW-UPS/);
    assert.match(brief.text, /John Doe/);
    assert.match(brief.text, /204-B/);
  });

  await t.test('Meeting Lifecycle: Create, Ingest Transcript, Extract Action Items, and Finalize', () => {
    const { core } = createMockCore();
    const engine = new OperationsCopilotEngine(core);

    // 1. Create meeting
    const meeting = engine.createMeeting({
      type: 'morning_huddle',
      title: 'Morning Standup — Main Facility'
    });
    assert.ok(meeting.id, 'Meeting must have id');
    assert.equal(meeting.status, 'live');
    assert.ok(meeting.agenda.length >= 5);

    // 2. Ingest statement with clinical entity and action item
    const statement = 'Staff Nurse Sarah will follow up on lab results for resident John in Rm 104 by 2 PM; he fell near the bathroom this morning.';
    const updated = engine.addTranscriptEntry(meeting.id, {
      speaker: 'DON Jane',
      role: 'DON',
      text: statement
    });

    assert.equal(updated.transcript.length, 1);
    assert.equal(updated.transcript[0].speaker, 'DON Jane');
    assert.ok(updated.transcript[0].flags.some(f => f.category === 'fall'), 'Should flag fall');

    // 3. Verify action item auto-detection
    assert.ok(updated.actionItems.length >= 1, 'Should auto-detect action item');
    const actionItem = updated.actionItems[0];
    assert.ok(actionItem.task.length > 5);

    // 4. Convert action item to official To-Do
    const convertRes = engine.convertActionItemToTodo(meeting.id, actionItem.id);
    assert.ok(convertRes.success);
    assert.ok(convertRes.todo.id);
    assert.equal(convertRes.actionItem.status, 'in_progress');

    // 5. Finalize meeting
    const finalized = engine.finalizeMeeting(meeting.id);
    assert.equal(finalized.status, 'completed');
    assert.ok(finalized.summary.includes('ATTENDEES'));
    assert.ok(finalized.summary.includes('AGENDA ITEMS COVERED'));
    assert.ok(finalized.summary.includes('CLINICAL SENTINEL FINDINGS'));
  });

  await t.test('Dispatcher routes operations calls properly', () => {
    const { core } = createMockCore();
    const ops = dispatch(core, 'operationsSummary', {});
    assert.ok(ops.census);

    const m = dispatch(core, 'meetingSave', { type: 'clinical_idt' });
    assert.ok(m.id);
    assert.equal(m.type, 'clinical_idt');

    const list = dispatch(core, 'meetingList', {});
    assert.equal(list.length, 1);

    const fetched = dispatch(core, 'meetingGet', { id: m.id });
    assert.equal(fetched.id, m.id);

    const deleted = dispatch(core, 'meetingDelete', { id: m.id });
    assert.equal(deleted, true);
  });

  await t.test('server/development-policy.cjs permits operations and meeting calls', () => {
    const opsAllowed = [
      'operationsSummary',
      'operationsHuddleBrief',
      'meetingList',
      'meetingGet',
      'meetingSave',
      'meetingDelete',
      'meetingAddTranscript',
      'meetingConvertActionItem',
      'meetingFinalize'
    ];

    for (const op of opsAllowed) {
      assert.doesNotThrow(() => {
        devPolicy.assertOperation(op, {});
      }, `Operation ${op} should be permitted in development-policy`);
    }
  });

  await t.test('Frontend UI components and templates integration check', () => {
    // 1. operations-copilot.mjs exists and exports
    const uiModulePath = path.join(__dirname, '../source/ui/operations-copilot.mjs');
    assert.ok(fs.existsSync(uiModulePath), 'operations-copilot.mjs must exist');
    const uiContent = fs.readFileSync(uiModulePath, 'utf8');
    assert.match(uiContent, /export function createOperationsCopilotUI/);
    assert.match(uiContent, /Speaker review/);

    // 2. index.html contains operations nav
    const htmlPath = path.join(__dirname, '../source/ui/index.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    assert.match(htmlContent, /data-view="meetings"/);
    assert.doesNotMatch(htmlContent, /data-view="(?:operations|playbooks|actions)"/);
    assert.match(htmlContent, /data-view="dashboard"/);

    // 3. app.mjs imports and routes operations
    const appPath = path.join(__dirname, '../source/ui/app.mjs');
    const appContent = fs.readFileSync(appPath, 'utf8');
    assert.match(appContent, /await import\("\.\/operations-copilot\.mjs"\)/);
    assert.match(appContent, /const operationsCopilotUI=lazyFeature/);
    assert.match(appContent, /if \(name === "operations"\)/);

    // 4. today.mjs contains operations summary card
    const todayPath = path.join(__dirname, '../source/ui/snf/today.mjs');
    const todayContent = fs.readFileSync(todayPath, 'utf8');
    assert.match(todayContent, /id="today-operations-summary-card"/);
    assert.match(todayContent, /renderPage\('operations'\)/);

    // 5. style.css contains operational styles
    const cssPath = path.join(__dirname, '../source/ui/style.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    assert.match(cssContent, /\.ops-page/);
    assert.match(cssContent, /\.ops-vitals-grid/);
    assert.match(cssContent, /\.ops-triple-grid/);
    assert.match(cssContent, /\.ops-speech-bar/);
  });
});

