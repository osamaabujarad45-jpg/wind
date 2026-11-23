targetScope = 'resourceGroup'

param location string
param workspaceResourceId string
param actionGroupResourceId string
@description('Public HTTPS readiness URL, including /api/ready.')
param readinessUrl string

resource insights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'wind-prod-availability'
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspaceResourceId
    DisableLocalAuth: true
  }
}

resource readiness 'Microsoft.Insights/webtests@2022-06-15' = {
  name: 'wind-prod-api-readiness'
  location: location
  kind: 'standard'
  tags: { 'hidden-link:${insights.id}': 'Resource' }
  properties: {
    Name: 'Wind production API readiness'
    SyntheticMonitorId: 'wind-prod-api-readiness'
    Kind: 'standard'
    Enabled: true
    Frequency: 900
    Timeout: 15
    RetryEnabled: true
    Locations: [
      { Id: 'emea-nl-ams-azr' }
      { Id: 'emea-gb-db3-azr' }
      { Id: 'emea-fr-pra-edge' }
    ]
    Request: {
      RequestUrl: readinessUrl
      HttpVerb: 'GET'
      ParseDependentRequests: false
      FollowRedirects: false
    }
    ValidationRules: {
      ExpectedHttpStatusCode: 200
      SSLCheck: true
      ContentValidation: { ContentMatch: '"ok":true', IgnoreCase: false, PassIfTextFound: true }
    }
  }
}

resource outage 'Microsoft.Insights/metricAlerts@2018-03-01' = {
  name: 'wind-prod-api-unavailable'
  location: 'global'
  properties: {
    description: 'Check the public API and the Azure VM, database and ingress.'
    severity: 1
    enabled: true
    scopes: [readiness.id, insights.id]
    evaluationFrequency: 'PT5M'
    windowSize: 'PT30M'
    autoMitigate: true
    criteria: {
      'odata.type': 'Microsoft.Azure.Monitor.WebtestLocationAvailabilityCriteria'
      componentId: insights.id
      webTestId: readiness.id
      failedLocationCount: 2
    }
    actions: [{ actionGroupId: actionGroupResourceId }]
  }
}
