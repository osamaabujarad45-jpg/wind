const { withAppBuildGradle, withAndroidManifest } = require('expo/config-plugins');

// Kept in a config plugin because android/ is generated and excluded from EAS uploads.
// EAS injects its managed signing config later; local releases use WIND_* upload-key variables.
const guard = String.raw`
// BEGIN WIND RELEASE GUARD
def windKeyNames = ['WIND_KEYSTORE', 'WIND_STORE_PASSWORD', 'WIND_KEY_ALIAS', 'WIND_KEY_PASSWORD']
if (windKeyNames.every { System.getenv(it) }) {
    def windSigning = android.signingConfigs.findByName('release') ?: android.signingConfigs.create('release')
    windSigning.storeFile = file(System.getenv('WIND_KEYSTORE'))
    windSigning.storePassword = System.getenv('WIND_STORE_PASSWORD')
    windSigning.keyAlias = System.getenv('WIND_KEY_ALIAS')
    windSigning.keyPassword = System.getenv('WIND_KEY_PASSWORD')
    android.buildTypes.release.signingConfig = windSigning
} else {
    android.buildTypes.release.signingConfig = null
}
gradle.taskGraph.whenReady { graph ->
    if (graph.allTasks.any { it.project == project && it.name.toLowerCase().contains('release') }) {
        def rawUrl = System.getenv('EXPO_PUBLIC_API_URL') ?: ''
        def apiUri
        try { apiUri = new URI(rawUrl) } catch (Exception ignored) { }
        def host = apiUri?.host?.toLowerCase()?.replace('[', '')?.replace(']', '') ?: ''
        def local = !host.contains('.') || host ==~ /^(localhost|127\..*|0\..*|10\..*|192\.168\..*|169\.254\..*|172\.(1[6-9]|2[0-9]|3[01])\..*|::.*|f[cd][0-9a-f]{2}:.*|fe80:.*)$/ || host ==~ /.*\.(localhost|local|test|invalid|example)$/ || host ==~ /(^|.*\.)example\.(com|org|net)$/
        if (System.getenv('WIND_LOCAL_TEST') == '1' || apiUri?.scheme != 'https' || local || apiUri.rawUserInfo || apiUri.rawQuery || apiUri.rawFragment) {
            throw new GradleException('Wind release requires a public HTTPS EXPO_PUBLIC_API_URL and forbids WIND_LOCAL_TEST.')
        }
        def signing = android.buildTypes.release.signingConfig
        if (!signing || signing == android.signingConfigs.debug || !signing.storeFile?.isFile() || !signing.storePassword || !signing.keyPassword || !signing.keyAlias || signing.keyAlias == 'androiddebugkey') {
            throw new GradleException('Wind release needs a real upload signing key. Configure EAS credentials or all four WIND_* signing variables; debug signing is forbidden.')
        }
    }
}
// END WIND RELEASE GUARD
`;

module.exports = config => withAndroidManifest(withAppBuildGradle(config, config => {
  if (config.modResults.language !== 'groovy') throw new Error('Wind release guard expects the SDK 57 Groovy Android template.');
  config.modResults.contents = config.modResults.contents.replace(/\n\/\/ BEGIN WIND RELEASE GUARD[\s\S]*?\/\/ END WIND RELEASE GUARD\n/g, '') + guard;
  return config;
}), config => {
  // No map key uses the route preview; discard metadata left by an earlier keyed prebuild.
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    for (const application of config.modResults.manifest.application ?? []) {
      if (application['meta-data']) application['meta-data'] = application['meta-data'].filter(item => item.$?.['android:name'] !== 'com.google.android.geo.API_KEY');
    }
  }
  return config;
});
