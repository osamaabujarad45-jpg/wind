# F4 · Mode switch, switcher and switch rules

Status: ready-for-agent
Blocked by: 04
Risk: High (two reviewers)
Design: [docs/design/FLOWS-2026-11-26-one-app-profiles.md](../../../docs/design/FLOWS-2026-11-26-one-app-profiles.md) §9

Effective role in authenticate; revision fence; per-person lock across switch, go-online, accept, admin assign and ride create; POST /api/session/mode; Account switcher, identity chip, mode tabs; notifications carry their target profile; every stored-role reader in design §8.3 changed with a test; SQLite pilot enforcement (no board, alerts or GPS outside Captain mode); own-order and own-shop exclusions; one Captain-mode session per person; a sign-in never takes Captain mode from another phone; Sign out other phones (password) frees it and the job resumes on the new phone; one Online predicate (flag + active captain + no ride due within 2 hours) used by every reader; every active_mode change bumps mode_revision; WIND_MIN_CLIENT_BUILD raised with F4 and mode-owned writes without a revision header refused; expired Captain-mode rows demoted before the one-session check; switch reconciles by revision, no command id; a cold start clears Online (and retires the PostgreSQL lease); 30 minutes without activity clears Online; activity counts the board poll, the order poll and accepted location writes; Online on SQLite (sessions.captain_online_at); web push per session; new sessions of approved captains start in Captain mode, offline; subscriptions through one planFor(profile).

Done when the slice's A53 acceptance in §9 passes in Arabic and English, with before/after measurements under §7 and the AGENTS.md review and Docker gates.
