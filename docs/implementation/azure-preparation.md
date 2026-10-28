# Azure preparation and root verification

This is the infrastructure preparation portion of WP16, not completion of WP16 or permission to deploy. Source includes resource-group Bicep, a Container App module, dev/staging/prod examples, private evidence storage/Key Vault/PostgreSQL connectivity, retained graph storage, identities, Web PubSub Standard, registry, monitoring, budget notifications and operations runbooks. API, worker and OSRM applications default disabled. No Azure login, what-if, paid provisioning or deployment occurred.

Root recovered the draft after the worker reached its usage limit. Pinned Windows Bicep0.48.1 was downloaded from its official release with its package checksum verified by the worker. Root independently ran tests/azure-infra.test.mjs using that executable: actual compile, lint, all three parameter builds and compiled-template policy assertions pass. Artifacts use a compile-only password placeholder under ignored .expo/implementation/.

| Issue | Change | Verification |
|---|---|---|
| Generic port3000 disagreed with packaged API4000 | Explicit ingress, probes, HOST and PORT match the Docker runtime | Compiled assertions compare probes and ingress to Docker PORT |
| Polling worker could scale to zero without an activation rule | Minimum one worker/API replica when enabled; maximum one | Compiled worker parameter assertion and compiler |
| Creating an empty graph share together with OSRM prevented prior staging | Graph storage, identity mount and private connectivity exist before application activation | Compiled share/endpoint conditions; runbook requires manifest and route verification |
| Key-based SMB mount contradicted disabled shared-key access | Environment identity, scoped graph-storage role and documented SMB OAuth preview | Compiler validates schema; root read current Microsoft identity-mount and ARM references; real mount remains a staging gate |
| Compiler artifacts depended on an existing directory | Create ignored artifact directory; compile all parameter examples with a synthetic value | Actual compiler and fresh-CI-compatible script |
| Tool drift or deployment authority in CI | Version/checksum-pinned Bicep and commit-pinned actions; contents-read validation only | Workflow review and pinned version check |

Compile does not establish SKU/region/quota, Azure policy, private connectivity, identity propagation, PostGIS support, image pulls, graph mount, runtime bindings or recovery. PostgreSQL18 local evidence does not prove the template's PostgreSQL16 compatibility. Cloud activation remains blocked by the runtime production PostgreSQL gate and operational acceptance. Funded cost, authenticated what-if, fresh infrastructure restore, carrier/provider evidence and physical-device journeys remain outstanding. See the [deployment runbook](../operations/deploy.md) and its linked Microsoft references.
