'use strict';

/**
 * Operations Intelligence + Meeting Copilot Subsystem
 *
 * Operational KPI Command Center, Morning Standup Huddle Briefing,
 * In-Session Real-Time Meeting Copilot, Agenda Tracking,
 * Action Item Extraction, and Clinical Surveillance Sentinel.
 */

const { fail, isId, text, uuid } = require('./security.cjs');
const { SBAREngine, FACILITY_PROTOCOLS, SBAR_TEMPLATES, COMMUNICATION_TARGETS } = require('./sbar-engine.cjs');
const { NON_SPEECH_PATTERNS, AudioQualityAssessor, SpeakerRecognitionService } = require('./meeting-audio-pipeline.cjs');

// Standard SNF Meeting Template Agendas
const MEETING_TEMPLATES = {
  general: {name: "Meeting", type: "general", defaultAttendees: [], agenda: []},
  morning_huddle: {
    name: 'Morning Standup / Daily Huddle',
    type: 'morning_huddle',
    defaultAttendees: [
      { name: 'Facility Administrator', role: 'Administrator', department: 'Administration' },
      { name: 'Director of Nursing (DON)', role: 'DON', department: 'Nursing' },
      { name: 'Assistant DON (ADON)', role: 'ADON', department: 'Nursing' },
      { name: 'MDS / Clinical Reimbursement Coordinator', role: 'MDS Coordinator', department: 'Clinical' },
      { name: 'Director of Rehabilitation / PT', role: 'Therapy', department: 'Therapy' },
      { name: 'Social Services Director', role: 'Social Services', department: 'Social Services' },
      { name: 'Dietitian / Food & Nutrition Director', role: 'Dietary', department: 'Dietary' },
      { name: 'Maintenance & Environmental Director', role: 'Maintenance', department: 'Operations' }
    ],
    agenda: [
      { id: 'ag_census', title: 'Census & Occupancy Review (Admissions, Discharges, Bed Holds)', completed: false },
      { id: 'ag_overnight', title: '24-Hour Clinical Events & Overnight Incidents (Falls, ER Transfers)', completed: false },
      { id: 'ag_new_meds', title: 'New High-Risk & Psychotropic Medications Review', completed: false },
      { id: 'ag_staffing', title: 'Daily Staffing Roster, HPPD Gaps & Agency Coverage', completed: false },
      { id: 'ag_rehab', title: 'Therapy Caseload, Discharge Planning & Functional Updates', completed: false },
      { id: 'ag_actions', title: 'Action Items Assignment & Immediate Safety Priorities', completed: false }
    ]
  },
  clinical_idt: {
    name: 'Clinical & Interdisciplinary Team (IDT) Review',
    type: 'clinical_idt',
    defaultAttendees: [
      { name: 'Director of Nursing', role: 'DON', department: 'Nursing' },
      { name: 'MDS Coordinator', role: 'MDS Coordinator', department: 'Clinical' },
      { name: 'Physician / Medical Director', role: 'Medical Director', department: 'Medical' },
      { name: 'Consultant Pharmacist', role: 'Pharmacist', department: 'Pharmacy' },
      { name: 'Wound Care Specialist', role: 'Wound Care Nurse', department: 'Nursing' },
      { name: 'Physical / Occupational Therapist', role: 'Therapy', department: 'Therapy' }
    ],
    agenda: [
      { id: 'ag_crit_alerts', title: 'Active Critical Clinical Surveillance Alerts', completed: false },
      { id: 'ag_psych_gdr', title: 'Psychotropic Medication Monitoring & Gradual Dose Reduction (GDR)', completed: false },
      { id: 'ag_skin_wounds', title: 'Pressure Injury & Skin Integrity Weekly Audit', completed: false },
      { id: 'ag_weight_loss', title: 'Unplanned Weight Loss & Nutritional Decline Interventions', completed: false },
      { id: 'ag_infections', title: 'Infection Control, McGeer Surveillance & Antibiotic Stewardship', completed: false },
      { id: 'ag_care_plans', title: 'Comprehensive Care Plan Updates & F-Tag Risk Alignment', completed: false }
    ]
  },
  shift_handoff: {
    name: 'Shift-to-Shift Clinical Handoff',
    type: 'shift_handoff',
    defaultAttendees: [
      { name: 'Outgoing Charge Nurse', role: 'Staff Nurse', department: 'Nursing' },
      { name: 'Incoming Charge Nurse', role: 'Staff Nurse', department: 'Nursing' },
      { name: 'Shift Unit Supervisor', role: 'Nurse Supervisor', department: 'Nursing' }
    ],
    agenda: [
      { id: 'ag_acute_status', title: 'Acute Resident Status & Unstable Vitals', completed: false },
      { id: 'ag_pending_labs', title: 'Pending Labs, Diagnostics & MD Callbacks', completed: false },
      { id: 'ag_new_orders', title: 'Orders Received This Shift & Verification Status', completed: false },
      { id: 'ag_iv_wounds', title: 'IV Lines, Catheters, Complex Dressings & Treatments Due', completed: false },
      { id: 'ag_behavior_fall', title: 'Behaviors, Fall Precautions & 1-on-1 Resident Watches', completed: false }
    ]
  },
  safety_qaa: {
    name: 'Facility Safety, QAA & Incident Review',
    type: 'safety_qaa',
    defaultAttendees: [
      { name: 'Facility Administrator', role: 'Administrator', department: 'Administration' },
      { name: 'DON', role: 'DON', department: 'Nursing' },
      { name: 'Risk & Quality Coordinator', role: 'Quality Lead', department: 'Quality' },
      { name: 'Safety Officer', role: 'Safety', department: 'Operations' }
    ],
    agenda: [
      { id: 'ag_fall_trends', title: 'Fall Incident Log, Root Causes & Environmental Factors', completed: false },
      { id: 'ag_hospital_readmit', title: '30-Day Hospital Transfers & Re-admission Root Cause Analysis', completed: false },
      { id: 'ag_survey_readiness', title: 'Annual Survey Readiness & Top F-Tag Vulnerabilities', completed: false },
      { id: 'ag_qaa_plans', title: 'Active Performance Improvement Projects (PIPs)', completed: false }
    ]
  }
};

// Clinical entities keywords detector for live sentinel radar
const CLINICAL_ENTITIES_PATTERNS = [
  { category: 'fall', label: 'Fall / Incident', regex: /\b(fell|fall|fallen|drop|floor|unwitnessed fall|rolled out of bed|slip|incident)\b/i, severity: 'critical' },
  { category: 'wound', label: 'Skin / Wound', regex: /\b(pressure ulcer|wound|unstageable|stage (?:ii|iii|iv|2|3|4)|skin tear|shearing|eschar|slough|dressing|exudate)\b/i, severity: 'high' },
  { category: 'psychotropic', label: 'Psychotropic Medication', regex: /\b(antipsychotic|haldol|haloperidol|seroquel|quetiapine|risperdal|risperidone|zyprexa|olanzapine|ativan|lorazepam|xanax|alprazolam|depakote|gdr|dose reduction)\b/i, severity: 'high' },
  { category: 'infection', label: 'Infection / Antibiotic', regex: /\b(uti|urinary tract|sepsis|pneumonia|c\.?\s*diff|mrsa|antibiotic|vancomycin|rocephin|ceftriaxone|fever|culture|isolation)\b/i, severity: 'high' },
  { category: 'vitals', label: 'Vitals / Acute Change', regex: /\b(hypotension|tachycardia|bradycardia|o2 sat|hypoxia|unresponsive|lethargic|shortness of breath|sob|chest pain|stroke|code|transfer to er|911|er transfer)\b/i, severity: 'critical' },
  { category: 'nutrition', label: 'Weight / Nutrition', regex: /\b(weight loss|unplanned weight|dysphagia|choking|aspiration|tube feeding|pegs?|pureed|intake decline)\b/i, severity: 'medium' },
  { category: 'behavior', label: 'Behavioral Symptom', regex: /\b(agitation|combative|wandering|elopement|screaming|resisting care|hallucination|delusion|sundowning)\b/i, severity: 'high' },
  { category: 'dialysis', label: 'Dialysis / Renal', regex: /\b(dialysis|hemodialysis|fistula|graft|fluid restriction|creatinine|bun)\b/i, severity: 'medium' }
];

// Common action phrase patterns for auto-detection
const ACTION_ITEM_PATTERNS = [
  /\b(will|to|needs to|responsible for|follow up on|schedule|order|call|check|review|reassess|evaluate|update|contact|fax|send|prepare)\s+([^.!?]+)/i
];

class OperationsCopilotEngine {
  constructor(core) {
    this.core = core;
  }

  get store() {
    return this.core.store;
  }

  // -------------------------------------------------------------
  // Operations Intelligence Summary & Metrics
  // -------------------------------------------------------------
  getOperationsSummary() {
    this.core.assertUnlocked();
    const snf = this.core.snf;
    const now = Date.now();
    const since24h = now - 86400000;
    const since7d = now - (7 * 86400000);

    // 1. Alert counts from SNF command center
    const alerts = this.store.list('snf_alert') || [];
    const criticalAlerts = alerts.filter(a => a.severity === 'critical' && a.status !== 'resolved');
    const highAlerts = alerts.filter(a => a.severity === 'high' && a.status !== 'resolved');
    const reviewAlerts = alerts.filter(a => a.severity === 'medium' && a.status !== 'resolved');
    const alertsLast24h = alerts.filter(a => (a.firstDetected || 0) >= since24h);

    // Imported records are evidence, not a live census or a payer census.
    const censusRecords = this.store.list('snf_resident') || [];
    const totalBeds = null;
    const activeResidents = censusRecords.length ? censusRecords.filter(r => r.status === 'Active').length : null;
    const occupancyRate = null;
    const payerMix = {medicareA: null, medicaid: null, managedCare: null, privatePay: null};

    // 3. Clinical Incidents & Surveillance Velocity
    const fallAlerts24h = alerts.filter(a => a.code === 'FALL_INCIDENT' && (a.firstDetected || 0) >= since24h).length;
    const fallAlerts7d = alerts.filter(a => a.code === 'FALL_INCIDENT' && (a.firstDetected || 0) >= since7d).length;
    const activeWoundAlerts = alerts.filter(a => a.code === 'WOUND_PRESSURE' && a.status !== 'resolved').length;
    const activeInfectionAlerts = alerts.filter(a => a.code === 'INFECTION_SURVEILLANCE' && a.status !== 'resolved').length;
    const activePsychAlerts = alerts.filter(a => /^(AP-|PRN-|GDR-|PSYCH-|PHARM-)/.test(a.code) && a.status !== 'resolved').length;
    const hospitalTransfers24h = alerts.filter(a => a.code === 'ACUTE_TRANSFER' && (a.firstDetected || 0) >= since24h).length;

    // Aggregate staffing snapshots are exposed separately by date/unit; no facility-wide coverage or compliance is inferred.
    const staffingStatus = {
      available: false, rnCompliant: null, totalCompliant: null,
      actualRnHppd: null, targetRnHppd: null, actualTotalHppd: null, targetTotalHppd: null,
      dayShiftStaff: {}, eveningShiftStaff: {}, nightShiftStaff: {}, openGaps: []
    };
    const surveyRadar = [];
    const dataHealth = snf?.getFeedStatus?.() || {isSurveillanceComplete: false};

    // 6. Meetings Summary
    const meetings = this.listMeetings();
    const meetingsToday = meetings.filter(m => {
      const dt = new Date(m.date);
      const today = new Date();
      return dt.getFullYear() === today.getFullYear() &&
             dt.getMonth() === today.getMonth() &&
             dt.getDate() === today.getDate();
    });
    const pendingActionItems = meetings.reduce((acc, m) => {
      return acc + (m.actionItems || []).filter(a => a.status !== 'completed').length;
    }, 0);

    // 7. SBAR & Communication Telemetry
    const sbars = this.store.list('sbar') || [];
    const pendingCallbacks = sbars.filter(s => s.closeTheLoop?.stage === 'awaiting_callback' || (s.notifications || []).some(n => n.outcome === 'awaiting_callback' && !s.closeTheLoop?.isComplete));
    const draftSbars = sbars.filter(s => s.status === 'draft');
    const finalizedSbars = sbars.filter(s => s.status === 'finalized');

    // 8. Command Center Integrated Alerting
    const commandCenter = {
      needsAttention: [
        ...criticalAlerts.map(a => ({ type: 'critical_alert', title: `[${a.code}] ${a.residentName || 'Resident'}`, detail: a.message, id: a.id })),
        ...pendingCallbacks.map(s => ({ type: 'provider_callback_pending', title: `Provider Callback Pending: ${s.residentName}`, detail: `SBAR concern: ${s.situation?.concern || 'Condition change'}. Awaiting MD callback.`, id: s.id }))
      ],
      followUps: [
        ...pendingCallbacks.map(s => ({ type: 'sbar_callback', title: `Callback not documented: ${s.residentName}`, sbarId: s.id })),
        ...(this.store.list('todo') || []).filter(t => t.status === 'pending').map(t => ({ type: 'action_todo', title: t.title, id: t.id, priority: t.priority }))
      ],
      meetingActions: meetings.flatMap(m => (m.actionItems || []).filter(a => a.status !== 'completed').map(a => ({ meetingTitle: m.title, task: a.task, assignee: a.assignee, priority: a.priority, dueDate: a.dueDate, convertedTodoId: a.convertedTodoId }))),
      automationHealth: {
        status: dataHealth.isSurveillanceComplete ? 'Imported feeds available' : 'Incomplete imported feeds',
        surveillanceActive: !!dataHealth.isSurveillanceComplete,
        audioPipelineReady: false,
        lastCheck: now
      }
    };

    return {
      facilityName: snf?.getSettings?.().facilityName || 'Facility name not configured',
      demo: !!snf?.demoMode,
      dataHealth,
      timestamp: now,
      census: {
        totalBeds,
        activeResidents,
        availableBeds: null,
        occupancyRate,
        payerMix
      },
      surveillance: {
        criticalAlertsCount: criticalAlerts.length,
        highAlertsCount: highAlerts.length,
        reviewAlertsCount: reviewAlerts.length,
        alertsLast24hCount: alertsLast24h.length,
        fallAlerts24h,
        fallAlerts7d,
        activeWoundAlerts,
        activeInfectionAlerts,
        activePsychAlerts,
        hospitalTransfers24h
      },
      staffing: staffingStatus,
      measuredOperations: require("./workflows/imports.cjs").metrics({store:this.store}).days,
      surveyRadar,
      meetings: {
        total: meetings.length,
        todayCount: meetingsToday.length,
        pendingActionItemsCount: pendingActionItems,
        latestMeeting: meetings.sort((a, b) => (b.date || 0) - (a.date || 0))[0] || null
      },
      sbars: {
        total: sbars.length,
        draftCount: draftSbars.length,
        finalizedCount: finalizedSbars.length,
        pendingCallbacksCount: pendingCallbacks.length,
        pendingCallbacks
      },
      commandCenter
    };
  }

  // -------------------------------------------------------------
  // Morning Standup Huddle Briefing Generator
  // -------------------------------------------------------------
  generateMorningHuddleBrief({includeChecklist = false} = {}) {
    this.core.assertUnlocked();
    const ops = this.getOperationsSummary();
    const alerts = this.store.list('snf_alert') || [];
    const critical = alerts.filter(a => a.severity === 'critical' && a.status !== 'resolved');
    const highs = alerts.filter(a => a.severity === 'high' && a.status !== 'resolved');

    const dateStr = new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    let brief = `${ops.demo ? 'DEMO DATA — NOT FOR CLINICAL USE\n\n' : ''}# ${ops.facilityName}\n`;
    brief += `## MORNING STANDUP & INTERDISCIPLINARY HUDDLE BRIEFING\n`;
    brief += `**Date:** ${dateStr} | **Coverage:** ${ops.dataHealth.isSurveillanceComplete ? 'Imported feeds available; verify source dates' : 'Incomplete imported feeds — not an all-clear'}\n\n`;
    brief += `### 1. FACILITY CENSUS & CAPACITY\n`;
    brief += `- **Active residents in imported records:** ${ops.census.activeResidents ?? 'Not available'} (not a live census)\n`;
    brief += `- Capacity, occupancy, payer mix and bed availability: not available.\n\n`;

    brief += `### 2. OVERNIGHT & 24-HOUR CLINICAL ESCALATIONS\n`;
    if (critical.length === 0 && highs.length === 0) {
      brief += `No unresolved critical or high alerts in available records. Missing or stale feeds can hide events; this is not an all-clear.\n\n`;
    } else {
      if (critical.length > 0) {
        brief += `**CRITICAL ITEMS REQUIRING IMMEDIATE ATTENTION (${critical.length}):**\n`;
        critical.forEach((a, idx) => {
          brief += `${idx + 1}. **[${a.code}]** ${a.residentName || 'Resident'} (${a.residentRoom ? 'Rm ' + a.residentRoom : 'Unit'}): ${a.message}\n`;
        });
        brief += `\n`;
      }
      if (highs.length > 0) {
        brief += `**HIGH-PRIORITY CLINICAL ITEMS (${highs.length}):**\n`;
        highs.slice(0, 5).forEach((a, idx) => {
          brief += `- **${a.title}** — ${a.residentName || 'Resident'} (Rm ${a.residentRoom || 'N/A'}): ${a.message}\n`;
        });
        brief += `\n`;
      }
    }

    brief += `### 3. RECORDED FOLLOW-UPS & MEETING ACTIONS\n`;
    const actions = ops.commandCenter.followUps;
    actions.forEach(item => { brief += `- ${item.title}${item.priority ? ' — ' + item.priority : ''}\n`; });
    ops.commandCenter.meetingActions.filter(item=>!item.convertedTodoId).forEach(item => {
      brief += `- ${item.task} — Owner: ${item.assignee || 'Unassigned'}${item.dueDate ? ' — Due: '+new Date(item.dueDate).toLocaleString() : ' — Due date not set'}\n`;
    });
    if (!actions.length && !ops.commandCenter.meetingActions.length) brief += 'No follow-ups recorded in the available workspace.\n';
    if (includeChecklist) {
      brief += `\n### OPTIONAL GENERAL CHECKLIST — NOT GENERATED FINDINGS OR ASSIGNMENTS\n`;
      brief += '- Nursing: review condition changes.\n- MDS: review assessment scheduling.\n- Rehab: review new admissions.\n- Social Services: review conferences and discharge plans.\n- Dietary: review available weights and hydration records.\n';
    }
    brief += '\n';
    brief += `*Notice: Generated by Private AI Operations Intelligence. Clinical decisions require human clinical verification.*`;

    return {
      text: brief,
      generatedAt: Date.now(),
      metrics: ops
    };
  }

  // -------------------------------------------------------------
  // Meeting Management CRUD & Copilot
  // -------------------------------------------------------------
  listMeetings() {
    this.core.assertUnlocked();
    const list = this.store.list('meeting') || [];
    return list.map(m=>this.withTaskStatus(m)).sort((a, b) => (b.date || 0) - (a.date || 0));
  }

  withTaskStatus(meeting) {
    return {...meeting, carryover:(meeting.carryoverRefs||[]).map(ref=>{
      const source=this.store.get('meeting',ref.meetingId),item=source?.actionItems?.find(a=>a.id===ref.actionId),todo=item?.convertedTodoId&&this.store.get('todo',item.convertedTodoId);
      return { ...ref, title:source?.title||'Source unavailable',task:item?.task||'Source unavailable',status:todo?.status||item?.status||'unavailable',assignee:todo?.owner||item?.assignee||'',dueDate:todo?.dueAt??item?.dueDate??null };
    }), actionItems:(meeting.actionItems||[]).map(item=>{
      const task=item.convertedTodoId && this.store.get('todo',item.convertedTodoId);
      return task ? {...item,status:task.status==='completed'?'completed':'in_progress',dueDate:task.dueAt,completedAt:task.completedAt} : item;
    })};
  }
  getMeeting(id) {
    this.core.assertUnlocked();
    if (!isId(id)) throw fail('INVALID');
    const meeting = this.store.get('meeting', id);
    if (!meeting) throw fail('NOT_FOUND');
    return this.withTaskStatus(meeting);
  }

  createMeeting(input = {}) {
    this.core.assertUnlocked();
    const meetingType = input.type && MEETING_TEMPLATES[input.type] ? input.type : 'morning_huddle';
    const template = MEETING_TEMPLATES[meetingType];

    const meeting = {
      id: uuid(),
      title: text(input.title || template.name, 150),
      type: meetingType,
      date: input.date ? Number(input.date) : Date.now(),
      shift: ['day', 'evening', 'night', 'all'].includes(input.shift) ? input.shift : 'day',
      status: 'live', // 'live' | 'draft' | 'completed'
      attendees: Array.isArray(input.attendees) && input.attendees.length > 0
        ? input.attendees
        : template.defaultAttendees.map(a => ({ ...a, present: false })),
      agenda: template.agenda.map(item => ({ ...item, completed: false, notes: '' })),
      transcript: [],
      carryoverRefs: this.listMeetings().filter(m=>m.type===meetingType).flatMap(m=>(m.actionItems||[]).filter(a=>!['completed','cancelled'].includes(a.status)).map(a=>({meetingId:m.id,actionId:a.id}))),
      actionItems: [],
      decisions: [],
      clinicalRadar: [],
      summary: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.store.put('meeting', meeting.id, meeting);
    return meeting;
  }

  saveMeeting(input = {}) {
    this.core.assertUnlocked();
    if (!input.id || !isId(input.id)) {
      return this.createMeeting(input);
    }

    const existing = this.store.get('meeting', input.id);
    if (!existing) throw fail('NOT_FOUND');

    const updated = {
      ...existing,
      title: input.title ? text(input.title, 150) : existing.title,
      type: input.type || existing.type,
      shift: input.shift || existing.shift,
      status: input.status || existing.status,
      attendees: Array.isArray(input.attendees) ? input.attendees : existing.attendees,
      agenda: Array.isArray(input.agenda) ? input.agenda : existing.agenda,
      transcript: Array.isArray(input.transcript) ? input.transcript : existing.transcript,
      actionItems: Array.isArray(input.actionItems) ? input.actionItems : existing.actionItems,
      decisions: Array.isArray(input.decisions) ? input.decisions : existing.decisions,
      clinicalRadar: Array.isArray(input.clinicalRadar) ? input.clinicalRadar : existing.clinicalRadar,
      summary: input.summary !== undefined ? text(input.summary, 20000) : existing.summary,
      updatedAt: Date.now()
    };

    updated.actionItems = this.withTaskStatus(updated).actionItems;
    this.store.put('meeting', updated.id, updated);
    return updated;
  }

  deleteMeeting(id) {
    this.core.assertUnlocked();
    if (!isId(id)) throw fail('INVALID');
    this.store.transaction(()=>{
      for(const kind of ['meeting_audio','meeting_upload','companion_meeting'])
        for(const entry of this.store.summaries ? this.store.summaries(kind) : this.store.project(kind,r=>({id:r.id,meetingId:r.meetingId})))
          if(entry.meetingId===id)this.store.delete(kind,entry.id);
      this.store.delete('meeting',id);
    });
    if (!this.core.snf?.demoMode) this.core.purgeBackups?.();
    return true;
  }

  // Ingests a new spoken statement during live meeting session
  // Automatically detects clinical sentinel flags, checks non-speech audio events, and extracts candidate action items!
  addTranscriptEntry(meetingId, { speaker, role, text: statementText, confidenceLevel, acousticFeatures, speakerConfirmed = false, isOverheadPage = false, isCrossTalk = false }) {
    this.core.assertUnlocked();
    if (!isId(meetingId)) throw fail('INVALID');
    const meeting = this.store.get('meeting', meetingId);
    if (!meeting) throw fail('NOT_FOUND');

    const cleanText = text(statementText, 5000);
    if (!cleanText) return meeting;

    if (meeting.status !== 'live') throw fail('INVALID');
    let identification = null;
    if (acousticFeatures) {
      if (!Number.isFinite(acousticFeatures.capturedAt) || Math.abs(Date.now()-acousticFeatures.capturedAt)>120000) throw fail('INVALID');
      identification = new SpeakerRecognitionService(this.core).identifySpeaker(acousticFeatures);
      speaker=identification.label;role=identification.role;confidenceLevel=identification.confidenceLevel;
      speakerConfirmed=false; // A machine match can never self-certify a speaker.
    }
    // Check non-speech pattern matches
    let detectedNonSpeech = null;
    for (const nsp of NON_SPEECH_PATTERNS) {
      if (nsp.regex.test(cleanText)) {
        detectedNonSpeech = nsp;
        break;
      }
    }

    const overheadDetected = isOverheadPage || (detectedNonSpeech && detectedNonSpeech.type === 'overhead_page');
    const crossTalkDetected = isCrossTalk || (detectedNonSpeech && detectedNonSpeech.type === 'cross_talk');

    // 1. Detect Clinical Sentinel Entities (Only if not overhead page)
    const detectedFlags = [];
    if (!overheadDetected) {
      for (const pat of CLINICAL_ENTITIES_PATTERNS) {
        if (pat.regex.test(cleanText)) {
          detectedFlags.push({
            category: pat.category,
            label: pat.label,
            severity: pat.severity
          });
        }
      }
    }

    if (overheadDetected) {
      detectedFlags.push({
        category: 'overhead_page',
        label: 'Possible overhead page',
        severity: 'low'
      });
    }

    if (crossTalkDetected) {
      detectedFlags.push({
        category: 'cross_talk',
        label: 'Multiple speakers',
        severity: 'low'
      });
    }

    const resolvedSpeaker = overheadDetected
      ? '[Facility Announcement]'
      : crossTalkDetected
        ? '[Multiple speakers]'
        : text(speaker || 'Speaker', 60);

    const manuallyConfirmed = speakerConfirmed === true && resolvedSpeaker !== 'Unknown Speaker' && !overheadDetected && !crossTalkDetected;
    const resolvedConfidence = manuallyConfirmed ? 'strong' : resolvedSpeaker === 'Unknown Speaker' ? 'weak' : 'possible';

    const entryId = uuid();
    const entry = {
      id: entryId,
      speaker: resolvedSpeaker,
      role: text(role || 'Attendee', 60),
      text: cleanText,
      timestamp: Date.now(),
      confidenceLevel: resolvedConfidence,
      speakerVerified: manuallyConfirmed,
      attribution: manuallyConfirmed ? 'manual' : identification?.profileId ? 'suggested' : 'unverified',
      speakerProfileId: identification?.profileId || null,
      matchReason: identification?.reason || null,
      isOverheadPage: overheadDetected,
      isCrossTalk: crossTalkDetected,
      flags: detectedFlags
    };

    meeting.transcript = meeting.transcript || [];
    meeting.transcript.push(entry);

    // 2. Add to session Clinical Radar if new clinical entity found (Exclude overhead pages)
    if (!overheadDetected) {
      meeting.clinicalRadar = meeting.clinicalRadar || [];
      detectedFlags.forEach(f => {
        if (f.category === 'overhead_page' || f.category === 'cross_talk') return;
        const exists = meeting.clinicalRadar.some(r => r.category === f.category && r.snippet === cleanText);
        if (!exists) {
          meeting.clinicalRadar.push({
            id: uuid(),
            transcriptEntryId: entryId,
            category: f.category,
            label: f.label,
            severity: f.severity,
            speaker: entry.speaker,
            snippet: cleanText.length > 120 ? cleanText.slice(0, 117) + '...' : cleanText,
            timestamp: entry.timestamp
          });
        }
      });
    }

    // 3. Detect Action Items automatically (Strict Exclusion: Overhead Pages and Ambiguous Cross-Talk)
    if (!overheadDetected && !crossTalkDetected) {
      for (const pat of ACTION_ITEM_PATTERNS) {
        const match = cleanText.match(pat);
        if (match) {
          const candidateTask = (match[1] + ' ' + match[2]).trim();
          // Check if not already in action items
          const isDuplicate = (meeting.actionItems || []).some(a => a.task.toLowerCase().includes(candidateTask.slice(0, 20).toLowerCase()));
          if (!isDuplicate && candidateTask.length >= 10) {
            meeting.actionItems = meeting.actionItems || [];
            meeting.actionItems.push({
              id: uuid(),
              task: text(candidateTask, 250),
              assignee: entry.speakerVerified ? entry.speaker : null,
              department: entry.speakerVerified ? entry.role : null,
              priority: detectedFlags.some(f => f.severity === 'critical') ? 'urgent' : 'high',
              status: 'pending',
              dueDate: null, // A reviewer must confirm deadlines; transcript heuristics cannot invent them.
              convertedTodoId: null,
              detectedFromTranscriptId: entryId
            });
          }
        }
      }
    }

    meeting.updatedAt = Date.now();
    this.store.put('meeting', meeting.id, meeting);
    return meeting;
  }

  // Converts a meeting action item to an official Private AI To-Do item
  convertActionItemToTodo(meetingId, actionItemId) {
    this.core.assertUnlocked();
    if (!isId(meetingId) || !isId(actionItemId)) throw fail('INVALID');
    const meeting = this.store.get('meeting', meetingId);
    if (!meeting) throw fail('NOT_FOUND');

    const item = (meeting.actionItems || []).find(a => a.id === actionItemId);
    if (!item) throw fail('NOT_FOUND');

    if (item.convertedTodoId) {
      const todo = this.store.get('todo', item.convertedTodoId);
      if (todo) return {success: true, todo, actionItem: item};
    }
    // Create To-Do in Core Store
    const todo = this.core.saveTodo({
      title: item.task,
      owner: item.assignee || "",
      description: `Action item assigned to ${item.assignee || 'Unassigned'} (${item.department || 'Department not set'}) from ${meeting.title} on ${new Date(meeting.date).toLocaleDateString()}`,
      priority: item.priority === 'urgent' ? 'urgent' : 'high',
      dueAt: item.dueDate || null,
      source: 'manual'
    });

    item.convertedTodoId = todo.id;
    item.status = 'in_progress';
    meeting.updatedAt = Date.now();
    this.store.put('meeting', meeting.id, meeting);

    return { success: true, todo, actionItem: item };
  }

  // Conclude meeting & generate formal clinical executive summary
  finalizeMeeting(meetingId) {
    this.core.assertUnlocked();
    if (!isId(meetingId)) throw fail('INVALID');
    const meeting = this.store.get('meeting', meetingId);
    if (!meeting) throw fail('NOT_FOUND');

    if(this.store.project('meeting_audio',a=>a.meetingId===meetingId&&a.status!=='transcribed').some(Boolean))throw fail('SPEECH_PENDING');
    meeting.status = 'completed';
    meeting.completedAt = meeting.completedAt || Date.now();

    // Auto-synthesize comprehensive minutes
    let minutes = `${this.core.snf?.demoMode ? 'DEMO DATA — NOT FOR CLINICAL USE\n\n' : ''}# ${meeting.title.toUpperCase()}\n`;
    minutes += `**Date:** ${new Date(meeting.date).toLocaleString()} | **Shift:** ${meeting.shift.toUpperCase()}\n\n`;

    minutes += `### ATTENDEES\n`;
    (meeting.attendees || []).forEach(att => {
      minutes += `- ${att.name} (${att.role || att.department}) ${att.present === true ? '— Present (recorded)' : '— Attendance not confirmed'}\n`;
    });
    minutes += `\n`;

    minutes += `### AGENDA ITEMS COVERED\n`;
    (meeting.agenda || []).forEach(ag => {
      minutes += `- [${ag.completed ? 'X' : ' '}] **${ag.title}**${ag.notes ? ': ' + ag.notes : ''}\n`;
    });
    minutes += `\n`;

    if ((meeting.clinicalRadar || []).length > 0) {
      minutes += `### CLINICAL SENTINEL FINDINGS & SURVEILLANCE RADAR\n`;
      meeting.clinicalRadar.forEach(cr => {
        minutes += `- **[${cr.label} · ${cr.severity.toUpperCase()}]** Reported by ${cr.speaker}: "${cr.snippet}"\n`;
      });
      minutes += `\n`;
    }

    const carryover=this.withTaskStatus(meeting).carryover;
    if(carryover.length) minutes += '### CARRYOVER FROM EARLIER MEETINGS\n'+carryover.map(a=>`- ${a.task} — ${a.status}; owner ${a.assignee||'Unassigned'}; source ${a.meetingId}/${a.actionId}`).join('\n')+'\n\n';
    if ((meeting.actionItems || []).length > 0) {
      minutes += `### ACTION ITEMS & ASSIGNMENTS\n`;
      meeting.actionItems.forEach((ai, idx) => {
        const dueStr = ai.dueDate ? new Date(ai.dueDate).toLocaleDateString() : 'Not set';
        minutes += `${idx + 1}. **${ai.task}**\n`;
        minutes += `   - **Assignee:** ${ai.assignee || 'Unassigned'} (${ai.department || 'Department not set'}) | **Due:** ${dueStr} | **Priority:** ${ai.priority.toUpperCase()}\n`;
      });
      minutes += `\n`;
    }

    if (meeting.transcript && meeting.transcript.length > 0) {
      minutes += `### RECORDED MEETING TRANSCRIPT EXCERPT\n`;
      meeting.transcript.forEach(t => {
        const timeStr = new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        minutes += `> **[${timeStr}] ${t.speaker}${t.speakerVerified && t.attribution === 'manual' ? ' [manually confirmed]' : ' [unverified]'} (${t.role}):** ${t.text}\n\n`;
      });
    }

    minutes += `*Draft minutes generated from available meeting entries. Verify attendance, speaker attribution, findings and actions before use.*`;

    meeting.summary = minutes;
    meeting.updatedAt = Date.now();
    this.store.put('meeting', meeting.id, meeting);

    return meeting;
  }
}

// Module Dispatcher for RPC calls
function dispatch(core, op, data = {}) {
  core.assertUnlocked();
  const snf = require('./snf/demo.cjs').forCore(core).current();
  if (snf?.demoMode) {
    const liveCore = core;
    core = Object.create(liveCore);
    core.store = snf.store;
    core.snf = snf;
    core.purgeBackups = () => {};
    core.emit = () => {}; // Demo events must not enter live notification channels.
    core.saveTodo = input => {
      const todo = {...input, id: uuid(), status: 'pending', createdAt: Date.now(), demo: true};
      core.store.put('todo', todo.id, todo);
      return todo;
    };
  }
  const engine = new OperationsCopilotEngine(core);
  const sbarEngine = new SBAREngine(core);
  const speakerService = new SpeakerRecognitionService(core);
  const audioAssessor = new AudioQualityAssessor();

  switch (op) {
    // Operations Radar & Summary
    case 'operationsSummary':
      return engine.getOperationsSummary();
    case 'operationsHuddleBrief':
      return engine.generateMorningHuddleBrief(data);

    // Meetings Lifecycle & Live Copilot
    case 'meetingList':
      return engine.listMeetings();
    case 'meetingGet':
      return engine.getMeeting(data.id);
    case 'meetingSave':
      return engine.saveMeeting(data);
    case 'meetingDelete':
      return engine.deleteMeeting(data.id);
    case 'meetingAddTranscript':
      return engine.addTranscriptEntry(data.meetingId, data);
    case 'meetingConvertActionItem':
      return engine.convertActionItemToTodo(data.meetingId, data.actionItemId);
    case 'meetingFinalize':
      return engine.finalizeMeeting(data.meetingId);

    // SBAR & Shift Handoff Generator
    case 'sbarGenerate':
      return sbarEngine.generateSbarDraft(data);
    case 'sbarSave':
      return sbarEngine.saveSbar(data);
    case 'sbarReview':
      return sbarEngine.reviewSbar(data.id, data.reviewer, data.note);
    case 'sbarFinalize':
      return sbarEngine.finalizeSbar(data.id, data.finalizer, data.note);
    case 'sbarList':
      return sbarEngine.listSbars();
    case 'sbarGet':
      return sbarEngine.getSbar(data.id);
    case 'sbarDelete':
      return sbarEngine.deleteSbar(data.id);
    case 'sbarLogNotification':
      return sbarEngine.logNotification(data.sbarId, data);
    case 'sbarAdvanceLoop':
      return sbarEngine.advanceCloseTheLoop(data.sbarId, data);
    case 'sbarProtocols':
      return sbarEngine.listProtocols();
    case 'sbarProtocolGet':
      return sbarEngine.getProtocol(data.id);
    case 'sbarProtocolSave':
      return sbarEngine.saveProtocol(data);
    case 'sbarTemplates':
      return sbarEngine.listTemplates();
    case 'sbarShiftHandoff':
      return sbarEngine.generateShiftHandoff(data);
    case 'sbarSnapshot48h':
      return sbarEngine.get48HourSnapshot(data.residentId, data.windowHours);

    // Meeting Audio Quality & Speaker Recognition Pipeline
    case 'audioCheckQuality':
      return audioAssessor.assess(data);
    case 'speakerProfilesList':
      return speakerService.listProfiles();
    case 'speakerProfileGet':
      return speakerService.getProfile(data.id);
    case 'speakerProfileSave':
      return speakerService.saveProfile(data);
    case 'speakerProfileDelete':
      return speakerService.deleteProfile(data.id);
    case 'speakerSampleAdd':
      return speakerService.addVerifiedSample(data.profileId, data);
    case 'speakerSampleRemove':
      return speakerService.removeSample(data.profileId, data.sampleId);
    case 'speakerIdentify':
      return speakerService.identifySpeaker(data.features, data.expectedRoster);
    case 'speakerReviewGet':
      return speakerService.generateSpeakerReview(data.meetingId);
    case 'speakerReviewConfirmAll':
      return speakerService.confirmAllHighConfidence(data.meetingId);
    case 'speakerCorrectionLearn':
      return speakerService.applyCorrectionAndLearn(data);

    default:
      throw fail('INVALID');
  }
}

module.exports = {
  OperationsCopilotEngine,
  SBAREngine,
  FACILITY_PROTOCOLS,
  SBAR_TEMPLATES,
  COMMUNICATION_TARGETS,
  MEETING_TEMPLATES,
  CLINICAL_ENTITIES_PATTERNS,
  NON_SPEECH_PATTERNS,
  AudioQualityAssessor,
  SpeakerRecognitionService,
  dispatch
};

