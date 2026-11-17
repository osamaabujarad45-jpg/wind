# Cost model and funding gates

## Verified position — 10 November 2026

The production Azure subscription was verified **Enabled / PAYG**, with `spendingLimit: Off`.
The linked billing profile and the other profile inspected both showed **USD 0 current and
estimated credit**, with no pending adjustments. Fund the plan from PAYG; student credit is
not available evidence for this deployment. An enabled subscription is not a spending budget.

Cost Management `ActualCost`, `MonthToDate`, sum of `PreTaxCost`, grouped by `ResourceId`,
returned the following at **06:25 UTC**. USD, before tax, subject to billing ingestion lag;
these are incurred month-to-date amounts, not a monthly forecast or invoice.

| Wind resource | USD MTD |
|---|---:|
| Extra Container App `wind-api` | 29.44665 |
| Production VM `wind-vm` | 2.31122 |
| VM OS disk | 1.75843 |
| Registry `windprodacr` | 1.50635 |
| Public IP `wind-ip` | 1.08500 |
| Storage `windprodstore` | 0.23296 |
| Log workspace | 0.00000 |
| **Wind resource-group total (unrounded inputs)** | **36.34062** |

An earlier same-day query returned USD 35.97150, including USD 29.14695 for the extra app.
The later response supersedes that snapshot. Subscription totals include unrelated workloads;
do not attribute those costs to Wind. A missing resource row is not proof of zero future cost.

## Hosting choice and price arithmetic

**Selected for public-launch planning:** managed PostgreSQL General Purpose, initially a
two-core `Standard_D2ds_v5`, with PostgreSQL 18 as the rehearsal target. The regional
capability response lists that SKU and major. Confirm Azure's PostGIS version, all migrations,
TLS and transaction behavior before changing the template from its current PostgreSQL 16.
Microsoft currently recommends General Purpose for production and explicitly discourages
Burstable for production because exhausted CPU credits can make it unreachable. This choice
still needs quota confirmation, a workload-sized estimate and paid-resource approval.

Comparison below uses **730 hours**, Sweden Central USD retail consumption prices retrieved
10 November, one server, **32 GiB storage**, no HA and no purchased extra IOPS. These are
database compute/storage subtotals, not complete service costs or capacity guarantees.

| Option | Compute calculation | Storage calculation | USD/month subtotal | Disposition |
|---|---|---|---:|---|
| Managed B1ms, 1 core / 2 GiB RAM | 730 × 0.0199 | 32 × 0.1369 | 18.91 | Small rehearsal only; not selected for public launch |
| Managed B2s, 2 cores / 4 GiB RAM | 730 × 0.0398 | 32 × 0.1369 | 33.43 | Burstable alternative, same credit limitation |
| Managed B2ms, 2 cores / 8 GiB RAM | 730 × 0.0796 | 32 × 0.1369 | 62.49 | Burstable alternative, same credit limitation |
| **Managed D2ds_v5, 2 cores / 8 GiB RAM** | **730 × 0.187** | **32 × 0.1369** | **140.89** | **Selected planning baseline** |
| Separate Linux B2ms VM hosting PostgreSQL | 730 × 0.0864 | one P4 disk: 5.8072 | 68.88 | Operator owns patching, WAL/PITR, restore and failover; still burstable |
| PostgreSQL on the existing API/OSRM VM | No new VM meter at unchanged size | Existing disk only | No justified complete subtotal | Shared failure/memory domain; spare capacity and recovery are unproved |

The GP capability response supports 32 GiB of storage even though its default size is 64 GiB. The
32-GiB ManagedDisk tier offers only **120 IOPS**; the compute SKU's higher IOPS ceiling is
not included disk performance. Load tests decide storage/IOPS, not the lowest price. Moving
to 64 GiB adds USD 4.3808/month at this storage rate. D2ads_v5 has the same two-core retail
compute price, but the inspected capability response reports a different IOPS ceiling.

Managed backup capacity up to provisioned storage is included. At the inspected LRS excess
backup rate, add `max(backup GiB − provisioned GiB, 0) × 0.103` per month. Retention is
7–35 days; seven days is only this initial costing assumption, not an approved retention
policy. A restore creates another billable server. HA, extra storage/IOPS, restore overlap,
private DNS/networking and exports to the second cloud need their own quantities. Managed
physical backups cannot be exported to AWS; the safety-net design needs logical dumps.

### Existing runtime subtotal to retain

| Meter | Assumed quantity and inspected rate | USD/month |
|---|---|---:|
| Linux B2ts_v2 VM (API, current worker tasks, OSRM and Caddy) | 730 × 0.0108 | 7.8840 |
| Existing Premium SSD OS disk, P4 | one × 5.8072 | 5.8072 |
| Basic ACR | (730 / 24) days × 0.1666 | 5.0674 |
| Standard regional IPv4 | 730 × 0.005 | 3.6500 |
| **Known fixed subtotal** | | **22.4086** |

Adding the selected database gives **USD 163.30/month in these fixed meters only**.
The extra Container App is still provisioned and must also be included: at its current
0.5 vCPU / 1 GiB and one replica, 730 hours costs USD **11.826 idle** or **39.42 active**,
before request charges, free allowances and other meters. Thus the enumerated fixed meters
with that app retained are **USD 175.13–202.72/month**, not a ceiling or launch budget.
This current-configuration arithmetic does not explain historical app charges: earlier
configuration, replica-hours and billing lag must be reconciled before forecasting savings.

## Extra Container App: evidence before cleanup

`wind-api` is separate from the live VM: revision `wind-api--0000004`, image digest
`sha256:ae06908b32ba186ff474d7ab74dce8b970356d14e8ad4b0aab9ca8e45aa84434`, public ingress,
no custom domains, one replica, 0.5 vCPU / 1 GiB, `/data` mounted from AzureFile `winddata`.
`DB_PATH` is `/data/wind.db`. Hourly requests were zero in the inspected November 7–10
window through 05:30 UTC. The mounted share listing contained only a zero-byte `wind.db`.
Container exec connected but failed with `ClusterExecFailure`, websocket close `1011`,
internal code `500`; container contents and all historical ownership are not established.

**Recommendation:** retire this deployment after confirming dependencies, data ownership and
a recoverable configuration, then obtaining deletion authorization. Until then retain its
cost in the estimate. Zero requests and one empty file do not authorize deleting its app,
share, environment, workspace, registry or any production resource.

## Complete operating-cost worksheet

Every row below must have quantities and a dated quote/estimate before launch budgeting is
complete. A blank amount remains unknown; it never means free. Keep current VM costs and
future Container Apps scenarios distinct to avoid either omission or double counting.

| Cost category | Current planning treatment / missing quantity |
|---|---|
| API, durable worker and OSRM compute | Existing VM subtotal above; benchmark concurrency/memory. If split into Container Apps later, price each workload's min/max replicas, CPU/memory and requests separately |
| Maps data and graph refresh | Existing graph disk; size/growth, refresh/build hours, temporary disk and transfer pending. Keep existing tile-provider monitoring first; paid fallback/hosting not activated |
| PostgreSQL | Subtotals above; size, IOPS/throughput, HA, retention/WAL volume, autogrow, restore overlap and logical-dump storage/transfer pending |
| Azure Blob and Azure Files | Capacity, transactions, retention, versions/soft delete, quarantine/scan and egress; MTD charge is not a retention forecast |
| AWS safety net | Read-only inventory verified 11 Nov (`--profile osama`, project `366754056464`, Region `eu-north-1` + global/`us-east-1`): 0 S3 buckets, 0 CloudFront distributions, 0 Route 53 health checks, 0 CloudWatch alarms/log groups; MTD spend USD `0.2445671848` (USD 0 Wind). Inspected rates: S3 Standard `eu-north-1` USD `0.023/GB-month`, PUT/LIST USD `0.005/1,000`, GET USD `0.004/10,000`; Route 53 non-AWS Basic Health Check USD `0.75/month` (+USD `2.00/month` per optional feature). Retain CloudFront/egress/KMS/SNS quantities before provisioning; create nothing without paid-resource approval |
| Registry/builds | Basic unit above; retained image storage above allowance, scans, build/provenance artifacts, EAS and CI usage pending |
| Monitoring | Logs/Insights ingestion, retention, queries, external uptime checks, alert rules and delivery; current zero workspace charge is not a future allowance |
| Networking | IP above; VNet/subnets, private DNS, endpoints, NAT if used, DNS/TLS and inter-zone/region/internet traffic quantities pending |
| Realtime | Existing application path initially; Web PubSub Standard units, connections, messages, fanout and egress only if that deployment is selected |
| Identity/communications | Real SMS/voice/email provider, +970/+972 coverage, delivered messages, verification retries and support recovery; credentials/contracts and quotes pending |
| Push/maps APIs | Native/web push provider quotas and terms; paid geocoding/matrix/maps remain conditional on selected provider and measured traffic |
| Payments/refunds/payouts | Capability stays off; provider and settlement fees belong to later activation, not an invented parcel-launch charge |
| Human operation | Named support/incident coverage, courier economics, insurance, legal review, tax and staffing; cloud subtotal does not fund these automatically |

## Quotas, approval and evidence

Compute usage showed regional cores **2/10**, `standardBSFamily` **0/10**, and
`standardBsv2Family` **2 used / 0 limit**. Existing VM operation does not prove permission
to create or resize another Bsv2 VM. PostgreSQL SKU/zone/version capability is available,
but quota attempts failed: API `2026-10-01` returned `InvalidResourceType`; the suggested
`2017-12-01` returned `ResourceNotFound`. Neither compute quota nor a capability list proves
Flexible Server deployability. Confirm the selected PostgreSQL quota/capacity through Azure
support or the portal before an authorized provisioning attempt.

Before deployment, complete a dated Azure Pricing Calculator estimate with these exact
region/SKU/traffic quantities and current external-provider prices. No calculator export,
invoice, paid provisioning, migration or deletion is claimed here. Budget alerts notify;
they do not stop spend. Set workload/provider ceilings and measure actuals. Do not stop a
live database while custody or money obligations exist.

Evidence: [Phase 0 baseline](../PLAN-2026-11-10-BASELINE.md). Local retained API responses:
`wind-azure-cost-resources-20261110.json`, `wind-azure-resources-20261110.json`,
`wind-azure-postgres-prices-20261110.json`, `wind-azure-postgres-skus-20261110.json` and
`wind-azure-compute-usage-20261110.json` under `%LOCALAPPDATA%\Temp\opencode`.
Retail API: <https://prices.azure.com/api/retail/prices>, filtering `armRegionName eq
'swedencentral'`, `priceType eq 'Consumption'`, exact product/SKU and meter; exclude Windows,
Spot, Cloud Services and unrelated database products when pricing Linux VMs/Flexible Server.
Primary guidance read 10 November:
[compute](https://learn.microsoft.com/en-us/azure/postgresql/compute-storage/concepts-compute),
[backup](https://learn.microsoft.com/en-us/azure/postgresql/backup-restore/concepts-backup-restore).
