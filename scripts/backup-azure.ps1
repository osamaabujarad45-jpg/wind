param(
    [string]$TargetHost = 'windadmin@20.91.209.132',
    [string]$IdentityFile = "$env:USERPROFILE\.ssh\wind-vm_ed25519",
    [string]$ContainerName = 'wind-api',
    [string]$OutputDirectory = "$env:LOCALAPPDATA\SouqWindPrivate\backups",
    [switch]$VerifyLatest
)

# Windows DPAPI keeps database contents out of source files, console output and
# plaintext local files. Restore requires this Windows account's DPAPI keys.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'This backup transport requires Windows DPAPI.' }
if ($ContainerName -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_.-]*$') { throw 'Invalid container name.' }
if (-not (Test-Path -LiteralPath $IdentityFile -PathType Leaf)) { throw 'SSH identity is unavailable.' }
$sshArguments = @('-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'StrictHostKeyChecking=yes', '-i', $IdentityFile, $TargetHost)

function Invoke-DatabaseTool([string]$Code, [string]$PrivateInput = '') {
    $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Code))
    $interactive = if ($PrivateInput) { '-i ' } else { '' }
    $command = "sudo -n docker exec $interactive$ContainerName node --disable-warning=ExperimentalWarning --input-type=module -e `"import('data:text/javascript;base64,$encoded')`""
    if ($PrivateInput) { $response = $PrivateInput | & ssh @sshArguments $command }
    else { $response = & ssh @sshArguments $command }
    if ($LASTEXITCODE -ne 0) { throw 'Remote database tool failed.' }
    return ($response -join "`n")
}

$snapshotCode = @'
import { DatabaseSync, backup } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
process.umask(0o077);
const folder = mkdtempSync(join(tmpdir(), 'wind-release-backup-'));
const file = join(folder, 'snapshot.db');
const source = new DatabaseSync(process.env.DB_PATH, { readOnly: true });
try {
  await backup(source, file);
  source.close();
  const snapshot = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = snapshot.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok' || snapshot.prepare('PRAGMA foreign_key_check').all().length) throw Error('Snapshot integrity failed');
    const counts = Object.fromEntries(['users', 'sessions', 'orders'].map(table => [table, snapshot.prepare('SELECT COUNT(*) AS count FROM ' + table).get().count]));
    const bytes = readFileSync(file);
    console.log(JSON.stringify({ sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, counts, data: bytes.toString('base64') }));
  } finally { snapshot.close(); }
} finally {
  if (source.isOpen) source.close();
  rmSync(folder, { recursive: true, force: true });
}
'@

$restoreCode = @'
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const payload = JSON.parse(readFileSync(0, 'utf8'));
const bytes = Buffer.from(payload.data, 'base64');
assert.equal(createHash('sha256').update(bytes).digest('hex'), payload.sha256);
process.umask(0o077);
const folder = mkdtempSync(join(tmpdir(), 'wind-release-restore-'));
try {
  const file = join(folder, 'restored.db');
  writeFileSync(file, bytes, { mode: 0o600, flag: 'wx' });
  const restored = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = restored.prepare('PRAGMA integrity_check').all();
    assert.deepEqual(integrity.map(row => row.integrity_check), ['ok']);
    assert.equal(restored.prepare('PRAGMA foreign_key_check').all().length, 0);
    const counts = Object.fromEntries(['users', 'sessions', 'orders'].map(table => [table, restored.prepare('SELECT COUNT(*) AS count FROM ' + table).get().count]));
    assert.deepEqual(counts, payload.counts);
    console.log(JSON.stringify({ sha256: payload.sha256, bytes: bytes.length, counts, integrity: 'ok', foreignKeys: 0, restoreVerified: true }));
  } finally { restored.close(); }
} finally { rmSync(folder, { recursive: true, force: true }); }
'@

if ($VerifyLatest) {
    $file = Get-ChildItem -LiteralPath $OutputDirectory -Filter 'wind-azure-*.dpapi' | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $file) { throw 'No Azure snapshot exists.' }
    $destination = $file.FullName
} else {
    $privateOutput = Invoke-DatabaseTool $snapshotCode
    $payload = [Text.Encoding]::UTF8.GetBytes($privateOutput)
    $encrypted = [Security.Cryptography.ProtectedData]::Protect($payload, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
    $destination = Join-Path $OutputDirectory ('wind-azure-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssffffZ') + '.dpapi')
    [IO.File]::WriteAllBytes($destination, $encrypted)
}
$decrypted = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($destination), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
$result = Invoke-DatabaseTool $restoreCode ([Text.Encoding]::UTF8.GetString($decrypted)) | ConvertFrom-Json
$result | Add-Member -NotePropertyName file -NotePropertyValue $destination
$result | Add-Member -NotePropertyName verifiedAt -NotePropertyValue ([DateTime]::UtcNow.ToString('o'))
$result | Add-Member -NotePropertyName encryption -NotePropertyValue 'Windows DPAPI CurrentUser'
$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath ($destination + '.json')
$result | ConvertTo-Json -Depth 5
