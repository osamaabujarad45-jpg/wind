targetScope = 'resourceGroup'

param backupAccountName string
param backupContainerName string = 'wind-backups'
param writerPrincipalId string
param workspaceResourceId string
param actionGroupResourceId string = ''
param alertLocation string
@description('Enable after a successful backup is visible in the workspace.')
param enableBackupAlert bool = false
var alertActionGroup = !enableBackupAlert || !empty(trim(actionGroupResourceId)) ? actionGroupResourceId : fail('An action group is required to enable the backup alert')

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: backupAccountName
}
resource blobs 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' existing = {
  parent: storage
  name: 'default'
}
resource writes 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'wind-backup-write-logs'
  scope: blobs
  properties: {
    workspaceId: workspaceResourceId
    logAnalyticsDestinationType: 'Dedicated'
    logs: [{ category: 'StorageWrite', enabled: true }]
  }
}

// JSON quoting preserves literal parameter values inside the KQL string.
var accountLiteral = string([backupAccountName])
var pathLiteral = string(['/${backupContainerName}/wind-'])
var uploaderLiteral = string([writerPrincipalId])
var freshnessQuery = join([
  'StorageBlobLogs'
  '| where TimeGenerated >= ago(3h)'
  '| where AccountName =~ tostring(dynamic(${accountLiteral})[0])'
  '| where OperationName == "PutBlob" and StatusCode == "201"'
  '| where RequesterObjectId =~ tostring(dynamic(${uploaderLiteral})[0])'
  '| extend BlobPath = tostring(parse_url(Uri).Path)'
  '| where BlobPath startswith_cs tostring(dynamic(${pathLiteral})[0]) and BlobPath endswith_cs ".db"'
  '| summarize SuccessfulBackups = count()'
], '\n')

resource missingBackup 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = if (enableBackupAlert) {
  name: 'wind-backup-stale-${uniqueString(storage.id)}'
  location: alertLocation
  kind: 'LogAlert'
  properties: {
    displayName: 'Wind backup missing for three hours'
    description: 'Check the VM backup timer, managed identity and Blob data path. Confirm the last usable restore point before taking action.'
    enabled: true
    severity: 2
    scopes: [workspaceResourceId]
    evaluationFrequency: 'PT15M'
    windowSize: 'PT15M'
    overrideQueryTimeRange: 'PT3H'
    autoMitigate: true
    skipQueryValidation: false
    actions: { actionGroups: [alertActionGroup] }
    criteria: {
      allOf: [{
        query: freshnessQuery
        metricMeasureColumn: 'SuccessfulBackups'
        timeAggregation: 'Minimum'
        operator: 'LessThan'
        threshold: 1
        failingPeriods: { numberOfEvaluationPeriods: 1, minFailingPeriodsToAlert: 1 }
      }]
    }
  }
  dependsOn: [writes]
}
