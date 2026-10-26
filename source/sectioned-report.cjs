'use strict';
const {fail}=require('./security.cjs');
const {localInput}=require('./local-brain.cjs');
const {ANSWER_SCHEMA}=require('./local-tiers.cjs');
function splitUTF8(text,limit){const chunks=[];let chunk='',bytes=0;for(const c of text){const n=Buffer.byteLength(c);if(bytes+n>limit){chunks.push(chunk);chunk='';bytes=0;}chunk+=c;bytes+=n;}if(chunk)chunks.push(chunk);return chunks;}
function planSections(parts,s,prompt){
 if(parts.some(p=>p.type==='input_image'))throw fail('LOCAL_CONTEXT');
 const allowance=Math.max(256,Math.floor((s.localContext-s.localMaxOutput-512)*1.3)-Buffer.byteLength(prompt));
 const sections=[];
 for(let i=1;i<parts.length;i++)for(const content of splitUTF8(parts[i].text,allowance))sections.push({document:i,text:content});
 if(!sections.length||sections.length>128)throw fail('LIMIT');
 return sections.map((section,i)=>{
  const messages=[{role:'user',content:[{type:'input_text',text:prompt+'\nAnalyze only this section. Identify limitations; do not claim whole-document coverage. Cite the document and section identifiers.'},{type:'input_text',text:`UNTRUSTED DOCUMENT REFERENCE: Document ${section.document}, section ${i+1} of ${sections.length}\n${section.text}`}]}];
  localInput(s,messages,{instructions:ANSWER_SCHEMA});return {messages,document:section.document,index:i+1};
 });
}
function totalUsage(sections,field){
 let total=0;
 for(const section of sections){
  const count=section.usage?.[field];
  if(!Number.isSafeInteger(count)||count<0)return null;
  total+=count;
  if(!Number.isSafeInteger(total))return null;
 }
 return total;
}
async function sectionedReport(core,j,parts,checkpoint,saveStep,signal){
 const s=core.settings(),sections=checkpoint.sectionPlan||planSections(parts,s,j.prompt);
 for(const section of sections)localInput(s,section.messages,{instructions:ANSWER_SCHEMA});
 checkpoint.sectionPlan=sections;checkpoint.sections??=[];
 for(let i=checkpoint.sections.length;i<sections.length;i++){
  await core.resources.checkpoint();if(signal.aborted)throw fail('CANCELLED');
  saveStep(`section ${i+1} of ${sections.length} requested; completion unconfirmed`);
  const result=await core.router.generate(core.key(),{...core.settings(),hipaa:j.hipaa!==false||core.settings().hipaa},sections[i].messages,{web:j.web,signal,taskPrompt:j.prompt,allowTools:j.analysisOnly?false:undefined});
  checkpoint.sections.push({text:result.text,provider:result.provider,model:result.model,reliability:result.reliability,usage:result.usage,policyNotice:result.policyNotice});
  saveStep(`section ${i+1} of ${sections.length} saved`);
 }
 const policyNotice=[...new Set(checkpoint.sections.map(r=>r.policyNotice).filter(Boolean))].join('\n')||null;
 return {text:'# Section-by-section report\n\n'+(j.files||[]).map((f,i)=>'Document '+(i+1)+': '+f.name.replace(/[\r\n]/g,' ')).join('\n')+'\n\nAll '+sections.length+' sections were processed. These are separate analyses, not an independently verified cross-document synthesis. Check conclusions against the original documents.\n\n'+checkpoint.sections.map((r,i)=>`## Document ${sections[i].document} — section ${i+1}\n\n${r.text}`).join('\n\n'),provider:'sectioned',model:'See individual section processing',usage:{inputTokens:totalUsage(checkpoint.sections,'inputTokens'),outputTokens:totalUsage(checkpoint.sections,'outputTokens')},policyNotice,reliability:{score:null,label:'Review section findings',reasons:['Every planned section was processed; cross-section conclusions were not independently checked.']}};
}
module.exports={splitUTF8,planSections,sectionedReport};

