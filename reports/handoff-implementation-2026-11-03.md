# Fastship handoff implementation — 3 November 2026

This is the first pass's historical record. The subsequent [remaining-work completion record](handoff-completion-2026-11-03.md) supersedes its open software/cache/persistence items; hardware limits remain explicit there.

Continues `docs/HANDOFF-2026-11-02-OPUS-5.5-START-HERE.md` and the previous thread's instruction to continue without Claude agents. Work was performed directly, with no delegation, commit, push, deployment, production migration or phone-profile reset. Existing dirty work was preserved.

## Changes and focused evidence

| Issue | Exact change | Verification |
| --- | --- | --- |
| Android initial city camera could replace GPS received during loading | `src/route-map.android.tsx`: store the expected center before the loading return; retain stale-center rejection and gesture-center echo suppression. Remove the unused manual ref. | Reproduced the original lifecycle assertion on K5 before editing; the same assertion and existing gesture tests now pass. |
| Native pins had the same pre-ready race, and pending targets could block manual dragging | `src/route-map.native.tsx`, `src/google-map.native.tsx`: remember new targets before readiness, animate only when ready, and clear the pending target on an explicit pan. | Lifecycle tests cover late centers before/after readiness, rejected old completions, no feedback loop, and manual gesture recovery for both native adapters. These are controlled-hook tests, not device calibration. |
| Rebuilding a stale web driver dot as an arrow lost its fade | `src/route-map.tsx`: include `driverKey` in the effect that applies opacity and stale overlays. | Lifecycle regression rebuilds a stale marker, checks opacity `0.45`, then checks full opacity on recovery. |
| Google web heading completion depended on frame count | `src/google-map.web.tsx`: interpolate from the starting rotation using elapsed time and the existing `turn` helper; remove the duplicate turn calculation. | Two frame schedules produce the same completed heading, including the 350°→10° boundary. |
| Ready deadlines ignored runtime configuration | All route/pin map implementations and `src/google-maps-loader.ts` sample `effectiveRuntime().values.mapReadyTimeoutMs`. Android passes that value in its fragment; `public/map.html` validates the 5–30 second bounds. The Android host's timer does not restart when style loading becomes drawing. | Lifecycle and SDK-loader stubs use a non-default 7-second deadline; public-page tests cover valid bounds, strings, objects, missing values and out-of-range values. |
| Late Google SDK resolution could attach a map after timeout | `src/google-map.web.tsx`: check the failed-attempt flag before constructing the pin map. | Lifecycle regression expires the deadline before resolving the SDK and confirms that no map is created. |
| Map image grouping hid sibling controls; placement was fixed to the right | Web route maps label the map host instead of grouping the whole control container. Android removes the enclosing image group. Recenter buttons use `useCopy().rtl`; the Android page sets document direction and uses logical CSS placement. Existing translated names and 44-pixel targets remain. | Controlled English/Arabic tests check named buttons, target dimensions, mirrored placement and ungrouped web controls. TalkBack/large-text acceptance remains blocked below. |
| Picker and Android WebView missed reduced-motion preferences | `src/pin-sheet.tsx` uses the existing reduced-motion hook to disable the slide; Android passes that preference into the page; free web recentering explicitly uses zero duration when requested. | Lifecycle tests check the picker and native camera behavior; source review confirms the existing page motion predicate consumes the preference. |
| Two native effect-dependency warnings | Native target/region objects are built from the latitude/longitude fields already listed as dependencies. | Final lint has no errors or warnings; both TypeScript projects pass. |
| Remote verification lacked source files and a live PostgreSQL fixture | Complete the snapshot with Dockerfile/config plugins and test inputs; verify SHA-256 hashes; use the existing synthetic PostGIS fixture in the same SSH session as the suite. Fresh `initdb` crashes with `0xC0000005` on this host; a fixture launched in an earlier SSH session did not remain available. The evidence runner now starts/stops the existing fixture within its test session. | Snapshot verification, focused gates, exports and the final 102-suite integration gate pass; the fixture stops cleanly afterward. |

## Scope and preservation

The implementation reaches eight existing runtime files and three existing test files. There are no dependency changes, public API changes, server route changes, new billable routing calls, or token-module adoption. `canShowOnRenderer`, provider attempt fencing and `shouldReroute` remain intact.

The initial baseline, final snapshot, manifests, normalized patch and run logs are under `.artifacts/handoff-2026-11-03/`. `implementation.patch` compares this session against the preserved dirty baseline, rather than attributing all changes since HEAD to this session. `implementation-delta.json` records the eleven changed source/test files.

Heavy verification runs on K5 (`DESKTOP-NE681OS`, Node 24.12.0), in `C:/wq-handoff-20261103`, with the existing lock-compatible dependency installation at `C:/wq-audit-deps-20261101/node_modules`. The completed snapshot has 795 matching file hashes before verification. Documentation bookkeeping follows separately from the tested runtime source.

## Verification

- Original Android lifecycle failure reproduced before changes; original billing and map gates pass after adding the initially omitted Dockerfile to the remote snapshot.
- Final focused Google routing, map, lifecycle, SDK loader and map-fragment security checks pass.
- Final client/server TypeScript checks and lint pass.
- Final Android and iOS JavaScript/assets exports pass. These are not native APK/IPA builds or device acceptance.
- Final broader integration gate, including the late-SDK guard: **all 102 suites passed** on K5. Run `1793677457416`, 113,113 ms; logs show a clean synthetic PostgreSQL stop afterward.
- Final focused checks, client/server types, lint and both exports: run `1793677322592`. Its initial full-suite attempt failed because the previous SSH session's fixture was gone; the corrected full-suite run above supersedes that failure. No failed result is hidden or called a pass.
- All 517 runtime/test/configuration inputs still match the recorded source hashes after verification. Existing documentation was included in the earlier 795-file snapshot; these report/tracker updates are separate.

## Device result and remaining handoff work

The physical Samsung A53 (`R5CTB0FJP9Z`) is attached. `device_open` selected it, but app launch returned `DEVICE_IN_USE`; the supported eight-second wait returned the same error. Another session owns the phone. That session was not reused or closed, and no emulator or simulator was substituted. No physical acceptance of these source changes is claimed. No iOS device is available.

The following work remains open, rather than being declared accepted:

1. Calibrate native pin-center tolerance and any positioning deadline jointly in the renderer and sheet on a physical iOS device. Existing numeric tolerance is intentionally unchanged; the pre-ready and gesture fixes above do not close this item.
2. Verify English/Arabic map controls on the physical phone with large text, TalkBack and reduced motion.
3. Define and measure cold-start/cache acceptance before changing `/map.html` delivery or adding a versioned endpoint. Current server delivery is unchanged.
4. Run the separate full PostgreSQL persistence/legacy suite and current physical journeys before release. The integration gate includes some PostgreSQL checks but does not replace those release gates.
5. Later camera/screen/local-market improvements and polling/cursor/client-identifier API batches remain separate work, as the handoff requires. No speculative feature implementation was added to this correctness pass.

Native precision and physical accessibility acceptance are the remaining risks of this pass. No release is claimed.
