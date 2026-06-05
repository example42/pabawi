<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import { get } from '../lib/api';
  import { formatRelativeTime } from '../lib/formatRelativeTime';
  import type { ServiceStatus } from '../lib/checkmkApi';
  import {
    STATE_COLORS,
    STATE_NAMES,
    groupServicesByState,
    sortServicesByLastStateChange,
    type ServiceSortMode,
  } from '../lib/monitorTabUtils';

  interface Props {
    nodeId: string;
    folder?: string;
    labels?: Record<string, string>;
  }

  let { nodeId, folder, labels }: Props = $props();

  // Component state
  let loading = $state(true);
  let services = $state<ServiceStatus[]>([]);
  let error = $state<{ type: 'upstream' | 'unavailable'; message: string } | null>(null);
  let expandedServices = $state<Set<string>>(new Set());
  let sortMode = $state<ServiceSortMode>('status');

  // Group services by state in CRIT → WARN → UNKNOWN → OK order
  const groupedServices = $derived(groupServicesByState(services));
  // Flat list sorted by lastStateChange (most recent first)
  const servicesByLastChange = $derived(sortServicesByLastStateChange(services));

  interface MonitorServicesResponse {
    services?: ServiceStatus[];
    _debug?: unknown;
    [key: string]: unknown;
  }

  function normalizeServicesPayload(payload: unknown): ServiceStatus[] {
    if (Array.isArray(payload)) {
      return payload as ServiceStatus[];
    }

    if (payload && typeof payload === 'object') {
      const maybeResponse = payload as MonitorServicesResponse;
      if (Array.isArray(maybeResponse.services)) {
        return maybeResponse.services;
      }

      const numericEntries = Object.entries(maybeResponse)
        .filter(([key]) => /^\d+$/.test(key))
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([, value]) => value)
        .filter((value) => value && typeof value === 'object');

      if (numericEntries.length > 0) {
        return numericEntries as ServiceStatus[];
      }
    }

    return [];
  }

  // Truncate plugin output to 200 chars
  function truncateOutput(output: string, maxLen = 200): string {
    if (output.length <= maxLen) return output;
    return output.slice(0, maxLen) + '…';
  }

  // Toggle expanded state for a service
  function toggleExpand(serviceId: string): void {
    const next = new Set(expandedServices);
    if (next.has(serviceId)) {
      next.delete(serviceId);
    } else {
      next.add(serviceId);
    }
    expandedServices = next;
  }

  // Fetch services from the API
  async function fetchServices(): Promise<void> {
    loading = true;
    error = null;
    services = [];

    try {
      const result = await get<unknown>(
        `/api/nodes/${encodeURIComponent(nodeId)}/services`,
        { maxRetries: 0, retryableStatuses: [], showRetryNotifications: false },
      );
      services = normalizeServicesPayload(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred';
      // Distinguish 503 (unavailable/not configured) from 502 (upstream error)
      if (
        message.includes('unavailable') ||
        message.includes('CHECKMK_NOT_CONFIGURED') ||
        message.includes('not configured') ||
        message.includes('Service unavailable') ||
        message.includes('503')
      ) {
        error = { type: 'unavailable', message: 'Monitoring unavailable' };
      } else {
        error = { type: 'upstream', message: message || 'Failed to fetch monitoring data' };
      }
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    fetchServices();
  });
</script>

<div class="monitor-tab space-y-4">
  <!-- Optional host header with folder/labels -->
  {#if folder || (labels && Object.keys(labels).length > 0)}
    <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
        {#if folder}
          <span class="flex items-center gap-1.5">
            <svg class="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span class="font-mono text-xs">{folder}</span>
          </span>
        {/if}
        {#if labels && Object.keys(labels).length > 0}
          <span class="flex flex-wrap items-center gap-1.5">
            <svg class="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
            {#each Object.entries(labels) as [key, value] (key)}
              <span class="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                {key}={value}
              </span>
            {/each}
          </span>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Loading state -->
  {#if loading}
    <div class="flex justify-center py-12">
      <LoadingSpinner size="lg" message="Loading monitoring data..." />
    </div>

  <!-- Error: Monitoring unavailable (503) -->
  {:else if error?.type === 'unavailable'}
    <div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-900/50">
      <svg class="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728M5.636 18.364a9 9 0 010-12.728M12 9v2m0 4h.01" />
      </svg>
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Monitoring unavailable</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        The Checkmk monitoring integration is not configured or currently unavailable.
      </p>
    </div>

  <!-- Error: Upstream failure (502) with Retry -->
  {:else if error?.type === 'upstream'}
    <div class="rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-800 dark:bg-red-900/20">
      <div class="flex items-start gap-3">
        <svg class="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div class="flex-1">
          <h3 class="text-sm font-semibold text-red-900 dark:text-red-300 mb-1">
            Failed to fetch monitoring data
          </h3>
          <p class="text-sm text-red-700 dark:text-red-400 mb-3">{error.message}</p>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-md bg-red-100 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-200 transition-colors dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50"
            onclick={() => fetchServices()}
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Retry
          </button>
        </div>
      </div>
    </div>

  <!-- Empty services (200 + []) -->
  {:else if services.length === 0}
    <div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-900/50">
      <svg class="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No monitored services for this node</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        This host has no services configured in Checkmk.
      </p>
    </div>

  <!-- Services grouped list -->
  {:else}
    <!-- Sort toggle -->
    <div class="flex items-center gap-2">
      <span class="text-xs text-gray-500 dark:text-gray-400">Sort by:</span>
      <div class="flex items-center gap-1">
        <button
          type="button"
          onclick={() => sortMode = 'status'}
          class="rounded px-2 py-0.5 text-xs font-medium transition-colors {sortMode === 'status' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
          title="Group by status severity (CRIT → WARN → UNKNOWN → OK)"
        >
          Status
        </button>
        <button
          type="button"
          onclick={() => sortMode = 'lastStateChange'}
          class="rounded px-2 py-0.5 text-xs font-medium transition-colors {sortMode === 'lastStateChange' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
          title="Sort by most recent state change"
        >
          Last Change
        </button>
      </div>
    </div>

    {#if sortMode === 'status'}
      <!-- Grouped by state -->
      <div class="space-y-4">
        {#each groupedServices as group (group.state)}
          <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <!-- Group heading -->
            <div class="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
              <div class="flex items-center gap-2">
                <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold {STATE_COLORS[group.state]}">
                  {group.name}
                </span>
                <span class="text-sm text-gray-500 dark:text-gray-400">
                  {group.services.length} service{group.services.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            <!-- Service list -->
            <div class="divide-y divide-gray-100 dark:divide-gray-700/50">
              {#each group.services as service (service.description)}
                {@const serviceId = `${String(group.state)}-${service.description}`}
                {@const isExpanded = expandedServices.has(serviceId)}
                {@const needsTruncation = service.pluginOutput.length > 200}
                {@const serviceStateName = STATE_NAMES[service.state] ?? String(service.state)}
                <div class="px-4 py-3">
                  <div class="flex items-start justify-between gap-3">
                    <div class="flex-1 min-w-0">
                      <!-- Service description and badge -->
                      <div class="flex items-center gap-2 mb-1">
                        <span class="font-medium text-sm text-gray-900 dark:text-white truncate">
                          {service.description}
                        </span>
                        <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 {STATE_COLORS[service.state]}">
                          {serviceStateName}
                        </span>
                      </div>

                      <!-- Plugin output -->
                      {#if service.pluginOutput}
                        <p class="text-sm text-gray-600 dark:text-gray-400 break-words">
                          {#if isExpanded || !needsTruncation}
                            {service.pluginOutput}
                          {:else}
                            {truncateOutput(service.pluginOutput)}
                          {/if}
                        </p>
                        {#if needsTruncation}
                          <button
                            type="button"
                            class="mt-1 text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                            onclick={() => toggleExpand(serviceId)}
                          >
                            {isExpanded ? 'Show less' : 'Show more'}
                          </button>
                        {/if}
                      {/if}
                    </div>

                    <!-- Timestamps -->
                    <div class="flex flex-col items-end gap-0.5 flex-shrink-0">
                      <span class="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap" title="Last state change">
                        {#if service.lastStateChange > 0}
                          {formatRelativeTime(service.lastStateChange)}
                        {:else}
                          —
                        {/if}
                      </span>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <!-- Flat list sorted by lastStateChange -->
      <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div class="divide-y divide-gray-100 dark:divide-gray-700/50">
          {#each servicesByLastChange as service (service.description)}
            {@const serviceId = `change-${service.description}`}
            {@const isExpanded = expandedServices.has(serviceId)}
            {@const needsTruncation = service.pluginOutput.length > 200}
            {@const serviceStateName = STATE_NAMES[service.state] ?? String(service.state)}
            <div class="px-4 py-3">
              <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <!-- Service description and badge -->
                  <div class="flex items-center gap-2 mb-1">
                    <span class="font-medium text-sm text-gray-900 dark:text-white truncate">
                      {service.description}
                    </span>
                    <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium flex-shrink-0 {STATE_COLORS[service.state]}">
                      {serviceStateName}
                    </span>
                  </div>

                  <!-- Plugin output -->
                  {#if service.pluginOutput}
                    <p class="text-sm text-gray-600 dark:text-gray-400 break-words">
                      {#if isExpanded || !needsTruncation}
                        {service.pluginOutput}
                      {:else}
                        {truncateOutput(service.pluginOutput)}
                      {/if}
                    </p>
                    {#if needsTruncation}
                      <button
                        type="button"
                        class="mt-1 text-xs text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                        onclick={() => toggleExpand(serviceId)}
                      >
                        {isExpanded ? 'Show less' : 'Show more'}
                      </button>
                    {/if}
                  {/if}
                </div>

                <!-- Last state change time -->
                <div class="flex flex-col items-end gap-0.5 flex-shrink-0">
                  <span class="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap" title="Last state change">
                    {#if service.lastStateChange > 0}
                      {formatRelativeTime(service.lastStateChange)}
                    {:else}
                      —
                    {/if}
                  </span>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
  {/if}
</div>
