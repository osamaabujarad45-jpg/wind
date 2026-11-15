# SCOPE audit: switched-off capabilities (15 Nov 2026)

Fable SCOPE asks that every capability the pilot keeps switched off reads as "not available in this stage" and never as a fault, while the SQLite pilot screens never call a PostgreSQL-only path.

## Method

All 34 distinct `*_unavailable` codes in `server/` were listed and matched to their copy in `src/copy.ts`. 19 already had their own ar/en text. The 15 that had none were checked against their status code, meaning and client callers.

## Findings

- Normal pilot screens (SQLite) do not call the PostgreSQL-only capabilities. Those capabilities are only reachable from their own feature-flagged paths.
- Before this change, 15 codes had no copy, so any of them showed "Something went wrong" (`err_generic`).

## Changes

1. **Stage gates (409, capability off in this deployment):** these now read "This feature is not available in this stage of Wind." through the `errorText()` fallback in `src/copy.ts`. The codes are:
   - `ledger_unavailable`
   - `payments_unavailable`
   - `quotes_unavailable`
   - `objects_unavailable`
   - `native_push_unavailable`
   - `durable_protocol_unavailable`
   - `ops_unavailable`
   - `ride_lifecycle_unavailable`
   - `opencode_unavailable`
   - `active_gps_unavailable`
2. **Codes that share the suffix but mean something else** now each have their own message:
   - `search_unavailable` is a 503: a queue limit or any search-provider error. The message says "try again in a moment".
   - `maps_unavailable` is a routing-provider outage, a missing key or a 403. The message says only "not available right now", because it may not be temporary.
   - `cod_unavailable`, `receipt_unavailable` and `custody_unavailable` are order-state conflicts: "not available for this order in its current state".
3. **Object read with missing bytes:** a scan-clean object whose stored bytes are gone used to share `objects_unavailable` with the switched-off gate. It now answers 503 `object_missing` ("cannot be opened right now, contact support").
4. **Codes that already had copy** keep it. A specific message always wins over the fallback.

## Check

`tests/error-text.test.mjs` covers ar and en:

- every `*_unavailable` code in `server/` has ar/en copy or is one of the ten listed stage gates (a scan, so a new outage code cannot fall through unnoticed);
- stage gates map to the stage message;
- the five state and outage codes keep their own text;
- known codes are unchanged;
- unknown non-gate codes fall back to the generic message.
