// Extends app.json. Android Google Maps needs a key at build time; without one the
// app falls back to the static route preview instead of crashing (see src/route-map.native.tsx).
const key = process.env.GOOGLE_MAPS_API_KEY;

// Store builds bake EXPO_PUBLIC_API_URL into the bundle. Missing or plain http would ship an app that
// can't reach the server (release builds block cleartext), so fail the EAS build instead.
const apiUrl = process.env.EXPO_PUBLIC_API_URL;
if (process.env.EAS_BUILD && !/^https:\/\//.test(apiUrl ?? '')) {
  throw new Error(`EXPO_PUBLIC_API_URL must be an https URL for EAS builds (got "${apiUrl ?? ''}"). Set it with eas env:create.`);
}

module.exports = ({ config }) => ({
  ...config,
  plugins: [...config.plugins, ['react-native-maps', { androidGoogleMapsApiKey: key }]],
  extra: { ...config.extra, androidMaps: Boolean(key) },
});
