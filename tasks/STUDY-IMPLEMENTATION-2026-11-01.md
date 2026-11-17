# Study-based implementation — 1 November 2026

Input: `C:\UberAppKnowledge\UBER-APP-MASTER-KNOWLEDGE-2026-11-01.md`.
The study supplies architectural evidence, not Wind's business policy or access
to the studied vendor's services. The owner selected passenger rides and freight
within Wind on 1 November. Preserve existing operating and deployment gates.

Expansion child tasks (five source files maximum per slice):
6. Restrict boarding PIN serialization to the customer before boarding.
7. Connect ride arrival, boarding, grace display and dispatch retry to the client.
8. Connect leased dispatch acceptance/decline to driver jobs without price bidding.
9. Capture declared freight scope with explicit units and persist retry payloads;
   show the load contract to the customer and driver alongside existing offers.
10. Verify contracts on k5 and integrated journeys on the physical A53; document
    implemented behavior separately from production activation evidence.

1. Verify Azure/AWS identities, subscription state and existing resources — read-only.
2. Implement study §7.2 provider configuration, explicit unknown/unavailable
   results, fallback tracking and shipped-renderer constraints. Keep existing
   user opt-in and route-provenance rules.
3. Implement study §7.5 Web Mercator resolution, 512-pixel tiles, latitude clamp
   and explicit CSS/physical pixel density; use it in both MapLibre halo paths.
4. Verify focused map regressions, lint and both typechecks on k5. Physical-phone
   acceptance is distinct from helper tests and requires the attached A53.
5. Record cloud facts, evidence, scope decisions and the next implementation
   slice. No deployment, payment, new resource, commit or push is authorized by
   this checklist alone.

Cloud discovery: Azure Pay-As-You-Go Wind subscription is Enabled, spending
limit Off. Students subscription's live ARM state is Disabled despite a cached
Enabled CLI account record. Existing Wind resources include the running VM,
Container App, storage, registry and G2 Azure Maps account. AWS osama credentials
work in eu-north-1; inspected EC2/Lambda/RDS/ECS/CloudFormation/S3 lists are empty.
AWS plan API reports Missing data; paid-plan status remains unknown.

No cloud resource or live provider has been modified. No studied-vendor endpoint
is contacted. Azure Maps resource presence does not prove geographic coverage,
commercial activation, key restrictions or integration with Wind's current maps.

Provider slice: `resolveMapProvider` now accepts initial/fallback/missing policy,
returns explicit unknown/unavailable diagnostics and fallback status, and obeys
the binary's platform capabilities. Existing `selectRenderer` uses that resolver.
Unknown platforms cannot borrow the web Google capability. Focused map regression
passed on k5 before the next slice.

Projection slice: WGS-84/512-pixel resolution and Mercator clamp now drive the
accuracy halo in web and Android HTML. CSS pixels use density 1; the physical
pixel conversion is explicit. Tests include the study's A53 density fixtures,
zoom/density scaling, polar safety and exact web/Android helper parity.

Cloud preparation slice: current template already includes Key Vault database
bindings, so the historical missing-binding note is not reimplemented. Instead,
private ACR authentication is now wired explicitly for API/worker/OSRM, OSRM
receives the runtime identity, and workload dependencies wait for registry/secret
roles. This is source/compiled-template verification only, not an applied role
grant, working image pull or deployment.

Ride/freight implementation is now present: leased accept/decline/expiry with
server clock correction, explicit matching eligibility, exhausted-round retry,
arrival and passenger-only PIN, boarding lock/reasoned operator recovery,
declared freight form and immutable retry terms, load summaries and measured
capacity revision binding for direct/negotiated acceptance. Equipment controls
expose checked state; new errors have Arabic and English copy.

Remote verification complete on k5: 94 integration suites; 9 focused PostgreSQL
suites; expiry mutation rejected and restored; final presentation regression,
lint, both typechecks and web/Android/iOS exports pass. The final client-only
review changes were checked after the 94-suite run, as detailed in the report.
No dependency was added. The subsequent physical acceptance added migration 28, recorded below.

Child 10 remains partially blocked: the attached A53 is held by another device
session. The supported device command and bounded wait both returned
DEVICE_IN_USE. No other session was reused or closed, and no emulator was used.
The new phone runner is prepared and syntax/lint checked, but has not completed
physical acceptance. Resume only after the phone is available and owned by this
task's device session. Keep the test backend on loopback/adb reverse.

See `reports/study-implementation-2026-11-01.md`. Source manifest and remote logs:
`.artifacts/study-implementation-2026-11-01/`. The live Wind service set and
production dispatch/boarding gates remain unchanged; no deployment or commit.

Resumption: the owner released the prior phone session. All four prepared A53
ride/freight checks passed on the physical phone using k5 PostgreSQL, with zero
unhandled browser errors. Child 10's fixture acceptance is complete. The new
physical flow found and fixed measured freight crew handling in both the API and
SQL assignment guard; this follow-up adds migration 28 (superseding the earlier
no-migration statement). Four focused backend suites, lint and both typechecks
passed; final client gates cover the small count-label follow-up. Production
activation and genuine GPS/native background/operating evidence remain separate.

