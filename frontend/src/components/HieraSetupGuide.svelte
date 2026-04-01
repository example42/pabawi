<script lang="ts">
  import { showSuccess, showError } from '../lib/toast.svelte';

  let selectedFactSource = $state<"puppetdb" | "local">("puppetdb");
  let catalogCompilationEnabled = $state(false);
  let showAdvanced = $state(false);
  let copied = $state(false);

  let config = $state({
    controlRepoPath: '',
    hieraConfigPath: 'hiera.yaml',
    environments: '["production","development"]',
    factSourcePreferPuppetdb: true,
    localFactsPath: '',
  });

  function generateEnvSnippet(): string {
    const lines: string[] = [
      '# Hiera Integration Configuration',
      'HIERA_ENABLED=true',
      `HIERA_CONTROL_REPO_PATH=${config.controlRepoPath || '/path/to/control-repo'}`,
      `HIERA_CONFIG_PATH=${config.hieraConfigPath || 'hiera.yaml'}`,
      `HIERA_ENVIRONMENTS=${config.environments || '["production","development"]'}`,
    ];

    if (selectedFactSource === 'puppetdb') {
      lines.push('HIERA_FACT_SOURCE_PREFER_PUPPETDB=true');
    } else {
      lines.push('HIERA_FACT_SOURCE_PREFER_PUPPETDB=false');
      lines.push(`HIERA_FACT_SOURCE_LOCAL_PATH=${config.localFactsPath || '/path/to/facts'}`);
    }

    if (catalogCompilationEnabled) {
      lines.push('HIERA_CATALOG_COMPILATION_ENABLED=true');
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

  const copySnippet = (text: string): void => {
    navigator.clipboard.writeText(text);
    showSuccess('Copied to clipboard');
  };

  function validateForm(): boolean {
    if (!config.controlRepoPath) return false;
    if (!config.hieraConfigPath) return false;
    if (selectedFactSource === 'local' && !config.localFactsPath) return false;
    return true;
  }

  const isFormValid = $derived(validateForm());

  const advancedConfig = `# Advanced Configuration
HIERA_CACHE_ENABLED=true
HIERA_CACHE_TTL=300000
HIERA_CACHE_MAX_ENTRIES=10000

# Catalog Compilation (Optional - Advanced)
HIERA_CATALOG_COMPILATION_ENABLED=true
HIERA_CATALOG_COMPILATION_TIMEOUT=60000
HIERA_CATALOG_COMPILATION_CACHE_TTL=300000

# Code Analysis
HIERA_CODE_ANALYSIS_ENABLED=true
HIERA_CODE_ANALYSIS_LINT_ENABLED=true
HIERA_CODE_ANALYSIS_MODULE_UPDATE_CHECK=true
HIERA_CODE_ANALYSIS_INTERVAL=3600000
HIERA_CODE_ANALYSIS_EXCLUSION_PATTERNS=["**/vendor/**","**/fixtures/**"]`;

  const controlRepoStructure = `control-repo/
├── hiera.yaml              # Hiera configuration
├── hieradata/              # Hiera data files
│   ├── common.yaml
│   ├── nodes/
│   │   └── web01.example.com.yaml
│   └── environments/
│       ├── production.yaml
│       └── development.yaml
├── manifests/              # Puppet manifests
│   └── site.pp
├── modules/                # Local modules
└── Puppetfile              # Module dependencies`;

  const hieraYamlExample = `# Example hiera.yaml (Hiera 5 format)
---
version: 5
defaults:
  datadir: hieradata
  data_hash: yaml_data

hierarchy:
  - name: "Per-node data"
    path: "nodes/%{trusted.certname}.yaml"

  - name: "Per-environment data"
    path: "environments/%{environment}.yaml"

  - name: "Common data"
    path: "common.yaml"`;
</script>

<div class="max-w-4xl mx-auto px-4 py-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
  <div class="mb-8">
    <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">Hiera Integration Setup</h2>
    <p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
      Generate a <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">.env</code> snippet to configure Pabawi for Puppet control repository analysis,
      Hiera data browsing, key resolution, and static code analysis.
    </p>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Prerequisites</h3>
      <ul class="space-y-2 text-gray-700 dark:text-gray-300">
        <li class="flex items-start"><span class="text-blue-500 mr-2">•</span>A Puppet control repository with Hiera 5 configuration</li>
        <li class="flex items-start"><span class="text-blue-500 mr-2">•</span>Local filesystem access to the control repository directory</li>
        <li class="flex items-start"><span class="text-blue-500 mr-2">•</span>(Optional) PuppetDB integration for fact retrieval</li>
        <li class="flex items-start"><span class="text-blue-500 mr-2">•</span>(Optional) Local fact files in Puppetserver format</li>
      </ul>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 1: Configure Connection</h3>
      <div class="space-y-4">
        <div>
          <label for="hiera-control-repo" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Control Repository Path *</label>
          <input id="hiera-control-repo" type="text" bind:value={config.controlRepoPath} placeholder="/path/to/control-repo" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Absolute path to your Puppet control repository</p>
        </div>
        <div>
          <label for="hiera-config-path" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Hiera Config Path *</label>
          <input id="hiera-config-path" type="text" bind:value={config.hieraConfigPath} placeholder="hiera.yaml" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Relative to control repo (default: hiera.yaml)</p>
        </div>
        <div>
          <label for="hiera-environments" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Environments (JSON array)</label>
          <input id="hiera-environments" type="text" bind:value={config.environments} placeholder='["production","development"]' class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm" />
        </div>
        <div>
          <div class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fact Source</div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button class="p-3 border-2 rounded-lg text-left transition-all text-sm {selectedFactSource === 'puppetdb' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-blue-300'}" onclick={() => (selectedFactSource = 'puppetdb')}>
              <span class="font-semibold text-gray-900 dark:text-white">🗄️ PuppetDB</span>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Use facts from PuppetDB</p>
            </button>
            <button class="p-3 border-2 rounded-lg text-left transition-all text-sm {selectedFactSource === 'local' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-blue-300'}" onclick={() => (selectedFactSource = 'local')}>
              <span class="font-semibold text-gray-900 dark:text-white">📁 Local Files</span>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Use exported fact files</p>
            </button>
          </div>
        </div>
        {#if selectedFactSource === 'local'}
          <div>
            <label for="hiera-local-facts" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Local Facts Path *</label>
            <input id="hiera-local-facts" type="text" bind:value={config.localFactsPath} placeholder="/path/to/facts" class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
        {/if}
        <div>
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" bind:checked={catalogCompilationEnabled} class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Enable Catalog Compilation</span>
          </label>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Advanced: resolves variables defined in Puppet code</p>
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
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 3: Prepare Your Control Repository</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Ensure your control repository follows the standard Puppet structure:</p>
      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden mb-4">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">Expected Directory Structure</span>
          <button class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors" onclick={() => copySnippet(controlRepoStructure)}>📋 Copy</button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{controlRepoStructure}</pre>
      </div>
      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">Example hiera.yaml</span>
          <button class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors" onclick={() => copySnippet(hieraYamlExample)}>📋 Copy</button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{hieraYamlExample}</pre>
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
        <div class="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg">
          <h4 class="font-medium text-gray-900 dark:text-white mb-2">Configuration Options:</h4>
          <ul class="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li><strong>HIERA_CACHE_TTL</strong>: Cache duration in milliseconds (default: 300000 = 5 min)</li>
            <li><strong>HIERA_CACHE_MAX_ENTRIES</strong>: Maximum cached entries (default: 10000)</li>
            <li><strong>HIERA_CODE_ANALYSIS_ENABLED</strong>: Enable static code analysis</li>
            <li><strong>HIERA_CODE_ANALYSIS_LINT_ENABLED</strong>: Enable Puppet lint checks</li>
            <li><strong>HIERA_CODE_ANALYSIS_MODULE_UPDATE_CHECK</strong>: Check Puppetfile for updates</li>
            <li><strong>HIERA_CODE_ANALYSIS_INTERVAL</strong>: Analysis refresh interval (default: 3600000 = 1 hour)</li>
          </ul>
        </div>
      {/if}
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 4: Restart and Verify</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">After pasting the snippet into <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">backend/.env</code>, restart the backend:</p>
      <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1 mb-4">
        <div>cd backend</div>
        <div>npm run dev</div>
      </div>
      <ol class="list-decimal list-inside space-y-2 text-gray-700 dark:text-gray-300">
        <li>Open the <strong>Integration Status</strong> dashboard in Pabawi</li>
        <li>Confirm <strong>Hiera</strong> status is connected</li>
        <li>Navigate to the <strong>Hiera</strong> page to browse data and resolve keys</li>
      </ol>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Features Available</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">📊</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Data Browser</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Browse Hiera data across environments</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">🔍</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Key Resolution</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Resolve keys with full hierarchy trace</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">🔬</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Code Analysis</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Static analysis and lint checks</p>
        </div>
      </div>
    </div>
  </div>

  <div class="mt-8 text-center">
    <p class="text-gray-600 dark:text-gray-400">For detailed documentation, see the Hiera Integration guide in the documentation.</p>
  </div>
</div>
