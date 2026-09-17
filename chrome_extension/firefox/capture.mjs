export async function buildQuestion(
  { prompt, includePage = false, selectionOnly = false },
  browser = globalThis.browser || globalThis.chrome,
) {
  if (typeof prompt !== "string" || !prompt.trim())
    throw Error("Type a question first.");
  const question = { prompt };
  // Privacy boundary: do not even query the current tab until explicitly requested.
  if (includePage !== true) return question;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw Error("Choose a webpage first.");
  let result;
  try {
    result = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractVisible,
      args: [selectionOnly === true],
    });
  } catch {
    throw Error(
      "Click the Private AI toolbar icon on this tab, then try again. Your browser restricts access to some pages, including its own settings and PDF viewer.",
    );
  }
  if (!result?.[0]?.result?.text?.trim())
    throw Error(
      selectionOnly
        ? "Select text on the page first."
        : "No readable page text was found.",
    );
  question.page = {
    text: result[0].result.text.slice(0, 60000),
    confirmed: true,
  };
  return question;
}
export function extractVisible(selectionOnly = false) {
  if (selectionOnly)
    return { text: (window.getSelection()?.toString() || "").slice(0, 60000) };
  const parts = [];
  let length = 0,
    visited = 0;
  const skip = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "INPUT",
    "TEXTAREA",
    "SELECT",
    "OPTION",
    "IFRAME",
    "SVG",
    "CANVAS",
    "NAV",
    "FOOTER",
  ]);
  const root =
    document.querySelector('main,article,[role="main"]') || document.body;
  if (!root || root.getClientRects().length === 0) return { text: "" };
  function walk(node) {
    if (length >= 60000 || ++visited > 50000) return;
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (
        skip.has(node.tagName) ||
        node.hidden ||
        node.isContentEditable ||
        node.getAttribute("aria-hidden") === "true"
      )
        return;
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.replace(/\s+/g, " ").trim();
      if (text) {
        const piece = text.slice(0, 60000 - length);
        parts.push(piece);
        length += piece.length + 1;
      }
      return;
    }
    for (const child of node.childNodes) walk(child);
  }
  walk(root);
  return { text: parts.join("\n").slice(0, 60000) };
}
