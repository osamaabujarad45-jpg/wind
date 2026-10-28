# Isolated PostgreSQL verification environment

Prepared 26 October 2026 for reversible local implementation tests. This is not a production database or a restore/cutover certification.

- PostgreSQL 18.3, copied from the installed binaries to ignored `.expo/implementation/postgresql18/`; the existing installation and its data directory were not changed.
- PostGIS Windows bundle 3.6.2 for PostgreSQL 18, from the [official OSGeo distribution](https://download.osgeo.org/postgis/windows/pg18/), following [PostGIS installation guidance](https://postgis.net/documentation/getting_started/install_windows/released_versions/).
- Archive SHA-256: `0f41241cc536f7404dda43fd2a3f20ffe1fa1d71a8d4f6341428cd25931bf419`. Its MD5 matched the publisher's checksum before extraction. The archive, extracted files, cluster, and logs stay under ignored `.expo/implementation/`.
- Dedicated data directory: `.expo/implementation/pgdata`; listener `127.0.0.1:55473`; synthetic role/database `fastship_test`. Trust authentication is restricted to this loopback test instance. No application accounts or customer records were imported.

Run `node scripts/local-postgres.mjs start` to initialize/start the dedicated cluster and require a working PostGIS extension. Run `node scripts/local-postgres.mjs status` to inspect it or `node scripts/local-postgres.mjs stop` to stop it while retaining test data. On another machine, set `WIND_TEST_PG_BIN` to PostgreSQL binaries with matching PostGIS installed. Missing PostGIS fails explicitly.

Test connection: `postgresql://fastship_test@127.0.0.1:55473/fastship_test`. This contains no password and is usable only against the dedicated local test instance. Never use this trust configuration in hosting templates.

Verification: initialized a fresh cluster; created the dedicated database and PostGIS extension; `postgis_version()` returned `3.6 USE_GEOS=1 USE_PROJ=1 USE_STATS=1`; stopped, restarted, and repeated the extension/status checks successfully. The launcher uses file-backed startup diagnostics to avoid a reproduced Windows inherited-pipe timeout after the detached server becomes ready.

These checks prove the local engine/extension and launcher work. Backend parity, concurrency, migration, outbox, and restore acceptance require their separate work-packet tests.
