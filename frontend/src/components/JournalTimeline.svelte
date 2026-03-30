<script lang="ts">
  import { onDestroy } from 'svelte';
  import JournalNoteForm from './JournalNoteForm.svelte';
  import { authManager } from '../lib/auth.svelte';
  import type { JournalEntry } from '../lib/api';

  interface Props {
    nodeId: string;
    active?: boolean;
  }

  let { nodeId, active = false }: Props = $props();

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
    error: 'Error',
    warning: 'Warning',
    info: 'Info',
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

  function getSourceInfo(source: string) {
    return sourceConfig[source] ?? { icon: '❓', color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300', label: source };
  }

  function getEventTypeLabel(eventType: string): string {
    return eventTypeLabels[eventType] ?? eventType;
  }

  function formatTimestamp(ts: string): string {
    return new Date(ts).toLocaleString();
  }

  function relativeTime(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
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

  function startStream(): void {
    if (abortController) return;

    const url = `/api/journal/${encodeURIComponent(nodeId)}/stream`;
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
    startStream();
  }

  function handleNoteAdded(): void {
    reload();
  }

  // Start stream only when the tab becomes active
  $effect(() => {
    if (active && !abortController && !streamComplete) {
      startStream();
    }
  });

  onDestroy(() => {
    stopStream();
  });

  const isLoading = $derived(!streamComplete && activeSources.length > 0);
  const pendingSources = $derived(activeSources.filter((s) => sourceStatuses[s] === 'pending'));
</script>

<div class="space-y-6">
  <!-- Add Note Form -->
  <div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <h3 class="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">Add a Note</h3>
    <JournalNoteForm {nodeId} onNoteAdded={handleNoteAdded} />
  </div>

  <!-- Source loading status bar -->
  {#if activeSources.length > 0 && !streamComplete}
    <div class="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs dark:border-blue-800 dark:bg-blue-900/20">
      <span class="font-medium text-blue-700 dark:text-blue-400">Loading journal…</span>
      {#each activeSources as src (src)}
        {@const status = sourceStatuses[src] ?? 'pending'}
        {@const srcInfo = getSourceInfo(src)}
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
      <p class="text-sm text-gray-500 dark:text-gray-400">No journal entries found for this node.</p>
    </div>
  {:else if entries.length > 0}
    <div class="space-y-2">
      {#each entries as entry (entry.id)}
        {@const src = getSourceInfo(entry.source)}
        {@const expanded = expandedIds.has(entry.id)}
        {@const hasDetails = entry.details && Object.keys(entry.details).length > 0}

        <div class="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <!-- Clickable header row -->
          <button
            type="button"
            class="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-750 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500"
            onclick={() => hasDetails && toggleExpand(entry.id)}
            aria-expanded={expanded}
          >
            <div class="flex items-start gap-3">
              <!-- Source icon -->
              <span class="mt-0.5 text-base leading-none" title={src.label}>{src.icon}</span>

              <div class="min-w-0 flex-1">
                <!-- Top row: badges + timestamp -->
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                    {getEventTypeLabel(entry.eventType)}
                  </span>
                  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {src.color}">
                    {src.label}
                  </span>
                  {#if entry.isLive}
                    <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
                      Live
                    </span>
                  {/if}
                  <span class="ml-auto shrink-0 text-xs text-gray-400 dark:text-gray-500" title={formatTimestamp(entry.timestamp)}>
                    {formatTimestamp(entry.timestamp)}
                  </span>
                </div>

                <!-- Summary (title) -->
                <p class="mt-1 text-sm font-medium text-gray-900 dark:text-white">{entry.summary}</p>

                <!-- Action subtitle -->
                {#if entry.action && entry.action !== 'unknown'}
                  <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {entry.action}
                  </p>
                {/if}
              </div>

              <!-- Expand chevron -->
              {#if hasDetails}
                <svg
                  class="mt-1 h-4 w-4 shrink-0 text-gray-400 transition-transform {expanded ? 'rotate-180' : ''}"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                </svg>
              {/if}
            </div>
          </button>

          <!-- Expanded details -->
          {#if expanded && hasDetails}
            <div class="border-t border-gray-100 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
              <dl class="space-y-1.5 text-xs">
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
