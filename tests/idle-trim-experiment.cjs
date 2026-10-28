'use strict';
// Explicit developer experiment, not an application entry point. Synthetic
// Electron view only; this is not full packaged-UI acceptance or a savings claim.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFile}=require('node:child_process');
const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
if(!out||!path.isAbsolute(out)||fs.existsSync(out)||fs.existsSync(out+'.profile'))throw Error('New experiment destination required');
app.setPath('userData',out+'.profile');let win;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function restore(){const start=performance.now();win.show();const state=await win.webContents.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve({draft:document.querySelector('textarea').value,messages:document.querySelectorAll('article').length}))))`);assert.equal(state.draft,'SYNTHETIC unsent draft survives');assert.equal(state.messages,500);return Math.round(performance.now()-start);}
app.whenReady().then(async()=>{
 try{
  win=new BrowserWindow({width:1000,height:700,show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  await win.loadURL('data:text/html,'+encodeURIComponent('<h1>Synthetic idle-memory experiment</h1><textarea>SYNTHETIC unsent draft survives</textarea>'+Array.from({length:500},(_,i)=>'<article>Only synthetic message '+i+': supplied facts remain unknown.</article>').join('')));
  win.show();await delay(2000);win.hide();await delay(250);const controlRestoreMs=await restore();win.hide();await delay(250);
  const pids=app.getAppMetrics().filter(p=>['Tab','GPU'].includes(p.type)&&p.pid!==process.pid).map(p=>p.pid);
  const source=path.join(__dirname,'../desktop-helper/WindowsMemory.cs').replace(/'/g,"''");
  const code=`$ErrorActionPreference='Stop';Add-Type -Path '${source}';[WindowsMemory]::TrimIdleChildren([int[]]@(${pids.join(',')}))|ConvertTo-Json -Compress`;
  const counters=await new Promise((resolve,reject)=>execFile(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',code],{windowsHide:true,timeout:15000,maxBuffer:16384},(e,s)=>{if(e)return reject(Error('Experiment helper unavailable'));try{resolve(JSON.parse(s));}catch{reject(Error('Invalid counters'));}}));
  await delay(250);const hiddenWorkingSetAfter250Ms=app.getAppMetrics().filter(p=>pids.includes(p.pid)).reduce((n,p)=>n+(p.memory?.workingSetSize||0)*1024,0);
  const trimmedRestoreMs=await restore();fs.writeFileSync(out,JSON.stringify({scope:'Synthetic Electron view, not packaged application',ownerDataAccessed:false,controlRestoreMs,trimmedRestoreMs,hiddenWorkingSetAfter250Ms,draftPreserved:true,...counters},null,2),{flag:'wx'});
 }finally{win?.destroy();app.quit();}
}).catch(()=>{console.error('Synthetic idle experiment stopped.');app.exit(1);});
