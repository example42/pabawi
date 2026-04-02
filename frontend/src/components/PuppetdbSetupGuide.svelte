<script lang="ts">
  import { showSuccess, showError } from '../lib/toast.svelte';

  let selectedAuth = $state<"token" | "ssl">("token");
  let showAdvanced = $state(false);
  let copied = $state(false);

  let config = $state({
    serverUrl: '',
    port: 8081,
    token: '',
    ssl_ca: '',
    ssl_cert: '',
    ssl_key: '',
    ssl_rejectUnauthorized: true,
  });

  /** Sensitive env var keys that should be masked in the preview */
  const sensitiveKeys = new Set(['PUPPETDB_TOKEN']);

  function generateEnvSnippet(): string {
    const lines: string[] = [
      '# PuppetDB Integration Configuration',
      'PUPPETDB_ENABLED=true',
      `PUPPETDB_SERVER_URL=${config.serverUrl || 'https://puppetdb.example.com'}`,
      `PUPPETDB_PORT=${config.port}`,
    ];

    if (selectedAuth === 'token') {
      lines.push(`PUPPETDB_TOKEN=${config.token || 'your-api-token-here'}`);
    } else {
      lines.push('PUPPETDB_SSL_ENABLED=true');
      lines.push(`PUPPETDB_SSL_CA=${config.ssl_ca || '/etc/puppetlabs/puppet/ssl/certs/ca.pem'}`);
      lines.push(`PUPPETDB_SSL_CERT=${config.ssl_cert || '/etc/puppetlabs/puppet/ssl/certs/hostname.pem'}`);
      lines.push(`PUPPETDB_SSL_KEY=${config.ssl_key || '/etc/puppetlabs/puppet/ssl/private_keys/hostname.pem'}`);
      lines.push(`PUPPETDB_SSL_REJECT_UNAUTHORIZED=${config.ssl_rejectUnauthorized}`);
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
PUPPETDB_TIMEOUT=30000
PUPPETDB_RETRY_ATTEMPTS=3
PUPPETDB_RETRY_DELAY=1000
PUPPETDB_CACHE_TTL=300000
PUPPETDB_CIRCUIT_BREAKER_THRESHOLD=5
PUPPETDB_CIRCUIT_BREAKER_TIMEOUT=60000
PUPPETDB_CIRCUIT_BREAKER_RESET_TIMEOUT=30000`;
</script>

<div class="max-w-4xl mx-auto px-4 py-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
  <div class="mb-8">
    <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">PuppetDB Integration Setup</h2>
    <p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
      Generate a <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">.env</code> snippet to configure Pabawi for PuppetDB dynamic inventory discovery,
      node facts retrieval, Puppet run reports viewing, and event tracking.
    </p>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Prerequisites</h3>
      <ul class="space-y-2 text-gray-700 dark:text-gray-300">
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          A running PuppetDB instance (version 6.0 or later)
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          Network access to the PuppetDB API (default port 8081)
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          Authentication credentials (token or SSL certificates)
        </li>
      </ul>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 1: Configure Connection</h3>

      <div class="space-y-4">
        <div>
          <label for="puppetdb-server-url" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Server URL *
          </label>
          <input
            id="puppetdb-server-url"
            type="text"
            bind:value={config.serverUrl}
            placeholder="https://puppetdb.example.com"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label for="puppetdb-port" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Port *
          </label>
          <input
            id="puppetdb-port"
            type="number"
            bind:value={config.port}
            min="1"
            max="65535"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Default: 8081</p>
        </div>

        <div>
          <div class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
            Authentication Method *
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4" role="group" aria-label="Authentication Method">
            <button
              class="p-4 border-2 rounded-lg text-left transition-all {selectedAuth === 'token'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-400'}"
              onclick={() => (selectedAuth = "token")}
            >
              <div class="flex items-center gap-3 mb-2">
                <span class="text-2xl">🔑</span>
                <span class="font-semibold text-gray-900 dark:text-white">Token Authentication</span>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Puppet Enterprise Only - Easier to rotate</p>
            </button>

            <button
              class="p-4 border-2 rounded-lg text-left transition-all {selectedAuth === 'ssl'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-400'}"
              onclick={() => (selectedAuth = "ssl")}
            >
              <div class="flex items-center gap-3 mb-2">
                <span class="text-2xl">🔒</span>
                <span class="font-semibold text-gray-900 dark:text-white">SSL Certificate</span>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Required for Open Source Puppet and OpenVox</p>
            </button>
          </div>
        </div>

        {#if selectedAuth === "token"}
          <div class="mt-4">
            <label for="puppetdb-token" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              API Token *
            </label>
            <input
              id="puppetdb-token"
              type="password"
              bind:value={config.token}
              placeholder="Enter your PuppetDB API token"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div class="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Generate API Token (Puppet Enterprise Only)</h4>
            <p class="text-gray-700 dark:text-gray-300 mb-3"><strong>Note:</strong> Token authentication is only available with Puppet Enterprise. Open Source Puppet and OpenVox installations must use SSL certificates.</p>
            <p class="text-gray-700 dark:text-gray-300 mb-3">Run these commands on your Puppetserver:</p>
            <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1">
              <div>puppet access login --lifetime 1y</div>
              <div>puppet access show</div>
            </div>
          </div>
        {:else}
          <div class="mt-4 space-y-4">
            <div>
              <label for="puppetdb-ssl-ca" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                CA Certificate Path *
              </label>
              <input
                id="puppetdb-ssl-ca"
                type="text"
                bind:value={config.ssl_ca}
                placeholder="/etc/puppetlabs/puppet/ssl/certs/ca.pem"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label for="puppetdb-ssl-cert" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Client Certificate Path *
              </label>
              <input
                id="puppetdb-ssl-cert"
                type="text"
                bind:value={config.ssl_cert}
                placeholder="/etc/puppetlabs/puppet/ssl/certs/pabawi.pem"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label for="puppetdb-ssl-key" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Private Key Path *
              </label>
              <input
                id="puppetdb-ssl-key"
                type="text"
                bind:value={config.ssl_key}
                placeholder="/etc/puppetlabs/puppet/ssl/private_keys/pabawi.pem"
                class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  bind:checked={config.ssl_rejectUnauthorized}
                  class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Verify SSL certificates
                </span>
              </label>
              {#if !config.ssl_rejectUnauthorized}
                <p class="mt-1 text-sm text-yellow-600 dark:text-yellow-400">
                  ⚠️ SSL verification disabled. Only use for testing with self-signed certificates.
                </p>
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
              <div># Copy the generated files to your local machine:</div>
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
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Advanced Configuration (Optional)</h3>

      <button
        class="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        onclick={() => (showAdvanced = !showAdvanced)}
      >
        <span class="text-sm">{showAdvanced ? "▼" : "▶"}</span>
        <span>Show Advanced Configuration</span>
      </button>

      {#if showAdvanced}
        <div class="mt-4 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
            <span class="font-medium text-gray-900 dark:text-white text-sm">Advanced Options</span>
            <button
              class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
              onclick={() => copySnippet(advancedConfig)}
            >
              📋 Copy
            </button>
          </div>
          <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{advancedConfig}</pre>
        </div>

        <div class="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg">
          <h4 class="font-medium text-gray-900 dark:text-white mb-2">Configuration Options:</h4>
          <ul class="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li><strong>PUPPETDB_CACHE_TTL</strong>: Cache duration in milliseconds (default: 300000)</li>
            <li><strong>PUPPETDB_CIRCUIT_BREAKER_*</strong>: Resilience settings for connection failures</li>
          </ul>
        </div>
      {/if}
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 3: Restart and Verify</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">After pasting the snippet into <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">backend/.env</code>, restart the backend:</p>
      <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1 mb-4">
        <div>cd backend</div>
        <div>npm run dev</div>
      </div>
      <ol class="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
        <li>Open the <strong>Integration Status</strong> dashboard in Pabawi</li>
        <li>Confirm <strong>PuppetDB</strong> status is connected</li>
        <li>Navigate to the <strong>Inventory</strong> page to see discovered nodes</li>
      </ol>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Features Available</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">📊</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Dynamic Inventory</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Automatic node discovery from PuppetDB</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">📋</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Node Facts</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Retrieve comprehensive system facts</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">📈</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Puppet Reports</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">View run reports and status</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">🔍</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Event Tracking</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Monitor resource changes and events</p>
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
            Connection Errors
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "Failed to connect to PuppetDB"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Verify network connectivity and firewall rules</li>
              <li>Test connection: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">curl -k https://puppetdb.example.com:8081/pdb/meta/v1/version</code></li>
              <li>Check PUPPETDB_SERVER_URL is correct</li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Authentication Errors
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "Authentication failed"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>For token auth: Run <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">puppet access show</code> to verify token</li>
              <li>For SSL auth: Check certificate paths and permissions</li>
              <li>Ensure certificates are readable by the backend process</li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            SSL Certificate Errors
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "SSL certificate verification failed"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>For self-signed certs: Set <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">PUPPETDB_SSL_REJECT_UNAUTHORIZED=false</code></li>
              <li>Or add CA certificate to system trusted store</li>
              <li>Verify certificate paths are correct</li>
            </ul>
          </div>
        </details>
      </div>
    </div>
  </div>

  <div class="mt-8 text-center">
    <p class="text-gray-600 dark:text-gray-400">
      For detailed documentation, see the PuppetDB Integration guide in the documentation.
    </p>
  </div>
</div>
