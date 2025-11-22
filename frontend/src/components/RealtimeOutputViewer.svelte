<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { expertMode } from '../lib/expertMode.svelte';
  import type { ExecutionStream } from '../lib/executionStream.svelte';
  import StatusBadge from './StatusBadge.svelte';

  interface Props {
    stream: ExecutionStream;
    autoConnect?: boolean;
  }

  let { stream, autoConnect = true }: Props = $props();

  // Auto-scroll state
  let autoScroll = $state(true);
  let stdoutContainer: HTMLElement | null = null;
  let stderrContainer: HTMLElement | null = null;

  // Elapsed time tracking
  let startTime: number | null = null;
  let elapsedTime = $state(0);
  let elapsedInterval: ReturnType<typeof setInterval> | null = null;

  // Derived state
  const hasStdout = $derived(stream.stdout.length > 0);
  const hasStderr = $derived(stream.stderr.length > 0);
  const hasOutput = $derived(hasStdout || hasStderr);
  const isRunning = $derived(stream.executionStatus === 'running' || stream.isConnecting);
  const isComplete = $derived(stream.executionStatus === 'success' || stream.executionStatus === 'failed');

  // Status badge mapping
  const statusBadgeMap: Record<string, 'success' | 'failed' | 'running'> = {
    running: 'running',
    success: 'success',
    failed: 'failed',
  };

  // Format elapsed time
  function formatElapsedTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  // Start elapsed time tracking
  function startElapsedTimer(): void {
    startTime = Date.now();
    elapsedTime = 0;

    elapsedInterval = setInterval(() => {
      if (startTime) {
        elapsedTime = Date.now() - startTime;
      }
    }, 100); // Update every 100ms for smooth display
  }

  // Stop elapsed time tracking
  function stopElapsedTimer(): void {
    if (elapsedInterval) {
      clearInterval(elapsedInterval);
      elapsedInterval = null;
    }
  }

  // Auto-scroll to bottom
  function scrollToBottom(container: HTMLElement | null): void {
    if (container && autoScroll) {
      container.scrollTop = container.scrollHeight;
    }
  }

  // Copy text to clipboard
  async function copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  }

  // Copy all output
  async function copyAllOutput(): Promise<void> {
    const output = [
      stream.command ? `Command: ${stream.command}\n` : '',
      stream.stdout ? `STDOUT:\n${stream.stdout}\n` : '',
      stream.stderr ? `STDERR:\n${stream.stderr}\n` : '',
    ].filter(Boolean).join('\n');

    await copyToClipboard(output);
  }

  // Watch for output changes and auto-scroll
  $effect(() => {
    // Trigger on stdout changes
    if (stream.stdout) {
      scrollToBottom(stdoutContainer);
    }
  });

  $effect(() => {
    // Trigger on stderr changes
    if (stream.stderr) {
      scrollToBottom(stderrContainer);
    }
  });

  // Watch for execution status changes
  $effect(() => {
    if (stream.executionStatus === 'running' && !startTime) {
      startElapsedTimer();
    } else if (isComplete && elapsedInterval) {
      stopElapsedTimer();
    }
  });

  // Lifecycle
  onMount(() => {
    if (autoConnect) {
      stream.connect();
    }
  });

  onDestroy(() => {
    stopElapsedTimer();
    stream.disconnect();
  });
</script>

<div class="realtime-output-viewer space-y-4">
  <!-- Header with status and controls -->
  <div class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
    <div class="flex items-center gap-3">
      {#if stream.executionStatus}
        <StatusBadge status={statusBadgeMap[stream.executionStatus] || 'running'} />
      {:else if stream.isConnecting}
        <StatusBadge status="running" />
      {/if}

      {#if isRunning}
        <span class="text-sm text-gray-600 dark:text-gray-400">
          Elapsed: {formatElapsedTime(elapsedTime)}
        </span>
      {:else if isComplete && startTime}
        <span class="text-sm text-gray-600 dark:text-gray-400">
          Duration: {formatElapsedTime(elapsedTime)}
        </span>
      {/if}

      {#if stream.status === 'reconnecting'}
        <span class="text-sm text-yellow-600 dark:text-yellow-400">
          Reconnecting...
        </span>
      {/if}
    </div>

    <div class="flex items-center gap-2">
      <!-- Auto-scroll toggle -->
      <button
        type="button"
        class="rounded px-3 py-1.5 text-sm font-medium transition-colors {autoScroll
          ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50'
          : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}"
        onclick={() => autoScroll = !autoScroll}
        title={autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'}
      >
        {autoScroll ? '📜 Auto-scroll' : '⏸️ Paused'}
      </button>

      <!-- Copy all output -->
      {#if hasOutput}
        <button
          type="button"
          class="rounded p-1.5 text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
          onclick={copyAllOutput}
          title="Copy all output"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <!-- Bolt Command (Expert Mode) -->
  {#if expertMode.enabled && stream.command}
    <div>
      <h4 class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Bolt Command:</h4>
      <div class="relative rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
        <pre class="overflow-x-auto pr-10 font-mono text-sm text-blue-900 dark:text-blue-100">{stream.command}</pre>
        <button
          type="button"
          class="absolute right-2 top-2 rounded p-1.5 text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-800"
          onclick={() => copyToClipboard(stream.command || '')}
          title="Copy command"
        >
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
      </div>
    </div>
  {/if}

  <!-- Standard Output -->
  {#if hasStdout}
    <div>
      <div class="mb-2 flex items-center justify-between">
        <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300">Standard Output:</h4>
        <button
          type="button"
          class="rounded p-1 text-xs text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
          onclick={() => copyToClipboard(stream.stdout)}
          title="Copy stdout"
        >
          Copy
        </button>
      </div>
      <div
        bind:this={stdoutContainer}
        class="max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900"
      >
        <pre class="font-mono text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">{stream.stdout}</pre>
      </div>
    </div>
  {:else if isRunning}
    <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center dark:border-gray-700 dark:bg-gray-900">
      <p class="text-sm text-gray-500 dark:text-gray-400">Waiting for output...</p>
    </div>
  {/if}

  <!-- Standard Error -->
  {#if hasStderr}
    <div>
      <div class="mb-2 flex items-center justify-between">
        <h4 class="text-sm font-semibold text-red-700 dark:text-red-400">Standard Error:</h4>
        <button
          type="button"
          class="rounded p-1 text-xs text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30"
          onclick={() => copyToClipboard(stream.stderr)}
          title="Copy stderr"
        >
          Copy
        </button>
      </div>
      <div
        bind:this={stderrContainer}
        class="max-h-96 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20"
      >
        <pre class="font-mono text-sm text-red-900 dark:text-red-100 whitespace-pre-wrap break-words">{stream.stderr}</pre>
      </div>
    </div>
  {/if}

  <!-- Error Display -->
  {#if stream.error}
    <div class="rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
      <div class="flex items-start gap-2">
        <svg class="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div class="flex-1">
          <h4 class="text-sm font-semibold text-red-800 dark:text-red-300">Error</h4>
          <p class="mt-1 text-sm text-red-700 dark:text-red-400">{stream.error}</p>
        </div>
      </div>
    </div>
  {/if}

  <!-- Connection Status Messages -->
  {#if stream.status === 'connecting'}
    <div class="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center dark:border-blue-800 dark:bg-blue-900/20">
      <p class="text-sm text-blue-700 dark:text-blue-300">Connecting to execution stream...</p>
    </div>
  {:else if stream.status === 'error' && !stream.error}
    <div class="rounded-lg border border-red-300 bg-red-50 p-4 text-center dark:border-red-800 dark:bg-red-900/20">
      <p class="text-sm text-red-700 dark:text-red-300">Failed to connect to execution stream</p>
      <button
        type="button"
        class="mt-2 rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
        onclick={() => stream.reconnect()}
      >
        Retry Connection
      </button>
    </div>
  {/if}
</div>

<style>
  /* Custom scrollbar styling */
  .realtime-output-viewer ::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  .realtime-output-viewer ::-webkit-scrollbar-track {
    background: transparent;
  }

  .realtime-output-viewer ::-webkit-scrollbar-thumb {
    background: rgba(156, 163, 175, 0.5);
    border-radius: 4px;
  }

  .realtime-output-viewer ::-webkit-scrollbar-thumb:hover {
    background: rgba(156, 163, 175, 0.7);
  }

  /* Dark mode scrollbar */
  .dark .realtime-output-viewer ::-webkit-scrollbar-thumb {
    background: rgba(75, 85, 99, 0.5);
  }

  .dark .realtime-output-viewer ::-webkit-scrollbar-thumb:hover {
    background: rgba(75, 85, 99, 0.7);
  }
</style>
