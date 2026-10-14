import {parseCSV} from '../csv.mjs';
export {parseCSV};
const fields = [
  "residentId",
  "name",
  "room",
  "unit",
  "medication",
  "orderId",
  "eventId",
  "dose",
  "previousDose",
  "newDose",
  "changeType",
  "startDate",
  "orderDate",
  "eventDate",
  "frequency",
  "route",
  "prn",
  "indication",
  "prescriber",
  "icd10",
  "description",
  "onsetDate",
  "targetSymptom",
  "interventionsAttempted",
  "text",
  "noteDate",
  "lastGDRDate",
  "nextReviewDate",
  "medication",
  "recommendation",
  "status",
];
export function createImportCenter({ api, esc, toast, form }) {
  return {
    async render(container, {sourceProvider="generic"} = {}) {
      const [batches, schema, dashboard, workflows] = await Promise.all([
        api("snfImports"),
        api("snfImportSchema"),
        api("snfDashboard"),
        api("workflowSummary"),
      ]);
      if(sourceProvider==='pcc'&&!dashboard.integrations?.find(x=>x.id==='pcc')?.canImport){
        container.innerHTML=`<div class="page"><h1>PointClickCare — Not connected</h1><p>General clinical imports remain available.</p><button data-act="view" data-view="settings">Configure integration</button><button data-act="view" data-view="clinical-imports">Clinical imports</button></div>`;return;
      }
      let selected = null,
        profile = null;
      const mappings = workflows.mappings || [];
      const mapped = () =>
        Object.fromEntries(
          [...container.querySelectorAll("[data-mapping]")].map((el, i) => [
            selected.csv.headers[i],
            el.value || selected.csv.headers[i],
          ]),
        );
      const refreshProfiles = () => {
        profile = null;
        const box = container.querySelector("#pcc-profiles");
        if (!box || !selected?.csv) return;
        const type = container.querySelector("#pcc-type").value,
          compatible = mappings.filter(
            (p) =>
              p.type === type &&
              JSON.stringify(p.headers) ===
                JSON.stringify(selected.csv.headers),
          );
        box.innerHTML = `<label>Saved mapping<select id="pcc-profile"><option value="">Review a new mapping</option>${compatible.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} — revision ${p.revision}</option>`).join("")}</select></label>${mappings.some((p) => p.type === type) && !compatible.length ? '<p class="error-note">Column schema changed. Saved mappings cannot be reused until these headers are reviewed.</p>' : ""}<label>Mapping name<input id="pcc-profile-name" maxlength="100"></label><button type="button" id="pcc-profile-save">Save reviewed mapping</button><p id="pcc-profile-status" role="status"></p>`;
        box.querySelector("#pcc-profile").onchange = (e) => {
          profile = compatible.find((p) => p.id === e.target.value) || null;
          if (profile) {
            container.querySelectorAll("[data-mapping]").forEach((el, i) => {
              el.value =
                profile.mapping[selected.csv.headers[i]] ===
                  selected.csv.headers[i] &&
                !fields.includes(profile.mapping[selected.csv.headers[i]])
                  ? ""
                  : profile.mapping[selected.csv.headers[i]];
            });
            box.querySelector("#pcc-profile-name").value = profile.name;
          }
        };
        box.querySelector("#pcc-profile-save").onclick = async () => {
          try {
            const saved = await api("workflowMappingSave", {
              id: profile?.id,
              revision: profile?.revision,
              name: box.querySelector("#pcc-profile-name").value,
              type,
              headers: selected.csv.headers,
              mapping: mapped(),
              reviewer: container.querySelector("#pcc-operator").value,
            });
            const i = mappings.findIndex((p) => p.id === saved.id);
            if (i < 0) mappings.push(saved);
            else mappings[i] = saved;
            refreshProfiles();
            profile = saved;
            box.querySelector("#pcc-profile").value = saved.id;
            box.querySelector("#pcc-profile-name").value = saved.name;
            box.querySelector("#pcc-profile-status").textContent =
              "Saved revision " + saved.revision;
          } catch (e) {
            toast(e.message);
          }
        };
      };
      container.innerHTML = `<div class="page"><h1>${sourceProvider==="pcc"?"PCC Import Center":"Clinical imports"}</h1><p>Import mapped CSV reports or a JSON array of report objects. Confirm the report date and column mappings before importing. PDF and spreadsheet mapping require a reviewed conversion first.</p>${dashboard.developmentMode ? '<p class="error-note">Development / Demo Mode — Not for PHI. Live clinical imports are disabled. Use the desktop application for approved clinical workflows.</p>' : dashboard.demo ? '<p class="error-note">DEMO DATA — Live imports are disabled. Return to production in Today.</p>' : `<form id="pcc-import-form"><label>Report file<input id="pcc-file" type="file" accept=".csv,.json" required></label><label>Report type<select id="pcc-type">${schema.map((t) => `<option value="${esc(t)}">${esc(t.replaceAll("_", " "))}</option>`).join("")}</select></label><label>Report date / range end<input id="pcc-date" type="datetime-local" required></label><label>Operator<input id="pcc-operator" required maxlength="120"></label><div id="pcc-mapping"></div><div id="pcc-profiles"></div><button class="primary" type="submit">Validate and import</button><p id="pcc-result" role="status"></p></form>`}<h2>Import history</h2>${batches.length ? batches.map((b) => `<details class="section"><summary>${esc(new Date(b.importTime).toLocaleString())} — ${b.acceptedRows} accepted, ${b.rejectedRows} rejected</summary><p>Operator: ${esc(b.operator)} · Batch: ${esc(b.id)}</p>${b.reports.map((r) => `<p>${esc(r.filename)} — ${esc(r.status)}, ${r.rowCount} rows, ${r.acceptedRows} accepted, ${r.rejectedRows} rejected ${r.duplicateOf ? "· duplicate detected" : ""}</p><pre>${esc([...(r.mappingErrors || []), ...(r.rejections || []).map((x) => `Row ${x.row}: ${x.reason}`)].join("\n"))}</pre>`).join("")}<p>Missing feeds: ${esc(b.missingExpectedFeeds?.join(", "))}. Stale feeds: ${esc(b.staleFeeds?.join(", "))}.</p></details>`).join("") : "<p>No imports yet.</p>"}</div>`;
      container
        .querySelector("#pcc-file")
        ?.addEventListener("change", async (e) => {
          try {
            const file = e.target.files[0];
            if (!file || file.size > 10 * 1024 * 1024)
              throw Error("Select a CSV or JSON file smaller than 10 MB.");
            const rawText = await file.text();
            selected = { file, rawText };
            const box = container.querySelector("#pcc-mapping");
            if (file.name.toLowerCase().endsWith(".csv")) {
              selected.csv = parseCSV(rawText);
              box.innerHTML = `<h2>Map columns</h2><p>${selected.csv.rows.length} rows. Stable resident IDs must match the census.</p>${selected.csv.headers.map((h, i) => `<label>${esc(h)}<select data-mapping="${i}"><option value="">Keep original field</option>${[...new Set(fields)].map((f) => `<option ${h === f ? "selected" : ""} value="${esc(f)}">${esc(f)}</option>`).join("")}</select></label>`).join("")}`;
              refreshProfiles();
            } else {
              profile = null;
              container.querySelector("#pcc-profiles").innerHTML = "";
              selected.json = JSON.parse(rawText);
              if (!Array.isArray(selected.json))
                throw Error("JSON must contain an array of report objects.");
              box.textContent = `${selected.json.length} report objects loaded. Their report types and dates will be validated.`;
            }
          } catch (error) {
            selected = null;
            toast(error.message);
          }
        });
      container
        .querySelector("#pcc-type")
        ?.addEventListener("change", refreshProfiles);
      container
        .querySelector("#pcc-import-form")
        ?.addEventListener("submit", async (e) => {
          e.preventDefault();
          const button = e.target.querySelector("button[type=submit]");
          button.disabled = true;
          try {
            if (!selected) throw Error("Select and map a report first.");
            let reports = selected.json;
            if (selected.csv) {
              const maps = [
                ...container.querySelectorAll("[data-mapping]"),
              ].map((el, i) => [
                selected.csv.headers[i],
                el.value || selected.csv.headers[i],
              ]);
              if (new Set(maps.map((m) => m[1])).size !== maps.length)
                throw Error("Two columns map to the same field.");
              const rows = selected.csv.rows.map((row) =>
                Object.fromEntries(
                  maps.map(([old, key]) => [
                    key,
                    key === "prn" ? /^(true|yes|1)$/i.test(row[old]) : row[old],
                  ]),
                ),
              );
              reports = [
                {
                  type: container.querySelector("#pcc-type").value,
                  date: new Date(
                    container.querySelector("#pcc-date").value,
                  ).toISOString(),
                  rows,
                },
              ];
            }
            if (
              profile &&
              JSON.stringify(mapped()) !== JSON.stringify(profile.mapping)
            )
              throw Error(
                "Mapping changed. Save the reviewed revision before importing.",
              );
            let previewToken;
            if (profile) {
              const preview = await api("workflowMappedPreview", {
                  sourceProvider,
                id: profile.id,
                revision: profile.revision,
                type: container.querySelector("#pcc-type").value,
                headers: selected.csv.headers,
                rows: selected.csv.rows,
                date: new Date(
                  container.querySelector("#pcc-date").value,
                ).toISOString(),
                filename: selected.file.name,
                reviewer: container.querySelector("#pcc-operator").value,
              });
              const v = preview.validation;
              const proceed = await form(
                "Review mapped import",
                `<p>${v.accepted.length} accepted; ${v.rejected.length} rejected. Rejected rows will not be imported.</p><pre>${esc(JSON.stringify({ mappingErrors: v.mappingErrors, rejected: v.rejected, firstAcceptedRows: v.accepted.slice(0, 10) }, null, 2))}</pre>`,
                v.mappingErrors.length ? "Close" : "Import accepted rows",
              );
              if (!proceed || v.mappingErrors.length) return;
              previewToken = preview.token;
            }
            const result = profile
              ? await api("workflowMappedImport", {
                  sourceProvider,
                  previewToken,
                  id: profile.id,
                  revision: profile.revision,
                  type: container.querySelector("#pcc-type").value,
                  headers: selected.csv.headers,
                  rows: selected.csv.rows,
                  date: new Date(
                    container.querySelector("#pcc-date").value,
                  ).toISOString(),
                  filename: selected.file.name,
                  reviewer: container.querySelector("#pcc-operator").value,
                })
              : await api("snfIngest", {
                  sourceProvider,
                  reports: reports.map((r) => ({
                    ...r,
                    filename: selected.file.name,
                    rawText: selected.rawText,
                  })),
                  user: container.querySelector("#pcc-operator").value,
                });
            toast(
              result.success
                ? "Import complete. Review data health and alerts."
                : "Import needs review. See rejected rows and mapping errors.",
            );
            await this.render(container,{sourceProvider});
          } catch (error) {
            toast(error.message);
          } finally {
            button.disabled = false;
          }
        });
    },
  };
}
