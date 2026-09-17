// Preserve the underlying answer/history; present only known app-generated
// leading notices as compact footnotes, including messages from older versions.
const notices = [
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
