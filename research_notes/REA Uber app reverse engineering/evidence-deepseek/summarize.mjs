import { readFileSync } from "node:fs";

const ev = JSON.parse(readFileSync(process.argv[2], "utf8"));
const r = ev.normalized_result;
const comps = r.components?.items ?? [];
const byKind = {};
for (const c of comps) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;

const exported = comps
  .filter((c) => c.exported === true)
  .map((c) => ({
    kind: c.kind,
    name: c.name,
    permission: c.permission,
    permission_source: c.permission_source,
    exported_default: c.exported_default,
    actions: c.actions,
    authorities: c.authorities,
  }));

console.log(
  JSON.stringify(
    {
      package_name: r.package_name,
      version_name: r.version_name,
      version_code: r.version_code,
      min_sdk: r.min_sdk,
      target_sdk: r.target_sdk,
      class_count: r.class_count,
      resource_count: r.resource_count,
      permission_count: r.permissions.length,
      permissions: r.permissions,
      component_total: comps.length,
      component_kinds: byKind,
      components_coverage: r.components?.status,
      exported_count: exported.length,
      exported,
      manifest_status: r.manifest?.status,
      manifest_bytes: r.manifest?.reported_total_bytes ?? r.manifest?.text?.length ?? null,
    },
    null,
    2,
  ),
);
