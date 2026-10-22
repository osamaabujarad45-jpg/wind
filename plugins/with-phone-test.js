const { mkdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { AndroidConfig, withAppBuildGradle, withDangerousMod, withMainApplication } = require('expo/config-plugins');

// These apps have separate IDs and synthetic accounts. Never make the installed
// production app debuggable or relax its network policy to enable phone testing.
module.exports = config => {
  const role = process.env.WIND_TEST_ROLE;
  if (!role) return config;
  if (!['customer', 'driver', 'admin'].includes(role) || process.env.WIND_LOCAL_TEST !== '1'
      || process.env.EAS_BUILD || process.env.WIND_RELEASE === '1') {
    throw new Error('Phone test builds require a valid WIND_TEST_ROLE and WIND_LOCAL_TEST=1, outside EAS/release builds.');
  }
  let api;
  try { api = new URL(process.env.EXPO_PUBLIC_API_URL); } catch { /* rejected below */ }
  if (!api || api.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(api.hostname)
      || api.username || api.password || api.search || api.hash) {
    throw new Error('Phone test builds require a loopback HTTP API forwarded over USB.');
  }
  if (config.android?.package !== `ps.wind.app.test${role}`) {
    throw new Error('Phone test builds require a separate role-specific application ID.');
  }

  config = withAppBuildGradle(config, mod => {
    if (mod.modResults.language !== 'groovy') throw new Error('Phone test builds expect the SDK 57 Groovy template.');
    const begin = '// BEGIN WIND PHONE TEST', end = '// END WIND PHONE TEST';
    mod.modResults.contents = mod.modResults.contents
      .replace(/\n\/\/ BEGIN WIND PHONE TEST[\s\S]*?\/\/ END WIND PHONE TEST\n/g, '')
      + `\n${begin}\n// Ship a JS bundle in the Debug APK so testing does not depend on Metro.\nreact {\n    debuggableVariants = []\n    extraPackagerArgs = ["--reset-cache"]\n}\ngradle.taskGraph.whenReady { graph ->\n    if (graph.allTasks.any { it.project == project && it.name.toLowerCase().contains('release') }) {\n        throw new GradleException('Phone test apps cannot be built as Release.')\n    }\n}\n${end}\n`;
    return mod;
  });

  config = withMainApplication(config, mod => {
    if (mod.modResults.language !== 'kt') throw new Error('Phone test builds expect the SDK 57 Kotlin application template.');
    const host = /(ExpoReactHostFactory\.getDefaultReactHost\(\s*\r?\n\s*context = applicationContext,)(\s*\r?\n)/;
    if (!host.test(mod.modResults.contents)) throw new Error('Phone test builds could not locate the Expo React host.');
    mod.modResults.contents = mod.modResults.contents
      .replace(/\r?\n\s*useDevSupport = false,\s*(?=\r?\n)/g, '')
      .replace(host, '$1$2      useDevSupport = false,$2');
    return mod;
  });

  // Only the generated debug manifest refers to this policy. Even test APKs
  // permit plaintext solely to loopback; maps and tiles still use public HTTPS.
  return withDangerousMod(config, ['android', async mod => {
    const debug = join(mod.modRequest.platformProjectRoot, 'app', 'src', 'debug');
    const manifestPath = join(debug, 'AndroidManifest.xml');
    const manifest = await AndroidConfig.Manifest.readAndroidManifestAsync(manifestPath);
    AndroidConfig.Manifest.ensureToolsAvailable(manifest);
    const application = manifest.manifest.application?.[0];
    if (!application) throw new Error('Phone test debug manifest is missing its application.');
    application.$['android:usesCleartextTraffic'] = 'false';
    application.$['android:networkSecurityConfig'] = '@xml/wind_phone_test_network_security';
    application.$['tools:replace'] = [...new Set([
      ...(application.$['tools:replace'] ?? '').split(',').map(value => value.trim()).filter(Boolean),
      'android:usesCleartextTraffic', 'android:networkSecurityConfig',
    ])].join(',');
    await AndroidConfig.Manifest.writeAndroidManifestAsync(manifestPath, manifest);
    await mkdir(join(debug, 'res', 'xml'), { recursive: true });
    await writeFile(join(debug, 'res', 'xml', 'wind_phone_test_network_security.xml'),
      '<?xml version="1.0" encoding="utf-8"?>\n<network-security-config>\n'
      + '  <base-config cleartextTrafficPermitted="false" />\n'
      + '  <domain-config cleartextTrafficPermitted="true">\n'
      + '    <domain includeSubdomains="false">127.0.0.1</domain>\n'
      + '    <domain includeSubdomains="false">localhost</domain>\n'
      + '    <domain includeSubdomains="false">::1</domain>\n'
      + '  </domain-config>\n</network-security-config>\n');
    return mod;
  }]);
};
