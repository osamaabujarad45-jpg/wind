# Plan: road-aware-eta

1. `roadAlerts()` in `src/road.ts` + unit test; book.tsx uses it.
2. Order screen: poll `/roads` while ETA shows, wording `etaToPickupOpen`/`etaToDropoffOpen` + checkpoint line → Roads.
3. Checks: npm test, tsc, lint, screens; phone check against local API (adb reverse), deploy, push, ship log.
