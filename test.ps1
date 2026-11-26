# T3 Code and CLI entry point for the Fastship Docker cloud test gate.
[CmdletBinding()]
param(
    [switch]$VerifyOnly,
    [switch]$RefreshDeps
)

$runner = Join-Path $env:USERPROFILE '.docker-sandbox\test-cloud.ps1'
& $runner -ProjectRoot $PSScriptRoot @PSBoundParameters
exit $LASTEXITCODE
