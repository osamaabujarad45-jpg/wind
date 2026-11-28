# Reconcile confirmed card captures after cash collection

Status: needs-triage

Gate before enabling any real payment provider.

- An intent is reserved while the order is payable. The provider request is pending or times out. A driver collects cash while the intent is pending. The order can then be cancelled. The provider confirms capture. Query and webhook paths refuse the capture with `settlement_conflict`. The webhook transaction can roll back the event, the intent stays pending, and refund rejects the intent as `payment_not_captured`.
- A provider can also report capture directly from create after cash collection wins the race. The create response currently marks the intent captured without the cash settlement gate, leaving both tenders standing. A late cancellation does not resolve either tender.

Keep a durable, idempotent record of every confirmed provider capture and preserve enough provider identity to reconcile and refund it. A conflicting capture needs an explicit reconciliation state that keeps the original cash receipt and prevents treating both tenders as order settlement. Cover create responses, query, webhooks, retries, cancellation, full refunds and process failure in PostgreSQL tests before any real provider is enabled.
