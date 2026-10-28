using '../main.bicep'

param prefix = 'fsdev'
param environment = 'dev'
param location = 'westeurope'
param postgresAdministratorPassword = readEnvironmentVariable('FASTSHIP_PG_ADMIN_PASSWORD')
param enableWorkloads = false
param postgresSkuName = 'Standard_B1ms'
param postgresTier = 'Burstable'
param postgresStorageGb = 32
param postgresBackupDays = 7
param postgresHaMode = 'Disabled'
param pubSubCapacity = 1
param osrmGraphStorageGb = 100
param budgetAmount = 25
