<script lang="ts">
  import { showSuccess, showError } from '../lib/toast.svelte';

  let selectedInventoryFormat = $state<"ini" | "yaml">("ini");
  let showAdvanced = $state(false);
  let copied = $state(false);

  let config = $state({
    projectPath: '',
    inventoryPath: '',
    executionTimeout: 300000,
  });

  function generateEnvSnippet(): string {
    const lines: string[] = [
      '# Ansible Integration Configuration',
      'ANSIBLE_ENABLED=true',
      `ANSIBLE_PROJECT_PATH=${config.projectPath || '.'}`,
      `ANSIBLE_INVENTORY_PATH=${config.inventoryPath || 'inventory/hosts'}`,
      `ANSIBLE_EXECUTION_TIMEOUT=${config.executionTimeout}`,
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
    if (!config.inventoryPath) return false;
    return true;
  }

  const isFormValid = $derived(validateForm());

  const advancedConfig = `# Optional Command Safety and Queue Settings
COMMAND_WHITELIST_ALLOW_ALL=false
COMMAND_WHITELIST=["ls","pwd","whoami","uptime"]
CONCURRENT_EXECUTION_LIMIT=5
MAX_QUEUE_SIZE=50
LOG_LEVEL=info`;

  const iniInventory = `# inventory/hosts
[linux]
web01.example.com
db01.example.com

[linux:vars]
ansible_user=ubuntu
ansible_ssh_private_key_file=~/.ssh/id_rsa`;

  const yamlInventory = `# inventory/hosts.yaml
all:
  children:
    linux:
      hosts:
        web01.example.com:
        db01.example.com:
      vars:
        ansible_user: ubuntu
        ansible_ssh_private_key_file: ~/.ssh/id_rsa`;

  const playbookExample = `# playbooks/site.yml
---
- name: Sample maintenance playbook
  hosts: all
  become: true
  tasks:
    - name: Ensure curl is present
      ansible.builtin.package:
        name: curl
        state: present`;

  const cliValidation = `# From ANSIBLE_PROJECT_PATH
ansible all -i inventory/hosts -m ping
ansible-playbook -i inventory/hosts playbooks/site.yml --check`;
</script>

<div class="max-w-4xl mx-auto px-4 py-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
  <div class="mb-8">
    <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">Ansible Integration Setup</h2>
    <p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
      Generate a <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">.env</code> snippet to configure Pabawi for Ansible remote command execution,
      package installs, and playbook execution.
    </p>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Prerequisites</h3>
      <ul class="space-y-2 text-gray-700 dark:text-gray-300">
        <li class="flex items-start"><span class="text-blue-500 mr-2">•</span>Ansible CLI installed and available in PATH (<code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ansible</code>, <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ansible-playbook</code>)</li>
        <li class="flex items-start"><span class="text-blue-500 mr-2">•</span>Inventory file with reachable targets</li>
        <li class="flex items-start"><span class="text-blue-500 mr-2">•</span>SSH connectivity and credentials for managed nodes</li>
      </ul>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 1: Configure Connection</h3>
      <div class="space-y-4">
        <div>
          <label for="ansible-project-path" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Project Path *</label>
          <input id="ansible-project-path" type="text" bind:value={config.projectPath} placeholder="." class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Path to your Ansible project directory</p>
        </div>
        <div>
          <label for="ansible-inventory-path" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Inventory Path *</label>
          <input id="ansible-inventory-path" type="text" bind:value={config.inventoryPath} placeholder="inventory/hosts" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Relative to project path</p>
        </div>
        <div>
          <label for="ansible-execution-timeout" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Execution Timeout (ms)</label>
          <input id="ansible-execution-timeout" type="number" bind:value={config.executionTimeout} min="1000" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Default: 300000 (5 minutes)</p>
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
          <button class="px-4 py-1.5 text-white text-sm rounded transition-colors flex items-center gap-2 {copied ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'}" onclick={copyToClipboard}>
            {#if copied}✓ Copied{:else}📋 Copy to Clipboard{/if}
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
          <p class="text-sm text-gray-700 dark:text-gray-300">Fill in the required fields above to generate a complete snippet.</p>
        </div>
      {/if}
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 3: Prepare Inventory</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Create your inventory in INI or YAML format:</p>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <button class="p-4 border-2 rounded-lg text-left transition-all {selectedInventoryFormat === 'ini' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-400'}" onclick={() => (selectedInventoryFormat = "ini")}>
          <div class="flex items-center gap-3 mb-2"><span class="text-2xl">📄</span><span class="font-semibold text-gray-900 dark:text-white">INI Inventory</span></div>
          <p class="text-sm text-gray-600 dark:text-gray-400">Simple and widely used format</p>
        </button>
        <button class="p-4 border-2 rounded-lg text-left transition-all {selectedInventoryFormat === 'yaml' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-400'}" onclick={() => (selectedInventoryFormat = "yaml")}>
          <div class="flex items-center gap-3 mb-2"><span class="text-2xl">🧾</span><span class="font-semibold text-gray-900 dark:text-white">YAML Inventory</span></div>
          <p class="text-sm text-gray-600 dark:text-gray-400">Structured format for larger inventories</p>
        </button>
      </div>
      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">{selectedInventoryFormat === "ini" ? "inventory/hosts (INI)" : "inventory/hosts.yaml (YAML)"}</span>
          <button class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors" onclick={() => copySnippet(selectedInventoryFormat === "ini" ? iniInventory : yamlInventory)}>📋 Copy</button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{selectedInventoryFormat === "ini" ? iniInventory : yamlInventory}</pre>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 4: Add a Playbook (Optional)</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Create a playbook file if you plan to use the Playbook execution action in Pabawi:</p>
      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">playbooks/site.yml</span>
          <button class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors" onclick={() => copySnippet(playbookExample)}>📋 Copy</button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{playbookExample}</pre>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 5: Validate Ansible Locally</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Before using Pabawi, verify your inventory and playbook manually:</p>
      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">CLI Validation</span>
          <button class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors" onclick={() => copySnippet(cliValidation)}>📋 Copy</button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{cliValidation}</pre>
      </div>
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
      {/if}
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 6: Restart and Verify</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">After pasting the snippet into <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">backend/.env</code>, restart the backend:</p>
      <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1 mb-4">
        <div>cd backend</div>
        <div>npm run dev</div>
      </div>
      <ol class="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
        <li>Open the <strong>Integration Status</strong> dashboard in Pabawi</li>
        <li>Confirm <strong>Ansible</strong> status is connected</li>
        <li>Go to a node and test command/package/playbook execution</li>
      </ol>
    </div>
  </div>
</div>
