[CmdletBinding()]
param([switch]$Restart)
$ErrorActionPreference = 'Stop'
$sandboxRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sandboxDir = Join-Path $sandboxRoot '.expo\phone-qa'
$sandboxScript = Join-Path $PSScriptRoot 'phone-test-server.mjs'
New-Item -ItemType Directory -Path $sandboxDir -Force | Out-Null
$sandboxListeners = @(Get-NetTCPConnection -State Listen -LocalPort 4191 -ErrorAction SilentlyContinue)
if ($sandboxListeners.Count) {
  $sandboxProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($sandboxListeners[0].OwningProcess)"
  if ($sandboxProcess.CommandLine -notlike '*phone-test-server.mjs*') { throw 'Port 4191 belongs to another application.' }
  if ($Restart) {
    Stop-Process -Id $sandboxProcess.ProcessId
    Start-Sleep -Milliseconds 500
    $sandboxListeners = @()
  }
}
if (!$sandboxListeners.Count) {
  $sandboxNode = (Get-Command node.exe).Source
  $sandboxArgs = @('--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--disable-warning=ExperimentalWarning', ('"' + $sandboxScript + '"'))
  $sandboxChild = Start-Process -FilePath $sandboxNode -ArgumentList $sandboxArgs -WorkingDirectory $sandboxRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $sandboxDir 'server.log') -RedirectStandardError (Join-Path $sandboxDir 'server-error.log')
  Set-Content -LiteralPath (Join-Path $sandboxDir 'server.pid') -Value $sandboxChild.Id
  $sandboxReady = $false
  for ($sandboxTry = 0; $sandboxTry -lt 30; $sandboxTry++) {
    Start-Sleep -Milliseconds 500
    try {
      $sandboxHealth = Invoke-RestMethod 'http://127.0.0.1:4191/api/ready' -TimeoutSec 2
      if ($sandboxHealth.ok) { $sandboxReady = $true; break }
    } catch { }
    if ($sandboxChild.HasExited) { throw 'Sandbox startup failed; see .expo/phone-qa/server-error.log.' }
  }
  if (!$sandboxReady) { throw 'Sandbox did not become ready; see .expo/phone-qa/server-error.log.' }
}
$sandboxDevices = @(& adb devices | Where-Object { $_ -match '^\S+\s+device$' } | ForEach-Object { ($_ -split '\s+')[0] })
if ($sandboxDevices.Count -ne 1) { throw 'Connect one USB-debugging-authorized Android phone.' }
& adb -s $sandboxDevices[0] reverse tcp:4191 tcp:4191
if ($LASTEXITCODE -ne 0) { throw 'USB API forwarding failed.' }
Write-Host 'Phone test backend is ready. Open Wind Customer Test, Wind Driver Test or Wind Admin Test. Keep this PC and USB connected.'
