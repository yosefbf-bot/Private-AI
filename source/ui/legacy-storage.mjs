// Move recoverable legacy plaintext browser records into the encrypted backend.
// Delete a legacy item only after a successful save (temporary material is purged).
export async function migrateLegacyStorage(api,storage,autosaveKey,voiceKey){
 const raw=storage.getItem(autosaveKey);
 if(raw){
  const old=JSON.parse(raw);
  if(!old.temporary&&old.prompt){
   let id=old.chatId;
   if(id){try{await api('chat',{id});}catch{throw Error('Legacy draft recovery needs review; original browser copy retained.');}}
   else id=(await api('createChat')).id;
   await api('saveDraft',{id,text:old.prompt});
  }
  storage.removeItem(autosaveKey);
 }
 const voice=storage.getItem(voiceKey);
 if(voice){const rows=JSON.parse(voice);if(!Array.isArray(rows))throw Error('Legacy transcript format needs review.');for(const row of rows){if(row.text)await api('voiceTranscriptSave',{text:row.text,mode:row.mode,legacyId:row.id,legacyTimestamp:row.timestamp});}storage.removeItem(voiceKey);}
}
