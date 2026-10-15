'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {protectPrivateFolder,verifyPrivateAcl}=require('../source/windows-acl.cjs');
const system=path.join(process.env.SystemRoot||'C:\\Windows','System32');
function temporary(t){
  const base=fs.realpathSync(os.tmpdir()),root=fs.mkdtempSync(path.join(base,'Private AI native ACL '));
  t.after(()=>{const target=fs.realpathSync(root);assert.equal(path.dirname(target),base);assert.ok(path.basename(target).startsWith('Private AI native ACL '));assert.equal(fs.lstatSync(target).isSymbolicLink(),false);fs.rmSync(target,{recursive:true,force:true});});
  return root;
}
function ownerSid(){
  const sid=execFileSync(path.join(system,'whoami.exe'),['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true}).match(/S-1-5-(?:\d+-)*\d+/)?.[0];
  assert.ok(sid,'The actual Windows owner SID must be available');return sid;
}
function icacls(root,args){execFileSync(path.join(system,'icacls.exe'),[root,...args],{windowsHide:true,stdio:'ignore'});}
function powershell(root,script){
  return execFileSync(path.join(system,'WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from("$ErrorActionPreference='Stop';"+script,'utf16le').toString('base64')],{windowsHide:true,encoding:'utf8',timeout:20000,stdio:['ignore','pipe','ignore'],env:{...process.env,PRIVATE_AI_SYNTHETIC_ACL_TEST:root}});
}
// Direct .NET inspection is independent of the production verifier and does not
// require Get-Acl/PowerShell module autoload or account-name/SID translation.
function inspect(root){return JSON.parse(powershell(root,`
$sections=[System.Security.AccessControl.AccessControlSections]::Access -bor [System.Security.AccessControl.AccessControlSections]::Owner -bor [System.Security.AccessControl.AccessControlSections]::Group;
$acl=[System.IO.Directory]::GetAccessControl($env:PRIVATE_AI_SYNTHETIC_ACL_TEST,$sections);
$raw=[System.Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(),0);
$entries=@(foreach($ace in $raw.DiscretionaryAcl){[pscustomobject]@{sid=$ace.SecurityIdentifier.Value;type=$ace.AceType.ToString();flags=[int]$ace.AceFlags;mask=$ace.AccessMask}});
[pscustomobject]@{owner=$acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value;group=$acl.GetGroup([System.Security.Principal.SecurityIdentifier]).Value;protected=$acl.AreAccessRulesProtected;entries=$entries}|ConvertTo-Json -Depth 5 -Compress
`).replace(/^\uFEFF/,''));}
function diagnose(t,root,sid){
  try{const value=inspect(root);t.diagnostic(JSON.stringify({protected:value.protected,ownerIsCurrent:value.owner===sid,entries:value.entries.map(entry=>({principal:entry.sid===sid?'OWNER':entry.sid==='S-1-5-18'?'SYSTEM':entry.sid==='S-1-5-32-544'?'ADMINISTRATORS':'OTHER',type:entry.type,flags:entry.flags,mask:entry.mask}))}));}
  catch{t.diagnostic('Native synthetic ACL diagnosis unavailable; verification remains failed.');}
}
function verify(t,root,sid){try{verifyPrivateAcl(root,sid);}catch(error){diagnose(t,root,sid);throw error;}}

// Only Windows collects these actual native cases; no skipped case is counted
// as evidence on Linux. All paths are fresh synthetic TEMP directories.
if(process.platform==='win32'){
test('actual Windows protection replaces an explicit Administrators grant and preserves owner, group and file bytes',t=>{
  const root=temporary(t),sid=ownerSid(),file=path.join(root,'synthetic encrypted bytes.bin'),child=path.join(root,'synthetic child');
  fs.mkdirSync(child);const bytes=Buffer.from([0,255,21,37,40,0,99]);fs.writeFileSync(file,bytes);fs.writeFileSync(path.join(child,'synthetic.txt'),'Synthetic retained data');
  // Reproduce the hosted failure explicitly rather than relying on TEMP ACLs.
  icacls(root,['/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F']);
  const before=inspect(root);assert.ok(before.entries.some(entry=>entry.sid==='S-1-5-32-544'));
  assert.throws(()=>verifyPrivateAcl(root,sid),{code:'STORAGE'});
  protectPrivateFolder(root,sid);verify(t,root,sid);
  const after=inspect(root),expected=new Set([sid,'S-1-5-18']);
  assert.equal(after.protected,true);assert.equal(after.entries.length,expected.size);
  assert.ok(after.entries.every(entry=>expected.has(entry.sid)&&entry.type==='AccessAllowed'&&entry.flags===3&&entry.mask===2032127));
  assert.equal(after.owner===before.owner,true,'DACL replacement must preserve owner');assert.equal(after.group===before.group,true,'DACL replacement must preserve group');
  assert.deepEqual(fs.readFileSync(file),bytes);assert.equal(fs.readFileSync(path.join(child,'synthetic.txt'),'utf8'),'Synthetic retained data');
  protectPrivateFolder(root,sid);verify(t,root,sid);
  assert.equal(JSON.stringify(inspect(root))===JSON.stringify(after),true,'Repeated protection must be idempotent');
});
test('actual Windows numeric verifier rejects an extra Everyone grant and protection removes it',t=>{
  const root=temporary(t),sid=ownerSid();protectPrivateFolder(root,sid);verify(t,root,sid);
  icacls(root,['/grant','*S-1-1-0:(OI)(CI)R']);
  assert.throws(()=>verifyPrivateAcl(root,sid),{code:'STORAGE'});
  protectPrivateFolder(root,sid);verify(t,root,sid);
});
test('actual Windows verifier rejects unprotected or incomplete inheritance and refuses redirected paths',t=>{
  const root=temporary(t),sid=ownerSid();protectPrivateFolder(root,sid);verify(t,root,sid);
  powershell(root,`$acl=[System.IO.Directory]::GetAccessControl($env:PRIVATE_AI_SYNTHETIC_ACL_TEST);$acl.SetAccessRuleProtection($false,$true);[System.IO.Directory]::SetAccessControl($env:PRIVATE_AI_SYNTHETIC_ACL_TEST,$acl);`);
  assert.throws(()=>verifyPrivateAcl(root,sid),{code:'STORAGE'});
  protectPrivateFolder(root,sid);icacls(root,['/remove:g','*'+sid]);icacls(root,['/grant','*'+sid+':F']);
  assert.ok(inspect(root).entries.some(entry=>entry.sid===sid&&entry.flags===0),'The rejection fixture must actually omit child inheritance');
  assert.throws(()=>verifyPrivateAcl(root,sid),{code:'STORAGE'});
  protectPrivateFolder(root,sid);verify(t,root,sid);
  const link=path.join(root,'synthetic junction'),target=path.join(root,'synthetic target');fs.mkdirSync(target);fs.symlinkSync(target,link,'junction');
  assert.throws(()=>protectPrivateFolder(link,sid),{code:'STORAGE'});assert.throws(()=>verifyPrivateAcl(link,sid),{code:'STORAGE'});fs.unlinkSync(link);
});
}
