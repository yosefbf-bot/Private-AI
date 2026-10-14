'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers.cjs');

const { ExecutiveDeskEngine, dispatch: execDispatch } = require('../source/executive-desk-engine.cjs');
const { OperationsAnalyticsEngine, dispatch: opsDispatch } = require('../source/operations-analytics-engine.cjs');
const { ExecutiveAssistantEngine, dispatch: assistantDispatch } = require('../source/executive-assistant-engine.cjs');

function createMockCore() {
  const storeMap = new Map();

  const store = {
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
    assertUnlocked() {}
  };

  return { core, storeMap };
}

test('memo proposals use exact clause evidence and preserve unknown assignment/deadline', t => {
  const { core } = fixture(t);
  const transcript = '  Remind me to contact the physician tomorrow. Tell maintenance room 204 has a leak; let dietary know room 115 has cold soup.  ';
  const preview = assistantDispatch(core, 'assistantParseVoiceMemo', { transcript });
  assert.equal(preview.actions.length, 3);
  const [reminder, maintenance, dietary] = preview.actions;
  assert.equal(reminder.targetModule, 'exec_action');
  assert.equal(reminder.location, 'Location not provided');
  assert.equal(reminder.dueHint.text, 'tomorrow');
  assert.equal(reminder.dueHint.status, 'unresolved');
  assert.equal(transcript.slice(reminder.dueHint.start, reminder.dueHint.end), 'tomorrow');
  assert.equal(reminder.autoCommitPayload.dueAt, undefined);
  assert.equal(maintenance.targetModule, 'rounds_maintenance');
  assert.equal(maintenance.location, 'Room 204');
  assert.equal(dietary.targetModule, 'dept_task_dietary');
  assert.equal(dietary.location, 'Room 115');
  assert.match(dietary.autoCommitPayload.title, /Room 115/);
  for (const action of preview.actions) {
    assert.equal(transcript.slice(action.evidence.start, action.evidence.end), action.description);
    assert.equal(action.evidence.text, action.description);
    assert.equal(action.unknownFields.owner, true);
    assert.equal(action.unknownFields.dueAt, true);
    assert.equal(action.reviewRequired, true);
    assert.equal(action.heuristic, true);
  }
  assert.equal(core.store.count('todo'), 0, 'Parsing is a review preview, not a task commit');
  assert.equal(core.store.count('exec_rounds_issue'), 0);
});

test('memo keywords respect word boundaries, explicit staff context and repeated departments', t => {
  const { core } = fixture(t);
  const contact = assistantDispatch(core, 'assistantParseVoiceMemo', { transcript: 'Remind me to contact the physician tomorrow.' });
  assert.deepEqual(contact.actions.map(a => a.targetModule), ['exec_action']);
  const memo = 'Tell maintenance room 204 AC stopped; maintenance room 205 sink leaks. Let dietary know room 115 has cold soup and coffee; dietary room 116 tray is missing. Put a note in CNA Example\'s file that she stayed late to cover breakfast.';
  const parsed = assistantDispatch(core, 'assistantParseVoiceMemo', { transcript: memo });
  assert.equal(parsed.actions.length, 5);
  assert.deepEqual(parsed.actions.filter(a => a.targetModule === 'rounds_maintenance').map(a => a.location), ['Room 204', 'Room 205']);
  assert.deepEqual(parsed.actions.filter(a => a.targetModule === 'dept_task_dietary').map(a => a.location), ['Room 115', 'Room 116']);
  assert.equal(parsed.actions.filter(a => a.targetModule === 'hr_coaching').length, 1);
  assert.equal(parsed.actions.at(-1).type, 'HR Commendation / Recognition');
  const nurseCall = assistantDispatch(core, 'assistantParseVoiceMemo', { transcript: 'Remind me to ask the nurse to call Dr. Example tomorrow at 3 PM.' });
  assert.equal(nurseCall.actions.length, 1);
  assert.equal(nurseCall.actions[0].targetModule, 'exec_action');
  assert.match(nurseCall.actions[0].description, /Dr\. Example/);
  assert.equal(nurseCall.actions[0].dueHint.text, 'tomorrow at 3 PM');
  const ambiguous = assistantDispatch(core, 'assistantParseVoiceMemo', { transcript: 'Maintenance inspect room 204 near room 205 for leaks.' });
  assert.equal(ambiguous.actions[0].location, 'Multiple locations — review');
  assert.equal(ambiguous.actions[0].unknownFields.location, true);
  assert.deepEqual(ambiguous.actions[0].locations, ['Room 204', 'Room 205']);
});

test('memo preview retains unclassified source evidence and rejects empty/oversized input', t => {
  const { core } = fixture(t);
  const transcript = 'SYNTHETIC rounds observation; tell maintenance room 204 has a leak; details need review';
  const parsed = assistantDispatch(core, 'assistantParseVoiceMemo', { transcript });
  assert.deepEqual(parsed.unmatchedEvidence.map(e => e.text), ['SYNTHETIC rounds observation', 'details need review']);
  for (const evidence of parsed.unmatchedEvidence) assert.equal(transcript.slice(evidence.start, evidence.end), evidence.text);
  for (const value of ['', '   ', null, 'x'.repeat(40001)]) assert.throws(() => assistantDispatch(core, 'assistantParseVoiceMemo', { transcript: value }), { code: 'INVALID' });
});

test('rounds edits upsert one linked delegation with saved deadlines and assignments', t => {
  const { core } = fixture(t);
  const issue = execDispatch(core, 'execRoundsLog', { location: 'SYNTHETIC Room 204', description: 'SYNTHETIC loose handrail', urgency: 'urgent' });
  assert.equal(issue.dueAt, null);
  assert.equal(issue.deadlineSource, 'unknown');
  assert.equal(core.store.get('todo', issue.id).dueAt, null);
  assert.equal(core.store.get('exec_dept_task', issue.departmentTaskId).dueDate, null);
  const deadline = Date.now() + 3600000;
  const assigned = execDispatch(core, 'execRoundsLog', { id: issue.id, dueAt: deadline, assignedTo: 'SYNTHETIC assigned reviewer' });
  assert.equal(assigned.deadlineSource, 'user-entered');
  const delegated = core.store.get('exec_dept_task', issue.departmentTaskId);
  execDispatch(core, 'execDeptTaskSave', { ...delegated, status: 'in_progress', blockerNotes: 'SYNTHETIC parts pending' });
  core.saveTodo({ id: issue.id, dueAt: deadline + 3600000, owner: 'SYNTHETIC alternate reviewer' });
  const edited = execDispatch(core, 'execRoundsLog', { id: issue.id, description: 'SYNTHETIC handrail inspection updated' });
  assert.equal(edited.departmentTaskId, issue.departmentTaskId);
  assert.equal(edited.dueAt, deadline + 3600000, 'Action Center deadline remains authoritative');
  assert.equal(edited.created, issue.created);
  assert.equal(core.store.get('todo', issue.id).owner, 'SYNTHETIC alternate reviewer');
  assert.equal(core.store.count('exec_rounds_issue'), 1);
  assert.equal(core.store.count('exec_dept_task'), 1);
  assert.equal(core.store.count('todo'), 2, 'One issue and its existing delegation, with no edit clones');
  const reloadedTask = core.store.get('exec_dept_task', issue.departmentTaskId);
  assert.equal(reloadedTask.status, 'in_progress');
  assert.equal(reloadedTask.blockerNotes, 'SYNTHETIC parts pending');
  assert.equal(reloadedTask.assigneeName, 'SYNTHETIC assigned reviewer');
  assert.equal(reloadedTask.dueDate, new Date(deadline + 3600000).toISOString());
  assert.match(reloadedTask.description, /inspection updated/);
  const cleared = execDispatch(core, 'execRoundsLog', { id: issue.id, dueAt: null, autoDispatchTask: false });
  assert.equal(cleared.dueAt, null);
  assert.equal(cleared.autoDispatchedTask, false);
  assert.equal(core.store.get('todo', issue.id).dueAt, null);
  const savedAgain = execDispatch(core, 'execRoundsLog', { id: issue.id, description: 'SYNTHETIC another review' });
  assert.equal(savedAgain.autoDispatchedTask, false, 'Partial edits retain dispatch preference');
  assert.equal(core.store.count('exec_dept_task'), 1, 'Disabling automatic delegation preserves the saved task');
});

test('rounds resolution closes all explicit legacy links and leaves unrelated clinical work open', t => {
  const { core } = fixture(t);
  const issue = execDispatch(core, 'execRoundsLog', { location: 'SYNTHETIC Room 204', description: 'SYNTHETIC inspection finding', category: 'nursing' });
  const originalTask = core.store.get('exec_dept_task', issue.departmentTaskId);
  const duplicate = execDispatch(core, 'execDeptTaskSave', { ...originalTask, id: undefined, title: 'SYNTHETIC legacy duplicate' });
  const unrelated = execDispatch(core, 'execDeptTaskSave', { departmentId: 'don', title: 'SYNTHETIC unrelated task' });
  core.store.put('snf_alert', 'synthetic-clinical-alert', { id: 'synthetic-clinical-alert', status: 'active' });
  const edited = execDispatch(core, 'execRoundsLog', { id: issue.id, description: 'SYNTHETIC revised inspection' });
  assert.equal(edited.departmentTaskId, issue.departmentTaskId);
  assert.equal(core.store.count('exec_dept_task'), 3, 'Legacy duplicates remain available for review rather than being deleted');
  const resolved = execDispatch(core, 'execRoundsResolve', { id: issue.id, resolutionNotes: 'SYNTHETIC reviewer confirmed operational repair' });
  for (const id of [issue.id, originalTask.id, duplicate.id]) assert.equal(core.store.get('todo', id).status, 'completed');
  for (const id of [originalTask.id, duplicate.id]) assert.equal(core.store.get('exec_dept_task', id).status, 'completed');
  assert.equal(core.store.get('todo', unrelated.id).status, 'pending');
  assert.equal(core.store.get('snf_alert', 'synthetic-clinical-alert').status, 'active');
  const secondResolution = execDispatch(core, 'execRoundsResolve', { id: issue.id, resolutionNotes: 'SYNTHETIC closure reviewed again' });
  assert.equal(secondResolution.resolvedAt, resolved.resolvedAt);
  assert.equal(core.store.count('exec_dept_task'), 3);
});

test('rounds save rolls back the whole source/task update after a persistence failure', t => {
  const { core } = fixture(t);
  const originalPut = core.store.put.bind(core.store);
  core.store.put = (kind, ...args) => {
    if (kind === 'exec_dept_task') throw new Error('Synthetic persistence failure');
    return originalPut(kind, ...args);
  };
  assert.throws(() => execDispatch(core, 'execRoundsLog', { description: 'SYNTHETIC rollback fixture' }), /Synthetic persistence failure/);
  core.store.put = originalPut;
  assert.equal(core.store.count('exec_rounds_issue'), 0);
  assert.equal(core.store.count('todo'), 0);
  assert.equal(core.store.count('wf_action_meta'), 0);
  assert.equal(core.store.count('exec_dept_task'), 0);
});

test('Executive Desk: Daily Rhythm, Action Queue, Delegation, Rounds, and HR Milestones', async (t) => {
  const { core } = createMockCore();
  const engine = new ExecutiveDeskEngine(core);

  await t.test('Daily Executive Rhythm: Top 3 and End-of-Day Audit', () => {
    const today = new Date().toISOString().slice(0, 10);
    const initial = execDispatch(core, 'execRhythmGet', { date: today });
    assert.equal(initial.date, today);
    assert.equal(initial.top3.length, 3);

    // Save Top 3
    const saved = execDispatch(core, 'execRhythmSave', {
      date: today,
      top3: [
        { title: 'Sign off on OnShift master schedule', completed: false, priority: 'critical' },
        { title: 'Walk renovated dining room with contractor', completed: true, priority: 'high' },
        { title: 'Address staffing agency invoice discrepancy', completed: false, priority: 'medium' }
      ],
      morningNotes: 'Department head meeting at 10 AM.'
    });
    assert.equal(saved.top3[0].title, 'Sign off on OnShift master schedule');
    assert.equal(saved.top3[1].completed, true);

    const audit = execDispatch(core, 'execEndOfDayAudit', {});
    assert.equal(audit.uncompletedTop3.length, 2);
  });

  await t.test('Inbound Communications & Action Queue: Email & WhatsApp Triage', () => {
    // 1. Capture Commitment (owed to family)
    const item1 = execDispatch(core, 'execActionCapture', {
      title: 'Call Mrs. Davis regarding Room 114 physical therapy progress',
      source: 'whatsapp',
      type: 'commitment',
      counterparty: 'Mrs. Davis (Daughter)',
      counterpartyRole: 'Family Member / Health Care Proxy',
      urgency: 'high',
      dueDate: new Date(Date.now() + 86400000).toISOString(),
      roomNumber: '114'
    });
    assert.ok(item1.id);
    assert.equal(item1.type, 'commitment');
    assert.equal(item1.channel, 'WhatsApp');

    // 2. Capture Waiting On (request out to MD)
    const item2 = execDispatch(core, 'execActionCapture', {
      title: 'Waiting for Dr. Miller callback on antibiotic clarification for Room 204',
      source: 'phone',
      type: 'waiting_on',
      counterparty: 'Dr. Miller',
      counterpartyRole: 'Attending Physician',
      urgency: 'critical',
      roomNumber: '204'
    });
    assert.equal(item2.type, 'waiting_on');

    const commitments = execDispatch(core, 'execActionList', { type: 'commitment' });
    assert.ok(commitments.some(c => c.id === item1.id));

    const waitingOn = execDispatch(core, 'execActionList', { type: 'waiting_on' });
    assert.ok(waitingOn.some(w => w.id === item2.id));

    // Update item
    const updated = execDispatch(core, 'execActionUpdate', { id: item1.id, status: 'completed' });
    assert.equal(updated.status, 'completed');
    assert.ok(updated.completedAt);
  });

  await t.test('Department Head Delegation & Standup Summary', () => {
    const depts = execDispatch(core, 'execDeptList', {});
    assert.ok(depts.length >= 8);

    const task = execDispatch(core, 'execDeptTaskSave', {
      departmentId: 'maintenance',
      title: 'Repair leaking PTAC unit in Room 108',
      description: 'Condensation line clogged; floor is wet.',
      priority: 'critical',
      dueDate: new Date(Date.now() + 14400000).toISOString()
    });
    assert.ok(task.id);
    assert.equal(task.departmentId, 'maintenance');

    const tasks = execDispatch(core, 'execDeptTaskList', { departmentId: 'maintenance' });
    assert.ok(tasks.some(t => t.id === task.id));

    const standup = execDispatch(core, 'execDeptStandupSummary', {});
    assert.ok(standup.totalOpenTasks >= 1);
    const maintSummary = standup.departments.find(d => d.department.id === 'maintenance');
    assert.ok(maintSummary.totalOpen >= 1);
  });

  await t.test('Executive Rounds & Punch List: Auto-Dispatch and Resolution', () => {
    const issue = execDispatch(core, 'execRoundsLog', {
      location: 'Room 214',
      category: 'maintenance',
      description: 'Bathroom grab bar is slightly loose on left side.',
      urgency: 'high',
      autoDispatchTask: true
    });
    assert.ok(issue.id);
    assert.equal(issue.status, 'open');

    // Verify auto-dispatched department task was created
    const deptTasks = execDispatch(core, 'execDeptTaskList', { departmentId: 'maintenance' });
    const linked = deptTasks.find(t => t.relatedRoundsId === issue.id);
    assert.ok(linked, 'Linked maintenance task should have been auto-dispatched');

    // Resolve issue and verify linked task is also marked completed
    const resolved = execDispatch(core, 'execRoundsResolve', {
      id: issue.id,
      resolutionNotes: 'Tightened screws and anchored into stud.'
    });
    assert.equal(resolved.status, 'resolved');
  });

  await t.test('Admission Room Readiness Board', () => {
    assert.deepEqual(execDispatch(core, 'execRoomReadinessList', {}), []);
    for(let i=0;i<4;i++)execDispatch(core,'execRoomReadinessUpdate',{id:'synthetic-room-'+i,roomNumber:String(100+i)});
    const rooms = execDispatch(core, 'execRoomReadinessList', {});
    assert.ok(rooms.length >= 4);

    const targetRoom = rooms[0];
    const updated = execDispatch(core, 'execRoomReadinessUpdate', {
      id: targetRoom.id,
      stage: 'ready_for_admit',
      targetAdmitTime: 'Today 3:00 PM',
      notes: 'Final nursing check completed, clean linens and welcome kit ready.'
    });
    assert.equal(updated.stage, 'ready_for_admit');
  });

  await t.test('Staff Attendance, Points, and HR Milestones', () => {
    // Log call offs for an employee
    execDispatch(core, 'execAttendanceLog', {
      employeeName: 'Sarah Connor',
      role: 'CNA',
      shift: '3-11 Evening',
      type: 'call_off',
      isWeekend: true,
      excused: false
    });
    execDispatch(core, 'execAttendanceLog', {
      employeeName: 'Sarah Connor',
      role: 'CNA',
      shift: '3-11 Evening',
      type: 'call_off',
      isWeekend: true,
      excused: false
    });
    execDispatch(core, 'execAttendanceLog', {
      employeeName: 'Sarah Connor',
      role: 'CNA',
      shift: '3-11 Evening',
      type: 'call_off',
      isWeekend: true,
      excused: false
    });

    const history = execDispatch(core, 'execAttendanceHistory', { employeeName: 'Sarah Connor' });
    assert.equal(history.weekendCallOffs60d, 3);
    assert.equal(history.thresholdWarning, true);

    const alerts = execDispatch(core, 'execAttendanceAlerts', {});
    assert.ok(alerts.some(a => a.employeeName === 'Sarah Connor'));

    // New Hire Milestones
    assert.deepEqual(execDispatch(core, 'execNewHireList', {}), []);
    for(let i=0;i<3;i++)execDispatch(core,'execNewHireSave',{employeeName:'Synthetic hire '+i,hireDate:'2026-09-01'});
    const milestones = execDispatch(core, 'execNewHireList', {});
    assert.ok(milestones.length >= 3);

    // Coaching Record
    const coaching = execDispatch(core, 'execCoachingSave', {
      employeeName: 'Sarah Connor',
      role: 'CNA',
      type: 'written',
      topic: 'Weekend Attendance Policy Breach',
      details: 'Reviewed attendance policy following 3rd unexcused weekend call-off.'
    });
    assert.ok(coaching.id);
    const list = execDispatch(core, 'execCoachingList', { employeeName: 'Sarah Connor' });
    assert.ok(list.some(c => c.id === coaching.id));
  });
});

test('Operations Analytics & Regulatory: OnShift Staffing and Compliance Sentinel', async (t) => {
  const { core } = createMockCore();
  const engine = new OperationsAnalyticsEngine(core);

  await t.test('Regulatory Compliance Sentinel', () => {
    assert.deepEqual(opsDispatch(core, 'regulatoryList', {}), []);
    // Explicit synthetic fixtures, never automatic production seeding.
    for(const item of require('../source/operations-analytics-engine.cjs').DEFAULT_REGULATORY_ITEMS)opsDispatch(core,'regulatorySave',item);
    const items = opsDispatch(core, 'regulatoryList', {});
    assert.ok(items.length >= 8);

    // Verify CLIA, BNE narcotics, and Medical Director exist
    assert.ok(items.some(i => i.id === 'reg_clia'));
    assert.ok(items.some(i => i.id === 'reg_bne_narcotics'));
    assert.ok(items.some(i => i.id === 'reg_med_director'));

    const summary = opsDispatch(core, 'regulatorySummary', {});
    assert.ok(summary.totalLicenses >= 8);
    assert.ok(typeof summary.activeCount === 'number');
  });

  await t.test('Staffing Analysis: OnShift Ingestion, Approaching OT, and FTE Gap', () => {
    const csvContent = `Employee Name,Position,Unit,Shift,Scheduled Hours,Actual Hours,Overtime Hours,Clock In,Clock Out,Agency
Tanya Rogers,CNA,West Wing,3-11 Evening,8.0,8.5,0.5,14:48,23:30,No
Marcus Wright,CNA,North Wing,7-3 Day,8.0,8.8,0.8,06:42,15:48,No
Kendra Washington,CNA,West Wing,3-11 Evening,8.0,12.0,4.0,14:50,03:10,No
ShiftKey Agency Aide,CNA,West Wing,11-7 Night,8.0,8.0,0.0,22:55,07:05,Yes`;

    const parsed = opsDispatch(core, 'staffingParseCsv', { csvText: csvContent, filename: 'onshift_sched_vs_actual.csv' });
    assert.equal(parsed.success, true);
    assert.equal(parsed.records.length, 4);

    const analysis = opsDispatch(core, 'staffingAnalyze', { records: parsed.records });
    assert.ok(analysis.periodSummary.totalOvertimeHours > 0);
    assert.ok(analysis.periodSummary.totalAgencyHours > 0);
    assert.equal(analysis.fteHiringGaps.projectedMonthlySavings, null, 'Missing rates and an unconfirmed period cannot establish monthly savings');
    assert.equal(analysis.periodSummary.estimatedTotalOTSpend, null);
    assert.equal(analysis.periodSummary.estimatedTotalAgencySpend, null);
    assert.equal(analysis.incidentalPunchAudit.estimatedLeakCost, null);
    assert.equal(analysis.assumptions.weeklyPeriodConfirmed, false);
    assert.ok(analysis.incidentalPunchAudit.flaggedOccurrences.length >= 1);
  });

  await t.test('Smart Shift Replacement Matcher', () => {
    const roster = engine.getSampleRoster().map(row => ({ ...row, overtimeRule: {
      reviewed: true, periodHoursConfirmed: true, thresholdHours: 40, multiplier: 1.5
    } }));
    const matches = opsDispatch(core, 'staffingReplacementMatch', { openShift: { role: 'CNA', hours: 8.0 }, roster });
    assert.ok(matches.length >= 4);

    // Explicit source hours and reviewed compensation permit threshold comparison.
    assert.equal(matches[0].tier, 1);
    assert.equal(matches[0].willIncurOT, false);
    assert.equal(matches[0].reviewRequired, true, 'Comparison does not establish availability or permission');

    // Agency should be ranked last (Tier 4)
    const agencyMatch = matches.find(m => m.isAgency);
    assert.ok(agencyMatch);
    assert.equal(agencyMatch.tier, 4);
  });
});

test('Executive AI Assistant Suite: Ghostwriter, Voice Parser, Dossiers, Contract Scanner', async (t) => {
  const { core } = createMockCore();
  const engine = new ExecutiveAssistantEngine(core);

  await t.test('Context-Aware Ghostwriter', () => {
    const familyDraft = assistantDispatch(core, 'assistantGhostwrite', {
      type: 'family_inquiry',
      context: {
        familyName: 'Mr. Henderson',
        residentName: 'Dorothy Henderson',
        topic: 'physical therapy progression and dining room seating'
      }
    });
    assert.ok(familyDraft.subject.includes('Dorothy Henderson'));
    assert.ok(familyDraft.body.includes('Dear Mr. Henderson'));

    const corpDraft = assistantDispatch(core, 'assistantGhostwrite', {
      type: 'corporate_staffing',
      context: {
        period: 'this past weekend',
        totalOT: '16.5 hours',
        agencyShifts: '2 CNA shifts',
        rootCause: 'acute call-offs on 3-11 West Wing'
      }
    });
    assert.ok(corpDraft.body.includes('16.5 hours'));
    assert.ok(corpDraft.body.includes('3-11 West Wing'));

    const mdDraft = assistantDispatch(core, 'assistantGhostwrite', {
      type: 'physician_followup',
      context: {
        physicianName: 'Dr. Robert Smith',
        residentName: 'James Wilson',
        room: '104-B',
        clinicalNeed: 'signed telephone orders for Lasix increase'
      }
    });
    assert.ok(mdDraft.body.includes('James Wilson'));
    assert.ok(mdDraft.body.includes('Lasix'));
  });

  await t.test('Meeting Prep Dossier ("Cheat Sheet")', () => {
    const dossier = assistantDispatch(core, 'assistantMeetingDossier', {
      attendeeType: 'department_head',
      attendeeName: 'Marcus Vance',
      departmentId: 'maintenance'
    });
    assert.equal(dossier.attendeeName, 'Marcus Vance');
    assert.ok(Array.isArray(dossier.suggestedAgendaTalkingPoints));
  });

  await t.test('Stream-of-Consciousness Voice Memo Multi-Action Parser', () => {
    const memo = `Hey, tell maintenance the air conditioner in room 204 is leaking on the floor, let dietary know room 115 complained about cold soup again, and put a note in CNA Jackson's file that she stayed two hours late to cover breakfast.`;
    const parsed = assistantDispatch(core, 'assistantParseVoiceMemo', { transcript: memo });

    assert.equal(parsed.detectedRoom, '204');
    assert.ok(parsed.actions.length >= 3);

    // Verify maintenance ticket extracted
    const maintAction = parsed.actions.find(a => a.targetModule === 'rounds_maintenance');
    assert.ok(maintAction, 'Maintenance work order should be extracted');
    assert.equal(maintAction.location, 'Room 204');

    // Verify dietary action extracted
    const dietAction = parsed.actions.find(a => a.targetModule === 'dept_task_dietary');
    assert.ok(dietAction, 'Dietary action should be extracted');
    assert.equal(dietAction.location, 'Room 115');

    // Verify HR commendation extracted
    const hrAction = parsed.actions.find(a => a.targetModule === 'hr_coaching');
    assert.ok(hrAction, 'HR note should be extracted');
    assert.equal(hrAction.type, 'HR Commendation / Recognition');
  });

  await t.test('Commute Audio Briefing Generator', () => {
    const briefing = assistantDispatch(core, 'assistantCommuteBriefing', {});
    assert.ok(briefing.audioScript.includes('Good morning'));
    assert.equal(briefing.activeCensus, null);
    assert.match(briefing.audioScript,/not available/);
  });

  await t.test('Vendor Contract & Quote "Gotcha" Scanner', () => {
    const sampleContract = `
    AGREEMENT FOR TEMPORARY HEALTHCARE STAFFING
    This agreement shall automatically renew for successive terms of one (1) year unless either party provides ninety (90) days prior written notice.
    Facility agrees to a minimum of 8 hours per shift requested. Cancellation fee applies if canceled within 24 hours.
    Rates are subject to an annual increase of 4.5% or CPI. Overtime shall be billed at 1.5x regular bill rate.
    `;

    const scan = assistantDispatch(core, 'assistantScanContract', { contractText: sampleContract });
    assert.ok(scan.totalGotchasFound >= 3);
    assert.ok(scan.findings.some(f => f.category.includes('Auto-Renewal')));
    assert.ok(scan.findings.some(f => f.category.includes('Minimum')));
  });

  await t.test('Difficult Conversation Scripting Coach', () => {
    const script = assistantDispatch(core, 'assistantDifficultConvoScript', {
      scenario: 'termination_attendance',
      details: {
        employeeName: 'John Doe',
        points: '6.0 points',
        lastIncident: 'no-call no-show on Sunday night'
      }
    });
    assert.ok(script.talkingPoints.length >= 3);
    assert.ok(script.deEscalationTips.length >= 2);
  });

  await t.test('14-Day Proactive Conflict Radar', () => {
    const radar = assistantDispatch(core, 'assistantConflictRadar', { daysAhead: 14 });
    assert.deepEqual(radar, []);
    core.store.put('ops_regulatory','synthetic-renewal',{id:'synthetic-renewal',title:'Synthetic renewal',expirationDate:new Date(Date.now()+7*86400000).toISOString().slice(0,10)});
    const recorded=assistantDispatch(core,'assistantConflictRadar',{daysAhead:14});
    assert.equal(recorded.length,1);
    assert.equal(recorded[0].headline,'Regulatory Expiration: Synthetic renewal');
  });
});

test('Consolidation and Architectural Invariants: Canonical Action Sync, Scheduler, Privacy, and Boundaries', async (t) => {
  const { core } = createMockCore();

  await t.test('Executive Desk and Action Center use synchronized underlying actions', () => {
    // 1. Capture action in Executive Desk
    const captured = execDispatch(core, 'execActionCapture', {
      title: 'Discuss room transfer request with family',
      source: 'email',
      type: 'commitment',
      counterparty: 'Mr. Henderson',
      urgency: 'high',
      dueDate: new Date(Date.now() + 86400000).toISOString()
    });
    assert.ok(captured.id);

    // 2. Verify canonical todo was created in store
    const canonicalTodo = core.store.get('todo', captured.id);
    assert.ok(canonicalTodo, 'Canonical todo must exist in Store');
    assert.equal(canonicalTodo.title, captured.title);
    assert.equal(canonicalTodo.status, 'pending');

    // 3. Complete canonical action (simulating completion in Action Center)
    canonicalTodo.status = 'completed';
    canonicalTodo.completedAt = Date.now();
    core.store.put('todo', captured.id, canonicalTodo);

    // 4. Verify Executive Desk reflects completion immediately
    const listed = execDispatch(core, 'execActionList', {});
    const syncedItem = listed.find(i => i.id === captured.id);
    assert.ok(syncedItem);
    assert.equal(syncedItem.status, 'completed', 'Executive Desk must synchronize with Action Center completion');

    // 5. Reopen in Executive Desk
    execDispatch(core, 'execActionUpdate', { id: captured.id, status: 'active' });
    const reopenedTodo = core.store.get('todo', captured.id);
    assert.equal(reopenedTodo.status, 'pending', 'Action Center todo must synchronize with Executive Desk edit');
  });

  await t.test('Rounds issues create canonical actions and update on resolution', () => {
    const roundsIssue = execDispatch(core, 'execRoundsLog', {
      location: 'Room 118-B',
      category: 'maintenance',
      description: 'Call bell cord frayed near bed bracket',
      urgency: 'urgent',
      autoDispatchTask: true,
      approved: false // Explicitly unapproved external dispatch
    });
    assert.ok(roundsIssue.id);
    assert.equal(roundsIssue.dispatchApproved, false);
    assert.match(roundsIssue.dispatchStatus, /Approval required/i);

    // Verify canonical todo exists for Maintenance
    const todo = core.store.get('todo', roundsIssue.id);
    assert.ok(todo, 'Rounds issue must create canonical todo');
    assert.equal(todo.owner, 'Maintenance');
    assert.equal(todo.status, 'pending');

    // Resolve rounds issue
    execDispatch(core, 'execRoundsResolve', { id: roundsIssue.id, resolutionNotes: 'Replaced cord assembly' });
    const resolvedTodo = core.store.get('todo', roundsIssue.id);
    assert.equal(resolvedTodo.status, 'completed', 'Resolving rounds issue must complete canonical todo');
  });

  await t.test('Scheduled 4:30 PM loop audit uses existing scheduler logic', () => {
    const { nextRun, normalize } = require('../source/schedules.cjs');
    const scheduleConfig = normalize({ frequency: 'weekdays', time: '16:30' });
    assert.equal(scheduleConfig.frequency, 'weekdays');
    assert.equal(scheduleConfig.time, '16:30');

    const nextTimestamp = nextRun({ frequency: 'weekdays', time: '16:30' });
    assert.ok(Number.isFinite(nextTimestamp));
    assert.ok(nextTimestamp > Date.now());

    const nextDate = new Date(nextTimestamp);
    assert.equal(nextDate.getHours(), 16);
    assert.equal(nextDate.getMinutes(), 30);
    assert.ok(![0, 6].includes(nextDate.getDay()), 'Must be a weekday');
  });

  await t.test('Regulatory Sentinel links expiring items to canonical Action Center tasks', () => {
    const expiringSoon = new Date(Date.now() + (10 * 86400000)).toISOString().slice(0, 10);
    const regItem = opsDispatch(core, 'regulatorySave', {
      title: 'Annual Kitchen Fire Suppression Hood Hydro Test',
      category: 'life_safety',
      expirationDate: expiringSoon,
      renewalWindowDays: 30,
      responsibleParty: 'Director of Maintenance'
    });
    assert.ok(regItem.id);

    // Verify canonical Action Center todo was created
    const expectedTodoId = regItem.todoId;
    const todo = core.store.get('todo', expectedTodoId);
    assert.ok(todo, 'Expiring regulatory item must link to canonical Action Center todo');
    assert.equal(todo.priority, 'urgent');
    assert.equal(todo.owner, 'Director of Maintenance');
  });

  await t.test('Staffing and Overtime engine exposes deterministic formulas and planning notices', () => {
    const analysis = opsDispatch(core, 'staffingAnalyze', {});
    assert.ok(analysis.assumptions);
    assert.ok(analysis.assumptions.formula.includes('Net FTE Deficit'));
    assert.equal(analysis.assumptions.standardFteHours, 40.0);
    assert.ok(analysis.assumptions.notice.includes('planning estimate'));
    assert.ok(analysis.assumptions.notice.includes('Not an automated hiring directive'));
  });

  await t.test('HIPAA and Local Only speech policy gates remain strictly enforced', () => {
    const { browserSpeechAllowed } = require('../source/ui/speech-policy.mjs');
    assert.equal(browserSpeechAllowed({ hipaa: true, processingMode: 'local-only' }), false);
    assert.equal(browserSpeechAllowed({ hipaa: true, processingMode: 'smart-hybrid' }), false);
    assert.equal(browserSpeechAllowed({ hipaa: true, processingMode: 'cloud-first' }), false);
    assert.equal(browserSpeechAllowed({ hipaa: false, processingMode: 'local-only' }), false);
    assert.equal(browserSpeechAllowed({ hipaa: false, processingMode: 'smart-hybrid' }), false);
    assert.equal(browserSpeechAllowed(null), false);
  });

  await t.test('Save/reload and edit lifecycle works for daily rhythm and delegation', () => {
    const today = '2026-09-30';
    // 1. Initial save
    execDispatch(core, 'execRhythmSave', {
      date: today,
      top3: [
        { title: 'Morning standup with nursing leadership', completed: false, priority: 'critical' },
        { title: 'Review pharmacy change orders', completed: false, priority: 'high' },
        { title: 'Inspect kitchen walk-in freezer temperature log', completed: false, priority: 'medium' }
      ]
    });

    // 2. Reload
    const reloaded = execDispatch(core, 'execRhythmGet', { date: today });
    assert.equal(reloaded.top3[0].title, 'Morning standup with nursing leadership');
    assert.equal(reloaded.top3[0].completed, false);

    // 3. Edit & Mark completed
    reloaded.top3[0].completed = true;
    execDispatch(core, 'execRhythmSave', reloaded);

    // 4. Verify downstream reload preserves edit
    const finalCheck = execDispatch(core, 'execRhythmGet', { date: today });
    assert.equal(finalCheck.top3[0].completed, true);
  });
});
