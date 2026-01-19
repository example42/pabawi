<script lang="ts">
  import type { DebugInfo } from '../lib/api';
  import ExpertModeCopyButton from './ExpertModeCopyButton.svelte';

  interface FrontendDebugInfo {
    renderTime?: number;
    componentTree?: string[];
    url?: string;
    browserInfo?: {
      userAgent: string;
      viewport: { width: number; height: number };
      language: string;
      platform: string;
    };
    cookies?: Record<string, string>;
    localStorage?: Record<string, string>;
    sessionStorage?: Record<string, string>;
  }

  interface Props {
    debugInfo: DebugInfo;
    frontendInfo?: FrontendDebugInfo;
    responseData?: unknown;
    compact?: boolean; // Compact mode for on-page view
    insideModal?: boolean; // If true, the panel is inside a modal
  }

  let { debugInfo, frontendInfo, responseData, compact = false, insideModal = false }: Props = $props();

  // State for collapsible sections
  let isExpanded = $state(false);
  let showApiCalls = $state(false);
  let showErrors = $state(false);
  let showWarnings = $state(false);
  let showInfo = $state(false);
  let showDebug = $state(false);
  let showPerformance = $state(false);
  let showContext = $state(false);
  let showMetadata = $state(false);
  let showFrontendInfo = $state(false);

  // Count messages by type
  const errorCount = $derived(debugInfo.errors?.length || 0);
  const warningCount = $derived(debugInfo.warnings?.length || 0);
  const infoCount = $derived(debugInfo.info?.length || 0);
  const debugCount = $derived(debugInfo.debug?.length || 0);

  // Format duration for display
  const formatDuration = (ms: number): string => {
    if (ms < 1000) {
      return `${ms.toFixed(0)}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // Format timestamp for display
  const formatTimestamp = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleString();
    } catch {
      return timestamp;
    }
  };

  // Format bytes for display
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes.toFixed(0)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };
</script>

{#if compact}
  <!-- Compact Mode: On-page view with errors, warnings, info -->
  <div class="rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50 p-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <svg
          class="h-4 w-4 text-gray-600 dark:text-gray-400"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
            clip-rule="evenodd"
          />
        </svg>
        <div class="flex items-center gap-2 text-xs">
          {#if errorCount > 0}
            <span class="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-300">
              {errorCount} {errorCount === 1 ? 'Error' : 'Errors'}
            </span>
          {/if}
          {#if warningCount > 0}
            <span class="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">
              {warningCount} {warningCount === 1 ? 'Warning' : 'Warnings'}
            </span>
          {/if}
          {#if infoCount > 0}
            <span class="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
              {infoCount} {infoCount === 1 ? 'Info' : 'Info'}
            </span>
          {/if}
          {#if errorCount === 0 && warningCount === 0 && infoCount === 0}
            <span class="text-gray-600 dark:text-gray-400">No issues</span>
          {/if}
        </div>
      </div>
      <ExpertModeCopyButton
        data={responseData}
        {debugInfo}
        {frontendInfo}
        label="Show Details"
        includeContext={true}
        includePerformance={true}
        includeBrowserInfo={true}
        {insideModal}
      />
    </div>

    <!-- Compact error/warning/info display -->
    {#if errorCount > 0 || warningCount > 0 || infoCount > 0}
      <div class="mt-2 space-y-1">
        {#if debugInfo.errors && debugInfo.errors.length > 0}
          {#each debugInfo.errors.slice(0, 2) as error}
            <div class="text-xs text-red-700 dark:text-red-300 flex items-start gap-1">
              <span class="font-medium">•</span>
              <span>{error.message}</span>
            </div>
          {/each}
          {#if debugInfo.errors.length > 2}
            <div class="text-xs text-red-600 dark:text-red-400">
              +{debugInfo.errors.length - 2} more errors
            </div>
          {/if}
        {/if}

        {#if debugInfo.warnings && debugInfo.warnings.length > 0}
          {#each debugInfo.warnings.slice(0, 2) as warning}
            <div class="text-xs text-yellow-700 dark:text-yellow-300 flex items-start gap-1">
              <span class="font-medium">•</span>
              <span>{warning.message}</span>
            </div>
          {/each}
          {#if debugInfo.warnings.length > 2}
            <div class="text-xs text-yellow-600 dark:text-yellow-400">
              +{debugInfo.warnings.length - 2} more warnings
            </div>
          {/if}
        {/if}

        {#if debugInfo.info && debugInfo.info.length > 0}
          {#each debugInfo.info.slice(0, 2) as info}
            <div class="text-xs text-blue-700 dark:text-blue-300 flex items-start gap-1">
              <span class="font-medium">•</span>
              <span>{info.message}</span>
            </div>
          {/each}
          {#if debugInfo.info.length > 2}
            <div class="text-xs text-blue-600 dark:text-blue-400">
              +{debugInfo.info.length - 2} more info messages
            </div>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
{:else}
  <!-- Full Mode: Expandable panel with all debug information -->
  <div class="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20">
    <!-- Header -->
    <button
      type="button"
      class="flex w-full items-center justify-between p-4 text-left hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
      onclick={() => isExpanded = !isExpanded}
      aria-expanded={isExpanded}
    >
      <div class="flex items-center gap-3">
        <svg
          class="h-5 w-5 text-blue-600 dark:text-blue-400"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
            clip-rule="evenodd"
          />
        </svg>
        <div>
          <h3 class="text-sm font-medium text-blue-800 dark:text-blue-200">
            Expert Mode Debug Information
          </h3>
          <p class="text-xs text-blue-600 dark:text-blue-400">
            {debugInfo.operation} • {formatDuration(debugInfo.duration)}
          </p>
        </div>
      </div>
      <svg
        class="h-5 w-5 text-blue-600 dark:text-blue-400 transition-transform {isExpanded ? 'rotate-180' : ''}"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <!-- Expanded Content -->
    {#if isExpanded}
      <div class="border-t border-blue-200 p-4 space-y-4 dark:border-blue-800">
        <!-- Basic Information -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <dt class="text-xs font-medium text-blue-700 dark:text-blue-300">Timestamp</dt>
            <dd class="mt-1 text-sm text-blue-900 dark:text-blue-100 font-mono">
              {formatTimestamp(debugInfo.timestamp)}
            </dd>
          </div>
          <div>
            <dt class="text-xs font-medium text-blue-700 dark:text-blue-300">Request ID</dt>
            <dd class="mt-1 text-sm text-blue-900 dark:text-blue-100 font-mono">
              {debugInfo.requestId}
            </dd>
          </div>
          {#if debugInfo.integration}
            <div>
              <dt class="text-xs font-medium text-blue-700 dark:text-blue-300">Integration</dt>
              <dd class="mt-1 text-sm text-blue-900 dark:text-blue-100 font-mono">
                {debugInfo.integration}
              </dd>
            </div>
          {/if}
          <div>
            <dt class="text-xs font-medium text-blue-700 dark:text-blue-300">Duration</dt>
            <dd class="mt-1 text-sm text-blue-900 dark:text-blue-100 font-mono">
              {formatDuration(debugInfo.duration)}
            </dd>
          </div>
          {#if debugInfo.cacheHit !== undefined}
            <div>
              <dt class="text-xs font-medium text-blue-700 dark:text-blue-300">Cache Status</dt>
              <dd class="mt-1 text-sm text-blue-900 dark:text-blue-100">
                <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {debugInfo.cacheHit ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'}">
                  {debugInfo.cacheHit ? 'HIT' : 'MISS'}
                </span>
              </dd>
            </div>
          {/if}
        </div>

        <!-- Errors Section (Red) -->
        {#if debugInfo.errors && debugInfo.errors.length > 0}
          <div class="border-t border-blue-200 pt-4 dark:border-blue-800">
            <button
              type="button"
              class="flex w-full items-center justify-between text-left"
              onclick={() => showErrors = !showErrors}
            >
              <h4 class="text-sm font-medium text-red-800 dark:text-red-200">
                Errors ({debugInfo.errors.length})
              </h4>
              <svg
                class="h-4 w-4 text-red-600 dark:text-red-400 transition-transform {showErrors ? 'rotate-180' : ''}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {#if showErrors}
              <div class="mt-2 space-y-2">
                {#each debugInfo.errors as error}
                  <div class="rounded-md bg-red-100 p-3 dark:bg-red-900/30">
                    <div class="text-sm font-medium text-red-900 dark:text-red-100">
                      {error.message}
                    </div>
                    {#if error.code}
                      <div class="mt-1 text-xs text-red-700 dark:text-red-300">
                        Code: {error.code}
                      </div>
                    {/if}
                    {#if error.stack}
                      <details class="mt-2">
                        <summary class="cursor-pointer text-xs text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-200">
                          Show stack trace
                        </summary>
                        <pre class="mt-2 overflow-x-auto rounded bg-red-50 p-2 text-xs text-red-900 dark:bg-red-950 dark:text-red-100">{error.stack}</pre>
                      </details>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Warnings Section (Yellow) -->
        {#if debugInfo.warnings && debugInfo.warnings.length > 0}
          <div class="border-t border-blue-200 pt-4 dark:border-blue-800">
            <button
              type="button"
              class="flex w-full items-center justify-between text-left"
              onclick={() => showWarnings = !showWarnings}
            >
              <h4 class="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Warnings ({debugInfo.warnings.length})
              </h4>
              <svg
                class="h-4 w-4 text-yellow-600 dark:text-yellow-400 transition-transform {showWarnings ? 'rotate-180' : ''}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {#if showWarnings}
              <div class="mt-2 space-y-2">
                {#each debugInfo.warnings as warning}
                  <div class="rounded-md bg-yellow-100 p-3 dark:bg-yellow-900/30">
                    <div class="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                      {warning.message}
                    </div>
                    {#if warning.context}
                      <div class="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
                        Context: {warning.context}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Info Section (Blue) -->
        {#if debugInfo.info && debugInfo.info.length > 0}
          <div class="border-t border-blue-200 pt-4 dark:border-blue-800">
            <button
              type="button"
              class="flex w-full items-center justify-between text-left"
              onclick={() => showInfo = !showInfo}
            >
              <h4 class="text-sm font-medium text-blue-800 dark:text-blue-200">
                Info ({debugInfo.info.length})
              </h4>
              <svg
                class="h-4 w-4 text-blue-600 dark:text-blue-400 transition-transform {showInfo ? 'rotate-180' : ''}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {#if showInfo}
              <div class="mt-2 space-y-2">
                {#each debugInfo.info as info}
                  <div class="rounded-md bg-blue-100 p-3 dark:bg-blue-900/30">
                    <div class="text-sm text-blue-900 dark:text-blue-100">
                      {info.message}
                    </div>
                    {#if info.context}
                      <div class="mt-1 text-xs text-blue-700 dark:text-blue-300">
                        Context: {info.context}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Debug Section (Gray) -->
        {#if debugInfo.debug && debugInfo.debug.length > 0}
          <div class="border-t border-blue-200 pt-4 dark:border-blue-800">
            <button
              type="button"
              class="flex w-full items-center justify-between text-left"
              onclick={() => showDebug = !showDebug}
            >
              <h4 class="text-sm font-medium text-gray-800 dark:text-gray-200">
                Debug ({debugInfo.debug.length})
              </h4>
              <svg
                class="h-4 w-4 text-gray-600 dark:text-gray-400 transition-transform {showDebug ? 'rotate-180' : ''}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {#if showDebug}
              <div class="mt-2 space-y-2">
                {#each debugInfo.debug as debug}
                  <div class="rounded-md bg-gray-100 p-3 dark:bg-gray-800">
                    <div class="text-sm text-gray-900 dark:text-gray-100">
                      {debug.message}
                    </div>
                    {#if debug.context}
                      <div class="mt-1 text-xs text-gray-700 dark:text-gray-300">
                        Context: {debug.context}
                      </div>
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Performance Metrics Section -->
        {#if debugInfo.performance}
          <div class="border-t border-blue-200 pt-4 dark:border-blue-800">
            <button
              type="button"
              class="flex w-full items-center justify-between text-left"
              onclick={() => showPerformance = !showPerformance}
            >
              <h4 class="text-sm font-medium text-blue-800 dark:text-blue-200">
                Performance Metrics
              </h4>
              <svg
                class="h-4 w-4 text-blue-600 dark:text-blue-400 transition-transform {showPerformance ? 'rotate-180' : ''}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {#if showPerformance}
              <div class="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="rounded-md bg-blue-100 p-3 dark:bg-blue-900/30">
                  <dt class="text-xs font-medium text-blue-700 dark:text-blue-300">Memory Usage</dt>
                  <dd class="mt-1 text-sm text-blue-900 dark:text-blue-100 font-mono">
                    {formatBytes(debugInfo.performance.memoryUsage)}
                  </dd>
                </div>
                <div class="rounded-md bg-blue-100 p-3 dark:bg-blue-900/30">
                  <dt class="text-xs font-medium text-blue-700 dark:text-blue-300">CPU Usage</dt>
                  <dd class="mt-1 text-sm text-blue-900 dark:text-blue-100 font-mono">
                    {debugInfo.performance.cpuUsage.toFixed(2)}%
                  </dd>
                </div>
                <div class="rounded-md bg-blue-100 p-3 dark:bg-blue-900/30">
                  <dt class="text-xs font-medium text-blue-700 dark:text-blue-300">Active Connections</dt>
                  <dd class="mt-1 text-sm text-blue-900 dark:text-blue-100 font-mono">
                    {debugInfo.performance.activeConnections}
                  </dd>
                </div>
                <div class="rounded-md bg-blue-100 p-3 dark:bg-blue-900/30">
                  <dt class="text-xs font-medium text-blue-700 dark:text-blue-300">Cache Hit Rate</dt>
                  <dd class="mt-1 text-sm text-blue-900 dark:text-blue-100 font-mono">
                    {(debugInfo.performance.cacheStats.hitRate * 100).toFixed(1)}%
                  </dd>
                </div>
                <div class="rounded-md bg-blue-100 p-3 dark:bg-blue-900/30">
                  <dt class="text-xs font-medium text-blue-700 dark:text-blue-300">Cache Size</dt>
                  <dd class="mt-1 text-sm text-blue-900 dark:text-blue-100 font-mono">
                    {debugInfo.performance.cacheStats.size} items
                  </dd>
                </div>
                <div class="rounded-md bg-blue-100 p-3 dark:bg-blue-900/30">
                  <dt class="text-xs font-medium text-blue-700 dark:text-blue-300">Avg Request Duration</dt>
                  <dd class="mt-1 text-sm text-blue-900 dark:text-blue-100 font-mono">
                    {formatDuration(debugInfo.performance.requestStats.avgDuration)}
                  </dd>
                </div>
              </div>
            {/if}
          </div>
        {/if}

        <!-- Context Section -->
        {#if debugInfo.context}
          <div class="border-t border-blue-200 pt-4 dark:border-blue-800">
            <button
              type="button"
              class="flex w-full items-center justify-between text-left"
              onclick={() => showContext = !showContext}
            >
              <h4 class="text-sm font-medium text-blue-800 dark:text-blue-200">
                Request Context
              </h4>
              <svg
                class="h-4 w-4 text-blue-600 dark:text-blue-400 transition-transform {showContext ? 'rotate-180' : ''}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {#if showContext}
              <div class="mt-2 space-y-2">
                <div class="rounded-md bg-blue-100 p-3 dark:bg-blue-900/30">
                  <dt class="text-xs font-medium text-blue-700 dark:text-blue-300">URL</dt>
                  <dd class="mt-1 text-sm text-blue-900 dark:text-blue-100 font-mono break-all">
                    {debugInfo.context.url}
                  </dd>
                </div>
                <div class="rounded-md bg-blue-100 p-3 dark:bg-blue-900/30">
                  <dt class="text-xs font-medium text-blue-700 dark:text-blue-300">Method</dt>
                  <dd class="mt-1 text-sm text-blue-900 dark:text-blue-100 font-mono">
                    {debugInfo.context.method}
                  </dd>
                </div>
                <div class="rounded-md bg-blue-100 p-3 dark:bg-blue-900/30">
                  <dt class="text-xs font-medium text-blue-700 dark:text-blue-300">User Agent</dt>
                  <dd class="mt-1 text-sm text-blue-900 dark:text-blue-100 font-mono break-all">
                    {debugInfo.context.userAgent}
                  </dd>
                </div>
                <div class="rounded-md bg-blue-100 p-3 dark:bg-blue-900/30">
                  <dt class="text-xs font-medium text-blue-700 dark:text-blue-300">IP Address</dt>
                  <dd class="mt-1 text-sm text-blue-900 dark:text-blue-100 font-mono">
                    {debugInfo.context.ip}
                  </dd>
                </div>
              </div>
            {/if}
          </div>
        {/if}

        <!-- API Calls Section -->
        {#if debugInfo.apiCalls && debugInfo.apiCalls.length > 0}
          <div class="border-t border-blue-200 pt-4 dark:border-blue-800">
            <button
              type="button"
              class="flex w-full items-center justify-between text-left"
              onclick={() => showApiCalls = !showApiCalls}
            >
              <h4 class="text-sm font-medium text-blue-800 dark:text-blue-200">
                API Calls ({debugInfo.apiCalls.length})
              </h4>
              <svg
                class="h-4 w-4 text-blue-600 dark:text-blue-400 transition-transform {showApiCalls ? 'rotate-180' : ''}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {#if showApiCalls}
              <div class="mt-2 space-y-2">
                {#each debugInfo.apiCalls as apiCall}
                  <div class="rounded-md bg-blue-100 p-3 dark:bg-blue-900/30">
                    <div class="flex items-start justify-between">
                      <div class="flex-1">
                        <div class="flex items-center gap-2">
                          <span class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-200">
                            {apiCall.method}
                          </span>
                          <span class="text-sm font-mono text-blue-900 dark:text-blue-100">
                            {apiCall.endpoint}
                          </span>
                        </div>
                        <div class="mt-1 flex items-center gap-3 text-xs text-blue-700 dark:text-blue-300">
                          <span>Status: {apiCall.status}</span>
                          <span>Duration: {formatDuration(apiCall.duration)}</span>
                          {#if apiCall.cached}
                            <span class="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                              Cached
                            </span>
                          {/if}
                        </div>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Metadata Section -->
        {#if debugInfo.metadata && Object.keys(debugInfo.metadata).length > 0}
          <div class="border-t border-blue-200 pt-4 dark:border-blue-800">
            <button
              type="button"
              class="flex w-full items-center justify-between text-left"
              onclick={() => showMetadata = !showMetadata}
            >
              <h4 class="text-sm font-medium text-blue-800 dark:text-blue-200">
                Metadata
              </h4>
              <svg
                class="h-4 w-4 text-blue-600 dark:text-blue-400 transition-transform {showMetadata ? 'rotate-180' : ''}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {#if showMetadata}
              <pre class="mt-2 overflow-x-auto rounded bg-blue-100 p-3 text-xs text-blue-900 dark:bg-blue-900/30 dark:text-blue-100">{JSON.stringify(debugInfo.metadata, null, 2)}</pre>
            {/if}
          </div>
        {/if}

        <!-- Frontend Info Section -->
        {#if frontendInfo && (frontendInfo.renderTime || frontendInfo.componentTree || frontendInfo.browserInfo)}
          <div class="border-t border-blue-200 pt-4 dark:border-blue-800">
            <button
              type="button"
              class="flex w-full items-center justify-between text-left"
              onclick={() => showFrontendInfo = !showFrontendInfo}
            >
              <h4 class="text-sm font-medium text-blue-800 dark:text-blue-200">
                Frontend Information
              </h4>
              <svg
                class="h-4 w-4 text-blue-600 dark:text-blue-400 transition-transform {showFrontendInfo ? 'rotate-180' : ''}"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {#if showFrontendInfo}
              <div class="mt-2 space-y-2">
                {#if frontendInfo.renderTime}
                  <div class="rounded-md bg-blue-100 p-3 dark:bg-blue-900/30">
                    <dt class="text-xs font-medium text-blue-700 dark:text-blue-300">Render Time</dt>
                    <dd class="mt-1 text-sm text-blue-900 dark:text-blue-100 font-mono">
                      {formatDuration(frontendInfo.renderTime)}
                    </dd>
                  </div>
                {/if}
                {#if frontendInfo.url}
                  <div class="rounded-md bg-blue-100 p-3 dark:bg-blue-900/30">
                    <dt class="text-xs font-medium text-blue-700 dark:text-blue-300">Current URL</dt>
                    <dd class="mt-1 text-sm text-blue-900 dark:text-blue-100 font-mono break-all">
                      {frontendInfo.url}
                    </dd>
                  </div>
                {/if}
                {#if frontendInfo.browserInfo}
                  <div class="rounded-md bg-blue-100 p-3 dark:bg-blue-900/30">
                    <dt class="text-xs font-medium text-blue-700 dark:text-blue-300">Browser Info</dt>
                    <dd class="mt-1 text-xs text-blue-900 dark:text-blue-100 space-y-1">
                      <div>Platform: {frontendInfo.browserInfo.platform}</div>
                      <div>Language: {frontendInfo.browserInfo.language}</div>
                      <div>Viewport: {frontendInfo.browserInfo.viewport.width}x{frontendInfo.browserInfo.viewport.height}</div>
                    </dd>
                  </div>
                {/if}
                {#if frontendInfo.componentTree && frontendInfo.componentTree.length > 0}
                  <div class="rounded-md bg-blue-100 p-3 dark:bg-blue-900/30">
                    <dt class="text-xs font-medium text-blue-700 dark:text-blue-300">Component Tree</dt>
                    <dd class="mt-1">
                      <ul class="list-disc list-inside text-sm text-blue-900 dark:text-blue-100 space-y-1">
                        {#each frontendInfo.componentTree as component}
                          <li class="font-mono text-xs">{component}</li>
                        {/each}
                      </ul>
                    </dd>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Copy Button -->
        <div class="border-t border-blue-200 pt-4 dark:border-blue-800">
          <ExpertModeCopyButton
            data={responseData}
            {debugInfo}
            {frontendInfo}
            label="Show Details"
            includeContext={true}
            includePerformance={true}
            includeBrowserInfo={true}
            {insideModal}
          />
        </div>
      </div>
    {/if}
  </div>
{/if}
