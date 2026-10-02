'use strict';
const {PROVIDERS}=require('./providers.cjs');
const {assertProviderPolicy}=require('./provider-policy.cjs');
const {cloudAllowed}=require('./hybrid-settings.cjs');

// Configuration/authorization only, never a connectivity or model-quality claim.
// The existing provider-policy fingerprint remains the cloud security authority.
function transportCapability(settings,key,hipaa=settings.hipaa){
 const provider=settings.provider||'openai',metadata=PROVIDERS[provider];
 if(!metadata)return {provider,classification:'unknown',allowed:false,configured:false,ready:false,reason:'INVALID'};
 const local=metadata.classification==='local';
 const allowed=local||cloudAllowed(settings);
 const configured=provider!=='local'&&!!settings.model&&(!metadata.requiresKey||!!key);
 let reason=!allowed?'LOCAL_ONLY':provider==='local'?'AI_SETUP':!settings.model?'MODEL':metadata.requiresKey&&!key?'KEY':null;
 if(!reason)try{assertProviderPolicy({...settings,hipaa:hipaa||settings.hipaa},key);}catch(e){reason=e.code||'POLICY';}
 return {provider,classification:metadata.classification,allowed,configured,ready:reason===null,reason};
}
function localConfigured(settings,tiers=[]){
 if(settings.localTier==='selected')return !!settings.localModelPath;
 if(settings.localTier&&settings.localTier!=='auto')return tiers.some(t=>t.tier===settings.localTier&&t.installed);
 return !!settings.localModelPath||tiers.some(t=>t.installed);
}
function requiredCapability(messages,options={}){
 if(options.web)return 'web';
 return messages.some(m=>Array.isArray(m.content)&&m.content.some(p=>p.type==='input_image'))?'images':'text';
}
const EVIDENCE_INSTRUCTIONS='Separate supplied facts from interpretations. Missing information is unknown, not a confirmed negative finding. Distinguish unavailable sources, stale or incomplete data, and explicitly confirmed absence; do not infer one from another. Do not claim access to feeds or records not supplied. For clinical analysis, identify evidence gaps and review needs; do not invent diagnoses, medication status, or treatment decisions. Without live sources, do not claim current guidance was verified.';
module.exports={transportCapability,localConfigured,requiredCapability,EVIDENCE_INSTRUCTIONS};
