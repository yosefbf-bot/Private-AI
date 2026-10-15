'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const wrapper=path.resolve(__dirname,'../build/Test-WindowsCandidate.ps1');
const powershell=path.join(process.env.SystemRoot||'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
function temporary(t){const base=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(base,'Private AI wrapper guard '));t.after(()=>{const target=fs.realpathSync(root);assert.equal(path.dirname(target),base);assert.ok(path.basename(target).startsWith('Private AI wrapper guard '));fs.rmSync(target,{recursive:true,force:true});});return root;}
function invoke(root,environment){
  const evidence=path.join(root,'no evidence must be created'),installation=path.join(root,'no installation must be created');
  const result=spawnSync(powershell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',wrapper,
    '-Installer',wrapper,'-ExpectedVersion',require('../package.json').version,
    '-ExpectedInstallerSHA256','0'.repeat(64),'-ExpectedExecutableSHA256','0'.repeat(64),'-ExpectedArchiveSHA256','0'.repeat(64),
    '-CandidateStage',path.dirname(wrapper),'-EvidenceDirectory',evidence,'-InstallationDirectory',installation,
    '-ModelPath',wrapper,'-TestResults',wrapper],{encoding:'utf8',timeout:15000,windowsHide:true,env:{...process.env,...environment}});
  assert.equal(result.error,undefined);assert.notEqual(result.status,0);
  assert.equal(fs.existsSync(evidence),false);assert.equal(fs.existsSync(installation),false);
  return result.stdout+result.stderr;
}
function candidateUninstallerName(){
  const pkg=require('../package.json'),{AppInfo}=require('app-builder-lib/out/appInfo.js');
  return 'Uninstall '+new AppInfo({metadata:pkg,config:pkg.build},undefined,pkg.build.win).productFilename+'.exe';
}
test('candidate uninstaller name follows the actual pinned NSIS product filename',()=>{
  assert.equal(candidateUninstallerName(),'Uninstall PrivateAI.exe');
});
// Only the actual Windows suite collects these OS-specific cases.
if(process.platform==='win32'){
test('Windows acceptance wrapper parses with actual Windows PowerShell without execution',()=>{
  const escaped=wrapper.replaceAll("'","''");
  const result=spawnSync(powershell,['-NoProfile','-NonInteractive','-Command',"$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile('"+escaped+"',[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){exit 1}"],{encoding:'utf8',timeout:15000,windowsHide:true});
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);
});
test('actual Windows wrapper refuses non-hosted use before creating evidence or installing',t=>{
  assert.match(invoke(temporary(t),{GITHUB_ACTIONS:'false',RUNNER_ENVIRONMENT:'self-hosted'}),/fresh GitHub-hosted Windows runner is required/);
});
test('actual Windows wrapper rejects owner data or an output outside RUNNER_TEMP before installer execution',t=>{
  const root=temporary(t),allowed=path.join(root,'allowed temp');fs.mkdirSync(allowed);
  assert.match(invoke(root,{GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_TEMP:allowed}),/Existing Private AI data|existing Private AI installation|fresh acceptance path strictly inside RUNNER_TEMP/);
});
test('actual Windows candidate resolver accepts only the builder-named single direct nonlinked uninstaller',t=>{
  const root=temporary(t),name=candidateUninstallerName();
  const good=path.join(root,'good'),missing=path.join(root,'missing'),ambiguous=path.join(root,'ambiguous');
  for(const folder of [good,missing,ambiguous])fs.mkdirSync(folder);
  fs.writeFileSync(path.join(good,name),'Synthetic inert fixture; never executed');
  fs.writeFileSync(path.join(ambiguous,name),'Synthetic inert fixture; never executed');fs.writeFileSync(path.join(ambiguous,'Uninstall other.exe'),'Synthetic inert fixture');
  const linked=path.join(root,'linked');fs.symlinkSync(good,linked,'junction');
  const script=`$ErrorActionPreference='Stop';$tokens=$null;$errors=$null;$tree=[System.Management.Automation.Language.Parser]::ParseFile($env:PRIVATE_AI_WRAPPER_FILE,[ref]$tokens,[ref]$errors);if($errors.Count){throw 'Parse failed'};foreach($name in @('Test-Under','Assert-NoLinks','Resolve-CandidateUninstaller')){$function=$tree.Find({param($node)$node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true);if(!$function){throw 'Function missing'};. ([scriptblock]::Create($function.Extent.Text))};$root=$env:PRIVATE_AI_WRAPPER_TEST_ROOT;$candidate=$env:PRIVATE_AI_WRAPPER_UNINSTALLER;$good=Join-Path $root 'good';if((Resolve-CandidateUninstaller $good $candidate) -ne [IO.Path]::GetFullPath((Join-Path $good $candidate))){throw 'Wrong accepted path'};foreach($case in @(@((Join-Path $root 'missing'),$candidate),@((Join-Path $root 'ambiguous'),$candidate),@((Join-Path $root 'linked'),$candidate),@($good,'../Uninstall escaped.exe'),@($good,'Uninstall Private AI.exe'))){$rejected=$false;try{Resolve-CandidateUninstaller $case[0] $case[1]|Out-Null}catch{$rejected=$true};if(!$rejected){throw 'Unsafe candidate accepted'}};[Console]::Write('PASS')`;
  const result=spawnSync(powershell,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{encoding:'utf8',timeout:15000,windowsHide:true,env:{...process.env,PRIVATE_AI_WRAPPER_FILE:wrapper,PRIVATE_AI_WRAPPER_TEST_ROOT:root,PRIVATE_AI_WRAPPER_UNINSTALLER:name}});
  fs.unlinkSync(linked);
  assert.equal(result.error,undefined);assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'PASS');
});
}
