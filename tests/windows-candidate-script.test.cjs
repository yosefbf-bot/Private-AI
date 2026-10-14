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
}
