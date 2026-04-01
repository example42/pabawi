<script lang="ts">
  import { showSuccess, showError } from '../lib/toast.svelte';

  let config = $state({
    host: '',
    port: 8006,
    username: '',
    password: '',
    realm: 'pam',
    token: '',
    sslRejectUnauthorized: true,
  });

  let authMethod = $state<'password' | 'token'>('token');
  let showAdvanced = $state(false);
  let copied = $state(false);

  /** Sensitive env var keys that should be masked in the preview */
  const sensitiveKeys = new Set(['PROXMOX_PASSWORD', 'PROXMOX_TOKEN']);

  function generateEnvSnippet(): string {
    const lines: string[] = [
      '# Proxmox Integration Configuration',
      'PROXMOX_ENABLED=true',
      `PROXMOX_HOST=${config.host || 'proxmox.example.com'}`,
      `PROXMOX_PORT=${config.port}`,
    ];

    if (authMethod === 'password') {
      lines.push(`PROXMOX_USERNAME=${config.username || 'root'}`);
      lines.push(`PROXMOX_PASSWORD=${config.password || 'your_password_here'}`);
      lines.push(`PROXMOX_REALM=${config.realm || 'pam'}`);
    } else {
      lines.push(`PROXMOX_TOKEN=${config.token || 'PVEAPIToken=user@realm!tokenid=uuid'}`);
    }

    lines.push(`PROXMOX_SSL_REJECT_UNAUTHORIZED=${config.sslRejectUnauthorized}`);

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
          if (value && value !== 'your_password_here' && value !== 'PVEAPIToken=user@realm!tokenid=uuid') {
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

  const curlTest = $derived(
    `# Test Proxmox API connectivity
curl -k https://${config.host || 'proxmox.example.com'}:${config.port}/api2/json/version`
  );
</script>

<div class="max-w-4xl mx-auto px-4 py-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
  <div class="mb-8">
    <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">Proxmox Integration Setup</h2>
    <p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
      Generate a <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">.env</code> snippet to configure Pabawi for Proxmox VE provisioning and management.
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
                bind:checked={config.sslRejectUnauthorized}
                class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                Verify SSL certificates
              </span>
            </label>
            <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Disable only for testing with self-signed certificates. Always enable in production.
            </p>
            {#if !config.sslRejectUnauthorized}
              <div class="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 rounded-r">
                <p class="text-sm text-gray-700 dark:text-gray-300">
                  <strong>Security Warning:</strong> SSL verification is disabled. This is insecure and should only be used in development.
                </p>
              </div>
            {/if}
          </div>
        {/if}
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
            Fill in the required fields above to generate a complete snippet.
          </p>
        </div>
      {/if}
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 3: Create API Token (Recommended)</h3>
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
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 4: Validate Connection</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Test connectivity using curl before configuring Pabawi:</p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">API Test Command</span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() => { navigator.clipboard.writeText(curlTest); showSuccess('Copied to clipboard'); }}
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
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 5: Restart and Verify</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">After pasting the snippet into <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">backend/.env</code>, restart the backend:</p>
      <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1 mb-4">
        <div>cd backend</div>
        <div>npm run dev</div>
      </div>
      <ol class="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
        <li>Open the <strong>Integration Status</strong> dashboard in Pabawi</li>
        <li>Confirm <strong>Proxmox</strong> status is connected</li>
        <li>Use the <strong>Test Connection</strong> button on the dashboard to verify</li>
        <li>Navigate to <strong>Provision</strong> page to create VMs or LXC containers</li>
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
