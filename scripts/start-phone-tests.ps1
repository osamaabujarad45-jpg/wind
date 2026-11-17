[CmdletBinding()]
param([switch]$Restart)
$ErrorActionPreference = 'Stop'
$sandboxRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sandboxPort = if ($env:WIND_PHONE_TEST_PORT) { [int]$env:WIND_PHONE_TEST_PORT } else { 4191 }
if ($sandboxPort -lt 1024 -or $sandboxPort -gt 65535) { throw 'WIND_PHONE_TEST_PORT must be a valid unprivileged TCP port.' }
$sandboxName = if ($sandboxPort -eq 4191) { 'phone-qa' } else { "phone-qa-$sandboxPort" }
$sandboxDir = Join-Path $sandboxRoot ".expo\$sandboxName"
$sandboxScript = Join-Path $PSScriptRoot 'phone-test-server.mjs'
New-Item -ItemType Directory -Path $sandboxDir -Force | Out-Null
$sandboxListeners = @(Get-NetTCPConnection -State Listen -LocalPort $sandboxPort -ErrorAction SilentlyContinue)
if ($sandboxListeners.Count) {
  $sandboxProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$($sandboxListeners[0].OwningProcess)"
  if ($sandboxProcess.CommandLine -notlike '*phone-test-server.mjs*') { throw "Port $sandboxPort belongs to another application." }
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
      $sandboxHealth = Invoke-RestMethod "http://127.0.0.1:$sandboxPort/api/ready" -TimeoutSec 2
      if ($sandboxHealth.ok) { $sandboxReady = $true; break }
    } catch { }
    if ($sandboxChild.HasExited) { throw "Sandbox startup failed; see .expo/$sandboxName/server-error.log." }
  }
  if (!$sandboxReady) { throw "Sandbox did not become ready; see .expo/$sandboxName/server-error.log." }
}
$sandboxAdb = (Get-Command adb -ErrorAction SilentlyContinue).Source
if (!$sandboxAdb) { $sandboxAdb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe' }
if (!(Test-Path -LiteralPath $sandboxAdb)) { throw 'Android platform-tools adb.exe was not found.' }
$sandboxDevices = @(& $sandboxAdb devices | Where-Object { $_ -match '^\S+\s+device$' } | ForEach-Object { ($_ -split '\s+')[0] })
if ($sandboxDevices.Count -ne 1) { throw 'Connect one USB-debugging-authorized Android phone.' }
& $sandboxAdb -s $sandboxDevices[0] reverse "tcp:$sandboxPort" "tcp:$sandboxPort"
if ($LASTEXITCODE -ne 0) { throw 'USB API forwarding failed.' }
Write-Host 'Phone test backend is ready. Open Wind Customer Test, Wind Driver Test or Wind Admin Test. Keep this PC and USB connected.'
