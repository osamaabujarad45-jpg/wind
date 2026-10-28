# WP14/WP15 prep: payments adapter (coded-but-off) and ops hardening

Read-only preparation. Plan sections 14 and 15. Both packets are designed so
code and tests can finish while live capability stays off behind owner gates.

## WP14: Bank of Palestine payments + merchant COD

- Adapter behind `create/query/capture/void/refund/reconcile` capabilities,
  with a documented capability matrix. Never claim preauthorization,
  marketplace split payout, or native SDK support without the merchant
  agreement. Hosted/tokenized checkout + approved deep-link return only;
  the app never stores raw card data.
- Schema: payment intents/attempts, provider request/event IDs, raw-body
  signature verification, receipt inbox dedupe, refunds/payouts/merchant
  settlement with exact money/currency and the immutable WP08 quote
  reference. Operational completion and payment capture are independent
  facts. Unknown timeout stays pending until authoritative
  query/reconciliation — never charge again blindly. Provider event order
  cannot move a payment into an invalid state; refund <= captured - prior
  refunds; payout <= cleared available entitlement.
- COD: goods value is merchant liability, separate from fare and commission.
  Record beneficiary, amount collected, custody, return/refund
  responsibility, collection limit, remittance deadline, merchant payout
  evidence. No unlicensed wallet/escrow by adding balances.
- Activation gate (owner-only, do not fake): signed merchant
  agreement/capability matrix/sandbox, approved holding/settlement
  arrangements, finance ownership, and an authorized test budget for
  controlled real settlement. Until then the adapter ships disabled with an
  injectable fake transport (WP09 Expo precedent) and every live operation
  returns a named unavailable error.
- Tests: duplicate/reordered webhook, forged signature, timeout after
  capture, repeated refund/payout, chargeback, partial collection, transport
  prepaid + goods COD, return with funds, bank mismatch, payout
  failure/reversal; books reconcile to dated provider/bank statements.

## WP15: operations, support, safety, account recovery

- Schema: scoped staff roles/permissions (dispatcher, driver reviewer,
  support, safety, finance, platform admin), cases/severity/owner/
  escalation, policy versions, staff actions/access audit, financial
  approval records. Keep existing SOS hold, disputes, support credits/chat,
  account deletion; add ownership/escalation rather than replacing them.
- Staff identity uses the workforce MFA/SSO boundary; consumer auth stays
  intact. Every sensitive action checks resource scope + named purpose.
  Dispatch override records reason + assignment history; finance actions
  cannot bypass WP13 journal invariants; evidence access is audited.
- Safety: deviation/long-stop/stale-fix is an operational signal, not proof
  of crime/fraud; context includes checkpoint conditions. An SOS entry does
  not promise police dispatch or 24/7 staffing unless the signed rota
  provides it. Emergency/support numbers are operator-validated config.
  Masked calling stays off until a tested local relay exists; AI assistance
  stays disabled for launch and can never decide fare, ledger, eligibility,
  sanctions, refunds, or emergency response.
- Tests: permission/object matrix, staff MFA/revocation, former-driver access
  after reassignment, support caller verification, malicious complaint,
  retained dispute after deletion, wrong-role refund/approval, safety hold
  during completion, false route alarm, staff-unavailable degraded mode.
  Operations sign-off of staffed coverage + a timed drill is an owner gate.
