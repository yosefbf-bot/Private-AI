'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fail,safePath}=require('./security.cjs');
const {exportFile,tableRows}=require('./files.cjs');
const LIMIT=350000;
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
// Offsets preserve every UTF-16 code unit, without separating a surrogate pair.
function ranges(text){const out=[];for(let start=0;start<text.length;){let end=Math.min(text.length,start+LIMIT);if(end<text.length&&/[\uD800-\uDBFF]/.test(text[end-1]))end--;out.push({start,end});start=end;}return out;}
function plan(content,format){
 if(!['md','txt','pdf','docx','csv','xlsx'].includes(format))throw fail('FILE');
 const text=ranges(content),entries=text.map(range=>({...range,format:['md','txt'].includes(format)?format:'md',completeText:true}));
 if(['pdf','docx'].includes(format))entries.push(...text.map(range=>({...range,format})));
 if(['csv','xlsx'].includes(format)){
  const rows=tableRows(content);if(!rows.length)throw fail('FILE');let start=0,chars=0;
  // Complete rows are kept together; normal exporter row/column limits remain.
  for(let i=0;i<rows.length;i++){const n=rows[i].join(' | ').length+5;if(n>LIMIT)throw fail('LIMIT');if(chars+n>LIMIT||i-start>=9999){entries.push({rowStart:start,rowEnd:i,format});start=i;chars=0;}chars+=n;}
  entries.push({rowStart:start,rowEnd:rows.length,format});
 }
 return {version:1,sha256:digest(content),format,entries};
}
function verified(root,intent){
 if(!intent)return null;const file=safePath(root,intent.relative);
 if(!fs.existsSync(file))return null;
 const bytes=fs.readFileSync(file);if(digest(bytes)!==intent.sha256)throw fail('CHANGED');
 return {name:path.basename(file),path:file,relative:intent.relative,bytes:bytes.length};
}
async function exportSectioned(root,{content,format,jobId,checkpoint,saveStep,checkpointResources,incomplete,policyNotice}){
 const frozen=checkpoint.multipartExport||(checkpoint.multipartExport=plan(content,format));
 if(frozen.version!==1||frozen.sha256!==digest(content)||frozen.format!==format)throw fail('CHANGED');
 saveStep('multipart export planned');
 const rows=['csv','xlsx'].includes(format)?tableRows(content):null,outputs=[];
 for(let i=0;i<frozen.entries.length;i++){
  await checkpointResources();const entry=frozen.entries[i];let out=verified(root,entry.intent);
  if(!out)out=await exportFile(root,{content:entry.rowStart===undefined?content.slice(entry.start,entry.end):rows.slice(entry.rowStart,entry.rowEnd).map(r=>'| '+r.join(' | ')+' |').join('\n'),format:entry.format,jobId,policyNotice,preparedRelative:entry.intent?.relative,
   onPrepared:intent=>{entry.intent=intent;saveStep(`export part ${i+1} prepared`);}});
  outputs.push(out);
 }
 const textParts=frozen.entries.filter(e=>e.completeText).length;
 let textNumber=0;
 const index='# Section-by-section report — exported parts\n\n'+
  (incomplete===true?'WARNING: One or more generated sections are incomplete. Review the warnings in the complete text.\n\n':incomplete===null?'Section completeness is unknown for legacy saved sections.\n\n':'')+
  `All ${content.length} characters of the saved report are retained in ${textParts} ordered complete-text parts. Concatenating those parts reproduces the saved report exactly. Formatted or tabular copies are additional views; tables omit narrative.\n\n`+
  `Saved text SHA-256: ${frozen.sha256}\n\n`+
  outputs.map((out,i)=>`- [${frozen.entries[i].completeText?'Complete text part '+(++textNumber):'Formatted part '+(i+1)}](${encodeURIComponent(out.name)})`).join('\n')+'\n';
 let out=verified(root,frozen.indexIntent);
 if(!out)out=await exportFile(root,{content:index,format:'md',jobId,preparedRelative:frozen.indexIntent?.relative,onPrepared:intent=>{frozen.indexIntent=intent;saveStep('export index prepared');}});
 return {...out,parts:outputs.map(o=>({relative:o.relative,bytes:o.bytes}))};
}
module.exports={exportSectioned,ranges};
