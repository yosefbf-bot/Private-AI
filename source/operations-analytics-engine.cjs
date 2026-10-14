'use strict';

/**
 * Operations Analytics & Compliance Engine
 *
 * Staffing & Overtime Analytics (OnShift-tailored + Universal Multi-Platform Adapter),
 * Pre-Shift "Approaching OT" Warning Radar, Incidental Punch Leakage Audit,
 * Smart Shift Replacement Matcher, FTE Deficit & Hiring Gap Calculator,
 * Regulatory Compliance & License Renewal Sentinel (CLIA, BNE/Narcotics, DOH, Life Safety, Credentialing).
 */

const { fail, isId, text, uuid } = require('./security.cjs');

// Default Regulatory Categories & Standard License Profiles
const DEFAULT_REGULATORY_ITEMS = [
  {
    id: 'reg_clia',
    category: 'facility_license',
    title: 'CLIA Certificate of Waiver (CMS-116)',
    authority: 'CMS / State Department of Health',
    identifierNumber: '33D0654321',
    responsibleParty: 'Medical Director / Lab Director',
    expirationDate: '2026-12-31',
    renewalWindowDays: 90,
    requiredDocuments: ['CMS Form 116 Application', 'Lab Director CV & Medical License', 'State Fee Payment Voucher', 'Waived Test Menu Verification'],
    testMenu: ['COVID-19 Rapid Antigen', 'Influenza A/B Rapid', 'RSV Rapid', 'Point-of-Care Blood Glucose', 'Dipstick Urinalysis', 'Prothrombin Time / INR'],
    notes: 'Biennial renewal. Waived testing only. Ensure annual competency checks on all testing nurses.'
  },
  {
    id: 'reg_bne_narcotics',
    category: 'controlled_substances',
    title: 'BNE / State CDS Controlled Substance Registration',
    authority: 'Bureau of Narcotics Enforcement / State Dept of Health',
    identifierNumber: 'CS-889944-A',
    responsibleParty: 'Director of Nursing (DON) & Consultant Pharmacist',
    expirationDate: '2026-11-15',
    renewalWindowDays: 60,
    requiredDocuments: ['Biennial Controlled Substance Physical Count Sheet', 'Destruction Log Sign-off Record', 'Safe Combination Change Log (Last: 2026-06-01)', 'DEA Certificate Copy'],
    notes: 'Safe combination must be rotated when key nursing leadership changes. Biennial inventory audit mandatory.'
  },
  {
    id: 'reg_doh_operating',
    category: 'facility_license',
    title: 'State Department of Health Operating Certificate',
    authority: 'State DOH Bureau of Facility Licensing',
    identifierNumber: 'SNF-OP-10492',
    responsibleParty: 'Facility Administrator (LNHA)',
    expirationDate: '2027-04-30',
    renewalWindowDays: 120,
    requiredDocuments: ['Annual Inspection Report', 'Life Safety Code Compliance Attestation', 'Bed Allocation Roster (120 Licensed Skilled Beds)', 'Facility Floor Plan'],
    notes: '120 total licensed beds (90 Long-Term Care, 30 Short-Stay Subacute Rehab).'
  },
  {
    id: 'reg_life_safety_fire',
    category: 'life_safety',
    title: 'Annual Fire Alarm & Central Station Inspection',
    authority: 'Local Fire Marshal / NFPA 72',
    identifierNumber: 'FA-2025-09',
    responsibleParty: 'Director of Maintenance',
    expirationDate: '2026-10-18',
    renewalWindowDays: 30,
    requiredDocuments: ['NFPA 72 Inspection Certificate', 'Smoke Detector Sensitivity Report', 'Duct Detector Test Log', 'Central Station Monitoring Agreement'],
    notes: 'Vendor: Johnson Controls / SimplexGrinnell. Must be performed within 365 days of previous inspection.'
  },
  {
    id: 'reg_life_safety_generator',
    category: 'life_safety',
    title: 'Emergency Generator 4-Hour Load Bank Test',
    authority: 'NFPA 110 / Life Safety Code',
    identifierNumber: 'GEN-200KW-CAT',
    responsibleParty: 'Director of Maintenance',
    expirationDate: '2026-11-01',
    renewalWindowDays: 30,
    requiredDocuments: ['Load Bank Test Report (100% capacity)', 'Transfer Switch Annual Inspection', 'Weekly 30-Minute Run Logs (36-Week Review)', 'Diesel Fuel Testing Certificate'],
    notes: 'Caterpillar 200kW standby generator. Weekly load runs must achieve operating temperature.'
  },
  {
    id: 'reg_med_director',
    category: 'practitioner_credentialing',
    title: 'Medical Director Credentialing (Dr. Robert Smith, MD)',
    authority: 'State Medical Board / Facility Medical Staff Office',
    identifierNumber: 'ME-4019283 / DEA: BS1928374',
    responsibleParty: 'Medical Staff Coordinator / LNHA',
    expirationDate: '2026-12-15',
    renewalWindowDays: 60,
    requiredDocuments: ['State Medical License Face Sheet', 'Federal DEA Registration', 'Malpractice Insurance ($1M/$3M Coverage Certificate)', 'OIG / SAM Exclusion Monthly Verification', 'Collaborative Practice Agreement'],
    notes: 'Medical Director Agreement re-executed annually. OIG/SAM check verified clean as of current month.'
  },
  {
    id: 'reg_lnha_admin',
    category: 'leadership_license',
    title: 'Licensed Nursing Home Administrator (LNHA)',
    authority: 'State Board of Examiners of Nursing Home Administrators',
    identifierNumber: 'LNHA-009182',
    responsibleParty: 'Facility Administrator',
    expirationDate: '2027-01-31',
    renewalWindowDays: 60,
    requiredDocuments: ['Biennial License Renewal Certificate', '40 CEU Credits Verification', 'Ethics Attestation'],
    notes: '40 continuing education units required every two years.'
  },
  {
    id: 'reg_don_rn',
    category: 'leadership_license',
    title: 'Director of Nursing RN License (Sarah Jenkins, RN)',
    authority: 'State Board of Nursing',
    identifierNumber: 'RN-5549102',
    responsibleParty: 'Director of Nursing',
    expirationDate: '2026-11-30',
    renewalWindowDays: 45,
    requiredDocuments: ['Active RN Registration Verification', 'Infection Preventionist Specialized Certification', 'CPR / BLS Healthcare Provider Card'],
    notes: 'Primary verification check printed from State BON website.'
  }
];

class OperationsAnalyticsEngine {
  constructor(core) {
    this.core = require('./executive-workspace.cjs').scopedCore(core);
  }

  get store() {
    return this.core.store;
  }

  // -------------------------------------------------------------
  // 1. Regulatory Compliance & License Renewal Sentinel
  // -------------------------------------------------------------
  listRegulatoryItems() {
    this.core.assertUnlocked();
    let items = this.store.list('ops_regulatory') || [];
    if (!items.length && this.core.executiveDemo) {
      // Seed default profiles
      DEFAULT_REGULATORY_ITEMS.forEach(item => {
        this.saveRegulatoryItem(item);
      });
      items = this.store.list('ops_regulatory') || [];
    }

    const now = Date.now();
    return items.map(item => {
      const expTime = item.expirationDate ? Date.parse(item.expirationDate) : NaN;
      const daysUntil = Number.isFinite(expTime) ? Math.ceil((expTime - now) / 86400000) : null;

      let status = 'active'; // active (>90d), upcoming (60-90d), action_required (30-60d), critical (<30d), expired (<0)
      if (daysUntil === null) status = 'unknown';
      else if (daysUntil < 0) status = 'expired';
      else if (daysUntil <= 30) status = 'critical';
      else if (daysUntil <= 60) status = 'action_required';
      else if (daysUntil <= 90) status = 'upcoming';

      return {
        ...item,
        daysUntil,
        status,
        isRenewalWindowOpen: daysUntil !== null && daysUntil <= (item.renewalWindowDays || 60)
      };
    }).sort((a, b) => a.daysUntil - b.daysUntil);
  }

  saveRegulatoryItem(data) {
    this.core.assertUnlocked();
    const id = isId(data.id) ? data.id : (data.id && typeof data.id === 'string' ? data.id : uuid());

    const previous = this.store.get('ops_regulatory', id);
    const expirationDate = data.expirationDate ?? previous?.expirationDate ?? null;
    if (expirationDate && (!/^\d{4}-\d{2}-\d{2}$/.test(expirationDate) || !Number.isFinite(Date.parse(expirationDate)) || new Date(expirationDate).toISOString().slice(0,10) !== expirationDate)) throw fail('INVALID');
    const item = {
      id,
      todoId: previous?.todoId || uuid(),
      category: ['facility_license', 'controlled_substances', 'life_safety', 'practitioner_credentialing', 'leadership_license', 'environmental'].includes(data.category) ? data.category : 'facility_license',
      title: text(data.title || 'License Item', 200),
      authority: text(data.authority || 'State Agency', 150),
      identifierNumber: text(data.identifierNumber || '', 100),
      responsibleParty: text(data.responsibleParty || '', 150),
      expirationDate,
      renewalWindowDays: Number(data.renewalWindowDays) || 60,
      requiredDocuments: Array.isArray(data.requiredDocuments) ? data.requiredDocuments.map(d => text(d, 200)) : [],
      testMenu: Array.isArray(data.testMenu) ? data.testMenu.map(t => text(t, 100)) : [],
      renewalSubmittedDate: data.renewalSubmittedDate || null,
      renewalStatus: ['not_started', 'in_progress', 'submitted', 'renewed'].includes(data.renewalStatus) ? data.renewalStatus : 'not_started',
      notes: text(data.notes || '', 2000),
      updated: Date.now()
    };

    this.store.put('ops_regulatory', id, item);

    // Canonical Action Center synchronization for renewals within window
    const expTime = item.expirationDate ? Date.parse(item.expirationDate) : NaN;
    const daysUntil = Math.ceil((expTime - Date.now()) / 86400000);
    if (daysUntil <= (item.renewalWindowDays || 60) && item.renewalStatus !== 'renewed') {
      const todoId = item.todoId;
      const canonicalTodo = {
        id: todoId,
        title: `[Renewal] ${item.title} (${daysUntil < 0 ? 'OVERDUE' : daysUntil + 'd remaining'})`,
        description: `Authority: ${item.authority}\nID: ${item.identifierNumber}\nResponsible: ${item.responsibleParty}\nExpiration Date: ${item.expirationDate}\nRequired: ${(item.requiredDocuments || []).join(', ')}`,
        owner: item.responsibleParty,
        dueAt: expTime,
        priority: daysUntil <= 14 ? 'urgent' : daysUntil <= 30 ? 'high' : 'normal',
        status: 'pending',
        source: 'manual'
      };
      if (typeof this.core.saveTodo === 'function') {
        this.core.saveTodo(canonicalTodo);
      } else {
        this.store.put('todo', canonicalTodo.id, canonicalTodo);
      }
      this.store.put('wf_action_meta', 'todo:' + canonicalTodo.id, {
        id: 'todo:' + canonicalTodo.id,
        owner: item.responsibleParty,
        dueAt: expTime,
        category: 'regulatory',
        identifier: item.identifierNumber,
        updatedAt: Date.now()
      });
      if (daysUntil <= 14 && typeof this.core.emit === 'function') {
        this.core.emit({ type: 'reminder_due', items: [{ title: item.title }] });
      }
    }

    return item;
  }

  deleteRegulatoryItem(id) {
    this.core.assertUnlocked();
    if (!isId(id) && typeof id !== 'string') throw fail('INVALID');
    this.store.delete('ops_regulatory', id);
    return { ok: true, id };
  }

  getRegulatorySummary() {
    const items = this.listRegulatoryItems();
    return {
      totalLicenses: items.length,
      expiredCount: items.filter(i => i.status === 'expired').length,
      criticalCount: items.filter(i => i.status === 'critical').length,
      actionRequiredCount: items.filter(i => i.status === 'action_required').length,
      upcomingCount: items.filter(i => i.status === 'upcoming').length,
      activeCount: items.filter(i => i.status === 'active').length,
      itemsNeedingAction: items.filter(i => ['expired', 'critical', 'action_required'].includes(i.status))
    };
  }

  // -------------------------------------------------------------
  // 2. Staffing & Overtime Analytics (OnShift + Universal Engine)
  // -------------------------------------------------------------
  parseStaffingCsv(csvText, filename = 'staffing.csv') {
    this.core.assertUnlocked();
    const rejected = error => ({ success: false, error, records: [] });
    if (typeof csvText !== 'string' || !csvText.trim()) return rejected('Paste a staffing CSV with a header and data rows.');
    if (csvText.length > 350000) return rejected('Staffing CSV exceeds the 350,000-character import limit.');
    try {
      const { headers, rows } = require('./ui/csv.mjs').parseCSV(csvText);
      if (headers.length > 200 || rows.length > 10000) return rejected('Staffing CSV exceeds the 200-column or 10,000-row import limit.');
      if (!rows.length) return rejected('File contains no staffing data rows.');
      const normalize = value => value.toLowerCase().replace(/#/g, 'number').replace(/[\s_().\/-]+/g, '');
      const normalized = headers.map(normalize);
      if (normalized.some(h => !h) || new Set(normalized).size !== headers.length)
        return rejected('Staffing CSV requires unique, nonempty column headers, ignoring case and spacing.');
      const aliases = {
        employeeName: ['employee name', 'staff name', 'worker name', 'full name', 'name', 'employee', 'staff', 'worker'],
        employeeId: ['employee id', 'employee #', 'employee number', 'emp id', 'emp #', 'emp number', 'badge', 'badge id', 'ee id', 'id'],
        role: ['role', 'position', 'job', 'job title', 'title', 'discipline'],
        unit: ['unit', 'department', 'dept', 'floor', 'wing', 'location'],
        shift: ['shift', 'shift name', 'schedule', 'scheduled shift'],
        date: ['date', 'work date', 'shift date'],
        scheduledHours: ['scheduled hours', 'sched hours', 'planned hours', 'schedule hours', 'hours scheduled'],
        actualHours: ['actual hours', 'worked hours', 'hours worked', 'total hours', 'actual worked hours', 'actual', 'worked', 'hours'],
        regularHours: ['regular hours', 'reg hours', 'straight time hours', 'regular', 'reg'],
        overtimeHours: ['overtime hours', 'ot hours', 'overtime', 'ot'],
        punchIn: ['clock in', 'clock in time', 'punch in', 'in time', 'time in', 'start time', 'in'],
        punchOut: ['clock out', 'clock out time', 'punch out', 'out time', 'time out', 'end time', 'out'],
        isAgency: ['agency', 'is agency', 'agency staff', 'agency employee'],
        hourlyRate: ['hourly rate', 'pay rate', 'rate', 'hourly pay']
      };
      const mapping = {};
      for (const [field, choices] of Object.entries(aliases)) {
        const accepted = new Set(choices.map(normalize));
        const matches = headers.filter((h, i) => accepted.has(normalized[i]));
        if (matches.length > 1) return rejected('Multiple columns map to ' + field + '. Keep one reviewed source column for each field.');
        mapping[field] = matches[0] ?? null;
      }
      if (!mapping.employeeName || !mapping.actualHours)
        return rejected('Staffing CSV requires an employee name column and an actual/worked hours column.');
      const optional = (row, field) => mapping[field] ? text(row[mapping[field]].trim(), 1000) || null : null;
      const numeric = (row, field, rowNumber) => {
        const value = optional(row, field);
        if (value === null) return null;
        if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(Number(value)))
          throw Error('Row ' + rowNumber + ': ' + field + ' must be a finite, nonnegative decimal number.');
        return Number(value);
      };
      const records = rows.map((row, i) => {
        const rowNumber = i + 2, employeeName = optional(row, 'employeeName');
        if (!employeeName) throw Error('Row ' + rowNumber + ': employee name is required.');
        if (/^(?:grand total|subtotal|total|summary)$/i.test(employeeName))
          throw Error('Row ' + rowNumber + ': remove aggregate total/summary rows before importing employee records.');
        const actualHours = numeric(row, 'actualHours', rowNumber);
        if (actualHours === null) throw Error('Row ' + rowNumber + ': actual/worked hours are required.');
        const regularHours = numeric(row, 'regularHours', rowNumber);
        const overtimeHours = numeric(row, 'overtimeHours', rowNumber);
        if ((regularHours !== null && regularHours > actualHours + 1e-8) ||
            (overtimeHours !== null && overtimeHours > actualHours + 1e-8) ||
            (regularHours !== null && overtimeHours !== null && Math.abs(regularHours + overtimeHours - actualHours) > 1e-8))
          throw Error('Row ' + rowNumber + ': regular and overtime hours must agree with actual/worked hours.');
        const agency = optional(row, 'isAgency');
        const isAgency = agency === null ? null : /^(?:true|yes|1|agency)$/i.test(agency) ? true :
          /^(?:false|no|0|core|employee)$/i.test(agency) ? false : null;
        return {
          id: uuid(), employeeId: optional(row, 'employeeId'), employeeName,
          role: optional(row, 'role')?.toUpperCase() ?? null, unit: optional(row, 'unit'),
          shift: optional(row, 'shift'), date: optional(row, 'date'),
          scheduledHours: numeric(row, 'scheduledHours', rowNumber), actualHours, regularHours, overtimeHours,
          punchIn: optional(row, 'punchIn'), punchOut: optional(row, 'punchOut'),
          isAgency, agencySource: agency, hourlyRate: numeric(row, 'hourlyRate', rowNumber)
        };
      });
      return { success: true, filename: text(filename || 'staffing.csv', 255),
        detectedFormat: normalized.some(h => h.includes('onshift') || h === 'punchin' || h === 'punchout') ?
          'OnShift-compatible Staffing CSV' : 'Universal Staffing CSV', totalRows: records.length, records };
    } catch (error) {
      // Only fixed parser/validation messages reach the UI; never echo source cells.
      const message = error?.message || '';
      return rejected(/^(?:CSV has |CSV requires |Row \d+(?: has |: ))/.test(message) ? message : 'Staffing CSV could not be validated. Review the headers and numeric fields.');
    }
  }

  analyzeStaffingRecords(records) {
    this.core.assertUnlocked();
    if (records == null || Array.isArray(records) && !records.length)
      records = this.core.executiveDemo ? this.getSampleStaffingRecords() : [];
    if (!Array.isArray(records) || records.length > 10000) throw fail('INVALID');
    const numericFields = ['actualHours', 'scheduledHours', 'regularHours', 'overtimeHours', 'hourlyRate'];
    records = records.map(source => {
      if (!source || typeof source !== 'object' || Array.isArray(source)) throw fail('INVALID');
      const row = { ...source };
      for (const field of numericFields) {
        row[field] = source[field] ?? null;
        if (row[field] !== null && (typeof row[field] !== 'number' || !Number.isFinite(row[field]) || row[field] < 0))
          throw fail('INVALID');
      }
      for (const field of ['employeeName', 'employeeId', 'role', 'unit', 'shift', 'date', 'punchIn', 'punchOut']) {
        row[field] = source[field] == null || source[field] === '' ? null : text(source[field], 1000);
      }
      if (row.role) row.role = row.role.toUpperCase();
      row.isAgency = typeof source.isAgency === 'boolean' ? source.isAgency : null;
      if (row.actualHours !== null && ((row.regularHours !== null && row.regularHours > row.actualHours + 1e-8) ||
          (row.overtimeHours !== null && row.overtimeHours > row.actualHours + 1e-8) ||
          (row.regularHours !== null && row.overtimeHours !== null && Math.abs(row.regularHours + row.overtimeHours - row.actualHours) > 1e-8)))
        throw fail('INVALID');
      return row;
    });
    const round = (value, places = 1) => {
      if (value === null) return null;
      if (!Number.isFinite(value)) throw fail('INVALID');
      return Number(value.toFixed(places));
    };
    const sum = (rows, field) => {
      const value = rows.reduce((total, row) => total + row[field], 0);
      if (!Number.isFinite(value)) throw fail('INVALID');
      return value;
    };
    const completeSum = (rows, field) => rows.length && rows.every(row => row[field] !== null) ? sum(rows, field) : null;
    const knownSum = (rows, field) => { const known = rows.filter(row => row[field] !== null); return known.length ? sum(known, field) : null; };
    const actual = completeSum(records, 'actualHours'), overtime = completeSum(records, 'overtimeHours');
    const agencyKnown = records.length > 0 && records.every(row => row.isAgency !== null);
    const agencyRows = records.filter(row => row.isAgency === true);
    const agencyHours = agencyKnown && actual !== null ? sum(agencyRows, 'actualHours') : null;
    const knownAgencyHours = agencyRows.length ? knownSum(agencyRows, 'actualHours') : agencyKnown ? 0 : null;
    const dateKnown = row => /^\d{4}-\d{2}-\d{2}$/.test(row.date || '') && Number.isFinite(Date.parse(row.date)) &&
      new Date(row.date).toISOString().slice(0, 10) === row.date;
    const dates = [...new Set(records.filter(dateKnown).map(row => row.date))].sort();
    const coverage = {
      totalRows: records.length, actualHoursRows: records.filter(r => r.actualHours !== null).length,
      overtimeHoursRows: records.filter(r => r.overtimeHours !== null).length,
      agencyRows: records.filter(r => r.isAgency !== null).length,
      scheduledHoursRows: records.filter(r => r.scheduledHours !== null && r.actualHours !== null).length,
      hourlyRateRows: records.filter(r => r.hourlyRate !== null).length,
      datedRows: records.filter(dateKnown).length, weeklyPeriodConfirmed: false, completeShiftCoverageConfirmed: false
    };
    const clusters = field => {
      const groups = new Map();
      for (const row of records) {
        const key = row[field] ?? 'Unknown';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      }
      return Object.fromEntries([...groups].map(([key, rows]) => [key, round(completeSum(rows, 'overtimeHours'))]));
    };
    const excessHours = rows => {
      if (!rows.length) return records.length ? 0 : null;
      if (rows.some(r => r.isAgency === null || (r.isAgency ? r.actualHours : r.overtimeHours) === null)) return null;
      // Agency overtime is already part of agency worked hours; do not count it twice.
      const value = rows.reduce((n, r) => n + (r.isAgency ? r.actualHours : r.overtimeHours), 0);
      if (!Number.isFinite(value)) throw fail('INVALID');
      return value;
    };
    const totalExcess = excessHours(records);
    const roleFte = role => {
      if (records.some(r => r.role === null)) return null;
      const hours = excessHours(records.filter(r => r.role === role));
      return hours === null ? null : round(hours / 40);
    };
    const varianceRows = records.filter(r => r.actualHours !== null && r.scheduledHours !== null);
    const flaggedOccurrences = varianceRows.filter(r => r.actualHours - r.scheduledHours > 0.25).map(r => {
      const delta = r.actualHours - r.scheduledHours, minutes = round(delta * 60, 0);
      return { employeeName: r.employeeName, role: r.role, date: r.date, shift: r.shift,
        leakMinutes: minutes, estimatedCost: r.hourlyRate === null ? null : round(delta * r.hourlyRate, 2),
        reasons: 'Actual hours exceed scheduled hours by ' + minutes + ' minutes; review the source and approval. This does not establish unapproved pay.' };
    });
    const varianceComplete = records.length > 0 && varianceRows.length === records.length;
    const varianceCostKnown = varianceComplete && flaggedOccurrences.every(r => r.estimatedCost !== null);
    const agencySpendKnown = agencyKnown && agencyRows.every(r => r.actualHours !== null && r.hourlyRate !== null);
    const agencySpend = agencySpendKnown ? agencyRows.reduce((n, r) => n + r.actualHours * r.hourlyRate, 0) : null;
    if (agencySpend !== null && !Number.isFinite(agencySpend)) throw fail('INVALID');
    return {
      hasData: records.length > 0, demo: !!this.core.executiveDemo, coverage,
      periodSummary: {
        periodLabel: 'Imported period (workweek and complete coverage unconfirmed)',
        totalHoursWorked: round(actual), knownHoursWorked: round(knownSum(records, 'actualHours')),
        totalOvertimeHours: round(overtime), knownOvertimeHours: round(knownSum(records, 'overtimeHours')),
        overtimePercentage: actual !== null && actual > 0 && overtime !== null ? round(overtime / actual * 100) : null,
        totalAgencyHours: round(agencyHours), knownAgencyHours: round(knownAgencyHours),
        totalAgencyShifts: agencyKnown ? agencyRows.length : null,
        estimatedTotalOTSpend: null, estimatedTotalAgencySpend: round(agencySpend, 2)
      },
      approachingOTRadar: [], approachingOTAvailable: false,
      approachingOTNotice: 'Weekly overtime risk is unavailable: a reviewed workweek, complete hours and upcoming shifts are not confirmed.',
      incidentalPunchAudit: {
        totalLeakMinutes: varianceComplete ? flaggedOccurrences.reduce((n, r) => n + r.leakMinutes, 0) : null,
        estimatedLeakCost: varianceCostKnown ? round(flaggedOccurrences.reduce((n, r) => n + r.estimatedCost, 0), 2) : null,
        comparisonRows: varianceRows.length, coverageComplete: varianceComplete, flaggedOccurrences,
        notice: 'Schedule variance is a review flag. Punch times alone do not establish early arrival, unapproved overtime or payroll loss. Cost uses only an imported hourly rate.'
      },
      clustersByRole: clusters('role'), clustersByShift: clusters('shift'),
      assumptions: {
        formula: 'Imported-period core overtime plus agency worked hours / 40.0 hours = Net FTE Deficit planning equivalents',
        standardFteHours: 40.0, sourceCoverage: records.length + ' imported records; ' + coverage.datedRows + ' have valid source dates.',
        datesCovered: dates, weeklyPeriodConfirmed: false,
        notice: 'Staffing planning estimate in 40-hour equivalents for the imported period. Workweek and complete shift coverage are unconfirmed. Not an automated hiring directive or employee disciplinary evaluation. Monthly savings and overtime pay require a reviewed period, compensation rules and replacement costs.'
      },
      fteHiringGaps: {
        totalFteDeficit: totalExcess === null ? null : round(totalExcess / 40),
        cnaFteDeficit: roleFte('CNA'), lpnFteDeficit: roleFte('LPN'), rnFteDeficit: roleFte('RN'),
        projectedMonthlySavings: null,
        recommendation: totalExcess === null ? 'Staffing planning equivalents are unavailable because overtime or agency coverage is incomplete. Monthly savings are unknown.' :
          round(totalExcess) + ' imported-period core overtime and agency hours equal ' + round(totalExcess / 40) + ' units of 40 hours. Review source coverage, the workweek and staffing needs before hiring decisions. Monthly savings are unknown.'
      }
    };
  }

  // Smart Shift Replacement Matcher
  findReplacementMatches(openShift, roster = []) {
    const role = (openShift.role || 'CNA').toUpperCase();
    const shiftHours = Number(openShift.hours) || 8.0;

    // Use sample roster if none provided
    const pool = roster.length ? roster : this.core.executiveDemo ? this.getSampleRoster() : [];

    // Filter to matching role
    const candidates = pool.filter(c => c.role.toUpperCase() === role);

    const scored = candidates.map(c => {
      const currentHours = c.currentHours || 0;
      const hoursAfterShift = currentHours + shiftHours;
      const willIncurOT = hoursAfterShift > 40.0;
      const otHours = willIncurOT ? Math.max(0, hoursAfterShift - Math.max(40.0, currentHours)) : 0;
      const regularHoursAdded = shiftHours - otHours;

      // Tier 1: PRN or Part-Time with 0 Overtime
      // Tier 2: Core Staff with minor OT
      // Tier 3: Core Staff with full OT
      // Tier 4: Agency
      let tier = 1;
      let costEstimate = 0;
      let recommendation = '';

      if (c.isAgency) {
        tier = 4;
        costEstimate = shiftHours * 54.0;
        recommendation = 'Agency coverage (highest cost: $54/hr)';
      } else if (!willIncurOT) {
        tier = 1;
        costEstimate = shiftHours * (c.hourlyRate || 24.0);
        recommendation = `Optimal: PRN/Part-Time at straight time ($${c.hourlyRate || 24}/hr), 0 overtime hours incurred.`;
      } else if (otHours <= 4) {
        tier = 2;
        costEstimate = (regularHoursAdded * (c.hourlyRate || 24.0)) + (otHours * (c.hourlyRate || 24.0) * 1.5);
        recommendation = `Acceptable: Core staff incurring ${Math.round(otHours * 10) / 10} hours of overtime.`;
      } else {
        tier = 3;
        costEstimate = shiftHours * (c.hourlyRate || 24.0) * 1.5;
        recommendation = `Heavy Overtime: Full 8 hours will be paid at 1.5x time-and-a-half ($${Math.round((c.hourlyRate || 24.0) * 1.5)}/hr).`;
      }

      return {
        ...c,
        currentHours,
        hoursAfterShift,
        willIncurOT,
        otHoursAdded: Math.round(otHours * 10) / 10,
        estimatedShiftCost: Math.round(costEstimate),
        tier,
        recommendation
      };
    });

    return scored.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      return a.estimatedShiftCost - b.estimatedShiftCost;
    });
  }

  getSampleStaffingRecords() {
    return [
      { id: '1', employeeId: 'CNA-101', employeeName: 'Tanya Rogers', role: 'CNA', unit: 'West Wing', shift: '3-11 Evening', scheduledHours: 8, actualHours: 8.4, regularHours: 8, overtimeHours: 0.4, punchIn: '14:48', punchOut: '23:24', isAgency: false, hourlyRate: 24.0, date: '2026-09-28' },
      { id: '2', employeeId: 'CNA-102', employeeName: 'Brittany Davis', role: 'CNA', unit: 'West Wing', shift: '3-11 Evening', scheduledHours: 8, actualHours: 8.0, regularHours: 8, overtimeHours: 0, punchIn: '14:58', punchOut: '23:05', isAgency: false, hourlyRate: 23.5, date: '2026-09-28' },
      { id: '3', employeeId: 'CNA-103', employeeName: 'Marcus Wright', role: 'CNA', unit: 'North Wing', shift: '7-3 Day', scheduledHours: 8, actualHours: 8.6, regularHours: 8, overtimeHours: 0.6, punchIn: '06:45', punchOut: '15:20', isAgency: false, hourlyRate: 25.0, date: '2026-09-28' },
      { id: '4', employeeId: 'CNA-AG1', employeeName: 'ShiftKey Agency Aide 1', role: 'CNA', unit: 'West Wing', shift: '11-7 Night', scheduledHours: 8, actualHours: 8.0, regularHours: 8, overtimeHours: 0, punchIn: '22:55', punchOut: '07:05', isAgency: true, hourlyRate: 54.0, date: '2026-09-28' },
      { id: '5', employeeId: 'LPN-201', employeeName: 'Elena Rostova', role: 'LPN', unit: 'Subacute Rehab', shift: '7-3 Day', scheduledHours: 8, actualHours: 8.8, regularHours: 8, overtimeHours: 0.8, punchIn: '06:48', punchOut: '15:35', isAgency: false, hourlyRate: 36.0, date: '2026-09-28' },
      { id: '6', employeeId: 'CNA-104', employeeName: 'David Chen', role: 'CNA', unit: 'Subacute Rehab', shift: '7-3 Day', scheduledHours: 8, actualHours: 8.0, regularHours: 8, overtimeHours: 0, punchIn: '06:55', punchOut: '15:02', isAgency: false, hourlyRate: 24.5, date: '2026-09-28' },
      { id: '7', employeeId: 'CNA-105', employeeName: 'Kendra Washington', role: 'CNA', unit: 'West Wing', shift: '3-11 Evening', scheduledHours: 8, actualHours: 12.0, regularHours: 8, overtimeHours: 4.0, punchIn: '14:50', punchOut: '03:10', isAgency: false, hourlyRate: 24.0, date: '2026-09-28' }
    ];
  }

  getSampleRoster() {
    return [
      { id: 'c1', name: 'Angela Brooks', role: 'CNA', status: 'PRN', currentHours: 16.0, hourlyRate: 24.0, isAgency: false, phone: '555-0192', reliableScore: 95 },
      { id: 'c2', name: 'Derrick Vance', role: 'CNA', status: 'Part-Time', currentHours: 24.0, hourlyRate: 23.5, isAgency: false, phone: '555-0144', reliableScore: 88 },
      { id: 'c3', name: 'Tanya Rogers', role: 'CNA', status: 'Full-Time', currentHours: 34.5, hourlyRate: 24.0, isAgency: false, phone: '555-0188', reliableScore: 92 },
      { id: 'c4', name: 'Marcus Wright', role: 'CNA', status: 'Full-Time', currentHours: 39.0, hourlyRate: 25.0, isAgency: false, phone: '555-0133', reliableScore: 96 },
      { id: 'c5', name: 'ShiftKey / IntelyCare Pool', role: 'CNA', status: 'Agency', currentHours: 0, hourlyRate: 54.0, isAgency: true, phone: 'Agency Dispatch', reliableScore: 75 }
    ];
  }
}

function dispatch(core, op, data) {
  const engine = new OperationsAnalyticsEngine(core);
  switch (op) {
    // Regulatory Sentinel
    case 'regulatoryList': return engine.listRegulatoryItems();
    case 'regulatorySave': return engine.saveRegulatoryItem(data || {});
    case 'regulatoryDelete': return engine.deleteRegulatoryItem(data?.id);
    case 'regulatorySummary': return engine.getRegulatorySummary();

    // Staffing & Overtime Analytics
    case 'staffingParseCsv': return engine.parseStaffingCsv(data?.csvText, data?.filename);
    case 'staffingAnalyze': return engine.analyzeStaffingRecords(data?.records);
    case 'staffingReplacementMatch': return engine.findReplacementMatches(data?.openShift || {}, data?.roster);

    default:
      throw fail('INVALID');
  }
}

module.exports = {
  OperationsAnalyticsEngine,
  DEFAULT_REGULATORY_ITEMS,
  dispatch
};
