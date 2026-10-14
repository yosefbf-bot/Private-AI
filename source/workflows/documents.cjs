"use strict";
const { fail, isId } = require("../security.cjs");
const { signature, clean } = require("./actions.cjs");
const hashString = (value) => require("node:crypto").createHash("sha256").update(value).digest("hex");
const REVIEW_FIELDS = ["sourceDate", "effectiveDate", "version", "reviewDate", "reviewDue", "reviewer", "approvedAttestation"];
const REVIEW_NOTICE = "Dates and approval are owner-recorded attestations, not independent proof of source currency, regulatory compliance or facility approval. File upload/update time does not establish an effective date.";
// On-demand index: no extra plaintext database or retained duplicate of a deleted file.
function sections(file) {
  const text = file.text || "",
    markers = [...text.matchAll(/\[Page (\d+)\]/g)],
    rows = [];
  const add = (start, end, page) => {
    for (let at = start; at < end; at += 3000)
      rows.push({
        id: rows.length + 1,
        page,
        start: at,
        end: Math.min(end, at + 3000),
        text: text.slice(at, Math.min(end, at + 3000)),
      });
  };
  if (markers.length) {
    if (markers[0].index) add(0, markers[0].index, null);
    markers.forEach((m, i) =>
      add(m.index, markers[i + 1]?.index ?? text.length, Number(m[1])),
    );
  } else add(0, text.length, null);
  return rows;
}
function* selectedFiles(core, data = {}) {
  core.assertUnlocked();
  for (const value of [data.projectId,data.fileId])
    if (value!==undefined && value!==null && value!=="" && !isId(value)) throw fail("INVALID");
  const project = data.projectId
    ? core.store.get("project", data.projectId)
    : null;
  if (data.projectId && !project) throw fail("INVALID");
  const members=project && Array.isArray(project.fileIds) ? project.fileIds : [];
  if (project && data.fileId && !members.includes(data.fileId)) throw fail("POLICY");
  // Legacy projects without known links have no selected files; absence of
  // membership must never widen an explicitly selected project to the whole Library.
  const ids = data.fileId ? [data.fileId] : project ? members : null;
  // Select encrypted metadata before decrypting content. Large collections must
  // not hold every original attachment/base64 payload in memory simultaneously.
  if(core.store.summaries){for(const meta of core.store.summaries('file'))if(!ids||ids.includes(meta.id)){const f=core.store.get('file',meta.id);if(f)yield f;}}
  else for(const f of core.store.list('file'))if(!ids||ids.includes(f.id))yield f;
}
function search(core, data = {}) {
  const terms = clean(data.query, 200)
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean),
    results = [],
    coverage = [];
  let totalMatches=0;
  const order=(a,b)=>b.score-a.score||a.name.localeCompare(b.name)||a.id-b.id;
  for (const f of selectedFiles(core,data)) {
    const parts = sections(f);
    const revision=signature(f.text||'');
    const freshness=reviewState(f);
    coverage.push({
      id: f.id,
      name: f.name,
      updated: f.updated,
      characters: (f.text || "").length,
      sections: parts.length,
      pages: new Set(parts.map((p) => p.page).filter(Boolean)).size,
      searchable: parts.length > 0,
      freshness,
    });
    for (const part of parts) {
      const lower = part.text.toLowerCase(),
        score = terms.reduce((n, t) => n + (lower.includes(t) ? 1 : 0), 0);
      if (terms.length && score === terms.length){
        totalMatches++;
        results.push({
          fileId: f.id,
          name: f.name,
          updated: f.updated,
          revision,
          freshness,
          ...part,
          score,
          citation: `${f.name} — ${part.page ? "page " + part.page + ", " : ""}section ${part.id}, characters ${part.start + 1}–${part.end}`,
        });
        // Retain only the displayed best sections while counting all matches.
        results.sort(order);if(results.length>50)results.pop();
      }
    }
  }
  results.sort(order);
  return {
    coverage,
    results: results.slice(0, 50),
    totalMatches,
    notice:
      "Search covers extracted text only. Set up local OCR for image-only pages; verify machine text against originals. Matching sections are not whole-document analysis.",
  };
}
function document(core, data = {}) {
  core.assertUnlocked();
  if (!isId(data.fileId)) throw fail("INVALID");
  const file = [...selectedFiles(core, data)][0];
  if (!file) throw fail("NOT_FOUND");
  return file;
}
// Bind review to originals and extracted text, not to mutable review metadata.
// Stream string hashes avoid serializing another copy of a large base64 original.
function sourceRevision(file) {
  return signature({id:file.id,name:file.name,updated:file.updated,hipaa:file.hipaa,
    ext:file.ext||null,mime:file.mime||null,text:hashString(file.text||""),
    original:typeof file.bytes === "string" ? hashString(file.bytes) : signature(file.bytes ?? null)});
}
function calendarDate(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) throw fail("INVALID");
  const time=Date.parse(value+"T00:00:00Z");
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0,10) !== value) throw fail("INVALID");
  return value;
}
function localCalendarDay(now = Date.now()) {
  const date=new Date(now);
  return [String(date.getFullYear()).padStart(4,"0"),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
}
function reviewMetadata(saved = {}) {
  const result={};
  for (const field of REVIEW_FIELDS) result[field]=saved[field] ?? (field === "approvedAttestation" ? false : null);
  return result;
}
function reviewState(file, now = Date.now(), revision = null) {
  const saved=file.referenceReview,metadata=reviewMetadata(saved || {}),today=localCalendarDay(now);
  let status="unknown";
  if (saved && saved.sourceRevision !== (revision || sourceRevision(file))) status="source-changed";
  else if (metadata.reviewDue && metadata.reviewDue < today) status="review-overdue";
  else if (metadata.effectiveDate && metadata.effectiveDate > today) status="not-yet-effective";
  else if (metadata.reviewDate && metadata.reviewer) status="review-recorded";
  return {status,currency:"unknown",requiresReview:status!=="review-recorded",notice:REVIEW_NOTICE};
}
function review(core, data = {}) {
  const file=document(core,data),current=sourceRevision(file),metadata=reviewMetadata(file.referenceReview || {});
  return {fileId:file.id,name:file.name,sourceRevision:current,
    revision:signature({sourceRevision:current,metadata:file.referenceReview || null}),metadata,
    freshness:reviewState(file,Date.now(),current),
    approval:{attested:file.referenceReview?.sourceRevision===current && metadata.approvedAttestation===true,proof:false}};
}
function saveReview(core, data = {}) {
  const current=review(core,data);
  if (typeof data.revision !== "string" || data.revision!==current.revision) throw fail("REVIEW_CHANGED");
  const input=data.metadata;
  if (!input || typeof input!=="object" || Array.isArray(input)) throw fail("INVALID");
  const metadata={};
  for (const field of ["sourceDate","effectiveDate","reviewDate","reviewDue"]) metadata[field]=calendarDate(input[field]);
  for (const [field,max] of [["version",150],["reviewer",120]]) {
    const value=input[field];
    if (value!==undefined && value!==null && (typeof value!=="string" || value.length>max || /[\u0000-\u001f\u007f]/.test(value))) throw fail("INVALID");
    metadata[field]=value?.trim() || null;
  }
  if (input.approvedAttestation!==undefined && typeof input.approvedAttestation!=="boolean") throw fail("INVALID");
  metadata.approvedAttestation=input.approvedAttestation===true;
  const today=localCalendarDay();
  if ((metadata.reviewDate && metadata.reviewDate>today) ||
      (metadata.reviewDate && metadata.reviewDue && metadata.reviewDue<metadata.reviewDate) ||
      (metadata.approvedAttestation && (!metadata.reviewer || !metadata.reviewDate))) throw fail("INVALID");
  const file=document(core,data);
  core.store.put("file",file.id,{...file,referenceReview:{...metadata,sourceRevision:current.sourceRevision}});
  return review(core,data);
}
function link(core, data) {
  const p = core.store.get("project", data.projectId);
  if (
    !p ||
    !Array.isArray(data.fileIds) ||
    data.fileIds.length > 200 ||
    data.fileIds.some((id) => !core.store.get("file", id))
  )
    throw fail("INVALID");
  p.fileIds = [...new Set(data.fileIds)];
  p.updated = Date.now();
  core.store.put("project", p.id, p);
  return p;
}
module.exports = { sections, selectedFiles, search, link, document, sourceRevision, calendarDate, localCalendarDay, review, saveReview, reviewState, REVIEW_NOTICE };
