# Spec: safety-sos (Wind)

Module of [CAPABILITY-MAP.md](CAPABILITY-MAP.md). Approved under the standing go-ahead of 2026-10-04.

## Objective

Uber/Careem put a safety button on every live trip: one tap to emergency services, one to the
operator's safety team. Wind only had a support phone. Both sides of a trip — the customer and the
assigned driver — need this during any active order (assigned → returning).

1. **Emergency numbers (no Wind server involved):** Police 100, Ambulance (Red Crescent) 101,
   Civil Defence 102 — `tel:` links, work offline.
2. **Report to Wind safety:** kind (`unsafe_driving`, `harassment`, `accident`, `threat`, `other`)
   + optional note (≤300). The server snapshots the driver's last known location (fresh ≤ 10 min).
   A repeat report by the same person while theirs is open returns the open one (no duplicates).
3. **Order freeze:** while any report on an order is open, the driver cannot advance it
   (`409 safety_hold`) — no pickup/delivery/return can be closed out over an open safety report.
   Cancel rules are unchanged.
4. **Admin:** dashboard shortcut with the open count; Orders → "Safety" lists open reports first
   with reporter role/name/phone, the other party's phone, kind, note, age, location (opens maps)
   and the order link. Resolve needs a ≥5-char note and lifts the freeze.
5. **Privacy:** the reporter sees their own report status + resolution. The other party sees only a
   neutral "paused by Wind safety team" notice — never who reported or why. Public track page shows nothing.

## API

| Method + path | Who | Result |
|---|---|---|
| `POST /api/orders/:id/sos` `{kind, note?}` | customer or assigned driver, active order | Order (201-equivalent 200); 409 `cannot_report` otherwise |
| `GET /api/admin/incidents` | admin | open first, newest first, ≤200 |
| `POST /api/admin/incidents/:id/resolve` `{resolution}` | admin | `{ ok }`; 409 if already resolved |

Order gains `safetyHold: boolean` (parties + admin) and `safetyReport: {status, kind, resolution} | null`
(reporter only; admin sees reports via the incidents list). Stats gain `openIncidents`.

Table `safety_incidents` (additive, `user_version` stays 3); partial unique index on
`(order_id, reporter_id) WHERE status = 'open'`. Audit rows `SAFETY_REPORTED` / `SAFETY_RESOLVED`.

## UI

- Order screen (customer + assigned driver, active order): red-outlined "Safety / الأمان" card with
  three large call buttons (≥44 pt, labelled with number and service) and the report form (chips + note,
  confirm dialog). After reporting: status card with live-region announcement.
- Hold notice on the order card for both parties when `safetyHold`.
- Admin dashboard shortcut + Orders "Safety" filter.

## Testing

`tests/safety.test.mjs`: customer and driver can report; stranger/other driver 404; searching/finished 409;
invalid kind/note 400; duplicate returns same open report; advance blocked with `safety_hold` then works
after resolve; reporter sees status, other party sees only `safetyHold`; admin list contents incl. phones and
location; resolve twice 409; non-admin 403; stats count; audit rows written.

## Boundaries

- Always: emergency numbers work without the API; reporter identity hidden from the other party.
- Never: auto-cancel or auto-penalize on a report; expose reports on the public tracking link.

## Success criteria

Tests, typecheck, lint, web export pass; browser check of the safety card and admin list.
