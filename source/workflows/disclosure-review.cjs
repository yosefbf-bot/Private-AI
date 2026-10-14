"use strict";
// Bounded local patterns assist human review; they cannot establish PHI absence.
// Text remains reference data. This helper has no cloud/export/write capability.
const {fail}=require("../security.cjs");
const {signature}=require("./actions.cjs");
const docs=require("./documents.cjs");
const MAX_TEXT=350000,MAX_CANDIDATES=100;
const NOTICE="Review covers extracted text only; original images, layout and attachments are not inspected. Local pattern suggestions may miss names, addresses, clinical details and other sensitive information, or flag harmless text. No matches does not mean PHI-free or de-identified. Review the entire copy; provider, HIPAA and channel permissions still apply.";
const RULES=[
  {type:"ssn",pattern:/(?<!\d)\d{3}[- ]\d{2}[- ]\d{4}(?!\d)/g},
  {type:"email",pattern:/(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,63}(?![A-Za-z0-9-])/g},
  {type:"phone",pattern:/(?<![\dA-Za-z])(?:\+?1[ .-]?)?(?:\([2-9]\d{2}\)|[2-9]\d{2})[ .-]?[2-9]\d{2}[ .-]?\d{4}(?:[ \t]?(?:ext\.?|x)[ \t]?\d{1,6})?(?!\d)/gi},
  {type:"dob",pattern:/\b(?:DOB|Date[ \t]+of[ \t]+birth|Birth[ \t]+date)[ \t]*[:=]?[ \t]*(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})(?!\d)/gi,capture:1},
  {type:"mrn",pattern:/\b(?:MRN|Medical[ \t]+record[ \t]+(?:number|no\.?|#))[ \t]*[:=#]?[ \t]*([A-Za-z0-9][A-Za-z0-9._-]{1,30}[A-Za-z0-9])(?![A-Za-z0-9_-])/gi,capture:1,numeric:true},
];
function boundary(text,at) {
  return !(at>0 && at<text.length && /[\uD800-\uDBFF]/.test(text[at-1]) && /[\uDC00-\uDFFF]/.test(text[at]));
}
function manualRanges(text, spans = []) {
  if (!Array.isArray(spans) || spans.length>MAX_CANDIDATES) throw fail("INVALID");
  return spans.map(span=>{
    if (!span || !Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) ||
        span.start<0 || span.end<=span.start || span.end>text.length ||
        !boundary(text,span.start) || !boundary(text,span.end)) throw fail("INVALID");
    return {type:"manual",start:span.start,end:span.end};
  }).sort((a,b)=>a.start-b.start || a.end-b.end);
}
function analyze(text, manualSpans = []) {
  if (typeof text!=="string" || text.length>MAX_TEXT) throw fail("LIMIT");
  const manual=manualRanges(text,manualSpans),spans=[],seen=new Set();
  let incomplete=false;
  function add(type,start,end) {
    const key=type+":"+start+":"+end;
    if (seen.has(key)) return true;
    if (spans.length>=MAX_CANDIDATES) {incomplete=true;return false;}
    seen.add(key);spans.push({type,start,end});return true;
  }
  for (const span of manual) add(span.type,span.start,span.end);
  outer:for (const rule of RULES) {
    const pattern=new RegExp(rule.pattern.source,rule.pattern.flags);
    for (const match of text.matchAll(pattern)) {
      const value=rule.capture ? match[rule.capture] : match[0];
      if (rule.numeric && !/\d/.test(value)) continue;
      const start=match.index+(rule.capture ? match[0].lastIndexOf(value) : 0);
      if (!add(rule.type,start,start+value.length)) break outer;
    }
  }
  return {manualSpans:manual.map(({start,end})=>({start,end})),spans:spans.sort((a,b)=>a.start-b.start || a.end-b.end || a.type.localeCompare(b.type)),incomplete};
}
function review(core, data = {}) {
  const file=docs.document(core,data),text=file.text||"",sourceRevision=docs.sourceRevision(file),result=analyze(text,data.manualSpans);
  const revision=signature({sourceRevision,manualSpans:result.manualSpans,version:"local-identifiers-v1"});
  const spans=result.spans.map(span=>({...span,id:signature({revision,...span}),
    value:text.slice(span.start,span.end).slice(0,200),valueTruncated:span.end-span.start>200,
    snippet:text.slice(Math.max(0,span.start-40),Math.min(text.length,span.start+160))}));
  return {fileId:file.id,name:file.name,sourceRevision,revision,manualSpans:result.manualSpans,spans,
    coverage:{characters:text.length,maxCandidates:MAX_CANDIDATES,incomplete:result.incomplete},
    notice:NOTICE+(result.incomplete?" Only the first 100 candidates were retained; additional patterns may remain. Review a smaller passage or add explicit manual ranges.":"")};
}
function redactCopy(core, data = {}) {
  const reviewed=review(core,data);
  if (typeof data.revision!=="string" || data.revision!==reviewed.revision) throw fail("REVIEW_CHANGED");
  if (!Array.isArray(data.selectedSpans) || !data.selectedSpans.length || data.selectedSpans.length>MAX_CANDIDATES ||
      data.selectedSpans.some(id=>typeof id!=="string")) throw fail("INVALID");
  const selected=[...new Set(data.selectedSpans)].map(id=>{
    const span=reviewed.spans.find(row=>row.id===id);if (!span) throw fail("REVIEW_CHANGED");return span;
  }).sort((a,b)=>a.start-b.start || a.end-b.end);
  const ranges=[];
  for (const span of selected) {
    const last=ranges.at(-1);
    if (last && span.start<=last.end) last.end=Math.max(last.end,span.end);
    else ranges.push({start:span.start,end:span.end});
  }
  const file=docs.document(core,data),original=file.text||"";
  // Selection is checked again against the current source before returning a copy.
  if (docs.sourceRevision(file)!==reviewed.sourceRevision) throw fail("REVIEW_CHANGED");
  let at=0,text="";
  for (const range of ranges) {text+=original.slice(at,range.start)+"[REDACTED]";at=range.end;}
  text+=original.slice(at);
  if (text.length>MAX_TEXT) throw fail("LIMIT");
  const counts={};for (const span of selected) counts[span.type]=(counts[span.type]||0)+1;
  return {fileId:file.id,sourceRevision:reviewed.sourceRevision,revision:reviewed.revision,text,
    selectedCandidates:selected.length,redactions:ranges.length,counts,originalPreserved:true,
    incomplete:reviewed.coverage.incomplete,notice:reviewed.notice};
}
module.exports={review,redactCopy,analyze,manualRanges,MAX_TEXT,MAX_CANDIDATES,NOTICE};
