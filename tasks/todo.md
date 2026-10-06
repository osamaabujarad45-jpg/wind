# Todo: offer-alerts (SPEC-offer-alerts.md)

- [x] spec (measured: offer accept path queues no push; customer only polls)
- [x] server: `offer` on a first/renewed offer, `offer_accepted` to the chosen driver; urgency high, offer TTL 600 s
- [x] sw.js words (ar/en)
- [x] push-server test + 3 mutants killed
- [ ] gate: npm test, tsc, lint
- [ ] phone check (debug build, local server, real OSRM): job card road km, offer → customer list → accept, en + ar
- [ ] ship (backup, deploy, live check, push, release 28; no APK needed: sw.js and server only)
