<script lang="ts">
  import { showSuccess, showError } from '../lib/toast.svelte';

  let config = $state({
    tenantId: '',
    clientId: '',
    clientSecret: '',
    subscriptionId: '',
    resourceGroups: '',
    defaultLocation: 'eastus',
  });

  let copied = $state(false);

  /** Sensitive env var keys that should be masked in the preview */
  const sensitiveKeys = new Set(['AZURE_CLIENT_SECRET']);

  function generateEnvSnippet(): string {
    const lines: string[] = [
      '# Azure Integration Configuration',
      'AZURE_ENABLED=true',
      `AZURE_SUBSCRIPTION_ID=${config.subscriptionId}`,
    ];

    if (config.tenantId) {
      lines.push(`AZURE_TENANT_ID=${config.tenantId}`);
    }

    if (config.clientId) {
      lines.push(`AZURE_CLIENT_ID=${config.clientId}`);
    }

    if (config.clientSecret) {
      lines.push(`AZURE_CLIENT_SECRET=${config.clientSecret}`); // pragma: allowlist secret
    }

    if (config.resourceGroups) {
      lines.push(`AZURE_RESOURCE_GROUPS=${config.resourceGroups}`);
    }

    if (config.defaultLocation) {
      lines.push(`AZURE_DEFAULT_LOCATION=${config.defaultLocation}`);
    }

    return lines.join('\n');
  }

  function maskSensitiveValues(snippet: string): string {
    return snippet
      .split('\n')
      .map((line) => {
        if (line.startsWith('#')) return line;
        const eqIndex = line.indexOf('=');
        if (eqIndex === -1) return line;
        const key = line.substring(0, eqIndex);
        if (sensitiveKeys.has(key)) {
          const value = line.substring(eqIndex + 1);
          if (value) {
            return `${key}=${'*'.repeat(Math.min(value.length, 20))}`;
          }
        }
        return line;
      })
      .join('\n');
  }

  const envSnippet = $derived(generateEnvSnippet());
  const maskedSnippet = $derived(maskSensitiveValues(envSnippet));

  async function copyToClipboard(): Promise<void> {
    try {
      await navigator.clipboard.writeText(envSnippet);
      copied = true;
      showSuccess('Copied to clipboard');
      setTimeout(() => { copied = false; }, 2000);
    } catch {
      showError('Failed to copy — please select and copy manually');
    }
  }

  function validateForm(): boolean {
    if (!config.subscriptionId) return false;
    return true;
  }

  const isFormValid = $derived(validateForm());

  const cliTest = $derived(
    `# Verify Azure CLI credentials
az account show

# List VMs in the subscription
az vm list --output table`
  );
</script>

<div class="max-w-4xl mx-auto px-4 py-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
  <div class="mb-8">
    <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">Azure Integration Setup</h2>
    <p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
      Generate a <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">.env</code> snippet to configure Pabawi for Azure VM provisioning and management.
    </p>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Prerequisites</h3>
      <ul class="space-y-2 text-gray-700 dark:text-gray-300">
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          An active Azure subscription
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          A Service Principal with Virtual Machine Contributor role (or equivalent RBAC permissions)
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          Service Principal credentials: Tenant ID, Client ID, and Client Secret
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          Network connectivity to Azure Resource Manager API endpoints
        </li>
      </ul>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 1: Configure Credentials</h3>

      <div class="space-y-4">
        <div>
          <label for="azure-subscription-id" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Subscription ID *
          </label>
          <input
            id="azure-subscription-id"
            type="text"
            bind:value={config.subscriptionId}
            placeholder="12345678-abcd-efgh-ijkl-123456789012"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Your Azure subscription ID (required)</p>
        </div>

        <div>
          <label for="azure-tenant-id" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Tenant ID
          </label>
          <input
            id="azure-tenant-id"
            type="text"
            bind:value={config.tenantId}
            placeholder="12345678-abcd-efgh-ijkl-123456789012"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Azure Active Directory tenant ID</p>
        </div>

        <div>
          <label for="azure-client-id" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Client ID
          </label>
          <input
            id="azure-client-id"
            type="text"
            bind:value={config.clientId}
            placeholder="12345678-abcd-efgh-ijkl-123456789012"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Service Principal application (client) ID</p>
        </div>

        <div>
          <label for="azure-client-secret" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Client Secret
          </label>
          <input
            id="azure-client-secret"
            type="password"
            bind:value={config.clientSecret}
            placeholder="••••••••••••••••••••"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Service Principal client secret value</p>
        </div>

        <div>
          <label for="azure-resource-groups" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Resource Groups (optional)
          </label>
          <input
            id="azure-resource-groups"
            type="text"
            bind:value={config.resourceGroups}
            placeholder="my-rg-1, my-rg-2"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Comma-separated list of resource groups to scope inventory (leave empty for all)</p>
        </div>

        <div>
          <label for="azure-default-location" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Default Location
          </label>
          <input
            id="azure-default-location"
            type="text"
            bind:value={config.defaultLocation}
            placeholder="eastus"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Default Azure location for provisioning (e.g., eastus, westeurope, southeastasia)</p>
        </div>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-blue-200 dark:border-blue-700 shadow-sm mb-6 ring-2 ring-blue-100 dark:ring-blue-900">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 2: Copy Environment Variables</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">
        Copy the generated snippet below and paste it into your <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">backend/.env</code> file, then restart the application.
      </p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">.env Configuration</span>
          <button
            class="px-4 py-1.5 text-white text-sm rounded transition-colors flex items-center gap-2 {copied
              ? 'bg-green-600'
              : 'bg-blue-600 hover:bg-blue-700'}"
            onclick={copyToClipboard}
          >
            {#if copied}
              ✓ Copied
            {:else}
              📋 Copy to Clipboard
            {/if}
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap">{maskedSnippet}</pre>
      </div>

      {#if isFormValid}
        <div class="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg">
          <p class="text-sm text-gray-700 dark:text-gray-300">
            <strong>Next:</strong> Paste into <code class="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-xs">backend/.env</code> and restart the application. Then check the <strong>Integration Status</strong> dashboard to verify the connection.
          </p>
        </div>
      {:else}
        <div class="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 rounded-r-lg">
          <p class="text-sm text-gray-700 dark:text-gray-300">
            Fill in the Subscription ID above to generate a complete snippet.
          </p>
        </div>
      {/if}
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 3: Create a Service Principal (Recommended)</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">
        Create a dedicated Service Principal with least-privilege permissions for Pabawi:
      </p>
      <ol class="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300 mb-4">
        <li>Open the Azure Portal and navigate to Azure Active Directory</li>
        <li>Go to App registrations and create a new registration (e.g., <strong>pabawi-azure</strong>)</li>
        <li>Note the Application (client) ID and Directory (tenant) ID</li>
        <li>Create a client secret under Certificates &amp; secrets</li>
        <li>Assign the <strong>Virtual Machine Contributor</strong> role at the subscription or resource group level</li>
      </ol>
      <div class="p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg">
        <p class="text-sm text-gray-700 dark:text-gray-300">
          <strong>Tip:</strong> For production, use a custom role with only the specific VM actions Pabawi needs, rather than the full Virtual Machine Contributor role.
        </p>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 4: Validate with Azure CLI</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Test your credentials using the Azure CLI before configuring Pabawi:</p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">Azure CLI Test Commands</span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() => { navigator.clipboard.writeText(cliTest); showSuccess('Copied to clipboard'); }}
          >
            📋 Copy
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{cliTest}</pre>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 5: Restart and Verify</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">After pasting the snippet into <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">backend/.env</code>, restart the backend:</p>
      <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1 mb-4">
        <div>cd backend</div>
        <div>npm run dev</div>
      </div>
      <ol class="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
        <li>Open the <strong>Integration Status</strong> dashboard in Pabawi</li>
        <li>Confirm <strong>Azure</strong> status is connected</li>
        <li>Use the <strong>Test Connection</strong> button on the dashboard to verify</li>
        <li>Navigate to <strong>Provision</strong> page to launch Azure VMs</li>
      </ol>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Features Available</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">☁️</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">VM Provisioning</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Create and configure Azure VMs</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">⚡</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Lifecycle Management</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Start, stop, restart, and deallocate</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">📋</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Inventory Discovery</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">View VMs across resource groups</p>
        </div>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Troubleshooting</h3>

      <div class="space-y-4">
        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Authentication Failed
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "Azure authentication failed" or "AuthenticationFailed"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Verify Tenant ID, Client ID, and Client Secret are correct</li>
              <li>Check that the Service Principal is not disabled or deleted</li>
              <li>Ensure the client secret has not expired</li>
              <li>Confirm the Tenant ID matches the directory where the app is registered</li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Permission Denied
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "AuthorizationFailed" or "The client does not have authorization"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Verify the Service Principal has the Virtual Machine Contributor role</li>
              <li>Check that the role assignment is scoped to the correct subscription or resource group</li>
              <li>Ensure there are no deny assignments blocking access</li>
              <li>Review Azure Activity Log for detailed authorization errors</li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Connection Timeout
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "Connection timeout" or "ECONNREFUSED"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Check network connectivity to Azure Resource Manager endpoints</li>
              <li>Verify proxy settings if behind a corporate firewall</li>
              <li>Ensure DNS resolution works for management.azure.com</li>
              <li>Check if Azure services are experiencing an outage</li>
            </ul>
          </div>
        </details>
      </div>
    </div>
  </div>

  <div class="mt-8 text-center">
    <p class="text-gray-600 dark:text-gray-400">
      For detailed documentation, see the Azure Integration guide in the documentation.
    </p>
  </div>
</div>
