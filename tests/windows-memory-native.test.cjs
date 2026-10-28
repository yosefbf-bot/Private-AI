'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{execFile}=require('node:child_process');
test('native Windows counters compile and trimming refuses the helper itself and its parent',{skip:process.platform!=='win32',timeout:30000},async()=>{
 const source=path.join(__dirname,'../desktop-helper/WindowsMemory.cs').replace(/'/g,"''"),script=`$ErrorActionPreference='Stop';Add-Type -Path '${source}';@{health=[WindowsMemory]::Health();trim=[WindowsMemory]::TrimIdleChildren([int[]]@($PID,${process.pid}))}|ConvertTo-Json -Depth 5 -Compress`;
 const r=await new Promise((resolve,reject)=>execFile(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,timeout:20000,maxBuffer:16384},(e,s)=>{if(e)return reject(Error('Windows memory helper check failed'));try{resolve(JSON.parse(s));}catch{reject(Error('Invalid memory counters'));}}));
 assert.ok(r.health.totalBytes>=r.health.availableBytes);assert.ok(r.health.commitLimitBytes>=r.health.commitAvailableBytes);assert.equal(typeof r.health.pageFileKnown,'boolean');assert.equal(r.trim.trimmed,0);assert.equal(r.trim.skipped,2);
});
