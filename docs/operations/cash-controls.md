# Cash adjustment and recovery contract

Status: proposed implementation policy for T23–T25; owner acceptance and live activation remain open. As of 29 Oct 2026 the adjustment handler enforces the fail-closed gate (T23): a negative adjustment books only against an approved `financial_approvals` row bound to driver and amount, decided by a finance approver other than the recording admin; backends without a usable approval table reject with `approval_unsupported`. One-time consumption and atomic approval+mutation execution are T24; the admin review/approve UI is T25.

## Units and existing invariants

Cash adjustments use integer minor units (100 = ILS 1). Preserve the current absolute per-call bound of 1,000,000 minor units and the no-negative-balance rule. A per-call cap limits an individual amount; it is not dual control, a daily allowance or protection against repeated requests. Retain separate delivery-fee, discount and goods-proceeds accounting. Never infer owed money from a map, UI subtotal or payout reference.

## Proposed forgiveness policy

Every negative adjustment that reduces a driver's debt requires a different authorized financial approver. No threshold exempts a small forgiveness. An unsupported approval backend must reject the request without changing cash balance; it must not fall back to immediate forgiveness. Positive adjustments retain the existing amount bounds and authorized/audited path, subject to separate owner policy acceptance. Real financial policy is activated only after the immutable approval/mutation implementation and reviewable configuration are accepted.

The request binds requester identity, driver, signed amount, currency, reason, unique business reference, creation time and expected balance/version. Validation happens on the server. These inputs cannot be edited after request creation; correcting them requires rejecting/cancelling that request and creating another reference. Never put passwords, tokens or private delivery notes in reasons.

## Approval and execution

The approver must still have financial authority at decision time and differ from the requester. Lock/revalidate the pending request and relevant driver balance in a consistent order. Approval decision, cash entry, immutable audit and any live journal must commit together. Use the stable business reference to guarantee one cash effect across duplicate decisions, lost responses, process restart and concurrent approvers. Rejection creates no financial effect. A client acknowledgement is not settlement authority.

Recompute amount limits, outstanding pending remittances and the no-negative-balance invariant at execution time. If the balance/version changed, fail without silently repricing the request; the operator must review a new request. Preserve the original request and any denied decision evidence. Revoked staff, self-approval, stale requests, duplicate decisions and insufficient remaining debt must have explicit fixture tests on each supported backend.

## Pending remittance recovery

Loss of the driver's device or a blocked account must not strand a pending remittance indefinitely. T25 must provide an authorized support recovery decision with immutable actor/reason/evidence and expected version. Recovery cannot bypass custody or clear debt merely to allow deletion/role changes. Reconcile the physical remittance and the cash-entry state before accepting a decision. Return disputed or uncertain money effects to a review queue; never mark them received from an unverified client claim.

## Activation evidence

Required before live activation: owner policy acceptance, supported active-backend approval persistence, HTTP tests for requester/approver separation and retries, concurrent approval/adjustment/balance-change cases, restart/recovery proof, audit and journal reconciliation, and an operator journey on the physical device. SQLite and PostgreSQL capabilities must be reported separately. T23/T24/T25 remain open while their implementation or acceptance evidence is missing.
