// Administrator Today — Daily Operational Command Center UI Module
// Decision support for SNF Administrator: Scannable 30-60s situational overview

export function createTodayUI({ api, esc, toast, refresh, renderPage }) {
  let medFilter = 'all'; // 'all' | 'ap' | 'highalert' | 'new' | 'dc'
  let queueFilter = 'all'; // 'all' | 'overdue' | 'dueToday' | 'inProgress' | 'snoozed'
  let searchQuery = '';
  let briefExpanded = false;

  function formatTime(ts) {
    if (!ts) return 'Not recorded';
    const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
    if (Number.isNaN(d.getTime())) return String(ts);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  function formatRelativeAge(hours) {
    if (!Number.isFinite(hours)) return 'New';
    if (hours < 1) return '<1h old';
    if (hours < 24) return `${hours}h old`;
    const days = Math.floor(hours / 24);
    return `${days}d old`;
  }

  function statusChip(status, overdue, snoozedUntil) {
    if (overdue) return `<span class="today-chip chip-overdue">OVERDUE</span>`;
    const s = String(status || 'new').toLowerCase();
    if (s === 'snoozed') {
      const snoozeExp = snoozedUntil ? ` until ${formatTime(snoozedUntil)}` : '';
      return `<span class="today-chip chip-snoozed">Snoozed${esc(snoozeExp)}</span>`;
    }
    return `<span class="today-chip chip-status">${esc(s.replaceAll('_', ' '))}</span>`;
  }

  function severityChip(sev) {
    const s = String(sev || 'medium').toLowerCase();
    if (s === 'critical') return `<span class="today-chip chip-critical">CRITICAL</span>`;
    if (s === 'high') return `<span class="today-chip chip-high">HIGH</span>`;
    return `<span class="today-chip chip-medium">${esc(s.toUpperCase())}</span>`;
  }

  return {
    async render(container) {
      container.innerHTML = `<div class="today-page"><p class="today-tabular" style="color:#64748b;font-size:13px;padding:30px 0;">Loading Administrator Command Center data...</p></div>`;

      let data;
      try {
        data = await api('snfToday');
      } catch (err) {
        container.innerHTML = `<div class="today-page"><div class="today-banner-demo" role="alert"><strong>Error loading Today dashboard:</strong> ${esc(err.message)}</div><button class="today-btn today-btn-primary" id="today-retry">Retry</button></div>`;
        container.querySelector('#today-retry')?.addEventListener('click', () => this.render(container));
        return;
      }

      const allAlerts = data.allAlerts || data.critical || [];
      const criticalAlerts = allAlerts.filter(a => a.severity === 'critical' && a.status !== 'resolved');
      const highAlerts = allAlerts.filter(a => a.severity === 'high' && a.status !== 'resolved');
      const medChanges = data.medications || [];
      const activeOrders = data.activeOrders || [];
      const movement = data.movement || [];
      const clinicalChanges = data.clinicalChanges || [];
      const dataHealth = data.dataHealth || {};
      const recentResolved = data.recentResolved || [];
      const allImports = data.allImports || [];

      // Metrics calculation
      const now = Date.now();
      const since24h = now - 86400000;
      const newAlerts24h = allAlerts.filter(a => (a.firstDetected || 0) >= since24h);
      const overdueAlerts = allAlerts.filter(a => a.overdue);
      const dueTodayAlerts = allAlerts.filter(a => !a.overdue && a.dueDate && a.dueDate <= (now + 86400000));
      const snoozedAlerts = allAlerts.filter(a => a.status === 'snoozed');
      const inProgressAlerts = allAlerts.filter(a => ['assigned', 'in_review', 'waiting', 'acknowledged'].includes(a.status));
      const followUpQueueAll = allAlerts.filter(a => a.owner || a.assignedTo || a.overdue || a.status === 'snoozed' || a.dueDate);

      const apChanges = medChanges.filter(m => m.isAntipsychotic || m.isPsychotropic || /antipsychotic/i.test(m.drugClass || ''));
      const highAlertMedChanges = medChanges.filter(m => m.isHighAlert);
      const newOrders = medChanges.filter(m => m.changeType === 'New Order');
      const dcOrders = medChanges.filter(m => m.changeType === 'Discontinued');

      // PRN Antipsychotic 14-day limit watch
      const prnOrders = activeOrders.filter(o => o.isAntipsychotic && o.isPRN).map(o => {
        const startTs = Date.parse(o.startDate) || now;
        const days = Math.max(1, Math.floor((now - startTs) / 86400000));
        return {
          ...o,
          elapsedDays: days,
          isExceeded: days >= 14,
          isApproaching: days >= 10 && days < 14
        };
      });

      // Clinical / Documentation Exceptions
      const docExceptions = allAlerts.filter(a =>
        /^(AP-002|AP-003|AP-004|AP-005|AP-NONPHARM|GDR-001|PHARM-PENDING|BEHAV-|DIAG-|IND-)/.test(a.code) && a.status !== 'resolved'
      );

      // Filtered sets based on user controls
      let filteredMeds = medChanges;
      if (medFilter === 'ap') filteredMeds = apChanges;
      else if (medFilter === 'highalert') filteredMeds = highAlertMedChanges;
      else if (medFilter === 'new') filteredMeds = newOrders;
      else if (medFilter === 'dc') filteredMeds = dcOrders;

      let filteredQueue = followUpQueueAll;
      if (queueFilter === 'overdue') filteredQueue = overdueAlerts;
      else if (queueFilter === 'dueToday') filteredQueue = dueTodayAlerts;
      else if (queueFilter === 'snoozed') filteredQueue = snoozedAlerts;
      else if (queueFilter === 'inProgress') filteredQueue = inProgressAlerts;

      const q = searchQuery.trim().toLowerCase();
      const filterBySearch = (items, textFn) => !q ? items : items.filter(it => textFn(it).toLowerCase().includes(q));

      const displayCritical = filterBySearch(criticalAlerts, a => `${a.residentName} ${a.residentRoom} ${a.title} ${a.message} ${a.code} ${a.drug}`);
      const displayExceptions = filterBySearch(docExceptions, a => `${a.residentName} ${a.residentRoom} ${a.title} ${a.message} ${a.code}`);
      const displayMeds = filterBySearch(filteredMeds, m => `${m.residentName} ${m.drugName} ${m.changeType} ${m.prescriber}`);
      const displayQueue = filterBySearch(filteredQueue, a => `${a.residentName} ${a.title} ${a.owner} ${a.assignedTo} ${a.status}`);

      // Render Alert Card Helper
      const renderAlertCard = (a) => `
        <article class="today-alert-card severity-${esc(a.severity)}" data-alert-id="${esc(a.id)}">
          <div class="today-alert-topline">
            <div class="today-alert-resident">
              <span>${esc(a.residentName || 'Facility-Wide')}</span>
              <span class="today-alert-room">${esc(a.residentRoom ? `Rm ${a.residentRoom}` : (a.residentId || ''))}</span>
            </div>
            <div class="today-alert-badges">
              ${severityChip(a.severity)}
              ${statusChip(a.status, a.overdue, a.snoozedUntil)}
              <span class="today-chip chip-status today-tabular">${formatRelativeAge(a.ageHours)}</span>
              <span class="today-chip chip-status today-tabular">${esc(a.code || a.ruleId)}</span>
            </div>
          </div>

          <h3 class="today-alert-title">${esc(a.title)}</h3>

          <div class="today-alert-trigger">
            <strong>Trigger:</strong> ${esc(a.message || 'Surveillance rule condition triggered by imported records.')}
            ${a.drug ? `<span style="display:block;margin-top:3px;font-size:12px;color:#1e293b;">Target Medication: <strong>${esc(a.drug)}</strong></span>` : ''}
          </div>

          <div class="today-alert-footer">
            <div class="today-alert-meta-items">
              <span><strong>Assigned:</strong> ${esc(a.owner || a.assignedTo || 'Unassigned')}</span>
              ${a.dueDate ? `<span class="today-tabular"><strong>Due:</strong> ${formatTime(a.dueDate)}</span>` : ''}
              ${a.actionNote ? `<span><strong>Latest note:</strong> "${esc(a.actionNote)}"</span>` : ''}
            </div>
            <div class="today-alert-actions">
              <button class="today-btn today-btn-sm" data-act-evidence="${esc(a.id)}">Inspect Evidence</button>
              <button class="today-btn today-btn-sm today-btn-primary" data-act-followup="${esc(a.id)}">Review / Follow Up</button>
            </div>
          </div>

          <div class="today-evidence-output" data-evidence-target="${esc(a.id)}" hidden></div>
        </article>
      `;

      // Construct Complete View
      container.innerHTML = `
        <div class="today-page">
          <!-- Demo Notice -->
          ${data.demo ? `
            <div class="today-banner-demo" role="alert">
              <div>
                <strong>DEMO DATA ACTIVE — NOT FOR CLINICAL USE.</strong>
                Isolated realistic SNF demonstration dataset is currently active. Production critical alerts remain guarded in the background.
              </div>
              <div style="display:flex;gap:8px;">
                <button class="today-btn today-btn-sm" id="btn-return-prod">Return to Production</button>
                <button class="today-btn today-btn-sm today-btn-danger" id="btn-reset-demo">Reset & Return</button>
              </div>
            </div>
          ` : ''}

          <!-- Header & Actions -->
          <header class="today-header-block">
            <div>
              <h1 class="today-header-title">
                Administrator Today
                <span class="today-badge">Command Center</span>
              </h1>
              <div class="today-header-meta">
                <span>PCC Data Current Through: <strong class="today-tabular">${esc(dataHealth.dataCurrentThroughFormatted || 'No data imported')}</strong></span>
                <span>·</span>
                <span class="${dataHealth.isSurveillanceComplete ? 'today-health-status-ok' : 'today-health-status-err'}">
                  ${dataHealth.isSurveillanceComplete ? '● Surveillance Feeds Current' : '▲ Surveillance Incomplete (Feeds Missing/Stale)'}
                </span>
                <span>·</span>
                <span>Daily 60-Second Scan</span>
              </div>
            </div>
            <div class="today-header-actions">
              <input type="search" id="today-search" placeholder="Search resident, medication, rule..." value="${esc(searchQuery)}" style="padding:8px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;width:220px;" />
              <button class="today-btn" id="btn-refresh">↻ Refresh</button>
              <button class="today-btn" id="btn-goto-pcc" data-view="pcc" data-act="view">PCC Import Center</button>
              <button class="today-btn today-btn-primary" id="btn-goto-snf" data-view="snf" data-act="view">Full Surveillance Center</button>
              ${!data.demo ? `<button class="today-btn" id="btn-toggle-demo">Open Demo Mode</button>` : ''}
            </div>
          </header>

          <!-- 1. Today's Status Header (KPI Strip) -->
          <section class="today-kpi-grid">
            <div class="today-kpi-card ${criticalAlerts.length > 0 ? 'kpi-critical' : 'kpi-success'}">
              <div class="today-kpi-header">
                <span>Critical Alerts</span>
                <span>${criticalAlerts.length > 0 ? 'Action Req' : 'Clear'}</span>
              </div>
              <div class="today-kpi-val">${criticalAlerts.length}</div>
              <div class="today-kpi-sub">
                ${criticalAlerts.length > 0 ? 'Unresolved critical findings requiring immediate review.' : 'No active critical alerts in imported data.'}
              </div>
            </div>

            <div class="today-kpi-card ${newAlerts24h.length > 0 ? 'kpi-warning' : 'kpi-neutral'}">
              <div class="today-kpi-header">
                <span>New Alerts (24h)</span>
                <span>Surveillance</span>
              </div>
              <div class="today-kpi-val">${newAlerts24h.length}</div>
              <div class="today-kpi-sub">
                ${newAlerts24h.length > 0 ? `${newAlerts24h.filter(a => a.severity === 'critical').length} critical, ${newAlerts24h.filter(a => a.severity === 'high').length} high severity.` : 'No new clinical alerts detected in past 24 hours.'}
              </div>
            </div>

            <div class="today-kpi-card ${overdueAlerts.length > 0 ? 'kpi-critical' : dueTodayAlerts.length > 0 ? 'kpi-warning' : 'kpi-info'}">
              <div class="today-kpi-header">
                <span>Follow-Ups Due</span>
                <span>${overdueAlerts.length > 0 ? `${overdueAlerts.length} Overdue` : 'Schedule'}</span>
              </div>
              <div class="today-kpi-val">${overdueAlerts.length + dueTodayAlerts.length}</div>
              <div class="today-kpi-sub">
                ${overdueAlerts.length > 0 ? `<strong style="color:#b91c1c;">${overdueAlerts.length} overdue</strong>, ` : ''}${dueTodayAlerts.length} due today, ${snoozedAlerts.length} snoozed.
              </div>
            </div>

            <div class="today-kpi-card ${apChanges.length > 0 ? 'kpi-warning' : 'kpi-info'}">
              <div class="today-kpi-header">
                <span>Medication Changes</span>
                <span>24h Lookback</span>
              </div>
              <div class="today-kpi-val">${medChanges.length}</div>
              <div class="today-kpi-sub">
                ${apChanges.length} psychotropic/antipsychotic, ${highAlertMedChanges.length} high-alert orders.
              </div>
            </div>

            <div class="today-kpi-card ${dataHealth.isSurveillanceComplete ? 'kpi-success' : 'kpi-critical'}">
              <div class="today-kpi-header">
                <span>PCC Feed Health</span>
                <span>${dataHealth.isSurveillanceComplete ? 'Feeds OK' : 'Warnings'}</span>
              </div>
              <div class="today-kpi-val" style="font-size:20px;line-height:1.4;">
                ${dataHealth.isSurveillanceComplete ? 'Current' : 'Incomplete'}
              </div>
              <div class="today-kpi-sub">
                ${dataHealth.missingCriticalFeeds?.length ? `${dataHealth.missingCriticalFeeds.length} required feed(s) missing or stale.` : 'All required feeds active; clinical review still required.'}
              </div>
            </div>

            <div class="today-kpi-card kpi-info today-clickable-kpi" id="today-automation-summary-card" style="cursor:pointer;" title="Click to open Automation & Agent Control Center">
              <div class="today-kpi-header">
                <span>Automation Summary</span>
                <span>Control Center →</span>
              </div>
              <div class="today-kpi-val" style="font-size:18px;line-height:1.4;" id="today-automation-val">
                Checking…
              </div>
              <div class="today-kpi-sub" id="today-automation-sub">
                Loading background jobs and scheduled automations...
              </div>
            </div>
          </section>

          <!-- 2. Needs Attention Now (Unresolved Critical & Overdue) -->
          <section class="today-section" id="section-attention">
            <div class="today-section-header">
              <div class="today-section-title-wrap">
                <h2 class="today-section-title">
                  <span>Needs Attention Now</span>
                  <span class="today-count-badge ${criticalAlerts.length > 0 ? 'count-critical' : ''}">${criticalAlerts.length}</span>
                </h2>
                <p class="today-section-desc">Unresolved Critical and overdue findings. Critical items persist until formally resolved.</p>
              </div>
              <div class="today-section-controls">
                <span style="font-size:12px;color:#64748b;">Clinical priority review</span>
              </div>
            </div>

            <div class="today-safeguard-banner warning">
              <strong>Clinical Guard:</strong> Critical alerts persist across subsequent report omissions until explicitly resolved by an audited clinical reviewer. They do not disappear simply because a newer upload omitted a resident record.
            </div>

            <div class="today-alert-list">
              ${displayCritical.length > 0 ? displayCritical.map(renderAlertCard).join('') : `
                <div class="today-empty-state">
                  <div class="today-empty-state-icon">✓</div>
                  <strong>No unresolved Critical alerts found.</strong>
                  <p>All imported records meet routine surveillance thresholds. Verify feed freshness in PCC Data Health below.</p>
                </div>
              `}
            </div>
          </section>

          <!-- 3. Medication & Antipsychotic Surveillance -->
          <section class="today-section" id="section-medications">
            <div class="today-section-header">
              <div class="today-section-title-wrap">
                <h2 class="today-section-title">
                  <span>Medication & Antipsychotic Surveillance</span>
                  <span class="today-count-badge ${apChanges.length > 0 ? 'count-warning' : ''}">${medChanges.length}</span>
                </h2>
                <p class="today-section-desc">Daily surveillance of antipsychotic starts, dose modifications, high-alert drugs, and 14-day PRN limits.</p>
              </div>
              <div class="today-section-controls">
                <div class="today-tabs" data-tab-group="meds">
                  <button class="today-tab-btn ${medFilter === 'all' ? 'active' : ''}" data-med-filter="all">All (${medChanges.length})</button>
                  <button class="today-tab-btn ${medFilter === 'ap' ? 'active' : ''}" data-med-filter="ap">Antipsychotics (${apChanges.length})</button>
                  <button class="today-tab-btn ${medFilter === 'highalert' ? 'active' : ''}" data-med-filter="highalert">High-Alert (${highAlertMedChanges.length})</button>
                  <button class="today-tab-btn ${medFilter === 'new' ? 'active' : ''}" data-med-filter="new">New Orders (${newOrders.length})</button>
                  <button class="today-tab-btn ${medFilter === 'dc' ? 'active' : ''}" data-med-filter="dc">Discontinued (${dcOrders.length})</button>
                </div>
              </div>
            </div>

            <!-- PRN Antipsychotic 14-Day Limit Watch Box -->
            ${prnOrders.length > 0 ? `
              <div class="today-prn-watch-box">
                <div class="today-prn-header">
                  <span>⏱ PRN Antipsychotic 14-Day Time-Limit Watch (${prnOrders.length} active orders)</span>
                  <span style="font-size:11px;font-weight:600;color:#78350f;">CMS Mandate §483.45(e)(5): Evaluation required before renewal</span>
                </div>
                <div class="today-prn-list">
                  ${prnOrders.map(p => `
                    <div class="today-prn-item">
                      <div>
                        <strong>${esc(p.residentName)}</strong> — ${esc(p.drugName)} ${esc(p.dose || '')} PRN
                        <span style="display:block;font-size:11px;color:#64748b;">Ordered ${esc(p.startDate || 'Unknown')} by ${esc(p.prescriber || 'Attending Physician')}</span>
                      </div>
                      <div style="display:flex;align-items:center;gap:8px;">
                        <span class="today-tabular" style="font-weight:700;">Day ${p.elapsedDays} of 14</span>
                        <span class="today-chip ${p.isExceeded ? 'chip-critical' : p.isApproaching ? 'chip-high' : 'chip-status'}">
                          ${p.isExceeded ? 'LIMIT EXCEEDED (DAY 14+)' : p.isApproaching ? 'REVIEW REQ (DAY 10+)' : 'ACTIVE'}
                        </span>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Medication Changes Table -->
            <div class="today-table-wrap">
              ${displayMeds.length > 0 ? `
                <table class="today-table">
                  <thead>
                    <tr>
                      <th>Resident</th>
                      <th>Medication & Class</th>
                      <th>Change Type</th>
                      <th>Dosage / Frequency</th>
                      <th>Prescriber / Date</th>
                      <th>Surveillance Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${displayMeds.map(m => `
                      <tr>
                        <td>
                          <strong>${esc(m.residentName || m.residentId)}</strong>
                          <div style="font-size:11px;color:#64748b;">${esc(m.residentId || '')}</div>
                        </td>
                        <td>
                          <strong>${esc(m.drugName)}</strong>
                          <div style="font-size:11px;color:#64748b;">${esc(m.drugClass || m.genericName || 'General formulation')}</div>
                        </td>
                        <td>
                          <span class="today-chip ${m.changeType === 'New Order' ? 'chip-high' : m.changeType === 'Discontinued' ? 'chip-status' : 'chip-medium'}">
                            ${esc(m.changeType)}
                          </span>
                        </td>
                        <td class="today-tabular">
                          ${m.previousDose ? `<span style="text-decoration:line-through;color:#94a3b8;">${esc(m.previousDose)}</span> → ` : ''}
                          <strong>${esc(m.newDose || m.dose || 'Recorded')}</strong>
                          <div style="font-size:11px;color:#64748b;">${esc(m.frequency || '')} ${m.isPRN ? '· PRN' : ''}</div>
                        </td>
                        <td>
                          <div>${esc(m.prescriber || 'Prescriber on file')}</div>
                          <div class="today-tabular" style="font-size:11px;color:#64748b;">${esc(m.orderDate || formatTime(m.importTimestamp))}</div>
                        </td>
                        <td>
                          ${m.alertId ? `
                            <button class="today-btn today-btn-sm ${m.alertSeverity === 'critical' ? 'today-btn-danger' : ''}" data-act-followup="${esc(m.alertId)}">
                              ${esc(m.alertSeverity === 'critical' ? 'Critical Alert' : 'Review Alert')}
                            </button>
                          ` : m.isAntipsychotic ? `
                            <span class="today-chip chip-high">Antipsychotic</span>
                          ` : m.isHighAlert ? `
                            <span class="today-chip chip-medium">High-Alert</span>
                          ` : `
                            <span style="font-size:12px;color:#64748b;">Routine Order</span>
                          `}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              ` : `
                <div class="today-empty-state">
                  <div class="today-empty-state-icon">📋</div>
                  <strong>No medication changes matching current filter.</strong>
                  <p>Filter: "${esc(medFilter)}". Check PCC import history if newer order reports are expected.</p>
                </div>
              `}
            </div>
          </section>

          <!-- 4. Clinical / Documentation Exceptions -->
          <section class="today-section" id="section-exceptions">
            <div class="today-section-header">
              <div class="today-section-title-wrap">
                <h2 class="today-section-title">
                  <span>Clinical & Documentation Exceptions</span>
                  <span class="today-count-badge ${docExceptions.length > 0 ? 'count-warning' : ''}">${docExceptions.length}</span>
                </h2>
                <p class="today-section-desc">Identified documentation gaps in behavior monitoring, GDR tracking, and diagnostic support.</p>
              </div>
              <div class="today-section-controls">
                <span style="font-size:12px;color:#64748b;">Deterministic Rule Engine</span>
              </div>
            </div>

            <div class="today-safeguard-banner">
              <strong>Clinical Documentation Safeguard:</strong>
              Documentation not present in imported reports indicates a surveillance exception in uploaded data; it does <em>not</em> independently verify absence in PointClickCare. Direct EMR chart audit is required prior to regulatory or clinical action.
            </div>

            <div class="today-alert-list">
              ${displayExceptions.length > 0 ? displayExceptions.map(a => `
                <article class="today-alert-card severity-${esc(a.severity)}" data-alert-id="${esc(a.id)}">
                  <div class="today-alert-topline">
                    <div class="today-alert-resident">
                      <span>${esc(a.residentName)}</span>
                      <span class="today-alert-room">${esc(a.residentRoom ? `Rm ${a.residentRoom}` : (a.residentId || ''))}</span>
                    </div>
                    <div class="today-alert-badges">
                      ${severityChip(a.severity)}
                      ${statusChip(a.status, a.overdue, a.snoozedUntil)}
                      <span class="today-chip chip-status">${esc(a.code)}</span>
                    </div>
                  </div>

                  <h3 class="today-alert-title">${esc(a.title)}</h3>

                  <div class="today-alert-trigger">
                    <strong>Surveillance Finding:</strong> ${esc(a.message)}
                  </div>

                  <!-- Explicit Distinction of Imported Evidence vs Missing Evidence -->
                  <div class="today-evidence-tags">
                    ${a.missingEvidence?.length ? a.missingEvidence.map(feed => `
                      <span class="today-tag-missing">⚠ Missing from imported batch: ${esc(feed)}.csv</span>
                    `).join('') : `
                      <span class="today-tag-confirmed">✓ Input records evaluated in imported batch</span>
                    `}
                    <span class="today-tag-confirmed">Rule ${esc(a.ruleId || a.code)} (v${esc(a.ruleVersion || '3.0.1')})</span>
                  </div>

                  <div class="today-alert-footer">
                    <div class="today-alert-meta-items">
                      <span><strong>Assigned:</strong> ${esc(a.owner || a.assignedTo || 'Unassigned')}</span>
                      ${a.dueDate ? `<span class="today-tabular"><strong>Due:</strong> ${formatTime(a.dueDate)}</span>` : ''}
                    </div>
                    <div class="today-alert-actions">
                      <button class="today-btn today-btn-sm" data-act-evidence="${esc(a.id)}">Inspect Evidence</button>
                      <button class="today-btn today-btn-sm today-btn-primary" data-act-followup="${esc(a.id)}">Review / Follow Up</button>
                    </div>
                  </div>

                  <div class="today-evidence-output" data-evidence-target="${esc(a.id)}" hidden></div>
                </article>
              `).join('') : `
                <div class="today-empty-state">
                  <div class="today-empty-state-icon">✓</div>
                  <strong>No clinical or documentation exceptions identified.</strong>
                  <p>All evaluated residents have supporting diagnosis and behavior documentation present in the imported batches.</p>
                </div>
              `}
            </div>
          </section>

          <!-- 5. PCC Data Health (Compact Operational Status) -->
          <section class="today-section" id="section-data-health">
            <div class="today-section-header">
              <div class="today-section-title-wrap">
                <h2 class="today-section-title">
                  <span>PCC Data Health & Feed Status</span>
                  <span class="today-count-badge ${dataHealth.isSurveillanceComplete ? '' : 'count-critical'}">
                    ${dataHealth.isSurveillanceComplete ? 'Current' : 'Attention'}
                  </span>
                </h2>
                <p class="today-section-desc">Report freshness, active feed validation, and ingestion batch audit.</p>
              </div>
              <div class="today-section-controls">
                <button class="today-btn today-btn-sm" id="btn-health-pcc-center" data-view="pcc" data-act="view">Open PCC Import Center</button>
              </div>
            </div>

            <div class="today-health-grid">
              <!-- Summary Card -->
              <div class="today-health-card">
                <h4>
                  <span>Surveillance Completeness</span>
                  <span class="${dataHealth.isSurveillanceComplete ? 'today-health-status-ok' : 'today-health-status-err'}">
                    ${dataHealth.isSurveillanceComplete ? '● Complete' : '▲ Incomplete'}
                  </span>
                </h4>
                <div class="today-health-row">
                  <span class="today-health-label">Data Current Through</span>
                  <span class="today-tabular"><strong>${esc(dataHealth.dataCurrentThroughFormatted || 'None')}</strong></span>
                </div>
                <div class="today-health-row">
                  <span class="today-health-label">Critical Feeds Status</span>
                  <span>${dataHealth.missingCriticalFeeds?.length ? `<span class="today-health-status-err">${dataHealth.missingCriticalFeeds.length} Feed(s) Missing/Stale</span>` : '<span class="today-health-status-ok">All Feeds Present</span>'}</span>
                </div>
                <div class="today-health-row">
                  <span class="today-health-label">Surveillance Policy</span>
                  <span>Fail-safe: Never all-clear when missing</span>
                </div>
              </div>

              <!-- Feeds Breakdown -->
              <div class="today-health-card">
                <h4>
                  <span>Feed Freshness Breakdown</span>
                  <span style="font-size:11px;color:#64748b;">Daily Lookback</span>
                </h4>
                ${dataHealth.feeds ? Object.entries(dataHealth.feeds).slice(0, 5).map(([fid, f]) => `
                  <div class="today-health-row">
                    <span class="today-health-label">${esc(f.name || fid)}</span>
                    <span class="today-tabular ${f.status === 'ok' ? 'today-health-status-ok' : f.status === 'stale' ? 'today-health-status-warn' : 'today-health-status-err'}">
                      ${f.status === 'ok' ? 'Current' : f.status === 'stale' ? 'Stale' : 'Missing'} (${f.rowCount || 0} rows)
                    </span>
                  </div>
                `).join('') : '<p style="color:#64748b;font-size:12px;">No feed status available.</p>'}
              </div>

              <!-- Ingestion Audit -->
              <div class="today-health-card">
                <h4>
                  <span>Last Ingestion Batch</span>
                  <span style="font-size:11px;color:#64748b;">PCC Audit</span>
                </h4>
                ${allImports.length > 0 ? `
                  <div class="today-health-row">
                    <span class="today-health-label">Batch ID</span>
                    <span class="today-tabular" style="font-family:monospace;font-size:11px;">${esc(allImports[0].id?.slice(0, 8))}...</span>
                  </div>
                  <div class="today-health-row">
                    <span class="today-health-label">Import Operator</span>
                    <span>${esc(allImports[0].operator || 'System')}</span>
                  </div>
                  <div class="today-health-row">
                    <span class="today-health-label">Accepted / Rejected</span>
                    <span class="today-tabular">${allImports[0].acceptedRows || 0} accepted · <span style="${allImports[0].rejectedRows ? 'color:#b91c1c;font-weight:700;' : ''}">${allImports[0].rejectedRows || 0} rejected</span></span>
                  </div>
                ` : `
                  <div class="today-health-row">
                    <span class="today-health-label">Batch History</span>
                    <span>No batches imported yet.</span>
                  </div>
                `}
              </div>
            </div>
          </section>

          <!-- 6. Follow-Up Queue -->
          <section class="today-section" id="section-followup">
            <div class="today-section-header">
              <div class="today-section-title-wrap">
                <h2 class="today-section-title">
                  <span>Follow-Up Queue</span>
                  <span class="today-count-badge ${overdueAlerts.length > 0 ? 'count-critical' : ''}">${followUpQueueAll.length}</span>
                </h2>
                <p class="today-section-desc">Clinical assignments, approaching deadlines, and snoozed items awaiting review.</p>
              </div>
              <div class="today-section-controls">
                <div class="today-tabs" data-tab-group="queue">
                  <button class="today-tab-btn ${queueFilter === 'all' ? 'active' : ''}" data-queue-filter="all">All (${followUpQueueAll.length})</button>
                  <button class="today-tab-btn ${queueFilter === 'overdue' ? 'active' : ''}" data-queue-filter="overdue">Overdue (${overdueAlerts.length})</button>
                  <button class="today-tab-btn ${queueFilter === 'dueToday' ? 'active' : ''}" data-queue-filter="dueToday">Due Today (${dueTodayAlerts.length})</button>
                  <button class="today-tab-btn ${queueFilter === 'inProgress' ? 'active' : ''}" data-queue-filter="inProgress">In Review (${inProgressAlerts.length})</button>
                  <button class="today-tab-btn ${queueFilter === 'snoozed' ? 'active' : ''}" data-queue-filter="snoozed">Snoozed (${snoozedAlerts.length})</button>
                </div>
              </div>
            </div>

            <div class="today-alert-list">
              ${displayQueue.length > 0 ? displayQueue.map(a => `
                <article class="today-alert-card severity-${esc(a.severity)}" data-alert-id="${esc(a.id)}">
                  <div class="today-alert-topline">
                    <div class="today-alert-resident">
                      <span>${esc(a.residentName)}</span>
                      <span class="today-alert-room">${esc(a.residentRoom ? `Rm ${a.residentRoom}` : (a.residentId || ''))}</span>
                    </div>
                    <div class="today-alert-badges">
                      ${severityChip(a.severity)}
                      ${statusChip(a.status, a.overdue, a.snoozedUntil)}
                      <span class="today-chip chip-status">${esc(a.code)}</span>
                    </div>
                  </div>

                  <h3 class="today-alert-title">${esc(a.title)}</h3>

                  <div class="today-alert-footer" style="padding-top:0;">
                    <div class="today-alert-meta-items">
                      <span><strong>Owner / Assignee:</strong> ${esc(a.owner || a.assignedTo || 'Unassigned')}</span>
                      ${a.dueDate ? `<span class="today-tabular"><strong>Due Date:</strong> ${formatTime(a.dueDate)} ${a.overdue ? '· <strong style="color:#b91c1c;">OVERDUE</strong>' : ''}</span>` : ''}
                      ${a.snoozedUntil ? `<span class="today-tabular"><strong>Snoozed Until:</strong> ${formatTime(a.snoozedUntil)}</span>` : ''}
                      ${a.actionNote ? `<span><strong>Notes:</strong> "${esc(a.actionNote)}"</span>` : ''}
                    </div>
                    <div class="today-alert-actions">
                      <button class="today-btn today-btn-sm" data-act-evidence="${esc(a.id)}">Evidence</button>
                      <button class="today-btn today-btn-sm today-btn-primary" data-act-followup="${esc(a.id)}">Update Follow-Up</button>
                    </div>
                  </div>

                  <div class="today-evidence-output" data-evidence-target="${esc(a.id)}" hidden></div>
                </article>
              `).join('') : `
                <div class="today-empty-state">
                  <div class="today-empty-state-icon">✓</div>
                  <strong>No follow-up items matching "${esc(queueFilter)}" filter.</strong>
                  <p>All items have been reviewed or are in good standing.</p>
                </div>
              `}
            </div>
          </section>

          <!-- 7. Recent Changes (Past 24 Hours) -->
          <section class="today-section" id="section-recent-changes">
            <div class="today-section-header">
              <div class="today-section-title-wrap">
                <h2 class="today-section-title">
                  <span>Recent Operational Changes (24h)</span>
                  <span class="today-count-badge">${newAlerts24h.length + recentResolved.length + movement.length + clinicalChanges.length}</span>
                </h2>
                <p class="today-section-desc">Meaningful operational changes since previous review. No raw telemetry noise.</p>
              </div>
            </div>

            <div class="today-table-wrap">
              <table class="today-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Resident / Subject</th>
                    <th>Change Description</th>
                    <th>Detected / Time</th>
                    <th>Status / Result</th>
                  </tr>
                </thead>
                <tbody>
                  ${newAlerts24h.slice(0, 5).map(a => `
                    <tr>
                      <td><span class="today-chip ${a.severity === 'critical' ? 'chip-critical' : 'chip-high'}">New Alert</span></td>
                      <td><strong>${esc(a.residentName)}</strong></td>
                      <td>${esc(a.title)}: ${esc(a.message)}</td>
                      <td class="today-tabular">${formatTime(a.firstDetected)}</td>
                      <td>${statusChip(a.status, a.overdue)}</td>
                    </tr>
                  `).join('')}

                  ${recentResolved.slice(0, 5).map(r => `
                    <tr>
                      <td><span class="today-chip" style="background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;">Resolved Alert</span></td>
                      <td><strong>${esc(r.residentName)}</strong></td>
                      <td>${esc(r.title)} — <em>Reason: ${esc(r.resolutionReason || 'Review complete')}</em></td>
                      <td class="today-tabular">${formatTime(r.resolvedAt)}</td>
                      <td><span style="color:#15803d;font-weight:600;">Resolved by ${esc(r.resolvedBy || 'Reviewer')}</span></td>
                    </tr>
                  `).join('')}

                  ${movement.slice(0, 5).map(m => `
                    <tr>
                      <td><span class="today-chip chip-medium">Census Movement</span></td>
                      <td><strong>${esc(m.residentName || m.residentId)}</strong></td>
                      <td>${esc(m.eventType || m.status || (m.admittedFrom ? `Admission from ${m.admittedFrom}` : (m.transferredTo ? `Transfer to ${m.transferredTo}` : 'Movement event')))}</td>
                      <td class="today-tabular">${formatTime(m.importTimestamp || m.reportDate)}</td>
                      <td><span style="color:#64748b;">Census Updated</span></td>
                    </tr>
                  `).join('')}

                  ${clinicalChanges.slice(0, 5).map(c => `
                    <tr>
                      <td><span class="today-chip chip-status">Clinical 24h</span></td>
                      <td><strong>${esc(c.residentName || c.residentId)}</strong></td>
                      <td>${esc(c.description || c.summary || c.concern || 'Clinical change logged in 24h feed')}</td>
                      <td class="today-tabular">${formatTime(c.importTimestamp || c.date)}</td>
                      <td><span style="color:#64748b;">Recorded</span></td>
                    </tr>
                  `).join('')}

                  ${(newAlerts24h.length === 0 && recentResolved.length === 0 && movement.length === 0 && clinicalChanges.length === 0) ? `
                    <tr>
                      <td colspan="5" style="text-align:center;color:#64748b;padding:24px;">No operational changes recorded in the past 24 hours.</td>
                    </tr>
                  ` : ''}
                </tbody>
              </table>
            </div>
          </section>

          <!-- 8. Morning Brief (Progressive Disclosure) -->
          <section class="today-section" id="section-brief">
            <div class="today-section-header">
              <div class="today-section-title-wrap">
                <h2 class="today-section-title">
                  <span>Administrator Morning Brief</span>
                </h2>
                <p class="today-section-desc">Automated executive summary synthesized from latest PCC surveillance imports.</p>
              </div>
              <div class="today-section-controls">
                <button class="today-btn today-btn-sm" id="btn-copy-brief">Copy Brief</button>
                <button class="today-btn today-btn-sm" id="btn-toggle-brief">${briefExpanded ? 'Collapse' : 'Expand'}</button>
              </div>
            </div>
            <div class="today-brief-block" id="brief-content" ${briefExpanded ? '' : 'hidden'}>
              <pre class="today-brief-text">${esc(data.morningBrief || 'Morning brief unavailable. Verify feed freshness.')}</pre>
            </div>
          </section>
        </div>
      `;

      // Event Wiring: Navigation & General Controls
      container.querySelector('#btn-goto-pcc')?.addEventListener('click', () => renderPage && renderPage('pcc'));
      container.querySelector('#btn-goto-snf')?.addEventListener('click', () => renderPage && renderPage('snf'));
      container.querySelector('#btn-health-pcc-center')?.addEventListener('click', () => renderPage && renderPage('pcc'));
      container.querySelector('#today-automation-summary-card')?.addEventListener('click', () => renderPage && renderPage('automation'));

      // Populate Automation Summary Card asynchronously from system summary
      api('summary').then(summary => {
        const jobs = summary.jobs || [];
        const schedules = summary.schedules || [];
        const now = Date.now();
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const completedToday = jobs.filter(j => j.status === 'completed' && (j.completed || j.started) >= startOfDay.getTime()).length;
        const failedToday = jobs.filter(j => j.status === 'failed' && (j.completed || j.started) >= startOfDay.getTime()).length;
        const findingsToday = jobs.filter(j => j.status === 'completed' && j.findingsCount && (j.completed || j.started) >= startOfDay.getTime()).length;

        const nextSchedule = schedules
          .filter(s => s.enabled && s.next && s.next > now)
          .sort((a, b) => a.next - b.next)[0];

        const nextStr = nextSchedule
          ? `${esc(nextSchedule.name)} — ${new Date(nextSchedule.next).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
          : 'None scheduled';

        const valEl = container.querySelector('#today-automation-val');
        const subEl = container.querySelector('#today-automation-sub');
        if (valEl) {
          valEl.innerHTML = `<span style="font-size:16px;">${completedToday} completed today</span>${failedToday > 0 ? ` · <span style="color:#b91c1c;">${failedToday} failed</span>` : ''}`;
        }
        if (subEl) {
          subEl.innerHTML = `${findingsToday > 0 ? `<strong>${findingsToday} findings require review.</strong> ` : ''}Next: ${nextStr}`;
        }
      }).catch(() => {
        const valEl = container.querySelector('#today-automation-val');
        if (valEl) valEl.textContent = 'Operational';
      });

      container.querySelector('#btn-refresh')?.addEventListener('click', async () => {
        try {
          await refresh();
          await this.render(container);
          toast('Today dashboard refreshed.');
        } catch (e) {
          toast(e.message);
        }
      });

      // Search Filter Input
      const searchEl = container.querySelector('#today-search');
      if (searchEl) {
        searchEl.addEventListener('input', (e) => {
          searchQuery = e.target.value;
          this.render(container);
        });
      }

      // Med Filter Tabs
      container.querySelectorAll('[data-med-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
          medFilter = btn.dataset.medFilter;
          this.render(container);
        });
      });

      // Queue Filter Tabs
      container.querySelectorAll('[data-queue-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
          queueFilter = btn.dataset.queueFilter;
          this.render(container);
        });
      });

      // Morning Brief Toggle & Copy
      const briefToggleBtn = container.querySelector('#btn-toggle-brief');
      const briefContent = container.querySelector('#brief-content');
      briefToggleBtn?.addEventListener('click', () => {
        briefExpanded = !briefExpanded;
        if (briefContent) briefContent.hidden = !briefExpanded;
        briefToggleBtn.textContent = briefExpanded ? 'Collapse' : 'Expand';
      });

      container.querySelector('#btn-copy-brief')?.addEventListener('click', async () => {
        if (data.morningBrief) {
          try {
            await navigator.clipboard.writeText(data.morningBrief);
            toast('Morning Brief copied to clipboard.');
          } catch {
            toast('Failed to copy. Please select and copy manually.');
          }
        }
      });

      // Demo Mode Controls
      container.querySelector('#btn-toggle-demo')?.addEventListener('click', async () => {
        try {
          await api('snfDemo', { mode: 'demo' });
          await refresh();
          await this.render(container);
          toast('Isolated Demo Mode enabled.');
        } catch (e) {
          toast(e.message);
        }
      });

      container.querySelector('#btn-return-prod')?.addEventListener('click', async () => {
        try {
          await api('snfDemo', { mode: 'production' });
          await refresh();
          await this.render(container);
          toast('Returned to live production data.');
        } catch (e) {
          toast(e.message);
        }
      });

      container.querySelector('#btn-reset-demo')?.addEventListener('click', async () => {
        try {
          await api('snfDemo', { mode: 'production', reset: true });
          await refresh();
          await this.render(container);
          toast('Demo data wiped and returned to production.');
        } catch (e) {
          toast(e.message);
        }
      });

      // Evidence Inspection Handler
      container.querySelectorAll('[data-act-evidence]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const alertId = btn.dataset.actEvidence;
          const targetBox = container.querySelector(`[data-evidence-target="${CSS.escape(alertId)}"]`);
          if (!targetBox) return;

          if (!targetBox.hidden) {
            targetBox.hidden = true;
            btn.textContent = 'Inspect Evidence';
            return;
          }

          targetBox.hidden = false;
          btn.textContent = 'Hide Evidence';
          targetBox.innerHTML = `<div class="today-evidence-panel"><p style="font-size:12px;color:#64748b;">Loading snapshot evidence...</p></div>`;

          try {
            const rows = await api('snfAlertEvidence', { alertId });
            if (!rows || !rows.length) {
              targetBox.innerHTML = `
                <div class="today-evidence-panel">
                  <p style="font-size:12px;color:#64748b;margin:0;">No persisted evaluation snapshots found for this alert record.</p>
                </div>
              `;
              return;
            }

            targetBox.innerHTML = `
              <div class="today-evidence-panel">
                <div style="font-size:12px;font-weight:700;color:#1e293b;margin-bottom:8px;">
                  Evaluation Snapshots & Row Provenance (${rows.length})
                </div>
                ${rows.map(r => `
                  <details style="margin-bottom:8px;">
                    <summary>
                      Generated: <strong class="today-tabular">${formatTime(r.generationTime)}</strong> · Rule ${esc(r.ruleId)} (${esc(r.ruleVersion)})
                    </summary>
                    <div style="padding:8px 0;">
                      <div class="today-evidence-tags">
                        ${r.missingEvidence?.length ? r.missingEvidence.map(m => `<span class="today-tag-missing">Missing in batch: ${esc(m)}</span>`).join('') : '<span class="today-tag-confirmed">All required feeds evaluated</span>'}
                      </div>
                      ${r.sources?.length ? `
                        <div style="margin:8px 0;font-size:12px;">
                          <strong>Sources:</strong>
                          <ul style="margin:4px 0;padding-left:18px;">
                            ${r.sources.map(s => `
                              <li>${esc(s.sourceFile || 'Report')} (Row: ${esc(s.sourceRow || 'N/A')}, Batch: <code>${esc(s.batchId?.slice(0, 8))}</code>)</li>
                            `).join('')}
                          </ul>
                        </div>
                      ` : ''}
                      <pre>${esc(JSON.stringify({ inputData: r.inputData, missingEvidence: r.missingEvidence }, null, 2))}</pre>
                    </div>
                  </details>
                `).join('')}
              </div>
            `;
          } catch (e) {
            targetBox.innerHTML = `<div class="today-evidence-panel"><p style="color:#b91c1c;font-size:12px;margin:0;">Failed to load evidence: ${esc(e.message)}</p></div>`;
          }
        });
      });

      // Follow-Up & Clinical Review Dialog Handler
      container.querySelectorAll('[data-act-followup]').forEach(btn => {
        btn.addEventListener('click', () => {
          const alertId = btn.dataset.actFollowup;
          const a = allAlerts.find(r => r.id === alertId);
          if (!a) {
            toast('Alert record not found.');
            return;
          }

          const existingDialog = document.querySelector('dialog.today-modal');
          if (existingDialog) existingDialog.remove();

          const dialog = document.createElement('dialog');
          dialog.className = 'today-modal';

          const currentStatus = a.status || 'new';
          const dueDateFormatted = a.dueDate ? new Date(a.dueDate).toISOString().slice(0, 16) : '';
          const snoozeDateFormatted = a.snoozedUntil ? new Date(a.snoozedUntil).toISOString().slice(0, 16) : '';

          dialog.innerHTML = `
            <form id="followup-form">
              <div class="today-modal-header">
                <div>
                  <h3 class="today-modal-title">Clinical Review & Follow-Up</h3>
                  <div style="font-size:12px;color:#64748b;margin-top:2px;">
                    ${esc(a.residentName)} · ${esc(a.residentRoom ? `Rm ${a.residentRoom}` : (a.residentId || ''))} · ${esc(a.code)}
                  </div>
                </div>
                <button type="button" class="today-btn today-btn-sm" id="followup-close-x">✕</button>
              </div>

              <div class="today-modal-body">
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px;margin-bottom:16px;">
                  <strong style="color:#0f172a;display:block;margin-bottom:4px;">${esc(a.title)}</strong>
                  <p style="margin:0;font-size:12px;color:#475569;">${esc(a.message)}</p>
                </div>

                <div class="today-form-row">
                  <div class="today-form-group">
                    <label for="f-reviewer">Reviewer Name *</label>
                    <input id="f-reviewer" name="reviewer" required placeholder="e.g. Administrator / DON / MD" value="${esc(a.acknowledgedBy || 'Clinical Administrator')}" />
                  </div>

                  <div class="today-form-group">
                    <label for="f-owner">Assigned Owner</label>
                    <input id="f-owner" name="owner" placeholder="e.g. Charge Nurse, Consultant Pharmacist" value="${esc(a.owner || a.assignedTo || '')}" />
                  </div>
                </div>

                <div class="today-form-row">
                  <div class="today-form-group">
                    <label for="f-status">Lifecycle Status *</label>
                    <select id="f-status" name="status">
                      <option value="new" ${currentStatus === 'new' ? 'selected' : ''}>New Finding</option>
                      <option value="acknowledged" ${currentStatus === 'acknowledged' ? 'selected' : ''}>Acknowledged</option>
                      <option value="assigned" ${currentStatus === 'assigned' ? 'selected' : ''}>Assigned</option>
                      <option value="in_review" ${currentStatus === 'in_review' ? 'selected' : ''}>In Review</option>
                      <option value="waiting" ${currentStatus === 'waiting' ? 'selected' : ''}>Waiting for EMR / Prescriber</option>
                      <option value="snoozed" ${currentStatus === 'snoozed' ? 'selected' : ''}>Snooze Alert</option>
                      <option value="resolved" ${currentStatus === 'resolved' ? 'selected' : ''}>Resolve Alert (Documented)</option>
                    </select>
                  </div>

                  <div class="today-form-group">
                    <label for="f-due">Follow-Up Due Date</label>
                    <input id="f-due" name="due" type="datetime-local" value="${esc(dueDateFormatted)}" />
                  </div>
                </div>

                <div class="today-form-group" id="f-snooze-group" style="${currentStatus === 'snoozed' ? '' : 'display:none;'}">
                  <label for="f-snooze">Snooze Until *</label>
                  <input id="f-snooze" name="snooze" type="datetime-local" value="${esc(snoozeDateFormatted)}" />
                  <span style="font-size:11px;color:#64748b;">Alert remains tracked and reactivates once snooze duration expires.</span>
                </div>

                <div class="today-form-group" id="f-reason-group" style="${currentStatus === 'resolved' ? '' : 'display:none;'}">
                  <label for="f-reason">Resolution Reason / Clinical Rationale *</label>
                  <input id="f-reason" name="reason" placeholder="e.g. Valid diagnosis verified in PCC chart; GDR attempted and documented" value="${esc(a.resolutionReason || '')}" />
                </div>

                <div class="today-form-group">
                  <label for="f-note">Reviewer Notes & Actions Taken *</label>
                  <textarea id="f-note" name="note" required placeholder="Detail the clinical assessment, prescriber communication, or chart review findings...">${esc(a.actionNote || '')}</textarea>
                </div>

                <div class="today-form-check" id="f-check-group" style="${currentStatus === 'resolved' ? '' : 'display:none;'}">
                  <input type="checkbox" id="f-evidence-check" name="evidence" />
                  <label for="f-evidence-check" style="margin:0;cursor:pointer;">
                    <strong>Evidence Reviewed:</strong> I confirm that I have reviewed the underlying imported records or PointClickCare chart evidence before resolving this finding.
                  </label>
                </div>
              </div>

              <div class="today-modal-footer">
                <button type="button" class="today-btn" id="followup-cancel">Cancel</button>
                <button type="submit" class="today-btn today-btn-primary">Save Follow-Up</button>
              </div>
            </form>
          `;

          document.body.appendChild(dialog);
          dialog.showModal();

          const closeModal = () => {
            dialog.close();
            dialog.remove();
          };

          dialog.querySelector('#followup-cancel')?.addEventListener('click', closeModal);
          dialog.querySelector('#followup-close-x')?.addEventListener('click', closeModal);

          // Dynamic show/hide for status dependencies
          const statusSelect = dialog.querySelector('#f-status');
          const snoozeGroup = dialog.querySelector('#f-snooze-group');
          const reasonGroup = dialog.querySelector('#f-reason-group');
          const checkGroup = dialog.querySelector('#f-check-group');

          statusSelect?.addEventListener('change', (e) => {
            const val = e.target.value;
            if (snoozeGroup) snoozeGroup.style.display = val === 'snoozed' ? '' : 'none';
            if (reasonGroup) reasonGroup.style.display = val === 'resolved' ? '' : 'none';
            if (checkGroup) checkGroup.style.display = val === 'resolved' ? '' : 'none';
          });

          // Form Submission
          dialog.querySelector('#followup-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const nextStatus = formData.get('status');
            const reviewer = String(formData.get('reviewer') || '').trim();
            const owner = String(formData.get('owner') || '').trim();
            const note = String(formData.get('note') || '').trim();
            const reason = String(formData.get('reason') || '').trim();
            const dueStr = formData.get('due');
            const snoozeStr = formData.get('snooze');
            const evidenceChecked = formData.get('evidence');

            try {
              if (!reviewer) throw new Error('Reviewer name is required.');
              if (!note) throw new Error('Reviewer note is required.');

              if (nextStatus === 'assigned' && !owner) {
                throw new Error('Assigned owner must be specified when assigning an alert.');
              }

              if (nextStatus === 'snoozed') {
                if (!snoozeStr) throw new Error('Snooze date is required when snoozing.');
                const snoozeTs = new Date(snoozeStr).getTime();
                if (!Number.isFinite(snoozeTs) || snoozeTs <= Date.now()) {
                  throw new Error('Snooze time must be set in the future.');
                }
              }

              if (nextStatus === 'resolved') {
                if (!reason) throw new Error('A documented resolution reason is required to resolve this alert.');
                if (!evidenceChecked) throw new Error('You must confirm review of the source evidence before resolving.');
              }

              const patch = {
                status: nextStatus,
                owner,
                note,
                ...(reason ? { resolutionReason: reason } : {}),
                ...(dueStr ? { dueDate: new Date(dueStr).getTime() } : {}),
                ...(snoozeStr && nextStatus === 'snoozed' ? { snoozedUntil: new Date(snoozeStr).getTime() } : {}),
                evidenceReviewed: evidenceChecked ? [a.evaluationId].filter(Boolean) : []
              };

              await api('snfUpdateAlert', {
                alertId: a.id,
                user: reviewer,
                patch
              });

              closeModal();
              toast(`Alert "${a.title}" updated successfully.`);
              await refresh();
              await this.render(container);
            } catch (err) {
              toast(err.message);
            }
          });
        });
      });
    }
  };
}
