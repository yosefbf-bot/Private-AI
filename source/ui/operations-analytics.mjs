// Operations Analytics & Regulatory Compliance UI Module
// OnShift + Universal Staffing & Overtime Analytics, Approaching OT Warning Radar,
// Incidental Punch Leakage Audit, Smart Shift Replacement Matcher, FTE Deficit Calculator,
// Regulatory Compliance & License Renewal Sentinel (CLIA, BNE/Narcotics, Life Safety),
// Vendor Contract "Gotcha" Scanner, and 14-Day Conflict Radar.

export function createOperationsAnalyticsUI({ api, esc, toast, refresh, renderPage, getState = () => null }) {
  let activeSubTab = 'staffing'; // 'staffing' | 'replacement_matcher' | 'regulatory' | 'contract_scanner' | 'conflict_radar'

  // Data State
  let regulatoryItems = [];
  let regulatorySummary = null;
  let staffingAnalysis = null;
  let replacementMatches = null;
  let conflictRadar = [];

  // Modals & Forms
  let showCsvImportModal = false;
  let showLicenseModal = false;
  let csvInputText = '';
  let selectedShiftRole = 'CNA';
  let selectedShiftHours = 8.0;
  let contractText = '';
  let contractScanResult = null;
  const numberLabel = (value, suffix = '') => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() + suffix : 'Unknown';
  const moneyLabel = value => typeof value === 'number' && Number.isFinite(value) ? '$' + value.toLocaleString() : 'Unavailable';

  function formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
    if (Number.isNaN(d.getTime())) return String(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  let workspaceDemo=false;
  async function loadAllData() {
    try {
      workspaceDemo=!!(await api('snfDashboard')).demo;
      const [regItems, regSum, staffAnalysis, conflicts] = await Promise.all([
        api('regulatoryList'),
        api('regulatorySummary'),
        api('staffingAnalyze', {}),
        api('assistantConflictRadar', { daysAhead: 14 })
      ]);

      regulatoryItems = regItems || [];
      regulatorySummary = regSum;
      staffingAnalysis = staffAnalysis;
      conflictRadar = conflicts || [];

      // Run default replacement matches
      replacementMatches = await api('staffingReplacementMatch', {
        openShift: { role: selectedShiftRole, hours: selectedShiftHours }
      });
    } catch (e) {
      console.error('Failed to load Operations Analytics data:', e);
      toast('Failed to load operations analytics data', 'error');
    }
  }

  return {
    async render(container, options = {}) {
      if (options.subTab) activeSubTab = options.subTab;

      container.innerHTML = `
        <div class="ops-page">
          <div class="ops-loading">Loading Operations Analytics &amp; Regulatory Sentinel...</div>
        </div>
      `;

      await loadAllData();
      renderMain(container);
    }
  };

  function renderMain(container) {
    const regCritical = regulatoryItems.filter(i => ['expired', 'critical', 'action_required'].includes(i.status)).length;
    const approachingOTCount = staffingAnalysis?.approachingOTAvailable ? staffingAnalysis.approachingOTRadar?.length ?? null : null;
    const fteGap = staffingAnalysis?.fteHiringGaps?.totalFteDeficit ?? null;
    const monthlySavings = staffingAnalysis?.fteHiringGaps?.projectedMonthlySavings ?? null;

    container.innerHTML = `
      <div class="ops-page ops-analytics-page">
        <p class="error-note">${workspaceDemo ? 'DEMO DATA — NOT FOR CLINICAL USE' : 'Production — saved/imported records only; verify completeness and dates.'}</p>
        <!-- Top Operations Analytics Header -->
        <header class="exec-header">
          <div class="exec-header-main">
            <div class="exec-badge" style="background: #047857;">OPERATIONS ANALYTICS &amp; COMPLIANCE</div>
            <h1 class="exec-title">Staffing, Overtime Reduction &amp; Regulatory Sentinel</h1>
            <p class="exec-subtitle">OnShift-tailored staffing optimization, pre-shift overtime prevention, incidental punch audit, and mandatory license renewal tracking.</p>
          </div>
          <div class="exec-header-actions">
            <button class="ops-btn ops-btn-secondary" id="btn-open-contract-scanner">
              <span class="ops-icon">📄</span> Contract "Gotcha" Scanner
            </button>
            <button class="ops-btn ops-btn-primary" id="btn-import-onshift-csv">
              <span class="ops-icon">📥</span> Ingest OnShift / Staffing CSV
            </button>
          </div>
        </header>

        <!-- Command Strip -->
        <div class="ops-command-strip">
          <div class="ops-command-card ${approachingOTCount > 0 ? 'card-attention' : ''}">
            <div class="ops-card-badge">APPROACHING OVERTIME</div>
            <div class="ops-card-metric">${numberLabel(approachingOTCount)} Staff</div>
            <div class="ops-card-sub">Requires reviewed workweek and upcoming shifts</div>
          </div>
          <div class="ops-command-card ${fteGap > 0 ? 'card-followup' : ''}">
            <div class="ops-card-badge">40-HOUR PLANNING EQUIVALENTS</div>
            <div class="ops-card-metric">${numberLabel(fteGap)} Units</div>
            <div class="ops-card-sub">Imported period; weekly hiring need unconfirmed</div>
          </div>
          <div class="ops-command-card card-commitments">
            <div class="ops-card-badge">PROJECTED MONTHLY SAVINGS</div>
            <div class="ops-card-metric" style="color: #10b981;">${moneyLabel(monthlySavings)}</div>
            <div class="ops-card-sub">Requires reviewed period, pay rules and replacement costs</div>
          </div>
          <div class="ops-command-card ${regCritical > 0 ? 'card-attention' : ''}">
            <div class="ops-card-badge">REGULATORY ACTIONS DUE</div>
            <div class="ops-card-metric" style="color: ${regCritical > 0 ? '#ef4444' : '#10b981'};">${regCritical} Licenses</div>
            <div class="ops-card-sub">CLIA, BNE Narcotics, DOH, Life Safety</div>
          </div>
        </div>

        <!-- Sub-Navigation Tabs -->
        <nav class="ops-tabs">
          <button class="ops-tab-btn ${activeSubTab === 'staffing' ? 'active' : ''}" data-subtab="staffing">
            ⏱️ OnShift Overtime &amp; Punch Audit
          </button>
          <button class="ops-tab-btn ${activeSubTab === 'replacement_matcher' ? 'active' : ''}" data-subtab="replacement_matcher">
            🔄 Smart Shift Replacement Matcher
          </button>
          <button class="ops-tab-btn ${activeSubTab === 'regulatory' ? 'active' : ''}" data-subtab="regulatory">
            🛡️ Regulatory &amp; License Sentinel (${regCritical ? `⚠️ ${regCritical}` : 'Review records'})
          </button>
          <button class="ops-tab-btn ${activeSubTab === 'contract_scanner' ? 'active' : ''}" data-subtab="contract_scanner">
            📜 Vendor Contract "Gotcha" Scanner
          </button>
          <button class="ops-tab-btn ${activeSubTab === 'conflict_radar' ? 'active' : ''}" data-subtab="conflict_radar">
            📅 14-Day Conflict Radar (${conflictRadar.length})
          </button>
        </nav>

        <!-- Tab Content -->
        <div class="exec-tab-content">
          ${renderActiveSubTab()}
        </div>

        <!-- Modals -->
        ${renderModals()}
      </div>
    `;

    bindMainEvents(container);
  }

  function renderActiveSubTab() {
    switch (activeSubTab) {
      case 'staffing': return renderStaffingView();
      case 'replacement_matcher': return renderReplacementMatcherView();
      case 'regulatory': return renderRegulatoryView();
      case 'contract_scanner': return renderContractScannerView();
      case 'conflict_radar': return renderConflictRadarView();
      default: return renderStaffingView();
    }
  }

  // 1. Staffing Analytics & Overtime Reduction View
  function renderStaffingView() {
    if (staffingAnalysis?.hasData === false) return '<p>No staffing source imported. Staffing coverage and estimates are unavailable.</p>';
    if (!staffingAnalysis) return '<div class="ops-loading">Loading staffing analytics...</div>';
    const sum = staffingAnalysis.periodSummary || {};
    const gaps = staffingAnalysis.fteHiringGaps || {};
    const leaks = staffingAnalysis.incidentalPunchAudit || {};

    return `
      <div class="staffing-analytics-view">
        <!-- Overtime Reduction Banner -->
        <div class="exec-card" style="border-left: 4px solid #10b981; margin-bottom: 20px;">
          <h4>Imported Staffing Period &amp; Planning Review</h4>
          <p>${esc(sum.periodLabel || 'Imported period — coverage unconfirmed')}</p>
          <p>${esc(staffingAnalysis.assumptions?.sourceCoverage || 'Source coverage unknown')}</p>
          <p>Worked hours: ${numberLabel(sum.totalHoursWorked)} · Overtime hours: ${numberLabel(sum.totalOvertimeHours)} · Agency hours: ${numberLabel(sum.totalAgencyHours)}</p>
          <p class="exec-text-muted">Known source fields: ${numberLabel(sum.knownHoursWorked)} worked hours; ${numberLabel(sum.knownOvertimeHours)} overtime hours; ${numberLabel(sum.knownAgencyHours)} agency hours. Missing fields remain unknown.</p>
          <p style="font-size: 15px; margin-top: 5px; color: #1f2937;">${esc(gaps.recommendation || 'Review imported hours and missing source fields before planning.')}</p>
          <div style="display: flex; gap: 20px; margin-top: 12px; font-size: 13px;">
            <div><strong>CNA 40-hour units:</strong> ${numberLabel(gaps.cnaFteDeficit)}</div>
            <div><strong>LPN 40-hour units:</strong> ${numberLabel(gaps.lpnFteDeficit)}</div>
            <div><strong>RN 40-hour units:</strong> ${numberLabel(gaps.rnFteDeficit)}</div>
            <div><strong>Agency hours × imported rate:</strong> ${moneyLabel(sum.estimatedTotalAgencySpend)}</div>
            <div><strong>Overtime spend:</strong> ${moneyLabel(sum.estimatedTotalOTSpend)}</div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <!-- Pre-Shift Approaching Overtime Radar -->
          <div class="exec-card">
            <div class="exec-card-header">
              <div>
                <h4>Pre-Shift "Approaching Overtime" Warning Radar</h4>
                <p class="exec-text-muted">${esc(staffingAnalysis.approachingOTNotice || 'Requires a reviewed workweek, complete employee hours and upcoming shifts.')}</p>
              </div>
            </div>
            <div class="approaching-ot-list" style="margin-top: 10px;">
              ${(staffingAnalysis.approachingOTRadar || []).map(emp => `
                <div class="approaching-ot-row">
                  <div class="ot-emp-info">
                    <strong>${esc(emp.employeeName || 'Unknown employee')}</strong> (${esc(emp.role || 'Unknown role')} — ${esc(emp.unit || 'Unknown unit')})
                    <div class="exec-text-sm" style="color: #b45309;">${esc(emp.projectedOTRisk)}</div>
                  </div>
                  <div class="ot-hours-pill">
                    <span class="exec-pill pill-amber">${emp.currentHours} / 40.0 hrs</span>
                  </div>
                </div>
              `).join('') || '<div class="empty-state-sm">Weekly overtime risk is unavailable until source coverage is reviewed.</div>'}
            </div>
          </div>

          <!-- Incidental Punch Leakage Audit -->
          <div class="exec-card">
            <div class="exec-card-header">
              <div>
                <h4>Schedule Variance Review</h4>
                <p class="exec-text-muted">${esc(leaks.notice || 'Actual versus scheduled hours are review flags; they do not establish unapproved pay.')}</p>
                <p class="exec-text-muted">${numberLabel(leaks.comparisonRows)} records have comparable scheduled and actual hours; coverage ${leaks.coverageComplete ? 'complete for imported rows' : 'incomplete'}.</p>
              </div>
              <span class="exec-pill pill-gray">Source-rate estimate: ${moneyLabel(leaks.estimatedLeakCost)}</span>
            </div>
            <div class="punch-leakage-list" style="margin-top: 10px;">
              ${(leaks.flaggedOccurrences || []).map(leak => `
                <div class="leakage-row">
                  <div>
                    <strong>${esc(leak.employeeName || 'Unknown employee')}</strong> (${esc(leak.role || 'Unknown role')} — ${esc(leak.shift || 'Unknown shift')})
                    <div class="exec-text-sm">${esc(leak.reasons)}</div>
                  </div>
                  <div style="text-align: right;">
                    <span class="exec-pill pill-red">+${leak.leakMinutes}m extra</span>
                    <div class="exec-text-sm" style="color: #6b7280;">Source-rate estimate: ${moneyLabel(leak.estimatedCost)}</div>
                  </div>
                </div>
              `).join('') || '<div class="empty-state-sm">No variance review flags in comparable rows. Missing schedule, start-time and approval data are not an all-clear.</div>'}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 2. Smart Shift Replacement Matcher View
  function renderReplacementMatcherView() {
    return `
      <div class="exec-card">
        <div class="exec-card-header">
          <div>
            <h3>Smart Shift Replacement Matcher</h3>
            <p class="exec-text-muted">When a call-off or open shift occurs, automatically finds replacement staff: prioritizing PRN/part-time at straight-time before authorizing overtime or high-cost agency coverage.</p>
          </div>
        </div>

        <div style="display: flex; gap: 15px; margin: 15px 0; align-items: flex-end;">
          <div>
            <label class="ops-label">Role Needed</label>
            <select class="ops-input" id="select-open-role" style="min-width: 140px;">
              <option value="CNA" ${selectedShiftRole === 'CNA' ? 'selected' : ''}>CNA</option>
              <option value="LPN" ${selectedShiftRole === 'LPN' ? 'selected' : ''}>LPN</option>
              <option value="RN" ${selectedShiftRole === 'RN' ? 'selected' : ''}>RN</option>
            </select>
          </div>
          <div>
            <label class="ops-label">Shift Length</label>
            <select class="ops-input" id="select-open-hours" style="min-width: 140px;">
              <option value="8.0" ${selectedShiftHours === 8.0 ? 'selected' : ''}>8.0 Hours (Standard)</option>
              <option value="4.0" ${selectedShiftHours === 4.0 ? 'selected' : ''}>4.0 Hours (Half-Shift)</option>
              <option value="12.0" ${selectedShiftHours === 12.0 ? 'selected' : ''}>12.0 Hours (Weekend Option)</option>
            </select>
          </div>
          <button class="ops-btn ops-btn-primary" id="btn-re-rank-matches">Re-Rank Available Staff &rarr;</button>
        </div>

        <div class="replacement-rankings-table">
          <table class="ops-table">
            <thead>
              <tr>
                <th>Rank / Priority</th>
                <th>Staff Member</th>
                <th>Status</th>
                <th>Current Weekly Hours</th>
                <th>OT Incurred</th>
                <th>Estimated Shift Cost</th>
                <th>Recommendation</th>
              </tr>
            </thead>
            <tbody>
              ${(replacementMatches || []).map((m, idx) => `
                <tr class="${m.tier === 1 ? 'row-optimal' : m.tier === 4 ? 'row-agency' : ''}">
                  <td>
                    <span class="exec-pill ${m.tier === 1 ? 'pill-green' : m.tier === 2 ? 'pill-blue' : m.tier === 3 ? 'pill-amber' : 'pill-red'}">
                      Tier ${m.tier}: ${m.tier === 1 ? 'Optimal PRN' : m.tier === 2 ? 'Minor OT' : m.tier === 3 ? 'Heavy OT' : 'Agency ($54/hr)'}
                    </span>
                  </td>
                  <td><strong>${esc(m.name)}</strong></td>
                  <td>${esc(m.status)}</td>
                  <td>${m.currentHours} hrs</td>
                  <td>${m.otHoursAdded > 0 ? `<span style="color: #b45309; font-weight: 600;">+${m.otHoursAdded} hrs OT</span>` : '<span style="color: #10b981;">0 hrs OT</span>'}</td>
                  <td><strong>$${m.estimatedShiftCost}</strong></td>
                  <td>${esc(m.recommendation)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 3. Regulatory & License Renewal Sentinel View
  function renderRegulatoryView() {
    return `
      <div class="regulatory-sentinel-view">
        <div class="exec-action-toolbar">
          <div>
            <h3>Regulatory Compliance &amp; License Renewal Sentinel</h3>
            <p class="exec-text-muted">Proactive tracking for CLIA waiver, BNE/State Narcotics handling, safe combination changes, DOH operating certificate, Life Safety inspections, and medical staff credentialing.</p>
          </div>
          <button class="ops-btn ops-btn-primary" id="btn-open-license-modal">+ Add Facility / Staff License</button>
        </div>

        <div class="regulatory-grid">
          ${regulatoryItems.map(item => {
            const statusBadge = item.status === 'expired' ? 'pill-dark-red' : item.status === 'critical' ? 'pill-red' : item.status === 'action_required' ? 'pill-amber' : item.status === 'upcoming' ? 'pill-blue' : 'pill-green';
            return `
              <div class="license-card ${item.status === 'critical' || item.status === 'expired' ? 'card-critical-license' : ''}">
                <div class="license-card-top">
                  <span class="exec-pill pill-gray">${esc(item.category.replace('_', ' ').toUpperCase())}</span>
                  <span class="exec-pill ${statusBadge}">
                    ${item.daysUntil === null ? 'Date unknown' : item.daysUntil < 0 ? 'EXPIRED' : `${item.daysUntil} Days Left`}
                  </span>
                </div>
                <h4 class="license-title">${esc(item.title)}</h4>
                <div class="license-meta"><strong>ID / Cert #:</strong> ${esc(item.identifierNumber || 'Not recorded')}</div>
                <div class="license-meta"><strong>Authority:</strong> ${esc(item.authority)}</div>
                <div class="license-meta"><strong>Responsible:</strong> ${esc(item.responsibleParty)}</div>
                <div class="license-meta"><strong>Expires:</strong> <span style="font-weight: 700; color: #1f2937;">${formatDate(item.expirationDate)}</span></div>

                ${item.requiredDocuments?.length ? `
                  <div class="license-docs-box">
                    <strong>Mandatory Renewal Documents:</strong>
                    <ul>
                      ${item.requiredDocuments.map(d => `<li>• ${esc(d)}</li>`).join('')}
                    </ul>
                  </div>
                ` : ''}

                ${item.notes ? `<p class="license-notes">${esc(item.notes)}</p>` : ''}

                <div class="license-footer">
                  <span class="exec-pill ${item.renewalStatus === 'submitted' ? 'pill-green' : 'pill-amber'}">Status: ${esc(item.renewalStatus)}</span>
                  <button class="ops-btn ops-btn-xs ops-btn-secondary btn-edit-license" data-id="${item.id}">Update Checklist</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // 4. Vendor Contract "Gotcha" Scanner View
  function renderContractScannerView() {
    return `
      <div class="contract-scanner-view exec-card">
        <div class="exec-card-header">
          <div>
            <h3>Vendor Contract &amp; Rate Sheet "Gotcha" Scanner</h3>
            <p class="exec-text-muted">Paste or upload vendor contracts (staffing agency rate agreements, linen services, therapy, pharmacy). Scans for automatic renewals, cancellation penalties, guaranteed shift minimums, and price escalators.</p>
          </div>
        </div>

        <div style="margin-top: 15px;">
          <textarea class="ops-input" id="input-contract-text" rows="6" placeholder="Paste contract terms or rate sheet fine print here...">${esc(contractText)}</textarea>
          <div style="display: flex; justify-content: space-between; margin-top: 10px;">
            <button class="ops-btn ops-btn-secondary" id="btn-load-sample-contract">Load Sample Agency Contract</button>
            <button class="ops-btn ops-btn-primary" id="btn-run-contract-scan">Scan for Hidden Gotchas &rarr;</button>
          </div>
        </div>

        ${contractScanResult ? `
          <div class="contract-results-box" style="margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <h4>Analysis Results (${contractScanResult.totalGotchasFound} Clauses Flagged)</h4>
              <span class="exec-pill ${contractScanResult.riskLevel.includes('High') ? 'pill-red' : 'pill-amber'}">${esc(contractScanResult.riskLevel)}</span>
            </div>

            <div class="gotcha-findings-list" style="margin-top: 15px;">
              ${contractScanResult.findings.map(f => `
                <div class="gotcha-finding-card">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong style="color: #991b1b;">⚠️ ${esc(f.headline)}</strong>
                    <span class="exec-pill pill-gray">${esc(f.category)}</span>
                  </div>
                  <p class="gotcha-excerpt">"${esc(f.excerpt)}"</p>
                  <div class="gotcha-recommendation"><strong>Administrator Action:</strong> ${esc(f.recommendation)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // 5. 14-Day Conflict Radar View
  function renderConflictRadarView() {
    return `
      <div class="exec-card">
        <div class="exec-card-header">
          <div>
            <h3>14-Day Proactive Operational Conflict Radar</h3>
            <p class="exec-text-muted">Scans the next two weeks for collisions between scheduled fire drills, payroll authorization cutoffs, generator tests, and regulatory license expirations.</p>
          </div>
        </div>

        <div class="conflict-timeline" style="margin-top: 20px;">
          ${conflictRadar.map(item => `
            <div class="conflict-item-row ${item.severity === 'high' ? 'item-high-conflict' : ''}">
              <div class="conflict-date-badge">${formatDate(item.date)}</div>
              <div class="conflict-content">
                <strong>${esc(item.headline)}</strong>
                <p class="exec-text-sm" style="margin-top: 4px;">${esc(item.description)}</p>
              </div>
              <span class="exec-pill ${item.severity === 'high' ? 'pill-red' : 'pill-blue'}">${esc(item.type.replace('_', ' ').toUpperCase())}</span>
            </div>
          `).join('') || '<div class="empty-state">No immediate operational schedule conflicts detected in the next 14 days.</div>'}
        </div>
      </div>
    `;
  }

  function renderModals() {
    let html = '';

    // CSV Import Modal
    if (showCsvImportModal) {
      html += `
        <div class="ops-modal-backdrop">
          <div class="ops-modal-card" style="max-width: 650px;">
            <div class="ops-modal-header">
              <h3>📥 Ingest OnShift / Staffing CSV</h3>
              <button class="btn-close-modal" id="btn-close-csv">✕</button>
            </div>
            <div class="ops-modal-body">
              <p class="exec-text-sm">Paste exported data from <strong>OnShift Schedule vs. Actual</strong>, <strong>OnShift Overtime Watch</strong>, or any universal staffing CSV:</p>
              <textarea class="ops-input" id="input-csv-text" rows="8" placeholder="Employee Name,Role,Unit,Shift,Scheduled Hours,Actual Hours,Overtime Hours,Clock In,Clock Out,Agency...">${esc(csvInputText)}</textarea>
              <div style="display: flex; justify-content: space-between; margin-top: 10px;">
                <button class="ops-btn ops-btn-secondary ops-btn-sm" id="btn-load-sample-csv" ${workspaceDemo ? '' : 'disabled title="Open Demo Mode to use sample data"'}>Load Sample OnShift Export</button>
                <button class="ops-btn ops-btn-primary" id="btn-submit-csv-parse">Parse &amp; Run Overtime Analysis &rarr;</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    return html;
  }

  function bindMainEvents(container) {
    container.querySelectorAll('.ops-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeSubTab = btn.dataset.subtab;
        renderMain(container);
      });
    });

    const btnOpenCsv = container.querySelector('#btn-import-onshift-csv');
    if (btnOpenCsv) {
      btnOpenCsv.addEventListener('click', () => {
        showCsvImportModal = true;
        renderMain(container);
      });
    }

    const btnCloseCsv = container.querySelector('#btn-close-csv');
    if (btnCloseCsv) {
      btnCloseCsv.addEventListener('click', () => {
        showCsvImportModal = false;
        renderMain(container);
      });
    }

    const btnLoadSampleCsv = container.querySelector('#btn-load-sample-csv');
    if (btnLoadSampleCsv) {
      btnLoadSampleCsv.addEventListener('click', () => {
        if(!workspaceDemo)return;
        csvInputText = `Employee Name,Position,Unit,Shift,Scheduled Hours,Actual Hours,Overtime Hours,Clock In,Clock Out,Agency
Tanya Rogers,CNA,West Wing,3-11 Evening,8.0,8.5,0.5,14:48,23:30,No
Brittany Davis,CNA,West Wing,3-11 Evening,8.0,8.0,0.0,14:58,23:05,No
Marcus Wright,CNA,North Wing,7-3 Day,8.0,8.8,0.8,06:42,15:48,No
Kendra Washington,CNA,West Wing,3-11 Evening,8.0,12.0,4.0,14:50,03:10,No
ShiftKey Agency Aide 1,CNA,West Wing,11-7 Night,8.0,8.0,0.0,22:55,07:05,Yes
Elena Rostova,LPN,Subacute Rehab,7-3 Day,8.0,8.8,0.8,06:48,15:35,No`;
        container.querySelector('#input-csv-text').value = csvInputText;
      });
    }

    const btnSubmitCsv = container.querySelector('#btn-submit-csv-parse');
    if (btnSubmitCsv) {
      btnSubmitCsv.addEventListener('click', async () => {
        const text = container.querySelector('#input-csv-text')?.value.trim();
        if (!text) return toast('Please paste CSV data', 'warn');
        try {
          const parsed = await api('staffingParseCsv', { csvText: text, filename: 'onshift_upload.csv' });
          if (!parsed.success) return toast(parsed.error || 'Staffing CSV could not be validated.', 'error');
          const analysis = await api('staffingAnalyze', { records: parsed.records });
          staffingAnalysis = analysis;
          toast(`Parsed ${parsed.records.length} staffing records from ${parsed.detectedFormat}!`, 'success');
          showCsvImportModal = false;
          renderMain(container);
        } catch {
          toast('Staffing CSV could not be analyzed. Review the source fields and retry.', 'error');
        }
      });
    }

    // Re-rank Matcher
    const btnReRank = container.querySelector('#btn-re-rank-matches');
    if (btnReRank) {
      btnReRank.addEventListener('click', async () => {
        selectedShiftRole = container.querySelector('#select-open-role').value;
        selectedShiftHours = parseFloat(container.querySelector('#select-open-hours').value) || 8.0;
        replacementMatches = await api('staffingReplacementMatch', {
          openShift: { role: selectedShiftRole, hours: selectedShiftHours }
        });
        toast('Shift candidate rankings updated', 'info');
        renderMain(container);
      });
    }

    // Contract Scanner
    const btnLoadSampleContract = container.querySelector('#btn-load-sample-contract');
    if (btnLoadSampleContract) {
      btnLoadSampleContract.addEventListener('click', () => {
        contractText = `AGREEMENT FOR TEMPORARY HEALTHCARE STAFFING
This agreement shall automatically renew for successive terms of one (1) year unless either party provides ninety (90) days prior written notice.
Facility agrees to a minimum of 8 hours per shift requested. Cancellation fee applies if canceled within 24 hours.
Rates are subject to an annual increase of 4.5% or CPI. Overtime shall be billed at 1.5x regular bill rate.`;
        container.querySelector('#input-contract-text').value = contractText;
      });
    }

    const btnRunScan = container.querySelector('#btn-run-contract-scan');
    if (btnRunScan) {
      btnRunScan.addEventListener('click', async () => {
        const text = container.querySelector('#input-contract-text')?.value.trim();
        if (!text) return toast('Please paste contract text first', 'warn');
        contractText = text;
        contractScanResult = await api('assistantScanContract', { contractText: text });
        toast(`Scan complete: found ${contractScanResult.totalGotchasFound} gotcha clauses`, 'info');
        renderMain(container);
      });
    }

    const btnOpenContract = container.querySelector('#btn-open-contract-scanner');
    if (btnOpenContract) {
      btnOpenContract.addEventListener('click', () => {
        activeSubTab = 'contract_scanner';
        renderMain(container);
      });
    }
  }
}
