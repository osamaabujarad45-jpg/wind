[CmdletBinding()]
param(
  [ValidateSet('customer', 'driver', 'admin', 'ordinary')]
  [string[]]$Roles = @('customer', 'driver', 'admin'),
  [ValidateSet('arm64-v8a', 'x86_64')]
  [string]$Architecture = 'arm64-v8a',
  [string]$BuildRoot = 'C:\w-phone-qa-20261021',
  [string]$ProvisionPath,
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$phoneSource = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$phonePort = if ($env:WIND_PHONE_TEST_PORT) { [int]$env:WIND_PHONE_TEST_PORT } else { 4191 }
if ($phonePort -lt 1024 -or $phonePort -gt 65535) { throw 'WIND_PHONE_TEST_PORT must be a valid unprivileged TCP port.' }
$phoneSandbox = if ($phonePort -eq 4191) { 'phone-qa' } else { "phone-qa-$phonePort" }
if (!$ProvisionPath) { $ProvisionPath = Join-Path $phoneSource ".expo\$phoneSandbox\provision.json" }
if (!$OutputDirectory) { $OutputDirectory = Join-Path $phoneSource ".expo\$phoneSandbox\apks" }
$phoneBuild = [IO.Path]::GetFullPath($BuildRoot).TrimEnd('\')
# Prebuild --clean removes generated native files. Restrict that operation to a
# dedicated, short, marked scratch checkout, never the shared source workspace.
if ($phoneBuild -notmatch '^[A-Za-z]:\\(?:w-phone-qa-|wq-)[A-Za-z0-9-]+$') {
  throw 'BuildRoot must be a dedicated short path such as C:\w-phone-qa-20261021 or C:\wq-test.'
}
$phoneMarker = Join-Path $phoneBuild '.wind-phone-test-build'
if ((Test-Path -LiteralPath $phoneBuild) -and !(Test-Path -LiteralPath $phoneMarker)) {
  throw 'Refusing to reuse an unmarked existing build directory.'
}
if ((Test-Path -LiteralPath $phoneBuild) -and ((Get-Item -LiteralPath $phoneBuild).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
  throw 'BuildRoot must not be a junction or symbolic link.'
}
$phoneCredentialRoles = @($Roles | Where-Object { $_ -ne 'ordinary' })
$phoneProvision = if ($phoneCredentialRoles.Count) {
  Get-Content -LiteralPath $ProvisionPath -Raw | ConvertFrom-Json
} else {
  [pscustomobject]@{ apiUrl = "http://127.0.0.1:$phonePort" }
}
$phoneApi = $null
if (![Uri]::TryCreate([string]$phoneProvision.apiUrl, [UriKind]::Absolute, [ref]$phoneApi) -or
    $phoneApi.Scheme -ne 'http' -or $phoneApi.Host -notin @('127.0.0.1', 'localhost', '[::1]', '::1') -or
    $phoneApi.UserInfo -or $phoneApi.Query -or $phoneApi.Fragment) {
  throw 'Provisioning must target the isolated loopback HTTP API.'
}
foreach ($phoneRole in $phoneCredentialRoles) {
  $phoneAccount = $phoneProvision.roles.$phoneRole
  if (!$phoneAccount.identifier -or !$phoneAccount.password) { throw "Missing synthetic credentials for $phoneRole." }
}

New-Item -ItemType Directory -Path $phoneBuild -Force | Out-Null
Set-Content -LiteralPath $phoneMarker -Value $phoneSource -Encoding utf8
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$phoneOutput = [IO.Path]::GetFullPath($OutputDirectory)
$phoneLogs = Join-Path $phoneOutput 'logs'
New-Item -ItemType Directory -Path $phoneLogs -Force | Out-Null

# Copy only build inputs. Local databases, private files, Git state and evidence
# never enter the scratch build or the APK.
foreach ($phoneFile in @('package.json', 'package-lock.json', 'app.json', 'app.config.js', 'index.js', 'tsconfig.json')) {
  Copy-Item -LiteralPath (Join-Path $phoneSource $phoneFile) -Destination (Join-Path $phoneBuild $phoneFile) -Force
}
foreach ($phoneFolder in @('src', 'assets', 'plugins', 'modules', 'vendor', 'public')) {
  $phoneTarget = [IO.Path]::GetFullPath((Join-Path $phoneBuild $phoneFolder))
  if (!$phoneTarget.StartsWith($phoneBuild + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe build input target.' }
  if (Test-Path -LiteralPath $phoneTarget) {
    if ((Get-Item -LiteralPath $phoneTarget).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Build inputs must not be junctions.' }
    Remove-Item -LiteralPath $phoneTarget -Recurse -Force
  }
  Copy-Item -LiteralPath (Join-Path $phoneSource $phoneFolder) -Destination $phoneTarget -Recurse -Force
}

$phoneEnvNames = @('ANDROID_HOME', 'ANDROID_SDK_ROOT', 'JAVA_HOME', 'CI', 'NODE_ENV', 'EXPO_PUBLIC_API_URL',
  'WIND_LOCAL_TEST', 'WIND_TEST_ROLE', 'WIND_TEST_IDENTIFIER', 'WIND_TEST_PASSWORD', 'WIND_TEST_VERSION_CODE', 'WIND_RELEASE', 'EAS_BUILD',
  'GOOGLE_MAPS_API_KEY', 'EXPO_NO_GIT_STATUS', 'GRADLE_USER_HOME', 'CMAKE_OBJECT_PATH_MAX')
$phoneSavedEnv = @{}
foreach ($phoneEnvName in $phoneEnvNames) { $phoneSavedEnv[$phoneEnvName] = [Environment]::GetEnvironmentVariable($phoneEnvName, 'Process') }
$phoneArtifactsPath = Join-Path $phoneOutput 'artifacts.json'
$phoneArtifacts = if (Test-Path -LiteralPath $phoneArtifactsPath) { @(Get-Content -LiteralPath $phoneArtifactsPath -Raw | ConvertFrom-Json) } else { @() }
try {
  $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
  $phoneJdk = Join-Path $env:USERPROFILE 'scoop\apps\temurin17-jdk\current'
  if (Test-Path -LiteralPath (Join-Path $phoneJdk 'bin\java.exe')) { $env:JAVA_HOME = $phoneJdk }
  $env:CI = '1'
  $env:NODE_ENV = 'production'
  $env:EXPO_NO_GIT_STATUS = '1'
  # Windows MAX_PATH: the Scoop Gradle home put a prefab header past 260 characters when CMake
  # regenerated the ARM64 objects. Keep the cache on a short root; 250 leaves room for suffixes.
  $env:GRADLE_USER_HOME = Join-Path $env:SystemDrive 'wq-gradle'
  $env:CMAKE_OBJECT_PATH_MAX = '250'
  $env:EXPO_PUBLIC_API_URL = [string]$phoneProvision.apiUrl
  $env:WIND_LOCAL_TEST = '1'
  Remove-Item Env:WIND_RELEASE, Env:EAS_BUILD, Env:GOOGLE_MAPS_API_KEY -ErrorAction SilentlyContinue
  Push-Location -LiteralPath $phoneBuild
  try {
    $phoneLockHash = (Get-FileHash -LiteralPath (Join-Path $phoneBuild 'package-lock.json') -Algorithm SHA256).Hash
    $phoneInstalledLock = Join-Path $phoneBuild '.wind-phone-test-lock.sha256'
    $phoneDependenciesCurrent = (Test-Path -LiteralPath $phoneInstalledLock) -and
      ((Get-Content -LiteralPath $phoneInstalledLock -Raw).Trim() -eq $phoneLockHash)
    if (!$phoneDependenciesCurrent -or !(Test-Path -LiteralPath (Join-Path $phoneBuild 'node_modules\expo\bin\cli'))) {
      Write-Host 'Installing frozen SDK-compatible dependencies in the isolated build directory.'
      # npm writes advisories to stderr; Windows PowerShell must not turn a warning into NativeCommandError.
      $ErrorActionPreference = 'Continue'
      & npm.cmd ci --include=dev --no-audit --no-fund *> (Join-Path $phoneLogs 'dependencies.log')
      $phoneNpmExit = $LASTEXITCODE
      $ErrorActionPreference = 'Stop'
      if ($phoneNpmExit -ne 0) { throw 'Dependency installation failed; see the private build log.' }
      Set-Content -LiteralPath $phoneInstalledLock -Value $phoneLockHash -Encoding ascii
    }
    # NDK 27/CMake leaves the C++ runtime off these scratch targets; link it explicitly for local QA APKs.
    $phoneRuntimePatches = @(
      @{ File = 'react-native-worklets\android\CMakeLists.txt';
        Before = "target_link_libraries(worklets android log ReactAndroid::reactnative";
        After = "target_link_libraries(worklets android log c++_shared ReactAndroid::reactnative" },
      @{ File = 'react-native-reanimated\android\CMakeLists.txt';
        Before = "  reanimated`n  log`n  ReactAndroid::reactnative";
        After = "  reanimated`n  log`n  c++_shared`n  ReactAndroid::reactnative" },
      @{ File = 'react-native\ReactAndroid\cmake-utils\ReactNative-application.cmake';
        Before = "target_link_libraries(`${CMAKE_PROJECT_NAME}`n        fbjni";
        After = "target_link_libraries(`${CMAKE_PROJECT_NAME}`n        c++_shared`n        fbjni" },
      @{ File = 'react-native\ReactAndroid\cmake-utils\ReactNative-application.cmake';
        Before = 'target_compile_options(common_flags INTERFACE ${folly_FLAGS})';
        After = "target_compile_options(common_flags INTERFACE `${folly_FLAGS})`ntarget_link_libraries(common_flags INTERFACE c++_shared)" }
    )
    foreach ($phonePatch in $phoneRuntimePatches) {
      $phonePatchPath = Join-Path $phoneBuild "node_modules\$($phonePatch.File)"
      $phonePatchText = [IO.File]::ReadAllText($phonePatchPath).Replace("`r`n", "`n")
      if ($phonePatchText.Contains($phonePatch.After)) { continue }
      if (!$phonePatchText.Contains($phonePatch.Before)) { throw "Native runtime patch target not found: $($phonePatch.File)" }
      [IO.File]::WriteAllText($phonePatchPath, $phonePatchText.Replace($phonePatch.Before, $phonePatch.After), [Text.UTF8Encoding]::new($false))
    }
    foreach ($phoneRole in $Roles) {
      $env:WIND_TEST_ROLE = $phoneRole
      if ($phoneRole -eq 'ordinary') {
        Remove-Item Env:WIND_TEST_IDENTIFIER, Env:WIND_TEST_PASSWORD -ErrorAction SilentlyContinue
      } else {
        $env:WIND_TEST_IDENTIFIER = [string]$phoneProvision.roles.$phoneRole.identifier
        $env:WIND_TEST_PASSWORD = [string]$phoneProvision.roles.$phoneRole.password
      }
      $phoneNative = Join-Path $phoneBuild 'android'
      if ((Test-Path -LiteralPath $phoneNative) -and ((Get-Item -LiteralPath $phoneNative).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'Refusing clean prebuild through a junction.'
      }
      # Preserve task history outside android/ while CNG regenerates all native
      # sources. Otherwise every role unnecessarily recompiles every dependency.
      $phoneGradleCache = [IO.Path]::GetFullPath((Join-Path $phoneNative '.gradle'))
      $phoneGradleBackup = [IO.Path]::GetFullPath((Join-Path $phoneBuild '.wind-phone-test-gradle-cache'))
      foreach ($phoneCachePath in @($phoneGradleCache, $phoneGradleBackup)) {
        if (!$phoneCachePath.StartsWith($phoneBuild + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe Gradle cache target.' }
        if ((Test-Path -LiteralPath $phoneCachePath) -and ((Get-Item -LiteralPath $phoneCachePath).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Gradle caches must not be junctions.' }
      }
      if ((Test-Path -LiteralPath $phoneGradleCache) -and !(Test-Path -LiteralPath $phoneGradleBackup)) {
        Move-Item -LiteralPath $phoneGradleCache -Destination $phoneGradleBackup
      }
      Write-Host "Generating the $phoneRole test app."
      try {
        $ErrorActionPreference = 'Continue'
        & node (Join-Path $phoneBuild 'node_modules\expo\bin\cli') prebuild --platform android --no-install --clean *> (Join-Path $phoneLogs "$phoneRole-prebuild.log")
        $phonePrebuildExit = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
        if ($phonePrebuildExit -ne 0) { throw "$phoneRole prebuild failed; see its private build log." }
      } finally {
        if (Test-Path -LiteralPath $phoneGradleBackup) {
          if (Test-Path -LiteralPath $phoneGradleCache) { Remove-Item -LiteralPath $phoneGradleCache -Recurse -Force }
          New-Item -ItemType Directory -Path $phoneNative -Force | Out-Null
          Move-Item -LiteralPath $phoneGradleBackup -Destination $phoneGradleCache
        }
      }
      # Apply one NDK runtime rule to app and library modules before their Gradle tasks are configured.
      $phoneSettingsPath = Join-Path $phoneNative 'settings.gradle'
      $phoneSettings = [IO.File]::ReadAllText($phoneSettingsPath)
      if (!$phoneSettings.Contains('WIND_QA_CPP_RUNTIME')) {
        Add-Content -LiteralPath $phoneSettingsPath -Value @'

// WIND_QA_CPP_RUNTIME
gradle.allprojects { project ->
  project.plugins.withId('com.android.application') {
    project.android.defaultConfig.externalNativeBuild.cmake.arguments '-DCMAKE_CXX_STANDARD_LIBRARIES=-lc++_shared -latomic -lm'
  }
  project.plugins.withId('com.android.library') {
    project.android.defaultConfig.externalNativeBuild.cmake.arguments '-DCMAKE_CXX_STANDARD_LIBRARIES=-lc++_shared -latomic -lm'
  }
}
'@
      }
      Push-Location -LiteralPath $phoneNative
      try {
        # Expo 57 suppresses --reset-cache in CI. Every role gets a fresh native
        # bundle; none may reuse another export's EXPO_PUBLIC_API_URL transform.
        $env:CI = '0'
        $ErrorActionPreference = 'Continue'
        # Dedicated K5 runner: eight workers, with JVM heaps leaving room within its 8 GB RAM.
        & .\gradlew.bat :app:assembleDebug "-PreactNativeArchitectures=$Architecture" '-Dorg.gradle.jvmargs=-Xmx3g' '-Dkotlin.daemon.jvmargs=-Xmx1g' '-Dorg.gradle.priority=normal' --no-daemon --parallel --max-workers=8 *> (Join-Path $phoneLogs "$phoneRole-build.log")
        $phoneGradleExit = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
        if ($phoneGradleExit -ne 0) { throw "$phoneRole build failed; see its private build log." }
      } finally { $env:CI = '1'; Pop-Location }
      $phoneApk = Join-Path $phoneNative 'app\build\outputs\apk\debug\app-debug.apk'
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      $phoneZip = [IO.Compression.ZipFile]::OpenRead($phoneApk)
      try {
        $phoneBundle = $phoneZip.GetEntry('assets/index.android.bundle')
        if (!$phoneBundle -or $phoneBundle.Length -lt 100000) { throw 'The test APK has no embedded application bundle.' }
        $phoneEmbeddedConfig = $phoneZip.GetEntry('assets/app.config')
        if (!$phoneEmbeddedConfig) { throw 'The test APK has no embedded Expo configuration.' }
        $phoneConfigReader = [IO.StreamReader]::new($phoneEmbeddedConfig.Open())
        try { $phoneConfigValue = $phoneConfigReader.ReadToEnd() | ConvertFrom-Json } finally { $phoneConfigReader.Dispose() }
        if ($phoneConfigValue.android.package -ne "ps.wind.app.test$phoneRole") {
          throw 'The APK does not contain the expected isolated application ID.'
        }
        if ($phoneRole -eq 'ordinary') {
          if ($phoneConfigValue.extra.PSObject.Properties.Name -contains 'phoneTest') {
            throw 'The ordinary QA APK must use normal sign-in with no phoneTest data.'
          }
        } else {
          $phoneExpectedAccount = $phoneProvision.roles.$phoneRole
          if ($phoneConfigValue.extra.phoneTest.role -ne $phoneRole -or
              $phoneConfigValue.extra.phoneTest.identifier -ne $phoneExpectedAccount.identifier -or
              $phoneConfigValue.extra.phoneTest.password -ne $phoneExpectedAccount.password) {
            throw 'The APK does not contain the expected isolated role configuration.'
          }
        }
      } finally { $phoneZip.Dispose() }
      $phoneAapt = Join-Path $env:ANDROID_HOME 'build-tools\36.0.0\aapt.exe'
      $phonePackage = "ps.wind.app.test$phoneRole"
      $phoneExpectedPackage = [regex]::Escape($phonePackage)
      $ErrorActionPreference = 'Continue'
      $phoneBadging = & $phoneAapt dump badging $phoneApk 2>&1
      $phoneAaptExit = $LASTEXITCODE
      $ErrorActionPreference = 'Stop'
      if ($phoneAaptExit -ne 0 -or !($phoneBadging -match "package: name='$phoneExpectedPackage'")) { throw 'The APK application ID does not match its test role.' }
      $phoneArtifact = Join-Path $phoneOutput "wind-$phoneRole.apk"
      Copy-Item -LiteralPath $phoneApk -Destination $phoneArtifact -Force
      $phoneArtifacts = @($phoneArtifacts | Where-Object role -NE $phoneRole)
      $phoneArtifacts += [pscustomobject]@{ role = $phoneRole; package = $phonePackage; apk = $phoneArtifact; sha256 = (Get-FileHash -LiteralPath $phoneArtifact -Algorithm SHA256).Hash }
      ConvertTo-Json -InputObject @($phoneArtifacts) -Depth 4 | Set-Content -LiteralPath $phoneArtifactsPath -Encoding utf8
      Write-Host "Built $phoneRole ($phonePackage), with an embedded bundle."
    }
  } finally { Pop-Location }
} finally {
  foreach ($phoneEnvName in $phoneEnvNames) { [Environment]::SetEnvironmentVariable($phoneEnvName, $phoneSavedEnv[$phoneEnvName], 'Process') }
}
Write-Host "Phone test APKs are ready in $phoneOutput. No device or production changes were made."
