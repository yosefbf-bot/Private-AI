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
    this.core = core;
  }

  get store() {
    return this.core.store;
  }

  // -------------------------------------------------------------
  // 1. Context-Aware Ghostwriter
  // -------------------------------------------------------------
  generateDraft(type, context = {}) {
    this.core.assertUnlocked();
    const facilityName = context.facilityName || 'Meadowbrook Care & Rehabilitation Center';
    const senderTitle = context.senderTitle || 'Facility Administrator (LNHA)';

    switch (type) {
      case 'family_inquiry': {
        const familyName = context.familyName || 'Family Member';
        const residentName = context.residentName || 'your loved one';
        const topic = context.topic || 'their care plan and daily activities';
        const department = context.department || 'Nursing and Therapy';

        const subject = `Update regarding ${residentName} — ${facilityName}`;
        const body = `Dear ${familyName},

Thank you for reaching out to us regarding ${residentName} and ${topic}. We deeply appreciate your involvement in their care.

I reviewed this directly with our Director of Nursing and the ${department} team this morning. We are actively ensuring that all individualized preferences and physician-directed interventions are being followed. ${context.specificUpdate || 'Their therapy progress is being documented daily, and our team is monitoring their nutrition and comfort closely.'}

I want to make sure you have complete peace of mind. Would you have 10 minutes tomorrow afternoon to speak over the phone, or would you like to join us for a brief care conference with our team?

Please don't hesitate to reach out to me directly at any time.

Warm regards,

Facility Administrator, LNHA
${facilityName}`;
        return { subject, body, type };
      }

      case 'corporate_staffing': {
        const period = context.period || 'this past weekend';
        const totalOT = context.totalOT || '18 hours';
        const agencyShifts = context.agencyShifts || '2 CNA shifts';
        const rootCause = context.rootCause || 'two acute short-notice call-offs on 3-11 West Wing';
        const hiringAction = context.hiringAction || 'currently interviewing 3 CNA candidates with 1 conditional offer extended';

        const subject = `Operations Brief: Weekend Staffing & Premium Hours Analysis — ${facilityName}`;
        const body = `Hi Team,

Below is the operational breakdown of our staffing hours and premium labor utilization for ${period}:

1. Summary of Variances:
   • Total Overtime Incurred: ${totalOT}
   • Contract Agency Utilization: ${agencyShifts}
   • Primary Driver: Direct-care coverage required due to ${rootCause}.

2. Actions Taken to Minimize Spend:
   • All available PRN and part-time staff were canvassed first; non-overtime options were exhausted before authorizing coverage.
   • Direct-care CMS/State HPPD minimums were strictly maintained across all shifts without over-staffing.
   • Overtime was contained to high-census subacute units rather than facility-wide.

3. Ongoing Mitigation & Recruitment:
   • Active Pipeline: We are ${hiringAction}.
   • New hire orientation is scheduled for Monday, adding core hours to the 3-11 rotation to permanently eliminate this weekend agency gap.

Please let me know if you would like me to review the detailed OnShift Schedule-vs-Actual report during our weekly ops review.

Best,

${senderTitle}
${facilityName}`;
        return { subject, body, type };
      }

      case 'physician_followup': {
        const physicianName = context.physicianName || 'Dr. Smith';
        const residentName = context.residentName || 'Resident in Room 204';
        const clinicalNeed = context.clinicalNeed || 'signed telephone orders and a clarification on the antibiotic start';
        const urgency = context.urgency || 'routine';

        const subject = `${urgency === 'urgent' ? 'URGENT: ' : ''}Clinical Order Clarification — ${residentName} (Room ${context.room || '204'})`;
        const body = `Dear ${physicianName},

Good day. Our nursing team at ${facilityName} requires your review on ${residentName}:

• Clinical Concern: ${clinicalNeed}
• Current Vitals / Status: ${context.vitals || 'Vitals stable; no acute respiratory distress.'}
• Order / Document Needed: ${context.documentNeeded || 'Signed clarification order via fax / portal.'}

Could you please review and return your order at your earliest convenience? Our fax line is (555) 019-2834, or you may call the charge nurse station directly at (555) 019-2830.

Thank you for your ongoing partnership in resident care.

Sincerely,

${senderTitle}
${facilityName}`;
        return { subject, body, type };
      }

      default:
        throw fail('INVALID');
    }
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
      talkingPoints.push('All delegated tasks currently completed; focus on forward-looking QA and upcoming survey readiness.');
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
    const activeCensus = residents.length ? residents.filter(r => r.status === 'Active').length : 118;

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
      const days = Math.ceil((new Date(r.expirationDate).getTime() - Date.now()) / 86400000);
      return days <= 30;
    });

    const script = `Good morning. Here is your facility briefing for ${today}.

Current census is steady at ${activeCensus} residents. You have ${pendingAdmits.length} admission(s) planned for this afternoon: ${pendingAdmits.map(p => `${p.roomNumber} (${p.targetAdmitTime || 'afternoon'})`).join(', ') || 'none pending'}.

Regarding overnight staffing: ${recentCallOffs.length ? `${recentCallOffs.length} call-off was logged on night shift: ${recentCallOffs.map(c => c.employeeName).join(', ')}.` : 'No critical overnight call-offs were reported.'}

Your Top Non-Negotiable priorities for today:
${top3Titles.length ? top3Titles.map((t, idx) => `${idx + 1}. ${t}`).join('\n') : '1. Set morning priorities in Executive Desk.\n2. Lead 10:00 AM Department Head Huddle.'}

${urgentLicenses.length ? `Regulatory Reminder: ${urgentLicenses[0].title} is due for renewal in under 30 days.` : 'All primary facility licenses and CLIA certifications are in active standing.'}

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
        const points = details.points || '6.5 points (threshold is 5.0)';
        const lastIncident = details.lastIncident || 'unexcused weekend call-off on Saturday';

        return {
          scenarioTitle: `Disciplinary Separation: Excessive Attendance Violations (${employeeName})`,
          coreObjectives: [
            'Communicate the decision clearly, objectively, and without debate.',
            'Reference documented prior warnings and facility policy.',
            'Maintain dignity while keeping the meeting under 7 minutes.'
          ],
          talkingPoints: [
            `"${employeeName}, thank you for coming in today. I've asked you here to discuss your employment status with our facility."`,
            `"As we discussed in your written warning on ${details.warningDate || 'last month'}, our facility attendance policy requires consistent presence to ensure direct-care resident coverage."`,
            `"Following your ${lastIncident}, you have reached ${points}. Because this exceeds our attendance threshold, today will be your final day of employment with us."`,
            `"We have your final paycheck prepared, including all accrued time. Our HR coordinator will walk you through your benefits continuation paperwork."`
          ],
          deEscalationTips: [
            'Do NOT argue or re-litigate past call-off reasons. The decision is already made.',
            'If they become upset: "I understand this is frustrating. The decision is final based on the objective attendance policy that applies to all staff."',
            'Have a second supervisor or HR representative present as a witness.'
          ]
        };
      }

      case 'irate_family_care': {
        const familyName = details.familyName || 'Family Member';
        const residentName = details.residentName || 'your mother';
        const concern = details.concern || 'call light wait times and laundry';

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
            `"Here is what I am doing immediately: I am having our Director of Nursing audit the call light logs on this wing for the past 72 hours, and our housekeeping manager is personally inventorying ${residentName}'s wardrobe today."`,
            `"I will call you personally on Thursday at 2:00 PM with the findings and the permanent resolution. Here is my direct facility extension."`
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
    const fixedMilestones = [
      { date: new Date(now + (3 * 86400000)).toISOString().slice(0, 10), type: 'fire_drill', headline: 'Quarterly Unannounced Fire Drill (3-11 Evening Shift)', department: 'maintenance' },
      { date: new Date(now + (7 * 86400000)).toISOString().slice(0, 10), type: 'payroll_cutoff', headline: 'Bi-Weekly Payroll Final Approval & Timecard Lock (12:00 PM)', department: 'business_office' },
      { date: new Date(now + (10 * 86400000)).toISOString().slice(0, 10), type: 'generator_test', headline: 'Emergency Standby Generator Monthly Transfer Switch Test', department: 'maintenance' }
    ];

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
