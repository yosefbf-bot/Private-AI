import {migrateLegacyStorage} from "./legacy-storage.mjs";
import {createTodayUI} from "./snf/today.mjs";
import {createImportCenter} from "./snf/import-center.mjs";
import {responseLayout} from "./response-layout.mjs";
import {createMessagingUI} from "./messaging.mjs";
import {createBrowserUI} from "./browser-recipes.mjs";
import {createHybridUI} from "./hybrid.mjs";
import { marked } from "./vendor/marked.mjs";
import { createAccessUI } from "./access.mjs";
import { VoiceManager } from "./voice.mjs";
import { createSNFUI } from "./snf-ui.mjs";
import { createAutomationCenterUI } from "./automation-center.mjs";
import { createOperationsCopilotUI } from "./operations-copilot.mjs";
const $ = (id) => document.getElementById(id),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
let state,
  chat = null,
  view = "chat",
  pending = [],
  sending = false,
  editing = null,
  toastTimer,
  streamTimer;
function form(title, html, submit = "Save") {
  return new Promise((resolve) => {
    const d = $("modal");
    $("modal-title").textContent = title;
    $("modal-content").innerHTML = html;
    $("modal-submit").textContent = submit;
    const close = (result) => {
      d.close();
      resolve(result);
    };
    $("modal-form").onsubmit = (e) => {
      e.preventDefault();
      close(Object.fromEntries(new FormData(e.target)));
    };
    $("modal-cancel").onclick = () => close(null);
    d.oncancel = (e) => {
      e.preventDefault();
      close(null);
    };
    d.showModal();
    d.querySelector("input,textarea,select")?.focus();
  });
}
function field(label, name, value = "", type = "text", help = "") {
  return `<label class="field">${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${type === "password" ? 'autocomplete="off"' : ""}>${help ? `<small>${help}</small>` : ""}</label>`;
}
function textarea(label, name, value = "") {
  return `<label class="field">${esc(label)}<textarea name="${name}">${esc(value)}</textarea></label>`;
}
function select(label, name, values, value) {
  return `<label class="field">${label}<select name="${name}">${values.map(([v, l]) => `<option value="${v}" ${v === String(value) ? "selected" : ""}>${l}</option>`).join("")}</select></label>`;
}
async function confirmAction(title, message, button = "Continue") {
  return !!(await form(title, `<p>${esc(message)}</p>`, button));
}
function fileChecks(ids = []) {
  return `<details><summary>Include working files</summary>${(state?.files || []).map((f) => `<label class="check"><input type="checkbox" name="file_${f.id}" ${ids.includes(f.id) ? "checked" : ""}> ${esc(f.name)}</label>`).join("") || '<p class="help">Import files first in Files.</p>'}</details>`;
}
function idsFrom(r) {
  return Object.keys(r || {})
    .filter((k) => k.startsWith("file_"))
    .map((k) => k.slice(5));
}
const todayUI=createTodayUI({api,esc,toast,refresh,renderPage});
const importUI=createImportCenter({api,esc,toast});
const snfUI = createSNFUI({ api, toast, esc, renderPage });
const automationUI = createAutomationCenterUI({
  api,
  esc,
  toast,
  refresh,
  renderPage,
  confirmAction,
  form,
  field,
  select,
  textarea,
  fileChecks,
  idsFrom
});
const operationsCopilotUI = createOperationsCopilotUI({
  api,
  esc,
  toast,
  refresh,
  renderPage
});
const formatOptions =
  '<option value="">Save as…</option>' +
  ["pdf", "docx", "xlsx", "csv", "md", "txt"]
    .map((f) => `<option value="${f}">${f.toUpperCase()}</option>`)
    .join("");
async function api(op, data = {}) {
  const r = await window.privateAI.call(op, data);
  if (!r.ok) {
    if (r.error.code === "LOCKED") showLocked();
    throw new Error(r.error.message);
  }
  return r.result;
}
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 6500);
}
async function refresh() {
  state = await api("summary");
  document.body.classList.toggle("advanced",state.settings.uiAdvanced===true);
  voiceTranscriptCache=state.voiceTranscripts||[];
  renderSidebar();
  updateTop();
  const banner=$("development-mode-banner"); if(banner){banner.hidden=!state.developmentMode;banner.textContent=state.modeLabel||"";}
  populateVoiceAgents();
}
function renderChatHistory() {
  if (!state) return;
  const query = ($("search")?.value || "").toLowerCase();
  $("history").innerHTML = (state.chats || [])
    .filter((c) => !c.archived && (!query || c.title.toLowerCase().includes(query)))
    .map(
      (c) =>
        `<button class="chat-item ${chat?.id === c.id ? "active" : ""}" data-act="chat" data-id="${c.id}">${esc(c.title)}</button>`,
    )
    .join("");
}
function renderSidebar() {
  const snfEnabled = state.settings.snfEnabled !== false;
  const alertBar = $("universal-alert-bar");
  if (alertBar) alertBar.style.display = snfEnabled || state.snfAlerts?.critical > 0 ? "" : "none";
  const snfNavBtn = $("snf-sidebar-btn");
  if (snfNavBtn) snfNavBtn.style.display = snfEnabled ? "" : "none";
  snfUI?.updateUniversalAlertBar(state.snfAlerts);
  const updated=new Date(state.buildInfo?.updatedAt||'');
  $('last-updated').textContent='Last updated: '+(Number.isNaN(updated.getTime())?'unavailable':updated.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}));
  renderChatHistory();
  document
    .querySelectorAll("[data-view]")
    .forEach((el) => el.classList.toggle("active", el.dataset.view === view));
}
function updateTop() {
  const resource=state.resources;
  const ram=state.ramProfile||state.health?.ramProfile;
  const ramPart=ram?`Hardware RAM: ${ram.totalGB} GB (${ram.availableGB} GB Free · ${ram.statusBadge}) · `:``;
  if(resource)$('resource-status').textContent=`${ramPart}Background: ${resource.background.state} — ${resource.background.reason||'Working; active phases finish before pausing.'}${resource.browser?' · '+resource.browser+' is open. Close it to free RAM for local reasoning.':''}`;
  const names = {
    today: "Today",
    operations: "📊 Operations Intelligence & Meeting Copilot",
    automation: "⚡ Automation & Agent Center",
    pcc: "PCC Import Center",
    chat: chat?.title || "New chat",
    snf: "🏥 SNF Clinical Surveillance Command Center",
    projects: "Projects",
    agents: "Agents",
    schedules: "Scheduled tasks",
    files: "Files",
    apps: "Apps",
    worker: "Worker",
    settings: "Settings",
    processing:"AI Processing",usage:"API Usage",messaging:"Messaging",
    memory: "Memory",health:"Health & recovery",guide:"User guide",
  };
  $("view-title").textContent = names[view] || "Private AI";
  const provNames = Object.fromEntries(Object.values(state.providers || {}).map(p => [p.id, p.name]));
  const modeName = ({"smart-hybrid":"Smart Hybrid","local-first":"Local First","cloud-first":"Cloud First","local-only":"Local Only"}[state.settings.processingMode] || "Smart Hybrid");
  const activeProv = state.settings.provider || (state.keySaved ? "openai" : "local");
  $("model-label").textContent = `${modeName} · ${provNames[activeProv] || activeProv}`;
  const hipaa =
    chat && view === "chat"
      ? chat.hipaa || state.settings.hipaa
      : state.settings.hipaa;
  $("top-actions").innerHTML =
    `<button class="primary" data-act="pause-worker">${state.settings.workerPaused?'Resume background work':'Pause background work'}</button>` +
    `<button data-act="view" data-view="health">Health &amp; recovery</button>` +
    `<button data-act="shortcuts" class="shortcuts-help-btn" id="shortcuts-help-btn" title="Keyboard Shortcuts (?)">? Shortcuts</button>` +
    `<span class="badge ${hipaa ? "" : "public"}">${hipaa ? "HIPAA mode" : "Public mode"}</span>` +
    (view === "chat" && chat
      ? `${chat.temporary ? '<button data-act="save-temp">Save chat</button>' : '<button data-act="rename">Rename</button>'}<button data-act="delete-chat" title="Delete chat">Delete</button>`
      : "");
  $("compose").hidden = view !== "chat";
  $("web").disabled = hipaa || state.settings.processingMode==="local-only" || !state.settings.allowCloud;
  if ($("web").disabled) $("web").checked = false;
  $("composer-note").textContent = chat?.temporary
    ? "Temporary chat · Removed when closed · Explicit exports remain."
    : "Private AI can make mistakes. Review important information.";
  const isLocal = activeProv === "local" || activeProv === "ollama";
  const incomplete = state.settings.processingMode==="cloud-first" && !isLocal && (!state.keySaved || !state.settings.model || (state.settings.hipaa && !state.settings.approved));
  $("notice").hidden = !incomplete;
  $("notice").innerHTML =
    'Finish your API and privacy setup before sending. <button data-act="view" data-view="settings">Open Settings</button>';
}
const _mdCache = new Map();
const md = (text) => {
  if (!text) return "";
  if (_mdCache.has(text)) return _mdCache.get(text);
  const result = DOMPurify.sanitize(marked.parse(text), {
    FORBID_TAGS: [
      "img",
      "iframe",
      "form",
      "input",
      "button",
      "style",
      "script",
      "svg",
      "math",
      "video",
      "audio",
    ],
    FORBID_ATTR: ["style", "src", "srcset", "id"],
    ALLOW_DATA_ATTR: false,
  });
  if (_mdCache.size > 200) {
    const firstKey = _mdCache.keys().next().value;
    _mdCache.delete(firstKey);
  }
  _mdCache.set(text, result);
  return result;
};
function attachCodeCopyButtons() {
  const content = $("content");
  if (!content) return;
  for (const pre of content.querySelectorAll(".message-body pre")) {
    if (pre.querySelector(".code-copy-btn")) continue;
    const btn = document.createElement("button");
    btn.className = "code-copy-btn";
    btn.type = "button";
    btn.textContent = "Copy";
    btn.title = "Copy code to clipboard";
    btn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const code = pre.querySelector("code")?.innerText || pre.innerText;
      try {
        await api("copy", { text: code });
        btn.textContent = "✓ Copied";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = "Copy";
          btn.classList.remove("copied");
        }, 2000);
      } catch {
        btn.textContent = "Failed";
      }
    };
    pre.appendChild(btn);
  }
}
let responseTimer = null;
let responseStartTime = null;

function estimateResponseTime(promptText = "", options = {}) {
  const s = state?.settings || {};
  const provider = s.provider || (state?.keySaved ? "openai" : "local");
  const model = s.model || "";
  const reasoning = s.reasoning || "default";
  const web = options.web ?? ($("web")?.checked ?? false);
  const filesCount = options.filesCount ?? (pending?.length || 0);
  const chars = (promptText || "").length;

  let baseMin = 1.0;
  let baseMax = 2.6;

  if (provider === "groq") {
    baseMin = 0.5;
    baseMax = 1.4;
  } else if (provider === "gemini") {
    baseMin = 0.8;
    baseMax = 2.0;
  } else if (provider === "local" || provider === "ollama") {
    baseMin = 1.2;
    baseMax = 2.8;
  } else if (provider === "anthropic") {
    baseMin = 1.8;
    baseMax = 4.0;
  } else if (provider === "deepseek") {
    baseMin = 2.0;
    baseMax = 4.8;
  } else if (provider === "openai") {
    if (model.includes("mini")) {
      baseMin = 0.8;
      baseMax = 1.8;
    } else if (model.includes("o1") || model.includes("o3")) {
      baseMin = 3.5;
      baseMax = 8.5;
    } else {
      baseMin = 1.5;
      baseMax = 3.4;
    }
  }

  if (reasoning === "xhigh" || reasoning === "high") {
    baseMin += 2.0;
    baseMax += 5.0;
  } else if (reasoning === "medium") {
    baseMin += 0.8;
    baseMax += 2.0;
  }

  if (web) {
    baseMin += 1.0;
    baseMax += 2.2;
  }

  if (filesCount > 0) {
    baseMin += 0.3 * filesCount;
    baseMax += 0.9 * filesCount;
  }

  if (chars > 1200) {
    const extra = Math.min(2.5, Math.floor(chars / 1200) * 0.4);
    baseMin += extra;
    baseMax += extra * 1.3;
  }

  const minFormatted = (Math.round(baseMin * 10) / 10).toFixed(1);
  const maxFormatted = (Math.round(baseMax * 10) / 10).toFixed(1);

  return {
    min: Number(minFormatted),
    max: Number(maxFormatted),
    label: `~${minFormatted}–${maxFormatted}s`
  };
}

function updateResponseTimeEstimate() {
  const el = $("response-time-est");
  if (!el) return;
  const promptVal = $("prompt")?.value || "";
  const est = estimateResponseTime(promptVal);
  if (!sending) {
    el.textContent = `⏱ Est. ${est.label}`;
    el.title = `Estimated response duration for ${state?.settings?.provider || 'local'} (${state?.settings?.model || 'default'}): ${est.min}s to ${est.max}s based on prompt size, reasoning level, and active tools`;
  }
}

function startResponseTimer(est) {
  responseStartTime = Date.now();
  const statusEl = $("compose-status");
  const estEl = $("response-time-est");
  if (estEl) estEl.classList.add("generating");

  if (responseTimer) clearInterval(responseTimer);
  responseTimer = setInterval(() => {
    if (!sending) {
      clearInterval(responseTimer);
      return;
    }
    const elapsed = ((Date.now() - responseStartTime) / 1000).toFixed(1);
    if (statusEl) {
      statusEl.textContent = `⏱ Responding... ${elapsed}s (${est.label})`;
    }
    if (estEl) {
      estEl.textContent = `⏱ ${elapsed}s / ${est.label}`;
    }
  }, 100);
}

function stopResponseTimer() {
  if (responseTimer) {
    clearInterval(responseTimer);
    responseTimer = null;
  }
  const estEl = $("response-time-est");
  if (estEl) estEl.classList.remove("generating");
  updateResponseTimeEstimate();
}

function autoResizePrompt() {
  const p = $("prompt");
  if (!p) return;
  p.style.height = "auto";
  const h = Math.min(Math.max(p.scrollHeight, 44), 220);
  p.style.height = `${h}px`;
}
function renderChat() {
  view = "chat";
  updateTop();
  renderSidebar();
  updateResponseTimeEstimate();
  if (!chat || !chat.messages.length) {
    $("content").innerHTML =
      `<div class="welcome"><img src="icon.png" alt=""><h1>What would you like to work on?</h1><p>Chat, review documents, and prepare reports.<br>Your history stays on this PC.</p><div class="suggestions"><button data-act="suggest" data-text="Help me draft a clear, professional report."><b>Draft a report</b><span>Turn notes into something ready to share</span></button><button data-act="attach"><b>Review a document</b><span>Attach a PDF, Word, or Excel file</span></button><button data-act="suggest" data-text="Help me compare the information in my attached files."><b>Compare information</b><span>Find differences and useful details</span></button><button data-act="view" data-view="schedules"><b>Prepare a scheduled report</b><span>Let a Worker PC handle recurring work</span></button></div></div>`;
    return;
  }
  $("content").innerHTML =
    (chat.temporary?'':'<button data-act="chat-archive">Archive this chat</button>') + '<div class="conversation">' +
    chat.messages
      .map(
        (m, i) =>
          `<article class="message ${m.role}" data-index="${i}">${m.role === "assistant" ? `<div class="message-label"><img src="icon.png" alt="">Private AI${m.durationMs ? `<span class="message-duration advanced-only ${m.durationMs < 2000 ? 'fast' : m.durationMs < 5000 ? 'moderate' : 'extended'}" title="Response completed in ${(m.durationMs / 1000).toFixed(1)}s">⏱ ${(m.durationMs / 1000).toFixed(1)}s</span>` : ''}</div>` : ""}<div class="message-body">${m.role === "user" ? esc(m.text) : md(responseLayout(m.text).body)}</div>${m.role === "assistant" && responseLayout(m.text).footnotes.length ? `<footer class="response-footnotes" aria-label="Response notes">${responseLayout(m.text).footnotes.map(note=>`<div>${esc(note)}</div>`).join("")}</footer>` : ""}${m.page ? '<span class="pill">Page included by request</span>' : ""}${m.fileIds?.length ? `<span class="pill">${m.fileIds.length} attached file(s)</span>` : ""}${m.error ? `<div class="error-note">${esc(m.error.message)}</div>` : ""}${m.incomplete ? '<div class="error-note">The response reached the output limit. Ask to continue, or increase the limit in Settings.</div>' : ""}<div class="message-actions">${m.role === "user" ? `<button data-act="edit" data-index="${i}">Edit</button>` : `<button data-act="copy" data-index="${i}">Copy</button><select aria-label="Save response as" data-export="${i}">${formatOptions}</select>${i === chat.messages.length - 1 ? '<button data-act="regenerate">Regenerate</button>' : ""}`}</div>${m.processing ? `<details class="response-details"><summary>Details</summary><div class="usage">${esc(m.processing.provider)} · ${esc(m.processing.model)}${m.durationMs ? ` · ⏱ ${(m.durationMs / 1000).toFixed(1)}s` : ''} · Evidence checks: ${esc(m.processing.reliability?.label||"not independently verified")} · API ${m.processing.meter?.estimatedCost===null?"cost unknown":"$"+(m.processing.meter?.estimatedCost||0).toFixed(5)}${m.processing.localReliability!==null&&m.processing.localReliability!==undefined?" · Local score before escalation: "+m.processing.localReliability:""}<details><summary>Evidence checks and routing</summary>${esc(m.processing.reason?.replaceAll("_"," "))}<br>${esc(m.processing.reliability?.reasons?.join(" ")||"")}</details></div></details>` : ""}${m.usage ? `<details class="response-details"><summary>Token usage</summary><div class="usage">${m.usage.inputTokens.toLocaleString()} input · ${m.usage.outputTokens.toLocaleString()} output tokens</div></details>` : ""}</article>`,
      )
      .join("") +
    "</div>";
  for(const article of $('content').querySelectorAll('article.message')){
    const route=chat.messages[Number(article.dataset.index)]?.processing?.routing,details=article.querySelector('.usage details');
    if(route&&details){const info=document.createElement('p');info.textContent=`Local tier recommended: ${route.recommendedTier||'none'}; used: ${route.selectedTier||'none'}. ${route.attempts.map(a=>`${a.tier} ${a.phase}: ${a.status}${a.code?' ('+a.code+')':''}`).join(' → ')}. ${route.notice||''}`;details.appendChild(info);}
  }
  attachCodeCopyButtons();
  if (sending)
    $("content")
      .querySelector(".message:last-child .message-body")
      ?.classList.add("streaming");
}
function renderAttachments() {
  $("attachments").innerHTML = pending
    .map(
      (f) =>
        `<button class="file-chip" data-act="remove-attachment" data-id="${f.id}" title="Remove attachment">▧ ${esc(f.name)} ×</button>`,
    )
    .join("");
}
let guideData;
async function renderGuide(){
  $("content").innerHTML='<div class="page"><h1>User guide</h1><p>Opening the bundled guide…</p></div>';
  try{
    guideData=guideData||await api('userGuide');
    if(view!=='guide')return;
    $("content").innerHTML=`<div class="page guide-page"><img class="guide-logo" src="logo.png" alt="Private AI"><h1>User guide</h1><p class="subtitle">Private AI ${esc(guideData.version)} · Available offline · No model or API needed</p><p>Search a feature below, or ask a how-to question in chat. These instructions stay with the app.</p><label class="field">Find a topic<input id="guide-search" type="search" placeholder="Try RAM, ShareSync, schedules, or privacy" autocomplete="off"></label><p id="guide-count" class="help" aria-live="polite"></p><div id="guide-topics"></div></div>`;
    const search=$('guide-search');search.addEventListener('input',()=>renderGuideTopics(search.value));renderGuideTopics('');
  }catch(e){if(view==='guide')$("content").innerHTML=`<div class="page"><h1>User guide</h1><p>${esc(e.message)}</p></div>`;}
}
function renderGuideTopics(query){
  const words=query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const topics=guideData.topics.filter(t=>words.every(w=>[t.title,t.location,...t.aliases,...t.steps,t.note].join(' ').toLowerCase().includes(w)));
  $('guide-count').textContent=`${topics.length} of ${guideData.topics.length} topics`;
  $('guide-topics').innerHTML=topics.length?topics.map(t=>`<details class="guide-topic" ${words.length||t.id==='start'?'open':''}><summary>${esc(t.title)}</summary><p class="guide-location">${esc(t.location)}</p><ol>${t.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol><p class="guide-note">${esc(t.note)}</p><button class="secondary" data-act="guide-ask" data-topic="${esc(t.id)}">Ask in chat about this</button></details>`).join(''):'<p>No matching topic. Try fewer words. The guide does not describe every possible task.</p>';
}
async function newChat(temporary = false, project = null) {
  if (sending) {
    toast("Stop the current response first.");
    return;
  }
  if (chat?.temporary) await api("endTemporary", { id: chat.id });
  chat = await api("createChat", { temporary, project });
  pending = [];
  editing = null;
  $("prompt").value = "";
  autoResizePrompt();
  renderAttachments();
  await refresh();
  renderChat();
  $("prompt").focus();
}
async function openChat(id) {
  if (sending) {
    toast("Stop the current response first.");
    return;
  }
  if (chat?.temporary) await api("endTemporary", { id: chat.id });
  chat = await api("chat", { id });
  $("prompt").value=chat.draft||"";
  autoResizePrompt();
  pending = [];
  editing = null;
  renderAttachments();
  renderChat();
}
async function attach() {
  if (!chat) await newChat();
  const files = await api("pickFiles", {
    temporaryChat: chat.temporary ? chat.id : null,
    chatId: chat.id,
  });
  pending = [...pending, ...files].slice(0, 6);
  renderAttachments();
  await refresh();
}
async function send(regenerate = false) {
  if (sending) return;
  const prompt = $("prompt").value.trim();
  if (!regenerate && !prompt) return;
  if (!chat) chat = await api("createChat", {});
  sending = true;
  const savedPrompt = prompt;
  clearTimeout(draftTimer);
  if(!chat.temporary)await api("saveDraft",{id:chat.id,text:""});
  $("send").hidden = true;
  $("stop").hidden = false;
  $("prompt").disabled = true;
  $("attach").disabled = true;
  const args = {
    chatId: chat.id,
    forwardMessaging: $("task-forward").value,
    prompt,
    fileIds: pending.map((f) => f.id),
    web: $("web").checked,
    editIndex: editing,
    regenerate,
  };
  if (!regenerate) {
    if (editing !== null) chat.messages = chat.messages.slice(0, editing);
    chat.messages.push({ role: "user", text: prompt, fileIds: args.fileIds });
  } else {
    let index = chat.messages.length - 1;
    while (index >= 0 && chat.messages[index].role !== "user") index--;
    chat.messages = chat.messages.slice(0, index + 1);
  }
  chat.messages.push({ role: "assistant", text: "" });
  renderChat();
  $("prompt").value = "";
  autoResizePrompt();
  pending = [];
  renderAttachments();
  const promptForEst = prompt || (regenerate ? (chat.messages.filter(m => m.role === "user").slice(-1)[0]?.text || "") : "");
  const est = estimateResponseTime(promptForEst, { web: args.web, filesCount: args.fileIds.length });
  const sendStart = Date.now();
  startResponseTimer(est);
  try {
    $("task-forward").value = "default";
    const result = await api("send", args);
    chat = result.chat;
    const lastMsg = chat?.messages?.at(-1);
    if (lastMsg && lastMsg.role === "assistant" && !lastMsg.durationMs) {
      lastMsg.durationMs = Date.now() - sendStart;
    }
    if (result.omitted)
      toast(
        "Older messages were left out of this request to keep usage bounded. They remain in your history.",
      );
  } catch (e) {
    toast(e.message);
    $("prompt").value = savedPrompt;
    try {
      chat = await api("chat", { id: chat.id });
    } catch {}
  } finally {
    stopResponseTimer();
    const elapsedSec = ((Date.now() - sendStart) / 1000).toFixed(1);
    sending = false;
    editing = null;
    $("send").hidden = false;
    $("stop").hidden = true;
    $("prompt").disabled = false;
    $("attach").disabled = false;
    $("compose-status").textContent = `✓ Response in ${elapsedSec}s`;
    setTimeout(() => {
      if ($("compose-status") && $("compose-status").textContent.startsWith("✓")) {
        $("compose-status").textContent = "";
      }
    }, 4500);
    await refresh().catch(() => {});
    if (view === "chat") renderChat();
    $("content").scrollTop = $("content").scrollHeight;
    $("prompt").focus();
  }
}
window.privateAI.onEvent((event) => {
  if (event.type === "reminder_due") {
    const list = (event.items || []).map(i => i.title).join(", ");
    toast("⏰ Reminder due: " + (list || "Action item"));
    refresh().then(() => { if (view === "todos") renderPage("todos"); }).catch(() => {});
  }
  if (event.type === "todos_changed") {
    refresh().then(() => { if (view === "todos") renderPage("todos"); }).catch(() => {});
  }
  if(event.type==="model-download"){const e=document.getElementById("model-progress");if(e)e.textContent=event.error?.message||event.state+(event.total?" · "+Math.round(event.received/event.total*100)+"%":"");}

  if(event.type==="model-download"&&event.state==="selected")refresh().then(()=>{if(view==="processing")renderPage("processing");}).catch(e=>toast(e.message));
  if(event.type==="local-status"&&view==="processing")api('localStatus').then(({brain,routing})=>{
    const route=document.getElementById('tier-routing-state');if(route)route.textContent=`${routing?.phase||'idle'}${routing?.tier?' · '+routing.tier:''}`;
    const name=document.getElementById('active-brain-name');if(name)name.textContent=brain.model||'';
    const label=document.getElementById('local-brain-state'),error=document.getElementById('local-brain-error');
    if(label)label.textContent=brain.state;
    const ram=document.getElementById('local-brain-memory');if(ram)ram.textContent=brain.availableMemoryGB??'—';
    if(error)error.textContent=brain.error?[brain.error.message,brain.error.code,brain.error.exitCode].filter(Boolean).join(' · '):'';
  }).catch(()=>{});
  if (event.type === "delta" && chat?.id === event.chatId) {
    const m = chat.messages.at(-1);
    if (m?.role === "assistant") m.text += event.delta;
    if (!streamTimer)
      streamTimer = setTimeout(() => {
        streamTimer = null;
        if (view !== "chat" || !sending) return;
        const el = $("content").querySelector(
          ".message:last-child .message-body",
        );
        if (el) {
          const nearBottom =
            $("content").scrollHeight -
              $("content").scrollTop -
              $("content").clientHeight <
            180;
          el.innerHTML = md(responseLayout(chat.messages.at(-1).text).body);
          el.classList.add("streaming");
          attachCodeCopyButtons();
          if (nearBottom) $("content").scrollTop = $("content").scrollHeight;
        }
      }, 45);
  } else if (event.type === "locked") showLocked();
  else if (event.type === "unlocked") init();
  else if (event.type === "jobs_changed") {
    refresh()
      .then(() => {
        if (["worker", "schedules"].includes(view)) renderPage(view);
      })
      .catch(() => {});
  }
});
const messagingUI=createMessagingUI({api,esc,toast,refresh,state:()=>state});
const browserUI=createBrowserUI({api,esc,toast});
const hybridUI=createHybridUI({api,refresh,esc,state:()=>state,toast,render:renderPage});
const accessUI = createAccessUI({
  api,
  form,
  field,
  textarea,
  select,
  esc,
  toast,
  state: () => state,
  refreshApps: async () => {
    await refresh();
    renderPage("apps");
  },
  lastAnswer: () =>
    chat?.messages?.findLast((m) => m.role === "assistant")?.text || "",
  answerReference: () => {
    const index =
      chat?.messages?.findLastIndex((m) => m.role === "assistant") ?? -1;
    return index < 0 ? null : { chatId: chat.id, index };
  },
  useReference: async (result) => {
    await refresh();
    chat = result.chat;
    view = "chat";
    pending = [result.file];
    renderChat();
    renderAttachments();
  },
  importFolderFile: async (id, relative) => {
    await newChat();
    const f = await api("folderImport", { id, relative, chatId: chat.id });
    pending = [f];
    await refresh();
    renderChat();
    renderAttachments();
  },
});
function healthHTML(){
  const h=state.health||{},s=state.settings,r=state.resources||{};
  const ram=state.ramProfile||h.ramProfile||{totalGB:h.totalRAMGB||16,availableGB:h.availableRAMGB||3,profile:'conservative',statusBadge:'Conservative Mode (Compact Models)',description:'Host RAM is conserved for background clinical apps.',tierCap:'medium',keepAlive:'0s',threadBudget:4,recommendedModels:state.providers?.ollama?.ramModels?.conservative||[]};
  return `<div class="page"><h1>Health &amp; recovery</h1><p>Private AI ${esc(h.version)} · ${h.safeStartup?'Safe startup after an unclean exit. Background work is paused.':'Startup state recorded.'}</p>
  <section class="section">
    <h2>Hardware Memory &amp; Upgrade Awareness</h2>
    <div class="card" style="border-left: 4px solid #2563eb">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
        <strong>Live System Memory: ${esc(ram.totalGB)} GB Installed (${esc(ram.availableGB)} GB Available)</strong>
        <span class="badge ${ram.profile==='expanded'?'success':ram.profile==='balanced'?'info':'warning'}">${esc(ram.statusBadge)}</span>
      </div>
      <p style="margin:4px 0 8px">${esc(ram.description)}</p>
      <div style="font-size:13px; line-height:1.6">
        <div>• <strong>Auto-Tier Ceiling:</strong> <strong>${esc(ram.tierCap?.toUpperCase())}</strong> (protects against system lockups and high memory paging)</div>
        <div>• <strong>Memory Cache (keep_alive):</strong> <strong>${esc(ram.keepAlive)}</strong> ${ram.keepAlive==='0s'?'(cleans memory immediately to prevent laptop lag)':'(maintains warm model for instant follow-ups)'}</div>
        <div>• <strong>CPU Threads:</strong> <strong>${esc(ram.threadBudget)}</strong> worker threads (keeps foreground clinical apps responsive)</div>
        <div>• <strong>Optimal Local Models:</strong> ${esc((ram.recommendedModels||[]).join(', '))}</div>
      </div>
      <p style="margin-top:10px; font-size:12px; color:var(--text-muted, #555); background:rgba(37,99,235,0.08); padding:10px 14px; border-radius:6px; border:1px solid rgba(37,99,235,0.18)">
        <strong>RAM detection:</strong> Private AI checks installed and available RAM on startup. Model eligibility also depends on current memory pressure, configured limits and the installed runtime; review settings after a hardware change.
      </p>
    </div>
  </section>
  <section class="section"><h2>Resources</h2><p>${esc(h.availableRAMGB)} GB available of ${esc(h.totalRAMGB)} GB RAM · App process: ${esc(h.appMemoryMB)} MB</p><p>Brain: ${esc(state.localBrain?.model)} — ${esc(state.localBrain?.state)}. Model cooldown: ${esc(h.modelCooldownSeconds)} seconds.</p><p>Background: ${esc(r.background?.state)} — ${esc(r.background?.reason)}</p><div class="fields"><label class="field">PC use profile<select name="workProfile"><option value="work" ${s.workProfile==='work'?'selected':''}>Work — balanced CPU</option><option value="away" ${s.workProfile==='away'?'selected':''}>Away — configured CPU setting</option></select></label>${field('Keep free RAM (MB)','ramReserveMB',s.ramReserveMB,'number')}${field('RAM recovery delay (seconds)','ramRecoverySeconds',s.ramRecoverySeconds,'number')}${field('Keep loaded brain for follow-ups (minutes; 0 = Small first)','keepBrainMinutes',s.keepBrainMinutes,'number')}</div><label class="check"><input type="checkbox" name="sectionedReports" ${s.sectionedReports?'checked':''}> Allow section-by-section processing for oversized report jobs (up to 12 sections; additional inference and possible API charges)</label><p>Away does not enable jobs, allow cloud use, or approve desktop input. After sleep or an unclean exit, resume background work manually. Windows peak working-set readings can increase later RAM budgets; they never lower the existing estimate. Other RAM observations reflect system changes.</p><button data-act="health-save">Save stability settings</button> <button data-act="health-refresh">Refresh health</button> <button data-act="health-ack">Acknowledge startup notice</button></section><section class="section"><h2>Diagnostics</h2><p>No prompts, document contents, credentials, file paths, or device names are included. Review the saved technical report before sharing it.</p><button data-act="self-check">Run local checks</button> <button data-act="diagnostics">Export diagnostics</button><p>Recent technical events: ${esc((h.events||[]).map(e=>e.event).join(', ')||'None this session')}</p></section>${jobsHTML()}</div>`;}
// ============================================================================
// KEYBOARD SHORTCUTS MANAGER
// ============================================================================
const DEFAULT_SHORTCUTS = [
  { id: "newChat", label: "New Chat", defaultKey: "Ctrl+K", desc: "Start a fresh chat conversation" },
  { id: "voiceToggle", label: "Voice Mode", defaultKey: "Ctrl+Shift+V", desc: "Toggle hands-free / push-to-talk voice assistant" },
  { id: "sendPrompt", label: "Send Message", defaultKey: "Enter", desc: "Send prompt composer input to Private AI" },
  { id: "multiline", label: "New Line in Composer", defaultKey: "Shift+Enter", desc: "Insert a new line into the prompt without sending" },
  { id: "stopOrClose", label: "Stop Response / Close Modal", defaultKey: "Escape", desc: "Interrupt generation or dismiss voice/dialog modals" },
  { id: "showShortcuts", label: "Keyboard Shortcuts Help", defaultKey: "?", desc: "Display this shortcuts reference modal" }
];

function getShortcuts() {
  try {
    const raw = localStorage.getItem("private_ai_shortcuts");
    if (!raw) return DEFAULT_SHORTCUTS;
    const custom = JSON.parse(raw);
    return DEFAULT_SHORTCUTS.map(def => {
      const match = custom.find(c => c.id === def.id);
      return match ? { ...def, ...match } : def;
    });
  } catch {
    return DEFAULT_SHORTCUTS;
  }
}

function saveShortcuts(shortcuts) {
  try {
    localStorage.setItem("private_ai_shortcuts", JSON.stringify(shortcuts));
  } catch (e) {
    console.warn("Failed to save shortcuts:", e);
  }
}

function matchShortcut(e, shortcutId) {
  const shortcuts = getShortcuts();
  const sc = shortcuts.find(s => s.id === shortcutId);
  if (!sc || sc.enabled === false) return false;
  
  const keyStr = (sc.currentKey || sc.defaultKey || "").toLowerCase();
  const parts = keyStr.split("+").map(p => p.trim());
  
  const reqCtrl = parts.includes("ctrl") || parts.includes("cmd");
  const reqShift = parts.includes("shift");
  const reqAlt = parts.includes("alt");
  const mainKey = parts.filter(p => !["ctrl", "cmd", "shift", "alt"].includes(p))[0];
  
  const ctrlPressed = e.ctrlKey || e.metaKey;
  if (Boolean(reqCtrl) !== Boolean(ctrlPressed)) return false;
  if (Boolean(reqShift) !== Boolean(e.shiftKey)) return false;
  if (Boolean(reqAlt) !== Boolean(e.altKey)) return false;
  
  if (!mainKey) return false;
  if (mainKey === "?" && (e.key === "?" || (e.shiftKey && e.key === "/"))) return true;
  if (mainKey === "escape" && e.key === "Escape") return true;
  if (mainKey === "enter" && e.key === "Enter") return true;
  if (mainKey === "space" && (e.code === "Space" || e.key === " ")) return true;
  return e.key.toLowerCase() === mainKey.toLowerCase();
}

async function showShortcutsModal() {
  const shortcuts = getShortcuts();
  const html = `
    <div class="shortcuts-modal-container">
      <p style="margin-top:0; margin-bottom:14px; font-size:13px; color:var(--text-muted, #64748b);">
        View and manage keyboard shortcuts. Enable or adjust key combinations to match your workflow.
      </p>
      <div class="shortcuts-list" style="display:flex; flex-direction:column; gap:8px; max-height:55vh; overflow-y:auto; padding-right:4px;">
        ${shortcuts.map((sc) => `
          <div class="shortcut-row" style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:var(--bg-subtle, rgba(0,0,0,0.02)); border:1px solid var(--border-color, #e2e8f0); border-radius:6px;">
            <div style="flex:1; margin-right:12px;">
              <div style="font-weight:600; font-size:13px; display:flex; align-items:center; gap:8px;">
                <span>${esc(sc.label)}</span>
                <span class="shortcut-kbd-badge">${esc(sc.currentKey || sc.defaultKey)}</span>
              </div>
              <div style="font-size:12px; color:var(--text-muted, #64748b); margin-top:2px;">${esc(sc.desc)}</div>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <label style="display:flex; align-items:center; gap:4px; font-size:12px; margin:0; cursor:pointer;">
                <input type="checkbox" name="enabled_${sc.id}" ${sc.enabled !== false ? 'checked' : ''}>
                Enabled
              </label>
              <input type="text" name="key_${sc.id}" value="${esc(sc.currentKey || sc.defaultKey)}" style="width:115px; padding:4px 8px; font-size:12px; font-family:monospace; text-align:center; border:1px solid var(--border-color, #cbd5e1); border-radius:4px;" title="Format: e.g. Ctrl+K, Ctrl+Shift+V, Enter, Escape">
            </div>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:16px; display:flex; justify-content:space-between; align-items:center;">
        <button type="button" class="secondary" id="shortcuts-reset-btn" style="font-size:12px;">↺ Reset to Defaults</button>
        <span style="font-size:11px; color:var(--text-muted, #64748b);">Format: Ctrl, Shift, Alt + Key</span>
      </div>
    </div>
  `;

  const d = $("modal");
  $("modal-title").textContent = "⌨️ Keyboard Shortcuts";
  $("modal-content").innerHTML = html;
  $("modal-submit").textContent = "Save Shortcuts";
  $("modal-cancel").textContent = "Close";

  const resetBtn = $("modal-content").querySelector("#shortcuts-reset-btn");
  if (resetBtn) {
    resetBtn.onclick = () => {
      localStorage.removeItem("private_ai_shortcuts");
      showShortcutsModal();
    };
  }

  return new Promise((resolve) => {
    const close = () => {
      d.close();
      resolve(null);
    };
    $("modal-form").onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const updated = shortcuts.map(sc => {
        const keyVal = (fd.get(`key_${sc.id}`) || sc.defaultKey).toString().trim();
        const enabled = fd.get(`enabled_${sc.id}`) !== null;
        return {
          ...sc,
          currentKey: keyVal,
          enabled
        };
      });
      saveShortcuts(updated);
      toast("Keyboard shortcuts saved.");
      close();
    };
    $("modal-cancel").onclick = close;
    d.oncancel = (e) => {
      e.preventDefault();
      close();
    };
    d.showModal();
  });
}

// ============================================================================
// BACKGROUND AUTOSAVE (2-minute interval to conserve resources)
// ============================================================================
const AUTOSAVE_STORAGE_KEY = "private_ai_chat_autosave";
const AUTOSAVE_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes (resource conservation)
let autosaveTimer = null;

async function autosaveChatState(){
  if(chat&&!chat.temporary) await api('saveDraft',{id:chat.id,text:$('prompt')?.value||''}).catch(()=>{});
}
function initAutosave(){
  // Drafts already use encrypted Store through saveDraft; remove unsafe legacy copies.
  // Legacy recovery is completed by migrateLegacyStorage during init.
  if(autosaveTimer)clearInterval(autosaveTimer);
}

// ============================================================================
// VOICE-TO-TEXT TRANSCRIPTS LOGGING & REVIEW
// ============================================================================
const VOICE_TRANSCRIPTS_KEY = "private_ai_voice_transcripts";

let voiceTranscriptCache=[];
function getVoiceTranscripts(){return voiceTranscriptCache.map(t=>({...t,dateStr:new Date(t.timestamp).toLocaleString(),wordCount:t.text.split(/\s+/).length}));}
function logVoiceTranscript({text,mode='Voice Mode'}){
  if(!text?.trim()||chat?.temporary)return;
  api('voiceTranscriptSave',{text,mode}).then(entry=>{if(entry)voiceTranscriptCache.unshift(entry);}).catch(e=>toast(e.message));
}

function renderVoiceTranscriptsList() {
  const transcripts = getVoiceTranscripts();
  if (!transcripts.length) {
    return `
      <div class="voice-transcript-empty" style="padding:24px; background:var(--bg-subtle, rgba(0,0,0,0.02)); border:1px dashed var(--border-color, #cbd5e1); border-radius:8px; text-align:center; color:#64748b; font-size:13px;">
        <p style="margin:0 0 4px 0; font-weight:600; color:var(--text-color, #334155);">No voice transcripts recorded yet</p>
        <span style="font-size:12px;">Transcripts from live Voice Mode (<kbd>Ctrl+Shift+V</kbd>) or speech dictations will automatically appear here for clinical and conversational review.</span>
      </div>
    `;
  }
  return `
    <div class="voice-transcripts-items" style="display:flex; flex-direction:column; gap:10px; max-height:480px; overflow-y:auto; padding-right:4px;">
      ${transcripts.map(t => `
        <div class="voice-transcript-card" style="border:1px solid var(--border-color, #e2e8f0); border-radius:8px; padding:12px 14px; background:var(--card-bg, #fff); box-shadow:0 1px 2px rgba(0,0,0,0.03);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:12px; color:#64748b;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="badge" style="background:#e0f2fe; color:#0369a1; font-weight:600;">🎙 ${esc(t.mode)}</span>
              <span><strong>${esc(t.dateStr)}</strong></span>
              <span>· ${t.wordCount} words</span>
            </div>
            <div style="display:flex; gap:6px;">
              <button type="button" class="secondary" style="padding:3px 8px; font-size:11px;" data-act="copy-transcript" data-id="${esc(t.id)}">📋 Copy</button>
              <button type="button" class="secondary" style="padding:3px 8px; font-size:11px;" data-act="use-transcript" data-id="${esc(t.id)}">💬 Insert in Chat</button>
              <button type="button" class="danger" style="padding:3px 8px; font-size:11px;" data-act="delete-transcript" data-id="${esc(t.id)}">✕</button>
            </div>
          </div>
          <div style="font-size:13.5px; line-height:1.6; color:var(--text-color, #1e293b); word-break:break-word;">
            ${esc(t.text)}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function settingsHTML() {
  const s = state.settings;
  const currentProvider = s.provider || (state.keySaved ? "openai" : "local");
  const provs = state.providers;
  if (!provs) return `<div class="page error-note">Provider registry unavailable. Reload the application.</div>`;
  const activeProv = provs[currentProvider] || provs.local;
  const hasKey = currentProvider === "local" || currentProvider === "ollama" ? true : !!(state.savedProviders && state.savedProviders[currentProvider]);

  let providerSection = "";
  if (currentProvider === "local") {
    providerSection = `
      <div class="provider-box">
        <div class="provider-badge success">✓ Active: Running 100% Locally on this PC (No API Key Required)</div>
        <p class="provider-desc">Private AI operates offline with zero cloud API keys, zero network data transmission, and zero subscription or token costs. Geriatric and nursing home clinical guidelines, Beers criteria, SBAR triage, regulatory lookups, task automation, and deterministic tools operate securely on your PC.</p>
        <div class="button-row">
          <button class="secondary" data-act="test-api">Test Local Engine</button>
        </div>
      </div>
      <label class="field">Active Local Engine
        <input name="model" list="model-list" value="${esc(s.model || 'local-knowledge-engine')}" placeholder="local-knowledge-engine">
        <datalist id="model-list">
          <option value="local-knowledge-engine"></option>
          <option value="local-clinical-engine"></option>
          <option value="local-rules-engine"></option>
        </datalist>
        <small>Select from built-in offline clinical, operations, and deterministic reasoning engines.</small>
      </label>
    `;
  } else if (currentProvider === "ollama") {
    const ram = state.ramProfile || state.health?.ramProfile || { totalGB: 16, availableGB: 3, profile: 'conservative', statusBadge: 'Conservative Mode (Compact Models)', keepAlive: '0s', threadBudget: 4, tierCap: 'medium' };
    providerSection = `
      <div class="provider-box">
        <div class="provider-badge success">✓ Active: Ollama Local Daemon (No API Key Required)</div>
        <p class="provider-desc">Private AI communicates directly with your local Ollama daemon. Models run 100% locally on your Intel CPU with AVX2 acceleration and hardware-adaptive RAM protection.</p>
        <div style="background:var(--bg-subtle, rgba(0,0,0,0.03)); border-radius:6px; padding:8px 12px; margin:8px 0; font-size:13px; line-height:1.5;">
          <strong>Hardware RAM State:</strong> ${esc(ram.totalGB)} GB Installed (${esc(ram.availableGB)} GB Free) · <span class="badge ${ram.profile==='expanded'?'success':ram.profile==='balanced'?'info':'warning'}">${esc(ram.statusBadge)}</span><br>
          Auto unloader: <code>keep_alive: ${esc(ram.keepAlive)}</code> | Threads: <code>${esc(ram.threadBudget)}</code> | Safe tier: <code>${esc(ram.tierCap?.toUpperCase())}</code><br>
          <span style="font-size:12px; color:var(--text-muted, #666);">RAM is detected at startup to adjust model size limits and memory retention. Recheck inference after a hardware change.</span>
        </div>
        ${field("Ollama Daemon URL", "ollamaEndpoint", s.ollamaEndpoint || "http://127.0.0.1:11434", "text", "Default: http://127.0.0.1:11434")}
        <div class="button-row">
          <button class="primary" data-act="test-api">Test Ollama connection</button>
          <button class="secondary" data-act="load-models">Load installed Ollama models</button>
        </div>
      </div>
      <label class="field">Active Ollama Model
        <input name="model" list="model-list" value="${esc(s.model || ram.recommendedModels?.[0] || activeProv.defaultModel || '')}" placeholder="Load installed models or enter an installed model ID">
        <datalist id="model-list">${(activeProv.models || []).map(m => `<option value="${esc(m)}"></option>`).join("")}</datalist>
        <small>Suggested model sizes reflect available RAM; installed models and performance must be checked on this PC.</small>
      </label>
    `;
  } else if (currentProvider === "custom") {
    providerSection = `
      <div class="provider-box">
        <div class="provider-badge neutral">Custom OpenAI-Compatible Endpoint</div>
        <p class="provider-desc">${esc(activeProv.description)}</p>
        ${field("Server Endpoint URL", "customEndpoint", s.customEndpoint || "http://localhost:11434/v1", "text", "Supports Ollama (http://localhost:11434/v1), LM Studio (http://localhost:1234/v1), vLLM, or OpenRouter (https://openrouter.ai/api/v1)")}
        ${field("API Key (optional)", "apiKey", "", "password", "Optional auth token or bearer key for custom proxy")}
        <div class="button-row">
          <button class="primary" data-act="save-key">Save custom settings</button>
          <button class="secondary" data-act="test-api">Test connection</button>
        </div>
      </div>
      <label class="field">Model
        <input name="model" list="model-list" value="${esc(s.model || activeProv.defaultModel || '')}" placeholder="Model ID configured on this server">
        <datalist id="model-list">${(activeProv.models || []).map(m => `<option value="${esc(m)}"></option>`).join("")}</datalist>
        <small>Enter the model name hosted by your local or remote server.</small>
      </label>
      <button class="secondary" data-act="load-models">Load server models</button>
    `;
  } else {
    const keyHint = currentProvider === 'gemini' ? 'Google AI Studio key (starts with AIzaSy...)' : currentProvider === 'anthropic' ? 'Anthropic key (starts with sk-ant-...)' : currentProvider === 'groq' ? 'Groq key (starts with gsk_...)' : 'API key (starts with sk-...)';
    providerSection = `
      <div class="provider-box">
        <div class="provider-badge ${hasKey ? 'success' : 'warning'}">${hasKey ? '✓ ' + esc(activeProv.name) + (state.developmentMode ? ' key is saved in the development vault (not DPAPI)' : ' key is saved in the desktop encrypted vault') : 'No API key currently saved for ' + esc(activeProv.name)}</div>
        <p class="provider-desc">${esc(activeProv.description)}</p>
        ${field("API key", "apiKey", "", "password", keyHint)}
        <div class="button-row">
          <button class="primary" data-act="save-key">${hasKey ? "Replace key" : "Save key securely"}</button>
          <button class="secondary" data-act="test-api">Test connection</button>
          ${hasKey ? '<button class="danger" data-act="delete-key">Delete key</button>' : ""}
        </div>
      </div>
      <label class="field">Model
        <input name="model" list="model-list" value="${esc(s.model || activeProv.models?.[0] || '')}" placeholder="Choose a model your API account supports">
        <datalist id="model-list">${(activeProv.models || []).map(m => `<option value="${esc(m)}"></option>`).join("")}</datalist>
        <small>Model availability and supported tools depend on your ${esc(activeProv.name)} account.</small>
      </label>
      <button class="secondary" data-act="load-models">Load my models</button>
    `;
  }

  return `<div class="page"><h1>Make Private AI yours</h1><label class="check"><input name="uiAdvanced" type="checkbox" ${s.uiAdvanced ? "checked" : ""}> Advanced response details</label><p class="subtitle">Set up once, then open Private AI and start working.</p><section class="section"><h2>1. AI Provider &amp; API Key Configuration</h2><p>You can run Private AI completely locally on this PC without an API key or subscription, or connect an API key for Google Gemini, Anthropic Claude, OpenAI, DeepSeek, Groq, or custom endpoints.</p><label class="field">Selected AI Provider<select name="provider" id="provider-select">${Object.values(provs).map(p=>`<option value="${esc(p.id)}" ${currentProvider===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>${providerSection}</section>
  <section class="section"><h2>2. Choose where reports are saved</h2><p>Choose a normal folder or your approved ShareSync folder. You can change it later.</p><div class="path-display">${esc(s.workspace || "No work folder selected")}</div><div class="button-row"><button class="primary" data-act="choose-workspace">Choose folder</button><button class="secondary" data-act="open-workspace">Open folder</button></div><p>Finished reports stay here until you remove them. Private history, keys, and settings stay on this PC.</p></section>
  <section class="section"><h2>3. Privacy and retention</h2><label class="check"><input name="hipaa" type="checkbox" ${s.hipaa ? "checked" : ""}> HIPAA mode</label><p>PHI use requires your organization’s approved devices and policies, an applicable OpenAI BAA, and approved API retention and endpoint configuration. This switch does not verify or establish compliance.</p><label class="check"><input name="approved" type="checkbox" ${s.approved ? "checked" : ""}> Approved for this organization’s configured HIPAA workflow. I confirm organizational/contractual approval of this provider, endpoint, project, credentials and retention settings. Save configuration changes first, then approve the saved configuration.</label><div class="fields">${select(
    "Keep local chat history",
    "retentionDays",
    [
      ["7", "7 days"],
      ["30", "30 days"],
      ["60", "60 days"],
      ["90", "90 days"],
      ["100", "100 days (Default - 90-day quarterly audits)"],
      ["180", "180 days"],
      ["200", "200 days (Tiered report retention)"],
      ["365", "365 days"],
      ["0", "Keep indefinitely"],
      ["custom", "Custom"],
    ],
    ["7", "30", "60", "90", "100", "180", "200", "365", "0"].includes(String(s.retentionDays))
      ? s.retentionDays
      : "custom",
  )}${field("Custom retention in days", "customRetention", s.retentionDays || 100, "number")}</div><p>Cleanup covers expired local history, working files, memories, and job records (held 100 days; exported reports held an additional 100 days). It does not delete your original documents.</p><button class="secondary" data-act="cleanup">Run retention cleanup now</button></section>
  <div class="button-row"><button class="primary" data-act="save-settings">Save settings</button><button class="secondary" data-act="new">Start chatting</button></div>
  <section class="section"><h2>Browser Companion</h2><p>Ask beside your webpage. Pages are read only after you explicitly include a page and send your request.</p><button class="secondary" data-act="connect-chrome">Set up browser companion</button><details><summary>Browser installation steps</summary><p>Click the setup button above. For Chrome or Brave, open chrome://extensions; for Edge, open edge://extensions. Enable Developer mode, click Load unpacked, and select the folder that opens. For Firefox, open about:debugging#/runtime/this-firefox, click Load Temporary Add-on, and choose manifest.json in the firefox subfolder. Temporary Firefox installation lasts until Firefox restarts; permanent installation needs Mozilla signing. Pin Private AI Companion. If your organization blocks extension installation, it needs to approve the extension.</p><button class="secondary" data-act="disconnect-chrome">Disconnect browser companions</button></details></section>
  <section class="section"><h2>Custom instructions</h2>${textarea("Instructions used across chats", "customInstructions", s.customInstructions||"")}<p>Project instructions are added for the current project.</p><button data-act="chat-archives">Manage archived chats</button></section><section class="section"><h2>Memory</h2><label class="check"><input name="memoryEnabled" type="checkbox" ${s.memoryEnabled ? "checked" : ""}> Use the memories I explicitly save</label><p>Memory is off by default. Private AI never silently creates permanent memory from chats.</p><button class="secondary" data-act="view" data-view="memory">Review saved memories</button></section><section class="section"><h2>To-Do &amp; Follow-Up Reminders</h2><label class="check"><input name="autoReminders" type="checkbox" ${s.autoReminders !== false ? "checked" : ""}> Remind me automatically on pending follow-ups</label><p>Private AI monitors follow-up dates and deadlines extracted from Outlook emails or manual to-dos, notifying you on this PC when a task is due.</p><button class="secondary" data-act="view" data-view="todos">View To-Do list &amp; reminders</button></section><section class="section clinical-surveillance-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><h2 style="margin:0;display:flex;align-items:center;gap:8px;">🏥 Clinical Surveillance &amp; SNF Module <span class="clinical-status-badge ${s.snfEnabled !== false ? 'active' : 'disabled'}">${s.snfEnabled !== false ? '● ACTIVE' : '○ DISABLED'}</span></h2><label class="clinical-toggle-switch" title="Toggle Clinical Surveillance"><input name="snfEnabled" type="checkbox" ${s.snfEnabled !== false ? "checked" : ""}><span class="clinical-toggle-slider"></span></label></div><p style="margin-top:6px;">Continuous safety surveillance of PointClickCare daily orders, admissions, eMAR exceptions, and behavior logs. Surfaces new psychotropics, missing indications, PRN 14-day limits, and persistent clinical alerts. <strong>When turned off, all clinical surveillance banners, sidebar navigation, and healthcare features are completely hidden for a clean, distraction-free assistant.</strong></p>${s.snfEnabled !== false ? '<div style="margin-top:14px;"><button class="secondary" data-act="view" data-view="snf">Open SNF Command Center</button></div>' : ''}</section>
  <section class="section voice-transcripts-section" id="voice-transcripts-section">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <h2 style="margin:0;display:flex;align-items:center;gap:8px;">🎙 View Voice Transcripts</h2>
      <div style="display:flex;gap:8px;">
        <button class="secondary" type="button" data-act="copy-all-voice-transcripts" title="Copy all voice transcripts to clipboard">📋 Copy All</button>
        <button class="secondary" type="button" data-act="clear-all-voice-transcripts" title="Clear voice transcript history">🗑 Clear History</button>
      </div>
    </div>
    <p>Review the history of recent voice-to-text speech inputs and conversational dictations for clinical, administrative, and documentation review.</p>
    <div id="voice-transcripts-container">
      ${renderVoiceTranscriptsList()}
    </div>
  </section>
  <section class="section">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <h2 style="margin:0;display:flex;align-items:center;gap:8px;">⌨ Keyboard Shortcuts</h2>
      <button class="secondary" type="button" data-act="shortcuts">Manage Shortcuts</button>
    </div>
    <p>Quickly trigger actions across Private AI using keyboard shortcuts like <kbd>Ctrl+K</kbd> for new chat, <kbd>Ctrl+Shift+V</kbd> for voice mode, or <kbd>?</kbd> for help.</p>
  </section>
  <details class="section"><summary>More settings and privacy tools</summary><div class="fields">${select(
    "Reasoning effort",
    "reasoning",
    ["default", "none", "minimal", "low", "medium", "high", "xhigh"].map(
      (x) => [x, x === "default" ? "Model default" : x],
    ),
    s.reasoning,
  )}${field("Maximum output tokens", "maxOutput", s.maxOutput, "number")}${field("OpenAI organization (optional)", "org", s.org)}${field("OpenAI project (optional)", "projectId", s.projectId)}${field("App lock after minutes", "lockMinutes", s.lockMinutes, "number")}</div><p>Reasoning controls depend on the selected model. Automatic locking inside Private AI requires an app passphrase; your organization’s Windows lock remains separate.</p><div class="button-row"><button class="secondary" data-act="passphrase">Set app passphrase</button><button class="secondary" data-act="lock">Lock app</button><button class="secondary" data-act="backup">Create local encrypted backup</button><button class="secondary" data-act="self-check">Run local checks</button><button class="secondary" data-act="diagnostics">Create diagnostic report</button></div><p>Diagnostics contain technical metadata only. Local backups require this Windows profile and its original encryption key. A portable app does not make encrypted history portable.</p></details></div>`;
}
function showLocked() {
  if ($("modal").open) $("modal-cancel").click();
  $("modal-content").innerHTML = "";
  $("prompt").value = "";
  $("attachments").innerHTML = "";
  view = "locked";
  chat = null;
  pending = [];
  state = null;
  $("content").innerHTML =
    '<div class="locked"><h1>Private AI is locked</h1><p class="subtitle">Unlock in this Windows app to continue.</p><input class="control" type="password" id="unlock-passphrase" placeholder="App passphrase" autocomplete="off"><button class="primary" data-act="unlock">Unlock</button><p class="help">If Windows locked the app and you have no app passphrase, unlock your Windows session.</p></div>';
  $("compose").hidden = true;
  $("notice").hidden = true;
  $("history").innerHTML = "";
  $("model-label").textContent = "";
  $("view-title").textContent = "Private AI";
  $("top-actions").innerHTML = "";
}
let voiceManager = null;
let voiceHudOpen = false;

function initVoice() {
  if (voiceManager) return;
  const canvas = $("voice-visualizer");

  voiceManager = new VoiceManager({
    callApi: api,
    onSend: async ({ prompt, rawVoiceText, agentId, onStreamChunk }) => {
      if (sending) return { text: "" };
      if (view !== "chat" || !chat) {
        if (!chat) await newChat();
        else {
          view = "chat";
          renderChat();
        }
      }

      sending = true;
      $("send").hidden = true;
      $("stop").hidden = false;
      $("prompt").disabled = true;
      $("attach").disabled = true;

      const args = {
        chatId: chat.id,
        forwardMessaging: $("task-forward").value,
        prompt,
        fileIds: pending.map((f) => f.id),
        web: $("web").checked,
        editIndex: null,
        regenerate: false,
      };

      logVoiceTranscript({
        text: rawVoiceText,
        mode: voiceManager?.mode === "ptt" ? "Push-to-Talk" : voiceManager?.mode === "always" ? "Always Listening" : "Hands-Free"
      });

      chat.messages.push({
        role: "user",
        text: rawVoiceText,
        fileIds: args.fileIds,
      });
      chat.messages.push({ role: "assistant", text: "" });
      renderChat();
      $("prompt").value = "";
      pending = [];
      renderAttachments();

      const voiceEst = estimateResponseTime(prompt, { web: args.web, filesCount: args.fileIds.length });
      const vStart = Date.now();
      const hint = $("voice-transcript-hint");
      if (hint) hint.textContent = `Generating response... (est. ${voiceEst.label})`;

      try {
        const result = await api("send", args);
        chat = result.chat;
        const vElapsed = Date.now() - vStart;
        const lastMsg = chat.messages[chat.messages.length - 1];
        if (lastMsg && lastMsg.role === "assistant" && !lastMsg.durationMs) {
          lastMsg.durationMs = vElapsed;
        }
        if (hint) hint.textContent = `Response in ${(vElapsed / 1000).toFixed(1)}s`;
        renderChat();
        return {
          text: lastMsg && lastMsg.role === "assistant" ? lastMsg.text : "",
        };
      } catch (err) {
        toast(err.message);
        throw err;
      } finally {
        sending = false;
        $("send").hidden = false;
        $("stop").hidden = true;
        $("prompt").disabled = false;
        $("attach").disabled = false;
        await refresh().catch(() => {});
        if (view === "chat") renderChat();
        $("content").scrollTop = $("content").scrollHeight;
      }
    },
    onStateChange: (vState) => {
      updateVoiceUIState(vState);
    },
    getState: () => state,
    getChat: () => chat,
  });

  voiceManager.onTranscript = ({ fullText, interim, final }) => {
    const el = $("voice-transcript-stream");
    if (el) {
      if (fullText) {
        el.innerHTML = `<span>${esc(final)}</span> <em style="color: #4338ca; font-weight: 500;">${esc(interim)}</em>`;
      } else {
        el.textContent =
          voiceManager.state === "listening"
            ? "Listening for your voice…"
            : "Ready";
      }
    }
  };

  // Wire up Voice HUD Controls
  const muteBtn = $("voice-hard-mute-btn");
  if (muteBtn) {
    muteBtn.onclick = () => {
      voiceManager.toggleHardMute();
    };
  }

  const closeBtn = $("voice-close-btn");
  if (closeBtn) {
    closeBtn.onclick = () => {
      toggleVoiceHud(false);
    };
  }

  const interruptBtn = $("voice-interrupt-btn");
  if (interruptBtn) {
    interruptBtn.onclick = () => {
      voiceManager.interruptSpeech();
    };
  }

  const contBtn = $("voice-continue-btn");
  if (contBtn) {
    contBtn.onclick = () => {
      voiceManager.dispatchTranscriptExplicit("Please continue where you left off.");
    };
  }

  document.querySelectorAll(".voice-tab").forEach((tab) => {
    tab.onclick = () => {
      const mode = tab.dataset.voiceMode;
      document
        .querySelectorAll(".voice-tab")
        .forEach((t) => t.classList.toggle("active", t === tab));
      $("voice-ptt-container").hidden = mode !== "ptt";
      const hint = $("voice-transcript-hint");
      if (hint) {
        hint.textContent =
          mode === "ptt"
            ? "Hold Spacebar or the button to speak"
            : "Auto-sends when you pause speaking";
      }
      voiceManager.setMode(mode);
    };
  });

  // Turn Patience controls
  document.querySelectorAll(".voice-patience-btn").forEach((btn) => {
    btn.onclick = () => {
      const patience = btn.dataset.patience;
      document
        .querySelectorAll(".voice-patience-btn")
        .forEach((b) => b.classList.toggle("active", b === btn));
      voiceManager.setTurnPatience(patience);
    };
  });

  // Mood quick toggle tabs
  document.querySelectorAll(".voice-mood-btn").forEach((btn) => {
    btn.onclick = () => {
      const mood = btn.dataset.mood;
      voiceManager.setVoiceMood(mood);
      const moodSel = $("voice-mood-select");
      if (moodSel) moodSel.value = mood;
      document
        .querySelectorAll(".voice-mood-btn")
        .forEach((b) => b.classList.toggle("active", b === btn));
    };
  });

  // Live Translation controls
  const transToggle = $("voice-translate-toggle");
  if (transToggle) {
    transToggle.onchange = () => {
      voiceManager.liveTranslation = transToggle.checked;
    };
  }
  const transLang = $("voice-translate-lang");
  if (transLang) {
    transLang.onchange = () => {
      voiceManager.translationTargetLang = transLang.value;
    };
  }

  const pttDisc = $("voice-ptt-disc");
  if (pttDisc) {
    const onPttDown = (e) => {
      e.preventDefault();
      pttDisc.classList.add("holding");
      voiceManager.startPtt();
    };
    const onPttUp = (e) => {
      e.preventDefault();
      pttDisc.classList.remove("holding");
      voiceManager.stopPtt();
    };
    pttDisc.addEventListener("mousedown", onPttDown);
    pttDisc.addEventListener("mouseup", onPttUp);
    pttDisc.addEventListener("mouseleave", onPttUp);
    pttDisc.addEventListener("touchstart", onPttDown, { passive: false });
    pttDisc.addEventListener("touchend", onPttUp, { passive: false });
  }

  const profileSel = $("voice-profile-select");
  if (profileSel) {
    profileSel.onchange = () => {
      voiceManager.voiceProfile = profileSel.value;
    };
  }

  const moodSel = $("voice-mood-select");
  if (moodSel) {
    moodSel.onchange = () => {
      const mood = moodSel.value;
      voiceManager.setVoiceMood(mood);
      document
        .querySelectorAll(".voice-mood-btn")
        .forEach((b) => b.classList.toggle("active", b.dataset.mood === mood));
    };
  }

  const accentSel = $("voice-accent-select");
  if (accentSel) {
    accentSel.onchange = () => {
      voiceManager.setVoiceAccent(accentSel.value);
    };
  }

  const rateSel = $("voice-rate-select");
  if (rateSel) {
    rateSel.onchange = () => {
      voiceManager.speechRate = parseFloat(rateSel.value) || 1.0;
    };
  }

  const agentSel = $("voice-agent-select");
  if (agentSel) {
    agentSel.onchange = () => {
      voiceManager.activeAgentId = agentSel.value;
    };
  }

  const ttsToggle = $("voice-tts-toggle");
  if (ttsToggle) {
    ttsToggle.onchange = () => {
      voiceManager.ttsEnabled = ttsToggle.checked;
    };
  }

  const composerMic = $("voice-composer-btn");
  if (composerMic) {
    composerMic.onclick = () => toggleVoiceHud();
  }

  const sidebarMic = $("voice-sidebar-btn");
  if (sidebarMic) {
    sidebarMic.onclick = () => toggleVoiceHud();
  }

  window.addEventListener("keydown", (e) => {
    if (
      (e.ctrlKey && e.shiftKey && (e.key === "V" || e.key === "v")) ||
      (e.altKey && (e.key === "V" || e.key === "v"))
    ) {
      e.preventDefault();
      toggleVoiceHud();
    }
    if (e.key === "Escape" && voiceHudOpen) {
      toggleVoiceHud(false);
    }
  });

  populateVoiceAgents();
}

function populateVoiceAgents() {
  const agentSel = $("voice-agent-select");
  if (!agentSel || !state) return;
  const currentVal = agentSel.value;
  const agents = state.agents || [];
  agentSel.innerHTML =
    '<option value="">Default Assistant (Standard Router)</option>' +
    agents.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("");
  if (agents.some((a) => a.id === currentVal)) {
    agentSel.value = currentVal;
  }
}

function updateVoiceUIState(vState) {
  const badge = $("voice-indicator-badge");
  const text = $("voice-indicator-text");
  const muteBtn = $("voice-hard-mute-btn");
  const muteLabel = $("voice-mute-label");
  const sideBadge = $("voice-sidebar-badge");
  const orb = $("voice-orb");

  if (orb) {
    orb.className = "voice-orb " + (vState.isHardMuted ? "muted" : vState.state);
  }

  if (!badge || !text) return;

  badge.className =
    "voice-indicator-badge " + (vState.isHardMuted ? "muted" : vState.state);

  if (vState.isHardMuted) {
    text.textContent = "HARD MUTED — MIC CUT";
    if (muteBtn) {
      muteBtn.classList.add("active");
      muteLabel.textContent = "UNMUTE MIC";
    }
    if (sideBadge) {
      sideBadge.textContent = "Muted";
      sideBadge.className = "voice-badge muted";
    }
  } else {
    if (muteBtn) {
      muteBtn.classList.remove("active");
      muteLabel.textContent = "HARD MUTE";
    }
    const stateLabels = {
      idle: "READY",
      connecting: "CONNECTING…",
      listening:
        vState.mode === "always" ? "ALWAYS LISTENING" : "LISTENING",
      user_speaking: "HEARING SPEECH…",
      turn_evaluation: "PAUSE DETECTED…",
      thinking: "ROUTING TO AI…",
      speaking: "SPEAKING (BARGE-IN ACTIVE)",
      interrupted: "INTERRUPTED",
      tool_running: "EXECUTING TOOL…",
      muted: "MUTED",
    };
    text.textContent = stateLabels[vState.state] || "READY";
    if (sideBadge) {
      sideBadge.textContent =
        vState.state === "listening" || vState.state === "user_speaking" ? "Listening" : "Ready";
      sideBadge.className =
        "voice-badge " + (vState.state === "listening" || vState.state === "user_speaking" ? "listening" : "");
    }
  }

  if (vState.voiceMood) {
    const moodSel = $("voice-mood-select");
    if (moodSel && moodSel.value !== vState.voiceMood) {
      moodSel.value = vState.voiceMood;
    }
    document.querySelectorAll(".voice-mood-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.mood === vState.voiceMood);
    });
  }

  if (vState.voiceAccent) {
    const accentSel = $("voice-accent-select");
    if (accentSel && accentSel.value !== vState.voiceAccent) {
      accentSel.value = vState.voiceAccent;
    }
  }
}

function toggleVoiceHud(forceState) {
  initVoice();
  voiceHudOpen = forceState !== undefined ? forceState : !voiceHudOpen;
  const hud = $("voice-hud");
  if (!hud) return;
  hud.hidden = !voiceHudOpen;

  if (voiceHudOpen) {
    voiceManager.startAudioVisualizer($("voice-visualizer"));
    if (
      !voiceManager.isHardMuted &&
      (voiceManager.mode === "always" || voiceManager.mode === "handsfree")
    ) {
      voiceManager.startListening();
    }
  } else {
    voiceManager.stopAudioVisualizer();
    voiceManager.stopListening();
  }
}

async function init() {
  try {
    await refresh();
    initVoice();
    initAutosave();
    await migrateLegacyStorage(api,localStorage,AUTOSAVE_STORAGE_KEY,VOICE_TRANSCRIPTS_KEY);
    const isLocal = state.settings.provider === "local" || (!state.keySaved && state.settings.provider !== "openai");
    if (state.settings.snfEnabled!==false) {renderPage("today");return;}
    if (!isLocal && !state.settings.localModelPath && (!state.keySaved || !state.settings.model)) {
      view = "processing";
      renderPage(view);
    } else if(state.settings.snfEnabled!==false) renderPage("today"); else renderChat();
  } catch (e) {
    if (view !== "locked") toast(e.message);
  }
}
function renderPage(name) {
  if (name === "snf" && state.settings.snfEnabled === false) {
    renderChat();
    return;
  }
  view = name;
  updateTop();
  renderSidebar();
  if (["today","pcc"].includes(name)) {
    $("content").innerHTML="<p>Loading…</p>";
    (name==="today"?todayUI:importUI).render($("content")).catch(e=>toast(e.message));return;
  }
  if (name === "operations") {
    $("content").innerHTML="<p>Loading Operations Intelligence…</p>";
    operationsCopilotUI.render($("content")).catch(e=>toast(e.message));
    return;
  }
  if (name === "automation") {
    $("content").innerHTML="<p>Loading…</p>";
    automationUI.render($("content"), state).catch(e=>toast(e.message));
    return;
  }
  if (name === "snf") {
    snfUI.render($("content"));
    return;
  }
  if(name==="messaging"||name==="browser"){const ui=name==="messaging"?messagingUI:browserUI;$("content").innerHTML="<p>Loading…</p>";ui.html().then(html=>{if(view===name)$("content").innerHTML='<p class="error-note">Primary-PC safety: visible browser actions and Outlook access require manual interruption approval. WhatsApp replies may run unattended only in conversations explicitly granted that permission; Disable all writing blocks every WhatsApp send. The account WhatsApp connection can remain open for local reasoning; report-browser sessions still reserve the browser lane. Separate profiles do not guarantee focus isolation.</p>'+html;}).catch(e=>toast(e.message));return;}
  if(name==="processing"||name==="usage"){$("content").innerHTML=hybridUI[name]();return;}
  if(name==="guide"){renderGuide();return;}
  if(name==="health"){$("content").innerHTML=healthHTML();return;}
  if (name === "settings") {
    $("content").innerHTML = settingsHTML();
    return;
  }
  if (name === "apps") {
    $("content").innerHTML = accessUI.html();
    return;
  }
  const layouts = {
    projects: {
      title: "A place for each project",
      subtitle: "Keep related chats and instructions together.",
      button: "New project",
      action: "project-new",
      items: state.projects,
      card: (p) =>
        `<h3>${esc(p.name)}</h3><p>${esc(p.instructions || "No project instructions yet.")}</p><div class="button-row"><button class="primary" data-act="project-chat" data-id="${p.id}">New project chat</button><button data-act="project-edit" data-id="${p.id}">Edit</button><button class="danger" data-act="delete-item" data-kind="project" data-id="${p.id}">Remove project</button></div>`,
    },
    agents: {
      title: "Your reusable assistants",
      subtitle:
        "Save instructions for a repeated task, then run a report here or on a connected Worker.",
      button: "New agent",
      action: "agent-new",
      items: state.agents,
      card: (a) => {
        const est = estimateResponseTime(a.prompt, { filesCount: (a.fileIds || []).length });
        return `<h3>${esc(a.name)} <span class="pill" style="font-weight: 500; font-size: 11px;" title="Estimated execution time based on current model and prompt complexity">⏱ Est. ~${est.label}</span></h3><p>${esc(a.prompt.slice(0, 250))}</p><div class="button-row"><button class="primary" data-act="agent-run" data-id="${a.id}">Run report</button><button data-act="agent-edit" data-id="${a.id}">Edit</button><button class="danger" data-act="delete-item" data-kind="agent" data-id="${a.id}">Delete</button></div>`;
      },
    },
    schedules: {
      title: "Have reports ready for you",
      subtitle:
        "Schedules run on this PC while Worker is enabled and Private AI is running. Missed times are caught up once. Enable optional startup at Windows login in Worker settings.",
      button: "New schedule",
      action: "schedule-new",
      items: state.schedules,
      card: (s) =>
        `<h3>${esc(s.name)}</h3><p>${esc(s.frequency)} ${["interval","watch"].includes(s.frequency)?"every "+esc(s.intervalMinutes)+" minutes":"at "+esc(s.frequency==="once"?s.at:s.time)} · Next: ${s.next?new Date(s.next).toLocaleString():"Completed"} · ${s.enabled ? "Enabled" : "Paused"}</p><div class="button-row"><button data-act="schedule-edit" data-id="${s.id}">Edit</button><button data-act="schedule-duplicate" data-id="${s.id}">Duplicate</button><button data-act="schedule-toggle" data-id="${s.id}">${s.enabled ? "Pause" : "Resume"}</button><button class="danger" data-act="delete-item" data-kind="schedule" data-id="${s.id}">Delete</button></div>`,
    },
    todos: {
      title: "To-Do & Follow-Up Reminders",
      subtitle:
        "Track pending items and email follow-ups with automated reminders and completion status.",
      button: "New follow-up item",
      action: "todo-new",
      items: state.todos || [],
      card: (t) =>
        `<h3>${t.status === "completed" ? "<s>" : ""}${esc(t.title)}${t.status === "completed" ? "</s>" : ""} <span class="pill ${t.status === "completed" ? "" : (t.priority === "urgent" || t.priority === "high" ? "danger" : "")}">${t.status === "completed" ? "Completed" : esc(t.priority)}</span></h3><p>${esc(t.description || "No notes")}</p><p><small>${t.followUpDate ? "Follow-up: " + esc(t.followUpDate) + " · " : ""}${t.reminderEnabled ? "Reminders: Active" : "Reminders: Off"} · Source: ${esc(t.source || "manual")}</small></p><div class="button-row"><button class="${t.status === "completed" ? "secondary" : "primary"}" data-act="todo-toggle" data-id="${t.id}">${t.status === "completed" ? "Mark Pending" : "Mark Complete"}</button><button data-act="todo-edit" data-id="${t.id}">Edit</button><button class="danger" data-act="delete-item" data-kind="todo" data-id="${t.id}">Delete</button></div>`,
    },
    files: {
      title: "Your working files",
      subtitle:
        "Import documents intentionally. These encrypted working copies are subject to local retention; the originals stay where they are. Text PDFs, DOCX, XLSX, CSV, TXT, EML, MSG, and images are supported.",
      button: "Import files",
      action: "files-import",
      items: state.files,
      card: (f) =>
        `<h3>▧ ${esc(f.name)}</h3><p>${(f.size / 1024).toFixed(0)} KB · ${new Date(f.updated).toLocaleDateString()}</p><div class="button-row"><button class="primary" data-act="file-chat" data-id="${f.id}">Ask about this file</button><button class="danger" data-act="delete-item" data-kind="file" data-id="${f.id}">Remove working copy</button></div>`,
    },
    memory: {
      title: "Only what you choose to remember",
      subtitle:
        "These entries are included in eligible chats only when Memory is enabled. Temporary chats never use or save memory.",
      button: "Add memory",
      action: "memory-new",
      items: state.memories,
      card: (m) =>
        `<p>${esc(m.content)}</p><p>Expires ${new Date(m.expires).toLocaleDateString()} · ${m.project ? "Project memory" : "Global memory"}</p><div class="button-row"><button data-act="memory-edit" data-id="${m.id}">Edit</button><button class="danger" data-act="delete-item" data-kind="memory" data-id="${m.id}">Delete</button></div>`,
    },
  };
  if (name === "worker") {
    $("content").innerHTML = workerHTML();
    return;
  }
  const d = layouts[name];
  if (!d) return;
  $("content").innerHTML =
    `<div class="page"><h1>${d.title}</h1><p class="subtitle">${d.subtitle}</p><button class="primary" data-act="${d.action}">${d.button}</button>${d.items.length ? d.items.map((i) => `<section class="card">${d.card(i)}</section>`).join("") : '<div class="empty">Nothing here yet. Add your first item when you need it.</div>'}${name === "schedules" ? jobsHTML() : ""}</div>`;
}
function jobsHTML() {
  return `<section class="section"><h2>Recent jobs</h2>${
    state.jobs
      .slice(0, 30)
      .map(
        (j) => {
          const duration = j.durationMs ? `${(j.durationMs / 1000).toFixed(1)}s` : (j.ended && j.started ? `${((new Date(j.ended) - new Date(j.started)) / 1000).toFixed(1)}s` : null);
          return `<div class="card"><h3>${esc(j.title || "Report")} <span class="pill status-${esc(j.status)}">${esc(j.status)}</span>${duration ? ` <span class="pill" style="font-weight: 500; font-size: 11px;">⏱ ${duration}</span>` : ''}</h3><p>${j.started ? new Date(j.started).toLocaleString() : "Waiting for a Worker / resource slot"}${j.error ? " · " + esc(j.error) : ""}</p><p>${esc(j.reason||'')}</p>${j.step?`<p>Saved step: ${esc(j.step)}</p>`:""}${j.recoverable&&j.status==="failed"?`<button data-act="job-resume" data-id="${j.id}">Review &amp; resume report</button> <button data-act="discard-recovery" data-id="${j.id}">Discard saved recovery data</button>`:""}${j.output ? `<button class="secondary" data-act="job-open" data-path="${esc(j.output)}">Open report</button>` : ""}${j.resultText&&!j.recoverable&&j.status==="failed" ? `<button class="secondary" data-act="retry-export" data-id="${j.id}">Save completed answer as PDF</button>` : ""}${['running','waiting','paused'].includes(j.status) ? `<button data-act="job-stop" data-id="${j.id}">Stop</button>` : ""}</div>`;
        }
      )
      .join("") || "<p>No jobs yet.</p>"
  }</section>`;
}
function workerHTML() {
  const s = state.settings,
    w = state.worker;
  return `<div class="page"><h1>Let another PC handle the work</h1><p class="subtitle">Each PC keeps its own encrypted history and API key. Only approved job handoffs and reports use your work folder.</p><section class="section"><h2>This computer</h2>${field("PC name", "workerName", w.label)}${select(
    "Use this PC as",
    "role",
    [
      ["primary", "Primary — daily chat"],
      ["worker", "Worker — scheduled and shared jobs"],
      ["both", "Both — chat and background jobs"],
    ],
    s.role,
  )}<label class="check"><input name="workerEnabled" type="checkbox" ${s.workerEnabled ? "checked" : ""}> Enable background jobs on this PC</label><label class="check"><input name="autostart" type="checkbox" ${state.autostart ? "checked" : ""}> Start Private AI when I sign in to Windows</label><p>Background jobs require this Windows user to remain signed in and the PC to be awake. App locking and closing the window keep approved background jobs running; use Quit in the tray to stop the app.</p><div class="button-row"><button class="primary" data-act="save-worker">Save Worker settings</button><button class="secondary" data-act="pause-worker">${s.workerPaused ? "Resume jobs" : "Pause new jobs"}</button><button class="secondary" data-act="open-workspace">Open work folder</button></div><p>Connection fingerprint: <b>${esc(w.fingerprint)}</b></p></section><section class="section"><h2>Connect trusted PCs</h2><p>Select the same approved ShareSync work folder on each PC. Confirm matching fingerprints on both screens, then connect each PC to the other. Keys stay local.</p>${w.peers.map((p) => `<div class="card"><h3>${esc(p.label)} <span class="pill">${p.online ? "Recently seen" : "Offline or sync delayed"}</span></h3><p>${esc(p.fingerprint)}${p.changed ? " · Identity changed; reconnection is required." : ""}</p><button class="${p.trusted ? "secondary" : "primary"}" data-act="${p.trusted ? "peer-revoke" : "peer-trust"}" data-id="${p.id}">${p.trusted ? "Disconnect" : "Connect this PC"}</button></div>`).join("") || "<p>No other PCs found yet. Allow time for ShareSync to sync the folder.</p>"}<button class="secondary" data-act="refresh-worker">Refresh PCs</button></section>${jobsHTML()}</div>`;
}
async function editProject(id) {
  const p = state.projects.find((p) => p.id === id) || {};
  const r = await form(
    p.id ? "Edit project" : "New project",
    field("Project name", "name", p.name) +
      textarea("Project instructions", "instructions", p.instructions) +
      field(
        "Output subfolder (optional)",
        "outputFolder",
        p.outputFolder,
        "text",
        "A subfolder inside your chosen work folder, such as Projects/Monthly Reports.",
      ),
  );
  if (r) {
    await api("projectSave", { ...r, id });
    await refresh();
    renderPage("projects");
  }
}
async function editMemory(id) {
  const m = state.memories.find((m) => m.id === id) || {};
  const r = await form(
    "Save a memory",
    textarea("What should Private AI remember?", "content", m.content) +
      field("Keep for days", "days", 90, "number") +
      select(
        "Applies to",
        "project",
        [
          ["", "All eligible chats"],
          ...state.projects.map((p) => [p.id, esc(p.name)]),
        ],
        m.project || "",
      ),
  );
  if (r) {
    await api("memorySave", {
      ...r,
      id,
      days: Number(r.days),
      project: r.project || null,
    });
    await refresh();
    renderPage("memory");
  }
}
async function editTask(type, id) {
  const a =
    (type === "agent" ? state.agents : state.schedules).find(
      (a) => a.id === id,
    ) || {};
  const r = await form(
    type === "agent" ? "Reusable report agent" : "Scheduled report",
    field("Name", "name", a.name) +
      textarea("Instructions", "prompt", a.prompt) +
      select(
        "Save report as",
        "format",
        ["pdf", "docx", "xlsx", "csv", "md", "txt"].map((x) => [
          x,
          x.toUpperCase(),
        ]),
        a.format || "pdf",
      ) +
      fileChecks(a.fileIds) +
      (type === "schedule"
        ? select(
            "Repeat",
            "frequency",
            [
              ["once", "One time"],
              ["weekly", "Weekly"],
              ["monthly", "Monthly"],
              ["interval", "Custom interval"],
              ["watch", "Watch work-folder file for changes"],
              ["daily", "Every day"],
              ["weekdays", "Weekdays"],
            ],
            a.frequency || "daily",
          ) +
          field("Time on this PC", "time", a.time || "08:00", "time") +
          field("One-time date/time", "at", a.at||"", "datetime-local") +
          field("Weekly days: 0=Sun, 1=Mon ... 6=Sat (comma-separated)", "weekdays", (a.weekdays||[1]).join(',')) +
          field("Monthly day (short months use their last day)", "monthDay", a.monthDay||1, "number") +
          field("Custom interval / watcher poll minutes", "intervalMinutes", a.intervalMinutes||60, "number") +
          field("Watcher file relative to Work folder", "watchPath", a.watchPath||"") +
          '<p class="help">Scheduled runs follow AI Processing settings. Local Only blocks OpenAI calls. Worker must be enabled on this PC.</p>'
        : ""),
  );
  if (r) {
    await api(type === "agent" ? "agentSave" : "scheduleSave", {
      ...r,
      id,
      fileIds: idsFrom(r),
    });
    await refresh();
    renderPage(type === "agent" ? "agents" : "schedules");
  }
}
async function editTodo(id) {
  const t = (state.todos || []).find((x) => x.id === id) || {};
  const r = await form(
    t.id ? "Edit follow-up item" : "New follow-up item",
    field("Title / Task", "title", t.title || "") +
    textarea("Details / Context", "description", t.description || "") +
    field("Follow-up date / time", "followUpDate", t.followUpDate || "", "datetime-local") +
    select(
      "Priority",
      "priority",
      [
        ["low", "Low"],
        ["normal", "Normal"],
        ["high", "High"],
        ["urgent", "Urgent"],
      ],
      t.priority || "normal",
    ) +
    `<label class="check"><input type="checkbox" name="reminderEnabled" ${t.reminderEnabled !== false ? "checked" : ""}> Remind me automatically when due</label>`,
    "Save follow-up",
  );
  if (r) {
    await api("todoSave", {
      id: t.id,
      title: r.title,
      description: r.description,
      followUpDate: r.followUpDate,
      priority: r.priority,
      reminderEnabled: r.reminderEnabled === "on" || r.reminderEnabled === true,
    });
    await refresh();
    renderPage("todos");
    toast("Follow-up item saved.");
  }
}
async function runAgent(id) {
  const a = state.agents.find((a) => a.id === id);
  if (!a) return;
  const est = estimateResponseTime(a.prompt, { filesCount: (a.fileIds || []).length });
  const r = await form(
    "Run " + a.name,
    `<div style="margin-bottom: 12px; padding: 8px 12px; background: rgba(37, 99, 235, 0.08); border-radius: 6px; font-size: 12.5px; color: #1e40af; display: flex; align-items: center; gap: 6px;">
      <span>⏱</span>
      <span><strong>Estimated Bot Duration:</strong> ~${esc(est.label)} (${esc(est.note)})</span>
    </div>` +
    select(
      "Run on",
      "target",
      [
        ["", "This PC"],
        ...state.worker.peers
          .filter((p) => p.trusted)
          .map((p) => [p.id, esc(p.label)]),
      ],
      "",
    ) +
      "<p>This creates a report using your AI Processing settings and saves it in your work folder.</p>",
    "Run report",
  );
  if (r) {
    await api("runJob", { ...a, title: a.name, target: r.target || null });
    toast(
      r.target
        ? `Job queued for selected Worker (est. ~${est.label}).`
        : `Report started (est. ~${est.label}). You can keep chatting.`,
    );
    await refresh();
    renderPage("worker");
  }
}
$("search").addEventListener("input", () => {
  if (state) renderChatHistory();
});
$("send").onclick = () => send().catch((e) => toast(e.message));
$("stop").onclick = () => {
  if (chat) api("stop", { id: chat.id }).catch((e) => toast(e.message));
};
$("attach").onclick = () => attach().catch((e) => toast(e.message));
let draftTimer;
$("prompt").addEventListener('input',()=>{
  autoResizePrompt();
  clearTimeout(draftTimer);
  if(!chat||chat.temporary||sending)return;
  const id=chat.id,value=$('prompt').value;
  draftTimer=setTimeout(()=>api('saveDraft',{id,text:value}).catch(()=>{}),700);
});
$("prompt").addEventListener("keydown", (e) => {
  if (matchShortcut(e, "sendPrompt") || (e.key === "Enter" && !e.shiftKey && !e.isComposing)) {
    e.preventDefault();
    send().catch((e) => toast(e.message));
  }
});
document.addEventListener("keydown", (e) => {
  const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;

  if (matchShortcut(e, "newChat") || (e.ctrlKey && e.key.toLowerCase() === "k")) {
    e.preventDefault();
    newChat().catch((x) => toast(x.message));
    return;
  }
  if (matchShortcut(e, "voiceToggle")) {
    e.preventDefault();
    toggleVoiceHud();
    return;
  }
  if (!isInput && (matchShortcut(e, "showShortcuts") || e.key === "?")) {
    e.preventDefault();
    showShortcutsModal();
    return;
  }
  if (matchShortcut(e, "stopOrClose") || e.key === "Escape") {
    if ($("modal")?.open) {
      $("modal-cancel")?.click();
      return;
    }
    if (voiceHudOpen) {
      toggleVoiceHud(false);
      return;
    }
    if (sending && chat) {
      e.preventDefault();
      api("stop", { id: chat.id }).catch((x) => toast(x.message));
    }
  }
});
document.addEventListener("change", async (e) => {
  if (e.target.name === "provider") {
    try {
      const selected = e.target.value;
      const defModels = Object.fromEntries(Object.entries(state.providers).map(([id,p])=>[id,p.defaultModel]));
      await api("settings", {
        provider: selected,
        model: defModels[selected] || state.settings.model
      });
      await refresh();
      renderPage("settings");
      toast(`AI Provider switched to ${selected === 'local' ? 'Local Assistant' : selected === 'ollama' ? 'Ollama' : selected}.`);
    } catch (x) {
      toast(x.message);
    }
    return;
  }
  if (e.target.name === "snfEnabled") {
    try {
      const enabled = e.target.checked;
      await api("settings", { snfEnabled: enabled });
      await refresh();
      if (!enabled) {
        snfUI?.updateUniversalAlertBar(state.snfAlerts);
        if (view === "snf") renderChat();
        toast("Clinical navigation disabled. Unresolved critical alerts remain visible.");
      } else {
        toast("Clinical Surveillance enabled.");
        api("snfDashboard").then(m => {
          if (m?.productionAlerts) snfUI?.updateUniversalAlertBar(m.productionAlerts);
        }).catch(() => {});
      }
      renderPage("settings");
    } catch (x) {
      toast(x.message);
    }
    return;
  }
  if (e.target.id === "web") {
    updateResponseTimeEstimate();
  }
  if (e.target.matches("[data-export]") && e.target.value) {
    try {
      const out = await api("exportChat", {
        id: chat.id,
        format: e.target.value,
        index: Number(e.target.dataset.export),
      });
      toast("Saved " + out.name + " in your work folder.");
    } catch (x) {
      toast(x.message);
    }
    e.target.value = "";
  }
});
document.addEventListener("click", async (e) => {
  const link = e.target.closest(".message a");
  if (link) {
    e.preventDefault();
    try {
      await api("openLink", { url: link.href });
    } catch (x) {
      toast(x.message);
    }
    return;
  }
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const { act, id, index, kind } = b.dataset;
  try {
    if(act?.startsWith("msg-")){await messagingUI.handle(act);return;}
    if(act?.startsWith("browser-")){if(await browserUI.handle(act,id))renderPage("browser");return;}
    if(act?.startsWith("hybrid-")){await hybridUI.handle(act);return;}
    if (act?.startsWith("access-")) {
      await accessUI.handle(act, id);
      return;
    }
    switch (act) {
      case "shortcuts":
        await showShortcutsModal();
        break;
      case "copy-all-voice-transcripts": {
        const allTranscripts = getVoiceTranscripts();
        if (!allTranscripts.length) {
          toast("No voice transcripts to copy.");
          break;
        }
        const combined = allTranscripts.map(t => `[${t.dateStr}] (${t.mode})\n${t.text}`).join("\n\n---\n\n");
        await navigator.clipboard.writeText(combined);
        toast("All voice transcripts copied to clipboard.");
        break;
      }
      case "clear-all-voice-transcripts": {
        if (await confirmAction("Clear Voice Transcripts?", "This will remove all recent voice-to-text input logs from your local device.", "Clear")) {
          await api("voiceTranscriptClear"); voiceTranscriptCache=[];
          localStorage.removeItem(VOICE_TRANSCRIPTS_KEY);
          toast("Voice transcript history cleared.");
          const container = $("voice-transcripts-container");
          if (container) container.innerHTML = renderVoiceTranscriptsList();
        }
        break;
      }
      case "copy-transcript": {
        const listToCopy = getVoiceTranscripts();
        const itemToCopy = listToCopy.find(t => t.id === id);
        if (itemToCopy) {
          await navigator.clipboard.writeText(itemToCopy.text);
          toast("Voice transcript copied.");
        }
        break;
      }
      case "use-transcript": {
        const listToUse = getVoiceTranscripts();
        const itemToUse = listToUse.find(t => t.id === id);
        if (itemToUse) {
          if (view !== "chat" || !chat) {
            if (!chat) await newChat();
            else {
              view = "chat";
              renderChat();
            }
          }
          $("prompt").value = ($("prompt").value ? $("prompt").value + "\n" : "") + itemToUse.text;
          autoResizePrompt();
          $("prompt").focus();
          toast("Transcript inserted into prompt.");
        }
        break;
      }
      case "delete-transcript": {
        const listAfterDel = getVoiceTranscripts().filter(t => t.id !== id);
        await api("voiceTranscriptDelete",{id}); voiceTranscriptCache=listAfterDel;
        toast("Transcript removed.");
        const containerDel = $("voice-transcripts-container");
        if (containerDel) containerDel.innerHTML = renderVoiceTranscriptsList();
        break;
      }
      case "voice-toggle":
        toggleVoiceHud();
        break;
      case "guide-ask":
        if(sending){toast('Stop the current response first.');break;}
        await newChat();$("prompt").value='/help '+b.dataset.topic;await send();break;
      case "new":
        await newChat();
        break;
      case "temporary":
        await newChat(true);
        break;
      case "chat":
        await openChat(id);
        break;
      case "production-today":
        await api("snfDemo", {mode:"production"});
        await refresh();
        renderPage("today");
        break;
      case "view":
        if (!state) break;
        await refresh();
        renderPage(b.dataset.view);
        break;
      case "suggest":
        $("prompt").value = b.dataset.text;
        $("prompt").focus();
        break;
      case "attach":
        await attach();
        break;
      case "remove-attachment":
        pending = pending.filter((f) => f.id !== id);
        renderAttachments();
        break;
      case "rename": {
        const r = await form("Rename chat", field("Name", "title", chat.title));
        if (r) {
          chat = await api("renameChat", { id: chat.id, title: r.title });
          await refresh();
          renderChat();
        }
        break;
      }
      case "delete-chat":
        if (
          await confirmAction(
            "Delete this chat?",
            "This removes the chat from Private AI. Explicit saved reports remain in your work folder.",
            "Delete",
          )
        ) {
          await api("deleteChat", { id: chat.id });
          chat = null;
          await refresh();
          renderChat();
        }
        break;
      case "save-temp":
        chat = await api("saveTemporary", { id: chat.id });
        await refresh();
        renderChat();
        break;
      case "edit":
        editing = Number(index);
        $("prompt").value = chat.messages[editing].text;
        $("compose-status").textContent =
          "Editing this message replaces later replies.";
        $("prompt").focus();
        break;
      case "copy":
        await api("copy", { text: chat.messages[Number(index)].text });
        toast("Copied.");
        break;
      case "regenerate":
        await send(true);
        break;
      case "save-key": {
        const input = document.querySelector('[name="apiKey"]');
        const provSelect = document.querySelector('[name="provider"]');
        const provider = provSelect ? provSelect.value : (state.settings.provider || "openai");
        if (provider === "local") {
          await saveSettings();
          toast("Local Assistant is active. No API key needed.");
          break;
        }
        const keyVal = input ? input.value.trim() : "";
        if (!keyVal && provider !== "custom") {
          toast("Please enter an API key.");
          break;
        }
        await api("saveKey", { key: keyVal, provider });
        if (input) input.value = "";
        await saveSettings();
        await refresh();
        renderPage("settings");
        toast(`API key for ${provider} saved securely.`);
        break;
      }
      case "delete-key": {
        const provSelect = document.querySelector('[name="provider"]');
        const provider = provSelect ? provSelect.value : (state.settings.provider || "openai");
        if (
          await confirmAction(
            `Delete ${provider} API key?`,
            "Your chats and reports will stay. You can switch to Local Assistant or re-enter a key anytime.",
            "Delete key",
          )
        ) {
          await api("deleteKey", { provider });
          await refresh();
          renderPage("settings");
          toast(`Key for ${provider} deleted.`);
        }
        break;
      }
      case "load-models": {
        b.disabled = true;
        await saveSettings();
        const provSelect = document.querySelector('[name="provider"]');
        const provider = provSelect ? provSelect.value : (state.settings.provider || "openai");
        const models = await api("models", { provider });
        $("model-list").innerHTML = models
          .map((x) => `<option value="${esc(x)}"></option>`)
          .join("");
        toast(`Loaded ${models.length} models for ${provider}. Choose one in the model field.`);
        b.disabled = false;
        break;
      }
      case "test-api": {
        b.disabled = true;
        await saveSettings();
        const provSelect = document.querySelector('[name="provider"]');
        const provider = provSelect ? provSelect.value : (state.settings.provider || "openai");
        const r = await api("testConnection", { provider });
        toast(r?.note || "Connected successfully.");
        b.disabled = false;
        break;
      }
      case "save-settings":
        await saveSettings();
        toast("Settings saved.");
        break;
      case "choose-workspace": {
        const selected = await api("chooseWorkspace");
        if (selected) {
          await refresh();
          document.querySelector(".path-display").textContent = selected;
          toast("Work folder selected.");
        }
        break;
      }
      case "open-workspace":
        await api("openWorkspace");
        break;
      case "cleanup": {
        const r = await api("cleanup");
        await refresh();
        toast(
          `Cleanup complete: ${r.chats} chats, ${r.files} working files, ${r.memory} memories, ${r.jobs} job records. Final reports were kept.${r.backupsDeferred ? " A locked backup still needs cleanup; close any backup viewer and run cleanup again." : ""}`,
        );
        break;
      }
      case "connect-chrome":
        await api("registerChrome");
        toast(
          "Extension folder opened. Follow the Browser installation steps below.",
        );
        break;
      case "disconnect-chrome":
        await api("disconnectChrome");
        toast("Browser companions disconnected.");
        break;
      case "passphrase": {
        const r = await form(
          "Set app passphrase",
          field(
            "Passphrase (at least 8 characters)",
            "passphrase",
            "",
            "password",
          ) +
            field("Confirm passphrase", "confirm", "", "password") +
            "<p>Keep it securely. Private AI cannot recover a forgotten app passphrase.</p>",
        );
        if (r) {
          if (r.passphrase !== r.confirm) {
            toast("The passphrases did not match.");
            break;
          }
          await api("setPassphrase", { passphrase: r.passphrase });
          toast("App passphrase saved.");
        }
        break;
      }
      case "lock":
        await api("lock");
        break;
      case "unlock":
        await api("unlock", { passphrase: $("unlock-passphrase").value });
        await init();
        break;
      case "backup":
        await api("backup");
        toast("Encrypted local backup created.");
        break;
      case "health-refresh": await refresh();renderPage('health');break;
      case "health-ack": await api('healthAcknowledge');await refresh();renderPage('health');break;
      case "health-save": {
        const get=k=>document.querySelector('[name="'+k+'"]');
        await api('settings',{workProfile:get('workProfile').value,ramReserveMB:Number(get('ramReserveMB').value),ramRecoverySeconds:Number(get('ramRecoverySeconds').value),keepBrainMinutes:Number(get('keepBrainMinutes').value),sectionedReports:get('sectionedReports').checked});
        await refresh();renderPage('health');toast('Stability settings saved.');break;
      }
      case "discard-recovery": await api("discardRecovery",{id});await refresh();renderPage("health");break;
      case "job-resume": await api('resumeJob',{id});await refresh();renderPage('health');break;
      case "diagnostics":
        if (await api("diagnostics")) toast("Diagnostic report saved.");
        break;
      case "self-check": {
        b.disabled = true;
        b.textContent = "Checking this PC…";
        const result = await api("selfCheck");
        b.disabled = false;
        b.textContent = "Run local checks";
        await form(
          "Checks on this computer",
          "<p>No API requests or credits were used.</p>" +
            result.checks
              .map((c) => `<p><b>${esc(c.name)}</b> · ${esc(c.status)}</p>`)
              .join("") +
            "<p>You can save these results with Create diagnostic report.</p>",
          "Done",
        );
        break;
      }
      case "project-new":
        await editProject();
        break;
      case "project-edit":
        await editProject(id);
        break;
      case "project-chat":
        await newChat(false, id);
        break;
      case "memory-new":
        await editMemory();
        break;
      case "memory-edit":
        await editMemory(id);
        break;
      case "agent-new":
        await editTask("agent");
        break;
      case "agent-edit":
        await editTask("agent", id);
        break;
      case "agent-run":
        await runAgent(id);
        break;
      case "schedule-new":
        await editTask("schedule");
        break;
      case "schedule-edit":
        await editTask("schedule", id);
        break;
      case "chat-archive":
        if(chat&&!chat.temporary){await api('archiveChat',{id:chat.id,archived:true});chat=null;await refresh();renderChat();}break;
      case "chat-archives": {
        const rows=state.chats.filter(c=>c.archived);const result=await form('Archived chats',select('Restore chat','id',rows.map(c=>[c.id,c.title]),rows[0]?.id));
        if(result?.id){await api('archiveChat',{id:result.id,archived:false});await refresh();toast('Chat restored.');}break;
      }
      case "schedule-duplicate":
        await api('scheduleDuplicate',{id});await refresh();renderPage('schedules');break;
      case "schedule-toggle": {
        const s = state.schedules.find((s) => s.id === id);
        await api("scheduleSave", { ...s, enabled: !s.enabled });
        await refresh();
        renderPage("schedules");
        break;
      }
      case "todo-new":
        await editTodo();
        break;
      case "todo-edit":
        await editTodo(id);
        break;
      case "todo-toggle":
        await api("todoToggle", { id });
        await refresh();
        renderPage("todos");
        break;
      case "app-add":
        if (await api("addApp")) {
          await refresh();
          renderPage("apps");
        }
        break;
      case "app-open":
        await api("openApp", { id });
        break;
      case "files-import":
        await api("pickFiles", {});
        await refresh();
        renderPage("files");
        break;
      case "file-chat": {
        const f = state.files.find((f) => f.id === id);
        await newChat();
        pending = [f];
        renderAttachments();
        break;
      }
      case "delete-item":
        if (
          await confirmAction(
            "Remove this item?",
            "This removes the selected item from Private AI. Original documents and finished reports are kept.",
            "Remove",
          )
        ) {
          await api("deleteItem", { kind, id });
          await refresh();
          renderPage(view);
        }
        break;
      case "save-worker": {
        const val = (n) => document.querySelector(`[name="${n}"]`);
        await api("workerName", { name: val("workerName").value });
        await api("settings", {
          role: val("role").value,
          workerEnabled: val("workerEnabled").checked,
        });
        await api("autostart", { enabled: val("autostart").checked });
        await refresh();
        renderPage("worker");
        toast("Worker settings saved.");
        break;
      }
      case "pause-worker":
        await api("settings", { workerPaused: !state.settings.workerPaused });
        await refresh();
        if(view==='worker')renderPage('worker');
        toast(state.settings.workerPaused?'Background work pauses at its next safe boundary. An active call or file write may finish first.':'Background work resumed.');
        break;
      case "peer-trust": {
        const p = state.worker.peers.find((p) => p.id === id);
        if (
          await confirmAction(
            "Connect " + p.label + "?",
            `Verify this fingerprint on the other PC: ${p.fingerprint}. Connecting allows this PC to send jobs to you when Worker is enabled. Connect this PC on the other screen too.`,
            "Connect",
          )
        ) {
          await api("trustPeer", { id, fingerprint: p.fingerprint });
          await refresh();
          renderPage("worker");
        }
        break;
      }
      case "peer-revoke":
        await api("revokePeer", { id });
        await refresh();
        renderPage("worker");
        break;
      case "refresh-worker":
        await api("publishWorker");
        await refresh();
        renderPage("worker");
        break;
      case "job-open":
        await api("openOutput", { relative: b.dataset.path });
        break;
      case "job-stop":
        await api("stop", { id });
        toast("Stop requested.");
        break;
      case "retry-export":
        await api("retryExport", { id, format: "pdf" });
        await refresh();
        renderPage("worker");
        break;
    }
  } catch (x) {
    toast(x.message);
    b.disabled = false;
  }
});
async function saveSettings() {
  const val = (n) => document.querySelector(`[name="${n}"]`);
  if (!val("model")) return;
  const hipaa = val("hipaa").checked;
  let publicModeConfirmed = false;
  if (state.settings.hipaa && !hipaa) {
    publicModeConfirmed = await confirmAction(
      "Switch new chats to public mode?",
      "Public mode is for non-PHI information. Existing HIPAA chats remain protected and cannot use live web search.",
      "Use public mode",
    );
    if (!publicModeConfirmed) {
      val("hipaa").checked = true;
      return;
    }
  }
  const days = val("retentionDays").value;
  await api("settings", {
    provider: val("provider") ? val("provider").value : state.settings.provider,
    ollamaEndpoint: val("ollamaEndpoint") ? val("ollamaEndpoint").value.trim() : (state.settings.ollamaEndpoint || "http://127.0.0.1:11434"),
    customEndpoint: val("customEndpoint") ? val("customEndpoint").value.trim() : (state.settings.customEndpoint || ""),
    model: val("model").value.trim(),
    hipaa,
    approved: val("approved").checked,
    uiAdvanced: !!val("uiAdvanced")?.checked,
    publicModeConfirmed,
    retentionDays: Number(
      days === "custom" ? val("customRetention").value : days,
    ),
    customInstructions: val("customInstructions").value,
    memoryEnabled: val("memoryEnabled").checked,
    autoReminders: val("autoReminders") ? val("autoReminders").checked : true,
    snfEnabled: val("snfEnabled") ? val("snfEnabled").checked : (state.settings.snfEnabled !== false),
    reasoning: val("reasoning").value,
    maxOutput: Number(val("maxOutput").value),
    lockMinutes: Number(val("lockMinutes").value),
    org: val("org") ? val("org").value.trim() : "",
    projectId: val("projectId") ? val("projectId").value.trim() : "",
  });
  await refresh();
  if (state.settings.snfEnabled === false && view === "snf") {
    renderChat();
  }
}
document.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (view === "chat") $("content").classList.add("drop-active");
});
document.addEventListener("dragleave", (e) => {
  if (!e.relatedTarget) $("content").classList.remove("drop-active");
});
document.addEventListener("drop", async (e) => {
  e.preventDefault();
  $("content").classList.remove("drop-active");
  if (view !== "chat" || !e.dataTransfer.files.length) return;
  try {
    if (!chat) await newChat();
    const r = await window.privateAI.dropFiles(
      [...e.dataTransfer.files],
      chat.id,
      chat.temporary,
    );
    if (!r.ok) throw Error(r.error.message);
    pending = [...pending, ...r.result].slice(0, 6);
    renderAttachments();
    await refresh();
  } catch (x) {
    toast(x.message);
  }
});
let lastTouch = 0;
document.addEventListener("keydown", () => {
  if (Date.now() - lastTouch > 30000 && state) {
    lastTouch = Date.now();
    api("activity").catch(() => {});
  }
});
setInterval(() => {
  if (
    state &&
    ["worker", "schedules"].includes(view) &&
    !$("modal").open &&
    !document.activeElement?.matches("input,textarea,select")
  )
    refresh()
      .then(() => renderPage(view))
      .catch(() => {});
}, 30000);
init();

