# Incident and degraded mode

Protect the single authoritative PostgreSQL write history. During an incident, stop new affected work through reviewed feature controls while keeping active passengers, parcels, driver obligations and support workflows recoverable. Do not shut down the database in response to a budget alert. Budget notifications alert; they do not cap or stop spend.

| Signal | Immediate operating mode | Recovery condition |
|---|---|---|
| API unavailable | Pause new bookings; support active custody from the approved recovery runbook | Readiness healthy and synthetic end-to-end validation passes |
| PostgreSQL unavailable or uncertain commit | Pause mutations; do not retry unknown writes without idempotency outcome checks | DB recovery and command/event reconciliation proven |
| Worker/outbox lag | Preserve committed rows; pause capabilities whose deadlines cannot be honored; inspect oldest event and retry class | Replay is idempotent and backlog drains within reviewed limits |
| OSRM/route data unavailable or stale | Pause new route-dependent quotes/dispatch; retain existing trip support | Versioned graph restored and local route checks pass |
| Map vector tiles (`tiles.openfreemap.org`) unavailable | Keep bookings open through text/place search (`TripSearch` uses Wind's local 24k place index) and `RoutePreview` route diagrams; pin confirmation stays disabled rather than confirming a blank map | Style + vector tiles load again and `ready` fires within budget |
| Web PubSub unavailable | Use authenticated snapshot/reconnect and existing fallback notifications; never infer ownership from realtime | Scoped realtime and snapshot reconciliation pass |
| SMS/OTP provider outage | Stop new challenges or use only an independently approved recovery path; do not restart API/DB | Provider receipts/limits restored and reconciliation succeeds |
| Blob/evidence scan outage | Quarantine uploads; do not expose unscanned evidence | Scanner/retention/access policy healthy and queued objects reviewed |
| Budget threshold | Notify owner, inspect full service/provider meters, apply reviewed rate limits and scale bounds | Funding and cost evidence reviewed; no abrupt live-trip database shutdown |

Every response records UTC timeline, incident lead, affected service/area/cohort, customer/driver communications, custody/financial reconciliation, evidence retention decisions, recovery validation, and follow-up owner. Do not place phone numbers, precise location, evidence content, tokens or provider secrets in general logs. Numeric alert thresholds and staffed coverage are owner decisions still to be set.
