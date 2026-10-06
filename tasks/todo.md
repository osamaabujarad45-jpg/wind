# Todo: parcel-standard (SPEC-parcel-standard.md)

- [x] spec (measured: one-job rule in accept/offer/alerts/app; distance pricing; offers on parcels; location wipe)
- [x] model: parcelFare, PARCEL_LOAD, canTake + unit tests
- [x] server: accept/offer/alerts/location/no recommendation for parcels + tests/parcels.test.mjs
- [x] app: driver work list, jobs + order screens, booking standard card, admin key, driver tip
- [x] older suites updated (api, exceptions, push-server, offers → rides; cash/promo/referral/credit pinned to ₪49)
- [x] mutation checks: 6/6 killed
- [x] gate: npm test, tsc, lint
- [x] phone (A53, local server, real OSRM): 2 parcels carried → "2 orders in your care", Accept enabled, no offer, share ₪17 of ₪20, Trips lists both
- [x] screens 78 (book-parcel: "Standard parcel price")
- [x] ship (backup, deploy, live check, push, release notes; APK 1.0.9 for the driver changes)
