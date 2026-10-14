import { parseCSV } from "./snf/import-center.mjs";
export function createWorkflowUI({
  api,
  esc,
  toast,
  form,
  field,
  textarea,
  select,
  renderPage,
  refresh,
}) {
  let filter = "open",
    query = "";
  let activeSearch=null,renderRevision=0;
  const date = (v) => (v ? new Date(v).toLocaleString() : "Not recorded");
  const dateInput = (v) =>
    v
      ? new Date(v - new Date(v).getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16)
      : "";
  const parseDate = (v) => (v ? new Date(v).getTime() : null);
  const nav = "";
  const fileChecks = (files, ids = []) =>
    files
      .map(
        (f) =>
          `<label class="check"><input type="checkbox" name="file_${esc(f.id)}" ${Array.isArray(ids) && ids.includes(f.id) ? "checked" : ""}>${esc(f.name)}</label>`,
      )
      .join("");
  const fileIds = (r) =>
    Object.keys(r)
      .filter((k) => k.startsWith("file_"))
      .map((k) => k.slice(5));
  return {
    stop(){renderRevision++;const id=activeSearch;activeSearch=null;if(id)api('stop',{id}).catch(()=>{});},
    async render(container, page = "actions", options = {}) {
      this.stop();const revision=renderRevision;
      const state = await api("workflowSummary"),
        restricted = state.demo || state.developmentMode;
      if(revision!==renderRevision)return;
      container.innerHTML = `<div class="page workflow-page">${state.demo ? '<p class="error-note">DEMO DATA — NOT FOR CLINICAL USE</p>' : ""}${nav}<div id="workflow-body"></div></div>`;
      const body = container.querySelector("#workflow-body");
      const listen = (selector, fn) =>
        container.querySelectorAll(selector).forEach((el) =>
          el.addEventListener("click", async () => {
            el.disabled = true;
            try {
              await fn(el);
            } catch (e) {
              toast(e.message);
            } finally {
              el.disabled = false;
            }
          }),
        );
      const reload = () => this.render(container, page, options);
      if (page === "actions") {
        const changes = state.changes;
        body.innerHTML = `<h1>Action Center</h1><p>Assignments from alerts, meetings, follow-ups and SBAR callbacks. Related items stay visible; linked meeting tasks appear once. Clinical closure stays in its source workflow.</p><p>Last reviewed: ${esc(date(changes.reviewedAt))}. First review establishes a baseline.</p><label>Show<select id="wf-filter">${[
          ["open", "Open"],
          ["changed", "New / changed / resolved"],
          ["overdue", "Overdue"],
          ["all", "All including closed"],
        ]
          .map(
            ([v, n]) =>
              `<option value="${v}" ${filter === v ? "selected" : ""}>${n}</option>`,
          )
          .join(
            "",
          )}</select></label><label>Find title, resident or owner<input id="wf-query" type="search" value="${esc(query)}"></label><button id="wf-reviewed">Mark current snapshot reviewed</button><div id="wf-items"></div>${changes.unavailable.length ? `<p>${changes.unavailable.length} prior sources are unavailable. They were not assumed resolved.</p>` : ""}`;
        const draw = () => {
          const rows = changes.items
            .filter(
              (r) =>
                filter === "all" ||
                (filter === "changed" &&
                  ["new", "changed", "resolved", "baseline"].includes(
                    r.change,
                  )) ||
                (filter === "overdue" && r.overdue) ||
                (filter === "open" && !r.closed),
            )
            .filter((r) =>
              [r.title, r.owner, r.residentName]
                .join(" ")
                .toLowerCase()
                .includes(query.toLowerCase()),
            );
          const groups = new Map();
          for (const r of rows) {
            const key = r.residentId || r.kind;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(r);
          }
          container.querySelector("#wf-items").innerHTML =
            [...groups.values()]
              .map(
                (group) =>
                  `<section class="card"><h2>${esc(group[0].residentName || group[0].kind)}</h2>${group.map((r) => `<article class="section"><h3>${esc(r.title)}</h3><p>${esc(r.status)} · ${esc(r.change)} ${r.overdue ? "· OVERDUE" : ""} · Owner: ${esc(r.owner || "Unassigned")} · Due: ${esc(date(r.dueAt))}</p><p>${esc(r.note)}</p><button data-edit="${esc(r.key)}">Assign / update</button> <button data-source="${esc(r.key)}">Source workflow</button> <button data-packet="${esc(r.key)}">Evidence packet</button> <button data-decision="${esc(r.key)}">Record decision</button>${r.links?.length ? `<p>Linked to ${r.links.length} meeting action(s).</p>` : ""}</article>`).join("")}</section>`,
              )
              .join("") ||
            "<p>No matching work in the available records. This does not establish complete surveillance.</p>";
          listen("[data-edit]", async (el) => {
            const item = changes.items.find((r) => r.key === el.dataset.edit);
            const r = await form(
              "Update assignment",
              field("Owner", "owner", item.owner) +
                field("Due", "due", dateInput(item.dueAt), "datetime-local") +
                textarea("Progress / completion note", "note", item.note) +
                field("Reviewed by", "reviewer") +
                (["todo", "meeting"].includes(item.kind)
                  ? '<label><input type="checkbox" name="complete"> Mark complete (note required)</label>'
                  : "<p>Use the source workflow to resolve this clinical item.</p>"),
            );
            if (r) {
              await api("workflowActionSave", {
                ...r,
                key: item.key,
                revision: item.revision,
                dueAt: parseDate(r.due),
                complete: r.complete === "on",
              });
              toast("Assignment saved.");
              await reload();
            }
          });
          listen("[data-source]", async (el) => {
            const r = changes.items.find((r) => r.key === el.dataset.source);
            renderPage(
              r.kind === "alert"
                ? "today"
                : r.kind === "todo"
                  ? "todos"
                  : "operations",
              r.kind === "meeting"
                ? { tab: "copilot", meetingId: r.meetingId }
                : r.kind === "sbar"
                  ? { tab: "sbar", sbarId: r.id }
                  : {},
            );
          });
          listen("[data-packet]", async (el) => {
            const p = await api("workflowPacket", { key: el.dataset.packet });
            const saved = await form(
              "Evidence packet",
              `<p>Includes source dates, coverage and linked decisions. Review before copying or sharing.</p><p>SHA-256: ${esc(p.sha256)}</p><textarea aria-label="Evidence packet" readonly rows="20">${esc(p.text)}</textarea>`,
              restricted ? "Close" : "Save Markdown packet",
            );
            if (saved && !restricted) {
              const output = await api("workflowPacketExport", {
                key: el.dataset.packet,
                token: p.token,
                generatedAt: p.generatedAt,
              });
              toast("Packet saved: " + output.relative);
            }
          });
          listen("[data-decision]", (el) =>
            editDecision(null, el.dataset.decision),
          );
        };
        draw();
        container.querySelector("#wf-filter").onchange = (e) => {
          filter = e.target.value;
          draw();
        };
        container.querySelector("#wf-query").oninput = (e) => {
          query = e.target.value;
          draw();
        };
        listen("#wf-reviewed", async () => {
          const r = await form(
            "Review current snapshot",
            field("Reviewed by", "reviewer") +
              "<p>This marks all currently loaded records as reviewed, including those hidden by filters. Changed records require a fresh review.</p>",
            "Mark reviewed",
          );
          if (r) {
            await api("workflowReview", {
              token: changes.token,
              reviewer: r.reviewer,
            });
            await reload();
          }
        });
      }
      async function editDecision(d, sourceKey = "") {
        const r = await form(
          d ? "Review decision" : "Record decision",
          field("Decision", "title", d?.title) +
            textarea("Reason and evidence considered", "reason", d?.reason) +
            field("Owner", "owner", d?.owner) +
            field("Reassess on", "due", dateInput(d?.dueAt), "datetime-local") +
            field("Reviewed by", "reviewer") +
            select(
              "Status",
              "status",
              [
                ["open", "Open"],
                ["closed", "Closed"],
              ],
              d?.status || "open",
            ),
        );
        if (r) {
          await api("workflowDecisionSave", {
            ...r,
            id: d?.id,
            revision: d?.revision,
            sourceKey: d?.sourceKey || sourceKey,
            dueAt: parseDate(r.due),
          });
          toast("Decision saved with revision history.");
          await reload();
        }
      }
      if (page === "decisions") {
        body.innerHTML = `<h1>Decision log</h1><p>Record why a decision was made and when to reassess it. Clinical actions still require their source review.</p><button id="wf-decision-new">Record decision</button>${state.decisions.map((d) => `<section class="card"><h2>${esc(d.title)}</h2><p>${esc(d.reason)}</p><p>${esc(d.status)} · Owner ${esc(d.owner || "Unassigned")} · Reassess ${esc(date(d.dueAt))} ${d.status === "open" && d.dueAt && d.dueAt < Date.now() ? "· OVERDUE" : ""}</p><p>Revision ${d.revision} · Reviewer ${esc(d.reviewer)} · Source ${esc(d.sourceKey || "No linked source")}</p><button data-decision-edit="${esc(d.id)}">Review / edit</button><details><summary>Previous revisions</summary><pre>${esc(JSON.stringify(d.history, null, 2))}</pre></details></section>`).join("") || "<p>No decisions recorded.</p>"}`;
        listen("#wf-decision-new", () => editDecision());
        listen("[data-decision-edit]", (el) =>
          editDecision(
            state.decisions.find((d) => d.id === el.dataset.decisionEdit),
          ),
        );
      }
      if (page === "metrics") {
        body.innerHTML = `<h1>Set up data sources</h1><p>Import measured staffing and census snapshots. Survey scores remain unavailable until a validated source is connected.</p><button data-act="view" data-view="clinical-imports">Clinical imports &amp; saved mappings</button>${restricted ? "<p>Live imports are available in the production desktop workspace.</p>" : `<form id="wf-metric"><label>Source<select name="type"><option value="staffing">Staffing</option><option value="census">Census and payer</option></select></label><label>CSV<input type="file" name="csv" accept=".csv" required></label>${field("Reviewed by", "reviewer")}<label><input name="completeDay" type="checkbox"> Staffing export includes all shifts for every supplied date/unit</label><p>Staffing columns: date (YYYY-MM-DD), unit, shift, role (RN/LPN/CNA), hours. Use one aggregate row per date/unit/shift/role; hours are direct-care hours. Census columns: date, unit, census; optional capacity, medicare, medicaid, other. Payer categories must be mutually exclusive and sum to census when all are present. Do not include names.</p><button type="submit">Preview validation</button></form>`}<h2>Measured daily results</h2>${state.metrics.days.map((d) => `<section class="card"><h3>${esc(d.date)} — ${esc(d.unit)}</h3><p>Census ${d.census?.census ?? "Unknown"} · Capacity ${d.census?.capacity ?? "Unknown"} · Direct-care hours ${d.totalHours ?? "Unknown"} · HPPD ${d.hppd == null ? "Unavailable" : d.hppd.toFixed(2)}</p><p>Medicare ${d.census?.medicare ?? "Unknown"} · Medicaid ${d.census?.medicaid ?? "Unknown"} · Other ${d.census?.other ?? "Unknown"}</p><p>${esc(d.notice)}</p><details><summary>Source dates and shift / role breakdown</summary><pre>${esc(JSON.stringify(d, null, 2))}</pre></details></section>`).join("") || "<p>No measured staffing or payer data imported. Missing values are not zero.</p>"}`;
        const f = container.querySelector("#wf-metric");
        if (f)
          f.onsubmit = async (e) => {
            e.preventDefault();
            try {
              const file = f.elements.csv.files[0];
              if (!file || file.size > 2e6)
                throw Error("Choose a CSV under 2 MB.");
              const rows = parseCSV(await file.text()).rows,
                request = {
                  type: f.elements.type.value,
                  rows,
                  filename: file.name,
                  reviewer: f.elements.reviewer.value,
                  completeDay: f.elements.completeDay.checked,
                };
              const p = await api("workflowMetricPreview", request);
              const r = await form(
                "Review import preview",
                `<p>${p.rows.length} accepted; ${p.rejected.length} rejected. Imports with rejected rows are blocked.</p><pre>${esc(JSON.stringify(p.rejected.length ? p.rejected : p.rows.slice(0, 20), null, 2))}</pre><p>${p.rows.length > 20 ? "Preview shows first 20 rows; all rows are validated." : ""}</p>`,
                p.rejected.length ? "Close" : "Import reviewed snapshot",
              );
              if (r && !p.rejected.length) {
                await api("workflowMetricImport", {
                  ...request,
                  token: p.token,
                  generatedAt: p.generatedAt,
                });
                toast("Data snapshot saved.");
                await reload();
              }
            } catch (e) {
              toast(e.message);
            }
          };
      }
      if (page === "workspace") {
        options=options || {};
        for(const value of [options.fileId,options.projectId])if(value!==undefined && value!==null && value!=='' && typeof value!=='string'){body.innerHTML='<p class="error-note">The requested source selection is invalid. Return to Library without that selection.</p>';return;}
        let focusedFileId=options.fileId ?? "",focusedSectionId=options.sectionId ?? null;
        const freshnessLabel = value => ({unknown:"Currency unknown","source-changed":"Source changed · Review again","review-overdue":"Review overdue","not-yet-effective":"Not yet effective","review-recorded":"Owner review recorded · Currency unverified"}[value?.status] || "Currency unknown");
        const current = element => revision===renderRevision && body.isConnected && (!element || element.isConnected);
        const sourceRequest = fileId => ({fileId,projectId:container.querySelector('#wf-project').value});
        const updateFreshness = (fileId,freshness) => container.querySelectorAll('[data-source-status]').forEach(el=>{if(el.dataset.sourceStatus===fileId)el.textContent=freshnessLabel(freshness);});
        let tools=restricted?null:await api('workflowDocumentToolsStatus'),searchId=null;
        if(revision!==renderRevision)return;
        body.innerHTML = `<h1>Library</h1><p>Keep reference documents and facility policies together. Use them in project chats or search their contents.</p><p><button data-act="view" data-view="projects">Manage projects / chats</button> <button data-act="view" data-view="files">Import or remove files</button></p>${restricted ? "<p>Document search and source review are available in the production desktop workspace.</p>" : `<button id="wf-policies">Facility policies</button><label>Collection<select id="wf-project"><option value="">All files</option>${state.projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label><button id="wf-upload">Upload to collection</button><button id="wf-link-files">Choose existing files</button><p><button id="wf-tools" ${tools.embedding&&tools.ocr?'disabled':''}>${tools.embedding&&tools.ocr?'Local search and English OCR ready':'Set up local search & English OCR (~68 MB)'}</button></p><p id="wf-file-focus" ${focusedFileId?'':'hidden'}>Showing the selected file. <button type="button" id="wf-all-files">Show whole collection</button></p><form id="wf-search"><label>Search references<input name="query" type="search" maxlength="200" placeholder="Ask a question or enter words" value="${esc(typeof options.query==='string'?options.query.slice(0,200):'')}"></label><label>Search by<select name="mode"><option value="words">Words</option><option value="semantic" ${tools.embedding?'selected':'disabled'}>Meaning · local</option></select></label><button type="submit">Search / show coverage</button><button type="button" id="wf-search-stop" hidden>Stop search</button></form><div id="wf-search-results"></div>`}`;
        if(!restricted && options.projectId){
          if(!state.projects.some(p=>p.id===options.projectId)){body.innerHTML+='<p class="error-note">The requested collection is unavailable. Return to Library without that source selection.</p>';return;}
          container.querySelector('#wf-project').value=options.projectId;
        }
        const loadDocument = async detail => {
          if(!detail.open || detail.dataset.loading==='true' || detail.dataset.loaded==='true')return;
          const fileId=detail.dataset.fileDetails,request=sourceRequest(fileId),panel=detail.querySelector('[data-document-panel]');
          detail.dataset.loading='true';panel.textContent='Loading source review…';
          try {
            const reviewed=await api('workflowDocumentReview',request);
            if(!current(detail) || container.querySelector('#wf-project').value!==request.projectId)return;
            detail.dataset.loaded='true';updateFreshness(fileId,reviewed.freshness);
            const metadata=reviewed.metadata;
            panel.innerHTML=`<p class="help">${esc(reviewed.freshness.notice)}</p><p>${reviewed.approval.attested?'Owner-recorded approval attestation · Independent proof not established.':'Approval not attested for this source.'}</p><button type="button" data-doc-reload>Reload saved source review</button><details><summary>Source dates and review metadata</summary><form data-source-review>${field('Source / publication date','sourceDate',metadata.sourceDate,'date')}${field('Effective date','effectiveDate',metadata.effectiveDate,'date')}${field('Source version','version',metadata.version)}${field('Reviewed on (this PC’s date)','reviewDate',metadata.reviewDate,'date')}${field('Review due (this PC’s date)','reviewDue',metadata.reviewDue,'date')}${field('Reviewed by','reviewer',metadata.reviewer)}<label class="check"><input type="checkbox" name="approvedAttestation" ${metadata.approvedAttestation?'checked':''}> I record an approval attestation for this exact source</label><p class="help">An attestation needs a reviewer and review date. It is not proof of facility approval or source currency. Blank dates stay unknown.</p><button type="submit">Save source review</button></form></details><details data-privacy-details><summary>Privacy review and redacted copy</summary><p class="help">Local patterns assist your review. They may miss sensitive information or flag harmless text. These results do not guarantee that a copy contains no sensitive information.</p><button type="button" data-privacy-refresh>Find identifier patterns</button><div data-privacy-panel></div></details>`;
            panel.querySelector('[data-doc-reload]').onclick=async()=>{if(!current(detail))return;detail.dataset.loaded='false';await loadDocument(detail);};
            const reviewForm=panel.querySelector('[data-source-review]');
            reviewForm.elements.version.maxLength=150;reviewForm.elements.reviewer.maxLength=120;
            reviewForm.onsubmit=async event=>{
              event.preventDefault();if(!current(detail))return;const button=reviewForm.querySelector('button[type="submit"]');button.disabled=true;
              try {
                const values=Object.fromEntries(new FormData(reviewForm));
                const saved=await api('workflowDocumentReviewSave',{...request,revision:reviewed.revision,metadata:{...values,approvedAttestation:reviewForm.elements.approvedAttestation.checked}});
                if(!current(detail))return;updateFreshness(fileId,saved.freshness);detail.dataset.loaded='false';
                await loadDocument(detail);if(current(detail))toast('Source review saved. Original document unchanged.');
              } catch(error){if(current(detail))toast(error.message);}finally{button.disabled=false;}
            };
            let manualSpans=[],privacyRevision=0;
            const privacyPanel=panel.querySelector('[data-privacy-panel]'),refreshPrivacy=panel.querySelector('[data-privacy-refresh]');
            const showPrivacy = async()=>{
              if(!current(privacyPanel))return;
              const attempt=++privacyRevision;refreshPrivacy.disabled=true;privacyPanel.textContent='Checking extracted text locally…';
              try {
                const result=await api('workflowDisclosureReview',{...request,manualSpans});
                if(!current(privacyPanel) || attempt!==privacyRevision)return;
                manualSpans=result.manualSpans;
                privacyPanel.innerHTML=`<p class="help">${esc(result.notice)}</p><p>${result.coverage.characters} extracted-text positions · ${result.spans.length} suggestions${result.coverage.incomplete?' · Incomplete coverage':''}.</p><fieldset><legend>Select only the spans to redact</legend>${result.spans.map(span=>`<label class="check"><input type="checkbox" data-privacy-span value="${esc(span.id)}"><span><strong>${esc(span.type)}</strong> · positions ${span.start+1}–${span.end}<br><code>${esc(span.value)}${span.valueTruncated?'…':''}</code><br><span class="help">${esc(span.snippet)}</span></span></label>`).join('') || '<p>No pattern suggestions. This does not establish absence of sensitive information.</p>'}</fieldset><details><summary>Manual range (optional)</summary><p class="help">Use the extracted-text positions shown above. Start and last position are 1-based; include whole characters. Manual ranges are also suggestions until selected.</p>${field('Start position','manualStart','','number')}${field('Last position (inclusive)','manualEnd','','number')}<button type="button" data-manual-add>Add range and refresh</button><button type="button" data-manual-clear ${manualSpans.length?'':'disabled'}>Clear manual ranges</button></details><button type="button" data-redacted-generate disabled>Prepare selected redacted copy</button><div data-redacted-output></div>`;
                const generate=privacyPanel.querySelector('[data-redacted-generate]'),output=privacyPanel.querySelector('[data-redacted-output]');
                privacyPanel.querySelectorAll('[data-privacy-span]').forEach(input=>input.onchange=()=>{output.innerHTML='';generate.disabled=!privacyPanel.querySelector('[data-privacy-span]:checked');});
                for(const input of privacyPanel.querySelectorAll('[name="manualStart"],[name="manualEnd"]')){input.min='1';input.max=String(result.coverage.characters);input.step='1';}
                privacyPanel.querySelector('[data-manual-add]').onclick=async()=>{
                  try {
                    const start=Number(privacyPanel.querySelector('[name="manualStart"]').value),end=Number(privacyPanel.querySelector('[name="manualEnd"]').value);
                    if(!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start<1 || end<start || end>result.coverage.characters)throw Error('Choose valid whole start and last positions in this extracted text.');
                    if(manualSpans.length>=100)throw Error('Up to 100 manual ranges are supported.');
                    manualSpans=[...manualSpans,{start:start-1,end}];await showPrivacy();
                  } catch(error){if(current(privacyPanel))toast(error.message);}
                };
                privacyPanel.querySelector('[data-manual-clear]').onclick=async()=>{manualSpans=[];await showPrivacy();};
                generate.onclick=async()=>{
                  if(!current(privacyPanel))return;
                  generate.disabled=true;
                  const copyRequest={...request,revision:result.revision,manualSpans:result.manualSpans,selectedSpans:[...privacyPanel.querySelectorAll('[data-privacy-span]:checked')].map(input=>input.value)};
                  try {
                    const copy=await api('workflowDisclosureRedact',copyRequest);
                    if(!current(output) || attempt!==privacyRevision)return;
                    output.innerHTML=`<p><strong>Redacted COPY · Original unchanged</strong> · ${copy.redactions} redaction ranges</p><p class="help">${esc(copy.notice)}</p><textarea readonly rows="12" aria-label="Redacted copy">${esc(copy.text)}</textarea><button type="button" data-redacted-copy>Copy reviewed text</button>`;
                    output.querySelector('[data-redacted-copy]').onclick=async event=>{
                      if(!current(output))return;
                      const button=event.currentTarget;button.disabled=true;
                      try {
                        const fresh=await api('workflowDisclosureRedact',copyRequest);
                        if(!current(output) || attempt!==privacyRevision)return;
                        if(!navigator.clipboard?.writeText)throw Error('Select the copy text and copy it manually.');
                        await navigator.clipboard.writeText(fresh.text);if(current(output))toast('Reviewed redacted copy copied. Originals and disclosure permissions unchanged.');
                      }catch(error){if(current(output))toast(error.message);}finally{button.disabled=false;}
                    };
                  }catch(error){if(current(output))toast(error.message);}finally{if(current(generate))generate.disabled=!privacyPanel.querySelector('[data-privacy-span]:checked');}
                };
              }catch(error){if(current(privacyPanel) && attempt===privacyRevision){privacyPanel.textContent=error.message;toast(error.message);}}
              finally{if(current(refreshPrivacy))refreshPrivacy.disabled=false;}
            };
            refreshPrivacy.onclick=showPrivacy;
          }catch(error){if(current(detail)){panel.textContent=error.message;toast(error.message);}}
          finally{detail.dataset.loading='false';}
        };
        listen('#wf-tools',async()=>{
          const button=container.querySelector('#wf-tools');button.disabled=true;button.textContent='Downloading verified local tools…';
          try{tools=await api('workflowDocumentToolsSetup',{kind:'all'});if(revision!==renderRevision)return;const mode=container.querySelector('#wf-search').elements.mode;mode.querySelector('[value="semantic"]').disabled=!tools.embedding;mode.value=tools.embedding?'semantic':'words';button.textContent=tools.embedding&&tools.ocr?'Local search and English OCR ready':'Retry local tool setup';toast('Local tools installed. Searches and OCR run offline; verify extracted text against originals.');}
          finally{button.disabled=!!(tools.embedding&&tools.ocr);if(!button.disabled)button.textContent='Retry local tool setup';}
        });
        listen("#wf-policies", async () => {
          let p = state.projects.find(p => p.name === "Facility policies");
          if (!p) { p = await api("projectSave", {name:"Facility policies", instructions:"Use the attached facility policies as references. Cite the document and section. Distinguish supplied policy text from recommendations; uploaded documents do not establish approval or currency."}); await refresh(); state.projects.push(p); const option=document.createElement('option');option.value=p.id;option.textContent=p.name;container.querySelector('#wf-project').append(option); }
          container.querySelector('#wf-project').value=p.id;
          await search();
          toast('Facility policies selected. Import files, then choose project files to add them.');
        });
        listen("#wf-upload", async()=>{
          const id=container.querySelector('#wf-project').value,p=state.projects.find(p=>p.id===id);
          if(!p)throw Error('Select a collection, or choose Facility policies first.');
          const imported=await api('pickFiles');if(!imported.length)return;
          const saved=await api('workflowProjectFiles',{projectId:id,fileIds:[...new Set([...(p.fileIds||[]),...imported.map(f=>f.id)])]});p.fileIds=saved.fileIds;
          await refresh();await search();toast('Files added to the collection.');
        });
        listen("#wf-link-files", async () => {
          const id = container.querySelector("#wf-project").value,
            p = state.projects.find((p) => p.id === id);
          if (!p) throw Error("Select a project first.");
          const r = await form(
            "Project documents",
            fileChecks(state.files, p.fileIds),
          );
          if (r) {
            const updated = await api("workflowProjectFiles", {
              projectId: id,
              fileIds: fileIds(r),
            });
            p.fileIds = updated.fileIds;
            toast("Project files saved.");
            await search();
          }
        });
        const search = async () => {
          if(searchId)throw Error('A search is already running. Stop it before starting another.');
          const id=crypto.randomUUID();searchId=id;activeSearch=id;const stop=container.querySelector('#wf-search-stop'),collection=container.querySelector('#wf-project');stop.hidden=false;collection.disabled=true;
          try{const r = await api("workflowDocumentSearch", {
            projectId: container.querySelector("#wf-project").value,
            ...(focusedFileId?{fileId:focusedFileId}:{}),
            query: container.querySelector("#wf-search").elements.query.value,
            mode: container.querySelector('#wf-search').elements.mode.value,
            requestId:id,
          });
          if(revision!==renderRevision)return;
          container.querySelector("#wf-search-results").innerHTML =
            `<p>${esc(r.notice)}</p><p>${r.totalMatches} ${r.mode==='semantic'?'ranked passages':'matching sections'}${r.totalMatches > 50 ? "; showing first 50 — refine search" : ""}.</p><details open><summary>Extraction coverage and source review</summary>${r.coverage.map((f) => `<details class="section" data-file-details="${esc(f.id)}"><summary>${esc(f.name)} · <span data-source-status="${esc(f.id)}">${esc(freshnessLabel(f.freshness))}</span></summary><p>${f.characters} characters, ${f.sections} sections${f.pages ? ", " + f.pages + " page markers" : ""} · ${f.searchable ? "Text available" : "No searchable text"}</p><div data-document-panel></div></details>`).join("") || "<p>No files in this selection.</p>"}</details>${r.results.map((p) => `<section class="card" data-section-file="${esc(p.fileId)}" data-section-id="${esc(p.id)}"><h3>${esc(p.citation)}</h3><p>Source revision ${esc(p.revision.slice(0, 12))} · Stored ${esc(date(p.updated))} · <span data-source-status="${esc(p.fileId)}">${esc(freshnessLabel(p.freshness))}</span></p><pre style="white-space:pre-wrap">${esc(p.text)}</pre></section>`).join("")}`;
          container.querySelectorAll('[data-file-details]').forEach(detail=>detail.addEventListener('toggle',()=>{if(detail.open)loadDocument(detail).catch(error=>toast(error.message));}));
          if(focusedFileId){
            const detail=[...container.querySelectorAll('[data-file-details]')].find(el=>el.dataset.fileDetails===focusedFileId);
            if(detail){detail.open=true;await loadDocument(detail);if(current(detail))detail.scrollIntoView({block:'nearest'});}
            if(focusedSectionId!==null){const section=[...container.querySelectorAll('[data-section-file]')].find(el=>el.dataset.sectionFile===focusedFileId && el.dataset.sectionId===String(focusedSectionId));if(section && current(section))section.scrollIntoView({block:'nearest'});}
          }
          }finally{if(searchId===id)searchId=null;if(activeSearch===id)activeSearch=null;stop.hidden=true;collection.disabled=false;}
        };
        listen('#wf-search-stop',async()=>{if(searchId)await api('stop',{id:searchId});});
        listen('#wf-all-files',async()=>{focusedFileId='';focusedSectionId=null;container.querySelector('#wf-file-focus').hidden=true;await search();});
        const f = container.querySelector("#wf-search");
        if (f) {
          f.onsubmit = (e) => {
            e.preventDefault();
            search().catch((e) => toast(e.message));
          };
          container.querySelector("#wf-project").onchange = () => {
            focusedFileId='';focusedSectionId=null;container.querySelector('#wf-file-focus').hidden=true;
            search().catch((e) => toast(e.message));
          };
          await search();
        }
      }
      if (page === "playbooks") {
        const b = state.budget;
        body.innerHTML = `<h1>Playbooks &amp; cloud budgets</h1><p>Reusable, reviewed document reports with versioned inputs and required output headings. Calculations and conclusions require review.</p><p><button data-act="view" data-view="automation">Automation history</button> <button data-act="view" data-view="agents">Agents</button> <button data-act="view" data-view="schedules">Schedules</button> <button data-act="view" data-view="worker">Workers</button></p>${restricted ? "<p>Playbook execution and budget changes require the production desktop workspace.</p>" : `<button id="wf-playbook-new">Create playbook</button>${state.playbooks.map((p) => `<section class="card"><h2>${esc(p.name)}</h2><p>Revision ${p.revision} · ${esc(p.reviewer)} · ${p.fileIds.length} required files · Output ${esc(p.format)}</p><p>${esc(p.requiredSections.join(", "))}</p><button data-book-edit="${esc(p.id)}">Edit new revision</button> <button data-book-preview="${esc(p.id)}">Preview run</button></section>`).join("")}<h2>Playbook runs</h2>${(state.runs || []).map((j) => `<details class="card"><summary>${esc(j.title)} — ${esc(j.status)} · revision ${j.playbook.revision}</summary><p>${esc(j.reason || "Draft report generated; review before use.")}</p><p>${esc(j.output || "No exported report")}</p>${j.outputCheck?.missing?.length ? `<p>Missing headings: ${esc(j.outputCheck.missing.join(", "))}. Review this draft, edit the playbook if needed, then request a fresh run preview.</p>` : ""}${j.draftText ? `<textarea readonly rows="12" aria-label="Saved draft">${esc(j.draftText)}</textarea>` : ""}</details>`).join("")}<h2>Cloud budget</h2><p>${esc(b.notice)}</p><p>${esc(b.ledger.id)}: ${b.ledger.requests} reserved requests; $${b.ledger.allowance.toFixed(4)} reserved allowance. Limits ${b.policy.enabled ? "enabled" : "disabled"}.</p><button id="wf-budget">Edit limits</button>`}`;
        const edit = async (p) => {
          const r = await form(
            "Versioned playbook",
            field("Name", "name", p?.name) +
              textarea(
                "Instructions, required calculations and review steps",
                "prompt",
                p?.prompt,
              ) +
              textarea(
                "Required output headings (one per line)",
                "headings",
                p?.requiredSections.join("\n") ||
                  "Findings\nEvidence and source dates\nMissing inputs\nActions for review",
              ) +
              fileChecks(state.files, p?.fileIds) +
              select(
                "Output",
                "format",
                [
                  ["md", "Markdown"],
                  ["pdf", "PDF"],
                  ["docx", "Word"],
                ],
                p?.format || "md",
              ) +
              field("Reviewed by", "reviewer"),
          );
          if (r) {
            await api("workflowPlaybookSave", {
              ...r,
              id: p?.id,
              revision: p?.revision,
              fileIds: fileIds(r),
              requiredSections: r.headings.split("\n"),
            });
            toast("Playbook revision saved.");
            await reload();
          }
        };
        listen("#wf-playbook-new", () => edit());
        listen("[data-book-edit]", (el) =>
          edit(state.playbooks.find((p) => p.id === el.dataset.bookEdit)),
        );
        listen("[data-book-preview]", async (el) => {
          const p = await api("workflowPlaybookPreview", {
            id: el.dataset.bookPreview,
          });
          const r = await form(
            "Review this run",
            `<p>${esc(p.notice)}</p><p>Mode ${esc(p.processingMode)} · HIPAA ${p.hipaa ? "on" : "off"} · Budget ${p.budgetBlocked ? "would block a cloud call" : p.allowance?.enabled ? "reserved allowance estimate $" + p.allowance.allowance.toFixed(4) : "not enabled"}.</p><pre style="white-space:pre-wrap">${esc(p.prompt)}</pre>${p.inputs.map((f) => `<p>${esc(f.name)} · ${f.characters} characters · ${esc(date(f.updated))}</p>`).join("")}<p>Preview expires in 10 minutes. Changed inputs/settings require another review.</p>${field("Run reviewed by", "reviewer")}`,
            "Run once",
          );
          if (r) {
            const job = await api("workflowPlaybookRun", {
              id: p.id,
              token: p.token,
              nonce: p.nonce,
              expiresAt: p.expiresAt,
              reviewer: r.reviewer,
            });
            toast("Report queued: " + job.id);
            await refresh();
          }
        });
        listen("#wf-budget", async () => {
          const p = b.policy,
            r = await form(
              "Per-PC monthly limits",
              `<label><input type="checkbox" name="enabled" ${p.enabled ? "checked" : ""}> Enable budget</label>` +
                field(
                  "Maximum cloud requests (blank = no count limit)",
                  "maxRequests",
                  p.maxRequests ?? "",
                  "number",
                ) +
                field(
                  "Maximum estimated dollar allowance (blank = no allowance limit)",
                  "maxAllowance",
                  p.maxAllowance ?? "",
                ) +
                field(
                  "Exact provider for priced requests",
                  "provider",
                  p.provider || "openai",
                ) +
                field("Exact model", "model", p.model) +
                field(
                  "Input USD per million tokens",
                  "inputRate",
                  p.inputRate ?? "",
                ) +
                field(
                  "Output USD per million tokens",
                  "outputRate",
                  p.outputRate ?? "",
                ) +
                "<p>Verify rates with your provider. An allowance limit blocks unpriced models, web tools and images. Reserved costs are not refunded after failures. Realtime uses local fallback while any limit is enabled.</p>",
            );
          if (r) {
            await api("workflowBudgetSave", {
              ...r,
              enabled: r.enabled === "on",
            });
            toast("Limits saved. Existing reservations preserved.");
            await reload();
          }
        });
      }
    },
  };
}
