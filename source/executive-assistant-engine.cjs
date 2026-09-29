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
    if (!transcript || typeof transcript !== 'string') {
      throw fail('INVALID');
    }

    const lower = transcript.toLowerCase();
    const extractedActions = [];

    // Helper: extract room numbers
    const roomMatch = transcript.match(/\broom\s*#?\s*(\d{2,3}[a-z]?)\b/i);
    const detectedRoom = roomMatch ? roomMatch[1] : null;

    // 1. Maintenance Detection
    const maintKeywords = ['maintenance', 'ac', 'air condition', 'heater', 'hvac', 'leak', 'sink', 'toilet', 'light', 'door', 'bed', 'remote', 'handrail', 'paint', 'scuff', 'plumbing'];
    if (maintKeywords.some(k => lower.includes(k))) {
      // Find sentence or fragment mentioning maintenance
      const clauses = transcript.split(/[,.;]|\band\b/i);
      const maintClause = clauses.find(c => maintKeywords.some(k => c.toLowerCase().includes(k))) || transcript;

      extractedActions.push({
        id: uuid(),
        targetModule: 'rounds_maintenance',
        type: 'Work Order / Maintenance Ticket',
        destination: 'Director of Maintenance',
        location: detectedRoom ? `Room ${detectedRoom}` : 'Facility / Unit',
        description: maintClause.trim(),
        urgency: /leak|emergency|hot|cold|danger/i.test(maintClause) ? 'urgent' : 'high',
        autoCommitPayload: {
          location: detectedRoom ? `Room ${detectedRoom}` : 'Facility',
          category: 'maintenance',
          description: maintClause.trim(),
          urgency: /leak|hot|cold|alarm/i.test(maintClause) ? 'urgent' : 'high'
        }
      });
    }

    // 2. Dietary Detection
    const dietaryKeywords = ['dietary', 'kitchen', 'food', 'meal', 'soup', 'cold', 'tray', 'pureed', 'texture', 'supper', 'lunch', 'breakfast'];
    if (dietaryKeywords.some(k => lower.includes(k))) {
      const clauses = transcript.split(/[,.;]|\band\b/i);
      const dietClause = clauses.find(c => dietaryKeywords.some(k => c.toLowerCase().includes(k))) || transcript;

      extractedActions.push({
        id: uuid(),
        targetModule: 'dept_task_dietary',
        type: 'Dietary Department Action',
        destination: 'Food & Nutrition Director',
        location: detectedRoom ? `Room ${detectedRoom}` : 'Dining / Kitchen',
        description: dietClause.trim(),
        urgency: 'high',
        autoCommitPayload: {
          departmentId: 'dietary',
          title: `[Dietary] ${detectedRoom ? `Room ${detectedRoom}: ` : ''}${dietClause.trim().slice(0, 100)}`,
          description: dietClause.trim(),
          priority: 'high'
        }
      });
    }

    // 3. HR / Staff Recognition or Coaching
    const hrKeywords = ['cna', 'nurse', 'aide', 'stayed late', 'helped', 'overtime', 'call off', 'great job', 'recognition', 'warning', 'tardy', 'attendance'];
    if (hrKeywords.some(k => lower.includes(k))) {
      const clauses = transcript.split(/[,.;]|\band\b/i);
      const hrClause = clauses.find(c => hrKeywords.some(k => c.toLowerCase().includes(k))) || transcript;
      const isCommendation = /stayed|great|helped|wonderful|appreciate|hero/i.test(hrClause);

      extractedActions.push({
        id: uuid(),
        targetModule: 'hr_coaching',
        type: isCommendation ? 'HR Commendation / Recognition' : 'HR Counseling / Note',
        destination: 'Staff Member Record',
        description: hrClause.trim(),
        urgency: 'normal',
        autoCommitPayload: {
          type: isCommendation ? 'commendation' : 'verbal',
          topic: isCommendation ? 'Staff Recognition / Dedication' : 'Performance Follow-Up',
          details: hrClause.trim()
        }
      });
    }

    // 4. Administrator Follow-Up / Outgoing Call
    const callKeywords = ['remind me', 'call', 'follow up', 'doctor', 'dr.', 'pharmacy', 'contact', 'reach out', 'check on'];
    if (callKeywords.some(k => lower.includes(k))) {
      const clauses = transcript.split(/[,.;]|\band\b/i);
      const callClause = clauses.find(c => callKeywords.some(k => c.toLowerCase().includes(k))) || transcript;

      extractedActions.push({
        id: uuid(),
        targetModule: 'exec_action',
        type: 'Administrator Follow-Up Commitment',
        destination: 'Executive Action Queue',
        description: callClause.trim(),
        urgency: 'high',
        autoCommitPayload: {
          title: callClause.trim().slice(0, 150),
          type: 'commitment',
          source: 'hallway',
          urgency: 'high',
          description: callClause.trim()
        }
      });
    }

    // Fallback if none matched
    if (!extractedActions.length) {
      extractedActions.push({
        id: uuid(),
        targetModule: 'exec_action',
        type: 'General Executive Action Item',
        destination: 'Executive Action Queue',
        description: transcript.trim(),
        urgency: 'high',
        autoCommitPayload: {
          title: transcript.trim().slice(0, 150),
          type: 'commitment',
          source: 'hallway',
          urgency: 'high',
          description: transcript.trim()
        }
      });
    }

    return {
      rawTranscript: transcript,
      detectedRoom,
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
