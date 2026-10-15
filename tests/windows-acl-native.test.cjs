'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {verifyPrivateAcl}=require('../source/windows-acl.cjs');

// Do not collect a skipped native case as evidence on another operating system.
if(process.platform==='win32'){
test('actual Windows protected synthetic folder passes the production private ACL verifier',t=>{
  const system=path.join(process.env.SystemRoot||'C:\\Windows','System32');
  const sid=execFileSync(path.join(system,'whoami.exe'),['/user','/fo','csv','/nh'],{encoding:'utf8',windowsHide:true}).match(/S-1-5-(?:\d+-)*\d+/)?.[0];
  assert.ok(sid,'The actual Windows owner SID must be available');
  const base=fs.realpathSync(os.tmpdir());
  const root=fs.mkdtempSync(path.join(base,'Private AI native ACL '));
  t.after(()=>{
    const target=fs.realpathSync(root);
    assert.equal(path.dirname(target),base,'Cleanup must remain inside the resolved synthetic TEMP parent');
    assert.ok(path.basename(target).startsWith('Private AI native ACL '));
    assert.equal(fs.lstatSync(target).isSymbolicLink(),false);
    fs.rmSync(target,{recursive:true,force:true});
  });
  // Keep these arguments identical to main.cjs protectFolder; no permission bypass.
  execFileSync(path.join(system,'icacls.exe'),[root,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F'],{windowsHide:true,stdio:'ignore'});
  let failure;
  try{verifyPrivateAcl(root,sid);}catch(error){failure=error;}
  if(failure){
    const ownerLabel=value=>value===sid?'OWNER':value==='S-1-5-18'||value==='SY'?'SYSTEM':/^[A-Z]{2}$/.test(value)?'SDDL_ALIAS_'+value:'OTHER';
    const saved=path.join(root,'synthetic-acl.txt');
    const safeFailure=(error,phase)=>({phase,code:['ENOENT','EACCES','EPERM'].includes(error.code)?error.code:Number.isInteger(error.status)?'PROCESS_EXIT_'+error.status:'UNAVAILABLE'});
    let diagnostic={verificationCode:failure.code==='STORAGE'?'STORAGE':'UNEXPECTED',sddlAvailable:false,numericAvailable:false,ownerIsBuiltinAdministrator:/^S-1-5-21-(?:\d+-){3}500$/.test(sid)};
    let phase='save_sddl';
    try{
      execFileSync(path.join(system,'icacls.exe'),[root,'/save',saved,'/q'],{windowsHide:true,stdio:'ignore'});
      phase='read_sddl';
      const dacl=fs.readFileSync(saved).toString('utf16le').replace(/^\uFEFF/,'').split(/\r?\n/).find(line=>line.startsWith('D:'))||'';
      diagnostic={...diagnostic,sddlAvailable:true,daclProtected:/^D:[^(]*P/.test(dacl),sddlAces:[...dacl.matchAll(/\(([^)]+)\)/g)].map(match=>{const fields=match[1].split(';');return{type:fields[0],flags:fields[1],rights:fields[2],principal:ownerLabel(fields[5]||'')};})};
      phase='get_acl_numeric';
      const aclScript="$ErrorActionPreference='Stop';$a=Get-Acl -LiteralPath $env:PRIVATE_AI_SYNTHETIC_ACL_TEST;[pscustomobject]@{protected=$a.AreAccessRulesProtected;entries=@($a.Access|ForEach-Object{[pscustomobject]@{sid=$_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value;inherited=$_.IsInherited;type=$_.AccessControlType.ToString();rights=$_.FileSystemRights.ToString()}})}|ConvertTo-Json -Depth 5 -Compress";
      const native=JSON.parse(execFileSync(path.join(system,'WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(aclScript,'utf16le').toString('base64')],{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore'],env:{...process.env,PRIVATE_AI_SYNTHETIC_ACL_TEST:root}}).replace(/^\uFEFF/,''));
      phase='normalize_numeric';
      diagnostic={...diagnostic,numericAvailable:true,protected:native.protected,numericAces:(Array.isArray(native.entries)?native.entries:native.entries?[native.entries]:[]).map(entry=>({principal:ownerLabel(entry.sid),inherited:entry.inherited,type:entry.type,rights:entry.rights}))};
    }catch(error){diagnostic.diagnosticFailure=safeFailure(error,phase);}
    // No account names, full SIDs, paths, or raw native exception text enter TAP.
    t.diagnostic(JSON.stringify(diagnostic));
  }
  assert.equal(Boolean(failure),false,'The real production verifier must accept the exact protected owner/SYSTEM synthetic ACL; see sanitized native diagnosis');
});
}
