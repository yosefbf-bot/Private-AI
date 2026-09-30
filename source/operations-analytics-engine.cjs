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
    if (!csvText || typeof csvText !== 'string') throw fail('INVALID');

    const lines = csvText.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return { success: false, error: 'File is empty or contains no data rows.' };

    const headerLine = lines[0];
    const headers = headerLine.split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());

    // Detect format: OnShift vs Universal
    const isOnShift = headers.some(h => h.includes('onshift') || h.includes('punch') || h.includes('variance') || h.includes('sched vs actual'));

    // Map headers
    const findIdx = (patterns) => headers.findIndex(h => patterns.some(p => h.includes(p)));

    const nameIdx = findIdx(['employee', 'name', 'staff', 'worker']);
    const empIdIdx = findIdx(['id', 'emp #', 'badge', 'ee id']);
    const roleIdx = findIdx(['role', 'position', 'job', 'title', 'discipline']);
    const unitIdx = findIdx(['unit', 'department', 'floor', 'wing', 'location']);
    const shiftIdx = findIdx(['shift', 'schedule', 'shift name']);
    const dateIdx = findIdx(['date', 'work date', 'shift date']);
    const schedHoursIdx = findIdx(['sched', 'scheduled', 'planned']);
    const actualHoursIdx = findIdx(['actual', 'worked', 'total hours', 'paid']);
    const regHoursIdx = findIdx(['reg', 'regular']);
    const otHoursIdx = findIdx(['ot', 'overtime', 'premium']);
    const punchInIdx = findIdx(['in', 'clock in', 'punch in', 'start']);
    const punchOutIdx = findIdx(['out', 'clock out', 'punch out', 'end']);
    const agencyIdx = findIdx(['agency', 'contract', 'vendor', 'pool']);
    const payRateIdx = findIdx(['rate', 'pay rate', 'hourly']);

    const records = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Basic CSV field parser handling quotes
      const values = [];
      let inQuote = false;
      let cur = '';
      for (let c = 0; c < line.length; c++) {
        const char = line[c];
        if (char === '"' || char === "'") inQuote = !inQuote;
        else if (char === ',' && !inQuote) {
          values.push(cur.trim().replace(/^["']|["']$/g, ''));
          cur = '';
        } else {
          cur += char;
        }
      }
      values.push(cur.trim().replace(/^["']|["']$/g, ''));

      const name = nameIdx >= 0 ? values[nameIdx] : `Staff Member ${i}`;
      if (!name || name.toLowerCase().includes('total') || name.toLowerCase().includes('summary')) continue;

      const sched = schedHoursIdx >= 0 ? parseFloat(values[schedHoursIdx]) || 0 : 8.0;
      const actual = actualHoursIdx >= 0 ? parseFloat(values[actualHoursIdx]) || 0 : sched;
      let reg = regHoursIdx >= 0 ? parseFloat(values[regHoursIdx]) || 0 : Math.min(actual, 8.0);
      let ot = otHoursIdx >= 0 ? parseFloat(values[otHoursIdx]) || 0 : Math.max(0, actual - 8.0);

      // In case actual is provided without breakdown
      if (otHoursIdx < 0 && actual > sched && (actual - sched) > 0.1) {
        ot = actual - sched;
      }

      const role = roleIdx >= 0 && values[roleIdx] ? values[roleIdx] : 'CNA';
      const isAgency = agencyIdx >= 0 ? /true|yes|1|agency/i.test(values[agencyIdx]) : /agency|contract|reliance|intely|shiftkey/i.test(name + ' ' + (values[unitIdx] || ''));

      records.push({
        id: uuid(),
        employeeId: empIdIdx >= 0 ? values[empIdIdx] : `EMP-${1000 + i}`,
        employeeName: name,
        role: role.toUpperCase(),
        unit: unitIdx >= 0 && values[unitIdx] ? values[unitIdx] : 'West Wing',
        shift: shiftIdx >= 0 && values[shiftIdx] ? values[shiftIdx] : '3-11 Evening',
        date: dateIdx >= 0 && values[dateIdx] ? values[dateIdx] : new Date().toISOString().slice(0, 10),
        scheduledHours: sched,
        actualHours: actual,
        regularHours: reg,
        overtimeHours: ot,
        punchIn: punchInIdx >= 0 ? values[punchInIdx] : null,
        punchOut: punchOutIdx >= 0 ? values[punchOutIdx] : null,
        isAgency,
        hourlyRate: payRateIdx >= 0 ? parseFloat(values[payRateIdx]) || (isAgency ? 52.0 : 26.0) : (isAgency ? 52.0 : 26.0)
      });
    }

    return {
      success: true,
      filename,
      detectedFormat: isOnShift ? 'OnShift (Direct Mapping)' : 'Universal Staffing CSV',
      totalRows: records.length,
      records
    };
  }

  // Pre-Shift "Approaching OT" Warning Radar & Incidental Punch Audit
  analyzeStaffingRecords(records) {
    if (!Array.isArray(records) || !records.length) {
      records = this.core.executiveDemo ? this.getSampleStaffingRecords() : [];
    }

    const totalActual = records.reduce((s, r) => s + r.actualHours, 0);
    const totalOT = records.reduce((s, r) => s + r.overtimeHours, 0);
    const totalAgencyHours = records.filter(r => r.isAgency).reduce((s, r) => s + r.actualHours, 0);

    // 1. Pre-Shift "Approaching Overtime" Radar
    // Aggregate weekly hours by employee to flag staff at 32-36 hours who are scheduled for upcoming shifts
    const employeeHours = new Map();
    records.forEach(r => {
      const name = r.employeeName;
      if (!employeeHours.has(name)) {
        employeeHours.set(name, {
          name,
          role: r.role,
          unit: r.unit,
          totalHours: 0,
          scheduledUpcoming: 0,
          isAgency: r.isAgency
        });
      }
      employeeHours.get(name).totalHours += r.actualHours;
    });

    const approachingOT = [];
    for (const [name, emp] of employeeHours.entries()) {
      if (emp.isAgency) continue;
      // If employee has 30 to 39.5 hours, they are at risk of crossing into OT on next shift
      if (emp.totalHours >= 32.0 && emp.totalHours < 40.0) {
        approachingOT.push({
          employeeName: name,
          role: emp.role,
          unit: emp.unit,
          currentHours: Math.round(emp.totalHours * 10) / 10,
          hoursUntilOT: Math.round((40.0 - emp.totalHours) * 10) / 10,
          projectedOTRisk: 'High (Next 8hr shift will incur ' + (Math.round((emp.totalHours + 8 - 40) * 10) / 10) + ' hrs OT)'
        });
      } else if (emp.totalHours >= 40.0) {
        approachingOT.push({
          employeeName: name,
          role: emp.role,
          unit: emp.unit,
          currentHours: Math.round(emp.totalHours * 10) / 10,
          hoursUntilOT: 0,
          projectedOTRisk: 'Already in OT (' + Math.round((emp.totalHours - 40) * 10) / 10 + ' hrs over 40)'
        });
      }
    }

    // 2. Incidental Punch Leakage Audit (Early punches, late clock-outs, missing meal deductions)
    const incidentalPunchLeakage = [];
    records.forEach(r => {
      if (r.isAgency) return;
      let leakMinutes = 0;
      let reason = [];

      // Check punch in: if scheduled at :00 and punched in earlier than :53 (more than 7 mins)
      if (r.punchIn) {
        const match = r.punchIn.match(/(\d+):(\d+)/);
        if (match) {
          const min = parseInt(match[2], 10);
          if (min > 30 && min < 53) {
            leakMinutes += (60 - min);
            reason.push(`Early punch-in (${r.punchIn})`);
          }
        }
      }

      // Check shift variance: actual > scheduled by 15-45 mins (unapproved creeping OT)
      const varianceHours = r.actualHours - r.scheduledHours;
      if (varianceHours > 0.25 && varianceHours < 1.0) {
        leakMinutes += Math.round(varianceHours * 60);
        reason.push(`Creeping late clock-out (+${Math.round(varianceHours * 60)}m)`);
      }

      if (leakMinutes > 15) {
        incidentalPunchLeakage.push({
          employeeName: r.employeeName,
          role: r.role,
          date: r.date,
          shift: r.shift,
          leakMinutes,
          estimatedCost: Math.round((leakMinutes / 60) * (r.hourlyRate * 1.5) * 100) / 100,
          reasons: reason.join('; ')
        });
      }
    });

    // 3. Overtime Clusters by Role and Shift
    const clustersByRole = {};
    const clustersByShift = {};
    records.forEach(r => {
      clustersByRole[r.role] = (clustersByRole[r.role] || 0) + r.overtimeHours;
      clustersByShift[r.shift] = (clustersByShift[r.shift] || 0) + r.overtimeHours;
    });

    // 4. Net FTE Deficit & Hiring Gap Calculator
    // In a 2-week period (80 hours = 1 FTE). Here assuming a 1-week or 2-week sample:
    const weeklyOTHours = totalOT;
    const weeklyAgencyHours = totalAgencyHours;
    const totalWeeklyExcessHours = weeklyOTHours + weeklyAgencyHours;

    // Standard Full-Time is 37.5 - 40 hours/week
    const fteGapTotal = Math.round((totalWeeklyExcessHours / 37.5) * 10) / 10;
    const cnaExcessHours = (clustersByRole['CNA'] || 0) + records.filter(r => r.isAgency && r.role === 'CNA').reduce((s, r) => s + r.actualHours, 0);
    const cnaFteDeficit = Math.round((cnaExcessHours / 37.5) * 10) / 10;

    const lpnExcessHours = (clustersByRole['LPN'] || 0) + records.filter(r => r.isAgency && r.role === 'LPN').reduce((s, r) => s + r.actualHours, 0);
    const lpnFteDeficit = Math.round((lpnExcessHours / 37.5) * 10) / 10;

    const rnExcessHours = (clustersByRole['RN'] || 0) + records.filter(r => r.isAgency && r.role === 'RN').reduce((s, r) => s + r.actualHours, 0);
    const rnFteDeficit = Math.round((rnExcessHours / 37.5) * 10) / 10;

    // Projected Monthly Savings from hiring Core FTEs vs paying Agency/OT
    // Average Agency CNA: $52/hr vs Core CNA: $24/hr (savings: $28/hr)
    // Average Core OT: $36/hr vs Core Regular: $24/hr (savings: $12/hr)
    const monthlyAgencySpend = weeklyAgencyHours * 52 * 4.33;
    const monthlyAgencyReplacedWithCoreSpend = weeklyAgencyHours * 24 * 4.33;
    const monthlyNetSavingsFromHiring = Math.round((monthlyAgencySpend - monthlyAgencyReplacedWithCoreSpend) + (weeklyOTHours * 12 * 4.33));

    return {
      hasData: records.length > 0,
      demo: !!this.core.executiveDemo,
      periodSummary: {
        totalHoursWorked: Math.round(totalActual * 10) / 10,
        totalOvertimeHours: Math.round(totalOT * 10) / 10,
        overtimePercentage: totalActual ? Math.round((totalOT / totalActual) * 1000) / 10 : 0,
        totalAgencyHours: Math.round(totalAgencyHours * 10) / 10,
        totalAgencyShifts: records.filter(r => r.isAgency).length,
        estimatedTotalOTSpend: Math.round(totalOT * 38.0),
        estimatedTotalAgencySpend: Math.round(totalAgencyHours * 52.0)
      },
      approachingOTRadar: approachingOT.sort((a, b) => b.currentHours - a.currentHours),
      incidentalPunchAudit: {
        totalLeakMinutes: incidentalPunchLeakage.reduce((s, l) => s + l.leakMinutes, 0),
        estimatedLeakCost: Math.round(incidentalPunchLeakage.reduce((s, l) => s + l.estimatedCost, 0)),
        flaggedOccurrences: incidentalPunchLeakage
      },
      clustersByRole,
      clustersByShift,
      assumptions: {
        formula: "Weekly Excess Hours / 40.0 hours per standard FTE = Net FTE Deficit",
        standardFteHours: 40.0,
        sourceCoverage: `${records.length} shifts analyzed across ${new Set(records.map(r => r.date)).size} dates`,
        datesCovered: [...new Set(records.map(r => r.date))].sort(),
        notice: "Staffing planning estimate based on imported schedule; assumes 40h standard threshold and complete shift coverage. Not an automated hiring directive or employee disciplinary evaluation."
      },
      fteHiringGaps: {
        totalFteDeficit: fteGapTotal,
        cnaFteDeficit,
        lpnFteDeficit,
        rnFteDeficit,
        projectedMonthlySavings: monthlyNetSavingsFromHiring,
        recommendation: `Hiring ${cnaFteDeficit} Full-Time CNAs and ${lpnFteDeficit} LPNs will eliminate ~${Math.round(totalWeeklyExcessHours)} weekly overtime & agency hours, generating an estimated $${monthlyNetSavingsFromHiring.toLocaleString()}/month in direct bottom-line savings.`
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
