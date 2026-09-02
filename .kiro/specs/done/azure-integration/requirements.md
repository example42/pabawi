# Requirements Document

## Introduction

Azure integration for Pabawi, providing VM provisioning, lifecycle management, inventory discovery, facts gathering, and journal tracking for Azure Virtual Machines. This integration follows the same plugin architecture as the existing AWS integration — extending BasePlugin, registering with IntegrationManager, and implementing both InformationSourcePlugin and ExecutionToolPlugin interfaces. It uses the Azure SDK for JavaScript (`@azure/arm-compute`, `@azure/identity`, `@azure/arm-network`, `@azure/arm-resources`) to interact with Azure Resource Manager APIs.

## Glossary

- **Azure_Plugin**: The integration plugin class that extends BasePlugin and implements both InformationSourcePlugin and ExecutionToolPlugin interfaces for Azure VM management
- **Azure_Service**: The service class that wraps Azure SDK clients to provide inventory discovery, facts retrieval, resource discovery, provisioning, and lifecycle operations
- **Integration_Manager**: The central service that manages all integration plugins, handles registration, initialization, and multi-source data aggregation
- **Integration_Color_Service**: The service that provides consistent color coding for each integration in the UI
- **Journal_Service**: The service that records and retrieves a unified timeline of events for inventory nodes
- **Journal_Collector**: A function that collects Azure-specific state change entries for the journal timeline
- **Node**: A standardized representation of an infrastructure target (VM, container, server) used across all integrations
- **Facts**: A standardized collection of system information gathered about a specific node
- **Node_Group**: A logical grouping of nodes by shared attributes (resource group, region, tags)
- **Config_Service**: The centralized configuration service (ConfigService class in backend/src/config/ConfigService.ts) backed by Zod validation (backend/src/config/schema.ts) that parses AZURE_* environment variables from backend/.env via parseIntegrationsConfig() and exposes them through getAzureConfig()
- **Setup_Guide**: A Svelte frontend component that provides form fields for an integration's configuration values, generates a .env snippet using a generateEnvSnippet() function, displays a masked preview of sensitive values, and offers a copy-to-clipboard button — the user then manually pastes the snippet into backend/.env (no web-based configuration saving)
- **Subscription**: An Azure subscription that contains resource groups and resources
- **Resource_Group**: An Azure resource group that serves as a logical container for Azure resources
- **VM_Size**: An Azure VM size specification defining vCPUs, memory, and other hardware characteristics

## Requirements

### Requirement 1: Plugin Registration and Initialization

**User Story:** As a Pabawi administrator, I want the Azure integration to register with the IntegrationManager following the standard plugin architecture, so that Azure VMs appear alongside other infrastructure sources.

#### Acceptance Criteria

1. THE Azure_Plugin SHALL extend BasePlugin with type "both" to support both InformationSourcePlugin and ExecutionToolPlugin interfaces
2. WHEN the Azure integration is enabled in configuration, THE Azure_Plugin SHALL register with the Integration_Manager during server startup
3. WHEN the Azure integration is disabled in configuration, THE Azure_Plugin SHALL skip registration and log an informational message
4. WHEN Azure credentials are provided via environment variables, THE Azure_Plugin SHALL initialize the Azure_Service with those credentials
5. IF no Azure credentials or managed identity configuration is provided, THEN THE Azure_Plugin SHALL log an informational message indicating the default credential chain is used
6. IF the Azure_Plugin fails to initialize, THEN THE Azure_Plugin SHALL log the error and allow the server to continue starting without the Azure integration

### Requirement 2: Configuration via Environment Variables

**User Story:** As a Pabawi administrator, I want to configure the Azure integration exclusively through environment variables in backend/.env validated by ConfigService, so that credentials and settings are managed consistently with other integrations and no web-based configuration saving is involved.

#### Acceptance Criteria

1. THE Config_Service SHALL parse AZURE_* environment variables from backend/.env in the parseIntegrationsConfig() method following the same pattern as the existing AWS configuration block (checking AZURE_ENABLED, then reading AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_SUBSCRIPTION_ID, and AZURE_RESOURCE_GROUPS)
2. THE Zod schema in backend/src/config/schema.ts SHALL define an AzureConfigSchema with fields: enabled (boolean, default false), tenantId (optional string), clientId (optional string), clientSecret (optional string), subscriptionId (optional string), and resourceGroups (optional string array), and the IntegrationsConfigSchema SHALL include an optional azure field using AzureConfigSchema
3. WHEN AZURE_ENABLED is set to true in backend/.env, THE Config_Service SHALL include the Azure configuration in the integrations config object
4. WHEN explicit credentials (tenantId, clientId, clientSecret) are provided via environment variables, THE Azure_Service SHALL use ClientSecretCredential for authentication
5. WHEN no explicit credentials are provided via environment variables, THE Azure_Service SHALL fall back to DefaultAzureCredential (supporting managed identity, CLI credentials, and environment variables)
6. IF AZURE_ENABLED is true but subscriptionId is missing, THEN THE Azure_Plugin SHALL fail initialization with a descriptive error message
7. THE Config_Service SHALL expose a getAzureConfig() accessor method following the same pattern as getAWSConfig(), returning the typed Azure configuration when enabled or null when disabled

### Requirement 3: Health Check and Credential Validation

**User Story:** As a Pabawi administrator, I want to verify that Azure credentials are valid and the integration is healthy, so that I can diagnose connectivity issues.

#### Acceptance Criteria

1. WHEN a health check is requested, THE Azure_Plugin SHALL validate credentials by listing subscriptions via the Azure SDK
2. WHEN credentials are valid, THE Azure_Plugin SHALL return a healthy status with subscription details (subscription name, subscription ID, tenant ID)
3. IF credentials are invalid or expired, THEN THE Azure_Plugin SHALL return an unhealthy status with a descriptive error message
4. IF the Azure API is unreachable, THEN THE Azure_Plugin SHALL return an unhealthy status indicating a connectivity failure
5. THE Azure_Plugin SHALL expose a test connection endpoint at POST /api/integrations/azure/test that returns success status and message

### Requirement 4: Inventory Source

**User Story:** As an infrastructure engineer, I want Azure VMs to appear in the Pabawi inventory alongside VMs from other sources, so that I have a unified view of all infrastructure.

#### Acceptance Criteria

1. WHEN inventory is requested, THE Azure_Service SHALL query all configured resource groups for VM instances using the Azure Compute Management client
2. WHEN no specific resource groups are configured, THE Azure_Service SHALL discover VMs across all resource groups in the subscription
3. THE Azure_Service SHALL transform each Azure VM into a Node object with id format "azure:{subscriptionId}:{resourceGroup}:{vmName}", name from the VM name, source "azure", and config containing vmId, powerState, vmSize, resourceGroup, location, and tags
4. THE Azure_Service SHALL include the VM power state (running, stopped, deallocated, etc.) as the node status for UI display
5. IF a resource group query fails, THEN THE Azure_Service SHALL log the error and continue querying remaining resource groups

### Requirement 5: Node Grouping

**User Story:** As an infrastructure engineer, I want Azure VMs grouped by resource group, location, and tags, so that I can organize and filter infrastructure logically.

#### Acceptance Criteria

1. WHEN groups are requested, THE Azure_Service SHALL create Node_Group objects grouping VMs by Azure location (region)
2. THE Azure_Service SHALL create Node_Group objects grouping VMs by resource group
3. THE Azure_Service SHALL create Node_Group objects grouping VMs by well-known tag keys (Environment, Project, Team, Application)
4. EACH Node_Group SHALL have an id in the format "azure:{groupType}:{groupValue}", source "azure", and metadata with a description

### Requirement 6: Facts Source

**User Story:** As an infrastructure engineer, I want to view detailed Azure-specific information about a VM as facts, so that I can inspect hardware, networking, OS, and configuration details.

#### Acceptance Criteria

1. WHEN facts are requested for an Azure VM, THE Azure_Service SHALL query the Azure Compute Management client for the full VM instance view (including instance status)
2. THE Azure_Service SHALL return a Facts object with categories including: system (vmName, vmId, powerState, vmSize, location, provisioningState, osType, offer, sku, version, availabilityZone), network (publicIp, privateIp, networkInterfaces, virtualNetwork, subnet, networkSecurityGroup), hardware (vmSize, osDiskSizeGB, dataDiskCount, dataDiskDetails), and custom (tags, resourceGroup, subscriptionId)
3. THE Azure_Service SHALL populate the os facts section with family (windows or linux), name from the image reference, and release information
4. THE Azure_Service SHALL populate the networking facts section with hostname, and interface details including public and private IPs
5. IF the VM is not found, THEN THE Azure_Service SHALL throw an error with a descriptive message including the VM identifier

### Requirement 7: VM Provisioning

**User Story:** As an infrastructure engineer, I want to create new Azure VMs through Pabawi, so that I can provision infrastructure without leaving the management interface.

#### Acceptance Criteria

1. WHEN a provision action is received, THE Azure_Plugin SHALL create a new VM using the Azure Compute Management client with the specified parameters (resourceGroup, vmName, location, vmSize, imageReference, adminUsername, adminPassword or sshPublicKey, networkInterfaceId)
2. WHEN provisioning succeeds, THE Azure_Plugin SHALL return an ExecutionResult with status "success" and the new VM resource ID
3. IF provisioning fails due to invalid parameters, THEN THE Azure_Plugin SHALL return an ExecutionResult with status "failed" and a descriptive error message
4. IF provisioning fails due to authentication errors, THEN THE Azure_Plugin SHALL throw an AzureAuthenticationError
5. THE Azure_Plugin SHALL expose a provisioning endpoint at POST /api/integrations/azure/provision that validates the request body with a Zod schema

### Requirement 8: VM Lifecycle Management

**User Story:** As an infrastructure engineer, I want to start, stop, restart, and deallocate Azure VMs through Pabawi, so that I can manage VM state without switching to the Azure portal.

#### Acceptance Criteria

1. WHEN a lifecycle action is received, THE Azure_Plugin SHALL execute the corresponding Azure Compute Management operation: start (powerOn), stop (powerOff), restart, or deallocate
2. WHEN a lifecycle action succeeds, THE Azure_Plugin SHALL return an ExecutionResult with status "success"
3. IF a lifecycle action fails due to authentication errors, THEN THE Azure_Plugin SHALL throw an AzureAuthenticationError
4. IF a destructive action (deallocate) is requested and ALLOW_DESTRUCTIVE_PROVISIONING is false, THEN THE Azure_Plugin SHALL reject the request with a 403 status and descriptive message
5. THE Azure_Plugin SHALL expose a lifecycle endpoint at POST /api/integrations/azure/lifecycle that validates the request body with a Zod schema accepting vmName, resourceGroup, action (start, stop, restart, deallocate), and optional subscription override
6. WHEN a lifecycle action succeeds, THE Integration_Manager SHALL invalidate the inventory cache so state changes appear immediately

### Requirement 9: Journal Integration

**User Story:** As an infrastructure engineer, I want Azure VM activities (provisioning, lifecycle changes, state transitions) recorded in the node journal, so that I have a complete audit trail of operations.

#### Acceptance Criteria

1. WHEN a provisioning action completes (success or failure), THE Azure_Plugin SHALL record a journal entry with eventType "provision", source "azure", and a summary describing the outcome
2. WHEN a lifecycle action completes (success or failure), THE Azure_Plugin SHALL record a journal entry with the appropriate eventType (start, stop, reboot, or destroy for deallocate), source "azure", and a summary describing the outcome
3. IF the Journal_Service is unavailable, THEN THE Azure_Plugin SHALL log the failure and continue without blocking the operation result
4. THE Journal_Collector SHALL provide a collectAzureStateEntry function that detects VM power state changes by comparing current state against the last recorded state in journal_entries
5. THE Journal_Collector SHALL map Azure power states to JournalEventType values: "VM running" to "start", "VM stopped" to "stop", "VM deallocated" to "stop", and "VM deleting" to "destroy"
6. THE JournalSourceSchema SHALL include "azure" as a valid source identifier

### Requirement 10: Integration Color Service Entry

**User Story:** As a Pabawi user, I want Azure-sourced data visually distinguished with a consistent color theme, so that I can quickly identify Azure resources in the UI.

#### Acceptance Criteria

1. THE Integration_Color_Service SHALL include an "azure" entry in the IntegrationColors interface with primary, light, and dark color values
2. THE "azure" color entry SHALL use a blue-toned palette visually distinct from the existing AWS cyan and Proxmox blue entries
3. THE IntegrationType type SHALL include "azure" as a valid integration type

### Requirement 11: Resource Discovery

**User Story:** As an infrastructure engineer, I want to browse available Azure locations, VM sizes, and images when provisioning VMs, so that I can make informed choices without consulting the Azure portal.

#### Acceptance Criteria

1. WHEN locations are requested, THE Azure_Service SHALL return a list of available Azure locations for the subscription
2. WHEN VM sizes are requested for a location, THE Azure_Service SHALL return available VM sizes with vCPUs, memoryMB, and osDiskSizeGB
3. WHEN VM images are requested, THE Azure_Service SHALL return available marketplace images filtered by publisher, offer, and SKU
4. THE Azure_Plugin SHALL expose resource discovery endpoints: GET /api/integrations/azure/locations, GET /api/integrations/azure/vm-sizes, GET /api/integrations/azure/images
5. WHEN resource groups are requested, THE Azure_Service SHALL return all resource groups in the subscription with name, location, and tags

### Requirement 12: API Routes

**User Story:** As a frontend developer, I want well-structured API endpoints for all Azure operations, so that I can build the Azure management UI.

#### Acceptance Criteria

1. THE Azure router SHALL be mounted at /api/integrations/azure and registered in server.ts
2. WHEN an Azure API request fails due to authentication, THE Azure router SHALL return HTTP 401 with error code "UNAUTHORIZED" and message "Azure authentication failed"
3. WHEN an Azure API request fails due to validation, THE Azure router SHALL return the Zod validation error using the standard sendValidationError utility
4. WHEN an Azure API request fails due to an internal error, THE Azure router SHALL return HTTP 500 with error code "INTERNAL_SERVER_ERROR" and a descriptive message
5. THE Azure router SHALL expose GET /api/integrations/azure/inventory for listing VMs
6. THE Azure router SHALL validate all request parameters and bodies using Zod schemas

### Requirement 13: Error Handling

**User Story:** As a Pabawi administrator, I want clear and actionable error messages from the Azure integration, so that I can diagnose and resolve issues efficiently.

#### Acceptance Criteria

1. THE Azure_Plugin SHALL define an AzureAuthenticationError class that extends Error with name "AzureAuthenticationError"
2. WHEN the Azure SDK returns an authentication or authorization error, THE Azure_Service SHALL throw an AzureAuthenticationError with the original error message
3. WHEN the Azure SDK returns a resource-not-found error, THE Azure_Service SHALL throw an Error with a message identifying the missing resource
4. THE Azure_Plugin SHALL log all errors using LoggerService with structured metadata including component "AzurePlugin" or "AzureService", operation name, and relevant context (resourceGroup, vmName, subscriptionId)

### Requirement 14: Setup Instructions and Documentation

**User Story:** As a Pabawi administrator, I want comprehensive setup instructions for the Azure integration, so that I can configure Azure credentials, subscription, and resource groups through environment variables following the same documentation patterns as other integrations.

#### Acceptance Criteria

1. THE Azure integration SHALL have a documentation file at docs/integrations/azure.md following the same structure as docs/integrations/aws.md, covering prerequisites, environment variable configuration, authentication methods, required Azure RBAC permissions, feature summary, and troubleshooting
2. THE docs/integrations/azure.md file SHALL document all Azure-specific environment variables (AZURE_ENABLED, AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_SUBSCRIPTION_ID, AZURE_RESOURCE_GROUPS) with descriptions and example values, and SHALL state that configuration is exclusively through backend/.env
3. THE docs/integrations/azure.md file SHALL document authentication options including Service Principal (client credentials), Managed Identity, and Azure CLI credential fallback via DefaultAzureCredential
4. THE docs/integrations/azure.md file SHALL include a troubleshooting table covering common issues: invalid credentials, missing subscription ID, permission errors, unreachable Azure API, and resource group discovery failures
5. THE backend/.env.example file SHALL include an "Azure integration (optional)" section with all Azure-specific environment variables, comments describing each variable, and example placeholder values consistent with the existing integration sections
6. THE scripts/setup.sh file SHALL include an Azure integration section in the Integrations block that prompts for AZURE_ENABLED (default "n"), and WHEN enabled, prompts for AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_SUBSCRIPTION_ID, and optionally AZURE_RESOURCE_GROUPS
7. WHEN Azure is enabled in the setup script, THE scripts/setup.sh SHALL append the Azure configuration block to the generated backend/.env file following the same pattern as other integration sections

### Requirement 15: Azure Setup Guide Frontend Component

**User Story:** As a Pabawi administrator, I want an AzureSetupGuide component in the frontend that generates a .env snippet for Azure configuration, so that I can quickly produce the correct environment variables to paste into backend/.env without manually writing them.

#### Acceptance Criteria

1. THE Setup_Guide SHALL be implemented as an AzureSetupGuide.svelte component in frontend/src/components/ following the same pattern as AWSSetupGuide.svelte
2. THE AzureSetupGuide SHALL provide form fields for: Tenant ID, Client ID, Client Secret (password input), Subscription ID, Resource Groups (optional, comma-separated), and a Default Location selector
3. THE AzureSetupGuide SHALL implement a generateEnvSnippet() function that produces a valid .env configuration block with AZURE_ENABLED=true and all populated AZURE_* variables
4. THE AzureSetupGuide SHALL display a masked preview of the generated snippet where sensitive values (AZURE_CLIENT_SECRET) are replaced with asterisks using a maskSensitiveValues() function, while non-sensitive values remain visible
5. THE AzureSetupGuide SHALL provide a copy-to-clipboard button that copies the unmasked .env snippet to the clipboard and displays a success toast notification
6. THE AzureSetupGuide SHALL instruct the user to paste the copied snippet into backend/.env and restart the application — the component SHALL NOT save configuration directly or imply web-based configuration persistence
7. THE frontend/src/components/index.ts file SHALL export AzureSetupGuide as a named export following the existing alphabetical convention
8. THE frontend/src/pages/IntegrationSetupPage.svelte SHALL include an {:else if integration === 'azure'} block that renders the AzureSetupGuide component, following the same layout pattern as the existing AWS block (back button, component, expert mode debug panel)
