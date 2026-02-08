<script lang="ts">
  let selectedKeyType = $state<"ed25519" | "rsa">("ed25519");
  let showAdvanced = $state(false);

  const copyToClipboard = (text: string): void => {
    navigator.clipboard.writeText(text);
  };

  const basicConfig = `# SSH Integration - Basic Configuration
SSH_ENABLED=true
SSH_CONFIG_PATH=~/.ssh/config
SSH_EXECUTION_TIMEOUT=30000`;

  const advancedConfig = `# Advanced Configuration
SSH_CONNECT_TIMEOUT=10
SSH_STRICT_HOST_KEY_CHECKING=true
SSH_COMPRESSION=false
SSH_PRIORITY=5`;

  const sshConfigBasic = `# ~/.ssh/config - Basic Configuration
Host web-server-01
    HostName 192.168.1.10
    User admin
    Port 22
    IdentityFile ~/.ssh/id_rsa

Host db-server-01
    HostName 192.168.1.20
    User root
    Port 22
    IdentityFile ~/.ssh/db_key`;

  const sshConfigAdvanced = `# ~/.ssh/config - Advanced Configuration
# Global defaults
Host *
    ServerAliveInterval 60
    ServerAliveCountMax 3
    StrictHostKeyChecking yes
    Compression yes

# Production servers
Host prod-*
    User www-data
    Port 22
    IdentityFile ~/.ssh/prod_key

Host prod-web-01
    HostName 192.168.1.10

# Bastion/Jump host
Host bastion
    HostName bastion.example.com
    User jump-user
    IdentityFile ~/.ssh/bastion_key

# Internal servers via bastion
Host internal-*
    ProxyJump bastion
    User admin
    IdentityFile ~/.ssh/internal_key

Host internal-db-01
    HostName 10.0.1.20`;

</script>

<div class="max-w-4xl mx-auto px-4 py-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
  <div class="mb-8">
    <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">SSH Integration Setup</h2>
    <p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
      Configure Pabawi to use OpenSSH for lightweight remote command execution
      and script running with automatic inventory discovery from SSH config.
    </p>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Prerequisites</h3>
      <ul class="space-y-2 text-gray-700 dark:text-gray-300">
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          OpenSSH client installed and available in PATH
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          SSH config file at ~/.ssh/config (or custom path)
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          SSH keys configured for passwordless authentication
        </li>
      </ul>

      <div class="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg">
        <p class="text-sm text-gray-700 dark:text-gray-300">
          <strong>Verify Installation:</strong>
        </p>
        <div class="mt-2 bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-sm">
          ssh -V
        </div>
      </div>
    </div>
  </div>


  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 1: Generate SSH Key</h3>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <button
          class="p-4 border-2 rounded-lg text-left transition-all {selectedKeyType === 'ed25519'
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-400'}"
          onclick={() => (selectedKeyType = "ed25519")}
        >
          <div class="flex items-center gap-3 mb-2">
            <span class="text-2xl">🔐</span>
            <span class="font-semibold text-gray-900 dark:text-white">ED25519 Key</span>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">Recommended - Modern & secure</p>
        </button>

        <button
          class="p-4 border-2 rounded-lg text-left transition-all {selectedKeyType === 'rsa'
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-400'}"
          onclick={() => (selectedKeyType = "rsa")}
        >
          <div class="flex items-center gap-3 mb-2">
            <span class="text-2xl">🔑</span>
            <span class="font-semibold text-gray-900 dark:text-white">RSA Key</span>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">Legacy compatibility</p>
        </button>
      </div>

      <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1 mb-4">
        {#if selectedKeyType === "ed25519"}
          <div># Generate ED25519 key (recommended)</div>
          <div>ssh-keygen -t ed25519 -f ~/.ssh/pabawi_key -C "pabawi@$(hostname)"</div>
        {:else}
          <div># Generate RSA key (4096-bit)</div>
          <div>ssh-keygen -t rsa -b 4096 -f ~/.ssh/pabawi_key -C "pabawi@$(hostname)"</div>
        {/if}
        <div></div>
        <div># Copy key to target nodes</div>
        <div>ssh-copy-id -i ~/.ssh/pabawi_key.pub user@target-node</div>
        <div></div>
        <div># Test connection</div>
        <div>ssh -i ~/.ssh/pabawi_key user@target-node "echo 'Success'"</div>
      </div>

      <div class="p-4 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 rounded-r-lg">
        <p class="text-sm text-gray-700 dark:text-gray-300">
          <strong>Important:</strong> Ensure proper key permissions:
        </p>
        <div class="mt-2 bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-sm space-y-1">
          <div>chmod 600 ~/.ssh/pabawi_key</div>
          <div>chmod 644 ~/.ssh/pabawi_key.pub</div>
          <div>chmod 700 ~/.ssh</div>
        </div>
      </div>
    </div>
  </div>


  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 2: Create SSH Config File</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">The SSH plugin discovers nodes from your SSH config file:</p>

      <div class="space-y-4">
        <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
            <span class="font-medium text-gray-900 dark:text-white text-sm">Basic SSH Config</span>
            <button
              class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
              onclick={() => copyToClipboard(sshConfigBasic)}
            >
              📋 Copy
            </button>
          </div>
          <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{sshConfigBasic}</pre>
        </div>

        <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
            <span class="font-medium text-gray-900 dark:text-white text-sm">Advanced SSH Config (with Jump Hosts)</span>
            <button
              class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
              onclick={() => copyToClipboard(sshConfigAdvanced)}
            >
              📋 Copy
            </button>
          </div>
          <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{sshConfigAdvanced}</pre>
        </div>
      </div>

      <div class="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg">
        <p class="text-sm text-gray-700 dark:text-gray-300">
          <strong>Set proper permissions:</strong>
        </p>
        <div class="mt-2 bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-sm">
          chmod 600 ~/.ssh/config
        </div>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 3: Configure Environment Variables</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Add these variables to your <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">backend/.env</code> file:</p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden mb-4">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">Basic Configuration</span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() => copyToClipboard(basicConfig)}
          >
            📋 Copy
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{basicConfig}</pre>
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
            <li><strong>SSH_CONNECT_TIMEOUT</strong>: Connection timeout in seconds (default: 10)</li>
            <li><strong>SSH_STRICT_HOST_KEY_CHECKING</strong>: Enable host key verification (default: true)</li>
            <li><strong>SSH_COMPRESSION</strong>: Enable SSH compression (default: false)</li>
          </ul>
        </div>
      {/if}
    </div>
  </div>


  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 4: Restart Backend Server</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Apply the configuration by restarting the backend:</p>
      <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1">
        <div>cd backend</div>
        <div>npm run dev</div>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 5: Verify Connection</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Test the integration:</p>

      <div class="space-y-3">
        <div>
          <p class="text-sm text-gray-700 dark:text-gray-300 mb-2"><strong>1. Check integration status in UI:</strong></p>
          <ul class="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 ml-4">
            <li>Navigate to the <strong>Integrations</strong> page</li>
            <li>Look for "SSH" with green status indicator</li>
          </ul>
        </div>

        <div>
          <p class="text-sm text-gray-700 dark:text-gray-300 mb-2"><strong>2. Test via API:</strong></p>
          <div class="bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-sm">
            curl http://localhost:3000/api/integrations/ssh/inventory
          </div>
        </div>

        <div>
          <p class="text-sm text-gray-700 dark:text-gray-300 mb-2"><strong>3. Test SSH directly:</strong></p>
          <div class="bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-sm space-y-1">
            <div>ssh web-server-01 "echo 'Connection successful'"</div>
            <div>ssh web-server-01 "uptime"</div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Features Available</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">⚡</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Command Execution</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Run commands on remote nodes</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">📜</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Script Execution</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Run bash, python, ruby scripts</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">📊</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Auto Inventory</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Discover nodes from SSH config</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">🚀</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Lightweight</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">No agent required</p>
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
            SSH Config Not Found
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "Config file not found"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Create config: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">touch ~/.ssh/config</code></li>
              <li>Set permissions: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">chmod 600 ~/.ssh/config</code></li>
              <li>Verify path in SSH_CONFIG_PATH variable</li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Permission Denied (publickey)
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "Permission denied (publickey)"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Check key permissions: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">chmod 600 ~/.ssh/pabawi_key</code></li>
              <li>Copy key to target: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ssh-copy-id -i ~/.ssh/pabawi_key.pub user@host</code></li>
              <li>Test manually: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ssh -v user@host</code></li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Connection Timeout
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "Connection timed out"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Verify host is reachable: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ping hostname</code></li>
              <li>Check firewall rules on target node</li>
              <li>Increase timeout: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">SSH_CONNECT_TIMEOUT=30</code></li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Host Key Verification Failed
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "Host key verification failed"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Remove old key: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ssh-keygen -R hostname</code></li>
              <li>Accept new key: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ssh-keyscan hostname >> ~/.ssh/known_hosts</code></li>
              <li>For dev only: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">SSH_STRICT_HOST_KEY_CHECKING=false</code></li>
            </ul>
          </div>
        </details>
      </div>
    </div>
  </div>

  <div class="mt-8 text-center">
    <p class="text-gray-600 dark:text-gray-400">
      For detailed documentation, see <a
        href="https://github.com/example42/pabawi/blob/main/plugins/native/ssh/SETUP.md"
        target="_blank"
        class="text-blue-600 dark:text-blue-400 hover:underline">SETUP.md</a>
    </p>
  </div>
</div>
