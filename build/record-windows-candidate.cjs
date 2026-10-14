'use strict';
// Frozen build artifacts only. Never enumerates the owner's app data or models.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const stage=path.join(root,'dist/win-unpacked'),installer=path.join(root,'dist',`PrivateAI-Setup-${version}-x64.exe`);
async function hash(file) {const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex');}
async function record() {
  if(process.platform!=='win32')throw Error('A real Windows build is required.');
  require('./pe-integrity.cjs').validateTree(stage);
  const codeCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();
  if(!/^[a-f0-9]{40}$/.test(codeCommit))throw Error('Source identity unavailable.');
  const changes=execFileSync('git',['status','--porcelain=v1','-z','--untracked-files=no'],{cwd:root,encoding:'utf8',windowsHide:true});
  if(changes)throw Error('Tracked build inputs changed after checkout; commit identity cannot qualify this candidate.');
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
  const baseline={version,codeCommit,records};
  fs.writeFileSync(path.join(directory,'packaging-baseline.json'),JSON.stringify(baseline,null,2)+'\n');
  require('./check-release-staging.cjs')(root);
  const candidate={version,codeCommit,installer:path.relative(root,installer).replaceAll(path.sep,'/'),installerSHA256:await hash(installer),executableSHA256:await hash(path.join(stage,'PrivateAI.exe')),applicationArchiveSHA256:await hash(path.join(stage,'resources/app.asar')),runtimeSHA256:await hash(path.join(stage,'resources/local-runtime/llama-server.exe')),stageFiles:records.length};
  fs.writeFileSync(path.join(directory,'candidate.json'),JSON.stringify(candidate,null,2)+'\n');
  console.log(JSON.stringify(candidate));return candidate;
}
if(require.main===module)record().catch(()=>{console.error('Windows candidate freezing failed; no accepted result recorded.');process.exitCode=1;});
module.exports={record,hash};
