# Phase 0 baseline — 10 November 2026

**Phase 0 is open.** Remote integration, six browser suites and the final physical-Chrome
runner pass. Verified-source native acceptance and AWS access remain unresolved; the independent batch
review was completed after the lead takeover (below). This report records observed results, including failures. The
[execution ledger](PLAN-2026-11-10-OPEN-ITEMS.md) owns the remaining work and the
[master plan](PLAN-2026-11-10-ASTRA-6-FINISH-WIND.md) owns the release gates.

## Source and machines

- Candidate branch: `docs/phase0-ground-truth`, HEAD
  `f6fd6fff85fe3fa76bf57a90ed9201567f9e73b3`, the merge of
  [PR #20](https://github.com/osamaabujarad45-jpg/wind/pull/20).
- Baseline test source: `5da18ecfc1d0e5c0fb2e1b94b2dd21ee37f5c3a4`. `git diff --name-only`
  against candidate HEAD returned no differences in `src`, `server`, `public`, `assets`,
  `plugins`, `vendor`, `package.json`, `package-lock.json`, `app.json`, `app.config.js`,
  `eas.json`, `index.js` or either TypeScript configuration. The same comparison against
  deployed `ac531d810af9825f03ece4f1cdfbfa68bd55df03` was empty. This establishes application
  input equivalence, not a new execution of every test on the later SHA.
- Test PC: **DESKTOP-S2JKMK5**, isolated `D:\wind-plan-20261110-astra\run`, own PostgreSQL
  18.3 / PostGIS 3.6 on loopback **55493**. Lockfile SHA256:
  `65423653d8f57289be6bd022ebe11604eb9ff2aa1aae39116ca1684b20ff0ba6`.
- Physical UI target: **SM-A5360**, serial `R5CTB0FJP9Z`, attached to the owner's machine.
  Remote browser runner reaches its Chrome through CDP **9228** and the test API through
  SSH plus `adb reverse` **4188**. Native QA uses **4191**. Profile and unrelated tabs retained.
- Existing older-lineage root checkout was preserved. This batch has no application release,
  production migration, resource provisioning or deletion. Uncommitted test-runner corrections
  are identified below; they are not part of the original baseline SHA.

## Executed gates

All times below are **UTC on 10 November**. Commands ran on the test PC unless labelled CI.
Original logs under `D:\wind-plan-20261110-astra\logs`; setup records preserve an initial
null process-exit capture, followed by explicit successful PostgreSQL startup/status checks.

| Command / evidence | Time completed | Result |
|---|---|---|
| `npm run typecheck` (client and server) | 02:47 | exit 0 |
| `npm run lint` | 02:48 | exit 0 |
| PostgreSQL startup, database and PostGIS setup | 03:04 | exit 0; `integration-gates.jsonl` |
| `npm test` | 03:09 | exit 0, **129 suites passed**; `resume-integration.log` |
| `npm run test:scenarios` | 03:21 | exit 0; clear web export then journeys |
| `npm run test:location` | 03:21 | exit 0 |
| `npm run test:jobs-ui` | 03:22 | exit 0 |
| `npm run test:access` | 03:23 | exit 0 |
| `npm run test:readiness` | 03:24 | exit 0 |
| `npm run screens` | 03:32 | exit 0; **96 PNGs, 22,984,877 bytes** in that run's output (not the tracked `docs/screens` set), recovered and inspected in 12 contact sheets |
| Corrected `test:tulkarm`, Arabic / English | 06:00 / 06:01 | exit 0, **11 checks each**; `rtl-gates.json` |
| Final physical `test:android-browser` | 06:36 | exit 0, **five checks passed**; fresh typecheck/lint exit 0 at 06:35; `device5-gates.json` |
| CI on merged `f6fd6f…` | see linked run | all three jobs passed: verify, persistence and image |

CI: <https://github.com/osamaabujarad45-jpg/wind/actions/runs/42751747333>.
G2 evidence is that CI run, not an invented local persistence run. PR #20's review applies
to the merged plan; it does not review the later working-tree changes.

### Tulkarm failure and correction

The original landscape assertion assumed the English side of the screen and tested a
marker's point rather than its full visible bounds. Its failure was retained. The corrected
RTL/full-marker assertion passed both languages against reachable tunneled OSRM, with fresh
lint and both typechecks (exit 0). Corrected script SHA256:
`a0270104ee220bfa7503f3e7468b7845ba923daf3e033221b5c1c79f4c6cd4bd`.
Original: `D:\wind-plan-20261110-astra\check-tulkarm-original.mjs`.

Arabic timings (ms): map 1835, search 235, price 671, pin return 147, repeat pin 70.
English: 1596, 241, 736, 169, 69. These are this run's observations, not slow-network budgets.
Both resulting screenshots were inspected. A test correction does not count as a map fix.

### Physical Chrome attempts — preserve each result

| Attempt | Result / evidence |
|---|---|
| Initial attachment | Failed to find the exact tab: Playwright saw `chrome-error://chromewebdata/`; Chrome target metadata retained the requested URL. Exact metadata matching and reload after server start corrected attachment. |
| `device2`, 06:19 | Signup and GPU map/pickup picker passed. Request click timed out at 30 seconds with the map or **Show details** intercepting. Lint/typechecks passed. Script SHA256 `ffca228b4f8af551f548c2f438b8f18d21c61d798c28137a28ce11abc6bfe16e`; artifacts/script in `device2-evidence`. |
| `device3`, 06:28 | Explicitly opening the sheet did **not** solve booking. Same Request timeout, now **Hide details** intercepting. Signup/map passed, no page or tile errors recorded. Lint/typechecks passed. Script SHA256 `cebdfa324887d94e0bd3181a9d2fb2f39e88fb7ba83ea28c989e1c96df095e48`; artifacts/script in `device3-evidence`. |

`device4` diagnostic reproduced interception in a 2-second trial click. The keyboard left
layout height **718 px** but visual viewport height **407.4667 px** and offsetTop **310.4000 px**.
Offset-adjusted hit testing landed on **Hide details**, matching the negative trial. After
input blur, viewport height became **717.8666 px**, offsetTop **0**, and the ordinary click
worked. All five checks passed; diagnostic script, measurements and captures are in
`device4-evidence`.

**Final `device5`, 06:36 UTC:** signup, GPU pickup picker, booking/searching, Arabic map/live
marker and pinch/Recenter all passed, with no recorded page or tile-request errors. Both
typechecks and lint passed. Script SHA256:
`59f443f1a6c4c7f28ab06b58da7131adde85ccfd5fdac17ed7342ae13c446cc8`.
The final runner expands the sheet, blurs the input and waits for viewport restoration;
no force click or application layout change was used. This proves keyboard-dismissed
browser automation, not direct touchscreen booking with the keyboard open or native
keyboard-visible handover.

All three final captures were retrieved and inspected. The booking capture has partly
unpainted tiles, the searching capture has a blank map background, and the settled Arabic
map capture has roads, labels and live marker. The runner's marker assertion does not prove
the whole booking map was painted; map-ready capture/slow-data acceptance remains in rows
11 and 16. Old `a53-failure.*` and probe files still exist in the shared output directory;
they belong to archived failed/diagnostic attempts, not the successful final run.

### Native two-role acceptance

Installed customer/driver QA APKs are `1.1.0 (1)`, package IDs `ps.wind.app.testcustomer` and
`ps.wind.app.testdriver`. Pulled APK SHA256 values:

- Customer: `3fbda0c396a3927df3fb5041bd754fb716d42a18bf26df9ec369e701d445f91d`.
- Driver: `8333c2a1f9fb33c19839751b92c55ab23424452e3cb21eed3a6cdf6b90c30884`.

Embedded isolated QA configuration was verified, but installed source revision was not.
The sandbox identity repair preserved all **3 existing orders** and backups of provisioning
and login-limit state. Readiness and both installed-role logins then returned HTTP 200.
Native booking reached parcel-description validation; supported fill returned
`Ref @e38 is covered by another visible element and cannot be filled safely`. Description
remained empty; no native order was submitted by that attempt.

Verified-input customer/driver replacements built on the test PC with
`scripts/build-phone-tests.ps1`, `arm64-v8a`, scratch root `D:\wq-astra1110`, output
`D:\wind-plan-20261110-astra\phone-apks`. A session wrapper on the test PC, outside the repository (`phone-build-inputs.json` in
`D:\wind-plan-20261110-astra`), checked input hashes before and after and wrote
`source-provenance.json` only on success; the repository script itself records the lockfile and
APK hashes in `artifacts.json`. Build completed **06:35:40 UTC**; all **206** input
hashes also matched the local candidate before installation. Downloaded APK hashes matched
the artifact/provenance manifests; both `adb install -r` operations returned **Success**.

- Customer replacement SHA256: `849e77d72e48c6f1a158209f8b5b0acddfb8d298c7239b278ce21199aa9b0e00`.
- Driver replacement SHA256: `a49990bf76e6c16cd71fe3334e93fb02b13b630d1cd90ecafc5636db69458dd8`.

Artifacts: `%LOCALAPPDATA%\Temp\opencode\wind-phone-verified-20261110`.
SCP's wildcard also matched a log directory and returned `not a regular file`; all required
files arrived and were individually verified, so no build or install was repeated. The native
two-role journey with keyboard visible at handover remains pending. A browser pass cannot
replace this gate.

## Production read-only verification

- `/api/ready` returned `{"ok":true,"schema":3}`. Runtime backend **SQLite**.
- Image `windprodacr.azurecr.io/wind-api:20261109-design`; digest
  `sha256:de7a7ff4b7d3f53343ff0c3f7ba4dfd75960fa9a55eee9c44a217ac8f01b455e`;
  image revision `ac531d810af9825f03ece4f1cdfbfa68bd55df03`.
- Container and `/srv/wind-api.env` key names inspected, including `DB_PATH`,
  `WIND_TRUST_PROXY`, `WIND_PUSH_SUBJECT`; no values retained in this report.
- All four installed `/srv/` scripts exactly matched `infra/vm/` SHA256 values:

| Script | SHA256 |
|---|---|
| `deploy.sh` | `97fd73d1d7b5c78451fbf83175f646183e75e66700e7c921be69aec8b10d49ca` |
| `wind-backup.sh` | `ce6c25cec9c0f18a5ce17e32e3c3bebbeb66d2ab759395dee8436b965b9698a4` |
| `wind-restore.sh` | `e4efea9cf64952552038e6577cbadd78c377e324b0a76d1fdf5e6c7d77b55778` |
| `wind-watchdog.sh` | `4580e72ad82fc7459d7d74124bfba89c0c6924c692cb68dd862bb16e07ca6015` |

- Nightly cron is **03:10 UTC**, watchdog every minute. Backup integrity and `last-ok`
  behavior are in the installed script. Latest inspected VM/Blob object:
  `wind-20261110T031001Z.db.gz`, **10,320 bytes**, created **03:10:01 UTC**; 3,679 seconds
  old at the VM inventory. OSRM route probe and backup marker were checked successfully.
- Uptime workflow's three inspected runs passed. This proves neither alert delivery nor a
  full replacement-host restore. The documented 6 November drill remains historical evidence.

Raw retained inventory: `%LOCALAPPDATA%\Temp\opencode\wind-production-readonly-20261110.txt`.

## Cloud/cost and model evidence

[Cost model](operations/cost-model.md) records the Azure PAYG/zero-credit check, 12 resources,
actual Wind MTD **USD 36.34062** at **06:25 UTC**, regional capabilities and pricing. Selected
planning option: managed General Purpose `Standard_D2ds_v5`, PostgreSQL **18** rehearsal;
Azure PostGIS/version compatibility, server quota/deployability and full workload budget
remain open. Extra Container App still costs money; its zero-request window and empty share
file do not prove safe deletion. Container exec failed with `ClusterExecFailure` / websocket
`1011` / internal `500`.

AWS identity and plan commands returned `Your session has expired. Please reauthenticate
using 'aws login'.` No AWS inventory or plan result is claimed. Profile is `osama`, selected
Region `eu-north-1`. After owner authentication, verify with `aws sts get-caller-identity
--profile osama` and `aws freetier get-account-plan-state --profile osama` before inventory.

The ledger records completed Opus/Kimi/Sol/Mistral plan work, Terra's 47-row static review,
Step's accepted and rejected claims, and GLM's completed calibration errors. None needs
repeating merely because this session resumed. Astra 6's independent review of this batch was
blocked: the prior call returned `Unknown tool 't3-code-288933c9-c4ab-4e3b-b060-70ef82aee09e.delegate_task'`,
and discovery exposed no `delegate_task` or `orchestrator_capabilities`.

**Lead takeover, 10 November:** at the owner's instruction Claude Fable 5.2 (Claude Code) replaced
Astra 6 as lead, carried this uncommitted batch onto `origin/master` unchanged, and had it reviewed
against source by Claude Haiku 5.5 at `xhigh`. The review made 16 findings; the lead checked each in
source. Dispositions are in the ledger. The corrections changed two runner scripts after their
recorded passes above (Tulkarm label bounds; an empty-target and a sub-pixel viewport guard in the
phone runner), so the script hashes above describe the runs, not the committed files.

## Findings and next acceptance

1. Physical-Chrome diagnosis and final runner are complete; preserve both failed and passed evidence.
2. Provenance-verified replacements are installed; finish native two-role parcel acceptance.
3. Screenshots show Help promising email recovery even when sign-in offers support-only
   recovery; `src/app/help.tsx` unconditionally uses `c.a_password`. Ledger row 48 owns the fix.
4. Tall map captures and missing road fixtures remain screenshot-quality findings.
5. Reconcile costs/quota and AWS authentication; commit the factual baseline
   and ledger with their actual status. Phase 0 cannot be declared complete while these gates
   are pending. Digest-pinned deployment precedes subsequent application releases.
