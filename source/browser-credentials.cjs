'use strict';
const fs=require('node:fs'),path=require('node:path');
const {fail,isId,uuid,text,safePath,atomicWrite}=require('./security.cjs');

// Desktop main-process service only. There is deliberately no read RPC.
class BrowserCredentials{
 constructor(core,{safeStorage,verifyProtection,platform=process.platform}={}){this.core=core;this.protection=safeStorage;this.verifyProtection=verifyProtection;this.platform=platform;}
 available(){return this.platform==='win32'&&this.protection?.isEncryptionAvailable?.()===true&&typeof this.verifyProtection==='function';}
 file(id,create=false){
  if(!isId(id))throw fail('INVALID');
  if(!this.available())throw fail('ENCRYPTION');
  this.verifyProtection();
  const folder=safePath(this.core.root,'report-signins');
  if(create)fs.mkdirSync(folder,{recursive:true});
  return safePath(this.core.root,path.join('report-signins',id+'.dpapi'));
 }
 status(recipe){
  const meta=this.core.store.get('browserCredential',recipe.id);
  return {available:this.available(),saved:!!meta,matching:!!meta&&meta.hash===require('./browser-reports.cjs').digest(recipe),revision:meta?.revision||null};
 }
 invalidate(id){
  this.core.store.delete('browserGrant',id);this.core.store.delete('browserVerified',id);this.core.store.delete('browserLoginVerified',id);
 }
 save(recipe,input){
  this.core.assertUnlocked();if(!recipe.autoLogin)throw fail('INVALID');
  const username=text(input.username,1000),password=text(input.password,4096);
  if(!username.trim()||!password||/[\0\r\n]/.test(username)||/[\0\r\n]/.test(password))throw fail('INVALID');
  const file=this.file(recipe.id,true),revision=uuid(),hash=require('./browser-reports.cjs').digest(recipe);
  let bytes;
  try{bytes=this.protection.encryptString(JSON.stringify({version:1,id:recipe.id,hash,revision,username,password}));}catch{throw fail('ENCRYPTION');}
  // Revoke before replacing the file. A partial save fails closed, never with an old grant.
  this.invalidate(recipe.id);atomicWrite(file,bytes);
  this.core.store.put('browserCredential',recipe.id,{id:recipe.id,hash,revision});
  return {saved:true};
 }
 remove(id){
  this.core.assertUnlocked();const file=this.file(id);
  this.invalidate(id);
  try{fs.unlinkSync(file);}catch(e){if(e.code!=='ENOENT')throw fail('STORAGE');}
  this.core.store.delete('browserCredential',id);return {saved:false};
 }
 async use(recipe,fn){
  const status=this.status(recipe);if(!status.matching)throw fail('BROWSER_CREDENTIAL');
  let secret;
  try{
   const file=this.file(recipe.id);if(fs.statSync(file).size>32768)throw Error();
   secret=JSON.parse(this.protection.decryptString(fs.readFileSync(file)));
   if(secret.version!==1||secret.id!==recipe.id||secret.hash!==require('./browser-reports.cjs').digest(recipe)||secret.revision!==status.revision||typeof secret.username!=='string'||typeof secret.password!=='string')throw Error();
  }catch{throw fail('BROWSER_CREDENTIAL');}
  try{return await fn(secret);}finally{secret.username='';secret.password='';secret=null;}
 }
}
module.exports={BrowserCredentials};
