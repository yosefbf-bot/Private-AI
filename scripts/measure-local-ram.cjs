'use strict';
// Developer-only synthetic benchmark. No Core, owner store, cloud or app startup.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const {LocalBrain,requiredMemory,localInput}=require('../source/local-brain.cjs');
const {ModelManager}=require('../source/model-manager.cjs');
const {HYBRID_DEFAULTS}=require('../source/hybrid-settings.cjs');
const GIB=1024**3,PROFILES=Object.freeze({standard:[128,64],smaller:[64,32]});
const available=()=>Math.min(os.freemem(),process.availableMemory?.()||Infinity);
function options(args){
 const opts={tiers:['small','medium','high'],contexts:[2048,4096,8192],repetitions:3,profiles:['standard','smaller']};
 for(let i=0;i<args.length;i+=2){const name=args[i],v=args[i+1];if(!v)throw Error('Missing benchmark option');if(name==='--runtime')opts.runtime=v;else if(name==='--out')opts.out=v;else if(name==='--tiers')opts.tiers=v.split(',');else if(name==='--contexts')opts.contexts=v.split(',').map(Number);else if(name==='--repetitions')opts.repetitions=Number(v);else if(name==='--profiles')opts.profiles=v.split(',');else throw Error('Unknown benchmark option');}
 if(!opts.runtime||!opts.out||!path.isAbsolute(opts.runtime)||!path.isAbsolute(opts.out)||!Number.isInteger(opts.repetitions)||opts.repetitions<1||opts.repetitions>3||opts.tiers.some(x=>!['small','medium','high','extra'].includes(x))||opts.contexts.some(x=>![2048,4096,8192].includes(x))||opts.profiles.some(x=>!Object.hasOwn(PROFILES,x)))throw Error('Invalid benchmark options');
 return opts;
}
function plan(opts,rows){return opts.tiers.flatMap(tier=>opts.contexts.flatMap(context=>opts.profiles.flatMap(profile=>Array.from({length:opts.repetitions},(_,i)=>({tier,context,profile,repetition:i+1,row:rows.find(r=>r.tier===tier)})))));}
function fixture(settings){
 const facts='Synthetic inventory: alpha has 12 blue boxes; beta has 7 green boxes; gamma has 3 red boxes. No person or clinical data is present. ';
 return [{role:'user',content:facts+'Return only this line, with no explanation: alpha=12 blue; beta=7 green; gamma=3 red.'}];
}
function metrics(data){const result={};for(const [k,v]of Object.entries(data||{}))if(['peakWorkingSetBytes','workingSetBytes','peakCommitBytes','privateBytes','cpuMilliseconds'].includes(k)&&Number.isFinite(v)&&v>=0)result[k]=v;return result;}
function counters(pid){
 if(!Number.isSafeInteger(pid)||pid<=0)return Promise.resolve(null);
 const command=`$ErrorActionPreference='Stop'; $p=[Diagnostics.Process]::GetProcessById(${pid}); $p.Refresh(); @{peakWorkingSetBytes=$p.PeakWorkingSet64;workingSetBytes=$p.WorkingSet64;peakCommitBytes=$p.PeakPagedMemorySize64;privateBytes=$p.PrivateMemorySize64;cpuMilliseconds=$p.TotalProcessorTime.TotalMilliseconds}|ConvertTo-Json -Compress`;
 return new Promise(resolve=>execFile(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:8000,maxBuffer:2048},(error,out)=>{if(error)return resolve(null);try{resolve(metrics(JSON.parse(out)));}catch{resolve(null);}}));
}
async function probe(runtime,{item,manager,memory,signal}){
 // --version hangs on the accepted Windows shim on this PC, although its normal
 // authenticated server path succeeds. A real, guarded f16 inference is stronger
 // functional evidence. No cache-compression capability is inferred from it.
 const trial=await runCase({...item,repetition:0,preflight:true},{runtime,manager,memory,signal,limitMs:45000});
 return {status:trial.status==='passed'?'passed':'failed',kind:'authenticated-synthetic-local-inference',reason:trial.status==='passed'?undefined:trial.reason||trial.status};
}
async function runCase(item,{runtime,manager,memory=available,sample=counters,createBrain=opts=>new LocalBrain(opts),signal,limitMs=120000}={}){
 const record={tier:item.tier,contextTokens:item.context,cache:'f16',profile:item.profile,repetition:item.repetition};
 if(!item.row?.installed)return {...record,status:'unavailable'};
 const s={...HYBRID_DEFAULTS,localModelPath:item.row.file,localContext:item.context,localMaxOutput:192,processingMode:'local-only',allowCloud:false};
 const input=item.preflight?[{role:'user',content:'Synthetic runtime preflight. Reply with READY.'}]:fixture(s);localInput(s,input);
 record.estimatedMinimumBytes=requiredMemory(item.row.bytes,item.context);record.availableBeforeBytes=memory();
 if(record.availableBeforeBytes<record.estimatedMinimumBytes)return {...record,status:'refused',reason:'LOW_MEMORY'};
 if(signal?.aborted)return {...record,status:'cancelled'};
 await manager.verifyTier(item.tier,s,signal);
 let outputTokens=null,minimumAvailable=memory(),pressure=false,timedOut=false,timer,watchdog;
 const controller=new AbortController(),cancel=()=>controller.abort();signal?.addEventListener('abort',cancel,{once:true});
 const fetcher=async(...args)=>{const res=await fetch(...args);if(String(args[0]).endsWith('/v1/chat/completions')&&res.ok)return {ok:true,json:async()=>{const data=await res.json();outputTokens=Number.isSafeInteger(data.usage?.completion_tokens)?data.usage.completion_tokens:null;return data;}};return res;};
 const spawnProcess=(file,args,opts)=>{const argv=[...args];for(const [flag,value]of [['--batch-size',PROFILES[item.profile][0]],['--ubatch-size',PROFILES[item.profile][1]]]){const index=argv.indexOf(flag);if(index<0)throw Error('Bundled launch arguments changed');argv[index+1]=String(value);}return require('node:child_process').spawn(file,argv,opts);};
 const brain=createBrain({runtime,settings:()=>s,memory,fetcher,spawnProcess});
 try{
  timer=setTimeout(()=>{timedOut=true;controller.abort();brain.stop('measurement-timeout');},limitMs);
  watchdog=setInterval(()=>{minimumAvailable=Math.min(minimumAvailable,memory());if(minimumAvailable<GIB){pressure=true;controller.abort();brain.stop('low-memory');}},250);
  const started=performance.now();await brain.load(s);record.loadMs=Math.round(performance.now()-started);
  if(controller.signal.aborted)throw Error('Measurement stopped');
  const generating=performance.now();const result=await brain.generate(s,input,{signal:controller.signal});record.generationMs=Math.round(performance.now()-generating);
  if(!result.text?.trim()||result.incomplete)record.status='incomplete';else record.status='passed';
  record.completionTokens=outputTokens;record.syntheticLiteralMatch=item.preflight?result.text.trim()==='READY':result.text.trim()==='alpha=12 blue; beta=7 green; gamma=3 red.';
  const normalized=value=>value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');record.syntheticFormatInsensitiveMatch=normalized(result.text)===normalized(item.preflight?'READY':'alpha=12 blue; beta=7 green; gamma=3 red.');
  record.endToEndOutputTokensPerSecond=outputTokens!==null&&record.generationMs>0?+(outputTokens*1000/record.generationMs).toFixed(3):null;
  // Never retain or print generated text or the synthetic prompt.
  record.process=await sample(brain.child?.pid);record.countersAvailable=!!record.process;
 }catch(error){record.status=pressure?'pressure-cancelled':timedOut?'timed-out':signal?.aborted?'cancelled':'failed';record.reason=pressure?'LOW_MEMORY':timedOut?'TIMEOUT':['LOW_MEMORY','CANCELLED','LOCAL_ENGINE_START','LOCAL_ENGINE_TIMEOUT','LOCAL_UNAVAILABLE'].includes(error.code)?error.code:'MEASUREMENT_FAILED';}
 finally{clearTimeout(timer);clearInterval(watchdog);signal?.removeEventListener('abort',cancel);brain.close();await brain.waitStopped();record.minimumAvailableBytes=Math.min(minimumAvailable,memory());}
 return record;
}
async function measure(opts,{manager=new ModelManager({directory:path.join(process.env.LOCALAPPDATA,'PrivateAIModels')}),memory=available,runtimeProbe=probe,caseRunner=runCase,signal,checkpoint=()=>{}}={}){
 const rows=manager.catalog(HYBRID_DEFAULTS),cases=plan(opts,rows),report={schema:1,baseMainCommit:'73f26687a1c7ace4dc03f323bff83915d419c6c5',localBrainSourceSHA256:crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'../source/local-brain.cjs'))).digest('hex'),cache:'f16',cpu:os.cpus()[0]?.model,logicalProcessors:os.cpus().length,totalMemoryBytes:os.totalmem(),initialAvailableBytes:memory(),models:rows.map(({tier,name,bytes,installed})=>({tier,name,bytes,installed})),results:[],limitations:['Synthetic local inference only; no owner records or cloud.','Current admission/reserve/pressure guards are retained; refused configurations were not run.','Same fixed complete synthetic input at each context; this is not a full-context quality benchmark.','End-to-end token rate includes prompt processing; it is not isolated decode speed.','Process peaks and system-free changes are different quantities; unavailable counters stay unknown.','Model checksum reads warm the filesystem cache; these are not cold-boot trials.','The version-only CLI probe timed out separately; runtime source tag/capabilities are not inferred from the functional preflight.']};
 const admitted=cases.find(c=>c.row?.installed&&memory()>=requiredMemory(c.row.bytes,c.context));
 report.runtimeProbe=admitted?await runtimeProbe(opts.runtime,{item:admitted,manager,memory,signal}):{status:'not-run',reason:'no-safely-admissible-configuration'};
 const deadline=Date.now()+20*60000;
 for(const item of cases){if(signal?.aborted||Date.now()>=deadline){report.cancelled=!!signal?.aborted;report.deadlineReached=Date.now()>=deadline;break;}if(report.runtimeProbe.status!=='passed'){const refused=!item.row?.installed?'unavailable':memory()<requiredMemory(item.row.bytes,item.context)?'refused':'not-run';report.results.push({tier:item.tier,contextTokens:item.context,profile:item.profile,repetition:item.repetition,status:refused,reason:refused==='refused'?'LOW_MEMORY':'runtime-preflight-unavailable'});checkpoint(report);continue;}try{report.results.push(await caseRunner(item,{runtime:opts.runtime,manager,memory,signal,limitMs:Math.min(60000,deadline-Date.now())}));}catch(error){report.results.push({tier:item.tier,contextTokens:item.context,profile:item.profile,repetition:item.repetition,status:signal?.aborted?'cancelled':'failed',reason:['CANCELLED','LOCAL_MODEL','LOCAL_FILE_MISSING'].includes(error.code)?error.code:'MEASUREMENT_FAILED'});}checkpoint(report);if(require.main===module)console.log(JSON.stringify({case:report.results.length,total:cases.length,tier:item.tier,context:item.context,profile:item.profile,status:report.results.at(-1).status}));}
 return report;
}
async function main(){
 if(process.platform!=='win32')throw Error('Windows benchmark only');
 const opts=options(process.argv.slice(2));if(fs.existsSync(opts.out)||fs.existsSync(opts.out+'.partial'))throw Error('Evidence destination exists; preserve it and choose another path');
 const controller=new AbortController(),cancel=()=>controller.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
 const stopPoll=setInterval(()=>{if(fs.existsSync(opts.out+'.cancel'))controller.abort();},500);let report;
 const checkpoint=value=>{fs.mkdirSync(path.dirname(opts.out),{recursive:true});fs.writeFileSync(opts.out+'.partial',JSON.stringify(value,null,2));};
 try{report=await measure(opts,{signal:controller.signal,checkpoint});report.runtimeSHA256=crypto.createHash('sha256').update(fs.readFileSync(opts.runtime)).digest('hex');report.completedAt=new Date().toISOString();}
 finally{clearInterval(stopPoll);process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);if(report){fs.mkdirSync(path.dirname(opts.out),{recursive:true});fs.writeFileSync(opts.out,JSON.stringify(report,null,2),{flag:'wx'});}}
 const counts={};for(const r of report.results)counts[r.status]=(counts[r.status]||0)+1;console.log(JSON.stringify({counts,runtimeProbe:report.runtimeProbe}));
}
if(require.main===module)main().catch(()=>{console.error('Local measurement failed; no raw error or input was logged.');process.exitCode=1;});
module.exports={options,plan,fixture,metrics,runCase,measure,PROFILES};
