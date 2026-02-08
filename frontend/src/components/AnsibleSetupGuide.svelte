<script lang="ts">
  let selectedInventory = $state<"static" | "dynamic">("static");
  let showAdvanced = $state(false);

  const copyToClipboard = (text: string): void => {
    navigator.clipboard.writeText(text);
  };

  const basicConfig = `# Ansible Integration - Basic Configuration
ANSIBLE_ENABLED=true
ANSIBLE_INVENTORY_PATH=/etc/ansible/hosts
ANSIBLE_PLAYBOOK_PATH=/etc/ansible/playbooks
ANSIBLE_EXECUTION_TIMEOUT=300000`;

  const advancedConfig = `# Advanced Configuration
ANSIBLE_FORKS=10
ANSIBLE_VERBOSITY=0
ANSIBLE_REMOTE_USER=ansible
ANSIBLE_PRIVATE_KEY_FILE=~/.ssh/ansible_key
ANSIBLE_SSH_TIMEOUT=30
ANSIBLE_PRIORITY=5`;

  const staticInventoryINI = `# /etc/ansible/hosts - INI Format
[webservers]
web01.example.com
web02.example.com ansible_user=deploy

[databases]
db01.example.com ansible_port=2222
db02.example.com

[webservers:vars]
ansible_user=www-data
http_port=80

[production:children]
webservers
databases`;

  const staticInventoryYAML = `# /etc/ansible/hosts.yml - YAML Format
all:
  children:
    webservers:
      hosts:
        web01.example.com:
        web02.example.com:
      vars:
        ansible_user: deploy
        http_port: 80

    databases:
      hosts:
        db01.example.com:
          ansible_port: 2222
        db02.example.com:
      vars:
        ansible_user: postgres`;

  const dynamicInventory = `#!/usr/bin/env python3
# /etc/ansible/inventory.py - Dynamic Inventory
import json
import sys

def get_inventory():
    return {
        "webservers": {
            "hosts": ["web01.example.com", "web02.example.com"],
            "vars": {"ansible_user": "deploy"}
        },
        "_meta": {
            "hostvars": {
                "web01.example.com": {"ansible_host": "192.168.1.10"},
                "web02.example.com": {"ansible_host": "192.168.1.11"}
            }
        }
    }

if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--list":
        print(json.dumps(get_inventory()))
    else:
        print(json.dumps({}))`;

  const examplePlaybook = `---
# /etc/ansible/playbooks/deploy.yml
- name: Deploy application
  hosts: webservers
  become: yes

  tasks:
    - name: Update package cache
      apt:
        update_cache: yes
      when: ansible_os_family == "Debian"

    - name: Install dependencies
      apt:
        name:
          - git
          - python3
          - python3-pip
        state: present

    - name: Clone repository
      git:
        repo: https://github.com/example/app.git
        dest: /opt/app
        version: main

    - name: Restart application
      systemd:
        name: myapp
        state: restarted`;
</script>

<div class="max-w-4xl mx-auto px-4 py-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
  <div class="mb-8">
    <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">Ansible Integration Setup</h2>
    <p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
      Configure Pabawi to use Ansible for remote execution, playbook orchestration,
      and inventory management across your infrastructure.
    </p>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Prerequisites</h3>
      <ul class="space-y-2 text-gray-700 dark:text-gray-300">
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          Ansible installed and accessible in PATH (version 2.9+)
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          SSH access to target nodes with key-based authentication
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          Valid Ansible inventory file or dynamic inventory script
        </li>
      </ul>

      <div class="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg">
        <p class="text-sm text-gray-700 dark:text-gray-300">
          <strong>Verify Installation:</strong>
        </p>
        <div class="mt-2 bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-sm">
          ansible --version
        </div>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 1: Choose Inventory Type</h3>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <button
          class="p-4 border-2 rounded-lg text-left transition-all {selectedInventory === 'static'
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-400'}"
          onclick={() => (selectedInventory = "static")}
        >
          <div class="flex items-center gap-3 mb-2">
            <span class="text-2xl">📄</span>
            <span class="font-semibold text-gray-900 dark:text-white">Static Inventory</span>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">INI or YAML file with fixed hosts</p>
        </button>

        <button
          class="p-4 border-2 rounded-lg text-left transition-all {selectedInventory === 'dynamic'
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-400'}"
          onclick={() => (selectedInventory = "dynamic")}
        >
          <div class="flex items-center gap-3 mb-2">
            <span class="text-2xl">🔄</span>
            <span class="font-semibold text-gray-900 dark:text-white">Dynamic Inventory</span>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">Script for cloud/dynamic environments</p>
        </button>
      </div>

      {#if selectedInventory === "static"}
        <div class="space-y-4">
          <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
            <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <span class="font-medium text-gray-900 dark:text-white text-sm">INI Format</span>
              <button
                class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                onclick={() => copyToClipboard(staticInventoryINI)}
              >
                📋 Copy
              </button>
            </div>
            <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{staticInventoryINI}</pre>
          </div>

          <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
            <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
              <span class="font-medium text-gray-900 dark:text-white text-sm">YAML Format</span>
              <button
                class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                onclick={() => copyToClipboard(staticInventoryYAML)}
              >
                📋 Copy
              </button>
            </div>
            <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{staticInventoryYAML}</pre>
          </div>
        </div>
      {:else}
        <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
            <span class="font-medium text-gray-900 dark:text-white text-sm">Dynamic Inventory Script</span>
            <button
              class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
              onclick={() => copyToClipboard(dynamicInventory)}
            >
              📋 Copy
            </button>
          </div>
          <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{dynamicInventory}</pre>
        </div>

        <div class="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 rounded-r-lg">
          <p class="text-sm text-gray-700 dark:text-gray-300">
            <strong>Make script executable:</strong>
          </p>
          <div class="mt-2 bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-sm">
            chmod +x /etc/ansible/inventory.py
          </div>
        </div>
      {/if}
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 2: Setup SSH Authentication</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Configure SSH key-based authentication for Ansible:</p>

      <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1 mb-4">
        <div># Generate SSH key for Ansible</div>
        <div>ssh-keygen -t ed25519 -f ~/.ssh/ansible_key -C "ansible@pabawi"</div>
        <div></div>
        <div># Copy key to target nodes</div>
        <div>ssh-copy-id -i ~/.ssh/ansible_key.pub user@target-node</div>
        <div></div>
        <div># Test connection</div>
        <div>ssh -i ~/.ssh/ansible_key user@target-node "echo 'Success'"</div>
      </div>

      <div class="p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg">
        <p class="text-sm text-gray-700 dark:text-gray-300">
          <strong>Configure passwordless sudo on target nodes:</strong>
        </p>
        <div class="mt-2 bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-sm">
          echo "ansible ALL=(ALL) NOPASSWD: ALL" | sudo tee /etc/sudoers.d/ansible
        </div>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 3: Create Playbook Directory (Optional)</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">If you want to run playbooks, create a playbooks directory:</p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">Example Playbook</span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() => copyToClipboard(examplePlaybook)}
          >
            📋 Copy
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{examplePlaybook}</pre>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 4: Configure Environment Variables</h3>
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
            <li><strong>ANSIBLE_FORKS</strong>: Parallel execution processes (default: 5)</li>
            <li><strong>ANSIBLE_VERBOSITY</strong>: Output verbosity 0-4 (default: 0)</li>
            <li><strong>ANSIBLE_REMOTE_USER</strong>: Default SSH user (default: current user)</li>
            <li><strong>ANSIBLE_PRIVATE_KEY_FILE</strong>: SSH private key path</li>
            <li><strong>ANSIBLE_SSH_TIMEOUT</strong>: SSH connection timeout in seconds</li>
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
      <p class="text-gray-700 dark:text-gray-300 mb-4">Test the integration:</p>

      <div class="space-y-3">
        <div>
          <p class="text-sm text-gray-700 dark:text-gray-300 mb-2"><strong>1. Check integration status in UI:</strong></p>
          <ul class="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 ml-4">
            <li>Navigate to the <strong>Integrations</strong> page</li>
            <li>Look for "Ansible" with green status indicator</li>
          </ul>
        </div>

        <div>
          <p class="text-sm text-gray-700 dark:text-gray-300 mb-2"><strong>2. Test via API:</strong></p>
          <div class="bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-sm">
            curl http://localhost:3000/api/integrations/ansible/inventory
          </div>
        </div>

        <div>
          <p class="text-sm text-gray-700 dark:text-gray-300 mb-2"><strong>3. Test Ansible directly:</strong></p>
          <div class="bg-gray-900 text-green-400 p-3 rounded-lg font-mono text-sm space-y-1">
            <div>ansible all -m ping -i /etc/ansible/hosts</div>
            <div>ansible all -m command -a "uptime" -i /etc/ansible/hosts</div>
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
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Ad-hoc Commands</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Execute commands across nodes</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">📜</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Playbook Execution</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Run complex automation playbooks</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">📊</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Inventory Management</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Dynamic node discovery</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">🔍</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Fact Collection</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Gather system information</p>
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
            Ansible Not Found
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "ansible: command not found"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Install Ansible: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">pip install ansible</code></li>
              <li>Verify: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">which ansible</code></li>
              <li>Add to PATH if needed</li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            SSH Connection Failed
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "Failed to connect to the host via ssh"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Test SSH manually: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ssh user@target-node</code></li>
              <li>Check SSH key permissions: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">chmod 600 ~/.ssh/ansible_key</code></li>
              <li>Verify key is copied to target: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ssh-copy-id -i ~/.ssh/ansible_key.pub user@target</code></li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Permission Denied Errors
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "Permission denied" or sudo password prompts</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Configure passwordless sudo on target nodes</li>
              <li>Add to <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">/etc/sudoers.d/ansible</code>:</li>
              <li><code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ansible ALL=(ALL) NOPASSWD: ALL</code></li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Inventory Not Found
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "Unable to parse inventory"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Verify file exists: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ls -la /etc/ansible/hosts</code></li>
              <li>Check file permissions: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">chmod 644 /etc/ansible/hosts</code></li>
              <li>Test inventory: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ansible-inventory -i /etc/ansible/hosts --list</code></li>
            </ul>
          </div>
        </details>
      </div>
    </div>
  </div>

  <div class="mt-8 text-center">
    <p class="text-gray-600 dark:text-gray-400">
      For detailed documentation, see <a
        href="https://github.com/example42/pabawi/blob/main/plugins/native/ansible/SETUP.md"
        target="_blank"
        class="text-blue-600 dark:text-blue-400 hover:underline">SETUP.md</a>
    </p>
  </div>
</div>
