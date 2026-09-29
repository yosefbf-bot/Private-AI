"use strict";
const { uuid, fail } = require("../security.cjs");
const { signature, clean } = require("./actions.cjs");
function saveMapping(snf, data) {
  const old = data.id ? snf.store.get("wf_mapping", data.id) : null;
  if (data.id && !old) throw fail("INVALID");
  if (old && data.revision !== old.revision) throw fail("REVIEW_CHANGED");
  if (
    !clean(data.name, 100) ||
    !clean(data.reviewer, 100) ||
    !Array.isArray(data.headers) ||
    !data.headers.length ||
    data.headers.length > 200 ||
    new Set(data.headers).size !== data.headers.length ||
    !data.headers.every(
      (h) => typeof h === "string" && h.length > 0 && h.length <= 200,
    )
  )
    throw fail("INVALID");
  if (
    !Object.keys(require("../snf/import/batch-manager.cjs").PARSERS).includes(
      data.type,
    )
  )
    throw fail("INVALID");
  const mapping = Object.fromEntries(
    data.headers.map((h) => [h, clean(data.mapping?.[h] || h, 200)]),
  );
  if (new Set(Object.values(mapping)).size !== data.headers.length)
    throw fail("INVALID");
  const row = {
    id: old?.id || uuid(),
    name: clean(data.name, 100),
    type: data.type,
    headers: data.headers,
    mapping,
    reviewer: clean(data.reviewer, 100),
    revision: (old?.revision || 0) + 1,
    updatedAt: Date.now(),
  };
  row.schema = signature({ type: row.type, headers: row.headers });
  snf.store.transaction(() => {
    snf.store.put("wf_mapping_revision", row.id + ":" + row.revision, row);
    snf.store.put("wf_mapping", row.id, row);
  });
  return row;
}
function mappedPreview(snf, data) {
  const p = snf.store.get("wf_mapping", data.id);
  if (
    !p ||
    data.revision !== p.revision ||
    signature({ type: data.type, headers: data.headers }) !== p.schema
  )
    throw fail("REVIEW_CHANGED");
  if (
    !Array.isArray(data.rows) ||
    data.rows.length > 10000 ||
    !clean(data.reviewer, 100)
  )
    throw fail("INVALID");
  if (
    data.rows.some(
      (r) =>
        !r ||
        signature(Object.keys(r).sort()) !== signature([...p.headers].sort()),
    )
  )
    throw fail("INVALID");
  const rows = data.rows.map((r) =>
    Object.fromEntries(
      p.headers.map((h) => [
        p.mapping[h],
        p.mapping[h] === "prn" ? /^(true|yes|1)$/i.test(String(r[h])) : r[h],
      ]),
    ),
  );
  const report = {
    type: p.type,
    date: data.date,
    rows,
    filename: clean(data.filename, 200),
  };
  const validation = require("../snf/import/validation.cjs").validate(
    report,
    p.type,
    snf.store,
  );
  return {
    profile: p,
    report,
    validation,
    token: signature({ profile: p, report, validation }),
  };
}
async function mappedImport(snf, data) {
  const checked = mappedPreview(snf, data),
    p = checked.profile;
  if (data.previewToken && data.previewToken !== checked.token)
    throw fail("REVIEW_CHANGED");
  const result = await snf.ingestReports(
    [checked.report],
    clean(data.reviewer, 100),
  );
  // Preserve the exact reviewed mapping as provenance, separately from parser source hashes.
  const batchId = result.batch?.id || result.batchId;
  if (batchId) {
    const b = snf.store.get("snf_import_batch", batchId);
    if (b) {
      b.mapping = {
        id: p.id,
        revision: p.revision,
        schema: p.schema,
        reviewer: p.reviewer,
      };
      snf.store.put("snf_import_batch", b.id, b);
    }
  }
  return result;
}
const number = (v, integer = false) => {
  if (
    !['string','number'].includes(typeof v) ||
    (typeof v === 'string' && !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(v.trim())) ||
    v === "" ||
    v == null ||
    !Number.isFinite(Number(v)) ||
    Number(v) < 0 ||
    (integer && !Number.isSafeInteger(Number(v)))
  )
    throw fail("INVALID");
  return Number(v);
};
function metricPreview(snf, data) {
  if (
    !["staffing", "census"].includes(data.type) ||
    !Array.isArray(data.rows) ||
    !data.rows.length ||
    data.rows.length > 10000
  )
    throw fail("INVALID");
  const accepted = [],
    rejected = [],
    seen = new Set();
  data.rows.forEach((r, i) => {
    try {
      const date = clean(r.date, 10),
        unit = clean(r.unit, 100);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        new Date(date).toISOString().slice(0, 10) !== date ||
        date > new Date().toISOString().slice(0, 10) ||
        !unit
      )
        throw fail("INVALID");
      let row;
      if (data.type === "staffing") {
        const shift = clean(r.shift, 60),
          role = clean(r.role, 10).toUpperCase(),
          hours = number(r.hours);
        if (!shift || !["RN", "LPN", "CNA"].includes(role) || hours > 10000)
          throw fail("INVALID");
        row = { date, unit, shift, role, hours };
      } else {
        const census = number(r.census, true),
          capacity =
            r.capacity === "" || r.capacity == null
              ? null
              : number(r.capacity, true);
        if (capacity !== null && census > capacity) throw fail("INVALID");
        row = { date, unit, census, capacity };
        for (const key of ["medicare", "medicaid", "other"])
          row[key] =
            r[key] === "" || r[key] == null ? null : number(r[key], true);
        if (
          ["medicare", "medicaid", "other"].every((k) => row[k] !== null) &&
          row.medicare + row.medicaid + row.other !== census
        )
          throw fail("INVALID");
        if (
          ["medicare", "medicaid", "other"].reduce(
            (n, k) => n + (row[k] || 0),
            0,
          ) > census
        )
          throw fail("INVALID");
      }
      const key = signature(
        data.type === "staffing"
          ? [date, unit, row.shift, row.role]
          : [date, unit],
      );
      if (seen.has(key)) throw fail("INVALID");
      seen.add(key);
      accepted.push(row);
    } catch {
      rejected.push({
        row: i + 2,
        reason:
          "Invalid date, unit, numeric value, payer total, or duplicate date/unit/shift/role.",
      });
    }
  });
  const normalized = {
    type: data.type,
    rows: accepted,
    completeDay: data.completeDay === true,
    filename: clean(data.filename, 200),
    reviewer: clean(data.reviewer, 100),
  };
  return { ...normalized, rejected, token: signature(normalized) };
}
function metricImport(snf, data) {
  const p = metricPreview(snf, data);
  if (p.rejected.length || !p.reviewer) throw fail("INVALID");
  if (data.token !== p.token) throw fail("REVIEW_CHANGED");
  const digest = signature({
    type: p.type,
    rows: p.rows,
    completeDay: p.completeDay,
  });
  const prior = snf.store
    .list("wf_metric_import")
    .find((r) => r.digest === digest);
  if (prior) return { ...prior, duplicate: true };
  const row = {
    ...p,
    id: uuid(),
    digest,
    sequence:
      snf.store
        .list("wf_metric_import")
        .reduce((n, r) => Math.max(n, r.sequence || 0), 0) + 1,
    importedAt: Date.now(),
  };
  delete row.token;
  delete row.rejected;
  snf.store.put("wf_metric_import", row.id, row);
  return row;
}
function metrics(snf) {
  const batches = snf.store
      .list("wf_metric_import")
      .sort(
        (a, b) =>
          (a.sequence || 0) - (b.sequence || 0) || a.importedAt - b.importedAt,
      ),
    days = new Map();
  // Each import replaces only supplied date/unit snapshots, not other units or days.
  for (const b of batches) {
    const groups = new Map();
    for (const row of b.rows) {
      const key = signature([row.date, row.unit]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    for (const [key, rows] of groups) {
      const d = days.get(key) || { date: rows[0].date, unit: rows[0].unit };
      d[b.type] = {
        rows,
        completeDay: b.completeDay,
        source: {
          id: b.id,
          filename: b.filename,
          importedAt: b.importedAt,
          reviewer: b.reviewer,
        },
      };
      days.set(key, d);
    }
  }
  return {
    batches: batches.map(({ rows, ...b }) => ({ ...b, rowCount: rows.length })),
    days: [...days.values()]
      .map((d) => {
        const census = d.census?.rows[0] || null,
          totalHours = d.staffing
            ? d.staffing.rows.reduce((n, r) => n + r.hours, 0)
            : null;
        return {
          ...d,
          census: census ? { ...census, source: d.census.source } : null,
          totalHours,
          hppd:
            d.staffing?.completeDay && census?.census > 0
              ? totalHours / census.census
              : null,
          notice: d.staffing?.completeDay
            ? "Imported full-day direct-care hours / imported census; not a regulatory compliance score."
            : "Full-day completeness not confirmed; HPPD unavailable.",
        };
      })
      .sort(
        (a, b) => b.date.localeCompare(a.date) || a.unit.localeCompare(b.unit),
      ),
  };
}
module.exports = {
  saveMapping,
  mappedPreview,
  mappedImport,
  metricPreview,
  metricImport,
  metrics,
};
