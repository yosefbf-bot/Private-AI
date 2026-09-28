'use strict';

/**
 * Interactive SBAR & Shift-Handoff Intelligence Engine
 * 
 * Organizes documented clinical telemetry into structured SBAR communications
 * with strict clinical recommendation safety safeguards, source attribution,
 * freshness tracking, 48-hour clinical snapshot ("What Changed?"),
 * missing information warnings, multi-stage close-the-loop tracking,
 * notification tracking, and follow-up engine integration.
 */

const { fail, isId, text, uuid } = require('./security.cjs');

// Approved Facility Protocols Catalog (Standard SNF Clinical Governance)
const FACILITY_PROTOCOLS = [
  {
    id: 'prot_fall_2026',
    name: 'Fall Incident & Post-Fall Management Protocol',
    version: '2.4',
    effectiveDate: '2026-01-15',
    reviewDate: '2027-01-15',
    status: 'current', // 'current' | 'review_needed'
    sourceDocument: 'Pinecrest Clinical Governance Manual — Sec 4.2',
    interventions: [
      { id: 'fall_int_neuro', text: 'Initiate 72-hour post-fall neurological checks (q15m x 4, q30m x 2, q1h x 4, q4h x 24h, q-shift x 48h)' },
      { id: 'fall_int_vitals', text: 'Obtain immediate vital signs including orthostatic blood pressure and pulse' },
      { id: 'fall_int_rom', text: 'Assess range of motion, extremity shortening/rotation, pain, and skin integrity' },
      { id: 'fall_int_notify', text: 'Notify attending physician/NP and designated family representative within 1 hour' },
      { id: 'fall_int_env', text: 'Conduct interdisciplinary environmental and root-cause inspection (bed alarms, footwear, lighting)' }
    ]
  },
  {
    id: 'prot_sepsis_2026',
    name: 'Fever, Sepsis & McGeer Infection Surveillance Protocol',
    version: '3.1',
    effectiveDate: '2026-02-01',
    reviewDate: '2027-02-01',
    status: 'current',
    sourceDocument: 'McGeer Clinical Infection Criteria & Antimicrobial Stewardship — Sec 2.1',
    interventions: [
      { id: 'sepsis_int_vitals', text: 'Vital signs re-check q4h including pulse oximetry, respiratory rate, and temperature' },
      { id: 'sepsis_int_hydration', text: 'Assess hydration status and encourage oral fluid intake unless contraindicated by fluid restriction' },
      { id: 'sepsis_int_notify', text: 'Notify provider of McGeer criteria met and acute vital changes' },
      { id: 'sepsis_int_orders', text: 'Verify existing standing orders for diagnostic screening (e.g. CBC with diff, UA/C&S, rapid flu/COVID)' }
    ]
  },
  {
    id: 'prot_skin_2026',
    name: 'Skin Integrity & Pressure Injury Prevention Protocol',
    version: '2.0',
    effectiveDate: '2025-11-10',
    reviewDate: '2026-11-10',
    status: 'current',
    sourceDocument: 'Clinical Wound Care Standards of Practice — Sec 5.3',
    interventions: [
      { id: 'skin_int_measure', text: 'Complete weekly wound measurement (length, width, depth in cm), exudate, and staging' },
      { id: 'skin_int_reposition', text: 'Implement every 2-hour turning and off-loading repositioning schedule with pressure-relieving mattress' },
      { id: 'skin_int_dressing', text: 'Maintain prescribed dressing regimen and verify peri-wound skin barrier protection' },
      { id: 'skin_int_dietary', text: 'Request clinical dietitian review for high-protein nutritional supplement order' }
    ]
  },
  {
    id: 'prot_glucose_2026',
    name: 'Hypoglycemia & Hyperglycemia Acute Management Protocol',
    version: '1.8',
    effectiveDate: '2026-01-10',
    reviewDate: '2027-01-10',
    status: 'current',
    sourceDocument: 'Diabetes & Endocrine Emergency Care Policy — Sec 3.4',
    interventions: [
      { id: 'gly_int_verify', text: 'Verify fingerstick blood glucose immediately upon symptoms of hypoglycemia or hyperglycemia' },
      { id: 'gly_int_hypo', text: 'If blood glucose < 70 mg/dL, administer 15g fast-acting carbohydrate (Rule of 15) and re-check in 15 min' },
      { id: 'gly_int_notify', text: 'Notify provider immediately if blood glucose remains < 60 mg/dL or exceeds 350 mg/dL' }
    ]
  },
  {
    id: 'prot_psych_2026',
    name: 'Psychotropic Medication & Gradual Dose Reduction (GDR) Protocol',
    version: '4.0',
    effectiveDate: '2026-03-01',
    reviewDate: '2027-03-01',
    status: 'current',
    sourceDocument: 'CMS F-Tag 758 Behavioral Health & Unnecessary Medications Policy',
    interventions: [
      { id: 'psych_int_nonpharm', text: 'Attempt and document at least 2 non-pharmacological behavioral interventions prior to PRN psychotropic use' },
      { id: 'psych_int_14day', text: 'Audit PRN psychotropic order duration against the CMS 14-day limit' },
      { id: 'psych_int_monitor', text: 'Document specific target behavioral symptoms and adverse effects (sedation, extrapyramidal symptoms) every shift' }
    ]
  },
  {
    id: 'prot_anticoag_2026',
    name: 'Anticoagulant & High-Risk Medication Safety Protocol',
    version: '2.2',
    effectiveDate: '2025-10-01',
    reviewDate: '2026-10-01',
    status: 'current',
    sourceDocument: 'Pinecrest Pharmacy & Therapeutics Clinical Guideline — Sec 6.1',
    interventions: [
      { id: 'anticoag_int_precautions', text: 'Institute bleeding precautions (soft toothbrush, electric razor, fall risk sign)' },
      { id: 'anticoag_int_inr', text: 'Monitor PT/INR routine lab tracking and verify dosage with prescribing physician' },
      { id: 'anticoag_int_bleeding', text: 'Assess and document every shift for hematuria, epistaxis, petechiae, or spontaneous bruising' }
    ]
  }
];

// Standard SBAR Template Retrieval Library
const SBAR_TEMPLATES = {
  fall: {
    id: 'fall',
    name: 'Fall / Incident Escalation',
    category: 'Safety & Incidents',
    situationFocus: 'Witnessed or unwitnessed fall incident with immediate injury assessment and vital baseline comparison.',
    backgroundFocus: 'Fall history, mobility status, osteoporosis/fracture risk, active anticoagulants, assistive devices.',
    assessmentFocus: 'Range of motion, extremity rotation, head strike, neurological signs, pain score, vital signs.',
    defaultProtocolId: 'prot_fall_2026'
  },
  mental_status: {
    id: 'mental_status',
    name: 'Change in Mental Status / Acute Delirium',
    category: 'Neurological & Cognitive',
    situationFocus: 'Acute confusion, lethargy, hallucinations, or sudden cognitive decline differing from baseline.',
    backgroundFocus: 'Baseline BIMS/cognition, dementia diagnosis, recent medication changes, history of UTIs, dehydration.',
    assessmentFocus: 'Orientation, speech clarity, GCS/alertness, oxygen saturation, temperature, blood glucose.',
    defaultProtocolId: 'prot_sepsis_2026'
  },
  fever_infection: {
    id: 'fever_infection',
    name: 'Fever / Suspected Infection Concern',
    category: 'Infection & Sepsis',
    situationFocus: 'Elevated temperature, chills, productive cough, dysuria, or localized infection symptoms.',
    backgroundFocus: 'Recent antibiotics, indwelling catheter, open wounds, respiratory history, immunization status.',
    assessmentFocus: 'Temperature trend, heart rate, blood pressure, O2 sat, McGeer surveillance criteria check.',
    defaultProtocolId: 'prot_sepsis_2026'
  },
  respiratory: {
    id: 'respiratory',
    name: 'Respiratory Status Change / Dyspnea',
    category: 'Cardiopulmonary',
    situationFocus: 'Shortness of breath, tachypnea, declining oxygen saturation, or increased work of breathing.',
    backgroundFocus: 'COPD, CHF, asthma, baseline O2 flow rate, recent nebulizer treatments, smoking history.',
    assessmentFocus: 'Respiratory rate, O2 sat on room air vs supplemental oxygen, lung sounds, chest pain presence.',
    defaultProtocolId: 'prot_sepsis_2026'
  },
  abnormal_vitals: {
    id: 'abnormal_vitals',
    name: 'Abnormal Vital Signs / Hemodynamic Instability',
    category: 'Cardiopulmonary',
    situationFocus: 'Hypotension, severe hypertension, bradycardia, or tachycardia out of physician-ordered parameters.',
    backgroundFocus: 'Cardiac diagnoses, antihypertensive medications, recent dosage titrations, fluid balance.',
    assessmentFocus: 'Serial vitals comparison, apical pulse, dizziness, orthostatic symptoms, peripheral edema.',
    defaultProtocolId: null
  },
  blood_glucose: {
    id: 'blood_glucose',
    name: 'Blood Glucose / Glycemic Control Concern',
    category: 'Endocrine & Metabolic',
    situationFocus: 'Symptomatic hypoglycemia or refractory hyperglycemia beyond sliding scale parameters.',
    backgroundFocus: 'Type 1 or 2 Diabetes, insulin regimen, oral hypoglycemics, recent meal intake percentage.',
    assessmentFocus: 'Blood glucose level, symptoms (diaphoresis, tremors, confusion), carbohydrate response.',
    defaultProtocolId: 'prot_glucose_2026'
  },
  medication: {
    id: 'medication',
    name: 'Medication Concern / Adverse Reaction / Exception',
    category: 'Pharmacy & Therapeutics',
    situationFocus: 'Suspected drug adverse effect, omitted dose, pharmacy shortage, or drug-drug interaction warning.',
    backgroundFocus: 'Active medication profile, allergies, renal function (eGFR/BUN/Cr), prescribing provider instructions.',
    assessmentFocus: 'Observable clinical effects, vital stability, eMAR exception record, therapeutic alternatives.',
    defaultProtocolId: 'prot_anticoag_2026'
  },
  behavior_psych: {
    id: 'behavior_psych',
    name: 'Behavioral / Psychotropic Monitoring Concern',
    category: 'Behavioral Health',
    situationFocus: 'Severe agitation, combative behavior, elopement risk, or non-response to non-pharm interventions.',
    backgroundFocus: 'Psychiatric diagnoses, psychotropic medication history, behavior tracking log, GDR status.',
    assessmentFocus: 'Specific documented behaviors, triggers identified, non-pharm interventions attempted, safety risk.',
    defaultProtocolId: 'prot_psych_2026'
  },
  hospital_transfer: {
    id: 'hospital_transfer',
    name: 'Acute Hospital / Emergency Transfer Handoff',
    category: 'Transitions of Care',
    situationFocus: 'Need for immediate acute emergency department transfer due to acute instability.',
    backgroundFocus: 'Code status (POLST/DNR), primary diagnoses, surgical history, family contact information.',
    assessmentFocus: 'Acute reason for transfer, vital stability, IV access status, baseline mental and mobility status.',
    defaultProtocolId: null
  },
  hospital_return: {
    id: 'hospital_return',
    name: 'Hospital Return / Re-Admission Clinical Review',
    category: 'Transitions of Care',
    situationFocus: 'Resident returned from acute hospital stay; medication reconciliation and care plan alignment needed.',
    backgroundFocus: 'Hospital discharge summary, updated diagnoses, discontinued vs new hospital orders.',
    assessmentFocus: 'Current physical condition, surgical sites, IV lines, respiratory status, verification of orders.',
    defaultProtocolId: null
  },
  skin_wound: {
    id: 'skin_wound',
    name: 'Skin & Wound Deterioration / New Pressure Injury',
    category: 'Wound & Integumentary',
    situationFocus: 'New unstageable or Stage 2+ pressure injury, skin tear, or wound deterioration.',
    backgroundFocus: 'Braden score, turning schedule, nutritional protein labs, diabetes, vascular disease.',
    assessmentFocus: 'Wound location, dimensions, bed appearance (slough/eschar/granulation), exudate, odor, pain.',
    defaultProtocolId: 'prot_skin_2026'
  },
  family_update: {
    id: 'family_update',
    name: 'Family / Legal Representative Status Briefing',
    category: 'Communication & Engagement',
    situationFocus: 'Routine or post-event update to resident designated representative or health care proxy.',
    backgroundFocus: 'Representative contact info, resident comfort goals, advanced care planning wishes.',
    assessmentFocus: 'General well-being, recent progress, physician visits, questions or reassurance needed.',
    defaultProtocolId: null
  },
  general_provider: {
    id: 'general_provider',
    name: 'General Provider Notification / Condition Change',
    category: 'General Clinical',
    situationFocus: 'Documented clinical condition change requiring physician or mid-level practitioner review.',
    backgroundFocus: 'Active problem list, relevant medications, code status, recent provider progress notes.',
    assessmentFocus: 'Objective findings from nursing observations and recent vital sign telemetry.',
    defaultProtocolId: null
  }
};

// Target audience configuration & tone adapter
const COMMUNICATION_TARGETS = [
  { id: 'attending_physician', label: 'Attending Physician', role: 'Physician', technicalLevel: 'high', focus: 'clinical_decision' },
  { id: 'medical_director', label: 'Medical Director', role: 'Physician', technicalLevel: 'high', focus: 'facility_governance' },
  { id: 'np_pa', label: 'Nurse Practitioner / PA', role: 'Advanced Practice', technicalLevel: 'high', focus: 'clinical_decision' },
  { id: 'nursing_supervisor', label: 'Nursing Supervisor / DON', role: 'Nursing Leadership', technicalLevel: 'moderate', focus: 'unit_management' },
  { id: 'family_representative', label: 'Family / Representative', role: 'Designated Contact', technicalLevel: 'low', focus: 'plain_language_care' },
  { id: 'hospital_ems', label: 'Hospital / EMS Emergency Handoff', role: 'EMS / Emergency Dept', technicalLevel: 'high', focus: 'emergency_transfer' },
  { id: 'other', label: 'Other Interdisciplinary Contact', role: 'IDT', technicalLevel: 'moderate', focus: 'general' }
];

class SBAREngine {
  constructor(core) {
    this.core = core;
  }

  get store() {
    return this.core.store;
  }

  // -------------------------------------------------------------
  // Data Freshness & Attribution Helpers
  // -------------------------------------------------------------
  calculateFreshness(timestamp, thresholds = { freshMs: 14400000, staleMs: 43200000 }) {
    if (!Number.isFinite(timestamp) || timestamp <= 0 || timestamp > Date.now()) {
      return {
        isStale: true,
        ageMinutes: null,
        ageString: 'Data age unknown',
        badge: 'UNKNOWN'
      };
    }

    const now = Date.now();
    const diffMs = Math.max(0, now - timestamp);
    const ageMinutes = Math.floor(diffMs / 60000);
    const ageHours = Math.floor(diffMs / 3600000);
    const ageDays = Math.floor(diffMs / 86400000);

    let ageString = '';
    if (ageMinutes < 60) {
      ageString = `${ageMinutes} minute${ageMinutes === 1 ? '' : 's'} ago`;
    } else if (ageHours < 24) {
      ageString = `${ageHours} hour${ageHours === 1 ? '' : 's'} ago`;
    } else {
      ageString = `${ageDays} day${ageDays === 1 ? '' : 's'} ago`;
    }

    const isStale = diffMs > thresholds.staleMs;
    const isModerate = diffMs > thresholds.freshMs && !isStale;

    return {
      isStale,
      isModerate,
      ageMinutes,
      ageString,
      badge: isStale ? 'STALE' : isModerate ? 'MODERATE' : 'CURRENT'
    };
  }

  // -------------------------------------------------------------
  // 48-Hour Clinical Snapshot ("What Changed?")
  // -------------------------------------------------------------
  get48HourSnapshot(residentId, windowHours = 48) {
    this.core.assertUnlocked();
    const now = Date.now();
    if (!residentId || !Number.isFinite(Number(windowHours)) || windowHours <= 0 || windowHours > 720) throw fail('INVALID');
    const cutoff = now - (windowHours * 3600000);

    // 1. Gather alerts in window
    const alerts = (this.store.list('snf_alert') || []).filter(a => {
      const matchRes = a.residentId === residentId;
      const time = a.firstDetected || a.createdDate || 0;
      return matchRes && time >= cutoff;
    });

    // 2. Gather medication changes in window
    const medChanges = (this.store.list('snf_med_order') || []).filter(m => {
      const matchRes = m.residentId === residentId;
      const time = typeof m.startDate === 'number' ? m.startDate : Date.parse(m.startDate || m.orderDate || '');
      return matchRes && time >= cutoff;
    });

    // 3. Gather meetings mentioning resident
    const meetings = (this.store.list('meeting') || []).filter(m => (m.date || 0) >= cutoff);
    const meetingNotes = [];
    meetings.forEach(m => {
      (m.transcript || []).forEach(t => {
        if (t.residentId === residentId) {
          meetingNotes.push({
            meetingTitle: m.title,
            speaker: t.speaker,
            text: t.text,
            timestamp: t.timestamp
          });
        }
      });
    });

    return {
      windowHours,
      cutoffTimestamp: cutoff,
      alertsCount: alerts.length,
      alerts: alerts.map(a => ({
        id: a.id,
        code: a.code,
        severity: a.severity,
        message: a.message,
        timestamp: a.firstDetected || a.createdDate,
        freshness: this.calculateFreshness(a.firstDetected || a.createdDate)
      })),
      medChangesCount: medChanges.length,
      medChanges: medChanges.map(m => ({
        id: m.id,
        medicationName: m.drugName || m.name || m.medicationName,
        action: m.action || 'New Order',
        directions: m.directions || [m.dose, m.route, m.frequency].filter(Boolean).join(' '),
        sourceReport: m.sourceReport, reportDate: m.reportDate, batchId: m.batchId, originalRow: m.originalRow,
        timestamp: m.startDate || m.orderDate
      })),
      meetingNotes
    };
  }

  // -------------------------------------------------------------
  // Protocol Library CRUD
  // -------------------------------------------------------------
  listProtocols() {
    this.core.assertUnlocked();
    const custom = this.store.list('facility_protocol') || [];
    const all = [...FACILITY_PROTOCOLS, ...custom];
    const now = Date.now();

    return all.map(p => {
      const isReviewNeeded = p.reviewDate ? (new Date(p.reviewDate).getTime() < now) : false;
      return {
        ...p,
        status: 'review_needed',
        sourceDocument: custom.includes(p) ? p.sourceDocument : 'Packaged example — not an approved facility protocol',
        statusLabel: 'Reference only — facility approval not recorded',
        isCurrent: false
      };
    });
  }

  getProtocol(id) {
    this.core.assertUnlocked();
    const all = this.listProtocols();
    return all.find(p => p.id === id) || null;
  }

  saveProtocol(data) {
    this.core.assertUnlocked();
    if (!data.name) throw fail('INVALID');
    const item = {
      id: data.id && isId(data.id) ? data.id : uuid(),
      name: text(data.name, 150),
      version: text(data.version || '1.0', 20),
      effectiveDate: data.effectiveDate || new Date().toISOString().slice(0, 10),
      reviewDate: data.reviewDate || new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
      status: 'review_needed',
      sourceDocument: text(data.sourceDocument || 'Internal Facility Clinical Protocol', 200),
      interventions: Array.isArray(data.interventions) ? data.interventions : [],
      updatedAt: Date.now()
    };
    this.store.put('facility_protocol', item.id, item);
    return item;
  }

  // -------------------------------------------------------------
  // Template Library
  // -------------------------------------------------------------
  listTemplates() {
    return Object.values(SBAR_TEMPLATES);
  }

  // -------------------------------------------------------------
  // SBAR Draft Generator with Clinical Recommendation Safeguards
  // -------------------------------------------------------------
  generateSbarDraft(input = {}) {
    this.core.assertUnlocked();
    const templateKey = (input.templateKey && SBAR_TEMPLATES[input.templateKey]) ? input.templateKey : 'general_provider';
    const template = SBAR_TEMPLATES[templateKey];
    const targetKey = input.target || 'attending_physician';
    const targetConfig = COMMUNICATION_TARGETS.find(t => t.id === targetKey) || COMMUNICATION_TARGETS[0];

    const selectedAlert = input.alertId ? this.store.get('snf_alert', input.alertId) : null;
    if (input.alertId && !selectedAlert) throw fail('NOT_FOUND');
    if (input.residentId && selectedAlert?.residentId && input.residentId !== selectedAlert.residentId) throw fail('INVALID');
    const residentId = input.residentId || selectedAlert?.residentId || null;
    const resident = residentId ? this.store.get('snf_resident', residentId) : null;
    const residentName = text(resident?.name || selectedAlert?.residentName || input.residentName || 'Resident identity not provided', 100);
    const residentRoom = text(resident?.room || selectedAlert?.residentRoom || input.residentRoom || 'Not available', 50);
    const windowHours = Number(input.windowHours) || 48;

    // 1. Gather relevant imported records
    const snapshot = (residentId ? this.get48HourSnapshot(residentId, windowHours) : {windowHours, alerts: [], alertsCount: 0, medChanges: [], medChangesCount: 0, meetingNotes: []});
    const alerts = this.store.list('snf_alert') || [];
    const matchedAlert = input.alertId ? alerts.find(a => a.id === input.alertId) : null;
    const residentAlerts = alerts.filter(a => a.residentName && a.residentName.toLowerCase() === residentName.toLowerCase());

    // 2. Extract clinical telemetry with source attribution & freshness
    const now = Date.now();
    const vitalsReportDate = input.vitalsReportDate ? Number(input.vitalsReportDate) : null;
    const vitalsFreshness = this.calculateFreshness(vitalsReportDate, { freshMs: 7200000, staleMs: 14400000 }); // Vitals stale after 4h

    // Objective Documented Observations
    const documentedVitals = input.vitals && typeof input.vitals === 'object' && !Array.isArray(input.vitals) && Object.keys(input.vitals).length ? input.vitals : null;

    // Missing Critical Info Tracking
    const missingItems = [];
    if (!documentedVitals) {
      missingItems.push({
        field: 'Current Vitals',
        status: 'Vitals not documented in current sources',
        severity: 'high'
      });
    } else if (vitalsFreshness.isStale) {
      missingItems.push({
        field: 'Vital Freshness',
        status: `Vitals documented ${vitalsFreshness.ageString} (STALE DATA WARNING)`,
        severity: 'medium'
      });
    }

    const baselineCognition = input.baselineCognition || 'Not available in current sources';
    if (baselineCognition === 'Not available in current sources') {
      missingItems.push({
        field: 'Baseline Cognition',
        status: 'Not available in current sources',
        severity: 'low'
      });
    }

    const allergies = input.allergies || 'No allergy data available in current imported information';
    if (allergies.includes('No allergy data available')) {
      missingItems.push({
        field: 'Allergies',
        status: 'No allergy data available in current imported information',
        severity: 'medium'
      });
    }

    // 3. Build Situation (S)
    const situationText = input.situation || (matchedAlert
      ? `Notifying of acute clinical change: ${matchedAlert.message}. Observed in Room ${residentRoom}.`
      : `Clinical condition change communication regarding ${residentName} in Rm ${residentRoom}.`);

    const situation = {
      concern: situationText,
      source: matchedAlert ? `Imported surveillance alert [${matchedAlert.code}]` : 'User-entered concern; source not independently verified',
      timestamp: matchedAlert?.firstDetected || null,
      freshness: vitalsFreshness,
      onset: input.onset || 'Onset not available in current sources',
      immediateObservations: input.immediateObservations || (matchedAlert?.message || 'Observations not available in current sources'),
      vitalSigns: documentedVitals ? {
        values: documentedVitals,
        source: 'User-entered vitals; source not independently verified',
        freshness: vitalsFreshness
      } : {
        values: null,
        status: 'Vitals not documented in current sources',
        source: 'Documentation not found in current imported shift report'
      },
      baselineDelta: input.baselineDelta || 'Baseline comparison not available in current sources'
    };

    // 4. Build Background (B)
    const background = {
      primaryDiagnoses: input.primaryDiagnoses || [],
      allergies: {
        value: allergies,
        source: allergies.includes('No allergy') ? 'Not in imported feeds' : 'User-entered allergies; verify source'
      },
      codeStatus: {
        value: input.codeStatus || 'Not available — verify before use',
        source: 'User-entered code status; verify source'
      },
      baselineCognition: {
        value: baselineCognition,
        source: baselineCognition.includes('Not available') ? 'Not documented in imported feeds' : 'User-entered cognition; verify source'
      },
      baselineMobility: {
        value: input.baselineMobility || 'Not available in current sources',
        source: 'User-entered mobility; verify source'
      },
      recentFalls: {
        count: snapshot.alerts.filter(a => a.code === 'FALL_INCIDENT').length,
        notes: snapshot.alerts.filter(a => a.code === 'FALL_INCIDENT').map(a => a.message).join('; ') || 'No matching fall alerts in available records; this does not establish absence of falls.',
        source: 'Incident & Fall Log'
      },
      activeMedications: input.activeMedications || [],
      recentMedChanges: snapshot.medChanges,
      recentHospitalization: input.recentHospitalization || 'Not available in current sources'
    };

    // 5. Build Assessment (A) with STRICT SEPARATION of Documented Findings vs AI Interpretation
    const assessment = {
      // Strictly objective documented observations from records
      documentedFindings: [
        {
          label: 'Vital Signs Trend',
          detail: documentedVitals ? `T: ${documentedVitals.temp || 'N/A'}, BP: ${documentedVitals.bp || 'N/A'}, P: ${documentedVitals.pulse || 'N/A'}, SpO2: ${documentedVitals.o2sat || 'N/A'}` : 'Vitals not verified on current shift.',
          source: 'User-entered vitals; verify source',
          timestamp: vitalsReportDate,
          stale: vitalsFreshness.isStale
        },
        {
          label: 'Documented Symptoms',
          detail: input.symptoms || (matchedAlert?.message || 'Symptoms not available in current sources'),
          source: 'User-entered symptoms or imported alert; verify source',
          timestamp: null,
          stale: false
        },
        {
          label: 'Pain & Physical Assessment',
          detail: input.painReport || 'Pain assessment not available in current sources',
          source: 'User-entered pain assessment; verify source',
          timestamp: null,
          stale: false
        }
      ],
      // Explicitly labeled AI Surveillance Interpretation — NOT a clinician diagnostic conclusion
      aiSurveillanceFlags: [
        {
          type: 'surveillance_flag',
          disclaimer: 'Private AI Automated Surveillance Flag — Not a physician diagnosis or clinical conclusion. Requires licensed clinician verification.',
          finding: `Template selected: ${template.name}. No clinical conclusion is established by template selection; review the linked evidence.`,
          ruleSource: 'Deterministic Clinical Risk Engine v3.0',
          evidenceRefs: snapshot.alerts.map(a => a.code)
        }
      ],
      clinicianNotes: input.clinicianNotes || ''
    };

    // 6. Build Request / Recommendation (R) with CLINICAL RECOMMENDATION SAFETY
    // Rule: Private AI may safely generate generic communication requests.
    // Private AI MUST NOT independently invent orders, meds, or diagnostic testing.
    // Specific clinical tests (STAT CBC, X-ray, etc.) only appear if backed by Existing Order or Facility Protocol!
    const recommendations = [];

    // Safe Generic Communication Requests (Permitted by default)
    recommendations.push({
      id: uuid(),
      text: 'Request provider evaluation.',
      safetyType: 'safe_communication',
      sourceLabel: 'Standard SBAR Communication Protocol',
      verified: true
    });
    recommendations.push({
      id: uuid(),
      text: 'Request review of current symptoms and vital trends.',
      safetyType: 'safe_communication',
      sourceLabel: 'Standard SBAR Communication Protocol',
      verified: true
    });
    recommendations.push({
      id: uuid(),
      text: 'Please advise regarding further clinical evaluation, monitoring parameters, or treatment plan.',
      safetyType: 'safe_communication',
      sourceLabel: 'Standard SBAR Communication Protocol',
      verified: true
    });

    // Check if an Approved Facility Protocol applies to this template
    if (template.defaultProtocolId) {
      const prot = this.getProtocol(template.defaultProtocolId);
      if (prot && prot.isCurrent) {
        (prot.interventions || []).slice(0, 3).forEach(intv => {
          recommendations.push({
            id: uuid(),
            text: intv.text,
            safetyType: 'facility_protocol',
            sourceLabel: `Approved Facility Protocol: ${prot.name} (v${prot.version})`,
            protocolRef: {
              protocolId: prot.id,
              name: prot.name,
              version: prot.version,
              section: prot.sourceDocument
            },
            verified: true
          });
        });
      }
    }

    // Check if resident has existing provider standing orders
    if (input.standingOrders && Array.isArray(input.standingOrders)) {
      input.standingOrders.forEach(so => {
        recommendations.push({
          id: uuid(),
          text: so.text,
          safetyType: 'existing_provider_order',
          sourceLabel: 'User-entered order — signature and source require clinician verification',
          verified: false
        });
      });
    }

    // 7. Communication Target Adaptation
    const adaptedText = (this.core.snf?.demoMode ? 'DEMO DATA — NOT FOR CLINICAL USE\n\n' : '') + this.adaptWordingForTarget({
      targetKey,
      residentName,
      residentRoom,
      situation,
      background,
      assessment,
      recommendations
    });

    const sbar = {
      id: uuid(),
      residentId,
      residentName,
      residentRoom,
      templateKey,
      templateName: template.name,
      targetKey,
      targetRole: targetConfig.role,
      evidenceVersion: 2,
      status: 'draft', // 'draft' | 'reviewed' | 'finalized'
      createdAt: now,
      updatedAt: now,
      reviewedAt: null,
      reviewedBy: null,
      finalizedAt: null,
      finalizedBy: null,
      dataFreshness: vitalsFreshness,
      missingCriticalItems: missingItems,
      snapshot48h: snapshot,
      situation,
      background,
      assessment,
      recommendations,
      adaptedCommunicationText: adaptedText,
      // Notification tracking records
      notifications: [],
      // Close-the-loop multi-stage status
      closeTheLoop: {
        stage: 'sbar_drafted', // 'sbar_drafted' | 'physician_notified' | 'awaiting_callback' | 'orders_received' | 'orders_implemented' | 'closed'
        isComplete: false,
        history: [
          { stage: 'sbar_drafted', timestamp: now, note: 'SBAR created in draft state.' }
        ]
      },
      auditTrail: [
        { action: 'created', user: input.user || 'Clinical Staff', timestamp: now, model: 'Deterministic SBAR Engine v3.0' }
      ]
    };

    // Store in collection
    this.store.put('sbar', sbar.id, sbar);

    // Audit and Emit Event
    this.store.audit('sbar_created');
    this.core.emit?.({ type: 'sbar_created', sbarId: sbar.id, residentName });

    return sbar;
  }

  // -------------------------------------------------------------
  // Communication Target Language Adapter
  // -------------------------------------------------------------
  adaptWordingForTarget({ targetKey, residentName, residentRoom, situation, background, assessment, recommendations }) {
    if (targetKey === 'family_representative') {
      // Clear, compassionate, non-technical plain English
      let text = `Hello. This is the nursing team contacting you regarding ${residentName} in Room ${residentRoom}.\n\n`;
      text += `Information for review: ${situation.immediateObservations}.\n\n`;
      text += `Please verify current condition, actions taken, and provider contact before communicating this draft.`;
      return text;
    }

    if (targetKey === 'hospital_ems') {
      // Emergency transport fast triage handoff
      let text = `EMERGENCY MEDICAL HANDOFF\n`;
      text += `RESIDENT: ${residentName} | ROOM: ${residentRoom} | CODE STATUS: ${background.codeStatus.value}\n`;
      text += `TRANSFER REASON: ${situation.concern}\n`;
      text += `CURRENT VITALS: ${situation.vitalSigns.values ? JSON.stringify(situation.vitalSigns.values) : 'See nursing report'}\n`;
      text += `BASELINE MENTAL STATUS: ${background.baselineCognition.value}\n`;
      text += `ALLERGIES: ${background.allergies.value}\n`;
      text += `KEY MEDICATIONS / ANTICOAGULANTS: ${background.activeMedications.map(m => m.name).join(', ')}\n`;
      text += `PRIMARY DIAGNOSES: ${background.primaryDiagnoses.map(d => d.name).join(', ')}\n`;
      return text;
    }

    // Default: Physician / NP / PA / Medical Director SBAR
    let sbarText = `SBAR CLINICAL NOTIFICATION\n\n`;
    sbarText += `S — SITUATION:\n`;
    sbarText += `Resident: ${residentName} (Rm ${residentRoom})\n`;
    sbarText += `Concern: ${situation.concern}\n`;
    sbarText += `Immediate Findings: ${situation.immediateObservations} (Onset: ${situation.onset})\n`;
    if (situation.vitalSigns.values) {
      const v = situation.vitalSigns.values;
      sbarText += `Vitals: T: ${v.temp || 'N/A'} | BP: ${v.bp || 'N/A'} | P: ${v.pulse || 'N/A'} | R: ${v.resp || 'N/A'} | SpO2: ${v.o2sat || 'N/A'} [${situation.freshness.ageString}]\n\n`;
    } else {
      sbarText += `Vitals: ${situation.vitalSigns.status}\n\n`;
    }

    sbarText += `B — BACKGROUND:\n`;
    sbarText += `Diagnoses: ${background.primaryDiagnoses.map(d => d.name).join(', ')}\n`;
    sbarText += `Allergies: ${background.allergies.value} | Code Status: ${background.codeStatus.value}\n`;
    sbarText += `Baseline Cognition: ${background.baselineCognition.value} | Mobility: ${background.baselineMobility.value}\n`;
    sbarText += `Recent Falls (48h): ${background.recentFalls.count} | Recent Med Changes: ${background.recentMedChanges.length}\n\n`;

    sbarText += `A — ASSESSMENT & DOCUMENTED FINDINGS:\n`;
    assessment.documentedFindings.forEach(f => {
      sbarText += `- [Documented]: ${f.label}: ${f.detail} (${f.source})\n`;
    });
    assessment.aiSurveillanceFlags.forEach(flag => {
      sbarText += `- [Surveillance Flag]: ${flag.finding}\n  *Note: ${flag.disclaimer}*\n`;
    });
    if (assessment.clinicianNotes) sbarText += `Clinician-entered notes: ${assessment.clinicianNotes}\n`;
    sbarText += `\n`;

    sbarText += `R — REQUEST / RECOMMENDATION:\n`;
    recommendations.forEach((rec, idx) => {
      sbarText += `${idx + 1}. ${rec.text} [Label: ${rec.sourceLabel}]\n`;
    });

    return sbarText;
  }

  // -------------------------------------------------------------
  // Interactive SBAR Editor (Save, Review, Finalize)
  // -------------------------------------------------------------
  saveSbar(data = {}) {
    this.core.assertUnlocked();
    if (!data.id || !isId(data.id)) throw fail('INVALID');
    const sbar = this.store.get('sbar', data.id);
    if (!sbar) throw fail('NOT_FOUND');

    const user = text(data.user || 'Clinician', 60);
    const now = Date.now();

    // Prevent direct editing of finalized SBARs without explicit un-finalize note
    if (sbar.status === 'finalized' && !text(data.revisionReason || '', 1000).trim()) {
      throw fail('POLICY');
    }

    if (data.situation) sbar.situation = { ...sbar.situation, ...data.situation };
    if (data.background) sbar.background = { ...sbar.background, ...data.background };
    if (data.assessment) sbar.assessment = { ...sbar.assessment, ...data.assessment };
    if (Array.isArray(data.recommendations)) sbar.recommendations = data.recommendations;
    if (data.adaptedCommunicationText) sbar.adaptedCommunicationText = text(data.adaptedCommunicationText, 10000);
    if (data.targetKey && COMMUNICATION_TARGETS.some(t => t.id === data.targetKey)) {
      sbar.targetKey = data.targetKey;
      sbar.targetRole = COMMUNICATION_TARGETS.find(t => t.id === data.targetKey).role;
    }

    sbar.status = 'draft';
    sbar.reviewedAt = null; sbar.reviewedBy = null;
    sbar.finalizedAt = null; sbar.finalizedBy = null;
    sbar.adaptedCommunicationText = (this.core.snf?.demoMode ? 'DEMO DATA — NOT FOR CLINICAL USE\n\n' : '') + this.adaptWordingForTarget(sbar);
    sbar.updatedAt = now;
    sbar.auditTrail = sbar.auditTrail || [];
    sbar.auditTrail.push({
      action: 'edited',
      user,
      timestamp: now,
      note: data.revisionReason || data.editNote || 'Updated SBAR contents; review required again.'
    });

    this.store.put('sbar', sbar.id, sbar);
    return sbar;
  }

  reviewSbar(id, reviewer, note = '') {
    this.core.assertUnlocked();
    if (!isId(id)) throw fail('INVALID');
    const sbar = this.store.get('sbar', id);
    if (!sbar) throw fail('NOT_FOUND');

    const now = Date.now();
    if (sbar.evidenceVersion !== 2 || !text(reviewer || '', 100).trim() || sbar.status !== 'draft') throw fail('POLICY');
    sbar.status = 'reviewed';
    sbar.reviewedAt = now;
    sbar.reviewedBy = text(reviewer, 100);
    sbar.updatedAt = now;

    sbar.auditTrail = sbar.auditTrail || [];
    sbar.auditTrail.push({
      action: 'reviewed',
      user: sbar.reviewedBy,
      timestamp: now,
      note: note || 'Clinician verified objective telemetry and confirmed recommendation safety.'
    });

    this.store.put('sbar', sbar.id, sbar);
    this.store.audit('sbar_reviewed');
    this.core.emit?.({ type: 'sbar_reviewed', sbarId: sbar.id, reviewer: sbar.reviewedBy });
    return sbar;
  }

  finalizeSbar(id, finalizer, note = '') {
    this.core.assertUnlocked();
    if (!isId(id)) throw fail('INVALID');
    const sbar = this.store.get('sbar', id);
    if (!sbar) throw fail('NOT_FOUND');

    const now = Date.now();
    if (sbar.evidenceVersion !== 2 || !text(finalizer || '', 100).trim() || sbar.status !== 'reviewed' || !sbar.reviewedAt) throw fail('POLICY');
    sbar.status = 'finalized';
    sbar.finalizedAt = now;
    sbar.finalizedBy = text(finalizer, 100);
    sbar.updatedAt = now;

    sbar.auditTrail = sbar.auditTrail || [];
    sbar.auditTrail.push({
      action: 'finalized',
      user: sbar.finalizedBy,
      timestamp: now,
      note: note || 'SBAR locked for communication dispatch.'
    });

    this.store.put('sbar', sbar.id, sbar);
    this.store.audit('sbar_finalized');
    this.core.emit?.({ type: 'sbar_finalized', sbarId: sbar.id, finalizer: sbar.finalizedBy });
    return sbar;
  }

  // -------------------------------------------------------------
  // Notification Tracking & Follow-Up Engine Integration
  // -------------------------------------------------------------
  logNotification(sbarId, input = {}) {
    this.core.assertUnlocked();
    if (!isId(sbarId)) throw fail('INVALID');
    const sbar = this.store.get('sbar', sbarId);
    if (!sbar) throw fail('NOT_FOUND');

    const now = Date.now();
    const recipientName = text(input.recipientName || 'Attending Physician', 100);
    const method = ['phone', 'secure_message', 'fax', 'in_person', 'other'].includes(input.method) ? input.method : 'phone';
    const outcome = ['message_left', 'provider_contacted', 'orders_received', 'no_new_orders', 'awaiting_callback', 'other'].includes(input.outcome) ? input.outcome : 'provider_contacted';
    const readback = ['not_applicable', 'pending', 'confirmed'].includes(input.readback) ? input.readback : 'not_applicable';
    const user = text(input.user || 'Reporting Nurse', 100);
    const note = text(input.note || '', 1000);

    const notificationRecord = {
      id: uuid(),
      sbarId,
      recipientName,
      recipientRole: input.recipientRole || sbar.targetRole,
      timestamp: now,
      method,
      outcome,
      readback,
      user,
      note
    };

    sbar.notifications = sbar.notifications || [];
    sbar.notifications.push(notificationRecord);

    // Update Close-the-Loop Multi-Stage State
    sbar.closeTheLoop = sbar.closeTheLoop || { history: [] };
    if (outcome === 'awaiting_callback' || outcome === 'message_left') {
      sbar.closeTheLoop.stage = 'awaiting_callback';
      sbar.closeTheLoop.history.push({
        stage: 'awaiting_callback',
        timestamp: now,
        note: `Contacted ${recipientName} via ${method}. Awaiting callback.`
      });
      this.store.audit('provider_response_pending');
      this.core.emit?.({ type: 'provider_response_pending', sbarId, recipientName });
    } else if (outcome === 'orders_received') {
      sbar.closeTheLoop.stage = 'orders_received';
      sbar.closeTheLoop.history.push({
        stage: 'orders_received',
        timestamp: now,
        note: `Orders received from ${recipientName}.`
      });
      this.store.audit('provider_response_received');
      this.core.emit?.({ type: 'provider_response_received', sbarId, recipientName });
    } else {
      sbar.closeTheLoop.stage = 'physician_notified';
      sbar.closeTheLoop.history.push({
        stage: 'physician_notified',
        timestamp: now,
        note: `Notification completed to ${recipientName}.`
      });
      this.store.audit('provider_notification_logged');
      this.core.emit?.({ type: 'provider_notification_logged', sbarId, recipientName });
    }

    sbar.updatedAt = now;
    sbar.auditTrail.push({
      action: 'notification_logged',
      user,
      timestamp: now,
      note: `Logged notification to ${recipientName} (${method} — ${outcome})`
    });

    this.store.put('sbar', sbar.id, sbar);

    // Propose automated follow-up in Universal Action Inbox if awaiting callback
    let proposedFollowUp = null;
    if (outcome === 'awaiting_callback' || outcome === 'message_left') {
      const intervalMinutes = Number(input.callbackIntervalMinutes) || 45;
      const dueAt = now + (intervalMinutes * 60000);
      proposedFollowUp = {
        title: `MD Callback Follow-Up: ${recipientName} regarding ${sbar.residentName}`,
        description: `Follow up if no response from ${recipientName} regarding SBAR condition change (${sbar.situation.concern}). Initial contact logged at ${new Date(now).toLocaleTimeString()}.`,
        priority: 'urgent',
        dueAt,
        sbarId,
        residentName: sbar.residentName,
        recipientName,
        intervalMinutes
      };

      // If user directly approves follow-up creation immediately
      if (input.autoCreateFollowUp !== false) {
        const todo = this.core.saveTodo({
          title: proposedFollowUp.title,
          description: proposedFollowUp.description,
          priority: 'urgent',
          dueAt,
          source: 'manual'
        });
        notificationRecord.followUpTodoId = todo.id;
        this.store.audit('clinical_followup_created');
        this.core.emit?.({ type: 'clinical_followup_created', sbarId, todoId: todo.id });
      }
    }

    return {
      success: true,
      notification: notificationRecord,
      closeTheLoopStage: sbar.closeTheLoop.stage,
      proposedFollowUp
    };
  }

  // -------------------------------------------------------------
  // Close-the-Loop Progression
  // -------------------------------------------------------------
  advanceCloseTheLoop(sbarId, { stage, note, user = 'Clinician' }) {
    this.core.assertUnlocked();
    if (!isId(sbarId)) throw fail('INVALID');
    const sbar = this.store.get('sbar', sbarId);
    if (!sbar) throw fail('NOT_FOUND');

    const validStages = [
      'sbar_drafted',
      'physician_notified',
      'awaiting_callback',
      'orders_received',
      'orders_implemented',
      'resident_response_documented',
      'closed'
    ];
    if (!validStages.includes(stage)) throw fail('INVALID');

    const now = Date.now();
    sbar.closeTheLoop = sbar.closeTheLoop || { history: [] };
    sbar.closeTheLoop.stage = stage;
    sbar.closeTheLoop.isComplete = (stage === 'closed' || stage === 'resident_response_documented');
    sbar.closeTheLoop.history.push({
      stage,
      timestamp: now,
      user,
      note: text(note || `Advanced clinical loop to ${stage}`, 500)
    });

    sbar.updatedAt = now;
    sbar.auditTrail.push({
      action: 'close_the_loop_advanced',
      user,
      timestamp: now,
      note: `Loop stage changed to: ${stage}`
    });

    this.store.put('sbar', sbar.id, sbar);
    return sbar;
  }

  // -------------------------------------------------------------
  // List & Retrieve SBARs
  // -------------------------------------------------------------
  listSbars() {
    this.core.assertUnlocked();
    const list = this.store.list('sbar') || [];
    return list.map(s => ({...s, legacyUnverified: s.evidenceVersion !== 2})).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  getSbar(id) {
    this.core.assertUnlocked();
    if (!isId(id)) throw fail('INVALID');
    const sbar = this.store.get('sbar', id);
    if (!sbar) throw fail('NOT_FOUND');
    return sbar;
  }

  deleteSbar(id) {
    this.core.assertUnlocked();
    if (!isId(id)) throw fail('INVALID');
    this.store.delete('sbar', id);
    if (!this.core.snf?.demoMode) this.core.purgeBackups?.();
    return true;
  }

  // -------------------------------------------------------------
  // Structured Shift-Change Handoff Generator (12 Sections)
  // -------------------------------------------------------------
  generateShiftHandoff(input = {}) {
    this.core.assertUnlocked();
    const shift = ['day', 'evening', 'night'].includes(input.shift) ? input.shift : 'day';
    const now = Date.now();
    const since24h = now - 86400000;

    // Gather live data feeds from store
    const alerts = (this.store.list('snf_alert') || []).filter(a => a.status !== 'resolved');
    const openIssues = this.store.list('snf_open_issue') || [];
    const sbars = this.store.list('sbar') || [];
    const recentSbars = sbars.filter(s => (s.createdAt || 0) >= since24h);
    const todos = this.store.list('todo') || [];
    const pendingTodos = todos.filter(t => t.status === 'pending');

    // 1. New / Changed Residents
    const newOrChanged = alerts.filter(a => a.severity === 'critical' || a.severity === 'high').map(a => ({
      residentName: a.residentName || 'Resident',
      room: a.residentRoom || 'Unit',
      event: a.message,
      timestamp: a.firstDetected
    }));

    // 2. Acute Concerns
    const acuteConcerns = alerts.filter(a => a.code === 'ACUTE_TRANSFER' || a.code === 'VITALS_ABNORMAL' || a.severity === 'critical');

    // 3. Residents Requiring Monitoring
    const monitoringList = alerts.filter(a => a.status !== 'resolved').map(a => ({
      residentName: a.residentName || 'Resident',
      room: a.residentRoom || 'N/A',
      focus: a.title || a.message
    }));

    // 4. New Orders
    const newOrders = (this.store.list('snf_med_order') || []).filter(m => (typeof m.startDate === 'number' ? m.startDate : Date.parse(m.startDate || m.orderDate || '')) >= since24h);

    // 5. Pending Labs / Tests
    const pendingLabs = alerts.filter(a => a.code === 'LAB_CRITICAL' || a.code === 'ANTIBIOTIC_NEW');

    // 6. Falls / Incidents
    const falls = alerts.filter(a => a.code === 'FALL_INCIDENT' && (a.firstDetected || 0) >= since24h);

    // 7. Hospital Transfers / Returns
    const transfers = alerts.filter(a => a.code === 'ACUTE_TRANSFER' && (a.firstDetected || 0) >= since24h);

    // 8. Behavioral / Psychotropic Concerns
    const behaviors = alerts.filter(a => /^(AP-|PRN-|GDR-|PSYCH-|PHARM-)/.test(a.code));

    // 9. Wounds / Skin
    const wounds = alerts.filter(a => a.code === 'WOUND_PRESSURE');

    // 10. Follow-Ups Pending
    const followUpsPending = pendingTodos.map(t => ({
      id: t.id,
      task: t.title,
      priority: t.priority,
      dueAt: t.dueAt
    }));

    // 11. Items Requiring Provider Contact
    const providerContactNeeded = sbars.filter(s => s.closeTheLoop?.stage === 'awaiting_callback' || s.status === 'draft');

    // 12. Items Requiring Family Notification
    const familyNotificationNeeded = falls.filter(f => !f.actionNote || !f.actionNote.toLowerCase().includes('family'));

    const handoff = {
      id: uuid(),
      shift,
      facilityName: this.core.snf?.getSettings?.().facilityName || 'Facility name not configured',
      demo: !!this.core.snf?.demoMode,
      generatedAt: now,
      summary: {
        totalAcute: acuteConcerns.length,
        totalFalls24h: falls.length,
        totalWounds: wounds.length,
        totalPendingFollowUps: followUpsPending.length
      },
      sections: {
        newOrChangedResidents: newOrChanged,
        acuteConcerns,
        residentsRequiringMonitoring: monitoringList,
        newOrders,
        pendingLabsTests: pendingLabs,
        fallsIncidents: falls,
        hospitalTransfersReturns: transfers,
        behavioralPsychotropicConcerns: behaviors,
        woundsSkin: wounds,
        followUpsPending,
        itemsRequiringProviderContact: providerContactNeeded.map(s => ({
          sbarId: s.id,
          residentName: s.residentName,
          concern: s.situation.concern,
          stage: s.closeTheLoop?.stage
        })),
        itemsRequiringFamilyNotification: familyNotificationNeeded.map(f => ({
          alertId: f.id,
          residentName: f.residentName,
          event: f.message
        }))
      }
    };

    return handoff;
  }
}

module.exports = {
  SBAREngine,
  FACILITY_PROTOCOLS,
  SBAR_TEMPLATES,
  COMMUNICATION_TARGETS
};

