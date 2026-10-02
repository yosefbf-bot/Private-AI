// Preserve the underlying answer/history; present only known app-generated
// leading notices as compact footnotes, including messages from older versions.
const notices = [
  'Local draft — not sufficiently verified.',
  'Provider connection failed before an answer was received. Showing local output; a provider request was attempted.',
  'Local draft — not sufficiently verified. No OpenAI call was made.',
  'The recommended larger model was unavailable or did not fit. Review this Small-model draft.',
  'Your automatic tier cap prevented the recommended larger model. Review this Small-model draft.',
  'A larger tier was recommended but was capped, unavailable, or did not fit. Review this smaller-model response.',
  'Reused the loaded brain under your follow-up setting.',
];
export function responseLayout(text) {
  let body=String(text||'');const footnotes=[];
  for(let i=0;i<notices.length;i++){
    const notice=notices.find(n=>body===n||body.startsWith(n+'\n'));
    if(!notice)break;footnotes.push(notice);body=body.slice(notice.length).replace(/^\s*\n\s*/, '');
  }
  return {body,footnotes};
}

export function responseChecks(processing) {
  if (!processing) return [];
  const reasons=processing.reliability?.reasons || [], checks=[];
  if(reasons.some(r=>r==='Evidence quotations were found in the supplied source.')) checks.push('Source quotation matched');
  if(reasons.some(r=>/Some context was not available|Some context was omitted/.test(r))) checks.push('Input incomplete');
  if(reasons.some(r=>r==='Some numbers could not be matched to the source.')) checks.push('Unmatched numbers — review');
  checks.push(processing.provider==='deterministic'?'Local tool result — verify inputs':'Review required');
  return checks;
}
