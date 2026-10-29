# Install a best-effort workstation backup for the Azure VM. The task runs only
# in the current interactive Windows account because the backup uses its DPAPI key.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'Windows Task Scheduler is required.' }
$taskName = 'Wind-Azure-Backups'
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    throw "A task named $taskName already exists; inspect it before changing it."
}
$backupScript = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'backup-azure.ps1')).Path
$shell = (Get-Process -Id $PID).Path
$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $backupScript + '"'
$action = New-ScheduledTaskAction -Execute $shell -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddHours(4)) `
    -RepetitionInterval (New-TimeSpan -Hours 4) -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet -Hidden -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -RunOnlyIfNetworkAvailable -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description 'Verified encrypted Wind Azure database backup; requires the Windows user session and network.' | Out-Null
Write-Output "Created ${taskName}: every four hours while the account is logged in and network is available."
