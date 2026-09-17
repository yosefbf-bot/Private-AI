'use strict';
const { fail } = require('./security.cjs');
const MODES = ['smart-hybrid','local-first','cloud-first','local-only'];
const HYBRID_DEFAULTS = Object.freeze({processingMode:'smart-hybrid',allowCloud:true,localModelPath:'',localTier:'auto',localMaxTier:'high',smallModelPath:'',mediumModelPath:'',highModelPath:'',extraModelPath:'',workProfile:'work',ramReserveMB:1024,ramRecoverySeconds:5,keepBrainMinutes:0,sectionedReports:false,localIdleMinutes:5,localContext:4096,localMaxOutput:768,resourceMode:'balanced',escalationThreshold:85,showReliability:true,priceInput:null,priceCachedInput:null,priceOutput:null,priceModel:''});
function validateHybrid(input,current) {
 const s={...HYBRID_DEFAULTS,...current};
 for(const k of Object.keys(HYBRID_DEFAULTS))if(input[k]!==undefined)s[k]=input[k];
 if(!MODES.includes(s.processingMode)||!['balanced','performance'].includes(s.resourceMode))throw fail('INVALID');
 if(!['auto','selected','small','medium','high','extra'].includes(s.localTier)||!['small','medium','high','extra'].includes(s.localMaxTier))throw fail('INVALID');
 if(!['work','away'].includes(s.workProfile))throw fail('INVALID');
 for(const k of ['allowCloud','showReliability','sectionedReports'])if(typeof s[k]!=='boolean')throw fail('INVALID');
 for(const [k,min,max] of [['ramReserveMB',512,8192],['ramRecoverySeconds',0,60],['keepBrainMinutes',0,15],['localIdleMinutes',1,60],['localContext',1024,16384],['localMaxOutput',128,4096],['escalationThreshold',70,100]])if(!Number.isInteger(s[k])||s[k]<min||s[k]>max)throw fail('INVALID');
 for(const k of ['priceInput','priceCachedInput','priceOutput'])if(s[k]!==null&&(!Number.isFinite(s[k])||s[k]<0||s[k]>10000))throw fail('INVALID');
 for(const [k,max] of [['localModelPath',2000],['smallModelPath',2000],['mediumModelPath',2000],['highModelPath',2000],['extraModelPath',2000],['priceModel',120]])if(typeof s[k]!=='string'||s[k].length>max||/[\x00-\x1f]/.test(s[k]))throw fail('INVALID');
 return s;
}
function cloudAllowed(s){return s.processingMode!=='local-only'&&s.allowCloud!==false;}
module.exports={MODES,HYBRID_DEFAULTS,validateHybrid,cloudAllowed};
