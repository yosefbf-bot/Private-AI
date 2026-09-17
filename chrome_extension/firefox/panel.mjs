import { buildQuestion } from "./capture.mjs";
import { marked } from "./vendor/marked.mjs";
const chrome = globalThis.browser || globalThis.chrome;
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
let port,
  chat = null,
  busy = false,
  connected = false,
  streamTimer;
const requests = new Map();
function error(message) {
  $("error").textContent = message;
  $("error").hidden = false;
}
function connect() {
  try {
    port?.disconnect();
  } catch {}
  connected = false;
  try {
    port = chrome.runtime.connectNative("org.privateai.companion");
    port.onMessage.addListener((message) => {
      if (message.type === "event") {
        const e = message.event;
        if (e?.type === "delta" && chat?.id === e.chatId) {
          const m = chat.messages.at(-1);
          if (m?.role === "assistant") {
            m.text += e.delta;
            if (!streamTimer)
              streamTimer = setTimeout(() => {
                streamTimer = null;
                if (busy) render();
              }, 50);
          }
        }
        if (e?.type === "locked") {
          chat = null;
          render();
          error("Private AI is locked. Open the desktop app to unlock.");
        }
        return;
      }
      if (message.type === "result") {
        const pending = requests.get(message.id);
        if (!pending) return;
        requests.delete(message.id);
        message.error
          ? pending.reject(Error(message.error.message))
          : pending.resolve(message.result);
      }
    });
    port.onDisconnect.addListener(() => {
      connected = false;
      for (const pending of requests.values())
        pending.reject(
          Error(
            "Private AI disconnected. Open the desktop app, then reconnect.",
          ),
        );
      requests.clear();
      $("mode").textContent = "Desktop app disconnected";
      const ignored = chrome.runtime.lastError;
    });
    connected = true;
    load().catch((e) => error(e.message));
  } catch {
    error(
      "Open Private AI and use Settings → Set up Chrome Companion, then reconnect.",
    );
  }
}
function call(op, data = {}) {
  if (!connected || !port)
    return Promise.reject(Error("Connect to Private AI first."));
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    requests.set(id, { resolve, reject });
    try {
      port.postMessage({ id, op, data });
    } catch {
      requests.delete(id);
      reject(Error("The desktop connection is unavailable."));
    }
  });
}
async function load() {
  const s = await call("summary");
  $("mode").textContent =
    (s.settings.hipaa ? "HIPAA mode" : "Public mode") +
    " · " +
    (s.settings.processingMode || s.settings.model || "Choose processing in the desktop app");
  $("history").innerHTML =
    '<option value="">Recent chats</option>' +
    s.chats
      .map((c) => `<option value="${c.id}">${esc(c.title)}</option>`)
      .join("");
  $("error").hidden = true;
}
const markdown = (s) =>
  DOMPurify.sanitize(marked.parse(s || ""), {
    FORBID_TAGS: [
      "img",
      "iframe",
      "style",
      "form",
      "input",
      "button",
      "svg",
      "math",
      "audio",
      "video",
    ],
    FORBID_ATTR: ["style", "src", "srcset", "id"],
    ALLOW_DATA_ATTR: false,
  });
function render() {
  if (!chat?.messages?.length) {
    $("messages").innerHTML =
      '<div class="welcome"><h1>Ask alongside your work</h1><p>General questions use your message and chat history, without reading the current page. Include a page only when you need it.</p></div>';
  } else {
    $("messages").innerHTML = chat.messages
      .map(
        (m, i) =>
          `<article class="message ${m.role}">${m.role === "assistant" ? '<div class="message-label">Private AI</div>' : ""}<div>${m.role === "user" ? esc(m.text) : markdown(m.text)}</div>${m.error ? `<p>${esc(m.error.message)}</p>` : ""}${m.role === "assistant" ? `<button class="copy" data-copy="${i}">Copy</button>` : ""}</article>`,
      )
      .join("");
    $("messages").scrollTop = $("messages").scrollHeight;
  }
  $("save").hidden = !chat?.temporary;
}
async function fresh(temporary = false) {
  if (busy) return;
  if (chat?.temporary) await call("endTemporary", { id: chat.id });
  chat = await call("createChat", { temporary });
  $("include").checked = false;
  $("selection").checked = false;
  render();
  await load();
}
async function ask() {
  if (busy) return;
  const prompt = $("prompt").value;
  if (!prompt.trim()) return;
  busy = true;
  $("send").disabled = true;
  $("prompt").disabled = true;
  $("stop").hidden = false;
  $("error").hidden = true;
  try {
    // Extraction is invoked only here, after a deliberate send and Include checkbox.
    const includePage = $("include").checked,
      selectionOnly = $("selection").checked;
    $("include").checked = false;
    $("selection").checked = false;
    const question = await buildQuestion({
      prompt,
      includePage,
      selectionOnly,
    });
    if (!chat) chat = await call("createChat", {});
    chat.messages.push(
      { role: "user", text: prompt },
      { role: "assistant", text: "" },
    );
    render();
    $("prompt").value = "";
    const result = await call("send", { chatId: chat.id, ...question });
    chat = result.chat;
    render();
    await load();
    if (chat.historyLimited)
      error(
        "This panel shows a shortened history. Open the desktop app for the full chat.",
      );
    if (result.omitted)
      error(
        "Older messages were omitted from this request to limit token use; they remain in desktop history.",
      );
  } catch (e) {
    error(e.message);
  } finally {
    busy = false;
    $("send").disabled = false;
    $("prompt").disabled = false;
    $("stop").hidden = true;
    $("prompt").focus();
  }
}
$("send").onclick = ask;
$("prompt").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    ask();
  }
});
$("summarize").onclick = () => {
  $("include").checked = true;
  $("selection").checked = false;
  $("prompt").value =
    "Summarize the page I explicitly included. Identify the main points and any important qualifications.";
  $("prompt").focus();
};
$("selection").onchange = () => {
  if ($("selection").checked) $("include").checked = true;
};
$("include").onchange = () => {
  if (!$("include").checked) $("selection").checked = false;
};
$("new").onclick = () => fresh(false).catch((e) => error(e.message));
$("temp").onclick = () => fresh(true).catch((e) => error(e.message));
$("stop").onclick = () => {
  if (chat) call("stop", { id: chat.id }).catch((e) => error(e.message));
};
$("desktop").onclick = () => call("openDesktop").catch((e) => error(e.message));
$("reconnect").onclick = connect;
$("history").onchange = async () => {
  if (!$("history").value || busy) return;
  try {
    if (chat?.temporary) await call("endTemporary", { id: chat.id });
    chat = await call("chat", { id: $("history").value });
    $("include").checked = false;
    render();
  } catch (e) {
    error(e.message);
  }
};
$("save").onclick = () =>
  call("saveTemporary", { id: chat.id })
    .then((c) => {
      chat = c;
      render();
      load();
    })
    .catch((e) => error(e.message));
$("export").onchange = async () => {
  const format = $("export").value;
  if (!format || !chat) return;
  try {
    const out = await call("exportChat", {
      id: chat.id,
      format,
      index: chat.messages.length - 1,
    });
    error("Saved " + out.name + " to your work folder.");
  } catch (e) {
    error(e.message);
  }
  $("export").value = "";
};
document.addEventListener("click", (e) => {
  const a = e.target.closest("a");
  if (a) {
    e.preventDefault();
    try {
      const url = new URL(a.href);
      if (url.protocol === "https:") chrome.tabs.create({ url: url.href });
    } catch {}
    return;
  }
  const b = e.target.closest("[data-copy]");
  if (b)
    navigator.clipboard
      .writeText(chat.messages[Number(b.dataset.copy)].text)
      .catch(() => error("Clipboard access was unavailable."));
});
window.addEventListener("pagehide", () => {
  if (chat?.temporary)
    try {
      port?.postMessage({
        id: crypto.randomUUID(),
        op: "endTemporary",
        data: { id: chat.id },
      });
    } catch {}
});
connect();
