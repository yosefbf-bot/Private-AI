// Executive Desk UI Module
// Daily Executive Rhythm, Inbound Comms Triage, Department Head Accountability,
// Executive Rounds Punch List, Room Readiness, Attendance Points, HR Milestones,
// and Embedded AI Assistant Suite.

export function createExecutiveDeskUI({ api, esc, toast, refresh, renderPage, getState = () => null }) {
  let activeSubTab = 'daily_rhythm'; // 'daily_rhythm' | 'action_queue' | 'delegation' | 'rounds' | 'room_readiness' | 'hr_milestones' | 'ai_assistant'
  
  // Data State
  let rhythmData = null;
  let actionItems = [];
  let deptTasks = [];
  let departments = [];
  let standupSummary = null;
  let roundsIssues = [];
  let roomReadiness = [];
  let attendanceAlerts = [];
  let newHireMilestones = [];
  let coachingRecords = [];
  let eodAudit = null;

  // Modals & Drawers State
  let showCaptureModal = false;
  let showDeptTaskModal = false;
  let showRoundsModal = false;
  let showRoomModal = false;
  let showAttendanceModal = false;
  let showCoachingModal = false;
  let showEodModal = false;
  let showVoiceMemoModal = false;
  let showGhostwriteModal = false;
  let showDossierModal = false;
  let showCommuteModal = false;
  let showDifficultConvoModal = false;

  // Interactive Form States
  let voiceMemoTranscript = '';
  let parsedVoiceActions = null;
  let selectedDossierDept = 'maintenance';
  let activeDossier = null;
  let ghostwriteForm = { type: 'family_inquiry', familyName: '', residentName: '', topic: '', department: 'Nursing and Therapy' };
  let ghostwriteResult = null;
  let difficultConvoScenario = 'termination_attendance';
  let activeDifficultConvo = null;
  let commuteBriefingData = null;

  function formatDate(ts) {
    if (!ts) return '—';
    const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
    if (Number.isNaN(d.getTime())) return String(ts);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatTime(ts) {
    if (!ts) return '—';
    const d = new Date(typeof ts === 'number' ? ts : Date.parse(ts));
    if (Number.isNaN(d.getTime())) return String(ts);
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  async function loadAllData() {
    try {
      const [rhythm, actions, depts, dTasks, standup, rounds, rooms, attAlerts, newHires, coachings] = await Promise.all([
        api('execRhythmGet'),
        api('execActionList'),
        api('execDeptList'),
        api('execDeptTaskList'),
        api('execDeptStandupSummary'),
        api('execRoundsList'),
        api('execRoomReadinessList'),
        api('execAttendanceAlerts'),
        api('execNewHireList'),
        api('execCoachingList')
      ]);

      rhythmData = rhythm;
      actionItems = actions || [];
      departments = depts || [];
      deptTasks = dTasks || [];
      standupSummary = standup;
      roundsIssues = rounds || [];
      roomReadiness = rooms || [];
      attendanceAlerts = attAlerts || [];
      newHireMilestones = newHires || [];
      coachingRecords = coachings || [];
    } catch (e) {
      console.error('Failed to load Executive Desk data:', e);
      toast('Failed to load some executive desk data', 'error');
    }
  }

  return {
    async render(container, options = {}) {
      if (options.subTab) activeSubTab = options.subTab;

      container.innerHTML = `
        <div class="ops-page">
          <div class="ops-loading">Loading Administrator Executive Desk...</div>
        </div>
      `;

      await loadAllData();
      renderMain(container);
    }
  };

  function renderMain(container) {
    const today = new Date().toISOString().slice(0, 10);
    const openCommitments = actionItems.filter(a => a.type === 'commitment' && a.status !== 'completed');
    const openWaitingOn = actionItems.filter(a => a.type === 'waiting_on' && a.status !== 'completed');
    const openDeptTasksCount = deptTasks.filter(t => t.status !== 'completed').length;
    const openRoundsCount = roundsIssues.filter(r => r.status !== 'resolved').length;
    const roomsReady = roomReadiness.filter(r => r.stage === 'ready_for_admit').length;

    container.innerHTML = `
      <div class="ops-page exec-desk-page">
        <!-- Top Executive Header -->
        <header class="exec-header">
          <div class="exec-header-main">
            <div class="exec-badge">EXECUTIVE DESK</div>
            <h1 class="exec-title">Administrator Command &amp; Operations Center</h1>
            <p class="exec-subtitle">Daily executive rhythm, inbound triage, department head delegation, facility rounds, and HR supervision.</p>
          </div>
          <div class="exec-header-actions">
            <button class="ops-btn ops-btn-secondary" data-act="view" data-view="today">
              <span class="ops-icon">←</span> Clinical Command (Today)
            </button>
            <button class="ops-btn ops-btn-secondary" id="btn-open-commute-briefing">
              <span class="ops-icon">🎙️</span> 5-Min Commute Briefing
            </button>
            <button class="ops-btn ops-btn-primary" id="btn-quick-voice-memo">
              <span class="ops-icon">⚡</span> Voice Memo Multi-Parser
            </button>
            <button class="ops-btn ops-btn-accent" id="btn-end-of-day-check">
              <span class="ops-icon">🏁</span> 4:30 PM Loop Closure
            </button>
          </div>
        </header>

        <!-- KPI Executive Strip -->
        <div class="ops-command-strip">
          <div class="ops-command-card ${openCommitments.length > 0 ? 'card-commitments' : ''}">
            <div class="ops-card-badge">MY COMMITMENTS</div>
            <div class="ops-card-metric">${openCommitments.length}</div>
            <div class="ops-card-sub">Things you promised to others</div>
          </div>
          <div class="ops-command-card ${openWaitingOn.length > 0 ? 'card-followup' : ''}">
            <div class="ops-card-badge">WAITING ON</div>
            <div class="ops-card-metric">${openWaitingOn.length}</div>
            <div class="ops-card-sub">Inquiries out to MDs, pharmacy &amp; vendors</div>
          </div>
          <div class="ops-command-card ${openDeptTasksCount > 0 ? 'card-attention' : ''}">
            <div class="ops-card-badge">DELEGATED TASKS</div>
            <div class="ops-card-metric">${openDeptTasksCount}</div>
            <div class="ops-card-sub">Open items across department heads</div>
          </div>
          <div class="ops-command-card">
            <div class="ops-card-badge">ROUNDS PUNCH LIST</div>
            <div class="ops-card-metric">${openRoundsCount}</div>
            <div class="ops-card-sub">Active plant &amp; housekeeping items</div>
          </div>
          <div class="ops-command-card">
            <div class="ops-card-badge">ADMISSION ROOMS READY</div>
            <div class="ops-card-metric" style="color: #10b981;">${roomsReady} / ${roomReadiness.length}</div>
            <div class="ops-card-sub">Vacant rooms verified for admit</div>
          </div>
        </div>

        ${attendanceAlerts.length ? `
          <div class="exec-attendance-banner">
            <div class="banner-icon">⚠️</div>
            <div class="banner-content">
              <strong>Attendance Threshold Warning:</strong> ${attendanceAlerts.length} employee(s) exceeded weekend absence or attendance point thresholds in the last 60 days.
              <a href="#" id="link-view-hr-alerts" style="margin-left: 10px; color: #b45309; text-decoration: underline;">Review Staff Attendance &amp; Coaching &rarr;</a>
            </div>
          </div>
        ` : ''}

        <!-- Sub-Navigation Tabs -->
        <nav class="ops-tabs">
          <button class="ops-tab-btn ${activeSubTab === 'daily_rhythm' ? 'active' : ''}" data-subtab="daily_rhythm">
            🗓️ Daily Rhythm ("Top 3")
          </button>
          <button class="ops-tab-btn ${activeSubTab === 'action_queue' ? 'active' : ''}" data-subtab="action_queue">
            📥 Inbound Comms &amp; Triage (${openCommitments.length + openWaitingOn.length})
          </button>
          <button class="ops-tab-btn ${activeSubTab === 'delegation' ? 'active' : ''}" data-subtab="delegation">
            👥 Dept Head Accountability (${openDeptTasksCount})
          </button>
          <button class="ops-tab-btn ${activeSubTab === 'rounds' ? 'active' : ''}" data-subtab="rounds">
            🔍 Rounds &amp; Punch List (${openRoundsCount})
          </button>
          <button class="ops-tab-btn ${activeSubTab === 'room_readiness' ? 'active' : ''}" data-subtab="room_readiness">
            🛏️ Admission Room Readiness (${roomsReady})
          </button>
          <button class="ops-tab-btn ${activeSubTab === 'hr_milestones' ? 'active' : ''}" data-subtab="hr_milestones">
            📋 Staff Attendance &amp; HR (${attendanceAlerts.length ? '!' : newHireMilestones.length})
          </button>
          <button class="ops-tab-btn ${activeSubTab === 'ai_assistant' ? 'active' : ''}" data-subtab="ai_assistant">
            🤖 AI Chief of Staff Suite
          </button>
        </nav>

        <!-- Tab Content Area -->
        <div class="exec-tab-content">
          ${renderActiveSubTab()}
        </div>

        <!-- Render Any Active Modals -->
        ${renderModals()}
      </div>
    `;

    bindMainEvents(container);
  }

  function renderActiveSubTab() {
    switch (activeSubTab) {
      case 'daily_rhythm': return renderDailyRhythmView();
      case 'action_queue': return renderActionQueueView();
      case 'delegation': return renderDelegationView();
      case 'rounds': return renderRoundsView();
      case 'room_readiness': return renderRoomReadinessView();
      case 'hr_milestones': return renderHrMilestonesView();
      case 'ai_assistant': return renderAiAssistantView();
      default: return renderDailyRhythmView();
    }
  }

  // 1. Daily Rhythm View
  function renderDailyRhythmView() {
    const rhythm = rhythmData || { top3: [] };
    const top3 = rhythm.top3 || [];

    return `
      <div class="exec-rhythm-container">
        <div class="exec-card">
          <div class="exec-card-header">
            <div>
              <h3>Today's Top 3 Non-Negotiables</h3>
              <p class="exec-text-muted">Anchor priorities that must be completed today before reactive daily emergencies take over.</p>
            </div>
            <button class="ops-btn ops-btn-sm ops-btn-primary" id="btn-save-top3">Save Priorities</button>
          </div>
          <div class="exec-top3-list">
            ${[0, 1, 2].map(idx => {
              const item = top3[idx] || { title: '', completed: false, priority: idx === 0 ? 'critical' : idx === 1 ? 'high' : 'medium' };
              return `
                <div class="exec-top3-row ${item.completed ? 'completed' : ''}">
                  <div class="exec-top3-num">${idx + 1}</div>
                  <input type="checkbox" class="exec-top3-check" data-idx="${idx}" ${item.completed ? 'checked' : ''}>
                  <div class="exec-top3-input-wrapper">
                    <input type="text" class="ops-input exec-top3-input" data-idx="${idx}" value="${esc(item.title)}" placeholder="Priority #${idx + 1} (e.g. Sign OnShift schedule, lead huddle...)">
                    ${item.carriedOverFrom ? `<span class="exec-pill pill-amber">Carried over from ${esc(item.carriedOverFrom)}</span>` : ''}
                  </div>
                  <select class="ops-input exec-top3-priority" data-idx="${idx}" style="max-width: 130px;">
                    <option value="critical" ${item.priority === 'critical' ? 'selected' : ''}>Critical</option>
                    <option value="high" ${item.priority === 'high' ? 'selected' : ''}>High</option>
                    <option value="medium" ${item.priority === 'medium' ? 'selected' : ''}>Medium</option>
                  </select>
                </div>
              `;
            }).join('')}
          </div>

          <div style="margin-top: 20px;">
            <label class="ops-label">Morning Standup &amp; Daily Focus Notes</label>
            <textarea class="ops-input" id="input-rhythm-notes" rows="3" placeholder="Key talking points for 10 AM department head huddle, census focus, family conference reminders...">${esc(rhythm.morningNotes || '')}</textarea>
          </div>
        </div>

        <!-- 4:30 PM End-of-Day Loop Closure Card -->
        <div class="exec-card" style="margin-top: 20px; border-left: 4px solid #2563eb;">
          <div class="exec-card-header">
            <div>
              <h3>4:30 PM End-of-Day Loop Closure Sentinel</h3>
              <p class="exec-text-muted">Automated unclosed-loop audit. Catches unanswered callbacks, overdue department deadlines, and carryover items.</p>
            </div>
            <button class="ops-btn ops-btn-secondary" id="btn-run-eod-audit">Run Loop Closure Audit</button>
          </div>
          <div class="eod-summary-preview">
            <p>Status: ${rhythm.closedLoopCompleted ? `<span class="exec-pill pill-green">✓ Closed for ${esc(rhythm.date)}</span>` : `<span class="exec-pill pill-amber">Pending 4:30 PM Review</span>`}</p>
            <p class="exec-text-sm">Click "Run Loop Closure Audit" to audit uncompleted Top 3 items, pending doctor callbacks, and overdue department tasks before heading home.</p>
          </div>
        </div>
      </div>
    `;
  }

  // 2. Inbound Communications & Action Queue View
  function renderActionQueueView() {
    return `
      <div class="exec-action-queue">
        <div class="exec-action-toolbar">
          <div class="exec-action-filters">
            <span class="exec-filter-label">Filter:</span>
            <button class="ops-btn ops-btn-sm ops-btn-secondary active" id="btn-filter-all">All Items (${actionItems.length})</button>
            <button class="ops-btn ops-btn-sm ops-btn-secondary" id="btn-filter-commitments">My Commitments (${actionItems.filter(a => a.type === 'commitment' && a.status !== 'completed').length})</button>
            <button class="ops-btn ops-btn-sm ops-btn-secondary" id="btn-filter-waiting">Waiting On (${actionItems.filter(a => a.type === 'waiting_on' && a.status !== 'completed').length})</button>
          </div>
          <button class="ops-btn ops-btn-primary" id="btn-open-capture-modal">
            <span class="ops-icon">+</span> Capture Action Item
          </button>
        </div>

        <div class="exec-action-grid">
          <!-- Left Column: My Commitments -->
          <div class="exec-action-col">
            <div class="col-header">
              <h4>My Commitments (Things I Owe Others)</h4>
              <span class="count-badge">${actionItems.filter(a => a.type === 'commitment' && a.status !== 'completed').length} Open</span>
            </div>
            <div class="action-items-list">
              ${actionItems.filter(a => a.type === 'commitment').map(item => renderActionCard(item)).join('') || '<div class="empty-state">No commitments logged. You are all caught up!</div>'}
            </div>
          </div>

          <!-- Right Column: Waiting On -->
          <div class="exec-action-col">
            <div class="col-header">
              <h4>Waiting On (Requests to MDs, Pharmacy, Vendors)</h4>
              <span class="count-badge">${actionItems.filter(a => a.type === 'waiting_on' && a.status !== 'completed').length} Pending</span>
            </div>
            <div class="action-items-list">
              ${actionItems.filter(a => a.type === 'waiting_on').map(item => renderActionCard(item)).join('') || '<div class="empty-state">No pending inquiries. All external loops closed!</div>'}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderActionCard(item) {
    const isCompleted = item.status === 'completed';
    const channelIcon = item.source === 'whatsapp' ? '💬' : item.source === 'email' ? '✉️' : item.source === 'phone' ? '📞' : '🚶';
    const urgencyClass = item.urgency === 'critical' ? 'pill-red' : item.urgency === 'high' ? 'pill-amber' : 'pill-gray';

    return `
      <div class="exec-action-card ${isCompleted ? 'completed' : ''}" data-id="${item.id}">
        <div class="action-card-top">
          <span class="action-channel-badge">${channelIcon} ${esc(item.channel || item.source)}</span>
          <span class="exec-pill ${urgencyClass}">${esc(item.urgency.toUpperCase())}</span>
          ${item.roomNumber ? `<span class="exec-pill pill-blue">Room ${esc(item.roomNumber)}</span>` : ''}
        </div>
        <h5 class="action-card-title">${esc(item.title)}</h5>
        ${item.counterparty ? `<div class="action-card-person"><strong>Person:</strong> ${esc(item.counterparty)} ${item.counterpartyRole ? `(${esc(item.counterpartyRole)})` : ''}</div>` : ''}
        ${item.description ? `<p class="action-card-desc">${esc(item.description)}</p>` : ''}
        <div class="action-card-footer">
          <span class="action-card-date">${item.dueDate ? `Due: ${formatDate(item.dueDate)}` : `Logged: ${formatDate(item.created)}`}</span>
          <div class="action-card-btns">
            ${!isCompleted ? `
              <button class="ops-btn ops-btn-xs ops-btn-secondary btn-complete-action" data-id="${item.id}">Mark Done</button>
            ` : `
              <span class="exec-pill pill-green">✓ Done</span>
            `}
            <button class="ops-btn ops-btn-xs btn-delete-action" data-id="${item.id}">✕</button>
          </div>
        </div>
      </div>
    `;
  }

  // 3. Department Head Delegation View
  function renderDelegationView() {
    return `
      <div class="exec-delegation-view">
        <div class="exec-action-toolbar">
          <div>
            <h3>Department Head Accountability Board ("Ball in Their Court")</h3>
            <p class="exec-text-muted">Track assignments by leader without losing status or needing manual reminders.</p>
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="ops-btn ops-btn-secondary" id="btn-view-standup-summary">Standup Huddle Summary</button>
            <button class="ops-btn ops-btn-primary" id="btn-open-dept-task-modal">+ Assign Task to Dept Head</button>
          </div>
        </div>

        <div class="dept-grid">
          ${departments.map(dept => {
            const tasks = deptTasks.filter(t => t.departmentId === dept.id);
            const openTasks = tasks.filter(t => t.status !== 'completed');
            const blockedTasks = openTasks.filter(t => t.status === 'blocked');
            return `
              <div class="dept-card">
                <div class="dept-card-header">
                  <div>
                    <h4 class="dept-name">${esc(dept.name)}</h4>
                    <span class="dept-leader">${esc(dept.defaultLeader)}</span>
                  </div>
                  <span class="dept-task-count ${openTasks.length > 2 ? 'count-high' : ''}">${openTasks.length} open</span>
                </div>
                <div class="dept-tasks-list">
                  ${openTasks.map(t => `
                    <div class="dept-task-item ${t.status === 'blocked' ? 'is-blocked' : ''}">
                      <div class="task-title-line">
                        <span class="task-bullet">•</span>
                        <strong class="task-title">${esc(t.title)}</strong>
                      </div>
                      ${t.dueDate ? `<div class="task-due">Due: ${formatDate(t.dueDate)}</div>` : ''}
                      ${t.status === 'blocked' ? `<div class="task-blocked-note">⚠️ BLOCKED: ${esc(t.blockerNotes || 'Needs Administrator sign-off')}</div>` : ''}
                      <div class="task-actions">
                        <button class="ops-btn ops-btn-xs ops-btn-secondary btn-complete-dept-task" data-id="${t.id}">Done</button>
                        <button class="ops-btn ops-btn-xs btn-delete-dept-task" data-id="${t.id}">✕</button>
                      </div>
                    </div>
                  `).join('') || '<div class="empty-state-sm">No open assignments</div>'}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // 4. Executive Rounds & Punch List View
  function renderRoundsView() {
    return `
      <div class="exec-rounds-view">
        <div class="exec-action-toolbar">
          <div>
            <h3>Administrator Executive Rounds &amp; Punch List</h3>
            <p class="exec-text-muted">Walking the building: log hallway, room, and equipment findings. Auto-dispatches maintenance and housekeeping tickets.</p>
          </div>
          <button class="ops-btn ops-btn-primary" id="btn-open-rounds-modal">+ Log Rounds Issue</button>
        </div>

        <div class="rounds-table-wrapper">
          <table class="ops-table">
            <thead>
              <tr>
                <th>Location</th>
                <th>Category</th>
                <th>Finding / Description</th>
                <th>Urgency</th>
                <th>Assigned Dept</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${roundsIssues.map(issue => `
                <tr class="${issue.status === 'resolved' ? 'row-resolved' : ''}">
                  <td><strong>${esc(issue.location)}</strong></td>
                  <td><span class="exec-pill pill-blue">${esc(issue.category.toUpperCase())}</span></td>
                  <td>${esc(issue.description)}</td>
                  <td><span class="exec-pill ${issue.urgency === 'urgent' ? 'pill-red' : issue.urgency === 'high' ? 'pill-amber' : 'pill-gray'}">${esc(issue.urgency)}</span></td>
                  <td>${esc(issue.assignedDepartmentId.toUpperCase())}</td>
                  <td>
                    ${issue.status === 'resolved' ? '<span class="exec-pill pill-green">✓ Resolved</span>' : '<span class="exec-pill pill-amber">Open</span>'}
                  </td>
                  <td>
                    ${issue.status !== 'resolved' ? `
                      <button class="ops-btn ops-btn-xs ops-btn-secondary btn-resolve-rounds" data-id="${issue.id}">Resolve</button>
                    ` : ''}
                    <button class="ops-btn ops-btn-xs btn-delete-rounds" data-id="${issue.id}">✕</button>
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="7" class="empty-td">No open rounds findings logged.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 5. Admission Room Readiness View
  function renderRoomReadinessView() {
    return `
      <div class="exec-room-readiness-view">
        <div class="exec-action-toolbar">
          <div>
            <h3>Admission Room Readiness Board</h3>
            <p class="exec-text-muted">Track vacant rooms through terminal cleaning, maintenance inspection, and bed making ready for incoming admissions.</p>
          </div>
          <button class="ops-btn ops-btn-primary" id="btn-add-room">+ Add Room to Board</button>
        </div>

        <div class="room-stages-pipeline">
          ${[
            { id: 'discharged', label: '1. Discharged / Vacant', badge: 'pill-gray' },
            { id: 'deep_cleaning', label: '2. Deep Cleaning', badge: 'pill-amber' },
            { id: 'maintenance_check', label: '3. Maintenance Check', badge: 'pill-blue' },
            { id: 'bed_made', label: '4. Bed Made & Ready', badge: 'pill-purple' },
            { id: 'ready_for_admit', label: '5. Ready for Admission', badge: 'pill-green' }
          ].map(stage => {
            const roomsInStage = roomReadiness.filter(r => r.stage === stage.id);
            return `
              <div class="stage-col">
                <div class="stage-col-header">
                  <span class="stage-name">${stage.label}</span>
                  <span class="exec-pill ${stage.badge}">${roomsInStage.length}</span>
                </div>
                <div class="stage-rooms-list">
                  ${roomsInStage.map(room => `
                    <div class="room-card" data-id="${room.id}">
                      <div class="room-num">${esc(room.roomNumber)}</div>
                      <div class="room-unit">${esc(room.unit)}</div>
                      ${room.targetAdmitTime ? `<div class="room-admit-time">🎯 Admit: ${esc(room.targetAdmitTime)}</div>` : ''}
                      ${room.assignedHousekeeper ? `<div class="room-staff">ES: ${esc(room.assignedHousekeeper)}</div>` : ''}
                      ${room.notes ? `<p class="room-notes">${esc(room.notes)}</p>` : ''}
                      <div class="room-advance-bar">
                        <select class="ops-input ops-input-xs select-room-stage" data-id="${room.id}">
                          <option value="discharged" ${room.stage === 'discharged' ? 'selected' : ''}>Discharged</option>
                          <option value="deep_cleaning" ${room.stage === 'deep_cleaning' ? 'selected' : ''}>Deep Cleaning</option>
                          <option value="maintenance_check" ${room.stage === 'maintenance_check' ? 'selected' : ''}>Maint Check</option>
                          <option value="bed_made" ${room.stage === 'bed_made' ? 'selected' : ''}>Bed Made</option>
                          <option value="ready_for_admit" ${room.stage === 'ready_for_admit' ? 'selected' : ''}>Ready for Admit</option>
                        </select>
                      </div>
                    </div>
                  `).join('') || '<div class="empty-stage-box">None</div>'}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // 6. Staff Attendance & HR Milestones View
  function renderHrMilestonesView() {
    return `
      <div class="exec-hr-view">
        <div class="exec-action-toolbar">
          <div>
            <h3>Staff Supervision, Attendance &amp; HR Milestones</h3>
            <p class="exec-text-muted">Attendance point tracking, unexcused weekend call-off alerts, 30/60/90-day retention check-ins, and coaching paper trails.</p>
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="ops-btn ops-btn-secondary" id="btn-open-coaching-modal">+ Log Coaching / Warning</button>
            <button class="ops-btn ops-btn-primary" id="btn-open-attendance-modal">+ Log Attendance Occurrence</button>
          </div>
        </div>

        <!-- 30 / 60 / 90 New Hire Tracker -->
        <div class="exec-card" style="margin-bottom: 25px;">
          <h4>New Hire 30 / 60 / 90-Day Retention Milestones</h4>
          <table class="ops-table" style="margin-top: 10px;">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Role / Dept</th>
                <th>Hire Date</th>
                <th>30-Day Check-in</th>
                <th>60-Day Review</th>
                <th>90-Day Retention Eval</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${newHireMilestones.map(m => `
                <tr>
                  <td><strong>${esc(m.employeeName)}</strong></td>
                  <td>${esc(m.role)} (${esc(m.department)})</td>
                  <td>${formatDate(m.hireDate)}</td>
                  <td><span class="exec-pill ${m.day30Status === 'completed' ? 'pill-green' : 'pill-amber'}">${esc(m.day30Status)}</span> (${formatDate(m.day30Date)})</td>
                  <td><span class="exec-pill ${m.day60Status === 'completed' ? 'pill-green' : 'pill-amber'}">${esc(m.day60Status)}</span> (${formatDate(m.day60Date)})</td>
                  <td><span class="exec-pill ${m.day90Status === 'completed' ? 'pill-green' : 'pill-amber'}">${esc(m.day90Status)}</span> (${formatDate(m.day90Date)})</td>
                  <td>${esc(m.notes || '—')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- Disciplinary & Coaching Trail -->
        <div class="exec-card">
          <h4>Coaching, Commendations &amp; Disciplinary Documentation</h4>
          <table class="ops-table" style="margin-top: 10px;">
            <thead>
              <tr>
                <th>Date</th>
                <th>Employee</th>
                <th>Role</th>
                <th>Type</th>
                <th>Topic / Reason</th>
                <th>Action Plan / Details</th>
                <th>Supervisor</th>
              </tr>
            </thead>
            <tbody>
              ${coachingRecords.map(c => `
                <tr>
                  <td>${formatDate(c.date)}</td>
                  <td><strong>${esc(c.employeeName)}</strong></td>
                  <td>${esc(c.role)}</td>
                  <td><span class="exec-pill ${c.type === 'commendation' ? 'pill-green' : c.type === 'final' ? 'pill-red' : 'pill-amber'}">${esc(c.type.toUpperCase())}</span></td>
                  <td>${esc(c.topic)}</td>
                  <td>${esc(c.details)}</td>
                  <td>${esc(c.supervisorName)}</td>
                </tr>
              `).join('') || '<tr><td colspan="7" class="empty-td">No coaching records logged yet.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 7. AI Chief of Staff Suite View
  function renderAiAssistantView() {
    return `
      <div class="exec-ai-suite">
        <div class="ai-suite-hero">
          <h2>Executive AI Assistant &amp; Chief of Staff Tools</h2>
          <p>Context-aware administrative tools to prepare drafts, extract multi-actions from voice, generate meeting dossiers, and coach difficult conversations.</p>
        </div>

        <div class="ai-tools-grid">
          <!-- Tool 1: Voice Memo Multi-Parser -->
          <div class="ai-tool-card">
            <div class="ai-tool-icon">🎙️</div>
            <h3>Stream-of-Consciousness Voice Memo Parser</h3>
            <p>Speak naturally while walking hallways or driving. Automatically breaks one 30-second memo into Maintenance tickets, Dietary tasks, HR notes, and follow-ups.</p>
            <button class="ops-btn ops-btn-primary" id="btn-tool-voice-memo">Open Voice Memo Parser</button>
          </div>

          <!-- Tool 2: Context-Aware Ghostwriter -->
          <div class="ai-tool-card">
            <div class="ai-tool-icon">✍️</div>
            <h3>Context-Aware Ghostwriter</h3>
            <p>Generates professional, factual email drafts in your voice for family concerns, corporate staffing variance explanations (with OnShift numbers), and physician orders.</p>
            <button class="ops-btn ops-btn-primary" id="btn-tool-ghostwriter">Open Ghostwriter</button>
          </div>

          <!-- Tool 3: Meeting Prep Dossier -->
          <div class="ai-tool-card">
            <div class="ai-tool-icon">📑</div>
            <h3>Meeting Prep "Cheat Sheet" Dossier</h3>
            <p>Generate a 1-page briefing before meeting a Department Head, Medical Director, or Vendor: open tasks, past promises, overdue items, and talking points.</p>
            <button class="ops-btn ops-btn-primary" id="btn-tool-dossier">Generate Meeting Dossier</button>
          </div>

          <!-- Tool 4: Difficult Conversation Coach -->
          <div class="ai-tool-card">
            <div class="ai-tool-icon">💬</div>
            <h3>Difficult Conversation &amp; HR Coach</h3>
            <p>Prepares structured talking points, objective policy phrasing, and de-escalation tips for employee separations or irate family conferences.</p>
            <button class="ops-btn ops-btn-primary" id="btn-tool-difficult-convo">Open Conversation Coach</button>
          </div>
        </div>
      </div>
    `;
  }

  // Modals Rendering
  function renderModals() {
    let html = '';

    // Capture Action Item Modal
    if (showCaptureModal) {
      html += `
        <div class="ops-modal-backdrop">
          <div class="ops-modal-card">
            <div class="ops-modal-header">
              <h3>Capture Inbound Action Item (Email / WhatsApp / Hallway)</h3>
              <button class="btn-close-modal" id="btn-close-capture">✕</button>
            </div>
            <div class="ops-modal-body">
              <label class="ops-label">Action / Commitment Title *</label>
              <input type="text" class="ops-input" id="input-action-title" placeholder="e.g. Call Mrs. Smith regarding physical therapy plan">

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px;">
                <div>
                  <label class="ops-label">Type</label>
                  <select class="ops-input" id="input-action-type">
                    <option value="commitment">My Commitment (Thing I Owe)</option>
                    <option value="waiting_on">Waiting On (Response from MD / Vendor)</option>
                  </select>
                </div>
                <div>
                  <label class="ops-label">Source Channel</label>
                  <select class="ops-input" id="input-action-source">
                    <option value="whatsapp">WhatsApp Message</option>
                    <option value="email">Email (Outlook / Gmail)</option>
                    <option value="phone">Phone Call</option>
                    <option value="hallway">Hallway / In-Person</option>
                  </select>
                </div>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 10px;">
                <div>
                  <label class="ops-label">Counterparty / Sender</label>
                  <input type="text" class="ops-input" id="input-action-person" placeholder="e.g. Dr. Miller, Regional VP, Family">
                </div>
                <div>
                  <label class="ops-label">Urgency</label>
                  <select class="ops-input" id="input-action-urgency">
                    <option value="normal">Normal</option>
                    <option value="medium">Medium</option>
                    <option value="high" selected>High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              <div style="margin-top: 10px;">
                <label class="ops-label">Room / Resident (Optional)</label>
                <input type="text" class="ops-input" id="input-action-room" placeholder="e.g. Room 214-B">
              </div>

              <div style="margin-top: 10px;">
                <label class="ops-label">Details / Message Excerpt</label>
                <textarea class="ops-input" id="input-action-desc" rows="3" placeholder="Paste email text, WhatsApp message, or hallway discussion notes..."></textarea>
              </div>
            </div>
            <div class="ops-modal-footer">
              <button class="ops-btn ops-btn-secondary" id="btn-cancel-capture">Cancel</button>
              <button class="ops-btn ops-btn-primary" id="btn-submit-capture">Save Action Item</button>
            </div>
          </div>
        </div>
      `;
    }

    // Voice Memo Multi-Parser Modal
    if (showVoiceMemoModal) {
      html += `
        <div class="ops-modal-backdrop">
          <div class="ops-modal-card" style="max-width: 680px;">
            <div class="ops-modal-header">
              <h3>🎙️ Voice Memo Multi-Action Parser</h3>
              <button class="btn-close-modal" id="btn-close-voice-memo">✕</button>
            </div>
            <div class="ops-modal-body">
              <p class="exec-text-sm">Speak or paste free-form thoughts from your facility rounds. The AI assistant extracts separate maintenance tickets, dietary updates, HR notes, and follow-ups:</p>
              
              <textarea class="ops-input" id="input-voice-transcript" rows="4" placeholder="Speak or paste voice transcript... e.g. 'Hey, tell maintenance the AC in room 204 is leaking, dietary cold soup in 115, and CNA Jackson stayed 2 hours late to cover breakfast.'">${esc(voiceMemoTranscript)}</textarea>
              
              <div style="margin-top: 10px; display: flex; justify-content: space-between;">
                <button class="ops-btn ops-btn-secondary ops-btn-sm" id="btn-load-sample-memo">Load Sample Hallway Memo</button>
                <button class="ops-btn ops-btn-primary" id="btn-run-voice-parse">Parse Multi-Actions &rarr;</button>
              </div>

              ${parsedVoiceActions ? `
                <div class="parsed-actions-preview" style="margin-top: 20px;">
                  <h4>Extracted Operations Actions (${parsedVoiceActions.totalActionsFound}):</h4>
                  <div class="parsed-cards-list">
                    ${parsedVoiceActions.actions.map((act, i) => `
                      <div class="parsed-action-card">
                        <div class="parsed-badge">${esc(act.type)} &rarr; ${esc(act.destination)}</div>
                        <div class="parsed-desc"><strong>${act.location ? `[${act.location}] ` : ''}</strong>${esc(act.description)}</div>
                      </div>
                    `).join('')}
                  </div>
                  <button class="ops-btn ops-btn-primary" id="btn-commit-voice-actions" style="margin-top: 15px; width: 100%;">
                    ✓ Auto-Commit All ${parsedVoiceActions.totalActionsFound} Actions to Database
                  </button>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }

    // Ghostwriter Modal
    if (showGhostwriteModal) {
      html += `
        <div class="ops-modal-backdrop">
          <div class="ops-modal-card" style="max-width: 650px;">
            <div class="ops-modal-header">
              <h3>✍️ Context-Aware Ghostwriter</h3>
              <button class="btn-close-modal" id="btn-close-ghostwrite">✕</button>
            </div>
            <div class="ops-modal-body">
              <label class="ops-label">Draft Type</label>
              <select class="ops-input" id="select-ghostwrite-type">
                <option value="family_inquiry" ${ghostwriteForm.type === 'family_inquiry' ? 'selected' : ''}>Family Inquiry &amp; Care Conference Response</option>
                <option value="corporate_staffing" ${ghostwriteForm.type === 'corporate_staffing' ? 'selected' : ''}>Corporate Staffing &amp; Overtime Variance Explanation</option>
                <option value="physician_followup" ${ghostwriteForm.type === 'physician_followup' ? 'selected' : ''}>Physician Order &amp; Lab Callback Follow-Up</option>
              </select>

              <div style="margin-top: 12px;" id="ghostwrite-fields">
                ${ghostwriteForm.type === 'family_inquiry' ? `
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                      <label class="ops-label">Family Member Name</label>
                      <input type="text" class="ops-input" id="gw-family-name" value="${esc(ghostwriteForm.familyName || 'Mrs. Davis')}" placeholder="Mrs. Davis">
                    </div>
                    <div>
                      <label class="ops-label">Resident Name</label>
                      <input type="text" class="ops-input" id="gw-res-name" value="${esc(ghostwriteForm.residentName || 'Dorothy Davis')}" placeholder="Dorothy Davis">
                    </div>
                  </div>
                  <div style="margin-top: 10px;">
                    <label class="ops-label">Concern Topic</label>
                    <input type="text" class="ops-input" id="gw-topic" value="${esc(ghostwriteForm.topic || 'physical therapy progression and dining room seating')}" placeholder="Topic">
                  </div>
                ` : ghostwriteForm.type === 'corporate_staffing' ? `
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                      <label class="ops-label">Period</label>
                      <input type="text" class="ops-input" id="gw-period" value="this past weekend">
                    </div>
                    <div>
                      <label class="ops-label">Overtime Hours / Shifts</label>
                      <input type="text" class="ops-input" id="gw-total-ot" value="18.5 hours (2 CNA shifts)">
                    </div>
                  </div>
                  <div style="margin-top: 10px;">
                    <label class="ops-label">Root Cause Driver</label>
                    <input type="text" class="ops-input" id="gw-root-cause" value="acute short-notice call-offs on 3-11 West Wing">
                  </div>
                ` : `
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                      <label class="ops-label">Physician Name</label>
                      <input type="text" class="ops-input" id="gw-md-name" value="Dr. Robert Smith">
                    </div>
                    <div>
                      <label class="ops-label">Resident &amp; Room</label>
                      <input type="text" class="ops-input" id="gw-md-res" value="James Wilson (Room 204)">
                    </div>
                  </div>
                  <div style="margin-top: 10px;">
                    <label class="ops-label">Clinical Need</label>
                    <input type="text" class="ops-input" id="gw-clinical-need" value="signed telephone clarification orders for Lasix increase">
                  </div>
                `}
              </div>

              <button class="ops-btn ops-btn-primary" id="btn-generate-ghostwrite" style="margin-top: 15px; width: 100%;">
                Generate Executive Draft
              </button>

              ${ghostwriteResult ? `
                <div class="ghostwrite-output" style="margin-top: 20px;">
                  <label class="ops-label">Generated Subject</label>
                  <input type="text" class="ops-input" value="${esc(ghostwriteResult.subject)}" readonly>
                  <label class="ops-label" style="margin-top: 10px;">Generated Message Body</label>
                  <textarea class="ops-input" rows="8" id="gw-result-body" readonly>${esc(ghostwriteResult.body)}</textarea>
                  <button class="ops-btn ops-btn-secondary" id="btn-copy-draft" style="margin-top: 10px;">
                    📋 Copy Draft to Clipboard
                  </button>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }

    // Commute Briefing Modal
    if (showCommuteModal) {
      html += `
        <div class="ops-modal-backdrop">
          <div class="ops-modal-card" style="max-width: 600px;">
            <div class="ops-modal-header">
              <h3>🎙️ 5-Minute Morning Commute Briefing</h3>
              <button class="btn-close-modal" id="btn-close-commute">✕</button>
            </div>
            <div class="ops-modal-body">
              ${commuteBriefingData ? `
                <div class="commute-player-box">
                  <div class="commute-stats-row">
                    <div><strong>Active Census:</strong> ${commuteBriefingData.activeCensus}</div>
                    <div><strong>Admissions Pending:</strong> ${commuteBriefingData.pendingAdmissionsCount}</div>
                    <div><strong>Night Call-offs:</strong> ${commuteBriefingData.overnightCallOffsCount}</div>
                  </div>
                  <div class="commute-script-box">
                    <pre style="white-space: pre-wrap; font-family: inherit; font-size: 14px; line-height: 1.6;">${esc(commuteBriefingData.audioScript)}</pre>
                  </div>
                  <button class="ops-btn ops-btn-primary" id="btn-play-commute-audio" style="width: 100%; margin-top: 15px;">
                    🔊 Play Spoken Audio Briefing (Speech Synthesis)
                  </button>
                </div>
              ` : '<div class="ops-loading">Synthesizing morning briefing...</div>'}
            </div>
          </div>
        </div>
      `;
    }

    // 4:30 PM End of Day Audit Modal
    if (showEodModal) {
      html += `
        <div class="ops-modal-backdrop">
          <div class="ops-modal-card" style="max-width: 650px;">
            <div class="ops-modal-header">
              <h3>🏁 4:30 PM End-of-Day Loop Closure Audit</h3>
              <button class="btn-close-modal" id="btn-close-eod">✕</button>
            </div>
            <div class="ops-modal-body">
              ${eodAudit ? `
                <div class="eod-audit-content">
                  <div class="eod-score-banner ${eodAudit.needsAttentionScore > 0 ? 'score-warn' : 'score-good'}">
                    <h4>Audit Status: ${eodAudit.needsAttentionScore === 0 ? 'All Loops Closed!' : `${eodAudit.needsAttentionScore} Open Loops Needing Closure`}</h4>
                  </div>
                  
                  <div class="eod-audit-sections">
                    <div class="eod-sec">
                      <strong>Uncompleted Top 3 Non-Negotiables (${eodAudit.uncompletedTop3.length}):</strong>
                      <ul>
                        ${eodAudit.uncompletedTop3.map(t => `<li>${esc(t.title)} (Priority: ${t.priority})</li>`).join('') || '<li>All Top 3 completed!</li>'}
                      </ul>
                    </div>

                    <div class="eod-sec">
                      <strong>Overdue Commitments (${eodAudit.overdueCommitments.length}):</strong>
                      <ul>
                        ${eodAudit.overdueCommitments.map(c => `<li>${esc(c.title)} (To: ${esc(c.counterparty || 'Staff')})</li>`).join('') || '<li>No overdue commitments</li>'}
                      </ul>
                    </div>

                    <div class="eod-sec">
                      <strong>Pending External Inquiries (>4h) (${eodAudit.staleWaitingOn.length}):</strong>
                      <ul>
                        ${eodAudit.staleWaitingOn.map(w => `<li>${esc(w.title)} (From: ${esc(w.counterparty || 'External')})</li>`).join('') || '<li>No stale inquiries</li>'}
                      </ul>
                    </div>
                  </div>

                  <button class="ops-btn ops-btn-primary" id="btn-confirm-eod-close" style="width: 100%; margin-top: 20px;">
                    ✓ Mark Day's Loops Closed &amp; Roll Unfinished to Tomorrow
                  </button>
                </div>
              ` : '<div class="ops-loading">Auditing today\'s open loops...</div>'}
            </div>
          </div>
        </div>
      `;
    }

    return html;
  }

  function bindMainEvents(container) {
    // Sub-tab Navigation
    container.querySelectorAll('.ops-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeSubTab = btn.dataset.subtab;
        renderMain(container);
      });
    });

    // Quick Action Bar Buttons
    const btnCommute = container.querySelector('#btn-open-commute-briefing');
    if (btnCommute) {
      btnCommute.addEventListener('click', async () => {
        showCommuteModal = true;
        renderMain(container);
        commuteBriefingData = await api('assistantCommuteBriefing');
        renderMain(container);
      });
    }

    const btnVoiceMemo = container.querySelector('#btn-quick-voice-memo');
    if (btnVoiceMemo) {
      btnVoiceMemo.addEventListener('click', () => {
        showVoiceMemoModal = true;
        renderMain(container);
      });
    }

    const btnEodCheck = container.querySelector('#btn-end-of-day-check');
    if (btnEodCheck) {
      btnEodCheck.addEventListener('click', async () => {
        showEodModal = true;
        renderMain(container);
        eodAudit = await api('execEndOfDayAudit');
        renderMain(container);
      });
    }

    // Top 3 Save
    const btnSaveTop3 = container.querySelector('#btn-save-top3');
    if (btnSaveTop3) {
      btnSaveTop3.addEventListener('click', async () => {
        const top3Rows = [];
        container.querySelectorAll('.exec-top3-row').forEach((row, idx) => {
          const title = row.querySelector('.exec-top3-input').value.trim();
          const completed = row.querySelector('.exec-top3-check').checked;
          const priority = row.querySelector('.exec-top3-priority').value;
          top3Rows.push({ title, completed, priority });
        });

        const notes = container.querySelector('#input-rhythm-notes')?.value || '';
        await api('execRhythmSave', { top3: top3Rows, morningNotes: notes });
        toast('Top 3 Priorities saved successfully', 'success');
        await loadAllData();
        renderMain(container);
      });
    }

    // Action Queue: Capture Modal Open
    const btnOpenCapture = container.querySelector('#btn-open-capture-modal');
    if (btnOpenCapture) {
      btnOpenCapture.addEventListener('click', () => {
        showCaptureModal = true;
        renderMain(container);
      });
    }

    // Complete Action Item
    container.querySelectorAll('.btn-complete-action').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        await api('execActionUpdate', { id, status: 'completed' });
        toast('Action item marked completed', 'success');
        await loadAllData();
        renderMain(container);
      });
    });

    // Delete Action Item
    container.querySelectorAll('.btn-delete-action').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        await api('execActionDelete', { id });
        toast('Action item removed', 'info');
        await loadAllData();
        renderMain(container);
      });
    });

    // Department Task Complete
    container.querySelectorAll('.btn-complete-dept-task').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const task = deptTasks.find(t => t.id === id);
        if (task) {
          await api('execDeptTaskSave', { ...task, status: 'completed' });
          toast('Department task completed', 'success');
          await loadAllData();
          renderMain(container);
        }
      });
    });

    // Room Stage Dropdown change
    container.querySelectorAll('.select-room-stage').forEach(sel => {
      sel.addEventListener('change', async () => {
        const id = sel.dataset.id;
        const newStage = sel.value;
        await api('execRoomReadinessUpdate', { id, stage: newStage });
        toast('Room stage updated', 'success');
        await loadAllData();
        renderMain(container);
      });
    });

    // Resolve Rounds
    container.querySelectorAll('.btn-resolve-rounds').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const notes = prompt('Enter resolution notes:');
        if (notes !== null) {
          await api('execRoundsResolve', { id, resolutionNotes: notes });
          toast('Rounds issue resolved', 'success');
          await loadAllData();
          renderMain(container);
        }
      });
    });

    // AI Assistant Tools Buttons
    const btnToolVoice = container.querySelector('#btn-tool-voice-memo');
    if (btnToolVoice) btnToolVoice.addEventListener('click', () => { showVoiceMemoModal = true; renderMain(container); });

    const btnToolGhost = container.querySelector('#btn-tool-ghostwriter');
    if (btnToolGhost) btnToolGhost.addEventListener('click', () => { showGhostwriteModal = true; renderMain(container); });

    // Modals Close handlers
    const btnCloseCapture = container.querySelector('#btn-close-capture') || container.querySelector('#btn-cancel-capture');
    if (btnCloseCapture) btnCloseCapture.addEventListener('click', () => { showCaptureModal = false; renderMain(container); });

    const btnCloseVoice = container.querySelector('#btn-close-voice-memo');
    if (btnCloseVoice) btnCloseVoice.addEventListener('click', () => { showVoiceMemoModal = false; renderMain(container); });

    const btnCloseGhost = container.querySelector('#btn-close-ghostwrite');
    if (btnCloseGhost) btnCloseGhost.addEventListener('click', () => { showGhostwriteModal = false; renderMain(container); });

    const btnCloseCommute = container.querySelector('#btn-close-commute');
    if (btnCloseCommute) btnCloseCommute.addEventListener('click', () => { showCommuteModal = false; renderMain(container); });

    const btnCloseEod = container.querySelector('#btn-close-eod');
    if (btnCloseEod) btnCloseEod.addEventListener('click', () => { showEodModal = false; renderMain(container); });

    // Submit Capture Item
    const btnSubmitCapture = container.querySelector('#btn-submit-capture');
    if (btnSubmitCapture) {
      btnSubmitCapture.addEventListener('click', async () => {
        const title = container.querySelector('#input-action-title')?.value.trim();
        if (!title) return toast('Please enter a title', 'warn');

        await api('execActionCapture', {
          title,
          type: container.querySelector('#input-action-type')?.value,
          source: container.querySelector('#input-action-source')?.value,
          counterparty: container.querySelector('#input-action-person')?.value,
          urgency: container.querySelector('#input-action-urgency')?.value,
          roomNumber: container.querySelector('#input-action-room')?.value,
          description: container.querySelector('#input-action-desc')?.value
        });

        toast('Action item captured', 'success');
        showCaptureModal = false;
        await loadAllData();
        renderMain(container);
      });
    }

    // Voice Memo Handlers
    const btnSampleMemo = container.querySelector('#btn-load-sample-memo');
    if (btnSampleMemo) {
      btnSampleMemo.addEventListener('click', () => {
        voiceMemoTranscript = "Hey, tell maintenance the air conditioner in room 204 is leaking on the floor, let dietary know room 115 complained about cold soup again, and put a note in CNA Jackson's file that she stayed two hours late to cover breakfast.";
        container.querySelector('#input-voice-transcript').value = voiceMemoTranscript;
      });
    }

    const btnRunVoiceParse = container.querySelector('#btn-run-voice-parse');
    if (btnRunVoiceParse) {
      btnRunVoiceParse.addEventListener('click', async () => {
        const transcript = container.querySelector('#input-voice-transcript')?.value.trim();
        if (!transcript) return toast('Enter or speak a transcript first', 'warn');
        voiceMemoTranscript = transcript;
        parsedVoiceActions = await api('assistantParseVoiceMemo', { transcript });
        renderMain(container);
      });
    }

    const btnCommitVoice = container.querySelector('#btn-commit-voice-actions');
    if (btnCommitVoice) {
      btnCommitVoice.addEventListener('click', async () => {
        if (!parsedVoiceActions?.actions) return;
        for (const act of parsedVoiceActions.actions) {
          if (act.targetModule === 'rounds_maintenance') {
            await api('execRoundsLog', act.autoCommitPayload);
          } else if (act.targetModule === 'dept_task_dietary') {
            await api('execDeptTaskSave', act.autoCommitPayload);
          } else if (act.targetModule === 'hr_coaching') {
            await api('execCoachingSave', act.autoCommitPayload);
          } else if (act.targetModule === 'exec_action') {
            await api('execActionCapture', act.autoCommitPayload);
          }
        }
        toast(`Successfully created ${parsedVoiceActions.actions.length} operational records!`, 'success');
        showVoiceMemoModal = false;
        parsedVoiceActions = null;
        await loadAllData();
        renderMain(container);
      });
    }

    // Ghostwrite Generation
    const btnGenGhost = container.querySelector('#btn-generate-ghostwrite');
    if (btnGenGhost) {
      btnGenGhost.addEventListener('click', async () => {
        const type = container.querySelector('#select-ghostwrite-type').value;
        const ctx = {
          familyName: container.querySelector('#gw-family-name')?.value,
          residentName: container.querySelector('#gw-res-name')?.value,
          topic: container.querySelector('#gw-topic')?.value,
          period: container.querySelector('#gw-period')?.value,
          totalOT: container.querySelector('#gw-total-ot')?.value,
          rootCause: container.querySelector('#gw-root-cause')?.value,
          physicianName: container.querySelector('#gw-md-name')?.value,
          clinicalNeed: container.querySelector('#gw-clinical-need')?.value
        };
        ghostwriteResult = await api('assistantGhostwrite', { type, context: ctx });
        renderMain(container);
      });
    }

    // Copy Draft
    const btnCopyDraft = container.querySelector('#btn-copy-draft');
    if (btnCopyDraft) {
      btnCopyDraft.addEventListener('click', () => {
        const body = container.querySelector('#gw-result-body')?.value;
        if (body) {
          navigator.clipboard.writeText(body);
          toast('Draft copied to clipboard!', 'success');
        }
      });
    }

    // Play Commute Audio (TTS)
    const btnPlayAudio = container.querySelector('#btn-play-commute-audio');
    if (btnPlayAudio && commuteBriefingData?.audioScript) {
      btnPlayAudio.addEventListener('click', () => {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(commuteBriefingData.audioScript);
          utterance.rate = 1.05;
          window.speechSynthesis.speak(utterance);
          toast('Playing spoken morning briefing...', 'info');
        } else {
          toast('Speech synthesis is not supported in this browser window.', 'warn');
        }
      });
    }

    // Confirm EOD Close
    const btnConfirmEod = container.querySelector('#btn-confirm-eod-close');
    if (btnConfirmEod) {
      btnConfirmEod.addEventListener('click', async () => {
        await api('execRhythmSave', { closedLoopCompleted: true });
        toast('Day\'s operational loops marked closed!', 'success');
        showEodModal = false;
        await loadAllData();
        renderMain(container);
      });
    }
  }
}
