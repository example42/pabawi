# Azure Integration

Pabawi connects to Azure to discover Virtual Machines across resource groups, manage their lifecycle, and provision new instances.

## Prerequisites

- Azure subscription with VM access
- Service Principal credentials, Managed Identity, or Azure CLI login
- `Microsoft.Subscription/subscriptions/read` permission for health checks

## Configuration

```bash
AZURE_ENABLED=true
AZURE_SUBSCRIPTION_ID=12345678-abcd-efgh-ijkl-123456789012

# Credentials (omit to use DefaultAzureCredential: managed identity, CLI, env vars)
AZURE_TENANT_ID=12345678-abcd-efgh-ijkl-123456789012
AZURE_CLIENT_ID=12345678-abcd-efgh-ijkl-123456789012
AZURE_CLIENT_SECRET=your-client-secret-value

# Optional — scope inventory to specific resource groups (comma-separated)
AZURE_RESOURCE_GROUPS=my-rg-1,my-rg-2
```

See [configuration.md](../configuration.md) for all Azure env vars.

## Authentication

**Service Principal (recommended for production):** Create an Azure AD app registration with a client secret and assign the required RBAC role.

**Managed Identity (Azure-hosted Pabawi):** No credentials needed — `DefaultAzureCredential` picks them up automatically from the VM or App Service.

**Azure CLI (development):** Run `az login` before starting Pabawi. The SDK uses the cached CLI token.

All three methods are supported through `DefaultAzureCredential`. When `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, and `AZURE_CLIENT_SECRET` are all set, `ClientSecretCredential` is used directly instead.

### Required Azure RBAC Permissions

Assign the built-in **Virtual Machine Contributor** role to the Service Principal or Managed Identity, scoped to the subscription or target resource groups.

Alternatively, create a custom role with these minimum permissions:

```json
{
  "Name": "Pabawi Azure Integration",
  "Actions": [
    "Microsoft.Compute/virtualMachines/read",
    "Microsoft.Compute/virtualMachines/write",
    "Microsoft.Compute/virtualMachines/delete",
    "Microsoft.Compute/virtualMachines/start/action",
    "Microsoft.Compute/virtualMachines/powerOff/action",
    "Microsoft.Compute/virtualMachines/restart/action",
    "Microsoft.Compute/virtualMachines/deallocate/action",
    "Microsoft.Compute/virtualMachines/instanceView/read",
    "Microsoft.Compute/virtualMachines/vmSizes/read",
    "Microsoft.Compute/locations/vmSizes/read",
    "Microsoft.Compute/images/read",
    "Microsoft.Network/networkInterfaces/read",
    "Microsoft.Network/publicIPAddresses/read",
    "Microsoft.Resources/subscriptions/resourceGroups/read",
    "Microsoft.Resources/subscriptions/locations/read",
    "Microsoft.Subscription/subscriptions/read"
  ],
  "AssignableScopes": [
    "/subscriptions/{subscription-id}"
  ]
}
```

Remove `Microsoft.Compute/virtualMachines/deallocate/action` if you want to enforce `ALLOW_DESTRUCTIVE_PROVISIONING=false` at the Azure RBAC level as well.

## What It Provides

| Feature | Details |
|---|---|
| **Inventory** | VMs across all configured resource groups (or entire subscription) |
| **Grouping** | By location, by resource group, by tag (Environment, Project, Team, Application) |
| **Facts** | VM size, OS, power state, IPs, tags, disks, provisioning state |
| **Lifecycle** | Start, stop, restart |
| **Provisioning** | Create new VMs with image, size, networking, and auth configuration |
| **Deallocate** | Release compute resources — blocked unless `ALLOW_DESTRUCTIVE_PROVISIONING=true` |
| **Resource Discovery** | Browse locations, VM sizes, marketplace images, and resource groups |

## Troubleshooting

| Problem | Fix |
|---|---|
| "Azure authentication failed" | Check `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, or verify managed identity is assigned. Run `az login` for CLI auth. |
| "AZURE_SUBSCRIPTION_ID is required" | Set `AZURE_SUBSCRIPTION_ID` in `backend/.env`. This is mandatory when `AZURE_ENABLED=true`. |
| "AuthorizationFailed" | The Service Principal or Managed Identity is missing required RBAC permissions. Assign Virtual Machine Contributor or the custom role above. |
| No VMs in inventory | Check `AZURE_RESOURCE_GROUPS`. If not set, all resource groups are queried. Verify VMs exist in the subscription. |
| "Deallocate blocked (403 DESTRUCTIVE_ACTION_DISABLED)" | Set `ALLOW_DESTRUCTIVE_PROVISIONING=true` in `backend/.env`. |
| Resource group discovery returns empty | Verify the identity has `Microsoft.Resources/subscriptions/resourceGroups/read` permission on the subscription scope. |
