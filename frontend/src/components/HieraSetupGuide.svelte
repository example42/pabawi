<script lang="ts">
  import { get } from '../lib/api';

  let selectedFactSource = $state<"puppetdb" | "local">("puppetdb");
  let catalogCompilationEnabled = $state(false);
  let showAdvanced = $state(false);
  let testingConnection = $state(false);
  let testResult = $state<{ success: boolean; message: string; details?: Record<string, unknown> } | null>(null);

  const copyToClipboard = (text: string): void => {
    navigator.clipboard.writeText(text);
  };

  const basicConfig = `# Hiera Integration - Basic Configuration
HIERA_ENABLED=true
HIERA_CONTROL_REPO_PATH=/path/to/control-repo
HIERA_CONFIG_PATH=hiera.yaml
HIERA_ENVIRONMENTS=["production","development"]`;

  const puppetdbFactConfig = `# Fact Source - PuppetDB (Recommended)
HIERA_FACT_SOURCE_PREFER_PUPPETDB=true`;

  const localFactConfig = `# Fact Source - Local Files
HIERA_FACT_SOURCE_PREFER_PUPPETDB=false
HIERA_FACT_SOURCE_LOCAL_PATH=/path/to/facts`;

  const catalogCompilationConfig = `# Catalog Compilation (Optional - Advanced)
HIERA_CATALOG_COMPILATION_ENABLED=true
HIERA_CATALOG_COMPILATION_TIMEOUT=60000
HIERA_CATALOG_COMPILATION_CACHE_TTL=300000`;

  const advancedConfig = `# Advanced Configuration
HIERA_CACHE_ENABLED=true
HIERA_CACHE_TTL=300000
HIERA_CACHE_MAX_ENTRIES=10000

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

  async function testConnection(): Promise<void> {
    testingConnection = true;
    testResult = null;

    try {
      const response = await get<{ healthy: boolean; message?: string; details?: Record<string, unknown> }>('/api/integrations/hiera/status');

      if (response.healthy) {
        testResult = {
          success: true,
          message: 'Hiera integration is connected and healthy!',
          details: response.details
        };
      } else {
        testResult = {
          success: false,
          message: response.message || 'Hiera integration is not healthy',
          details: response.details
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      testResult = {
        success: false,
        message: `Connection test failed: ${errorMessage}`
      };
    } finally {
      testingConnection = false;
    }
  }
</script>

<div class="max-w-4xl mx-auto px-4 py-8 bg-gray-50 dark:bg-gray-900 min-h-screen">
  <div class="mb-8">
    <h2 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">Hiera Integration Setup</h2>
    <p class="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
      Configure Pabawi to analyze your Puppet control repository, providing deep visibility into
      Hiera data, key resolution, and static code analysis capabilities.
    </p>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Prerequisites</h3>
      <ul class="space-y-2 text-gray-700 dark:text-gray-300">
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          A Puppet control repository with Hiera 5 configuration
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          Local filesystem access to the control repository directory
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          (Optional) PuppetDB integration for fact retrieval
        </li>
        <li class="flex items-start">
          <span class="text-blue-500 mr-2">•</span>
          (Optional) Local fact files in Puppetserver format
        </li>
      </ul>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 1: Prepare Your Control Repository</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">
        Ensure your control repository follows the standard Puppet structure:
      </p>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden mb-4">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">Expected Directory Structure</span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() => copyToClipboard(controlRepoStructure)}
          >
            📋 Copy
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{controlRepoStructure}</pre>
      </div>

      <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
        <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <span class="font-medium text-gray-900 dark:text-white text-sm">Example hiera.yaml</span>
          <button
            class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            onclick={() => copyToClipboard(hieraYamlExample)}
          >
            📋 Copy
          </button>
        </div>
        <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{hieraYamlExample}</pre>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 2: Configure Control Repository Path</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">
        Add the basic Hiera configuration to your <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">backend/.env</code> file:
      </p>

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

      <div class="p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg">
        <h4 class="font-medium text-gray-900 dark:text-white mb-2">Configuration Options:</h4>
        <ul class="space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li><strong>HIERA_CONTROL_REPO_PATH</strong>: Absolute path to your control repository</li>
          <li><strong>HIERA_CONFIG_PATH</strong>: Path to hiera.yaml relative to control repo (default: hiera.yaml)</li>
          <li><strong>HIERA_ENVIRONMENTS</strong>: JSON array of environment names to scan</li>
        </ul>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 3: Configure Fact Source</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">
        Choose how Pabawi retrieves node facts for Hiera resolution:
      </p>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <button
          class="p-4 border-2 rounded-lg text-left transition-all {selectedFactSource === 'puppetdb'
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-400'}"
          onclick={() => (selectedFactSource = "puppetdb")}
        >
          <div class="flex items-center gap-3 mb-2">
            <span class="text-2xl">🗄️</span>
            <span class="font-semibold text-gray-900 dark:text-white">PuppetDB (Recommended)</span>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">Use facts from PuppetDB integration - always up-to-date</p>
        </button>

        <button
          class="p-4 border-2 rounded-lg text-left transition-all {selectedFactSource === 'local'
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 hover:border-blue-300 dark:hover:border-blue-400'}"
          onclick={() => (selectedFactSource = "local")}
        >
          <div class="flex items-center gap-3 mb-2">
            <span class="text-2xl">📁</span>
            <span class="font-semibold text-gray-900 dark:text-white">Local Fact Files</span>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">Use exported fact files - works without PuppetDB</p>
        </button>
      </div>

      {#if selectedFactSource === "puppetdb"}
        <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden mb-4">
          <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
            <span class="font-medium text-gray-900 dark:text-white text-sm">PuppetDB Fact Source</span>
            <button
              class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
              onclick={() => copyToClipboard(puppetdbFactConfig)}
            >
              📋 Copy
            </button>
          </div>
          <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{puppetdbFactConfig}</pre>
        </div>

        <div class="p-4 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 rounded-r-lg">
          <h4 class="font-medium text-gray-900 dark:text-white mb-2">✅ PuppetDB Benefits:</h4>
          <ul class="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li>• Facts are always current from the last Puppet run</li>
            <li>• No manual fact file management required</li>
            <li>• Automatic discovery of all nodes</li>
            <li>• Requires PuppetDB integration to be configured</li>
          </ul>
        </div>
      {:else}
        <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden mb-4">
          <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
            <span class="font-medium text-gray-900 dark:text-white text-sm">Local Fact Files</span>
            <button
              class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
              onclick={() => copyToClipboard(localFactConfig)}
            >
              📋 Copy
            </button>
          </div>
          <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{localFactConfig}</pre>
        </div>

        <div class="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
          <h4 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Local Fact File Format</h4>
          <p class="text-gray-700 dark:text-gray-300 mb-3">
            Fact files should be JSON files named by node hostname (e.g., <code class="bg-gray-100 dark:bg-gray-600 px-1 rounded">web01.example.com.json</code>):
          </p>
          <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm">
            <div>{'{'}</div>
            <div>  "name": "web01.example.com",</div>
            <div>  "values": {'{'}</div>
            <div>    "os": {'{'} "family": "RedHat", "name": "CentOS" {'}'},</div>
            <div>    "networking": {'{'} "hostname": "web01" {'}'},</div>
            <div>    "environment": "production"</div>
            <div>  {'}'}</div>
            <div>{'}'}</div>
          </div>
        </div>

        <div class="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 rounded-r-lg">
          <h4 class="font-medium text-gray-900 dark:text-white mb-2">⚠️ Local Facts Limitations:</h4>
          <ul class="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li>• Facts may become outdated if not regularly exported</li>
            <li>• Manual management of fact files required</li>
            <li>• Export facts using: <code class="bg-gray-100 dark:bg-gray-600 px-1 rounded">puppet facts --render-as json &gt; node.json</code></li>
          </ul>
        </div>
      {/if}
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 4: Catalog Compilation Mode (Optional)</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">
        Enable catalog compilation for advanced Hiera resolution that includes Puppet code variables:
      </p>

      <div class="flex items-center gap-4 mb-6">
        <button
          aria-label="Toggle catalog compilation mode"
          class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors {catalogCompilationEnabled
            ? 'bg-blue-600'
            : 'bg-gray-300 dark:bg-gray-600'}"
          onclick={() => (catalogCompilationEnabled = !catalogCompilationEnabled)}
        >
          <span
            class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {catalogCompilationEnabled
              ? 'translate-x-6'
              : 'translate-x-1'}"
          ></span>
        </button>
        <span class="text-gray-700 dark:text-gray-300">
          {catalogCompilationEnabled ? 'Catalog Compilation Enabled' : 'Catalog Compilation Disabled (Default)'}
        </span>
      </div>

      {#if catalogCompilationEnabled}
        <div class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden mb-4">
          <div class="flex justify-between items-center px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
            <span class="font-medium text-gray-900 dark:text-white text-sm">Catalog Compilation Config</span>
            <button
              class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
              onclick={() => copyToClipboard(catalogCompilationConfig)}
            >
              📋 Copy
            </button>
          </div>
          <pre class="bg-gray-900 text-green-400 p-4 text-sm font-mono overflow-x-auto">{catalogCompilationConfig}</pre>
        </div>
      {/if}

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="p-4 bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500 rounded-r-lg">
          <h4 class="font-medium text-gray-900 dark:text-white mb-2">✅ Benefits:</h4>
          <ul class="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li>• Resolves variables defined in Puppet code</li>
            <li>• More accurate Hiera resolution</li>
            <li>• Detects class parameter defaults</li>
          </ul>
        </div>

        <div class="p-4 bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500 rounded-r-lg">
          <h4 class="font-medium text-gray-900 dark:text-white mb-2">⚠️ Performance Impact:</h4>
          <ul class="space-y-1 text-sm text-gray-700 dark:text-gray-300">
            <li>• Slower resolution (compiles full catalog)</li>
            <li>• Higher memory usage</li>
            <li>• Requires Puppetserver access</li>
            <li>• Results are cached to mitigate impact</li>
          </ul>
        </div>
      </div>

      <div class="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded-r-lg">
        <h4 class="font-medium text-gray-900 dark:text-white mb-2">💡 Recommendation:</h4>
        <p class="text-sm text-gray-700 dark:text-gray-300">
          Start with catalog compilation <strong>disabled</strong>. Most Hiera lookups work correctly with fact-only resolution.
          Enable catalog compilation only if you need to resolve variables that are defined in Puppet code (not facts).
        </p>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 5: Advanced Configuration (Optional)</h3>

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
            <li><strong>HIERA_CACHE_TTL</strong>: Cache duration in milliseconds (default: 300000 = 5 min)</li>
            <li><strong>HIERA_CACHE_MAX_ENTRIES</strong>: Maximum cached entries (default: 10000)</li>
            <li><strong>HIERA_CODE_ANALYSIS_ENABLED</strong>: Enable static code analysis</li>
            <li><strong>HIERA_CODE_ANALYSIS_LINT_ENABLED</strong>: Enable Puppet lint checks</li>
            <li><strong>HIERA_CODE_ANALYSIS_MODULE_UPDATE_CHECK</strong>: Check Puppetfile for updates</li>
            <li><strong>HIERA_CODE_ANALYSIS_INTERVAL</strong>: Analysis refresh interval (default: 3600000 = 1 hour)</li>
            <li><strong>HIERA_CODE_ANALYSIS_EXCLUSION_PATTERNS</strong>: Glob patterns to exclude from analysis</li>
          </ul>
        </div>
      {/if}
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 6: Restart Backend Server</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Apply the configuration by restarting the backend:</p>
      <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm space-y-1">
        <div>cd backend</div>
        <div>npm run dev</div>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Step 7: Verify Connection</h3>
      <p class="text-gray-700 dark:text-gray-300 mb-4">Test the Hiera integration configuration:</p>

      <button
        class="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
        onclick={testConnection}
        disabled={testingConnection}
      >
        {#if testingConnection}
          <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Testing Connection...
        {:else}
          🔍 Test Connection
        {/if}
      </button>

      {#if testResult}
        <div class="mt-4 p-4 rounded-lg {testResult.success
          ? 'bg-green-50 dark:bg-green-900/20 border-l-4 border-green-500'
          : 'bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500'}">
          <div class="flex items-start gap-3">
            <span class="text-xl">{testResult.success ? '✅' : '❌'}</span>
            <div>
              <h4 class="font-medium {testResult.success ? 'text-green-900 dark:text-green-200' : 'text-red-900 dark:text-red-200'}">
                {testResult.success ? 'Connection Successful' : 'Connection Failed'}
              </h4>
              <p class="text-sm {testResult.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}">
                {testResult.message}
              </p>
              {#if testResult.details}
                <details class="mt-2">
                  <summary class="text-sm cursor-pointer {testResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}">
                    Show Details
                  </summary>
                  <pre class="mt-2 text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded overflow-x-auto">{JSON.stringify(testResult.details, null, 2)}</pre>
                </details>
              {/if}
            </div>
          </div>
        </div>
      {/if}

      <div class="mt-4">
        <p class="text-gray-700 dark:text-gray-300 mb-3">Or verify via API:</p>
        <div class="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm">
          curl http://localhost:3000/api/integrations/hiera/status
        </div>
      </div>
    </div>
  </div>

  <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm mb-6">
    <div class="p-6">
      <h3 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">Features Available</h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">🔑</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Hiera Key Discovery</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Browse and search all Hiera keys</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">🎯</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Key Resolution</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Resolve keys for specific nodes</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">📊</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Code Analysis</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Detect unused code and lint issues</p>
        </div>
        <div class="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
          <span class="text-3xl block mb-2">📦</span>
          <h4 class="font-medium text-gray-900 dark:text-white mb-1">Module Updates</h4>
          <p class="text-sm text-gray-600 dark:text-gray-400">Check Puppetfile for updates</p>
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
            Control Repository Not Found
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "Control repository path does not exist"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Verify HIERA_CONTROL_REPO_PATH is an absolute path</li>
              <li>Check directory permissions are readable by the backend process</li>
              <li>Ensure the path exists: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ls -la /path/to/control-repo</code></li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Invalid hiera.yaml
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "Failed to parse hiera.yaml"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Ensure hiera.yaml uses Hiera 5 format (version: 5)</li>
              <li>Validate YAML syntax: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">ruby -ryaml -e "YAML.load_file('hiera.yaml')"</code></li>
              <li>Check for indentation errors in hierarchy definitions</li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Facts Not Available
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Error:</strong> "No facts available for node"</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>If using PuppetDB: Verify PuppetDB integration is configured and healthy</li>
              <li>If using local facts: Check HIERA_FACT_SOURCE_LOCAL_PATH points to correct directory</li>
              <li>Ensure fact files are named correctly: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">hostname.json</code></li>
              <li>Verify fact file format matches Puppetserver export format</li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Hiera Resolution Incomplete
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Issue:</strong> Some Hiera variables not resolving correctly</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Variables from Puppet code require catalog compilation mode</li>
              <li>Enable HIERA_CATALOG_COMPILATION_ENABLED=true for full resolution</li>
              <li>Check that all required facts are available for the node</li>
              <li>Verify hierarchy paths use correct variable syntax: <code class="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm">%{'{'}facts.os.family{'}'}</code></li>
            </ul>
          </div>
        </details>

        <details class="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
          <summary class="px-4 py-3 bg-gray-50 dark:bg-gray-700 cursor-pointer font-medium text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-600">
            Code Analysis Not Working
          </summary>
          <div class="p-4 text-gray-700 dark:text-gray-300">
            <p class="mb-3"><strong>Issue:</strong> Code analysis results are empty or incomplete</p>
            <ul class="space-y-2 list-disc list-inside">
              <li>Ensure HIERA_CODE_ANALYSIS_ENABLED=true</li>
              <li>Check exclusion patterns aren't too broad</li>
              <li>Verify manifests directory exists in control repo</li>
              <li>Wait for analysis interval to complete (default: 1 hour)</li>
            </ul>
          </div>
        </details>
      </div>
    </div>
  </div>

  <div class="mt-8 text-center">
    <p class="text-gray-600 dark:text-gray-400">
      For detailed documentation, see <a
        href="https://github.com/example42/pabawi/tree/main/docs/configuration.md"
        target="_blank"
        class="text-blue-600 dark:text-blue-400 hover:underline">configuration.md</a
      >
    </p>
  </div>
</div>
