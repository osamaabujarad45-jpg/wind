# Plan: cash-settlement

Spec: [SPEC-cash-settlement.md](../SPEC-cash-settlement.md). Previous plan (delivery-exceptions) is complete; see git history.

Graph: C1 (ledger + driver balance API) → C2 (admin remittance/adjustment + driver confirm) → C3 (UI: driver card, admin Cash tab).
Checkpoint after C2: `tests/cash.test.mjs` proves the money rules. Checkpoint after C3: test, typecheck, lint, web export.
Risk: floating-point fares (REAL) → convert once with ROUND(x*100) in SQL; never sum floats in JS.
