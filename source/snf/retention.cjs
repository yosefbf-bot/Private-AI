'use strict';

// Keep immutable evidence for every retained alert, including snoozed alerts.
function retainedEvidence(store, cutoff) {
  const evaluations = new Set(), rows = new Set(), reports = new Set(), batches = new Set(), residents = new Set();
  for (const alert of store.list('snf_alert')) {
    const closed = ['resolved', 'dismissed'].includes(alert.status);
    if (closed && (alert.resolvedAt || alert.updated || alert.timestamp || Infinity) < cutoff) continue;
    if (alert.residentId) residents.add(alert.residentId);
    for (const id of [...(alert.evaluationHistory || []), alert.evaluationId].filter(Boolean)) evaluations.add(id);
  }
  for (const id of evaluations) {
    const evaluation = store.get('snf_rule_evaluation', id);
    for (const source of evaluation?.sources || []) {
      if (source.rowId) rows.add(source.rowId);
      if (source.reportId) reports.add(source.reportId);
      if (source.batchId) batches.add(source.batchId);
    }
  }
  return {evaluations, rows, reports, batches, residents};
}

function pruneEvidence(store, cutoff, keep) {
  const reportTimes = new Map(store.list('snf_import_report').map(r => [r.id, r.importTime]));
  let removed = 0;
  const policies = [
    ['snf_rule_evaluation', keep.evaluations, r => r.generationTime],
    ['snf_import_row', keep.rows, r => r.importTimestamp || reportTimes.get(r.reportId) || r.reportDate],
    ['snf_import_report', keep.reports, r => r.importTime],
    ['snf_import_batch', keep.batches, r => r.importTime],
  ];
  for (const [kind, ids, timestamp] of policies) {
    for (const record of store.list(kind)) {
      const time = timestamp(record);
      if (!ids.has(record.id) && Number.isFinite(time) && time < cutoff) {
        store.delete(kind, record.id);
        removed++;
      }
    }
  }
  return removed;
}

module.exports = {retainedEvidence, pruneEvidence};
