"use strict";
const { fail } = require("../security.cjs");
const { signature, clean } = require("./actions.cjs");
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
  const project = data.projectId
    ? core.store.get("project", data.projectId)
    : null;
  if (data.projectId && !project) throw fail("INVALID");
  const ids = data.fileId ? [data.fileId] : project?.fileIds;
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
    coverage.push({
      id: f.id,
      name: f.name,
      updated: f.updated,
      characters: (f.text || "").length,
      sections: parts.length,
      pages: new Set(parts.map((p) => p.page).filter(Boolean)).size,
      searchable: parts.length > 0,
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
module.exports = { sections, selectedFiles, search, link };
