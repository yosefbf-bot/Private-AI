# Run on a disposable Windows VM or clean test PC. This executes the REAL installer.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$Installer,
  [Parameter(Mandatory=$true)][ValidatePattern('^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$')][string]$ExpectedVersion,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedInstallerSHA256,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedExecutableSHA256,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-fA-F0-9]{64}$')][string]$ExpectedArchiveSHA256,
  [Parameter(Mandatory=$true)][string]$EvidenceDirectory,
  [Parameter(Mandatory=$true)][string]$InstallationDirectory
)
$ErrorActionPreference='Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Actual Windows execution is required.' }
$installerPath=(Resolve-Path -LiteralPath $Installer).Path
$evidencePath=[IO.Path]::GetFullPath($EvidenceDirectory)
$installPath=[IO.Path]::GetFullPath($InstallationDirectory)
if (Test-Path -LiteralPath $evidencePath) { throw 'Use a new evidence directory.' }
if (Test-Path -LiteralPath $installPath) { throw 'Use a new installation directory.' }
if ($installPath.Contains('"') -or $installPath.EndsWith('\') -or $installPath -eq [IO.Path]::GetPathRoot($installPath)) { throw 'Invalid installation directory.' }
if (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'PrivateAI2')) { throw 'Existing Private AI data found. Use a clean test Windows account/VM.' }
$registryPaths=@('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
$installed=Get-ItemProperty -Path $registryPaths -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match 'Private\s*AI' }
if ($installed) { throw 'An existing Private AI installation was found. Refusing to overwrite it for validation.' }
if ((Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash -ne $ExpectedInstallerSHA256) { throw 'Installer hash mismatch.' }
New-Item -ItemType Directory -Path $evidencePath | Out-Null
$result=[ordered]@{schema=1;version=$ExpectedVersion;platform='win32';passed=$false;windowsInstallerExecuted=$false;windowsApplicationExecuted=$false;installerSHA256=$ExpectedInstallerSHA256.ToLower();started=[DateTime]::UtcNow.ToString('o')}
try {
  # NSIS requires /D to be last and its path is unquoted, including spaces.
  $process=Start-Process -FilePath $installerPath -ArgumentList ('/S /D='+$installPath) -WindowStyle Hidden -PassThru
  $result.windowsInstallerExecuted=$true
  if (-not $process.WaitForExit(300000)) { throw 'Installer has not exited after five minutes. Inspect it manually; no success is recorded.' }
  $result.installerExitCode=$process.ExitCode
  if ($process.ExitCode -ne 0) { throw 'Installer failed; see installerExitCode.' }
  $exe=Join-Path $installPath 'PrivateAI.exe'
  $asar=Join-Path $installPath 'resources\app.asar'
  $result.executableSHA256=(Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLower()
  $result.applicationArchiveSHA256=(Get-FileHash -LiteralPath $asar -Algorithm SHA256).Hash.ToLower()
  if ($result.executableSHA256 -ne $ExpectedExecutableSHA256 -or $result.applicationArchiveSHA256 -ne $ExpectedArchiveSHA256) { throw 'Installed payload does not match the tested candidate.' }
  $appReport=Join-Path $evidencePath 'application-evidence.json'
  $appProcess=Start-Process -FilePath $exe -ArgumentList ('"--release-validation='+$appReport+'"') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $evidencePath 'application.stdout.log') -RedirectStandardError (Join-Path $evidencePath 'application.stderr.log')
  $result.windowsApplicationExecuted=$true
  if (-not $appProcess.WaitForExit(120000)) { throw 'Application validation did not finish. Inspect it manually; no success is recorded.' }
  if ($appProcess.ExitCode -ne 0) { throw 'Application validation process failed.' }
  $appEvidence=Get-Content -LiteralPath $appReport -Raw | ConvertFrom-Json
  if (-not $appEvidence.passed -or $appEvidence.version -ne $ExpectedVersion -or $appEvidence.applicationArchiveSHA256 -ne $result.applicationArchiveSHA256 -or $appEvidence.executableSHA256 -ne $result.executableSHA256) { throw 'Application evidence is missing, failed, or belongs to another artifact.' }
  $result.applicationEvidence='application-evidence.json'
  $result.passed=$true
} catch {
  $result.error=$_.Exception.Message
  throw
} finally {
  $result.completed=[DateTime]::UtcNow.ToString('o')
  # Windows PowerShell 5.1's Set-Content UTF8 adds a BOM that Node JSON.parse rejects.
  [IO.File]::WriteAllText((Join-Path $evidencePath 'installer-evidence.json'), ($result | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
}
Write-Output 'Actual clean Windows installer and installed application checks passed. Local-model inference and live integration acceptance are separate checks.'
