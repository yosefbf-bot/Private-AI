'use strict';
// Frozen build artifacts only. Never enumerates the owner's app data or models.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const stage=path.join(root,'dist/win-unpacked'),installer=path.join(root,'dist',`PrivateAI-Setup-${version}-x64.exe`);
let phase='platform';
function rejected(code,details={}){return Object.assign(Error(code),{code,...details});}
async function hash(file) {const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex');}
async function record() {
  if(process.platform!=='win32')throw Error('A real Windows build is required.');
  phase='pe-integrity';
  require('./pe-integrity.cjs').validateTree(stage);
  phase='source-identity';
  const codeCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
  if(!/^[a-f0-9]{40}$/.test(codeCommit))throw rejected('SOURCE_IDENTITY_UNAVAILABLE');
  phase='source-cleanliness';
  const changes=execFileSync('git',['status','--porcelain=v1','-z','--untracked-files=no'],{cwd:root,encoding:'utf8',windowsHide:true});
  if(changes){
    const paths=execFileSync('git',['diff','--name-only','-z','HEAD','--'],{cwd:root,encoding:'utf8',windowsHide:true}).split('\0').filter(Boolean);
    throw rejected('DIRTY_TRACKED_INPUTS',{trackedPaths:paths.filter(p=>/^[\w .@/+()-]{1,200}$/.test(p))});
  }
  phase='staging-hashes';
  const records=[];
  async function walk(dir) {
    for(const item of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const file=path.join(dir,item.name);
      if(item.isSymbolicLink())throw Error('Candidate staging must not contain links.');
      if(item.isDirectory())await walk(file);
      else if(item.isFile())records.push({path:path.relative(stage,file).replaceAll(path.sep,'/'),bytes:fs.statSync(file).size,sha256:await hash(file)});
    }
  }
  await walk(stage);
  const directory=path.join(root,'Validation',version);fs.mkdirSync(directory,{recursive:true});
  phase='baseline-write';
  const baseline={version,codeCommit,records};
  fs.writeFileSync(path.join(directory,'packaging-baseline.json'),JSON.stringify(baseline,null,2)+'\n');
  phase='staging-verification';require('./check-release-staging.cjs')(root);
  phase='candidate-hashes';
  const candidate={version,codeCommit,installer:path.relative(root,installer).replaceAll(path.sep,'/'),installerSHA256:await hash(installer),executableSHA256:await hash(path.join(stage,'PrivateAI.exe')),applicationArchiveSHA256:await hash(path.join(stage,'resources/app.asar')),runtimeSHA256:await hash(path.join(stage,'resources/local-runtime/llama-server.exe')),stageFiles:records.length};
  fs.writeFileSync(path.join(directory,'candidate.json'),JSON.stringify(candidate,null,2)+'\n');
  console.log(JSON.stringify(candidate));return candidate;
}
if(require.main===module)record().catch(error=>{
  // Build-only diagnostics: no raw exception, absolute path, user data or secrets.
  const receipt={passed:false,phase,code:/^[A-Z_0-9]+$/.test(String(error.code||''))?error.code:'CANDIDATE_FREEZE_FAILED',...(error.trackedPaths?{trackedPaths:error.trackedPaths}:{} )};
  try{const dir=path.join(root,'Validation',version);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'candidate-freeze-failure.json'),JSON.stringify(receipt,null,2)+'\n');}catch{}
  console.error(JSON.stringify(receipt));process.exitCode=1;
});
module.exports={record,hash};
