'use strict';

/**
 * Executive Desk Engine
 *
 * Daily Executive Rhythm ("Top 3 Non-Negotiables", 4:30 PM loop closure),
 * Inbound Communications & Action Item Triage (Email & WhatsApp),
 * Department Head Delegation & Accountability ("Ball in Their Court"),
 * Administrator Executive Rounds & Punch List Logger,
 * Admission Room Readiness Tracker, and
 * Staff Attendance & HR Milestones.
 */

const { fail, isId, text, uuid } = require('./security.cjs');

const DEPARTMENTS = [
  { id: 'don', name: 'Nursing / DON', title: 'Director of Nursing', defaultLeader: 'Sarah Jenkins, RN' },
  { id: 'adon', name: 'Assistant DON', title: 'Assistant Director of Nursing', defaultLeader: 'Elena Rostova, RN' },
  { id: 'maintenance', name: 'Maintenance & Plant', title: 'Director of Maintenance', defaultLeader: 'Marcus Vance' },
  { id: 'dietary', name: 'Food & Nutrition', title: 'Dietary Director', defaultLeader: 'Chef Carlos Mendez' },
  { id: 'housekeeping', name: 'Housekeeping & Laundry', title: 'Director of Environmental Services', defaultLeader: 'Maria Santos' },
  { id: 'social_services', name: 'Social Services', title: 'Social Services Director', defaultLeader: 'Rachel Green, LCSW' },
  { id: 'business_office', name: 'Business Office / Billing', title: 'Business Office Manager', defaultLeader: 'David Miller' },
  { id: 'therapy', name: 'Rehabilitation / Therapy', title: 'Director of Rehab', defaultLeader: 'Laura Adams, PT' },
  { id: 'activities', name: 'Activities & Life Enrichment', title: 'Activities Director', defaultLeader: 'Grace Kim' }
];

const ROOM_STAGES = [
  { id: 'discharged', label: 'Discharged / Vacant', order: 1, color: '#6b7280' },
  { id: 'deep_cleaning', label: 'Deep Cleaning (Housekeeping)', order: 2, color: '#f59e0b' },
  { id: 'maintenance_check', label: 'Maintenance Inspection', order: 3, color: '#3b82f6' },
  { id: 'bed_made', label: 'Bed Made & Furnished', order: 4, color: '#8b5cf6' },
  { id: 'ready_for_admit', label: 'Ready for Admission', order: 5, color: '#10b981' }
];

class ExecutiveDeskEngine {
  constructor(core) {
    this.core = core;
  }

  get store() {
    return this.core.store;
  }

  // Canonical Action / Todo Bridge
  saveCanonicalTodo(todoData) {
    if (typeof this.core.saveTodo === 'function') {
      return this.core.saveTodo(todoData);
    }
    const t = {
      id: isId(todoData.id) ? todoData.id : uuid(),
      title: text(todoData.title || 'Action item', 200),
      description: text(todoData.description || '', 4000),
      owner: text(todoData.owner || '', 100),
      dueAt: todoData.dueAt ? Number(todoData.dueAt) : (todoData.dueDate ? Date.parse(todoData.dueDate) : null),
      followUpDate: null,
      priority: ['low', 'normal', 'high', 'urgent'].includes(todoData.priority) ? todoData.priority : 'normal',
      status: ['pending', 'completed'].includes(todoData.status) ? todoData.status : 'pending',
      reminderEnabled: todoData.reminderEnabled !== false,
      notified: false,
      source: ['manual', 'email', 'chat', 'rounds', 'delegation'].includes(todoData.source) ? todoData.source : 'manual',
      createdAt: todoData.createdAt || Date.now(),
      completedAt: todoData.status === 'completed' ? (todoData.completedAt || Date.now()) : null
    };
    this.store.put('todo', t.id, t);
    if (typeof this.core.emit === 'function') {
      this.core.emit({ type: 'todos_changed' });
    }
    return t;
  }

  syncCanonicalTodoStatus(todoId, status, completionNote) {
    const existing = this.store.get('todo', todoId);
    if (!existing) return null;
    const isCompleted = status === 'completed';
    const updated = {
      ...existing,
      status: isCompleted ? 'completed' : 'pending',
      completedAt: isCompleted ? (existing.completedAt || Date.now()) : null,
      description: completionNote ? `${existing.description}\n[Closed: ${text(completionNote, 500)}]` : existing.description
    };
    if (typeof this.core.saveTodo === 'function') {
      return this.core.saveTodo(updated);
    }
    this.store.put('todo', updated.id, updated);
    if (typeof this.core.emit === 'function') {
      this.core.emit({ type: 'todos_changed' });
    }
    return updated;
  }

  // -------------------------------------------------------------
  // 1. Daily Executive Rhythm ("Top 3" & 4:30 PM Loop Closure)
  // -------------------------------------------------------------
  getDailyRhythm(dateStr) {
    this.core.assertUnlocked();
    const date = dateStr || new Date().toISOString().slice(0, 10);
    const key = `rhythm_${date}`;
    let record = this.store.get('exec_rhythm', key);

    if (!record) {
      // Check yesterday for carryovers
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const prevRecord = this.store.get('exec_rhythm', `rhythm_${yesterday}`);
      const carryovers = [];
      if (prevRecord && Array.isArray(prevRecord.top3)) {
        prevRecord.top3.forEach(t => {
          if (!t.completed && t.title) {
            carryovers.push({
              id: uuid(),
              title: t.title,
              completed: false,
              priority: t.priority || 'high',
              carriedOverFrom: yesterday
            });
          }
        });
      }

      record = {
        id: key,
        date,
        top3: carryovers.slice(0, 3).concat(
          Array(Math.max(0, 3 - carryovers.length)).fill(null).map((_, i) => ({
            id: uuid(),
            title: '',
            completed: false,
            priority: i === 0 ? 'critical' : i === 1 ? 'high' : 'medium',
            carriedOverFrom: null
          }))
        ).slice(0, 3),
        morningNotes: '',
        closedLoopCompleted: false,
        closedAt: null,
        created: Date.now(),
        updated: Date.now()
      };
      this.store.put('exec_rhythm', key, record);
    }
    return record;
  }

  saveDailyRhythm(data) {
    this.core.assertUnlocked();
    const date = data.date || new Date().toISOString().slice(0, 10);
    const key = `rhythm_${date}`;
    const existing = this.getDailyRhythm(date);

    const updated = {
      ...existing,
      top3: Array.isArray(data.top3) ? data.top3.slice(0, 5).map(t => ({
        id: t.id || uuid(),
        title: text(t.title || '', 200),
        completed: Boolean(t.completed),
        priority: ['critical', 'high', 'medium', 'normal'].includes(t.priority) ? t.priority : 'high',
        carriedOverFrom: t.carriedOverFrom || null
      })) : existing.top3,
      morningNotes: text(data.morningNotes || existing.morningNotes || '', 2000),
      closedLoopCompleted: Boolean(data.closedLoopCompleted),
      closedAt: data.closedLoopCompleted ? (existing.closedAt || Date.now()) : null,
      updated: Date.now()
    };

    this.store.put('exec_rhythm', key, updated);
    return updated;
  }

  getEndOfDayAudit() {
    this.core.assertUnlocked();
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const rhythm = this.getDailyRhythm(today);

    // 1. Uncompleted Top 3
    const uncompletedTop3 = (rhythm.top3 || []).filter(t => t.title && !t.completed);

    // 2. Overdue or unresolved "My Commitments" (things administrator owes)
    const allActions = this.store.list('exec_action') || [];
    const openCommitments = allActions.filter(a => a.type === 'commitment' && a.status !== 'completed');
    const overdueCommitments = openCommitments.filter(a => a.dueDate && new Date(a.dueDate).getTime() < now);

    // 3. Waiting On items with no response that need follow-up
    const openWaitingOn = allActions.filter(a => a.type === 'waiting_on' && a.status !== 'completed');
    const staleWaitingOn = openWaitingOn.filter(a => (now - (a.updated || a.created)) > 14400000); // 4 hours

    // 4. Overdue Department Head Tasks
    const allDeptTasks = this.store.list('exec_dept_task') || [];
    const openDeptTasks = allDeptTasks.filter(t => t.status !== 'completed');
    const overdueDeptTasks = openDeptTasks.filter(t => t.dueDate && new Date(t.dueDate).getTime() < now);

    // 5. Open urgent rounds issues
    const allRounds = this.store.list('exec_rounds_issue') || [];
    const openRoundsIssues = allRounds.filter(r => r.status !== 'resolved' && (r.urgency === 'urgent' || r.urgency === 'high'));

    return {
      date: today,
      isClosed: rhythm.closedLoopCompleted,
      uncompletedTop3,
      openCommitmentsCount: openCommitments.length,
      overdueCommitments,
      openWaitingOnCount: openWaitingOn.length,
      staleWaitingOn,
      openDeptTasksCount: openDeptTasks.length,
      overdueDeptTasks,
      openRoundsIssuesCount: openRoundsIssues.length,
      urgentRoundsIssues: openRoundsIssues,
      needsAttentionScore: overdueCommitments.length + overdueDeptTasks.length + uncompletedTop3.length + openRoundsIssues.length
    };
  }

  // -------------------------------------------------------------
  // 2. Inbound Communications & Action Item Triage (Email & WhatsApp)
  // -------------------------------------------------------------
  captureActionItem(data) {
    this.core.assertUnlocked();
    const id = isId(data.id) ? data.id : uuid();
    const source = ['email', 'whatsapp', 'phone', 'hallway', 'meeting', 'direct'].includes(data.source) ? data.source : 'direct';
    const type = ['commitment', 'waiting_on'].includes(data.type) ? data.type : 'commitment';
    const urgency = ['critical', 'high', 'medium', 'normal'].includes(data.urgency) ? data.urgency : 'normal';

    const item = {
      id,
      title: text(data.title || 'Action item', 250),
      description: text(data.description || '', 4000),
      source,
      type,
      counterparty: text(data.counterparty || '', 150), // Sender or person waiting on
      counterpartyRole: text(data.counterpartyRole || '', 100),
      channel: text(data.channel || (source === 'whatsapp' ? 'WhatsApp' : source === 'email' ? 'Email' : 'In Person'), 50),
      urgency,
      dueDate: data.dueDate || null,
      residentId: data.residentId ? text(data.residentId, 50) : null,
      roomNumber: data.roomNumber ? text(data.roomNumber, 20) : null,
      status: ['active', 'completed', 'escalated', 'cancelled'].includes(data.status) ? data.status : 'active',
      escalationReason: data.escalationReason ? text(data.escalationReason, 500) : null,
      completedAt: data.status === 'completed' ? Date.now() : null,
      created: data.created || Date.now(),
      updated: Date.now()
    };

    // Canonical Action Center synchronization: Save as canonical todo
    const canonicalPriority = urgency === 'critical' ? 'urgent' : urgency === 'high' ? 'high' : 'normal';
    this.saveCanonicalTodo({
      id,
      title: item.title,
      description: item.description || (item.counterparty ? `Contact: ${item.counterparty} (${item.counterpartyRole || item.channel})` : ''),
      owner: type === 'commitment' ? 'Facility Administrator' : (item.counterparty || 'External'),
      dueAt: item.dueDate ? Date.parse(item.dueDate) : null,
      priority: canonicalPriority,
      status: item.status === 'completed' ? 'completed' : 'pending',
      source: source === 'email' ? 'email' : 'manual'
    });

    // Store metadata in wf_action_meta so Action Center displays full context
    this.store.put('wf_action_meta', 'todo:' + id, {
      id: 'todo:' + id,
      owner: type === 'commitment' ? 'Facility Administrator' : (item.counterparty || 'External'),
      dueAt: item.dueDate ? Date.parse(item.dueDate) : null,
      note: item.description,
      category: type,
      counterparty: item.counterparty,
      channel: item.channel,
      roomNumber: item.roomNumber,
      residentId: item.residentId,
      updatedAt: Date.now()
    });

    this.store.put('exec_action', id, item);
    return item;
  }

  listActionItems(filters = {}) {
    this.core.assertUnlocked();
    let items = this.store.list('exec_action') || [];

    // Synchronize status bidirectionally with canonical todo records
    for (const item of items) {
      const canonical = this.store.get('todo', item.id);
      if (canonical) {
        if (canonical.status === 'completed' && item.status !== 'completed') {
          item.status = 'completed';
          item.completedAt = canonical.completedAt || Date.now();
        } else if (canonical.status === 'pending' && item.status === 'completed') {
          item.status = 'active';
          item.completedAt = null;
        }
      }
    }

    if (filters.type) {
      items = items.filter(i => i.type === filters.type);
    }
    if (filters.status) {
      items = items.filter(i => i.status === filters.status);
    }
    if (filters.source) {
      items = items.filter(i => i.source === filters.source);
    }
    if (filters.urgency) {
      items = items.filter(i => i.urgency === filters.urgency);
    }

    // Sort by: critical/high urgency first, then due date ascending, then created descending
    return items.sort((a, b) => {
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;
      const urgMap = { critical: 0, high: 1, medium: 2, normal: 3 };
      const diffUrg = (urgMap[a.urgency] ?? 3) - (urgMap[b.urgency] ?? 3);
      if (diffUrg !== 0) return diffUrg;
      if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return (b.created || 0) - (a.created || 0);
    });
  }

  updateActionItem(id, updates) {
    this.core.assertUnlocked();
    if (!isId(id)) throw fail('INVALID');
    const existing = this.store.get('exec_action', id);
    if (!existing) throw fail('NOT_FOUND');

    const updated = {
      ...existing,
      title: updates.title !== undefined ? text(updates.title, 250) : existing.title,
      description: updates.description !== undefined ? text(updates.description, 4000) : existing.description,
      type: ['commitment', 'waiting_on'].includes(updates.type) ? updates.type : existing.type,
      counterparty: updates.counterparty !== undefined ? text(updates.counterparty, 150) : existing.counterparty,
      counterpartyRole: updates.counterpartyRole !== undefined ? text(updates.counterpartyRole, 100) : existing.counterpartyRole,
      urgency: ['critical', 'high', 'medium', 'normal'].includes(updates.urgency) ? updates.urgency : existing.urgency,
      dueDate: updates.dueDate !== undefined ? updates.dueDate : existing.dueDate,
      residentId: updates.residentId !== undefined ? text(updates.residentId || '', 50) : existing.residentId,
      roomNumber: updates.roomNumber !== undefined ? text(updates.roomNumber || '', 20) : existing.roomNumber,
      status: ['active', 'completed', 'escalated', 'cancelled'].includes(updates.status) ? updates.status : existing.status,
      escalationReason: updates.escalationReason !== undefined ? text(updates.escalationReason, 500) : existing.escalationReason,
      completedAt: updates.status === 'completed' ? (existing.completedAt || Date.now()) : (updates.status === 'active' ? null : existing.completedAt),
      updated: Date.now()
    };

    this.store.put('exec_action', id, updated);

    // Sync canonical todo and metadata
    this.syncCanonicalTodoStatus(id, updated.status, updated.description);
    const meta = this.store.get('wf_action_meta', 'todo:' + id) || {};
    this.store.put('wf_action_meta', 'todo:' + id, {
      ...meta,
      note: updated.description,
      dueAt: updated.dueDate ? Date.parse(updated.dueDate) : null,
      updatedAt: Date.now()
    });

    return updated;
  }

  deleteActionItem(id) {
    this.core.assertUnlocked();
    if (!isId(id)) throw fail('INVALID');
    this.store.delete('exec_action', id);
    this.store.delete('todo', id);
    this.store.delete('wf_action_meta', 'todo:' + id);
    return { ok: true, id };
  }

  // -------------------------------------------------------------
  // 3. Department Head Delegation & Accountability Board
  // -------------------------------------------------------------
  listDepartments() {
    return DEPARTMENTS;
  }

  saveDeptTask(data) {
    this.core.assertUnlocked();
    const id = isId(data.id) ? data.id : uuid();
    const dept = DEPARTMENTS.find(d => d.id === data.departmentId) || DEPARTMENTS[0];

    const task = {
      id,
      departmentId: dept.id,
      departmentName: dept.name,
      assigneeName: text(data.assigneeName || dept.defaultLeader, 100),
      title: text(data.title || 'Delegated task', 250),
      description: text(data.description || '', 3000),
      priority: ['critical', 'high', 'medium', 'normal'].includes(data.priority) ? data.priority : 'high',
      status: ['pending', 'in_progress', 'completed', 'blocked'].includes(data.status) ? data.status : 'pending',
      blockerNotes: data.blockerNotes ? text(data.blockerNotes, 500) : null,
      dueDate: data.dueDate || null,
      relatedRoundsId: data.relatedRoundsId ? text(data.relatedRoundsId, 50) : null,
      completedAt: data.status === 'completed' ? Date.now() : null,
      created: data.created || Date.now(),
      updated: Date.now()
    };

    this.store.put('exec_dept_task', id, task);

    // Canonical todo bridge for department delegation
    const canonicalPriority = task.priority === 'critical' ? 'urgent' : task.priority;
    this.saveCanonicalTodo({
      id,
      title: task.title,
      description: task.description || `Delegated to ${task.assigneeName} (${task.departmentName})`,
      owner: task.assigneeName,
      dueAt: task.dueDate ? Date.parse(task.dueDate) : null,
      priority: canonicalPriority,
      status: task.status === 'completed' ? 'completed' : 'pending',
      source: 'delegation'
    });

    this.store.put('wf_action_meta', 'todo:' + id, {
      id: 'todo:' + id,
      owner: task.assigneeName,
      dueAt: task.dueDate ? Date.parse(task.dueDate) : null,
      note: task.description,
      category: 'delegation',
      department: dept.id,
      updatedAt: Date.now()
    });

    return task;
  }

  listDeptTasks(filters = {}) {
    this.core.assertUnlocked();
    let tasks = this.store.list('exec_dept_task') || [];

    // Synchronize status bidirectionally with canonical todo records
    for (const t of tasks) {
      const canonical = this.store.get('todo', t.id);
      if (canonical) {
        if (canonical.status === 'completed' && t.status !== 'completed') {
          t.status = 'completed';
          t.completedAt = canonical.completedAt || Date.now();
        } else if (canonical.status === 'pending' && t.status === 'completed') {
          t.status = 'pending';
          t.completedAt = null;
        }
      }
    }

    if (filters.departmentId) {
      tasks = tasks.filter(t => t.departmentId === filters.departmentId);
    }
    if (filters.status) {
      tasks = tasks.filter(t => t.status === filters.status);
    }
    if (filters.priority) {
      tasks = tasks.filter(t => t.priority === filters.priority);
    }

    return tasks.sort((a, b) => {
      if (a.status === 'completed' && b.status !== 'completed') return 1;
      if (a.status !== 'completed' && b.status === 'completed') return -1;
      if (a.status === 'blocked' && b.status !== 'blocked') return -1;
      if (a.status !== 'blocked' && b.status === 'blocked') return 1;
      if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
      return (b.created || 0) - (a.created || 0);
    });
  }

  getDepartmentStandupSummary() {
    this.core.assertUnlocked();
    const now = Date.now();
    const since24h = now - 86400000;
    const tasks = this.store.list('exec_dept_task') || [];

    const summaryByDept = DEPARTMENTS.map(dept => {
      const deptTasks = tasks.filter(t => t.departmentId === dept.id);
      const open = deptTasks.filter(t => t.status !== 'completed');
      const overdue = open.filter(t => t.dueDate && new Date(t.dueDate).getTime() < now);
      const blocked = open.filter(t => t.status === 'blocked');
      const completedRecent = deptTasks.filter(t => t.status === 'completed' && (t.completedAt || t.updated) >= since24h);

      return {
        department: dept,
        totalOpen: open.length,
        openTasks: open,
        overdueCount: overdue.length,
        overdueTasks: overdue,
        blockedCount: blocked.length,
        blockedTasks: blocked,
        completedRecentCount: completedRecent.length,
        completedRecentTasks: completedRecent
      };
    });

    return {
      generatedAt: now,
      departments: summaryByDept,
      totalOpenTasks: tasks.filter(t => t.status !== 'completed').length,
      totalBlocked: tasks.filter(t => t.status === 'blocked').length,
      totalOverdue: tasks.filter(t => t.status !== 'completed' && t.dueDate && new Date(t.dueDate).getTime() < now).length
    };
  }

  deleteDeptTask(id) {
    this.core.assertUnlocked();
    if (!isId(id)) throw fail('INVALID');
    this.store.delete('exec_dept_task', id);
    this.store.delete('todo', id);
    this.store.delete('wf_action_meta', 'todo:' + id);
    return { ok: true, id };
  }

  // -------------------------------------------------------------
  // 4. Administrator Executive Rounds & Punch List Logger
  // -------------------------------------------------------------
  logRoundsIssue(data) {
    this.core.assertUnlocked();
    const id = isId(data.id) ? data.id : uuid();
    const category = ['maintenance', 'housekeeping', 'nursing', 'safety', 'other'].includes(data.category) ? data.category : 'maintenance';
    const urgency = ['urgent', 'high', 'medium', 'normal'].includes(data.urgency) ? data.urgency : 'high';

    const issue = {
      id,
      location: text(data.location || 'Facility', 100), // e.g. Room 114, East Corridor, Main Dining
      category,
      description: text(data.description || 'Punch list item', 2000),
      urgency,
      status: ['open', 'in_progress', 'resolved'].includes(data.status) ? data.status : 'open',
      assignedDepartmentId: category === 'maintenance' ? 'maintenance' : category === 'housekeeping' ? 'housekeeping' : 'don',
      assignedTo: text(data.assignedTo || '', 100),
      resolutionNotes: data.resolutionNotes ? text(data.resolutionNotes, 1000) : null,
      autoDispatchedTask: Boolean(data.autoDispatchTask !== false),
      dispatchApproved: Boolean(data.approved === true),
      dispatchStatus: data.approved === true ? 'Approved & Dispatched' : 'Internal Ticket (Approval required for external dispatch)',
      resolvedAt: data.status === 'resolved' ? Date.now() : null,
      created: data.created || Date.now(),
      updated: Date.now()
    };

    this.store.put('exec_rounds_issue', id, issue);

    // Canonical todo bridge for rounds issue
    this.saveCanonicalTodo({
      id,
      title: `[Rounds] ${issue.location}: ${issue.description.slice(0, 100)}`,
      description: `Location: ${issue.location}\nUrgency: ${issue.urgency.toUpperCase()}\nDetails: ${issue.description}`,
      owner: issue.assignedDepartmentId === 'maintenance' ? 'Maintenance' : issue.assignedDepartmentId === 'housekeeping' ? 'Housekeeping' : 'Nursing',
      dueAt: issue.urgency === 'urgent' ? (Date.now() + 14400000) : (Date.now() + 86400000),
      priority: issue.urgency === 'urgent' ? 'urgent' : 'normal',
      status: issue.status === 'resolved' ? 'completed' : 'pending',
      source: 'rounds'
    });

    this.store.put('wf_action_meta', 'todo:' + id, {
      id: 'todo:' + id,
      owner: issue.assignedDepartmentId,
      dueAt: issue.urgency === 'urgent' ? (Date.now() + 14400000) : (Date.now() + 86400000),
      note: issue.description,
      category: 'rounds',
      location: issue.location,
      updatedAt: Date.now()
    });

    // If auto-dispatch is enabled, automatically create a department head task
    if (issue.autoDispatchedTask && issue.status !== 'resolved') {
      const deptId = issue.assignedDepartmentId;
      const dept = DEPARTMENTS.find(d => d.id === deptId) || DEPARTMENTS[2];
      this.saveDeptTask({
        id: uuid(),
        departmentId: dept.id,
        assigneeName: dept.defaultLeader,
        title: `[Rounds] ${issue.location}: ${issue.description.slice(0, 100)}`,
        description: `Logged during Administrator Executive Rounds:\nLocation: ${issue.location}\nUrgency: ${issue.urgency.toUpperCase()}\nDetails: ${issue.description}`,
        priority: issue.urgency === 'urgent' ? 'critical' : issue.urgency,
        relatedRoundsId: issue.id,
        dueDate: issue.urgency === 'urgent' ? new Date(Date.now() + 14400000).toISOString() : new Date(Date.now() + 86400000).toISOString() // 4h or 24h
      });
    }

    return issue;
  }

  listRoundsIssues(filters = {}) {
    this.core.assertUnlocked();
    let issues = this.store.list('exec_rounds_issue') || [];

    // Sync status with canonical todo
    for (const issue of issues) {
      const canonical = this.store.get('todo', issue.id);
      if (canonical && canonical.status === 'completed' && issue.status !== 'resolved') {
        issue.status = 'resolved';
        issue.resolvedAt = canonical.completedAt || Date.now();
      }
    }

    if (filters.category) issues = issues.filter(i => i.category === filters.category);
    if (filters.status) issues = issues.filter(i => i.status === filters.status);
    if (filters.urgency) issues = issues.filter(i => i.urgency === filters.urgency);

    return issues.sort((a, b) => {
      if (a.status === 'resolved' && b.status !== 'resolved') return 1;
      if (a.status !== 'resolved' && b.status === 'resolved') return -1;
      const urgMap = { urgent: 0, high: 1, medium: 2, normal: 3 };
      const diff = (urgMap[a.urgency] ?? 3) - (urgMap[b.urgency] ?? 3);
      if (diff !== 0) return diff;
      return (b.created || 0) - (a.created || 0);
    });
  }

  resolveRoundsIssue(id, resolutionNotes) {
    this.core.assertUnlocked();
    if (!isId(id)) throw fail('INVALID');
    const existing = this.store.get('exec_rounds_issue', id);
    if (!existing) throw fail('NOT_FOUND');

    const updated = {
      ...existing,
      status: 'resolved',
      resolutionNotes: text(resolutionNotes || 'Resolved during rounds follow-up', 1000),
      resolvedAt: Date.now(),
      updated: Date.now()
    };
    this.store.put('exec_rounds_issue', id, updated);

    // Sync canonical todo
    this.syncCanonicalTodoStatus(id, 'completed', resolutionNotes);

    // Also close linked department task if exists
    const deptTasks = this.store.list('exec_dept_task') || [];
    const linked = deptTasks.find(t => t.relatedRoundsId === id);
    if (linked && linked.status !== 'completed') {
      this.saveDeptTask({ ...linked, status: 'completed' });
    }

    return updated;
  }

  deleteRoundsIssue(id) {
    this.core.assertUnlocked();
    if (!isId(id)) throw fail('INVALID');
    this.store.delete('exec_rounds_issue', id);
    this.store.delete('todo', id);
    this.store.delete('wf_action_meta', 'todo:' + id);
    return { ok: true, id };
  }

  // -------------------------------------------------------------
  // Admission Room Readiness Board
  // -------------------------------------------------------------
  listRoomReadiness() {
    this.core.assertUnlocked();
    const rooms = this.store.list('exec_room_readiness') || [];
    if (!rooms.length) {
      // Seed initial sample rooms so the board is ready to use immediately
      const defaultRooms = [
        { id: 'room_104b', roomNumber: '104-B', unit: 'West Wing', stage: 'discharged', targetAdmitTime: null, assignedHousekeeper: 'M. Santos', notes: 'Discharged 10 AM; needs full terminal clean' },
        { id: 'room_212a', roomNumber: '212-A', unit: 'North Wing', stage: 'deep_cleaning', targetAdmitTime: 'Today 3:30 PM', assignedHousekeeper: 'R. Diaz', notes: 'Bed stripped, sanitizing bathroom' },
        { id: 'room_305', roomNumber: '305', unit: 'Rehab Wing (Private)', stage: 'maintenance_check', targetAdmitTime: 'Today 2:00 PM', assignedHousekeeper: 'M. Santos', notes: 'Waiting for TV remote replacement' },
        { id: 'room_118b', roomNumber: '118-B', unit: 'West Wing', stage: 'ready_for_admit', targetAdmitTime: 'Today 4:00 PM', assignedHousekeeper: 'L. Gomez', notes: 'Bed made, welcome packet placed' }
      ];
      defaultRooms.forEach(r => this.updateRoomReadiness(r.id, r));
      return this.store.list('exec_room_readiness');
    }
    return rooms.sort((a, b) => a.roomNumber.localeCompare(b.roomNumber));
  }

  updateRoomReadiness(id, data) {
    this.core.assertUnlocked();
    const key = isId(id) ? id : text(id, 50);
    const existing = this.store.get('exec_room_readiness', key) || {};

    const room = {
      id: key,
      roomNumber: text(data.roomNumber || existing.roomNumber || 'Room', 20),
      unit: text(data.unit || existing.unit || 'General', 50),
      stage: ROOM_STAGES.some(s => s.id === data.stage) ? data.stage : (existing.stage || 'discharged'),
      targetAdmitTime: data.targetAdmitTime !== undefined ? (data.targetAdmitTime ? text(data.targetAdmitTime, 50) : null) : existing.targetAdmitTime,
      assignedHousekeeper: text(data.assignedHousekeeper || existing.assignedHousekeeper || '', 100),
      notes: text(data.notes || existing.notes || '', 1000),
      updated: Date.now()
    };

    this.store.put('exec_room_readiness', key, room);
    return room;
  }

  // -------------------------------------------------------------
  // 5. Staff Supervision, Attendance & HR Milestones
  // -------------------------------------------------------------
  logAttendance(data) {
    this.core.assertUnlocked();
    const id = isId(data.id) ? data.id : uuid();
    const type = ['tardy', 'call_off', 'no_call_no_show', 'early_departure'].includes(data.type) ? data.type : 'call_off';
    const isWeekend = Boolean(data.isWeekend);

    const record = {
      id,
      employeeId: text(data.employeeId || '', 50),
      employeeName: text(data.employeeName || 'Staff Member', 100),
      role: text(data.role || 'CNA', 50), // CNA, LPN, RN, Dietary, etc.
      department: text(data.department || 'Nursing', 50),
      shift: text(data.shift || '3-11 Evening', 30),
      date: data.date || new Date().toISOString().slice(0, 10),
      type,
      isWeekend,
      excused: Boolean(data.excused),
      points: type === 'no_call_no_show' ? 3.0 : type === 'call_off' ? (isWeekend ? 2.0 : 1.0) : 0.5,
      reason: text(data.reason || '', 500),
      created: Date.now()
    };

    this.store.put('exec_attendance', id, record);
    return record;
  }

  getEmployeeAttendanceHistory(employeeName) {
    this.core.assertUnlocked();
    const records = (this.store.list('exec_attendance') || []).filter(r =>
      r.employeeName.toLowerCase() === employeeName.toLowerCase()
    );

    const now = Date.now();
    const sixtyDaysAgo = now - (60 * 86400000);
    const recentRecords = records.filter(r => new Date(r.date).getTime() >= sixtyDaysAgo);

    const totalPoints = recentRecords.reduce((sum, r) => sum + (r.excused ? 0 : r.points), 0);
    const weekendCallOffs = recentRecords.filter(r => r.type === 'call_off' && r.isWeekend && !r.excused).length;

    return {
      employeeName,
      totalPoints60d: totalPoints,
      weekendCallOffs60d: weekendCallOffs,
      thresholdWarning: totalPoints >= 5.0 || weekendCallOffs >= 3,
      thresholdMessage: weekendCallOffs >= 3 ? 'Exceeded 3 unexcused weekend call-offs in 60 days (Disciplinary Action Threshold)' :
                        totalPoints >= 5.0 ? 'Exceeded 5 attendance points in 60 days (Written Warning Threshold)' : null,
      history: records.sort((a, b) => new Date(b.date) - new Date(a.date))
    };
  }

  listAttendanceAlerts() {
    this.core.assertUnlocked();
    const records = this.store.list('exec_attendance') || [];
    const byEmployee = new Map();

    records.forEach(r => {
      const name = r.employeeName;
      if (!byEmployee.has(name)) byEmployee.set(name, []);
      byEmployee.get(name).push(r);
    });

    const alerts = [];
    for (const [name, empRecords] of byEmployee.entries()) {
      const history = this.getEmployeeAttendanceHistory(name);
      if (history.thresholdWarning) {
        alerts.push({
          employeeName: name,
          role: empRecords[0]?.role || 'Staff',
          department: empRecords[0]?.department || 'Nursing',
          totalPoints: history.totalPoints60d,
          weekendCallOffs: history.weekendCallOffs60d,
          message: history.thresholdMessage,
          latestOccurrence: empRecords[0]?.date
        });
      }
    }
    return alerts;
  }

  // HR 30 / 60 / 90-Day New Hire Milestones
  saveNewHireMilestone(data) {
    this.core.assertUnlocked();
    const id = isId(data.id) ? data.id : uuid();
    const hireDate = data.hireDate || new Date().toISOString().slice(0, 10);
    const hireTime = new Date(hireDate).getTime();

    const milestone = {
      id,
      employeeName: text(data.employeeName || 'New Hire', 100),
      role: text(data.role || 'CNA', 50),
      department: text(data.department || 'Nursing', 50),
      hireDate,
      day30Date: new Date(hireTime + (30 * 86400000)).toISOString().slice(0, 10),
      day30Status: data.day30Status || 'pending', // pending, completed, overdue
      day60Date: new Date(hireTime + (60 * 86400000)).toISOString().slice(0, 10),
      day60Status: data.day60Status || 'pending',
      day90Date: new Date(hireTime + (90 * 86400000)).toISOString().slice(0, 10),
      day90Status: data.day90Status || 'pending',
      notes: text(data.notes || '', 1000),
      updated: Date.now()
    };

    this.store.put('exec_hr_milestone', id, milestone);
    return milestone;
  }

  listNewHireMilestones() {
    this.core.assertUnlocked();
    const list = this.store.list('exec_hr_milestone') || [];
    if (!list.length) {
      // Seed initial new hire examples
      const seeds = [
        { employeeName: 'Brittany Davis', role: 'CNA', department: 'Nursing', hireDate: new Date(Date.now() - (24 * 86400000)).toISOString().slice(0, 10), notes: 'Assigned to preceptor Sarah J.' },
        { employeeName: 'Tyler Morrison', role: 'Dietary Aide', department: 'Dietary', hireDate: new Date(Date.now() - (55 * 86400000)).toISOString().slice(0, 10), day30Status: 'completed', notes: '30-day check went well' },
        { employeeName: 'Jessica Walsh, LPN', role: 'Staff Nurse', department: 'Nursing', hireDate: new Date(Date.now() - (82 * 86400000)).toISOString().slice(0, 10), day30Status: 'completed', day60Status: 'completed', notes: '90-day retention review due next week' }
      ];
      seeds.forEach(s => this.saveNewHireMilestone(s));
      return this.store.list('exec_hr_milestone');
    }
    return list.sort((a, b) => new Date(b.hireDate) - new Date(a.hireDate));
  }

  updateNewHireMilestone(id, updates) {
    this.core.assertUnlocked();
    if (!isId(id)) throw fail('INVALID');
    const existing = this.store.get('exec_hr_milestone', id);
    if (!existing) throw fail('NOT_FOUND');

    const updated = {
      ...existing,
      day30Status: updates.day30Status || existing.day30Status,
      day60Status: updates.day60Status || existing.day60Status,
      day90Status: updates.day90Status || existing.day90Status,
      notes: updates.notes !== undefined ? text(updates.notes, 1000) : existing.notes,
      updated: Date.now()
    };

    this.store.put('exec_hr_milestone', id, updated);
    return updated;
  }

  // Coaching & Disciplinary Trail
  saveCoachingRecord(data) {
    this.core.assertUnlocked();
    const id = isId(data.id) ? data.id : uuid();
    const type = ['verbal', 'written', 'final', 'commendation'].includes(data.type) ? data.type : 'verbal';

    const record = {
      id,
      employeeName: text(data.employeeName || 'Staff Member', 100),
      role: text(data.role || 'Staff', 50),
      department: text(data.department || 'Nursing', 50),
      date: data.date || new Date().toISOString().slice(0, 10),
      type,
      topic: text(data.topic || 'Performance Discussion', 150),
      details: text(data.details || '', 3000),
      actionPlan: text(data.actionPlan || '', 1500),
      supervisorName: text(data.supervisorName || 'Facility Administrator', 100),
      followUpDate: data.followUpDate || null,
      created: Date.now()
    };

    this.store.put('exec_coaching', id, record);
    return record;
  }

  listCoachingRecords(employeeName = null) {
    this.core.assertUnlocked();
    let records = this.store.list('exec_coaching') || [];
    if (employeeName) {
      records = records.filter(r => r.employeeName.toLowerCase().includes(employeeName.toLowerCase()));
    }
    return records.sort((a, b) => new Date(b.date) - new Date(a.date));
  }
}

function dispatch(core, op, data) {
  const engine = new ExecutiveDeskEngine(core);
  switch (op) {
    // Daily Rhythm
    case 'execRhythmGet': return engine.getDailyRhythm(data?.date);
    case 'execRhythmSave': return engine.saveDailyRhythm(data || {});
    case 'execEndOfDayAudit': return engine.getEndOfDayAudit();

    // Action Items / Inbound Comms
    case 'execActionCapture': return engine.captureActionItem(data || {});
    case 'execActionList': return engine.listActionItems(data || {});
    case 'execActionUpdate': return engine.updateActionItem(data?.id, data || {});
    case 'execActionDelete': return engine.deleteActionItem(data?.id);

    // Department Head Delegation
    case 'execDeptList': return engine.listDepartments();
    case 'execDeptTaskSave': return engine.saveDeptTask(data || {});
    case 'execDeptTaskList': return engine.listDeptTasks(data || {});
    case 'execDeptStandupSummary': return engine.getDepartmentStandupSummary();
    case 'execDeptTaskDelete': return engine.deleteDeptTask(data?.id);

    // Rounds & Punch List
    case 'execRoundsLog': return engine.logRoundsIssue(data || {});
    case 'execRoundsList': return engine.listRoundsIssues(data || {});
    case 'execRoundsResolve': return engine.resolveRoundsIssue(data?.id, data?.resolutionNotes);
    case 'execRoundsDelete': return engine.deleteRoundsIssue(data?.id);

    // Room Readiness
    case 'execRoomReadinessList': return engine.listRoomReadiness();
    case 'execRoomReadinessUpdate': return engine.updateRoomReadiness(data?.id, data || {});

    // Attendance & HR Milestones
    case 'execAttendanceLog': return engine.logAttendance(data || {});
    case 'execAttendanceHistory': return engine.getEmployeeAttendanceHistory(data?.employeeName);
    case 'execAttendanceAlerts': return engine.listAttendanceAlerts();
    case 'execNewHireList': return engine.listNewHireMilestones();
    case 'execNewHireSave': return engine.saveNewHireMilestone(data || {});
    case 'execNewHireUpdate': return engine.updateNewHireMilestone(data?.id, data || {});
    case 'execCoachingSave': return engine.saveCoachingRecord(data || {});
    case 'execCoachingList': return engine.listCoachingRecords(data?.employeeName);

    default:
      throw fail('INVALID');
  }
}

module.exports = {
  ExecutiveDeskEngine,
  DEPARTMENTS,
  ROOM_STAGES,
  dispatch
};
