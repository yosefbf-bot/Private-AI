'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
test('Windows DPAPI restart retains protected credentials and actual Edge submits only synthetic login', {skip:process.platform!=='win32',timeout:180000},t=>{
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;delete env.DEBUG;delete env.PWDEBUG;
 const run=(root,mode)=>{
  let out;
  try{out=execFileSync(require('electron'),[path.join(__dirname,'browser-signin-native.cjs'),root,mode],{env,encoding:'utf8',windowsHide:true,timeout:55000});}
  catch(e){assert.fail('Synthetic Windows acceptance failed: '+String(e.stdout||'').split('\n').find(s=>s.startsWith('SIGNIN_NATIVE_RESULT=')));}
  const row=JSON.parse(out.split('\n').find(s=>s.startsWith('SIGNIN_NATIVE_RESULT=')).slice('SIGNIN_NATIVE_RESULT='.length));assert.equal(row.passed,true);assert.equal(row.actualWindowsDPAPI,true);assert.equal(row.actualEdgeLogin,true);assert.equal(row.edgeObserved,true);return row;
 };
 for(let attempt=1;attempt<=3;attempt++){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'privateai-signin-native-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const first=run(root,'save'),second=run(root,'restart');assert.equal(first.ciphertextSHA256,second.ciphertextSHA256);assert.equal(second.submissions,1);assert.equal(second.launches,1);
  assert.equal(second.browserVersions.length,second.launches);assert.ok(second.browserVersions.every(v=>Number(v.split('.')[0])>=155));
  t.diagnostic('SIGNIN_NATIVE_SAFE_TRACE='+JSON.stringify({attempt,mode:'restart',browserVersions:second.browserVersions,browserExits:second.browserExits,operationFailures:second.operationFailures,operations:second.operations}));
 }
});
