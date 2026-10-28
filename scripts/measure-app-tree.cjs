'use strict';
// Developer-only, bounded Windows measurement. Starts ONLY an isolated synthetic
// profile, queries counters without event tracing/UAC, and never reads owner data.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process');
function options(args){
 const o={kind:'idle'};for(let i=0;i<args.length;i+=2){const key=args[i]?.slice(2),value=args[i+1];if(!['app','out','kind','model'].includes(key)||!value)throw Error('Invalid measurement option');o[key]=value;}
 if(!['idle','validation'].includes(o.kind)||!path.isAbsolute(o.app||'')||path.basename(o.app).toLowerCase()!=='privateai.exe'||!path.isAbsolute(o.out||'')||(o.model&&!path.isAbsolute(o.model)))throw Error('Invalid measurement paths');
 if(o.kind==='idle'&&o.model)throw Error('Idle measurement does not load models');return o;
}
function summarize(samples){
 if(!samples.length)return null;
 const max=key=>Math.max(...samples.map(s=>s[key])),mean=key=>samples.reduce((n,s)=>n+s[key],0)/samples.length;
 const elapsed=samples.at(-1).elapsedMs-samples[0].elapsedMs,cpu=samples.at(-1).cpuMs-samples[0].cpuMs;
 return {samples:samples.length,sampledPeakWorkingSetBytes:max('workingSetBytes'),sampledPeakPrivateCommitBytes:max('privateBytes'),meanWorkingSetBytes:Math.round(mean('workingSetBytes')),meanPrivateCommitBytes:Math.round(mean('privateBytes')),peakProcessCount:max('processCount'),minimumAvailableBytes:Math.min(...samples.map(s=>s.availableBytes)),cpuMs:cpu,oneCoreCpuPercent:elapsed>0?+(100*cpu/elapsed).toFixed(3):null};
}
const collector=String.raw`
$ErrorActionPreference='Stop'
$o=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__OPTIONS__'))|ConvertFrom-Json
$owned=@{}; $samples=New-Object Collections.Generic.List[object]; $started=[DateTime]::UtcNow; $clock=[Diagnostics.Stopwatch]::StartNew(); $status='failed'; $root=$null
try {
 $psi=New-Object Diagnostics.ProcessStartInfo; $psi.FileName=$o.app; $psi.UseShellExecute=$false; $psi.CreateNoWindow=$true
 foreach($k in @('ELECTRON_RUN_AS_NODE','NODE_OPTIONS','PRIVATE_AI_VALIDATION_MODEL','PRIVATE_AI_VALIDATION_AUTOMATIC','PRIVATE_AI_VALIDATION_DOCUMENT_TOOLS')){$psi.EnvironmentVariables.Remove($k)}
 $psi.EnvironmentVariables['LOCALAPPDATA']=$o.local; $psi.EnvironmentVariables['APPDATA']=$o.roaming; $psi.EnvironmentVariables['TEMP']=$o.temp; $psi.EnvironmentVariables['TMP']=$o.temp
 $psi.Arguments=if($o.kind -eq 'idle'){'--background'}else{'--release-validation="'+$o.validation+'"'}
 if($o.model){$psi.EnvironmentVariables['PRIVATE_AI_VALIDATION_MODEL']=$o.model;$psi.EnvironmentVariables['PRIVATE_AI_VALIDATION_CONTEXT']='2048';$psi.EnvironmentVariables['PRIVATE_AI_VALIDATION_OUTPUT']='192'}
 $root=[Diagnostics.Process]::Start($psi);$owned[$root.Id]=@{ticks=$root.StartTime.ToUniversalTime().Ticks;cpu=0.0}
 $limit=if($o.kind -eq 'idle'){20000}else{180000}
 while($clock.ElapsedMilliseconds -lt $limit){
  $tree=@(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId -OperationTimeoutSec 5)
  do{$added=$false;foreach($row in $tree){$id=[int]$row.ProcessId;$parentId=[int]$row.ParentProcessId;if(!$owned.ContainsKey($id) -and $owned.ContainsKey($parentId)){
   try{$parent=[Diagnostics.Process]::GetProcessById($parentId);if($parent.StartTime.ToUniversalTime().Ticks -ne $owned[$parentId].ticks){continue};$p=[Diagnostics.Process]::GetProcessById($id);$ticks=$p.StartTime.ToUniversalTime().Ticks;if($ticks -lt $owned[$parentId].ticks){continue};$owned[$id]=@{ticks=$ticks;cpu=0.0};$added=$true}catch{}
  }}}while($added)
  $ws=0L;$private=0L;$count=0
  foreach($id in @($owned.Keys)){try{$p=[Diagnostics.Process]::GetProcessById($id);if($p.StartTime.ToUniversalTime().Ticks -ne $owned[$id].ticks){continue};$p.Refresh();$ws+=$p.WorkingSet64;$private+=$p.PrivateMemorySize64;$owned[$id].cpu=[Math]::Max($owned[$id].cpu,$p.TotalProcessorTime.TotalMilliseconds);$count++}catch{}}
  $ram=Get-CimInstance Win32_OperatingSystem -Property FreePhysicalMemory,TotalVisibleMemorySize -OperationTimeoutSec 5
  $cpu=0.0;foreach($v in $owned.Values){$cpu+=$v.cpu}
  $samples.Add(@{elapsedMs=$clock.ElapsedMilliseconds;workingSetBytes=$ws;privateBytes=$private;processCount=$count;cpuMs=$cpu;availableBytes=([long]$ram.FreePhysicalMemory*1024);totalBytes=([long]$ram.TotalVisibleMemorySize*1024)})
  if(Test-Path -LiteralPath $o.cancel){$status='cancelled';break}
  if(([long]$ram.FreePhysicalMemory*1024) -lt 1GB){$status='pressure-stopped';break}
  if($root.HasExited){$status=if($o.kind -eq 'validation' -and $root.ExitCode -eq 0){'exited'}else{'app-failed'};break}
  Start-Sleep -Milliseconds 1000
 }
 if($status -eq 'failed'){$status=if($o.kind -eq 'idle'){'sampled-idle'}else{'timed-out'}}
} catch {$status='counter-or-launch-failed'} finally {
 # Never kill by name. PID reuse is fenced against the recorded creation time.
 foreach($id in @($owned.Keys)){try{$p=[Diagnostics.Process]::GetProcessById($id);if($p.StartTime.ToUniversalTime().Ticks -eq $owned[$id].ticks){$p.Kill()}}catch{}}
 $cleanupDeadline=[DateTime]::UtcNow.AddSeconds(5);$remaining=0
 do{$remaining=0;foreach($id in @($owned.Keys)){try{$p=[Diagnostics.Process]::GetProcessById($id);if($p.StartTime.ToUniversalTime().Ticks -eq $owned[$id].ticks -and !$p.HasExited){$remaining++}}catch{}};if($remaining){Start-Sleep -Milliseconds 100}}while($remaining -and [DateTime]::UtcNow -lt $cleanupDeadline)
}
@{status=$status;ownedProcessesRemaining=$remaining;startedUtc=$started.ToString('o');durationMs=$clock.ElapsedMilliseconds;samples=@($samples.ToArray())}|ConvertTo-Json -Depth 6 -Compress
`;
async function measure(o){
 if(process.platform!=='win32')throw Error('Windows measurement only');
 const root=o.out+'.synthetic';if(fs.existsSync(o.out)||fs.existsSync(root))throw Error('Choose a new evidence destination');
 const asar=path.join(path.dirname(o.app),'resources','app.asar');if(!fs.statSync(o.app).isFile()||!fs.statSync(asar).isFile())throw Error('Packaged app required');
 for(const sub of ['Local','Roaming','Temp'])fs.mkdirSync(path.join(root,sub),{recursive:true});
 const input={...o,local:path.join(root,'Local'),roaming:path.join(root,'Roaming'),temp:path.join(root,'Temp'),validation:path.join(root,'application-evidence.json'),cancel:o.out+'.cancel'};
 const command=collector.replace('__OPTIONS__',Buffer.from(JSON.stringify(input)).toString('base64'));
 const data=await new Promise((resolve,reject)=>execFile(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:210000,maxBuffer:2*1024**2},(error,stdout)=>{if(error)return reject(Error('Bounded measurement collector failed'));try{resolve(JSON.parse(stdout));}catch{reject(Error('Invalid measurement counters'));}}));
 const hash=async file=>{const h=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest('hex');};
 const report={schema:1,kind:o.kind,executableSHA256:await hash(o.app),applicationArchiveSHA256:await hash(asar),...data,summary:summarize(data.samples),steadyIdle:o.kind==='idle'?summarize(data.samples.filter(s=>s.elapsedMs>=10000)):undefined,limitations:['Only the owned process tree is counted; the collector is excluded.','Working-set sums count shared pages once per process; private commit is a different quantity.','One-second polling plus counter-query time can miss short-lived children and transient peaks.','Idle means a fresh tray-only synthetic profile; it does not establish a connected WhatsApp/phone idle baseline.','CPU is accumulated from sampled process lifetimes, a lower bound for short-lived processes.','Available RAM is system-wide and can change due to unrelated applications.','Synthetic profiles and no production records; no event tracing, elevation, cloud keys or browser sign-in.']};
 if(o.kind==='validation'&&fs.existsSync(input.validation)){const v=JSON.parse(fs.readFileSync(input.validation,'utf8'));report.validation={passed:v.passed,actualModelInferenceExecuted:v.actualModelInferenceExecuted,rendererReadyMs:v.rendererReadyMs,collectorStartToRendererReadyMs:Number.isFinite(v.rendererReadyMs)&&Number.isFinite(Date.parse(v.started))?Date.parse(v.started)+v.rendererReadyMs-Date.parse(data.startedUtc):null,startupScope:'Collector start to hidden synthetic renderer ready; includes collector setup, not cold boot or visible first paint',checks:v.checks?.length,errorCode:v.error?.code||null};}
 fs.writeFileSync(o.out,JSON.stringify(report,null,2),{flag:'wx'});return report;
}
if(require.main===module)measure(options(process.argv.slice(2))).then(r=>console.log(JSON.stringify({status:r.status,summary:r.summary,validation:r.validation}))).catch(()=>{console.error('Measurement failed; no raw errors, paths or inputs logged.');process.exitCode=1;});
module.exports={options,summarize};
