// Extends app.json. Android Google Maps needs a key at build time; without one the
// app falls back to the static route preview instead of crashing (see src/route-map.native.tsx).
const key = process.env.GOOGLE_MAPS_API_KEY;

// Store builds bake EXPO_PUBLIC_API_URL into the bundle. Missing or plain http would ship an app that
// can't reach the server (release builds block cleartext), so fail the EAS build instead.
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
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
  plugins: [...config.plugins, ['react-native-maps', { androidGoogleMapsApiKey: key }], './plugins/with-release-guard'],
  extra: { ...config.extra, androidMaps: Boolean(key) },
});
