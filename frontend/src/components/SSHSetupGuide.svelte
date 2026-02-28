<script lang="ts">
  let showAdvanced = $state(false);

  const copyToClipboard = (text: string): void => {
    navigator.clipboard.writeText(text);
  };

  const baseConfig = `# SSH Integration - Base Configuration
SSH_ENABLED=true
SSH_CONFIG_PATH=/config/ssh_config
SSH_DEFAULT_USER=deploy
SSH_DEFAULT_PORT=22
SSH_HOST_KEY_CHECK=true
SSH_CONNECTION_TIMEOUT=30
SSH_COMMAND_TIMEOUT=300`;

  const advancedConfig = `# Advanced Connection Pool Settings
SSH_MAX_CONNECTIONS=50
SSH_MAX_CONNECTIONS_PER_HOST=5
SSH_IDLE_TIMEOUT=300
SSH_CONCURRENCY_LIMIT=10

# Sudo Configuration
SSH_SUDO_ENABLED=true
SSH_SUDO_PASSWORDLESS=true
SSH_SUDO_USER=root

# Plugin Priority
SSH_PRIORITY=50`;

  const sshConfigExample = `# SSH Config File (OpenSSH format)
# Web servers
Host web-server-01 web01
    HostName 192.168.1.10
    User deploy
    Port 22
    IdentityFile ~/.ssh/deploy_key
    # Groups: webservers,production

Host db-server-01 db01
    HostName 192.168.1.20
    User dbadmin
    Port 2222
    IdentityFile ~/.ssh/db_key
    # Groups: databases,production

# Development servers
Host dev-*.example.com
    User developer
    Port 22
    IdentityFile ~/.ssh/dev_key
    # Groups: development

# Default settings for all hosts
Host *
    ServerAliveInterval 60
    ServerAliveCountMax 3
    StrictHostKeyChecking yes`;

  const dockerComposeExample = `version: '3.8'

services:
  pabawi:
    image: pabawi:latest
    environment:
      SSH_ENABLED: "true"
      SSH_CONFIG_PATH: "/config/ssh_config"
      SSH_DEFAULT_USER: "deploy"
      SSH_DEFAULT_KEY: "/keys/deploy_key"
      SSH_HOST_KEY_CHECK: "true"
      SSH_CONNECTION_TIMEOUT: "30"
      SSH_COMMAND_TIMEOUT: "300"
      SSH_MAX_CONNECTIONS: "50"
      SSH_CONCURRENCY_LIMIT: "10"
      SSH_SUDO_ENABLED: "true"
      SSH_SUDO_PASSWORDLESS: "true" # pragma: allowlist secret
    volumes:
      - ./ssh_config:/config/ssh_config:ro
      - ./keys:/keys:ro
      - ~/.ssh/known_hosts:/root/.ssh/known_hosts:ro`;

  const keySetup = `# Generate SSH key pair
ssh-keygen -t ed25519 -f ~/.ssh/pabawi_key -C "pabawi@example.com"

# Set correct permissions
chmod 600 ~/.ssh/pabawi_key
chmod 644 ~/.ssh/pabawi_key.pub

# Deploy public key to target hosts
ssh-copy-id -i ~/.ssh/pabawi_key.pub deploy@web-server-01

# Test connection
ssh -i ~/.ssh/pabawi_key deploy@web-server-01 whoami`;

  const knownHostsSetup = `# Add host keys to known_hosts
ssh-keyscan -H 192.168.1.10 >> ~/.ssh/known_hosts
ssh-keyscan -H 192.168.1.20 >> ~/.ssh/known_hosts

# Or connect once to accept key
ssh deploy@web-server-01`;

  const sudoSetup = `# Configure passwordless sudo on target hosts
# /etc/sudoers.d/pabawi
deploy ALL=(ALL) NOPASSWD: ALL

# Or restrict to specific commands
deploy ALL=(ALL) NOPASSWD: /usr/bin/apt, /usr/bin/systemctl`;

  const cliValidation = `# Test SSH connection
ssh -i ~/.ssh/pabawi_key deploy@web-server-01 uptime

# Test sudo access
ssh -i ~/.ssh/pabawi_key deploy@web-server-01 sudo whoami`;
</script>

<div class="max-w-4xl mx-auto px-4 py-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
  <div class="mb-8">
    <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">SSH Integration Setup</h2>
    <p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
      Configure Pabawi to execute commands directly on remote hosts via SSH without requiring external automation tools.
      Provides native remote execution, package management, and inventory management capabilities.
    </p>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Prerequisites</h3>
      <ul class="space-y-2 text-gray-700 dark:text-gray-300">
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          SSH access to target hosts
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          SSH keys configured for authentication (recommended) or password authentication
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          Target hosts' public keys in known_hosts (if host key checking is enabled)
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          Appropriate user permissions on target hosts
        </li>
      </ul>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 1: Generate and Deploy SSH Keys</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Create SSH keys and deploy them to your target hosts:</p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">SSH Key Setup</span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() => copyToClipboard(keySetup)}
          >
            📋 Copy
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{keySetup}</pre>
      </div>

      <div class="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 rounded-r-lg">
        <p class="text-sm text-gray-700 dark:text-gray-300">
          <strong>Security Note:</strong> Always use key-based authentication in production. Ensure private keys have restrictive permissions (600).
        </p>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 2: Configure Host Key Verification</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Add target host keys to known_hosts for secure connections:</p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">Known Hosts Setup</span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() => copyToClipboard(knownHostsSetup)}
          >
            📋 Copy
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{knownHostsSetup}</pre>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 3: Create SSH Config File</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">
        Create an SSH config file using standard OpenSSH format. Use comments to add custom metadata for Pabawi:
      </p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">ssh_config</span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() => copyToClipboard(sshConfigExample)}
          >
            📋 Copy
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{sshConfigExample}</pre>
      </div>

      <div class="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg">
        <h4 class="font-medium text-gray-900 dark:text-white mb-2">Supported Keywords:</h4>
        <ul class="space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li><strong>Host</strong> - Host pattern/alias (first value used as node name)</li>
          <li><strong>HostName</strong> - Target hostname or IP address</li>
          <li><strong>User</strong> - SSH username</li>
          <li><strong>Port</strong> - SSH port (default: 22)</li>
          <li><strong>IdentityFile</strong> - Path to private key file</li>
          <li><strong># Groups:</strong> - Custom metadata for organizing hosts into logical groups</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 4: Configure Sudo (Optional)</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">
        For operations requiring elevated privileges, configure passwordless sudo on target hosts:
      </p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">Sudo Configuration</span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() => copyToClipboard(sudoSetup)}
          >
            📋 Copy
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{sudoSetup}</pre>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 5: Configure Environment Variables</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Add these values to your <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">backend/.env</code>:</p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden mb-4">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">SSH Configuration</span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() => copyToClipboard(baseConfig)}
          >
            📋 Copy
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{baseConfig}</pre>
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
            <li><strong>SSH_MAX_CONNECTIONS</strong>: Maximum total connections in pool (1-1000, default: 50)</li>
            <li><strong>SSH_MAX_CONNECTIONS_PER_HOST</strong>: Maximum connections per host (1-100, default: 5)</li>
            <li><strong>SSH_IDLE_TIMEOUT</strong>: Idle connection timeout in seconds (10-3600, default: 300)</li>
            <li><strong>SSH_CONCURRENCY_LIMIT</strong>: Maximum concurrent executions (1-100, default: 10)</li>
            <li><strong>SSH_SUDO_ENABLED</strong>: Enable sudo for privilege escalation (default: false)</li>
            <li><strong>SSH_PRIORITY</strong>: Plugin priority for inventory deduplication (0-100, default: 50)</li>
          </ul>
        </div>
      {/if}
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 6: Docker Deployment (Optional)</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">
        If deploying with Docker, use this docker-compose configuration:
      </p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">docker-compose.yml</span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() => copyToClipboard(dockerComposeExample)}
          >
            📋 Copy
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{dockerComposeExample}</pre>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 7: Validate SSH Locally</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Before using Pabawi, verify your SSH setup manually:</p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">CLI Validation</span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() => copyToClipboard(cliValidation)}
          >
            📋 Copy
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{cliValidation}</pre>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 8: Restart Backend and Verify</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Restart the backend and confirm SSH appears as connected in Integrations:</p>
      <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1 mb-4">
        <div>cd backend</div>
        <div>npm run dev</div>
      </div>
      <ol class="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
        <li>Open the <strong>Integrations</strong> section in Pabawi</li>
        <li>Confirm <strong>SSH</strong> status is healthy or degraded</li>
        <li>Go to the <strong>Inventory</strong> page to see discovered nodes</li>
        <li>Select a node and test command execution or package management</li>
      </ol>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Features Available</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">⚡</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Command Execution</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Execute shell commands on remote hosts</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">📦</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Package Management</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Install, remove, and update packages</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">🔄</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Connection Pooling</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Efficient connection reuse for performance</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">🚀</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Concurrent Execution</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Parallel execution across multiple hosts</p>
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
            <p class="mb-3"><strong>Error:</strong> "Connection timeout after 30 seconds"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Verify host is reachable: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ping hostname</code></li>
              <li>Check SSH service is running: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">systemctl status sshd</code></li>
              <li>Verify firewall rules allow SSH</li>
              <li>Increase connection timeout: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">SSH_CONNECTION_TIMEOUT=60</code></li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Authentication Failed
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "Authentication failed for user@host"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Verify private key path is correct</li>
              <li>Check private key permissions: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ls -l ~/.ssh/key</code> (should be 600)</li>
              <li>Ensure public key is in <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">~/.ssh/authorized_keys</code> on target</li>
              <li>Check SSH logs on target: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">journalctl -u sshd</code></li>
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
              <li>Add host key to known_hosts: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ssh-keyscan -H host >> ~/.ssh/known_hosts</code></li>
              <li>Remove old host key: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ssh-keygen -R host</code></li>
              <li>Temporarily disable checking (testing only): <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">SSH_HOST_KEY_CHECK=false</code></li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Missing Required Configuration
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "SSH_DEFAULT_USER is required when SSH_ENABLED is true"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Set SSH_DEFAULT_USER: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">export SSH_DEFAULT_USER=deploy</code></li>
              <li>Or disable SSH: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">export SSH_ENABLED=false</code></li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Connection Pool Exhausted
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "POOL_EXHAUSTED - Maximum connections reached"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Increase max connections: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">SSH_MAX_CONNECTIONS=100</code></li>
              <li>Increase max connections per host: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">SSH_MAX_CONNECTIONS_PER_HOST=10</code></li>
              <li>Reduce concurrency limit: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">SSH_CONCURRENCY_LIMIT=5</code></li>
              <li>Check for connection leaks in logs</li>
            </ul>
          </div>
        </details>
      </div>
    </div>
  </div>

  <div class="mt-8 text-center">
    <p class="text-gray-600 dark:text-gray-400">
      For detailed documentation, see <a
        href="/docs/integrations/ssh.md"
        class="text-blue-600 dark:text-blue-400 hover:underline">SSH Integration Documentation</a>
    </p>
  </div>
</div>
