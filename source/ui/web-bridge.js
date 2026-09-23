(function () {
  "use strict";
  if (window.privateAI) return; // Electron preload remains authoritative.
  const listeners = new Set();
  let csrf = '';
  let sessionToken = '';
  const ready = (async () => {
    let token = window.__PRIVATE_AI_DEV_TOKEN__ || '';
    if (!token && typeof window !== 'undefined' && window.location?.search) {
      try {
        const p = new URLSearchParams(window.location.search);
        token = p.get('token') || '';
      } catch {}
    }
    if (!token && typeof sessionStorage !== 'undefined') {
      try { token = sessionStorage.getItem('privateai_dev_token') || ''; } catch {}
    }
    if (!token) {
      try {
        const res = await fetch('/api/dev-token');
        if (res.ok) {
          const data = await res.json();
          if (data.token) token = data.token;
        }
      } catch {}
    }
    if (!token) {
      try {
        token = window.prompt('Development / Demo Mode — Not for PHI. Enter the local development access token:') || '';
      } catch {}
    }
    if (token && typeof sessionStorage !== 'undefined') {
      try { sessionStorage.setItem('privateai_dev_token', token); } catch {}
    }
    const response = await fetch('/api/session', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + (token || ''), 'X-Private-AI': 'development' }
    });
    if (!response.ok) {
      console.error('Development authentication failed: status', response.status);
      throw Error('Development authentication failed. Reload to try again.');
    }
    const authData = await response.json();
    csrf = authData.csrf;
    sessionToken = authData.session || '';
    connectSSE();
  })();

  function connectSSE() {
    try {
      const sseUrl = "/api/events" + (sessionToken ? "?session=" + encodeURIComponent(sessionToken) : "");
      const es = new EventSource(sseUrl);
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

        const callHeaders = { "Content-Type": "application/json", "X-Private-AI-CSRF": csrf };
        if (sessionToken) callHeaders["X-Private-AI-Session"] = sessionToken;
        const res = await fetch("/api/call", {
          method: "POST",
          headers: callHeaders,
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

