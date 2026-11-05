// Extends app.json. Baseline maps are MapLibre (web/Android WebView) and Apple (iOS): a binary built without
// Google keys needs none. Google renderers are an explicit opt-in (WIND_GOOGLE_MAPS=1) that requires a
// restricted key for the platform being built; keys are written to the native manifest via the react-native-maps
// plugin only — public config (extra) carries the boolean capability, never the key strings.
const googleAndroidKey = process.env.GOOGLE_MAPS_ANDROID_KEY ?? process.env.GOOGLE_MAPS_API_KEY; // single-key name keeps existing EAS secrets working
const googleIosKey = process.env.GOOGLE_MAPS_IOS_KEY;
// A referrer-restricted browser key is public by design; it only ever reaches the web bundle, and the
// server widens its CSP for Google origins only when this same variable is configured there.
const googleBrowserKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
// Android push: an EAS file variable holding the Firebase project's google-services.json, which names only the store package.
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;

// Store builds bake EXPO_PUBLIC_API_URL into the bundle. Missing or plain http would ship an app that
// can't reach the server (release builds block cleartext), so fail the EAS build instead.
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
// Side-by-side USB test apps use disposable accounts on a loopback-only API.
// These credentials must never be bundled in an EAS/store build or sent to a public server.
const testRole = process.env.WIND_TEST_ROLE;
let phoneTest;
if (testRole) {
  if (!['customer', 'driver', 'admin'].includes(testRole)
    || process.env.WIND_LOCAL_TEST !== '1' || process.env.EAS_BUILD || process.env.WIND_RELEASE === '1') {
    throw new Error('Phone test roles require an explicitly local debug build.');
  }
  let testUrl;
  try { testUrl = new URL(apiUrl); } catch { /* rejected below */ }
  if (testUrl?.origin !== 'http://127.0.0.1:4191' || testUrl.pathname !== '/' || testUrl.search || testUrl.hash
    || testUrl.username || testUrl.password || !/^05[69]\d{7}$/.test(process.env.WIND_TEST_IDENTIFIER ?? '')
    || (process.env.WIND_TEST_PASSWORD ?? '').length < 24) {
    throw new Error('Phone tests require the isolated loopback API and provisioned synthetic credentials.');
  }
  phoneTest = { role: testRole, identifier: process.env.WIND_TEST_IDENTIFIER, password: process.env.WIND_TEST_PASSWORD };
}
const release = !!process.env.EAS_BUILD || process.env.WIND_RELEASE === '1'
  || (process.env.NODE_ENV === 'production' && process.env.WIND_LOCAL_TEST !== '1');
// T09: a Google-intended build must already hold its restricted platform key (restricted by QA package IDs
// and the release signing certificate) — an EAS build failing after assembly would be a wasted outward run.
const googleMaps = { android: !!googleAndroidKey, ios: !!googleIosKey, web: !!googleBrowserKey };
if (process.env.WIND_GOOGLE_MAPS === '1') {
  if (testRole) throw new Error('Phone test apps stay on the baseline map: Google renderers are a store-build capability.');
  const platform = process.env.EAS_BUILD_PLATFORM ?? process.env.WIND_BUILD_PLATFORM ?? null;
  const missing = (platform === 'android' ? ['android'] : platform === 'ios' ? ['ios'] : ['android', 'ios'])
    .filter(p => !googleMaps[p]);
  if (missing.length) throw new Error(`WIND_GOOGLE_MAPS=1 requires a restricted Google Maps key for the built platform (missing: ${missing.join(', ')}). Set GOOGLE_MAPS_ANDROID_KEY / GOOGLE_MAPS_IOS_KEY.`);
}
if (release) {
  let url;
  try { url = new URL(apiUrl); } catch { /* handled below */ }
  const host = url?.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const local = !host || !host.includes('.') || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::|f[cd][0-9a-f]{2}:|fe80:)/.test(host)
    || /\.(localhost|local|test|invalid|example)$/.test(host)
    || /(^|\.)example\.(com|org|net)$/.test(host);
  if (process.env.WIND_LOCAL_TEST === '1' || url?.protocol !== 'https:' || local || url.username || url.password || url.search || url.hash) {
    throw new Error('Production builds require EXPO_PUBLIC_API_URL=https://your-public-api-domain with no credentials, query or fragment. WIND_LOCAL_TEST is for local debug exports only.');
  }
}

module.exports = ({ config }) => ({
  ...config,
  ...(googleServicesFile && !phoneTest && { android: { ...config.android, googleServicesFile } }),
  ...(phoneTest && {
    name: `Wind ${testRole[0].toUpperCase() + testRole.slice(1)} Test`,
    scheme: `wind-test-${testRole}`,
    android: { ...config.android, package: `ps.wind.app.test${testRole}` },
    ios: { ...config.ios, bundleIdentifier: `ps.wind.app.test${testRole}` },
  }),
  extra: { ...config.extra, ...(phoneTest && { phoneTest }), googleMaps },
  plugins: [...config.plugins, 'expo-web-browser', 'expo-notifications',
    ['react-native-maps', { ...(googleAndroidKey && { androidGoogleMapsApiKey: googleAndroidKey }), ...(googleIosKey && { iosGoogleMapsApiKey: googleIosKey }) }],
    './plugins/with-release-guard',
    ...(phoneTest ? ['./plugins/with-phone-test'] : [])],
});
