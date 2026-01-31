<script lang="ts">
  /**
   * Debug Panel Component
   *
   * A comprehensive debug panel for displaying:
   * - Tracked API requests with timing
   * - Debug context data
   * - Request statistics
   * - Backend debug info (when available)
   *
   * This component is designed to work with the debug context system
   * for per-widget/component debugging.
   */

  import type { DebugInfo } from '../lib/api';
  import type { TrackedRequest, DebugConfig } from '../lib/debug/debugMode.svelte';
  import { debugMode } from '../lib/debug/debugMode.svelte';

  interface Props {
    /** Optional correlation ID to filter requests */
    correlationId?: string;
    /** Optional backend debug info to display */
    debugInfo?: DebugInfo;
    /** Show as compact inline panel */
    compact?: boolean;
    /** Whether the panel is inside a modal */
    insideModal?: boolean;
    /** Custom title for the panel */
    title?: string;
    /** Show configuration controls */
    showConfig?: boolean;
    /** Additional CSS classes */
    class?: string;
  }

  let {
    correlationId,
    debugInfo,
    compact = false,
    insideModal = false,
    title = "Debug Panel",
    showConfig = false,
    class: className = "",
  }: Props = $props();

  // Panel state
  let isExpanded = $state(debugMode.config.autoExpandPanels);
  let showRequests = $state(true);
  let showStats = $state(false);
  let showBackendInfo = $state(false);
  let showConfigPanel = $state(false);
  let activeTab = $state<"requests" | "timeline" | "config">("requests");

  // Get tracked requests (filtered by correlation ID if provided)
  const requests = $derived(
    correlationId
      ? debugMode.getRequestsByCorrelationId(correlationId)
      : debugMode.requests
  );

  // Get request statistics
  const stats = $derived(debugMode.getRequestStats());

  // Get pending requests
  const pendingRequests = $derived(requests.filter((r) => r.pending));

  // Format duration for display
  function formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms.toFixed(0)}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  }

  // Format timestamp for display
  function formatTimestamp(timestamp: string | number): string {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString();
    } catch {
      return String(timestamp);
    }
  }

  // Format bytes for display
  function formatBytes(bytes: number | null): string {
    if (bytes === null) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Get status color class
  function getStatusColor(status: number | null, pending: boolean): string {
    if (pending) return "text-blue-600 dark:text-blue-400";
    if (status === null) return "text-gray-500 dark:text-gray-400";
    if (status >= 200 && status < 300) return "text-green-600 dark:text-green-400";
    if (status >= 300 && status < 400) return "text-yellow-600 dark:text-yellow-400";
    if (status >= 400 && status < 500) return "text-orange-600 dark:text-orange-400";
    return "text-red-600 dark:text-red-400";
  }

  // Get status badge class
  function getStatusBadgeClass(status: number | null, pending: boolean): string {
    if (pending) return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
    if (status === null) return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
    if (status >= 200 && status < 300) return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
    if (status >= 300 && status < 400) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300";
    if (status >= 400 && status < 500) return "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300";
    return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300";
  }

  // Update config
  function updateConfig(key: keyof DebugConfig, value: boolean | number): void {
    debugMode.updateConfig({ [key]: value });
  }

  // Clear requests
  function clearRequests(): void {
    debugMode.clearRequests();
  }

  // Copy debug info to clipboard
  async function copyDebugInfo(): Promise<void> {
    const data = {
      correlationId,
      requests,
      stats,
      debugInfo,
      timestamp: new Date().toISOString(),
    };
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  }
</script>

{#if compact}
  <!-- Compact Mode -->
  <div class="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50 p-3 {className}">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <!-- Debug Icon -->
        <svg
          class="h-4 w-4 text-gray-600 dark:text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
          />
        </svg>

        <!-- Status Summary -->
        <div class="flex items-center gap-2 text-xs">
          {#if pendingRequests.length > 0}
            <span class="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
              {pendingRequests.length} pending
            </span>
          {/if}
          {#if stats.failed > 0}
            <span class="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300">
              {stats.failed} failed
            </span>
          {/if}
          {#if stats.successful > 0}
            <span class="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
              {stats.successful} OK
            </span>
          {/if}
          {#if correlationId}
            <span class="text-gray-500 dark:text-gray-400 font-mono text-xs truncate max-w-[120px]">
              {correlationId.substring(0, 16)}...
            </span>
          {/if}
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="text-xs text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          onclick={copyDebugInfo}
          title="Copy debug info"
        >
          Copy
        </button>
        <button
          type="button"
          class="text-xs text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
          onclick={() => isExpanded = !isExpanded}
        >
          {isExpanded ? "Collapse" : "Expand"}
        </button>
      </div>
    </div>

    <!-- Expanded compact view -->
    {#if isExpanded}
      <div class="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
        {#if requests.length > 0}
          <div class="space-y-1 max-h-40 overflow-y-auto">
            {#each requests.slice(0, 5) as request}
              <div class="flex items-center justify-between text-xs">
                <div class="flex items-center gap-2 truncate">
                  <span class="font-mono text-gray-500 dark:text-gray-400">{request.method}</span>
                  <span class="truncate text-gray-700 dark:text-gray-300">{request.url}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class={getStatusColor(request.status, request.pending)}>
                    {request.pending ? "..." : request.status ?? "ERR"}
                  </span>
                  {#if request.endTime}
                    <span class="text-gray-500 dark:text-gray-400">
                      {formatDuration(request.endTime - request.startTime)}
                    </span>
                  {/if}
                </div>
              </div>
            {/each}
            {#if requests.length > 5}
              <div class="text-xs text-gray-500 dark:text-gray-400">
                +{requests.length - 5} more requests
              </div>
            {/if}
          </div>
        {:else}
          <div class="text-xs text-gray-500 dark:text-gray-400">No requests tracked</div>
        {/if}
      </div>
    {/if}
  </div>
{:else}
  <!-- Full Mode -->
  <div class="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20 {className}">
    <!-- Header -->
    <div class="flex items-center justify-between p-4 border-b border-blue-200 dark:border-blue-800">
      <div class="flex items-center gap-3">
        <!-- Debug Icon -->
        <svg
          class="h-5 w-5 text-blue-600 dark:text-blue-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
          />
        </svg>
        <div>
          <h3 class="text-sm font-medium text-blue-800 dark:text-blue-200">{title}</h3>
          {#if correlationId}
            <p class="text-xs text-blue-600 dark:text-blue-400 font-mono">
              {correlationId}
            </p>
          {/if}
        </div>
      </div>

      <!-- Header Actions -->
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="p-1.5 rounded-md text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/40"
          onclick={copyDebugInfo}
          title="Copy debug info"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
        <button
          type="button"
          class="p-1.5 rounded-md text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-900/40"
          onclick={clearRequests}
          title="Clear requests"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Tab Navigation -->
    <div class="flex border-b border-blue-200 dark:border-blue-800">
      <button
        type="button"
        class="flex-1 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'requests' ? 'text-blue-800 dark:text-blue-200 border-b-2 border-blue-600' : 'text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200'}"
        onclick={() => activeTab = 'requests'}
      >
        Requests ({requests.length})
      </button>
      <button
        type="button"
        class="flex-1 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'timeline' ? 'text-blue-800 dark:text-blue-200 border-b-2 border-blue-600' : 'text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200'}"
        onclick={() => activeTab = 'timeline'}
      >
        Stats
      </button>
      {#if showConfig}
        <button
          type="button"
          class="flex-1 px-4 py-2 text-sm font-medium transition-colors {activeTab === 'config' ? 'text-blue-800 dark:text-blue-200 border-b-2 border-blue-600' : 'text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200'}"
          onclick={() => activeTab = 'config'}
        >
          Config
        </button>
      {/if}
    </div>

    <!-- Tab Content -->
    <div class="p-4">
      {#if activeTab === 'requests'}
        <!-- Requests Tab -->
        {#if requests.length > 0}
          <div class="space-y-2 max-h-96 overflow-y-auto">
            {#each requests as request}
              <div class="rounded-md border border-blue-200 bg-white p-3 dark:border-blue-700 dark:bg-blue-950/50">
                <!-- Request Header -->
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      {request.method}
                    </span>
                    <span class="text-sm text-gray-900 dark:text-gray-100 truncate max-w-[300px]">
                      {request.url}
                    </span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {getStatusBadgeClass(request.status, request.pending)}">
                      {#if request.pending}
                        <svg class="animate-spin -ml-0.5 mr-1.5 h-3 w-3" fill="none" viewBox="0 0 24 24">
                          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        pending
                      {:else if request.error}
                        error
                      {:else}
                        {request.status}
                      {/if}
                    </span>
                  </div>
                </div>

                <!-- Request Details -->
                <div class="mt-2 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                  <span>{formatTimestamp(request.startTime)}</span>
                  {#if request.endTime}
                    <span>{formatDuration(request.endTime - request.startTime)}</span>
                  {/if}
                  {#if request.responseSize !== null}
                    <span>{formatBytes(request.responseSize)}</span>
                  {/if}
                  {#if request.source}
                    <span class="font-mono">{request.source}</span>
                  {/if}
                </div>

                <!-- Error Message -->
                {#if request.error}
                  <div class="mt-2 text-xs text-red-600 dark:text-red-400">
                    {request.error}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-center py-8 text-gray-500 dark:text-gray-400">
            <svg class="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p class="mt-2 text-sm">No requests tracked yet</p>
            <p class="mt-1 text-xs">API requests will appear here when debug mode is enabled</p>
          </div>
        {/if}
      {:else if activeTab === 'timeline'}
        <!-- Stats Tab -->
        <div class="grid grid-cols-2 gap-4">
          <div class="rounded-md bg-white p-4 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-700">
            <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Total Requests</div>
          </div>
          <div class="rounded-md bg-white p-4 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-700">
            <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.pending}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Pending</div>
          </div>
          <div class="rounded-md bg-white p-4 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-700">
            <div class="text-2xl font-bold text-green-600 dark:text-green-400">{stats.successful}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Successful</div>
          </div>
          <div class="rounded-md bg-white p-4 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-700">
            <div class="text-2xl font-bold text-red-600 dark:text-red-400">{stats.failed}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Failed</div>
          </div>
          <div class="col-span-2 rounded-md bg-white p-4 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-700">
            <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {formatDuration(stats.avgDuration)}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">Average Duration</div>
          </div>
        </div>

        <!-- Backend Debug Info (if provided) -->
        {#if debugInfo}
          <div class="mt-4 border-t border-blue-200 pt-4 dark:border-blue-700">
            <h4 class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Backend Debug Info</h4>
            <div class="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span class="text-gray-500 dark:text-gray-400">Operation:</span>
                <span class="ml-1 text-gray-900 dark:text-gray-100">{debugInfo.operation}</span>
              </div>
              <div>
                <span class="text-gray-500 dark:text-gray-400">Duration:</span>
                <span class="ml-1 text-gray-900 dark:text-gray-100">{formatDuration(debugInfo.duration)}</span>
              </div>
              {#if debugInfo.integration}
                <div>
                  <span class="text-gray-500 dark:text-gray-400">Integration:</span>
                  <span class="ml-1 text-gray-900 dark:text-gray-100">{debugInfo.integration}</span>
                </div>
              {/if}
              {#if debugInfo.cacheHit !== undefined}
                <div>
                  <span class="text-gray-500 dark:text-gray-400">Cache:</span>
                  <span class="ml-1 text-gray-900 dark:text-gray-100">{debugInfo.cacheHit ? 'HIT' : 'MISS'}</span>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      {:else if activeTab === 'config' && showConfig}
        <!-- Config Tab -->
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm font-medium text-gray-900 dark:text-gray-100">Log API Requests</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">Log request details to console</div>
            </div>
            <button
              type="button"
              class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 {debugMode.config.logApiRequests ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}"
              role="switch"
              aria-checked={debugMode.config.logApiRequests}
              onclick={() => updateConfig('logApiRequests', !debugMode.config.logApiRequests)}
            >
              <span class="sr-only">Log API Requests</span>
              <span
                class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {debugMode.config.logApiRequests ? 'translate-x-5' : 'translate-x-0'}"
              ></span>
            </button>
          </div>

          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm font-medium text-gray-900 dark:text-gray-100">Include Performance</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">Include performance metrics in debug info</div>
            </div>
            <button
              type="button"
              class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 {debugMode.config.includePerformance ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}"
              role="switch"
              aria-checked={debugMode.config.includePerformance}
              onclick={() => updateConfig('includePerformance', !debugMode.config.includePerformance)}
            >
              <span class="sr-only">Include Performance</span>
              <span
                class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {debugMode.config.includePerformance ? 'translate-x-5' : 'translate-x-0'}"
              ></span>
            </button>
          </div>

          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm font-medium text-gray-900 dark:text-gray-100">Auto-expand Panels</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">Expand debug panels by default</div>
            </div>
            <button
              type="button"
              class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 {debugMode.config.autoExpandPanels ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}"
              role="switch"
              aria-checked={debugMode.config.autoExpandPanels}
              onclick={() => updateConfig('autoExpandPanels', !debugMode.config.autoExpandPanels)}
            >
              <span class="sr-only">Auto-expand Panels</span>
              <span
                class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {debugMode.config.autoExpandPanels ? 'translate-x-5' : 'translate-x-0'}"
              ></span>
            </button>
          </div>

          <div class="pt-4 border-t border-blue-200 dark:border-blue-700">
            <button
              type="button"
              class="w-full px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
              onclick={() => debugMode.resetConfig()}
            >
              Reset to Defaults
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
