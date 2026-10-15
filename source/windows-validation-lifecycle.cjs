"use strict";
// Isolated opt-in acceptance only. Normal application scheduling is unchanged.
function quiesceAutomaticEnrichment(core){
 clearInterval(core.speechWorkTimer);
 return {automaticSpeechAndDraftTimerQuiesced:true,concurrentEnrichmentShutdownVerified:false};
}
function assertNoActiveRequests(core){
 if(core.requests.size===0)return {activeRequests:0,requestKinds:[]};
 const kinds=[...new Set([...core.requests.keys()].map(id=>typeof id==='string'&&id.startsWith('assistant-draft:')?'assistant-draft':id==='local-speech'?'local-speech':typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id)?'chat-or-job':'other'))];
 // Fixed technical categories only: no request IDs, prompts, errors or paths.
 throw Object.assign(Error('Controlled Windows acceptance still has active requests: count='+Math.min(10000,core.requests.size)+'; kinds='+kinds.join(',')),{code:'VALIDATION_BUSY'});
}
module.exports={quiesceAutomaticEnrichment,assertNoActiveRequests};
