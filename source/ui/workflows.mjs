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
  const date = (v) => (v ? new Date(v).toLocaleString() : "Not recorded");
  const dateInput = (v) =>
    v
      ? new Date(v - new Date(v).getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16)
      : "";
  const parseDate = (v) => (v ? new Date(v).getTime() : null);
  const nav =
    '<p><button data-act="view" data-view="today">Today</button> <button data-act="view" data-view="actions">Action Center</button> <button data-act="view" data-view="captures">Notes and rounds</button> <button data-act="view" data-view="decisions">Decisions</button> <button data-act="view" data-view="metrics">Data sources</button></p>';
  const fileChecks = (files, ids = []) =>
    files
      .map(
        (f) =>
          `<label class="check"><input type="checkbox" name="file_${esc(f.id)}" ${ids.includes(f.id) ? "checked" : ""}>${esc(f.name)}</label>`,
      )
      .join("");
  const fileIds = (r) =>
    Object.keys(r)
      .filter((k) => k.startsWith("file_"))
      .map((k) => k.slice(5));
  return {
    async render(container, page = "actions") {
      const state = await api("workflowSummary"),
        restricted = state.demo || state.developmentMode;
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
      const reload = () => this.render(container, page);
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
        body.innerHTML = `<h1>Projects &amp; documents</h1><p><button data-act="view" data-view="projects">Manage projects / chats</button> <button data-act="view" data-view="files">Import or remove files</button></p>${restricted ? "<p>Document search is available in the production desktop workspace.</p>" : `<label>Project<select id="wf-project"><option value="">All files</option>${state.projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label><button id="wf-link-files">Choose project files</button><form id="wf-search"><label>Find words in extracted text<input name="query" type="search" maxlength="200"></label><button>Search / show coverage</button></form><div id="wf-search-results"></div>`}`;
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
          const r = await api("workflowDocumentSearch", {
            projectId: container.querySelector("#wf-project").value,
            query: container.querySelector("#wf-search").elements.query.value,
          });
          container.querySelector("#wf-search-results").innerHTML =
            `<p>${esc(r.notice)}</p><p>${r.totalMatches} matching sections${r.totalMatches > 50 ? "; showing first 50 — refine search" : ""}.</p><details open><summary>Extraction coverage</summary>${r.coverage.map((f) => `<p>${esc(f.name)}: ${f.characters} characters, ${f.sections} sections${f.pages ? ", " + f.pages + " page markers" : ""} · ${f.searchable ? "Text available" : "No searchable text"}</p>`).join("") || "<p>No files in this selection.</p>"}</details>${r.results.map((p) => `<section class="card"><h3>${esc(p.citation)}</h3><p>Source revision ${esc(p.revision.slice(0, 12))} · Imported ${esc(date(p.updated))}</p><pre style="white-space:pre-wrap">${esc(p.text)}</pre></section>`).join("")}`;
        };
        const f = container.querySelector("#wf-search");
        if (f) {
          f.onsubmit = (e) => {
            e.preventDefault();
            search().catch((e) => toast(e.message));
          };
          container.querySelector("#wf-project").onchange = () =>
            search().catch((e) => toast(e.message));
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
