<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';
  import { get } from '../lib/api';
  import type { DebugInfo } from '../lib/api';
  import { showError } from '../lib/toast.svelte';
  import { expertMode } from '../lib/expertMode.svelte';

  interface Props {
    onDebugInfo?: (info: DebugInfo | null) => void;
  }

  let { onDebugInfo }: Props = $props();

  // Types based on backend Hiera types
  interface UnusedItem {
    name: string;
    file: string;
    line: number;
    type: 'class' | 'defined_type' | 'hiera_key';
  }

  interface UnusedCodeReport {
    unusedClasses: UnusedItem[];
    unusedDefinedTypes: UnusedItem[];
    unusedHieraKeys: UnusedItem[];
    totals: {
      classes: number;
      definedTypes: number;
      hieraKeys: number;
    };
  }

  interface LintIssue {
    file: string;
    line: number;
    column: number;
    severity: 'error' | 'warning' | 'info';
    message: string;
    rule: string;
    fixable: boolean;
  }

  interface IssueCounts {
    bySeverity: {
      error: number;
      warning: number;
      info: number;
    };
    byRule: Record<string, number>;
    total: number;
  }

  interface LintResponse {
    issues: LintIssue[];
    counts: IssueCounts;
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }

  interface ModuleUpdate {
    name: string;
    currentVersion: string;
    latestVersion: string;
    source: 'forge' | 'git';
    hasSecurityAdvisory: boolean;
    changelog?: string;
  }

  interface ModulesResponse {
    modules: ModuleUpdate[];
    summary: {
      total: number;
      withUpdates: number;
      upToDate: number;
      withSecurityAdvisories: number;
    };
    modulesWithUpdates: ModuleUpdate[];
    modulesWithSecurityAdvisories: ModuleUpdate[];
  }

  interface ClassUsage {
    name: string;
    usageCount: number;
    nodes: string[];
  }

  interface ResourceUsage {
    type: string;
    count: number;
  }

  interface UsageStatistics {
    totalManifests: number;
    totalClasses: number;
    totalDefinedTypes: number;
    totalFunctions: number;
    linesOfCode: number;
    mostUsedClasses: ClassUsage[];
    mostUsedResources: ResourceUsage[];
  }

  interface StatisticsResponse {
    statistics: UsageStatistics;
    _debug?: DebugInfo;
  }

  interface UnusedCodeReportResponse extends UnusedCodeReport {
    _debug?: DebugInfo;
  }

  interface LintResponseWithDebug extends LintResponse {
    _debug?: DebugInfo;
  }

  interface ModulesResponseWithDebug extends ModulesResponse {
    _debug?: DebugInfo;
  }

  // State
  let activeSection = $state<'statistics' | 'unused' | 'lint' | 'modules'>('statistics');
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Data state
  let statistics = $state<UsageStatistics | null>(null);
  let unusedCode = $state<UnusedCodeReport | null>(null);
  let lintData = $state<LintResponse | null>(null);
  let modulesData = $state<ModulesResponse | null>(null);

  // Lint filter state
  let lintSeverityFilter = $state<string[]>([]);
  let lintPage = $state(1);

  // Unused code filter state
  let unusedTypeFilter = $state<'all' | 'class' | 'defined_type' | 'hiera_key'>('all');

  // Fetch statistics
  async function fetchStatistics(): Promise<void> {
    try {
      const data = await get<StatisticsResponse>(
        '/api/integrations/hiera/analysis/statistics',
        { maxRetries: 2 }
      );
      statistics = data.statistics;

      // Pass debug info to parent
      if (onDebugInfo && data._debug) {
        onDebugInfo(data._debug);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      if (errorMessage.includes('not configured') || errorMessage.includes('503')) {
        error = 'Hiera integration is not configured. Please configure a control repository in the Integration Setup page.';
      } else {
        error = errorMessage;
      }
      console.error('Error fetching statistics:', err);
    }
  }

  // Fetch unused code
  async function fetchUnusedCode(): Promise<void> {
    try {
      const data = await get<UnusedCodeReportResponse>(
        '/api/integrations/hiera/analysis/unused',
        { maxRetries: 2 }
      );
      unusedCode = data;

      // Pass debug info to parent
      if (onDebugInfo && data._debug) {
        onDebugInfo(data._debug);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching unused code:', err);
      showError('Failed to load unused code', errorMessage);
    }
  }

  // Fetch lint issues
  async function fetchLintIssues(): Promise<void> {
    try {
      let url = `/api/integrations/hiera/analysis/lint?page=${lintPage}&pageSize=50`;
      if (lintSeverityFilter.length > 0) {
        url += `&severity=${lintSeverityFilter.join(',')}`;
      }
      const data = await get<LintResponseWithDebug>(url, { maxRetries: 2 });
      lintData = data;

      // Pass debug info to parent
      if (onDebugInfo && data._debug) {
        onDebugInfo(data._debug);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching lint issues:', err);
      showError('Failed to load lint issues', errorMessage);
    }
  }

  // Fetch module updates
  async function fetchModuleUpdates(): Promise<void> {
    try {
      const data = await get<ModulesResponseWithDebug>(
        '/api/integrations/hiera/analysis/modules',
        { maxRetries: 2 }
      );
      modulesData = data;

      // Pass debug info to parent
      if (onDebugInfo && data._debug) {
        onDebugInfo(data._debug);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching module updates:', err);
      showError('Failed to load module updates', errorMessage);
    }
  }

  // Load data for active section
  async function loadSectionData(section: typeof activeSection): Promise<void> {
    loading = true;
    error = null;

    switch (section) {
      case 'statistics':
        if (!statistics) await fetchStatistics();
        break;
      case 'unused':
        if (!unusedCode) await fetchUnusedCode();
        break;
      case 'lint':
        await fetchLintIssues();
        break;
      case 'modules':
        if (!modulesData) await fetchModuleUpdates();
        break;
    }

    loading = false;
  }

  // Switch section
  function switchSection(section: typeof activeSection): void {
    activeSection = section;
    loadSectionData(section);
  }

  // Get severity badge class
  function getSeverityBadgeClass(severity: string): string {
    switch (severity) {
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'info':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  }

  // Get type badge class
  function getTypeBadgeClass(type: string): string {
    switch (type) {
      case 'class':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
      case 'defined_type':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
      case 'hiera_key':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
    }
  }

  // Format type for display
  function formatType(type: string): string {
    switch (type) {
      case 'class':
        return 'Class';
      case 'defined_type':
        return 'Defined Type';
      case 'hiera_key':
        return 'Hiera Key';
      default:
        return type;
    }
  }

  // Filter unused items
  const filteredUnusedItems = $derived(() => {
    if (!unusedCode) return [];

    const allItems: UnusedItem[] = [
      ...unusedCode.unusedClasses,
      ...unusedCode.unusedDefinedTypes,
      ...unusedCode.unusedHieraKeys,
    ];

    if (unusedTypeFilter === 'all') {
      return allItems;
    }

    return allItems.filter(item => item.type === unusedTypeFilter);
  });

  // Toggle severity filter
  function toggleSeverityFilter(severity: string): void {
    if (lintSeverityFilter.includes(severity)) {
      lintSeverityFilter = lintSeverityFilter.filter(s => s !== severity);
    } else {
      lintSeverityFilter = [...lintSeverityFilter, severity];
    }
    lintPage = 1;
    fetchLintIssues();
  }

  // Pagination handlers
  function goToLintPage(page: number): void {
    lintPage = page;
    fetchLintIssues();
  }

  onMount(() => {
    loadSectionData(activeSection);
  });
</script>

<div class="code-analysis-tab space-y-4">
  <!-- Section Navigation -->
  <div class="flex flex-wrap gap-2 border-b border-gray-200 pb-4 dark:border-gray-700">
    <button
      type="button"
      class="px-4 py-2 text-sm font-medium rounded-lg transition-colors {activeSection === 'statistics'
        ? 'bg-primary-600 text-white'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
      onclick={() => switchSection('statistics')}
    >
      <div class="flex items-center gap-2">
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        Statistics
      </div>
    </button>
    <button
      type="button"
      class="px-4 py-2 text-sm font-medium rounded-lg transition-colors {activeSection === 'unused'
        ? 'bg-primary-600 text-white'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
      onclick={() => switchSection('unused')}
    >
      <div class="flex items-center gap-2">
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        Unused Code
      </div>
    </button>
    <button
      type="button"
      class="px-4 py-2 text-sm font-medium rounded-lg transition-colors {activeSection === 'lint'
        ? 'bg-primary-600 text-white'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
      onclick={() => switchSection('lint')}
    >
      <div class="flex items-center gap-2">
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        Lint Issues
      </div>
    </button>
    <button
      type="button"
      class="px-4 py-2 text-sm font-medium rounded-lg transition-colors {activeSection === 'modules'
        ? 'bg-primary-600 text-white'
        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
      onclick={() => switchSection('modules')}
    >
      <div class="flex items-center gap-2">
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
        Module Updates
      </div>
    </button>
  </div>

  <!-- Content Area -->
  {#if loading}
    <div class="flex justify-center py-12">
      <LoadingSpinner size="lg" message="Loading analysis data..." />
    </div>
  {:else if error}
    <ErrorAlert
      message="Failed to load code analysis"
      details={error}
      onRetry={() => loadSectionData(activeSection)}
    />

    <!-- Setup guidance for unconfigured integration -->
    {#if error.includes('not configured')}
      <div class="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
        <div class="flex items-start gap-3">
          <svg class="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div class="flex-1">
            <h4 class="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">Setup Required</h4>
            <p class="text-sm text-blue-800 dark:text-blue-400 mb-2">
              To view code analysis, you need to configure the Hiera integration with your Puppet control repository.
            </p>
            <ol class="text-sm text-blue-800 dark:text-blue-400 space-y-1 list-decimal list-inside">
              <li>Go to the Integration Setup page</li>
              <li>Configure the path to your Puppet control repository</li>
              <li>Ensure the repository contains Puppet manifests and a Puppetfile</li>
              <li>Return to this page to view code analysis</li>
            </ol>
          </div>
        </div>
      </div>
    {/if}
  {:else}

    <!-- Statistics Section -->
    {#if activeSection === 'statistics' && statistics}
      <div class="space-y-6">
        <!-- Stats Grid -->
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div class="text-2xl font-bold text-gray-900 dark:text-white">{statistics.totalManifests}</div>
            <div class="text-sm text-gray-600 dark:text-gray-400">Manifests</div>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div class="text-2xl font-bold text-purple-600 dark:text-purple-400">{statistics.totalClasses}</div>
            <div class="text-sm text-gray-600 dark:text-gray-400">Classes</div>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">{statistics.totalDefinedTypes}</div>
            <div class="text-sm text-gray-600 dark:text-gray-400">Defined Types</div>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div class="text-2xl font-bold text-green-600 dark:text-green-400">{statistics.totalFunctions}</div>
            <div class="text-sm text-gray-600 dark:text-gray-400">Functions</div>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div class="text-2xl font-bold text-orange-600 dark:text-orange-400">{statistics.linesOfCode.toLocaleString()}</div>
            <div class="text-sm text-gray-600 dark:text-gray-400">Lines of Code</div>
          </div>
        </div>

        <!-- Most Used Classes -->
        {#if statistics.mostUsedClasses.length > 0}
          <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div class="border-b border-gray-200 p-4 dark:border-gray-700">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Most Used Classes</h3>
              <p class="text-sm text-gray-600 dark:text-gray-400">Classes ranked by usage frequency across nodes</p>
            </div>
            <div class="divide-y divide-gray-200 dark:divide-gray-700">
              {#each statistics.mostUsedClasses.slice(0, 10) as classUsage, index (classUsage.name)}
                <div class="flex items-center justify-between p-4">
                  <div class="flex items-center gap-3">
                    <span class="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-sm font-medium text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
                      {index + 1}
                    </span>
                    <div>
                      <span class="font-mono text-sm font-medium text-gray-900 dark:text-white">{classUsage.name}</span>
                      {#if expertMode.enabled && classUsage.nodes.length > 0}
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Nodes: {classUsage.nodes.slice(0, 3).join(', ')}{classUsage.nodes.length > 3 ? ` +${classUsage.nodes.length - 3} more` : ''}
                        </p>
                      {/if}
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
                      {classUsage.usageCount} node{classUsage.usageCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Most Used Resources -->
        {#if statistics.mostUsedResources.length > 0}
          <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div class="border-b border-gray-200 p-4 dark:border-gray-700">
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Most Used Resource Types</h3>
              <p class="text-sm text-gray-600 dark:text-gray-400">Resource types ranked by total count</p>
            </div>
            <div class="divide-y divide-gray-200 dark:divide-gray-700">
              {#each statistics.mostUsedResources.slice(0, 10) as resource, index (resource.type)}
                <div class="flex items-center justify-between p-4">
                  <div class="flex items-center gap-3">
                    <span class="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-medium text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                      {index + 1}
                    </span>
                    <span class="font-mono text-sm font-medium text-gray-900 dark:text-white">{resource.type}</span>
                  </div>
                  <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
                    {resource.count.toLocaleString()} instance{resource.count !== 1 ? 's' : ''}
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Unused Code Section -->
    {#if activeSection === 'unused' && unusedCode}
      <div class="space-y-4">
        <!-- Summary -->
        <div class="grid grid-cols-3 gap-4">
          <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div class="text-2xl font-bold text-purple-600 dark:text-purple-400">{unusedCode.totals.classes}</div>
            <div class="text-sm text-gray-600 dark:text-gray-400">Unused Classes</div>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">{unusedCode.totals.definedTypes}</div>
            <div class="text-sm text-gray-600 dark:text-gray-400">Unused Defined Types</div>
          </div>
          <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div class="text-2xl font-bold text-orange-600 dark:text-orange-400">{unusedCode.totals.hieraKeys}</div>
            <div class="text-sm text-gray-600 dark:text-gray-400">Unused Hiera Keys</div>
          </div>
        </div>

        <!-- Filter -->
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-600 dark:text-gray-400">Filter:</span>
          <div class="flex rounded-lg border border-gray-300 dark:border-gray-600">
            <button
              type="button"
              class="px-3 py-1.5 text-sm font-medium rounded-l-lg {unusedTypeFilter === 'all' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
              onclick={() => unusedTypeFilter = 'all'}
            >
              All
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-sm font-medium border-l border-gray-300 dark:border-gray-600 {unusedTypeFilter === 'class' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
              onclick={() => unusedTypeFilter = 'class'}
            >
              Classes
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-sm font-medium border-l border-gray-300 dark:border-gray-600 {unusedTypeFilter === 'defined_type' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
              onclick={() => unusedTypeFilter = 'defined_type'}
            >
              Defined Types
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-sm font-medium border-l border-gray-300 dark:border-gray-600 rounded-r-lg {unusedTypeFilter === 'hiera_key' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
              onclick={() => unusedTypeFilter = 'hiera_key'}
            >
              Hiera Keys
            </button>
          </div>
        </div>

        <!-- Unused Items List -->
        {#if filteredUnusedItems().length === 0}
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-900/50">
            <svg class="mx-auto h-12 w-12 text-green-500 dark:text-green-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No Unused Code Found</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {unusedTypeFilter === 'all' ? 'All code in your control repository is being used.' : `No unused ${formatType(unusedTypeFilter).toLowerCase()}s found.`}
            </p>
          </div>
        {:else}
          <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div class="divide-y divide-gray-200 dark:divide-gray-700">
              {#each filteredUnusedItems() as item (item.name + item.file + item.line)}
                <div class="flex items-start justify-between p-4">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="font-mono text-sm font-medium text-gray-900 dark:text-white">{item.name}</span>
                      <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {getTypeBadgeClass(item.type)}">
                        {formatType(item.type)}
                      </span>
                    </div>
                    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400 font-mono">
                      {item.file}:{item.line}
                    </p>
                  </div>
                </div>
              {/each}
            </div>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Showing {filteredUnusedItems().length} unused item{filteredUnusedItems().length !== 1 ? 's' : ''}
          </p>
        {/if}
      </div>
    {/if}


    <!-- Lint Issues Section -->
    {#if activeSection === 'lint' && lintData}
      <div class="space-y-4">
        <!-- Summary -->
        <div class="grid grid-cols-3 gap-4">
          <div class="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
            <div class="text-2xl font-bold text-red-600 dark:text-red-400">{lintData.counts.bySeverity.error}</div>
            <div class="text-sm text-red-700 dark:text-red-300">Errors</div>
          </div>
          <div class="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
            <div class="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{lintData.counts.bySeverity.warning}</div>
            <div class="text-sm text-yellow-700 dark:text-yellow-300">Warnings</div>
          </div>
          <div class="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
            <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">{lintData.counts.bySeverity.info}</div>
            <div class="text-sm text-blue-700 dark:text-blue-300">Info</div>
          </div>
        </div>

        <!-- Severity Filter -->
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-600 dark:text-gray-400">Filter by severity:</span>
          <div class="flex gap-2">
            <button
              type="button"
              class="px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors {lintSeverityFilter.includes('error')
                ? 'bg-red-100 border-red-300 text-red-800 dark:bg-red-900/20 dark:border-red-700 dark:text-red-400'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600'}"
              onclick={() => toggleSeverityFilter('error')}
            >
              Errors
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors {lintSeverityFilter.includes('warning')
                ? 'bg-yellow-100 border-yellow-300 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-700 dark:text-yellow-400'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600'}"
              onclick={() => toggleSeverityFilter('warning')}
            >
              Warnings
            </button>
            <button
              type="button"
              class="px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors {lintSeverityFilter.includes('info')
                ? 'bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-900/20 dark:border-blue-700 dark:text-blue-400'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600'}"
              onclick={() => toggleSeverityFilter('info')}
            >
              Info
            </button>
          </div>
          {#if lintSeverityFilter.length > 0}
            <button
              type="button"
              class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              onclick={() => { lintSeverityFilter = []; lintPage = 1; fetchLintIssues(); }}
            >
              Clear filters
            </button>
          {/if}
        </div>

        <!-- Issues List -->
        {#if lintData.issues.length === 0}
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-900/50">
            <svg class="mx-auto h-12 w-12 text-green-500 dark:text-green-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No Lint Issues Found</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {lintSeverityFilter.length > 0 ? 'No issues match the selected filters.' : 'Your Puppet code has no lint issues.'}
            </p>
          </div>
        {:else}
          <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div class="divide-y divide-gray-200 dark:divide-gray-700">
              {#each lintData.issues as issue (issue.file + issue.line + issue.column + issue.rule)}
                <div class="p-4">
                  <div class="flex items-start justify-between">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2 mb-1">
                        <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {getSeverityBadgeClass(issue.severity)}">
                          {issue.severity}
                        </span>
                        <span class="text-xs text-gray-500 dark:text-gray-400 font-mono">{issue.rule}</span>
                        {#if issue.fixable}
                          <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                            Fixable
                          </span>
                        {/if}
                      </div>
                      <p class="text-sm text-gray-900 dark:text-white">{issue.message}</p>
                      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400 font-mono">
                        {issue.file}:{issue.line}:{issue.column}
                      </p>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>

          <!-- Pagination -->
          {#if lintData.totalPages > 1}
            <div class="flex items-center justify-between">
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Showing {(lintData.page - 1) * lintData.pageSize + 1} - {Math.min(lintData.page * lintData.pageSize, lintData.total)} of {lintData.total} issues
              </p>
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  disabled={lintData.page <= 1}
                  onclick={() => goToLintPage(lintData!.page - 1)}
                >
                  Previous
                </button>
                <span class="text-sm text-gray-600 dark:text-gray-400">
                  Page {lintData.page} of {lintData.totalPages}
                </span>
                <button
                  type="button"
                  class="px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  disabled={lintData.page >= lintData.totalPages}
                  onclick={() => goToLintPage(lintData!.page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          {/if}
        {/if}
      </div>
    {/if}

    <!-- Module Updates Section -->
    {#if activeSection === 'modules' && modulesData}
      <div class="space-y-4">
        <!-- Summary -->
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <div class="text-2xl font-bold text-gray-900 dark:text-white">{modulesData.summary.total}</div>
            <div class="text-sm text-gray-600 dark:text-gray-400">Total Modules</div>
          </div>
          <div class="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
            <div class="text-2xl font-bold text-green-600 dark:text-green-400">{modulesData.summary.upToDate}</div>
            <div class="text-sm text-green-700 dark:text-green-300">Up to Date</div>
          </div>
          <div class="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
            <div class="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{modulesData.summary.withUpdates}</div>
            <div class="text-sm text-yellow-700 dark:text-yellow-300">Updates Available</div>
          </div>
          <div class="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
            <div class="text-2xl font-bold text-red-600 dark:text-red-400">{modulesData.summary.withSecurityAdvisories}</div>
            <div class="text-sm text-red-700 dark:text-red-300">Security Advisories</div>
          </div>
        </div>

        <!-- Security Advisories -->
        {#if modulesData.modulesWithSecurityAdvisories.length > 0}
          <div class="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
            <div class="border-b border-red-200 p-4 dark:border-red-800">
              <div class="flex items-center gap-2">
                <svg class="h-5 w-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h3 class="text-lg font-semibold text-red-900 dark:text-red-300">Security Advisories</h3>
              </div>
              <p class="text-sm text-red-700 dark:text-red-400 mt-1">These modules have known security vulnerabilities. Update them as soon as possible.</p>
            </div>
            <div class="divide-y divide-red-200 dark:divide-red-800">
              {#each modulesData.modulesWithSecurityAdvisories as module (module.name)}
                <div class="flex items-center justify-between p-4">
                  <div>
                    <span class="font-mono text-sm font-medium text-red-900 dark:text-red-300">{module.name}</span>
                    <div class="flex items-center gap-2 mt-1">
                      <span class="text-sm text-red-700 dark:text-red-400">{module.currentVersion}</span>
                      <svg class="h-4 w-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                      <span class="text-sm font-medium text-red-900 dark:text-red-300">{module.latestVersion}</span>
                    </div>
                  </div>
                  <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                    {module.source}
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Modules with Updates -->
        {#if modulesData.modulesWithUpdates.length > 0}
          <div class="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20">
            <div class="border-b border-yellow-200 p-4 dark:border-yellow-800">
              <h3 class="text-lg font-semibold text-yellow-900 dark:text-yellow-300">Updates Available</h3>
              <p class="text-sm text-yellow-700 dark:text-yellow-400 mt-1">These modules have newer versions available.</p>
            </div>
            <div class="divide-y divide-yellow-200 dark:divide-yellow-800">
              {#each modulesData.modulesWithUpdates.filter(m => !m.hasSecurityAdvisory) as module (module.name)}
                <div class="flex items-center justify-between p-4">
                  <div>
                    <span class="font-mono text-sm font-medium text-yellow-900 dark:text-yellow-300">{module.name}</span>
                    <div class="flex items-center gap-2 mt-1">
                      <span class="text-sm text-yellow-700 dark:text-yellow-400">{module.currentVersion}</span>
                      <svg class="h-4 w-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                      <span class="text-sm font-medium text-yellow-900 dark:text-yellow-300">{module.latestVersion}</span>
                    </div>
                  </div>
                  <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">
                    {module.source}
                  </span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- All Modules List -->
        <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div class="border-b border-gray-200 p-4 dark:border-gray-700">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">All Modules</h3>
          </div>
          <div class="divide-y divide-gray-200 dark:divide-gray-700">
            {#each modulesData.modules as module (module.name)}
              <div class="flex items-center justify-between p-4">
                <div class="flex items-center gap-3">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="font-mono text-sm font-medium text-gray-900 dark:text-white">{module.name}</span>
                      {#if module.hasSecurityAdvisory}
                        <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400">
                          Security
                        </span>
                      {:else if module.currentVersion !== module.latestVersion}
                        <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
                          Update
                        </span>
                      {:else}
                        <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
                          Current
                        </span>
                      {/if}
                    </div>
                    <div class="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
                      <span>{module.currentVersion}</span>
                      {#if module.currentVersion !== module.latestVersion}
                        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                        <span class="font-medium text-gray-700 dark:text-gray-300">{module.latestVersion}</span>
                      {/if}
                    </div>
                  </div>
                </div>
                <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                  {module.source}
                </span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>
