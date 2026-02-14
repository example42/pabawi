<script lang="ts">
  let selectedInventoryFormat = $state<"ini" | "yaml">("ini");
  let showAdvanced = $state(false);

  const copyToClipboard = (text: string): void => {
    navigator.clipboard.writeText(text);
  };

  const baseConfig = `# Ansible Integration - Base Configuration
ANSIBLE_ENABLED=true
ANSIBLE_PROJECT_PATH=.
ANSIBLE_INVENTORY_PATH=inventory/hosts
ANSIBLE_EXECUTION_TIMEOUT=300000`;

  const advancedConfig = `# Optional Command Safety and Queue Settings
BOLT_COMMAND_WHITELIST_ALLOW_ALL=false
BOLT_COMMAND_WHITELIST=["ls","pwd","whoami","uptime"]
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
      Configure Pabawi to execute remote commands, package installs, and playbooks using Ansible.
    </p>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Prerequisites</h3>
      <ul class="space-y-2 text-gray-700 dark:text-gray-300">
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          Ansible CLI installed and available in PATH (<code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ansible</code>, <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ansible-playbook</code>)
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          Inventory file with reachable targets
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          SSH connectivity and credentials for managed nodes
        </li>
      </ul>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 1: Prepare Inventory</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Create your inventory in INI or YAML format:</p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <button
          class="p-4 border-2 rounded-lg text-left transition-all {selectedInventoryFormat === 'ini'
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-400'}"
          onclick={() => (selectedInventoryFormat = "ini")}
        >
          <div class="flex items-center gap-3 mb-2">
            <span class="text-2xl">📄</span>
            <span class="font-semibold text-gray-900 dark:text-white">INI Inventory</span>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">Simple and widely used format</p>
        </button>

        <button
          class="p-4 border-2 rounded-lg text-left transition-all {selectedInventoryFormat === 'yaml'
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-400'}"
          onclick={() => (selectedInventoryFormat = "yaml")}
        >
          <div class="flex items-center gap-3 mb-2">
            <span class="text-2xl">🧾</span>
            <span class="font-semibold text-gray-900 dark:text-white">YAML Inventory</span>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">Structured format for larger inventories</p>
        </button>
      </div>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">
            {selectedInventoryFormat === "ini" ? "inventory/hosts (INI)" : "inventory/hosts.yaml (YAML)"}
          </span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() =>
              copyToClipboard(
                selectedInventoryFormat === "ini" ? iniInventory : yamlInventory,
              )}
          >
            📋 Copy
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{selectedInventoryFormat === "ini"
            ? iniInventory
            : yamlInventory}</pre>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 2: Configure Environment Variables</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Add these values to your <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">backend/.env</code>:</p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden mb-4">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">Ansible Configuration</span>
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
        <span>Advanced / Recommended Runtime Settings</span>
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
      {/if}
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 3: Add a Playbook (Optional)</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Create a playbook file if you plan to use the Playbook execution action in Pabawi:</p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">playbooks/site.yml</span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() => copyToClipboard(playbookExample)}
          >
            📋 Copy
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{playbookExample}</pre>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 4: Validate Ansible Locally</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Before using Pabawi, verify your inventory and playbook manually:</p>

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
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 5: Restart Backend and Verify</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Restart the backend and confirm Ansible appears as connected in Integrations:</p>
      <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1 mb-4">
        <div>cd backend</div>
        <div>npm run dev</div>
      </div>
      <ol class="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
        <li>Open the <strong>Integrations</strong> section in Pabawi</li>
        <li>Confirm <strong>Ansible</strong> status is connected or degraded</li>
        <li>Go to a node and test command/package/playbook execution</li>
      </ol>
    </div>
  </div>
</div>
