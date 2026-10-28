using '../main.bicep'

param prefix = 'fsprod'
param environment = 'prod'
// Placeholder only. Production region/quota/data-location selection is not approved.
param location = 'westeurope'
param postgresAdministratorPassword = readEnvironmentVariable('FASTSHIP_PG_ADMIN_PASSWORD')
param enableWorkloads = false
param postgresSkuName = 'Standard_D4ds_v5'
param postgresTier = 'GeneralPurpose'
param postgresStorageGb = 128
param postgresBackupDays = 35
// HA requires regional SKU/quota and recovery review before use.
param postgresHaMode = 'Disabled'
param pubSubCapacity = 1
param osrmGraphStorageGb = 200
param budgetAmount = 500
