// Automation & Agent Control Center UI Module
// Professional operational dashboard for scheduled automations, background jobs, Worker activity, and failures.

export function createAutomationCenterUI({ api, esc, toast, refresh, renderPage, confirmAction, form, field, select, textarea, fileChecks, idsFrom }) {
  // Tab state: 'overview' | 'upcoming' | 'history' | 'workers'
  let activeTab = 'upcoming';
  let historyFilter = { automation: 'all', status: 'all', search: '' };
  let selectedAutomationId = null; // When non-null, shows detailed modal/drawer for the automation
  let selectedRunId = null; // When non-null, shows run detail modal

  function formatDateTime(ts) {
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

  function formatRelativeTime(ts) {
    if (!ts) return '—';
    const now = Date.now();
    const diffMs = ts - now;
    if (diffMs < 0) {
      const pastMin = Math.round(Math.abs(diffMs) / 60000);
      if (pastMin < 1) return 'just now';
      if (pastMin < 60) return `${pastMin}m ago`;
      const pastHours = Math.round(pastMin / 60);
      if (pastHours < 24) return `${pastHours}h ago`;
      return `${Math.round(pastHours / 24)}d ago`;
    }
    const futureMin = Math.round(diffMs / 60000);
    if (futureMin < 1) return 'in <1m';
    if (futureMin < 60) return `in ${futureMin}m`;
    const futureHours = Math.floor(futureMin / 60);
    const remMin = futureMin % 60;
    if (futureHours < 24) return `in ${futureHours}h ${remMin}m`;
    const days = Math.floor(futureHours / 24);
    return `in ${days}d ${futureHours % 24}h`;
  }

  function formatDuration(j) {
    if (j.durationMs) return `${(j.durationMs / 1000).toFixed(1)}s`;
    if (j.completed && j.started) {
      const ms = new Date(j.completed) - new Date(j.started);
      if (ms > 0) return `${(ms / 1000).toFixed(1)}s`;
    }
    if (j.ended && j.started) {
      const ms = new Date(j.ended) - new Date(j.started);
      if (ms > 0) return `${(ms / 1000).toFixed(1)}s`;
    }
    return '—';
  }

  // Translates raw error/status codes into helpful plain-language explanations
  function explainState(job) {
    const s = job.status || 'unknown';
    const r = job.reason || '';
    const err = job.error || '';

    if (s === 'running') {
      if (job.step) return `Running — ${job.step}`;
      return 'Running — executing analysis and generating report';
    }
    if (s === 'waiting') {
      if (/foreground/i.test(r)) {
        return 'Waiting — foreground chat currently has priority';
      }
      if (/another background/i.test(r)) {
        return 'Waiting — another background automation is executing';
      }
      if (/browser/i.test(r)) {
        return 'Waiting — another browser session is active';
      }
      if (/AI/i.test(r)) {
        return 'Waiting — active AI reasoning session in progress';
      }
      return r || 'Waiting for available execution slot or Worker';
    }
    if (s === 'paused') {
      if (/low ram|memory/i.test(r) || err === 'LOW_MEMORY') {
        return 'Paused — available memory is low. Private AI will resume when sufficient memory is available.';
      }
      if (/recovered/i.test(r)) {
        return 'Paused — memory recovered; waiting for sustained headroom before resuming.';
      }
      if (/worker/i.test(r) || /paused/i.test(r)) {
        return 'Paused — background work is currently paused in settings.';
      }
      return r || 'Paused temporarily';
    }
    if (s === 'failed') {
      if (err === 'LOW_MEMORY') {
        return 'Halted due to low memory. Review RAM reserves or close background applications before retrying.';
      }
      if (err === 'INTERFERENCE') {
        return 'This task requires control of another application and needs approval before continuing.';
      }
      if (err === 'WORKSPACE') {
        return 'Work folder is missing or disconnected. Recheck work folder settings.';
      }
      if (err === 'FILE' || err === 'NOT_FOUND') {
        return 'Source file or watched path could not be found.';
      }
      if (err === 'PEER') {
        return 'Target Worker PC was unreachable or cryptographic envelope could not be opened.';
      }
      if (err === 'LIMIT') {
        return 'Context size limit reached for included documents.';
      }
      if (err === 'TIMEOUT') {
        return 'Task timed out while waiting for local engine or API response.';
      }
      return r || (err ? `Error: ${err}` : 'Automation stopped unexpectedly');
    }
    if (s === 'completed') {
      return 'Completed successfully';
    }
    return r || s;
  }

  function formatScheduleSummary(s) {
    if (!s) return '—';
    const freq = s.frequency || 'daily';
    if (freq === 'once') return `One time at ${s.at || 'specified date'}`;
    if (freq === 'daily') return `Daily at ${s.time || '08:00'}`;
    if (freq === 'weekdays') return `Weekdays at ${s.time || '08:00'}`;
    if (freq === 'weekly') {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const mapped = (s.weekdays || [1]).map(d => days[d] || d).join(', ');
      return `Weekly on ${mapped} at ${s.time || '08:00'}`;
    }
    if (freq === 'monthly') return `Monthly on day ${s.monthDay || 1} at ${s.time || '08:00'}`;
    if (freq === 'interval') return `Every ${s.intervalMinutes || 60} minutes`;
    if (freq === 'watch') return `Watch file: ${s.watchPath || 'unspecified'} · two stable polls, at least ${s.settleSeconds??30}s · ${s.watchStatus||'baseline pending'}`;
    return freq;
  }

  return {
    async render(container, state,options={}) {
      if (!state) { container.innerHTML='<p>Loading…</p>';return; }
      const schedules=state.schedules||[],jobs=state.jobs||[],worker=state.worker||{peers:[]},now=Date.now();
      container.innerHTML = `<div class="page"><h1>Automation</h1><p class="help">Scheduled work and run history. Worker settings are managed here.</p><p><button data-act="schedule-new">New scheduled task</button><button data-act="view" data-view="browser">Website report schedules</button><button data-act="view" data-view="agents">Saved assistants</button><button data-act="view" data-view="worker">Worker settings</button><button data-act="auto-refresh">Refresh</button></p><nav><button data-act="auto-tab" data-tab="upcoming">Schedules</button><button data-act="auto-tab" data-tab="history">Run history</button></nav>${activeTab==='history'?renderHistoryTab({jobs,schedules}):renderUpcomingTab({schedules,worker,now})}<div id="auto-modal-container"></div></div>`;
      bindEvents(container, state);
      if(options.jobId){const job=jobs.find(j=>j.id===options.jobId);if(job)renderRunDetailsModal(job);else toast('This report is outside current run history or no longer available. Import its saved export into Library to review the report text.');}
      if(options.scheduleId){const schedule=schedules.find(s=>s.id===options.scheduleId);if(schedule)renderScheduleDetailsModal(schedule,jobs.filter(j=>j.scheduleId===schedule.id));else toast('This schedule is no longer available.');}
    }
  };

  // 1. Overview Tab: Needs Attention -> Active Now -> Upcoming Summary -> Recent Activity
  function renderOverviewTab({ attentionItems, activeJobs, schedules, jobs, settings, worker, resources, now }) {
    const upcomingSchedules = [...schedules]
      .filter(s => s.enabled)
      .sort((a, b) => (a.next || Infinity) - (b.next || Infinity))
      .slice(0, 5);

    const recentRuns = jobs.slice(0, 5);

    return `
      <!-- Needs Attention Section (Prominent when items exist) -->
      ${attentionItems.length > 0 ? `
        <section class="auto-section auto-attention-section">
          <div class="auto-section-header">
            <div class="auto-section-title-wrap">
              <h2 class="auto-section-title">
                <span class="auto-icon-alert">⚠️</span>
                <span>Needs Attention</span>
                <span class="auto-count-pill pill-critical">${attentionItems.length}</span>
              </h2>
              <p class="auto-section-desc">Automations, background failures, or resource conditions requiring operational review. Items persist until resolved or rerun.</p>
            </div>
          </div>
          <div class="auto-attention-list">
            ${attentionItems.map(item => `
              <div class="auto-attention-card auto-severity-${item.severity}">
                <div class="auto-card-main">
                  <div class="auto-card-header">
                    <span class="auto-card-severity">${item.severity.toUpperCase()}</span>
                    <strong class="auto-card-title">${esc(item.title)}</strong>
                    ${item.time ? `<span class="auto-card-time">${formatDateTime(item.time)}</span>` : ''}
                  </div>
                  <p class="auto-card-msg">${esc(item.explanation)}</p>
                  ${item.suggestedAction ? `<p class="auto-card-suggested"><strong>Suggested next action:</strong> ${esc(item.suggestedAction)}</p>` : ''}
                </div>
                <div class="auto-card-actions">
                  ${item.hasRecovery ? `<button class="auto-btn auto-btn-primary" data-act="job-resume" data-id="${item.jobId}">Review &amp; Resume</button>` : ''}
                  ${item.canRetryExport ? `<button class="auto-btn auto-btn-primary" data-act="retry-export" data-id="${item.jobId}">Save as PDF</button>` : ''}
                  ${item.jobId ? `<button class="auto-btn" data-act="auto-view-run" data-id="${item.jobId}">View Details</button>` : ''}
                  ${item.job && item.job.prompt ? `<button class="auto-btn" data-act="auto-run-again" data-id="${item.jobId}">Run Again</button>` : ''}
                  ${item.actionAct ? `<button class="auto-btn auto-btn-primary" data-act="${item.actionAct}">${esc(item.actionLabel || 'Fix')}</button>` : ''}
                  ${item.actionTab ? `<button class="auto-btn" data-act="auto-tab" data-tab="${item.actionTab}">${esc(item.actionLabel || 'Review')}</button>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </section>
      ` : `
        <div class="auto-all-clear-banner">
          <span class="auto-clear-check">✓</span>
          <div>
            <strong>All systems and automations healthy.</strong>
            <span>No background failures, resource warnings, or disconnected Worker nodes require attention.</span>
          </div>
        </div>
      `}

      <!-- Active Now Section -->
      <section class="auto-section">
        <div class="auto-section-header">
          <div class="auto-section-title-wrap">
            <h2 class="auto-section-title">
              <span>Active Now</span>
              <span class="auto-count-pill">${activeJobs.length}</span>
            </h2>
            <p class="auto-section-desc">Currently executing, waiting, or paused background operations.</p>
          </div>
        </div>
        ${activeJobs.length > 0 ? `
          <div class="auto-job-grid">
            ${activeJobs.map(j => `
              <div class="auto-active-card auto-card-border-${j.status}">
                <div class="auto-card-top">
                  <div>
                    <span class="auto-status-pill status-${j.status}">${esc(j.status.toUpperCase())}</span>
                    <strong class="auto-job-name">${esc(j.title || 'Report')}</strong>
                  </div>
                  <span class="auto-job-type">Task</span>
                </div>
                <div class="auto-job-explanation">
                  ${esc(explainState(j))}
                </div>
                <div class="auto-job-meta">
                  <span><strong>Started:</strong> ${j.started ? formatDateTime(j.started) : 'Waiting'}</span>
                  <span><strong>Worker:</strong> ${j.remote ? 'Remote Worker' : 'This PC (Primary)'}</span>
                  ${j.step ? `<span><strong>Phase:</strong> ${esc(j.step)}</span>` : ''}
                </div>
                <div class="auto-job-controls">
                  <button class="auto-btn auto-btn-sm" data-act="auto-view-run" data-id="${j.id}">View Details</button>
                  <button class="auto-btn auto-btn-sm auto-btn-danger" data-act="job-stop" data-id="${j.id}">Stop Task</button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="auto-empty-state">
            <div class="auto-empty-icon">☕</div>
            <strong>No jobs currently running or waiting.</strong>
            <p>Background workers and AI reasoning lanes are ready for incoming scheduled automations or manual requests.</p>
          </div>
        `}
      </section>

      <!-- Grid: Upcoming Automations & Recent Activity -->
      <div class="auto-two-col-grid">
        <!-- Upcoming Automations -->
        <section class="auto-section">
          <div class="auto-section-header">
            <div class="auto-section-title-wrap">
              <h2 class="auto-section-title">
                <span>Upcoming Automations</span>
              </h2>
              <p class="auto-section-desc">Next scheduled background executions.</p>
            </div>
            <button class="auto-btn auto-btn-sm" data-act="auto-tab" data-tab="upcoming">View All (${schedules.length}) →</button>
          </div>
          ${upcomingSchedules.length > 0 ? `
            <div class="auto-mini-list">
              ${upcomingSchedules.map(s => `
                <div class="auto-mini-item">
                  <div class="auto-mini-info">
                    <strong class="auto-mini-title">${esc(s.name)}</strong>
                    <div class="auto-mini-sub">
                      <span>${esc(formatScheduleSummary(s))}</span>
                      <span>·</span>
                      <span class="auto-text-time">Next: ${formatRelativeTime(s.next)} (${formatDateTime(s.next)})</span>
                    </div>
                  </div>
                  <div class="auto-mini-actions">
                    <button class="auto-btn auto-btn-sm" data-act="auto-run-schedule-now" data-id="${s.id}" title="Run this automation immediately">Run Now</button>
                    <button class="auto-btn auto-btn-sm" data-act="auto-view-schedule" data-id="${s.id}">Details</button>
                  </div>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="auto-empty-state-compact">
              <p>No active scheduled tasks. Create a schedule to automate routine reports.</p>
              <button class="auto-btn auto-btn-sm auto-btn-primary" data-act="schedule-new">+ New Scheduled Task</button>
            </div>
          `}
        </section>

        <!-- Recent Activity / History Summary -->
        <section class="auto-section">
          <div class="auto-section-header">
            <div class="auto-section-title-wrap">
              <h2 class="auto-section-title">
                <span>Recent Run Activity</span>
              </h2>
              <p class="auto-section-desc">Latest finished or halted jobs.</p>
            </div>
            <button class="auto-btn auto-btn-sm" data-act="auto-tab" data-tab="history">Full History (${jobs.length}) →</button>
          </div>
          ${recentRuns.length > 0 ? `
            <div class="auto-mini-list">
              ${recentRuns.map(j => {
                const isFindings = j.status === 'completed' && j.findingsCount;
                const statusBadge = j.status === 'completed'
                  ? (isFindings ? '<span class="auto-status-pill status-findings">COMPLETED W/ FINDINGS</span>' : '<span class="auto-status-pill status-completed">COMPLETED</span>')
                  : `<span class="auto-status-pill status-${j.status}">${esc(j.status.toUpperCase())}</span>`;
                return `
                  <div class="auto-mini-item">
                    <div class="auto-mini-info">
                      <div class="auto-mini-header-row">
                        ${statusBadge}
                        <strong class="auto-mini-title">${esc(j.title || 'Report')}</strong>
                      </div>
                      <div class="auto-mini-sub">
                        <span>Run: ${formatDateTime(j.completed || j.started)}</span>
                        <span>·</span>
                        <span>Duration: ${formatDuration(j)}</span>
                        ${j.output ? `<span>·</span><span class="auto-text-output">Output: ${esc(j.output)}</span>` : ''}
                      </div>
                    </div>
                    <div class="auto-mini-actions">
                      ${j.output ? `<button class="auto-btn auto-btn-sm auto-btn-primary" data-act="job-open" data-path="${esc(j.output)}">Open Report</button>` : ''}
                      <button class="auto-btn auto-btn-sm" data-act="auto-view-run" data-id="${j.id}">Details</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <div class="auto-empty-state-compact">
              <p>No previous run records found.</p>
            </div>
          `}
        </section>
      </div>
    `;
  }

  // 2. Upcoming Automations Tab
  function renderUpcomingTab({ schedules, worker, now }) {
    const sorted = [...schedules].sort((a, b) => {
      if (a.enabled && !b.enabled) return -1;
      if (!a.enabled && b.enabled) return 1;
      return (a.next || Infinity) - (b.next || Infinity);
    });

    return `
      <section class="auto-section">
        <div class="auto-section-header">
          <div class="auto-section-title-wrap">
            <h2 class="auto-section-title">
              <span>Scheduled Automations</span>
              <span class="auto-count-pill">${schedules.length}</span>
            </h2>
            <p class="auto-section-desc">Manage repeat schedules, watcher-triggered automations, and assigned execution nodes.</p>
          </div>

        </div>

        ${sorted.length > 0 ? `
          <div class="auto-table-wrap">
            <table class="auto-table">
              <thead>
                <tr>
                  <th>Automation Name</th>
                  <th>Frequency &amp; Rule</th>
                  <th>Next Scheduled Run</th>
                  <th>Last Run</th>
                  <th>Target Node</th>
                  <th>Status</th>
                  <th style="text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${sorted.map(s => {
                  const statusClass = s.enabled ? 'badge success' : 'badge warning';
                  const nextText = s.next ? (s.next > now ? `${formatRelativeTime(s.next)}<br><small style="color:#64748b;">${formatDateTime(s.next)}</small>` : 'Due now / Caught up') : 'None';
                  return `
                    <tr>
                      <td>
                        <strong class="auto-clickable-name" data-act="auto-view-schedule" data-id="${s.id}">
                          ${esc(s.name)}
                        </strong>
                        <div class="auto-table-sub">Format: ${esc(s.format || 'pdf').toUpperCase()} · ${(s.fileIds || []).length} working file(s)</div>
                      </td>
                      <td>
                        <span class="auto-freq-tag">${esc(s.frequency || 'daily')}</span>
                        <div class="auto-table-sub">${esc(formatScheduleSummary(s))}</div>
                      </td>
                      <td>${nextText}</td>
                      <td>${s.lastRun ? formatDateTime(s.lastRun) : '—'}</td>
                      <td>${s.target ? esc(worker.peers.find(p => p.id === s.target)?.label || 'Remote Worker') : 'This PC'}</td>
                      <td>
                        <span class="${statusClass}">${s.enabled ? 'Enabled' : 'Paused'}</span>
                      </td>
                      <td style="text-align:right;">
                        <div class="auto-row-actions">
                          <button class="auto-btn auto-btn-sm" data-act="auto-run-schedule-now" data-id="${s.id}" title="Run immediately">Run Now</button>
                          <button class="auto-btn auto-btn-sm" data-act="schedule-toggle" data-id="${s.id}">${s.enabled ? 'Pause' : 'Resume'}</button>
                          <button class="auto-btn auto-btn-sm" data-act="auto-view-schedule" data-id="${s.id}">Details</button>
                          <button class="auto-btn auto-btn-sm" data-act="schedule-edit" data-id="${s.id}">Edit</button>
                          <button class="auto-btn auto-btn-sm auto-btn-danger" data-act="delete-item" data-kind="schedule" data-id="${s.id}">Delete</button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div class="auto-empty-state">
            <div class="auto-empty-icon">◷</div>
            <strong>No scheduled automations configured.</strong>
            <p>Set up scheduled clinical reviews, daily morning briefs, or watcher-triggered reports to run in the background.</p>

          </div>
        `}
      </section>
    `;
  }

  // 3. Run History Tab
  function renderHistoryTab({ jobs, schedules }) {
    // Filter jobs
    let filtered = [...jobs];
    if (historyFilter.status !== 'all') {
      filtered = filtered.filter(j => j.status === historyFilter.status);
    }
    if (historyFilter.automation !== 'all') {
      filtered = filtered.filter(j => j.scheduleId === historyFilter.automation || j.title === historyFilter.automation);
    }
    if (historyFilter.search) {
      const q = historyFilter.search.toLowerCase();
      filtered = filtered.filter(j => (j.title || '').toLowerCase().includes(q) || (j.output || '').toLowerCase().includes(q) || (j.error || '').toLowerCase().includes(q));
    }

    return `
      <section class="auto-section">
        <div class="auto-section-header">
          <div class="auto-section-title-wrap">
            <h2 class="auto-section-title">
              <span>Automation Run History</span>
              <span class="auto-count-pill">${filtered.length}</span>
            </h2>
            <p class="auto-section-desc">Audit trail of completed, failed, paused, and expired automation executions.</p>
          </div>
          <!-- Filter Controls -->
          <div class="auto-filter-bar">
            <select class="auto-select" id="history-filter-status">
              <option value="all" ${historyFilter.status === 'all' ? 'selected' : ''}>All Statuses</option>
              <option value="completed" ${historyFilter.status === 'completed' ? 'selected' : ''}>Completed</option>
              <option value="failed" ${historyFilter.status === 'failed' ? 'selected' : ''}>Failed</option>
              <option value="running" ${historyFilter.status === 'running' ? 'selected' : ''}>Running</option>
              <option value="waiting" ${historyFilter.status === 'waiting' ? 'selected' : ''}>Waiting / Paused</option>
            </select>
            <input type="search" class="auto-search" id="history-filter-search" placeholder="Search task, output, or error..." value="${esc(historyFilter.search)}" />
          </div>
        </div>

        ${filtered.length > 0 ? `
          <div class="auto-table-wrap">
            <table class="auto-table">
              <thead>
                <tr>
                  <th>Task Name</th>
                  <th>Run Date &amp; Time</th>
                  <th>Duration</th>
                  <th>Worker / Device</th>
                  <th>Final Status</th>
                  <th>Findings &amp; Explanation</th>
                  <th style="text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(j => {
                  const isFindings = j.status === 'completed' && j.findingsCount;
                  const statusBadge = j.status === 'completed'
                    ? (isFindings ? '<span class="auto-status-pill status-findings">COMPLETED W/ FINDINGS</span>' : '<span class="auto-status-pill status-completed">COMPLETED</span>')
                    : `<span class="auto-status-pill status-${j.status}">${esc(j.status.toUpperCase())}</span>`;

                  return `
                    <tr>
                      <td>
                        <strong class="auto-clickable-name" data-act="auto-view-run" data-id="${j.id}">
                          ${esc(j.title || 'Report')}
                        </strong>
                        ${j.step ? `<div class="auto-table-sub">Saved Phase: ${esc(j.step)}</div>` : ''}
                      </td>
                      <td>${j.started ? formatDateTime(j.started) : '—'}</td>
                      <td>${formatDuration(j)}</td>
                      <td>${j.remote ? 'Remote Worker' : 'This PC'}</td>
                      <td>${statusBadge}</td>
                      <td>
                        <div class="auto-table-desc">
                          ${j.status === 'failed' ? `<span style="color:#b91c1c;font-weight:600;">${esc(j.error || 'Failed')}</span> — ` : ''}
                          ${esc(explainState(j))}
                        </div>
                        ${j.output ? `<div class="auto-table-sub" style="color:#2563eb;">📄 ${esc(j.output)}</div>` : ''}
                      </td>
                      <td style="text-align:right;">
                        <div class="auto-row-actions">
                          ${j.output ? `<button class="auto-btn auto-btn-sm auto-btn-primary" data-act="job-open" data-path="${esc(j.output)}">Open Report</button>` : ''}
                          ${j.recoverable && j.status === 'failed' ? `<button class="auto-btn auto-btn-sm" data-act="job-resume" data-id="${j.id}">Resume</button>` : ''}
                          ${j.resultText && !j.recoverable && j.status === 'failed' ? `<button class="auto-btn auto-btn-sm" data-act="retry-export" data-id="${j.id}">Export</button>` : ''}
                          <button class="auto-btn auto-btn-sm" data-act="auto-view-run" data-id="${j.id}">Details</button>
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div class="auto-empty-state">
            <div class="auto-empty-icon">📁</div>
            <strong>No run history matches the current filters.</strong>
            <p>Try resetting the search filter or run a scheduled automation.</p>
          </div>
        `}
      </section>
    `;
  }

  // 4. Workers & Resources Tab
  function renderWorkersTab({ settings, worker, resources }) {
    const peers = worker.peers || [];

    return `
      <section class="auto-section">
        <div class="auto-section-header">
          <div class="auto-section-title-wrap">
            <h2 class="auto-section-title">
              <span>Workers &amp; Operational Resources</span>
            </h2>
            <p class="auto-section-desc">Manage local PC execution roles, resource safety governors, and trusted peer PCs connected via ShareSync.</p>
          </div>
          <div class="auto-header-actions"><button class="auto-btn" data-act="view" data-view="agents">Agents</button><button class="auto-btn" data-act="view" data-view="worker">Workers</button>
            <button class="auto-btn" data-act="refresh-worker">↻ Refresh Peers</button>
            <button class="auto-btn" data-act="open-workspace">Open Work Folder</button>
          </div>
        </div>

        <div class="auto-two-col-grid">
          <!-- Local PC Configuration Card -->
          <div class="auto-resource-card">
            <div class="auto-resource-card-header">
              <h3 class="auto-resource-title">
                <span>🖥 Local PC: ${esc(worker.label || 'My PC')}</span>
                <span class="badge ${settings.workerEnabled && !settings.workerPaused ? 'success' : 'warning'}">
                  ${!settings.workerEnabled ? 'Worker Disabled' : (settings.workerPaused ? 'Worker Paused' : 'Worker Online')}
                </span>
              </h3>
              <p class="auto-resource-desc">Execution parameters for scheduled tasks running directly on this computer.</p>
            </div>

            <div class="auto-resource-metrics">
              <div class="auto-metric-box">
                <span class="auto-metric-label">Role</span>
                <strong class="auto-metric-val" style="text-transform:capitalize;">${esc(settings.role || 'Primary')}</strong>
              </div>
              <div class="auto-metric-box">
                <span class="auto-metric-label">Available RAM</span>
                <strong class="auto-metric-val">${resources.availableMemoryGB !== undefined ? `${resources.availableMemoryGB} GB` : '—'}</strong>
              </div>
              <div class="auto-metric-box">
                <span class="auto-metric-label">Browser Lane</span>
                <strong class="auto-metric-val">${resources.browser ? 'In Use' : 'Available'}</strong>
              </div>
              <div class="auto-metric-box">
                <span class="auto-metric-label">Active State</span>
                <strong class="auto-metric-val">${resources.foreground ? 'Foreground Active' : 'Idle Headroom'}</strong>
              </div>
            </div>

            <div class="auto-plain-state-box">
              <strong>Resource Arbitration State:</strong>
              <p>
                ${resources.foreground ? 'Foreground chat has priority. Background automations will yield or wait until foreground interaction finishes.' : 'No active foreground chat. Background worker has unobstructed local resource headroom.'}
              </p>
              ${settings.workerPaused ? '<p style="color:#b91c1c;margin-top:6px;"><strong>Background work is paused:</strong> New background jobs will pause at safe task boundaries until resumed.</p>' : ''}
            </div>

            <div class="auto-card-actions" style="margin-top:16px;">
              <button class="auto-btn auto-btn-primary" data-act="pause-worker">
                ${settings.workerPaused ? 'Resume Background Jobs' : 'Pause New Jobs'}
              </button>
              <button class="auto-btn" data-act="auto-edit-local-worker">Edit PC Name / Role</button>
            </div>
          </div>

          <!-- Connected Peer Workers Card -->
          <div class="auto-resource-card">
            <div class="auto-resource-card-header">
              <h3 class="auto-resource-title">
                <span>🤝 Trusted Peer PCs</span>
                <span class="auto-count-pill">${peers.filter(p => p.trusted).length} Trusted</span>
              </h3>
              <p class="auto-resource-desc">Other PCs sharing your encrypted ShareSync work folder. Each PC keeps its own credentials and vault.</p>
            </div>

            ${peers.length > 0 ? `
              <div class="auto-peers-list">
                ${peers.map(p => `
                  <div class="auto-peer-item ${p.trusted ? 'peer-trusted' : 'peer-untrusted'}">
                    <div class="auto-peer-info">
                      <div class="auto-peer-title-row">
                        <strong>${esc(p.label)}</strong>
                        <span class="badge ${p.online ? 'success' : 'warning'}">${p.online ? 'Online / Seen' : 'Offline / Delayed'}</span>
                        ${p.trusted ? '<span class="badge info">Trusted</span>' : '<span class="badge">Unpaired</span>'}
                      </div>
                      <div class="auto-peer-meta">
                        <span>Fingerprint: <code class="auto-code">${esc(p.fingerprint)}</code></span>
                        ${p.changed ? '<span style="color:#b91c1c;font-weight:600;">⚠️ Identity changed; re-verification required.</span>' : ''}
                      </div>
                    </div>
                    <div class="auto-peer-actions">
                      <button class="auto-btn auto-btn-sm ${p.trusted ? 'auto-btn-danger' : 'auto-btn-primary'}" data-act="${p.trusted ? 'peer-revoke' : 'peer-trust'}" data-id="${p.id}">
                        ${p.trusted ? 'Disconnect' : 'Connect Peer'}
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : `
              <div class="auto-empty-state-compact">
                <p>No other PCs detected in the shared work folder. When another PC joins the ShareSync folder, it will appear here for verification.</p>
              </div>
            `}
          </div>
        </div>
      </section>
    `;
  }

  // Details Modal for an Automation Schedule
  function renderScheduleDetailsModal(s, runs = []) {
    const modalContainer = document.getElementById('auto-modal-container');
    if (!modalContainer) return;

    modalContainer.innerHTML = `
      <div class="auto-modal-backdrop" id="auto-modal-backdrop">
        <div class="auto-modal-dialog">
          <div class="auto-modal-header">
            <div>
              <h2 class="auto-modal-title">${esc(s.name)}</h2>
              <span class="badge ${s.enabled ? 'success' : 'warning'}">${s.enabled ? 'Enabled' : 'Paused'}</span>
            </div>
            <button class="auto-modal-close" id="btn-close-modal">✕</button>
          </div>

          <div class="auto-modal-body">
            <!-- Overview -->
            <div class="auto-detail-section">
              <h4 class="auto-detail-heading">Overview &amp; Instructions</h4>
              <div class="auto-detail-box">
                <p style="white-space:pre-wrap;margin:0;">${esc(s.prompt || 'No prompt instructions provided.')}</p>
              </div>
              <div class="auto-meta-grid" style="margin-top:12px;">
                <div><strong>Output Format:</strong> ${esc(s.format || 'pdf').toUpperCase()}</div>
                <div><strong>Included Files:</strong> ${(s.fileIds || []).length} working document(s)</div>
                <div><strong>HIPAA Protected:</strong> ${s.hipaa ? 'Yes (Local / Business Associate Only)' : 'Standard'}</div>
              </div>
            </div>

            <!-- Schedule Rule -->
            <div class="auto-detail-section">
              <h4 class="auto-detail-heading">Schedule Rule</h4>
              <div class="auto-meta-grid">
                <div><strong>Frequency:</strong> ${esc(s.frequency || 'daily')}</div>
                <div><strong>Execution Rule:</strong> ${esc(formatScheduleSummary(s))}</div>
                <div><strong>Next Run:</strong> ${s.next ? formatDateTime(s.next) : 'None'}</div>
                <div><strong>Last Run:</strong> ${s.lastRun ? formatDateTime(s.lastRun) : 'Not yet executed'}</div>
              </div>
            </div>

            <!-- Recent Run History -->
            <div class="auto-detail-section">
              <h4 class="auto-detail-heading">Recent Run History</h4>
              ${runs.length > 0 ? `
                <div class="auto-mini-list">
                  ${runs.slice(0, 5).map(r => `
                    <div class="auto-mini-item">
                      <div>
                        <strong>${formatDateTime(r.completed || r.started)}</strong>
                        <div class="auto-mini-sub">${esc(explainState(r))} · Duration: ${formatDuration(r)}</div>
                      </div>
                      ${r.output ? `<button class="auto-btn auto-btn-sm auto-btn-primary" data-act="job-open" data-path="${esc(r.output)}">Open Report</button>` : ''}
                    </div>
                  `).join('')}
                </div>
              ` : `
                <p style="color:#64748b;font-size:13px;">No recorded runs for this scheduled automation yet.</p>
              `}
            </div>
          </div>

          <div class="auto-modal-footer">
            <button class="auto-btn auto-btn-primary" data-act="auto-run-schedule-now" data-id="${s.id}">Run Now</button>
            <button class="auto-btn" data-act="schedule-toggle" data-id="${s.id}">${s.enabled ? 'Pause Schedule' : 'Resume Schedule'}</button>
            <button class="auto-btn" data-act="schedule-duplicate" data-id="${s.id}">Duplicate</button>
            <button class="auto-btn" data-act="schedule-edit" data-id="${s.id}">Edit</button>
            <button class="auto-btn auto-btn-danger" data-act="delete-item" data-kind="schedule" data-id="${s.id}">Delete</button>
            <button class="auto-btn" id="btn-modal-done">Done</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-close-modal')?.addEventListener('click', closeModal);
    document.getElementById('btn-modal-done')?.addEventListener('click', closeModal);
    document.getElementById('auto-modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'auto-modal-backdrop') closeModal();
    });
  }

  // Details Modal for a Job / Run
  function renderRunDetailsModal(j) {
    const modalContainer = document.getElementById('auto-modal-container');
    if (!modalContainer) return;

    modalContainer.innerHTML = `
      <div class="auto-modal-backdrop" id="auto-modal-backdrop">
        <div class="auto-modal-dialog">
          <div class="auto-modal-header">
            <div>
              <h2 class="auto-modal-title">${esc(j.title || 'Report')}</h2>
              <span class="auto-status-pill status-${j.status}">${esc(j.status.toUpperCase())}</span>
            </div>
            <button class="auto-modal-close" id="btn-close-modal">✕</button>
          </div>

          <div class="auto-modal-body">
            <!-- Operational Summary -->
            <div class="auto-detail-section">
              <h4 class="auto-detail-heading">Operational Summary</h4>
              <div class="auto-meta-grid">
                <div><strong>Run Started:</strong> ${j.started ? formatDateTime(j.started) : 'Waiting'}</div>
                <div><strong>Run Completed:</strong> ${j.completed ? formatDateTime(j.completed) : 'In progress / unconfirmed'}</div>
                <div><strong>Duration:</strong> ${formatDuration(j)}</div>
                <div><strong>Worker / PC:</strong> ${j.remote ? 'Remote Worker' : 'This PC'}</div>
              </div>
            </div>

            <!-- Plain-Language Explanation -->
            <div class="auto-detail-section">
              <h4 class="auto-detail-heading">Status Explanation</h4>
              <div class="auto-plain-state-box">
                <p style="margin:0;font-size:13.5px;">${esc(explainState(j))}</p>
                ${j.error ? `<div style="margin-top:6px;font-size:11.5px;color:#94a3b8;">Underlying Diagnostic Code: <code>${esc(j.error)}</code></div>` : ''}
              </div>
            </div>

            <!-- Findings vs Output -->
            ${j.output ? `
              <div class="auto-detail-section">
                <h4 class="auto-detail-heading">Generated Output</h4>
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--theme-surface-soft, #f8fafc);border:1px solid var(--theme-border, #e2e8f0);border-radius:6px;">
                  <div>
                    <strong>📄 ${esc(j.output)}</strong>
                    <div style="font-size:12px;color:var(--theme-text-muted, #64748b);margin-top:2px;">Saved securely to your Work folder</div>
                  </div>
                  <button class="auto-btn auto-btn-primary" data-act="job-open" data-path="${esc(j.output)}">Open Report</button>
                </div>
              </div>
            ` : ''}

            <!-- Recovery Data when safe -->
            ${j.recoverable && j.status === 'failed' ? `
              <div class="auto-detail-section">
                <h4 class="auto-detail-heading">Recovery Data Available</h4>
                <div class="auto-plain-state-box" style="background:#eff6ff;border-color:#bfdbfe;">
                  <p style="margin:0;font-size:13px;color:#1e40af;">
                    This report has an encrypted recovery checkpoint. Extracted documents and partial answers are preserved to prevent redundant processing.
                  </p>
                </div>
              </div>
            ` : ''}
          </div>

          <div class="auto-modal-footer">
            ${j.output ? `<button class="auto-btn auto-btn-primary" data-act="job-open" data-path="${esc(j.output)}">Open Report</button>` : ''}
            ${j.recoverable && j.status === 'failed' ? `<button class="auto-btn auto-btn-primary" data-act="job-resume" data-id="${j.id}">Review &amp; Resume</button>` : ''}
            ${j.resultText && !j.recoverable && j.status === 'failed' ? `<button class="auto-btn auto-btn-primary" data-act="retry-export" data-id="${j.id}">Save PDF</button>` : ''}
            ${['running', 'waiting', 'paused'].includes(j.status) ? `<button class="auto-btn auto-btn-danger" data-act="job-stop" data-id="${j.id}">Stop Task</button>` : ''}
            <button class="auto-btn" id="btn-modal-done">Done</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-close-modal')?.addEventListener('click', closeModal);
    document.getElementById('btn-modal-done')?.addEventListener('click', closeModal);
    document.getElementById('auto-modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'auto-modal-backdrop') closeModal();
    });
  }

  function closeModal() {
    const container = document.getElementById('auto-modal-container');
    if (container) container.innerHTML = '';
  }

  // Bind interaction handlers
  function bindEvents(container, state) {
    // Tab switching
    container.querySelectorAll('[data-act="auto-tab"]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        refresh().then(() => renderPage('automation'));
      });
    });

    // History filter change
    const statusFilter = container.querySelector('#history-filter-status');
    if (statusFilter) {
      statusFilter.addEventListener('change', (e) => {
        historyFilter.status = e.target.value;
        const panel = container.querySelector('.auto-tab-content');
        if (panel) panel.innerHTML = renderHistoryTab({ jobs: state.jobs || [], schedules: state.schedules || [] });
        bindEvents(container, state);
      });
    }

    const searchFilter = container.querySelector('#history-filter-search');
    if (searchFilter) {
      searchFilter.addEventListener('input', (e) => {
        historyFilter.search = e.target.value;
        const panel = container.querySelector('.auto-tab-content');
        if (panel) panel.innerHTML = renderHistoryTab({ jobs: state.jobs || [], schedules: state.schedules || [] });
        bindEvents(container, state);
      });
    }

    // Schedule details
    container.querySelectorAll('[data-act="auto-view-schedule"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const s = (state.schedules || []).find(x => x.id === id);
        if (s) {
          const runs = (state.jobs || []).filter(j => j.scheduleId === id || j.title === s.name);
          renderScheduleDetailsModal(s, runs);
        }
      });
    });

    // Run details
    container.querySelectorAll('[data-act="auto-view-run"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const j = (state.jobs || []).find(x => x.id === id);
        if (j) renderRunDetailsModal(j);
      });
    });

    // Immediate run of a schedule
    container.querySelectorAll('[data-act="auto-run-schedule-now"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const s = (state.schedules || []).find(x => x.id === id);
        if (!s) return;
        try {
          btn.disabled = true;
          if(s.browserRecipeId){toast('Use Download report in Website report schedules for a manually approved run.');renderPage('browser');return;}
          await api('runJob', {
            name: s.name,
            title: s.name,
            prompt: s.prompt,
            format: s.format,
            fileIds: s.fileIds,
            scheduleId: s.id,
            target: s.target || null
          });
          toast(`Scheduled task "${s.name}" started now.`);
          await refresh();
          renderPage('automation');
        } catch (err) {
          toast(err.message);
          btn.disabled = false;
        }
      });
    });

    // Quick enable worker
    container.querySelectorAll('[data-act="quick-enable-worker"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          if (state.settings?.role === 'primary') {
            toast('Select Both or Worker in Worker settings before enabling background jobs on this PC.');
            renderPage('worker');
            return;
          }
          await api('settings', { workerEnabled: true });
          await refresh();
          renderPage('automation');
          toast('Background Worker enabled.');
        } catch (err) {
          toast(err.message);
        }
      });
    });

    // Edit local worker
    container.querySelectorAll('[data-act="auto-edit-local-worker"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const w = state.worker || {};
        const s = state.settings || {};
        const r = await form(
          'Worker PC Settings',
          field('PC label', 'workerName', w.label || 'My PC') +
          select('Role for this PC', 'role', [
            ['primary', 'Primary — daily chat'],
            ['worker', 'Worker — scheduled and shared jobs'],
            ['both', 'Both — chat and background jobs']
          ], s.role || 'primary')
        );
        if (r) {
          await api('workerName', { name: r.workerName });
          await api('settings', { role: r.role });
          await refresh();
          renderPage('automation');
          toast('Worker parameters saved.');
        }
      });
    });

    // Refresh dashboard
    container.querySelectorAll('[data-act="auto-refresh"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        await refresh();
        renderPage('automation');
        toast('Automation Center refreshed.');
      });
    });
  }
}

