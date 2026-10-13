const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const modulePath = path.join(__dirname, '../build/release-evidence-gate.cjs');

const {fixture}=require('./helpers.cjs'),{verify}=require(modulePath);
if(process.platform==='win32')test('Windows installer validator retains real redirected-process exit codes and rejects failure',t=>{
 const {dir}=fixture(t),quote=value=>"'"+value.replaceAll("'","''")+"'";
 const powershell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
 const command=`$ErrorActionPreference='Stop'
$errors=$null;$tokens=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile(${quote(path.join(__dirname,'../build/Test-CleanWindowsInstall.ps1'))},[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Validator parse failed'}
$body=$ast.Find({param($n) $n -is [System.Management.Automation.Language.TryStatementAst] -and $n.Finally},$true).Body.Statements
$capture=$body | Where-Object {$_.Extent.Text.StartsWith('$applicationHandle=')}
$wait=$body | Where-Object {$_.Extent.Text.StartsWith('if (-not $appProcess.WaitForExit(')}
$guard=$body | Where-Object {$_.Extent.Text.StartsWith('if ($appProcess.ExitCode -ne 0)')}
if(-not $capture -or -not $wait -or -not $guard){throw 'Shipped process acceptance checks not found'}
foreach($code in @(0,7)){
 $appProcess=Start-Process -FilePath ${quote(powershell)} -ArgumentList ('-NoProfile -NonInteractive -Command "Start-Sleep -Milliseconds 300; exit '+$code+'"') -WindowStyle Hidden -PassThru -RedirectStandardOutput ${quote(path.join(dir,'out.log'))} -RedirectStandardError ${quote(path.join(dir,'err.log'))}
 . ([ScriptBlock]::Create($capture.Extent.Text))
 . ([ScriptBlock]::Create($wait.Extent.Text))
 if($appProcess.ExitCode -ne $code){throw 'Actual process exit code was lost'}
 $rejected=$false
 try{. ([ScriptBlock]::Create($guard.Extent.Text))}catch{$rejected=$true}
 if($rejected -ne ($code -ne 0)){throw 'Exit-code gate did not enforce success'}
}
[Console]::Write('verified')`;
 const stdout=require('node:child_process').execFileSync(powershell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:15000});
 assert.equal(stdout.trim(),'verified');
});
function gateFixture(t){
 const {dir}=fixture(t),stage=path.join(dir,'synthetic-stage');fs.mkdirSync(path.join(stage,'resources/local-runtime'),{recursive:true});
 const write=(file,data)=>{fs.writeFileSync(file,data);return crypto.createHash('sha256').update(data).digest('hex');};
 const executableSHA256=write(path.join(stage,'PrivateAI.exe'),'SYNTHETIC EXE'),applicationArchiveSHA256=write(path.join(stage,'resources/app.asar'),'SYNTHETIC ARCHIVE'),runtimeSHA256=write(path.join(stage,'resources/local-runtime/llama-server.exe'),'SYNTHETIC RUNTIME');
 const config={stage};for(const key of ['installer','applicationEvidence','installerEvidence','inferenceEvidence','testResults'])config[key]=path.join(dir,key);
 const installerSHA256=write(config.installer,'SYNTHETIC INSTALLER');write(config.testResults,'# pass 1\n# fail 0\n# cancelled 0\n');
 const app={version:require('../package.json').version,platform:'win32',passed:true,windowsApplicationExecuted:true,executableSHA256,applicationArchiveSHA256};
 write(config.applicationEvidence,JSON.stringify(app));const install={...app,windowsInstallerExecuted:false,installerSHA256,installerExitCode:0};write(config.installerEvidence,JSON.stringify(install));
 write(config.inferenceEvidence,JSON.stringify({version:app.version,platform:'win32',passed:true,actualModelInferenceExecuted:true,runtimeSHA256,results:[{response:'12'},{response:'124'}]}));
 return {dir,config,app,install,write};
}
test('release gate rejects unexecuted installers and changed artifacts',t=>{
 const {config,app,install,write}=gateFixture(t);
 assert.throws(()=>verify(config),/Actual Windows installer execution/);
 install.windowsInstallerExecuted=true;write(config.installerEvidence,JSON.stringify(install));assert.equal(verify(config).version,app.version);
 write(config.installer,'CHANGED');assert.throws(()=>verify(config),/Installer changed/);
});

if(process.platform==='win32')test('Windows PowerShell 5.1 installer evidence finalization produces gate-compatible UTF-8',t=>{
 const {dir,config,app,install}=gateFixture(t);
 const evidencePath=path.join(dir,'SYNTHETIC evidence output');fs.mkdirSync(evidencePath);
 config.installerEvidence=path.join(evidencePath,'installer-evidence.json');
 install.windowsInstallerExecuted=true;install.note='SYNTHETIC only: Unicode \u03a9 \u2014 no installer executed';
 const quote=value=>"'"+value.replaceAll("'","''")+"'";
 // Parse the shipped script, then execute ONLY its finally block with synthetic
 // fixtures. The installer, registry checks and application are never executed.
 const command=`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$parseErrors=$null;$tokens=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile(${quote(path.join(__dirname,'../build/Test-CleanWindowsInstall.ps1'))},[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'Installer validator did not parse'}
$tryAst=$ast.Find({param($node) $node -is [System.Management.Automation.Language.TryStatementAst] -and $node.Finally -and $node.Finally.Extent.Text.Contains('installer-evidence.json')},$true)
if(-not $tryAst){throw 'Installer evidence finalization not found'}
$decoded=ConvertFrom-Json ${quote(JSON.stringify(install))}
$result=[ordered]@{}
foreach($property in $decoded.PSObject.Properties){$result[$property.Name]=$property.Value}
$evidencePath=${quote(evidencePath)}
$blockText=$tryAst.Finally.Extent.Text
. ([ScriptBlock]::Create($blockText.Substring(1,$blockText.Length-2)))
[Console]::Write($PSVersionTable.PSVersion.Major)`;
 const powershell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
 const stdout=require('node:child_process').execFileSync(powershell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,timeout:15000});
 assert.equal(stdout.trim(),'5','Interoperability must be exercised in Windows PowerShell 5.1');
 const bytes=fs.readFileSync(config.installerEvidence);
 assert.notDeepEqual(bytes.subarray(0,3),Buffer.from([0xef,0xbb,0xbf]),'Evidence must not contain a UTF-8 BOM');
 const saved=JSON.parse(bytes.toString('utf8'));assert.equal(saved.note,install.note);assert.ok(saved.completed);
 assert.equal(verify(config).version,app.version,'Actual finalization output must pass the existing artifact/evidence gate');
});
