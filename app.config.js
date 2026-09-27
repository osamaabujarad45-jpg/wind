// Extends app.json. Android Google Maps needs a key at build time; without one the
// app falls back to the static route preview instead of crashing (see src/RouteMap.native.tsx).
const key = process.env.GOOGLE_MAPS_API_KEY;

module.exports = ({ config }) => ({
  ...config,
  plugins: [...config.plugins, ['react-native-maps', { androidGoogleMapsApiKey: key }]],
  extra: { ...config.extra, androidMaps: Boolean(key) },
});
