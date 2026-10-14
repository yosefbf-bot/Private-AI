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
  if(tab.url){
    const url=new URL(tab.url);
    if(['chrome-extension:','moz-extension:'].includes(url.protocol)||['vault.bitwarden.com','vault.bitwarden.eu'].includes(url.hostname))
      throw Error('Password-manager pages are excluded from capture. Use Bitwarden to fill the website login without including its vault.');
  }
  let result;
  try {
    if(selectionOnly!==true)await browser.scripting.executeScript({target:{tabId:tab.id},files:['vendor/readability.js']});
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
  const selection=selectionOnly?window.getSelection():null;
  if(selectionOnly&&(!selection||selection.isCollapsed||!selection.rangeCount))return {text:""};
  const ranges=selectionOnly?Array.from({length:selection.rangeCount},(_,i)=>selection.getRangeAt(i)):null;
  const parts = [];
  const visibleDocument=selectionOnly?null:document.implementation.createHTMLDocument(document.title);
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
    (selectionOnly?document.body:document.querySelector('main,article,[role="main"]')) || document.body;
  if (!root || root.getClientRects().length === 0) return { text: "" };
  function walk(node,parent=null) {
    if (length >= 60000 || ++visited > 50000) return;
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (
        skip.has(node.tagName) ||
        node.hidden ||
        node.isContentEditable ||
        node.getAttribute("aria-hidden") === "true" ||
        node.tagName.startsWith("BITWARDEN-") ||
        node.matches('[autocomplete="current-password" i],[autocomplete="new-password" i],[autocomplete="one-time-code" i]')
      )
        return;
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return;
      if(parent){const clone=visibleDocument.createElement(node.tagName);for(const name of ['id','class','role'])if(node.hasAttribute(name))clone.setAttribute(name,node.getAttribute(name));parent.appendChild(clone);parent=clone;}
    }
    if (node.nodeType === Node.TEXT_NODE) {
      let raw=node.textContent;
      if(ranges)raw=ranges.filter(r=>r.intersectsNode(node)).map(r=>node.textContent.slice(r.startContainer===node?r.startOffset:0,r.endContainer===node?r.endOffset:node.textContent.length)).join(" ");
      const text = raw.replace(/\s+/g, " ").trim();
      if (text) {
        const piece = text.slice(0, 60000 - length);
        parts.push(piece);
        parent?.appendChild(visibleDocument.createTextNode(piece+' '));
        length += piece.length + 1;
      }
      return;
    }
    for (const child of node.childNodes) walk(child,parent);
  }
  walk(root,visibleDocument?.body);
  let text=parts.join('\n').slice(0,60000),extraction='visible';
  // Parse only the already-filtered visible clone. Never resurrect hidden text,
  // password-manager overlays or form values, and keep portal/table capture intact.
  if(!selectionOnly&&typeof globalThis.Readability==='function'&&(root.matches('article,.mw-parser-output,[itemtype*="Article"]')||root.querySelector('article,.mw-parser-output,[itemtype*="Article"]'))&&!visibleDocument.querySelector('table,[role="grid"],form')){
    try{const article=new globalThis.Readability(visibleDocument,{charThreshold:200,maxElemsToParse:50000}).parse();if(article?.textContent?.trim()){text=article.textContent.trim().slice(0,60000);extraction='article';}}catch{}
  }
  if(!selectionOnly&&text){
    let source='';try{const url=new URL(location.href);if(['http:','https:'].includes(url.protocol)){url.search='';url.hash='';url.username='';url.password='';source='Source page (query and fragment omitted): '+url.href+'\n';}}catch{}
    text=(source+'Page title: '+String(document.title||'').replace(/\s+/g,' ').slice(0,300)+'\n'+text).slice(0,60000);
  }
  return { text,extraction };
}
