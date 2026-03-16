<script lang="ts">
  import { onMount } from 'svelte';
  import { saveIntegrationConfig, getIntegrationConfig, testProxmoxConnection } from '../lib/api';
  import type { ProxmoxConfig } from '../lib/api';
  import { showSuccess, showError } from '../lib/toast.svelte';
  import { logger } from '../lib/logger.svelte';

  let config = $state<ProxmoxConfig>({
    host: '',
    port: 8006,
    username: '',
    password: '',
    realm: 'pam',
    token: '',
    ssl: { rejectUnauthorized: true }
  });

  let authMethod = $state<'password' | 'token'>('password');
  let showAdvanced = $state(false);
  let testResult = $state<{ success: boolean; message: string } | null>(null);
  let testing = $state(false);
  let saving = $state(false);
  let loadingConfig = $state(true);

  onMount(async () => {
    try {
      const effective = await getIntegrationConfig('proxmox');
      if (effective) {
        config.host = String(effective.host ?? '');
        config.port = Number(effective.port ?? 8006);
        config.username = String(effective.username ?? '');
        config.password = String(effective.password ?? '');
        config.realm = String(effective.realm ?? 'pam');
        config.token = String(effective.token ?? '');
        config.ssl = {
          rejectUnauthorized: effective.ssl_rejectUnauthorized !== false && effective.ssl_rejectUnauthorized !== 'false',
        };
        // Detect auth method from loaded config
        if (config.token) {
          authMethod = 'token';
        }
      }
    } catch {
      // No existing config — start fresh
    } finally {
      loadingConfig = false;
    }
  });

  const copyToClipboard = (text: string): void => {
    navigator.clipboard.writeText(text);
    showSuccess('Copied to clipboard');
  };

  async function handleTestConnection(): Promise<void> {
    testing = true;
    testResult = null;

    try {
      const result = await testProxmoxConnection(config);
      testResult = result;

      if (result.success) {
        showSuccess('Connection successful');
        logger.info('Proxmox connection test succeeded', { host: config.host });
      } else {
        showError(`Connection failed: ${result.message}`);
        logger.warn('Proxmox connection test failed', { host: config.host, message: result.message });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      testResult = { success: false, message };
      showError(`Connection test failed: ${message}`);
      logger.error('Proxmox connection test error', { error });
    } finally {
      testing = false;
    }
  }

  async function handleSaveConfiguration(): Promise<void> {
    saving = true;

    try {
      const configPayload: Record<string, unknown> = {
        host: config.host,
        port: config.port,
        ssl_rejectUnauthorized: config.ssl.rejectUnauthorized,
      };

      if (authMethod === 'password') {
        configPayload.username = config.username;
        configPayload.password = config.password;
        configPayload.realm = config.realm;
      } else {
        configPayload.token = config.token;
      }

      await saveIntegrationConfig('proxmox', configPayload);
      showSuccess('Configuration saved successfully');
      logger.info('Proxmox configuration saved', { host: config.host });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      showError(`Failed to save configuration: ${message}`);
      logger.error('Proxmox configuration save error', { error });
    } finally {
      saving = false;
    }
  }

  function validateForm(): boolean {
    if (!config.host) return false;
    if (!config.port || config.port < 1 || config.port > 65535) return false;

    if (authMethod === 'password') {
      if (!config.username || !config.password || !config.realm) return false;
    } else {
      if (!config.token) return false;
    }

    return true;
  }

  const isFormValid = $derived(validateForm());

  const envExample = `# Proxmox Integration Configuration
PROXMOX_ENABLED=true
PROXMOX_HOST=${config.host || 'proxmox.example.com'}
PROXMOX_PORT=${config.port}
PROXMOX_USERNAME=${config.username || 'root'}
PROXMOX_REALM=${config.realm || 'pam'}
PROXMOX_PASSWORD=your_password_here
# OR use token authentication:
# PROXMOX_TOKEN=PVEAPIToken=user@realm!tokenid=uuid`;

  const curlTest = `# Test Proxmox API connectivity
curl -k https://${config.host || 'proxmox.example.com'}:${config.port}/api2/json/version

# Test with authentication (password)
curl -k -d "username=${config.username || 'root'}@${config.realm || 'pam'}&password=YOUR_PASSWORD" \\
  https://${config.host || 'proxmox.example.com'}:${config.port}/api2/json/access/ticket

# Test with token
curl -k -H "Authorization: PVEAPIToken=USER@REALM!TOKENID=UUID" \\
  https://${config.host || 'proxmox.example.com'}:${config.port}/api2/json/version`;
</script>

<div class="max-w-4xl mx-auto px-4 py-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
  <div class="mb-8">
    <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">Proxmox Integration Setup</h2>
    <p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
      Configure Pabawi to provision and manage virtual machines and LXC containers on your Proxmox VE cluster.
    </p>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Prerequisites</h3>
      <ul class="space-y-2 text-gray-700 dark:text-gray-300">
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          Proxmox VE 7.0 or later installed and accessible
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          Network connectivity to Proxmox API (default port 8006)
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          User account with appropriate permissions (VM.Allocate, VM.Config.*, Datastore.Allocate)
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          API token or password authentication credentials
        </li>
      </ul>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 1: Configure Connection</h3>

      <div class="space-y-4">
        <div>
          <label for="proxmox-host" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Proxmox Host *
          </label>
          <input
            id="proxmox-host"
            type="text"
            bind:value={config.host}
            placeholder="proxmox.example.com"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Hostname or IP address of your Proxmox server</p>
        </div>

        <div>
          <label for="proxmox-port" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Port *
          </label>
          <input
            id="proxmox-port"
            type="number"
            bind:value={config.port}
            min="1"
            max="65535"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">API port (default: 8006)</p>
        </div>

        <div>
          <div class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
            Authentication Method *
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4" role="group" aria-label="Authentication Method">
            <button
              class="p-4 border-2 rounded-lg text-left transition-all {authMethod === 'password'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-400'}"
              onclick={() => (authMethod = 'password')}
            >
              <div class="flex items-center gap-3 mb-2">
                <span class="text-2xl">🔑</span>
                <span class="font-semibold text-gray-900 dark:text-white">Password</span>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Username and password authentication</p>
            </button>

            <button
              class="p-4 border-2 rounded-lg text-left transition-all {authMethod === 'token'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-400'}"
              onclick={() => (authMethod = 'token')}
            >
              <div class="flex items-center gap-3 mb-2">
                <span class="text-2xl">🎫</span>
                <span class="font-semibold text-gray-900 dark:text-white">API Token</span>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Token-based authentication (recommended)</p>
            </button>
          </div>
        </div>

        {#if authMethod === 'password'}
          <div class="space-y-4 mt-4">
            <div>
              <label for="proxmox-username" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Username *
              </label>
              <input
                id="proxmox-username"
                type="text"
                bind:value={config.username}
                placeholder="root"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label for="proxmox-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Password *
              </label>
              <input
                id="proxmox-password"
                type="password"
                bind:value={config.password}
                placeholder="••••••••"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label for="proxmox-realm" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Realm *
              </label>
              <select
                id="proxmox-realm"
                bind:value={config.realm}
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="pam">PAM (Linux)</option>
                <option value="pve">PVE (Proxmox)</option>
              </select>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Authentication realm</p>
            </div>
          </div>
        {:else}
          <div class="mt-4">
            <label for="proxmox-token" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API Token *
            </label>
            <input
              id="proxmox-token"
              type="text"
              bind:value={config.token}
              placeholder="PVEAPIToken=user@realm!tokenid=uuid"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            />
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Format: PVEAPIToken=user@realm!tokenid=uuid
            </p>
          </div>
        {/if}

        <button
          class="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          onclick={() => (showAdvanced = !showAdvanced)}
        >
          <span class="text-sm">{showAdvanced ? "▼" : "▶"}</span>
          <span>Advanced SSL Settings</span>
        </button>

        {#if showAdvanced}
          <div class="mt-4 p-4 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700">
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                bind:checked={config.ssl.rejectUnauthorized}
                class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                Verify SSL certificates
              </span>
            </label>
            <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Disable only for testing with self-signed certificates. Always enable in production.
            </p>
            {#if !config.ssl.rejectUnauthorized}
              <div class="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 rounded-r">
                <p class="text-sm text-gray-700 dark:text-gray-300">
                  <strong>Security Warning:</strong> SSL verification is disabled. This is insecure and should only be used in development.
                </p>
              </div>
            {/if}
          </div>
        {/if}

        <div class="flex gap-3 pt-4">
          <button
            onclick={handleTestConnection}
            disabled={!isFormValid || testing}
            class="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed flex items-center gap-2"
          >
            {#if testing}
              <span class="animate-spin">⏳</span>
              Testing...
            {:else}
              🔍 Test Connection
            {/if}
          </button>

          <button
            onclick={handleSaveConfiguration}
            disabled={!isFormValid || saving}
            class="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg transition-colors disabled:cursor-not-allowed flex items-center gap-2"
          >
            {#if saving}
              <span class="animate-spin">⏳</span>
              Saving...
            {:else}
              💾 Save Configuration
            {/if}
          </button>
        </div>

        {#if testResult}
          <div class="mt-4 p-4 rounded-lg {testResult.success
            ? 'bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500'
            : 'bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500'}">
            <p class="text-sm {testResult.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}">
              <strong>{testResult.success ? '✓ Success:' : '✗ Failed:'}</strong> {testResult.message}
            </p>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 2: Create API Token (Recommended)</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">
        For better security, create an API token in Proxmox:
      </p>
      <ol class="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300 mb-4">
        <li>Log in to Proxmox web interface</li>
        <li>Navigate to <strong>Datacenter → Permissions → API Tokens</strong></li>
        <li>Click <strong>Add</strong> and create a new token</li>
        <li>Assign appropriate privileges (VM.Allocate, VM.Config.*, Datastore.Allocate)</li>
        <li>Copy the token value (format: PVEAPIToken=user@realm!tokenid=uuid)</li>
      </ol>
      <div class="p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg">
        <p class="text-sm text-gray-700 dark:text-gray-300">
          <strong>Tip:</strong> API tokens are more secure than passwords and can be easily revoked without changing user credentials.
        </p>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 3: Environment Variables (Alternative)</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">
        Alternatively, configure via environment variables in <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">backend/.env</code>:
      </p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">Proxmox Configuration</span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() => copyToClipboard(envExample)}
          >
            📋 Copy
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{envExample}</pre>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 4: Validate Connection</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Test connectivity using curl before configuring Pabawi:</p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">API Test Commands</span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() => copyToClipboard(curlTest)}
          >
            📋 Copy
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{curlTest}</pre>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 5: Restart Backend and Verify</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Restart the backend and confirm Proxmox appears as connected:</p>
      <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1 mb-4">
        <div>cd backend</div>
        <div>npm run dev</div>
      </div>
      <ol class="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
        <li>Open the <strong>Integrations</strong> section in Pabawi</li>
        <li>Confirm <strong>Proxmox</strong> status is connected</li>
        <li>Navigate to <strong>Provision</strong> page to create VMs or LXC containers</li>
        <li>Check <strong>Inventory</strong> to see Proxmox nodes</li>
      </ol>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Features Available</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">🖥️</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">VM Provisioning</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Create and configure virtual machines</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">📦</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">LXC Containers</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Deploy lightweight containers</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">⚡</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Lifecycle Management</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Start, stop, reboot, and destroy</p>
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
            Connection Timeout
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "Connection timeout"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Verify Proxmox host is reachable: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ping {config.host || 'proxmox.example.com'}</code></li>
              <li>Check firewall allows port {config.port} access</li>
              <li>Verify Proxmox web interface is accessible</li>
              <li>Check network connectivity between Pabawi and Proxmox</li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Authentication Failed
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "Authentication failed" or "401 Unauthorized"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Verify username and password are correct</li>
              <li>Check realm is correct (pam for Linux users, pve for Proxmox users)</li>
              <li>For tokens, verify format: PVEAPIToken=user@realm!tokenid=uuid</li>
              <li>Ensure user/token has required permissions</li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            SSL Certificate Error
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "SSL certificate verification failed"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>For self-signed certificates, disable SSL verification in Advanced Settings (testing only)</li>
              <li>Install proper SSL certificate on Proxmox server</li>
              <li>Add Proxmox CA certificate to system trust store</li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Permission Denied
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "Permission denied" or "403 Forbidden"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Verify user has VM.Allocate permission</li>
              <li>Check user has VM.Config.* permissions</li>
              <li>Ensure Datastore.Allocate permission is granted</li>
              <li>For tokens, verify "Privilege Separation" is disabled or token has required privileges</li>
            </ul>
          </div>
        </details>
      </div>
    </div>
  </div>

  <div class="mt-8 text-center">
    <p class="text-gray-600 dark:text-gray-400">
      For detailed documentation, see the Proxmox Integration guide in the documentation.
    </p>
  </div>
</div>
