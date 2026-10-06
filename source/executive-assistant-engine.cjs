'use strict';

/**
 * Executive AI Assistant Engine
 *
 * Context-Aware Ghostwriter (Family, Corporate, MD),
 * Meeting Prep Dossiers ("Cheat Sheets"),
 * Stream-of-Consciousness Voice Memo Multi-Action Parser,
 * 5-Minute Commute Audio Briefing Generator,
 * Vendor Contract & Quote "Gotcha" Scanner,
 * Difficult Conversation & HR Scripting Coach, and
 * 14-Day Proactive Operational Conflict Radar.
 */

const { fail, isId, text, uuid } = require('./security.cjs');

// Keep offsets in the original memo so each suggestion can be reviewed against
// the words that produced it. A conjunction only starts a new clause when an
// explicit new instruction/department follows; "soup and coffee" stays intact.
function memoClauses(transcript) {
  const separator = /[,;\n]+|[.!?](?=\s|$)|\s+\band\b\s+(?=(?:then\s+)?(?:tell|let|remind|call|contact|reach\s+out|check\s+on|put|note|follow\s+up|maintenance|dietary|housekeeping|room\s*#?\s*\d+)\b)/gi;
  const clauses = [];
  const add = (start, end) => {
    const raw = transcript.slice(start, end);
    const leading = raw.match(/^\s*/)[0].length;
    const trailing = raw.match(/\s*$/)[0].length;
    if (raw.trim()) clauses.push({ start: start + leading, end: end - trailing, text: raw.trim() });
  };
  let start = 0;
  for (const match of transcript.matchAll(separator)) {
    // Common titles are part of the evidence, not sentence boundaries.
    if (match[0] === '.' && /\b(?:dr|mr|mrs|ms|st)\.$/i.test(transcript.slice(0, match.index + 1))) continue;
    add(start, match.index);
    start = match.index + match[0].length;
  }
  add(start, transcript.length);
  return clauses;
}

function memoDueHint(evidence) {
  const match = evidence.text.match(/\b(?:(?:by|on|at)\s+)?(?:\d{4}-\d{2}-\d{2}|today|tomorrow|tonight|(?:next|this)\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|in\s+\d+\s+(?:minutes?|hours?|days?|weeks?))(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?))?|\b(?:by|at)\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/i);
  return match ? { text: match[0], start: evidence.start + match.index, end: evidence.start + match.index + match[0].length, status: 'unresolved' } : null;
}

class ExecutiveAssistantEngine {
  constructor(core) {
    this.core = require('./executive-workspace.cjs').scopedCore(core);
  }

  get store() {
    return this.core.store;
  }

  // -------------------------------------------------------------
  // 1. Context-Aware Ghostwriter
  // -------------------------------------------------------------
  generateDraft(type, context = {}) {
    this.core.assertUnlocked();
    const value=(key,label)=>context[key] == null || String(context[key]).trim()==='' ? '['+label+' not provided]' : text(String(context[key]),4000);
    const facility=value('facilityName','Facility name');
    const review=(this.core.executiveDemo?'DEMO DATA — NOT FOR CLINICAL USE\n':'')+'DRAFT — verify every fact and recipient before sending.\n\n';
    let subject,body;
    switch(type){
      case 'family_inquiry':
        subject='Update regarding '+value('residentName','Resident')+' — '+facility;
        body='Dear '+value('familyName','Recipient')+',\n\nThank you for contacting us regarding '+value('topic','Topic')+'.\n\nReviewed update: '+value('specificUpdate','Verified update')+'\n\n[Confirm the care team review and agree on any follow-up before sending.]';
        break;
      case 'corporate_staffing':
        subject='Staffing review — '+facility;
        body='Reporting period: '+value('period','Reporting period')+'\nOvertime: '+value('totalOT','Measured overtime')+'\nAgency shifts: '+value('agencyShifts','Measured agency shifts')+'\nReported cause: '+value('rootCause','Reviewed cause')+'\nRecruitment actions: '+value('hiringAction','Verified recruitment actions')+'\n\n[Review source coverage, dates and actual actions taken. This draft does not establish staffing compliance.]';
        break;
      case 'physician_followup':
        subject='Clinical review request — '+value('residentName','Resident');
        body='Dear '+value('physicianName','Clinician')+',\n\nResident: '+value('residentName','Resident')+'\nRoom: '+value('room','Room')+'\nConcern for review: '+value('clinicalNeed','Reviewed concern')+'\nRecorded vitals/status: '+value('vitals','Verified vitals/status')+'\nRequested document: '+value('documentNeeded','Requested document')+'\n\n[Verify the clinical record and approved contact details before sending.]';
        break;
      default: throw fail('INVALID');
    }
    return {subject,body:review+body+'\n\n'+value('senderTitle','Sender title')+'\n'+facility,type,reviewRequired:true,demo:!!this.core.executiveDemo};
  }

  // -------------------------------------------------------------
  // 2. Meeting Prep Dossiers ("Cheat Sheets")
  // -------------------------------------------------------------
  generateMeetingDossier(attendeeType, attendeeName, departmentId = null) {
    this.core.assertUnlocked();
    const now = Date.now();
    const allDeptTasks = this.store.list('exec_dept_task') || [];
    const allActions = this.store.list('exec_action') || [];
    const allRounds = this.store.list('exec_rounds_issue') || [];

    const tasksForDept = departmentId ? allDeptTasks.filter(t => t.departmentId === departmentId) : [];
    const openTasks = tasksForDept.filter(t => t.status !== 'completed');
    const overdueTasks = openTasks.filter(t => t.dueDate && new Date(t.dueDate).getTime() < now);
    const completedTasks = tasksForDept.filter(t => t.status === 'completed').slice(0, 5);

    // Filter relevant rounds issues
    const relatedRounds = departmentId ? allRounds.filter(r => r.assignedDepartmentId === departmentId && r.status !== 'resolved') : [];

    const talkingPoints = [];
    if (overdueTasks.length) {
      talkingPoints.push(`Review ${overdueTasks.length} overdue item(s): ${overdueTasks.map(t => t.title).join('; ')}`);
    }
    if (relatedRounds.length) {
      talkingPoints.push(`Address open physical plant/rounds findings: ${relatedRounds.map(r => `${r.location} (${r.description})`).join('; ')}`);
    }
    if (!openTasks.length) {
      talkingPoints.push('No open delegated tasks are present in saved records. Verify task coverage before concluding that work is complete.');
    }

    return {
      attendeeName: attendeeName || 'Department Leader',
      attendeeType: attendeeType || 'department_head',
      departmentId,
      openTasksCount: openTasks.length,
      openTasks,
      overdueTasksCount: overdueTasks.length,
      overdueTasks,
      completedRecentCount: completedTasks.length,
      completedRecentTasks: completedTasks,
      openRoundsFindings: relatedRounds,
      suggestedAgendaTalkingPoints: talkingPoints
    };
  }

  // -------------------------------------------------------------
  // 3. Stream-of-Consciousness Voice Memo Multi-Action Parser
  // -------------------------------------------------------------
  parseVoiceMemo(transcript) {
    this.core.assertUnlocked();
    text(transcript, 40000);
    if (!transcript.trim()) throw fail('INVALID');

    const extractedActions = [];
    const unmatchedEvidence = [];
    const rooms = [];
    const maintenance = /\b(?:maintenance|ac|a\/c|air\s+condition(?:er|ing)?|heater|hvac|leak(?:ing)?|sink|toilet|light|door|bed|remote|handrail|paint|scuff|plumbing)\b/i;
    const dietary = /\b(?:dietary|kitchen|food|meals?|soup|tray|pureed|texture|supper|lunch|breakfast)\b/i;
    const personnel = /\b(?:stayed(?:\s+\w+){0,3}\s+late|helped|overtime|call\s+off|great\s+job|recognition|warning|tardy|attendance)\b/i;
    const followUp = /\b(?:remind\s+me|call(?!\s+off)|follow[ -]up|doctor|physician|pharmacy|contact|reach\s+out|check\s+on)\b|\bdr\./i;
    const add = (evidence, fields) => {
      const clauseRooms = [...new Set(Array.from(evidence.text.matchAll(/\broom\s*#?\s*(\d{1,4}(?:[- ]?[a-z])?)\b/gi), match => match[1].replace(/\s+/g, '-')))];
      for (const room of clauseRooms) if (!rooms.includes(room)) rooms.push(room);
      const room = clauseRooms.length === 1 ? clauseRooms[0] : null;
      const location = room ? `Room ${room}` : clauseRooms.length > 1 ? 'Multiple locations — review' : 'Location not provided';
      const action = {
        id: uuid(), description: evidence.text, location, locations: clauseRooms.map(value => `Room ${value}`),
        evidence: { ...evidence }, dueHint: memoDueHint(evidence),
        unknownFields: { owner: true, dueAt: true, location: !room },
        reviewRequired: true, heuristic: true, ...fields
      };
      if (action.targetModule === 'rounds_maintenance') action.autoCommitPayload.location = location;
      if (action.targetModule === 'dept_task_dietary') action.autoCommitPayload.title = `[Dietary] ${room ? `Room ${room}: ` : ''}${evidence.text.slice(0, 100)}`;
      extractedActions.push(action);
    };

    for (const evidence of memoClauses(transcript)) {
      const value = evidence.text;
      const isPersonnel = personnel.test(value) || (/\b(?:cna|nurse|aide)\b/i.test(value) && /\b(?:note|file|coaching|commendation)\b/i.test(value));
      // One review proposal per clause avoids turning a staff commendation about
      // breakfast into an unrelated dietary complaint, or a reminder into HR.
      if (isPersonnel) {
        const commendation = /\b(?:stayed|great|helped|wonderful|appreciate|hero)\b/i.test(value);
        add(evidence, {
          targetModule: 'hr_coaching', type: commendation ? 'HR Commendation / Recognition' : 'HR Counseling / Note',
          destination: 'Staff Member Record', urgency: 'normal',
          autoCommitPayload: { type: commendation ? 'commendation' : 'verbal', topic: commendation ? 'Staff Recognition / Dedication' : 'Performance Follow-Up', details: value }
        });
      } else if (/\bremind\s+me\b/i.test(value) || (followUp.test(value) && !/\b(?:maintenance|dietary)\b/i.test(value))) {
        add(evidence, {
          targetModule: 'exec_action', type: 'Administrator Follow-Up Commitment', destination: 'Executive Action Queue', urgency: 'high',
          autoCommitPayload: { title: value.slice(0, 150), type: 'commitment', source: 'hallway', urgency: 'high', description: value }
        });
      } else if (/\bdietary\b/i.test(value) || (!maintenance.test(value) && dietary.test(value))) {
        add(evidence, {
          targetModule: 'dept_task_dietary', type: 'Dietary Department Action', destination: 'Food & Nutrition Director', urgency: 'high',
          autoCommitPayload: { departmentId: 'dietary', title: '', description: value, priority: 'high' }
        });
      } else if (maintenance.test(value)) {
        const urgency = /\b(?:urgent|emergency|danger|leak(?:ing)?|alarm)\b/i.test(value) ? 'urgent' : 'high';
        add(evidence, {
          targetModule: 'rounds_maintenance', type: 'Work Order / Maintenance Ticket', destination: 'Director of Maintenance', urgency,
          autoCommitPayload: { category: 'maintenance', description: value, urgency }
        });
      } else unmatchedEvidence.push(evidence);
    }

    // Preserve the generic executive fallback, with the same evidence/unknown
    // contract. Unclassified portions of a mixed memo remain explicitly visible.
    if (!extractedActions.length) {
      for (const evidence of unmatchedEvidence.splice(0)) add(evidence, {
        targetModule: 'exec_action', type: 'General Executive Action Item', destination: 'Executive Action Queue', urgency: 'high',
        autoCommitPayload: { title: evidence.text.slice(0, 150), type: 'commitment', source: 'hallway', urgency: 'high', description: evidence.text }
      });
    }
    if (extractedActions.length > 128) throw fail('LIMIT');

    return {
      rawTranscript: transcript,
      detectedRoom: rooms[0] || null,
      detectedRooms: rooms,
      unmatchedEvidence,
      reviewRequired: true,
      parser: 'local-heuristic',
      totalActionsFound: extractedActions.length,
      actions: extractedActions
    };
  }

  // -------------------------------------------------------------
  // 4. 5-Minute Commute Audio Briefing Generator
  // -------------------------------------------------------------
  generateCommuteBriefing() {
    this.core.assertUnlocked();
    const today = new Date().toISOString().slice(0, 10);
    const execRhythm = this.store.get('exec_rhythm', `rhythm_${today}`) || { top3: [] };

    // Get active admissions/census from store
    const residents = this.store.list('snf_resident') || [];
    const activeCensus = residents.length ? residents.filter(r => r.status === 'Active').length : null;

    // Check open room readiness for admissions
    const roomReadiness = this.store.list('exec_room_readiness') || [];
    const pendingAdmits = roomReadiness.filter(r => r.targetAdmitTime);

    // Check attendance for overnight call-offs
    const attendance = this.store.list('exec_attendance') || [];
    const recentCallOffs = attendance.filter(a => a.type === 'call_off' && a.date === today);

    // Top 3 priorities
    const top3Titles = (execRhythm.top3 || []).filter(t => t.title && !t.completed).map(t => t.title);

    // Urgent regulatory
    const regulatory = this.store.list('ops_regulatory') || [];
    const urgentLicenses = regulatory.filter(r => {
      const days = r.expirationDate ? Math.ceil((Date.parse(r.expirationDate) - Date.now()) / 86400000) : NaN;
      return Number.isFinite(days) && days <= 30;
    });

    const script = `${this.core.executiveDemo ? 'DEMO DATA — NOT FOR CLINICAL USE\n' : ''}Good morning. Here is your facility briefing for ${today}.

Imported active-resident count: ${activeCensus ?? 'not available'}. Verify report dates; this is not current census confirmation. Recorded admission plans: ${pendingAdmits.length}: ${pendingAdmits.map(p => `${p.roomNumber} (${p.targetAdmitTime || 'time not recorded'})`).join(', ') || 'none recorded'}.

Regarding overnight staffing: ${recentCallOffs.length ? `${recentCallOffs.length} call-off record(s) found for this date: ${recentCallOffs.map(c => c.employeeName).join(', ')}.` : 'No call-offs are present in the records for this date; staffing coverage is not established.'}

Your Top Non-Negotiable priorities for today:
${top3Titles.length ? top3Titles.map((t, idx) => `${idx + 1}. ${t}`).join('\n') : 'No priorities recorded. Review and set them in Executive Desk.'}

${urgentLicenses.length ? `Regulatory Reminder: ${urgentLicenses[0].title} is due for renewal in under 30 days.` : 'No near-term renewal is present in saved records; verify the complete license register.'}

You are well prepared for the day ahead. Have a productive morning.`;

    return {
      generatedAt: Date.now(),
      date: today,
      activeCensus,
      pendingAdmissionsCount: pendingAdmits.length,
      overnightCallOffsCount: recentCallOffs.length,
      top3Priorities: top3Titles,
      audioScript: script,
      estimatedListenTimeSeconds: 65
    };
  }

  // -------------------------------------------------------------
  // 5. Vendor Contract & Quote "Gotcha" Scanner
  // -------------------------------------------------------------
  scanContractText(contractText) {
    if (!contractText || typeof contractText !== 'string') throw fail('INVALID');

    const lower = contractText.toLowerCase();
    const findings = [];

    // 1. Auto-Renewal Traps
    const autoRenewMatch = contractText.match(/(automatically\s+renew[a-z]*|successive\s+terms?|auto-renew[a-z]*)[^.!?\n]{0,200}/i);
    const noticeDaysMatch = contractText.match(/(\d{2,3})\s*days?(?:'|\s)?\s*(?:prior\s+written|advance\s+written)?\s*notice/i);
    if (autoRenewMatch || noticeDaysMatch) {
      findings.push({
        severity: 'high',
        category: 'Auto-Renewal Clause',
        headline: `Automatic Renewal Window Detected (${noticeDaysMatch ? noticeDaysMatch[1] : '30-90'} Days Notice Required)`,
        excerpt: (autoRenewMatch ? autoRenewMatch[0] : '') + (noticeDaysMatch ? ` [Notice: ${noticeDaysMatch[0]}]` : ''),
        recommendation: 'Calendar the written cancellation deadline at least 15 days ahead of the required notice window to prevent unintended contract lock-in.'
      });
    }

    // 2. Minimum Shift Hours / Cancellation Penalty (Staffing Agencies)
    const minHoursMatch = contractText.match(/(minimum\s+(?:of\s+)?(\d)\s+hours?|guaranteed\s+(\d)\s+hours?)/i);
    const cancelPenaltyMatch = contractText.match(/(cancellation\s+fee|cancel[a-z]*\s+within\s+(\d+)\s+hours?)/i);
    if (minHoursMatch || cancelPenaltyMatch) {
      findings.push({
        severity: 'high',
        category: 'Shift Minimum & Cancellation Penalty',
        headline: 'Agency Guaranteed Shift Minimum & Cancellation Fee',
        excerpt: (minHoursMatch ? minHoursMatch[0] : '') + (cancelPenaltyMatch ? ` | ${cancelPenaltyMatch[0]}` : ''),
        recommendation: 'Ensure floor schedulers cancel unneeded agency shifts before the penalty cutoff to avoid 4-to-8 hour unworked billing penalties.'
      });
    }

    // 3. Price Escalators / Annual Rate Increases
    const escalatorMatch = contractText.match(/(annual\s+increase|price\s+adjustment|escalat[a-z]*\s+by\s+(\d+(?:\.\d+)?%?)|cpi(?:\s*[-+]\s*\d+%)?)/i);
    if (escalatorMatch) {
      findings.push({
        severity: 'medium',
        category: 'Price Escalator / Rate Increase',
        headline: 'Annual Rate Escalation Clause',
        excerpt: escalatorMatch[0],
        recommendation: 'Caps annual increases to CPI or negotiate a fixed multi-year rate lock.'
      });
    }

    // 4. Overtime Multipliers & Holiday Rates
    const otMatch = contractText.match(/(1\.5x|time\s+and\s+a\s+half|double\s+time|holiday\s+rate|bill\s+rate\s+multiplier)/i);
    if (otMatch) {
      findings.push({
        severity: 'medium',
        category: 'Overtime & Holiday Premium Multiplier',
        headline: 'Premium Rate Multiplier Identified',
        excerpt: otMatch[0],
        recommendation: 'Review agency holidays list; some agencies charge premium rates on minor state holidays.'
      });
    }

    return {
      wordCount: contractText.split(/\s+/).length,
      totalGotchasFound: findings.length,
      riskLevel: findings.some(f => f.severity === 'high') ? 'High Risk — Review Closely' : findings.length ? 'Moderate Risk' : 'Standard Terms',
      findings
    };
  }

  // -------------------------------------------------------------
  // 6. Difficult Conversation & HR Scripting Coach
  // -------------------------------------------------------------
  generateDifficultConvoScript(scenario, details = {}) {
    switch (scenario) {
      case 'termination_attendance': {
        const employeeName = details.employeeName || 'Staff Member';
        const points = details.points || '[verified attendance record not provided]';
        const lastIncident = details.lastIncident || '[reviewed incident not provided]';

        return {
          scenarioTitle: `Disciplinary Separation: Excessive Attendance Violations (${employeeName})`,
          coreObjectives: [
            'Communicate the decision clearly, objectively, and without debate.',
            'Reference documented prior warnings and facility policy.',
            'Maintain dignity while keeping the meeting under 7 minutes.'
          ],
          talkingPoints: [
            `"${employeeName}, thank you for coming in today. I've asked you here to discuss your employment status with our facility."`,
            `"As we discussed in your written warning on ${details.warningDate || '[verified warning date not provided]'}, our facility attendance policy requires consistent presence to ensure direct-care resident coverage."`,
            `"Following your ${lastIncident}, you have reached ${points}. HR must verify applicable policy, protected leave, accommodations and the reviewed decision before this discussion."`,
            `"[Have HR verify any decision, required notices, pay and benefits details before including them.]"`
          ],
          deEscalationTips: [
            'DRAFT FOR HR REVIEW: hear and document relevant facts before deciding any action.',
            'If they become upset: "I understand this is frustrating. We will review the documented facts and applicable policy with HR."',
            'Have a second supervisor or HR representative present as a witness.'
          ]
        };
      }

      case 'irate_family_care': {
        const familyName = details.familyName || 'Family Member';
        const residentName = details.residentName || '[resident not provided]';
        const concern = details.concern || '[concern not provided]';

        return {
          scenarioTitle: `De-Escalation Conference: Upset Family Member (${familyName})`,
          coreObjectives: [
            'Listen without defensive interruptions for the first 3 minutes.',
            'Validate their frustration and establish shared commitment to resident comfort.',
            'Agree on 2 concrete, verifiable action steps with a 48-hour follow-up deadline.'
          ],
          talkingPoints: [
            `"${familyName}, I asked to meet with you because I want to hear directly from you about your experience regarding ${residentName}."`,
            `"First, I want to apologize that your experience did not meet the standard of care we hold ourselves to. You are right to want prompt attention for ${residentName}."`,
            `"Here is what I am doing immediately: [Agree on appropriate review steps and owners for the reported concern; do not claim actions have already occurred.]"`,
            `"[Confirm a follow-up date, responsible person and approved contact details together.]"`
          ],
          deEscalationTips: [
            'Never say "We are short-staffed." Families hear this as an excuse that compromises safety.',
            'Take visible notes while they speak; it shows their concerns are being formally documented.',
            'Focus on "Here is what we are changing" rather than defending why the issue happened.'
          ]
        };
      }

      default:
        throw fail('INVALID');
    }
  }

  // -------------------------------------------------------------
  // 7. 14-Day Proactive Operational Conflict Radar
  // -------------------------------------------------------------
  getConflictRadar(daysAhead = 14) {
    this.core.assertUnlocked();
    const now = Date.now();
    const futureTime = now + (daysAhead * 86400000);

    const conflicts = [];

    // Check regulatory expirations in next 14 days
    const regulatory = this.store.list('ops_regulatory') || [];
    regulatory.forEach(r => {
      const exp = new Date(r.expirationDate).getTime();
      if (exp >= now && exp <= futureTime) {
        conflicts.push({
          date: r.expirationDate,
          type: 'regulatory_deadline',
          severity: 'high',
          headline: `Regulatory Expiration: ${r.title}`,
          description: `Expiring on ${r.expirationDate}. Responsible: ${r.responsibleParty}. Immediate renewal submission required.`
        });
      }
    });

    // Simulated standard scheduled drills & corporate dates for facility calendar
    const fixedMilestones = this.core.executiveDemo ? [
      { date: new Date(now + (3 * 86400000)).toISOString().slice(0, 10), type: 'fire_drill', headline: 'Quarterly Unannounced Fire Drill (3-11 Evening Shift)', department: 'maintenance' },
      { date: new Date(now + (7 * 86400000)).toISOString().slice(0, 10), type: 'payroll_cutoff', headline: 'Bi-Weekly Payroll Final Approval & Timecard Lock (12:00 PM)', department: 'business_office' },
      { date: new Date(now + (10 * 86400000)).toISOString().slice(0, 10), type: 'generator_test', headline: 'Emergency Standby Generator Monthly Transfer Switch Test', department: 'maintenance' }
    ] : [];

    fixedMilestones.forEach(m => {
      conflicts.push({
        date: m.date,
        type: m.type,
        severity: m.type === 'payroll_cutoff' ? 'high' : 'medium',
        headline: m.headline,
        description: `Scheduled operational event requiring leadership sign-off.`
      });
    });

    return conflicts.sort((a, b) => new Date(a.date) - new Date(b.date));
  }
}

function dispatch(core, op, data) {
  const engine = new ExecutiveAssistantEngine(core);
  switch (op) {
    case 'assistantGhostwrite': return engine.generateDraft(data?.type, data?.context || {});
    case 'assistantMeetingDossier': return engine.generateMeetingDossier(data?.attendeeType, data?.attendeeName, data?.departmentId);
    case 'assistantParseVoiceMemo': return engine.parseVoiceMemo(data?.transcript);
    case 'assistantCommuteBriefing': return engine.generateCommuteBriefing();
    case 'assistantScanContract': return engine.scanContractText(data?.contractText);
    case 'assistantDifficultConvoScript': return engine.generateDifficultConvoScript(data?.scenario, data?.details || {});
    case 'assistantConflictRadar': return engine.getConflictRadar(data?.daysAhead);

    default:
      throw fail('INVALID');
  }
}

module.exports = {
  ExecutiveAssistantEngine,
  dispatch
};
