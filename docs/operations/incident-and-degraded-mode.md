# Incident and degraded mode

Protect the single authoritative PostgreSQL write history. During an incident, stop new affected work through reviewed feature controls while keeping active passengers, parcels, driver obligations and support workflows recoverable. Do not shut down the database in response to a budget alert. Budget notifications alert; they do not cap or stop spend.

| Signal | Immediate operating mode | Recovery condition |
|---|---|---|
| API unavailable | Pause new bookings; support active custody from the approved recovery runbook | Readiness healthy and synthetic end-to-end validation passes |
| PostgreSQL unavailable or uncertain commit | Pause mutations; do not retry unknown writes without idempotency outcome checks | DB recovery and command/event reconciliation proven |
| Worker/outbox lag | Preserve committed rows; pause capabilities whose deadlines cannot be honored; inspect oldest event and retry class | Replay is idempotent and backlog drains within reviewed limits |
| OSRM/route data unavailable or stale | Pause new route-dependent quotes/dispatch; retain existing trip support | Versioned graph restored and local route checks pass |
| Web PubSub unavailable | Use authenticated snapshot/reconnect and existing fallback notifications; never infer ownership from realtime | Scoped realtime and snapshot reconciliation pass |
| SMS/OTP provider outage | Stop new challenges or use only an independently approved recovery path; do not restart API/DB | Provider receipts/limits restored and reconciliation succeeds |
| Blob/evidence scan outage | Quarantine uploads; do not expose unscanned evidence | Scanner/retention/access policy healthy and queued objects reviewed |
| Missed backup (`backup_stale` log, admin `attention` push) | Run `scripts/backup-azure.ps1` from the owner workstation or recover access to it; check the sealed copies in `%OneDrive%\WindBackups` | A fresh verified marker; `check-restore.mjs` passes on the newest copy |
| Budget threshold | Notify owner, inspect full service/provider meters, apply reviewed rate limits and scale bounds | Funding and cost evidence reviewed; no abrupt live-trip database shutdown |

Every response records UTC timeline, incident lead, affected service/area/cohort, customer/driver communications, custody/financial reconciliation, evidence retention decisions, recovery validation, and follow-up owner. Do not place phone numbers, precise location, evidence content, tokens or provider secrets in general logs. Numeric alert thresholds and staffed coverage are owner decisions still to be set.

## Alert ownership and service enablement (T47)

Until a staffed rota exists, every alert below goes to one responder: the owner. The owner names the address; nothing pages anyone by default.

| Alert | Raised by | Channel | Responder |
|---|---|---|---|
| Missed backup (`backup_stale`) | API hourly check of the backup marker (T46) | In-app `attention` push to active admins; Azure log alert when deployed there | Owner |
| Worker/outbox failure (`outbox_worker_failed`, `committed_effect_failed`) | API and worker logs | Azure log alert to `alertEmail` (`infra/main.bicep`), once Container Apps run | Owner |
| Email provider failure (`email_provider_failed`) | Email sender | Same | Owner |
| Maintenance sweep failure (`maintenance_failed`) | API sweeps (sessions, throttles, scheduled release, stale demand, backup check) | Same | Owner |
| Budget threshold | Azure budget (80% / 100%) and the AWS `wind-credit-burn` budget | Email to subscription owner | Owner |

The Azure rules exist only when `alertEmail` is set and workloads are enabled. On today's VM they are not deployed: there the in-app push and the logs are the only channels.

**Service enablement is parcel-first.** The API serves only the services named in `WIND_ENABLED_SERVICES`, and with it unset that is `parcel`. `infra/main.bicep` does not set it, so a Container App deployment is parcel-only. Ride and freight are enabled by an explicit environment change after their field acceptance, never by default. The live VM breaks this rule: its read-only inspection on 29 Oct found `WIND_ENABLED_SERVICES=parcel,ride,freight`. The owner should set it to `parcel` at the next deploy.

**Support contact.** Production refuses to start with an empty, example or placeholder `SUPPORT_CONTACT` (`placeholderContact`), and `npm run check:deployment -- --origin <origin>` flags one on a live origin. On 30 Oct 2026 the live VM's pages showed `+970-599-000-000`: the owner must supply the real contact before the next deploy, or that deploy will refuse to start.
