<script lang="ts">
  import { onMount } from 'svelte';
  import { saveIntegrationConfig, getIntegrationConfig } from '../lib/api';
  import { showSuccess, showError } from '../lib/toast.svelte';
  import { logger } from '../lib/logger.svelte';

  let selectedTransport = $state<"ssh" | "winrm">("ssh");
  let showAdvanced = $state(false);
  let saving = $state(false);
  let loadingConfig = $state(true);

  let config = $state({
    projectPath: '',
    executionTimeout: 300000,
    commandWhitelist: '["ls","pwd","whoami","uptime","systemctl status"]',
    commandWhitelistAllowAll: false,
    concurrentExecutionLimit: 10,
  });

  onMount(async () => {
    try {
      const effective = await getIntegrationConfig('bolt');
      if (effective) {
        config.projectPath = String(effective.projectPath ?? '');
        config.executionTimeout = Number(effective.executionTimeout ?? 300000);
        config.commandWhitelistAllowAll = effective.commandWhitelistAllowAll === true || effective.commandWhitelistAllowAll === 'true';
        config.concurrentExecutionLimit = Number(effective.concurrentExecutionLimit ?? 10);
        if (effective.commandWhitelist) {
          config.commandWhitelist = typeof effective.commandWhitelist === 'string'
            ? effective.commandWhitelist
            : JSON.stringify(effective.commandWhitelist);
        }
      }
    } catch {
      // No existing config
    } finally {
      loadingConfig = false;
    }
  });

  function validateForm(): boolean {
    if (!config.projectPath) return false;
    if (!config.executionTimeout || config.executionTimeout < 1000) return false;
    if (!config.concurrentExecutionLimit || config.concurrentExecutionLimit < 1) return false;
    return true;
  }

  const isFormValid = $derived(validateForm());

  async function handleSaveConfiguration(): Promise<void> {
    saving = true;
    try {
      const payload: Record<string, unknown> = {
        projectPath: config.projectPath,
        executionTimeout: config.executionTimeout,
        commandWhitelistAllowAll: config.commandWhitelistAllowAll,
        concurrentExecutionLimit: config.concurrentExecutionLimit,
        commandWhitelist: config.commandWhitelist,
      };
      await saveIntegrationConfig('bolt', payload);
      showSuccess('Bolt configuration saved successfully');
      logger.info('Bolt configuration saved', { projectPath: config.projectPath });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      showError(`Failed to save configuration: ${message}`);
      logger.error('Bolt configuration save error', { error });
    } finally {
      saving = false;
    }
  }

  const copyToClipboard = (text: string): void => {
    navigator.clipboard.writeText(text);
    showSuccess('Copied to clipboard');
  };

  const sshConfig = `# Bolt Integration - SSH Transport
BOLT_PROJECT_PATH=./bolt-project
COMMAND_WHITELIST_ALLOW_ALL=false
COMMAND_WHITELIST=["ls","pwd","whoami","uptime","systemctl status"]
BOLT_EXECUTION_TIMEOUT=300000
CONCURRENT_EXECUTION_LIMIT=10`;

  const winrmConfig = `# Bolt Integration - WinRM Transport
BOLT_PROJECT_PATH=./bolt-project
COMMAND_WHITELIST_ALLOW_ALL=false
COMMAND_WHITELIST=["Get-Service","Get-Process","Get-ComputerInfo"]
BOLT_EXECUTION_TIMEOUT=300000
CONCURRENT_EXECUTION_LIMIT=10`;

  const advancedConfig = `# Advanced Configuration
LOG_LEVEL=info
DATABASE_PATH=./data/pabawi.db
STREAMING_ENABLED=true
STREAMING_BUFFER_SIZE=1024
BOLT_PRIORITY=5`;

  const inventorySSH = `# bolt-project/inventory.yaml - SSH Example
version: 2
groups:
  - name: linux_servers
    targets:
      - web-01.example.com
      - web-02.example.com
      - db-01.example.com
    config:
      transport: ssh
      ssh:
        user: admin
        port: 22
        private-key: ~/.ssh/id_rsa
        host-key-check: false`;

  const inventoryWinRM = `# bolt-project/inventory.yaml - WinRM Example
version: 2
groups:
  - name: windows_servers
    targets:
      - win-01.example.com
      - win-02.example.com
    config:
      transport: winrm
      winrm:
        user: Administrator
        password: your-password
        ssl: false
        ssl-verify: false`;

  const boltProject = `# bolt-project/bolt-project.yaml
name: pabawi-project
color: false
format: json
log:
  console:
    level: warn`;
</script>

<div class="max-w-4xl mx-auto px-4 py-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
  <div class="mb-8">
    <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">Bolt Integration Setup</h2>
    <p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
      Configure Pabawi to use Bolt for remote command execution, task running,
      and plan orchestration across your infrastructure.
    </p>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Prerequisites</h3>
      <ul class="space-y-2 text-gray-700 dark:text-gray-300">
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          Bolt CLI installed (version 3.x or later)
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          SSH or WinRM access to target nodes
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          Bolt project directory with inventory and configuration
        </li>
      </ul>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 1: Configure Connection</h3>

      <div class="space-y-4">
        <div>
          <label for="bolt-project-path" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Bolt Project Path *
          </label>
          <input
            id="bolt-project-path"
            type="text"
            bind:value={config.projectPath}
            placeholder="./bolt-project"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Path to your Bolt project directory</p>
        </div>

        <div>
          <label for="bolt-execution-timeout" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Execution Timeout (ms) *
          </label>
          <input
            id="bolt-execution-timeout"
            type="number"
            bind:value={config.executionTimeout}
            min="1000"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Default: 300000 (5 minutes)</p>
        </div>

        <div>
          <label for="bolt-concurrent-limit" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Concurrent Execution Limit *
          </label>
          <input
            id="bolt-concurrent-limit"
            type="number"
            bind:value={config.concurrentExecutionLimit}
            min="1"
            max="100"
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Default: 10</p>
        </div>

        <div>
          <label for="bolt-command-whitelist" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Command Whitelist (JSON array)
          </label>
          <input
            id="bolt-command-whitelist"
            type="text"
            bind:value={config.commandWhitelist}
            placeholder='["ls","pwd","whoami"]'
            class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          />
        </div>

        <div>
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              bind:checked={config.commandWhitelistAllowAll}
              class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
              Allow all commands
            </span>
          </label>
          {#if config.commandWhitelistAllowAll}
            <p class="mt-1 text-sm text-yellow-600 dark:text-yellow-400">
              ⚠️ All commands will be allowed. Use with caution in production.
            </p>
          {/if}
        </div>

        <div class="flex gap-3 pt-4">
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
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 2: Choose Primary Transport</h3>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <button
          class="p-4 border-2 rounded-lg text-left transition-all {selectedTransport === 'ssh'
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-400'}"
          onclick={() => (selectedTransport = "ssh")}
        >
          <div class="flex items-center gap-3 mb-2">
            <span class="text-2xl">🐧</span>
            <span class="font-semibold text-gray-900 dark:text-white">SSH Transport</span>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">For Linux/Unix systems</p>
        </button>

        <button
          class="p-4 border-2 rounded-lg text-left transition-all {selectedTransport === 'winrm'
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-400'}"
          onclick={() => (selectedTransport = "winrm")}
        >
          <div class="flex items-center gap-3 mb-2">
            <span class="text-2xl">🪟</span>
            <span class="font-semibold text-gray-900 dark:text-white">WinRM Transport</span>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">For Windows systems</p>
        </button>
      </div>

      {#if selectedTransport === "ssh"}
        <div class="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">SSH Configuration Requirements</h4>
          <p class="text-gray-700 dark:text-gray-300 mb-3">Ensure SSH access is configured:</p>
          <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1">
            <div>ssh-keygen -t rsa -b 4096</div>
            <div>ssh-copy-id admin@target-node.example.com</div>
            <div>ssh admin@target-node.example.com whoami</div>
          </div>
        </div>
      {:else}
        <div class="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">WinRM Configuration Requirements</h4>
          <p class="text-gray-700 dark:text-gray-300 mb-3">Enable WinRM on Windows targets:</p>
          <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1">
            <div>winrm quickconfig</div>
            <div>winrm set winrm/config/service/auth @{'{'}Basic="true"{'}'}</div>
            <div>winrm set winrm/config/service @{'{'}AllowUnencrypted="true"{'}'}</div>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 3: Create Bolt Project Structure</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Set up the required Bolt project files:</p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden mb-4">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">bolt-project.yaml</span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() => copyToClipboard(boltProject)}
          >
            📋 Copy
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{boltProject}</pre>
      </div>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">
            inventory.yaml - {selectedTransport === "ssh" ? "SSH" : "WinRM"} Example
          </span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() =>
              copyToClipboard(
                selectedTransport === "ssh" ? inventorySSH : inventoryWinRM
              )}
          >
            📋 Copy
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{selectedTransport === "ssh"
            ? inventorySSH
            : inventoryWinRM}</pre>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 4: Configure Environment Variables (Alternative)</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Add these variables to your <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">backend/.env</code> file:</p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden mb-4">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">
            {selectedTransport === "ssh"
              ? "SSH Transport Config"
              : "WinRM Transport Config"}
          </span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() =>
              copyToClipboard(
                selectedTransport === "ssh" ? sshConfig : winrmConfig
              )}
          >
            📋 Copy
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{selectedTransport === "ssh"
            ? sshConfig
            : winrmConfig}</pre>
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
              <strong>BOLT_EXECUTION_TIMEOUT</strong>: Maximum execution time in milliseconds
              (default: 300000)
            </li>
            <li>
              <strong>CONCURRENT_EXECUTION_LIMIT</strong>: Max parallel executions
              (default: 10)
            </li>
            <li>
              <strong>STREAMING_*</strong>: Real-time output streaming settings
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
        <li>Look for "Bolt" in the list</li>
        <li>Status should show "healthy" with a green indicator</li>
      </ol>

      <p class="text-gray-700 dark:text-gray-300 mb-3">Or test via API:</p>
      <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm">
        curl http://localhost:3000/api/inventory
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
          <p class="text-sm text-gray-600 dark:text-gray-400">Run ad-hoc commands across nodes</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">📦</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Task Running</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Execute Puppet tasks and modules</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">🎯</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Plan Orchestration</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Run complex multi-step plans</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">📊</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Inventory Management</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Dynamic node discovery and targeting</p>
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
            Bolt Configuration Errors
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "Bolt configuration files not found"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Verify BOLT_PROJECT_PATH points to correct directory</li>
              <li>
                Check files exist: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ls -la ./bolt-project/inventory.yaml</code>
              </li>
              <li>Ensure bolt-project.yaml has <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">color: false</code></li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Connection Errors
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "Node unreachable"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>
                Test SSH: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ssh user@target-node.example.com whoami</code>
              </li>
              <li>
                Test WinRM: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">winrs -r:target-node.example.com whoami</code>
              </li>
              <li>Check firewall rules and network connectivity</li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Command Whitelist Errors
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "Command not allowed"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>
                Add command to whitelist: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">COMMAND_WHITELIST=["ls","pwd","your-command"]</code>
              </li>
              <li>
                Or allow all: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">COMMAND_WHITELIST_ALLOW_ALL=true</code>
              </li>
              <li>Restart backend after changes</li>
            </ul>
          </div>
        </details>
      </div>
    </div>
  </div>

  <div class="mt-8 text-center">
    <p class="text-gray-600 dark:text-gray-400">
      For detailed documentation, see <a
        href="https://github.com/example42/pabawi/docs/tree/main/configuration.md"
        target="_blank"
        class="text-blue-600 dark:text-blue-400 hover:underline">configuration.md</a
      >
    </p>
  </div>
</div>
