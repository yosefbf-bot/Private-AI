// Count both retained UTF-16 strings and a per-entry allowance. Streaming
// prefixes are rendered normally but never retained by the completed cache.
export function createMarkdownCache(render, {maxBytes = 4 * 1024 ** 2, maxEntries = 200} = {}) {
  const entries = new Map();
  let bytes = 0;
  const markdown = (text, {streaming = false} = {}) => {
    if (!text) return '';
    if (!streaming && entries.has(text)) return entries.get(text).html;
    const html = render(text);
    if (streaming) return html;
    const size = 2 * (text.length + html.length) + 128;
    if (size > maxBytes) return html;
    while (entries.size && (bytes + size > maxBytes || entries.size >= maxEntries)) {
      const first = entries.keys().next().value;
      bytes -= entries.get(first).size;
      entries.delete(first);
    }
    entries.set(text, {html, size});
    bytes += size;
    return html;
  };
  markdown.clear = () => { entries.clear(); bytes = 0; };
  markdown.stats = () => ({entries: entries.size, bytes, maxBytes});
  return markdown;
}

export function streamRenderInterval(length) {
  return Math.min(500, 45 + Math.floor(length / 160));
}
