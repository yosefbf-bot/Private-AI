'use strict';
const path=require('node:path');
const {execFile}=require('node:child_process');
// Fixed read-only Windows process query. No process names, command lines or paths
// are returned, no elevation, no model calls, and a bounded child lifetime.
function sampleProcessMemory(pid,{platform=process.platform,execute=execFile}={}){
 if(platform!=='win32'||!Number.isSafeInteger(pid)||pid<=0)return Promise.resolve(null);
 const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 const command=`$ErrorActionPreference='Stop'; $p=[System.Diagnostics.Process]::GetProcessById(${pid}); [Console]::Write($p.PeakWorkingSet64.ToString([System.Globalization.CultureInfo]::InvariantCulture))`;
 return new Promise(resolve=>execute(exe,['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:4000,maxBuffer:1024},(error,out)=>{const bytes=Number(String(out).trim());resolve(!error&&Number.isSafeInteger(bytes)&&bytes>0?bytes:null);}));
}
module.exports={sampleProcessMemory};
