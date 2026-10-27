'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
test('Windows Electron permits armed local audio and releases it on hide, denying camera and unarmed capture',{skip:process.platform!=='win32',timeout:40000},t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'privateai-audio-native-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 let output;try{output=execFileSync(require('electron'),[path.join(__dirname,'local-audio-native.cjs'),root],{env,encoding:'utf8',windowsHide:true,timeout:35000});}catch(error){assert.fail(String(error.stdout||'').split('\n').find(line=>line.startsWith('LOCAL_AUDIO_RESULT='))||'Electron audio acceptance failed');}
 const receipt=JSON.parse(output.split('\n').find(line=>line.startsWith('LOCAL_AUDIO_RESULT=')).slice('LOCAL_AUDIO_RESULT='.length));assert.equal(receipt.passed,true);assert.equal(receipt.physicalMicrophone,false);t.diagnostic(JSON.stringify(receipt));
});
