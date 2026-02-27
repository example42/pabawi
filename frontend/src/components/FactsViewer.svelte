<script lang="ts">
  import FactsViewer from './FactsViewer.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';

  interface Props {
    facts: Record<string, unknown>;
    puppetFacts?: Record<string, unknown> | null;
    ansibleFacts?: Record<string, unknown> | null;
    sshFacts?: Record<string, unknown> | null;
    boltFacts?: Record<string, unknown> | null;
    showSourceSelector?: boolean;
    showCategorySelector?: boolean;
    showToggle?: boolean;
  }

  let {
    facts,
    puppetFacts = null,
    ansibleFacts = null,
    sshFacts = null,
    boltFacts = null,
    showSourceSelector = false,
    showCategorySelector = false,
    showToggle = true
  }: Props = $props();

  type FactSource = 'puppet' | 'ansible' | 'ssh' | 'bolt';
  type FactCategory = 'system' | 'network' | 'hardware' | 'trusted' | 'full';

  let activeSource = $state<FactSource>('puppet');
  let activeCategory = $state<FactCategory>('full');

  // All items expanded by default
  interface CollapsibleState {
    [key: string]: boolean;
  }

  let collapsed = $state<CollapsibleState>({});

  function toggleCollapse(key: string): void {
    collapsed[key] = !collapsed[key];
  }

  // Expand / Collapse all object/array entries
  function expandAll(): void {
    const entries = filteredFacts();
    for (const [key, value] of Object.entries(entries)) {
      if (isObject(value) || isArray(value)) {
        collapsed[key] = false;
      }
    }
  }

  function collapseAll(): void {
    const entries = filteredFacts();
    for (const [key, value] of Object.entries(entries)) {
      if (isObject(value) || isArray(value)) {
        collapsed[key] = true;
      }
    }
  }

  // Whether any collapsible keys exist in current view
  const hasCollapsibleKeys = $derived(() => {
    const entries = filteredFacts();
    return Object.values(entries).some(v => isObject(v) || isArray(v));
  });

  // Whether all collapsible keys are currently collapsed
  const allCollapsed = $derived(() => {
    const entries = filteredFacts();
    return Object.entries(entries)
      .filter(([, v]) => isObject(v) || isArray(v))
      .every(([k]) => collapsed[k]);
  });

  function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  function isArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
  }

  function formatValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return JSON.stringify(value);
  }

  // Get available sources
  const availableSources = $derived(() => {
    const sources: FactSource[] = [];
    if (puppetFacts && Object.keys(puppetFacts).length > 0) sources.push('puppet');
    if (ansibleFacts && Object.keys(ansibleFacts).length > 0) sources.push('ansible');
    if (sshFacts && Object.keys(sshFacts).length > 0) sources.push('ssh');
    if (boltFacts && Object.keys(boltFacts).length > 0) sources.push('bolt');
    return sources;
  });

  // Get current facts based on active source
  const currentFacts = $derived(() => {
    if (showSourceSelector) {
      if (activeSource === 'puppet' && puppetFacts) return puppetFacts;
      if (activeSource === 'ansible' && ansibleFacts) return ansibleFacts;
      if (activeSource === 'ssh' && sshFacts) return sshFacts;
      if (activeSource === 'bolt' && boltFacts) return boltFacts;
    }
    return facts;
  });

  // Categorize facts
  function categorizeFacts(factsData: Record<string, unknown>): Record<FactCategory, Record<string, unknown>> {
    const categorized: Record<FactCategory, Record<string, unknown>> = {
      system: {},
      network: {},
      hardware: {},
      trusted: {},
      full: factsData,
    };

    const systemKeys = [
      'os', 'osfamily', 'operatingsystem', 'operatingsystemrelease',
      'kernel', 'kernelversion', 'kernelrelease', 'kernelmajversion',
      'architecture', 'hardwaremodel',
      'uptime', 'timezone', 'hostname',
      'fqdn', 'domain', 'path', 'rubyversion', 'puppetversion',
      'ansible_distribution', 'ansible_os_family', 'ansible_hostname',
    ];

    const networkKeys = [
      'ipaddress', 'ipaddress6', 'macaddress', 'netmask', 'network',
      'interfaces', 'networking', 'defaultgateway', 'nameservers',
      'ansible_default_ipv4', 'ansible_all_ipv4_addresses', 'ansible_interfaces',
    ];

    const hardwareKeys = [
      // Processors
      'processor', 'processorcount', 'physicalprocessorcount', 'processors',
      // Virtualization
      'virtual', 'is_virtual', 'cloud', 'hypervisors',
      // Memory
      'memory', 'memorysize', 'memoryfree', 'swapsize', 'swapfree',
      // Disks & Storage
      'blockdevice', 'disks', 'partitions', 'mountpoints', 'filesystems',
      // System hardware / DMI
      'manufacturer', 'productname', 'serialnumber', 'uuid', 'bios', 'dmi',
      'boardmanufacturer', 'boardproductname', 'boardserialnumber',
      'chassistype', 'chassisassettag',
      // Ansible equivalents
      'ansible_memtotal_mb', 'ansible_memfree_mb', 'ansible_swaptotal_mb',
      'ansible_processor', 'ansible_processor_count', 'ansible_processor_vcpus',
      'ansible_product_name', 'ansible_product_serial', 'ansible_bios',
      'ansible_mounts', 'ansible_devices', 'ansible_virtualization',
    ];

    const trustedKeys = ['trusted'];

    for (const [key, value] of Object.entries(factsData)) {
      const lowerKey = key.toLowerCase();

      if (trustedKeys.some(k => lowerKey.includes(k))) {
        categorized.trusted[key] = value;
      } else if (systemKeys.some(k => lowerKey.includes(k))) {
        categorized.system[key] = value;
      } else if (networkKeys.some(k => lowerKey.includes(k))) {
        categorized.network[key] = value;
      } else if (hardwareKeys.some(k => lowerKey.includes(k))) {
        categorized.hardware[key] = value;
      }
    }

    return categorized;
  }

  // Get filtered facts based on category
  const filteredFacts = $derived(() => {
    if (!showCategorySelector || activeCategory === 'full') {
      return currentFacts();
    }
    const categorized = categorizeFacts(currentFacts());
    return categorized[activeCategory];
  });

  // Category labels
  const categoryLabels: Record<FactCategory, string> = {
    system: 'System',
    network: 'Network',
    hardware: 'Hardware',
    trusted: 'Trusted',
    full: 'Full',
  };

  // Source labels for integration badge
  const sourceIntegrationMap: Record<FactSource, 'puppet' | 'ansible' | 'bolt'> = {
    puppet: 'puppet',
    ansible: 'ansible',
    ssh: 'bolt',
    bolt: 'bolt',
  };
</script>

<div class="facts-viewer space-y-3">
  <!-- Source Selector -->
  {#if showSourceSelector && availableSources().length > 0}
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Facts Source
      </label>
      <div class="flex flex-wrap gap-2">
        {#each availableSources() as source}
          <button
            type="button"
            onclick={() => activeSource = source}
            class="flex items-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all {activeSource === source
              ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
              : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-blue-400 dark:hover:bg-gray-700'}"
          >
            <IntegrationBadge integration={sourceIntegrationMap[source]} variant="dot" size="md" />
            <span class="capitalize">{source}</span>
            {#if activeSource === source}
              <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
              </svg>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Category Selector -->
  {#if showCategorySelector}
    <div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Facts Category
      </label>
      <div class="flex flex-wrap gap-2">
        {#each Object.entries(categoryLabels) as [category, label]}
          {@const factCount = category === 'full' ? Object.keys(currentFacts()).length : Object.keys(categorizeFacts(currentFacts())[category as FactCategory]).length}
          <button
            type="button"
            onclick={() => activeCategory = category as FactCategory}
            class="flex items-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all {activeCategory === category
              ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
              : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-blue-400 dark:hover:bg-gray-700'}"
          >
            <span>{label}</span>
            <span class="text-xs opacity-70">({factCount})</span>
            {#if activeCategory === category}
              <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
              </svg>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Facts Display -->
  <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
    <!-- Expand / Collapse All Toggle -->
    {#if showToggle && hasCollapsibleKeys()}
      <div class="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-3 py-1.5">
        <span class="text-xs text-gray-500 dark:text-gray-400">
          {Object.keys(filteredFacts()).length} facts
        </span>
        <button
          type="button"
          onclick={() => allCollapsed() ? expandAll() : collapseAll()}
          class="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 dark:text-gray-300 dark:hover:text-white dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors"
        >
          {#if allCollapsed()}
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
            </svg>
            Expand All
          {:else}
            <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V4.5M9 9H4.5M9 9L3.5 3.5M9 15v4.5M9 15H4.5M9 15l-5.5 5.5M15 9h4.5M15 9V4.5M15 9l5.5-5.5M15 15h4.5M15 15v4.5m0-4.5l5.5 5.5" />
            </svg>
            Collapse All
          {/if}
        </button>
      </div>
    {/if}
    <div class="p-2">
    {#if Object.keys(filteredFacts()).length === 0}
      <p class="text-center text-sm text-gray-500 dark:text-gray-400 py-2">
        No facts available in this category
      </p>
    {:else}
      <div class="space-y-0.5">
        {#each Object.entries(filteredFacts()) as [key, value]}
          <div class="fact-item">
            {#if isObject(value) || isArray(value)}
              <button
                type="button"
                class="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                onclick={() => toggleCollapse(key)}
              >
                <svg
                  class="h-3.5 w-3.5 flex-shrink-0 transition-transform {collapsed[key] ? '' : 'rotate-90'}"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
                <span class="font-semibold text-gray-800 dark:text-gray-200">{key}</span>
                <span class="text-xs text-gray-500 dark:text-gray-400">
                  {isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`}
                </span>
              </button>
              {#if !collapsed[key]}
                <div class="ml-5 mt-0.5 border-l border-gray-200 pl-2 dark:border-gray-700">
                  <FactsViewer facts={value as Record<string, unknown>} showToggle={false} />
                </div>
              {/if}
            {:else}
              <div class="flex items-start gap-2 px-2 py-0.5 text-sm rounded hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <span class="font-semibold text-gray-800 dark:text-gray-200 min-w-[100px]">{key}:</span>
                <span class="text-gray-700 dark:text-gray-300 break-all">{formatValue(value)}</span>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
    </div>
  </div>
</div>
