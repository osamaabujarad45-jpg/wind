// Extends app.json. Android draws maps with MapLibre in a WebView (src/route-map.android.tsx), so no Google Maps key is needed;
// one passed here is only written to the manifest.
const key = process.env.GOOGLE_MAPS_API_KEY;

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
  ...(phoneTest && {
    name: `Wind ${testRole[0].toUpperCase() + testRole.slice(1)} Test`,
    scheme: `wind-test-${testRole}`,
    android: { ...config.android, package: `ps.wind.app.test${testRole}` },
    ios: { ...config.ios, bundleIdentifier: `ps.wind.app.test${testRole}` },
  }),
  extra: { ...config.extra, ...(phoneTest && { phoneTest }) },
  plugins: [...config.plugins, ['react-native-maps', { androidGoogleMapsApiKey: key }], './plugins/with-release-guard',
    ...(phoneTest ? ['./plugins/with-phone-test'] : [])],
});
