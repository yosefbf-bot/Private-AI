(function () {
  "use strict";
  if (window.privateAI) return; // Electron preload remains authoritative.
  const listeners = new Set();
  let csrf = '';
  const ready = (async () => {
    const token = window.prompt('Development / Demo Mode — Not for PHI. Enter the local development access token:');
    const response = await fetch('/api/session', { method: 'POST', headers: { Authorization: 'Bearer ' + (token || ''), 'X-Private-AI': 'development' } });
    if (!response.ok) throw Error('Development authentication failed. Reload to try again.');
    csrf = (await response.json()).csrf;
    connectSSE();
  })();

  function connectSSE() {
    try {
      const es = new EventSource("/api/events");
      es.onmessage = (e) => {
        try {
          const ev = JSON.parse(e.data);
          for (const fn of listeners) {
            try {
              fn(ev);
            } catch (err) {
              console.error(err);
            }
          }
        } catch {}
      };
      es.onerror = () => {
        // EventSource will automatically reconnect
      };
    } catch (err) {
      console.warn("SSE connection error:", err);
    }
  }

  if (typeof window !== "undefined") {
    window.privateAI = {
      call: async (op, data = {}) => {
        await ready;
        if (op === "pickFiles") {
          return {ok:false,error:{code:'POLICY',message:'Development / Demo Mode — file uploads are disabled. Not for PHI.'}};
        }

        if (op === "copy" && data?.text) {
          try {
            await navigator.clipboard.writeText(data.text);
          } catch {}
          return { ok: true, result: true };
        }

        if (op === "openLink" && data?.url) {
          const url = new URL(data.url);
          if (!['https:', 'http:'].includes(url.protocol)) return {ok:false,error:{code:'POLICY',message:'Unsupported link protocol'}};
          window.open(url.href, "_blank", "noopener,noreferrer");
          return { ok: true, result: true };
        }

        const res = await fetch("/api/call", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Private-AI-CSRF": csrf },
          body: JSON.stringify({ op, data }),
        });
        const json = await res.json();

        // Download trigger for exports
        if (op === "exportChat" && json.ok && json.result?.relative) {
          const a = document.createElement("a");
          a.href = "/api/download?file=" + encodeURIComponent(json.result.relative);
          a.download = json.result.name || "export";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }

        // Download trigger for diagnostics report
        if (op === "diagnostics" && json.ok && json.result?.report) {
          const blob = new Blob([json.result.report], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "PrivateAI-Diagnostics.json";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          return { ok: true, result: { saved: true } };
        }

        return json;
      },

      dropFiles: async (files, chatId, temporary) => {
        return {ok:false,error:{code:'POLICY',message:'Development / Demo Mode — file uploads are disabled. Not for PHI.'}};
      },

      onEvent: (cb) => {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
    };
  }
})();

