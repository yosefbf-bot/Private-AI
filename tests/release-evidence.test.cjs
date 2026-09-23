const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const modulePath = path.join(__dirname, '../build/release-evidence-gate.cjs');

const {fixture}=require('./helpers.cjs'),{verify}=require(modulePath);
test('release gate rejects unexecuted installers and changed artifacts',t=>{
 const {dir}=fixture(t),stage=path.join(dir,'synthetic-stage');fs.mkdirSync(path.join(stage,'resources/local-runtime'),{recursive:true});
 const write=(file,data)=>{fs.writeFileSync(file,data);return crypto.createHash('sha256').update(data).digest('hex');};
 const executableSHA256=write(path.join(stage,'PrivateAI.exe'),'SYNTHETIC EXE'),applicationArchiveSHA256=write(path.join(stage,'resources/app.asar'),'SYNTHETIC ARCHIVE'),runtimeSHA256=write(path.join(stage,'resources/local-runtime/llama-server.exe'),'SYNTHETIC RUNTIME');
 const config={stage};for(const key of ['installer','applicationEvidence','installerEvidence','inferenceEvidence','testResults'])config[key]=path.join(dir,key);
 const installerSHA256=write(config.installer,'SYNTHETIC INSTALLER');write(config.testResults,'# pass 1\n# fail 0\n# cancelled 0\n');
 const app={version:require('../package.json').version,platform:'win32',passed:true,windowsApplicationExecuted:true,executableSHA256,applicationArchiveSHA256};
 write(config.applicationEvidence,JSON.stringify(app));const install={...app,windowsInstallerExecuted:false,installerSHA256,installerExitCode:0};write(config.installerEvidence,JSON.stringify(install));
 write(config.inferenceEvidence,JSON.stringify({version:app.version,platform:'win32',passed:true,actualModelInferenceExecuted:true,runtimeSHA256,results:[{response:'12'},{response:'124'}]}));
 assert.throws(()=>verify(config),/Actual Windows installer execution/);
 install.windowsInstallerExecuted=true;write(config.installerEvidence,JSON.stringify(install));assert.equal(verify(config).version,app.version);
 write(config.installer,'CHANGED');assert.throws(()=>verify(config),/Installer changed/);
});

