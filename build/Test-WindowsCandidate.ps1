# Actual installer acceptance on a fresh GitHub-hosted Windows profile only.
# Never run this against an owner's installed application or data.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Installer,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$')][string]$ExpectedVersion,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedInstallerSHA256,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedExecutableSHA256,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedArchiveSHA256,
  [Parameter(Mandatory=$true)][string]$CandidateStage,
  [Parameter(Mandatory=$true)][string]$EvidenceDirectory,
  [Parameter(Mandatory=$true)][string]$InstallationDirectory,
  [Parameter(Mandatory=$true)][string]$ModelPath,
  [Parameter(Mandatory=$true)][string]$TestResults
)
$ErrorActionPreference='Stop'
function Write-Receipt($Path,$Value) { [IO.File]::WriteAllText($Path,($Value|ConvertTo-Json -Depth 12),[Text.UTF8Encoding]::new($false)) }
function Assert-NoLinks([string]$Path) {
  $cursor=[IO.Path]::GetFullPath($Path)
  while ($cursor) {
    if (Test-Path -LiteralPath $cursor) { if ((Get-Item -LiteralPath $cursor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse points are not permitted in acceptance paths.' } }
    $parent=[IO.Path]::GetDirectoryName($cursor)
    if ($parent -eq $cursor) { break }; $cursor=$parent
  }
}
function Test-Under([string]$Root,[string]$Path) { return $Path.StartsWith($Root.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase) }
function Assert-NewTestPath([string]$Root,[string]$Path) {
  if (-not (Test-Under $Root $Path) -or $Path.Contains('"') -or (Test-Path -LiteralPath $Path)) { throw 'Use a fresh acceptance path strictly inside RUNNER_TEMP.' }
  Assert-NoLinks $Path
}
function Get-Tree([string]$Root) {
  Assert-NoLinks $Root
  $prefix=[IO.Path]::GetFullPath($Root).TrimEnd('\')+'\'
  function Visit([string]$Directory) {
    foreach ($item in Get-ChildItem -LiteralPath $Directory -Force | Sort-Object Name) {
      if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'A linked candidate or data entry was rejected.' }
      if ($item.PSIsContainer) { Visit $item.FullName }
      else { [pscustomobject]@{path=$item.FullName.Substring($prefix.Length).Replace('\','/');bytes=$item.Length;sha256=(Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash.ToLower()} }
    }
  }
  @(Visit $Root)
}
function Assert-Tree($Expected,[string]$Root) {
  $actual=@(Get-Tree $Root)
  if ($actual.Count -ne $Expected.Count) { throw 'File count changed after validation.' }
  $map=@{}; foreach ($row in $actual) { if($map.ContainsKey($row.path)){throw 'Duplicate candidate file path.'};$map[$row.path]=$row }
  foreach ($row in $Expected) { $found=$map[$row.path];if(-not $found -or $found.bytes -ne $row.bytes -or $found.sha256 -ne $row.sha256){throw 'A validated file changed.'} }
}
function PrivateAI-Registration {
  @(Get-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -match 'Private\s*AI'})
}
function Resolve-CandidateUninstaller([string]$Root,[string]$Name) {
  $directory=[IO.Path]::GetFullPath($Root)
  if($Name -notmatch '^Uninstall [^\x00-\x1f<>:"/\\|?*]+\.exe$' -or [IO.Path]::GetFileName($Name) -ne $Name){throw 'Invalid candidate uninstaller name.'}
  $candidate=[IO.Path]::GetFullPath((Join-Path $directory $Name))
  if(-not (Test-Under $directory $candidate) -or [IO.Path]::GetDirectoryName($candidate) -ne $directory){throw 'Candidate uninstaller escapes its installation directory.'}
  Assert-NoLinks $candidate
  $uninstallerRows=@(Get-ChildItem -LiteralPath $directory -Filter 'Uninstall*.exe' -File)
  if($uninstallerRows.Count -ne 1 -or $uninstallerRows[0].FullName -ne $candidate -or -not (Test-Path -LiteralPath $candidate -PathType Leaf)){throw 'The exact single candidate uninstaller is missing or ambiguous.'}
  return $candidate
}
function Invoke-ActualProcess([string]$File,[string]$Arguments,[int]$Timeout,[string]$LogDirectory) {
  $options=@{FilePath=$File;ArgumentList=$Arguments;WindowStyle='Hidden';PassThru=$true}
  if($LogDirectory){$options.RedirectStandardOutput=Join-Path $LogDirectory 'process.stdout.log';$options.RedirectStandardError=Join-Path $LogDirectory 'process.stderr.log'}
  $process=Start-Process @options
  $processHandle=$process.Handle
  if(-not $process.WaitForExit($Timeout)){throw 'An actual acceptance process did not finish within its bound.'}
  if($process.ExitCode -ne 0){throw 'An actual acceptance process failed.'}
  return $process.ExitCode
}
function Assert-ApplicationReceipt([string]$Path,[bool]$RequireRestart=$false) {
  $data=Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  if(-not $data.passed -or -not $data.windowsApplicationExecuted -or $data.platform -ne 'win32' -or $data.version -ne $ExpectedVersion -or $data.executableSHA256 -ne $ExpectedExecutableSHA256.ToLower() -or $data.applicationArchiveSHA256 -ne $ExpectedArchiveSHA256.ToLower()){throw 'Actual application receipt does not match this candidate.'}
  if($RequireRestart -and -not (@($data.checks) -contains 'second process restart preserved synthetic encrypted records and the original DPAPI vault')){throw 'Actual encrypted restart acceptance is missing.'}
  return $data
}
function Run-Application([string]$Executable,[string]$Report,[string]$Logs,[bool]$RequireRestart=$false) {
  $code=Invoke-ActualProcess $Executable ('"--release-validation='+$Report+'"') 300000 $Logs
  $data=Assert-ApplicationReceipt $Report $RequireRestart
  return $data
}
function Copy-SyntheticData([string]$Source,[string]$Destination) {
  if(Test-Path -LiteralPath $Destination){throw 'Refusing to overwrite an existing data directory.'}
  $rows=@(Get-Tree $Source)
  if(-not (Test-Path -LiteralPath (Join-Path $Source 'vault.dpapi')) -or -not (Test-Path -LiteralPath (Join-Path $Source 'privateai.db'))){throw 'Validated encrypted synthetic data is missing.'}
  New-Item -ItemType Directory -Path $Destination | Out-Null
  foreach($item in Get-ChildItem -LiteralPath $Source -Force){Copy-Item -LiteralPath $item.FullName -Destination $Destination -Recurse}
  Assert-Tree $rows $Destination
}

if($env:OS -ne 'Windows_NT'){throw 'Actual Windows execution is required.'}
if($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or -not $env:RUNNER_TEMP){throw 'A fresh GitHub-hosted Windows runner is required.'}
$defaultData=Join-Path $env:LOCALAPPDATA 'PrivateAI2'
if(Test-Path -LiteralPath $defaultData){throw 'Existing Private AI data found. Owner installation acceptance is forbidden.'}
if(@(PrivateAI-Registration).Count){throw 'An existing Private AI installation was found. Owner installation acceptance is forbidden.'}
$temporaryRoot=(Resolve-Path -LiteralPath $env:RUNNER_TEMP).Path
$evidencePath=[IO.Path]::GetFullPath($EvidenceDirectory);$installPath=[IO.Path]::GetFullPath($InstallationDirectory)
Assert-NewTestPath $temporaryRoot $evidencePath;Assert-NewTestPath $temporaryRoot $installPath
if((Test-Under $evidencePath $installPath) -or (Test-Under $installPath $evidencePath) -or $evidencePath -eq $installPath){throw 'Installation and evidence paths must be separate.'}
$reinstallPath=$installPath+' reinstall';Assert-NewTestPath $temporaryRoot $reinstallPath
Assert-NoLinks $defaultData
$installerPath=(Resolve-Path -LiteralPath $Installer).Path;$stagePath=(Resolve-Path -LiteralPath $CandidateStage).Path
$modelPathResolved=(Resolve-Path -LiteralPath $ModelPath).Path;$testsPath=(Resolve-Path -LiteralPath $TestResults).Path
foreach($file in @($installerPath,$stagePath,$modelPathResolved,$testsPath)){Assert-NoLinks $file}
if([IO.Path]::GetExtension($installerPath) -ne '.exe' -or (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash -ne $ExpectedInstallerSHA256){throw 'Genuine candidate installer hash mismatch.'}
if((Get-FileHash -LiteralPath (Join-Path $stagePath 'PrivateAI.exe') -Algorithm SHA256).Hash -ne $ExpectedExecutableSHA256 -or (Get-FileHash -LiteralPath (Join-Path $stagePath 'resources\app.asar') -Algorithm SHA256).Hash -ne $ExpectedArchiveSHA256){throw 'Staged candidate hashes mismatch.'}
$repositoryRoot=Split-Path $PSScriptRoot -Parent
$node=(Get-Command node -ErrorAction Stop).Source
# Resolve the same product filename used by this pinned NSIS builder. In this
# application executableName=PrivateAI, so the display name's space is not used.
$uninstallerNameOutput=& $node -e 'const path=require("node:path");const root=process.argv[1];const p=require(path.join(root,"package.json"));const {AppInfo}=require(path.join(root,"node_modules/app-builder-lib/out/appInfo.js"));process.stdout.write(JSON.stringify("Uninstall "+new AppInfo({metadata:p,config:p.build},undefined,p.build.win).productFilename+".exe"));' $repositoryRoot
if($LASTEXITCODE -ne 0){throw 'The pinned builder uninstaller contract could not be resolved.'}
$uninstallerName=$uninstallerNameOutput | ConvertFrom-Json
if($env:ELECTRON_BUILDER_7ZIP_PATH){throw 'Custom ZIP-tool overrides are not permitted for candidate acceptance.'}
$zipToolOutput=& $node -e 'require(process.argv[1]).getPath7za().then(p=>process.stdout.write(JSON.stringify(p))).catch(()=>process.exit(1))' (Join-Path $repositoryRoot 'node_modules\app-builder-lib\out\toolsets\7zip.js')
if($LASTEXITCODE -ne 0){throw 'The checksum-pinned builder ZIP tool could not be resolved.'}
$zipTool=$zipToolOutput | ConvertFrom-Json
if(-not (Test-Path -LiteralPath $zipTool)){throw 'The checksum-pinned builder ZIP tool is unavailable.'}
Assert-NoLinks $zipTool
$stageRows=@(Get-Tree $stagePath)
if(-not $stageRows.Count){throw 'The candidate has no files.'}
$stageMap=@{};foreach($row in $stageRows){if($stageMap.ContainsKey($row.path)){throw 'Candidate paths collide.'};$stageMap[$row.path]=$row}
$environmentNames=@('PRIVATE_AI_VALIDATION_MODEL','PRIVATE_AI_VALIDATION_AUTOMATIC','PRIVATE_AI_VALIDATION_CONTEXT','PRIVATE_AI_VALIDATION_OUTPUT','PRIVATE_AI_VALIDATION_DOCUMENT_TOOLS','ELECTRON_RUN_AS_NODE','NODE_OPTIONS')
$savedEnvironment=@{};foreach($name in $environmentNames){$savedEnvironment[$name]=[Environment]::GetEnvironmentVariable($name,'Process');[Environment]::SetEnvironmentVariable($name,$null,'Process')}
New-Item -ItemType Directory -Path $evidencePath | Out-Null
$receipt=[ordered]@{schema=1;version=$ExpectedVersion;platform='win32';passed=$false;installerSHA256=$ExpectedInstallerSHA256.ToLower();executableSHA256=$ExpectedExecutableSHA256.ToLower();applicationArchiveSHA256=$ExpectedArchiveSHA256.ToLower();started=[DateTime]::UtcNow.ToString('o');phase='clean';limitations=@('Hosted Windows acceptance does not establish physical-phone, account, microphone, reboot or interactive-wizard acceptance.','Default-location retention uses explicit synthetic encrypted fixtures; their records are verified through an isolated validation copy, not owner data.')}
try {
  $clean=Join-Path $evidencePath 'clean'
  & (Join-Path $PSScriptRoot 'Test-CleanWindowsInstall.ps1') -Installer $installerPath -ExpectedVersion $ExpectedVersion -ExpectedInstallerSHA256 $ExpectedInstallerSHA256 -ExpectedExecutableSHA256 $ExpectedExecutableSHA256 -ExpectedArchiveSHA256 $ExpectedArchiveSHA256 -EvidenceDirectory $clean -InstallationDirectory $installPath
  $report=Join-Path $clean 'application-evidence.json';$dataPath=Join-Path $clean 'app-data'
  $initial=Assert-ApplicationReceipt $report
  Copy-Item -LiteralPath $report -Destination (Join-Path $clean 'initial-application-evidence.json')
  $installedExe=Join-Path $installPath 'PrivateAI.exe'
  $originalVault=(Get-FileHash -LiteralPath (Join-Path $dataPath 'vault.dpapi') -Algorithm SHA256).Hash
  $restart=Join-Path $evidencePath 'restart';New-Item -ItemType Directory -Path $restart | Out-Null
  $receipt.phase='restart';$restarted=Run-Application $installedExe $report $restart $true
  Copy-Item -LiteralPath $report -Destination (Join-Path $restart 'application-evidence.json')
  if((Get-FileHash -LiteralPath (Join-Path $dataPath 'vault.dpapi') -Algorithm SHA256).Hash -ne $originalVault){throw 'Restart replaced the original DPAPI vault.'}

  $inference=Join-Path $evidencePath 'inference';New-Item -ItemType Directory -Path $inference | Out-Null
  $receipt.phase='inference'
  # Public checksum-pinned OCR/embedding assets go only into the isolated synthetic store.
  & $node -e 'const tools=require(process.argv[1]);tools.setup({root:process.argv[2],assertUnlocked(){},requests:new Map()},"all").catch(()=>process.exit(1));' (Join-Path $PSScriptRoot '../source/document-tools-assets.cjs') $dataPath
  if($LASTEXITCODE -ne 0){throw 'Pinned public document-tool setup failed.'}
  $env:PRIVATE_AI_VALIDATION_DOCUMENT_TOOLS='1'
  $env:PRIVATE_AI_VALIDATION_MODEL=$modelPathResolved;$env:PRIVATE_AI_VALIDATION_AUTOMATIC='1';$env:PRIVATE_AI_VALIDATION_CONTEXT='4096';$env:PRIVATE_AI_VALIDATION_OUTPUT='128'
  try{$actualInference=Run-Application $installedExe $report $inference $true}finally{foreach($name in @('PRIVATE_AI_VALIDATION_MODEL','PRIVATE_AI_VALIDATION_AUTOMATIC','PRIVATE_AI_VALIDATION_CONTEXT','PRIVATE_AI_VALIDATION_OUTPUT','PRIVATE_AI_VALIDATION_DOCUMENT_TOOLS')){[Environment]::SetEnvironmentVariable($name,$null,'Process')}}
  Copy-Item -LiteralPath $report -Destination (Join-Path $inference 'application-evidence.json')
  $documentTools=$actualInference.documentTools
  if(-not $documentTools.passed -or -not $documentTools.actualImageOCRExecuted -or -not $documentTools.actualScannedPDFOCRExecuted -or -not $documentTools.actualLocalEmbeddingExecuted -or -not $documentTools.actualSqliteVecRankingExecuted -or $documentTools.cloudInferenceCalls -ne 0){throw 'Actual packaged offline document acceptance failed.'}
  Copy-Item -LiteralPath (Join-Path $clean 'document-tools-evidence.json') -Destination (Join-Path $inference 'document-tools-evidence.json')
  if(-not $actualInference.actualModelInferenceExecuted -or $actualInference.automaticAdmissionCapBytes -ne 3GB -or -not $actualInference.inference.response -or $actualInference.inference.provider -ne 'local'){throw 'Genuine bounded Automatic Small inference did not execute.'}
  $inferenceReceipt=[ordered]@{version=$ExpectedVersion;platform='win32';passed=$true;actualModelInferenceExecuted=$true;runtimeSHA256=$actualInference.inference.runtimeSHA256;modelSHA256=$actualInference.inference.modelSHA256;applicationArchiveSHA256=$actualInference.applicationArchiveSHA256;automaticAdmissionCapBytes=$actualInference.automaticAdmissionCapBytes;results=@($actualInference.inference)}
  Write-Receipt (Join-Path $inference 'inference-evidence.json') $inferenceReceipt

  # This standard-profile fixture is created only after clean-account refusal gates
  # and actual packaged synthetic checks passed. It never replaces existing data.
  $receipt.phase='retention';Copy-SyntheticData $dataPath $defaultData
  $retainedRows=@(Get-Tree $defaultData)
  $uninstaller=Resolve-CandidateUninstaller $installPath $uninstallerName
  $receipt.uninstallerName=$uninstallerName;$receipt.uninstallerSHA256=(Get-FileHash -LiteralPath $uninstaller -Algorithm SHA256).Hash.ToLower()
  $uninstallExit=Invoke-ActualProcess $uninstaller '/S' 300000 $null
  $end=[DateTime]::UtcNow.AddSeconds(60)
  while(([DateTime]::UtcNow -lt $end) -and ((Test-Path -LiteralPath $installedExe) -or @(PrivateAI-Registration).Count)){Start-Sleep -Milliseconds 200}
  if((Test-Path -LiteralPath $installedExe) -or @(PrivateAI-Registration).Count){throw 'Uninstall did not remove the installed program and registration.'}
  Assert-Tree $retainedRows $defaultData

  $receipt.phase='reinstall';$reinstall=Join-Path $evidencePath 'reinstall';New-Item -ItemType Directory -Path $reinstall | Out-Null
  if((Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash -ne $ExpectedInstallerSHA256){throw 'Installer changed before reinstall.'}
  $reinstallExit=Invoke-ActualProcess $installerPath ('/S /D='+$reinstallPath) 300000 $null
  $reinstalledExe=Join-Path $reinstallPath 'PrivateAI.exe'
  if((Get-FileHash -LiteralPath $reinstalledExe -Algorithm SHA256).Hash -ne $ExpectedExecutableSHA256 -or (Get-FileHash -LiteralPath (Join-Path $reinstallPath 'resources\app.asar') -Algorithm SHA256).Hash -ne $ExpectedArchiveSHA256){throw 'Reinstalled candidate payload differs.'}
  Assert-Tree $retainedRows $defaultData
  Copy-SyntheticData $defaultData (Join-Path $reinstall 'app-data')
  $reinstallApp=Run-Application $reinstalledExe (Join-Path $reinstall 'application-evidence.json') $reinstall $true
  if((Get-FileHash -LiteralPath (Join-Path $reinstall 'app-data\vault.dpapi') -Algorithm SHA256).Hash -ne $originalVault){throw 'Reinstall recovery replaced the retained DPAPI vault.'}
  Write-Receipt (Join-Path $reinstall 'retention-evidence.json') ([ordered]@{version=$ExpectedVersion;platform='win32';passed=$true;windowsUninstallerExecuted=$true;uninstallerExitCode=$uninstallExit;windowsInstallerExecuted=$true;installerExitCode=$reinstallExit;defaultLocationSyntheticFilesRetained=$retainedRows.Count;retainedEncryptedRecordsReadBack=$true;originalDPAPIVaultPreserved=$true;installerSHA256=$ExpectedInstallerSHA256.ToLower()})

  $receipt.phase='portable';$portable=Join-Path $evidencePath 'portable';New-Item -ItemType Directory -Path $portable | Out-Null
  $zip=Join-Path $evidencePath ('PrivateAI-Portable-'+$ExpectedVersion+'-x64.zip');$extracted=Join-Path $portable 'relocated'
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  Assert-Tree $stageRows $stagePath
  [IO.Compression.ZipFile]::CreateFromDirectory($stagePath,$zip,[IO.Compression.CompressionLevel]::Optimal,$false)
  & $zipTool t -bso0 -bsp0 $zip
  if($LASTEXITCODE -ne 0){throw 'Actual portable ZIP CRC verification failed.'}
  $archive=[IO.Compression.ZipFile]::OpenRead($zip)
  try {
    $entries=@{};foreach($entry in $archive.Entries){
      $target=[IO.Path]::GetFullPath((Join-Path $extracted $entry.FullName.Replace('/','\')))
      if(-not (Test-Under $extracted $target)){throw 'Portable archive entry escapes its destination.'}
      if($entry.FullName.EndsWith('/')){continue}
      if($entries.ContainsKey($entry.FullName) -or -not $stageMap.ContainsKey($entry.FullName) -or $stageMap[$entry.FullName].bytes -ne $entry.Length){throw 'Portable archive contents do not match staging.'};$entries[$entry.FullName]=$true
    }
    if($entries.Count -ne $stageRows.Count){throw 'Portable archive omitted a staged file.'}
  } finally {$archive.Dispose()}
  [IO.Compression.ZipFile]::ExtractToDirectory($zip,$extracted)
  Assert-Tree $stageRows $extracted
  Copy-SyntheticData (Join-Path $reinstall 'app-data') (Join-Path $portable 'app-data')
  $portableApp=Run-Application (Join-Path $extracted 'PrivateAI.exe') (Join-Path $portable 'application-evidence.json') $portable $true
  Write-Receipt (Join-Path $portable 'portable-evidence.json') ([ordered]@{version=$ExpectedVersion;platform='win32';passed=$true;zipCRCVerified=$true;allFileHashesVerified=$true;fileCount=$stageRows.Count;zipSHA256=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLower();actualRelocatedApplicationExecuted=$portableApp.windowsApplicationExecuted})

  $receipt.phase='release-gate';Assert-Tree $stageRows $stagePath
  $gateConfig=Join-Path $evidencePath 'release-gate-input.json'
  Write-Receipt $gateConfig ([ordered]@{applicationEvidence=(Join-Path $clean 'initial-application-evidence.json');installerEvidence=(Join-Path $clean 'installer-evidence.json');inferenceEvidence=(Join-Path $inference 'inference-evidence.json');installer=$installerPath;stage=$stagePath;testResults=$testsPath})
  & $node -e 'const fs=require("node:fs");const r=require(process.argv[1]).verify(JSON.parse(fs.readFileSync(process.argv[2],"utf8")));fs.writeFileSync(process.argv[3],JSON.stringify({passed:true,...r})+"\n");' (Join-Path $PSScriptRoot 'release-evidence-gate.cjs') $gateConfig (Join-Path $evidencePath 'release-gate-evidence.json')
  if($LASTEXITCODE -ne 0){throw 'The unchanged hash-bound release evidence gate rejected this candidate.'}
  $receipt.passed=$true;$receipt.phase='complete';$receipt.actualInstallerExecuted=$true;$receipt.actualInstalledApplicationExecuted=$true;$receipt.actualModelInferenceExecuted=$true;$receipt.actualUninstallReinstallExecuted=$true;$receipt.actualPortableExecuted=$true
} catch {$receipt.error='Actual candidate acceptance failed; inspect the failed phase receipts and workflow log.';throw}
finally {
  foreach($name in $environmentNames){[Environment]::SetEnvironmentVariable($name,$savedEnvironment[$name],'Process')}
  $receipt.completed=[DateTime]::UtcNow.ToString('o');Write-Receipt (Join-Path $evidencePath 'windows-candidate-evidence.json') $receipt
}
Write-Output 'Actual isolated Windows installer, restart, inference, retention/reinstall, portable and unchanged release-gate acceptance passed.'
