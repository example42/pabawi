<script lang="ts">
  import type { DebugInfo } from '../lib/api';
  import type { LogEntry } from '../lib/logger.svelte';
  import DebugCopyButton from './DebugCopyButton.svelte';
  import { logger } from '../lib/logger.svelte';

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
  let showTimeline = $state(false);

  // Timeline view state
  let timelineSearchQuery = $state('');
  let timelineFilterLevel = $state<'all' | 'error' | 'warn' | 'info' | 'debug'>('all');

  // Count messages by type
  const errorCount = $derived(debugInfo.errors?.length || 0);
  const warningCount = $derived(debugInfo.warnings?.length || 0);
  const infoCount = $derived(debugInfo.info?.length || 0);
  const debugCount = $derived(debugInfo.debug?.length || 0);

  // Get frontend logs from logger
  const frontendLogs = $derived(logger.getLogs());

  // Timeline entry type
  interface TimelineEntry {
    timestamp: string;
    level: 'error' | 'warn' | 'info' | 'debug';
    source: 'frontend' | 'backend';
    message: string;
    context?: string;
    metadata?: Record<string, unknown>;
    stackTrace?: string;
  }

  // Combine frontend and backend logs into timeline
  const timelineEntries = $derived.by(() => {
    const entries: TimelineEntry[] = [];

    // Add frontend logs
    frontendLogs.forEach(log => {
      entries.push({
        timestamp: log.timestamp,
        level: log.level,
        source: 'frontend',
        message: `[${log.component}] ${log.operation}: ${log.message}`,
        metadata: log.metadata,
        stackTrace: log.stackTrace,
      });
    });

    // Add backend errors
    debugInfo.errors?.forEach(error => {
      entries.push({
        timestamp: debugInfo.timestamp,
        level: 'error',
        source: 'backend',
        message: error.message,
        context: error.code,
        stackTrace: error.stack,
      });
    });

    // Add backend warnings
    debugInfo.warnings?.forEach(warning => {
      entries.push({
        timestamp: debugInfo.timestamp,
        level: 'warn',
        source: 'backend',
        message: warning.message,
        context: warning.context,
      });
    });

    // Add backend info
    debugInfo.info?.forEach(info => {
      entries.push({
        timestamp: debugInfo.timestamp,
        level: 'info',
        source: 'backend',
        message: info.message,
        context: info.context,
      });
    });

    // Add backend debug
    debugInfo.debug?.forEach(debug => {
      entries.push({
        timestamp: debugInfo.timestamp,
        level: 'debug',
        source: 'backend',
        message: debug.message,
        context: debug.context,
      });
    });

    // Sort by timestamp (newest first)
    return entries.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  });

  // Filtered timeline entries based on search and level filter
  const filteredTimelineEntries = $derived.by(() => {
    let filtered = timelineEntries;

    // Apply level filter
    if (timelineFilterLevel !== 'all') {
      filtered = filtered.filter(entry => entry.level === timelineFilterLevel);
    }

    // Apply search filter
    if (timelineSearchQuery.trim()) {
      const query = timelineSearchQuery.toLowerCase();
      filtered = filtered.filter(entry =>
        entry.message.toLowerCase().includes(query) ||
        entry.context?.toLowerCase().includes(query) ||
        JSON.stringify(entry.metadata || {}).toLowerCase().includes(query)
      );
    }

    return filtered;
  });

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
      <DebugCopyButton
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
            {debugInfo.operation ?? 'Unknown operation'} • {formatDuration(debugInfo.duration ?? 0)}
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

        <!-- Timeline View Section -->
        <div class="border-t border-blue-200 pt-4 dark:border-blue-800">
          <button
            type="button"
            class="flex w-full items-center justify-between text-left"
            onclick={() => showTimeline = !showTimeline}
          >
            <h4 class="text-sm font-medium text-blue-800 dark:text-blue-200">
              Timeline View ({timelineEntries.length} entries)
            </h4>
            <svg
              class="h-4 w-4 text-blue-600 dark:text-blue-400 transition-transform {showTimeline ? 'rotate-180' : ''}"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {#if showTimeline}
            <div class="mt-3 space-y-3">
              <!-- Timeline Filters -->
              <div class="flex flex-col sm:flex-row gap-2">
                <!-- Search Input -->
                <div class="flex-1">
                  <input
                    type="text"
                    bind:value={timelineSearchQuery}
                    placeholder="Search logs..."
                    class="w-full rounded-md border border-blue-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-blue-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-400"
                  />
                </div>

                <!-- Level Filter -->
                <div class="flex gap-1">
                  <button
                    type="button"
                    onclick={() => timelineFilterLevel = 'all'}
                    class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {timelineFilterLevel === 'all' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60'}"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onclick={() => timelineFilterLevel = 'error'}
                    class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {timelineFilterLevel === 'error' ? 'bg-red-600 text-white' : 'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-900/60'}"
                  >
                    Errors
                  </button>
                  <button
                    type="button"
                    onclick={() => timelineFilterLevel = 'warn'}
                    class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {timelineFilterLevel === 'warn' ? 'bg-yellow-600 text-white' : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:hover:bg-yellow-900/60'}"
                  >
                    Warnings
                  </button>
                  <button
                    type="button"
                    onclick={() => timelineFilterLevel = 'info'}
                    class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {timelineFilterLevel === 'info' ? 'bg-blue-600 text-white' : 'bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/60'}"
                  >
                    Info
                  </button>
                  <button
                    type="button"
                    onclick={() => timelineFilterLevel = 'debug'}
                    class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors {timelineFilterLevel === 'debug' ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}"
                  >
                    Debug
                  </button>
                </div>
              </div>

              <!-- Timeline Entries -->
              <div class="space-y-2 max-h-96 overflow-y-auto">
                {#if filteredTimelineEntries.length === 0}
                  <div class="rounded-md bg-gray-100 p-4 text-center text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                    No log entries match your filters
                  </div>
                {:else}
                  {#each filteredTimelineEntries as entry}
                    <div class="rounded-md border p-3 {
                      entry.level === 'error' ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20' :
                      entry.level === 'warn' ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20' :
                      entry.level === 'info' ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20' :
                      'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'
                    }">
                      <!-- Entry Header -->
                      <div class="flex items-start justify-between gap-2">
                        <div class="flex items-center gap-2 flex-1 min-w-0">
                          <!-- Level Badge -->
                          <span class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium shrink-0 {
                            entry.level === 'error' ? 'bg-red-600 text-white' :
                            entry.level === 'warn' ? 'bg-yellow-600 text-white' :
                            entry.level === 'info' ? 'bg-blue-600 text-white' :
                            'bg-gray-600 text-white'
                          }">
                            {entry.level.toUpperCase()}
                          </span>

                          <!-- Source Badge -->
                          <span class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium shrink-0 {
                            entry.source === 'frontend' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' :
                            'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                          }">
                            {entry.source}
                          </span>

                          <!-- Timestamp -->
                          <span class="text-xs text-gray-600 dark:text-gray-400 font-mono truncate">
                            {formatTimestamp(entry.timestamp)}
                          </span>
                        </div>
                      </div>

                      <!-- Entry Message -->
                      <div class="mt-2 text-sm {
                        entry.level === 'error' ? 'text-red-900 dark:text-red-100' :
                        entry.level === 'warn' ? 'text-yellow-900 dark:text-yellow-100' :
                        entry.level === 'info' ? 'text-blue-900 dark:text-blue-100' :
                        'text-gray-900 dark:text-gray-100'
                      }">
                        {entry.message}
                      </div>

                      <!-- Entry Context -->
                      {#if entry.context}
                        <div class="mt-1 text-xs {
                          entry.level === 'error' ? 'text-red-700 dark:text-red-300' :
                          entry.level === 'warn' ? 'text-yellow-700 dark:text-yellow-300' :
                          entry.level === 'info' ? 'text-blue-700 dark:text-blue-300' :
                          'text-gray-700 dark:text-gray-300'
                        }">
                          Context: {entry.context}
                        </div>
                      {/if}

                      <!-- Entry Metadata -->
                      {#if entry.metadata && Object.keys(entry.metadata).length > 0}
                        <details class="mt-2">
                          <summary class="cursor-pointer text-xs {
                            entry.level === 'error' ? 'text-red-700 dark:text-red-300' :
                            entry.level === 'warn' ? 'text-yellow-700 dark:text-yellow-300' :
                            entry.level === 'info' ? 'text-blue-700 dark:text-blue-300' :
                            'text-gray-700 dark:text-gray-300'
                          } hover:underline">
                            Show metadata
                          </summary>
                          <pre class="mt-1 overflow-x-auto rounded p-2 text-xs {
                            entry.level === 'error' ? 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100' :
                            entry.level === 'warn' ? 'bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100' :
                            entry.level === 'info' ? 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100' :
                            'bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-gray-100'
                          }">{JSON.stringify(entry.metadata, null, 2)}</pre>
                        </details>
                      {/if}

                      <!-- Stack Trace -->
                      {#if entry.stackTrace}
                        <details class="mt-2">
                          <summary class="cursor-pointer text-xs {
                            entry.level === 'error' ? 'text-red-700 dark:text-red-300' :
                            'text-gray-700 dark:text-gray-300'
                          } hover:underline">
                            Show stack trace
                          </summary>
                          <pre class="mt-1 overflow-x-auto rounded p-2 text-xs {
                            entry.level === 'error' ? 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100' :
                            'bg-gray-100 text-gray-900 dark:bg-gray-900 dark:text-gray-100'
                          }">{entry.stackTrace}</pre>
                        </details>
                      {/if}
                    </div>
                  {/each}
                {/if}
              </div>
            </div>
          {/if}
        </div>

        <!-- Copy Button -->
        <div class="border-t border-blue-200 pt-4 dark:border-blue-800">
          <DebugCopyButton
            data={responseData}
            {debugInfo}
            {frontendInfo}
            frontendLogs={frontendLogs}
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
