'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function hash(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function verify(c){
 const version=require('../package.json').version;
 const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
 const app=read(c.applicationEvidence),install=read(c.installerEvidence),inference=read(c.inferenceEvidence);
 for(const e of [app,install,inference])if(e.version!==version||e.platform!=='win32'||e.passed!==true)throw Error('Evidence version/platform/result mismatch');
 if(!app.windowsApplicationExecuted)throw Error('Actual Windows application execution required');
 if(!install.windowsInstallerExecuted||install.installerExitCode!==0)throw Error('Actual Windows installer execution required');
 if(!inference.actualModelInferenceExecuted||!Array.isArray(inference.results)||!inference.results.length||inference.results.some(r=>!r.response))throw Error('Actual local inference required');
 if(hash(c.installer)!==install.installerSHA256)throw Error('Installer changed after validation');
 for(const e of [app,install]){
  if(hash(path.join(c.stage,'PrivateAI.exe'))!==e.executableSHA256||hash(path.join(c.stage,'resources/app.asar'))!==e.applicationArchiveSHA256)throw Error('Application changed after validation');
 }
 if(hash(path.join(c.stage,'resources/local-runtime/llama-server.exe'))!==inference.runtimeSHA256)throw Error('Runtime changed after validation');
 const results=fs.readFileSync(c.testResults,'utf8');
 if(!/# pass [1-9]\d*/.test(results)||!/# fail 0(?:\s|$)/.test(results)||!/# cancelled 0(?:\s|$)/.test(results)||/# (?:fail|cancelled|skipped) [1-9]/.test(results))throw Error('Passing test evidence required');
 return {version,installerSHA256:install.installerSHA256};
}
module.exports={verify};
