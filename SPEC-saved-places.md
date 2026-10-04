# Spec: saved-places (Wind)

Module of [CAPABILITY-MAP.md](CAPABILITY-MAP.md). Approved under the standing go-ahead of 2026-10-04.

## Objective

Uber/Careem offer Home, Work and recent places so a repeat booking is two taps. Wind makes
customers pick a city and retype a landmark every time — and Palestinian addresses *are*
landmarks ("next to Al-Manara roundabout"), so retyping is the slowest, most error-prone step.

1. **Saved places:** a customer saves a city + landmark as Home, Work or Other (max 10).
   Saving a new Home or Work replaces the old one. Saving the same city + landmark again
   just changes its label.
2. **Recent places:** the last distinct pickup/drop-off city + landmark pairs from the
   customer's own orders (up to 5, not already saved) — no setup needed.
3. **Use:** the city sheet on the booking screen lists "Your places" first; choosing one sets
   that side's city and landmark. Saved places can be deleted there.
4. **Save:** under each landmark field, "Save to my places" offers Home / Work / Other.
5. **Privacy:** places are only ever returned to their owner; account deletion removes them.

## API

| Method + path | Who | Result |
|---|---|---|
| `GET /api/me/places` | customer | `{ saved: Place[], recent: { city, note }[] }` |
| `POST /api/me/places` `{label, city, note}` | customer | `{ saved, recent }`; 409 `places_full` at 10 |
| `DELETE /api/me/places/:id` | owner | `{ saved, recent }`; 404 otherwise |

`Place = { id, label: 'home'|'work'|'other', city, note }`. Table `saved_places`
(additive; unique `(user_id, city, note)`; `user_version` stays 3). Drivers/admins: 403.

## Testing

`tests/places.test.mjs`: save/list; home replaced; relabel on same place; limit 10; invalid
label/city/empty or long note 400; other customer cannot delete (404) or see; recent from
orders excludes saved and de-duplicates; driver 403; account deletion removes places.

## Success criteria

Tests, typecheck, lint, screenshots; browser check of the sheet and save flow.
