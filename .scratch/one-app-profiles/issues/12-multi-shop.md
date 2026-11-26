# F11 · Several shops per owner

Status: needs-triage
Blocked by: 07
Risk: High (persistence, two reviewers)
Design: [docs/design/FLOWS-2026-11-26-one-app-profiles.md](../../../docs/design/FLOWS-2026-11-26-one-app-profiles.md) §9

Merchant-scoped handlers, drop single-owner uniqueness on both engines (SQLite table rebuild with the same ids), branch rows in the switcher. Start only after the pilot shows demand.

Done when the slice's A53 acceptance in §9 passes in Arabic and English, with before/after measurements under §7 and the AGENTS.md review and Docker gates.
