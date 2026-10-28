# Cost model and funding gates

This is a meter inventory, not a quote. The report's USD 38.94 figure is only one API plus B1MS PostgreSQL compute/storage subtotal; it is not a complete production estimate. Student credit is USD 100 for 12 months while eligibility continues, not monthly revenue funding. Use it for educational development/testing; use a commercially appropriate funded PAYG subscription for paid service. This is a planning distinction, not a legal interpretation of subscription terms.

Before any deployment, export a dated Azure Pricing Calculator estimate for the selected region/SKUs/traffic and add current external provider prices. No meter estimate is embedded here because quantity, quotas, retention, regional price and funded account are not established.

Include all of these cost categories:

- Separate API and durable worker Container Apps CPU, memory, requests, minimum replicas and scale bounds.
- Retained OSRM CPU/memory, durable graph file storage, graph refresh/build compute and backup/transfer.
- PostgreSQL Flexible Server compute, storage/autogrow, IOPS/throughput, HA standby, PITR retention, geo-redundancy if approved, and restore rehearsal.
- Web PubSub Standard units, concurrent connections, messages, fanout and egress.
- Private Blob capacity, transactions, lifecycle/versioning/soft delete, quarantine scan, Defender if enabled, and egress.
- Logs, Application Insights ingestion, alert rules, workspace retention and diagnostic exports.
- Registry storage, image scans, retained tags/digests and build/provenance artifacts.
- VNet, private DNS, subnets, private endpoints if used, NAT/egress, public ingress/TLS/DNS and cross-zone/region transfer.
- Paid maps/geocoding/matrix, SMS/voice/email, native/web push, payment gateway, refunds/disputes, settlement and payout fees.
- Support, tax, insurance, staffing and compliance costs outside Azure meters.

Budget alerts are notifications only, not hard spending stops. Review monthly actuals by tag and set provider/request ceilings, maximum replicas, log sampling and retention policies. Do not stop PostgreSQL while live custody or money obligations exist. No actual subscription, allowance, quota, calculator estimate, or invoice was inspected.
