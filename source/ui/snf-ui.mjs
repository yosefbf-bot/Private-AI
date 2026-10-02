// SNF Command Center & Clinical Surveillance UI Module
// Strictly read-only surveillance with persistent alert management
// Pipeline: Normalized clinical imports → Medication Change Detector → Psych Watch → Persistent Alert Center → Morning Brief

export function createSNFUI({ api, toast, esc, renderPage }) {
  let activeTab = 'medchanges'; // 'feeds' | 'medchanges' | 'psychwatch' | 'alerts' | 'brief' | 'qm' | 'issues' | 'resident'
  let alertSeverityFilter = 'unresolved'; // 'unresolved' | 'critical' | 'high' | 'review' | 'all'
  let alertSearchQuery = '';
  let medChangeFilter = 'all'; // 'all' | 'new' | 'highalert' | 'antipsychotic'
  let medChangeSearchQuery = '';
  let residentSearchQuery = '';
  let currentMetrics = null;
  let currentAlerts = [];
  let currentIssues = [];
  let currentMedChanges = [];
  let currentPsychWatch = {};
  let currentPCCReports = [];
  let currentBrief = '';
  let currentResidentTimeline = '';
  let resolvingAlertId = null;
  let assigningAlertId = null;

  function updateUniversalAlertBar(alertsSummary) {
    if (!alertsSummary) return;
    const critEl = document.getElementById('bar-crit-num');
    const highEl = document.getElementById('bar-high-num');
    const revEl = document.getElementById('bar-review-num');
    const bannerEl = document.getElementById('bar-crit-banner');
    const freshEl = document.getElementById('bar-pcc-freshness');
    const sidebarBadge = document.getElementById('snf-sidebar-badge');

    if (critEl) critEl.textContent = alertsSummary.critical || 0;
    if (highEl) highEl.textContent = alertsSummary.high || 0;
    if (revEl) revEl.textContent = alertsSummary.review || 0;

    if (bannerEl) {
      if (alertsSummary.critical > 0) {
        bannerEl.hidden = false;
        bannerEl.textContent = `⚠️ ${alertsSummary.critical} CRITICAL CLINICAL ITEM(S) REQUIRE IMMEDIATE REVIEW`;
      } else {
        bannerEl.hidden = true;
      }
    }

    if (freshEl && alertsSummary.feedStatus) {
      const fs = alertsSummary.feedStatus;
      freshEl.hidden=!fs.monitoringEnabled;
      freshEl.textContent = `PCC report date: ${fs.monitoringCurrentThroughFormatted} (${fs.isSurveillanceComplete ? 'Feeds current' : '⚠️ Feed Alert'})`;
      freshEl.className = 'alert-bar-pcc-status ' + (fs.isSurveillanceComplete ? 'status-ok' : 'status-warn');
    }

    if (sidebarBadge) {
      const total = alertsSummary.totalUnresolved || 0;
      sidebarBadge.textContent = total === 1 ? '1 Alert' : `${total} Alerts`;
      sidebarBadge.className = 'snf-sidebar-badge ' + (alertsSummary.critical > 0 ? 'badge-crit' : alertsSummary.high > 0 ? 'badge-high' : 'badge-normal');
    }
  }

  async function loadData() {
    try {
      const [metrics, alerts, issues, medChanges, psychWatch, pccReports] = await Promise.all([
        api('snfDashboard'),
        api('snfAlerts', {}),
        api('snfOpenIssues'),
        api('snfMedChanges'),
        api('snfPsychWatch'),
        api('snfPCCReports').catch(() => [])
      ]);
      currentMetrics = metrics;
      currentAlerts = alerts || [];
      currentIssues = issues || [];
      currentMedChanges = medChanges || [];
      currentPsychWatch = psychWatch || {};
      currentPCCReports = pccReports || [];
      if (metrics?.productionAlerts) {
        updateUniversalAlertBar(metrics.productionAlerts);
      }
    } catch (e) {
      toast('Failed to load SNF surveillance data: ' + e.message);
    }
  }

  async function render(container) {
    container.innerHTML = `<div class="page snf-page"><div class="snf-loading">Loading SNF Clinical Surveillance Center…</div></div>`;
    await loadData();
    renderHTML(container);
  }

  function renderHTML(container) {
    if (!currentMetrics) {
      container.innerHTML = `<div class="page snf-page"><div class="snf-error">Surveillance engine initializing or unavailable.</div></div>`;
      return;
    }

    const m = currentMetrics;
    const qm = m.qmWatch;
    const fs = m.feedStatus;
    const alertSum = m.alerts;
    if(activeTab==='feeds'&&!fs.monitoringEnabled)activeTab='medchanges';

    // Filter alerts
    let filteredAlerts = [...currentAlerts];
    if (alertSeverityFilter === 'unresolved') {
      filteredAlerts = filteredAlerts.filter(a => a.status !== 'resolved');
    } else if (alertSeverityFilter === 'critical') {
      filteredAlerts = filteredAlerts.filter(a => a.severity === 'critical' && a.status !== 'resolved');
    } else if (alertSeverityFilter === 'high') {
      filteredAlerts = filteredAlerts.filter(a => a.severity === 'high' && a.status !== 'resolved');
    } else if (alertSeverityFilter === 'review') {
      filteredAlerts = filteredAlerts.filter(a => a.severity === 'medium' && a.status !== 'resolved');
    }

    if (alertSearchQuery.trim()) {
      const q = alertSearchQuery.toLowerCase();
      filteredAlerts = filteredAlerts.filter(a =>
        (a.residentName && a.residentName.toLowerCase().includes(q)) ||
        (a.title && a.title.toLowerCase().includes(q)) ||
        (a.description && a.description.toLowerCase().includes(q)) ||
        (a.message && a.message.toLowerCase().includes(q)) ||
        (a.ruleCode && a.ruleCode.toLowerCase().includes(q)) ||
        (a.code && a.code.toLowerCase().includes(q))
      );
    }

    container.innerHTML = `
      <div class="page snf-page">
        ${m.demo ? '<p class="error-note" role="alert">DEMO DATA — NOT FOR CLINICAL USE</p>' : ''}
        <!-- HEADER -->
        <div class="snf-header">
          <div class="snf-header-titles">
            <div class="snf-headline">
              <h1>SNF Clinical Surveillance Command Center</h1>
              <span class="snf-mode-badge ${fs.isSurveillanceComplete ? 'badge-ok' : 'badge-warn'}">
                ${!fs.monitoringEnabled ? 'Imported clinical evidence · Review required' : fs.isSurveillanceComplete ? '● Surveillance Feeds Current' : '▲ Feeds Incomplete / Review Required'}
              </span>
            </div>
            <p class="snf-subtitle">
              Clinical analysis of normalized imported records · Feed validation · human review &amp; persistent alert lifecycle
            </p>
          </div>
          <div class="snf-header-actions">
            <button class="primary" id="snf-btn-run-rules" title="Re-evaluate all clinical rules on current dataset">⚡ Run Surveillance Engine</button>
            <button class="secondary" id="snf-btn-morning-brief">📋 Daily Morning Brief</button>
            <button class="secondary snf-pdf-export-btn" id="snf-btn-quarterly-pdf" title="Generate formatted quarterly report summaries on demand (PDF)">📄 PDF Export</button>
            <button class="secondary" data-act="view" data-view="today">Today / Demo workspace</button><button class="secondary" data-act="view" data-view="clinical-imports">Clinical imports</button>${fs.monitoringEnabled?`<button class="secondary" data-act="view" data-view="pcc">PCC Import Center</button>`:""}
          </div>
        </div>

        <!-- PERMANENT FAIL-SAFE NOTICE IF STALE OR MISSING -->
        ${fs.monitoringEnabled && !fs.isSurveillanceComplete ? `
          <div class="snf-stale-banner" role="alert">
            <strong>⚠️ Fail-Safe Monitoring Alert:</strong> ${esc(fs.feedGapsSummary || 'Missing or stale PointClickCare data feeds detected.')}
            <span class="snf-rule-quote">Rule: Missing or unverified data = ALERT, never GREEN.</span>
          </div>
        ` : ''}

        <!-- 5-STEP CORE SURVEILLANCE PIPELINE STEPPER -->
        <div class="snf-pipeline-stepper" role="navigation" aria-label="Surveillance Pipeline">
          ${fs.monitoringEnabled ? `<div class="pipeline-step ${activeTab === 'feeds' ? 'active' : ''}" data-nav="feeds" title="Step 1: PointClickCare Standardized Daily Feeds & Ingestion Freshness">
            <div class="step-num">1</div>
            <div class="step-body">
              <div class="step-title">PCC Import</div>
              <div class="step-sub">${fs.receivedFeedsCount}/${fs.expectedFeedsCount} Feeds Loaded</div>
            </div>
          </div>
          <div class="pipeline-arrow">➔</div>
          ` : ""}<div class="pipeline-step ${activeTab === 'medchanges' ? 'active' : ''}" data-nav="medchanges" title="Step 2: Medication Change Detector & High-Alert Surveillance">
            <div class="step-num">2</div>
            <div class="step-body">
              <div class="step-title">Med Changes</div>
              <div class="step-sub">${currentMedChanges.filter(c => c.changeType === 'New Order').length} New Starts · 24-48h</div>
            </div>
          </div>
          <div class="pipeline-arrow">➔</div>
          <div class="pipeline-step ${activeTab === 'psychwatch' ? 'active' : ''}" data-nav="psychwatch" title="Step 3: Psych Watch (Antipsychotics, Indications, PRN 14-Day, GDR Due)">
            <div class="step-num">3</div>
            <div class="step-body">
              <div class="step-title">Psych Watch</div>
              <div class="step-sub">${m.antipsychoticResidentsCount??"Unknown"} on APs · Review required</div>
            </div>
          </div>
          <div class="pipeline-arrow">➔</div>
          <div class="pipeline-step ${activeTab === 'alerts' ? 'active' : ''}" data-nav="alerts" title="Step 4: Persistent Clinical Alert Center — Alerts You Cannot Accidentally Miss">
            <div class="step-num">4</div>
            <div class="step-body">
              <div class="step-title">Persistent Alerts</div>
              <div class="step-sub">${alertSum.totalUnresolved} Unresolved</div>
            </div>
          </div>
          <div class="pipeline-arrow">➔</div>
          <div class="pipeline-step ${activeTab === 'brief' ? 'active' : ''}" data-nav="brief" title="Step 5: Executive Morning Clinical Standup & Administrator Brief">
            <div class="step-num">5</div>
            <div class="step-body">
              <div class="step-title">Morning Brief</div>
              <div class="step-sub">Daily Standup Briefing</div>
            </div>
          </div>
        </div>

        <!-- TOP METRIC CARDS -->
        <div class="snf-metrics-grid">
          <div class="snf-metric-card">
            <div class="metric-label">ACTIVE CENSUS</div>
            <div class="metric-value">${m.totalCensus} <span class="metric-sub">residents</span></div>
            <div class="metric-details">
              <span>Med A: ${m.medACensus || 0}</span> ·
              <span>Med B: ${m.medBCensus || 0}</span> ·
              <span>Long-Stay: ${qm.longStayDenominator}</span>
            </div>
          </div>

          <div class="snf-metric-card ${m.antipsychoticResidentsCount > 0 ? 'card-warning' : ''}">
            <div class="metric-label">PSYCHOTROPIC SURVEILLANCE</div>
            <div class="metric-value">${m.antipsychoticResidentsCount??"Unknown"} <span class="metric-sub">residents</span></div>
            <div class="metric-details">
              <span>Imported proportion: ${m.antipsychoticResidentsCount!=null && fs.feeds.census?.status==='ok' && m.totalCensus>0 ? (100*m.antipsychoticResidentsCount/m.totalCensus).toFixed(1)+"%":"Unknown"}</span> ·
              <span>New (24h): <strong>${m.antipsychoticMetrics.newAPs24h}</strong></span> · 
              <span>PRN Deadlines: <strong>${m.antipsychoticMetrics.prnDeadlines}</strong></span>
            </div>
          </div>

          <div class="snf-metric-card ${alertSum.critical > 0 ? 'card-crit' : alertSum.high > 0 ? 'card-high' : ''}">
            <div class="metric-label">UNRESOLVED CLINICAL ALERTS</div>
            <div class="metric-value">${alertSum.totalUnresolved} <span class="metric-sub">total</span></div>
            <div class="metric-details">
              <span class="text-crit">🔴 ${alertSum.critical} Critical</span> · 
              <span class="text-high">🟠 ${alertSum.high} High</span> · 
              <span class="text-rev">🟡 ${alertSum.review} Review</span>
            </div>
          </div>

          <div class="snf-metric-card card-qm">
            <div class="metric-label">ESTIMATED QM EXPOSURE</div>
            <div class="metric-value">${qm.estimatedRatePercentage==null?"Unknown":esc(qm.estimatedRatePercentage)+"%"} <span class="metric-sub">est. rate</span></div>
            <div class="metric-details">
              <span>Numerator: ${qm.potentialNumeratorCount}</span> / 
              <span>Denominator: ${qm.longStayDenominator}</span> ·
              <span>Pending Verify: ${qm.possibleExclusionsToVerifyCount}</span>
            </div>
          </div>
        </div>

        <!-- NAVIGATION TABS -->
        <div class="snf-tabs">
          <button class="snf-tab ${activeTab === 'medchanges' ? 'active' : ''}" data-tab="medchanges">
            💊 Med Change Detector (${currentMedChanges.length})
          </button>
          <button class="snf-tab ${activeTab === 'psychwatch' ? 'active' : ''}" data-tab="psychwatch">
            🧠 Psych Watch &amp; GDR (${m.antipsychoticResidentsCount??"Unknown"})
          </button>
          <button class="snf-tab ${activeTab === 'alerts' ? 'active' : ''}" data-tab="alerts">
            🚨 Alert Center (${alertSum.totalUnresolved})
          </button>
          <button class="snf-tab ${activeTab === 'brief' ? 'active' : ''}" data-tab="brief">
            📋 Morning Brief
          </button>
          ${fs.monitoringEnabled ? `<button class="snf-tab ${activeTab === 'feeds' ? 'active' : ''}" data-tab="feeds">
            📡 PCC Import (${fs.receivedFeedsCount}/${fs.expectedFeedsCount})
          </button>
          ` : ""}<button class="snf-tab ${activeTab === 'qm' ? 'active' : ''}" data-tab="qm">
            📊 QM Exposure (CMS 2026)
          </button>
          <button class="snf-tab ${activeTab === 'issues' ? 'active' : ''}" data-tab="issues">
            📌 Open Issues (${currentIssues.filter(i => i.status === 'open').length})
          </button>
          <button class="snf-tab ${activeTab === 'resident' ? 'active' : ''}" data-tab="resident">
            🔍 Resident Investigation
          </button>
          <button class="snf-tab ${activeTab === 'retention' ? 'active' : ''}" data-tab="retention">
            🛡️ Retention &amp; EMR Policy
          </button>
        </div>

        <!-- TAB CONTENT AREA -->
        <div class="snf-tab-body">
          ${renderActiveTab(m, filteredAlerts)}
        </div>
      </div>
    `;

    bindEvents(container);
  }

  function renderActiveTab(metrics, filteredAlerts) {
    if (activeTab === 'feeds') {
      return renderFeedsTab(metrics);
    }
    if (activeTab === 'medchanges') {
      return renderMedChangesTab(metrics);
    }
    if (activeTab === 'psychwatch') {
      return renderPsychWatchTab(metrics);
    }
    if (activeTab === 'alerts') {
      return renderAlertsTab(metrics, filteredAlerts);
    }
    if (activeTab === 'brief') {
      return renderBriefTab();
    }
    if (activeTab === 'qm') {
      return renderQMTab(metrics);
    }
    if (activeTab === 'issues') {
      return renderIssuesTab();
    }
    if (activeTab === 'resident') {
      return renderResidentTab();
    }
    if (activeTab === 'retention') {
      return renderRetentionTab(metrics);
    }
    return '';
  }

  // ==========================================
  // TAB 1: PCC IMPORT & FEEDS
  // ==========================================
  function renderFeedsTab(metrics) {
    const fs = metrics.feedStatus;
    const feeds = Object.values(fs.monitoringFeeds || {});

    return `
      <div class="feeds-pane">
        <div class="feeds-header">
          <h2>PointClickCare Daily Feeds &amp; Ingestion Freshness</h2>
          <p>
            Private AI checks supplied PointClickCare reports when they are imported or rules are run. Automatic synchronization is not configured.
            Per fail-safe protocol: <strong>Missing or unverified data = ALERT, never GREEN.</strong>
          </p>
        </div>

        <div class="feed-rule-banner">
          <div><strong>Surveillance Currency:</strong> Oldest received PCC report: ${esc(fs.monitoringCurrentThroughFormatted)}</div>
          <div><strong>Verification Status:</strong> ${fs.isSurveillanceComplete ? '<span class="text-ok">✓ All critical feeds verified active</span>' : '<span class="text-crit">⚠️ Missing feeds require attention</span>'}</div>
        </div>

        <div class="feeds-grid" style="margin-top: 16px;">
          ${feeds.map(f => `
            <div class="feed-card ${f.status!=='ok' ? 'feed-stale' : 'feed-ok'}">
              <div class="feed-card-head">
                <strong>${esc(f.name)}</strong>
                <span class="feed-badge ${f.status === 'ok' ? 'badge-ok' : f.status === 'stale' ? 'badge-stale' : 'badge-warn'}">
                  ${f.status.toUpperCase()}
                </span>
              </div>
              <div class="feed-card-body">
                <div>Imported Records: <strong>${f.lastRecordCount ?? "Unknown"}</strong></div>
                <div>Last Import: <small>${f.lastReceived ? new Date(f.lastReceived).toLocaleString() : 'Never'}</small></div>
                <div>Freshness: <strong>${f.status!=='ok' ? '⚠️ Unavailable / Stale / Incomplete' : '✓ Current'}</strong></div>
              </div>
            </div>
          `).join('')}
        </div>

        <div style="margin-top: 28px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <div>
              <h3 style="margin: 0 0 4px 0; font-size: 15px; font-weight: 700; color: #0f172a;">
                📋 Standard PointClickCare Surveillance Report Catalog (16 Monitored Feeds)
              </h3>
              <p style="margin: 0; font-size: 12px; color: #64748b;">
                Every report export is ingested, audited for safety discrepancies, cross-referenced for clinical compliance, and matched against CMS regulations.
              </p>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px;">
            ${(currentPCCReports.length ? currentPCCReports : [
              { id: 'orders', name: 'Physician Order Recap / Listing', category: 'Physician Orders', frequency: 'Daily', description: 'New, changed, discontinued orders, dose modifications, order routes' },
              { id: 'emar', name: 'eMAR Administration & Exception Audit', category: 'eMAR', frequency: 'Daily (each shift)', description: 'Omissions, refusals, late doses, PRN psychotropic administration audit' },
              { id: 'adt', name: 'Daily Census & ADT Activity Summary', category: 'ADT & Census', frequency: 'Daily (midnight)', description: 'New admits, hospital transfers, discharges, bed changes, payer updates' },
              { id: 'psych', name: 'Behavior & Side Effect Tracking Sheet', category: 'Behavior & Psych', frequency: 'Daily (each shift)', description: 'Target behaviors, non-pharmacological attempts, side effect monitoring' },
              { id: 'notes', name: '24-Hour Clinical & Shift Report', category: 'Clinical Notes', frequency: 'Daily (each shift)', description: 'Change of condition, physician calls, new symptoms, acute events' },
              { id: 'dx', name: 'Active Resident Diagnosis Listing', category: 'Clinical History', frequency: 'Daily / On-change', description: 'ICD-10 clinical diagnoses cross-referenced against high-risk medications' }
            ]).map(r => `
              <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; display: flex; flex-direction: column; justify-content: space-between;">
                <div>
                  <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
                    <strong style="font-size: 13px; color: #1e293b;">${esc(r.name)}</strong>
                    <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: #e0f2fe; color: #0369a1; white-space: nowrap;">
                      ${esc(r.frequency || 'Daily')}
                    </span>
                  </div>
                  <div style="font-size: 11px; font-weight: 600; color: #6366f1; margin-bottom: 6px;">${esc(r.category || 'General')}</div>
                  <p style="font-size: 12px; color: #475569; margin: 0 0 10px 0; line-height: 1.45;">${esc(r.description)}</p>
                </div>
                ${r.clinicalTriggers?.length ? `
                  <div style="border-top: 1px dashed #e2e8f0; padding-top: 8px; font-size: 11px; color: #991b1b;">
                    <strong>Surveillance Trigger:</strong> ${esc(r.clinicalTriggers.slice(0, 2).join('; '))}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================
  // TAB 2: MEDICATION CHANGE DETECTOR
  // ==========================================
  function renderMedChangesTab(metrics) {
    let list = [...currentMedChanges];

    // Filter
    if (medChangeFilter === 'new') {
      list = list.filter(c => c.changeType === 'New Order');
    } else if (medChangeFilter === 'highalert') {
      list = list.filter(c => c.isHighAlert);
    } else if (medChangeFilter === 'antipsychotic') {
      list = list.filter(c => c.isAntipsychotic);
    }

    if (medChangeSearchQuery.trim()) {
      const q = medChangeSearchQuery.toLowerCase();
      list = list.filter(c =>
        (c.residentName && c.residentName.toLowerCase().includes(q)) ||
        (c.drugName && c.drugName.toLowerCase().includes(q)) ||
        (c.drugClass && c.drugClass.toLowerCase().includes(q)) ||
        (c.prescriber && c.prescriber.toLowerCase().includes(q)) ||
        (c.indication && c.indication.toLowerCase().includes(q))
      );
    }

    const newStarts = currentMedChanges.filter(c => c.changeType === 'New Order').length;
    const highAlerts = currentMedChanges.filter(c => c.isHighAlert).length;
    const apStarts = currentMedChanges.filter(c => c.isAntipsychotic).length;
    const discCount = currentMedChanges.filter(c => c.changeType === 'Discontinued').length;

    return `
      <div class="med-changes-pane">
        <div class="med-summary-card">
          <h2>Medication Change Detector (24–48h Surveillance)</h2>
          <p>
            Deterministic detection of newly started medications, dose adjustments, and discontinuations from imported orders.
            Flags high-alert classes (antipsychotics, anticoagulants, insulins, opioids) and unverified clinical indications.
          </p>
          <div class="med-stat-grid">
            <div class="med-stat-box highlight">
              <div class="med-stat-val">${newStarts}</div>
              <div class="med-stat-lbl">New Starts (24–48h)</div>
            </div>
            <div class="med-stat-box highlight">
              <div class="med-stat-val">${highAlerts}</div>
              <div class="med-stat-lbl">High-Alert Meds</div>
            </div>
            <div class="med-stat-box">
              <div class="med-stat-val">${apStarts}</div>
              <div class="med-stat-lbl">New Antipsychotics</div>
            </div>
            <div class="med-stat-box">
              <div class="med-stat-val">${discCount}</div>
              <div class="med-stat-lbl">Discontinued Orders</div>
            </div>
          </div>
        </div>

        <!-- FILTERS & SEARCH -->
        <div class="alerts-controls-row">
          <div class="alert-filter-pills">
            <button class="filter-pill ${medChangeFilter === 'all' ? 'active' : ''}" data-medfilter="all">
              All Changes (${currentMedChanges.length})
            </button>
            <button class="filter-pill ${medChangeFilter === 'new' ? 'active' : ''}" data-medfilter="new">
              New Orders (${newStarts})
            </button>
            <button class="filter-pill pill-crit ${medChangeFilter === 'highalert' ? 'active' : ''}" data-medfilter="highalert">
              ⚠️ High-Alert (${highAlerts})
            </button>
            <button class="filter-pill pill-high ${medChangeFilter === 'antipsychotic' ? 'active' : ''}" data-medfilter="antipsychotic">
              🧠 Antipsychotics (${apStarts})
            </button>
          </div>
          <div class="alert-search-box">
            <input type="search" id="snf-med-search" placeholder="Search resident, drug, prescriber, indication..." value="${esc(medChangeSearchQuery)}" />
          </div>
        </div>

        <!-- TABLE OF MEDICATION CHANGES -->
        <table class="snf-table">
          <thead>
            <tr>
              <th>Resident</th>
              <th>Room</th>
              <th>Medication &amp; Class</th>
              <th>Change Type</th>
              <th>Dose / Route / Frequency</th>
              <th>Prescriber</th>
              <th>Documented Indication</th>
              <th>Surveillance Flag</th>
              <th>Imported source</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(c => {
              const isNew = c.changeType === 'New Order';
              const isDose = c.changeType === 'Dose Increase';
              const isDisc = c.changeType === 'Discontinued';
              const badgeClass = isNew ? 'change-new' : isDose ? 'change-increase' : 'change-discontinued';

              return `
                <tr>
                  <td>
                    <strong class="resident-link" data-act="view-resident" data-query="${esc(c.residentName)}">
                      👤 ${esc(c.residentName)}
                    </strong>
                  </td>
                  <td><span class="room-pill">${esc(c.room || '—')}</span></td>
                  <td>
                    <div><strong>${esc(c.drugName)}</strong></div>
                    <div>
                      ${c.isHighAlert ? `<span class="high-alert-tag">⚠️ High-Alert: ${esc(c.drugClass)}</span>` : `<span class="standard-med-tag">${esc(c.drugClass)}</span>`}
                    </div>
                  </td>
                  <td><span class="change-type-pill ${badgeClass}">${esc(c.changeType)}</span></td>
                  <td>
                    <div><strong>${esc(c.newDose || '')}</strong> ${esc(c.route || '')}</div>
                    <small>${esc(c.frequency || '')}</small>
                  </td>
                  <td><small>${esc(c.prescriber || 'Staff Physician')}</small></td>
                  <td>
                    ${c.indication ? (
                      c.indication.toLowerCase().includes('agitation') || c.indication.toLowerCase().includes('dementia') ?
                        `<span class="indication-badge indication-warn">⚠️ ${esc(c.indication)} (Review)</span>` :
                        `<span class="indication-badge indication-ok">✓ ${esc(c.indication)}</span>`
                    ) : '<span class="indication-badge indication-missing">❌ No Indication</span>'}
                  </td>
                  <td>
                    ${c.alertId ? `
                      <button class="secondary btn-sm" data-nav="alerts" title="${esc(c.alertTitle || 'View Alert')}">
                        🚨 ${esc(c.alertSeverity ? c.alertSeverity.toUpperCase() : 'ALERT')}
                      </button>
                    ` : '<span class="text-ok">✓ Routine</span>'}
                  </td>
                  <td><small style="font-family:monospace; color:#64748b;">${esc(c.sourceReport || 'Imported medication changes')}</small></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ==========================================
  // TAB 3: PSYCH WATCH
  // ==========================================
  function renderPsychWatchTab(metrics) {
    const ap = metrics.antipsychoticMetrics;
    const residents = metrics.antipsychoticResidents || [];
    const prnWatch = currentPsychWatch.prnWatch || [];
    const gdrs = currentPsychWatch.gdrs || [];

    return `
      <div class="psychwatch-pane">
        <div class="psychwatch-summary-card">
          <h2>Permanent Psychotropic Watch Dashboard</h2>
          <p>Supplemental screening of imported records. Rule sources, versions and evidence are available on each finding; clinical review is required.</p>
          <div class="psych-summary-stats">
            <div class="psych-stat">
              <span class="val">${metrics.antipsychoticResidentsCount}</span>
              <span class="lbl">Total Residents on Antipsychotics</span>
            </div>
            <div class="psych-stat ${ap.newAPs24h > 0 ? 'highlight-stat' : ''}">
              <span class="val">${ap.newAPs24h}</span>
              <span class="lbl">New Starts (Last 24 Hours)</span>
            </div>
            <div class="psych-stat">
              <span class="val">${ap.doseIncreases}</span>
              <span class="lbl">Dose Increases (7 Days)</span>
            </div>
            <div class="psych-stat">
              <span class="val">${ap.docGaps}</span>
              <span class="lbl">Documentation Review Gaps</span>
            </div>
            <div class="psych-stat ${ap.gdrAlerts > 0 ? 'highlight-stat' : ''}">
              <span class="val">${ap.gdrAlerts}</span>
              <span class="lbl">Pending GDR Reviews</span>
            </div>
            <div class="psych-stat ${ap.prnDeadlines > 0 ? 'highlight-stat' : ''}">
              <span class="val">${ap.prnDeadlines}</span>
              <span class="lbl">PRN 14-Day Limit Deadlines</span>
            </div>
          </div>
          <div style="margin-top: 14px;">
            <button class="secondary" id="btn-export-psych-pdf">📄 Export Psychotropic Surveillance (PDF)</button>
          </div>
        </div>

        <!-- FOCUSED SURVEILLANCE MODULES -->
        <div class="psych-modules-grid">
          <div class="psych-module-card"><h4>Diagnosis / behavior documentation review</h4><p>Review the current alert list and imported source evidence. Missing documentation in an import does not prove documentation is absent from the complete clinical record.</p></div>

          <!-- 3. PRN 14-DAY LIMIT COUNTDOWN -->
          <div class="psych-module-card">
            <h4>
              <span>⏱️ PRN 14-Day Limit Watch</span>
              <span class="badge-rule">PRN-014</span>
            </h4>
            <p>Review PRN antipsychotic duration and prescriber evaluation before renewal under 42 CFR 483.45(e)(5).</p>
            ${prnWatch.length ? prnWatch.map(p => `
              <div class="prn-meter-card">
                <div class="prn-meter-header">
                  <strong>${esc(p.residentName)} (${esc(p.room)})</strong>
                  <span class="${p.isExceeded ? 'text-crit' : 'text-high'}">${esc(p.statusLabel)}</span>
                </div>
                <div><small>${esc(p.medication)} ${esc(p.dosage || '')} (Ordered: ${new Date(p.orderDate).toLocaleDateString()})</small></div>
                <div class="prn-meter-bar-track">
                  <div class="prn-meter-bar-fill ${p.isExceeded ? 'fill-danger' : p.isWarning ? 'fill-warn' : 'fill-ok'}" style="width: ${Math.min(100, Math.round((p.daysActive / 14) * 100))}%"></div>
                </div>
                <div class="prn-meter-footer">
                  <span>Days active: <strong>${p.daysActive}</strong> / 14</span>
                  <span>${p.isExceeded ? '<strong class="text-crit">PHYSICIAN EVALUATION MANDATED</strong>' : `${p.daysRemaining} days remaining`}</span>
                </div>
              </div>
            `).join('') : '<p>No active PRN psychotropics currently past day 7.</p>'}
          </div>

          <!-- 4. GDR DUE TRACKER -->
          <div class="psych-module-card">
            <h4>
              <span>📉 Gradual Dose Reduction (GDR) Due</span>
              <span class="badge-rule">GDR-001</span>
            </h4>
            <p>Surveillance for psychotropic regimens >180 days with no documented dose reduction attempt or physician contraindication.</p>
            ${gdrs.length ? gdrs.map(g => `
              <div style="padding:8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px; margin-bottom:8px; font-size:12px;">
                <div style="display:flex; justify-content:space-between;">
                  <strong>${esc(g.residentName)}</strong>
                  <span class="badge-status ${g.isContraindicated ? 'status-resolved' : 'status-new'}">${g.isContraindicated ? 'CONTRAINDICATION ON FILE' : 'GDR DUE'}</span>
                </div>
                <div>${esc(g.medication)} · Last GDR: ${g.lastGDRDate ? new Date(g.lastGDRDate).toLocaleDateString() : 'None documented'}</div>
                <div style="color:#64748b; margin-top:2px;">Rationale: ${esc(g.clinicalRationale || 'No clinical rationale recorded.')}</div>
              </div>
            `).join('') : '<p>No GDR tracking records found in imported data. Review the complete record and data health before drawing conclusions.</p>'}
          </div>
        </div>

        <!-- FULL ACTIVE ANTIPSYCHOTIC REGIMENS TABLE -->
        <div class="psych-residents-table-wrap" style="margin-top:20px;">
          <h3>Active Antipsychotic &amp; Psychotropic Regimens (${residents.length})</h3>
          <table class="snf-table">
            <thead>
              <tr>
                <th>Resident</th>
                <th>Room</th>
                <th>Medication &amp; Dose</th>
                <th>Schedule</th>
                <th>Diagnoses / Indications</th>
                <th>GDR Due</th>
                <th>Documentation Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${residents.map(r => `
                <tr>
                  <td>
                    <strong class="resident-link" data-act="view-resident" data-query="${esc(r.name)}">
                      👤 ${esc(r.name)}
                    </strong>
                  </td>
                  <td>${esc(r.room)}</td>
                  <td>
                    ${r.orders?.map(o => `<div><strong>${esc(o.name)}</strong> <small>${esc(o.dosage || '')} ${esc(o.route || '')}</small></div>`).join('') || '—'}
                  </td>
                  <td>${r.orders?.map(o => esc(o.schedule || 'Routine')).join(', ') || '—'}</td>
                  <td>
                    ${r.diagnoses?.map(d => `<span class="diag-chip">${esc(d.name)} (${esc(d.code)})</span>`).join(' ') || '<span class="text-danger">⚠️ No matching diagnosis</span>'}
                  </td>
                  <td>
                    <span class="gdr-badge ${r.gdrDueDays !== null && r.gdrDueDays <= 14 ? 'gdr-soon' : ''}">
                      ${r.gdrDueDays !== null ? (r.gdrDueDays <= 0 ? 'OVERDUE' : `${r.gdrDueDays} days`) : 'Review Needed'}
                    </span>
                  </td>
                  <td>
                    ${r.hasBehaviorMonitoring ? '<span class="text-ok">✓ Behavior log active</span>' : '<span class="text-crit">❌ No Behavior logs</span>'}
                  </td>
                  <td>
                    <button class="secondary btn-sm" data-act="view-resident" data-query="${esc(r.name)}">Investigate</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==========================================
  // TAB 4: PERSISTENT ALERT CENTER
  // ==========================================
  function renderAlertsTab(metrics, alerts) {
    return `
      <div class="alerts-tab-pane">
        <div class="alerts-controls-row">
          <div class="alert-filter-pills">
            <button class="filter-pill ${alertSeverityFilter === 'unresolved' ? 'active' : ''}" data-filter="unresolved">
              All Unresolved (${metrics.alerts.totalUnresolved})
            </button>
            <button class="filter-pill pill-crit ${alertSeverityFilter === 'critical' ? 'active' : ''}" data-filter="critical">
              🔴 Critical (${metrics.alerts.critical})
            </button>
            <button class="filter-pill pill-high ${alertSeverityFilter === 'high' ? 'active' : ''}" data-filter="high">
              🟠 High (${metrics.alerts.high})
            </button>
            <button class="filter-pill pill-rev ${alertSeverityFilter === 'review' ? 'active' : ''}" data-filter="review">
              🟡 Review (${metrics.alerts.review})
            </button>
            <button class="filter-pill ${alertSeverityFilter === 'all' ? 'active' : ''}" data-filter="all">
              All Alerts History (${currentAlerts.length})
            </button>
          </div>
          <div class="alert-search-box">
            <input type="search" id="snf-alert-search" placeholder="Search resident, medication, rule..." value="${esc(alertSearchQuery)}" />
          </div>
        </div>

        ${alerts.length === 0 ? `
          <div class="snf-empty-card">
            <h3>No alerts matching the selected criteria</h3>
            <p>All clinical surveillance items in this view are resolved or none were detected.</p>
          </div>
        ` : `
          <div class="alerts-list">
            ${alerts.map(a => renderAlertCard(a)).join('')}
          </div>
        `}
      </div>
    `;
  }

  function renderAlertCard(a) {
    const isResolving = resolvingAlertId === a.id;
    const isAssigning = assigningAlertId === a.id;
    const ruleCode = a.ruleCode || a.code || 'CLIN-001';
    const desc = a.description || a.message || '';
    const room = a.room || a.residentRoom || 'Facility';

    return `
      <div class="snf-alert-card severity-${esc(a.severity)} status-${esc(a.status)}" id="alert-${esc(a.id)}">
        <div class="alert-card-header">
          <div class="alert-badges">
            <span class="badge-severity severity-${esc(a.severity)}">${esc(a.severity.toUpperCase())}</span>
            <span class="badge-status status-${esc(a.status)}">${esc(a.status.toUpperCase())}</span>
            <span class="badge-rule">${esc(ruleCode)}</span>
            <span class="badge-category">${esc(a.category || 'Surveillance')}</span>
          </div>
          <div class="alert-meta">
            <span class="alert-date">${new Date(a.createdAt).toLocaleString(undefined, {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'})}</span>
          </div>
        </div>

        <div class="alert-card-title-row">
          <div class="alert-resident-info">
            <strong class="resident-link" data-act="view-resident" data-query="${esc(a.residentName)}">
              👤 ${esc(a.residentName)}
            </strong>
            <span class="room-pill">${esc(room)}</span>
          </div>
          <h3 class="alert-title">${esc(a.title)}</h3>
        </div>

        <p class="alert-desc">${esc(desc)}</p>

        <!-- WHY WAS THIS FLAGGED? COLLAPSIBLE -->
        <details class="alert-details-accordion" ${a.severity === 'critical' ? 'open' : ''}>
          <summary><strong>🔍 WHY WAS THIS FLAGGED?</strong> (Deterministic Clinical Rationale)</summary>
          <div class="accordion-content">
            ${a.whyFlagged?.length ? `
              <div class="evidence-block">
                <ul>${a.whyFlagged.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
              </div>
            ` : a.reason ? `
              <div class="evidence-block">
                <p>${esc(a.reason)}</p>
              </div>
            ` : ''}
            ${a.citations?.length ? `
              <div class="evidence-block citations-block">
                <strong>Survey Citations &amp; Regulations:</strong>
                <div class="citation-tags">${a.citations.map(c => `<span class="citation-tag">${esc(c)}</span>`).join(' ')}</div>
              </div>
            ` : ''}
          </div>
        </details>

        <!-- VIEW SOURCES COLLAPSIBLE -->
        <details class="alert-details-accordion">
          <summary><strong>📁 VIEW SOURCES</strong> (Imported Report File &amp; Row Evidence)</summary>
          <div class="accordion-content source-details-box">
            ${a.sources?.length ? a.sources.map(s => `
              <div class="source-item" style="padding:6px; border-bottom:1px solid #e2e8f0; margin-bottom:4px;">
                <div><strong>Report:</strong> <code>${esc(s.sourceReport || s.reportType || s.reportName)}</code></div>
                <div><strong>Imported / Processed:</strong> <small>${s.reportDateTime ? new Date(s.reportDateTime).toLocaleString() : 'Cycle Ingestion'}</small></div>
                ${s.originalRow ? `<div><strong>Source Row:</strong> <code>${esc(s.originalRow)}</code></div>` : ''}
              </div>
            `).join('') : '<p>Source metadata is captured during report ingestion.</p>'}
          </div>
        </details>

        <!-- ACTIONS ROW -->
        <div class="alert-actions-bar">
          <div class="alert-assignments">
            ${a.assignedTo ? `<span>Assigned to: <strong>${esc(a.assignedTo)}</strong></span>` : '<span class="unassigned">Unassigned</span>'}
          </div>
          <div class="alert-buttons">
            ${a.status === 'new' ? `
              <button class="secondary btn-ack" data-act="ack-alert" data-id="${esc(a.id)}">✓ Acknowledge</button>
            ` : ''}
            ${a.status !== 'resolved' ? `
              <button class="secondary" data-act="assign-prompt" data-id="${esc(a.id)}">👤 Assign</button>
              <button class="primary btn-resolve" data-act="resolve-prompt" data-id="${esc(a.id)}">✓ Resolve Item</button>
            ` : `
              <span class="resolved-note">Resolved: ${esc(a.resolutionNote || 'Completed')}</span>
            `}
          </div>
        </div>

        <!-- INLINE ASSIGN PANEL -->
        ${isAssigning ? `
          <div class="inline-action-panel">
            <h4>Assign Alert to Clinical Team Member</h4>
            <div class="assign-form">
              <label>Select Role / Assignee:
                <select id="assign-select-${esc(a.id)}">
                  <option value="Director of Nursing (DON)">Director of Nursing (DON)</option>
                  <option value="Medical Director / Attending Physician">Medical Director / Attending Physician</option>
                  <option value="Consultant Pharmacist">Consultant Pharmacist</option>
                  <option value="MDS Coordinator">MDS Coordinator</option>
                  <option value="Unit Charge Nurse">Unit Charge Nurse</option>
                  <option value="Social Services Director">Social Services Director</option>
                </select>
              </label>
              <label>Assignment Note:
                <input type="text" id="assign-note-${esc(a.id)}" placeholder="e.g., Requested physician review on Friday rounds" />
              </label>
              <div class="button-row">
                <button class="primary" data-act="do-assign" data-id="${esc(a.id)}">Confirm Assignment</button>
                <button class="secondary" data-act="cancel-assign">Cancel</button>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- INLINE RESOLVE PANEL -->
        ${isResolving ? `
          <div class="inline-action-panel resolve-panel">
            <h4>Resolve Clinical Alert (Permanent Audit Record)</h4>
            <p class="resolve-help">Document the clinical action or verification that satisfies this alert.</p>
            <div class="resolve-form">
              <label>Resolution Category:
                <select id="resolve-status-${esc(a.id)}">
                  <option value="documentation_completed">Documentation Completed in Clinical Record</option>
                  <option value="medication_discontinued">Medication Discontinued</option>
                  <option value="diagnosis_verified">Diagnosis Verified &amp; Documented by MD</option>
                  <option value="gdr_initiated">Gradual Dose Reduction (GDR) Initiated</option>
                  <option value="clinical_contraindication_documented">Physician Clinical Contraindication Documented</option>
                  <option value="review_concluded">Clinical Review Concluded (Acceptable)</option>
                </select>
              </label>
              <label>Mandatory Action Note:
                <textarea id="resolve-note-${esc(a.id)}" rows="2" placeholder="Detail the medical record review, physician discussion, or change order..."></textarea>
              </label>
              <div class="button-row">
                <button class="primary" data-act="do-resolve" data-id="${esc(a.id)}">Submit Resolution</button>
                <button class="secondary" data-act="cancel-resolve">Cancel</button>
              </div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // ==========================================
  // TAB 5: MORNING BRIEF
  // ==========================================
  function renderBriefTab() {
    return `
      <div class="brief-pane">
        <div class="reports-header">
          <h2>Daily Morning Clinical &amp; Standup Brief</h2>
          <p>
            Deterministic executive briefing summarizing overnight events, 24h medication changes,
            high-alert psychotropic surveillance, and persistent unmissable clinical alerts.
          </p>
          <div class="reports-action-bar">
            <button class="primary" id="btn-export-brief-pdf">📄 Download Morning Brief (PDF)</button>
            <button class="secondary" id="btn-refresh-brief">🔄 Refresh Brief</button>
            <button class="secondary" id="btn-copy-brief">📋 Copy to Clipboard</button>
            <button class="secondary" id="btn-print-brief">🖨️ Print Brief</button>
          </div>
        </div>

        <div class="brief-paper" id="brief-paper-container">
          ${currentBrief ? formatBriefHTML(currentBrief) : `
            <div style="text-align:center; padding: 24px; color:#64748b;">
              <p>Click "Refresh Morning Brief" to generate the daily standup summary.</p>
            </div>
          `}
        </div>
      </div>
    `;
  }

  function formatBriefHTML(text) {
    // Converts markdown-like brief text into structured clean HTML
    const lines = text.split('\n');
    let html = '';
    let inList = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (inList) { html += '</ul>'; inList = false; }
        continue;
      }
      if (trimmed.startsWith('# ')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<h1>${esc(trimmed.slice(2))}</h1>`;
      } else if (trimmed.startsWith('## ')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<h2>${esc(trimmed.slice(3))}</h2>`;
      } else if (trimmed.startsWith('### ')) {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<h3>${esc(trimmed.slice(4))}</h3>`;
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += `<li>${esc(trimmed.slice(2))}</li>`;
      } else {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<p style="margin: 6px 0;">${esc(trimmed)}</p>`;
      }
    }
    if (inList) { html += '</ul>'; }
    return html;
  }

  // ==========================================
  // TAB 6: QM EXPOSURE
  // ==========================================
  function renderQMTab(metrics) {
    const qm = metrics.qmWatch;

    return `
      <div class="qm-pane">
        <div class="qm-card">
          <h2>CMS 2026 Quality Measure Surveillance: Antipsychotic Use (Long Stay)</h2>
          <p class="qm-desc">
            ${esc(qm.note)}
          </p>

          <div class="qm-score-display">
            <div class="qm-score-circle">
              <span class="qm-percent">${qm.estimatedRatePercentage==null?"Unknown":esc(qm.estimatedRatePercentage)+"%"}</span>
              <span class="qm-label">Estimated Rate</span>
            </div>
            <div class="qm-breakdown-box">
              <div class="qm-row">
                <span>Long-Stay Denominator (Residents &gt;100 days):</span>
                <strong>${qm.longStayDenominator}</strong>
              </div>
              <div class="qm-row">
                <span>Potential Numerator (Long-Stay on Antipsychotics):</span>
                <strong class="text-crit">${qm.potentialNumeratorCount}</strong>
              </div>
              <div class="qm-row">
                <span>Imported diagnoses requiring exclusion review:</span>
                <strong class="text-ok">${qm.knownExclusionsCount}</strong>
              </div>
              <div class="qm-row">
                <span>Unconfirmed Exclusions Requiring Verification:</span>
                <strong class="text-high">${qm.possibleExclusionsToVerifyCount}</strong>
              </div>
            </div>
          </div>

          <div class="qm-exclusions-guide">
            <h3>Standard CMS QM Exclusions:</h3>
            <div class="exclusions-list">
              <div class="exclusion-item">
                <strong>Schizophrenia Spectrum:</strong> ICD-10 F20.x, F25.x
              </div>
              <div class="exclusion-item">
                <strong>Tourette's Disorder:</strong> ICD-10 F95.2
              </div>
              <div class="exclusion-item">
                <strong>Huntington's Disease:</strong> ICD-10 G10
              </div>
            </div>
            <p class="exclusions-note">
              <em>Note:</em> Dementia with behavioral disturbance alone is <strong>NOT</strong> an exclusion.
              Surveyors prioritize facilities where antipsychotics are prescribed without documented, exclusionary neuropsychiatric conditions.
            </p>
            <div style="margin-top:16px; display:flex; gap:10px; align-items:center;">
              <button class="primary" id="btn-export-qm-quarterly-pdf">📄 Generate Formatted Quarterly Report Summary (PDF)</button>
              <span style="font-size:12px; color:var(--text-muted, #64748b);">On-demand quarterly compliance &amp; QM summary export</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================
  // TAB 7: OPEN ISSUES
  // ==========================================
  function renderIssuesTab() {
    const openIssues = currentIssues.filter(i => i.status === 'open');

    return `
      <div class="issues-pane">
        <div class="issues-header">
          <h2>Open Clinical Issues Engine</h2>
          <p>Continuous persistence across clinical report imports until corrected in source records or clinically verified.</p>
        </div>

        ${openIssues.length === 0 ? `
          <div class="snf-empty-card">
            <h3>No Active Clinical Issues</h3>
            <p>All identified gaps and surveillance findings are currently resolved.</p>
          </div>
        ` : `
          <table class="snf-table">
            <thead>
              <tr>
                <th>Resident</th>
                <th>Issue Description</th>
                <th>Severity</th>
                <th>Category</th>
                <th>First Detected</th>
                <th>Last Detected</th>
                <th>Owner</th>
                <th>Action Note</th>
              </tr>
            </thead>
            <tbody>
              ${openIssues.map(i => `
                <tr>
                  <td><strong>${esc(i.residentName)}</strong></td>
                  <td>${esc(i.issue)}</td>
                  <td><span class="badge-severity severity-${esc(i.severity)}">${esc(i.severity.toUpperCase())}</span></td>
                  <td>${esc(i.category)}</td>
                  <td>${new Date(i.firstDetected).toLocaleDateString()}</td>
                  <td>${new Date(i.lastDetected).toLocaleDateString()}</td>
                  <td>${esc(i.owner || 'Unassigned')}</td>
                  <td><small>${esc(i.actionNote || 'Pending clinical review')}</small></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>
    `;
  }

  // ==========================================
  // TAB 9: RETENTION & EMR GOVERNANCE
  // ==========================================
  function renderRetentionTab(metrics) {
    const settings = metrics.settings || {};
    const emrPlatform = settings.emrPlatform || 'Generic imported clinical records';

    return `
      <div class="retention-pane">
        <div class="reports-header" style="margin-bottom:20px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
            <div>
              <h2 style="margin:0 0 6px 0;">🛡️ Surveillance Data Retention &amp; EMR Policy</h2>
              <p style="margin:0; color:#475569; max-width:760px;">
                Formal operational governance and data lifecycle management for SNF clinical surveillance, predictive triage, and decision support.
              </p>
            </div>
            <button class="primary" id="btn-snf-cleanup">🧹 Run Surveillance Retention Cleanup Now</button>
          </div>
        </div>

        <!-- 1. REGULATORY SCOPE & NON-EHR NOTICE -->
        <div class="card" style="border-left:4px solid #0284c7; background:#f0f9ff; padding:18px; margin-bottom:18px; border-radius:8px;">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
            <span style="font-size:20px;">ℹ️</span>
            <h3 style="margin:0; font-size:16px; color:#0369a1;">Supplemental Analytics Only · Regulatory Storage Notice</h3>
          </div>
          <p style="margin:0 0 8px 0; font-size:14px; color:#0f172a; line-height:1.5;">
            This application operates strictly as a <strong>supplemental clinical surveillance and decision-support instrument</strong>. It is <strong>NOT</strong> an official Designated Record Set or Electronic Health Record (EHR).
          </p>
          <p style="margin:0; font-size:13px; color:#334155; line-height:1.5;">
            By administrative governance, this operational analytics tool is <strong>exempt from CMS 42 CFR § 483 long-term medical record retention rules and the HIPAA 6-year archival mandate</strong>. Surveillance data is managed under a rolling operational retention schedule designed specifically for quarterly clinical audits without permanent data accumulation.
          </p>
        </div>

        <!-- 2. READ-ONLY EMR DATA GUARANTEE -->
        <div class="card" style="border-left:4px solid #059669; background:#ecfdf5; padding:18px; margin-bottom:18px; border-radius:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:20px;">🔒</span>
              <h3 style="margin:0; font-size:16px; color:#047857;">Immutable Read-Only EMR Feeds</h3>
            </div>
            <span class="pill" style="background:#059669; color:#fff; font-weight:600; font-size:12px;">READ-ONLY ENFORCED</span>
          </div>
          <p style="margin:0 0 8px 0; font-size:14px; color:#0f172a; line-height:1.5;">
            Active EMR Platform Source: <strong>${esc(emrPlatform)}</strong> (Configurable for PointClickCare, MatrixCare, Netsmart, Epic, etc.).
          </p>
          <p style="margin:0; font-size:13px; color:#334155; line-height:1.5;">
            EMR data is strictly <strong>read-only and immutable</strong>. The surveillance engine performs parse-and-index operations only. No EMR records, physician orders, administration logs, or clinical narratives can ever be edited, altered, or overwritten within this application.
          </p>
        </div>

        <!-- 3. TIERED RETENTION SCHEDULE GRID -->
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:16px; margin-bottom:20px;">
          <div class="card" style="padding:16px; border-radius:8px; border:1px solid #e2e8f0; background:#fff;">
            <div style="font-size:12px; font-weight:600; text-transform:uppercase; color:#64748b; margin-bottom:4px;">EMR Feeds &amp; Raw Data</div>
            <div style="font-size:28px; font-weight:700; color:#0f172a; margin-bottom:6px;">100 Days</div>
            <p style="font-size:13px; color:#475569; margin:0; line-height:1.5;">
              Held for 100 days so facility QAPI committees and clinical teams can perform complete <strong>90-day quarterly audits</strong> (with a 10-day buffer) before automatic purging.
            </p>
          </div>

          <div class="card" style="padding:16px; border-radius:8px; border:1px solid #e2e8f0; background:#fff;">
            <div style="font-size:12px; font-weight:600; text-transform:uppercase; color:#64748b; margin-bottom:4px;">Resulted Reports &amp; Analytics</div>
            <div style="font-size:28px; font-weight:700; color:#0284c7; margin-bottom:6px;">200 Days</div>
            <p style="font-size:13px; color:#475569; margin:0; line-height:1.5;">
              Saved PDF reports and analytics derived from raw feeds receive an <strong>additional 100 days</strong> of retention (total 200 days) to support multi-quarter trend comparisons.
            </p>
          </div>

          <div class="card" style="padding:16px; border-radius:8px; border:1px solid #e2e8f0; background:#fff;">
            <div style="font-size:12px; font-weight:600; text-transform:uppercase; color:#64748b; margin-bottom:4px;">Resolved Alerts &amp; Flags</div>
            <div style="font-size:28px; font-weight:700; color:#059669; margin-bottom:6px;">100 Days</div>
            <p style="font-size:13px; color:#475569; margin:0; line-height:1.5;">
              Clinical alerts and issues that have been verified, signed off, or resolved are retained for 100 days post-resolution. <strong>Unresolved alerts remain active indefinitely</strong>.
            </p>
          </div>

          <div class="card" style="padding:16px; border-radius:8px; border:1px solid #e2e8f0; background:#fff;">
            <div style="font-size:12px; font-weight:600; text-transform:uppercase; color:#64748b; margin-bottom:4px;">Discharged Residents</div>
            <div style="font-size:28px; font-weight:700; color:#475569; margin-bottom:6px;">100 Days</div>
            <p style="font-size:13px; color:#475569; margin:0; line-height:1.5;">
              Residents who have been discharged follow the standard 100-day rolling cycle from their discharge date, keeping the surveillance roster focused on active census.
            </p>
          </div>
        </div>

        <!-- 4. LIVE AUDIT & STATUS METRICS -->
        <div class="card" style="padding:16px; border-radius:8px; border:1px solid #e2e8f0; background:#f8fafc;">
          <h4 style="margin:0 0 12px 0; font-size:14px; font-weight:600; color:#334155;">Active Surveillance Census &amp; Retention Diagnostics</h4>
          <div style="display:flex; flex-wrap:wrap; gap:24px; font-size:13px;">
            <div><span style="color:#64748b;">Active Census:</span> <strong>${metrics.totalCensus || 0} residents</strong></div>
            <div><span style="color:#64748b;">Active Alerts Under Surveillance:</span> <strong class="text-crit">${metrics.alertsSummary?.totalUnresolved || 0}</strong></div>
            <div><span style="color:#64748b;">Resolved Alerts on Hold:</span> <strong class="text-ok">${metrics.alertsSummary?.resolved || 0}</strong></div>
            <div><span style="color:#64748b;">Export Format:</span> <strong>PDF (Portable Document Format)</strong></div>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================
  // TAB 8: RESIDENT INVESTIGATION
  // ==========================================
  function renderResidentTab() {
    return `
      <div class="resident-search-pane">
        <div class="resident-search-header">
          <h2>Resident Clinical Surveillance Timeline</h2>
          <p>Search any resident by name or room to view their aggregated clinical orders, psychotropic history, and surveillance alerts.</p>
          <div class="resident-search-bar">
            <input type="search" id="snf-resident-input" placeholder="Enter resident name or ID..." value="${esc(residentSearchQuery)}" />
            <button class="primary" id="snf-btn-search-resident">Search Timeline</button>
          </div>
        </div>

        <div id="resident-timeline-results">
          ${currentResidentTimeline ? `
            <div class="resident-timeline-box">
              <pre class="timeline-pre">${esc(currentResidentTimeline)}</pre>
            </div>
          ` : `
            <div class="snf-empty-card">
              <p>Type a resident name above to load their comprehensive clinical surveillance timeline.</p>
            </div>
          `}
        </div>
      </div>
    `;
  }

  // ==========================================
  // EVENT BINDINGS
  // ==========================================
  function bindEvents(container) {
    // Pipeline stepper clicks
    container.querySelectorAll('[data-nav]').forEach(el => {
      el.addEventListener('click', async () => {
        activeTab = el.dataset.nav;
        if (activeTab === 'brief' && !currentBrief) {
          try {
            const res = await api('snfMorningBrief');
            currentBrief = res.text || '';
          } catch {}
        }
        renderHTML(container);
      });
    });

    // Navigation tabs
    container.querySelectorAll('.snf-tab').forEach(tab => {
      tab.addEventListener('click', async () => {
        activeTab = tab.dataset.tab;
        if (activeTab === 'brief' && !currentBrief) {
          try {
            const res = await api('snfMorningBrief');
            currentBrief = res.text || '';
          } catch {}
        }
        renderHTML(container);
      });
    });

    // Med change filter pills
    container.querySelectorAll('[data-medfilter]').forEach(pill => {
      pill.addEventListener('click', () => {
        medChangeFilter = pill.dataset.medfilter;
        renderHTML(container);
      });
    });

    // Med change search
    const medSearch = container.querySelector('#snf-med-search');
    if (medSearch) {
      medSearch.addEventListener('input', (e) => {
        medChangeSearchQuery = e.target.value;
        renderHTML(container);
      });
    }

    // Alert filter pills
    container.querySelectorAll('.filter-pill[data-filter]').forEach(pill => {
      pill.addEventListener('click', () => {
        alertSeverityFilter = pill.dataset.filter;
        renderHTML(container);
      });
    });

    // Alert search input
    const alertSearch = container.querySelector('#snf-alert-search');
    if (alertSearch) {
      alertSearch.addEventListener('input', (e) => {
        alertSearchQuery = e.target.value;
        const alertsList = container.querySelector('.alerts-list');
        const filtered = currentAlerts.filter(a => {
          if (alertSeverityFilter === 'unresolved' && a.status === 'resolved') return false;
          if (alertSeverityFilter === 'critical' && (a.severity !== 'critical' || a.status === 'resolved')) return false;
          if (alertSeverityFilter === 'high' && (a.severity !== 'high' || a.status === 'resolved')) return false;
          if (alertSeverityFilter === 'review' && (a.severity !== 'review' || a.status === 'resolved')) return false;
          const q = alertSearchQuery.toLowerCase();
          return !q ||
            (a.residentName && a.residentName.toLowerCase().includes(q)) ||
            (a.title && a.title.toLowerCase().includes(q)) ||
            (a.description && a.description.toLowerCase().includes(q)) ||
            (a.message && a.message.toLowerCase().includes(q)) ||
            (a.ruleCode && a.ruleCode.toLowerCase().includes(q)) ||
            (a.code && a.code.toLowerCase().includes(q));
        });
        if (alertsList) {
          alertsList.innerHTML = filtered.map(a => renderAlertCard(a)).join('');
          bindCardEvents(container);
        }
      });
    }

    // Top action buttons
    const btnRunRules = container.querySelector('#snf-btn-run-rules');
    if (btnRunRules) {
      btnRunRules.addEventListener('click', async () => {
        btnRunRules.disabled = true;
        btnRunRules.textContent = 'Running Rules Engine…';
        try {
          await api('snfRunRules', { user: 'Nurse Clinician' });
          toast('Surveillance rules re-evaluated across the imported clinical records.');
          await loadData();
          renderHTML(container);
        } catch (e) {
          toast('Error running rules: ' + e.message);
        } finally {
          btnRunRules.disabled = false;
          btnRunRules.textContent = '⚡ Run Surveillance Engine';
        }
      });
    }

    const btnMorning = container.querySelector('#snf-btn-morning-brief');
    if (btnMorning) {
      btnMorning.addEventListener('click', async () => {
        activeTab = 'brief';
        try {
          const res = await api('snfMorningBrief');
          currentBrief = res.text || '';
        } catch (e) {
          toast('Error loading Morning Brief: ' + e.message);
        }
        renderHTML(container);
      });
    }

    // Morning brief tab buttons
    const btnExportBriefPdf = container.querySelector('#btn-export-brief-pdf');
    if (btnExportBriefPdf) {
      btnExportBriefPdf.addEventListener('click', async () => {
        btnExportBriefPdf.disabled = true;
        btnExportBriefPdf.textContent = 'Generating PDF…';
        try {
          const res = await api('snfExportPDF', { type: 'morning' });
          if (res?.relative) {
            window.location.href = '/api/download?file=' + encodeURIComponent(res.relative);
            toast('Morning Brief PDF generated and saved to Reports.');
          }
        } catch (e) {
          toast('Export failed: ' + e.message);
        } finally {
          btnExportBriefPdf.disabled = false;
          btnExportBriefPdf.textContent = '📄 Download Morning Brief (PDF)';
        }
      });
    }

    const btnExportPsychPdf = container.querySelector('#btn-export-psych-pdf');
    if (btnExportPsychPdf) {
      btnExportPsychPdf.addEventListener('click', async () => {
        btnExportPsychPdf.disabled = true;
        btnExportPsychPdf.textContent = 'Generating PDF…';
        try {
          const res = await api('snfExportPDF', { type: 'psych' });
          if (res?.relative) {
            window.location.href = '/api/download?file=' + encodeURIComponent(res.relative);
            toast('Psychotropic Surveillance PDF generated and saved to Reports.');
          }
        } catch (e) {
          toast('Export failed: ' + e.message);
        } finally {
          btnExportPsychPdf.disabled = false;
          btnExportPsychPdf.textContent = '📄 Export Psychotropic Surveillance (PDF)';
        }
      });
    }

    // Quarterly Report PDF Export handlers (Header button & QM tab button)
    const handleQuarterlyExport = async (btn) => {
      const origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Generating Quarterly PDF…';
      try {
        const res = await api('snfExportPDF', { type: 'quarterly' });
        if (res?.relative) {
          window.location.href = '/api/download?file=' + encodeURIComponent(res.relative);
          toast('Quarterly Report Summary PDF generated and saved to Reports.');
        } else {
          toast('Quarterly Report Summary created.');
        }
      } catch (e) {
        toast('Quarterly PDF export failed: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = origText;
      }
    };

    const btnQuarterlyHeader = container.querySelector('#snf-btn-quarterly-pdf');
    if (btnQuarterlyHeader) {
      btnQuarterlyHeader.addEventListener('click', () => handleQuarterlyExport(btnQuarterlyHeader));
    }

    const btnQuarterlyQm = container.querySelector('#btn-export-qm-quarterly-pdf');
    if (btnQuarterlyQm) {
      btnQuarterlyQm.addEventListener('click', () => handleQuarterlyExport(btnQuarterlyQm));
    }

    const btnSnfCleanup = container.querySelector('#btn-snf-cleanup');
    if (btnSnfCleanup) {
      btnSnfCleanup.addEventListener('click', async () => {
        btnSnfCleanup.disabled = true;
        btnSnfCleanup.textContent = 'Running Cleanup…';
        try {
          const res = await api('snfRetentionCleanup');
          const total = res.total || 0;
          toast(`Retention cleanup complete: pruned ${total} expired record(s) (>100d).`);
          await loadData();
          renderHTML(container);
        } catch (e) {
          toast('Cleanup failed: ' + e.message);
        } finally {
          btnSnfCleanup.disabled = false;
          btnSnfCleanup.textContent = '🧹 Run Surveillance Retention Cleanup Now';
        }
      });
    }

    const btnRefreshBrief = container.querySelector('#btn-refresh-brief');
    if (btnRefreshBrief) {
      btnRefreshBrief.addEventListener('click', async () => {
        btnRefreshBrief.disabled = true;
        btnRefreshBrief.textContent = 'Refreshing…';
        try {
          const res = await api('snfMorningBrief');
          currentBrief = res.text || '';
          renderHTML(container);
          toast('Morning Brief refreshed.');
        } catch (e) {
          toast('Failed to refresh brief: ' + e.message);
        } finally {
          btnRefreshBrief.disabled = false;
          btnRefreshBrief.textContent = '🔄 Refresh Morning Brief';
        }
      });
    }

    const btnCopyBrief = container.querySelector('#btn-copy-brief');
    if (btnCopyBrief) {
      btnCopyBrief.addEventListener('click', () => {
        if (!currentBrief) {
          toast('No report text to copy.');
          return;
        }
        navigator.clipboard.writeText(currentBrief).then(() => {
          toast('Morning Brief copied to clipboard.');
        }).catch(() => {
          toast('Could not copy to clipboard.');
        });
      });
    }

    const btnPrintBrief = container.querySelector('#btn-print-brief');
    if (btnPrintBrief) {
      btnPrintBrief.addEventListener('click', () => {
        window.print();
      });
    }

    // Resident investigate links
    container.querySelectorAll('[data-act="view-resident"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const query = btn.dataset.query;
        residentSearchQuery = query;
        activeTab = 'resident';
        renderHTML(container);
        doResidentSearch(query, container);
      });
    });

    // Resident Search button
    const btnSearchRes = container.querySelector('#snf-btn-search-resident');
    const inputSearchRes = container.querySelector('#snf-resident-input');
    if (btnSearchRes && inputSearchRes) {
      btnSearchRes.addEventListener('click', () => {
        doResidentSearch(inputSearchRes.value, container);
      });
      inputSearchRes.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doResidentSearch(inputSearchRes.value, container);
      });
    }

    bindCardEvents(container);
  }

  function bindCardEvents(container) {
    // Acknowledge buttons
    container.querySelectorAll('[data-act="ack-alert"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        try {
          await api('snfAcknowledgeAlert', { alertId: id, user: 'Nurse Clinician' });
          toast('Alert acknowledged.');
          await loadData();
          renderHTML(container);
        } catch (e) {
          toast('Failed to acknowledge alert: ' + e.message);
        }
      });
    });

    // Assign prompt toggle
    container.querySelectorAll('[data-act="assign-prompt"]').forEach(btn => {
      btn.addEventListener('click', () => {
        assigningAlertId = assigningAlertId === btn.dataset.id ? null : btn.dataset.id;
        resolvingAlertId = null;
        renderHTML(container);
      });
    });

    // Cancel assign
    container.querySelectorAll('[data-act="cancel-assign"]').forEach(btn => {
      btn.addEventListener('click', () => {
        assigningAlertId = null;
        renderHTML(container);
      });
    });

    // Do assign
    container.querySelectorAll('[data-act="do-assign"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const assignee = container.querySelector(`#assign-select-${id}`)?.value;
        const note = container.querySelector(`#assign-note-${id}`)?.value || '';
        try {
          await api('snfAssignAlert', { alertId: id, assignedTo: assignee, note, user: 'Nurse Clinician' });
          toast(`Alert assigned to ${assignee}.`);
          assigningAlertId = null;
          await loadData();
          renderHTML(container);
        } catch (e) {
          toast('Failed to assign alert: ' + e.message);
        }
      });
    });

    // Resolve prompt toggle
    container.querySelectorAll('[data-act="resolve-prompt"]').forEach(btn => {
      btn.addEventListener('click', () => {
        resolvingAlertId = resolvingAlertId === btn.dataset.id ? null : btn.dataset.id;
        assigningAlertId = null;
        renderHTML(container);
      });
    });

    // Cancel resolve
    container.querySelectorAll('[data-act="cancel-resolve"]').forEach(btn => {
      btn.addEventListener('click', () => {
        resolvingAlertId = null;
        renderHTML(container);
      });
    });

    // Do resolve
    container.querySelectorAll('[data-act="do-resolve"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const status = container.querySelector(`#resolve-status-${id}`)?.value;
        const note = container.querySelector(`#resolve-note-${id}`)?.value?.trim() || '';
        if (!note) {
          toast('Please enter a clinical action note before resolving.');
          return;
        }
        try {
          await api('snfResolveAlert', { alertId: id, resolutionStatus: status, note, user: 'Nurse Clinician' });
          toast('Alert resolved and audited.');
          resolvingAlertId = null;
          await loadData();
          renderHTML(container);
        } catch (e) {
          toast('Failed to resolve alert: ' + e.message);
        }
      });
    });
  }

  async function doResidentSearch(query, container) {
    if (!query?.trim()) return;
    try {
      const res = await api('snfResidentTimeline', { query: query.trim() });
      currentResidentTimeline = res?.text || 'No records found for resident.';
      const out = container.querySelector('#resident-timeline-results');
      if (out) {
        out.innerHTML = `
          <div style="margin-bottom: 12px; display:flex; gap:8px;">
            <button class="primary" id="btn-export-timeline-pdf">📄 Download Timeline (PDF)</button>
          </div>
          <div class="resident-timeline-box">
            <pre class="timeline-pre">${esc(currentResidentTimeline)}</pre>
          </div>
        `;
        const btnPdf = out.querySelector('#btn-export-timeline-pdf');
        if (btnPdf) {
          btnPdf.addEventListener('click', async () => {
            btnPdf.disabled = true;
            btnPdf.textContent = 'Generating PDF…';
            try {
              const resPdf = await api('snfExportPDF', { type: 'timeline', query: query.trim() });
              if (resPdf?.relative) {
                window.location.href = '/api/download?file=' + encodeURIComponent(resPdf.relative);
                toast('Resident Timeline PDF generated and saved to Reports.');
              }
            } catch (err) {
              toast('Export failed: ' + err.message);
            } finally {
              btnPdf.disabled = false;
              btnPdf.textContent = '📄 Download Timeline (PDF)';
            }
          });
        }
      }
    } catch (e) {
      toast('Failed to load resident timeline: ' + e.message);
    }
  }

  return {
    render,
    updateUniversalAlertBar,
    refresh: loadData
  };
}

