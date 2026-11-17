// Wind's own file, not part of the upstream copy: route-map.tsx adds this as a module script (the page CSP allows no
// eval, so no runtime import()) and reads the library from the global once it has run. Keep it when re-vendoring.
import * as maplibregl from './maplibre-gl.mjs';
globalThis.maplibregl = maplibregl;
