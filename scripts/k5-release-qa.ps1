# K5 (DESKTOP-S2JKMK5) release-gate QA for one source tree: start the loopback sandbox from it (WMI-created, so it outlives SSH),
# then build the scripted role APKs and the ordinary-sign-in APK from the same tree, one job at a time.
param([string]$Source = 'D:\wind-lead-1115\rel-7ca9ad2', [string]$Out = 'D:\wind-lead-1115\apks-7ca9ad2', [switch]$BuildOnly)
$ErrorActionPreference = 'Continue'
$node = 'D:\wind-verify-20261113\tools\node-v24.12.0-win-x64'
$log = "$Out\k5-rel.log"
New-Item -ItemType Directory -Force $Out | Out-Null
"start $(Get-Date -Format o) source=$Source" | Add-Content $log

if (-not $BuildOnly) {
  if (Get-NetTCPConnection -LocalPort 4191 -State Listen -ErrorAction SilentlyContinue) { 'port 4191 busy' | Add-Content $log; exit 2 }
  $cmd = "cmd.exe /c cd /d $Source && set `"PATH=$node;%PATH%`" && node --disable-warning=ExperimentalWarning --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/phone-test-server.mjs > $Out\sandbox.log 2>&1"
  $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd }
  "sandbox create=$($r.ReturnValue) pid=$($r.ProcessId)" | Add-Content $log
  for ($i = 0; $i -lt 60 -and -not (Get-NetTCPConnection -LocalPort 4191 -State Listen -ErrorAction SilentlyContinue); $i++) { Start-Sleep 2 }
  "sandbox listening=$([bool](Get-NetTCPConnection -LocalPort 4191 -State Listen -ErrorAction SilentlyContinue))" | Add-Content $log
  if (-not (Test-Path "$Source\.expo\phone-qa\provision.json")) { 'no provision.json' | Add-Content $log; exit 3 }
}

$env:ANDROID_HOME = 'C:\wq-android-sdk'
$env:JAVA_HOME = 'C:\wind-booking-jdk17-20261108'
$env:PATH = "$env:JAVA_HOME\bin;$node;D:\wind-verify-20261113\tools\git-runtime-20261115\ucrt64\bin;$env:PATH"
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$Source\scripts\build-phone-tests.ps1" -BuildRoot D:\wq-qa1112 -OutputDirectory "$Out\scripted" *> "$Out\build-scripted.log"
"scripted exit=$LASTEXITCODE $(Get-Date -Format o)" | Add-Content $log
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$Source\scripts\build-phone-tests.ps1" -BuildRoot D:\wq-qa1112 -SignIn Ordinary -OutputDirectory "$Out\ordinary" *> "$Out\build-ordinary.log"
"ordinary exit=$LASTEXITCODE $(Get-Date -Format o)" | Add-Content $log
'K5-REL-DONE' | Add-Content $log
