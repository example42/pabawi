<script lang="ts">
  import { expertMode } from '../lib/expertMode.svelte';

  interface Props {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    boltCommand?: string;
  }

  let { stdout, stderr, exitCode, boltCommand }: Props = $props();

  const hasOutput = $derived(stdout || stderr || exitCode !== undefined);

  // Search state
  let searchQuery = $state('');
  let searchActive = $state(false);
  let currentMatchIndex = $state(0);
  let totalMatches = $state(0);
  let stdoutContainer = $state<HTMLElement | null>(null);
  let stderrContainer = $state<HTMLElement | null>(null);

  // Highlighted output with search matches
  const highlightedStdout = $derived.by(() => {
    if (!stdout || !searchQuery || !searchActive) return stdout;
    return highlightMatches(stdout, searchQuery);
  });

  const highlightedStderr = $derived.by(() => {
    if (!stderr || !searchQuery || !searchActive) return stderr;
    return highlightMatches(stderr, searchQuery);
  });

  // Copy command to clipboard
  async function copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }

  // Escape HTML entities to prevent XSS attacks
  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Highlight search matches in text with HTML sanitization
  function highlightMatches(text: string, query: string): string {
    if (!query) return escapeHtml(text);

    // First escape HTML entities in the original text to prevent XSS
    const sanitizedText = escapeHtml(text);

    // Also escape the query for regex, but also escape HTML entities
    // so we can match against the sanitized text
    const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedQuery, 'gi');
    const matches = sanitizedText.match(regex);
    totalMatches = matches ? matches.length : 0;

    let matchCount = 0;
    return sanitizedText.replace(regex, (match) => {
      matchCount++;
      const isCurrent = matchCount === currentMatchIndex + 1;
      const className = isCurrent ? 'search-match-current' : 'search-match';
      return `<mark class="${className}">${match}</mark>`;
    });
  }

  // Toggle search
  function toggleSearch(): void {
    searchActive = !searchActive;
    if (!searchActive) {
      searchQuery = '';
      currentMatchIndex = 0;
      totalMatches = 0;
    }
  }

  // Navigate to next match
  function nextMatch(): void {
    if (totalMatches === 0) return;
    currentMatchIndex = (currentMatchIndex + 1) % totalMatches;
    scrollToCurrentMatch();
  }

  // Navigate to previous match
  function previousMatch(): void {
    if (totalMatches === 0) return;
    currentMatchIndex = (currentMatchIndex - 1 + totalMatches) % totalMatches;
    scrollToCurrentMatch();
  }

  // Scroll to current match
  function scrollToCurrentMatch(): void {
    // Find the current match element and scroll to it
    const containers = [stdoutContainer, stderrContainer].filter(Boolean);
    for (const container of containers) {
      const currentMatch = container?.querySelector('.search-match-current');
      if (currentMatch) {
        currentMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      }
    }
  }

  // Update search
  $effect(() => {
    if (searchQuery && searchActive) {
      currentMatchIndex = 0;
      // Trigger re-highlighting by accessing derived values
      highlightedStdout;
      highlightedStderr;
    }
  });
</script>

{#if hasOutput}
  <div class="command-output space-y-3">
    {#if expertMode.enabled && boltCommand}
      <div>
        <h4 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Bolt Command:</h4>
        <div class="relative rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
          <pre class="overflow-x-auto pr-10 font-mono text-sm text-blue-900 dark:text-blue-100">{boltCommand}</pre>
          <button
            type="button"
            class="absolute right-2 top-2 rounded p-1.5 text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-800"
            onclick={() => copyToClipboard(boltCommand)}
            title="Copy to clipboard"
          >
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </div>
    {/if}

    {#if exitCode !== undefined}
      <div class="flex items-center gap-2">
        <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Exit Code:</span>
        <span
          class="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium {exitCode === 0
            ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
            : 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'}"
        >
          {exitCode}
        </span>
      </div>
    {/if}

    <!-- Search Controls (Expert Mode Only) -->
    {#if expertMode.enabled && (stdout || stderr)}
      <div class="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-900/50">
        <button
          type="button"
          class="rounded p-1.5 text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
          onclick={toggleSearch}
          title={searchActive ? 'Hide search' : 'Search output'}
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>

        {#if searchActive}
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search in output..."
            class="flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />

          {#if searchQuery}
            <span class="text-xs text-gray-600 dark:text-gray-400">
              {totalMatches > 0 ? `${currentMatchIndex + 1}/${totalMatches}` : 'No matches'}
            </span>

            <button
              type="button"
              class="rounded p-1.5 text-gray-600 hover:bg-gray-200 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700"
              onclick={previousMatch}
              disabled={totalMatches === 0}
              title="Previous match"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
              </svg>
            </button>

            <button
              type="button"
              class="rounded p-1.5 text-gray-600 hover:bg-gray-200 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700"
              onclick={nextMatch}
              disabled={totalMatches === 0}
              title="Next match"
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          {/if}
        {/if}
      </div>
    {/if}

    {#if stdout}
      <div>
        <h4 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Standard Output:</h4>
        <div
          bind:this={stdoutContainer}
          class="max-h-96 overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900"
        >
          {#if expertMode.enabled && searchActive && searchQuery}
            <pre class="whitespace-pre-wrap break-words font-mono text-sm text-gray-900 dark:text-gray-100">{@html highlightedStdout}</pre>
          {:else}
            <pre class="whitespace-pre-wrap break-words font-mono text-sm text-gray-900 dark:text-gray-100">{stdout}</pre>
          {/if}
        </div>
      </div>
    {/if}

    {#if stderr}
      <div>
        <h4 class="mb-2 text-sm font-medium text-red-700 dark:text-red-400">Standard Error:</h4>
        <div
          bind:this={stderrContainer}
          class="max-h-96 overflow-auto rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20"
        >
          {#if expertMode.enabled && searchActive && searchQuery}
            <pre class="whitespace-pre-wrap break-words font-mono text-sm text-red-900 dark:text-red-100">{@html highlightedStderr}</pre>
          {:else}
            <pre class="whitespace-pre-wrap break-words font-mono text-sm text-red-900 dark:text-red-100">{stderr}</pre>
          {/if}
        </div>
      </div>
    {/if}
  </div>
{:else}
  <p class="text-sm text-gray-500 dark:text-gray-400">No output</p>
{/if}

<style>
  /* Search match highlighting */
  :global(.search-match) {
    background-color: #fef08a;
    color: #854d0e;
    padding: 0 2px;
    border-radius: 2px;
  }

  :global(.search-match-current) {
    background-color: #fbbf24;
    color: #78350f;
    padding: 0 2px;
    border-radius: 2px;
    font-weight: 600;
  }

  :global(.dark .search-match) {
    background-color: #713f12;
    color: #fef08a;
  }

  :global(.dark .search-match-current) {
    background-color: #92400e;
    color: #fde047;
  }

  /* Custom scrollbar styling */
  .command-output ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .command-output ::-webkit-scrollbar-track {
    background: transparent;
  }

  .command-output ::-webkit-scrollbar-thumb {
    background: rgba(156, 163, 175, 0.5);
    border-radius: 4px;
  }

  .command-output ::-webkit-scrollbar-thumb:hover {
    background: rgba(156, 163, 175, 0.7);
  }

  /* Dark mode scrollbar */
  :global(.dark) .command-output ::-webkit-scrollbar-thumb {
    background: rgba(75, 85, 99, 0.5);
  }

  :global(.dark) .command-output ::-webkit-scrollbar-thumb:hover {
    background: rgba(75, 85, 99, 0.7);
  }
</style>
