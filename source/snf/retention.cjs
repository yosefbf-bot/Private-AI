'use strict';

// Preserve chronology and evidence independently of working-file retention.
function retainedEvidence(store, cutoff) {
  const evaluations = new Set(), rows = new Set(), reports = new Set(), batches = new Set(), residents = new Set();
  for (const alert of store.list('snf_alert')) {
    if (alert.residentId) residents.add(alert.residentId);
    for (const id of [...(alert.evaluationHistory || []), alert.evaluationId].filter(Boolean)) evaluations.add(id);
  }
  // Non-alert evaluations and normalized source facts are also historical data.
  for (const evaluation of store.list('snf_rule_evaluation')) evaluations.add(evaluation.id);
  const kinds = ['snf_resident','snf_med_order','snf_med_change','snf_emar_exception','snf_diagnosis',
    'snf_behavior','snf_fall','snf_infection','snf_wound','snf_lab','snf_clinical24','snf_progress_note',
    'snf_gdr','snf_admission','snf_transfer','snf_psych_review','snf_pharmacist_review','snf_weight','snf_care_plan'];
  for (const kind of kinds) for (const record of store.list(kind)) {
    const source = record.provenance;
    if (source?.rowId) rows.add(source.rowId);
    if (source?.reportId) reports.add(source.reportId);
    if (source?.batchId) batches.add(source.batchId);
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
