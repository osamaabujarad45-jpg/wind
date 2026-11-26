# F3 · Profiles data and shadow projection

Status: ready-for-agent
Blocked by: 01 (it may run in parallel with F1 and F2; design §11 orders the merges)
Risk: High (two reviewers)
Design: [docs/design/FLOWS-2026-11-26-one-app-profiles.md](../../../docs/design/FLOWS-2026-11-26-one-app-profiles.md) §9

captain_profiles, users.captain_state, sessions.active_mode and mode_revision on SQLite and PostgreSQL (SQLite stays at user_version 3); idempotent additive backfill with one Captain-mode session per approved driver (the most recently seen; never-approved applicants stay personal) (design §8.5, F3 part; users.role and status unchanged, Approvals keep working); /me reports the shadow decision while old behavior stays live.

Done when the slice's A53 acceptance in §9 passes in Arabic and English, with before/after measurements under §7 and the AGENTS.md review and Docker gates.
