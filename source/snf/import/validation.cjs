'use strict';
const crypto=require('node:crypto');
function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
function hash(value){return crypto.createHash('sha256').update(value).digest('hex');}
function residentId(row){const raw=row?.residentId??row?.pccId??row?.resident_id??row?.Resident_ID??row?.['Resident ID']??row?.ResidentId;return typeof raw==='string'||typeof raw==='number'?String(raw).trim():null;}
function validate(report,type,store){
 const mappingErrors=[],rejected=[],accepted=[],unmatched=[];
 const reportDate=Date.parse(report.date||report.reportDate||report.rangeEnd||'');
 if(!Number.isFinite(reportDate)||reportDate>Date.now()+300000)mappingErrors.push('Report date is missing, invalid, or in the future.');
 if(!Array.isArray(report.rows))mappingErrors.push('Mapped rows must be an array.');
 for(const [index,row] of (Array.isArray(report.rows)?report.rows:[]).entries()){
  let reason='';const id=residentId(row);
  if(!row||typeof row!=='object'||Array.isArray(row))reason='Expected an object row';
  else if(!id)reason='Stable resident ID required; names are not identifiers';
  else if(type!=='census'&&!store.get('snf_resident',id)){reason='Resident not matched to imported census';unmatched.push({row:index+1,residentId:id});}
  else if(['med_profile','med_changes','orders'].includes(type)&&!String(row.medication||row.drugName||row.order||'').trim())reason='Medication/order mapping is missing';
  else if(type==='diagnoses'&&!String(row.icd10||row.code||row.description||row.diagnosis||'').trim())reason='Diagnosis mapping is missing';
  else if(type==='behaviors'&&!String(row.targetSymptom||row.behavior||'').trim())reason='Behavior mapping is missing';
  if(reason)rejected.push({row:index+1,reason});else accepted.push({row,index:index+1,residentId:id});
 }
 return {reportDate,mappingErrors,rejected,accepted,unmatched};
}
module.exports={canonical,hash,residentId,validate};
