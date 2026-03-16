<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';
  import JournalNoteForm from './JournalNoteForm.svelte';
  import { getJournalTimeline } from '../lib/api';
  import type { JournalEntry } from '../lib/api';
  import { showError } from '../lib/toast.svelte';

  interface Props {
    nodeId: string;
  }

  let { nodeId }: Props = $props();

  const PAGE_SIZE = 20;

  let entries = $state<JournalEntry[]>([]);
  let loading = $state(true);
  let loadingMore = $state(false);
  let error = $state<string | null>(null);
  let hasMore = $state(true);
  let offset = $state(0);

  /** Source icon/color mapping */
  const sourceConfig: Record<string, { icon: string; color: string; label: string }> = {
    proxmox: { icon: '🖥️', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400', label: 'Proxmox' },
    aws: { icon: '☁️', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400', label: 'AWS' },
    bolt: { icon: '⚡', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400', label: 'Bolt' },
    ansible: { icon: '🔧', color: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400', label: 'Ansible' },
    ssh: { icon: '🔑', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400', label: 'SSH' },
    puppetdb: { icon: '🐶', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400', label: 'PuppetDB' },
    user: { icon: '📝', color: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400', label: 'User' },
    system: { icon: '⚙️', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400', label: 'System' },
  };

  /** Event type label mapping */
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

  async function fetchEntries(append = false): Promise<void> {
    if (append) {
      loadingMore = true;
    } else {
      loading = true;
      offset = 0;
      entries = [];
    }
    error = null;

    try {
      const result = await getJournalTimeline(nodeId, {
        limit: PAGE_SIZE,
        offset: append ? offset : 0,
      });
      if (append) {
        entries = [...entries, ...result];
      } else {
        entries = result;
      }
      offset = entries.length;
      hasMore = result.length === PAGE_SIZE;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load journal';
      showError('Failed to load journal timeline', error);
    } finally {
      loading = false;
      loadingMore = false;
    }
  }

  function handleNoteAdded(): void {
    fetchEntries(false);
  }

  onMount(() => {
    fetchEntries();
  });
</script>

<div class="space-y-6">
  <!-- Add Note Form -->
  <div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <h3 class="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">Add a Note</h3>
    <JournalNoteForm {nodeId} onNoteAdded={handleNoteAdded} />
  </div>

  <!-- Timeline -->
  {#if loading}
    <div class="flex justify-center py-8">
      <LoadingSpinner size="lg" message="Loading journal timeline..." />
    </div>
  {:else if error}
    <ErrorAlert message="Failed to load journal" details={error} onRetry={() => fetchEntries()} />
  {:else if entries.length === 0}
    <div class="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <p class="text-sm text-gray-500 dark:text-gray-400">No journal entries yet for this node.</p>
    </div>
  {:else}
    <div class="space-y-3">
      {#each entries as entry (entry.id)}
        {@const src = getSourceInfo(entry.source)}
        <div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div class="flex items-start gap-3">
            <!-- Source icon -->
            <span class="mt-0.5 text-lg" title={src.label}>{src.icon}</span>

            <div class="min-w-0 flex-1">
              <!-- Header row -->
              <div class="flex flex-wrap items-center gap-2">
                <!-- Event type label -->
                <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                  {getEventTypeLabel(entry.eventType)}
                </span>

                <!-- Source badge -->
                <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {src.color}">
                  {src.label}
                </span>

                <!-- isLive badge -->
                {#if entry.isLive}
                  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
                    Live
                  </span>
                {/if}

                <!-- Timestamp -->
                <span class="ml-auto text-xs text-gray-400 dark:text-gray-500" title={formatTimestamp(entry.timestamp)}>
                  {relativeTime(entry.timestamp)}
                </span>
              </div>

              <!-- Summary -->
              <p class="mt-1 text-sm text-gray-900 dark:text-white">{entry.summary}</p>

              <!-- Action -->
              {#if entry.action}
                <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  Action: {entry.action}
                </p>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- Load More -->
    {#if hasMore}
      <div class="flex justify-center pt-2">
        <button
          type="button"
          class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          onclick={() => fetchEntries(true)}
          disabled={loadingMore}
        >
          {#if loadingMore}
            Loading...
          {:else}
            Load More
          {/if}
        </button>
      </div>
    {/if}
  {/if}
</div>
