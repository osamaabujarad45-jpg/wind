targetScope = 'resourceGroup'

@description('Short lowercase deployment prefix, globally unique resources append a suffix.')
@minLength(3)
@maxLength(12)
param prefix string
param location string = resourceGroup().location
@allowed(['dev', 'staging', 'prod'])
param environment string
@description('Must remain false until root-reviewed PostgreSQL runtime cutover and all operational gates pass.')
param enableWorkloads bool = false
@description('Reviewed container image digest, e.g. repo@sha256:...; required only when workloads are enabled.')
param imageDigest string = ''
@description('OSRM image digest containing the reviewed graph-serving entrypoint; graph is mounted from durable Azure Files.')
param osrmImageDigest string = ''
@secure()
param postgresAdministratorPassword string
param postgresAdministratorLogin string = 'fastshipadmin'
param postgresSkuName string = 'Standard_B1ms'
@allowed(['Burstable', 'GeneralPurpose'])
param postgresTier string = 'Burstable'
param postgresStorageGb int = 128
param postgresBackupDays int = 14
@allowed(['Disabled', 'SameZone', 'ZoneRedundant'])
param postgresHaMode string = 'Disabled'
param postgresAvailabilityZone string = '1'
param postgresStandbyAvailabilityZone string = '2'
param budgetAmount int = 100
param budgetStartDate string = '2026-01-01T00:00:00Z'
param pubSubCapacity int = 1
param osrmCpu int = 2
param osrmMemory string = '4Gi'
param osrmGraphStorageGb int = 100
param logRetentionDays int = 30
@description('Entra External ID tenant subdomain, directory GUID and app client ID; all empty keeps Entra dark.')
param entraTenantName string = ''
param entraTenantId string = ''
param entraClientId string = ''
@description('ACS sender (phone number or alphanumeric ID) used when enableAcs is true.')
param acsSender string = ''
@secure()
@description('ACS access key; prefer a Key Vault reference in reviewed deployments.')
param acsAccessKey string = ''
@description('Provision Azure Communication Services (SMS + Email) for OTP delivery bake-off; Entra tenant itself is portal-created.')
param enableAcs bool = false
param acsDataLocation string = 'Europe'
@description('Real support contact shown on the legal pages; required when workloads are enabled.')
param supportContact string = ''
@description('Production identity policy; operator-verified keeps self-registration closed.')
@allowed(['operator-verified', 'self-service'])
param identityMode string = 'operator-verified'

// Evaluate both required images at deployment start, before workload activation.
var checkedImage = !enableWorkloads || !empty(trim(imageDigest)) ? imageDigest : fail('imageDigest is required when enableWorkloads is true')
var checkedOsrmImage = !enableWorkloads || !empty(trim(osrmImageDigest)) ? osrmImageDigest : fail('osrmImageDigest is required when enableWorkloads is true')
var checkedSupportContact = !enableWorkloads || !empty(trim(supportContact)) ? supportContact : fail('supportContact is required when enableWorkloads is true')
var suffix = uniqueString(subscription().id, resourceGroup().id, prefix)
var commonTags = { application: 'fastship', environment: environment, managedBy: 'bicep' }
var vnetName = '${prefix}-${environment}-vnet'
var acaSubnetId = '${vnet.id}/subnets/aca'
var postgresSubnetId = '${vnet.id}/subnets/postgres'
var postgresDnsZoneName = 'private.postgres.database.azure.com'
#disable-next-line no-hardcoded-env-urls
var blobDnsZoneName = 'privatelink.blob.core.windows.net'
#disable-next-line no-hardcoded-env-urls
var fileDnsZoneName = 'privatelink.file.core.windows.net'
var privateEndpointSubnetId = '${vnet.id}/subnets/private-endpoints'

resource vnet 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: vnetName
  location: location
  tags: commonTags
  properties: {
    addressSpace: { addressPrefixes: ['10.40.0.0/16'] }
    subnets: [
      { name: 'aca', properties: { addressPrefix: '10.40.0.0/23', delegations: [{ name: 'acaDelegation', properties: { serviceName: 'Microsoft.App/environments' } }] } }
      { name: 'postgres', properties: { addressPrefix: '10.40.2.0/24', delegations: [{ name: 'postgresDelegation', properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' } }] } }
      { name: 'private-endpoints', properties: { addressPrefix: '10.40.3.0/24', privateEndpointNetworkPolicies: 'Disabled' } }
    ]
  }
}
resource postgresDns 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: postgresDnsZoneName
  location: 'global'
  tags: commonTags
}
resource postgresDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: postgresDns
  name: '${prefix}-${environment}-link'
  location: 'global'
  properties: { registrationEnabled: false, virtualNetwork: { id: vnet.id } }
}
resource blobPrivateDns 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: blobDnsZoneName
  location: 'global'
  tags: commonTags
}
resource filePrivateDns 'Microsoft.Network/privateDnsZones@2020-06-01' = if (enableWorkloads) {
  name: fileDnsZoneName
  location: 'global'
  tags: commonTags
}
resource vaultPrivateDns 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: 'privatelink.vaultcore.azure.net'
  location: 'global'
  tags: commonTags
}
resource blobDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: blobPrivateDns
  name: '${prefix}-${environment}-blob-link'
  location: 'global'
  properties: { registrationEnabled: false, virtualNetwork: { id: vnet.id } }
}
resource fileDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = if (enableWorkloads) {
  parent: filePrivateDns
  name: '${prefix}-${environment}-file-link'
  location: 'global'
  properties: { registrationEnabled: false, virtualNetwork: { id: vnet.id } }
}
resource vaultDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: vaultPrivateDns
  name: '${prefix}-${environment}-vault-link'
  location: 'global'
  properties: { registrationEnabled: false, virtualNetwork: { id: vnet.id } }
}
resource logs 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: '${prefix}-${environment}-logs-${suffix}'
  location: location
  tags: commonTags
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: logRetentionDays, features: { enableLogAccessUsingOnlyResourcePermissions: true } }
}
resource environmentIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${prefix}-${environment}-runtime-id'
  location: location
  tags: commonTags
}
resource osrmIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${prefix}-${environment}-osrm-id'
  location: location
  tags: commonTags
}
resource acaEnvironment 'Microsoft.App/managedEnvironments@2026-07-01' = {
  name: '${prefix}-${environment}-aca'
  location: location
  tags: commonTags
  identity: { type: 'SystemAssigned' }
  properties: {
    appLogsConfiguration: { destination: 'log-analytics', logAnalyticsConfiguration: { customerId: logs.properties.customerId, sharedKey: logs.listKeys().primarySharedKey } }
    vnetConfiguration: { infrastructureSubnetId: acaSubnetId, internal: false }
    zoneRedundant: false
  }
}
resource pg 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${prefix}-${environment}-pg-${suffix}'
  location: location
  tags: commonTags
  sku: { name: postgresSkuName, tier: postgresTier }
  properties: {
    administratorLogin: postgresAdministratorLogin
    administratorLoginPassword: postgresAdministratorPassword
    authConfig: { passwordAuth: 'Enabled', activeDirectoryAuth: 'Disabled' }
    backup: { backupRetentionDays: postgresBackupDays, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: postgresHaMode, standbyAvailabilityZone: postgresHaMode == 'ZoneRedundant' ? postgresStandbyAvailabilityZone : null }
    availabilityZone: postgresAvailabilityZone
    network: { delegatedSubnetResourceId: postgresSubnetId, privateDnsZoneArmResourceId: postgresDns.id, publicNetworkAccess: 'Disabled' }
    storage: { storageSizeGB: postgresStorageGb, autoGrow: 'Enabled', type: 'Premium_LRS' }
    version: '16'
  }
  dependsOn: [postgresDnsLink]
}
resource pgTls 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: pg
  name: 'require_secure_transport'
  properties: { value: 'ON', source: 'user-override' }
}
resource pgExtensions 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2024-08-01' = {
  parent: pg
  name: 'azure.extensions'
  properties: { value: 'postgis', source: 'user-override' }
}
resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: pg
  name: 'fastship'
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'fs${uniqueString(resourceGroup().id, prefix, environment)}'
  location: location
  tags: commonTags
  sku: { name: 'Standard_ZRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    publicNetworkAccess: 'Disabled'
    networkAcls: { defaultAction: 'Deny', bypass: 'None', virtualNetworkRules: [] }
    encryption: { requireInfrastructureEncryption: true, services: { blob: { enabled: true }, file: { enabled: true } }, keySource: 'Microsoft.Storage' }
  }
}
resource osrmStorage 'Microsoft.Storage/storageAccounts@2026-06-01' = {
  name: 'fg${uniqueString(resourceGroup().id, prefix, environment)}'
  location: location
  tags: union(commonTags, { purpose: 'retained-osrm-graph', expectedGraphGb: string(osrmGraphStorageGb) })
  sku: { name: 'Standard_ZRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    publicNetworkAccess: 'Disabled'
    azureFilesIdentityBasedAuthentication: { directoryServiceOptions: 'AADKERB', defaultSharePermission: 'None', smbOAuthSettings: { isSmbOAuthEnabled: true } }
  }
}
resource osrmFiles 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-05-01' = {
  name: '${osrmStorage.name}/default/osrm-graph'
  properties: { shareQuota: osrmGraphStorageGb, enabledProtocols: 'SMB' }
}
resource osrmStorageRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(osrmStorage.id, acaEnvironment.id, 'a235d3ee-5935-4cfb-8cc5-a3303ad5995e')
  scope: osrmStorage
  properties: { principalId: acaEnvironment.identity.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'a235d3ee-5935-4cfb-8cc5-a3303ad5995e') }
}
resource osrmEnvironmentStorage 'Microsoft.App/managedEnvironments/storages@2026-03-02-preview' = {
  parent: acaEnvironment
  name: 'osrm-graph'
  properties: {
    azureFile: { accountName: osrmStorage.name, identity: 'system', shareName: 'osrm-graph', accessMode: 'ReadOnly' }
  }
  dependsOn: [osrmStorageRole]
}
// The durable share must contain region.osrm and its companion files before enableWorkloads:
// mounting an empty share hides the image's baked graph and osrm-routed crash-loops (deploy.md).
// The runtime refuses to boot without an absolute DB_PATH. PostgreSQL is the durable store;
// this share only satisfies the SQLite fallback path and keeps the mount identical on rollback.
resource dataFiles 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-05-01' = {
  name: '${osrmStorage.name}/default/wind-data'
  properties: { shareQuota: 5, enabledProtocols: 'SMB' }
}
resource dataEnvironmentStorage 'Microsoft.App/managedEnvironments/storages@2026-03-02-preview' = {
  parent: acaEnvironment
  name: 'wind-data'
  properties: {
    azureFile: { accountName: osrmStorage.name, identity: 'system', shareName: 'wind-data', accessMode: 'ReadWrite' }
  }
  dependsOn: [osrmStorageRole]
}
resource evidence 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: '${storage.name}/default/evidence'
  properties: { publicAccess: 'None' }
}
resource quarantine 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: '${storage.name}/default/quarantine'
  properties: { publicAccess: 'None' }
}
resource evidenceBlobEndpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = {
  name: '${prefix}-${environment}-evidence-blob-pe'
  location: location
  tags: commonTags
  properties: { subnet: { id: privateEndpointSubnetId }, privateLinkServiceConnections: [{ name: 'blob', properties: { privateLinkServiceId: storage.id, groupIds: ['blob'] } }] }
}
resource evidenceBlobZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = {
  parent: evidenceBlobEndpoint
  name: 'default'
  properties: { privateDnsZoneConfigs: [{ name: 'blob', properties: { privateDnsZoneId: blobPrivateDns.id } }] }
}
resource vaultEndpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = {
  name: '${prefix}-${environment}-vault-pe'
  location: location
  tags: commonTags
  properties: { subnet: { id: privateEndpointSubnetId }, privateLinkServiceConnections: [{ name: 'vault', properties: { privateLinkServiceId: vault.id, groupIds: ['vault'] } }] }
}
resource vaultZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = {
  parent: vaultEndpoint
  name: 'default'
  properties: { privateDnsZoneConfigs: [{ name: 'vault', properties: { privateDnsZoneId: vaultPrivateDns.id } }] }
}
resource osrmFileEndpoint 'Microsoft.Network/privateEndpoints@2024-05-01' = if (enableWorkloads) {
  name: '${prefix}-${environment}-osrm-file-pe'
  location: location
  tags: commonTags
  properties: { subnet: { id: privateEndpointSubnetId }, privateLinkServiceConnections: [{ name: 'file', properties: { privateLinkServiceId: osrmStorage.id, groupIds: ['file'] } }] }
}
resource osrmFileZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2024-05-01' = if (enableWorkloads) {
  parent: osrmFileEndpoint
  name: 'default'
  properties: { privateDnsZoneConfigs: [{ name: 'file', properties: { privateDnsZoneId: filePrivateDns.id } }] }
}
resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${prefix}-${environment}-kv-${suffix}'
  location: location
  tags: commonTags
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    publicNetworkAccess: 'Disabled'
    networkAcls: { defaultAction: 'Deny', bypass: 'None', ipRules: [], virtualNetworkRules: [] }
  }
}
resource pubsub 'Microsoft.SignalRService/webPubSub@2024-03-01' = {
  name: '${prefix}-${environment}-pubsub-${suffix}'
  location: location
  tags: commonTags
  sku: { name: 'Standard_S1', capacity: pubSubCapacity }
  properties: { publicNetworkAccess: 'Enabled', disableAadAuth: false, disableLocalAuth: true, tls: { clientCertEnabled: false } }
}
resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${replace(prefix, '-', '')}${uniqueString(resourceGroup().id, environment)}'
  location: location
  tags: commonTags
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false, publicNetworkAccess: 'Enabled', networkRuleBypassOptions: 'AzureServices' }
}
resource databaseUrlSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = if (enableWorkloads) {
  parent: vault
  name: 'database-url'
  properties: {
    // The runtime currently accepts a non-loopback URL only through the staging gate (verify-full).
    // The production cutover still requires the code gate to be removed by review.
    value: 'postgresql://${postgresAdministratorLogin}:${uriComponent(postgresAdministratorPassword)}@${pg.properties.fullyQualifiedDomainName}:5432/fastship?sslmode=verify-full'
  }
}
resource vaultSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableWorkloads) {
  name: guid(vault.id, environmentIdentity.id, '4633458b-17de-408a-b874-0445c86b69e6')
  scope: vault
  properties: { principalId: environmentIdentity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6') }
}
resource registryPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableWorkloads) {
  name: guid(registry.id, environmentIdentity.id, '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  scope: registry
  properties: { principalId: environmentIdentity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d') }
}
resource osrmRegistryPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (enableWorkloads) {
  name: guid(registry.id, osrmIdentity.id, '7f951dda-4ed3-4680-a7ca-43fe172d538d')
  scope: registry
  properties: { principalId: osrmIdentity.properties.principalId, principalType: 'ServicePrincipal', roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d') }
}
// Owner gate: workloads stay disabled until the runtime PostgreSQL cutover is reviewed, the
// migration has run under the advisory lock, and the identity/provider gates are accepted.
module api 'modules/container-app.bicep' = if (enableWorkloads) {
  name: 'api'
  params: {
    name: '${prefix}-${environment}-api'
    location: location
    environmentId: acaEnvironment.id
    identityId: environmentIdentity.id
    tags: commonTags
    image: checkedImage
    registryServer: registry.properties.loginServer
    containerName: 'api'
    cpu: '0.5'
    memory: '1Gi'
    ingressEnabled: true
    ingressPort: 4000
    // Empty values are inert: every consumer gates on a non-empty setting.
    environmentVariables: [
      { name: 'HOST', value: '0.0.0.0' }
      { name: 'PORT', value: '4000' }
      { name: 'SUPPORT_CONTACT', value: checkedSupportContact }
      { name: 'WIND_IDENTITY_MODE', value: identityMode }
      { name: 'WIND_POSTGRES_STAGING', value: '1' }
      { name: 'OSRM_URL', value: 'http://${acaOsrm!.properties.configuration.ingress!.fqdn}' }
      { name: 'DB_PATH', value: '/data/wind.db' }
      { name: 'WIND_ENTRA_TENANT_NAME', value: entraTenantName }
      { name: 'WIND_ENTRA_TENANT_ID', value: entraTenantId }
      { name: 'WIND_ENTRA_CLIENT_ID', value: entraClientId }
      { name: 'WIND_ACS_ENDPOINT', value: enableAcs ? 'https://${comm!.properties.hostName}' : '' }
      { name: 'WIND_ACS_SENDER', value: acsSender }
      { name: 'WIND_TRUST_PROXY', value: '1' }
    ]
    keyVaultSecrets: [
      { name: 'database-url', envName: 'WIND_DATABASE_URL', keyVaultUrl: '${vault.properties.vaultUri}secrets/database-url', identity: environmentIdentity.id }
    ]
    volumeName: 'data'
    volumeMountPath: '/data'
    storageName: 'wind-data'
    acsAccessKey: acsAccessKey
    minReplicas: 1
    maxReplicas: 1
    probes: [
      { type: 'Liveness', httpGet: { path: '/api/health', port: 4000, scheme: 'HTTP' }, initialDelaySeconds: 10, periodSeconds: 30 }
      { type: 'Readiness', httpGet: { path: '/api/ready', port: 4000, scheme: 'HTTP' }, initialDelaySeconds: 10, periodSeconds: 30 }
    ]
  }
  dependsOn: [registryPull, vaultSecretsUser, databaseUrlSecret]
}
module worker 'modules/container-app.bicep' = if (enableWorkloads) {
  name: 'worker'
  params: {
    name: '${prefix}-${environment}-worker'
    location: location
    environmentId: acaEnvironment.id
    identityId: environmentIdentity.id
    tags: commonTags
    image: checkedImage
    registryServer: registry.properties.loginServer
    containerName: 'worker'
    cpu: '0.5'
    memory: '1Gi'
    command: ['node', 'server/worker.ts']
    environmentVariables: [
      { name: 'WIND_POSTGRES_STAGING', value: '1' }
    ]
    keyVaultSecrets: [
      { name: 'database-url', envName: 'WIND_DATABASE_URL', keyVaultUrl: '${vault.properties.vaultUri}secrets/database-url', identity: environmentIdentity.id }
    ]
    minReplicas: 1
    maxReplicas: 1
  }
  dependsOn: [registryPull, vaultSecretsUser, databaseUrlSecret]
}
resource acaOsrm 'Microsoft.App/containerApps@2024-03-01' = if (enableWorkloads) {
  name: '${prefix}-${environment}-osrm'
  location: location
  tags: commonTags
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${osrmIdentity.id}': {} } }
  properties: {
    managedEnvironmentId: acaEnvironment.id
    configuration: {
      activeRevisionsMode: 'Single'
      registries: [{ server: registry.properties.loginServer, identity: osrmIdentity.id }]
      ingress: { external: false, targetPort: 5000, transport: 'http', allowInsecure: false }
    }
    template: { containers: [{ name: 'osrm', image: checkedOsrmImage, resources: { cpu: osrmCpu, memory: osrmMemory }, volumeMounts: [{ volumeName: 'graph', mountPath: '/data' }] }], scale: { minReplicas: 1, maxReplicas: 1 }, volumes: [{ name: 'graph', storageType: 'AzureFile', storageName: 'osrm-graph' }] }
  }
  dependsOn: [osrmRegistryPull, osrmEnvironmentStorage, osrmFileZoneGroup]
}
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${prefix}-${environment}-appi-${suffix}'
  location: location
  kind: 'web'
  tags: commonTags
  properties: { Application_Type: 'web', WorkspaceResourceId: logs.id, DisableLocalAuth: true, IngestionMode: 'LogAnalytics' }
}
resource comm 'Microsoft.Communication/communicationServices@2023-04-01' = if (enableAcs) {
  name: '${prefix}-${environment}-acs-${suffix}'
  location: 'global'
  tags: commonTags
  properties: { dataLocation: acsDataLocation }
}
resource emailSvc 'Microsoft.Communication/emailServices@2023-04-01' = if (enableAcs) {
  name: '${prefix}-${environment}-email-${suffix}'
  location: 'global'
  tags: commonTags
  properties: { dataLocation: acsDataLocation }
}
resource emailDomain 'Microsoft.Communication/emailServices/domains@2023-04-01' = if (enableAcs) {
  parent: emailSvc
  name: 'AzureManagedDomain'
  location: 'global'
  properties: { domainManagement: 'AzureManaged', userEngagementTracking: 'Disabled' }
}
resource budget 'Microsoft.Consumption/budgets@2023-05-01' = {
  name: '${prefix}-${environment}-monthly-budget'
  properties: {
    category: 'Cost'
    amount: budgetAmount
    timeGrain: 'Monthly'
    timePeriod: { startDate: budgetStartDate, endDate: '2035-12-31T00:00:00Z' }
    notifications: { actual80: { enabled: true, operator: 'GreaterThan', threshold: 80, contactEmails: [], contactRoles: ['Owner'], thresholdType: 'Actual' }, actual100: { enabled: true, operator: 'GreaterThan', threshold: 100, contactEmails: [], contactRoles: ['Owner'], thresholdType: 'Actual' } }
  }
}
output imageValidation string = enableWorkloads ? '${checkedImage} ${checkedOsrmImage}' : 'Workloads disabled'
output workloadGate string = enableWorkloads ? 'Enabled by parameter; does not mean runtime gates passed.' : 'Disabled; workloads are not staged or running.'
output postgresFqdn string = pg.properties.fullyQualifiedDomainName
output acsHostName string = enableAcs ? comm!.properties.hostName : ''
output storageId string = storage.id
output identityPrincipalId string = environmentIdentity.properties.principalId
