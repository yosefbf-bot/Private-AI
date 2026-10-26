"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { fail } = require("./security.cjs");
function restrictedDacl(sddl, sid) {
  const dacl = sddl.split(/\r?\n/).find((line) => line.startsWith("D:"));
  if (!dacl || !/^D:[^(]*P/.test(dacl)) return false;
  const entries = [...dacl.matchAll(/\(([^)]+)\)/g)].map((m) =>
    m[1].split(";"),
  );
  return (
    entries.length >= 2 &&
    entries.every((e) => e[0] === "A" && [sid, "SY", "S-1-5-18"].includes(e[5]))
  );
}
// Build and persist only a DACL, preserving ownership, group, audit and file data.
// Directory.SetAccessControl replaces the root DACL in one native operation;
// there is no temporary inheritance reset or permissive intermediate descriptor.
const protectScript = `
$acl=[System.Security.AccessControl.DirectorySecurity]::new();
$acl.SetAccessRuleProtection($true,$false);
$owner=[System.Security.Principal.SecurityIdentifier]::new($env:PRIVATE_AI_ACL_SID);
$system=[System.Security.Principal.SecurityIdentifier]::new('S-1-5-18');
$inherit=[System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit;
$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($owner,[System.Security.AccessControl.FileSystemRights]::FullControl,$inherit,[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow));
if($owner.Value -ne $system.Value){$acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($system,[System.Security.AccessControl.FileSystemRights]::FullControl,$inherit,[System.Security.AccessControl.PropagationFlags]::None,[System.Security.AccessControl.AccessControlType]::Allow));}
[System.IO.Directory]::SetAccessControl($env:PRIVATE_AI_ACL_PATH,$acl);
`;
// Use numeric native trustees, never localized account names or SDDL aliases.
// Inspect raw ACEs as well: typed rule enumeration must not hide an unsupported
// callback/object ACE or a NULL DACL. No extra grant or deny entry is accepted.
const verifyScript = `
$acl=[System.IO.Directory]::GetAccessControl($env:PRIVATE_AI_ACL_PATH,[System.Security.AccessControl.AccessControlSections]::Access);
$raw=[System.Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(),0);
$owner=[System.Security.Principal.SecurityIdentifier]::new($env:PRIVATE_AI_ACL_SID).Value;
$count=2;if($owner -eq 'S-1-5-18'){$count=1;}
$inherit=[System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit;
$full=[System.Security.AccessControl.FileSystemRights]::FullControl;
if(!$acl.AreAccessRulesProtected -or !$acl.AreAccessRulesCanonical -or $null -eq $raw.DiscretionaryAcl -or $raw.DiscretionaryAcl.Count -ne $count){throw 'ACL';}
$seen=[System.Collections.Generic.HashSet[string]]::new();
foreach($ace in $raw.DiscretionaryAcl){
 if($ace -isnot [System.Security.AccessControl.CommonAce] -or $ace.AceType -ne [System.Security.AccessControl.AceType]::AccessAllowed -or $ace.IsCallback -or [int]$ace.AceFlags -ne 3 -or $ace.AccessMask -ne [int]$full){throw 'ACL';}
 $trustee=$ace.SecurityIdentifier.Value;
 if(($trustee -ne $owner -and $trustee -ne 'S-1-5-18') -or !$seen.Add($trustee)){throw 'ACL';}
}
if(!$seen.Contains($owner) -or !$seen.Contains('S-1-5-18')){throw 'ACL';}
$rules=$acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]);
if($rules.Count -ne $count){throw 'ACL';}
foreach($rule in $rules){
 if(($rule.IdentityReference.Value -ne $owner -and $rule.IdentityReference.Value -ne 'S-1-5-18') -or $rule.IsInherited -or $rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow -or $rule.FileSystemRights -ne $full -or $rule.InheritanceFlags -ne $inherit -or $rule.PropagationFlags -ne [System.Security.AccessControl.PropagationFlags]::None){throw 'ACL';}
}
`;
function nativeAcl(root, sid, script) {
  try {
    if(process.platform!=="win32" || typeof root!=="string" || !path.isAbsolute(root) || typeof sid!=="string" || !/^S-1-5-(?:\d+-)*\d+$/.test(sid) || sid.length>184)throw Error();
    const info=fs.lstatSync(root);
    if(!info.isDirectory() || info.isSymbolicLink())throw Error();
    const command="$ErrorActionPreference='Stop';try{"+script+"}catch{exit 73}";
    execFileSync(path.join(process.env.SystemRoot||"C:\\Windows","System32","WindowsPowerShell","v1.0","powershell.exe"),
      ["-NoProfile","-NonInteractive","-EncodedCommand",Buffer.from(command,"utf16le").toString("base64")],
      {windowsHide:true,stdio:"ignore",timeout:20000,env:{...process.env,PRIVATE_AI_ACL_PATH:root,PRIVATE_AI_ACL_SID:sid}});
  } catch {
    // Native error text can contain account names and private data paths.
    throw fail("STORAGE");
  }
}
function protectPrivateFolder(root,sid){nativeAcl(root,sid,protectScript+verifyScript);}
function verifyPrivateAcl(root,sid){nativeAcl(root,sid,verifyScript);}
module.exports = { restrictedDacl, protectPrivateFolder, verifyPrivateAcl };
