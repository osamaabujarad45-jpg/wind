# Wind release readiness — 29 October 2026

## Decision

**Not ready for a public release.** The API is reachable, but the live Azure web
bundle calls the older Railway API, the Azure VM has no road-routing provider,
Entra tenant, SMS provider or native push configuration, and the release has not
been validated end to end with real customers and drivers. A healthy endpoint or
an exported JavaScript bundle is not evidence that deliveries work in production.

The candidate in this review is based on `df43da8` plus this task's release fixes.
Another session is editing app screens and server code in the shared checkout;
those concurrent edits are not included in the isolated candidate or the results
below. Run the complete gate again on the exact combined revision before release.

## Live checks

At 02:14 UTC, the Azure VM at
`https://windapi236.swedencentral.cloudapp.azure.com` returned HTTP 200 from
`/api/health` and `/api/ready` (`schema: 3`), and 401 for unauthenticated live
tracking. The privacy, terms and account-deletion pages returned HTTP 200.
`/api/auth/options` reported open registration and `emailReset: false`.

The served web bundle contained the Railway hostname and did not contain the
Azure API hostname. `/map.html` differed from the current source after newline
normalization. `npm run check:deployment -- --origin https://windapi236.swedencentral.cloudapp.azure.com`
reports both differences as failures; its synthetic tests cover healthy and six
unavailable, stale, or cross-origin cases. A 200 response alone is not a release
check. The separate Azure Container App endpoint returned Azure's unavailable
page, so it is not a verified alternative to the VM.

Read-only VM configuration inspection found `WIND_IDENTITY_MODE=self-service`,
`WIND_ENABLED_SERVICES=parcel,ride,freight`, and no configured `OSRM_URL`, Entra
tenant, SMS provider or native-push setting. Registration therefore cannot be
described as verified phone ownership, and email-based password recovery is off.
The service scope, licensing, driver onboarding, support and recovery processes
need operational verification before exposing rides or freight to the public.
No live orders, messages or payment transactions were created for this check.

Microsoft's [routing coverage table](https://learn.microsoft.com/en-us/azure/azure-maps/routing-coverage)
does not separately list Palestine and marks real-time traffic unavailable for
Israel; actual West Bank route and address coverage must be tested before
selecting Azure Maps. The subscription's Maps resource provider was unregistered
when inspected. A replacement routing service must be tested with a representative
local route corpus and the app's checkpoint and ETA behavior.

## Changes prepared

- Fresh-checkout typechecking failed on CI because generated Expo declarations
  were absent and browser/server timer types conflicted. Typechecking now loads
  Expo's types explicitly and checks app and Node code separately. A clean
  checkout test exercises both.
- Azure validation's downloaded Bicep executable lacked execute permission in
  [the failing job](https://github.com/osama-2000236/wind/actions/runs/40785801824).
  The workflow now sets it. The pinned Linux Bicep 0.48.1 binary compiled and
  linted the template locally; the local WSL image required invariant globalization.
  The job also installs its locked dependencies because the policy test imports
  the PostgreSQL adapter, and its path filters now include those inputs.
- The Docker web build hardcoded the old Railway API and copied ignored
  `expo-env.d.ts`, which made a clean image build fail. The API URL is now a
  required build argument, the generated-file dependency is removed, and the
  web build has an adjustable heap limit with one Metro worker. The isolated
  web export contains the Azure origin and not the old Railway origin.
- EAS manages Android build numbers remotely, so the stale local `versionCode`
  was removed from `app.json`. The production build request advanced the remote
  counter to 17; build numbers already consumed by canceled or failed builds must not be
  reused. See [Expo version management](https://docs.expo.dev/build-reference/app-versions/).
- An Android preview showed recovery instructions recommending email even when
  the server had disabled email recovery. The Arabic and English phone-recovery
  notices now state only the phone-code status; the existing recovery link shows
  the available email or support path.
- `deepmerge` had an unpatched prototype-poisoning advisory. The local override
  makes destination writes safe and preserves upstream metadata. Attack and
  compatibility tests exercise Expo's actual CommonJS consumer and browser
  bundle. `npm audit --audit-level=high` passes; npm still reports seven low
  findings based on the original 4.3.1 version metadata. The advisory lists
  [no upstream patched version](https://github.com/advisories/GHSA-gcqx-w48m-w2h4).
- The Azure SQLite backup tool takes an encrypted Windows DPAPI snapshot over
  the authenticated SSH channel and verifies a restored, isolated copy. One
  snapshot was taken and independently restored: SQLite integrity was `ok`,
  foreign-key violations were zero, and user/session/order counts matched.
  An intermittent crash in the VM's synchronous pipe read was reproduced with
  synthetic data; streaming passed five repeated restore checks. Partial files
  are not published as successful backups, and the script stops before free disk
  space drops below 2 GiB. A four-hour Windows task was installed and its first
  run returned success. It requires this Windows account to be logged in and
  online, has no automatic retention or failure alert, and does not establish
  recovery of the Windows account's DPAPI keys.

## Verification and limits

The isolated candidate passed a clean `npm ci`, lint, app and server typechecks,
and 76 suites. Expo Doctor passed 21/21 checks. Android, iOS and web JavaScript
exports completed. The role/map browser scenarios passed 26 groups, the
readiness journeys passed nine groups, and the customer-location check passed;
those use isolated databases and controlled GPS/routing fixtures. A separate
local load test passed its bounded SQLite correctness and latency gates. These
checks do not prove a signed build, external provider integration or actual
driver tracking in the field.

Two EAS Android attempts failed before compilation because an isolated checkout
was nested inside a Git-ignored directory. Inspecting an archive in a standalone
directory confirmed that `package.json` and the vendored patch are included and
`node_modules` is excluded. An initial standalone Android preview built and
launched on the QA emulator; it exposed the recovery-copy issue above. A pending
production build based on that copy was canceled, and corrected
[Android preview](https://expo.dev/accounts/osamaabujarad236/projects/wind/builds/2b9312f7-3751-4faf-a663-51e4fa8380e5)
and [Android production](https://expo.dev/accounts/osamaabujarad236/projects/wind/builds/9503fcc8-c018-42bd-a02e-8141a74b867f)
builds were queued. Check their final status before treating either as an
artifact. iOS preview failed before building because suitable Apple distribution
credentials were not available in non-interactive mode. A successful EAS build
would still need device testing and store processing; see [Expo's submission
guide](https://docs.expo.dev/deploy/submit-to-app-stores/).

An image build on the small production VM first hit the Node heap limit. A later
test with a larger heap coincided with a live health-check timeout; the test was
stopped, and `/api/health` and `/api/ready` returned 200 afterwards. Do not run
resource-intensive builds on the live VM. Azure Container Registry rejected a
separate build request with `TasksOperationsNotAllowed`.

The corrected image then built successfully with local Linux Podman as local image ID
`sha256:6120a1f097ac4666dec1f0edc1b0e2ca5e142fdcc3232e60ad4f918651f7becf`.
In an isolated, network-disabled container, the candidate started against the
encrypted backup's restored database: health and readiness passed, the database
integrity and foreign-key checks passed, all recorded counts matched, the web
bundle pointed to the Azure origin and contained the corrected recovery message,
the map loaded, and unauthenticated live tracking returned 401. This smoke test
did not modify the production database.
No Azure VM metric alerts were listed in the inspected resource group; alert
routing and operational monitoring have not been verified.

Before public release, establish unattended backup monitoring and retention with
an independent key-recovery plan, activate and exercise the chosen identity, messaging, routing
and push providers, verify service licensing and support, produce and test signed
Android/iOS builds, and run a controlled customer/driver delivery with real device
background behavior. Preserve the current database and a tested rollback path.
