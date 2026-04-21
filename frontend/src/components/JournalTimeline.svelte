<script lang="ts">
  import { onDestroy } from 'svelte';
  import JournalNoteForm from './JournalNoteForm.svelte';
  import { authManager } from '../lib/auth.svelte';
  import { router } from '../lib/router.svelte';
  import type { JournalEntry } from '../lib/api';

  interface Props {
    mode: "node" | "global";
    nodeId?: string;
    active?: boolean;
    // Filter props (shared by both modes)
    nodeIds?: string[];
    groupId?: string;
    startDate?: string;
    endDate?: string;
    eventTypes?: string[];
    sources?: string[];
  }

  let {
    mode,
    nodeId,
    active = false,
    nodeIds,
    groupId,
    startDate,
    endDate,
    eventTypes,
    sources,
  }: Props = $props();

  // Source display config
  const sourceConfig: Record<string, { icon: string; color: string; label: string }> = {
    proxmox: { icon: '🖥️', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400', label: 'Proxmox' },
    aws: { icon: '☁️', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400', label: 'AWS' },
    bolt: { icon: '⚡', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400', label: 'Bolt' },
    ansible: { icon: '🔧', color: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400', label: 'Ansible' },
    ssh: { icon: '🔑', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400', label: 'SSH' },
    puppetdb: { icon: '🐶', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400', label: 'PuppetDB' },
    user: { icon: '📝', color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400', label: 'User' },
    system: { icon: '⚙️', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400', label: 'System' },
    executions: { icon: '▶️', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400', label: 'Executions' },
    journal: { icon: '📔', color: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300', label: 'Journal' },
  };

  const eventTypeLabels: Record<string, string> = {
    provision: 'Provisioned',
    destroy: 'Destroyed',
    start: 'Started',
    stop: 'Stopped',
    reboot: 'Rebooted',
    suspend: 'Suspended',
    resume: 'Resumed',
    command_execution: 'Command',
    task_execution: 'Task',
    puppet_run: 'Puppet Run',
    package_install: 'Package',
    config_change: 'Config Change',
    note: 'Note',
    unknown: 'Unknown',
  };

  // SSE state
  let abortController = $state<AbortController | null>(null);
  let streamComplete = $state(false);
  let streamError = $state<string | null>(null);

  // Per-source loading status: pending | loaded | error
  let sourceStatuses = $state<Record<string, 'pending' | 'loaded' | 'error'>>({});
  let activeSources = $state<string[]>([]);

  // All accumulated entries
  let entries = $state<JournalEntry[]>([]);

  // Expanded entry IDs
  let expandedIds = $state<Set<string>>(new Set());

  function getSourceInfo(src: string): { icon: string; color: string; label: string } {
    return sourceConfig[src] ?? { icon: '❓', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300', label: src };
  }

  function getEventTypeLabel(et: string): string {
    return eventTypeLabels[et] ?? et;
  }

  function getStatusDotColor(et: string): string {
    switch (et) {
      case 'start':
      case 'resume':
      case 'provision':
        return 'bg-green-500';
      case 'destroy':
        return 'bg-red-500';
      case 'command_execution':
      case 'task_execution':
      case 'puppet_run':
        return 'bg-blue-500';
      case 'note':
      case 'unknown':
      default:
        return 'bg-gray-400';
    }
  }

  function formatTimestamp(ts: string): string {
    const d = new Date(ts);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${mins}`;
  }

  function toggleExpand(id: string): void {
    const next = new Set(expandedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    expandedIds = next;
  }

  function mergeEntries(newBatch: JournalEntry[]): void {
    const existingIds = new Set(entries.map((e) => e.id));
    const fresh = newBatch.filter((e) => !existingIds.has(e.id));
    if (fresh.length === 0) return;
    const merged = [...entries, ...fresh];
    merged.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    entries = merged;
  }

  function buildStreamUrl(): string {
    // Build common filter query params
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    if (eventTypes && eventTypes.length > 0) params.set('eventType', eventTypes.join(','));
    if (sources && sources.length > 0) params.set('source', sources.join(','));

    if (mode === "node") {
      if (!nodeId) return '';
      const qs = params.toString();
      return `/api/journal/${encodeURIComponent(nodeId)}/stream${qs ? `?${qs}` : ''}`;
    }
    // Global mode — add target selection params
    if (nodeIds && nodeIds.length > 0) params.set('nodeIds', nodeIds.join(','));
    if (groupId) params.set('groupId', groupId);
    const qs = params.toString();
    return `/api/journal/global/stream${qs ? `?${qs}` : ''}`;
  }

  function startStream(): void {
    if (abortController) return;
    if (mode === "node" && !nodeId) {
      streamError = "Missing node ID for node journal stream";
      streamComplete = true;
      return;
    }

    const url = buildStreamUrl();
    const authHeader = authManager.getAuthHeader();
    const headers: Record<string, string> = { 'Accept': 'text/event-stream' };
    if (authHeader) headers['Authorization'] = authHeader;

    const ac = new AbortController();
    abortController = ac;
    streamComplete = false;
    streamError = null;

    (async () => {
      try {
        const response = await fetch(url, { headers, signal: ac.signal });
        if (!response.ok) {
          streamError = `Failed to load journal (${String(response.status)})`;
          streamComplete = true;
          abortController = null;
          return;
        }

        const reader = response.body?.getReader();
        if (!reader) {
          streamError = 'No response stream available';
          streamComplete = true;
          abortController = null;
          return;
        }

        const decoder = new TextDecoder();
        let buf = '';

        // SSE parser: splits on double newline boundaries
        function dispatchEvent(eventName: string, dataStr: string): void {
          if (!dataStr) return;
          try {
            const parsed = JSON.parse(dataStr) as unknown;
            if (eventName === 'init') {
              const d = parsed as { sources: string[] };
              activeSources = d.sources;
              const statuses: Record<string, 'pending' | 'loaded' | 'error'> = {};
              for (const s of d.sources) statuses[s] = 'pending';
              sourceStatuses = statuses;
            } else if (eventName === 'batch') {
              const d = parsed as { source: string; entries: JournalEntry[] };
              sourceStatuses = { ...sourceStatuses, [d.source]: 'loaded' };
              mergeEntries(d.entries);
            } else if (eventName === 'source_error') {
              const d = parsed as { source: string; message: string };
              sourceStatuses = { ...sourceStatuses, [d.source]: 'error' };
            } else if (eventName === 'complete') {
              streamComplete = true;
              abortController = null;
            }
          } catch {
            // ignore malformed event
          }
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          // Process complete SSE messages (separated by \n\n)
          const messages = buf.split('\n\n');
          buf = messages.pop() ?? '';

          for (const msg of messages) {
            if (!msg.trim() || msg.startsWith(':')) continue; // heartbeat/comment
            let eventName = 'message';
            let dataStr = '';
            for (const line of msg.split('\n')) {
              if (line.startsWith('event: ')) eventName = line.slice(7).trim();
              else if (line.startsWith('data: ')) dataStr = line.slice(6);
            }
            dispatchEvent(eventName, dataStr);
          }
        }

        if (!streamComplete) {
          streamComplete = true;
          abortController = null;
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        streamError = 'Connection lost while loading journal';
        streamComplete = true;
        abortController = null;
      }
    })();
  }

  function stopStream(): void {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  }

  function reload(): void {
    stopStream();
    entries = [];
    sourceStatuses = {};
    activeSources = [];
    streamComplete = false;
    streamError = null;
    expandedIds = new Set();
    startStream();
  }

  function handleNoteAdded(): void {
    reload();
  }

  // Start stream when active becomes true.
  // For global mode, also restart when filter props change.
  let lastFilterKey = $state('');

  $effect(() => {
    // Build a serialized key from all filter-relevant props so we detect changes
    const filterKey = JSON.stringify([nodeIds, groupId, startDate, endDate, eventTypes, sources]);

    if (active) {
      if (filterKey !== lastFilterKey && lastFilterKey !== '') {
        // Filters changed — reload
        lastFilterKey = filterKey;
        reload();
      } else if (!abortController && !streamComplete) {
        // Initial start
        lastFilterKey = filterKey;
        startStream();
      }
    }
  });

  onDestroy(() => {
    stopStream();
  });

  const isLoading = $derived(!streamComplete && activeSources.length > 0);
  const pendingSources = $derived(activeSources.filter((s) => sourceStatuses[s] === 'pending'));
</script>

<div class="space-y-4">
  <!-- Add Note Form (node mode only) -->
  {#if mode === "node" && nodeId}
    <div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h3 class="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">Add a Note</h3>
      <JournalNoteForm {nodeId} onNoteAdded={handleNoteAdded} />
    </div>
  {/if}

  <!-- Source loading status bar -->
  {#if activeSources.length > 0 && !streamComplete}
    <div class="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs dark:border-blue-800 dark:bg-blue-900/20">
      <span class="font-medium text-blue-700 dark:text-blue-400">Loading journal…</span>
      {#each activeSources as srcKey (srcKey)}
        {@const status = sourceStatuses[srcKey] ?? 'pending'}
        {@const srcInfo = getSourceInfo(srcKey)}
        <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 {status === 'loaded' ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400' : status === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400' : 'bg-white text-gray-500 dark:bg-gray-800 dark:text-gray-400'}">
          {#if status === 'pending'}
            <svg class="h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          {:else if status === 'loaded'}
            <svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
          {:else}
            <svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
          {/if}
          {srcInfo.label}
        </span>
      {/each}
    </div>
  {/if}

  <!-- Stream error -->
  {#if streamError}
    <div class="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
      <span>{streamError}</span>
      <button type="button" onclick={reload} class="ml-4 font-medium underline hover:no-underline">Retry</button>
    </div>
  {/if}

  <!-- Timeline entries -->
  {#if entries.length === 0 && streamComplete}
    <div class="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <p class="text-sm text-gray-500 dark:text-gray-400">
        {mode === "global" ? "No journal entries found matching the current filters." : "No journal entries found for this node."}
      </p>
    </div>
  {:else if entries.length > 0}
    <div class="space-y-0.5">
      {#each entries as entry (entry.id)}
        {@const src = getSourceInfo(entry.source)}
        {@const expanded = expandedIds.has(entry.id)}
        {@const hasDetails = (entry.details && Object.keys(entry.details).length > 0) || (entry.action && entry.action !== 'unknown') || entry.nodeUri}

        <div>
          <!-- Compact single-line entry -->
          <button
            type="button"
            class="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-750 rounded-lg border border-transparent hover:border-gray-200 dark:hover:border-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
            onclick={() => toggleExpand(entry.id)}
            aria-expanded={expanded}
          >
            <!-- Status dot -->
            <span class="h-2 w-2 shrink-0 rounded-full {getStatusDotColor(entry.eventType)}"></span>
            <!-- Timestamp -->
            <span class="shrink-0 text-xs text-gray-400 dark:text-gray-500 w-32">{formatTimestamp(entry.timestamp)}</span>
            <!-- Source icon -->
            <span class="shrink-0 text-sm" title={src.label}>{src.icon}</span>
            <!-- Event type -->
            <span class="shrink-0 text-xs font-medium text-gray-600 dark:text-gray-400 w-20">{getEventTypeLabel(entry.eventType)}</span>
            <!-- Node ID (global mode only) -->
            {#if mode === "global"}
              <a
                href={`/nodes/${encodeURIComponent(entry.nodeId)}`}
                onclick={(e) => { e.preventDefault(); e.stopPropagation(); router.navigate(`/nodes/${encodeURIComponent(entry.nodeId)}`); }}
                class="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-primary-600 hover:text-primary-800 hover:bg-primary-50 dark:bg-gray-700 dark:text-primary-400 dark:hover:text-primary-300 dark:hover:bg-primary-900/20"
                title={`Go to node ${entry.nodeId}`}
              >{entry.nodeId}</a>
            {/if}
            <!-- Summary -->
            <span class="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-200">{entry.summary}</span>
            <!-- Expand indicator -->
            {#if hasDetails}
              <svg class="h-3 w-3 shrink-0 text-gray-400 transition-transform {expanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            {/if}
          </button>

          <!-- Expanded details -->
          {#if expanded && hasDetails}
            <div class="ml-6 mb-2 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
              <!-- action -->
              {#if entry.action && entry.action !== 'unknown'}
                <p class="mb-2 text-xs text-gray-500 dark:text-gray-400">Action: {entry.action}</p>
              {/if}
              <!-- nodeUri -->
              {#if entry.nodeUri}
                <p class="mb-2 text-xs text-gray-500 dark:text-gray-400">URI: {entry.nodeUri}</p>
              {/if}
              <!-- details key-value pairs -->
              {#if entry.details && Object.keys(entry.details).length > 0}
                <dl class="space-y-1 text-xs">
                  {#each Object.entries(entry.details) as [key, value] (key)}
                    {#if value !== null && value !== undefined && value !== ''}
                      <div class="flex gap-2">
                        <dt class="w-36 shrink-0 font-medium text-gray-500 dark:text-gray-400">{key}</dt>
                        <dd class="min-w-0 break-all font-mono text-gray-800 dark:text-gray-200">
                          {#if typeof value === 'object'}
                            {JSON.stringify(value, null, 2)}
                          {:else}
                            {String(value)}
                          {/if}
                        </dd>
                      </div>
                    {/if}
                  {/each}
                </dl>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <!-- Reload button after complete -->
    {#if streamComplete}
      <div class="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
        <span>{entries.length} event{entries.length !== 1 ? 's' : ''}</span>
        <button type="button" onclick={reload} class="hover:text-gray-600 dark:hover:text-gray-300 underline">
          Refresh
        </button>
      </div>
    {/if}
  {:else if !streamComplete && activeSources.length === 0}
    <!-- Not yet started (active just became true) -->
    <div class="flex justify-center py-8">
      <div class="text-sm text-gray-500 dark:text-gray-400">Starting journal load…</div>
    </div>
  {/if}
</div>
