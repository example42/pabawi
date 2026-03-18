<script lang="ts">
  import { onMount } from 'svelte';
  import { saveIntegrationConfig, getIntegrationConfig } from '../lib/api';
  import { showSuccess, showError } from '../lib/toast.svelte';
  import { logger } from '../lib/logger.svelte';

  let selectedAuth = $state<"token" | "ssl">("token");
  let showAdvanced = $state(false);
  let saving = $state(false);
  let loadingConfig = $state(true);

  let config = $state({
    serverUrl: '',
    port: 8140,
    token: '',
    ssl_ca: '',
    ssl_cert: '',
    ssl_key: '',
    ssl_rejectUnauthorized: true,
  });

  onMount(async () => {
    try {
      const effective = await getIntegrationConfig('puppetserver');
      if (effective) {
        config.serverUrl = String(effective.serverUrl ?? '');
        config.port = Number(effective.port ?? 8140);
        config.token = String(effective.token ?? '');
        config.ssl_ca = String(effective.ssl_ca ?? '');
        config.ssl_cert = String(effective.ssl_cert ?? '');
        config.ssl_key = String(effective.ssl_key ?? '');
        config.ssl_rejectUnauthorized = effective.ssl_rejectUnauthorized !== false && effective.ssl_rejectUnauthorized !== 'false';
        if (config.token) selectedAuth = 'token';
        else if (config.ssl_ca || config.ssl_cert) selectedAuth = 'ssl';
      }
    } catch {
      // No existing config
    } finally {
      loadingConfig = false;
    }
  });

  function validateForm(): boolean {
    if (!config.serverUrl) return false;
    if (!config.port || config.port < 1 || config.port > 65535) return false;
    if (selectedAuth === 'token' && !config.token) return false;
    if (selectedAuth === 'ssl' && (!config.ssl_ca || !config.ssl_cert || !config.ssl_key)) return false;
    return true;
  }

  const isFormValid = $derived(validateForm());

  async function handleSaveConfiguration(): Promise<void> {
    saving = true;
    try {
      const payload: Record<string, unknown> = {
        serverUrl: config.serverUrl,
        port: config.port,
      };
      if (selectedAuth === 'token') {
        payload.token = config.token;
      } else {
        payload.ssl_ca = config.ssl_ca;
        payload.ssl_cert = config.ssl_cert;
        payload.ssl_key = config.ssl_key;
        payload.ssl_rejectUnauthorized = config.ssl_rejectUnauthorized;
      }
      await saveIntegrationConfig('puppetserver', payload);
      showSuccess('Puppetserver configuration saved successfully');
      logger.info('Puppetserver configuration saved', { serverUrl: config.serverUrl });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      showError(`Failed to save configuration: ${message}`);
      logger.error('Puppetserver configuration save error', { error });
    } finally {
      saving = false;
    }
  }

  const copyToClipboard = (text: string): void => {
    navigator.clipboard.writeText(text);
    showSuccess('Copied to clipboard');
  };

  const tokenConfig = `# Puppetserver Integration - Token Authentication (Puppet Enterprise Only)
PUPPETSERVER_ENABLED=true
PUPPETSERVER_SERVER_URL=https://puppet.example.com
PUPPETSERVER_PORT=8140
PUPPETSERVER_TOKEN=your-api-token-here
PUPPETSERVER_TIMEOUT=30000
PUPPETSERVER_RETRY_ATTEMPTS=3
PUPPETSERVER_RETRY_DELAY=1000`;

  const sslConfig = `# Puppetserver Integration - SSL Certificate Authentication
PUPPETSERVER_ENABLED=true
PUPPETSERVER_SERVER_URL=https://puppet.example.com
PUPPETSERVER_PORT=8140
PUPPETSERVER_SSL_ENABLED=true
PUPPETSERVER_SSL_CA=/etc/puppetlabs/puppet/ssl/certs/ca.pem
PUPPETSERVER_SSL_CERT=/etc/puppetlabs/puppet/ssl/certs/admin.pem
PUPPETSERVER_SSL_KEY=/etc/puppetlabs/puppet/ssl/private_keys/admin.pem
PUPPETSERVER_SSL_REJECT_UNAUTHORIZED=true`;

  const advancedConfig = `# Advanced Configuration
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
      Configure Pabawi to connect to your Puppetserver for certificate
      management, catalog compilation, and node monitoring.
    </p>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Prerequisites</h3>
      <ul class="space-y-2 text-gray-700 dark:text-gray-300">
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          A running Puppetserver instance (version 6.x or 7.x)
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          Network access to the Puppetserver API (default port 8140)
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
          <label for="puppetserver-server-url" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Server URL *
          </label>
          <input
            id="puppetserver-server-url"
            type="text"
            bind:value={config.serverUrl}
            placeholder="https://puppet.example.com"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label for="puppetserver-port" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Port *
          </label>
          <input
            id="puppetserver-port"
            type="number"
            bind:value={config.port}
            min="1"
            max="65535"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Default: 8140</p>
        </div>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 2: Choose Authentication Method</h3>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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
          <p class="text-sm text-gray-600 dark:text-gray-400">Required for Open Source Puppet</p>
        </button>
      </div>

      {#if selectedAuth === "token"}
        <div class="mt-4">
          <label for="puppetserver-token" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            API Token *
          </label>
          <input
            id="puppetserver-token"
            type="password"
            bind:value={config.token}
            placeholder="Enter your Puppetserver API token"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div class="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Generate API Token (Puppet Enterprise Only)</h4>
          <p class="text-gray-700 dark:text-gray-300 mb-3"><strong>Note:</strong> Token authentication is only available with Puppet Enterprise. Open Source Puppet installations must use SSL certificates.</p>

          <div class="p-3 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 rounded-r-lg mb-3">
            <p class="text-sm text-gray-700 dark:text-gray-300">
              <strong>Important:</strong> The PE Console user account used to generate the token must have the necessary RBAC permissions.
              See Step 3 for detailed permission requirements.
            </p>
          </div>

          <p class="text-gray-700 dark:text-gray-300 mb-3">Run these commands on your Puppetserver:</p>
          <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1">
            <div># Login with a user that has required RBAC permissions</div>
            <div>puppet access login --lifetime 1y</div>
            <div>puppet access show</div>
          </div>
        </div>
      {:else}
        <div class="mt-4 space-y-4">
          <div>
            <label for="puppetserver-ssl-ca" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              CA Certificate Path *
            </label>
            <input
              id="puppetserver-ssl-ca"
              type="text"
              bind:value={config.ssl_ca}
              placeholder="/etc/puppetlabs/puppet/ssl/certs/ca.pem"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label for="puppetserver-ssl-cert" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Client Certificate Path *
            </label>
            <input
              id="puppetserver-ssl-cert"
              type="text"
              bind:value={config.ssl_cert}
              placeholder="/etc/puppetlabs/puppet/ssl/certs/pabawi.pem"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label for="puppetserver-ssl-key" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Private Key Path *
            </label>
            <input
              id="puppetserver-ssl-key"
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
          <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Certificate Generation Options</h4>
          <p class="text-gray-700 dark:text-gray-300 mb-3">The certificate used for authentication should be generated with proper client authentication extensions. The same certname can be used for both Puppetserver and PuppetDB integrations for simplicity.</p>

          <div class="space-y-4">
            <div>
              <h5 class="text-md font-medium text-gray-900 dark:text-white mb-2">Option 1: Manual Certificate Generation on Puppetserver</h5>
              <p class="text-gray-700 dark:text-gray-300 mb-2">Generate the certificate directly on the Puppetserver and copy it locally:</p>
              <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1">
                <div># On the Puppetserver - NOTE: The certname used here must be the same added in auth.conf</div>
                <div>puppetserver ca generate --certname pabawi</div>
                <div></div>
                <div># Copy the generated files to your local machine:</div>
                <div># CA: /etc/puppetlabs/puppet/ssl/certs/ca.pem</div>
                <div># Cert: /etc/puppetlabs/puppet/ssl/certs/pabawi.pem</div>
                <div># Key: /etc/puppetlabs/puppet/ssl/private_keys/pabawi.pem</div>
              </div>
            </div>

            <div>
              <h5 class="text-md font-medium text-gray-900 dark:text-white mb-2">Option 2: Automated Certificate Generation Script</h5>
              <p class="text-gray-700 dark:text-gray-300 mb-2">Use the provided script to generate a CSR and manage the certificate lifecycle:</p>
              <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1">
                <div># Generate and submit CSR</div>
                <div>./scripts/generate-pabawi-cert.sh</div>
                <div></div>
                <div># After running the script, sign the certificate on Puppetserver:</div>
                <div>puppetserver ca sign --certname pabawi</div>
                <div></div>
                <div># Download the signed certificate</div>
                <div>./scripts/generate-pabawi-cert.sh --download</div>
              </div>
              <p class="text-gray-700 dark:text-gray-300 mt-2 text-sm">The script automatically updates your .env file with the certificate paths.</p>
            </div>

            <div>
              <h5 class="text-md font-medium text-gray-900 dark:text-white mb-2">Option 3: Use Existing SSL Certificates</h5>
              <p class="text-gray-700 dark:text-gray-300 mb-2">Default certificate locations on Puppetserver:</p>
              <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1">
                <div>CA: /etc/puppetlabs/puppet/ssl/certs/ca.pem</div>
                <div>Cert: /etc/puppetlabs/puppet/ssl/certs/admin.pem</div>
                <div>Key: /etc/puppetlabs/puppet/ssl/private_keys/admin.pem</div>
              </div>
            </div>
          </div>
        </div>
      {/if}

      <div class="flex gap-3 pt-6">
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
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 3: Configure Puppetserver Authorization</h3>

      <div class="p-4 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 rounded-r-lg mb-6">
        <div class="flex items-start">
          <span class="text-amber-500 text-xl mr-3">⚠️</span>
          <div>
            <h4 class="font-medium text-gray-900 dark:text-white mb-2">Important: Authorization Required</h4>
            <p class="text-gray-700 dark:text-gray-300 text-sm">
              Pabawi needs access to multiple Puppetserver API endpoints. Without proper authorization configuration,
              you'll receive 403 Forbidden errors even with valid credentials.
            </p>
          </div>
        </div>
      </div>

      <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-3">Required API Endpoints</h4>
      <p class="text-gray-700 dark:text-gray-300 mb-3">Pabawi requires access to these Puppetserver endpoints:</p>

      <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
        <ul class="space-y-1 text-sm text-gray-700 dark:text-gray-300 font-mono">
          <li>• <strong>Node Information:</strong> /puppet/v3/node/* (read node definitions)</li>
          <li>• <strong>Facts:</strong> /puppet/v3/facts/* (read node facts)</li>
          <li>• <strong>Catalogs:</strong> /puppet/v3/catalog/* (compile catalogs)</li>
          <li>• <strong>Environment Cache:</strong> /puppet-admin-api/v1/environment-cache (clear cache)</li>
          <li>• <strong>Status & Health:</strong> /status/v1/* (already allowed by default)</li>
        </ul>
      </div>

      {#if selectedAuth === "token"}
        <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-3">Configure RBAC Permissions (Puppet Enterprise)</h4>
        <p class="text-gray-700 dark:text-gray-300 mb-4">
          For token-based authentication, the user account used to generate the token must have the necessary RBAC permissions
          in the Puppet Enterprise Console.
        </p>

        <div class="p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg mb-4">
          <h4 class="font-medium text-gray-900 dark:text-white mb-2">Required RBAC Roles:</h4>
          <p class="text-gray-700 dark:text-gray-300 text-sm mb-3">
            The PE Console user must have these permissions (or be assigned to roles that include them):
          </p>
          <ul class="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li>• <strong>Certificate requests:</strong> View and manage certificate requests</li>
            <li>• <strong>Node classifier:</strong> View node groups and classes</li>
            <li>• <strong>Puppet agent:</strong> View node run status and facts</li>
            <li>• <strong>Code Manager:</strong> Deploy environments (if using environment management)</li>
            <li>• <strong>Console:</strong> View nodes and reports</li>
          </ul>
        </div>

        <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-3">Generate Token with Proper User</h4>
        <p class="text-gray-700 dark:text-gray-300 mb-3">
          Ensure you generate the token using a PE Console user account that has the required permissions:
        </p>
        <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm mb-4">
          <div># Login with a user that has the required RBAC permissions</div>
          <div>puppet access login --lifetime 1y</div>
          <div>puppet access show</div>
        </div>

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
        <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-3">Update auth.conf File</h4>
        <p class="text-gray-700 dark:text-gray-300 mb-3">
          For SSL certificate authentication, you need to modify specific rules in Puppetserver's authorization file
          (typically located at <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">/etc/puppetlabs/puppetserver/conf.d/auth.conf</code>).
          Instead of adding new rules, modify existing ones to include "pabawi" in their allow lists:
        </p>

        <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden mb-4">
          <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
            <span class="font-medium text-gray-900 dark:text-white text-sm">Required auth.conf Modifications</span>
            <button
              class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
              onclick={() => copyToClipboard(authConfConfig)}
            >
              📋 Copy
            </button>
          </div>
          <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{authConfConfig}</pre>
        </div>

        <div class="p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg mb-4">
          <h4 class="font-medium text-gray-900 dark:text-white mb-2">Configuration Notes:</h4>
          <ul class="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li>• These modifications work with the default OSS Puppetserver / Openvoxserver auth.conf</li>
            <li>• Only modify existing rules - don't replace the entire file</li>
            <li>• Add "pabawi" to the allow arrays of existing rules as shown</li>
            <li>• The certificate name must match exactly (here we used "pabawi" as the certname)</li>
            <li>• Add the new rules for catalog and environment cache access</li>
          </ul>
        </div>

        <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-3">Apply Configuration</h4>
        <p class="text-gray-700 dark:text-gray-300 mb-3">After updating auth.conf, restart Puppetserver:</p>
        <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm">
          sudo systemctl restart puppetserver
        </div>
      {/if}
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 4: Configure Environment Variables (Alternative)</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Add these variables to your <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">backend/.env</code> file:</p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden mb-4">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">
            {selectedAuth === "token"
              ? "Token Authentication Config"
              : "SSL Certificate Config"}
          </span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() =>
              copyToClipboard(
                selectedAuth === "token" ? tokenConfig : sslConfig
              )}
          >
            📋 Copy
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{selectedAuth === "token"
            ? tokenConfig
            : sslConfig}</pre>
      </div>

      <button
        class="flex items-center gap-2 px-4 py-2 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        onclick={() => (showAdvanced = !showAdvanced)}
      >
        <span class="text-sm">{showAdvanced ? "▼" : "▶"}</span>
        <span>Advanced Configuration (Optional)</span>
      </button>

      {#if showAdvanced}
        <div class="mt-4 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
            <span class="font-medium text-gray-900 dark:text-white text-sm">Advanced Options</span>
            <button
              class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
              onclick={() => copyToClipboard(advancedConfig)}
            >
              📋 Copy
            </button>
          </div>
          <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{advancedConfig}</pre>
        </div>

        <div class="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg">
          <h4 class="font-medium text-gray-900 dark:text-white mb-2">Configuration Options:</h4>
          <ul class="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li>
              <strong>INACTIVITY_THRESHOLD</strong>: Seconds before a node is
              marked inactive (default: 3600)
            </li>
            <li>
              <strong>CACHE_TTL</strong>: Cache duration in milliseconds
              (default: 300000)
            </li>
            <li>
              <strong>CIRCUIT_BREAKER_*</strong>: Resilience settings for
              connection failures
            </li>
          </ul>
        </div>
      {/if}
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 5: Restart Backend Server</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Apply the configuration by restarting the backend:</p>
      <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1">
        <div>cd backend</div>
        <div>npm run dev</div>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 6: Verify Connection</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Check the integration status:</p>
      <ol class="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300 mb-4">
        <li>Navigate to the <strong>Integrations</strong> page</li>
        <li>Look for "Puppetserver" in the list</li>
        <li>Status should show "healthy" with a green indicator</li>
      </ol>

      <p class="text-gray-700 dark:text-gray-300 mb-3">Or test via API:</p>
      <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm">
        curl http://localhost:3000/api/integrations/puppetserver/health
      </div>
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
          <span class="text-3xl block mb-2">📦</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Catalog Operations</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Compile and compare catalogs</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">🌍</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Environment Management</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Deploy and manage environments</p>
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
            <p class="mb-3"><strong>Error:</strong> "Failed to connect to Puppetserver"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Verify network connectivity and firewall rules</li>
              <li>
                Test connection: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm"
                  >curl -k https://puppet.example.com:8140/status/v1/simple</code
                >
              </li>
              <li>Check PUPPETSERVER_SERVER_URL is correct</li>
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
              <li>
                For token auth: Run <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">puppet access show</code> to verify token
              </li>
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
              <li>
                For self-signed certs: Set <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm"
                  >PUPPETSERVER_SSL_REJECT_UNAUTHORIZED=false</code
                >
              </li>
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
      For detailed documentation, see <a
        href="https://github.com/example42/pabawi/tree/main/docs/uppetserver-integration-setup.md"
        target="_blank"
        class="text-blue-600 dark:text-blue-400 hover:underline">uppetserver-integration-setup.md</a
      >
    </p>
  </div>
</div>
