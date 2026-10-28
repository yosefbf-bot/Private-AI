'use strict';
// Re-analyse synthetic outputs into a NEW report; never rewrite trial receipts.
const fs=require('node:fs'),crypto=require('node:crypto');
const {fixtures,judge}=require('../tests/fixtures/local-quality.cjs');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
function rescore(report,outputs){
 const result=structuredClone(report),cases=fixtures();
 if(report.fixtureSHA256!==hash(JSON.stringify(cases)))throw Error('FIXTURES_CHANGED');
 for(const group of result.results)for(const item of group.cases){
  const c=cases.find(c=>c.id===item.id);if(!c)throw Error('CASE_MISSING');
  if(!item.nativeInference)continue;
  const matches=outputs.filter(o=>o.id===item.id&&o.tier===group.tier&&o.context===group.context&&o.repetition===item.repetition);
  if(matches.length!==1||hash(matches[0].text)!==item.outputSHA256)throw Error('OUTPUT_EVIDENCE_MISMATCH');
  item.originalCheck={passed:item.passed,reasons:item.reasons};Object.assign(item,judge(c,matches[0].text));
 }
 result.reanalysis={originalReportSHA256:hash(JSON.stringify(report)),syntheticOutputsSHA256:hash(JSON.stringify(outputs)),reason:'Separate semantic facts from JSON formatting; accept only exact supplied source quotations or identifiers.',nativeExecutionRepeated:false};
 return result;
}
function summary(report){
 const median=values=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.ceil((a.length-1)/2)])/2:null;};
 return report.results.map(g=>{
  const native=g.cases.filter(c=>c.nativeInference),first=native.filter(c=>c.repetition===1),pairs=first.map(c=>[c,native.find(n=>n.id===c.id&&n.repetition===2)]).filter(p=>p[1]);
  return {tier:g.tier,context:g.context,condition:g.condition,status:g.status,cases:g.cases.length,semanticPassed:g.cases.filter(c=>c.passed&&!c.incomplete).length,schemaDeviations:g.cases.filter(c=>c.schemaPassed===false).map(c=>({id:c.id,repetition:c.repetition})),failed:g.cases.filter(c=>!c.passed||c.incomplete).map(c=>({id:c.id,repetition:c.repetition,reasons:c.reasons,status:c.status})),repeatedTextIdentical:pairs.length?pairs.every(([a,b])=>a.outputSHA256===b.outputSHA256):null,tokenIdentityVerified:pairs.length>0&&pairs.every(([a,b])=>a.tokenIdsSHA256&&a.tokenIdsSHA256===b.tokenIdsSHA256),medianTTFTMs:median(native.map(c=>c.ttftMs)),medianDecodeTokensPerSecond:median(native.map(c=>c.tokensPerSecond)),peakPrivateCommitBytes:g.samples.length?Math.max(...g.samples.map(s=>s.privateCommitBytes||0)):null,peakWorkingSetBytes:g.samples.length?Math.max(...g.samples.map(s=>s.peakWorkingSetBytes||0)):null,mappingSamplesComplete:g.samples.some(s=>s.mappingSampleComplete===true),minimumAvailableBytes:g.minimumAvailableBytes};
 });
}
if(require.main===module){const [input,output]=process.argv.slice(2);if(!input||!output||fs.existsSync(output))throw Error('New analysis destination required');const r=JSON.parse(fs.readFileSync(input,'utf8')),o=JSON.parse(fs.readFileSync(input+'.synthetic-output.json','utf8')),a=rescore(r,o);fs.writeFileSync(output,JSON.stringify({analysis:a,summary:summary(a)},null,2),{flag:'wx'});console.log(JSON.stringify(summary(a)));}
module.exports={rescore,summary};
