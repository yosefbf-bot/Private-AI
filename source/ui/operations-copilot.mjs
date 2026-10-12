import { captureSpeakerSample } from './speaker-capture.mjs';
import { browserSpeechAllowed } from './speech-policy.mjs';
import { createOperationsAnalyticsUI } from './operations-analytics.mjs';
// Operations Intelligence + Meeting Copilot + Interactive SBAR + Shift Handoff UI Module
// Comprehensive operational command center, morning standup briefing,
// real-time live meeting copilot with audio pipeline, non-speech filtering, speaker recognition,
// interactive SBAR generator with clinical recommendation safeguards, and structured shift handoffs.

export function createOperationsCopilotUI({ api, esc, toast, refresh, renderPage, getState = () => null }) {
  // Navigation tabs: 'operations' | 'copilot' | 'speaker_review' | 'sbar' | 'handoff' | 'protocols' | 'history'
  let activeTab = 'operations';
  let captureController = null, captureDialog = null, pendingAcoustic = null, capturePolicy = null;
  let activeMeeting = null; // Current live or selected meeting
  let isListening = false;
  let activeSpeaker = 'Unknown Speaker';
  let activeRole = 'Unverified';
  let recognitionInstance = null;
  let meetingHistory = [];
  let opsData = null;
  let historySearch = '';
  let currentOptions = {};
  const analyticsUI = createOperationsAnalyticsUI({ api, esc, toast, refresh, renderPage, getState });

  // Audio Pipeline & Speaker Recognition State
  let audioQuality = { status: 'Unmeasured', noiseFloorDb: 'Unknown', snrDb: 'Unknown', warning: 'Local speaker recording is available for one speaker at a time. Automatic names are experimental suggestions; confirm identity before assigning work.' };
  let speakerProfiles = [];
  let speakerReviewData = null;
  let pendingCorrection = null;
  let micCheckModalOpen = false;
  let micCheckData = null;

  // SBAR & Protocol State
  let sbarList = [];
  let activeSbar = null;
  let sbarTemplates = [];
  let facilityProtocols = [];
  let showSources = true;
  let sbarSnapshotHours = 48;
  let shiftHandoffData = null;

  const ROLES = [{label: 'Unknown Speaker — verify manually', role: 'Unverified', dept: '', speaker: 'Unknown Speaker'}];
  const metric = value => value == null ? 'Not available' : esc(String(value));

  function formatTime(ts) {
    if (!ts) return '—';
    const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
    if (Number.isNaN(d.getTime())) return String(ts);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
    if (Number.isNaN(d.getTime())) return String(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatDateTime(ts) {
    if (!ts) return '—';
    return `${formatDate(ts)} ${formatTime(ts)}`;
  }

  return {
    async render(container, options = {}) {
      currentOptions = options;
      if (options.tab) activeTab = options.tab;
      if (options.alertId || options.residentName) {
        activeTab = 'sbar';
      }

      container.innerHTML = `
        <div class="ops-page">
          <div class="ops-loading">Loading Operations Intelligence, Meeting Audio &amp; SBAR Engine...</div>
        </div>
      `;

      try {
        const [ops, meetings, sbars, templates, protocols, profiles] = await Promise.all([
          api('operationsSummary'),
          api('meetingList'),
          api('sbarList'),
          api('sbarTemplates'),
          api('sbarProtocols'),
          api('speakerProfilesList')
        ]);

        opsData = ops;
        meetingHistory = meetings || [];
        sbarList = sbars || [];
        sbarTemplates = templates || [];
        facilityProtocols = protocols || [];
        speakerProfiles = profiles || [];
        ROLES.splice(1, ROLES.length, ...speakerProfiles.map(p => ({label: p.name, speaker: p.name, role: p.role || 'Attendee', dept: p.department || ''})));

        // If launching directly with resident or alert parameters, auto-draft SBAR
        if (options.residentName || options.alertId) {
          try {
            activeSbar = await api('sbarGenerate', {
              residentName: options.residentName || 'Resident',
              residentRoom: options.residentRoom || '',
              alertId: options.alertId || null,
              templateKey: options.templateKey || 'general_provider',
              target: 'attending_physician'
            });
            sbarList = await api('sbarList').catch(() => sbarList);
          } catch (e) {
            console.warn('Direct SBAR draft creation failed:', e);
          }
        }

        // Resolve selected objects from this workspace on every load.
        if(options.sbarId){activeSbar=await api('sbarGet',{id:options.sbarId});activeTab='sbar';}
        if(options.meetingId){activeMeeting=await api('meetingGet',{id:options.meetingId});activeTab=options.tab==='speaker_review'?'speaker_review':'copilot';if(activeTab==='speaker_review')speakerReviewData=await api('speakerReviewGet',{meetingId:activeMeeting.id});}
        activeMeeting = meetingHistory.find(m => m.id === activeMeeting?.id) || meetingHistory.find(m => m.status === 'live') || null;
        activeSbar = sbarList.find(s => s.id === activeSbar?.id) || sbarList[0] || null;
      } catch (err) {
        container.innerHTML = `
          <div class="ops-page">
            <div class="ops-error-banner" role="alert">
              <strong>Error loading Operations data:</strong> ${esc(err.message)}
            </div>
            <button class="ops-btn ops-btn-primary" id="ops-retry-btn">Retry</button>
          </div>
        `;
        container.querySelector('#ops-retry-btn')?.addEventListener('click', () => this.render(container));
        return;
      }

      this.renderFullView(container);
    },

    renderFullView(container) {
      const ops = opsData || {};
      const census = ops.census || {payerMix: {}};
      const surv = ops.surveillance || { criticalAlertsCount: 0, highAlertsCount: 0, fallAlerts24h: 0, fallAlerts7d: 0, activeWoundAlerts: 0, activeInfectionAlerts: 0, activePsychAlerts: 0 };
      const staffing = ops.staffing || {};
      const pendingCallbacksCount = (ops.sbars?.pendingCallbacksCount) || sbarList.filter(s => s.closeTheLoop?.stage === 'awaiting_callback').length;

      container.innerHTML = `<div class="ops-page"><button data-act="view" data-view="meetings">← Meetings</button><h1>${activeTab==='voice_profiles'?'Voice profiles':activeTab==='speaker_review'?'Speaker review':'Clinical communication record'}</h1>${ops.demo?'<p class="error-note">DEMO DATA — NOT FOR CLINICAL USE</p>':''}<main class="ops-body">${activeTab==='voice_profiles'?this.renderProtocolsAndProfilesView():activeTab==='speaker_review'?this.renderSpeakerReviewView():this.renderSbarView()}</main></div>`;

      this.attachEvents(container);

      if (activeTab === 'analytics') {
        const mount = container.querySelector('#ops-analytics-mount');
        if (mount) analyticsUI.render(mount, currentOptions);
      }
    },

    // -------------------------------------------------------------
    // Tab 1: Operations Radar & KPI Command Center
    // -------------------------------------------------------------
    renderOperationsRadar(ops) {
      const census = ops.census || {payerMix: {}};
      const surv = ops.surveillance || { criticalAlertsCount: 0, highAlertsCount: 0, fallAlerts24h: 0, fallAlerts7d: 0, activeWoundAlerts: 0, activeInfectionAlerts: 0, activePsychAlerts: 0, hospitalTransfers24h: 0 };
      const staffing = ops.staffing || {};
      const radar = ops.surveyRadar || [];
      const cmd = ops.commandCenter || { needsAttention: [], followUps: [], meetingActions: [], automationHealth: { status: 'Not available' } };

      return `
        <div class="ops-radar-container"><p><button class="ops-btn" data-act="view" data-view="actions">All assignments &amp; changes since review</button></p>
          <!-- Command Center Integrated Action Alert Strip -->
          <section class="ops-command-strip">
            <div class="ops-command-card card-attention">
              <div class="ops-command-header">
                <span class="ops-command-icon">🚨</span>
                <strong>Needs Attention (${cmd.needsAttention.length})</strong>
              </div>
              <div class="ops-command-list">
                ${cmd.needsAttention.length === 0 ? `<div class="ops-empty-cmd">No critical escalations pending.</div>` : cmd.needsAttention.slice(0, 3).map(item => `
                  <div class="ops-cmd-item">
                    <span class="ops-cmd-badge ${item.type.includes('callback') ? 'badge-callback' : 'badge-crit'}">${item.type === 'provider_callback_pending' ? 'MD CALLBACK PENDING' : 'CRITICAL'}</span>
                    <strong class="ops-cmd-title">${esc(item.title)}:</strong>
                    <span class="ops-cmd-detail">${esc(item.detail)}</span>
                    ${item.type === 'provider_callback_pending' ? `
                      <button type="button" class="ops-btn ops-btn-xs ops-btn-primary ops-open-sbar-btn" data-sbar-id="${esc(item.id)}">Open SBAR</button>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="ops-command-card card-followup">
              <div class="ops-command-header">
                <span class="ops-command-icon">⏱</span>
                <strong>Follow-Up Engine (${cmd.followUps.length})</strong>
              </div>
              <div class="ops-command-list">
                ${cmd.followUps.length === 0 ? `<div class="ops-empty-cmd">No follow-ups recorded in available data.</div>` : cmd.followUps.slice(0, 3).map(f => `
                  <div class="ops-cmd-item">
                    <span class="ops-cmd-badge badge-pending">PENDING</span>
                    <span>${esc(f.title)}</span>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="ops-command-card card-commitments">
              <div class="ops-command-header">
                <span class="ops-command-icon">🤝</span>
                <strong>Meeting Actions (${cmd.meetingActions.length})</strong>
              </div>
              <div class="ops-command-list">
                ${cmd.meetingActions.length === 0 ? `<div class="ops-empty-cmd">No open meeting actions in available records.</div>` : cmd.meetingActions.slice(0, 3).map(a => `
                  <div class="ops-cmd-item">
                    <strong class="ops-cmd-title">${esc(a.assignee || 'Staff')}:</strong>
                    <span>${esc(a.task)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </section>

          <!-- Top Vital Signs Grid -->
          <section class="ops-vitals-grid">
            <div class="ops-kpi-card">
              <div class="ops-kpi-label">IMPORTED ACTIVE RESIDENTS</div>
              <div class="ops-kpi-value">${metric(census.activeResidents)}</div>
              <p>Based on imported records, not a live census. Verify source dates.</p>
            </div>
            <!-- Metric 2: Clinical Alert Velocity -->
            <div class="ops-kpi-card ${surv.criticalAlertsCount > 0 ? 'kpi-crit' : ''}">
              <div class="ops-kpi-label">SURVEILLANCE VELOCITY (24H)</div>
              <div class="ops-kpi-value ${surv.criticalAlertsCount > 0 ? 'text-crit' : ''}">
                ${surv.criticalAlertsCount} <span class="ops-kpi-unit">Critical</span>
                <span class="ops-kpi-secondary">${surv.highAlertsCount} High</span>
              </div>
              <div class="ops-kpi-sub">
                <span>Falls 24h: <strong>${surv.fallAlerts24h}</strong> (7d: ${surv.fallAlerts7d})</span>
                <span class="ops-sep">·</span>
                <span>Wounds: <strong>${surv.activeWoundAlerts}</strong></span>
              </div>
              <div class="ops-payer-strip">
                <span>Infections: <strong>${surv.activeInfectionAlerts}</strong></span>
                <span>Psychotropics: <strong>${surv.activePsychAlerts}</strong></span>
                <span>ER Transfers: <strong>${surv.hospitalTransfers24h}</strong></span>
              </div>
            </div>

            <!-- Metric 4: Rapid Actions & Generator Launcher -->
            <div class="ops-kpi-card ops-launch-card">
              <div class="ops-kpi-label">INTERDISCIPLINARY ACTIONS</div>
              <div class="ops-kpi-value-sm">Quick Operations Launch</div>
              <p class="ops-launch-desc">One-click operational synthesis, real-time meeting copilot, or structured clinical SBAR generation.</p>
              <div class="ops-launch-actions">
                <button type="button" class="ops-btn ops-btn-primary ops-btn-sm" id="ops-gen-huddle-btn">
                  ⚡ Morning Standup Brief
                </button>
                <button type="button" class="ops-btn ops-btn-secondary ops-btn-sm" id="ops-start-copilot-btn">
                  🎙 Launch Standup Copilot
                </button>
                <button type="button" class="ops-btn ops-btn-secondary ops-btn-sm" id="ops-quick-sbar-btn">
                  📋 Draft SBAR
                </button>
              </div>
            </div>
          </section>

          <!-- Middle Split: Morning Huddle Brief Preview & Regulatory Radar -->
          <div class="ops-split-grid">
            <!-- Left: Morning Huddle Brief Box -->
            <section class="ops-card ops-huddle-box" id="ops-huddle-box">
              <div class="ops-card-header">
                <div>
                  <h2 class="ops-card-title">Morning Standup &amp; Huddle Brief</h2>
                  <p class="ops-card-subtitle">Imported clinical findings, recorded follow-ups, and meeting actions.</p>
                </div>
                <div class="ops-card-actions">
                  <button type="button" class="ops-btn ops-btn-sm ops-btn-secondary" id="ops-copy-brief-btn">📋 Copy Brief</button>
                  <button type="button" class="ops-btn ops-btn-sm ops-btn-primary" id="ops-refresh-brief-btn">↻ Refresh</button>
                </div>
              </div>
              <label><input type="checkbox" id="ops-include-checklist"> Include optional general department checklist</label><div class="ops-huddle-content" id="ops-huddle-content">
                <div class="ops-brief-placeholder">
                  <p>Click <strong>"Morning Standup Brief"</strong> to synthesize today's facility operations into an executive briefing document.</p>
                </div>
              </div>
            </section>

            <details class="ops-card" style="padding:16px">
              <summary>Set up operational data sources</summary>${(ops.measuredOperations||[]).length?`<p>${ops.measuredOperations.length} dated unit snapshots available. Open staffing &amp; census sources for values, coverage and provenance.</p>`:""}<button class="ops-btn" data-act="view" data-view="metrics">Staffing &amp; census sources</button>
              <p><strong>Census:</strong> Import mapped census records in Clinical imports.</p>
              <p><strong>Staffing:</strong> Import reviewed daily aggregate RN/LPN/CNA hours by unit and shift. Full-day completeness is required for HPPD.</p>
              <p><strong>Payer / occupancy:</strong> Import dated unit census, capacity and payer counts. Missing values stay unknown.</p>
              <p><strong>Survey risk:</strong> No validated scoring method is available. Review the actual alert evidence.</p>
              <button type="button" class="ops-btn" data-act="view" data-view="clinical-imports">Open Clinical imports</button>
            </details>
          </div>
        </div>
      `;
    },

    // -------------------------------------------------------------
    // Tab 2: Live Meeting Copilot & Audio Pipeline
    // -------------------------------------------------------------
    renderCopilotView() {
      if (!activeMeeting) {
        return `
          <div class="ops-copilot-launcher">
            <div class="ops-card ops-launcher-card">
              <div class="ops-card-header">
                <div>
                  <h2 class="ops-card-title">Start a Meeting Copilot Session</h2>
                  <p class="ops-card-subtitle">Start a meeting with agenda tracking, reviewed actions, manual notes, and optional local speaker suggestions. Browser transcription depends on your privacy settings.</p>
                </div>
                <div class="ops-card-actions">
                  <button type="button" class="ops-btn ops-btn-secondary ops-btn-sm" id="ops-preflight-mic-btn">
                    🎙 Check Microphone
                  </button>
                </div>
              </div>
              <div class="ops-template-grid">
                <div class="ops-template-card" data-create-type="morning_huddle">
                  <div class="ops-template-icon">🌅</div>
                  <h3 class="ops-template-title">Morning Standup / Daily Huddle</h3>
                  <p class="ops-template-desc">Interdisciplinary morning review of 24h clinical events, census changes, staffing HPPD, and immediate safety priorities.</p>
                  <button type="button" class="ops-btn ops-btn-primary ops-btn-sm">Start Standup Session →</button>
                </div>

                <div class="ops-template-card" data-create-type="clinical_idt">
                  <div class="ops-template-icon">🩺</div>
                  <h3 class="ops-template-title">Clinical &amp; IDT Review</h3>
                  <p class="ops-template-desc">Deep-dive clinical meeting tracking psychotropic GDRs, pressure injury wound staging, weight loss, and antibiotic stewardship.</p>
                  <button type="button" class="ops-btn ops-btn-primary ops-btn-sm">Start Clinical Review →</button>
                </div>

                <div class="ops-template-card" data-create-type="shift_handoff">
                  <div class="ops-template-icon">🔄</div>
                  <h3 class="ops-template-title">Shift-to-Shift Clinical Handoff</h3>
                  <p class="ops-template-desc">Structured nurse-to-nurse handoff covering acute resident vitals, pending labs, new orders, and 1-on-1 behavior watches.</p>
                  <button type="button" class="ops-btn ops-btn-primary ops-btn-sm">Start Shift Handoff →</button>
                </div>

                <div class="ops-template-card" data-create-type="safety_qaa">
                  <div class="ops-template-icon">⚠️</div>
                  <h3 class="ops-template-title">Safety, QAA &amp; Incident Review</h3>
                  <p class="ops-template-desc">Facility Quality Assurance review tracking fall incident root causes, 30-day hospital transfers, and F-Tag survey readiness.</p>
                  <button type="button" class="ops-btn ops-btn-primary ops-btn-sm">Start Safety / QAA →</button>
                </div>
              </div>
            </div>
          </div>
        `;
      }

      const m = activeMeeting;
      const agenda = m.agenda || [];
      const transcript = m.transcript || [];
      const actionItems = m.actionItems || [];
      const clinicalRadar = m.clinicalRadar || [];
      const attendees = m.attendees || [];

      return `
        <div class="ops-meeting-room">
          ${(activeMeeting?.carryover||[]).length?`<section class="ops-card"><h3>Carryover from earlier meetings</h3><p>Linked to the original assignments. Changes in Action Center update their current status.</p>${activeMeeting.carryover.map(a=>`<p>${esc(a.task)} — ${esc(a.status)} · ${esc(a.assignee||'Unassigned')}</p>`).join('')}<button data-act="view" data-view="actions">Review assignments</button></section>`:''}
          <!-- Top Session Controller Bar -->
          <div class="ops-session-bar">
            <div class="ops-session-left">
              <div class="ops-session-title-wrap">
                <span class="ops-session-tag">${esc((m.type || 'Meeting').replaceAll('_', ' ').toUpperCase())}</span>
                <h2 class="ops-session-title">${esc(m.title)}</h2>
              </div>
              <div class="ops-session-meta">
                <span>Date: ${formatDateTime(m.date)}</span>
                <span class="ops-sep">·</span>
                <span>Shift: ${esc(m.shift.toUpperCase())}</span>
                <span class="ops-sep">·</span>
                <span>Status: <strong class="${m.status === 'live' ? 'text-ok' : ''}">${esc(m.status.toUpperCase())}</strong></span>
              </div>
            </div>

            <div class="ops-session-controls">
              <!-- Audio Pipeline Quality Badge -->
              <div class="ops-audio-quality-badge quality-${audioQuality.status.toLowerCase()}" title="Noise Floor: ${audioQuality.noiseFloorDb}dB, SNR: ${audioQuality.snrDb}dB">
                <span class="ops-dot"></span>
                <span>Audio: <strong>${audioQuality.status}</strong></span>
              </div>
              <button type="button" class="ops-btn ops-btn-secondary ops-btn-sm" id="ops-preflight-mic-btn">
                🎙 Mic Check
              </button>
              <button type="button" class="ops-btn ops-btn-secondary ops-btn-sm" id="ops-edit-attendees-btn">
                👥 Attendees (${attendees.length})
              </button>
              ${m.status === 'live' ? `
                <button type="button" class="ops-btn ops-btn-danger ops-btn-sm" id="ops-finalize-meeting-btn">
                  ✓ Finalize &amp; Speaker Review
                </button>
              ` : `
                <button type="button" class="ops-btn ops-btn-primary ops-btn-sm" id="ops-export-minutes-btn">
                  📄 View Minutes
                </button>
              `}
              <button type="button" class="ops-btn ops-btn-secondary ops-btn-sm" id="ops-close-session-btn">
                ✕ Close
              </button>
            </div>
          </div>

          ${audioQuality.warning ? `
            <div class="ops-audio-warning-banner" role="alert">
              <strong>Audio Quality Notice:</strong> ${esc(audioQuality.warning)}
            </div>
          ` : ''}

          <!-- Live Audio Speech Ingestion & Acoustic Filter Bar -->
          <section class="ops-speech-bar">
            <div class="ops-mic-control-block">
              <button type="button" class="ops-mic-btn ${isListening ? 'listening' : ''}" id="ops-toggle-mic-btn" title="Toggle Live Speech-to-Text Recognition">
                <span class="ops-mic-icon">🎙</span>
                <span class="ops-mic-label">${isListening ? 'STOP LISTENING' : 'START LIVE MIC'}</span>
              </button>
              <div class="ops-audio-pulse ${isListening ? 'active' : ''}">
                <span></span><span></span><span></span><span></span>
              </div>
            </div>

            <div class="ops-pipeline-indicators">
              <span class="ops-indicator-pill">Local speaker measurement: opt-in, one speaker per recording</span>
              <span class="ops-indicator-pill">Names require confirmation; overlapping speech is unsupported</span>
            </div>

            <div class="ops-role-selector-block">
              <span class="ops-role-selector-label">Manually selected speaker:</span>
              <div class="ops-role-chips">
                ${ROLES.map(r => `
                  <button type="button" class="ops-role-chip ${activeSpeaker === r.speaker ? 'active' : ''}" data-set-role="${esc(r.role)}" data-set-speaker="${esc(r.speaker)}">
                    ${esc(r.speaker)} (${esc(r.role)})
                  </button>
                `).join('')}
              </div>
            </div>

            <div class="ops-quick-input-block">
              <input type="text" id="ops-statement-input" class="ops-statement-input" placeholder="Type or dictate statement for ${esc(activeSpeaker)}…" aria-label="Statement input">
              <button type="button" class="ops-btn ops-btn-secondary ops-btn-sm" id="ops-record-speaker-btn">Record speaker for this statement</button><span id="ops-speaker-result" role="status"></span><button type="button" class="ops-btn ops-btn-primary ops-btn-sm" id="ops-submit-statement-btn">Add Statement ↑</button>
            </div>
          </section>

          <!-- Acoustic Event Helper Shortcuts -->
          <div class="ops-acoustic-shortcuts">
            <span class="ops-shortcut-label">Simulate Acoustic Event:</span>
            <button type="button" class="ops-btn ops-btn-xs ops-btn-secondary" id="ops-sim-page-btn" title="Simulate Overhead PA Facility Page">📢 Overhead Page</button>
            <button type="button" class="ops-btn ops-btn-xs ops-btn-secondary" id="ops-sim-crosstalk-btn" title="Simulate Cross-talk / Multiple Speakers">👥 Simultaneous Cross-Talk</button>
            <button type="button" class="ops-btn ops-btn-xs ops-btn-secondary" id="ops-sim-unknown-btn" title="Simulate Unregistered Guest Voice">❓ Unknown Guest Speaker</button>
          </div>

          <!-- Triple-Pane Live Layout -->
          <div class="ops-triple-grid">
            <!-- Pane 1: Agenda Tracker -->
            <section class="ops-pane ops-agenda-pane">
              <div class="ops-pane-header">
                <h3 class="ops-pane-title">Agenda Tracker</h3>
                <span class="ops-pane-stat">${agenda.filter(a => a.completed).length}/${agenda.length} Done</span>
              </div>
              <div class="ops-agenda-list">
                ${agenda.map(item => `
                  <div class="ops-agenda-item ${item.completed ? 'completed' : ''}" data-agenda-id="${esc(item.id)}">
                    <label class="ops-agenda-label">
                      <input type="checkbox" class="ops-agenda-check" data-agenda-check="${esc(item.id)}" ${item.completed ? 'checked' : ''}>
                      <span class="ops-agenda-text">${esc(item.title)}</span>
                    </label>
                  </div>
                `).join('')}
              </div>
              <div class="ops-agenda-add-row">
                <input type="text" id="ops-new-agenda-input" class="ops-input-sm" placeholder="Add custom agenda topic…">
                <button type="button" class="ops-btn ops-btn-secondary ops-btn-xs" id="ops-add-agenda-btn">＋ Add</button>
              </div>
            </section>

            <!-- Pane 2: Live Stream Transcript -->
            <section class="ops-pane ops-transcript-pane">
              <div class="ops-pane-header">
                <h3 class="ops-pane-title">Live Meeting Stream</h3>
                <span class="ops-pane-stat">${transcript.length} Entries</span>
              </div>
              <div class="ops-transcript-feed" id="ops-transcript-feed">
                ${transcript.length === 0 ? `
                  <div class="ops-empty-transcript">
                    <p>No statements recorded yet. Start microphone listening or type a statement above to begin live copilot ingestion.</p>
                  </div>
                ` : transcript.map(t => {
                  const conf = t.speakerVerified && t.attribution === 'manual' ? 'strong' : t.speaker === 'Unknown Speaker' ? 'weak' : 'possible';
                  const isUncertain = conf === 'possible';
                  const isUnknown = conf === 'weak' || t.speaker === 'Unknown Speaker';

                  return `
                    <article class="ops-transcript-card ${t.isOverheadPage ? 'card-overhead-page' : ''} ${t.isCrossTalk ? 'card-crosstalk' : ''} ${t.flags && t.flags.length > 0 ? 'card-flagged' : ''}">
                      <div class="ops-transcript-topline">
                        <div class="ops-speaker-badge">
                          <strong class="ops-speaker-name">${esc(t.speaker)}</strong>
                          <span class="ops-speaker-role">(${esc(t.role)})</span>
                          ${isUncertain ? `<span class="ops-conf-pill pill-uncertain" title="Tentative speaker match">Suggested — confirm identity</span>` : ''}
                          ${isUnknown ? `<span class="ops-conf-pill pill-unknown">Unknown Speaker</span>` : ''}
                          ${t.isOverheadPage ? `<span class="ops-conf-pill pill-page">Possible overhead page</span>` : ''}
                          ${t.isCrossTalk ? `<span class="ops-conf-pill pill-crosstalk">Multiple speakers</span>` : ''}
                        </div>
                        <span class="ops-transcript-time">${formatTime(t.timestamp)}</span>
                      </div>
                      <p class="ops-transcript-body">${esc(t.text)}</p>

                      ${t.flags && t.flags.length > 0 ? `
                        <div class="ops-transcript-flags">
                          ${t.flags.map(f => `
                            <span class="ops-flag-pill flag-${esc(f.severity || 'high')}">
                              ${f.category === 'overhead_page' ? '📢' : '⚠'} ${esc(f.label)}
                            </span>
                          `).join('')}
                        </div>
                      ` : ''}

                      ${!t.speakerVerified ? `
                        <div class="ops-quick-confirm-row">
                          <span>Verify speaker:</span>
                          <button type="button" class="ops-btn ops-btn-xs ops-btn-secondary ops-confirm-speaker-btn" data-entry-id="${esc(t.id)}" data-speaker-name="${esc(t.speaker.replace('Probably ', '').replace(' ?', ''))}">✓ Confirm</button>
                          <button type="button" class="ops-btn ops-btn-xs ops-btn-secondary ops-change-speaker-btn" data-entry-id="${esc(t.id)}">Change</button>
                        </div>
                      ` : ''}
                    </article>
                  `;
                }).join('')}
              </div>
            </section>

            <!-- Pane 3: Clinical Sentinel & Action Items -->
            <section class="ops-pane ops-sentinel-pane">
              <!-- Subpane A: Clinical Sentinel Radar -->
              <div class="ops-sentinel-subpane">
                <div class="ops-pane-header">
                  <h3 class="ops-pane-title">Clinical Sentinel Radar</h3>
                  <span class="ops-pane-stat">${clinicalRadar.length} Flags</span>
                </div>
                <div class="ops-sentinel-list">
                  ${clinicalRadar.length === 0 ? `
                    <div class="ops-empty-sub">No acute clinical risk items flagged in this session.</div>
                  ` : clinicalRadar.map(cr => `
                    <div class="ops-sentinel-card sev-${esc(cr.severity)}">
                      <div class="ops-sentinel-top">
                        <span class="ops-sentinel-pill">${esc(cr.label)}</span>
                        <span class="ops-sentinel-time">${formatTime(cr.timestamp)}</span>
                      </div>
                      <p class="ops-sentinel-snippet">"${esc(cr.snippet)}"</p>
                      <div class="ops-sentinel-footer">
                        <span class="ops-sentinel-speaker">Speaker: ${esc(cr.speaker)}</span>
                        <button type="button" class="ops-btn ops-btn-xs ops-btn-primary ops-launch-sbar-from-radar" data-concern="${esc(cr.snippet)}" data-speaker="${esc(cr.speaker)}">
                          📋 Draft SBAR
                        </button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- Subpane B: Candidate Action Items -->
              <div class="ops-actions-subpane">
                <div class="ops-pane-header">
                  <h3 class="ops-pane-title">Meeting Action Items</h3>
                  <span class="ops-pane-stat">${actionItems.length} Detected</span>
                </div>
                <div class="ops-actions-list">
                  ${actionItems.length === 0 ? `
                    <div class="ops-empty-sub">Statements containing tasks or commitments will automatically populate here.</div>
                  ` : actionItems.map(ai => `
                    <div class="ops-action-card">
                      <div class="ops-action-top">
                        <strong class="ops-action-task">${esc(ai.task)}</strong>
                        <span class="ops-action-pri pri-${esc(ai.priority)}">${esc(ai.priority.toUpperCase())}</span>
                      </div>
                      <div class="ops-action-meta">
                        <span>Assignee: <strong>${esc(ai.assignee)}</strong> (${esc(ai.department)})</span>
                        <span class="ops-sep">·</span>
                        <span>Due: ${formatDate(ai.dueDate)}</span>
                      </div>
                      <div class="ops-action-footer">
                        ${ai.convertedTodoId ? `
                          <span class="ops-todo-converted">✓ Converted to Universal Action Inbox</span>
                        ` : `
                          <button type="button" class="ops-btn ops-btn-xs ops-btn-primary" data-convert-todo="${esc(ai.id)}">
                            ＋ Save as Official To-Do
                          </button>
                        `}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </section>
          </div>
        </div>
      `;
    },

    // -------------------------------------------------------------
    // Tab 3: Post-Meeting Speaker Review & Profile Learning
    // -------------------------------------------------------------
    renderSpeakerReviewView() {
      const review = speakerReviewData;

      if (!review) {
        return `
          <div class="ops-card">
            <div class="ops-card-header">
              <h2 class="ops-card-title">Speaker Review Screen</h2>
            </div>
            <p style="padding:20px;color:#64748b;">No meeting session selected for speaker review. Finalize a live meeting or open a session from Archives.</p>
          </div>
        `;
      }

      return `
        <div class="ops-speaker-review-container">
          <div class="ops-card">
            <div class="ops-card-header">
              <div>
                <div class="ops-header-kicker">ACOUSTIC VERIFICATION &amp; CONTINUOUS LEARNING</div>
                <h2 class="ops-card-title">Meeting Speaker Review</h2>
                <p class="ops-card-subtitle">Verify speaker attributions rapidly across all transcript segments without reading every line. Confirm each identity. Profile enrollment is separate and always requires a fresh recording.</p>
              </div>
              <div class="ops-card-actions">
                <button type="button" class="ops-btn ops-btn-primary ops-btn-sm" id="ops-review-help-btn">
                  Review individual entries
                </button>
              </div>
            </div>

            <div class="ops-speaker-review-grid">
              ${(review.speakers || []).map(spk => `
                <div class="ops-speaker-review-card ${spk.confidenceLevel === 'possible' ? 'review-uncertain' : spk.confidenceLevel === 'weak' ? 'review-unknown' : 'review-confirmed'}">
                  <div class="ops-spk-review-top">
                    <div>
                      <h3 class="ops-spk-review-name">
                        ${spk.confidenceLevel === 'strong' ? '✓ ' : spk.confidenceLevel === 'possible' ? '? ' : '❓ '}
                        ${esc(spk.speaker)}
                      </h3>
                      <span class="ops-spk-review-role">Role: ${esc(spk.role || 'Attendee')}</span>
                    </div>
                    <span class="ops-spk-count-badge">${spk.count} segments</span>
                  </div>

                  <div class="ops-spk-review-status">
                    <span>Recognition Status:</span>
                    <strong class="status-${esc(spk.confidenceLevel)}">
                      ${spk.confidenceLevel === 'strong' ? 'Manually confirmed' : spk.confidenceLevel === 'possible' ? 'Tentative Match (Requires Verification)' : 'Unmatched Voice (Unknown Speaker)'}
                    </strong>
                  </div>

                  <div class="ops-spk-review-actions">
                    ${spk.confidenceLevel !== 'strong' ? `
                      <button type="button" class="ops-btn ops-btn-sm ops-btn-secondary ops-change-speaker-batch-btn" data-current-speaker="${esc(spk.speaker)}">
                        Change speaker labels
                      </button>
                    ` : `
                      <span class="ops-spk-verified-pill">✓ Manually confirmed</span>
                    `}
                  </div>
                </div>
              `).join('')}
            </div>

            ${pendingCorrection ? `
              <div class="ops-learning-callout" role="alert">
                <div class="ops-learning-header">
                  <strong>Learn From Verified Correction?</strong>
                </div>
                <p>You re-assigned <strong>${esc(pendingCorrection.oldSpeaker)}</strong> to <strong>${esc(pendingCorrection.newSpeaker)}</strong>. Use this correction to improve ${esc(pendingCorrection.newSpeaker)}'s future recognition?</p>
                <div class="ops-learning-actions">
                  <button type="button" class="ops-btn ops-btn-primary ops-btn-sm" id="ops-accept-learning-btn">
                    ✓ Yes, Update Voice Profile
                  </button>
                  <button type="button" class="ops-btn ops-btn-secondary ops-btn-sm" id="ops-dismiss-learning-btn">
                    Dismiss
                  </button>
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    },

    // -------------------------------------------------------------
    // Tab 4: Interactive SBAR & Shift-Handoff Generator
    // -------------------------------------------------------------
    renderSbarView() {
      const s = activeSbar;
      const targets = [
        { id: 'attending_physician', label: 'Attending Physician' },
        { id: 'medical_director', label: 'Medical Director' },
        { id: 'np_pa', label: 'Nurse Practitioner / PA' },
        { id: 'nursing_supervisor', label: 'Nursing Supervisor' },
        { id: 'don', label: 'Director of Nursing (DON)' },
        { id: 'family_representative', label: 'Family / Representative' },
        { id: 'hospital_ems', label: 'Hospital / EMS Emergency Handoff' },
        { id: 'other', label: 'Other Interdisciplinary Contact' }
      ];

      return `
        <div class="ops-sbar-container">
          <!-- SBAR Header Toolbar -->
          <div class="ops-sbar-toolbar">
            <div class="ops-sbar-toolbar-left">
              <span class="ops-sbar-chip chip-status-${s ? s.status : 'draft'}">
                ${s ? s.status.toUpperCase() : 'NEW DRAFT'}
              </span>
              <h2 class="ops-sbar-headline">
                ${s ? `${esc(s.residentName)} (${esc(s.residentRoom)}) — ${esc(s.templateName || 'Clinical SBAR')}` : 'Interactive SBAR Generator'}
              </h2>
            </div>

            <div class="ops-sbar-toolbar-actions">
              <button type="button" class="ops-btn ops-btn-sm ops-btn-secondary" id="ops-toggle-sources-btn">
                ${showSources ? '👁 Hide Sources' : '👁 Show Sources'}
              </button>
              <button type="button" class="ops-btn ops-btn-sm ops-btn-secondary" id="ops-new-sbar-btn">
                ＋ Draft New SBAR
              </button>
              ${s && s.status !== 'finalized' ? '<button type="button" class="ops-btn ops-btn-primary" id="ops-save-sbar-btn">Save Draft</button>' : ''}
              ${s && s.status === 'draft' ? `
                <button type="button" class="ops-btn ops-btn-secondary" id="ops-review-sbar-btn">
                  ✓ Mark Clinician Reviewed
                </button>
              ` : s && s.status === 'reviewed' ? `
                <button type="button" class="ops-btn ops-btn-sm ops-btn-danger" id="ops-finalize-sbar-btn">
                  🔒 Finalize SBAR
                </button>
              ` : ''}
              <button type="button" class="ops-btn ops-btn-sm ops-btn-secondary" id="ops-copy-sbar-btn">
                📋 Copy Text
              </button>
            </div>
          </div>

          <!-- SBAR Configuration Ribbon: Target & 48h Snapshot Window -->
          <section class="ops-sbar-config-ribbon">
            <div class="ops-config-item">
              <label for="ops-sbar-target-sel">Communication Target:</label>
              <select id="ops-sbar-target-sel" class="ops-select-sm">
                ${targets.map(t => `
                  <option value="${t.id}" ${s && s.targetKey === t.id ? 'selected' : ''}>${t.label}</option>
                `).join('')}
              </select>
            </div>

            <div class="ops-config-item">
              <label for="ops-sbar-template-sel">Template:</label>
              <select id="ops-sbar-template-sel" class="ops-select-sm">
                ${sbarTemplates.map(tpl => `
                  <option value="${tpl.id}" ${s && s.templateKey === tpl.id ? 'selected' : ''}>${tpl.name}</option>
                `).join('')}
              </select>
            </div>

            <div class="ops-config-item">
              <label for="ops-snapshot-hours">Clinical Snapshot:</label>
              <select id="ops-snapshot-hours" class="ops-select-sm">
                <option value="24" ${sbarSnapshotHours === 24 ? 'selected' : ''}>Previous 24 Hours</option>
                <option value="48" ${sbarSnapshotHours === 48 ? 'selected' : ''}>Previous 48 Hours (Default)</option>
                <option value="72" ${sbarSnapshotHours === 72 ? 'selected' : ''}>Previous 72 Hours</option>
                <option value="168" ${sbarSnapshotHours === 168 ? 'selected' : ''}>Previous 7 Days</option>
              </select>
            </div>

            <div class="ops-config-item">
              <span class="ops-freshness-indicator ${s?.dataFreshness?.isStale ? 'freshness-stale' : 'freshness-ok'}">
                Freshness: <strong>${s?.dataFreshness?.ageString || 'Current Shift'}</strong>
              </span>
            </div>
          </section>

          ${s?.dataFreshness?.isStale ? `
            <div class="ops-stale-warning-callout" role="alert">
              <strong>STALE DATA WARNING:</strong> Expected clinical vitals were documented ${esc(s.dataFreshness.ageString)}. Verify patient condition and obtain current vitals prior to communicating with provider.
            </div>
          ` : ''}

          ${(s?.missingCriticalItems || []).length > 0 ? `
            <div class="ops-missing-data-callout" role="alert">
              <div class="ops-missing-title">⚠ Incomplete Clinical Data Highlighted:</div>
              <ul class="ops-missing-list">
                ${s.missingCriticalItems.map(m => `
                  <li><strong>${esc(m.field)}:</strong> ${esc(m.status)}</li>
                `).join('')}
              </ul>
            </div>
          ` : ''}

          <!-- Close-the-Loop Progression Stepper -->
          <section class="ops-loop-tracker">
            <div class="ops-loop-title">Clinical Close-the-Loop Progression:</div>
            <div class="ops-loop-steps">
              <div class="ops-loop-step step-done">
                <span class="step-num">1</span>
                <span class="step-label">Condition Change</span>
              </div>
              <div class="ops-loop-step step-done">
                <span class="step-num">2</span>
                <span class="step-label">SBAR Drafted</span>
              </div>
              <div class="ops-loop-step ${s?.closeTheLoop?.stage !== 'sbar_drafted' ? 'step-done' : 'step-current'}">
                <span class="step-num">3</span>
                <span class="step-label">Provider Notified</span>
              </div>
              <div class="ops-loop-step ${s?.closeTheLoop?.stage === 'awaiting_callback' ? 'step-current' : s?.closeTheLoop?.stage === 'orders_received' || s?.closeTheLoop?.isComplete ? 'step-done' : ''}">
                <span class="step-num">4</span>
                <span class="step-label">Awaiting Orders</span>
              </div>
              <div class="ops-loop-step ${s?.closeTheLoop?.stage === 'orders_received' ? 'step-current' : s?.closeTheLoop?.isComplete ? 'step-done' : ''}">
                <span class="step-num">5</span>
                <span class="step-label">Orders Received</span>
              </div>
              <div class="ops-loop-step ${s?.closeTheLoop?.isComplete ? 'step-done' : ''}">
                <span class="step-num">6</span>
                <span class="step-label">Resolved / Documented</span>
              </div>
            </div>
          </section>

          ${!s ? `
            <div class="ops-card" style="padding:40px;text-align:center;">
              <p>No active SBAR selected. Click <strong>"Draft New SBAR"</strong> or choose a resident from surveillance to initialize structured communication.</p>
            </div>
          ` : `
            <!-- SBAR 4-Part Structured Interactive Card -->
            <div class="ops-sbar-grid">
              <!-- Part S: Situation -->
              <div class="ops-sbar-section sbar-s">
                <div class="ops-sbar-section-header">
                  <span class="ops-sbar-letter">S</span>
                  <div>
                    <h3 class="ops-sbar-section-title">Situation</h3>
                    <p class="ops-sbar-section-desc">Reason for communication, clinical concern, time of onset, immediate observations.</p>
                  </div>
                </div>
                <div class="ops-sbar-section-body">
                  <label class="ops-field-label">Current Clinical Concern &amp; Immediate Observations:</label>
                  <textarea class="ops-textarea" id="sbar-edit-situation-concern" ${s.status === 'finalized' ? 'disabled' : ''} rows="3">${esc(s.situation?.concern || '')}</textarea>
                  ${showSources ? `<div class="ops-source-attribution">Source: ${esc(s.situation?.source || 'Source not supplied')} · Onset: ${esc(s.situation?.onset || 'Unknown')}</div>` : ''}

                  <div class="ops-vitals-badge-row">
                    <strong>Vitals at Detection:</strong>
                    ${s.situation?.vitalSigns?.values ? `
                      <span>T: ${esc(s.situation.vitalSigns.values.temp || 'N/A')}</span>
                      <span>BP: ${esc(s.situation.vitalSigns.values.bp || 'N/A')}</span>
                      <span>P: ${esc(s.situation.vitalSigns.values.pulse || 'N/A')}</span>
                      <span>SpO2: ${esc(s.situation.vitalSigns.values.o2sat || 'N/A')}</span>
                    ` : `<span class="text-crit">${esc(s.situation?.vitalSigns?.status || 'No vitals recorded')}</span>`}
                  </div>
                  ${showSources ? `<div class="ops-source-attribution">Source: ${esc(s.situation?.vitalSigns?.source || 'Source not supplied')}</div>` : ''}
                </div>
              </div>

              <!-- Part B: Background -->
              <div class="ops-sbar-section sbar-b">
                <div class="ops-sbar-section-header">
                  <span class="ops-sbar-letter">B</span>
                  <div>
                    <h3 class="ops-sbar-section-title">Background</h3>
                    <p class="ops-sbar-section-desc">Diagnoses, allergies, code status, baseline cognition, mobility, recent falls, active meds.</p>
                  </div>
                </div>
                <div class="ops-sbar-section-body">
                  <div class="ops-bg-items">
                    <div class="ops-bg-item">
                      <span class="ops-bg-lbl">Active Diagnoses:</span>
                      <span>${(s.background?.primaryDiagnoses || []).map(d => d.name).join(', ')}</span>
                      ${showSources ? `<span class="ops-src">Diagnosis source: review supplied documentation</span>` : ''}
                    </div>
                    <div class="ops-bg-item">
                      <span class="ops-bg-lbl">Allergies:</span>
                      <strong class="${s.background?.allergies?.value?.includes('No allergy') ? 'text-warn' : ''}">${esc(s.background?.allergies?.value || 'Unknown')}</strong>
                      ${showSources ? `<span class="ops-src">Source: ${esc(s.background?.allergies?.source || 'Imported feeds')}</span>` : ''}
                    </div>
                    <div class="ops-bg-item">
                      <span class="ops-bg-lbl">Code Status:</span>
                      <span>${esc(s.background?.codeStatus?.value || 'Not available — verify before use')}</span>
                      ${showSources ? `<span class="ops-src">Source: Advance Directives</span>` : ''}
                    </div>
                    <div class="ops-bg-item">
                      <span class="ops-bg-lbl">Baseline Cognition:</span>
                      <span class="${s.background?.baselineCognition?.value?.includes('Not available') ? 'text-warn' : ''}">${esc(s.background?.baselineCognition?.value || 'Not available')}</span>
                      ${showSources ? `<span class="ops-src">Source: ${esc(s.background?.baselineCognition?.source || 'MDS 3.0 BIMS')}</span>` : ''}
                    </div>
                    <div class="ops-bg-item">
                      <span class="ops-bg-lbl">Recent Falls (48h):</span>
                      <span>${s.background?.recentFalls?.count || 0} event(s) — ${esc(s.background?.recentFalls?.notes || 'None')}</span>
                      ${showSources ? `<span class="ops-src">Source: Incident Log</span>` : ''}
                    </div>
                    <div class="ops-bg-item">
                      <span class="ops-bg-lbl">Relevant Medications:</span>
                      <span>${(s.background?.activeMedications || []).map(m => m.name).join(', ')}</span>
                      ${showSources ? `<span class="ops-src">Source: Active Medication Profile</span>` : ''}
                    </div>
                  </div>
                </div>
              </div>

              <!-- Part A: Assessment & Documented Findings -->
              <div class="ops-sbar-section sbar-a">
                <div class="ops-sbar-section-header">
                  <span class="ops-sbar-letter">A</span>
                  <div>
                    <h3 class="ops-sbar-section-title">Assessment &amp; Observations</h3>
                    <p class="ops-sbar-section-desc">Strictly distinguished: Documented objective findings vs Private AI surveillance flags.</p>
                  </div>
                </div>
                <div class="ops-sbar-section-body">
                  <!-- Documented findings -->
                  <div class="ops-doc-findings-group">
                    <h4 class="ops-group-sub">Documented Clinical Findings:</h4>
                    ${(s.assessment?.documentedFindings || []).map(f => `
                      <div class="ops-finding-row">
                        <strong class="ops-finding-lbl">${esc(f.label)}:</strong>
                        <span>${esc(f.detail)}</span>
                        ${showSources ? `<span class="ops-source-attribution">Source: ${esc(f.source)}</span>` : ''}
                      </div>
                    `).join('')}
                  </div>

                  <!-- AI Surveillance Flag (Explicitly Separated & Disclaimed) -->
                  <div class="ops-ai-flags-group">
                    <h4 class="ops-group-sub">Private AI Surveillance Interpretation (Not a Clinician Diagnosis):</h4>
                    ${(s.assessment?.aiSurveillanceFlags || []).map(flag => `
                      <div class="ops-ai-flag-box">
                        <div class="ops-ai-flag-kicker">⚠ SURVEILLANCE FLAG (REQUIRES LICENSED HUMAN EVALUATION)</div>
                        <p class="ops-ai-flag-text">${esc(flag.finding)}</p>
                        <small class="ops-ai-flag-disclaimer">${esc(flag.disclaimer)}</small>
                      </div>
                    `).join('')}
                  </div>

                  <div class="ops-clinician-notes-group">
                    <label class="ops-field-label">Clinician Manual Observations &amp; Nursing Assessment:</label>
                    <textarea class="ops-textarea" id="sbar-edit-clinician-notes" ${s.status === 'finalized' ? 'disabled' : ''} rows="2" placeholder="Add verified physical assessment, nursing observations, or patient statements…">${esc(s.assessment?.clinicianNotes || '')}</textarea>
                  </div>
                </div>
              </div>

              <!-- Part R: Request / Recommendation (Safety Safeguards Enforced) -->
              <div class="ops-sbar-section sbar-r">
                <div class="ops-sbar-section-header">
                  <span class="ops-sbar-letter">R</span>
                  <div>
                    <h3 class="ops-sbar-section-title">Request / Recommendation</h3>
                    <p class="ops-sbar-section-desc">Strict safeguards enforced: Private AI does not invent medical orders. Only safe communication requests, existing orders, or approved protocols appear.</p>
                  </div>
                </div>
                <div class="ops-sbar-section-body">
                  <div class="ops-recs-list">
                    ${(s.recommendations || []).map(r => `
                      <div class="ops-rec-card safety-${esc(r.safetyType)}">
                        <div class="ops-rec-main">
                          <span class="ops-rec-check">✓</span>
                          <span class="ops-rec-text">${esc(r.text)}</span>
                        </div>
                        <div class="ops-rec-safety-badge">
                          ${r.safetyType === 'facility_protocol' ? `<span class="badge-protocol">Facility Protocol: ${esc(r.protocolRef?.name || 'Protocol')}</span>` :
                            r.safetyType === 'existing_provider_order' ? `<span class="badge-order">Existing Provider Order</span>` :
                            r.safetyType === 'standing_order' ? `<span class="badge-order">Standing Order</span>` :
                            `<span class="badge-comm">Standard SBAR Communication</span>`}
                        </div>
                      </div>
                    `).join('')}
                  </div>

                  <div class="ops-rec-add-row">
                    <button type="button" class="ops-btn ops-btn-xs ops-btn-secondary" id="ops-add-protocol-rec-btn">
                      ＋ Add From Approved Facility Protocol
                    </button>
                    <button type="button" class="ops-btn ops-btn-xs ops-btn-secondary" id="ops-add-manual-rec-btn">
                      ＋ Add Clinician Manual Request
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Adapted Output Communication Box (Physician vs Family vs EMS) -->
            <section class="ops-card ops-adapted-card">
              <div class="ops-card-header">
                <div>
                  <h3 class="ops-card-title">Adapted Communication Text (${esc(s.targetRole || 'Recipient')})</h3>
                  <p class="ops-card-subtitle">Tone, terminology, and clinical detail automatically adapted for recipient audience.</p>
                </div>
                <div class="ops-card-actions">
                  <button type="button" class="ops-btn ops-btn-sm ops-btn-primary" id="ops-copy-adapted-btn">📋 Copy Communication</button>
                </div>
              </div>
              <textarea class="ops-textarea ops-adapted-text" id="ops-adapted-text" rows="8">${esc(s.adaptedCommunicationText || '')}</textarea>
            </section>

            <!-- Notification Tracking & Audit Logger Strip -->
            <section class="ops-card ops-notification-tracker-card">
              <div class="ops-card-header">
                <div>
                  <h3 class="ops-card-title">Document Provider / Recipient Contact</h3>
                  <p class="ops-card-subtitle">Internal tracking only. SBAR generation does not constitute notification until confirmed below.</p>
                </div>
              </div>

              <div class="ops-notification-form-grid">
                <div class="ops-form-field">
                  <label for="ops-notify-recipient">Recipient Name:</label>
                  <input type="text" id="ops-notify-recipient" class="ops-input-sm" value="Dr. Robert Smith (Attending)">
                </div>

                <div class="ops-form-field">
                  <label for="ops-notify-method">Contact Method:</label>
                  <select id="ops-notify-method" class="ops-select-sm">
                    <option value="phone">Phone Call</option>
                    <option value="secure_message">Secure Electronic Message / EHR</option>
                    <option value="fax">Clinical Fax</option>
                    <option value="in_person">In Person</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div class="ops-form-field">
                  <label for="ops-notify-outcome">Outcome:</label>
                  <select id="ops-notify-outcome" class="ops-select-sm">
                    <option value="awaiting_callback">Awaiting Callback (Auto-Schedules Follow-up)</option>
                    <option value="provider_contacted">Provider Contacted Directly</option>
                    <option value="orders_received">New Orders Received</option>
                    <option value="no_new_orders">No New Orders Given</option>
                    <option value="message_left">Message Left with Office / Answering Service</option>
                  </select>
                </div>

                <div class="ops-form-field">
                  <label for="ops-notify-readback">Order Readback:</label>
                  <select id="ops-notify-readback" class="ops-select-sm">
                    <option value="not_applicable">Not Applicable</option>
                    <option value="confirmed">Confirmed / Verified Readback</option>
                    <option value="pending">Pending Written Order</option>
                  </select>
                </div>

                <div class="ops-form-field">
                  <label for="ops-notify-btn">&nbsp;</label>
                  <button type="button" class="ops-btn ops-btn-primary ops-btn-sm" id="ops-log-notification-btn">
                    ✓ Log Notification Event
                  </button>
                </div>
              </div>

              <!-- Logged Communication Events History -->
              <div class="ops-notification-history">
                <h4 class="ops-history-sub">Logged Notification History:</h4>
                ${(s.notifications || []).length === 0 ? `
                  <div class="ops-empty-notify">No provider communications logged yet for this SBAR record.</div>
                ` : s.notifications.map(n => `
                  <div class="ops-notify-record">
                    <span class="ops-notify-time">${formatDateTime(n.timestamp)}</span>
                    <strong class="ops-notify-name">${esc(n.recipientName)}:</strong>
                    <span>via ${esc(n.method.toUpperCase())} · Outcome: <strong>${esc(n.outcome.replaceAll('_', ' ').toUpperCase())}</strong></span>
                    ${n.readback !== 'not_applicable' ? `<span class="ops-sep">·</span><span>Readback: <strong>${esc(n.readback)}</strong></span>` : ''}
                    <span class="ops-notify-user">Logged by: ${esc(n.user)}</span>
                    ${n.followUpTodoId ? `<span class="ops-followup-tag">⏱ Follow-up Scheduled in Action Inbox</span>` : ''}
                  </div>
                `).join('')}
              </div>
            </section>
          `}
        </div>
      `;
    },

    // -------------------------------------------------------------
    // Tab 5: Structured Shift Handoff (12 Sections)
    // -------------------------------------------------------------
    renderHandoffView(ops) {
      const h = shiftHandoffData;

      return `
        <div class="ops-handoff-container">
          <div class="ops-card">
            <div class="ops-card-header">
              <div>
                <div class="ops-header-kicker">INTERDISCIPLINARY CARE CONTINUITY</div>
                <h2 class="ops-card-title">Structured Shift-Change Clinical Handoff</h2>
                <p class="ops-card-subtitle">Comprehensive 12-section handoff report synthesized from active surveillance feeds, SBAR condition changes, and physician order telemetry.</p>
              </div>
              <div class="ops-card-actions">
                <select id="ops-handoff-shift-sel" class="ops-select-sm">
                  <option value="day">Day Shift (7 AM - 3 PM)</option>
                  <option value="evening">Evening Shift (3 PM - 11 PM)</option>
                  <option value="night">Night Shift (11 PM - 7 AM)</option>
                </select>
                <button type="button" class="ops-btn ops-btn-primary ops-btn-sm" id="ops-gen-shift-handoff-btn">
                  ⚡ Generate Handoff Report
                </button>
                <button type="button" class="ops-btn ops-btn-secondary ops-btn-sm" id="ops-print-handoff-btn">
                  🖨 Print Shift Report
                </button>
              </div>
            </div>

            ${!h ? `
              <div class="ops-handoff-empty">
                <p>Click <strong>"Generate Handoff Report"</strong> to assemble today's 12-section shift continuity briefing from live records.</p>
              </div>
            ` : `
              <div class="ops-handoff-12grid">
                <!-- 1. New / Changed Residents -->
                <div class="ops-h12-card">
                  <h3 class="ops-h12-title">1. New / Changed Residents (${h.sections.newOrChangedResidents.length})</h3>
                  <div class="ops-h12-body">
                    ${h.sections.newOrChangedResidents.length === 0 ? `<p class="ops-none">No acute status changes documented.</p>` : h.sections.newOrChangedResidents.map(r => `
                      <div class="ops-h12-item"><strong>${esc(r.residentName)}</strong> (${esc(r.room)}): ${esc(r.event)}</div>
                    `).join('')}
                  </div>
                </div>

                <!-- 2. Acute Concerns -->
                <div class="ops-h12-card">
                  <h3 class="ops-h12-title">2. Acute Clinical Concerns (${h.sections.acuteConcerns.length})</h3>
                  <div class="ops-h12-body">
                    ${h.sections.acuteConcerns.length === 0 ? `<p class="ops-none">None flagged.</p>` : h.sections.acuteConcerns.map(a => `
                      <div class="ops-h12-item text-crit"><strong>[${esc(a.code)}]</strong> ${esc(a.residentName)}: ${esc(a.message)}</div>
                    `).join('')}
                  </div>
                </div>

                <!-- 3. Residents Requiring Monitoring -->
                <div class="ops-h12-card">
                  <h3 class="ops-h12-title">3. Residents Requiring Monitoring (${h.sections.residentsRequiringMonitoring.length})</h3>
                  <div class="ops-h12-body">
                    ${h.sections.residentsRequiringMonitoring.map(r => `
                      <div class="ops-h12-item"><strong>${esc(r.residentName)}</strong> (${esc(r.room)}): ${esc(r.focus)}</div>
                    `).join('')}
                  </div>
                </div>

                <!-- 4. New Orders -->
                <div class="ops-h12-card">
                  <h3 class="ops-h12-title">4. New Orders (${h.sections.newOrders.length})</h3>
                  <div class="ops-h12-body">
                    ${h.sections.newOrders.length === 0 ? `<p class="ops-none">No new medication orders received on prior shift.</p>` : h.sections.newOrders.map(o => `
                      <div class="ops-h12-item"><strong>${esc(o.name || o.medicationName)}</strong>: ${esc(o.directions || 'As ordered')}</div>
                    `).join('')}
                  </div>
                </div>

                <!-- 5. Pending Labs/Tests -->
                <div class="ops-h12-card">
                  <h3 class="ops-h12-title">5. Pending Labs / Diagnostics (${h.sections.pendingLabsTests.length})</h3>
                  <div class="ops-h12-body">
                    ${h.sections.pendingLabsTests.length === 0 ? `<p class="ops-none">No pending stat labs awaiting callback.</p>` : h.sections.pendingLabsTests.map(l => `
                      <div class="ops-h12-item">${esc(l.residentName)}: ${esc(l.message)}</div>
                    `).join('')}
                  </div>
                </div>

                <!-- 6. Falls / Incidents -->
                <div class="ops-h12-card">
                  <h3 class="ops-h12-title">6. Falls &amp; Incidents (24h) (${h.sections.fallsIncidents.length})</h3>
                  <div class="ops-h12-body">
                    ${h.sections.fallsIncidents.length === 0 ? `<p class="ops-none">Zero falls reported in past 24 hours.</p>` : h.sections.fallsIncidents.map(f => `
                      <div class="ops-h12-item text-warn"><strong>${esc(f.residentName)}</strong>: ${esc(f.message)}</div>
                    `).join('')}
                  </div>
                </div>

                <!-- 7. Hospital Transfers / Returns -->
                <div class="ops-h12-card">
                  <h3 class="ops-h12-title">7. Hospital Transfers &amp; Returns (${h.sections.hospitalTransfersReturns.length})</h3>
                  <div class="ops-h12-body">
                    ${h.sections.hospitalTransfersReturns.length === 0 ? `<p class="ops-none">No ER runs or transfers on prior shift.</p>` : h.sections.hospitalTransfersReturns.map(t => `
                      <div class="ops-h12-item">${esc(t.residentName)}: ${esc(t.message)}</div>
                    `).join('')}
                  </div>
                </div>

                <!-- 8. Behavioral / Psychotropic Concerns -->
                <div class="ops-h12-card">
                  <h3 class="ops-h12-title">8. Behaviors &amp; Psychotropics (${h.sections.behavioralPsychotropicConcerns.length})</h3>
                  <div class="ops-h12-body">
                    ${h.sections.behavioralPsychotropicConcerns.length === 0 ? `<p class="ops-none">No PRN psychotropic triggers.</p>` : h.sections.behavioralPsychotropicConcerns.map(b => `
                      <div class="ops-h12-item">${esc(b.residentName)}: ${esc(b.message)}</div>
                    `).join('')}
                  </div>
                </div>

                <!-- 9. Wounds / Skin -->
                <div class="ops-h12-card">
                  <h3 class="ops-h12-title">9. Wounds &amp; Complex Skin Care (${h.sections.woundsSkin.length})</h3>
                  <div class="ops-h12-body">
                    ${h.sections.woundsSkin.length === 0 ? `<p class="ops-none">No new stageable wounds.</p>` : h.sections.woundsSkin.map(w => `
                      <div class="ops-h12-item">${esc(w.residentName)}: ${esc(w.message)}</div>
                    `).join('')}
                  </div>
                </div>

                <!-- 10. Follow-Ups Pending -->
                <div class="ops-h12-card">
                  <h3 class="ops-h12-title">10. Follow-Ups Pending (${h.sections.followUpsPending.length})</h3>
                  <div class="ops-h12-body">
                    ${h.sections.followUpsPending.map(fu => `
                      <div class="ops-h12-item"><strong>[${esc(fu.priority.toUpperCase())}]</strong> ${esc(fu.task)}</div>
                    `).join('')}
                  </div>
                </div>

                <!-- 11. Items Requiring Provider Contact -->
                <div class="ops-h12-card">
                  <h3 class="ops-h12-title">11. Provider Contact Needed (${h.sections.itemsRequiringProviderContact.length})</h3>
                  <div class="ops-h12-body">
                    ${h.sections.itemsRequiringProviderContact.length === 0 ? `<p class="ops-none">No pending physician callbacks.</p>` : h.sections.itemsRequiringProviderContact.map(p => `
                      <div class="ops-h12-item text-warn"><strong>${esc(p.residentName)}</strong>: ${esc(p.concern)} (Stage: ${esc(p.stage)})</div>
                    `).join('')}
                  </div>
                </div>

                <!-- 12. Items Requiring Family Notification -->
                <div class="ops-h12-card">
                  <h3 class="ops-h12-title">12. Family Notification Needed (${h.sections.itemsRequiringFamilyNotification.length})</h3>
                  <div class="ops-h12-body">
                    ${h.sections.itemsRequiringFamilyNotification.length === 0 ? `<p class="ops-none">No family-notification items identified in available records. Verify completeness.</p>` : h.sections.itemsRequiringFamilyNotification.map(fam => `
                      <div class="ops-h12-item">${esc(fam.residentName)}: ${esc(fam.event)}</div>
                    `).join('')}
                  </div>
                </div>
              </div>
            `}
          </div>
        </div>
      `;
    },

    // -------------------------------------------------------------
    // Tab 6: Protocols Library & Persistent Voice Profiles
    // -------------------------------------------------------------
    renderProtocolsAndProfilesView() {
      return `
        <div class="ops-protocols-container">
          <!-- Split: Protocol Library & Persistent Voice Profiles -->
          <div class="ops-split-grid">
            <!-- Left: Approved Facility Protocols Library -->
            <section class="ops-card" ${activeTab !== 'protocols' ? 'hidden' : ''}>
              <div class="ops-card-header">
                <div>
                  <h2 class="ops-card-title">Approved Facility Protocols Library</h2>
                  <p class="ops-card-subtitle">Approved standing clinical policies authorizing specific standard interventions in SBAR recommendations.</p>
                </div>
                <div class="ops-card-actions">
                  <button type="button" class="ops-btn ops-btn-primary ops-btn-sm" id="ops-add-protocol-btn">＋ New Protocol</button>
                </div>
              </div>

              <div class="ops-protocols-list">
                ${facilityProtocols.map(prot => `
                  <div class="ops-protocol-card">
                    <div class="ops-prot-top">
                      <div>
                        <strong class="ops-prot-name">${esc(prot.name)}</strong>
                        <div class="ops-prot-meta">v${esc(prot.version)} · Effective: ${esc(prot.effectiveDate)}</div>
                      </div>
                      <span class="ops-prot-status-badge ${prot.isCurrent ? 'badge-curr' : 'badge-rev'}">
                        ${esc(prot.statusLabel || 'Protocol Current')}
                      </span>
                    </div>

                    <div class="ops-prot-source">Source Document: ${esc(prot.sourceDocument)}</div>

                    <div class="ops-prot-interventions">
                      <strong>Approved Interventions:</strong>
                      <ul>
                        ${(prot.interventions || []).map(intv => `
                          <li>${esc(intv.text)}</li>
                        `).join('')}
                      </ul>
                    </div>
                  </div>
                `).join('')}
              </div>
            </section>

            <!-- Right: Persistent Voice Profiles & Recognition Engine -->
            <section class="ops-card" ${activeTab !== 'voice_profiles' ? 'hidden' : ''}>
              <div class="ops-card-header">
                <div>
                  <h2 class="ops-card-title">Persistent Voice Profiles</h2>
                  <p class="ops-card-subtitle">Record at least three different passages per person. Local acoustic similarity can suggest names; it is not a measured accuracy percentage or validated biometric identification.</p>
                </div>
                <div class="ops-card-actions">
                  <button type="button" class="ops-btn ops-btn-primary ops-btn-sm" id="ops-add-voice-profile-btn">＋ Add Staff Member</button>
                </div>
              </div>

              <div class="ops-profiles-list">
                ${speakerProfiles.map(prof => `
                  <div class="ops-profile-card">
                    <div class="ops-prof-top">
                      <div>
                        <strong class="ops-prof-name">${esc(prof.name)}</strong>
                        <div class="ops-prof-dept">${esc(prof.role)} · ${esc(prof.department)}</div>
                      </div>
                      <span class="ops-prof-quality-pill quality-${prof.quality.toLowerCase().replaceAll(' ', '-')}">
                        ${esc(prof.quality)} (${(prof.samples || []).length} Samples)
                      </span>
                    </div>

                    <div class="ops-prof-sub">
                      <span>Expected: <strong>${esc(prof.expectedMeeting || 'All Meetings')}</strong></span>
                      <span class="ops-sep">·</span>
                      <span>Verified: ${formatDate(prof.lastVerifiedAt)}</span>
                    </div>

                    <div class="ops-prof-actions">
                      <button type="button" class="ops-btn ops-btn-xs ops-btn-secondary ops-add-sample-btn" data-profile-id="${esc(prof.id)}">＋ Add Verified Sample</button>
                      <button type="button" class="ops-btn ops-btn-xs ops-delete-profile-btn" data-profile-id="${esc(prof.id)}">Delete profile</button><button type="button" class="ops-btn ops-btn-xs ops-btn-secondary ops-view-samples-btn" data-profile-id="${esc(prof.id)}">Review Samples (${(prof.samples || []).length})</button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </section>
          </div>
        </div>
      `;
    },

    // -------------------------------------------------------------
    // Tab 7: Meeting History & Past Sessions
    // -------------------------------------------------------------
    renderHistoryView() {
      const q = historySearch.toLowerCase();
      const filtered = meetingHistory.filter(m => {
        if (!q) return true;
        return m.title.toLowerCase().includes(q) ||
               (m.type || '').toLowerCase().includes(q) ||
               (m.summary || '').toLowerCase().includes(q);
      });

      return `
        <div class="ops-history-container">
          <div class="ops-card">
            <div class="ops-card-header">
              <div>
                <h2 class="ops-card-title">Meeting Archives &amp; Executive Minutes</h2>
                <p class="ops-card-subtitle">Permanent, encrypted records of all interdisciplinary standups, clinical IDT reviews, and shift handoffs.</p>
              </div>
              <div class="ops-card-actions">
                <input type="search" id="ops-history-search" class="ops-input-sm" placeholder="Search meeting records…" value="${esc(historySearch)}">
                <button type="button" class="ops-btn ops-btn-primary ops-btn-sm" id="ops-new-meeting-btn">＋ New Meeting</button>
              </div>
            </div>

            <div class="ops-history-table-wrap">
              <table class="ops-table">
                <thead>
                  <tr>
                    <th>Date &amp; Shift</th>
                    <th>Meeting Title</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Agenda Progress</th>
                    <th>Clinical Sentinel</th>
                    <th>Action Items</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  ${filtered.length === 0 ? `
                    <tr>
                      <td colspan="8" class="ops-empty-cell">No meeting sessions recorded matching search.</td>
                    </tr>
                  ` : filtered.map(m => {
                    const doneAgenda = (m.agenda || []).filter(a => a.completed).length;
                    const totalAgenda = (m.agenda || []).length;
                    const flags = (m.clinicalRadar || []).length;
                    const actions = (m.actionItems || []).length;
                    return `
                      <tr>
                        <td>
                          <strong>${formatDate(m.date)}</strong>
                          <div style="font-size:11px;color:#64748b;">${formatTime(m.date)} · ${esc((m.shift || 'Day').toUpperCase())}</div>
                        </td>
                        <td>
                          <strong>${esc(m.title)}</strong>
                        </td>
                        <td>
                          <span class="ops-category-label">${esc((m.type || 'General').replaceAll('_', ' '))}</span>
                        </td>
                        <td>
                          <span class="ops-status-badge status-${esc(m.status)}">${esc(m.status.toUpperCase())}</span>
                        </td>
                        <td>
                          <div class="ops-prog-cell">
                            <span>${doneAgenda}/${totalAgenda}</span>
                            <div class="ops-mini-bar"><div class="ops-mini-fill" style="width:${totalAgenda ? Math.round((doneAgenda/totalAgenda)*100) : 0}%;"></div></div>
                          </div>
                        </td>
                        <td>
                          <span class="${flags > 0 ? 'text-crit' : 'text-slate'}">${flags} Flags</span>
                        </td>
                        <td>
                          <span>${actions} Items</span>
                        </td>
                        <td>
                          <button type="button" class="ops-btn ops-btn-xs ops-btn-secondary" data-open-meeting="${esc(m.id)}">Open Session</button>
                          <button type="button" class="ops-btn ops-btn-xs ops-btn-danger" data-delete-meeting="${esc(m.id)}" title="Delete meeting record">✕</button>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    },

    // -------------------------------------------------------------
    // Event Wiring & Interactive Operations Handlers
    // -------------------------------------------------------------
    attachEvents(container) {
      // Tab Switching
      container.querySelectorAll('[data-ops-tab]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          this.stopListening();
          activeTab = e.currentTarget.getAttribute('data-ops-tab');
          this.renderFullView(container);
        });
      });

      // Launch Copilot from Operations buttons
      container.querySelector('#ops-start-copilot-btn')?.addEventListener('click', () => {
        activeTab = 'copilot';
        this.renderFullView(container);
      });

      container.querySelector('#ops-quick-sbar-btn')?.addEventListener('click', () => {
        activeTab = 'sbar';
        this.renderFullView(container);
      });

      // Quick-open SBAR from Command Center
      container.querySelectorAll('.ops-open-sbar-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const sbarId = e.currentTarget.getAttribute('data-sbar-id');
          activeSbar = sbarList.find(s => s.id === sbarId) || activeSbar;
          activeTab = 'sbar';
          this.renderFullView(container);
        });
      });

      // Generate Morning Huddle Brief
      container.querySelector('#ops-gen-huddle-btn')?.addEventListener('click', () => this.generateHuddleBrief(container));
      container.querySelector('#ops-refresh-brief-btn')?.addEventListener('click', () => this.generateHuddleBrief(container));

      // Copy Morning Brief
      container.querySelector('#ops-copy-brief-btn')?.addEventListener('click', () => {
        const textToCopy = container.querySelector('#ops-huddle-content')?.innerText || '';
        if (textToCopy) {
          navigator.clipboard?.writeText(textToCopy);
          toast('Morning Huddle Brief copied to clipboard.');
        }
      });

      // Preflight Microphone Check Modal
      container.querySelectorAll('#ops-preflight-mic-btn').forEach(btn => {
        btn.addEventListener('click', () => this.showMicCheckModal());
      });

      // Start Meeting from Templates
      container.querySelectorAll('[data-create-type]').forEach(card => {
        card.addEventListener('click', async (e) => {
          const type = e.currentTarget.getAttribute('data-create-type');
          try {
            const meeting = await api('meetingSave', { type });
            activeMeeting = meeting;
            meetingHistory = await api('meetingList');
            toast(`Created new session: ${meeting.title}`);
            activeTab = 'copilot';
            this.renderFullView(container);
          } catch (err) {
            toast(`Failed to start meeting: ${err.message}`);
          }
        });
      });

      // Close Session
      container.querySelector('#ops-close-session-btn')?.addEventListener('click', () => {
        activeMeeting = null;
        this.renderFullView(container);
      });

      // Microphone Toggle
      container.querySelector('#ops-toggle-mic-btn')?.addEventListener('click', () => {
        this.toggleSpeechRecognition(container);
      });

      // Active Speaker Selection Chips
      container.querySelectorAll('[data-set-speaker]').forEach(chip => {
        chip.addEventListener('click', (e) => {
          pendingAcoustic = null;
          activeSpeaker = e.currentTarget.getAttribute('data-set-speaker');
          activeRole = e.currentTarget.getAttribute('data-set-role');
          const input = container.querySelector('#ops-statement-input');
          if (input) input.placeholder = `Type or dictate statement for ${activeSpeaker}…`;
          this.renderFullView(container);
        });
      });

      // Submit Statement Input
      const submitStatement = async () => {
        const input = container.querySelector('#ops-statement-input');
        if (!input || !input.value.trim() || !activeMeeting) return;
        const textVal = input.value.trim();
        const measured = pendingAcoustic;
        try {
          const updated = await api('meetingAddTranscript', {
            meetingId: activeMeeting.id,
            speaker: activeSpeaker,
            role: activeRole,
            text: textVal,
            ...(measured ? {acousticFeatures:measured} : {speakerConfirmed:activeSpeaker !== 'Unknown Speaker'})
          });
          activeMeeting = updated;
          pendingAcoustic = null;
          this.renderFullView(container);
          const feed = container.querySelector('#ops-transcript-feed');
          if (feed) feed.scrollTop = feed.scrollHeight;
        } catch (err) {
          toast(`Error recording statement: ${err.message}`);
        }
      };

      container.querySelector('#ops-submit-statement-btn')?.addEventListener('click', submitStatement);
      container.querySelector('#ops-statement-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          submitStatement();
        }
      });

      // Synthetic entries are available only in the isolated demo workspace.
      container.querySelectorAll('[id^="ops-sim-"]').forEach(button => { button.disabled = !opsData?.demo; });
      // Acoustic Event Simulations
      container.querySelector('#ops-sim-page-btn')?.addEventListener('click', async () => {
        if (!activeMeeting || !opsData?.demo) return;
        try {
          const updated = await api('meetingAddTranscript', {
            meetingId: activeMeeting.id,
            speaker: '[Facility Page]',
            role: 'Overhead System',
            text: 'Attention all staff: Dr. Strong to West Wing Room 104 immediately.',
            isOverheadPage: true
          });
          activeMeeting = updated;
          toast('Simulated overhead page: Excluded from meeting action commitments.');
          this.renderFullView(container);
        } catch (e) {
          toast(e.message);
        }
      });

      container.querySelector('#ops-sim-crosstalk-btn')?.addEventListener('click', async () => {
        if (!activeMeeting || !opsData?.demo) return;
        try {
          const updated = await api('meetingAddTranscript', {
            meetingId: activeMeeting.id,
            speaker: '[Multiple speakers]',
            role: 'Cross-talk',
            text: '[Simultaneous overlapping conversation between nursing and therapy - ambiguous attribution]',
            isCrossTalk: true
          });
          activeMeeting = updated;
          toast('Simulated cross-talk: Flagged for review without false single-speaker attribution.');
          this.renderFullView(container);
        } catch (e) {
          toast(e.message);
        }
      });

      container.querySelector('#ops-sim-unknown-btn')?.addEventListener('click', async () => {
        if (!activeMeeting || !opsData?.demo) return;
        try {
          const updated = await api('meetingAddTranscript', {
            meetingId: activeMeeting.id,
            speaker: 'Unknown Speaker',
            role: 'Guest / Visitor',
            text: 'I am visiting from the state ombudsman office to observe today’s care conferences.',
            confidenceLevel: 'weak'
          });
          activeMeeting = updated;
          toast('Ingested unverified guest speaker statement.');
          this.renderFullView(container);
        } catch (e) {
          toast(e.message);
        }
      });

      // Agenda Checkbox Toggle
      container.querySelectorAll('[data-agenda-check]').forEach(check => {
        check.addEventListener('change', async (e) => {
          const id = e.currentTarget.getAttribute('data-agenda-check');
          if (!activeMeeting) return;
          const item = (activeMeeting.agenda || []).find(a => a.id === id);
          if (item) {
            item.completed = e.currentTarget.checked;
            try {
              await api('meetingSave', activeMeeting);
            } catch (err) {
              console.error('Failed to save agenda state:', err);
            }
          }
        });
      });

      // Add Custom Agenda Item
      container.querySelector('#ops-add-agenda-btn')?.addEventListener('click', async () => {
        const input = container.querySelector('#ops-new-agenda-input');
        if (!input || !input.value.trim() || !activeMeeting) return;
        const newTitle = input.value.trim();
        input.value = '';

        activeMeeting.agenda = activeMeeting.agenda || [];
        activeMeeting.agenda.push({
          id: `ag_custom_${Date.now()}`,
          title: newTitle,
          completed: false,
          notes: ''
        });

        try {
          await api('meetingSave', activeMeeting);
          this.renderFullView(container);
          toast(`Added agenda item: "${newTitle}"`);
        } catch (err) {
          toast(err.message);
        }
      });

      // Convert Meeting Action Item to Universal Action Inbox To-Do
      container.querySelectorAll('[data-convert-todo]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const actionItemId = e.currentTarget.getAttribute('data-convert-todo');
          if (!activeMeeting) return;
          try {
            const res = await api('meetingConvertActionItem', {
              meetingId: activeMeeting.id,
              actionItemId
            });
            if (res.success) {
              toast(`Saved as Official To-Do in Action Inbox: "${res.todo.title}"`);
              this.stopListening();
            activeMeeting = await api('meetingGet', { id: activeMeeting.id });
              this.renderFullView(container);
            }
          } catch (err) {
            toast(`Failed to save To-Do: ${err.message}`);
          }
        });
      });

      // Launch SBAR from Sentinel Radar
      container.querySelectorAll('.ops-launch-sbar-from-radar').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const concern = e.currentTarget.getAttribute('data-concern');
          try {
            activeSbar = await api('sbarGenerate', {
              residentName: 'Resident in Surveillance',
              situation: concern,
              templateKey: 'general_provider'
            });
            sbarList = await api('sbarList');
            toast('Draft SBAR initialized from meeting finding.');
            activeTab = 'sbar';
            this.renderFullView(container);
          } catch (err) {
            toast(err.message);
          }
        });
      });

      // Finalize Meeting & Route to Speaker Review
      container.querySelector('#ops-finalize-meeting-btn')?.addEventListener('click', async () => {
        if (!activeMeeting) return;
        const confirm = window.confirm(`Conclude "${activeMeeting.title}" and generate minutes with speaker review?`);
        if (!confirm) return;

        try {
          this.stopListening();
          const finalized = await api('meetingFinalize', { meetingId: activeMeeting.id });
          activeMeeting = finalized;
          meetingHistory = await api('meetingList');
          speakerReviewData = await api('speakerReviewGet', { meetingId: activeMeeting.id });
          toast('Meeting finalized. Generated executive minutes and opened Speaker Review.');
          activeTab = 'speaker_review';
          this.renderFullView(container);
        } catch (err) {
          toast(`Failed to finalize meeting: ${err.message}`);
        }
      });

      // View Minutes Modal
      container.querySelector('#ops-export-minutes-btn')?.addEventListener('click', () => {
        if (activeMeeting) this.showMinutesModal(activeMeeting);
      });

      // Speaker Review: Confirm All High Confidence
      container.querySelector('#ops-confirm-all-high-btn')?.addEventListener('click', async () => {
        if (!activeMeeting) return;
        try {
          await api('speakerReviewConfirmAll', { meetingId: activeMeeting.id });
          this.stopListening();
            activeMeeting = await api('meetingGet', { id: activeMeeting.id });
          speakerReviewData = await api('speakerReviewGet', { meetingId: activeMeeting.id });
          toast('Confirmed all high-confidence speaker attributions.');
          this.renderFullView(container);
        } catch (e) {
          toast(e.message);
        }
      });

      // Quick Confirm / Change Speaker in Transcript
      container.querySelectorAll('.ops-confirm-speaker-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const entryId = e.currentTarget.getAttribute('data-entry-id');
          const spkName = e.currentTarget.getAttribute('data-speaker-name');
          if (!activeMeeting) return;
          try {
            await api('speakerCorrectionLearn', {
              meetingId: activeMeeting.id,
              transcriptEntryId: entryId,
              correctedSpeaker: spkName,
              learnForFuture: false
            });
            this.stopListening();
            activeMeeting = await api('meetingGet', { id: activeMeeting.id });
            toast(`Confirmed speaker: ${spkName}`);
            this.renderFullView(container);
          } catch (err) {
            toast(err.message);
          }
        });
      });

      // Batch Change Speaker from Speaker Review Card
      container.querySelectorAll('.ops-change-speaker-batch-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const oldSpeaker = e.currentTarget.getAttribute('data-current-speaker');
          const newName = window.prompt(`Re-assign all segments attributed to "${oldSpeaker}" to which speaker name?`, '');
          if (newName && newName.trim() && newName !== oldSpeaker) {
            pendingCorrection = {
              oldSpeaker,
              newSpeaker: newName.trim()
            };
            this.renderFullView(container);
          }
        });
      });

      // Accept / Dismiss Learning Callout
      container.querySelector('#ops-accept-learning-btn')?.addEventListener('click', async () => {
        if (!pendingCorrection || !activeMeeting) return;
        try {
          // Re-attribute matching entries in meeting
          const targets = (activeMeeting.transcript || []).filter(t => t.speaker === pendingCorrection.oldSpeaker);
          for (const target of targets) {
            await api('speakerCorrectionLearn', {
              meetingId: activeMeeting.id,
              transcriptEntryId: target.id,
              correctedSpeaker: pendingCorrection.newSpeaker,
              learnForFuture: false
            });
          }
          toast(`Saved speaker correction for ${pendingCorrection.newSpeaker}. No audio profile training was performed.`);
          pendingCorrection = null;
          activeMeeting=await api('meetingGet',{id:activeMeeting.id});
          speakerProfiles = await api('speakerProfilesList');
          speakerReviewData = await api('speakerReviewGet', { meetingId: activeMeeting.id });
          this.renderFullView(container);
        } catch (err) {
          toast(err.message);
        }
      });

      container.querySelector('#ops-dismiss-learning-btn')?.addEventListener('click', () => {
        pendingCorrection = null;
        this.renderFullView(container);
      });

      // -----------------------------------------------------------
      // SBAR Interactive Editor Event Wiring
      // -----------------------------------------------------------
      if (activeSbar && activeSbar.evidenceVersion !== 2) {
        container.querySelector('.ops-sbar-headline')?.insertAdjacentHTML('afterend', '<p role="alert">Legacy SBAR may contain sample clinical facts. Preserve for review and create a new draft from verified sources. Copying and sign-off are blocked.</p>');
        for (const id of ['ops-save-sbar-btn','ops-review-sbar-btn','ops-finalize-sbar-btn','ops-copy-sbar-btn']) { const b=container.querySelector('#'+id); if(b)b.disabled=true; }
      }
      container.querySelector('#ops-toggle-sources-btn')?.addEventListener('click', () => {
        showSources = !showSources;
        this.renderFullView(container);
      });

      container.querySelector('#ops-sbar-target-sel')?.addEventListener('change', async (e) => {
        const newTarget = e.currentTarget.value;
        if (!activeSbar) return;
        try {
          activeSbar = await api('sbarSave', {id: activeSbar.id, targetKey: newTarget});
          this.renderFullView(container);
          toast(`Communication adapted for ${activeSbar.targetRole}.`);
        } catch (err) {
          toast(err.message);
        }
      });

      container.querySelector('#ops-sbar-template-sel')?.addEventListener('change', async (e) => {
        const tplKey = e.currentTarget.value;
        try {
          activeSbar = await api('sbarGenerate', {
            templateKey: tplKey,
            residentName: activeSbar?.residentName || '',
            residentRoom: activeSbar?.residentRoom || '',
            target: activeSbar?.targetKey || 'attending_physician'
          });
          sbarList = await api('sbarList');
          toast(`Switched to template: ${activeSbar.templateName}`);
          this.renderFullView(container);
        } catch (err) {
          toast(err.message);
        }
      });

      container.querySelector('#ops-snapshot-hours')?.addEventListener('change', async (e) => {
        sbarSnapshotHours = Number(e.currentTarget.value);
        if (activeSbar) {
          try {
            const snap = await api('sbarSnapshot48h', {
              residentId: activeSbar.residentId,
              windowHours: sbarSnapshotHours
            });
            activeSbar.snapshot48h = snap;
            toast(`Updated clinical snapshot window to ${sbarSnapshotHours} hours.`);
            this.renderFullView(container);
          } catch (err) {
            toast(err.message);
          }
        }
      });

      container.querySelector('#ops-new-sbar-btn')?.addEventListener('click', async () => {
        const resName = window.prompt('Enter Resident Name:', '')?.trim();
        if (!resName) return;
        const resRoom = window.prompt('Enter Room / Bed:', '')?.trim() || '';
        try {
          activeSbar = await api('sbarGenerate', {
            residentName: resName,
            residentRoom: resRoom,
            templateKey: 'general_provider',
            target: 'attending_physician'
          });
          sbarList = await api('sbarList');
          toast(`Draft SBAR created for ${resName}.`);
          this.renderFullView(container);
        } catch (err) {
          toast(err.message);
        }
      });

      const editFields = ['#sbar-edit-situation-concern', '#sbar-edit-clinician-notes'];
      editFields.forEach(selector => container.querySelector(selector)?.addEventListener('input', () => {
        for (const id of ['ops-review-sbar-btn','ops-finalize-sbar-btn','ops-copy-sbar-btn']) {
          const button = container.querySelector('#' + id); if (button) button.disabled = true;
        }
        const save = container.querySelector('#ops-save-sbar-btn'); if (save) save.textContent = 'Save Changes (review required)';
      }));
      container.querySelector('#ops-save-sbar-btn')?.addEventListener('click', async () => {
        if (!activeSbar) return;
        try {
          activeSbar = await api('sbarSave', {
            id: activeSbar.id,
            situation: {concern: container.querySelector('#sbar-edit-situation-concern')?.value || ''},
            assessment: {clinicianNotes: container.querySelector('#sbar-edit-clinician-notes')?.value || ''}
          });
          sbarList = await api('sbarList');
          this.renderFullView(container);
          toast('Draft saved. Review the updated content before finalizing.');
        } catch (err) { toast(err.message); }
      });

      container.querySelector('#ops-review-sbar-btn')?.addEventListener('click', async () => {
        if (!activeSbar) return;
        const reviewer = window.prompt('Clinician Reviewer Name / Title:', '')?.trim();
        if (!reviewer) return;
        try {
          activeSbar = await api('sbarReview', { id: activeSbar.id, reviewer });
          sbarList = await api('sbarList');
          toast('SBAR verified and marked Clinician Reviewed.');
          this.renderFullView(container);
        } catch (err) {
          toast(err.message);
        }
      });

      container.querySelector('#ops-finalize-sbar-btn')?.addEventListener('click', async () => {
        if (!activeSbar) return;
        const finalizer = window.prompt('Finalizing Nurse Supervisor Name / Title:', '')?.trim();
        if (!finalizer) return;
        try {
          activeSbar = await api('sbarFinalize', { id: activeSbar.id, finalizer });
          sbarList = await api('sbarList');
          toast('SBAR finalized and locked.');
          this.renderFullView(container);
        } catch (err) {
          toast(err.message);
        }
      });

      container.querySelector('#ops-copy-sbar-btn')?.addEventListener('click', () => {
        if (activeSbar) {
          navigator.clipboard?.writeText(activeSbar.adaptedCommunicationText || '');
          toast('SBAR text copied to clipboard.');
        }
      });

      container.querySelector('#ops-copy-adapted-btn')?.addEventListener('click', () => {
        const txt = container.querySelector('#ops-adapted-text')?.value || '';
        if (txt) {
          navigator.clipboard?.writeText(txt);
          toast('Communication text copied to clipboard.');
        }
      });

      // Add Protocol Recommendation Button
      container.querySelector('#ops-add-protocol-rec-btn')?.addEventListener('click', () => {
        if (!activeSbar || facilityProtocols.length === 0) return;
        const prot = facilityProtocols[0];
        const intv = prot.interventions?.[0]?.text || 'Initiate vital signs re-check protocol.';
        activeSbar.recommendations = activeSbar.recommendations || [];
        activeSbar.recommendations.push({
          id: `rec_${Date.now()}`,
          text: intv,
          safetyType: 'facility_protocol',
          sourceLabel: `Approved Facility Protocol: ${prot.name} (v${prot.version})`,
          protocolRef: { name: prot.name, version: prot.version },
          verified: true
        });
        toast(`Added intervention from protocol: ${prot.name}`);
        this.renderFullView(container);
      });

      // Add Clinician Manual Request
      container.querySelector('#ops-add-manual-rec-btn')?.addEventListener('click', () => {
        if (!activeSbar) return;
        const customReq = window.prompt('Enter clinician manual request (e.g. "Request review of morning creatinine lab"):');
        if (customReq && customReq.trim()) {
          activeSbar.recommendations = activeSbar.recommendations || [];
          activeSbar.recommendations.push({
            id: `rec_manual_${Date.now()}`,
            text: customReq.trim(),
            safetyType: 'user_selected',
            sourceLabel: 'Clinician Manual Selection (User Selected)',
            verified: true
          });
          this.renderFullView(container);
        }
      });

      // Log Notification Event
      container.querySelector('#ops-log-notification-btn')?.addEventListener('click', async () => {
        if (!activeSbar) return;
        const recipientName = container.querySelector('#ops-notify-recipient')?.value || 'Attending Physician';
        const method = container.querySelector('#ops-notify-method')?.value || 'phone';
        const outcome = container.querySelector('#ops-notify-outcome')?.value || 'provider_contacted';
        const readback = container.querySelector('#ops-notify-readback')?.value || 'not_applicable';

        try {
          const res = await api('sbarLogNotification', {
            sbarId: activeSbar.id,
            recipientName,
            method,
            outcome,
            readback,
            user: activeSpeaker || 'Charge Nurse',
            callbackIntervalMinutes: 45
          });

          activeSbar = await api('sbarGet', { id: activeSbar.id });
          sbarList = await api('sbarList');
          toast(outcome === 'awaiting_callback'
            ? 'Logged notification! Automatic 45-min callback follow-up scheduled in Universal Action Inbox.'
            : `Logged communication event with ${recipientName}.`);
          this.renderFullView(container);
        } catch (err) {
          toast(`Failed to log notification: ${err.message}`);
        }
      });

      // -----------------------------------------------------------
      // Shift Handoff Generator Event Wiring
      // -----------------------------------------------------------
      container.querySelector('#ops-gen-shift-handoff-btn')?.addEventListener('click', async () => {
        const shift = container.querySelector('#ops-handoff-shift-sel')?.value || 'day';
        try {
          shiftHandoffData = await api('sbarShiftHandoff', { shift });
          toast(`Generated 12-section shift handoff report for ${shift.toUpperCase()} shift.`);
          this.renderFullView(container);
        } catch (err) {
          toast(err.message);
        }
      });

      container.querySelector('#ops-print-handoff-btn')?.addEventListener('click', () => {
        window.print();
      });

      // -----------------------------------------------------------
      // Protocols & Voice Profiles Wiring
      // -----------------------------------------------------------
      container.querySelector('#ops-add-protocol-btn')?.addEventListener('click', async () => {
        const name = window.prompt('Enter Protocol Name:');
        if (!name) return;
        try {
          await api('sbarProtocolSave', {
            name,
            version: '1.0',
            interventions: [{ text: 'Standard observation and provider notification.' }]
          });
          facilityProtocols = await api('sbarProtocols');
          toast('Added new facility protocol.');
          this.renderFullView(container);
        } catch (e) {
          toast(e.message);
        }
      });

      container.querySelector('#ops-add-voice-profile-btn')?.addEventListener('click', async () => {
        const name = window.prompt('Staff Member Full Name:');
        if (!name) return;
        const role = window.prompt('Staff Role (e.g. Staff Nurse, PT, MDS):', 'Staff Nurse');
        try {
          await api('speakerProfileSave', { name, role });
          speakerProfiles = await api('speakerProfilesList');
          toast(`Added voice profile for ${name}.`);
          this.renderFullView(container);
        } catch (e) {
          toast(e.message);
        }
      });

      container.querySelectorAll('.ops-add-sample-btn').forEach(btn => btn.addEventListener('click', () => this.recordSpeaker(container, btn.dataset.profileId)));
      container.querySelector('#ops-record-speaker-btn')?.addEventListener('click', () => this.recordSpeaker(container));
      container.querySelectorAll('.ops-delete-profile-btn').forEach(btn=>btn.addEventListener('click',async()=>{
        if(!window.confirm('Delete this voice profile and its saved acoustic measurements? Existing meeting labels remain for review.'))return;
        try { await api('speakerProfileDelete',{id:btn.dataset.profileId});speakerProfiles=await api('speakerProfilesList');this.renderFullView(container); }catch(e){toast(e.message);}
      }));
      container.querySelectorAll('.ops-view-samples-btn').forEach(btn => btn.addEventListener('click', async () => {
        const profile=speakerProfiles.find(p=>p.id===btn.dataset.profileId);
        if(!profile)return;
        const list=(profile.samples||[]).map((sample,i)=>`${i+1}. ${formatDateTime(sample.timestamp)} — confirmed by ${sample.verifiedBy}`).join('\n');
        const choice=window.prompt((list||'No usable measured recordings.')+'\nEnter a sample number to delete, or Cancel to keep all:');
        if(choice===null||!/^\d+$/.test(choice.trim()))return;
        const sample=profile.samples[Number(choice)-1];if(!sample)return;
        try { await api('speakerSampleRemove',{profileId:profile.id,sampleId:sample.id});speakerProfiles=await api('speakerProfilesList');this.renderFullView(container); } catch(e){toast(e.message);}
      }));
      container.querySelector('#ops-review-help-btn')?.addEventListener('click',()=>{activeTab='copilot';this.renderFullView(container);});
      container.querySelectorAll('.ops-change-speaker-btn').forEach(btn => btn.addEventListener('click',async()=>{
        const name=window.prompt('Confirmed speaker name:');if(!name?.trim()||!activeMeeting)return;
        try { await api('speakerCorrectionLearn',{meetingId:activeMeeting.id,transcriptEntryId:btn.dataset.entryId,correctedSpeaker:name,learnForFuture:false});activeMeeting=await api('meetingGet',{id:activeMeeting.id});this.renderFullView(container); }catch(e){toast(e.message);}
      }));

      // Open Past Meeting from Archive
      container.querySelectorAll('[data-open-meeting]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.getAttribute('data-open-meeting');
          try {
            this.stopListening();
            activeMeeting = await api('meetingGet', { id });
            activeTab = 'copilot';
            this.renderFullView(container);
          } catch (err) {
            toast(`Failed to open meeting: ${err.message}`);
          }
        });
      });

      // Delete Past Meeting
      container.querySelectorAll('[data-delete-meeting]').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const id = e.currentTarget.getAttribute('data-delete-meeting');
          if (!window.confirm('Are you sure you want to permanently delete this meeting record?')) return;
          try {
            await api('meetingDelete', { id });
            if (activeMeeting?.id === id) activeMeeting = null;
            meetingHistory = await api('meetingList');
            toast('Meeting record deleted.');
            this.renderFullView(container);
          } catch (err) {
            toast(err.message);
          }
        });
      });
    },

    // -------------------------------------------------------------
    // Helper: Generate Morning Huddle Brief
    // -------------------------------------------------------------
    async generateHuddleBrief(container) {
      const box = container.querySelector('#ops-huddle-content');
      if (!box) return;

      box.innerHTML = `<div class="ops-loading">Synthesizing clinical alerts, census, and staffing roster into morning briefing...</div>`;
      try {
        const brief = await api('operationsHuddleBrief', {includeChecklist: container.querySelector('#ops-include-checklist')?.checked === true});
        box.innerHTML = `
          <div class="ops-brief-rendered">
            <pre class="ops-brief-pre">${esc(brief.text)}</pre>
          </div>
        `;
      } catch (err) {
        box.innerHTML = `<div class="ops-error-banner">Error: ${esc(err.message)}</div>`;
      }
    },

    // -------------------------------------------------------------
    // Helper: Live Speech Recognition Ingestion & Pipeline
    // -------------------------------------------------------------
    recordSpeaker(container, profileId = null) {
      if (!getState()?.settings) {toast('Unlock and load settings before recording.');return;}
      if (!profileId && activeMeeting?.status !== 'live') {toast('Open a live meeting first.');return;}
      this.stopListening();
      capturePolicy=JSON.stringify([getState().settings.hipaa,getState().settings.processingMode]);
      const meetingId=activeMeeting?.id;
      const profile=profileId?speakerProfiles.find(p=>p.id===profileId):null;
      if(profileId&&!profile)return;
      const dialog=document.createElement('dialog');captureDialog=dialog;
      dialog.innerHTML=`<form method="dialog" style="max-width:520px;padding:20px">
        <h2>${profile?'Enroll '+esc(profile.name):'Record this speaker'}</h2>
        <p>10 seconds: stay quiet for two seconds, then speak alone. Use a different passage for each enrollment. Local measurement only; no raw recording is retained.</p>
        <p>Experimental suggestions need three confirmed recordings, a strong match, and clear separation from other profiles. Similar voices or changing microphones may prevent a match. Overlap cannot be detected reliably.</p>
        <p>In Development / Demo Mode, use demonstration voices and nonclinical text only.</p>
        <p data-capture-status role="status">Ready. Recording starts only when you press Record.</p>
        <button type="button" data-record>Record</button>
        <label style="display:block"><input type="checkbox" data-single> I confirm only one person spoke during this recording.</label>
        ${profile?`<label style="display:block"><input type="checkbox" data-identity> I verified that the speaker is ${esc(profile.name)} and they agreed to save a local voice profile.</label><label>Confirmed by <input data-reviewer maxlength="100" required></label>`:''}
        <button type="button" data-use disabled>${profile?'Save confirmed sample':'Use for this statement'}</button>
        <button type="button" data-cancel>Cancel / stop recording</button>
      </form>`;
      document.body.appendChild(dialog);dialog.showModal();
      let features=null,disposed=false;
      const close=()=>{
        if(disposed)return;disposed=true;
        captureController?.abort();captureController=null;
        if(captureDialog===dialog)captureDialog=null;
        dialog.close();dialog.remove();features=null;
      };
      dialog.addEventListener('cancel',close);dialog.addEventListener('close',close);
      dialog.querySelector('[data-cancel]').onclick=close;
      const status=dialog.querySelector('[data-capture-status]'),use=dialog.querySelector('[data-use]'),record=dialog.querySelector('[data-record]');
      record.onclick=async()=>{
        record.disabled=true;use.disabled=true;features=null;
        dialog.querySelector('[data-single]').checked=false;
        if(profile)dialog.querySelector('[data-identity]').checked=false;
        captureController=new AbortController();
        try{
          features=await captureSpeakerSample({signal:captureController.signal,onProgress:message=>{status.textContent=message;}});
          if(disposed)return;
          status.textContent='Recording measured. Confirm the checkboxes before using it.';use.disabled=false;
        }catch(e){if(!disposed)status.textContent=e.message;}
        finally{record.disabled=false;}
      };
      use.onclick=async()=>{
        if(!features||!dialog.querySelector('[data-single]').checked){status.textContent='Confirm that only one person spoke.';return;}
        if(!getState()?.settings){close();return;}
        use.disabled=true;
        const measured={...features,singleSpeakerConfirmed:true};
        try{
          if(profile){
            const reviewer=dialog.querySelector('[data-reviewer]').value.trim();
            if(!reviewer||!dialog.querySelector('[data-identity]').checked)throw Error('Confirm identity and enter the reviewer name.');
            const result=await api('speakerSampleAdd',{...measured,profileId,verifiedBy:reviewer,identityConfirmed:true});
            if(!result.accepted)throw Error(result.reason);
            speakerProfiles=await api('speakerProfilesList');
            close();toast(`Saved confirmed recording (${result.totalSamples}/3 minimum).`);this.renderFullView(container);
          }else{
            if(activeMeeting?.id!==meetingId||activeMeeting?.status!=='live')throw Error('Meeting changed. Record again.');
            const match=await api('speakerIdentify',{features:measured});
            if(disposed)return;
            close();pendingAcoustic=measured;
            const output=container.querySelector('#ops-speaker-result');
            if(output)output.textContent=`${match.profileId?'Suggested: '+match.label:'Unknown Speaker'} — ${match.reason} Applies only to the next statement; expires after two minutes.`;
          }
        }catch(e){if(!disposed){status.textContent=e.message;use.disabled=false;}}
      };
    },

    enforcePolicy(settings) {
      const key=JSON.stringify([settings?.hipaa,settings?.processingMode]);
      if (!settings || ((captureController || pendingAcoustic) && capturePolicy !== key) ||
          (!browserSpeechAllowed(settings) && recognitionInstance)) this.stopListening();
    },

    stopListening() {
      captureController?.abort(); captureController=null;
      captureDialog?.close(); captureDialog?.remove(); captureDialog=null;
      pendingAcoustic=null; capturePolicy=null;
      const recognition = recognitionInstance;
      recognitionInstance = null;
      isListening = false;
      if (recognition) {
        recognition.onresult = recognition.onend = recognition.onerror = recognition.onstart = null;
        recognition.abort();
      }
    },

    toggleSpeechRecognition() {
      this.stopListening();toast('Use Meetings → Record meeting for offline recording and transcription.');
    },

    // -------------------------------------------------------------
    // Helper: Preflight Microphone Check Modal
    // -------------------------------------------------------------
    showMicCheckModal() {
      const dialog = document.getElementById('modal');
      const form = document.getElementById('modal-form');
      const title = document.getElementById('modal-title');
      const content = document.getElementById('modal-content');
      const cancelBtn = document.getElementById('modal-cancel');
      const submitBtn = document.getElementById('modal-submit');

      if (!dialog || !content) return;

      title.textContent = 'Conference Microphone Pre-Flight Diagnostic';
      submitBtn.textContent = 'Apply & Ready';
      cancelBtn.textContent = 'Close';

      content.innerHTML = `<p>Use Record speaker for a bounded local microphone measurement, or add confirmed samples under Voice Profiles. Keep quiet for the first two seconds, then speak alone. No raw audio is saved. Continuous speaker diarization and automatic cross-talk detection are not implemented.</p><p>Names are suggested only after strict similarity checks and three confirmed recordings; these thresholds are not an accuracy guarantee. Use manual text entry and verify speaker names. Browser speech recognition is blocked in HIPAA and Local Only modes.</p>`;

      const onSubmit = (e) => {
        e.preventDefault();
        dialog.close();
        toast('Audio capability information acknowledged.');
        form.removeEventListener('submit', onSubmit);
      };

      form.addEventListener('submit', onSubmit);
      cancelBtn.onclick = () => {
        dialog.close();
        form.removeEventListener('submit', onSubmit);
      };

      dialog.showModal();
    },

    // -------------------------------------------------------------
    // Helper: Minutes Modal / Inspection
    // -------------------------------------------------------------
    showMinutesModal(meeting) {
      const dialog = document.getElementById('modal');
      const form = document.getElementById('modal-form');
      const title = document.getElementById('modal-title');
      const content = document.getElementById('modal-content');
      const cancelBtn = document.getElementById('modal-cancel');
      const submitBtn = document.getElementById('modal-submit');

      if (!dialog || !content) return;

      title.textContent = `Meeting Minutes: ${meeting.title}`;
      submitBtn.textContent = 'Copy Minutes';
      cancelBtn.textContent = 'Close';

      content.innerHTML = `
        <div class="ops-modal-minutes">
          <div class="ops-minutes-toolbar">
            <span>Recorded: ${formatDateTime(meeting.date)}</span>
            <button type="button" class="ops-btn ops-btn-xs ops-btn-secondary" id="ops-print-minutes-btn">🖨 Print</button>
          </div>
          <pre class="ops-minutes-text">${esc(meeting.summary || 'Minutes not yet generated.')}</pre>
        </div>
      `;

      content.querySelector('#ops-print-minutes-btn')?.addEventListener('click', () => {
        window.print();
      });

      const onSubmit = (e) => {
        e.preventDefault();
        navigator.clipboard?.writeText(meeting.summary || '');
        toast('Minutes copied to clipboard.');
        dialog.close();
        form.removeEventListener('submit', onSubmit);
      };

      form.addEventListener('submit', onSubmit);
      cancelBtn.onclick = () => {
        dialog.close();
        form.removeEventListener('submit', onSubmit);
      };

      dialog.showModal();
    }
  };
}
