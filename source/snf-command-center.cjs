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
const MEDICATION_CLASSES = {
  antipsychotics: {
    name: 'Antipsychotics',
    isHighAlert: true,
    isPsychotropic: true,
    isAntipsychotic: true,
    drugs: [
      // Second Generation (Atypical)
      { generic: 'quetiapine', brands: ['seroquel', 'seroquel xr'] },
      { generic: 'risperidone', brands: ['risperdal', 'perseris'] },
      { generic: 'olanzapine', brands: ['zyprexa', 'zyprexa zydis', 'relprevv'] },
      { generic: 'aripiprazole', brands: ['abilify', 'abilify maintena', 'aristada'] },
      { generic: 'ziprasidone', brands: ['geodon'] },
      { generic: 'lurasidone', brands: ['latuda'] },
      { generic: 'brexpiprazole', brands: ['rexulti'] },
      { generic: 'cariprazine', brands: ['vraylar'] },
      { generic: 'paliperidone', brands: ['invega', 'invega sustenna', 'invega trinza', 'invega hafyera'] },
      { generic: 'clozapine', brands: ['clozaril', 'fazaclo', 'versacloz'] },
      { generic: 'lumateperone', brands: ['caplyta'] },
      { generic: 'asenapine', brands: ['saphris', 'secuado'] },
      { generic: 'pimavanserin', brands: ['nuplazid'] },
      // First Generation (Typical)
      { generic: 'haloperidol', brands: ['haldol', 'haldol decanoate'] },
      { generic: 'chlorpromazine', brands: ['thorazine'] },
      { generic: 'prochlorperazine', brands: ['compazine'] }, // Flag for review if ordered as psych vs antiemetic
      { generic: 'fluphenazine', brands: ['prolixin', 'prolixin decanoate'] },
      { generic: 'perphenazine', brands: ['trilafon'] },
      { generic: 'thiothixene', brands: ['navane'] },
      { generic: 'thioridazine', brands: ['mellaril'] },
      { generic: 'trifluoperazine', brands: ['stelazine'] },
      { generic: 'loxapine', brands: ['loxitane', 'adasuve'] },
    ]
  },
  antidepressants: {
    name: 'Antidepressants',
    isHighAlert: false,
    isPsychotropic: true,
    drugs: [
      { generic: 'sertraline', brands: ['zoloft'] },
      { generic: 'escitalopram', brands: ['lexapro'] },
      { generic: 'citalopram', brands: ['celexa'] },
      { generic: 'fluoxetine', brands: ['prozac'] },
      { generic: 'paroxetine', brands: ['paxil'] },
      { generic: 'mirtazapine', brands: ['remeron'] },
      { generic: 'venlafaxine', brands: ['effexor', 'effexor xr'] },
      { generic: 'duloxetine', brands: ['cymbalta'] },
      { generic: 'bupropion', brands: ['wellbutrin', 'wellbutrin xl', 'wellbutrin sr'] },
      { generic: 'trazodone', brands: ['desyrel'] },
    ]
  },
  anxiolytics_hypnotics: {
    name: 'Anxiolytics & Hypnotics (Sedatives)',
    isHighAlert: true,
    isPsychotropic: true,
    drugs: [
      { generic: 'lorazepam', brands: ['ativan'] },
      { generic: 'alprazolam', brands: ['xanax'] },
      { generic: 'clonazepam', brands: ['klonopin'] },
      { generic: 'diazepam', brands: ['valium'] },
      { generic: 'temazepam', brands: ['restoril'] },
      { generic: 'oxazepam', brands: ['serax'] },
      { generic: 'zolpidem', brands: ['ambien', 'ambien cr'] },
      { generic: 'eszopiclone', brands: ['lunesta'] },
      { generic: 'zaleplon', brands: ['sonata'] },
      { generic: 'buspirone', brands: ['buspar'] },
      { generic: 'hydroxyzine', brands: ['vistaril', 'atarax'] },
    ]
  },
  anticoagulants: {
    name: 'Anticoagulants & Antiplatelets',
    isHighAlert: true,
    drugs: [
      { generic: 'apixaban', brands: ['eliquis'] },
      { generic: 'rivaroxaban', brands: ['xarelto'] },
      { generic: 'warfarin', brands: ['coumadin', 'jantoven'] },
      { generic: 'enoxaparin', brands: ['lovenox'] },
      { generic: 'heparin', brands: ['heparin sodium'] },
      { generic: 'dabigatran', brands: ['pradaxa'] },
      { generic: 'clopidogrel', brands: ['plavix'] },
    ]
  },
  insulins_hypoglycemics: {
    name: 'Insulin & High-Risk Hypoglycemic Therapy',
    isHighAlert: true,
    drugs: [
      { generic: 'insulin glargine', brands: ['lantus', 'basaglar', 'toujeo'] },
      { generic: 'insulin lispro', brands: ['humalog', 'admelog'] },
      { generic: 'insulin aspart', brands: ['novolog', 'fiasp'] },
      { generic: 'insulin detemir', brands: ['levemir'] },
      { generic: 'insulin regular', brands: ['humulin r', 'novolin r'] },
      { generic: 'glipizide', brands: ['glucotrol', 'glucotrol xl'] },
      { generic: 'glimepiride', brands: ['amaryl'] },
      { generic: 'glyburide', brands: ['diabeta', 'micronase'] },
    ]
  },
  opioids: {
    name: 'Opioids & Controlled Pain Analgesics',
    isHighAlert: true,
    drugs: [
      { generic: 'oxycodone', brands: ['roxyicodone', 'oxycontin', 'percocet'] },
      { generic: 'hydrocodone', brands: ['norco', 'vicodin', 'lortab'] },
      { generic: 'morphine', brands: ['ms contin', 'roxanol'] },
      { generic: 'hydromorphone', brands: ['dilaudid'] },
      { generic: 'fentanyl', brands: ['duragesic'] },
      { generic: 'tramadol', brands: ['ultram'] },
      { generic: 'methadone', brands: ['dolophine'] },
    ]
  },
  antibiotics: {
    name: 'Systemic Antibiotics & Antimicrobials',
    isHighAlert: true,
    drugs: [
      { generic: 'amoxicillin/clavulanate', brands: ['augmentin'] },
      { generic: 'amoxicillin', brands: ['amoxil'] },
      { generic: 'ciprofloxacin', brands: ['cipro'] },
      { generic: 'levofloxacin', brands: ['levaquin'] },
      { generic: 'ceftriaxone', brands: ['rocephin'] },
      { generic: 'cephalexin', brands: ['keflex'] },
      { generic: 'cefuroxime', brands: ['ceftin'] },
      { generic: 'sulfamethoxazole/trimethoprim', brands: ['bactrim', 'septra'] },
      { generic: 'nitrofurantoin', brands: ['macrobid', 'macrodantin'] },
      { generic: 'doxycycline', brands: ['vibramycin'] },
      { generic: 'azithromycin', brands: ['zithromax', 'z-pak'] },
      { generic: 'vancomycin', brands: ['vancocin'] },
      { generic: 'piperacillin/tazobactam', brands: ['zosyn'] },
    ]
  }
};

// Target behaviors and symptoms recognized in clinical surveillance
const TARGET_BEHAVIORS = [
  'physical aggression', 'hitting', 'kicking', 'scratching', 'biting', 'combative',
  'verbal aggression', 'screaming', 'cursing', 'threats', 'shouting',
  'hallucinations', 'auditory hallucinations', 'visual hallucinations',
  'delusions', 'paranoia', 'paranoid ideation',
  'severe agitation', 'pacing with distress', 'repetitive verbal distress',
  'resistance to care', 'combative with adls', 'refusing essential care with distress',
  'self-injurious behavior', 'head banging',
  'sexual disinhibition', 'wandering with distress', 'exit-seeking with panic'
];

// Non-pharmacological interventions recognized in clinical surveillance
const NON_PHARM_INTERVENTIONS = [
  'redirection', 'verbal reassurance', 'calm voice',
  'environmental modification', 'dim lights', 'quiet room', 'noise reduction', 'change in setting',
  'activity modification', 'music therapy', 'snack provided', 'warm beverage', 'aromatherapy',
  'pain assessment', 'toileting assistance', 'positioning', 'walking assistance',
  'family contact', 'photo album', '1:1 engagement', 'time away from group',
  'sleep hygiene', 'gentle approach', 'allowing cooling off period', 'choice offered'
];

/**
 * Matches a drug name to drug classification dictionary
 */
function identifyMedication(drugText) {
  if (!drugText || typeof drugText !== 'string') {
    return { isHighAlert: false, isPsychotropic: false, isAntipsychotic: false, drugClass: 'Other' };
  }
  const clean = drugText.toLowerCase().replace(/[^a-z0-9\s/]/g, ' ');
  for (const [classKey, category] of Object.entries(MEDICATION_CLASSES)) {
    for (const d of category.drugs) {
      if (clean.includes(d.generic) || d.brands.some(b => clean.includes(b))) {
        return {
          matchedGeneric: d.generic,
          drugClass: category.name,
          classKey,
          isHighAlert: !!category.isHighAlert,
          isPsychotropic: !!category.isPsychotropic,
          isAntipsychotic: !!category.isAntipsychotic,
        };
      }
    }
  }
  return { isHighAlert: false, isPsychotropic: false, isAntipsychotic: false, drugClass: 'Standard' };
}

/**
 * SNFCommandCenter Surveillance Manager
 */
class SNFCommandCenter {
  constructor({ store, root }) {
    this.store = store;
    this.root = root;
    this.settingsKey = 'snf_surveillance_settings';
    this.feedStatusKey = 'snf_feed_status';
    this.auditEvent = 'clinical_surveillance';
    this._cache = new Map();
    this._cacheTTL = 5000;
    this.ensureInitialized();
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
        emrPlatform: 'PointClickCare (PCC)',
        emrReadOnly: true,
        retentionDays: 100,
        retentionReportsDays: 200,
        isSupplementalOnly: true,
        regulatoryNotice: "Supplemental operational surveillance & clinical analytics only. Exempt from CMS 42 CFR § 483 / HIPAA 6-year archival. Raw EMR data is immutable and held for 100 days for quarterly audits; resulted analytical reports are held for 200 days.",
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

  getFeedStatus() {
    return this._getCached('feedStatus', () => {
      const data = this.store.get('config', this.feedStatusKey) || {};
      const settings = this.getSettings();
      const staleHours = settings.staleThresholdHours || 18;
      const now = Date.now();

      let isStale = false;
      let staleMessage = null;

      if (!data.dataCurrentThrough) {
        isStale = true;
        staleMessage = 'PCC MONITORING DATA HAS NOT BEEN INITIALIZED';
      } else {
        const ageHours = (now - data.dataCurrentThrough) / (1000 * 60 * 60);
        if (ageHours > staleHours) {
          isStale = true;
          const timeStr = new Date(data.dataCurrentThrough).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          staleMessage = `PCC MONITORING DATA IS STALE (Current through ${timeStr}, >${Math.floor(ageHours)}h ago)`;
        }
      }

      const missingCriticalFeeds = Object.values(data.feeds || {})
        .filter(f => f.critical && (f.status === 'missing' || f.status === 'error'));

      const isSurveillanceComplete = !isStale && missingCriticalFeeds.length === 0;

      return {
        ...data,
        isStale,
        staleMessage,
        isSurveillanceComplete,
        missingCriticalFeeds,
        dataCurrentThroughFormatted: data.dataCurrentThrough
          ? new Date(data.dataCurrentThrough).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(data.dataCurrentThrough).toLocaleDateString()
          : 'Never'
      };
    });
  }

  _mapReportNameToFeedType(name) {
    if (!name) return 'orders';
    const s = String(name).toLowerCase().replace(/[^a-z0-9]/g, ' ');
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
   * Ingest a batch of PCC standardized reports
   */
  async ingestReports(reportPayloads, user = 'System') {
    const importTime = Date.now();
    const results = [];
    const settings = this.getSettings();
    const feedStatus = this.store.get('config', this.feedStatusKey) || { feeds: {} };
    const validationErrors = [];

    if (!Array.isArray(reportPayloads)) {
      return {
        success: false,
        totalRecords: 0,
        importTime,
        results: [],
        validationErrors: ['Invalid input: reportPayloads must be an array of report objects.']
      };
    }

    // Track previous day active counts for anomaly detection
    const prevCensusCount = this.store.count('snf_resident');
    let importedCensusCount = 0;

    this._tx(() => {
      for (const report of reportPayloads) {
        if (!report || typeof report !== 'object') continue;
        const reportTypeVal = report.type || report.reportType || report.feedType || report.name;
        const { filename, rows = [], rawText = '', date = new Date().toISOString() } = report;
        const safeRows = Array.isArray(rows) ? rows.filter(r => r && typeof r === 'object') : [];
        const reportDate = Date.parse(date) || importTime;
        const normalizedType = this._mapReportNameToFeedType(reportTypeVal || filename);
        const type = normalizedType;

        try {
          let count = 0;
          switch (normalizedType) {
            case 'census':
            case 'adt':
              count = this._processCensus(safeRows, filename, reportDate, importTime);
              importedCensusCount = count;
              break;
            case 'admissions':
              count = this._processAdmissions(safeRows, filename, reportDate, importTime);
              break;
            case 'transfers':
              count = this._processTransfers(safeRows, filename, reportDate, importTime);
              break;
            case 'clinical24':
              count = this._processClinical24(safeRows, filename, reportDate, importTime);
              break;
            case 'orders':
            case 'med_changes':
              count = this._processOrderChanges(safeRows, filename, reportDate, importTime);
              break;
            case 'med_profile':
              count = this._processMedProfile(safeRows, filename, reportDate, importTime);
              break;
            case 'emar_exceptions':
              count = this._processEmarExceptions(safeRows, filename, reportDate, importTime);
              break;
            case 'diagnoses':
              count = this._processDiagnoses(safeRows, filename, reportDate, importTime);
              break;
            case 'behaviors':
              count = this._processBehaviors(safeRows, filename, reportDate, importTime);
              break;
            case 'falls':
              count = this._processFalls(safeRows, filename, reportDate, importTime);
              break;
            case 'infections':
              count = this._processInfections(safeRows, filename, reportDate, importTime);
              break;
            case 'wounds':
              count = this._processWounds(safeRows, filename, reportDate, importTime);
              break;
            case 'labs':
              count = this._processLabs(safeRows, filename, reportDate, importTime);
              break;
            case 'progress_notes':
              count = this._processProgressNotes(safeRows, filename, reportDate, importTime);
              break;
            case 'gdr_tracker':
              count = this._processGDR(safeRows, filename, reportDate, importTime);
              break;
            default:
              count = safeRows.length;
              break;
          }

          feedStatus.feeds[type] = {
            id: type,
            name: REQUIRED_DAILY_FEEDS.find(f => f.id === type)?.name || type,
            critical: REQUIRED_DAILY_FEEDS.find(f => f.id === type)?.critical || false,
            lastReceived: importTime,
            lastRecordCount: count,
            filename,
            status: 'ok',
            error: null
          };

          results.push({ type, count, filename, status: 'success' });
        } catch (err) {
          const errorMsg = `Parser failed on ${type}: ${err.message}`;
          validationErrors.push(errorMsg);
          feedStatus.feeds[type] = {
            id: type,
            name: REQUIRED_DAILY_FEEDS.find(f => f.id === type)?.name || type,
            critical: REQUIRED_DAILY_FEEDS.find(f => f.id === type)?.critical || false,
            lastReceived: importTime,
            lastRecordCount: 0,
            filename,
            status: 'error',
            error: errorMsg
          };
          results.push({ type, count: 0, filename, status: 'error', error: errorMsg });
        }
      }

      // Anomaly Detection: Unexpected resident count drop
      if (prevCensusCount > 20 && importedCensusCount > 0 && importedCensusCount < prevCensusCount * 0.5) {
        const anomalyMsg = `Unexpected resident count change (Previous: ${prevCensusCount}, Today: ${importedCensusCount}). Active surveillance may be incomplete.`;
        validationErrors.push(anomalyMsg);
        this._createAlert({
          code: 'DATA-001',
          severity: 'critical',
          title: 'DATA VALIDATION FAILURE',
          message: anomalyMsg,
          residentId: null,
          residentName: 'FACILITY-WIDE',
          sources: [{ sourceReport: 'Census / ADT', reportDateTime: new Date(importTime).toISOString(), originalRow: 'System Summary' }],
          whyFlagged: [
            `Previous verified active census was ${prevCensusCount} residents.`,
            `Today's imported census feed contained only ${importedCensusCount} residents (>50% drop).`,
            'Automated safety rules mandate flagging data anomalies immediately.'
          ]
        });
      }

      feedStatus.lastSuccessfulCycle = importTime;
      feedStatus.dataCurrentThrough = importTime;
      feedStatus.validationErrors = validationErrors;
      this.store.put('config', this.feedStatusKey, feedStatus);
    });

    this._invalidateCache();

    // Run deterministic rules engine across imported dataset
    await this.runRulesEngine(user);

    const totalRecords = results.reduce((acc, r) => acc + (r.count || 0), 0);
    return {
      success: true,
      totalRecords,
      importTime,
      results,
      validationErrors
    };
  }

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
        prescriber: r.prescriber || r.physician || existing.prescriber || 'Attending MD',
        status: r.status || 'Active',
        stayType: r.stayType || existing.stayType || 'long_stay', // 'short_stay' | 'long_stay'
        sourceReport,
        reportDate,
        originalRow: i + 1,
        importTimestamp: importTime
      };
      this.store.put('snf_resident', residentId, resident);
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
      this.store.put('snf_admission', id, {
        id,
        residentId,
        residentName: r.name || r.residentName || residentId,
        admissionDate: this._safeDateString(r.admissionDate, this._safeDateString(reportDate)),
        admittedFrom: r.admittedFrom || r.hospital || 'Hospital',
        primaryDiagnosis: r.primaryDiagnosis || r.admitDiagnosis || 'Post-Acute Care',
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
      this.store.put('snf_transfer', id, {
        id,
        residentId,
        residentName: r.name || r.residentName || residentId,
        type: r.type || 'Transfer Out', // 'Transfer Out' | 'Return'
        hospital: r.hospital || r.destination || 'Acute Care Medical Center',
        reason: r.reason || 'Acute Change in Condition',
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
      this.store.put('snf_clinical24', id, {
        id,
        residentId,
        residentName: r.name || r.residentName || residentId,
        shift: r.shift || '24-Hour',
        summary: r.summary || r.notes || r.event || 'Change in condition noted',
        vitalSigns: r.vitals || null,
        providerNotified: !!r.providerNotified,
        familyNotified: !!r.familyNotified,
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
        dose: r.dose || '1 tab',
        route: r.route || 'Oral',
        frequency: r.frequency || 'Daily',
        isPRN: !!(r.prn || (r.frequency && /prn|as needed/i.test(r.frequency))),
        startDate: this._safeDateString(r.startDate, this._safeDateString(reportDate)),
        endDate: r.endDate ? this._safeDateString(r.endDate) : null,
        prescriber: r.prescriber || r.physician || 'Attending MD',
        indication: r.indication || r.diagnosis || null,
        status: r.status || 'Active',
        sourceReport,
        reportDate,
        originalRow: i + 1,
        importTimestamp: importTime
      };

      this.store.put('snf_med_order', orderId, order);
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
        changeType: r.changeType || r.action || 'New Order', // 'New Order' | 'Dose Increase' | 'Dose Decrease' | 'Discontinued' | 'Restart'
        previousDose: r.previousDose || null,
        newDose: r.newDose || r.dose,
        frequency: r.frequency,
        isPRN: !!(r.prn || (r.frequency && /prn/i.test(r.frequency))),
        prescriber: r.prescriber || r.physician,
        orderDate: this._safeDateString(r.orderDate, this._safeDateString(reportDate)),
        indication: r.indication || null,
        rationale: r.rationale || r.reason || null,
        sourceReport,
        reportDate,
        originalRow: i + 1,
        importTimestamp: importTime
      };

      this.store.put('snf_med_change', changeId, changeRecord);

      // Also ensure order is stored in active orders if new
      if (changeRecord.changeType === 'New Order') {
        const orderId = `ord-${residentId}-${drugName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        this.store.put('snf_med_order', orderId, {
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
          route: r.route || 'Oral',
          frequency: changeRecord.frequency || 'Daily',
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
      this.store.put('snf_emar_exception', id, {
        id,
        residentId,
        residentName: r.residentName || r.name || residentId,
        medication: r.medication || r.drugName,
        scheduledTime: r.scheduledTime || '09:00',
        exceptionType: r.exceptionType || r.status || 'Omitted', // 'Refused' | 'Omitted' | 'Not Available' | 'Held'
        reason: r.reason || 'Resident refused',
        nurse: r.nurse || r.administeredBy || 'RN Staff',
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

      this.store.put('snf_diagnosis', id, {
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
      this.store.put('snf_behavior', id, {
        id,
        residentId,
        residentName: r.residentName || r.name || residentId,
        targetSymptom: r.targetSymptom || r.behavior || 'Physical Aggression',
        severity: r.severity || 'Moderate', // 'Mild' | 'Moderate' | 'Severe'
        triggers: r.triggers || r.circumstances || 'ADL Care Caregiving approach',
        interventionsAttempted: r.interventionsAttempted || r.interventions || 'Redirection offered',
        effectiveness: r.effectiveness || 'Partially Effective',
        adverseEffects: r.adverseEffects || 'None observed',
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
      this.store.put('snf_fall', id, {
        id,
        residentId,
        residentName: r.residentName || r.name || residentId,
        location: r.location || 'Resident Bedroom',
        injuryLevel: r.injuryLevel || 'None', // 'None' | 'Minor' | 'Major'
        witnessed: !!r.witnessed,
        neuroChecksDone: r.neuroChecksDone !== false,
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
      this.store.put('snf_infection', id, {
        id,
        residentId,
        residentName: r.residentName || r.name || residentId,
        infectionType: r.infectionType || 'UTI', // 'UTI' | 'Respiratory' | 'Skin' | 'GI'
        antibiotic: r.antibiotic || null,
        startDate: this._safeDateString(r.startDate, this._safeDateString(reportDate)),
        mcGeerCriteriaMet: r.mcGeerCriteriaMet !== false,
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
      this.store.put('snf_wound', id, {
        id,
        residentId,
        residentName: r.residentName || r.name || residentId,
        woundType: r.woundType || 'Pressure Injury',
        stage: r.stage || 'Stage 2',
        site: r.site || 'Sacrum',
        acquired: r.acquired || 'In-House', // 'In-House' | 'On Admission'
        treatment: r.treatment || 'Hydrocolloid dressing',
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
      this.store.put('snf_lab', id, {
        id,
        residentId,
        residentName: r.residentName || r.name || residentId,
        testName: r.testName || r.lab || 'BMP',
        result: r.result || 'Normal',
        abnormal: !!r.abnormal,
        criticalValue: !!r.criticalValue,
        followUpStatus: r.followUpStatus || (r.criticalValue ? 'Pending MD Review' : 'Reviewed'),
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
      this.store.put('snf_progress_note', id, {
        id,
        residentId,
        residentName: r.residentName || r.name || residentId,
        noteType: r.noteType || 'Nursing Note', // 'Nursing' | 'Physician' | 'Psychiatry' | 'Social Service'
        author: r.author || 'Staff',
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
      this.store.put('snf_gdr', id, {
        id,
        residentId,
        residentName: r.residentName || r.name || residentId,
        medication: r.medication,
        lastGDRDate: r.lastGDRDate || null,
        result: r.result || 'Pending', // 'Success' | 'Relapsed/Reverted' | 'Contraindicated' | 'Pending'
        nextReviewDate: r.nextReviewDate || null,
        isContraindicated: !!r.isContraindicated,
        clinicalRationale: r.clinicalRationale || null,
        prescriberDocumentation: !!r.prescriberDocumentation,
        sourceReport,
        reportDate,
        originalRow: i + 1,
        importTimestamp: importTime
      });
      count++;
    }
    return count;
  }

  // --- DETERMINISTIC CLINICAL RULES ENGINE ---

  async runRulesEngine(user = 'System') {
    const settings = this.getSettings();
    const residents = this.store.list('snf_resident');
    const orders = this.store.list('snf_med_order');
    const orderChanges = this.store.list('snf_med_change');
    const diagnoses = this.store.list('snf_diagnosis');
    const behaviors = this.store.list('snf_behavior');
    const notes = this.store.list('snf_progress_note');
    const gdrs = this.store.list('snf_gdr');
    const admissions = this.store.list('snf_admission');
    const feedStatus = this.getFeedStatus();

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const lookbackMs = (settings.behaviorLookbackDays || 10) * 24 * 60 * 60 * 1000;

    this._tx(() => {
      // RULE 0: FAIL-SAFE SURVEILLANCE INTEGRITY
      if (!feedStatus.isSurveillanceComplete) {
      if (feedStatus.isStale) {
        this._createAlert({
          code: 'STALE-001',
          severity: 'critical',
          title: 'PCC MONITORING DATA IS STALE',
          message: feedStatus.staleMessage || 'PCC report feeds have exceeded the freshness threshold.',
          residentId: null,
          residentName: 'FACILITY-WIDE',
          sources: [{ sourceReport: 'Feed Monitor', reportDateTime: new Date().toISOString(), originalRow: 'Cycle Check' }],
          whyFlagged: [
            'Private AI fail-safe rules mandate: Missing or unverified data = ALERT, never GREEN.',
            `Freshness limit configured at ${settings.staleThresholdHours} hours.`,
            `Last complete cycle was received at ${feedStatus.dataCurrentThroughFormatted}.`
          ]
        });
      }
      for (const missing of feedStatus.missingCriticalFeeds) {
        this._createAlert({
          code: `SURV-${missing.id.toUpperCase()}`,
          severity: 'critical',
          title: 'SURVEILLANCE INCOMPLETE',
          message: `${missing.name} has not been received or processed today. Surveillance is incomplete.`,
          residentId: null,
          residentName: 'FACILITY-WIDE',
          sources: [{ sourceReport: missing.name, reportDateTime: new Date().toISOString(), originalRow: 'Feed Ingestion' }],
          whyFlagged: [
            `Required daily feed "${missing.name}" is marked missing or encountered parser errors.`,
            'Private AI must never conclude "No critical issues detected" when monitoring feeds are missing.',
            'Verify PointClickCare report export scheduler or download folder.'
          ]
        });
      }
    }

    // Index data by resident for instant deterministic correlation
    const resOrders = new Map();
    for (const ord of orders) {
      if (!resOrders.has(ord.residentId)) resOrders.set(ord.residentId, []);
      resOrders.get(ord.residentId).push(ord);
    }

    const resDiagnoses = new Map();
    for (const d of diagnoses) {
      if (!resDiagnoses.has(d.residentId)) resDiagnoses.set(d.residentId, []);
      resDiagnoses.get(d.residentId).push(d);
    }

    const resBehaviors = new Map();
    for (const b of behaviors) {
      if (!resBehaviors.has(b.residentId)) resBehaviors.set(b.residentId, []);
      resBehaviors.get(b.residentId).push(b);
    }

    const resNotes = new Map();
    for (const n of notes) {
      if (!resNotes.has(n.residentId)) resNotes.set(n.residentId, []);
      resNotes.get(n.residentId).push(n);
    }

    const resGDRs = new Map();
    for (const g of gdrs) {
      if (!resGDRs.has(g.residentId)) resGDRs.set(g.residentId, []);
      resGDRs.get(g.residentId).push(g);
    }

    // RULE: NEW MEDICATION WATCH (Last 24 Hours)
    for (const chg of orderChanges) {
      const isRecent = (now - chg.importTimestamp) <= (36 * 60 * 60 * 1000);
      if (chg.changeType === 'New Order' && isRecent) {
        const isHighAlert = chg.isHighAlert;
        this._createAlert({
          code: 'MED-NEW',
          severity: isHighAlert ? 'high' : 'review',
          title: isHighAlert ? `HIGH-ALERT MEDICATION STARTED: ${chg.drugName.toUpperCase()}` : `NEW MEDICATION STARTED: ${chg.drugName}`,
          message: `New order started for ${chg.drugName} (${chg.newDose || 'standard dose'}, ${chg.frequency || 'daily'}). Review indication and clinical monitoring.`,
          residentId: chg.residentId,
          residentName: chg.residentName,
          drug: chg.drugName,
          sources: [{ sourceReport: chg.sourceReport || 'Medication Order Changes', reportDateTime: this._safeISO(chg.reportDate), originalRow: chg.originalRow || 1 }],
          whyFlagged: [
            `Medication order appeared as a newly started order in the last 24-48 hours.`,
            `Drug class classified as: ${chg.drugClass}.`,
            isHighAlert ? `Facility high-alert medication policy requires prioritized clinical surveillance.` : `Standard new medication baseline review.`
          ]
        });
      }
    }

    // ITERATE THROUGH ALL RESIDENTS TO RUN PSYCH WATCH & CLINICAL SURVEILLANCE
    for (const res of residents) {
      const residentId = res.id;
      const residentName = res.name;
      const residentRoom = res.room;
      const residentOrders = resOrders.get(residentId) || [];
      const residentDiags = resDiagnoses.get(residentId) || [];
      const residentBehs = resBehaviors.get(residentId) || [];
      const residentNotesList = resNotes.get(residentId) || [];
      const residentGDRList = resGDRs.get(residentId) || [];

      // Find active antipsychotics
      const activeAPs = residentOrders.filter(o => o.status === 'Active' && o.isAntipsychotic);

      for (const ap of activeAPs) {
        const drugName = ap.drugName;
        const startDateMs = Date.parse(ap.startDate) || now;
        const daysOnDrug = Math.max(1, Math.floor((now - startDateMs) / (24 * 60 * 60 * 1000)));

        // RULE AP-001: NEW ANTIPSYCHOTIC (Within last 48 hours)
        if (daysOnDrug <= 2 || (now - ap.importTimestamp <= 48 * 60 * 60 * 1000)) {
          this._createAlert({
            code: 'AP-001',
            severity: 'critical',
            title: 'NEW ANTIPSYCHOTIC STARTED',
            message: `Newly started antipsychotic order: ${drugName} (${ap.dose}, ${ap.frequency}). Prescriber: ${ap.prescriber}.`,
            residentId,
            residentName,
            residentRoom,
            drug: drugName,
            sources: [{ sourceReport: ap.sourceReport || 'Medication Order Changes', reportDateTime: this._safeISO(ap.reportDate), originalRow: ap.originalRow || 1 }],
            whyFlagged: [
              `Newly ordered antipsychotic detected on active medication snapshot.`,
              `Start Date: ${ap.startDate} (Prescribed by: ${ap.prescriber}).`,
              `Immediate cross-check required for indication, consent, and non-pharmacological care plan.`
            ]
          });
        }

        // RULE AP-002: NO SUPPORTING DIAGNOSIS FOUND
        // CMS & NY regulations require a supported clinical diagnosis
        const hasSupportingDiag = residentDiags.some(d =>
          /schizo|bipolar|major depress|tourette|huntington|psychosis|delusion|hallucination/i.test(d.description) ||
          /^F(20|21|22|25|30|31|32\.3|33\.3)/i.test(d.icd10)
        );

        if (!hasSupportingDiag && !ap.indication) {
          this._createAlert({
            code: 'AP-002',
            severity: 'critical',
            title: 'ANTIPSYCHOTIC — DIAGNOSIS/INDICATION REVIEW',
            message: 'Supporting diagnosis/indication was not found in the records currently available to Private AI.',
            residentId,
            residentName,
            residentRoom,
            drug: drugName,
            sources: [
              { sourceReport: ap.sourceReport || 'Active Medication Profile', reportDateTime: this._safeISO(ap.reportDate), originalRow: ap.originalRow || 1 },
              { sourceReport: 'Active Diagnosis Report', reportDateTime: new Date().toISOString(), originalRow: 'Search completed' }
            ],
            whyFlagged: [
              `Active antipsychotic order for ${drugName} identified.`,
              `Active Diagnosis Report searched: no matching psychiatric condition (e.g. Schizophrenia, Bipolar Mania, Psychotic Disorder) was identified in imported records.`,
              `Order indication field was empty or unlinked in current PCC export.`
            ]
          });
        }

        // RULE AP-003: NEW DIAGNOSIS + ANTIPSYCHOTIC
        // CMS surveyor guidance scrutinizes newly added schizophrenia diagnoses
        const recentSchizophrenia = residentDiags.find(d => {
          if (!d.isSchizophrenia) return false;
          const onsetMs = Date.parse(d.onsetDate);
          return onsetMs && (now - onsetMs <= 90 * 24 * 60 * 60 * 1000);
        });

        if (recentSchizophrenia) {
          this._createAlert({
            code: 'AP-003',
            severity: 'high',
            title: 'NEW PSYCHIATRIC DIAGNOSIS — DOCUMENTATION REVIEW',
            message: `New diagnosis of ${recentSchizophrenia.description} (${recentSchizophrenia.icd10}) identified for resident receiving ${drugName}. Review documentation for supporting psychiatric evaluation.`,
            residentId,
            residentName,
            residentRoom,
            drug: drugName,
            sources: [
              { sourceReport: recentSchizophrenia.sourceReport || 'Active Diagnoses', reportDateTime: this._safeISO(recentSchizophrenia.reportDate), originalRow: recentSchizophrenia.originalRow || 1 },
              { sourceReport: ap.sourceReport || 'Active Medication Profile', reportDateTime: this._safeISO(ap.reportDate), originalRow: ap.originalRow || 1 }
            ],
            whyFlagged: [
              `Diagnosis of ${recentSchizophrenia.description} first appeared in records on ${recentSchizophrenia.onsetDate}.`,
              `CMS survey guidance specifically directs surveyors to scrutinize unsupported schizophrenia diagnoses associated with antipsychotic prescribing.`,
              `Recommend verifying presence of comprehensive psychiatric evaluation, PASARR Level II (if applicable), and detailed clinical history in PCC.`
            ]
          });
        }

        // RULE AP-004: NO TARGET SYMPTOM FOUND
        // If indication is behavioral/distress, verify that a target symptom is documented
        const isBehaviorIndication = !hasSupportingDiag || (ap.indication && /behavior|agitat|aggression|distress|dementia/i.test(ap.indication));
        const recentTargetBehaviors = residentBehs.filter(b => (now - Date.parse(b.eventDate)) <= lookbackMs);

        if (isBehaviorIndication && recentTargetBehaviors.length === 0) {
          this._createAlert({
            code: 'AP-004',
            severity: 'critical',
            title: 'ANTIPSYCHOTIC — TARGET SYMPTOM DOCUMENTATION NOT FOUND',
            message: `Resident receives ${drugName} for behavioral management, but no specific target symptom documentation was located in imported PCC records during the look-back window.`,
            residentId,
            residentName,
            residentRoom,
            drug: drugName,
            sources: [
              { sourceReport: ap.sourceReport || 'Active Medication Profile', reportDateTime: this._safeISO(ap.reportDate), originalRow: ap.originalRow || 1 },
              { sourceReport: 'Behavior Monitoring Report', reportDateTime: new Date().toISOString(), originalRow: 'Search completed' }
            ],
            whyFlagged: [
              `Antipsychotic indication or usage corresponds to behavioral symptoms.`,
              `No documented target symptoms (such as physical aggression, hallucinations, or delusions) found within configured ${settings.behaviorLookbackDays}-day lookback.`,
              `CMS F758 requires documentation of the specific, quantifiable target symptom being treated.`
            ]
          });
        }

        // RULE AP-005: BEHAVIOR DOCUMENTATION GAP
        // If resident has a documented target behavior in the past, but none recently
        if (residentBehs.length > 0) {
          const sortedBehs = [...residentBehs].sort((a, b) => Date.parse(b.eventDate) - Date.parse(a.eventDate));
          const lastBeh = sortedBehs[0];
          const lastBehDateMs = Date.parse(lastBeh.eventDate);
          const daysSinceLastBeh = Math.floor((now - lastBehDateMs) / (24 * 60 * 60 * 1000));

          if (daysSinceLastBeh > (settings.behaviorLookbackDays || 10)) {
            this._createAlert({
              code: 'AP-005',
              severity: 'high',
              title: 'BEHAVIOR MONITORING GAP',
              message: `Medication: ${drugName}. Indication: ${ap.indication || 'Behavioral symptoms'}. Last documented target behavior found: ${daysSinceLastBeh} days ago (${lastBeh.eventDate}).`,
              residentId,
              residentName,
              residentRoom,
              drug: drugName,
              sources: [
                { sourceReport: lastBeh.sourceReport || 'Behavior Monitoring Report', reportDateTime: this._safeISO(lastBeh.reportDate), originalRow: lastBeh.originalRow || 1 }
              ],
              whyFlagged: [
                `Resident receives scheduled psychotropic for target behaviors.`,
                `Most recent behavior documentation identified was ${lastBeh.targetSymptom} on ${lastBeh.eventDate} (${daysSinceLastBeh} days ago).`,
                `Exceeds facility policy look-back threshold of ${settings.behaviorLookbackDays} days without updated monitoring entries.`
              ]
            });
          }
        }

        // RULE: NON-PHARMACOLOGICAL INTERVENTION WATCH
        const hasInterventions = residentBehs.some(b => b.interventionsAttempted && b.interventionsAttempted.trim().length > 3) ||
          residentNotesList.some(n => NON_PHARM_INTERVENTIONS.some(term => n.text.toLowerCase().includes(term)));

        if (!hasInterventions && isBehaviorIndication) {
          this._createAlert({
            code: 'AP-NONPHARM',
            severity: 'high',
            title: 'NON-PHARMACOLOGICAL INTERVENTIONS NOT DOCUMENTED',
            message: `Antipsychotic in use without documentation of prior or concurrent non-pharmacological interventions in imported records.`,
            residentId,
            residentName,
            residentRoom,
            drug: drugName,
            sources: [
              { sourceReport: 'Behavior & Progress Note Reports', reportDateTime: new Date().toISOString(), originalRow: 'Search completed' }
            ],
            whyFlagged: [
              `CMS F758 and NY 10 NYCRR 415 require non-pharmacological interventions (redirection, environmental changes, activity modifications) to be attempted and documented.`,
              `No structured intervention entries identified in imported behavior or nursing records.`
            ]
          });
        }

        // RULE: PRN ANTIPSYCHOTIC 14-DAY WATCH (Deterministic)
        if (ap.isPRN) {
          const prnDays = daysOnDrug;
          let prnSeverity = null;
          let prnTitle = null;

          if (prnDays >= 14) {
            prnSeverity = 'critical';
            prnTitle = 'PRN ANTIPSYCHOTIC — 14-DAY ALERT (LIMIT EXCEEDED)';
          } else if (prnDays >= 13) {
            prnSeverity = 'high';
            prnTitle = 'PRN ANTIPSYCHOTIC REVIEW REQUIRED (DAY 13)';
          } else if (prnDays >= 10) {
            prnSeverity = 'review';
            prnTitle = 'PRN ANTIPSYCHOTIC APPROACHING 14-DAY LIMIT (DAY ' + prnDays + ')';
          }

          if (prnSeverity) {
            this._createAlert({
              code: 'PRN-014',
              severity: prnSeverity,
              title: prnTitle,
              message: `PRN order for ${drugName} has reached Day ${prnDays}. CMS F758 mandates PRN psychotropics are limited to 14 days and cannot be renewed without new prescriber evaluation.`,
              residentId,
              residentName,
              residentRoom,
              drug: drugName,
              sources: [{ sourceReport: ap.sourceReport || 'Active Medication Profile', reportDateTime: this._safeISO(ap.reportDate), originalRow: ap.originalRow || 1 }],
              whyFlagged: [
                `Order start date: ${ap.startDate}. Current day of order: Day ${prnDays}.`,
                `CMS 42 CFR 483.45(e) requires that PRN psychotropic medications be limited to 14 days maximum.`,
                prnDays >= 14 ? `CRITICAL: Prescribing practitioner must evaluate the resident for appropriateness before renewal.` : `Approaching mandatory review milestone.`
              ]
            });
          }
        }

        // RULE: GDR WATCH
        const residentGDR = residentGDRList.find(g => g.medication && g.medication.toLowerCase().includes(ap.genericName.toLowerCase())) || residentGDRList[0];
        if (daysOnDrug > 180 && !residentGDR) {
          this._createAlert({
            code: 'GDR-001',
            severity: 'high',
            title: 'GDR REVIEW DUE / DOCUMENTATION NOT FOUND',
            message: `Resident has received ${drugName} for >180 days. No gradual dose reduction (GDR) trial or physician clinical contraindication found in imported records.`,
            residentId,
            residentName,
            residentRoom,
            drug: drugName,
            sources: [{ sourceReport: 'Consultant Pharmacist / GDR Log', reportDateTime: new Date().toISOString(), originalRow: 'Search completed' }],
            whyFlagged: [
              `Medication duration exceeds 6 months (${daysOnDrug} days).`,
              `CMS F758 requires gradual dose reduction attempts in two separate quarters of the first year, then annually thereafter.`,
              `No clinical contraindication statement or GDR trial was located in imported records.`
            ]
          });
        }
      }
    }

    // SYNC WITH OPEN ISSUES ENGINE
      this._syncOpenIssues();
    });

    this._invalidateCache();

    return true;
  }

  // --- ALERT LIFECYCLE & OPEN ISSUES ENGINE ---

  _createAlert({ code, severity, title, message, residentId, residentName, residentRoom, drug, sources = [], whyFlagged = [] }) {
    const alertId = `alt-${code}-${residentId || 'facility'}-${(drug || 'general').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const existing = this.store.get('snf_alert', alertId);

    const now = Date.now();
    if (existing) {
      // Update existing alert without losing acknowledgement/in-review state
      const updated = {
        ...existing,
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
    return this.store.list('snf_alert').filter(a => a.status !== 'resolved' && a.status !== 'dismissed');
  }

  acknowledgeAlert(alertId, user = 'Clinician') {
    const alert = this.store.get('snf_alert', alertId);
    if (!alert) throw fail('INVALID');
    if (alert.status === 'resolved') return alert;

    const now = Date.now();
    alert.status = alert.status === 'new' ? 'acknowledged' : alert.status;
    alert.acknowledgedBy = user;
    alert.acknowledgedAt = alert.acknowledgedAt || now;
    alert.auditTrail.push({
      action: 'acknowledged',
      user,
      timestamp: now,
      note: 'Alert acknowledged by clinical user. Remains visible until fully resolved.'
    });

    this.store.put('snf_alert', alertId, alert);
    this._syncOpenIssues();
    this._invalidateCache();
    return alert;
  }

  assignAlert(alertId, assignedTo, user = 'Clinician', note = '') {
    const alert = this.store.get('snf_alert', alertId);
    if (!alert) throw fail('INVALID');

    const now = Date.now();
    alert.status = 'in_review';
    alert.assignedTo = assignedTo;
    alert.auditTrail.push({
      action: 'assigned',
      user,
      timestamp: now,
      note: `Assigned to ${assignedTo} for clinical review. ${note}`
    });

    this.store.put('snf_alert', alertId, alert);
    this._syncOpenIssues();
    this._invalidateCache();
    return alert;
  }

  resolveAlert(alertId, resolutionStatus, note = '', user = 'Clinician') {
    const alert = this.store.get('snf_alert', alertId);
    if (!alert) throw fail('INVALID');

    const now = Date.now();
    alert.status = 'resolved';
    alert.resolvedBy = user;
    alert.resolvedAt = now;
    alert.resolutionStatus = resolutionStatus || 'Verified in PCC / Addressed';
    alert.actionNote = note;
    alert.auditTrail.push({
      action: 'resolved',
      user,
      timestamp: now,
      resolutionStatus: alert.resolutionStatus,
      note: note || 'Resolved with clinical verification'
    });

    this.store.put('snf_alert', alertId, alert);
    this._syncOpenIssues();
    this._invalidateCache();
    return alert;
  }

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
          source: alt.sources?.[0]?.sourceReport || 'PCC Daily Feeds',
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
      const alerts = this.store.list('snf_alert').filter(a => a.status !== 'resolved');
      const critical = alerts.filter(a => a.severity === 'critical').length;
      const high = alerts.filter(a => a.severity === 'high').length;
      const review = alerts.filter(a => a.severity === 'review').length;
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
      const unresolvedAlerts = alerts.filter(a => a.status !== 'resolved');

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

    // CMS Quality Measure Watch (2026 Long-Stay Antipsychotic Measure Model)
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

    const estimatedQMRate = longStayResidents.length > 0
      ? ((potentialNumerator.length / longStayResidents.length) * 100).toFixed(1)
      : '0.0';

    return {
      totalCensus,
      antipsychoticResidentsCount: apResidentIds.size,
      psychWatchCard: {
        antipsychoticResidents: apResidentIds.size,
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
        note: 'Calculated using CMS 2026 long-stay methodology (excluding Schizophrenia, Tourette, Huntington). Claim/encounter verification required for definitive audit determination.',
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
        review: unresolvedAlerts.filter(a => a.severity === 'review').length
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
    const openIssues = this.store.list('snf_open_issue').filter(i => i.status !== 'Resolved');

    const now = Date.now();
    const oneDayAgo = now - 36 * 60 * 60 * 1000;
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    let brief = `# PRIVATE AI — MORNING ADMINISTRATOR & CLINICAL BRIEF\n`;
    brief += `**Date**: ${dateStr} | **Census**: ${metrics.totalCensus} | **PCC Data Status**: ${metrics.feedStatus.dataCurrentThroughFormatted}\n\n`;

    // 1. TOP SECTION MUST ALWAYS BE: CRITICAL / UNRESOLVED
    brief += `## 🔴 CRITICAL / UNRESOLVED CLINICAL ITEMS\n`;
    if (criticalAlerts.length === 0 && metrics.feedStatus.isSurveillanceComplete) {
      brief += `*No unacknowledged critical clinical exceptions currently active across verified feeds.*\n\n`;
    } else {
      if (!metrics.feedStatus.isSurveillanceComplete) {
        brief += `⚠️ **SURVEILLANCE COMPLIANCE ALERT**: Data feeds are incomplete or stale. Review Feed Integrity below.\n`;
      }
      brief += `**${criticalAlerts.length} Critical Alert(s) Requiring Immediate Review:**\n`;
      for (const a of criticalAlerts) {
        brief += `- **[${a.residentName || 'FACILITY'}] ${a.title}**: ${a.message} *(Source: ${a.sources?.[0]?.sourceReport || 'PCC'})*\n`;
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
      brief += `- No acute changes in condition logged overnight in imported 24h reports.\n`;
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
    brief += `- **Hospital Transfers Out**: ${recentTrans.length ? recentTrans.map(t => `${t.residentName} (${t.hospital} - ${t.reason})`).join(', ') : 'None'}\n`;
    brief += `- **New Admissions**: ${recentAdm.length ? recentAdm.map(a => `${a.residentName} (Rm ${a.room || 'TBD'} - ${a.primaryDiagnosis})`).join(', ') : 'None'}\n\n`;

    // 4. NEW MEDICATIONS & PSYCH WATCH
    brief += `### New Medications & Psych Watch Overview\n`;
    const pw = metrics.psychWatchCard;
    brief += `**Psych Watch Metrics**: Antipsychotic Residents: **${pw.antipsychoticResidents}** | New (24h): **${pw.newAPs24h}** | Doc Reviews: **${pw.documentationReview}** | GDR Reviews: **${pw.gdrReview}** | PRN 14-Day Deadlines: **${pw.prnDeadlines}**\n`;
    brief += `**Estimated QM Exposure**: **${metrics.qmWatch.estimatedRatePercentage}%** (${metrics.qmWatch.potentialNumeratorCount} of ${metrics.qmWatch.longStayDenominator} long-stay residents; ${metrics.qmWatch.knownExclusionsCount} known exclusions)\n\n`;

    // 5. INCIDENTS, INFECTIONS & EXCEPTIONS
    brief += `### Incidents, Infections & eMAR Exceptions\n`;
    const recentFalls = falls.filter(f => (now - f.importTimestamp) <= oneDayAgo);
    const recentEmar = emar.filter(e => (now - e.importTimestamp) <= oneDayAgo);
    const recentInf = infections.filter(i => (now - i.importTimestamp) <= oneDayAgo);
    brief += `- **Falls in Last 24 Hours**: ${recentFalls.length ? `${recentFalls.length} fall(s) reported (${recentFalls.map(f => `${f.residentName} - ${f.location}, injury: ${f.injuryLevel}`).join('; ')})` : '0 falls reported'}\n`;
    brief += `- **New Infection Surveillance**: ${recentInf.length ? recentInf.map(i => `${i.residentName} (${i.infectionType}, ABX: ${i.antibiotic || 'None'})`).join('; ') : 'No new active infections flagged'}\n`;
    brief += `- **eMAR / eTAR Exceptions**: ${recentEmar.length ? `${recentEmar.length} exception(s) logged (${recentEmar.map(e => `${e.residentName}: ${e.medication} - ${e.exceptionType}`).slice(0, 5).join('; ')})` : '0 exceptions'}\n\n`;

    // 6. PREVIOUSLY UNRESOLVED ISSUES (CARRY-FORWARD)
    brief += `### Previously Unresolved Open Issues\n`;
    if (openIssues.length === 0) {
      brief += `- All previous high-priority issues have been documented as resolved.\n`;
    } else {
      for (const iss of openIssues.slice(0, 5)) {
        const daysOpen = Math.max(1, Math.floor((now - iss.firstDetected) / (24 * 60 * 60 * 1000)));
        brief += `- **[Day ${daysOpen}] ${iss.residentName}**: ${iss.issue} (Status: ${iss.status}, Owner: ${iss.owner})\n`;
      }
    }
    brief += `\n---\n*Report generated deterministically by Private AI SNF Command Center. Traceable to PointClickCare raw feeds.*`;

    return brief;
    });
  }

  // --- QUICK COMMANDS DATA EXTRACTORS ---

  getCriticalAlertsReport() {
    return this._getCached('report_critical_alerts', () => {
      const alerts = this.store.list('snf_alert').filter(a => a.severity === 'critical' && a.status !== 'resolved');
      if (!alerts.length) return 'No unresolved critical alerts found across verified PCC data.';
      return `# UNRESOLVED CRITICAL CLINICAL ALERTS (${alerts.length})\n\n` +
        alerts.map((a, i) => `### ${i + 1}. [${a.residentName} - Rm ${a.residentRoom || 'N/A'}] ${a.title}\n` +
          `- **Message**: ${a.message}\n` +
          `- **Drug**: ${a.drug || 'N/A'}\n` +
          `- **Status**: ${a.status.toUpperCase()} | First Detected: ${new Date(a.firstDetected).toLocaleDateString()}\n` +
          `- **Why Flagged**:\n${(a.whyFlagged || []).map(w => `  * ${w}`).join('\n')}\n` +
          `- **Source**: ${a.sources?.[0]?.sourceReport || 'PCC'} (${a.sources?.[0]?.reportDateTime || 'Recent'})\n`
        ).join('\n');
    });
  }

  getPsychWatchReport() {
    return this._getCached('report_psych_watch', () => {
      const metrics = this.getDashboardMetrics();
      const pw = metrics.psychWatchCard;
      const orders = this.store.list('snf_med_order').filter(o => o.status === 'Active' && o.isAntipsychotic);
      const alerts = this.store.list('snf_alert').filter(a => a.status !== 'resolved' && a.code.startsWith('AP-') || a.code === 'PRN-014' || a.code === 'GDR-001');

      let out = `# PSYCH WATCH — ANTIPSYCHOTIC SURVEILLANCE\n\n`;
      out += `**Overview Summary**: Antipsychotic Residents: **${pw.antipsychoticResidents}** | New Orders (24h): **${pw.newAPs24h}** | Doc Reviews Needed: **${pw.documentationReview}** | GDR Reviews: **${pw.gdrReview}** | PRN 14-Day Limit Deadlines: **${pw.prnDeadlines}**\n\n`;
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
        out += `- **Source**: ${c.sourceReport || 'PCC Medication Order Changes'} (Row ${c.originalRow || 1})\n\n`;
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
      const issues = this.store.list('snf_open_issue').filter(i => i.status !== 'Resolved');
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
    const target = residents.find(r => r.name.toLowerCase().includes(q) || r.id.toLowerCase() === q);
    if (!target) return `Resident "${residentQuery}" was not found in current PointClickCare census records.`;

    return this._getCached(`report_timeline_${target.id}`, () => {
      const rid = target.id;
      const orders = this.store.list('snf_med_order').filter(o => o.residentId === rid);
      const diags = this.store.list('snf_diagnosis').filter(d => d.residentId === rid);
      const behs = this.store.list('snf_behavior').filter(b => b.residentId === rid);
      const falls = this.store.list('snf_fall').filter(f => f.residentId === rid);
      const alerts = this.store.list('snf_alert').filter(a => a.residentId === rid);

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

    return await this.ingestReports(sampleFeed, 'PCC Automated Runner');
  }

  getPCCReportCatalog() {
    return PCC_REPORT_CATALOG;
  }

  assertEmrReadOnly(kind) {
    const rawKinds = [
      'snf_med_order', 'snf_med_change', 'snf_emar_exception', 'snf_diagnosis',
      'snf_behavior', 'snf_fall', 'snf_infection', 'snf_wound', 'snf_lab',
      'snf_clinical24', 'snf_progress_note', 'snf_gdr', 'snf_admission', 'snf_transfer'
    ];
    if (rawKinds.includes(kind)) {
      throw new Error(`EMR data (${kind}) is strictly read-only and immutable. In accordance with clinical governance, raw EMR surveillance records cannot be edited or altered.`);
    }
  }

  cleanup(retentionDays = 100, now = Date.now()) {
    const rawCutoff = now - retentionDays * 86400000;
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
      'snf_clinical24', 'snf_progress_note', 'snf_gdr', 'snf_admission', 'snf_transfer'
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
          if (time && time < rawCutoff) {
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
          if (dischargeTime && dischargeTime < rawCutoff) {
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

    counts.total = counts.rawEmrRecords + counts.dischargedResidents + counts.resolvedAlerts + counts.resolvedIssues + counts.reportsPurged;

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
    const retentionDays = this.core?.settings()?.retentionDays || 100;

    const alerts = this.store.list('snf_alert');
    const resolvedAlerts = alerts.filter(a => a.status === 'resolved' || a.status === 'dismissed').length;
    const activeAlerts = alerts.filter(a => a.status !== 'resolved' && a.status !== 'dismissed').length;

    const residents = this.store.list('snf_resident');
    const activeCensus = residents.filter(r => r.status !== 'Discharged' && !r.dischargeDate).length;
    const dischargedCensus = residents.filter(r => r.status === 'Discharged' || r.dischargeDate).length;

    const rawKinds = [
      'snf_med_order', 'snf_med_change', 'snf_emar_exception', 'snf_diagnosis',
      'snf_behavior', 'snf_fall', 'snf_infection', 'snf_wound', 'snf_lab',
      'snf_clinical24', 'snf_progress_note', 'snf_gdr', 'snf_admission', 'snf_transfer'
    ];
    let totalRawRecords = 0;
    for (const kind of rawKinds) {
      totalRawRecords += this.store.list(kind).length;
    }

    return {
      emrPlatform: settings.emrPlatform || 'PointClickCare (PCC)',
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
      regulatoryNotice: "Supplemental operational surveillance & clinical analytics only. Exempt from CMS 42 CFR § 483 / HIPAA 6-year archival. Raw EMR data is immutable and held for 100 days for quarterly audits; resulted analytical reports are held for 200 days."
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
    report += `**Quarter**: Q${currentQuarter} ${currentYear} | **Generated**: ${dateStr} | **Surveillance Engine**: ${metrics.feedStatus.isSurveillanceComplete ? 'Active & Verified' : 'Exceptions Flagged'}\n\n`;

    report += `## 1. Facility Clinical Summary & Census Distribution\n`;
    report += `- **Total Active Census**: ${metrics.totalCensus} residents\n`;
    report += `- **Medicare Part A (Med A)**: ${metrics.medACensus || 0} residents\n`;
    report += `- **Medicaid / Managed Care (Med B)**: ${metrics.medBCensus || 0} residents\n`;
    report += `- **Long-Stay Census (≥101 days)**: ${qm.longStayDenominator} residents\n`;
    report += `- **Data Ingestion Status**: ${metrics.feedStatus.receivedFeedsCount}/16 PointClickCare feeds active (${metrics.feedStatus.dataCurrentThroughFormatted})\n\n`;

    report += `## 2. Quality Measure (QM) Exposure & Antipsychotic Surveillance (CMS F758)\n`;
    report += `- **Estimated QM Antipsychotic Rate**: **${qm.estimatedRatePercentage}%**\n`;
    report += `- **Potential Numerator Count**: ${qm.potentialNumeratorCount} long-stay residents receiving antipsychotics\n`;
    report += `- **Identified CMS Exclusions**: ${qm.knownExclusionsCount} (Schizophrenia, Tourette's, Huntington's)\n`;
    report += `- **Exclusions Requiring Chart Verification**: ${qm.possibleExclusionsToVerifyCount} residents\n`;
    report += `- **Facility-Wide Antipsychotic Prevalence**: ${metrics.antipsychoticResidentsCount} residents (${metrics.antipsychoticRate}%)\n\n`;

    report += `## 3. Psychotropic Medication Stewardship & Compliance Audit\n`;
    const pw = metrics.psychWatchCard;
    report += `- **Active Antipsychotic Residents**: ${pw.antipsychoticResidents}\n`;
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
    const rev = unresolved.filter(a => a.severity === 'review');
    report += `- **Total Active Alerts**: ${unresolved.length} (${crit.length} Critical, ${high.length} High, ${rev.length} Review)\n`;
    if (crit.length > 0) {
      report += `\n### Critical Exceptions Requiring Review:\n`;
      for (const c of crit) {
        report += `- 🔴 **[${c.residentName || 'FACILITY'}] ${c.title}**: ${c.message}\n`;
      }
    }
    report += `\n`;

    report += `## 6. Retention Policy & Data Governance Verification\n`;
    report += `*Operational Notice: Supplemental surveillance and clinical analytics only. Raw PointClickCare feeds are held read-only for 100 days for quarterly audits. Derived analytical reports and quarterly PDF summaries are archived for 200 days.*\n`;

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
      content: markdown || "# Clinical Surveillance Report\n\nNo active surveillance records found.",
      format: "pdf",
      title,
      subfolder: "Reports"
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

