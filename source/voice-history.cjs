'use strict';
const {uuid,fail,text}=require('./security.cjs');
function dispatch(core,op,data){
 core.assertUnlocked();
 if(op==='voiceTranscriptSave'){
  if(data.temporary)return null;
  const legacy = typeof data.legacyId==='string' && /^vt_[\w-]{1,150}$/.test(data.legacyId);
  const id=legacy?data.legacyId:uuid();
  if(legacy&&core.store.get('voice_transcript',id))return core.store.get('voice_transcript',id);
  const entry={id,text:text(data.text,20000),mode:text(data.mode||'Voice',100),timestamp:legacy&&Number.isFinite(data.legacyTimestamp)?data.legacyTimestamp:Date.now()};
  const days=core.settings().retentionDays;
  core.store.put('voice_transcript',entry.id,entry,{expires:days?entry.timestamp+days*86400000:null});return entry;
 }
 if(op==='voiceTranscriptDelete'){core.store.delete('voice_transcript',data.id);core.purgeBackups();return true;}
 if(op==='voiceTranscriptClear'){for(const row of core.store.list('voice_transcript'))core.store.delete('voice_transcript',row.id);core.purgeBackups();return true;}
 throw fail('INVALID');
}
module.exports={dispatch};
