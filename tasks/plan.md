# Plan: live-map (SPEC-live-map.md)

1. L1 (server): additive columns `orders.dropoff_lat/dropoff_lng`, `driver_locations.heading/accuracy`;
   `createOrder` validates `dropoffPoint` like `pickupPoint`; `toOrder` returns `dropoffPoint` with the same
   visibility; account deletion clears it; `/api/location` accepts optional heading/accuracy; `driverLocation`
   carries them. TDD in `tests/map.test.mjs` + public track contract unchanged.
2. L2 (web map): `src/route-map.tsx` becomes a MapLibre map (dynamic `import('maplibre-gl')`, OpenFreeMap
   liberty style, ar/en labels, RTL plugin), markers for pickup/dropoff/driver, eased driver motion, heading,
   accuracy halo, fit + recenter; any load/tile failure → `RoutePreview`. Pure helpers (bounds, interpolation,
   bearing, label expression) in `src/map-math.ts`, unit-tested in `tests/model.test.mjs`-style file.
3. L3 (booking): "Set on map" for pickup and dropoff → `MapPicker` modal (web: MapLibre centre pin; iOS native:
   MapView centre pin; Android without key: hidden). Nearest-city sync. Sends `dropoffPoint`.
4. L4 (screens): order screen uses exact points + heading; driver "Navigate" to exact pickup/dropoff;
   public track page live map. Copy ar/en. Screens script refresh.
5. L5 (perf): measure initial web bundle before/after (gzip), map chunk size, tile requests per screen.

Checkpoint after each: `npm test`, `npx tsc --noEmit`, `npx expo lint`, commit.
