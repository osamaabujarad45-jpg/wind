# WP11 prep: ride lifecycle (depends on WP10 dispatch shapes)

Read-only preparation. Plan section 11. Implementation starts after WP10's
assignment/epoch serialization is final, because arrival/start/complete must
bind to the WP10 assignment epoch and offer history.

## Current baseline (verified from source)

- Order statuses and transitions already exist (`nextStatus`,
  `activeStatuses` in `src/model.ts`, consumed in `server/main.ts`).
  `advanceOrder` (`server/main.ts` ~1682) enforces assigned-driver-only,
  `expectedStatus` match, and proof codes: recipient handover code for
  completion, sender return code for returns, 5-attempt lockout in
  `proof_attempts` with a security event + admin push on the fifth miss.
- Release before pickup exists (`POST /api/orders/:id/release`, ~1655):
  driver-only, `assigned`/`at_pickup` only, excludes the releaser via
  `order_releases`, restores the recommended price, re-broadcasts. WP10 must
  additionally start a new dispatch round/epoch here; WP11 adds the
  lifecycle-side guarantees (no custody loss).
- Safety hold (`on_hold`) and return flow (`returning`/`returned`) exist and
  advance refuses to move `on_hold` (administrator decision).

## WP11 work items (ordered)

1. **Arrival evidence:** server-confirmed arrival for rides requires a recent
   plausible driver fix near pickup (reuse active-GPS/presence freshness and
   the 70 m/s plausibility precedent) or a named, audited poor-GPS override
   (operator action with reason, recorded in `assignment_history`/security
   events — never a silent client flag). Add arrival timestamp/stage without
   changing serialized legacy statuses.
2. **Grace clock:** start the operational 5-minute grace clock only after a
   valid arrival; fees remain zero (`newWaitingFeeMinor: 0` in
   `eligibilityDefaults` — do not introduce a fee).
3. **Boarding challenge:** ride start requires the matched driver + the new
   4-digit boarding challenge for the supported protocol cohort
   (`newBoardingChallengeDigits: 4`, attempts 5,
   `futureBoardingChallengeActivated: false` — activation stays gated).
   It is a different code from the parcel handover code and the sender return
   code; existing codes must not become visible to pre-assignment drivers.
4. **Start/complete guards:** start only from the arrived stage by the current
   matched driver at the current assignment epoch; completing checks allowed
   state + current assignment. A post-start early end is explicit, preserves
   actual movement/payment outcome, and never resets to `searching`.
5. **Pre-pickup release -> redispatch:** with WP10, release creates a new
   round/epoch and excludes the previous driver; custody invariants here:
   cancellation with custody cannot orphan a parcel/return (existing
   `return_code`, attempts/lockout, original commission/cash obligations,
   duplicate return confirmation cannot double-count revenue).
6. **Tests (plan §11):** wrong driver/PIN, 5 failed attempts + recovery,
   proof replay, duplicate advance/completion/return, concurrent safety hold,
   no-GPS/manual arrival override audit, driver no-show, cancellation with
   custody, absent/refused/unreachable/wrong-address, reattempt/return
   resolution, blocked driver with cargo, returned cash/commission
   reconciliation. Rating remains completed-only; redaction/access tests
   keep passing.

## Gates / non-goals

- Photo/signature proof stays disabled (WP12 private-object release first).
- No waiting/cancellation fee is introduced in WP11.
- Active passenger transfer remains a support/consent case, not a driver
  self-service action.
