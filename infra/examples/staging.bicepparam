using '../main.bicep'

param prefix = 'fsstage'
param environment = 'staging'
// West Europe is the report's engineering baseline and remains subject to owner review.
param location = 'westeurope'
param postgresAdministratorPassword = readEnvironmentVariable('FASTSHIP_PG_ADMIN_PASSWORD')
param enableWorkloads = false
param postgresSkuName = 'Standard_B1ms'
param postgresTier = 'Burstable'
param postgresStorageGb = 64
param postgresBackupDays = 14
param postgresHaMode = 'Disabled'
param pubSubCapacity = 1
param osrmGraphStorageGb = 100
param budgetAmount = 150
