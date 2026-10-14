// One on-demand view of the existing encrypted saved sources. No extra index,
// provider, filesystem access or persisted copy of the query/results is created.
const SOURCE_TYPES = Object.freeze([
  ['chats', 'Chats'], ['notes', 'Notes'], ['meetings', 'Meetings'],
  ['projects', 'Projects'], ['documents', 'Documents'],
  ['tasks', 'Follow-ups'], ['reports', 'Report jobs'],
]);
const SOURCE_LABELS = Object.fromEntries([...SOURCE_TYPES, ['clinical', 'Clinical records']]);
const ROUTES = new Set(['chat', 'captures', 'meetings', 'projects', 'workspace', 'dashboard', 'automation', 'snf', 'operations']);

export function createSearchUI({ api, esc, toast, openSource, state }) {
  let generation = 0;
  const errorMessage = error => error?.code === 'LOCKED'
    ? 'Unlock Private AI to search saved sources.'
    : error?.code === 'POLICY'
      ? 'Saved-source search is available in the unlocked desktop app. It is unavailable in Development or Demo mode.'
      : 'Search could not be completed. Please try again.';
  const date = value => typeof value === 'number' && Number.isFinite(value)
    ? new Date(value).toLocaleString() : 'Not recorded';
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const searchableProject = project => project && !project.archived && !project.temporary && !project.deleted;

  return {
    stop() { generation++; },
    async render(container, options = {}) {
      const ticket = ++generation;
      const active = () => ticket === generation && container.isConnected;
      container.innerHTML = '<div class="page assistant-page"><h1>Search</h1><p role="status">Loading saved-source search…</p></div>';
      let summary;
      try { summary = await api('workflowSummary'); }
      catch (error) {
        if (active()) container.innerHTML = `<div class="page assistant-page"><h1>Search</h1><p class="error-note" role="status">${esc(errorMessage(error))}</p></div>`;
        return;
      }
      if (!active()) return;
      if (summary.demo || summary.developmentMode) {
        container.innerHTML = '<div class="page assistant-page"><h1>Search</h1><p role="status">Saved-source search is unavailable in Development or Demo mode. Use the unlocked desktop app to search your saved work.</p></div>';
        return;
      }
      const projects = (summary.projects || []).filter(searchableProject);
      const selectedProject = projects.some(project => project.id === options.projectId) ? options.projectId : '';
      const clinicalEnabled = state?.()?.settings?.snfEnabled !== false;
      container.innerHTML = `<div class="page assistant-page workflow-page"><h1>Search</h1><p class="help">Find saved chats, notes, meetings, documents and follow-ups. Local word search; no model or cloud connection is needed.</p><form id="saved-search-form"><label class="field">Search saved text<input id="saved-search-query" name="query" type="search" maxlength="200" placeholder="What are you looking for?" required autocomplete="off"></label><details class="manual-details"><summary>Sources and collection</summary><div class="button-row">${SOURCE_TYPES.map(([type, label]) => `<label class="check"><input type="checkbox" name="source" value="${type}" checked>${label}</label>`).join('')}</div><label class="field">Collection<select id="saved-search-project"><option value="">All saved work</option>${projects.map(project => `<option value="${esc(project.id)}" ${project.id === selectedProject ? 'selected' : ''}>${esc(project.name || 'Unnamed collection')}</option>`).join('')}</select><small>A selected collection excludes items with unknown or unrelated collection membership.</small></label><label class="check"><input id="saved-search-clinical" type="checkbox" ${clinicalEnabled ? '' : 'disabled'}>Include dedicated clinical records</label><p class="help">${clinicalEnabled ? 'Clinical records are included only when selected. Their live-feed freshness and completeness remain unknown.' : 'Clinical records are unavailable while general clinical features are disabled.'} Saved ordinary text may also contain sensitive information; this filter does not remove PHI.</p></details><div class="button-row"><button id="saved-search-submit" class="primary" type="submit">Search</button></div></form><p id="saved-search-status" role="status" aria-live="polite">Enter a word or phrase to search saved text.</p><div id="saved-search-results"></div></div>`;
      const form = container.querySelector('#saved-search-form');
      const queryInput = container.querySelector('#saved-search-query');
      const projectInput = container.querySelector('#saved-search-project');
      const clinicalInput = container.querySelector('#saved-search-clinical');
      const submit = container.querySelector('#saved-search-submit');
      const status = container.querySelector('#saved-search-status');
      const results = container.querySelector('#saved-search-results');
      let request = 0;
      const invalidate = () => {
        request++;
        results.innerHTML = '';
        status.textContent = 'Press Search to review matches for the current text and sources.';
        submit.disabled = false;
        form.setAttribute('aria-busy', 'false');
      };
      form.addEventListener('input', invalidate);
      form.addEventListener('change', invalidate);
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!active()) return;
        const query = queryInput.value.trim();
        const types = [...form.querySelectorAll('input[name="source"]:checked')].map(input => input.value);
        if (!query || queryInput.value.length > 200 || !types.length) {
          status.textContent = !types.length ? 'Select at least one source type.' : 'Enter between 1 and 200 characters.';
          results.innerHTML = '';
          return;
        }
        const current = ++request;
        const currentRequest = () => active() && current === request;
        submit.disabled = true;
        form.setAttribute('aria-busy', 'true');
        status.textContent = 'Searching saved sources…';
        results.innerHTML = '';
        try {
          const data = await api('workflowSearch', {
            query, types, includeClinical: !clinicalInput.disabled && clinicalInput.checked,
            limit: 50, ...(projectInput.value ? { projectId: projectInput.value } : {}),
          });
          if (!currentRequest()) return;
          const rows = Array.isArray(data.results) ? data.results.slice(0, 50) : [];
          const total = count(data.totalMatches);
          status.textContent = `${total === null ? 'Match count unavailable.' : `${data.countsExact === true ? '' : 'At least '}${total} saved-text ${total === 1 ? 'match' : 'matches'}.`} Showing ${rows.length}${data.truncated ? '; refine the text or sources to see other matches' : ''}.`;
          results.innerHTML = `${rows.map((row, index) => `<article class="card"><h2>${esc(row.title || 'Saved source')}</h2><p class="help">${esc(SOURCE_LABELS[row.type] || 'Saved source')} · Stored: ${esc(date(row.updated))}${row.clinical ? ' · Clinical source — review required' : ''}</p><pre class="meeting-summary">${esc(row.excerpt || '')}</pre><p class="help">${row.citation ? `${esc(row.citation)} · ` : ''}Field: ${esc(row.sourceField || 'Not recorded')}${Number.isSafeInteger(row.start) && Number.isSafeInteger(row.end) ? ` · Characters ${row.start}–${row.end}` : ''}</p><button type="button" data-search-open="${index}" ${ROUTES.has(row.route?.view) && typeof openSource === 'function' ? '' : 'disabled'}${row.route?.view === 'snf' ? '>Open clinical review' : '>Open source'}</button></article>`).join('') || '<p>No matches in the scanned saved text. This does not establish that the information or clinical condition is absent.</p>'}<details><summary>Search coverage and limits</summary><p>${esc(data.coverage?.notice || 'Only scanned saved text is included; completeness is unknown.')}</p>${(data.coverage?.sources || []).map(source => `<p>${esc(SOURCE_LABELS[source.type] || source.type || 'Source')} (${esc(source.kind || 'saved records')}): ${count(source.scannedRecords) ?? 'Unknown'} scanned of ${count(source.availableRecords) ?? 'unknown'} saved records${source.complete === false ? ' · Source scan limit reached' : source.complete === true ? '' : ' · Scan completeness unknown'}.</p>`).join('')}${data.includeClinical ? '<p>Clinical live-feed freshness and completeness are unknown. Matches require source review.</p>' : ''}<p>${esc(data.notice || 'Source matches are not factual verification.')}</p></details>`;
          results.querySelectorAll('[data-search-open]').forEach(button => {
            button.addEventListener('click', async () => {
              if (!currentRequest()) return;
              const row = rows[Number(button.dataset.searchOpen)];
              if (!ROUTES.has(row?.route?.view) || typeof openSource !== 'function') return;
              button.disabled = true;
              try { await openSource({ ...row.route, ...(row.route.view === 'workspace' ? { query } : {}) }); }
              catch { if (currentRequest()) toast?.('This source could not be opened. Search again or open its source view.'); }
              finally { if (currentRequest()) button.disabled = false; }
            });
          });
        } catch (error) {
          if (currentRequest()) {
            status.textContent = errorMessage(error);
            results.innerHTML = '';
          }
        } finally {
          if (currentRequest()) {
            submit.disabled = false;
            form.setAttribute('aria-busy', 'false');
          }
        }
      });
    },
  };
}
