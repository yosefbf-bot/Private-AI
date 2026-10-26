'use strict';
const {fail,text}=require('./security.cjs');
const day=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
function date(value){
 if(typeof value!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(value))throw fail('INVALID');
 const [y,m,d]=value.split('-').map(Number),out=new Date(y,m-1,d,12);
 if(day(out)!==value)throw fail('INVALID');return out;
}
function period(value='today',now=new Date()){
 if(!Number.isFinite(+now)||typeof value!=='string')throw fail('INVALID');
 const v=value.trim().toLowerCase(),end=new Date(now);end.setHours(12,0,0,0);let start;
 if(v==='today')start=new Date(end);
 else if(v==='yesterday'){end.setDate(end.getDate()-1);start=new Date(end);}
 else if(/^\d{1,4} days? ago$/.test(v)){const n=Number(v.split(' ')[0]);end.setDate(end.getDate()-n);start=new Date(end);}
 else if(v==='last month'||v==='this month'){
  start=new Date(end.getFullYear(),end.getMonth()-(v==='last month'?1:0),1,12);
  if(v==='last month')end.setDate(0);
 }else if(/^20\d{2}-\d{2}$/.test(v)){
  start=date(v+'-01');end.setTime(+new Date(start.getFullYear(),start.getMonth()+1,0,12));
 }else if(/^20\d{2}-\d{2}-\d{2}(?:\.\.20\d{2}-\d{2}-\d{2})?$/.test(v)){
  const parts=v.split('..');start=date(parts[0]);end.setTime(+date(parts[1]||parts[0]));
 }else throw fail('INVALID');
 if(day(start)>day(end)||day(end)>day(now))throw fail('INVALID');
 return {start:day(start),end:day(end)};
}
function folder(value='Reports'){
 text(value,500);const parts=value.replaceAll('\\','/').split('/');
 if(!parts.length||parts.some(p=>!p||p==='.'||p==='..'||/[<>:"|?*\x00-\x1f]/.test(p)||/[ .]$/.test(p)||/^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(p)))throw fail('INVALID');
 return parts.join('/');
}
function plain(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw fail('INVALID');}
function normalize(input){
 if(input===undefined)return undefined;
 plain(input,['period','folder','dailyFolder','dateFormat','choices','tracking','analysisPrompt']);
 const out={period:input.period||'today',folder:folder(input.folder),dailyFolder:input.dailyFolder===true,dateFormat:input.dateFormat||'YYYY-MM-DD',choices:{}};
 // Validate fixed historical periods against a stable upper date; relative
 // expressions are evaluated once against the PC's local calendar at run time.
 period(out.period,new Date(2099,11,31));
 if(input.dailyFolder!==undefined&&typeof input.dailyFolder!=='boolean'||!['YYYY-MM-DD','MM/DD/YYYY','DD/MM/YYYY'].includes(out.dateFormat))throw fail('INVALID');
 const choices=input.choices||{};if(!choices||Array.isArray(choices)||typeof choices!=='object'||Object.keys(choices).length>8)throw fail('INVALID');
 for(const [key,spec] of Object.entries(choices)){
  if(!/^[a-z][a-zA-Z0-9_]{0,30}$/.test(key)||['start','end','today','month','constructor','prototype'].includes(key))throw fail('INVALID');
  plain(spec,['values','default']);if(!Array.isArray(spec.values)||!spec.values.length||spec.values.length>100||new Set(spec.values).size!==spec.values.length)throw fail('INVALID');
  for(const v of spec.values)if(!text(v,150).trim())throw fail('INVALID');
  if(!spec.values.includes(spec.default))throw fail('INVALID');out.choices[key]={values:[...spec.values],default:spec.default};
 }
 if(input.tracking!==undefined)out.tracking=require('./report-history.cjs').normalizeTracking(input.tracking);
 if(input.analysisPrompt!==undefined)out.analysisPrompt=text(input.analysisPrompt,12000);
 return out;
}
function validateTokens(steps,report){
 const names=['start','end','today','month',...Object.keys(report?.choices||{})];
 for(const s of steps)if(['fill','select'].includes(s.op)){
  const remaining=s.value.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g,(_,name)=>{if(!names.includes(name)||!report)throw fail('INVALID');return '';});
  if(/[{}]/.test(remaining))throw fail('INVALID');
 }
}
function resolveRun(recipe,input={},now=new Date()){
 plain(input,['period','folder','dailyFolder','choices']);
 const spec=normalize(recipe.report)||{period:'today',folder:'Reports',dailyFolder:false,dateFormat:'YYYY-MM-DD',choices:{}};
 if(!recipe.report&&Object.keys(input).length)throw fail('INVALID');
 const selected=period(input.period||spec.period,now),today=day(now),chosen={};
 const supplied=input.choices||{};plain(supplied,Object.keys(spec.choices));
 for(const [key,def] of Object.entries(spec.choices)){const value=supplied[key]??def.default;if(!def.values.includes(value))throw fail('INVALID');chosen[key]=value;}
 const format=v=>{const [y,m,d]=v.split('-');return spec.dateFormat==='MM/DD/YYYY'?`${m}/${d}/${y}`:spec.dateFormat==='DD/MM/YYYY'?`${d}/${m}/${y}`:v;};
 const values={...chosen,start:format(selected.start),end:format(selected.end),today:format(today),month:selected.start.slice(0,7)};
 if(input.dailyFolder!==undefined&&typeof input.dailyFolder!=='boolean')throw fail('INVALID');
 const daily=input.dailyFolder??spec.dailyFolder,base=folder(input.folder??spec.folder);
 return {period:selected,downloadDate:today,choices:chosen,folder:base+(daily?'/'+today:''),steps:recipe.steps.map(s=>['fill','select'].includes(s.op)?{...s,value:s.value.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g,(_,key)=>values[key])}:{...s})};
}
module.exports={day,date,period,folder,normalize,validateTokens,resolveRun};
