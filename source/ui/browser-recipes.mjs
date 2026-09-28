export function createBrowserUI({api,esc,toast}){
 let recipes=[],editing=null;
 const browsers={edge:'Microsoft Edge',chrome:'Google Chrome',firefox:'Firefox (managed automation build)',chromium:'Chromium (managed automation build)',brave:'Brave',vivaldi:'Vivaldi'};
 async function html(){
  recipes=await api('browserRecipes');editing=null;
  return `<div class="page"><h1>Browser reports</h1><p>Run a saved report workflow in your chosen browser without sending its webpage to AI. Each browser uses its own persistent Private AI profile. Your everyday browser profile is not copied or opened.</p>
  <section class="section"><h2>Add or edit a report workflow</h2>
  <label class="field">Browser<select name="recipeBrowser">${Object.entries(browsers).map(([id,name])=>`<option value="${id}">${esc(name)}</option>`).join('')}</select></label>
  <p>Chrome and Edge use their installed versions. Firefox and Chromium need the matching Playwright automation runtime. Brave and Vivaldi use standard Windows installation locations and need compatibility testing after updates. The companion also works in your ordinary Chrome, Edge or Firefox profile.</p>
  <label class="field">Report name<input name="recipeName" maxlength="80"></label>
  <label class="field">HTTPS report page<input name="recipeUrl" type="url"></label>
  <label class="field">Download button selector<input name="recipeSelector" placeholder="button[aria-label='Download report']"></label>
  <label class="field">After sign-in, wait for this control (optional selector)<input name="recipeLogin" placeholder="#signed-in-report-menu"></label>
  <details><summary>Saved passwords and Bitwarden</summary><p>Open the report browser below. Install Bitwarden in that dedicated profile from your browser's official extension store, sign in and unlock it yourself. Use Bitwarden's autofill menu or its configured shortcut (normally Ctrl+Shift+L), or the browser's saved-password prompt, then complete any MFA. Existing sessions are retained in that browser profile.</p><p>Private AI does not read passwords, vault items, cookies or the clipboard, and does not automate unlocking Bitwarden. A sign-in wait pauses for up to five minutes for the control above to appear, then continues the report. Do not put passwords, recovery codes or tokens in workflow steps. Manual setup permits browser and extension network access so you can install and unlock Bitwarden. Automated runs restrict requests to the trusted origins below; add any required login/password-manager service origins. Browser or organization policies may restrict extensions and autofill.</p></details>
  <details><summary>Advanced: additional trusted origins and steps</summary><p>Your IT team can configure precise selectors. The workflow stops when a selector is ambiguous or the page leaves the trusted HTTPS origins.</p>
  <label class="field">Additional HTTPS origins (one per line)<textarea name="recipeOrigins" rows="2"></textarea></label>
  <label class="field">Optional steps before download (JSON)<textarea name="recipeSteps" rows="5" placeholder='[{"op":"fill","selector":"input[name=date]","value":"2026-09-10"}]'></textarea></label></details>
  <div class="button-row"><button data-act="browser-save" class="primary">Save workflow</button><button data-act="browser-open">Open browser to sign in</button><button data-act="browser-close">Close report browser</button></div></section>
  <section class="section"><h2>Saved workflows</h2>${recipes.map(r=>`<div class="card"><b>${esc(r.name)}</b><p>${esc(browsers[r.browser||'edge'])} · ${esc(r.url)}</p><p>Local command: /report ${esc(r.name)}</p><button data-act="browser-edit" data-id="${esc(r.id)}">Edit</button><button data-act="browser-open" data-id="${esc(r.id)}">Sign in</button><button data-act="browser-run" data-id="${esc(r.id)}">Download report</button><button data-act="browser-delete" data-id="${esc(r.id)}">Remove</button></div>`).join('')||'<p>No workflows saved. Exact setup depends on your reporting website.</p>'}</section></div>`;
 }
 function form(){const v=n=>document.querySelector(`[name="${n}"]`).value;return {...(editing?{id:editing}:{}),browser:v('recipeBrowser'),name:v('recipeName'),url:v('recipeUrl'),origins:v('recipeOrigins').split(/\s+/).filter(Boolean),steps:[...(v('recipeLogin').trim()?[{op:'login',selector:v('recipeLogin').trim()}]:[]),...(v('recipeSteps').trim()?JSON.parse(v('recipeSteps')):[]),{op:'download',selector:v('recipeSelector')}]};}
 async function handle(act,id){
  if(act==='browser-edit'){
   const r=recipes.find(r=>r.id===id);if(!r)throw Error('Reload the workflow list.');editing=r.id;
   const values={recipeBrowser:r.browser||'edge',recipeName:r.name,recipeUrl:r.url,recipeOrigins:r.origins.join('\n'),recipeSelector:r.steps.at(-1).selector,recipeLogin:r.steps[0]?.op==='login'?r.steps[0].selector:'',recipeSteps:JSON.stringify(r.steps.slice(r.steps[0]?.op==='login'?1:0,-1),null,2)};
   for(const [name,value] of Object.entries(values))document.querySelector(`[name="${name}"]`).value=value;
  }
  if(act==='browser-save'){await api('browserSave',form());toast('Workflow saved.');}
  if(act==='browser-open'){await api('browserOpen',id?recipes.find(r=>r.id===id):form());toast('Use the browser or Bitwarden to sign in. Keep passwords in the browser.');}
  if(act==='browser-close')await api('browserClose');
  if(act==='browser-delete')await api('browserDelete',{id});
  if(act==='browser-run'){toast('Running the report. Complete browser sign-in if prompted.');const r=await api('browserRun',{id});toast('Saved '+r.relative);}
  return act==='browser-save'||act==='browser-delete';
 }
 return {html,handle};
}
