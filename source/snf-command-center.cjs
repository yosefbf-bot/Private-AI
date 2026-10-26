'use strict';

/**
 * SNF Command Center — PointClickCare Clinical Surveillance System
 * 
 * Read-only surveillance and clinical risk management engine for Skilled Nursing Facilities.
 * Ingests PointClickCare daily report feeds, runs deterministic clinical rules,
 * maintains persistent alerts, tracks open issues, and produces morning briefs.
 * 
 * Strictly adheres to:
 * - Read-only surveillance (never alters orders, never concludes inappropriate without human review)
 * - Traceability: Every record retains sourceReport, reportDate, residentId, originalRow/ref
 * - Fail-Safe: Missing or unverified data = ALERT, never GREEN.
 * - Human Review Rule: "Review recommended", "Documentation not found in imported sources", etc.
 */

const fs = require('node:fs');
const path = require('node:path');
const { fail, uuid } = require('./security.cjs');

// Required daily and weekly PointClickCare report feeds
const REQUIRED_DAILY_FEEDS = [
  { id: 'census', name: 'Current Census / ADT', critical: true },
  { id: 'admissions', name: 'New Admissions', critical: true },
  { id: 'transfers', name: 'Hospital Transfers and Returns', critical: true },
  { id: 'clinical24', name: '24-Hour Clinical Report / Change in Condition', critical: true },
  { id: 'orders', name: 'New and Changed Physician Orders', critical: true },
  { id: 'med_profile', name: 'Active Medication Profile', critical: true },
  { id: 'med_changes', name: 'Medication Order Changes', critical: true },
  { id: 'emar_exceptions', name: 'eMAR / eTAR Exceptions', critical: true },
  { id: 'diagnoses', name: 'Active Diagnoses', critical: true },
  { id: 'falls', name: 'Falls and Incident Reports', critical: false },
  { id: 'infections', name: 'Infection & Antibiotic Information', critical: false },
  { id: 'wounds', name: 'Wound and Skin Documentation', critical: false },
  { id: 'weights', name: 'Weight and Nutrition Monitoring', critical: false },
  { id: 'behaviors', name: 'Behavior Monitoring & Documentation', critical: true },
  { id: 'progress_notes', name: 'Relevant Clinical Progress Notes', critical: false },
  { id: 'labs', name: 'Labs, Diagnostics & Outstanding Results', critical: false },
];

const PERIODIC_FEEDS = [
  { id: 'psych_report', name: 'Psychotropic Medication Review Report', period: 'weekly' },
  { id: 'pharmacist_review', name: 'Consultant Pharmacist Monthly Review (MRR)', period: 'monthly' },
  { id: 'gdr_tracker', name: 'Gradual Dose Reduction (GDR) Log', period: 'monthly' },
  { id: 'mds_qm', name: 'MDS 3.0 / Quality Measure (QM) Export', period: 'monthly' },
  { id: 'care_plans', name: 'Behavioral Care Plans & Non-Pharm Interventions', period: 'monthly' }
];

// Comprehensive PointClickCare Standard Report Reference Catalog
const PCC_REPORT_CATALOG = [
  {
    id: 'pcc-24hr-summary',
    name: '24 Hr. Summary',
    category: 'Clinical & Shift Summary',
    frequency: 'Daily (Every Shift)',
    feedId: 'clinical24',
    description: 'Summarizes all changes in condition, vitals out of range, nurse narratives, provider visits, and immediate shift escalations over the past 24 hours.'
  },
  {
    id: 'pcc-action-summary',
    name: 'Action Summary Report (Clinical - ADT / Profiles)',
    category: 'Census & ADT',
    frequency: 'Daily',
    feedId: 'census',
    description: 'Tracks resident movements, room changes, level of care transitions, status updates, and actionable profile flags across units.'
  },
  {
    id: 'pcc-adl-index',
    name: 'ADL Index Report',
    category: 'Functional & MDS',
    frequency: 'Weekly / Assessment Interval',
    feedId: 'mds_qm',
    description: 'Aggregates Activities of Daily Living scores (bed mobility, transfers, locomotion, dressing, eating, toilet use, personal hygiene) for functional decline surveillance.'
  },
  {
    id: 'pcc-adl-sig-change',
    name: 'ADL Significant Change Analysis Report',
    category: 'Functional & MDS',
    frequency: 'Weekly / Bi-weekly',
    feedId: 'mds_qm',
    description: 'Surfaces acute or progressive drops in 2 or more ADL categories, triggering CMS Significant Change in Status Assessment (SCSA) evaluation.'
  },
  {
    id: 'pcc-admin-record',
    name: 'Administration Record / Administration Record Blank Report',
    category: 'eMAR & Administration',
    frequency: 'Monthly / Daily',
    feedId: 'emar_exceptions',
    description: 'Standard PointClickCare paper/eMAR administration log for verifying signed, omitted, held, or refused doses across all active med sheets.'
  },
  {
    id: 'pcc-adt-report',
    name: 'Admission, Discharge, and Transfer (ADT) Report',
    category: 'Census & ADT',
    frequency: 'Daily',
    feedId: 'adt',
    description: 'Master log of all new admissions, readmissions, hospital transfers, outpatient ER runs, discharges home or to hospice.'
  },
  {
    id: 'pcc-admit-discharge-tofrom',
    name: 'Admit/Discharge To/From Report',
    category: 'Census & ADT',
    frequency: 'Daily / Weekly',
    feedId: 'transfers',
    description: 'Detailed origin/destination breakdown for tracking acute care transfers, 30-day rehospitalizations, and return-to-provider transitions.'
  },
  {
    id: 'pcc-alert-listing',
    name: 'Alert Listing Report',
    category: 'Clinical Alerts',
    frequency: 'Daily',
    feedId: 'clinical24',
    description: 'Facility-wide list of automated PointClickCare system alerts including critical vital thresholds, lab alerts, and missing assessments.'
  },
  {
    id: 'pcc-allergy-report',
    name: 'Allergy Report',
    category: 'Pharmacy & Safety',
    frequency: 'Weekly / Admission',
    feedId: 'orders',
    description: 'Verified drug, food, and environmental allergies with severity and documented reaction types for contraindication screening.'
  },
  {
    id: 'pcc-assessment-history',
    name: 'Assessment History / Assessment Notifications / Assessment Report',
    category: 'MDS & Assessments',
    frequency: 'Weekly / Assessment Schedule',
    feedId: 'mds_qm',
    description: 'Tracks MDS, CAA, PHQ-9/PHQ-2 mood screens, BIMS cognitive scores, Braden pressure injury scores, and upcoming compliance due dates.'
  },
  {
    id: 'pcc-behavior-monitoring',
    name: 'Behavior Monitoring and Interventions Report & Behavior Report',
    category: 'Behavior & Psych Watch',
    frequency: 'Daily',
    feedId: 'behaviors',
    description: 'Core PointClickCare behavior grid tracking target symptoms (physical aggression, verbal aggression, wandering, distress), non-pharm interventions attempted, and efficacy.'
  },
  {
    id: 'pcc-care-plan',
    name: 'Care Plan / Care Profile Report / Care Records',
    category: 'Care Planning',
    frequency: 'Monthly / On Change',
    feedId: 'care_plans',
    description: 'Comprehensive resident individualized care plans, non-pharmacological behavioral approaches, fall prevention protocols, and measurable clinical goals.'
  },
  {
    id: 'pcc-daily-census',
    name: 'Daily Census / Midnight Census',
    category: 'Census & ADT',
    frequency: 'Daily (Midnight)',
    feedId: 'census',
    description: 'Official bed-by-bed census reconciliation reporting payer source, bed holds, vacant beds, and facility occupancy.'
  },
  {
    id: 'pcc-diagnosis-report',
    name: 'Diagnosis Report *NEW*',
    category: 'Diagnoses & Coding',
    frequency: 'Daily / On Order',
    feedId: 'diagnoses',
    description: 'Full active ICD-10 diagnosis listing per resident, distinguishing CMS-approved antipsychotic indications (Schizophrenia, Huntington’s, Tourette’s) from unapproved off-label diagnoses.'
  },
  {
    id: 'pcc-drug-record-book',
    name: 'Drug Record Book *NEW*',
    category: 'Pharmacy & Controlled Substances',
    frequency: 'Daily / Shift Reconciliation',
    feedId: 'med_profile',
    description: 'Controlled substance log and comprehensive perpetual drug order record, tracking Schedule II–V narcotics, psychotropics, and count reconciliations.'
  },
  {
    id: 'pcc-e-prescribing',
    name: 'Electronic Prescription Report',
    category: 'Pharmacy & Orders',
    frequency: 'Daily',
    feedId: 'orders',
    description: 'EPCS and pharmacy communications confirming physician e-prescriptions, pharmacy fulfillment status, and order transmission receipts.'
  },
  {
    id: 'pcc-immunization',
    name: 'Immunization Report',
    category: 'Infection Control',
    frequency: 'Weekly',
    feedId: 'infections',
    description: 'Influenza, COVID-19, Pneumococcal, and RSV vaccination records, consents, declinations, and upcoming eligibility dates.'
  },
  {
    id: 'pcc-labs-diagnostics',
    name: 'Lab and Diagnostic Record / Lab Results Report',
    category: 'Diagnostics & Labs',
    frequency: 'Daily',
    feedId: 'labs',
    description: 'Pending orders, outstanding specimens, critical high/low lab flags (INR, potassium, sodium, CBC, urine culture, vancomycin troughs) and physician review sign-offs.'
  },
  {
    id: 'pcc-mds-assessment-history',
    name: 'MDS 3.0 Assessment History Report',
    category: 'MDS & Quality Measures',
    frequency: 'Monthly / Quarterly',
    feedId: 'mds_qm',
    description: 'Historical MDS submission status, Section N (Medications), Section E (Behaviors), and Quality Measure calculation audit trail.'
  },
  {
    id: 'pcc-mds-census-roster',
    name: 'MDS Census Roster',
    category: 'MDS & Assessments',
    frequency: 'Weekly',
    feedId: 'census',
    description: 'Census roster cross-referenced against MDS assessment reference dates (ARD) to avoid missed assessment penalties.'
  },
  {
    id: 'pcc-med-admin-audit',
    name: 'Medication Admin Audit Report',
    category: 'eMAR & Administration',
    frequency: 'Daily',
    feedId: 'emar_exceptions',
    description: 'Detailed eMAR pass verification identifying late passes, unadministered scheduled medications, documentation holes, and nurse initials.'
  },
  {
    id: 'pcc-med-review',
    name: 'Medication Review Report',
    category: 'Pharmacy & Consulting',
    frequency: 'Monthly / Reg-483',
    feedId: 'med_profile',
    description: 'Pharmacist and Medical Director monthly regimen review (MRR) tracking polypharmacy (>9 meds), drug-drug interactions, and psychotropic appropriateness.'
  },
  {
    id: 'pcc-nutrition-report',
    name: 'Nutrition Report',
    category: 'Dietary & Nutrition',
    frequency: 'Weekly',
    feedId: 'weights',
    description: 'Therapeutic diets, liquid consistency (nectar, honey), fluid restrictions, enteral feeding orders, and supplement intake percentages.'
  },
  {
    id: 'pcc-order-listing',
    name: 'Order Listing Report / Order Recap Report / Order Summary Report',
    category: 'Physician Orders',
    frequency: 'Daily',
    feedId: 'orders',
    description: 'Complete listing of new, renewed, modified, and discontinued physician orders, including order dates, dosage, frequency, and explicit clinical indications.'
  },
  {
    id: 'pcc-prn-audit',
    name: 'PRN Medication Audit Report / PRN Sheets',
    category: 'eMAR & Administration',
    frequency: 'Daily',
    feedId: 'emar_exceptions',
    description: 'Surveils PRN psychotropic administration frequency against CMS 14-day limit regulations, pre-dose non-pharm intervention efficacy, and post-dose response documentation.'
  },
  {
    id: 'pcc-progress-notes',
    name: 'Progress Notes *NEW*',
    category: 'Clinical Documentation',
    frequency: 'Daily (Continuous)',
    feedId: 'progress_notes',
    description: 'Interdisciplinary progress notes (Nursing, Social Services, Physician, Physical Therapy, Psychiatry) monitored for acute changes and behavioral escalations.'
  },
  {
    id: 'pcc-side-effect-record',
    name: 'Side Effect Care Record',
    category: 'Behavior & Psych Watch',
    frequency: 'Weekly / Shift',
    feedId: 'behaviors',
    description: 'Targeted surveillance for adverse psychotropic side effects: extrapyramidal symptoms (EPS), tardive dyskinesia (AIMS score), sedation, orthostatic hypotension, falls.'
  },
  {
    id: 'pcc-verbal-orders',
    name: 'Telephone/Verbal Orders',
    category: 'Physician Orders',
    frequency: 'Daily',
    feedId: 'orders',
    description: 'Verbal, telephone, and text orders requiring attending physician countersignature within facility policy timeframe (48–72 hours).'
  },
  {
    id: 'pcc-weights-vitals',
    name: 'Weights and Vitals Exception / Weights and Vitals Summary',
    category: 'Vitals & Nutrition',
    frequency: 'Daily / Weekly',
    feedId: 'weights',
    description: 'Surveils unintended weight loss (≥5% in 30 days or ≥10% in 180 days per F-Tag 692), abnormal vitals (hypotension, fever, hypoxia, bradycardia).'
  }
];

// Medication Class Dictionary
const {MEDICATION_CLASSES,TARGET_BEHAVIORS,NON_PHARM_INTERVENTIONS,identifyMedication}=require('./snf/medications/dictionary.cjs');

/**
 * SNFCommandCenter Surveillance Manager
 */
class SNFCommandCenter {
  constructor({ store, root, demoMode = false, integrations = null }) {
    this.store = store;
    this.demoMode = demoMode;
    this.root = root;
    this.settingsKey = 'snf_surveillance_settings';
    this.feedStatusKey = 'snf_feed_status';
    this.pccFeedStatusKey = 'snf_pcc_feed_status';
    this.auditEvent = 'clinical_surveillance';
    this._cache = new Map();
    this._cacheTTL = 5000;
    this.integrations = integrations || new (require('./integrations.cjs').Integrations)({store, assertUnlocked() {}});
    require('./snf/sources/pcc.cjs').attach(this);
    this.integrations.onChange = () => this._invalidateCache();
    this.ensureInitialized();
    if (demoMode) {
      for (const name of Object.getOwnPropertyNames(SNFCommandCenter.prototype).filter(n=>/Report$/.test(n)||n==='generateMorningBrief')) {
        const method=this[name].bind(this);
        this[name]=(...args)=>{const result=method(...args);return typeof result==='string'?'DEMO DATA — NOT FOR CLINICAL USE\n\n'+result:result;};
      }
    }
  }

  _getCached(key, fn) {
    const now = Date.now();
    const hit = this._cache.get(key);
    if (hit && now - hit.ts < this._cacheTTL) {
      return hit.val;
    }
    const val = fn();
    this._cache.set(key, { ts: now, val });
    return val;
  }

  _invalidateCache() {
    this._cache.clear();
  }

  _tx(fn) {
    return typeof this.store.transaction === 'function' ? this.store.transaction(fn) : fn();
  }

  _safeISO(d, fallback) {
    const fb = fallback || new Date().toISOString();
    if (!d) return fb;
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? fb : parsed.toISOString();
  }

  _safeDateString(d, fallback) {
    const fb = fallback || new Date().toISOString().slice(0, 10);
    if (!d) return fb;
    const parsed = new Date(d);
    return isNaN(parsed.getTime()) ? fb : parsed.toISOString().slice(0, 10);
  }

  _extractResidentId(r) {
    if (!r || typeof r !== 'object') return null;
    const raw = r.residentId ?? r.pccId ?? r.id ?? r.resident_id ?? r.Resident_ID ?? r['Resident ID'] ?? r.ResidentId ?? r.name ?? r.residentName ?? r.Resident_Name ?? r['Resident Name'];
    if (raw === undefined || raw === null) return null;
    const s = String(raw).trim();
    return s && s !== 'undefined' && s !== 'null' ? s : null;
  }

  ensureInitialized() {
    // Initialize default facility surveillance settings
    if (!this.store.get('config', this.settingsKey)) {
      this.store.put('config', this.settingsKey, {
        facilityName: 'SNF Healthcare Center',
        emrPlatform: 'Generic imported clinical records',
        emrReadOnly: true,
        retentionDays: 100,
        retentionReportsDays: 200,
        isSupplementalOnly: true,
        regulatoryNotice: "Supplemental surveillance. Default raw retention is 100 days and derived reports 200 days; the organization must approve applicable retention and legal holds. No regulatory exemption is asserted.",
        staleThresholdHours: 18,
        behaviorLookbackDays: 10,
        prnWarningDays: 10,
        prnCriticalDays: 14,
        qmSchizophreniaScrutiny: true,
        autoScanOnStartup: true,
        highAlertCategories: [
          'Antipsychotics',
          'Anxiolytics & Hypnotics (Sedatives)',
          'Anticoagulants & Antiplatelets',
          'Insulin & High-Risk Hypoglycemic Therapy',
          'Opioids & Controlled Pain Analgesics',
          'Systemic Antibiotics & Antimicrobials'
        ],
        updatedAt: Date.now()
      });
    }

    // Initialize feeds status tracking
    if (!this.store.get('config', this.feedStatusKey)) {
      const initialFeeds = {};
      for (const feed of REQUIRED_DAILY_FEEDS) {
        initialFeeds[feed.id] = {
          id: feed.id,
          name: feed.name,
          critical: feed.critical,
          lastReceived: null,
          lastRecordCount: 0,
          status: 'missing',
          error: 'Report has not been received today'
        };
      }
      this.store.put('config', this.feedStatusKey, {
        feeds: initialFeeds,
        lastSuccessfulCycle: null,
        dataCurrentThrough: null,
        validationErrors: []
      });
    }
  }

  getSettings() {
    return this.store.get('config', this.settingsKey) || {};
  }

  saveSettings(updates) {
    const current = this.getSettings();
    const merged = { ...current, ...updates, updatedAt: Date.now() };
    this.store.put('config', this.settingsKey, merged);
    this._invalidateCache();
    return merged;
  }

  getFeedStatus() { return require('./snf/import/feed-health.cjs').getFeedStatus.call(this); }

  _mapReportNameToFeedType(name) {
    if (!name) return 'unknown';
    if ([...REQUIRED_DAILY_FEEDS, ...PERIODIC_FEEDS].some(f=>f.id===name)) return name;
    const s = String(name).toLowerCase().replace(/[^a-z0-9]/g, ' ');
    if (s.includes('pharmacist')) return 'pharmacist_review';
    if (s.includes('psychotropic') || s.includes('psychiatric review')) return 'psych_report';
    if (s.includes('24 hr') || s.includes('24 hour') || s.includes('shift report') || s.includes('alert listing')) return 'clinical24';
    if (s.includes('action summary') || s.includes('daily census') || s.includes('midnight census') || s.includes('mds census')) return 'census';
    if (s.includes('admit discharge to from') || s.includes('transfer') || s.includes('rehospitalization')) return 'transfers';
    if (s.includes('admit') || s.includes('admission') || s.includes('adt')) return 'admissions';
    if (s.includes('order recap') || s.includes('order summary') || s.includes('order listing') || s.includes('verbal order') || s.includes('prescribing') || s.includes('allergy') || s.includes('new order')) return 'orders';
    if (s.includes('medication review') || s.includes('drug record book') || s.includes('drug record') || s.includes('medication profile')) return 'med_profile';
    if (s.includes('medication change') || s.includes('order change') || s.includes('med changes')) return 'med_changes';
    if (s.includes('emar') || s.includes('prn medication audit') || s.includes('prn sheet') || s.includes('med admin audit') || s.includes('administration record') || s.includes('exception')) return 'emar_exceptions';
    if (s.includes('diagnos')) return 'diagnoses';
    if (s.includes('behavior') || s.includes('side effect care') || s.includes('psych')) return 'behaviors';
    if (s.includes('fall')) return 'falls';
    if (s.includes('infect') || s.includes('antibiotic') || s.includes('immuniz')) return 'infections';
    if (s.includes('wound') || s.includes('skin')) return 'wounds';
    if (s.includes('weight') || s.includes('nutrition') || s.includes('vital')) return 'weights';
    if (s.includes('progress note') || s.includes('clinical note')) return 'progress_notes';
    if (s.includes('lab') || s.includes('diagnostic')) return 'labs';
    if (s.includes('gdr') || s.includes('gradual dose')) return 'gdr_tracker';
    if (s.includes('care plan') || s.includes('care profile') || s.includes('care record')) return 'care_plans';
    if (s.includes('mds') || s.includes('adl index') || s.includes('adl sig') || s.includes('assessment')) return 'mds_qm';
    return name;
  }

  /**
   * Ingest normalized reports from a supported source into the shared clinical engine
   */
  async ingestReports(reports, user, options = {}) {
    const sourceProvider = require('./snf/sources/pcc.cjs').sourceProvider(options.sourceProvider ?? (this._seedingDemo ? 'pcc' : 'generic'));
    if (sourceProvider === 'pcc') {
      reports = await this.integrations.read('pcc', 'import', reports);
      this.integrations.assert('pcc', 'import');
    }
    return require('./snf/import/batch-manager.cjs').ingestReports.call(this, reports, user, {sourceProvider});
  }
  alertVisible(alert) { return require('./snf/sources/pcc.cjs').alertVisible(this, alert); }
  issueVisible(issue) { return this.alertVisible(this.store.get('snf_alert', issue.alertId)); }
  _writeRecord(kind, id, value) { return require('./snf/import/provenance.cjs').writeRecord.call(this, kind, id, value); }

  // --- REPORT PARSERS WITH TRACEABILITY ---

  _processCensus(rows, sourceReport, reportDate, importTime) {
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const residentId = this._extractResidentId(r);
      if (!residentId) continue;
      const existing = this.store.get('snf_resident', residentId) || {};
      const resident = {
        id: residentId,
        pccId: r.pccId || residentId,
        name: r.name || r.residentName || 'Resident ' + residentId,
        room: r.room || r.bed || existing.room || 'Unassigned',
        unit: r.unit || r.station || existing.unit || 'Main',
        admissionDate: this._safeDateString(r.admissionDate || existing.admissionDate, this._safeDateString(reportDate)),
        prescriber: r.prescriber || r.physician || existing.prescriber || null,
        status: r.status || 'Active',
        stayType: r.stayType || existing.stayType || 'long_stay', // 'short_stay' | 'long_stay'
        sourceReport,
        reportDate,
        originalRow: i + 1,
        importTimestamp: importTime
      };
      this._writeRecord('snf_resident', residentId, resident);
      count++;
    }
    return count;
  }

  _processAdmissions(rows, sourceReport, reportDate, importTime) {
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const residentId = this._extractResidentId(r);
      if (!residentId) continue;
      const id = r.id || `adm-${reportDate}-${i}`;
      this._writeRecord('snf_admission', id, {
        id,
        residentId,
        residentName: r.name || r.residentName || residentId,
        admissionDate: this._safeDateString(r.admissionDate, this._safeDateString(reportDate)),
        admittedFrom: r.admittedFrom || r.hospital || null,
        primaryDiagnosis: r.primaryDiagnosis || r.admitDiagnosis || null,
        prescriber: r.prescriber || r.physician,
        sourceReport,
        reportDate,
        originalRow: i + 1,
        importTimestamp: importTime
      });
      count++;
    }
    return count;
  }

  _processTransfers(rows, sourceReport, reportDate, importTime) {
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const residentId = this._extractResidentId(r);
      if (!residentId) continue;
      const id = r.id || `trans-${reportDate}-${i}`;
      this._writeRecord('snf_transfer', id, {
        id,
        residentId,
        residentName: r.name || r.residentName || residentId,
        type: r.type || null, // 'Transfer Out' | 'Return'
        hospital: r.hospital || r.destination || null,
        reason: r.reason || null,
        eventDate: this._safeDateString(r.eventDate, this._safeDateString(reportDate)),
        sourceReport,
        reportDate,
        originalRow: i + 1,
        importTimestamp: importTime
      });
      count++;
    }
    return count;
  }

  _processClinical24(rows, sourceReport, reportDate, importTime) {
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const residentId = this._extractResidentId(r);
      if (!residentId) continue;
      const id = r.id || `clin24-${reportDate}-${i}`;
      this._writeRecord('snf_clinical24', id, {
        id,
        residentId,
        residentName: r.name || r.residentName || residentId,
        shift: r.shift || '24-Hour',
        summary: r.summary || r.notes || r.event || null,
        vitalSigns: r.vitals || null,
        providerNotified: importedBoolean(r.providerNotified),
        familyNotified: importedBoolean(r.familyNotified),
        eventDate: this._safeDateString(r.eventDate, this._safeDateString(reportDate)),
        sourceReport,
        reportDate,
        originalRow: i + 1,
        importTimestamp: importTime
      });
      count++;
    }
    return count;
  }

  _processMedProfile(rows, sourceReport, reportDate, importTime) {
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const residentId = this._extractResidentId(r);
      if (!residentId) continue;
      const drugName = r.medication || r.drugName || r.order || '';
      const identified = identifyMedication(drugName);
      const orderId = r.orderId || `ord-${residentId}-${drugName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

      const order = {
        id: orderId,
        residentId,
        residentName: r.residentName || r.name || residentId,
        drugName,
        genericName: identified.matchedGeneric || r.genericName || drugName,
        brandName: r.brandName || drugName,
        drugClass: identified.drugClass,
        isHighAlert: identified.isHighAlert,
        isPsychotropic: identified.isPsychotropic,
        isAntipsychotic: identified.isAntipsychotic,
        dose: r.dose || null,
        route: r.route || null,
        frequency: r.frequency || null,
        isPRN: !!(r.prn || (r.frequency && /prn|as needed/i.test(r.frequency))),
        startDate: r.startDate && Number.isFinite(Date.parse(r.startDate)) ? this._safeDateString(r.startDate) : null,
        endDate: r.endDate ? this._safeDateString(r.endDate) : null,
        prescriber: r.prescriber || r.physician || null,
        indication: r.indication || r.diagnosis || null,
        status: r.status || 'Active',
        sourceReport,
        reportDate,
        originalRow: i + 1,
        importTimestamp: importTime
      };

      this._writeRecord('snf_med_order', orderId, order);
      count++;
    }
    return count;
  }

  _processOrderChanges(rows, sourceReport, reportDate, importTime) {
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const residentId = this._extractResidentId(r);
      if (!residentId) continue;
      const drugName = r.medication || r.drugName || '';
      const identified = identifyMedication(drugName);
      const changeId = r.id || `chg-${reportDate}-${i}`;

      const changeRecord = {
        id: changeId,
        residentId,
        residentName: r.residentName || r.name || residentId,
        drugName,
        genericName: identified.matchedGeneric || drugName,
        drugClass: identified.drugClass,
        isHighAlert: identified.isHighAlert,
        isPsychotropic: identified.isPsychotropic,
        isAntipsychotic: identified.isAntipsychotic,
        changeType: r.changeType || r.action || 'Unknown', // 'New Order' | 'Dose Increase' | 'Dose Decrease' | 'Discontinued' | 'Restart'
        previousDose: r.previousDose || null,
        newDose: r.newDose || r.dose,
        frequency: r.frequency,
        isPRN: !!(r.prn || (r.frequency && /prn/i.test(r.frequency))),
        prescriber: r.prescriber || r.physician,
        orderDate: r.orderDate && Number.isFinite(Date.parse(r.orderDate)) ? this._safeDateString(r.orderDate) : null,
        indication: r.indication || null,
        rationale: r.rationale || r.reason || null,
        sourceReport,
        reportDate,
        originalRow: i + 1,
        importTimestamp: importTime
      };

      this._writeRecord('snf_med_change', changeId, changeRecord);

      // Also ensure order is stored in active orders if new
      if (changeRecord.changeType === 'New Order') {
        const orderId = `ord-${residentId}-${drugName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        this._writeRecord('snf_med_order', orderId, {
          id: orderId,
          residentId,
          residentName: changeRecord.residentName,
          drugName,
          genericName: changeRecord.genericName,
          drugClass: changeRecord.drugClass,
          isHighAlert: changeRecord.isHighAlert,
          isPsychotropic: changeRecord.isPsychotropic,
          isAntipsychotic: changeRecord.isAntipsychotic,
          dose: changeRecord.newDose,
          route: r.route || null,
          frequency: changeRecord.frequency || null,
          isPRN: changeRecord.isPRN,
          startDate: changeRecord.orderDate,
          prescriber: changeRecord.prescriber,
          indication: changeRecord.indication,
          status: 'Active',
          sourceReport,
          reportDate,
          originalRow: i + 1,
          importTimestamp: importTime
        });
      }

      count++;
    }
    return count;
  }

  _processEmarExceptions(rows, sourceReport, reportDate, importTime) {
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const residentId = this._extractResidentId(r);
      if (!residentId) continue;
      const id = r.id || `emar-${reportDate}-${i}`;
      this._writeRecord('snf_emar_exception', id, {
        id,
        residentId,
        residentName: r.residentName || r.name || residentId,
        medication: r.medication || r.drugName,
        scheduledTime: r.scheduledTime || null,
        exceptionType: r.exceptionType || r.status || 'Unknown', // 'Refused' | 'Omitted' | 'Not Available' | 'Held'
        reason: r.reason || null,
        nurse: r.nurse || r.administeredBy || null,
        eventDate: this._safeDateString(r.eventDate, this._safeDateString(reportDate)),
        sourceReport,
        reportDate,
        originalRow: i + 1,
        importTimestamp: importTime
      });
      count++;
    }
    return count;
  }

  _processDiagnoses(rows, sourceReport, reportDate, importTime) {
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const residentId = this._extractResidentId(r);
      if (!residentId) continue;
      const desc = r.description || r.diagnosis || r.name || '';
      const code = r.icd10 || r.code || '';
      const id = r.id || `diag-${residentId}-${(code || desc).toLowerCase().replace(/[^a-z0-9]/g, '')}`;

      const isPsychiatric = /schizo|psychos|bipolar|depress|anxiety|hallucin|delusion|mood|dementia with behav|personality/i.test(desc) ||
        /^F(20|21|22|25|28|29|30|31|32|33|03\.91)/i.test(code);

      this._writeRecord('snf_diagnosis', id, {
        id,
        residentId,
        residentName: r.residentName || r.name || residentId,
        icd10: code,
        description: desc,
        onsetDate: this._safeDateString(r.onsetDate || r.startDate, this._safeDateString(reportDate)),
        isPsychiatric,
        isSchizophrenia: /schizophrenia|schizoaffective/i.test(desc) || /^F20/i.test(code),
        status: r.status || 'Active',
        sourceReport,
        reportDate,
        originalRow: i + 1,
        importTimestamp: importTime
      });
      count++;
    }
    return count;
  }

  _processBehaviors(rows, sourceReport, reportDate, importTime) {
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const residentId = this._extractResidentId(r);
      if (!residentId) continue;
      const id = r.id || `beh-${reportDate}-${i}`;
      this._writeRecord('snf_behavior', id, {
        id,
        residentId,
        residentName: r.residentName || r.name || residentId,
        targetSymptom: r.targetSymptom || r.behavior || null,
        severity: r.severity || null, // 'Mild' | 'Moderate' | 'Severe'
        triggers: r.triggers || r.circumstances || null,
        interventionsAttempted: r.interventionsAttempted || r.interventions || null,
        effectiveness: r.effectiveness || null,
        adverseEffects: r.adverseEffects || null,
        eventDate: this._safeDateString(r.eventDate, this._safeDateString(reportDate)),
        sourceReport,
        reportDate,
        originalRow: i + 1,
        importTimestamp: importTime
      });
      count++;
    }
    return count;
  }

  _processFalls(rows, sourceReport, reportDate, importTime) {
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const residentId = this._extractResidentId(r);
      if (!residentId) continue;
      const id = r.id || `fall-${reportDate}-${i}`;
      this._writeRecord('snf_fall', id, {
        id,
        residentId,
        residentName: r.residentName || r.name || residentId,
        location: r.location || null,
        injuryLevel: r.injuryLevel || null, // 'None' | 'Minor' | 'Major'
        witnessed: importedBoolean(r.witnessed),
        neuroChecksDone: r.neuroChecksDone === true ? true : r.neuroChecksDone === false ? false : null,
        eventDate: this._safeDateString(r.eventDate, this._safeDateString(reportDate)),
        sourceReport,
        reportDate,
        originalRow: i + 1,
        importTimestamp: importTime
      });
      count++;
    }
    return count;
  }

  _processInfections(rows, sourceReport, reportDate, importTime) {
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const residentId = this._extractResidentId(r);
      if (!residentId) continue;
      const id = r.id || `inf-${reportDate}-${i}`;
      this._writeRecord('snf_infection', id, {
        id,
        residentId,
        residentName: r.residentName || r.name || residentId,
        infectionType: r.infectionType || null, // 'UTI' | 'Respiratory' | 'Skin' | 'GI'
        antibiotic: r.antibiotic || null,
        startDate: r.startDate && Number.isFinite(Date.parse(r.startDate)) ? this._safeDateString(r.startDate) : null,
        mcGeerCriteriaMet: r.mcGeerCriteriaMet === true ? true : r.mcGeerCriteriaMet === false ? false : null,
        sourceReport,
        reportDate,
        originalRow: i + 1,
        importTimestamp: importTime
      });
      count++;
    }
    return count;
  }

  _processWounds(rows, sourceReport, reportDate, importTime) {
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const residentId = this._extractResidentId(r);
      if (!residentId) continue;
      const id = r.id || `wnd-${reportDate}-${i}`;
      this._writeRecord('snf_wound', id, {
        id,
        residentId,
        residentName: r.residentName || r.name || residentId,
        woundType: r.woundType || null,
        stage: r.stage || null,
        site: r.site || null,
        acquired: r.acquired || null, // 'In-House' | 'On Admission'
        treatment: r.treatment || null,
        assessmentDate: this._safeDateString(r.assessmentDate, this._safeDateString(reportDate)),
        sourceReport,
        reportDate,
        originalRow: i + 1,
        importTimestamp: importTime
      });
      count++;
    }
    return count;
  }

  _processLabs(rows, sourceReport, reportDate, importTime) {
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const residentId = this._extractResidentId(r);
      if (!residentId) continue;
      const id = r.id || `lab-${reportDate}-${i}`;
      this._writeRecord('snf_lab', id, {
        id,
        residentId,
        residentName: r.residentName || r.name || residentId,
        testName: r.testName || r.lab || null,
        result: r.result || null,
        abnormal: importedBoolean(r.abnormal),
        criticalValue: importedBoolean(r.criticalValue),
        followUpStatus: r.followUpStatus || 'Not documented',
        collectedDate: this._safeDateString(r.collectedDate, this._safeDateString(reportDate)),
        sourceReport,
        reportDate,
        originalRow: i + 1,
        importTimestamp: importTime
      });
      count++;
    }
    return count;
  }

  _processProgressNotes(rows, sourceReport, reportDate, importTime) {
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const residentId = this._extractResidentId(r);
      if (!residentId) continue;
      const id = r.id || `note-${reportDate}-${i}`;
      this._writeRecord('snf_progress_note', id, {
        id,
        residentId,
        residentName: r.residentName || r.name || residentId,
        noteType: r.noteType || null, // 'Nursing' | 'Physician' | 'Psychiatry' | 'Social Service'
        author: r.author || null,
        text: r.text || r.summary || '',
        noteDate: this._safeDateString(r.noteDate, this._safeDateString(reportDate)),
        sourceReport,
        reportDate,
        originalRow: i + 1,
        importTimestamp: importTime
      });
      count++;
    }
    return count;
  }

  _processGDR(rows, sourceReport, reportDate, importTime) {
    let count = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const residentId = this._extractResidentId(r);
      if (!residentId) continue;
      const id = r.id || `gdr-${reportDate}-${i}`;
      this._writeRecord('snf_gdr', id, {
        id,
        residentId,
        residentName: r.residentName || r.name || residentId,
        medication: r.medication,
        lastGDRDate: r.lastGDRDate || null,
        result: r.result || null, // 'Success' | 'Relapsed/Reverted' | 'Contraindicated' | 'Pending'
        nextReviewDate: r.nextReviewDate || null,
        isContraindicated: importedBoolean(r.isContraindicated),
        clinicalRationale: r.clinicalRationale || null,
        prescriberDocumentation: importedBoolean(r.prescriberDocumentation),
        sourceReport,
        reportDate,
        originalRow: i + 1,
        importTimestamp: importTime
      });
      count++;
    }
    return count;
  }

  _processSupplemental(rows, sourceReport, reportDate, importTime) {
    const kind = {psych_report:'snf_psych_review',pharmacist_review:'snf_pharmacist_review',weights:'snf_weight',care_plans:'snf_care_plan'}[this._batchContext.type];
    rows.forEach((row,i)=>this._writeRecord(kind, uuid(), {...row,id:uuid(),residentId:row.residentId,sourceReport,reportDate,importTimestamp:importTime,originalRow:i+1}));
    return rows.length;
  }

  // --- DETERMINISTIC CLINICAL RULES ENGINE ---

  async runRulesEngine(user) { return require('./snf/rules/engine.cjs').runRulesEngine.call(this,user); }

  // --- ALERT LIFECYCLE & OPEN ISSUES ENGINE ---

  _createAlert({ code, severity, title, message, residentId, residentName, residentRoom, drug, sources = [], whyFlagged = [] }, evidenceContext) {
    severity = {review:'medium',info:'informational'}[severity] || severity;
    const evidence = require('./snf/rules/evidence.cjs').capture.call(this, code, residentId, message, whyFlagged, evidenceContext);
    sources = evidence.sources;
    const alertId = `alt-${code}-${residentId || 'facility'}-${(drug || 'general').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const existing = this.store.get('snf_alert', alertId);

    const now = Date.now();
    if (existing) {
      // Update existing alert without losing acknowledgement/in-review state
      const updated = {
        ...existing,
        ...evidence,
        evaluationHistory: [...new Set([...(existing.evaluationHistory||[]), evidence.evaluationId])],
        // A changed evidence set reopens a resolved finding; omissions never close one.
        status: existing.status === 'resolved' && existing.evaluationId !== evidence.evaluationId ? 'new' : existing.status,
        auditTrail: existing.status === 'resolved' && existing.evaluationId !== evidence.evaluationId ? [...(existing.auditTrail||[]),{action:'reopened',timestamp:now,user:'Rules engine',note:'New imported evidence'}] : existing.auditTrail,
        title,
        message,
        severity,
        lastDetected: now,
        sources,
        whyFlagged,
        occurrenceCount: (existing.occurrenceCount || 1) + 1
      };
      this.store.put('snf_alert', alertId, updated);
      return updated;
    }

    const newAlert = {
      id: alertId,
      ...evidence,
      evaluationHistory: [evidence.evaluationId],
      createdDate: now,
      dueDate: now + (severity === 'critical' ? 4 : severity === 'high' ? 24 : 72) * 3600000,
      owner: null,
      evidenceReviewed: [],
      code,
      severity, // 'critical' | 'high' | 'review' | 'info'
      title,
      message,
      residentId,
      residentName: residentName || 'Unknown Resident',
      residentRoom: residentRoom || 'Unassigned',
      drug: drug || null,
      sources,
      whyFlagged,
      status: 'new', // 'new' -> 'acknowledged' -> 'in_review' -> 'resolved'
      firstDetected: now,
      lastDetected: now,
      acknowledgedBy: null,
      acknowledgedAt: null,
      assignedTo: null,
      resolvedBy: null,
      resolvedAt: null,
      resolutionStatus: null,
      actionNote: null,
      auditTrail: [
        { action: 'created', user: 'System Surveillance Engine', timestamp: now, note: 'Deterministic rule triggered' }
      ]
    };

    this.store.put('snf_alert', alertId, newAlert);
    return newAlert;
  }

  getActiveAlerts() {
    return this.store.list('snf_alert').filter(a => this.alertVisible(a) && a.status !== 'resolved' && a.status !== 'dismissed');
  }

  updateAlert(id, patch, user) { return require('./snf/alerts/lifecycle.cjs').updateAlert.call(this,id,patch,user); }
  acknowledgeAlert(id,user='Clinician') { const a=this.store.get('snf_alert',id); if(a?.status==='resolved')return a;return this.updateAlert(id,{status:'acknowledged'},user); }
  assignAlert(id,owner,user='Clinician',note='') { return this.updateAlert(id,{status:'in_review',owner,note},user); }
  resolveAlert(id,reason,note='',user='Clinician') { return this.updateAlert(id,{status:'resolved',resolutionReason:reason,note},user); }

  _syncOpenIssues() {
    const alerts = this.store.list('snf_alert');
    for (const alt of alerts) {
      if (['critical', 'high'].includes(alt.severity)) {
        const issueId = `issue-${alt.id}`;
        const existing = this.store.get('snf_open_issue', issueId);
        const isOpen = alt.status !== 'resolved';

        const issue = {
          id: issueId,
          alertId: alt.id,
          residentId: alt.residentId,
          residentName: alt.residentName,
          residentRoom: alt.residentRoom,
          issue: alt.title,
          detail: alt.message,
          severity: alt.severity,
          firstDetected: alt.firstDetected,
          lastDetected: alt.lastDetected,
          source: alt.sources?.[0]?.sourceReport || 'Imported clinical records',
          owner: alt.assignedTo || 'Clinical Team',
          status: isOpen ? (alt.status === 'in_review' ? 'In Review' : 'Open') : 'Resolved',
          acknowledged: !!alt.acknowledgedAt,
          actionNote: alt.actionNote || null,
          resolution: alt.resolutionStatus || null,
          resolutionDate: alt.resolvedAt || null
        };
        this.store.put('snf_open_issue', issueId, issue);
      }
    }
  }

  /**
   * Universal Clinical Alert Status counts
   */
  getAlertSummary() {
    return this._getCached('alertSummary', () => {
      const alerts = this.store.list('snf_alert').filter(a => this.alertVisible(a) && a.status !== 'resolved');
      const critical = alerts.filter(a => a.severity === 'critical').length;
      const high = alerts.filter(a => a.severity === 'high').length;
      const review = alerts.filter(a => a.severity === 'medium').length;
      const unacknowledgedCritical = alerts.filter(a => a.severity === 'critical' && !a.acknowledgedAt).length;

      const feedStatus = this.getFeedStatus();

      return {
        critical,
        high,
        review,
        totalUnresolved: alerts.length,
        unacknowledgedCritical,
        hasUnresolvedCritical: critical > 0,
        feedStatus
      };
    });
  }

  // --- FACILITY DASHBOARD & QUALITY MEASURE METRICS ---

  getDashboardMetrics() {
    return this._getCached('dashboardMetrics', () => {
      const residents = this.store.list('snf_resident');
      const orders = this.store.list('snf_med_order');
      const orderChanges = this.store.list('snf_med_change');
      const diagnoses = this.store.list('snf_diagnosis');
      const alerts = this.store.list('snf_alert');
      const unresolvedAlerts = alerts.filter(a => this.alertVisible(a) && a.status !== 'resolved');

    const totalCensus = residents.length;
    const activeAPs = orders.filter(o => o.status === 'Active' && o.isAntipsychotic);
    const apResidentIds = new Set(activeAPs.map(o => o.residentId));

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const newAPs24h = orderChanges.filter(c => c.isAntipsychotic && c.changeType === 'New Order' && c.importTimestamp >= oneDayAgo).length;
    const newAPs7d = orderChanges.filter(c => c.isAntipsychotic && c.changeType === 'New Order' && c.importTimestamp >= sevenDaysAgo).length;
    const newAPs30d = orderChanges.filter(c => c.isAntipsychotic && c.changeType === 'New Order' && c.importTimestamp >= thirtyDaysAgo).length;

    const doseIncreases = orderChanges.filter(c => c.isAntipsychotic && c.changeType === 'Dose Increase').length;
    const prnAPs = activeAPs.filter(o => o.isPRN).length;

    const docGaps = unresolvedAlerts.filter(a => ['AP-002', 'AP-004', 'AP-005', 'AP-NONPHARM'].includes(a.code)).length;
    const gdrAlerts = unresolvedAlerts.filter(a => a.code === 'GDR-001').length;
    const prnDeadlines = unresolvedAlerts.filter(a => a.code === 'PRN-014').length;
    const newPsychDiags = unresolvedAlerts.filter(a => a.code === 'AP-003').length;

    // Exploratory imported-data ratio; not an implementation of the official CMS measure.
    // Label: "Estimated QM Exposure"
    const longStayResidents = residents.filter(r => r.stayType === 'long_stay');
    const potentialNumerator = [];
    const knownExclusions = [];
    const possibleExclusionsToVerify = [];

    for (const res of longStayResidents) {
      const hasAP = activeAPs.some(a => a.residentId === res.id);
      if (hasAP) {
        const resDiags = diagnoses.filter(d => d.residentId === res.id);
        const hasSchizophrenia = resDiags.some(d => /schizophrenia|schizoaffective/i.test(d.description) || /^F20/i.test(d.icd10));
        const hasTourette = resDiags.some(d => /tourette/i.test(d.description) || /^F95\.2/i.test(d.icd10));
        const hasHuntington = resDiags.some(d => /huntington/i.test(d.description) || /^G10/i.test(d.icd10));

        if (hasSchizophrenia || hasTourette || hasHuntington) {
          knownExclusions.push({
            residentId: res.id,
            residentName: res.name,
            reason: hasSchizophrenia ? 'Schizophrenia / Schizoaffective' : hasTourette ? "Tourette's Disorder" : "Huntington's Disease"
          });
        } else {
          // Check for possible diagnoses in notes that require diagnosis export verification
          const hasUnconfirmedMention = resDiags.some(d => /psychotic|bipolar/i.test(d.description));
          if (hasUnconfirmedMention) {
            possibleExclusionsToVerify.push({
              residentId: res.id,
              residentName: res.name,
              reason: 'Psychotic disorder noted; needs formal MDS / CMS ICD-10 exclusion verification'
            });
          }
          potentialNumerator.push({
            residentId: res.id,
            residentName: res.name,
            room: res.room,
            unit: res.unit,
            prescriber: res.prescriber
          });
        }
      }
    }

    const coverage = this.getFeedStatus();
    const qmInputsAvailable = ['census','med_profile','diagnoses'].every(id => coverage.feeds[id]?.status === 'ok');
    const estimatedQMRate = qmInputsAvailable && longStayResidents.length > 0
      ? ((potentialNumerator.length / longStayResidents.length) * 100).toFixed(1)
      : null;

    return {
      totalCensus,
      antipsychoticResidentsCount: coverage.feeds.med_profile?.status==='ok'?apResidentIds.size:null,
      psychWatchCard: {
        antipsychoticResidents: coverage.feeds.med_profile?.status==='ok'?apResidentIds.size:null,
        newAPs24h,
        documentationReview: docGaps,
        gdrReview: gdrAlerts,
        prnDeadlines
      },
      antipsychoticMetrics: {
        newAPs24h,
        newAPs7d,
        newAPs30d,
        doseIncreases,
        prnAPs,
        docGaps,
        gdrAlerts,
        prnDeadlines,
        newPsychDiags
      },
      qmWatch: {
        label: 'Estimated QM Exposure',
        availability: qmInputsAvailable && longStayResidents.length > 0 ? 'available' : 'unknown',
        note: 'Exploratory imported-data estimate, not the official CMS measure. Exclusions, denominator and current methodology require independent verification.',
        longStayDenominator: longStayResidents.length,
        potentialNumeratorCount: potentialNumerator.length,
        potentialNumeratorResidents: potentialNumerator,
        knownExclusionsCount: knownExclusions.length,
        knownExclusions,
        possibleExclusionsToVerifyCount: possibleExclusionsToVerify.length,
        possibleExclusionsToVerify,
        estimatedRatePercentage: estimatedQMRate
      },
      feedStatus: this.getFeedStatus(),
      unresolvedAlertCounts: {
        critical: unresolvedAlerts.filter(a => a.severity === 'critical').length,
        high: unresolvedAlerts.filter(a => a.severity === 'high').length,
        review: unresolvedAlerts.filter(a => a.severity === 'medium').length
      }
    };
    });
  }

  // --- MORNING ADMINISTRATOR BRIEF GENERATOR (/morning) ---

  generateMorningBrief() {
    return this._getCached('morningBrief', () => {
      const metrics = this.getDashboardMetrics();
    const alerts = this.store.list('snf_alert');
    const unresolved = alerts.filter(a => a.status !== 'resolved');
    const criticalAlerts = unresolved.filter(a => a.severity === 'critical');
    const highAlerts = unresolved.filter(a => a.severity === 'high');

    const admissions = this.store.list('snf_admission');
    const transfers = this.store.list('snf_transfer');
    const medChanges = this.store.list('snf_med_change');
    const emar = this.store.list('snf_emar_exception');
    const falls = this.store.list('snf_fall');
    const infections = this.store.list('snf_infection');
    const wounds = this.store.list('snf_wound');
    const labs = this.store.list('snf_lab');
    const clinical24 = this.store.list('snf_clinical24');
    const openIssues = this.store.list('snf_open_issue').filter(i => this.issueVisible(i) && i.status !== 'Resolved');

    const now = Date.now();
    const oneDayAgo = now - 36 * 60 * 60 * 1000;
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    let brief = `# PRIVATE AI — MORNING ADMINISTRATOR & CLINICAL BRIEF\n`;
    brief += `**Date**: ${dateStr} | **Census**: ${metrics.totalCensus} | **Imported Data Status**: ${metrics.feedStatus.dataCurrentThroughFormatted}\n\n`;

    // 1. TOP SECTION MUST ALWAYS BE: CRITICAL / UNRESOLVED
    brief += `## 🔴 CRITICAL / UNRESOLVED CLINICAL ITEMS\n`;
    if (criticalAlerts.length === 0 && metrics.feedStatus.isSurveillanceComplete) {
      brief += `*No unacknowledged critical clinical exceptions currently active across verified feeds.*\n\n`;
    } else {
      if (metrics.feedStatus.monitoringEnabled && !metrics.feedStatus.isSurveillanceComplete) {
        brief += `⚠️ **SURVEILLANCE COMPLIANCE ALERT**: Data feeds are incomplete or stale. Review Feed Integrity below.\n`;
      }
      brief += `**${criticalAlerts.length} Critical Alert(s) Requiring Immediate Review:**\n`;
      for (const a of criticalAlerts) {
        brief += `- **[${a.residentName || 'FACILITY'}] ${a.title}**: ${a.message} *(Source: ${a.sources?.[0]?.sourceReport || 'Imported clinical records'})*\n`;
      }
      brief += `\n`;
    }

    if (highAlerts.length > 0) {
      brief += `**${highAlerts.length} High Priority Clinical Item(s):**\n`;
      for (const a of highAlerts.slice(0, 8)) {
        brief += `- **[${a.residentName}] ${a.title}**: ${a.message}\n`;
      }
      if (highAlerts.length > 8) {
        brief += `- *...and ${highAlerts.length - 8} additional high-priority items in the Command Center.*\n`;
      }
      brief += `\n`;
    }

    // 2. OVERNIGHT CLINICAL EVENTS & CHANGES IN CONDITION
    brief += `### Overnight Clinical Events & 24h Reports\n`;
    const recentClin24 = clinical24.filter(c => (now - c.importTimestamp) <= oneDayAgo);
    if (recentClin24.length === 0) {
      brief += `- No acute-change entries in supplied 24h reports; missing records do not establish stability.\n`;
    } else {
      for (const c of recentClin24) {
        brief += `- **${c.residentName}**: ${c.summary} (Provider notified: ${c.providerNotified ? 'Yes' : 'No'})\n`;
      }
    }
    brief += `\n`;

    // 3. HOSPITAL TRANSFERS & ADMISSIONS
    brief += `### Hospital Transfers & New Admissions\n`;
    const recentTrans = transfers.filter(t => (now - t.importTimestamp) <= oneDayAgo);
    const recentAdm = admissions.filter(a => (now - a.importTimestamp) <= oneDayAgo);
    brief += `- **Hospital Transfers Out**: ${recentTrans.length ? recentTrans.map(t => `${t.residentName} (${t.hospital} - ${t.reason})`).join(', ') : 'Not recorded in supplied reports; status unknown'}\n`;
    brief += `- **New Admissions**: ${recentAdm.length ? recentAdm.map(a => `${a.residentName} (Rm ${a.room || 'TBD'} - ${a.primaryDiagnosis})`).join(', ') : 'Not recorded in supplied reports; status unknown'}\n\n`;

    // 4. NEW MEDICATIONS & PSYCH WATCH
    brief += `### New Medications & Psych Watch Overview\n`;
    const pw = metrics.psychWatchCard;
    brief += `**Psych Watch Metrics**: Antipsychotic Residents: **${pw.antipsychoticResidents??"Unknown"}** | New (24h): **${pw.newAPs24h}** | Doc Reviews: **${pw.documentationReview}** | GDR Reviews: **${pw.gdrReview}** | PRN 14-Day Deadlines: **${pw.prnDeadlines}**\n`;
    brief += `**Estimated QM Exposure**: **${metrics.qmWatch.estimatedRatePercentage==null?"Unknown":metrics.qmWatch.estimatedRatePercentage+"%"}** (${metrics.qmWatch.potentialNumeratorCount} of ${metrics.qmWatch.longStayDenominator} long-stay residents; ${metrics.qmWatch.knownExclusionsCount} diagnosis exclusion candidates requiring verification)\n\n`;

    // 5. INCIDENTS, INFECTIONS & EXCEPTIONS
    brief += `### Incidents, Infections & eMAR Exceptions\n`;
    const recentFalls = falls.filter(f => (now - f.importTimestamp) <= oneDayAgo);
    const recentEmar = emar.filter(e => (now - e.importTimestamp) <= oneDayAgo);
    const recentInf = infections.filter(i => (now - i.importTimestamp) <= oneDayAgo);
    brief += `- **Falls in Last 24 Hours**: ${recentFalls.length ? `${recentFalls.length} fall(s) reported (${recentFalls.map(f => `${f.residentName} - ${f.location}, injury: ${f.injuryLevel}`).join('; ')})` : 'No fall entries in supplied reports; status unknown'}\n`;
    brief += `- **New Infection Surveillance**: ${recentInf.length ? recentInf.map(i => `${i.residentName} (${i.infectionType}, ABX: ${i.antibiotic || 'None'})`).join('; ') : 'No infection entries in supplied reports; status unknown'}\n`;
    brief += `- **eMAR / eTAR Exceptions**: ${recentEmar.length ? `${recentEmar.length} exception(s) logged (${recentEmar.map(e => `${e.residentName}: ${e.medication} - ${e.exceptionType}`).slice(0, 5).join('; ')})` : 'No exception entries in supplied reports; status unknown'}\n\n`;

    // 6. PREVIOUSLY UNRESOLVED ISSUES (CARRY-FORWARD)
    brief += `### Previously Unresolved Open Issues\n`;
    if (openIssues.length === 0) {
      brief += `- No open issues are recorded in the available evidence; this does not establish that all previous issues were resolved.\n`;
    } else {
      for (const iss of openIssues.slice(0, 5)) {
        const daysOpen = Math.max(1, Math.floor((now - iss.firstDetected) / (24 * 60 * 60 * 1000)));
        brief += `- **[Day ${daysOpen}] ${iss.residentName}**: ${iss.issue} (Status: ${iss.status}, Owner: ${iss.owner})\n`;
      }
    }
    brief += `\n---\n*Report generated deterministically by Private AI SNF Command Center. Traceable to supplied clinical records; missing evidence remains unknown.*`;

    return brief;
    });
  }

  // --- QUICK COMMANDS DATA EXTRACTORS ---

  getCriticalAlertsReport() {
    return this._getCached('report_critical_alerts', () => {
      const alerts = this.store.list('snf_alert').filter(a => a.severity === 'critical' && a.status !== 'resolved');
      if (!alerts.length) return 'No unresolved critical alerts in supplied records. Missing or incomplete data prevents an all-clear conclusion.';
      return `# UNRESOLVED CRITICAL CLINICAL ALERTS (${alerts.length})\n\n` +
        alerts.map((a, i) => `### ${i + 1}. [${a.residentName} - Rm ${a.residentRoom || 'N/A'}] ${a.title}\n` +
          `- **Message**: ${a.message}\n` +
          `- **Drug**: ${a.drug || 'N/A'}\n` +
          `- **Status**: ${a.status.toUpperCase()} | First Detected: ${new Date(a.firstDetected).toLocaleDateString()}\n` +
          `- **Why Flagged**:\n${(a.whyFlagged || []).map(w => `  * ${w}`).join('\n')}\n` +
          `- **Source**: ${a.sources?.[0]?.sourceReport || 'Imported clinical records'} (${a.sources?.[0]?.reportDateTime || 'Recent'})\n`
        ).join('\n');
    });
  }

  getPsychWatchReport() {
    return this._getCached('report_psych_watch', () => {
      const metrics = this.getDashboardMetrics();
      const pw = metrics.psychWatchCard;
      const orders = this.store.list('snf_med_order').filter(o => o.status === 'Active' && o.isAntipsychotic);
      const alerts = this.store.list('snf_alert').filter(a => a.status !== 'resolved' && (a.code.startsWith('AP-') || a.code === 'PRN-014' || a.code === 'GDR-001'));

      let out = `# PSYCH WATCH — ANTIPSYCHOTIC SURVEILLANCE\n\n`;
      out += `**Overview Summary**: Antipsychotic Residents: **${pw.antipsychoticResidents??"Unknown"}** | New Orders (24h): **${pw.newAPs24h}** | Doc Reviews Needed: **${pw.documentationReview}** | GDR Reviews: **${pw.gdrReview}** | PRN 14-Day Limit Deadlines: **${pw.prnDeadlines}**\n\n`;
      out += `### Active Antipsychotic Regimens (${orders.length}):\n`;
      for (const o of orders) {
        out += `- **${o.residentName}** (Rm ${o.room || 'Main'}): ${o.drugName} ${o.dose}, ${o.frequency} (${o.isPRN ? 'PRN' : 'Scheduled'}) — Prescriber: ${o.prescriber} | Started: ${o.startDate}\n`;
      }
      out += `\n### Active Psych Watch Alerts (${alerts.length}):\n`;
      for (const a of alerts) {
        out += `- **[${a.severity.toUpperCase()}] ${a.residentName}**: ${a.title} — ${a.message}\n`;
      }
      return out;
    });
  }

  getNewMedsReport() {
    return this._getCached('report_new_meds', () => {
      const changes = this.store.list('snf_med_change').filter(c => c.changeType === 'New Order');
      if (!changes.length) return 'No newly started medications found in recent order change reports.';
      let out = `# NEW MEDICATIONS — LAST 24-48 HOURS (${changes.length})\n\n`;
      for (const c of changes) {
        out += `### ${c.drugName} (${c.drugClass})\n`;
        out += `- **Resident**: ${c.residentName}\n`;
        out += `- **Dose & Route**: ${c.newDose || 'Standard'} via ${c.route || 'Oral'}, Frequency: ${c.frequency || 'Daily'}\n`;
        out += `- **Scheduled/PRN**: ${c.isPRN ? 'PRN' : 'Scheduled'}\n`;
        out += `- **Prescribing Practitioner**: ${c.prescriber || 'Attending MD'}\n`;
        out += `- **Start Date**: ${c.orderDate}\n`;
        out += `- **Indication**: ${c.indication || 'Not specified in order'}\n`;
        out += `- **High-Alert Status**: ${c.isHighAlert ? 'YES (Priority Surveillance)' : 'Standard'}\n`;
        out += `- **Source**: ${c.sourceReport || 'Imported medication changes'} (Row ${c.originalRow || 1})\n\n`;
      }
      return out;
    });
  }

  getBehaviorGapsReport() {
    return this._getCached('report_behavior_gaps', () => {
      const alerts = this.store.list('snf_alert').filter(a => ['AP-004', 'AP-005', 'AP-NONPHARM'].includes(a.code) && a.status !== 'resolved');
      if (!alerts.length) return 'No behavior monitoring gaps detected across residents currently receiving psychotropics.';
      return `# BEHAVIOR MONITORING GAPS (${alerts.length})\n\n` +
        alerts.map(a => `- **${a.residentName}** (${a.drug || 'Psychotropic'}): ${a.title}\n  * Detail: ${a.message}\n  * Why Flagged: ${a.whyFlagged?.[0] || 'Inadequate recent monitoring entries'}`).join('\n\n');
    });
  }

  getDiagnosisGapsReport() {
    return this._getCached('report_diagnosis_gaps', () => {
      const alerts = this.store.list('snf_alert').filter(a => ['AP-002', 'AP-003'].includes(a.code) && a.status !== 'resolved');
      if (!alerts.length) return 'No diagnosis or indication mismatches currently requiring review.';
      return `# MEDICATION / DIAGNOSIS & INDICATION REVIEW GAPS (${alerts.length})\n\n` +
        alerts.map(a => `- **${a.residentName}** (${a.drug || 'Medication'}): ${a.title}\n  * Review Note: ${a.message}\n  * Detail: ${a.whyFlagged?.[1] || 'Supporting diagnosis was not found in records available to Private AI'}`).join('\n\n');
    });
  }

  getGDRReport() {
    return this._getCached('report_gdr', () => {
      const gdrs = this.store.list('snf_gdr');
      const alerts = this.store.list('snf_alert').filter(a => a.code === 'GDR-001' && a.status !== 'resolved');
      let out = `# GRADUAL DOSE REDUCTION (GDR) SURVEILLANCE\n\n`;
      out += `**Open GDR Alerts**: ${alerts.length}\n`;
      for (const a of alerts) {
        out += `- **${a.residentName}** (${a.drug}): ${a.title} — ${a.message}\n`;
      }
      out += `\n**Tracked GDR History**:\n`;
      for (const g of gdrs) {
        out += `- **${g.residentName}** (${g.medication}): Last GDR: ${g.lastGDRDate || 'None'} | Result: ${g.result} | Contraindicated: ${g.isContraindicated ? 'Yes (' + g.clinicalRationale + ')' : 'No'}\n`;
      }
      return out;
    });
  }

  getPRN14Report() {
    return this._getCached('report_prn14', () => {
      const orders = this.store.list('snf_med_order').filter(o => o.status === 'Active' && o.isAntipsychotic && o.isPRN);
      const now = Date.now();
      let out = `# PRN ANTIPSYCHOTIC 14-DAY TIME-LIMIT WATCH (${orders.length})\n\n`;
      if (!orders.length) return 'No active PRN antipsychotic orders currently found.';
      for (const o of orders) {
        const days = Math.max(1, Math.floor((now - Date.parse(o.startDate)) / (24 * 60 * 60 * 1000)));
        const tag = days >= 14 ? '🔴 DAY 14+ (LIMIT EXCEEDED)' : days >= 13 ? '🟠 DAY 13 (REVIEW REQ)' : days >= 10 ? '🟡 DAY 10+ (APPROACHING)' : '🟢 ACTIVE';
        out += `### ${o.residentName}: ${o.drugName} ${o.dose} PRN — ${tag}\n`;
        out += `- **Order Start Date**: ${o.startDate} (Elapsed Days: ${days})\n`;
        out += `- **Prescribing Practitioner**: ${o.prescriber}\n`;
        out += `- **CMS 14-Day Mandate**: Order cannot be renewed past Day 14 without in-person evaluation by prescribing practitioner.\n\n`;
      }
      return out;
    });
  }

  getMedicationChangesList() {
    return this._getCached('medChanges', () => {
      const changes = this.store.list('snf_med_change');
      const alerts = this.store.list('snf_alert');
      return changes.map(c => {
        const relAlert = alerts.find(a => a.residentId === c.residentId && a.drug && a.drug.toLowerCase() === (c.drugName || '').toLowerCase() && a.status !== 'resolved');
        return {
          ...c,
          alertId: relAlert ? relAlert.id : null,
          alertSeverity: relAlert ? relAlert.severity : null,
          alertTitle: relAlert ? relAlert.title : null
        };
      }).sort((a, b) => (b.importTimestamp || 0) - (a.importTimestamp || 0));
    });
  }

  getMedChanges() {
    return this.getMedicationChangesList();
  }

  getPersistentAlerts() {
    return this.store.list('snf_alert') || [];
  }

  getPsychWatchData() {
    return this._getCached('psychWatch', () => {
      const metrics = this.getDashboardMetrics();
      const pw = metrics.psychWatchCard;
      const orders = this.store.list('snf_med_order').filter(o => o.status === 'Active' && o.isAntipsychotic);
      const alerts = this.store.list('snf_alert').filter(a => a.status !== 'resolved' && (a.code.startsWith('AP-') || a.code === 'PRN-014' || a.code === 'GDR-001'));
      const gdrs = this.store.list('snf_gdr');
      const now = Date.now();

      const prnWatch = orders.filter(o => o.isPRN).map(o => {
        const days = Math.max(1, Math.floor((now - (Date.parse(o.startDate) || now)) / (24 * 60 * 60 * 1000)));
        return {
          ...o,
          daysActive: days,
          daysRemaining: Math.max(0, 14 - days),
          isExceeded: days >= 14,
          isWarning: days >= 10 && days < 14,
          statusLabel: days >= 14 ? 'Limit Exceeded (Day 14+)' : days >= 13 ? 'Review Required (Day 13)' : days >= 10 ? 'Approaching Limit (Day 10+)' : `Active (Day ${days} of 14)`
        };
      });

      return {
        metrics: pw,
        activeOrders: orders,
        prnWatch,
        gdrs,
        alerts
      };
    });
  }

  getUnresolvedIssuesReport() {
    return this._getCached('report_unresolved_issues', () => {
      const issues = this.store.list('snf_open_issue').filter(i => this.issueVisible(i) && i.status !== 'Resolved');
      if (!issues.length) return 'No open clinical issues are currently pending in the Open Issues Engine.';
      let out = `# OPEN CLINICAL ISSUES (${issues.length})\n\n`;
      for (const iss of issues) {
        out += `### [${iss.severity.toUpperCase()}] ${iss.residentName} — ${iss.issue}\n`;
        out += `- **Status**: ${iss.status} | **Assigned To**: ${iss.owner}\n`;
        out += `- **First Flagged**: ${new Date(iss.firstDetected).toLocaleDateString()} | **Last Verified**: ${new Date(iss.lastDetected).toLocaleDateString()}\n`;
        out += `- **Source**: ${iss.source}\n`;
        out += `- **Details**: ${iss.detail}\n`;
        if (iss.actionNote) out += `- **Latest Action Note**: ${iss.actionNote}\n`;
        out += `\n`;
      }
      return out;
    });
  }

  getResidentTimelineReport(residentQuery) {
    if (!residentQuery) return 'Please specify a resident name or ID (e.g. /resident Smith).';
    const q = residentQuery.trim().toLowerCase();
    const residents = this.store.list('snf_resident');
    const exact = residents.find(r => r.id.toLowerCase() === q);
    const matches = exact ? [exact] : residents.filter(r => String(r.name || '').toLowerCase().includes(q));
    if (matches.length > 1) return 'Multiple residents match. Repeat /resident with the exact resident ID:\n' + matches.map(r => `${r.name} — ID: ${r.id} — Room: ${r.room || 'Unknown'}`).join('\n');
    const target = matches[0];
    if (!target) return `Resident "${residentQuery}" was not found in current PointClickCare census records.`;

    return this._getCached(`report_timeline_${target.id}`, () => {
      const rid = target.id;
      const orders = this.store.list('snf_med_order').filter(o => o.residentId === rid && o.status === 'Active');
      const diags = this.store.list('snf_diagnosis').filter(d => d.residentId === rid);
      const behs = this.store.list('snf_behavior').filter(b => b.residentId === rid);
      const falls = this.store.list('snf_fall').filter(f => f.residentId === rid);
      const alerts = this.store.list('snf_alert').filter(a => a.residentId === rid && a.status !== 'resolved');

      let out = `# CLINICAL SURVEILLANCE TIMELINE: ${target.name}\n`;
      out += `**Room**: ${target.room} | **Unit**: ${target.unit} | **Admitted**: ${target.admissionDate} | **MD**: ${target.prescriber}\n\n`;

      out += `### Active Medications (${orders.length}):\n`;
      for (const o of orders) {
        out += `- **${o.drugName}** (${o.dose}, ${o.frequency}) — ${o.isAntipsychotic ? '⚠️ ANTIPSYCHOTIC' : o.drugClass} [Started: ${o.startDate}]\n`;
      }

      out += `\n### Documented Diagnoses (${diags.length}):\n`;
      for (const d of diags) {
        out += `- **${d.description}** (${d.icd10 || 'No code'}) — Onset: ${d.onsetDate || 'Historical'}\n`;
      }

      out += `\n### Behavior & Incident History:\n`;
      if (!behs.length && !falls.length) {
        out += `- No behavior events or falls logged in imported records.\n`;
      } else {
        for (const b of behs) {
          out += `- **Behavior (${b.eventDate})**: ${b.targetSymptom} (Severity: ${b.severity}) — Intervention: ${b.interventionsAttempted}\n`;
        }
        for (const f of falls) {
          out += `- **Fall (${f.eventDate})**: Location: ${f.location}, Injury: ${f.injuryLevel}\n`;
        }
      }

      out += `\n### Active Surveillance Alerts (${alerts.length}):\n`;
      for (const a of alerts) {
        out += `- **[${a.severity.toUpperCase()}] ${a.title}**: ${a.message} (Status: ${a.status.toUpperCase()})\n`;
      }

      return out;
    });
  }

  // --- SEED SAMPLE PCC DATASET FOR OUT-OF-THE-BOX VALIDATION ---

  async seedSampleClinicalFeed() {
    return this.seedRealisticPCCDataset();
  }

  async seedRealisticPCCDataset() {
    if (this.demoMode !== true) throw fail("POLICY");
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const sevenMonthsAgo = new Date(Date.now() - 210 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const sampleFeed = [
      {
        type: 'census',
        filename: 'PCC_Daily_Census_ADT_20260920.csv',
        rows: [
          { residentId: 'R-101', name: 'Eleanor Vance', room: '104-A', unit: 'West Wing', prescriber: 'Dr. Marcus Chen', stayType: 'long_stay' },
          { residentId: 'R-102', name: 'Arthur Pendelton', room: '108-B', unit: 'West Wing', prescriber: 'Dr. Sarah Jenkins', stayType: 'long_stay' },
          { residentId: 'R-103', name: 'Beatrice Morales', room: '202-A', unit: 'East Pavilion', prescriber: 'Dr. Marcus Chen', stayType: 'long_stay' },
          { residentId: 'R-104', name: 'George Abernathy', room: '215-B', unit: 'East Pavilion', prescriber: 'Dr. Robert Torres', stayType: 'long_stay' },
          { residentId: 'R-105', name: 'Dorothy Zimmerman', room: '112-A', unit: 'West Wing', prescriber: 'Dr. Sarah Jenkins', stayType: 'long_stay' },
          { residentId: 'R-106', name: 'Walter Sterling', room: '305-A', unit: 'Rehab Unit', prescriber: 'Dr. Robert Torres', stayType: 'short_stay' },
        ]
      },
      {
        type: 'admissions',
        filename: 'PCC_Admissions_Report_20260920.csv',
        rows: [
          { residentId: 'R-106', name: 'Walter Sterling', admissionDate: yesterday, admittedFrom: 'St. Jude Medical Center', primaryDiagnosis: 'Rehab following right hip arthroplasty' }
        ]
      },
      {
        type: 'transfers',
        filename: 'PCC_Hospital_Transfers_20260920.csv',
        rows: [
          { residentId: 'R-107', name: 'Harold Finch', type: 'Transfer Out', hospital: 'Memorial General Hospital', reason: 'Suspected aspiration pneumonia with acute hypoxemia', eventDate: yesterday }
        ]
      },
      {
        type: 'clinical24',
        filename: 'PCC_24h_Clinical_Report_20260920.csv',
        rows: [
          { residentId: 'R-101', name: 'Eleanor Vance', summary: 'Restless during evening shift, pacing corridors and expressing acute distress regarding room switch.', providerNotified: true, familyNotified: true, eventDate: yesterday },
          { residentId: 'R-104', name: 'George Abernathy', summary: 'Coughing during dinner, vitals stable, placed on aspiration precaution protocols.', providerNotified: false, familyNotified: false, eventDate: yesterday }
        ]
      },
      {
        type: 'med_profile',
        filename: 'PCC_Active_Medications_20260920.csv',
        rows: [
          // Case 1: Eleanor Vance - New AP without supporting diagnosis (AP-001 & AP-002)
          { residentId: 'R-101', name: 'Eleanor Vance', medication: 'Quetiapine 25 mg oral tablet', genericName: 'quetiapine', dose: '25 mg', route: 'Oral', frequency: 'QHS (At bedtime)', prn: false, startDate: today, prescriber: 'Dr. Marcus Chen', indication: '' },
          // Case 2: Arthur Pendelton - PRN Haloperidol exceeding 14 days (PRN-014)
          { residentId: 'R-102', name: 'Arthur Pendelton', medication: 'Haloperidol 0.5 mg oral tablet', genericName: 'haloperidol', dose: '0.5 mg', route: 'Oral', frequency: 'Q6H PRN for severe agitation', prn: true, startDate: fifteenDaysAgo, prescriber: 'Dr. Sarah Jenkins', indication: 'Agitation' },
          // Case 3: Beatrice Morales - Antipsychotic with long duration, no GDR (GDR-001)
          { residentId: 'R-103', name: 'Beatrice Morales', medication: 'Risperidone 1 mg oral tablet', genericName: 'risperidone', dose: '1 mg', route: 'Oral', frequency: 'Daily in morning', prn: false, startDate: sevenMonthsAgo, prescriber: 'Dr. Marcus Chen', indication: 'Major Depressive Disorder with psychotic features' },
          // Case 4: Dorothy Zimmerman - Antipsychotic with behavior monitoring gap (AP-005)
          { residentId: 'R-105', name: 'Dorothy Zimmerman', medication: 'Olanzapine 5 mg oral tablet', genericName: 'olanzapine', dose: '5 mg', route: 'Oral', frequency: 'QHS', prn: false, startDate: tenDaysAgo, prescriber: 'Dr. Sarah Jenkins', indication: 'Behavioral symptoms of dementia' },
          // Standard meds
          { residentId: 'R-104', name: 'George Abernathy', medication: 'Apixaban 5 mg oral tablet', genericName: 'apixaban', dose: '5 mg', route: 'Oral', frequency: 'BID', prn: false, startDate: '2026-05-10', prescriber: 'Dr. Robert Torres', indication: 'Atrial fibrillation' },
          { residentId: 'R-106', name: 'Walter Sterling', medication: 'Enoxaparin 40 mg subcutaneous injection', genericName: 'enoxaparin', dose: '40 mg', route: 'SubQ', frequency: 'Daily', prn: false, startDate: yesterday, prescriber: 'Dr. Robert Torres', indication: 'DVT prophylaxis post-op' }
        ]
      },
      {
        type: 'med_changes',
        filename: 'PCC_Medication_Order_Changes_20260920.csv',
        rows: [
          { residentId: 'R-101', name: 'Eleanor Vance', medication: 'Quetiapine 25 mg oral tablet', changeType: 'New Order', newDose: '25 mg', frequency: 'QHS', prescriber: 'Dr. Marcus Chen', orderDate: today },
          { residentId: 'R-106', name: 'Walter Sterling', medication: 'Enoxaparin 40 mg subcutaneous injection', changeType: 'New Order', newDose: '40 mg', frequency: 'Daily', prescriber: 'Dr. Robert Torres', orderDate: yesterday }
        ]
      },
      {
        type: 'emar_exceptions',
        filename: 'PCC_eMAR_Exceptions_20260920.csv',
        rows: [
          { residentId: 'R-102', name: 'Arthur Pendelton', medication: 'Atorvastatin 20 mg', exceptionType: 'Refused', reason: 'Resident stated he did not want cholesterol pill today', eventDate: yesterday }
        ]
      },
      {
        type: 'diagnoses',
        filename: 'PCC_Active_Diagnoses_20260920.csv',
        rows: [
          { residentId: 'R-101', name: 'Eleanor Vance', icd10: 'G30.9', description: "Alzheimer's disease, unspecified", onsetDate: '2024-03-12' },
          { residentId: 'R-102', name: 'Arthur Pendelton', icd10: 'F03.90', description: 'Unspecified dementia, without behavioral disturbance', onsetDate: '2023-11-04' },
          { residentId: 'R-103', name: 'Beatrice Morales', icd10: 'F33.3', description: 'Major depressive disorder, recurrent, severe with psychotic symptoms', onsetDate: '2025-01-15' },
          { residentId: 'R-104', name: 'George Abernathy', icd10: 'I48.91', description: 'Unspecified atrial fibrillation', onsetDate: '2022-08-20' },
          // Case: Dorothy Zimmerman has new psychiatric diagnosis added while on AP (AP-003)
          { residentId: 'R-105', name: 'Dorothy Zimmerman', icd10: 'F20.9', description: 'Schizophrenia, unspecified', onsetDate: yesterday }
        ]
      },
      {
        type: 'behaviors',
        filename: 'PCC_Behavior_Monitoring_20260920.csv',
        rows: [
          // Dorothy Zimmerman had behavior 14 days ago, nothing since (AP-005 gap)
          { residentId: 'R-105', name: 'Dorothy Zimmerman', targetSymptom: 'Physical aggression during shower care', severity: 'Moderate', triggers: 'Morning shower transfer', interventionsAttempted: 'Redirection, warm towel provided, offered choice of sponge bath', eventDate: fourteenDaysAgo(today) }
        ]
      },
      {
        type: 'falls',
        filename: 'PCC_Falls_and_Incidents_20260920.csv',
        rows: [
          { residentId: 'R-104', name: 'George Abernathy', location: 'Dining Room', injuryLevel: 'None', witnessed: true, eventDate: yesterday }
        ]
      },
      {
        type: 'infections',
        filename: 'PCC_Infection_Surveillance_20260920.csv',
        rows: [
          { residentId: 'R-103', name: 'Beatrice Morales', infectionType: 'UTI', antibiotic: 'Ciprofloxacin 250 mg BID', startDate: yesterday }
        ]
      },
      {
        type: 'wounds',
        filename: 'PCC_Wound_Report_20260920.csv',
        rows: [
          { residentId: 'R-102', name: 'Arthur Pendelton', woundType: 'Pressure Injury', stage: 'Stage 2', site: 'Sacrum', acquired: 'In-House' }
        ]
      },
      {
        type: 'labs',
        filename: 'PCC_Outstanding_Labs_20260920.csv',
        rows: [
          { residentId: 'R-103', name: 'Beatrice Morales', testName: 'Urine Culture & Sensitivity', result: '>100,000 CFU/mL E. coli', abnormal: true, criticalValue: false, followUpStatus: 'Reviewed' }
        ]
      },
      {
        type: 'progress_notes',
        filename: 'PCC_Progress_Notes_20260920.csv',
        rows: [
          { residentId: 'R-101', name: 'Eleanor Vance', noteType: 'Nursing Note', author: 'S. Davis, RN', text: 'Resident agitated regarding room change. Non-pharm redirection attempted without success. Provider notified and ordered Seroquel.', noteDate: today }
        ]
      }
    ];

    function fourteenDaysAgo(dateString) {
      const d = new Date(dateString);
      d.setDate(d.getDate() - 14);
      return d.toISOString().slice(0, 10);
    }

    this._seedingDemo = true;
    try { return await this.ingestReports(sampleFeed.map(r=>({...r,date:new Date().toISOString()})), 'Demo generator'); }
    finally { this._seedingDemo = false; }
  }

  getPCCReportCatalog() {
    return PCC_REPORT_CATALOG;
  }

  assertEmrReadOnly(kind) {
    const rawKinds = [
      'snf_med_order', 'snf_med_change', 'snf_emar_exception', 'snf_diagnosis',
      'snf_behavior', 'snf_fall', 'snf_infection', 'snf_wound', 'snf_lab',
      'snf_clinical24', 'snf_progress_note', 'snf_gdr', 'snf_admission', 'snf_transfer',
      'snf_psych_review', 'snf_pharmacist_review', 'snf_weight', 'snf_care_plan'
    ];
    if (rawKinds.includes(kind)) {
      throw new Error(`EMR data (${kind}) is strictly read-only and immutable. In accordance with clinical governance, raw EMR surveillance records cannot be edited or altered.`);
    }
  }

  cleanup(retentionDays = 100, now = Date.now()) {
    if (!Number.isFinite(retentionDays) || retentionDays < 1 || retentionDays > 3650) throw new Error('Invalid retention period');
    const rawCutoff = now - retentionDays * 86400000;
    const {retainedEvidence, pruneEvidence} = require('./snf/retention.cjs');
    const keep = retainedEvidence(this.store, rawCutoff);
    const counts = {
      rawEmrRecords: 0,
      dischargedResidents: 0,
      resolvedAlerts: 0,
      resolvedIssues: 0,
      total: 0
    };

    // 1. Raw EMR data feeds (held for 100 days for quarterly audits)
    const rawKinds = [
      'snf_med_order', 'snf_med_change', 'snf_emar_exception', 'snf_diagnosis',
      'snf_behavior', 'snf_fall', 'snf_infection', 'snf_wound', 'snf_lab',
      'snf_clinical24', 'snf_progress_note', 'snf_gdr', 'snf_admission', 'snf_transfer',
      'snf_psych_review', 'snf_pharmacist_review', 'snf_weight', 'snf_care_plan'
    ];

    this._tx(() => {
      for (const kind of rawKinds) {
        const records = this.store.list(kind);
        for (const rec of records) {
          const time = rec.importTimestamp ||
                       (rec.reportDate ? Date.parse(rec.reportDate) : null) ||
                       (rec.eventDate ? Date.parse(rec.eventDate) : null) ||
                       rec.timestamp ||
                       rec.updated;
          if (time && time < rawCutoff && !keep.rows.has(rec.provenance?.rowId)) {
            this.store.delete(kind, rec.id);
            counts.rawEmrRecords++;
          }
        }
      }

      // 2. Discharged residents (100 days standard cycle following discharge)
      const residents = this.store.list('snf_resident');
      for (const res of residents) {
        const isDischarged = res.status === 'Discharged' || res.dischargeDate;
        if (isDischarged) {
          const dischargeTime = res.dischargeDate ? Date.parse(res.dischargeDate) : (res.updated || res.importTimestamp);
          if (dischargeTime && dischargeTime < rawCutoff && !keep.residents.has(res.id)) {
            this.store.delete('snf_resident', res.id);
            counts.dischargedResidents++;
          }
        }
      }

      // 3. Resolved clinical alerts & flags (100 days retention from resolution)
      const alerts = this.store.list('snf_alert');
      for (const alert of alerts) {
        if (alert.status === 'resolved' || alert.status === 'dismissed') {
          const resolvedTime = alert.resolvedAt || alert.updated || alert.timestamp;
          if (resolvedTime && resolvedTime < rawCutoff) {
            this.store.delete('snf_alert', alert.id);
            counts.resolvedAlerts++;
          }
        }
      }

      // 4. Resolved open issues (100 days retention from resolution)
      const issues = this.store.list('snf_open_issue');
      for (const issue of issues) {
        if (issue.status === 'Resolved' || issue.status === 'Closed') {
          const resolvedTime = issue.resolvedAt || issue.updated;
          if (resolvedTime && resolvedTime < rawCutoff) {
            this.store.delete('snf_open_issue', issue.id);
            counts.resolvedIssues++;
          }
        }
      }

      // 5. Analytical reports and results (held for additional 100 days = 200 days total)
      const reportCutoff = now - (retentionDays + 100) * 86400000;
      const cachedReports = this.store.list('snf_report_cache');
      counts.reportsPurged = 0;
      for (const rep of cachedReports) {
        const repTime = rep.generatedAt || rep.timestamp || rep.updated;
        if (repTime && repTime < reportCutoff) {
          this.store.delete('snf_report_cache', rep.id);
          counts.reportsPurged++;
        }
      }
    });

    counts.evidenceRecordsPurged = pruneEvidence(this.store, rawCutoff, keep);
    counts.total = counts.evidenceRecordsPurged + counts.rawEmrRecords + counts.dischargedResidents + counts.resolvedAlerts + counts.resolvedIssues + counts.reportsPurged;

    if (counts.total > 0) {
      this._invalidateCache();
      this.store.audit('snf_retention_cleanup', counts);
    }

    return counts;
  }

  cleanupOldData(retentionDays = 100, now = Date.now()) {
    const counts = this.cleanup(retentionDays, now);
    return {
      success: true,
      rawRecordsPurged: counts.rawEmrRecords,
      dischargedResidentsPurged: counts.dischargedResidents,
      resolvedAlertsPurged: counts.resolvedAlerts,
      resolvedIssuesPurged: counts.resolvedIssues,
      reportsPurged: counts.reportsPurged || 0,
      totalPurged: counts.total
    };
  }

  getRetentionStatus() {
    const settings = this.getSettings();
    const retentionDays = settings.retentionDays || 100;

    const alerts = this.store.list('snf_alert');
    const resolvedAlerts = alerts.filter(a => a.status === 'resolved' || a.status === 'dismissed').length;
    const activeAlerts = alerts.filter(a => a.status !== 'resolved' && a.status !== 'dismissed').length;

    const residents = this.store.list('snf_resident');
    const activeCensus = residents.filter(r => r.status !== 'Discharged' && !r.dischargeDate).length;
    const dischargedCensus = residents.filter(r => r.status === 'Discharged' || r.dischargeDate).length;

    const rawKinds = [
      'snf_med_order', 'snf_med_change', 'snf_emar_exception', 'snf_diagnosis',
      'snf_behavior', 'snf_fall', 'snf_infection', 'snf_wound', 'snf_lab',
      'snf_clinical24', 'snf_progress_note', 'snf_gdr', 'snf_admission', 'snf_transfer',
      'snf_psych_review', 'snf_pharmacist_review', 'snf_weight', 'snf_care_plan'
    ];
    let totalRawRecords = 0;
    for (const kind of rawKinds) {
      totalRawRecords += this.store.count(kind);
    }

    return {
      emrPlatform: settings.emrPlatform || 'Generic imported clinical records',
      emrReadOnly: true,
      rawRetentionDays: retentionDays,
      reportRetentionDays: retentionDays + 100, // 200 days total
      resolvedAlertsRetentionDays: retentionDays,
      dischargedResidentsRetentionDays: retentionDays,
      activeCensus,
      dischargedCensus,
      activeAlerts,
      resolvedAlerts,
      totalRawRecords,
      isSupplementalOnly: true,
      regulatoryNotice: "Supplemental surveillance. Default raw retention is 100 days and derived reports 200 days; the organization must approve applicable retention and legal holds. No regulatory exemption is asserted."
    };
  }

  getAuditRetentionSummary() {
    return this.getRetentionStatus();
  }

  generateQuarterlyReport() {
    const metrics = this.getDashboardMetrics();
    const qm = metrics.qmWatch;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    let report = `# SNF CLINICAL SURVEILLANCE — QUARTERLY REPORT SUMMARY\n`;
    report += `**Quarter**: Q${currentQuarter} ${currentYear} | **Generated**: ${dateStr} | **Surveillance Engine**: ${!metrics.feedStatus.monitoringEnabled ? 'Imported evidence only; coverage unknown' : metrics.feedStatus.isSurveillanceComplete ? 'Feeds current; review required' : 'Incomplete data; review required'}\n\n`;

    report += `## 1. Facility Clinical Summary & Census Distribution\n`;
    report += `- **Total Active Census**: ${metrics.totalCensus} residents\n`;
    report += `- **Medicare Part A (Med A)**: ${metrics.medACensus || 0} residents\n`;
    report += `- **Medicaid / Managed Care (Med B)**: ${metrics.medBCensus || 0} residents\n`;
    report += `- **Long-Stay Census (≥101 days)**: ${qm.longStayDenominator} residents\n`;
    report += `- **Data Ingestion Status**: ${metrics.feedStatus.monitoringEnabled?metrics.feedStatus.receivedFeedsCount+" PCC feeds current":"General imported records; source coverage unverified"} (${metrics.feedStatus.dataCurrentThroughFormatted})\n\n`;

    report += `## 2. Exploratory QM Estimate & Antipsychotic Surveillance — Human Review Required\n`;
    report += `- **Estimated QM Antipsychotic Rate**: **${qm.estimatedRatePercentage}%**\n`;
    report += `- **Potential Numerator Count**: ${qm.potentialNumeratorCount} long-stay residents receiving antipsychotics\n`;
    report += `- **Imported diagnosis exclusion candidates — verify independently**: ${qm.knownExclusionsCount} (Schizophrenia, Tourette's, Huntington's)\n`;
    report += `- **Exclusions Requiring Chart Verification**: ${qm.possibleExclusionsToVerifyCount} residents\n`;
    report += `- **Facility-Wide Antipsychotic Prevalence**: ${metrics.antipsychoticResidentsCount} residents (${metrics.antipsychoticRate}%)\n\n`;

    report += `## 3. Psychotropic Medication Stewardship & Compliance Audit\n`;
    const pw = metrics.psychWatchCard;
    report += `- **Active Antipsychotic Residents**: ${pw.antipsychoticResidents??"Unknown"}\n`;
    report += `- **New Starts within Past 24 Hours**: ${pw.newAPs24h}\n`;
    report += `- **Documentation / Indication Reviews Required**: ${pw.documentationReview}\n`;
    report += `- **Gradual Dose Reduction (GDR) Reviews Due**: ${pw.gdrReview}\n`;
    report += `- **PRN 14-Day Limit Deadlines Approaching/Exceeded**: ${pw.prnDeadlines}\n\n`;

    report += `## 4. Adverse Medication Changes & High-Alert Monitoring\n`;
    const allMedChanges = this.getMedChanges();
    const highAlertChanges = allMedChanges.filter(m => m.isHighAlert);
    report += `- **Total Tracked Medication Changes**: ${allMedChanges.length}\n`;
    report += `- **High-Alert Med Changes**: ${highAlertChanges.length} (Insulin, Anticoagulants, Opioids, Sedatives)\n`;
    if (highAlertChanges.length > 0) {
      report += `\n### Notable High-Alert Orders:\n`;
      for (const h of highAlertChanges.slice(0, 8)) {
        report += `- **${h.residentName}** (Rm ${h.room || 'N/A'}): ${h.medication} ${h.dosage || ''} - *${h.changeType}* (${h.orderDate || 'Recent'})\n`;
      }
    }
    report += `\n`;

    report += `## 5. Persistent Clinical Alerts & Safety Lifecycle\n`;
    const alerts = this.getPersistentAlerts();
    const unresolved = alerts.filter(a => a.status !== 'resolved');
    const crit = unresolved.filter(a => a.severity === 'critical');
    const high = unresolved.filter(a => a.severity === 'high');
    const rev = unresolved.filter(a => a.severity === 'medium');
    report += `- **Total Active Alerts**: ${unresolved.length} (${crit.length} Critical, ${high.length} High, ${rev.length} Review)\n`;
    if (crit.length > 0) {
      report += `\n### Critical Exceptions Requiring Review:\n`;
      for (const c of crit) {
        report += `- 🔴 **[${c.residentName || 'FACILITY'}] ${c.title}**: ${c.message}\n`;
      }
    }
    report += `\n`;

    report += `## 6. Retention Policy & Data Governance Verification\n`;
    report += `*Operational Notice: Supplemental surveillance and clinical analytics only. Imported source records follow configured retention and unresolved-evidence holds. Confirm organizational retention requirements before relying on archived reports.*\n`;

    return report;
  }

  async exportReportPDF(type, query, workspacePath) {
    let title = "Clinical Surveillance Report";
    let markdown = "";
    if (type === "quarterly" || type === "qm" || type === "quarter") {
      const now = new Date();
      const q = Math.floor(now.getMonth() / 3) + 1;
      title = `Quarterly Clinical Surveillance Summary - Q${q} ${now.getFullYear()}`;
      markdown = this.generateQuarterlyReport();
    } else if (type === "morning") {
      title = `Morning Clinical Surveillance Brief - ${new Date().toLocaleDateString()}`;
      markdown = this.generateMorningBrief();
    } else if (type === "timeline") {
      title = `Resident Longitudinal Surveillance Timeline - ${query || 'Resident'}`;
      markdown = this.getResidentTimelineReport(query);
    } else if (type === "psych") {
      title = `Psychotropic Medication Surveillance Audit - ${new Date().toLocaleDateString()}`;
      markdown = this.getPsychWatchReport();
    } else if (type === "critical") {
      title = `Critical Clinical Alerts Report - ${new Date().toLocaleDateString()}`;
      markdown = this.getCriticalAlertsReport();
    } else if (type === "newmeds" || type === "meds") {
      title = `New Medications Surveillance Report - ${new Date().toLocaleDateString()}`;
      markdown = this.getNewMedsReport();
    } else if (type === "behaviorgaps" || type === "behaviors") {
      title = `Behavior Monitoring Gaps Report - ${new Date().toLocaleDateString()}`;
      markdown = this.getBehaviorGapsReport();
    } else if (type === "diagnosisgaps" || type === "diagnoses") {
      title = `Diagnosis Documentation Gaps Report - ${new Date().toLocaleDateString()}`;
      markdown = this.getDiagnosisGapsReport();
    } else if (type === "gdr") {
      title = `Gradual Dose Reduction (GDR) Audit Report - ${new Date().toLocaleDateString()}`;
      markdown = this.getGDRReport();
    } else if (type === "prn14" || type === "prn") {
      title = `PRN 14-Day Limit Compliance Report - ${new Date().toLocaleDateString()}`;
      markdown = this.getPRN14Report();
    } else if (type === "issues") {
      title = `Open Clinical Issues Report - ${new Date().toLocaleDateString()}`;
      markdown = this.getUnresolvedIssuesReport();
    } else {
      title = `Clinical Surveillance Summary - ${new Date().toLocaleDateString()}`;
      markdown = this.generateMorningBrief();
    }

    const { exportFile } = require('./files.cjs');
    const out = await exportFile(workspacePath, {
      content: (this.demoMode ? 'DEMO DATA — NOT FOR CLINICAL USE\n\n' : '') + (markdown || "# Clinical Surveillance Report\n\nNo active surveillance records found."),
      format: "pdf",
      title: (this.demoMode ? "DEMO DATA — " : "") + title,
      subfolder: this.demoMode ? "Demo-Reports" : "Reports"
    });
    return out;
  }
}

module.exports = {
  SNFCommandCenter,
  REQUIRED_DAILY_FEEDS,
  PERIODIC_FEEDS,
  PCC_REPORT_CATALOG,
  MEDICATION_CLASSES,
  TARGET_BEHAVIORS,
  NON_PHARM_INTERVENTIONS,
  identifyMedication
};



// Preserve unknown separately from false, including CSV boolean strings.
function importedBoolean(value) {
 if (value === true || value === 1 || /^(true|yes|1)$/i.test(String(value))) return true;
 if (value === false || value === 0 || /^(false|no|0)$/i.test(String(value))) return false;
 return null;
}
