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
assert.match(main, /maxReplicas: 1/);
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
assert.match(app, /@secure\(\)\s*param acsAccessKey string/);
assert.match(app, /name: 'WIND_ACS_KEY', secretRef: 'acs-key'/);
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
const deployment=name=>compiled.resources.find(resource=>resource.type==='Microsoft.Resources/deployments' && resource.name===name);
const api=deployment('api').properties.parameters,worker=deployment('worker').properties.parameters;
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
assert.ok(graphShare && !graphShare.condition,'Graph storage can be populated before enabling its application');
const graphEndpoint=compiled.resources.find(resource=>resource.type==='Microsoft.Network/privateEndpoints'
  && resource.properties.privateLinkServiceConnections.some(connection=>connection.properties.groupIds.includes('file')));
const workloadCondition = "[parameters('enableWorkloads')]";
assert.equal(graphEndpoint?.condition, workloadCondition, 'File endpoint follows the workload gate');
for (const resource of compiled.resources.filter(resource =>
  (resource.type === 'Microsoft.Network/privateDnsZones' && String(resource.name).includes('fileDnsZoneName')) ||
  (resource.type === 'Microsoft.Network/privateDnsZones/virtualNetworkLinks' && String(resource.name).includes('fileDnsZoneName')) ||
  (resource.type === 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups' && String(resource.name).includes('osrm-file-pe')))) {
  assert.equal(resource.condition, workloadCondition, 'File DNS resources follow the workload gate');
}
const fileZone = compiled.resources.find(resource => resource.type === 'Microsoft.Network/privateDnsZones' && String(resource.name).includes('fileDnsZoneName'));
const fileLink = compiled.resources.find(resource => resource.type === 'Microsoft.Network/privateDnsZones/virtualNetworkLinks' && String(resource.name).includes('fileDnsZoneName'));
const fileGroup = compiled.resources.find(resource => resource.type === 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups' && String(resource.name).includes('osrm-file-pe'));
assert.ok(fileZone && fileLink && fileGroup, 'File zone, link and zone group are present');
assert.match(compiled.variables.checkedImage, /fail\('imageDigest is required/);
assert.match(compiled.variables.checkedOsrmImage, /fail\('osrmImageDigest is required/);
assert.match(compiled.outputs.imageValidation.value, /checkedImage/);
const paramFile = path.join(root, '.expo/implementation/wp16-enabled.bicepparam');
writeFileSync(paramFile, `using '../../infra/main.bicep'\nparam prefix = 'fsstage'\nparam environment = 'staging'\nparam postgresAdministratorPassword = 'compile-only-not-a-secret'\nparam enableWorkloads = true\nparam imageDigest = 'example/api@sha256:1234'\nparam osrmImageDigest = 'example/osrm@sha256:1234'\n`);
const bicep = process.env.BICEP_COMMAND || 'az';
const prefix = bicep === 'az' ? ['bicep'] : [];
execFileSync(bicep, [...prefix, 'build-params', ...(bicep === 'az' ? ['--file', paramFile] : [paramFile]), '--outfile', path.join(root, '.expo/implementation/wp16-enabled.parameters.json')], { cwd: root, stdio: 'inherit', env: process.env, shell: process.platform === 'win32' && !bicep.toLowerCase().endsWith('.exe') });
const enabled = JSON.parse(readFileSync(path.join(root, '.expo/implementation/wp16-enabled.parameters.json'), 'utf8')).parameters;
assert.equal(enabled.enableWorkloads.value, true);
assert.ok(enabled.imageDigest.value && enabled.osrmImageDigest.value);
assert.equal(deployment('api').condition, workloadCondition);
assert.equal(deployment('worker').condition, workloadCondition);
const apiEnv = Object.fromEntries(api.environmentVariables.value.map(entry => [entry.name, entry]));
for (const name of ['SUPPORT_CONTACT', 'WIND_IDENTITY_MODE', 'OSRM_URL', 'DB_PATH']) {
  assert.ok(typeof apiEnv[name]?.value === 'string' && apiEnv[name].value.length > 0, `${name} must render non-empty`);
}
assert.ok(api.keyVaultSecrets.value.some(secret => secret.name === 'database-url' && secret.envName === 'WIND_DATABASE_URL' && secret.keyVaultUrl.includes('secrets/database-url')));
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

// Exercise configuration gates without connecting to a database.
const { runtimePersistence } = await import('../server/db/runtime.ts');
const saved = { ...process.env };
try {
  Object.assign(process.env, { NODE_ENV: 'production', WIND_POSTGRES_STAGING: '1', WIND_DATABASE_URL: 'postgresql://example.com/db?sslmode=verify-full' });
  const staging = runtimePersistence();
  assert.equal(staging.backend, 'postgres');
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
  for (const key of ['NODE_ENV', 'WIND_POSTGRES_STAGING', 'WIND_DATABASE_URL', 'WIND_POSTGRES_TEST_ONLY', 'WIND_POSTGRES_TEST_SCHEMA']) {
    if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
  }
}
console.log('Azure IaC static policy assertions passed.');
