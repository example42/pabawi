<script lang="ts">
  import { showSuccess, showError } from '../lib/toast.svelte';

  let selectedTransport = $state<"ssh" | "winrm">("ssh");
  let showAdvanced = $state(false);
  let copied = $state(false);

  let config = $state({
    projectPath: '',
    executionTimeout: 300000,
    commandWhitelist: '["ls","pwd","whoami","uptime","systemctl status"]',
    commandWhitelistAllowAll: false,
    concurrentExecutionLimit: 10,
  });

  function generateEnvSnippet(): string {
    const lines: string[] = [
      '# Bolt Integration Configuration',
      `BOLT_PROJECT_PATH=${config.projectPath || './bolt-project'}`,
      `COMMAND_WHITELIST_ALLOW_ALL=${config.commandWhitelistAllowAll}`,
      `COMMAND_WHITELIST=${config.commandWhitelist || '["ls","pwd","whoami","uptime","systemctl status"]'}`,
      `BOLT_EXECUTION_TIMEOUT=${config.executionTimeout}`,
      `CONCURRENT_EXECUTION_LIMIT=${config.concurrentExecutionLimit}`,
    ];

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

  const copySnippet = (text: string): void => {
    navigator.clipboard.writeText(text);
    showSuccess('Copied to clipboard');
  };

  function validateForm(): boolean {
    if (!config.projectPath) return false;
    if (!config.executionTimeout || config.executionTimeout < 1000) return false;
    if (!config.concurrentExecutionLimit || config.concurrentExecutionLimit < 1) return false;
    return true;
  }

  const isFormValid = $derived(validateForm());

  const advancedConfig = `# Advanced Configuration
LOG_LEVEL=info
DATABASE_PATH=./data/pabawi.db
STREAMING_BUFFER_MS=100
STREAMING_MAX_OUTPUT_SIZE=10485760
STREAMING_MAX_LINE_LENGTH=10000`;

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
      Generate a <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">.env</code> snippet to configure Pabawi for Bolt remote command execution, task running,
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
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap">{envSnippet}</pre>
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
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 3: Choose Primary Transport</h3>

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
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 4: Create Bolt Project Structure</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Set up the required Bolt project files:</p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden mb-4">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">bolt-project.yaml</span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() => copySnippet(boltProject)}
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
              copySnippet(
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
            <li>
              <strong>BOLT_EXECUTION_TIMEOUT</strong>: Maximum execution time in milliseconds
              (default: 300000)
            </li>
            <li>
              <strong>CONCURRENT_EXECUTION_LIMIT</strong>: Max parallel executions
              (default: 10)
            </li>
            <li>
              <strong>STREAMING_BUFFER_MS</strong>: Output buffer interval in milliseconds (default: 100)
            </li>
            <li>
              <strong>STREAMING_MAX_OUTPUT_SIZE</strong>: Maximum output size in bytes (default: 10MB)
            </li>
          </ul>
        </div>
      {/if}
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
        <li>Confirm <strong>Bolt</strong> status is connected</li>
        <li>Navigate to the <strong>Inventory</strong> page to see discovered nodes</li>
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
      For detailed documentation, see the Bolt Integration guide in the documentation.
    </p>
  </div>
</div>
