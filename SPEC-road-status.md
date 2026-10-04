# Spec: road-status (Wind)

Module of [CAPABILITY-MAP.md](CAPABILITY-MAP.md). Approved under the standing go-ahead of 2026-10-04.

## Objective

In the West Bank a trip's real duration is decided by checkpoints and road closures, not distance.
Local apps (Azmeh-style groups) crowd-source "open / slow / closed". Wind's ETA is straight-line × 1.3.
Give drivers and customers the latest crowd status of the checkpoints near their route.

1. **Checkpoints** are managed by administrators (name + 1–3 nearby Wind cities). No fixed list ships
   in code — operations add the ones their routes cross.
2. **Reports:** active drivers and administrators report a checkpoint as `open`, `slow` or `closed`
   with an optional note (≤120). One report per person per checkpoint per 10 minutes.
3. **Status** = the latest report within the last 2 hours, plus how many reports in that window agree
   with it; older than 2 hours → "no recent reports". Reporter identity is never shown.
4. **Where it shows:** a "Roads" screen (drivers report there; everyone signed in can read it);
   the booking screen lists checkpoints touching the pickup or drop-off city that have a recent
   `slow`/`closed` status; the driver's active job links to Roads.

## API

| Method + path | Who | Result |
|---|---|---|
| `GET /api/roads` | signed in | `[{ id, name, cities, status, note, reportedAt, agreeing }]` |
| `POST /api/roads/:id/report` `{status, note?}` | active driver, admin | updated list; 429 if within 10 min |
| `POST /api/admin/roads` `{name, cities}` | admin | updated list |
| `POST /api/admin/roads/:id/remove` | admin | updated list (soft delete) |

Tables `checkpoints`, `checkpoint_reports` (additive; `user_version` stays 3).

## Testing

`tests/roads.test.mjs`: admin create/validate/remove; customer cannot report; pending driver cannot;
driver report updates status; 10-minute limit; 2-hour expiry; agreeing count; notes trimmed; no reporter
identity in responses; removed checkpoints disappear.

## Success criteria

Tests, typecheck, lint, screenshots, browser check of Roads and the booking warning.
