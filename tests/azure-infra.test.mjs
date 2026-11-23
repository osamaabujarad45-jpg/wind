import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const main = readFileSync(path.join(root, 'infra/main.bicep'), 'utf8');
const app = readFileSync(path.join(root, 'infra/modules/container-app.bicep'), 'utf8');
const examples = readdirSync(path.join(root, 'infra/examples')).filter((file) => file.endsWith('.bicepparam'));

assert.equal(examples.length, 3, 'dev/staging/prod parameter examples exist');
assert.match(main, /param enableWorkloads bool = false/);
assert.match(app, /NODE_ENV', value: 'production'/);
assert.doesNotMatch(`${main}\n${app}`, /NODE_ENV', value: 'test'/);
assert.match(main, /\/api\/health/);
assert.match(main, /\/api\/ready/);
assert.match(main, /server\/worker\.ts/);
assert.match(main, /osrmImageDigest/);
assert.match(main, /osrmGraphStorageGb/);
assert.match(main, /AzureFile/);
assert.match(main, /a235d3ee-5935-4cfb-8cc5-a3303ad5995e/);
assert.match(main, /require_secure_transport/);
assert.match(main, /azure\.extensions/);
assert.match(main, /postgis/);
assert.match(main, /publicNetworkAccess: 'Disabled'/);
assert.match(main, /allowBlobPublicAccess: false/);
assert.match(main, /disableLocalAuth: true/);
assert.match(main, /Microsoft\.Consumption\/budgets/);
assert.match(main, /Microsoft\.DBforPostgreSQL\/flexibleServers@2024-08-01/);
assert.match(app, /Microsoft\.App\/containerApps@2024-03-01/);
assert.match(main, /name: 'WIND_ENTRA_TENANT_NAME', value: entraTenantName/);
assert.doesNotMatch(main, /name: 'WIND_ACS_KEY', value:/, 'ACS credentials must not be plain environment values');
assert.match(main, /@secure\(\)\s*@description\('ACS access key[\s\S]*?param acsAccessKey string/);
assert.doesNotMatch(app, /param acsAccessKey|value: acsAccessKey|secretRef: 'acs-key'/);
assert.match(main, /name: 'acs-key'/);
assert.match(main, /envName: 'WIND_ACS_KEY'/);
assert.doesNotMatch(main, /postgresAdministratorPassword\s*=\s*'[^']+'/i);
assert.doesNotMatch(main, /accountKey\s*:/i);
assert.doesNotMatch(main, /DefaultEndpointsProtocol=|AccountKey=|postgres(?:ql)?:\/\/[^\s'"`$]+/i);
for (const file of examples) {
  const content = readFileSync(path.join(root, 'infra/examples', file), 'utf8');
  assert.match(content, /enableWorkloads = false/);
  assert.doesNotMatch(content, /(?:password|secret|connectionString)\s*=\s*['"][^'"]+['"]/i);
}

execFileSync('node', ['scripts/check-azure.mjs'], { cwd: root, stdio: 'inherit', env: process.env });
const compiled=JSON.parse(readFileSync(path.join(root,'.expo/implementation/azure-main.json'),'utf8'));
const backupAccess = JSON.parse(readFileSync(path.join(root, '.expo/implementation/azure-backup-access.json'), 'utf8'));
const backupRole = backupAccess.resources.find(resource => resource.type === 'Microsoft.Authorization/roleDefinitions');
assert.deepEqual(backupRole.properties.permissions, [{
  actions: [], notActions: [],
  dataActions: ['Microsoft.Storage/storageAccounts/blobServices/containers/blobs/add/action'],
  notDataActions: [],
}], 'the backup writer can create blobs without read, update, or delete permissions');
const backupGrant = backupAccess.resources.find(resource => resource.type === 'Microsoft.Authorization/roleAssignments');
assert.match(backupGrant.scope, /storageAccounts\/blobServices\/containers/);
assert.equal(backupGrant.properties.principalId, "[parameters('writerPrincipalId')]");
const backupMonitor = JSON.parse(readFileSync(path.join(root, '.expo/implementation/azure-backup-monitor.json'), 'utf8'));
const backupLogs = backupMonitor.resources.find(resource => resource.type === 'Microsoft.Insights/diagnosticSettings');
assert.deepEqual(backupLogs.properties.logs, [{ category: 'StorageWrite', enabled: true }]);
assert.equal(backupMonitor.parameters.enableBackupAlert.defaultValue, false, 'seed the workspace before validating the log query');
const freshness = backupMonitor.resources.find(resource => resource.type === 'Microsoft.Insights/scheduledQueryRules');
assert.equal(freshness.condition, "[parameters('enableBackupAlert')]");
assert.equal(freshness.properties.overrideQueryTimeRange, 'PT3H');
assert.equal(freshness.properties.skipQueryValidation, false);
assert.deepEqual(freshness.properties.actions.actionGroups, ["[variables('alertActionGroup')]"]);
assert.match(backupMonitor.variables.alertActionGroup, /fail\('An action group is required/);
const [backupCriterion] = freshness.properties.criteria.allOf;
assert.equal(backupCriterion.metricMeasureColumn, 'SuccessfulBackups');
assert.deepEqual([backupCriterion.operator, backupCriterion.threshold], ['LessThan', 1]);
assert.match(backupMonitor.variables.freshnessQuery, /StorageBlobLogs.*RequesterObjectId.*summarize SuccessfulBackups = count\(\)/s);
for (const name of ['accountLiteral', 'pathLiteral', 'uploaderLiteral']) {
  assert.ok(backupMonitor.variables.freshnessQuery.includes(`variables('${name}')`), `the compiled query binds ${name}`);
}
const availability = JSON.parse(readFileSync(path.join(root, '.expo/implementation/azure-api-availability.json'), 'utf8'));
const readinessTest = availability.resources.find(resource => resource.type.toLowerCase() === 'microsoft.insights/webtests');
assert.equal(readinessTest.kind, 'standard');
assert.equal(readinessTest.properties.Request.RequestUrl, "[parameters('readinessUrl')]");
assert.equal(readinessTest.properties.ValidationRules.SSLCheck, true);
assert.equal(readinessTest.properties.ValidationRules.ContentValidation.ContentMatch, '"ok":true');
const outage = availability.resources.find(resource => resource.type === 'Microsoft.Insights/metricAlerts');
assert.equal(outage.properties.criteria.failedLocationCount, 2);
assert.equal(readinessTest.properties.Locations.length, 3);
assert.equal(outage.properties.actions[0].actionGroupId, "[parameters('actionGroupResourceId')]");
const deployment=name=>compiled.resources.find(resource=>resource.type==='Microsoft.Resources/deployments' && resource.name===name);
const api=deployment('api').properties.parameters,worker=deployment('worker').properties.parameters;
assert.equal(api.minReplicas.value, 1, 'process-local quota and presence state still require one API replica');
assert.equal(api.maxReplicas.value, 1, 'scale-out stays blocked until shared quota/presence state exists');
const workloadCondition = "[variables('workloadsEnabled')]";
const privateNetworkingCondition = "[parameters('enablePrivateServiceNetworking')]";
assert.match(compiled.variables.workloadsEnabled,
  /if\(not\(parameters\('enableWorkloads'\)\), false\(\), if\(and\(equals\(parameters\('environment'\), 'staging'\), parameters\('enablePrivateServiceNetworking'\)\), true\(\), fail\(/,
  'activating workloads outside private staging fails evaluation');
assert.equal(compiled.parameters.enablePrivateServiceNetworking.defaultValue, false, 'private networking is an explicit staging rollout');
const registeredShares = compiled.resources.filter(resource => resource.type === 'Microsoft.App/managedEnvironments/storages');
assert.equal(registeredShares.length, 2);
assert.ok(registeredShares.every(resource => resource.condition === privateNetworkingCondition),
  'the environment registers its shares only after private connectivity can be prepared');
const registry = compiled.resources.find(resource => resource.type === 'Microsoft.ContainerRegistry/registries');
assert.match(registry.sku.name, /enablePrivateServiceNetworking.*'Premium'.*'Basic'/, 'private ACR endpoints require Premium');
assert.match(registry.properties.publicNetworkAccess, /enablePrivateServiceNetworking.*'Disabled'.*'Enabled'/);
assert.match(registry.properties.networkRuleBypassOptions, /enablePrivateServiceNetworking.*'None'.*'AzureServices'/);
const pubsub = compiled.resources.find(resource => resource.type === 'Microsoft.SignalRService/webPubSub');
assert.match(pubsub.properties.publicNetworkAccess, /enablePrivateServiceNetworking.*'Disabled'.*'Enabled'/);
for (const group of ['registry', 'webpubsub']) {
  const endpoint = compiled.resources.find(resource => resource.type === 'Microsoft.Network/privateEndpoints'
    && resource.properties.privateLinkServiceConnections.some(connection => connection.properties.groupIds.includes(group)));
  assert.ok(endpoint, `${group} has a private endpoint`);
  assert.equal(endpoint.condition, privateNetworkingCondition, `${group} networking can be bootstrapped before workloads`);
  const zoneGroup = compiled.resources.find(resource => resource.type === 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups'
    && resource.properties.privateDnsZoneConfigs.some(config => config.name === group));
  assert.equal(zoneGroup?.condition, privateNetworkingCondition, `${group} DNS follows the endpoint gate`);
  assert.ok(zoneGroup.dependsOn.some(dependency => dependency.includes('virtualNetworkLinks')), `${group} DNS waits for its VNet link`);
}
for (const workload of [deployment('api'), deployment('worker'), compiled.resources.find(resource => resource.type === 'Microsoft.App/containerApps')]) {
  assert.equal(workload.condition, workloadCondition, 'all three workloads enforce the staging gate');
  assert.ok(workload.dependsOn.some(dependency => dependency.includes('registry-pe') && dependency.includes('privateDnsZoneGroups')), 'private image pulls wait for ACR DNS');
}
assert.match(main, /privatelink\.azurecr\.io/);
assert.match(main, /privatelink\.webpubsub\.azure\.com/);
const osrmAccount = compiled.resources.find(resource => resource.type === 'Microsoft.Storage/storageAccounts'
  && JSON.stringify(resource.tags ?? {}).includes('retained-osrm-graph'));
assert.equal(osrmAccount.properties.publicNetworkAccess, 'Disabled');
assert.equal(osrmAccount.properties.networkAcls.defaultAction, 'Deny');
assert.deepEqual(osrmAccount.properties.networkAcls.virtualNetworkRules, []);
const docker=readFileSync(path.join(root,'Dockerfile'),'utf8');
const runtimePort=Number(/ENV NODE_ENV=production[^\n]*\bPORT=(\d+)/.exec(docker)[1]);
assert.equal(api.ingressPort.value,runtimePort,'Cloud ingress matches the packaged API port');
assert.equal(api.environmentVariables.value.find(entry=>entry.name==='PORT').value,String(runtimePort));
assert.equal(api.environmentVariables.value.find(entry=>entry.name==='HOST').value,'0.0.0.0');
assert.ok(api.probes.value.every(probe=>probe.httpGet.port===runtimePort),'Health probes use the listening port');
assert.equal(worker.minReplicas.value,1,'A polling worker without an event scaler cannot scale to zero');
assert.equal(compiled.parameters.enableWorkloads.defaultValue,false);
assert.ok(deployment('api').condition && deployment('worker').condition,'Workloads retain the activation gate');
const graphShare=compiled.resources.find(resource=>resource.type==='Microsoft.Storage/storageAccounts/fileServices/shares');
assert.ok(graphShare && !graphShare.condition,'The graph share exists before enabling its application');
const graphEndpoint=compiled.resources.find(resource=>resource.type==='Microsoft.Network/privateEndpoints'
  && resource.properties.privateLinkServiceConnections.some(connection=>connection.properties.groupIds.includes('file')));
assert.equal(graphEndpoint?.condition, privateNetworkingCondition, 'File endpoint can be enabled during private bootstrap');
for (const resource of compiled.resources.filter(resource =>
  (resource.type === 'Microsoft.Network/privateDnsZones' && String(resource.name).includes('fileDnsZoneName')) ||
  (resource.type === 'Microsoft.Network/privateDnsZones/virtualNetworkLinks' && String(resource.name).includes('fileDnsZoneName')) ||
  (resource.type === 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups' && String(resource.name).includes('osrm-file-pe')))) {
  assert.equal(resource.condition, privateNetworkingCondition, 'File DNS follows the File endpoint');
}
const fileZone = compiled.resources.find(resource => resource.type === 'Microsoft.Network/privateDnsZones' && String(resource.name).includes('fileDnsZoneName'));
const fileLink = compiled.resources.find(resource => resource.type === 'Microsoft.Network/privateDnsZones/virtualNetworkLinks' && String(resource.name).includes('fileDnsZoneName'));
const fileGroup = compiled.resources.find(resource => resource.type === 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups' && String(resource.name).includes('osrm-file-pe'));
assert.ok(fileZone && fileLink && fileGroup, 'File zone, link and zone group are present');
assert.ok(fileGroup.dependsOn.some(dependency => dependency.includes('virtualNetworkLinks')), 'private File DNS waits for its VNet link');
assert.ok(deployment('api').dependsOn.some(dependency => dependency.includes('wind-data') && dependency.includes('managedEnvironments/storages')),
  'the app waits for the environment to register its volume');
assert.match(compiled.variables.checkedImage, /apiImagePinned.*fail\('imageDigest must pin/);
assert.match(compiled.variables.checkedOsrmImage, /osrmImagePinned.*fail\('osrmImageDigest must pin/);
assert.match(compiled.variables.validImageHashes, /64.*0123456789abcdef/);
assert.match(compiled.variables.apiImageParts, /@sha256:/);
assert.match(compiled.variables.osrmImageParts, /@sha256:/);
assert.match(compiled.variables.apiImagePinned, /validImageHashes.*\[0\]/);
assert.match(compiled.variables.osrmImagePinned, /validImageHashes.*\[1\]/);
assert.match(compiled.variables.checkedPushSubject, /pushSubject is required/);
assert.match(compiled.outputs.imageValidation.value, /checkedImage/);
const paramFile = path.join(root, '.expo/implementation/wp16-enabled.bicepparam');
writeFileSync(paramFile, `using '../../infra/main.bicep'\nparam prefix = 'fsstage'\nparam environment = 'staging'\nparam postgresAdministratorPassword = 'compile-only-not-a-secret'\nparam enableWorkloads = true\nparam enablePrivateServiceNetworking = true\nparam imageDigest = 'registry.example/api@sha256:${'a'.repeat(64)}'\nparam osrmImageDigest = 'registry.example/osrm@sha256:${'b'.repeat(64)}'\n`);
const bicep = process.env.BICEP_COMMAND || 'az';
const prefix = bicep === 'az' ? ['bicep'] : [];
execFileSync(bicep, [...prefix, 'build-params', ...(bicep === 'az' ? ['--file', paramFile] : [paramFile]), '--outfile', path.join(root, '.expo/implementation/wp16-enabled.parameters.json')], { cwd: root, stdio: 'inherit', env: process.env, shell: process.platform === 'win32' && !bicep.toLowerCase().endsWith('.exe') });
const enabled = JSON.parse(readFileSync(path.join(root, '.expo/implementation/wp16-enabled.parameters.json'), 'utf8')).parameters;
assert.equal(enabled.enableWorkloads.value, true);
assert.equal(enabled.enablePrivateServiceNetworking.value, true);
assert.ok(enabled.imageDigest.value && enabled.osrmImageDigest.value);
const apiEnv = Object.fromEntries(api.environmentVariables.value.map(entry => [entry.name, entry]));
for (const name of ['SUPPORT_CONTACT', 'WIND_IDENTITY_MODE', 'OSRM_URL', 'DB_PATH', 'WIND_PUSH_SUBJECT']) {
  assert.ok(typeof apiEnv[name]?.value === 'string' && apiEnv[name].value.length > 0, `${name} must render non-empty`);
}
assert.ok(api.keyVaultSecrets.value.some(secret => secret.name === 'database-url' && secret.envName === 'WIND_DATABASE_URL' && secret.keyVaultUrl.includes('secrets/database-url')));
const acsSecret = api.keyVaultSecrets.value.find(secret => secret.envName === 'WIND_ACS_KEY');
assert.equal(acsSecret.enabled, "[parameters('enableAcs')]");
assert.match(acsSecret.keyVaultUrl, /secrets\/acs-key'/, 'the app follows the versionless Key Vault key');
assert.match(acsSecret.keyVaultUrl, /reference\(.*acs-key.*\)\.secretUri/, 'without a bootstrap key, the deployment checks the existing secret before starting the app');
assert.equal(compiled.parameters.acsAccessKey.type, 'securestring');
assert.ok(!Object.hasOwn(api, 'acsAccessKey'), 'the ACS access key does not enter the app module');
assert.ok(deployment('api').dependsOn.some(dependency => dependency.includes('acs-key')), 'the app waits for a key seeded by this deployment');
assert.equal(apiEnv.DB_PATH.value, '/data/wind.db');
assert.equal(api.volumeMountPath.value, '/data');
assert.equal(api.storageName.value, 'wind-data');
assert.ok(api.keyVaultSecrets.value.some(secret => secret.name === 'database-url' && secret.keyVaultUrl.includes('secrets/database-url')));
assert.ok(deployment('worker').properties.parameters.keyVaultSecrets.value.some(secret => secret.envName === 'WIND_DATABASE_URL'), 'The worker receives the same gated database binding');
const vaultSecret = compiled.resources.find(resource => resource.type === 'Microsoft.KeyVault/vaults/secrets');
assert.ok(vaultSecret && String(vaultSecret.name).includes('database-url'), 'The database URL is stored in Key Vault');
assert.ok(compiled.resources.some(resource => resource.type === 'Microsoft.Authorization/roleAssignments'
  && String(resource.properties.roleDefinitionId).includes('7f951dda-4ed3-4680-a7ca-43fe172d538d')), 'The runtime identity can pull the reviewed image');
assert.ok(compiled.resources.some(resource => resource.type === 'Microsoft.Authorization/roleAssignments'
  && String(resource.properties.roleDefinitionId).includes('4633458b-17de-408a-b874-0445c86b69e6')), 'The runtime identity can read the database secret');
// An AcrPull grant alone cannot authenticate an image pull. All three workloads
// must explicitly choose the registry and the same assigned runtime identity.
for (const name of ['api', 'worker']) {
  const module = deployment(name);
  assert.match(module.properties.parameters.registryServer.value, /loginServer/, `${name} binds the actual registry hostname`);
  const workload = module.properties.template.resources.find(resource => resource.type === 'Microsoft.App/containerApps');
  assert.match(JSON.stringify(workload.properties.configuration), /registryServer/);
  assert.match(JSON.stringify(workload.properties.configuration), /identityId/);
  assert.ok(module.dependsOn.some(dependency => dependency.includes('7f951dda-4ed3-4680-a7ca-43fe172d538d')), `${name} waits for AcrPull`);
  assert.ok(module.dependsOn.some(dependency => dependency.includes('4633458b-17de-408a-b874-0445c86b69e6')), `${name} waits for secret access`);
}
const osrmWorkload = compiled.resources.find(resource => resource.type === 'Microsoft.App/containerApps');
assert.equal(osrmWorkload.identity.type, 'UserAssigned', 'OSRM has the identity used for private image authentication');
assert.equal(osrmWorkload.properties.configuration.registries.length, 1);
assert.match(osrmWorkload.properties.configuration.registries[0].server, /loginServer/);
// Bicep wraps interpolated object keys in ARM format('{0}', resourceId(...));
// normalize that identity operation before comparing the assigned/pull IDs.
const assignedOsrmIdentities = Object.keys(osrmWorkload.identity.userAssignedIdentities)
  .map(value => value.replace(/^\[format\('\{0\}', (.*)\)\]$/, '[$1]'));
assert.ok(assignedOsrmIdentities.includes(osrmWorkload.properties.configuration.registries[0].identity));
assert.notEqual(osrmWorkload.properties.configuration.registries[0].identity, api.identityId.value,
  'OSRM image pulls do not inherit the API/worker identity and its database-secret privileges');
assert.ok(osrmWorkload.dependsOn.some(dependency => dependency.includes('7f951dda-4ed3-4680-a7ca-43fe172d538d')), 'OSRM waits for AcrPull');

// Exercise configuration gates without connecting to a database.
const { runtimePersistence } = await import('../server/db/runtime.ts');
const saved = { ...process.env };
try {
  Object.assign(process.env, { NODE_ENV: 'production', WIND_POSTGRES_STAGING: '1', WIND_DATABASE_URL: 'postgresql://example.com/db?sslmode=verify-full', DB_PATH: '/data/wind.db' });
  const staging = runtimePersistence();
  assert.equal(staging.backend, 'postgres', 'DB_PATH remains only the legacy mount in staging; PostgreSQL cannot fall back to it');
  assert.equal(staging.pool.options.options, '-c search_path=wp16_staging,public');
  await staging.close();
  for (const url of ['postgresql://localhost/db?sslmode=verify-full', 'postgresql://127.0.0.2/db?sslmode=verify-full', 'postgresql://example.com/db', 'postgresql://example.com/db?sslmode=require', 'postgresql://example.com/db?sslmode=verify-full&host=localhost']) {
    process.env.WIND_DATABASE_URL = url;
    assert.throws(() => runtimePersistence(), /WP16 staging/);
  }
  delete process.env.WIND_DATABASE_URL;
  assert.throws(() => runtimePersistence(), /requires WIND_DATABASE_URL/);
  process.env.WIND_DATABASE_URL = 'postgresql://example.com/db?sslmode=verify-full';
  delete process.env.WIND_POSTGRES_STAGING;
  assert.throws(() => runtimePersistence(), /PostgreSQL API cutover is gated/);
  Object.assign(process.env, { NODE_ENV: 'test', WIND_POSTGRES_TEST_ONLY: '1', WIND_POSTGRES_TEST_SCHEMA: 'wp03_wp16_test', WIND_DATABASE_URL: 'postgresql://127.0.0.1/db' });
  const testDatabase = runtimePersistence();
  assert.equal(testDatabase.pool.options.options, '-c search_path=wp03_wp16_test,public');
  await testDatabase.close();
  process.env.WIND_DATABASE_URL = 'postgresql://example.com/db';
  assert.throws(() => runtimePersistence(), /require loopback/);
} finally {
  for (const key of ['NODE_ENV', 'WIND_POSTGRES_STAGING', 'WIND_DATABASE_URL', 'WIND_POSTGRES_TEST_ONLY', 'WIND_POSTGRES_TEST_SCHEMA', 'DB_PATH']) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
}
console.log('Azure IaC static policy assertions passed.');
