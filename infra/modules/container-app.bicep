param name string
param location string
param environmentId string
param identityId string
param tags object
param image string
param containerName string
param cpu string
param memory string
param command array = []
param ingressEnabled bool = false
param ingressPort int = 0
param maxReplicas int = 1
param minReplicas int = 1
param environmentVariables array = []
@secure()
param acsAccessKey string = ''
param probes array = []
param volumeName string = ''
param volumeMountPath string = ''
param storageName string = ''

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: name
  location: location
  tags: tags
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${identityId}': {} } }
  properties: {
    managedEnvironmentId: environmentId
    configuration: {
      activeRevisionsMode: 'Single'
      secrets: empty(acsAccessKey) ? [] : [{ name: 'acs-key', value: acsAccessKey }]
      ...(ingressEnabled ? { ingress: { external: true, targetPort: ingressPort, transport: 'http', allowInsecure: false } } : {})
    }
    template: {
      containers: [{
        name: containerName
        image: image
        ...(empty(command) ? {} : { command: command })
        env: concat([{ name: 'NODE_ENV', value: 'production' }], environmentVariables,
          empty(acsAccessKey) ? [] : [{ name: 'WIND_ACS_KEY', secretRef: 'acs-key' }])
        resources: { cpu: json(cpu), memory: memory }
        ...(empty(probes) ? {} : { probes: probes })
        ...(empty(volumeName) ? {} : { volumeMounts: [{ volumeName: volumeName, mountPath: volumeMountPath }] })
      }]
      scale: { minReplicas: minReplicas, maxReplicas: maxReplicas }
      ...(empty(volumeName) ? {} : { volumes: [{ name: volumeName, storageType: 'AzureFile', storageName: storageName }] })
    }
  }
}
output appId string = app.id
