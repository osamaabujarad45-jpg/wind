targetScope = 'resourceGroup'

@description('Existing Azure Storage account for the production backup container.')
param backupAccountName string
param backupContainerName string = 'wind-backups'
@description('Object ID of the production VM managed identity.')
param writerPrincipalId string

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: backupAccountName
}
resource blobs 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' existing = {
  parent: storage
  name: 'default'
}
resource container 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' existing = {
  parent: blobs
  name: backupContainerName
}

resource writerRole 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name: guid(resourceGroup().id, 'wind-backup-blob-create-v1')
  properties: {
    roleName: 'Wind backup blob creator ${uniqueString(resourceGroup().id)}'
    description: 'Create backup blobs without read, overwrite, or delete access.'
    type: 'CustomRole'
    assignableScopes: [resourceGroup().id]
    permissions: [{
      actions: []
      notActions: []
      dataActions: ['Microsoft.Storage/storageAccounts/blobServices/containers/blobs/add/action']
      notDataActions: []
    }]
  }
}

resource writerAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(container.id, writerPrincipalId, writerRole.id)
  scope: container
  properties: {
    principalId: writerPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: writerRole.id
  }
}
