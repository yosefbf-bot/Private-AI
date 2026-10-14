// Shared by reviewed browser imports and native staffing parsing. Only standard
// double quotes delimit CSV fields; apostrophes are ordinary source text.
export function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = '';
    } else cell += c;
  }
  if (quoted) throw Error('CSV has an unclosed quoted field.');
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  const headers = (rows.shift() || []).map(h => h.replace(/^\uFEFF/, '').trim());
  if (!headers.length || new Set(headers).size !== headers.length || headers.some(h => !h))
    throw Error('CSV requires unique, nonempty column headers.');
  return {headers, rows: rows.map((values, i) => {
    if (values.length !== headers.length) throw Error(`Row ${i + 2} has an unexpected column count.`);
    return Object.fromEntries(headers.map((h, j) => [h, values[j]]));
  })};
}
