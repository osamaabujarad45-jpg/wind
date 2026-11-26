# F5 · Become a captain and personal sign-up

Status: ready-for-agent
Blocked by: 05
Risk: High (two reviewers)
Design: [docs/design/FLOWS-2026-11-26-one-app-profiles.md](../../../docs/design/FLOWS-2026-11-26-one-app-profiles.md) §9

In-app captain application with save and resume; the design §8.5 F5 conversion with a rehearsed down-script; Approvals and the pending count read captain_profiles; admin role and status edits go through the captain profile; password, Entra and operator-CLI registration create a customer plus an application; admin vehicle/identity edits set captain_state review instead of locking the account; sign-up without role and vehicle; optional email; every sign-up that resolves to driver (registrationRole, or role alone), F4 builds included, becomes an application; F5 does not raise WIND_MIN_CLIENT_BUILD.

Done when the slice's A53 acceptance in §9 passes in Arabic and English, with before/after measurements under §7 and the AGENTS.md review and Docker gates.
