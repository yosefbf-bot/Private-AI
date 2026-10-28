'use strict';
// Explicit developer command, synthetic input only. Production defaults/owner
// stores are never changed. No download, cloud fallback or automatic lower tier.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
const {LocalBrain,requiredMemory,localInput}=require('../source/local-brain.cjs');
const {ModelManager}=require('../source/model-manager.cjs');
const {HYBRID_DEFAULTS}=require('../source/hybrid-settings.cjs');
const {calculate}=require('../source/deterministic.cjs');
const {fixtures,prompt,judge}=require('../tests/fixtures/local-quality.cjs');
const {NativeMemoryProbe}=require('./native-memory-probe.cjs');
const GIB=1024**3;
function options(args){
 const o={tiers:['small'],contexts:[2048],repetitions:2,condition:'normal',caseIds:[],capBytes:0,allocateBytes:0,lowPriority:false,tokenIds:false};
 for(let i=0;i<args.length;i+=2){const k=args[i],v=args[i+1];if(!v)throw Error('Missing option');
  if(k==='--runtime')o.runtime=v;else if(k==='--out')o.out=v;else if(k==='--tiers')o.tiers=v.split(',');else if(k==='--contexts')o.contexts=v.split(',').map(Number);else if(k==='--repetitions')o.repetitions=Number(v);else if(k==='--condition')o.condition=v;else if(k==='--cases')o.caseIds=v.split(',');else if(k==='--cap-mib')o.capBytes=Number(v)*1024**2;else if(k==='--allocate-mib')o.allocateBytes=Number(v)*1024**2;else if(k==='--low-priority'&&['true','false'].includes(v))o.lowPriority=v==='true';else if(k==='--token-ids'&&['true','false'].includes(v))o.tokenIds=v==='true';else throw Error('Unknown option');
 }
 if(!path.isAbsolute(o.runtime||'')||!path.isAbsolute(o.out||'')||o.tiers.some(t=>!['small','medium','high'].includes(t))||o.contexts.some(c=>![1024,2048,3072,4096,8192].includes(c))||![1,2].includes(o.repetitions)||!['normal','commit','working-set','system'].includes(o.condition)||o.caseIds.some(id=>!fixtures().some(c=>c.id===id)))throw Error('Invalid evaluation configuration');
 if(['commit','working-set'].includes(o.condition)?!Number.isSafeInteger(o.capBytes)||o.capBytes<GIB||o.capBytes>3*GIB:o.capBytes!==0)throw Error('Invalid diagnostic cap');
 if(o.condition==='system'?!Number.isSafeInteger(o.allocateBytes)||o.allocateBytes<=0||o.allocateBytes>1.5*GIB:o.allocateBytes!==0)throw Error('Invalid system allocation');
 return o;
}
const hashText=t=>crypto.createHash('sha256').update(t).digest('hex');
function tokenResponse(data){
 const ids=data.__verbose?.tokens,choice=data.choices?.[0];
 if(!Array.isArray(ids)||!ids.length||!ids.every(Number.isSafeInteger)||!choice?.finish_reason||typeof choice.message?.content!=='string')throw Error('TOKEN_IDS_UNAVAILABLE');
 return {text:choice.message.content,complete:true,ttftMs:null,usage:data.usage||{},finish:choice.finish_reason,timings:data.timings||data.__verbose?.timings||null,tokenIdsSHA256:hashText(JSON.stringify(ids)),tokenIdsCount:ids.length};
}
async function hashFile(file){const h=crypto.createHash('sha256');for await(const part of fs.createReadStream(file))h.update(part);return h.digest('hex');}
async function readStream(response,{started=performance.now(),signal}={}){
 let pending='',text='',first=null,usage={},finish=null,timings=null,tokens=null,bytes=0,complete=false;
 const decoder=new TextDecoder();
 for await(const part of response.body){if(signal?.aborted)throw Error('CANCELLED');bytes+=part.length;if(bytes>2*1024**2)throw Error('RESPONSE_LIMIT');pending+=decoder.decode(part,{stream:true});if(pending.length>262144)throw Error('EVENT_LIMIT');
  let split;while((split=pending.indexOf('\n'))>=0){const line=pending.slice(0,split).trim();pending=pending.slice(split+1);if(!line.startsWith('data:'))continue;const body=line.slice(5).trim();if(!body)continue;if(body==='[DONE]'){complete=true;continue;}const d=JSON.parse(body),choice=d.choices?.[0],delta=choice?.delta?.content;
   if(typeof delta==='string'&&delta){if(first===null)first=performance.now()-started;text+=delta;if(text.length>100000)throw Error('RESPONSE_LIMIT');}
   if(d.usage)usage=d.usage;if(choice?.finish_reason)finish=choice.finish_reason;if(d.timings)timings=d.timings;
   const ids=d.__verbose?.stop===true?d.__verbose.tokens:d.stop===true?d.tokens:null;
   if(Array.isArray(ids)&&ids.length&&ids.every(Number.isSafeInteger))tokens=ids;
  }
 }
 if(pending.trim()||!complete||!finish)throw Error('INCOMPLETE_EVENT');
 return {text,complete,ttftMs:first===null?null:Math.round(first),usage,finish,timings,tokenIdsSHA256:tokens?hashText(JSON.stringify(tokens)):null};
}
function priorPeak(tier,context){
 // Public synthetic evidence only; never reinterpret prior working-set samples
 // as private commit or weaken their reserve. Unknown contexts stay conservative.
 const file=path.join(__dirname,'../docs/LOW_RAM_MEASUREMENTS_2026-10-27.json');
 const data=JSON.parse(fs.readFileSync(file,'utf8'));let max=0;
 const visit=v=>{if(!v||typeof v!=='object')return;if(v.tier===tier&&v.contextTokens<=Math.max(2048,context)&&Number.isSafeInteger(v.process?.peakWorkingSetBytes))max=Math.max(max,v.process.peakWorkingSetBytes);for(const child of Object.values(v))if(child&&typeof child==='object')visit(child);};visit(data);return max;
}
async function evaluate(o,{signal,checkpoint=()=>{},captureOutput=()=>{}}={}){
 const manager=new ModelManager({directory:path.join(process.env.LOCALAPPDATA,'PrivateAIModels')}),memory=()=>Math.min(os.freemem(),process.availableMemory?.()||Infinity);
 const report={schema:1,condition:o.condition,productionLimitsChanged:false,runtimeSHA256:await hashFile(o.runtime),fixtureSHA256:hashText(JSON.stringify(fixtures())),harnessSHA256:await hashFile(__filename),judgeSHA256:await hashFile(path.join(__dirname,'../tests/fixtures/local-quality.cjs')),decoding:{temperature:0,seed:42,cache:'f16',streaming:true,productionDefaultsUnchanged:true},totalMemoryBytes:os.totalmem(),initialAvailableBytes:memory(),results:[],limitations:['Synthetic task checks are not a clinical accuracy guarantee.','Working-set/commit caps are diagnostics, not simulated system-available RAM.','Only actual bounded system allocation is condition c; host reserve/watchdog remain active.','Per-process hard faults are unavailable without separate tracing; total faults are not hard faults.','Mapped counts are sampled Windows virtual-region/resident-page queries, not memory contents.','Token IDs are compared only if the native stream exposes them; otherwise identity is UTF-8 output hash.']};
 report.decoding.streaming=!o.tokenIds;report.decoding.actualTokenIdsRequested=o.tokenIds;report.decoding.contextShift=false;
 const deadline=Date.now()+30*60000,rows=manager.catalog(HYBRID_DEFAULTS),selected=fixtures().filter(c=>!o.caseIds.length||o.caseIds.includes(c.id));
 for(const tier of o.tiers)for(const context of o.contexts){
  if(signal?.aborted||Date.now()>=deadline){report.stopped=true;return report;}
  const row=rows.find(r=>r.tier===tier),group={tier,context,condition:o.condition,status:'pending',cases:[],samples:[],availableBeforeBytes:memory()};report.results.push(group);
  if(!row?.installed){group.status='unavailable';checkpoint(report);continue;}
  group.minimumBytes=Math.max(requiredMemory(row.bytes,context),priorPeak(tier,context)+GIB);
  if(memory()<group.minimumBytes){group.status='refused';group.reason='LOW_MEMORY';checkpoint(report);continue;}
  const s={...HYBRID_DEFAULTS,localModelPath:row.file,localContext:context,localMaxOutput:256,processingMode:'local-only',allowCloud:false,keepBrainMinutes:15};
  await manager.verifyTier(tier,s,signal);group.modelSHA256=await hashFile(row.file);
  if(signal?.aborted){group.status='cancelled';checkpoint(report);return report;}
  let probe,brain,watchdog,attach,lastStream,phase='load',polling=false,probeError=false,pressure=false,globalMinimum=memory();
  const controller=new AbortController(),abort=()=>{controller.abort();brain?.stop('cancelled');};signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const record=async mappings=>{if(mappings)while(polling)await new Promise(r=>setTimeout(r,10));if(polling||!probe)return;polling=true;try{const counters=await probe.call('sample',{mappings});globalMinimum=Math.min(globalMinimum,counters.availableBytes);group.samples.push({phase,...counters});if(counters.pressureReleased||counters.availableBytes<GIB){pressure=true;controller.abort();brain?.stop('low-memory');}}catch{probeError=true;controller.abort();brain?.stop('probe-failed');}finally{polling=false;}};
  try{
   probe=await new NativeMemoryProbe().start();
   if(controller.signal.aborted)throw Error('CANCELLED');
   if(o.condition==='system'){group.allocation=await probe.call('allocate',{bytes:o.allocateBytes});group.availableAfterAllocationBytes=memory();if(memory()<group.minimumBytes){group.status='refused';group.reason='LOW_MEMORY_AFTER_ALLOCATION';continue;}}
   const fetcher=async(url,opts)=>{
    if(!String(url).endsWith('/v1/chat/completions'))return fetch(url,opts);
    const body={...JSON.parse(opts.body),temperature:0,seed:42,stream:!o.tokenIds,return_tokens:true,verbose:true,timings_per_token:true,stream_options:{include_usage:true}},started=performance.now();
    const res=await fetch(url,{...opts,body:JSON.stringify(body)});if(!res.ok)return res;
    return {ok:true,json:async()=>{if(o.tokenIds){const data=await res.json();lastStream=tokenResponse(data);return data;}lastStream=await readStream(res,{started,signal:controller.signal});return {choices:[{message:{content:lastStream.text},finish_reason:lastStream.finish}],usage:lastStream.usage};}};
   };
   const spawnProcess=(...args)=>{if(controller.signal.aborted)throw Error('CANCELLED');const flags=args[1],value=k=>Number(flags[flags.indexOf(k)+1]);group.launchSettings={context:value('--ctx-size'),batch:value('--batch-size'),microBatch:value('--ubatch-size'),threads:value('--threads'),gpuLayers:value('--gpu-layers')};const child=probe.spawn(...args,{condition:o.condition,capBytes:o.capBytes,lowPriority:o.lowPriority});attach=child.ready.then(({contained,constraintTiming,cap,lowPriorityApplied})=>{group.launch={contained,constraintTiming,lowPriorityApplied};group.cap=cap;}).catch(()=>{probeError=true;controller.abort();brain?.stop('probe-failed');});return child;};
   brain=new LocalBrain({runtime:o.runtime,settings:()=>s,memory,fetcher,spawnProcess});
   watchdog=setInterval(()=>{globalMinimum=Math.min(globalMinimum,memory());if(memory()<GIB){pressure=true;controller.abort();brain.stop('low-memory');}else record(false).catch(()=>{});},1000);
   const loaded=performance.now();await brain.load(s);await attach;group.loadMs=Math.round(performance.now()-loaded);await record(true);
   if(group.cap&&!group.cap.applied)throw Error('CAP_NOT_APPLIED');
   for(let repetition=1;repetition<=o.repetitions;repetition++)for(const c of selected){
    if(controller.signal.aborted||Date.now()>=deadline)throw Error('CANCELLED');
    if(c.kind==='tool'){const value=calculate(c.expression);group.cases.push({id:c.id,repetition,kind:'tool',...judge(c,value),nativeInference:false});continue;}
    const messages=[{role:'user',content:prompt(c)}],instructions='Use only the synthetic source. Unknown data stays unknown. Return the requested JSON only.';
    try{localInput(s,messages,{instructions});}catch(e){group.cases.push({id:c.id,repetition,status:'not-fit',passed:false,reason:e.code});continue;}
    phase='generation';lastStream=null;const timer=setTimeout(()=>{controller.abort();brain.stop('case-timeout');},120000),started=performance.now();let result;
    try{result=await brain.generate(s,messages,{instructions,signal:controller.signal});}finally{clearTimeout(timer);}
    const durationMs=Math.round(performance.now()-started),check=judge(c,result.text);
    captureOutput({tier,context,id:c.id,repetition,text:result.text});
    group.cases.push({id:c.id,repetition,nativeInference:true,...check,incomplete:!!result.incomplete,responseComplete:lastStream?.complete??false,streamComplete:o.tokenIds?null:lastStream?.complete??false,finishReason:lastStream?.finish??null,outputSHA256:hashText(result.text),tokenIdsSHA256:lastStream?.tokenIdsSHA256||null,tokenIdsCount:lastStream?.tokenIdsCount??null,ttftMs:lastStream?.ttftMs??null,durationMs,outputTokens:lastStream?.usage?.completion_tokens??null,tokensPerSecond:lastStream?.timings?.predicted_per_second??null,endToEndTokensPerSecond:Number.isFinite(lastStream?.usage?.completion_tokens)?+(lastStream.usage.completion_tokens*1000/durationMs).toFixed(3):null});
    await record(false);checkpoint(report);
   }
   phase='after';await record(true);group.status=group.cases.every(c=>c.passed&&!c.incomplete)?'passed':'quality-review-required';
  }catch(error){group.status=pressure?'pressure-stopped':probeError?'probe-unavailable':signal?.aborted?'cancelled':'failed';group.reason=['LOW_MEMORY','LOCAL_CONTEXT','CAP_NOT_APPLIED'].includes(error.code||error.message)?error.code||error.message:'EVALUATION_STOPPED';}
  finally{clearInterval(watchdog);signal?.removeEventListener('abort',abort);try{brain?.close();await brain?.waitStopped();}catch{group.cleanupError=true;}finally{await probe?.close();}group.minimumAvailableBytes=Math.min(globalMinimum,memory());checkpoint(report);}
 }
 return report;
}
async function main(){
 const o=options(process.argv.slice(2));if(process.platform!=='win32'||[o.out,o.out+'.partial',o.out+'.synthetic-output.json'].some(f=>fs.existsSync(f))||[path.join(process.env.LOCALAPPDATA,'PrivateAI2'),path.join(process.env.LOCALAPPDATA,'PrivateAIModels'),path.join(process.env.LOCALAPPDATA,'Programs','PrivateAI')].some(root=>{const rel=path.relative(root,o.out);return !rel.startsWith('..')&&!path.isAbsolute(rel);}))throw Error('New Windows evidence destination required');
 const controller=new AbortController(),cancel=()=>controller.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
 const timer=setInterval(()=>{if(fs.existsSync(o.out+'.cancel'))controller.abort();},500);
 const outputs=[];
 const checkpoint=r=>{fs.mkdirSync(path.dirname(o.out),{recursive:true});fs.writeFileSync(o.out+'.partial',JSON.stringify(r,null,2));};
 const captureOutput=r=>{outputs.push(r);const text=JSON.stringify(outputs,null,2);if(Buffer.byteLength(text)>4*1024**2)throw Error('Synthetic output limit');fs.writeFileSync(o.out+'.synthetic-output.json',text);};
 try{const report=await evaluate(o,{signal:controller.signal,checkpoint,captureOutput});report.completedAt=new Date().toISOString();fs.writeFileSync(o.out,JSON.stringify(report,null,2),{flag:'wx'});console.log(JSON.stringify(report.results.map(({tier,context,status,cases,minimumAvailableBytes})=>({tier,context,status,cases:cases.length,passed:cases.filter(c=>c.passed&&!c.incomplete).length,minimumAvailableBytes}))));}
 finally{clearInterval(timer);process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
}
if(require.main===module)main().catch(()=>{console.error('Synthetic local evaluation stopped; no raw errors, paths or prompts logged.');process.exitCode=1;});
module.exports={options,readStream,tokenResponse,evaluate,priorPeak};
