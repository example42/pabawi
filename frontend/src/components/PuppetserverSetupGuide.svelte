<script lang="ts">
  import { showSuccess, showError } from '../lib/toast.svelte';

  let selectedAuth = $state<"token" | "ssl">("token");
  let showAdvanced = $state(false);
  let copied = $state(false);

  let config = $state({
    serverUrl: '',
    port: 8140,
    token: '',
    ssl_ca: '',
    ssl_cert: '',
    ssl_key: '',
    ssl_rejectUnauthorized: true,
  });

  /** Sensitive env var keys that should be masked in the preview */
  const sensitiveKeys = new Set(['PUPPETSERVER_TOKEN']);

  function generateEnvSnippet(): string {
    const lines: string[] = [
      '# Puppetserver Integration Configuration',
      'PUPPETSERVER_ENABLED=true',
      `PUPPETSERVER_SERVER_URL=${config.serverUrl || 'https://puppet.example.com'}`,
      `PUPPETSERVER_PORT=${config.port}`,
    ];

    if (selectedAuth === 'token') {
      lines.push(`PUPPETSERVER_TOKEN=${config.token || 'your-api-token-here'}`);
    } else {
      lines.push('PUPPETSERVER_SSL_ENABLED=true');
      lines.push(`PUPPETSERVER_SSL_CA=${config.ssl_ca || '/etc/puppetlabs/puppet/ssl/certs/ca.pem'}`);
      lines.push(`PUPPETSERVER_SSL_CERT=${config.ssl_cert || '/etc/puppetlabs/puppet/ssl/certs/admin.pem'}`);
      lines.push(`PUPPETSERVER_SSL_KEY=${config.ssl_key || '/etc/puppetlabs/puppet/ssl/private_keys/admin.pem'}`);
      lines.push(`PUPPETSERVER_SSL_REJECT_UNAUTHORIZED=${config.ssl_rejectUnauthorized}`);
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
          if (value && value !== 'your-api-token-here') {
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

  const copySnippet = (text: string): void => {
    navigator.clipboard.writeText(text);
    showSuccess('Copied to clipboard');
  };

  function validateForm(): boolean {
    if (!config.serverUrl) return false;
    if (!config.port || config.port < 1 || config.port > 65535) return false;
    if (selectedAuth === 'token' && !config.token) return false;
    if (selectedAuth === 'ssl' && (!config.ssl_ca || !config.ssl_cert || !config.ssl_key)) return false;
    return true;
  }

  const isFormValid = $derived(validateForm());

  const advancedConfig = `# Advanced Configuration
PUPPETSERVER_TIMEOUT=30000
PUPPETSERVER_RETRY_ATTEMPTS=3
PUPPETSERVER_RETRY_DELAY=1000
PUPPETSERVER_INACTIVITY_THRESHOLD=3600
PUPPETSERVER_CACHE_TTL=300000
PUPPETSERVER_CIRCUIT_BREAKER_THRESHOLD=5
PUPPETSERVER_CIRCUIT_BREAKER_TIMEOUT=60000
PUPPETSERVER_CIRCUIT_BREAKER_RESET_TIMEOUT=30000`;

  const authConfConfig = `# /etc/puppetlabs/puppetserver/conf.d/auth.conf
# Modify these existing rules to add "pabawi" to the allow list:

# 1. Find the "puppetlabs node" rule and update it:
{
    match-request: {
        path: "^/puppet/v3/node/([^/]+)$"
        type: regex
        method: get
    },
    allow: [ "$1", "pabawi" ],  # Add "pabawi" here
    sort-order: 500,
    name: "puppetlabs node",
}

# 2. Find the "puppetlabs v3 catalog from agents" rule and update it:
{
    match-request: {
        path: "^/puppet/v3/catalog/([^/]+)$"
        type: regex
        method: get
    },
    allow: [ "$1", "pabawi" ],  # Add "pabawi" here
    sort-order: 500,
    name: "puppetlabs v3 catalog from agents",
}

# 3. Add this new rule for environment cache management:
{
    match-request: {
        path: "/puppet-admin-api/v1/environment-cache"
        type: path
        method: delete
    },
    allow: "pabawi",
    sort-order: 500,
    name: "pabawi environment cache",
}`;
</script>

<div class="max-w-4xl mx-auto px-4 py-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
  <div class="mb-8">
    <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">Puppetserver Integration Setup</h2>
    <p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
      Generate a <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">.env</code> snippet to configure Pabawi for Puppetserver certificate management,
      catalog compilation, and node monitoring.
    </p>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Prerequisites</h3>
      <ul class="space-y-2 text-gray-700 dark:text-gray-300">
        <li class="flex items-start"><span class="text-blue-500 mr-2">•</span>A running Puppetserver instance (version 6.x or 7.x)</li>
        <li class="flex items-start"><span class="text-blue-500 mr-2">•</span>Network access to the Puppetserver API (default port 8140)</li>
        <li class="flex items-start"><span class="text-blue-500 mr-2">•</span>Authentication credentials (token or SSL certificates)</li>
      </ul>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 1: Configure Connection</h3>
      <div class="space-y-4">
        <div>
          <label for="puppetserver-server-url" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Server URL *</label>
          <input id="puppetserver-server-url" type="text" bind:value={config.serverUrl} placeholder="https://puppet.example.com" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
        </div>
        <div>
          <label for="puppetserver-port" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Port *</label>
          <input id="puppetserver-port" type="number" bind:value={config.port} min="1" max="65535" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Default: 8140</p>
        </div>
        <div>
          <div class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Authentication Method *</div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4" role="group" aria-label="Authentication Method">
            <button class="p-4 border-2 rounded-lg text-left transition-all {selectedAuth === 'token' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-400'}" onclick={() => (selectedAuth = "token")}>
              <div class="flex items-center gap-3 mb-2"><span class="text-2xl">🔑</span><span class="font-semibold text-gray-900 dark:text-white">Token Authentication</span></div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Puppet Enterprise Only - Easier to rotate</p>
            </button>
            <button class="p-4 border-2 rounded-lg text-left transition-all {selectedAuth === 'ssl' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-400'}" onclick={() => (selectedAuth = "ssl")}>
              <div class="flex items-center gap-3 mb-2"><span class="text-2xl">🔒</span><span class="font-semibold text-gray-900 dark:text-white">SSL Certificate</span></div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Required for Open Source Puppet</p>
            </button>
          </div>
        </div>

        {#if selectedAuth === "token"}
          <div class="mt-4">
            <label for="puppetserver-token" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">API Token *</label>
            <input id="puppetserver-token" type="password" bind:value={config.token} placeholder="Enter your Puppetserver API token" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
          <div class="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Generate API Token (Puppet Enterprise Only)</h4>
            <p class="text-gray-700 dark:text-gray-300 mb-3"><strong>Note:</strong> Token authentication is only available with Puppet Enterprise. Open Source Puppet installations must use SSL certificates.</p>
            <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1">
              <div># Login with a user that has required RBAC permissions</div>
              <div>puppet access login --lifetime 1y</div>
              <div>puppet access show</div>
            </div>
          </div>
        {:else}
          <div class="mt-4 space-y-4">
            <div>
              <label for="puppetserver-ssl-ca" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">CA Certificate Path *</label>
              <input id="puppetserver-ssl-ca" type="text" bind:value={config.ssl_ca} placeholder="/etc/puppetlabs/puppet/ssl/certs/ca.pem" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label for="puppetserver-ssl-cert" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Client Certificate Path *</label>
              <input id="puppetserver-ssl-cert" type="text" bind:value={config.ssl_cert} placeholder="/etc/puppetlabs/puppet/ssl/certs/pabawi.pem" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label for="puppetserver-ssl-key" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Private Key Path *</label>
              <input id="puppetserver-ssl-key" type="text" bind:value={config.ssl_key} placeholder="/etc/puppetlabs/puppet/ssl/private_keys/pabawi.pem" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <div>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" bind:checked={config.ssl_rejectUnauthorized} class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Verify SSL certificates</span>
              </label>
              {#if !config.ssl_rejectUnauthorized}
                <p class="mt-1 text-sm text-yellow-600 dark:text-yellow-400">⚠️ SSL verification disabled. Only use for testing with self-signed certificates.</p>
              {/if}
            </div>
          </div>
          <div class="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Certificate Generation</h4>
            <p class="text-gray-700 dark:text-gray-300 mb-3">Generate the certificate on the Puppetserver and copy it locally:</p>
            <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1">
              <div># On the Puppetserver</div>
              <div>puppetserver ca generate --certname pabawi</div>
              <div></div>
              <div># Copy the generated files:</div>
              <div># CA: /etc/puppetlabs/puppet/ssl/certs/ca.pem</div>
              <div># Cert: /etc/puppetlabs/puppet/ssl/certs/pabawi.pem</div>
              <div># Key: /etc/puppetlabs/puppet/ssl/private_keys/pabawi.pem</div>
            </div>
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
          <button class="px-4 py-1.5 text-white text-sm rounded transition-colors flex items-center gap-2 {copied ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'}" onclick={copyToClipboard}>
            {#if copied}✓ Copied{:else}📋 Copy to Clipboard{/if}
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
          <p class="text-sm text-gray-700 dark:text-gray-300">Fill in the required fields above to generate a complete snippet.</p>
        </div>
      {/if}
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 3: Configure Puppetserver Authorization</h3>
      {#if selectedAuth === "token"}
        <div class="p-4 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 rounded-r-lg">
          <h4 class="font-medium text-gray-900 dark:text-white mb-2">✅ Token Authentication Benefits:</h4>
          <ul class="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li>• No need to modify auth.conf files</li>
            <li>• Permissions managed through PE Console RBAC</li>
            <li>• Easier to rotate and manage</li>
            <li>• Centralized access control</li>
          </ul>
        </div>
      {:else}
        <p class="text-gray-700 dark:text-gray-300 mb-3">For SSL certificate authentication, modify Puppetserver's auth.conf to include "pabawi" in the allow lists:</p>
        <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden mb-4">
          <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
            <span class="font-medium text-gray-900 dark:text-white text-sm">Required auth.conf Modifications</span>
            <button class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors" onclick={() => copySnippet(authConfConfig)}>📋 Copy</button>
          </div>
          <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{authConfConfig}</pre>
        </div>
        <p class="text-gray-700 dark:text-gray-300 mb-3">After updating auth.conf, restart Puppetserver:</p>
        <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm">sudo systemctl restart puppetserver</div>
      {/if}
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Advanced Configuration (Optional)</h3>
      <button class="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" onclick={() => (showAdvanced = !showAdvanced)}>
        <span class="text-sm">{showAdvanced ? "▼" : "▶"}</span>
        <span>Show Advanced Configuration</span>
      </button>
      {#if showAdvanced}
        <div class="mt-4 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
            <span class="font-medium text-gray-900 dark:text-white text-sm">Advanced Options</span>
            <button class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors" onclick={() => copySnippet(advancedConfig)}>📋 Copy</button>
          </div>
          <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{advancedConfig}</pre>
        </div>
        <div class="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg">
          <h4 class="font-medium text-gray-900 dark:text-white mb-2">Configuration Options:</h4>
          <ul class="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li><strong>PUPPETSERVER_INACTIVITY_THRESHOLD</strong>: Seconds before a node is marked inactive (default: 3600)</li>
            <li><strong>PUPPETSERVER_CACHE_TTL</strong>: Cache duration in milliseconds (default: 300000)</li>
            <li><strong>PUPPETSERVER_CIRCUIT_BREAKER_*</strong>: Resilience settings for connection failures</li>
          </ul>
        </div>
      {/if}
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 4: Restart and Verify</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">After pasting the snippet into <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">backend/.env</code>, restart the backend:</p>
      <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1 mb-4">
        <div>cd backend</div>
        <div>npm run dev</div>
      </div>
      <ol class="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
        <li>Open the <strong>Integration Status</strong> dashboard in Pabawi</li>
        <li>Confirm <strong>Puppetserver</strong> status is connected</li>
        <li>Navigate to the <strong>Inventory</strong> page to see managed nodes</li>
      </ol>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Features Available</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">📊</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Node Monitoring</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Track node status and activity</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">📋</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Catalog Inspection</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">View and diff compiled catalogs</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">🔐</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Certificate Management</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Manage Puppet agent certificates</p>
        </div>
      </div>
    </div>
  </div>

  <div class="mt-8 text-center">
    <p class="text-gray-600 dark:text-gray-400">For detailed documentation, see the Puppetserver Integration guide in the documentation.</p>
  </div>
</div>
