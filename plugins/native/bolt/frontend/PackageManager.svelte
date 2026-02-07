<!--
  Bolt Package Manager Widget

  Provides package management interface for installing, uninstalling, and updating packages.
  Can be used in both node-specific and global contexts.

  @module plugins/native/bolt/frontend/PackageManager
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { getPluginContext } from '@pabawi/plugin-sdk';

  // Get plugin context
  const { ui, api } = getPluginContext();
  const { LoadingSpinner } = ui;

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Node ID (optional - if provided, shows node-specific packages) */
    nodeId?: string;
  }

  let { nodeId }: Props = $props();

  // ==========================================================================
  // Types
  // ==========================================================================

  interface PackageInfo {
    name: string;
    version?: string;
    availableVersion?: string;
    status: 'installed' | 'not_installed' | 'upgradable' | 'broken';
    description?: string;
    size?: string;
    installedAt?: string;
    repository?: string;
  }

  interface PackageOperationResult {
    id: string;
    operation: 'install' | 'uninstall' | 'update';
    packageName: string;
    status: 'running' | 'success' | 'failed' | 'partial';
    results: Array<{
      nodeId: string;
      status: 'success' | 'failed';
      error?: string;
    }>;
    error?: string;
  }

  // ==========================================================================
  // State
  // ==========================================================================

  let activeTab = $state<'installed' | 'install' | 'search'>('installed');
  let loading = $state(false);
  let error = $state<string | null>(null);

  // Installed packages state
  let installedPackages = $state<PackageInfo[]>([]);
  let packageFilter = $state('');

  // Install state
  let packageToInstall = $state('');
  let versionToInstall = $state('');
  let installing = $state(false);
  let installResult = $state<PackageOperationResult | null>(null);

  // Search state
  let searchQuery = $state('');
  let searchResults = $state<Array<{ name: string; version: string; description?: string }>>([]);
  let searching = $state(false);

  // ==========================================================================
  // Derived
  // ==========================================================================

  let filteredPackages = $derived(
    installedPackages.filter(pkg =>
      packageFilter === '' ||
      pkg.name.toLowerCase().includes(packageFilter.toLowerCase())
    )
  );

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    if (nodeId) {
      void loadInstalledPackages();
    }
  });

  // ==========================================================================
  // Tab Management
  // ==========================================================================

  function switchTab(tab: typeof activeTab): void {
    activeTab = tab;
    error = null;

    if (tab === 'installed' && nodeId) {
      void loadInstalledPackages();
    }
  }

  // ==========================================================================
  // Installed Packages Tab
  // ==========================================================================

  async function loadInstalledPackages(): Promise<void> {
    if (!nodeId) return;

    loading = true;
    error = null;

    try {
      const response = await api.post<{ packages: PackageInfo[] }>('/api/capabilities/package.list', {
        nodeId,
        filter: packageFilter || undefined,
      });

      installedPackages = response.packages || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load installed packages';
    } finally {
      loading = false;
    }
  }

  async function uninstallPackage(packageName: string): Promise<void> {
    if (!nodeId || !confirm(`Are you sure you want to uninstall ${packageName}?`)) return;

    loading = true;
    error = null;

    try {
      await api.post<PackageOperationResult>('/api/capabilities/package.uninstall', {
        packageName,
        targets: [nodeId],
      });

      // Reload packages
      await loadInstalledPackages();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to uninstall package';
    } finally {
      loading = false;
    }
  }

  async function updatePackage(packageName: string): Promise<void> {
    if (!nodeId) return;

    loading = true;
    error = null;

    try {
      await api.post<PackageOperationResult>('/api/capabilities/package.update', {
        packageName,
        targets: [nodeId],
      });

      // Reload packages
      await loadInstalledPackages();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to update package';
    } finally {
      loading = false;
    }
  }

  // ==========================================================================
  // Install Package Tab
  // ==========================================================================

  async function installPackage(): Promise<void> {
    if (!nodeId || !packageToInstall.trim()) return;

    installing = true;
    error = null;
    installResult = null;

    try {
      const result = await api.post<PackageOperationResult>('/api/capabilities/package.install', {
        packageName: packageToInstall.trim(),
        version: versionToInstall.trim() || undefined,
        targets: [nodeId],
      });

      installResult = result;

      // Clear form on success
      if (result.status === 'success') {
        packageToInstall = '';
        versionToInstall = '';

        // Reload installed packages
        if (activeTab === 'installed') {
          await loadInstalledPackages();
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to install package';
    } finally {
      installing = false;
    }
  }

  // ==========================================================================
  // Search Tab
  // ==========================================================================

  async function searchPackages(): Promise<void> {
    if (!searchQuery.trim()) return;

    searching = true;
    error = null;

    try {
      const response = await api.post<{ packages: Array<{ name: string; version: string; description?: string }> }>(
        '/api/capabilities/package.search',
        {
          query: searchQuery.trim(),
          limit: 50,
        }
      );

      searchResults = response.packages || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to search packages';
    } finally {
      searching = false;
    }
  }

  function installFromSearch(packageName: string, version: string): void {
    packageToInstall = packageName;
    versionToInstall = version;
    switchTab('install');
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  function getStatusColor(status: string): string {
    switch (status) {
      case 'installed': return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
      case 'upgradable': return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30';
      case 'broken': return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
      default: return 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-900/30';
    }
  }
</script>

{#if !nodeId}
  <div class="text-center py-12">
    <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
    <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No Node Selected</h3>
    <p class="text-sm text-gray-500 dark:text-gray-400">
      Select a node to manage packages
    </p>
  </div>
{:else}
  <!-- Tab Navigation -->
  <div class="border-b border-gray-200 dark:border-gray-700 mb-4">
    <nav class="flex gap-4" aria-label="Package Tabs">
      <button
        type="button"
        onclick={() => switchTab('installed')}
        class="py-3 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'installed'
          ? 'border-amber-500 text-amber-600 dark:text-amber-400'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
      >
        Installed
      </button>
      <button
        type="button"
        onclick={() => switchTab('install')}
        class="py-3 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'install'
          ? 'border-amber-500 text-amber-600 dark:text-amber-400'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
      >
        Install
      </button>
      <button
        type="button"
        onclick={() => switchTab('search')}
        class="py-3 px-1 border-b-2 font-medium text-sm transition-colors {activeTab === 'search'
          ? 'border-amber-500 text-amber-600 dark:text-amber-400'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'}"
      >
        Search
      </button>
    </nav>
  </div>

  <!-- Error Display -->
  {#if error}
    <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
      <div class="flex items-center gap-2">
        <svg class="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span class="text-sm text-red-800 dark:text-red-200">{error}</span>
      </div>
    </div>
  {/if}

  <!-- Tab Content -->
  <div>
    <!-- Installed Packages Tab -->
    {#if activeTab === 'installed'}
      <div class="space-y-4">
        <div class="flex gap-2">
          <input
            type="text"
            bind:value={packageFilter}
            placeholder="Filter packages..."
            class="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
          <button
            type="button"
            onclick={() => loadInstalledPackages()}
            disabled={loading}
            class="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            Refresh
          </button>
        </div>

        {#if loading}
          <div class="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        {:else if filteredPackages.length > 0}
          <div class="space-y-2">
            {#each filteredPackages as pkg}
              <div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg">
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-gray-900 dark:text-white">{pkg.name}</span>
                      <span class="px-2 py-0.5 text-xs rounded-full {getStatusColor(pkg.status)}">
                        {pkg.status}
                      </span>
                    </div>
                    {#if pkg.description}
                      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{pkg.description}</p>
                    {/if}
                    <div class="flex gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {#if pkg.version}
                        <span>Version: {pkg.version}</span>
                      {/if}
                      {#if pkg.availableVersion && pkg.status === 'upgradable'}
                        <span>Available: {pkg.availableVersion}</span>
                      {/if}
                      {#if pkg.size}
                        <span>Size: {pkg.size}</span>
                      {/if}
                    </div>
                  </div>
                  <div class="flex gap-2 ml-4">
                    {#if pkg.status === 'upgradable'}
                      <button
                        type="button"
                        onclick={() => updatePackage(pkg.name)}
                        class="px-3 py-1 text-sm bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors"
                      >
                        Update
                      </button>
                    {/if}
                    <button
                      type="button"
                      onclick={() => uninstallPackage(pkg.name)}
                      class="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                    >
                      Uninstall
                    </button>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-center py-12 text-gray-500 dark:text-gray-400">
            No packages found
          </div>
        {/if}
      </div>
    {/if}

    <!-- Install Package Tab -->
    {#if activeTab === 'install'}
      <div class="space-y-4">
        <div>
          <label for="package-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Package Name
          </label>
          <input
            id="package-name"
            type="text"
            bind:value={packageToInstall}
            placeholder="e.g., nginx, apache2, postgresql"
            class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
        </div>

        <div>
          <label for="package-version" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Version (optional)
          </label>
          <input
            id="package-version"
            type="text"
            bind:value={versionToInstall}
            placeholder="e.g., 1.18.0"
            class="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          />
        </div>

        <button
          type="button"
          onclick={installPackage}
          disabled={installing || !packageToInstall.trim()}
          class="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {installing ? 'Installing...' : 'Install Package'}
        </button>

        {#if installResult}
          <div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div class="flex items-center justify-between mb-2">
              <h3 class="font-medium text-gray-900 dark:text-white">Installation Result</h3>
              <span class="px-2 py-1 text-xs rounded-full {getStatusColor(installResult.status)}">
                {installResult.status}
              </span>
            </div>
            {#if installResult.error}
              <p class="text-sm text-red-600 dark:text-red-400">{installResult.error}</p>
            {:else}
              <p class="text-sm text-green-600 dark:text-green-400">
                Package {installResult.packageName} installed successfully
              </p>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Search Tab -->
    {#if activeTab === 'search'}
      <div class="space-y-4">
        <div class="flex gap-2">
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search packages..."
            class="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent"
            onkeydown={(e) => e.key === 'Enter' && searchPackages()}
          />
          <button
            type="button"
            onclick={searchPackages}
            disabled={searching || !searchQuery.trim()}
            class="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {#if searching}
          <div class="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        {:else if searchResults.length > 0}
          <div class="space-y-2">
            {#each searchResults as pkg}
              <div class="p-4 border border-gray-200 dark:border-gray-700 rounded-lg flex items-start justify-between">
                <div class="flex-1">
                  <div class="font-medium text-gray-900 dark:text-white">{pkg.name}</div>
                  {#if pkg.description}
                    <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">{pkg.description}</p>
                  {/if}
                  <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Version: {pkg.version}
                  </div>
                </div>
                <button
                  type="button"
                  onclick={() => installFromSearch(pkg.name, pkg.version)}
                  class="px-3 py-1 text-sm bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors ml-4"
                >
                  Install
                </button>
              </div>
            {/each}
          </div>
        {:else if searchQuery}
          <div class="text-center py-12 text-gray-500 dark:text-gray-400">
            No packages found
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}
