$ErrorActionPreference='Stop'
# Disposable hosted acceptance only. Never update an owner's browser implicitly.
if ($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_ENVIRONMENT -cne 'github-hosted' -or $env:RUNNER_OS -cne 'Windows' -or $env:RUNNER_ARCH -cne 'X64') {
  throw 'Edge provisioning requires a disposable GitHub-hosted Windows x64 runner.'
}
$edge=Join-Path ${env:ProgramFiles(x86)} 'Microsoft/Edge/Application/msedge.exe'
function Read-EdgeVersion {
  if (-not (Test-Path -LiteralPath $edge -PathType Leaf)) { throw 'Actual Windows Edge is required.' }
  $value=(Get-Item -LiteralPath $edge).VersionInfo.ProductVersion
  if ($value -notmatch '^\d{1,4}(\.\d{1,6}){3}$') { throw 'Invalid installed Edge version.' }
  return [version]$value
}
$before=Read-EdgeVersion
if ($before.Major -lt 155) {
  $catalog=Invoke-RestMethod -Uri 'https://edgeupdates.microsoft.com/api/products?view=enterprise' -TimeoutSec 60
  $stable=@($catalog | Where-Object { $_.Product -ceq 'Stable' })
  if ($stable.Count -ne 1) { throw 'Invalid official Edge Stable catalog.' }
  $releases=@($stable[0].Releases | Where-Object { $_.Platform -ceq 'Windows' -and $_.Architecture -ceq 'x64' -and $_.ProductVersion -match '^\d{1,4}(\.\d{1,6}){3}$' } | Sort-Object { [version]$_.ProductVersion } -Descending)
  if ($releases.Count -eq 0) { throw 'Official Windows Edge Stable release unavailable.' }
  $release=$releases[0]; $target=[version]$release.ProductVersion
  if ($target.Major -lt 155 -or $target -le $before) { throw 'A patched Edge upgrade is required; downgrades are forbidden.' }
  $artifacts=@($release.Artifacts | Where-Object { $_.ArtifactName -ceq 'msi' -and $_.HashAlgorithm -ceq 'SHA256' -and $_.Hash -match '^[A-Fa-f0-9]{64}$' })
  if ($artifacts.Count -ne 1) { throw 'Official Edge MSI hash unavailable.' }
  $artifact=$artifacts[0]; $uri=[uri]$artifact.Location
  if ($uri.Scheme -cne 'https' -or $uri.Host -cne 'msedge.sf.dl.delivery.mp.microsoft.com' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment -or -not $uri.AbsolutePath.EndsWith('/MicrosoftEdgeEnterpriseX64.msi',[StringComparison]::Ordinal)) { throw 'Unapproved Edge installer location.' }
  $folder=Join-Path $env:RUNNER_TEMP ('privateai-edge-'+[guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $folder | Out-Null
  $msi=Join-Path $folder 'MicrosoftEdgeEnterpriseX64.msi'
  Invoke-WebRequest -Uri $uri.AbsoluteUri -OutFile $msi -TimeoutSec 300
  if ((Get-Item -LiteralPath $msi).Length -ne [long]$artifact.SizeInBytes -or (Get-FileHash -LiteralPath $msi -Algorithm SHA256).Hash -cne $artifact.Hash.ToUpperInvariant()) { throw 'Edge MSI size/hash mismatch.' }
  $signature=Get-AuthenticodeSignature -LiteralPath $msi
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false) -cne 'Microsoft Corporation') { throw 'Edge MSI Microsoft signature verification failed.' }
  $installer=Start-Process -FilePath (Join-Path $env:SystemRoot 'System32/msiexec.exe') -ArgumentList @('/i',('"'+$msi+'"'),'/qn','/norestart') -WindowStyle Hidden -PassThru
  if (-not $installer.WaitForExit(600000)) { throw 'Edge update did not finish; acceptance cannot continue.' }
  if ($installer.ExitCode -ne 0) { throw 'Edge update failed or requires a restart; acceptance cannot continue.' }
}
$after=Read-EdgeVersion
if ($after.Major -lt 155 -or $after -lt $before) { throw 'Actual installed Edge does not satisfy the patched report-browser prerequisite.' }
Write-Output ('EDGE_REPORT_BROWSER='+(@{before=$before.ToString();actual=$after.ToString();minimumMajor=155;vendorUpdateExecuted=($before -ne $after)} | ConvertTo-Json -Compress))
