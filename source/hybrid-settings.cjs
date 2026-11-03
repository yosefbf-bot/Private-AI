'use strict';
const { fail } = require('./security.cjs');
const MODES = ['smart-hybrid','local-first','cloud-first','local-only','api-only'];
const RETIRED_TIERS = {medium:'high',extra:'advanced'};
const pathKey=p=>typeof p==='string'&&p?require('node:path').win32.normalize(p).toLowerCase():'';
function retiredPathTier(file,s={}) {
 const key=pathKey(file);if(!key)return null;
 if(key===pathKey(s.mediumModelPath)||require('node:path').win32.basename(key)==='llama-3.2-3b-instruct-q4_k_m.gguf')return 'high';
 if(key===pathKey(s.extraModelPath)||require('node:path').win32.basename(key)==='qwen3-8b-q4_k_m.gguf')return 'advanced';
 return null;
}
function migrateModelSettings(current={}) {
 const s={...current},changes=[];
 for(const field of ['localTier','localMaxTier'])if(Object.hasOwn(RETIRED_TIERS,s[field])){
  changes.push(`${field==='localTier'?'Selected brain':'Automatic ceiling'}: ${s[field]==='medium'?'3B → High (4B)':'8B → Advanced (9B)'}`);
  s[field]=RETIRED_TIERS[s[field]];
 }
 const replacement=retiredPathTier(s.localModelPath,s);
 if(replacement){
  s.localModelPath='';
  if(s.localTier==='selected'){s.localTier=replacement;changes.push(`Selected custom ${replacement==='high'?'3B → High (4B)':'8B → Advanced (9B)'}`);}
 }
 const hadLegacyPaths=Object.hasOwn(s,'mediumModelPath')||Object.hasOwn(s,'extraModelPath');
 delete s.mediumModelPath;delete s.extraModelPath;
 if(changes.length)s.localModelMigrationNotice=changes.join('; ')+'. The retired models were removed from the choices. Replacement files must be installed and pass the normal RAM and verification checks.';
 return changes.length||replacement||hadLegacyPaths?s:current;
}
const HYBRID_DEFAULTS = Object.freeze({processingMode:'smart-hybrid',allowCloud:true,localModelPath:'',localTier:'auto',localMaxTier:'high',smallModelPath:'',highModelPath:'',advancedModelPath:'',workProfile:'work',ramReserveMB:1024,ramRecoverySeconds:5,keepBrainMinutes:0,sectionedReports:false,localIdleMinutes:5,localContext:4096,localMaxOutput:768,resourceMode:'balanced',escalationThreshold:85,showReliability:true,priceInput:null,priceCachedInput:null,priceOutput:null,priceModel:''});
function validateHybrid(input,current) {
 const s={...HYBRID_DEFAULTS,...migrateModelSettings(current)};
 for(const k of Object.keys(HYBRID_DEFAULTS))if(input[k]!==undefined)s[k]=input[k];
 if(!MODES.includes(s.processingMode)||!['balanced','performance'].includes(s.resourceMode))throw fail('INVALID');
 if(!['auto','selected','small','high','advanced'].includes(s.localTier)||!['small','high','advanced'].includes(s.localMaxTier)||retiredPathTier(s.localModelPath))throw fail('INVALID');
 if(!['work','away'].includes(s.workProfile))throw fail('INVALID');
 for(const k of ['allowCloud','showReliability','sectionedReports'])if(typeof s[k]!=='boolean')throw fail('INVALID');
 for(const [k,min,max] of [['ramReserveMB',512,8192],['ramRecoverySeconds',0,60],['keepBrainMinutes',0,15],['localIdleMinutes',1,60],['localContext',1024,16384],['localMaxOutput',128,4096],['escalationThreshold',70,100]])if(!Number.isInteger(s[k])||s[k]<min||s[k]>max)throw fail('INVALID');
 for(const k of ['priceInput','priceCachedInput','priceOutput'])if(s[k]!==null&&(!Number.isFinite(s[k])||s[k]<0||s[k]>10000))throw fail('INVALID');
 for(const [k,max] of [['localModelPath',2000],['smallModelPath',2000],['highModelPath',2000],['advancedModelPath',2000],['priceModel',120]])if(typeof s[k]!=='string'||s[k].length>max||/[\x00-\x1f]/.test(s[k]))throw fail('INVALID');
 return s;
}
function cloudAllowed(s){return s.processingMode!=='local-only'&&s.allowCloud!==false;}
module.exports={MODES,HYBRID_DEFAULTS,validateHybrid,cloudAllowed,migrateModelSettings};
