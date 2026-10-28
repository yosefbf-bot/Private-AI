'use strict';
// Developer-only persistent probe. No new runtime RPC, polling service or package.
const path=require('node:path'),{spawn}=require('node:child_process'),{EventEmitter}=require('node:events');
class NativeMemoryProbe{
 constructor(){this.pending=new Map();this.sequence=0;this.buffer='';this.closed=false;}
 async start(){
  if(process.platform!=='win32')throw Error('Windows only');
  const source=path.join(__dirname,'../tests/tools/MemoryProbe.cs').replace(/'/g,"''");
  const code=`$ErrorActionPreference='Stop'; Add-Type -Path '${source}'; $probe=New-Object MemoryProbe; try {while($null -ne ($line=[Console]::ReadLine())){try{$r=$line|ConvertFrom-Json;$answer=$null;switch($r.op){'sample'{$answer=$probe.Sample([bool]$r.mappings)} 'launch'{$answer=$probe.Launch([string]$r.file,[string[]]$r.args,[string]$r.token,[string]$r.condition,[long]$r.bytes,[bool]$r.priority)} 'alive'{$answer=$probe.Alive()} 'terminate'{$probe.Stop();$answer=$probe.Alive()} 'allocate'{$answer=$probe.Allocate([long]$r.bytes)} 'release'{$probe.Release();$answer=@{released=$true}} 'exit'{$answer=@{closed=$true}} default{throw 'operation'}};[Console]::WriteLine((@{id=$r.id;ok=$true;result=$answer}|ConvertTo-Json -Depth 5 -Compress));if($r.op -eq 'exit'){break}}catch{[Console]::WriteLine((@{id=$r.id;ok=$false;code='PROBE_FAILED'}|ConvertTo-Json -Compress))}}}finally{$probe.Dispose()}`;
  this.child=spawn(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',code],{windowsHide:true,stdio:['pipe','pipe','ignore']});
  this.child.stdout.on('data',part=>{this.buffer+=part.toString();if(this.buffer.length>262144){this.child.kill();return;}let at;while((at=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,at);this.buffer=this.buffer.slice(at+1);try{const r=JSON.parse(line),p=this.pending.get(r.id);if(p){this.pending.delete(r.id);clearTimeout(p.timer);r.ok?p.resolve(r.result):p.reject(Error('PROBE_FAILED'));}}catch{this.child.kill();}}});
  this.child.on('error',()=>this.fail());this.child.on('exit',()=>this.fail());this.child.stdin.on('error',()=>this.fail());
  try{await this.call('sample');return this;}catch(error){await this.close();throw error;}
 }
 // The native worker creates this one owned child suspended, contains it in a
 // kill-on-close job, then applies diagnostic controls before the first thread runs.
 spawn(file,args,opts,{condition='normal',capBytes=0,lowPriority=false}={}){
  const child=new EventEmitter();Object.assign(child,{pid:undefined,exitCode:null,signalCode:null});let timer,ended=false;
  const exited=(code,signal=null)=>{if(ended)return;ended=true;clearInterval(timer);child.exitCode=code;child.signalCode=signal;child.emit('exit',code,signal);};
  const failed=()=>{if(!ended)child.emit('error',Error('PROBE_CHILD_FAILED'));exited(1);};
  child.ready=this.call('launch',{file,args,token:opts.env.LLAMA_ARG_API_KEY,condition,bytes:capBytes,priority:lowPriority}).then(result=>{
   child.pid=result.pid;timer=setInterval(()=>{this.call('alive').then(r=>{if(!r.alive)exited(r.exitCode);},failed);},500);timer.unref();return result;
  });
  child.ready.catch(failed);
  child.kill=()=>{child.ready.then(()=>this.call('terminate')).then(r=>{if(!r.alive)exited(r.exitCode,'SIGTERM');},failed);return true;};
  return child;
 }
 fail(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('PROBE_UNAVAILABLE'));}this.pending.clear();}
 call(op,data={}){if(this.closed||!this.child?.stdin.writable||this.child.exitCode!==null||this.child.signalCode!==null)return Promise.reject(Error('PROBE_CLOSED'));return new Promise((resolve,reject)=>{const id=++this.sequence,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('PROBE_TIMEOUT'));this.child.kill();},12000);this.pending.set(id,{resolve,reject,timer});try{this.child.stdin.write(JSON.stringify({id,op,...data})+'\n');}catch{this.pending.delete(id);clearTimeout(timer);reject(Error('PROBE_UNAVAILABLE'));}});}
 async close(){if(this.closed)return;try{await this.call('exit');}catch{}finally{this.closed=true;this.child?.stdin.end();if(this.child?.exitCode===null&&this.child.signalCode===null)await new Promise(resolve=>{const timer=setTimeout(()=>{this.child.kill();resolve();},3000);this.child.once('exit',()=>{clearTimeout(timer);resolve();});});this.fail();}}
}
module.exports={NativeMemoryProbe};
