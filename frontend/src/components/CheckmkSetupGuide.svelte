<script lang="ts">
  import { showSuccess, showError } from '../lib/toast.svelte';

  let showAdvanced = $state(false);
  let copied = $state(false);

  let config = $state({
    serverUrl: '',
    site: '',
    username: '',
    password: '',
    sslVerify: true,
    livestatusHost: '',
    livestatusPort: '6557',
    livestatusTls: false,
    livestatusTimeoutMs: '5000',
  });

  function generateEnvSnippet(): string {
    const lines: string[] = [
      '# Checkmk Integration Configuration',
      'CHECKMK_ENABLED=true',
      `CHECKMK_SERVER_URL=${config.serverUrl || 'https://monitoring.example.com'}`,
      `CHECKMK_SITE=${config.site || 'mysite'}`,
      `CHECKMK_USERNAME=${config.username || 'automation'}`,
      `CHECKMK_PASSWORD=${config.password || 'your-automation-secret'}`,
      `CHECKMK_SSL_VERIFY=${config.sslVerify ? 'true' : 'false'}`,
    ];

    if (config.livestatusHost) {
      lines.push('');
      lines.push('# Livestatus Configuration (enables full event history)');
      lines.push(`CHECKMK_LIVESTATUS_HOST=${config.livestatusHost}`);
      lines.push(`CHECKMK_LIVESTATUS_PORT=${config.livestatusPort || '6557'}`);
      lines.push(`CHECKMK_LIVESTATUS_TLS=${config.livestatusTls ? 'true' : 'false'}`);
      lines.push(`CHECKMK_LIVESTATUS_TIMEOUT_MS=${config.livestatusTimeoutMs || '5000'}`);
    }

    return lines.join('\n');
  }

  const envSnippet = $derived(generateEnvSnippet());

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
    if (!config.serverUrl) return false;
    if (!config.site) return false;
    if (!config.username) return false;
    if (!config.password) return false;
    return true;
  }

  const isFormValid = $derived(validateForm());
</script>

<div class="max-w-4xl mx-auto px-4 py-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
  <div class="mb-8">
    <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">Checkmk Integration Setup</h2>
    <p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
      Generate a <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">.env</code> snippet to connect Pabawi to your Checkmk instance
      for live service monitoring, host inventory discovery, and state-change event history.
    </p>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Prerequisites</h3>
      <ul class="space-y-2 text-gray-700 dark:text-gray-300">
        <li class="flex items-start"><span class="text-purple-500 mr-2">•</span>A running Checkmk instance with the REST API enabled</li>
        <li class="flex items-start"><span class="text-purple-500 mr-2">•</span>An automation user with API access (Settings → Users → Automation)</li>
        <li class="flex items-start"><span class="text-purple-500 mr-2">•</span>Network connectivity from Pabawi to the Checkmk server</li>
        <li class="flex items-start"><span class="text-purple-500 mr-2">•</span>(Optional) Livestatus TCP endpoint for full event history</li>
      </ul>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 1: Configure Connection</h3>
      <div class="space-y-4">
        <div>
          <label for="checkmk-server-url" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Server URL *</label>
          <input id="checkmk-server-url" type="text" bind:value={config.serverUrl} placeholder="https://monitoring.example.com" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Base URL of your Checkmk server (http:// or https://)</p>
        </div>
        <div>
          <label for="checkmk-site" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Site Name *</label>
          <input id="checkmk-site" type="text" bind:value={config.site} placeholder="mysite" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">The Checkmk site name (used in the API path)</p>
        </div>
        <div>
          <label for="checkmk-username" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Automation Username *</label>
          <input id="checkmk-username" type="text" bind:value={config.username} placeholder="automation" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Checkmk automation user (Settings → Users)</p>
        </div>
        <div>
          <label for="checkmk-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Automation Secret *</label>
          <input id="checkmk-password" type="password" bind:value={config.password} placeholder="automation-secret" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">The automation secret for the user above</p>
        </div>
        <div>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" bind:checked={config.sslVerify} class="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500" />
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Verify SSL/TLS certificates</span>
          </label>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Disable only for self-signed certificates in development</p>
        </div>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Advanced: Livestatus Configuration</h3>
      <button class="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors" onclick={() => (showAdvanced = !showAdvanced)}>
        <span class="text-sm">{showAdvanced ? "▼" : "▶"}</span>
        <span>Show Livestatus Settings</span>
      </button>
      {#if showAdvanced}
        <div class="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 border-l-4 border-purple-500 rounded-r-lg mb-4">
          <p class="text-sm text-gray-700 dark:text-gray-300">
            Livestatus enables <strong>full event history</strong> — service state-change events over the past 7 days.
            Without it, Pabawi derives only the most recent transition per service from the REST API.
          </p>
          <p class="text-sm text-gray-700 dark:text-gray-300 mt-2">
            ⚠️ The default Livestatus port (6557) uses <strong>plaintext TCP</strong> — traffic is unencrypted.
            Enable TLS below if your Checkmk instance supports encrypted Livestatus.
          </p>
        </div>
        <div class="space-y-4">
          <div>
            <label for="checkmk-livestatus-host" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Livestatus Host</label>
            <input id="checkmk-livestatus-host" type="text" bind:value={config.livestatusHost} placeholder="monitoring.example.com" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Leave empty to disable Livestatus (REST fallback only)</p>
          </div>
          <div>
            <label for="checkmk-livestatus-port" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Livestatus Port</label>
            <input id="checkmk-livestatus-port" type="text" bind:value={config.livestatusPort} placeholder="6557" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Default: 6557</p>
          </div>
          <div>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" bind:checked={config.livestatusTls} class="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500" />
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Enable TLS for Livestatus</span>
            </label>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Wraps the TCP connection in TLS (encrypted Livestatus)</p>
          </div>
          <div>
            <label for="checkmk-livestatus-timeout" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Timeout (ms)</label>
            <input id="checkmk-livestatus-timeout" type="text" bind:value={config.livestatusTimeoutMs} placeholder="5000" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent" />
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Per-request timeout before falling back to REST (default: 5000)</p>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-purple-200 dark:border-purple-700 shadow-sm mb-6 ring-2 ring-purple-100 dark:ring-purple-900">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 2: Copy Environment Variables</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">
        Copy the generated snippet below and paste it into your <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">backend/.env</code> file, then restart the application.
      </p>
      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">.env Configuration</span>
          <button class="px-4 py-1.5 text-white text-sm rounded transition-colors flex items-center gap-2 {copied ? 'bg-green-600' : 'bg-purple-600 hover:bg-purple-700'}" onclick={copyToClipboard}>
            {#if copied}✓ Copied{:else}📋 Copy to Clipboard{/if}
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap">{envSnippet}</pre>
      </div>
      {#if isFormValid}
        <div class="mt-4 p-4 bg-purple-50 dark:bg-purple-900/20 border-l-4 border-purple-500 rounded-r-lg">
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
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 3: Restart and Verify</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">After pasting the snippet into <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">backend/.env</code>, restart the backend:</p>
      <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1 mb-4">
        <div>cd backend</div>
        <div>npm run dev</div>
      </div>
      <ol class="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
        <li>Open the <strong>Integration Status</strong> dashboard in Pabawi</li>
        <li>Confirm <strong>Checkmk</strong> status is connected (healthy)</li>
        <li>Navigate to a linked node and check the <strong>Monitor</strong> tab for live service data</li>
      </ol>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Features Available</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">📡</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Live Services</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Real-time service status on the Monitor tab</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">🖥️</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Host Discovery</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Automatic inventory from Checkmk hosts</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">📜</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Event History</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">State-change events in the node journal</p>
        </div>
      </div>
    </div>
  </div>

  <div class="mt-8 text-center">
    <p class="text-gray-600 dark:text-gray-400">For detailed documentation, see the Checkmk Integration guide in the documentation.</p>
  </div>
</div>
