# Implementation Plan: Azure Integration

## Overview

Implement Azure VM integration for Pabawi following the same plugin architecture as the existing AWS integration. This includes extending BasePlugin, registering with IntegrationManager, and implementing both InformationSourcePlugin and ExecutionToolPlugin interfaces using the Azure SDK for JavaScript (`@azure/arm-compute`, `@azure/identity`, `@azure/arm-network`, `@azure/arm-resources`).

## Tasks

- [x] 1. Configuration foundation (ConfigService, schema, .env.example)
  - [x] 1.1 Add AzureConfigSchema to backend/src/config/schema.ts
    - Define AzureConfigSchema with fields: enabled (boolean, default false), tenantId (optional string), clientId (optional string), clientSecret (optional string), subscriptionId (optional string), resourceGroups (optional string array)
    - Add azure field to IntegrationsConfigSchema as optional using AzureConfigSchema
    - Export AzureIntegrationConfig type
    - _Requirements: 2.2_

  - [x] 1.2 Add Azure parsing to ConfigService.parseIntegrationsConfig()
    - Add Azure configuration block in backend/src/config/ConfigService.ts parseIntegrationsConfig() following the AWS pattern
    - Check AZURE_ENABLED, then read AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_SUBSCRIPTION_ID, AZURE_RESOURCE_GROUPS
    - Parse AZURE_RESOURCE_GROUPS from JSON array or comma-separated string (same pattern as AWS_REGIONS)
    - Add azure to the return type of parseIntegrationsConfig()
    - _Requirements: 2.1, 2.3_

  - [x] 1.3 Add getAzureConfig() accessor to ConfigService
    - Implement getAzureConfig() following the same pattern as getAWSConfig()
    - Return typed Azure configuration when enabled, null when disabled
    - _Requirements: 2.7_

  - [x] 1.4 Update backend/.env.example with Azure section
    - Add an "Azure integration (optional)" section after the AWS section
    - Include AZURE_ENABLED, AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_SUBSCRIPTION_ID, AZURE_RESOURCE_GROUPS with comments and placeholder values
    - Use `# pragma: allowlist secret` on the AZURE_CLIENT_SECRET line
    - _Requirements: 14.5_

- [x] 2. Azure types and error classes
  - [x] 2.1 Create backend/src/integrations/azure/types.ts
    - Define AzureConfig interface (tenantId, clientId, clientSecret, subscriptionId, resourceGroups, all optional strings/string arrays)
    - Define AzureVMInfo interface (vmName, vmId, powerState, vmSize, resourceGroup, location, tags, provisioningState, osType)
    - Define AzureLocationInfo interface (name, displayName)
    - Define AzureVMSizeInfo interface (name, vCpus, memoryMB, osDiskSizeGB)
    - Define AzureImageInfo interface (publisher, offer, sku, version)
    - Define AzureResourceGroupInfo interface (name, location, tags)
    - Define AzureAuthenticationError class extending Error with name "AzureAuthenticationError"
    - Re-export ProvisioningCapability from ../types
    - _Requirements: 2.4, 2.5, 13.1, 13.2, 13.3_

- [x] 3. AzureService (core service with Azure SDK integration)
  - [x] 3.1 Install Azure SDK dependencies
    - Add @azure/arm-compute, @azure/identity, @azure/arm-network, @azure/arm-resources, @azure/arm-subscriptions to backend/package.json
    - Run npm install in the backend workspace
    - _Requirements: 2.4, 2.5_

  - [x] 3.2 Create backend/src/integrations/azure/AzureService.ts — credential setup and health check
    - Implement constructor accepting AzureConfig and LoggerService
    - Use ClientSecretCredential when tenantId, clientId, clientSecret are all provided
    - Fall back to DefaultAzureCredential when explicit credentials are not provided
    - Implement validateCredentials() that lists subscriptions via SubscriptionClient to verify auth
    - Return subscription name, subscription ID, tenant ID on success
    - Throw AzureAuthenticationError on auth failures
    - _Requirements: 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_

  - [x] 3.3 Implement AzureService inventory methods
    - Implement getInventory() querying all configured resource groups (or all RGs if none configured) for VMs using ComputeManagementClient
    - Transform each VM into a Node with id format "azure:{subscriptionId}:{resourceGroup}:{vmName}", source "azure", and config containing vmId, powerState, vmSize, resourceGroup, location, tags
    - Include VM power state as node status
    - Log and continue on individual resource group query failures
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 3.4 Implement AzureService groups and facts methods
    - Implement getGroups() creating NodeGroup objects by location, resource group, and well-known tag keys (Environment, Project, Team, Application)
    - Each group id format: "azure:{groupType}:{groupValue}"
    - Implement getNodeFacts() querying full VM instance view including instance status
    - Return Facts with categories: system, network, hardware, custom
    - Populate os facts with family (windows/linux), name from image reference
    - Throw descriptive error if VM not found
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 3.5 Implement AzureService provisioning and lifecycle methods
    - Implement provisionVM() creating a new VM via ComputeManagementClient with parameters (resourceGroup, vmName, location, vmSize, imageReference, adminUsername, adminPassword or sshPublicKey, networkInterfaceId)
    - Implement startVM(), stopVM(), restartVM(), deallocateVM() lifecycle methods
    - Throw AzureAuthenticationError on auth/authorization errors
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3_

  - [x] 3.6 Implement AzureService resource discovery methods
    - Implement getLocations() returning available Azure locations for the subscription
    - Implement getVMSizes(location) returning VM sizes with vCPUs, memoryMB, osDiskSizeGB
    - Implement getImages(publisher, offer, sku) returning marketplace images
    - Implement getResourceGroups() returning all resource groups with name, location, tags
    - _Requirements: 11.1, 11.2, 11.3, 11.5_

- [x] 4. Checkpoint — Core service complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. AzurePlugin (BasePlugin extension and registration)
  - [x] 5.1 Create backend/src/integrations/azure/AzurePlugin.ts
    - Extend BasePlugin with type "both" implementing InformationSourcePlugin and ExecutionToolPlugin
    - Accept optional LoggerService, PerformanceMonitorService, JournalService in constructor
    - Implement performInitialization() validating Azure config and creating AzureService
    - Fail initialization with descriptive error if AZURE_ENABLED is true but subscriptionId is missing
    - Log informational message when default credential chain is used
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 2.6_

  - [x] 5.2 Implement AzurePlugin InformationSourcePlugin methods
    - Implement getInventory(), getGroups(), getNodeFacts(), getNodeData() delegating to AzureService
    - Handle nodeId resolution (azure: prefix format vs plain name lookup)
    - _Requirements: 4.1, 5.1, 6.1_

  - [x] 5.3 Implement AzurePlugin ExecutionToolPlugin methods
    - Implement executeAction() routing based on action type: provision/create_vm → provisionVM, start/stop/restart/deallocate → lifecycle
    - Implement listCapabilities() returning start, stop, restart, deallocate
    - Implement listProvisioningCapabilities() returning create_vm
    - _Requirements: 7.1, 8.1, 8.5_

  - [x] 5.4 Implement AzurePlugin health check
    - Implement performHealthCheck() using AzureService.validateCredentials()
    - Return healthy status with subscription details on success
    - Return unhealthy status with descriptive error on auth failure or connectivity issues
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 5.5 Implement AzurePlugin journal integration
    - Record journal entries on provision and lifecycle action completion (success or failure)
    - Map actions to JournalEventType: provision→"provision", start→"start", stop→"stop", restart→"reboot", deallocate→"destroy"
    - Log and continue if JournalService is unavailable
    - Implement setJournalService() for alternative injection
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 5.6 Implement AzurePlugin resource discovery delegation
    - Implement getLocations(), getVMSizes(), getImages(), getResourceGroups() delegating to AzureService
    - _Requirements: 11.1, 11.2, 11.3, 11.5_

  - [ ]* 5.7 Write unit tests for AzurePlugin
    - Create backend/src/integrations/azure/__tests__/AzurePlugin.test.ts
    - Test initialization with valid/invalid config
    - Test health check success and failure paths
    - Test executeAction routing for provision and lifecycle actions
    - Test journal recording on action completion
    - Test error handling (AzureAuthenticationError propagation)
    - _Requirements: 1.1, 1.4, 1.5, 1.6, 3.1, 3.2, 3.3, 3.4, 13.1, 13.2_

- [x] 6. Journal integration (collector and source schema)
  - [x] 6.1 Add "azure" to JournalSourceSchema
    - Update backend/src/services/journal/types.ts JournalSourceSchema enum to include "azure"
    - _Requirements: 9.6_

  - [x] 6.2 Add Azure state collector to JournalCollectors.ts
    - Add collectAzureVMStateEntry function in backend/src/services/journal/JournalCollectors.ts
    - Map Azure power states to JournalEventType: "VM running"→"start", "VM stopped"→"stop", "VM deallocated"→"stop", "VM deleting"→"destroy"
    - Compare current state against last recorded state in journal_entries
    - Follow the same pattern as collectAWSStateEntry
    - _Requirements: 9.4, 9.5_

- [x] 7. Integration color service entry
  - [x] 7.1 Add "azure" to IntegrationColorService
    - Add "azure" entry to IntegrationColors interface in backend/src/services/IntegrationColorService.ts
    - Use a blue-toned palette visually distinct from AWS cyan (#06B6D4) and Proxmox blue (#3B82F6)
    - Suggested: primary #8B5CF6 (violet) or #6366F1 (indigo) to differentiate
    - Add "azure" to IntegrationType type
    - _Requirements: 10.1, 10.2, 10.3_

- [x] 8. API routes
  - [x] 8.1 Create backend/src/routes/integrations/azure.ts
    - Create createAzureRouter() function following the AWS router pattern
    - Accept AzurePlugin, optional IntegrationManager, and options (allowDestructiveActions)
    - Define Zod schemas for provision, lifecycle, and query parameters
    - Implement GET /inventory, POST /provision, POST /lifecycle, POST /test
    - Implement GET /locations, GET /vm-sizes, GET /images, GET /resource-groups
    - Handle AzureAuthenticationError → 401, ZodError → sendValidationError, other → 500
    - Guard deallocate action with allowDestructiveActions check (403 if disabled)
    - Invalidate inventory cache on successful provision/lifecycle actions
    - _Requirements: 3.5, 7.5, 8.4, 8.5, 8.6, 11.4, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x] 8.2 Register Azure routes in backend/src/server.ts
    - Import AzurePlugin and createAzureRouter
    - Add Azure integration initialization block following the AWS pattern
    - Check azureConfig.enabled, create AzurePlugin, register with IntegrationManager
    - Pass JournalService to AzurePlugin
    - Mount createAzureRouter at /api/integrations/azure
    - _Requirements: 1.2, 1.3, 12.1_

  - [ ]* 8.3 Write unit tests for Azure routes
    - Create backend/src/routes/__tests__/azure.test.ts
    - Test inventory endpoint success and auth failure
    - Test provision endpoint with valid/invalid body
    - Test lifecycle endpoint with destructive action guard
    - Test test-connection endpoint
    - Test resource discovery endpoints
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

- [-] 9. Checkpoint — Backend integration complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Frontend AzureSetupGuide component
  - [~] 10.1 Create frontend/src/components/AzureSetupGuide.svelte
    - Follow the AWSSetupGuide.svelte pattern closely
    - Provide form fields: Tenant ID, Client ID, Client Secret (password input), Subscription ID, Resource Groups (optional, comma-separated), Default Location
    - Implement generateEnvSnippet() producing AZURE_ENABLED=true and all populated AZURE_* variables
    - Implement maskSensitiveValues() replacing AZURE_CLIENT_SECRET with asterisks
    - Provide copy-to-clipboard button with success toast
    - Include prerequisites section (Azure subscription, Service Principal, RBAC permissions)
    - Include validation CLI test commands (az account show, az vm list)
    - Instruct user to paste into backend/.env and restart — no web-based config saving
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [~] 10.2 Export AzureSetupGuide in frontend/src/components/index.ts
    - Add `export { default as AzureSetupGuide } from "./AzureSetupGuide.svelte"` in alphabetical order
    - _Requirements: 15.7_

  - [~] 10.3 Register AzureSetupGuide in IntegrationSetupPage.svelte
    - Import AzureSetupGuide in frontend/src/pages/IntegrationSetupPage.svelte
    - Add {:else if integration === 'azure'} block rendering AzureSetupGuide with back button and expert mode debug panel
    - Follow the same layout pattern as the existing AWS block
    - _Requirements: 15.8_

- [ ] 11. Documentation
  - [~] 11.1 Create docs/integrations/azure.md
    - Follow the same structure as docs/integrations/aws.md
    - Cover prerequisites, environment variable configuration, authentication methods (Service Principal, Managed Identity, Azure CLI via DefaultAzureCredential)
    - Document all AZURE_* environment variables with descriptions and examples
    - Document required Azure RBAC permissions (Virtual Machine Contributor or custom role)
    - Include feature summary (inventory, facts, provisioning, lifecycle, resource discovery)
    - Include troubleshooting table: invalid credentials, missing subscription ID, permission errors, unreachable API, resource group discovery failures
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [~] 11.2 Update scripts/setup.sh with Azure section
    - Add Azure integration section in the Integrations block after the SSH section
    - Prompt for AZURE_ENABLED (default "n")
    - When enabled, prompt for AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_SUBSCRIPTION_ID, and optionally AZURE_RESOURCE_GROUPS
    - Append Azure configuration block to generated backend/.env
    - _Requirements: 14.6, 14.7_

- [ ] 12. Final checkpoint — All tasks complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- The Azure integration mirrors the AWS integration patterns throughout (plugin structure, routes, config, frontend guide)
- Azure SDK packages: @azure/arm-compute, @azure/identity, @azure/arm-network, @azure/arm-resources, @azure/arm-subscriptions
