'use strict';
// Manual Windows acceptance; reads installed catalog models, never user records.
// node tests/windows-local-inference.cjs <absolute evidence directory>
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {ModelManager}=require('../source/model-manager.cjs');
const {LocalBrain}=require('../source/local-brain.cjs');
const {HYBRID_DEFAULTS}=require('../source/hybrid-settings.cjs');
const {sampleProcessMemory}=require('../source/process-memory.cjs');
async function cpuMilliseconds(pid){
 if(!Number.isSafeInteger(pid)||pid<=0)throw Error('Invalid process');
 const {stdout}=await require('node:util').promisify(require('node:child_process').execFile)(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',`[Console]::Write(([System.Diagnostics.Process]::GetProcessById(${pid})).TotalProcessorTime.TotalMilliseconds.ToString([System.Globalization.CultureInfo]::InvariantCulture))`],{windowsHide:true,timeout:5000});
 return Number(stdout.trim());
}
async function run(directory){
 if(process.platform!=='win32'||!path.isAbsolute(directory))throw Error('Windows and an absolute evidence directory required');
 fs.mkdirSync(directory,{recursive:true});
 const runtime=path.resolve(__dirname,'../dist/win-unpacked/resources/local-runtime/llama-server.exe');
 const manager=new ModelManager({directory:path.join(process.env.LOCALAPPDATA,'PrivateAIModels')});
 let settings={...HYBRID_DEFAULTS,processingMode:'local-only',allowCloud:false,localMaxOutput:128};
 const brain=new LocalBrain({runtime,settings:()=>settings});
 const evidence={version:require('../package.json').version,platform:process.platform,passed:false,actualModelInferenceExecuted:false,runtimeSHA256:crypto.createHash('sha256').update(fs.readFileSync(runtime)).digest('hex'),started:new Date().toISOString(),totalMemoryBytes:os.totalmem(),initialFreeMemoryBytes:os.freemem(),results:[],checks:[],limitations:['No cloud/provider request is made. Policy modes are covered separately by source regression tests.','Generation uses the existing non-streaming transport; time to first token is not measured.','Measurements are observations on this PC, not performance guarantees.']};
 try{
  for(const tier of ['small','medium','high','extra']){
   const row=manager.catalog(settings).find(r=>r.tier===tier);
   if(!row?.installed){(evidence.unavailableTiers??=[]).push(tier);continue;}
   const start=performance.now();await manager.verifyTier(tier,settings);const checksumMs=performance.now()-start;
   settings={...settings,localModelPath:row.file};
   const record={tier,checksumVerified:true,checksumMs:Math.round(checksumMs),freeMemoryBeforeLoad:os.freemem()};
   try{
    const load=performance.now();await brain.load(settings);record.loadMs=Math.round(performance.now()-load);
    record.peakWorkingSetBytes=await sampleProcessMemory(brain.child.pid);
    const cpuBefore=await cpuMilliseconds(brain.child.pid),cpuStart=performance.now();
    const generated=performance.now();const result=await brain.generate(settings,[{role:'user',content:'Reply with the word READY. This is a synthetic installation test.'}]);
    assert.ok(result.text.trim());record.response=result.text;record.generationMs=Math.round(performance.now()-generated);record.peakWorkingSetBytes=await sampleProcessMemory(brain.child.pid);record.status='passed';evidence.actualModelInferenceExecuted=true;
    record.cpuTimeMs=await cpuMilliseconds(brain.child.pid)-cpuBefore;
    record.cpuSampleElapsedMs=Math.round(performance.now()-cpuStart);
    record.meanCpuPercentOfAllLogicalProcessors=+(100*record.cpuTimeMs/record.cpuSampleElapsedMs/os.cpus().length).toFixed(1);
    const cancellation=new AbortController();const pending=brain.generate(settings,[{role:'user',content:'Write a long numbered list of household objects.'}],{signal:cancellation.signal});setTimeout(()=>cancellation.abort(),100);await assert.rejects(pending,{code:'CANCELLED'});await brain.waitStopped();assert.equal(brain.child,null);record.cancellation='passed';
    brain.browserBusy=true;await assert.rejects(brain.generate(settings,[{role:'user',content:'Synthetic browser lane test'}]),{code:'LOW_MEMORY'});brain.browserBusy=false;record.browserLaneBlock='passed';
   }catch(e){record.status='blocked';record.errorCode=e.code||'UNKNOWN';}
   finally{brain.stop('validation');await brain.waitStopped();}
   evidence.results.push(record);console.log(JSON.stringify(record));
  }
  evidence.passed=evidence.results.filter(r=>r.status!=='unavailable').every(r=>r.status==='passed')&&evidence.actualModelInferenceExecuted;
 }finally{brain.close();await brain.waitStopped();evidence.completed=new Date().toISOString();fs.writeFileSync(path.join(directory,'inference-evidence.json'),JSON.stringify(evidence,null,2));}
 if(!evidence.passed)process.exitCode=1;
}
run(process.argv[2]||'').catch(e=>{console.error(e.code||e.message);process.exitCode=1;});
