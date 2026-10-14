'use strict';
// Developer/CI check only. Never packages the scanner or reads application data.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const execute=promisify(execFile),assets=require('./gitleaks-assets.json');
const repo=path.resolve(__dirname,'..');
async function sha(file){const h=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(file))h.update(chunk);return h.digest('hex');}
function safeRelative(name){if(!name||path.isAbsolute(name)||path.win32.isAbsolute(name)||name.split(/[\\/]/).includes('..')||name.includes('\0'))throw Error('Unsafe source path');return name;}
async function download(url,destination,expected){
 const signal=AbortSignal.timeout(180000);
 for(let n=0;n<6;n++){
  const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(u.hostname))throw Error('Unexpected scanner download location');
  const response=await fetch(u,{redirect:'manual',signal});
  if([301,302,303,307,308].includes(response.status)){const next=response.headers.get('location');await response.body?.cancel();if(!next)break;url=new URL(next,u).href;continue;}
  if(!response.ok||!response.body)break;
  const file=await fs.promises.open(destination,'wx',0o600);let size=0;
  try{for await(const chunk of response.body){size+=chunk.length;if(size>32*1024**2)throw Error('Scanner archive exceeded limit');let at=0;while(at<chunk.length){const result=await file.write(chunk,at,chunk.length-at);if(!result.bytesWritten)throw Error('Scanner archive write failed');at+=result.bytesWritten;}}}finally{await file.close();}
  if(await sha(destination)!==expected)throw Error('Scanner archive verification failed');return;
 }
 throw Error('Scanner download failed');
}
async function binary(directory){
 const spec=assets[process.platform+'-'+process.arch];if(!spec)throw Error('Scanner supports Windows/Linux x64');
 if(process.env.PRIVATE_AI_GITLEAKS_BINARY){const file=path.resolve(process.env.PRIVATE_AI_GITLEAKS_BINARY);if(fs.lstatSync(file).isSymbolicLink()||await sha(file)!==spec.binarySHA256)throw Error('Scanner executable verification failed');return file;}
 const archive=path.join(directory,process.platform==='win32'?'scanner.zip':'scanner.tar.gz');await download(spec.url,archive,spec.sha256);
 const destination=path.join(directory,'tool');fs.mkdirSync(destination);
 if(process.platform==='win32'){
  const quote=value=>"'"+value.replace(/'/g,"''")+"'";
  await execute(path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',`[void][Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem'); [IO.Compression.ZipFile]::ExtractToDirectory(${quote(archive)},${quote(destination)})`],{windowsHide:true,timeout:120000});
 }else await execute('tar',['-xzf',archive,'-C',destination],{timeout:120000});
 const file=path.join(destination,process.platform==='win32'?'gitleaks.exe':'gitleaks');if(fs.lstatSync(file).isSymbolicLink()||await sha(file)!==spec.binarySHA256)throw Error('Scanner executable verification failed');return file;
}
function locations(rows){return rows.map(row=>({rule:String(row.RuleID||''),file:String(row.File||'').replaceAll('\\','/'),line:Number(row.StartLine)||0,commit:/^[0-9a-f]{40}$/.test(row.Commit||'')?row.Commit:null}));}
async function scan(tool,mode,target,directory,extra=[]){
 const report=path.join(directory,mode+'.json');let code=0;
 try{await execute(tool,[mode,target,'--no-banner','--redact=100','--report-format=json','--report-path='+report,...extra],{cwd:repo,windowsHide:true,timeout:300000,maxBuffer:16*1024**2});}
 catch(error){if(error.code!==1)throw Error('Secret scanner failed');code=1;}
 if(!fs.existsSync(report))throw Error('Scanner report missing');
 const rows=JSON.parse(fs.readFileSync(report,'utf8'));if(!Array.isArray(rows)||Boolean(rows.length)!==Boolean(code))throw Error('Scanner report inconsistent');return locations(rows);
}
async function main(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'privateai-secret-scan-'));
 try{
  const tool=await binary(directory),git=process.env.PRIVATE_AI_GIT_BINARY||'git';
  const version=await execute(tool,['version'],{windowsHide:true});if(version.stdout.trim()!==assets.version)throw Error('Scanner version verification failed');
  const files=await execute(git,['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:repo,windowsHide:true,maxBuffer:16*1024**2});
  const snapshot=path.join(directory,'source');fs.mkdirSync(snapshot);
  for(const name of new Set(files.stdout.split('\0').filter(Boolean))){
   safeRelative(name);const source=path.join(repo,name);if(!fs.existsSync(source))continue;
   const stat=fs.lstatSync(source);if(stat.isSymbolicLink())throw Error('Source symlink cannot be scanned safely');if(!stat.isFile())continue;
   const destination=path.join(snapshot,name);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(source,destination);
  }
  const current=await scan(tool,'dir',snapshot,directory),history=await scan(tool,'git',repo,directory,['--log-opts=--all']);
  const found=current.length+history.length;
  console.log(JSON.stringify({scanner:'Gitleaks '+assets.version,currentFindings:current.length,historyFindings:history.length,passed:!found,locations:[...current.map(row=>({...row,file:path.relative(snapshot,row.file).replaceAll('\\','/')})),...history]}));
  if(found)process.exitCode=1;
 }finally{
  // mkdtemp's exact child is the only removal target; no caller-supplied path.
  if(path.dirname(directory)!==path.resolve(os.tmpdir())||!path.basename(directory).startsWith('privateai-secret-scan-'))throw Error('Unsafe scanner cleanup path');
  fs.rmSync(directory,{recursive:true,force:true});
 }
}
if(require.main===module)main().catch(()=>{console.error('Secret scanning could not complete; no sensitive scanner output was printed.');process.exitCode=1;});
module.exports={locations,safeRelative,scan,main};
