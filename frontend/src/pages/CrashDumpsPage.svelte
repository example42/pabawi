<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ErrorAlert from '../components/ErrorAlert.svelte';
  import { get } from '../lib/api';
  import { showError } from '../lib/toast.svelte';

  const pageTitle = 'Pabawi - Crash Dumps';

  interface CrashDumpEntry {
    filename: string;
    sizeBytes: number;
    createdAt: string;
    pid?: number;
    reason?: string;
    errorMessage?: string;
  }

  interface CrashDumpsResponse {
    dumps: CrashDumpEntry[];
    total: number;
    dumpDir: string;
  }

  let dumps = $state<CrashDumpEntry[]>([]);
  let dumpDir = $state('');
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Detail view state
  let selectedDump = $state<CrashDumpEntry | null>(null);
  let dumpContent = $state<unknown>(null);
  let loadingDetail = $state(false);

  onMount(() => {
    document.title = pageTitle;
    void fetchDumps();
  });

  async function fetchDumps(): Promise<void> {
    loading = true;
    error = null;
    try {
      const data = await get<CrashDumpsResponse>('/api/crash-dumps');
      dumps = data.dumps;
      dumpDir = data.dumpDir;
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to load crash dumps';
    } finally {
      loading = false;
    }
  }

  async function viewDump(dump: CrashDumpEntry): Promise<void> {
    selectedDump = dump;
    loadingDetail = true;
    dumpContent = null;
    try {
      const data = await get<{ filename: string; content: unknown }>(`/api/crash-dumps/${dump.filename}`);
      dumpContent = data.content;
    } catch (e) {
      showError('Failed to load dump', e instanceof Error ? e.message : 'Unknown error');
      selectedDump = null;
    } finally {
      loadingDetail = false;
    }
  }

  function downloadDump(filename: string): void {
    const token = localStorage.getItem('token');
    const a = document.createElement('a');
    a.href = `/api/crash-dumps/${filename}/download`;
    // Use fetch with auth header for download
    void fetch(`/api/crash-dumps/${filename}/download`, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => {
        showError('Download failed', 'Could not download the crash dump file');
      });
  }

  function closeDetail(): void {
    selectedDump = null;
    dumpContent = null;
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${String(bytes)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }
</script>

<div class="w-full px-4 sm:px-6 lg:px-8 py-8">
  <!-- Header -->
  <div class="mb-6">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Crash Dumps</h1>
    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
      Process crash dumps saved to: <code class="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-xs">{dumpDir}</code>
    </p>
  </div>

  {#if loading}
    <LoadingSpinner />
  {:else if error}
    <ErrorAlert message={error} />
  {:else if selectedDump}
    <!-- Detail View -->
    <div class="bg-white dark:bg-gray-800 shadow rounded-lg">
      <div class="px-4 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">{selectedDump.filename}</h2>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {formatDate(selectedDump.createdAt)} &middot; {formatBytes(selectedDump.sizeBytes)}
          </p>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            onclick={() => downloadDump(selectedDump!.filename)}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary-600 text-white hover:bg-primary-700 transition-colors"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </button>
          <button
            type="button"
            onclick={closeDetail}
            class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Back to list
          </button>
        </div>
      </div>
      <div class="p-4">
        {#if loadingDetail}
          <LoadingSpinner />
        {:else if dumpContent}
          <pre class="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 overflow-x-auto text-xs text-gray-800 dark:text-gray-200 max-h-[70vh] overflow-y-auto">{JSON.stringify(dumpContent, null, 2)}</pre>
        {/if}
      </div>
    </div>
  {:else if dumps.length === 0}
    <!-- Empty state -->
    <div class="bg-white dark:bg-gray-800 shadow rounded-lg p-12 text-center">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No crash dumps</h3>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        No crash dump files found. This is good — it means no unhandled crashes have occurred.
      </p>
    </div>
  {:else}
    <!-- Dump List -->
    <div class="bg-white dark:bg-gray-800 shadow rounded-lg overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead class="bg-gray-50 dark:bg-gray-750">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">File</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Reason</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Error</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">PID</th>
            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Size</th>
            <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
          {#each dumps as dump}
            <tr class="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
              <td class="px-4 py-3 text-sm font-mono text-gray-900 dark:text-gray-100 whitespace-nowrap">
                {dump.filename}
              </td>
              <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                {formatDate(dump.createdAt)}
              </td>
              <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 max-w-[200px] truncate">
                {dump.reason ?? '—'}
              </td>
              <td class="px-4 py-3 text-sm text-red-600 dark:text-red-400 max-w-[250px] truncate" title={dump.errorMessage ?? ''}>
                {dump.errorMessage ?? '—'}
              </td>
              <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                {dump.pid ?? '—'}
              </td>
              <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 whitespace-nowrap">
                {formatBytes(dump.sizeBytes)}
              </td>
              <td class="px-4 py-3 text-right whitespace-nowrap">
                <button
                  type="button"
                  onclick={() => viewDump(dump)}
                  class="text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 text-sm font-medium mr-3"
                >
                  View
                </button>
                <button
                  type="button"
                  onclick={() => downloadDump(dump.filename)}
                  class="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 text-sm font-medium"
                >
                  Download
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
