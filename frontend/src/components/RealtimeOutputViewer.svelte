<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { expertMode } from '../lib/expertMode.svelte';
  import type { ExecutionStream } from '../lib/executionStream.svelte';
  import StatusBadge from './StatusBadge.svelte';

  interface Props {
    stream: ExecutionStream;
    autoConnect?: boolean;
    executionId: string;
    enablePollingFallback?: boolean;
  }

  let { stream, autoConnect = true, executionId, enablePollingFallback = true }: Props = $props();

  // Auto-scroll state
  let autoScroll = $state(true);
  let stdoutContainer = $state<HTMLElement | null>(null);
  let stderrContainer = $state<HTMLElement | null>(null);

  // Elapsed time tracking
  let startTime = $state<number | null>(null);
  let elapsedTime = $state(0);
  let elapsedInterval: ReturnType<typeof setInterval> | null = null;

  // Polling fallback state
  let pollingInterval: ReturnType<typeof setInterval> | null = null;
  let isPolling = $state(false);
  let pollingError = $state<string | null>(null);
  let polledData = $state<{
    stdout: string;
    stderr: string;
    status: string | null;
    command: string | null;
  }>({
    stdout: '',
    stderr: '',
    status: null,
    command: null,
  });

  // Derived state - use polled data when polling, otherwise use stream data
  const effectiveStdout = $derived(isPolling ? polledData.stdout : stream.stdout);
  const effectiveStderr = $derived(isPolling ? polledData.stderr : stream.stderr);
  const effectiveStatus = $derived(isPolling ? polledData.status : stream.executionStatus);
  const effectiveCommand = $derived(isPolling ? polledData.command : stream.command);

  const hasStdout = $derived(effectiveStdout.length > 0);
  const hasStderr = $derived(effectiveStderr.length > 0);
  const hasOutput = $derived(hasStdout || hasStderr);
  const isRunning = $derived(effectiveStatus === 'running' || stream.isConnecting || isPolling);
  const isComplete = $derived(effectiveStatus === 'success' || effectiveStatus === 'failed');

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
      effectiveCommand ? `Command: ${effectiveCommand}\n` : '',
      effectiveStdout ? `STDOUT:\n${effectiveStdout}\n` : '',
      effectiveStderr ? `STDERR:\n${effectiveStderr}\n` : '',
    ].filter(Boolean).join('\n');

    await copyToClipboard(output);
  }

  // Polling fallback for when streaming is unavailable
  async function pollExecutionStatus(): Promise<void> {
    try {
      const response = await fetch(`/api/executions/${executionId}`);

      if (!response.ok) {
        throw new Error(`Failed to fetch execution status: ${response.statusText}`);
      }

      const execution = await response.json();

      // Update polled data state
      if (execution.results && execution.results.length > 0) {
        const result = execution.results[0];

        polledData.stdout = result.output?.stdout || '';
        polledData.stderr = result.output?.stderr || '';
      }

      // Update execution status
      polledData.status = execution.status || null;

      // Extract command if available (from expert mode)
      if (execution.boltCommand) {
        polledData.command = execution.boltCommand;
      }

      // Stop polling if execution is complete
      if (execution.status === 'success' || execution.status === 'failed') {
        stopPolling();
      }

      pollingError = null;
    } catch (error) {
      console.error('Polling error:', error);
      pollingError = error instanceof Error ? error.message : 'Failed to poll execution status';
    }
  }

  // Start polling fallback
  function startPolling(): void {
    if (pollingInterval || !enablePollingFallback) {
      return;
    }

    isPolling = true;
    pollingError = null;

    // Poll immediately
    pollExecutionStatus();

    // Then poll every 2 seconds
    pollingInterval = setInterval(() => {
      pollExecutionStatus();
    }, 2000);
  }

  // Stop polling fallback
  function stopPolling(): void {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
    isPolling = false;
  }

  // Switch to polling fallback when streaming fails
  function switchToPollingFallback(): void {
    if (!enablePollingFallback || isPolling) {
      return;
    }

    console.log('Switching to polling fallback for execution:', executionId);
    startPolling();
  }

  // Watch for output changes and auto-scroll
  $effect(() => {
    // Trigger on stdout changes
    if (effectiveStdout) {
      scrollToBottom(stdoutContainer);
    }
  });

  $effect(() => {
    // Trigger on stderr changes
    if (effectiveStderr) {
      scrollToBottom(stderrContainer);
    }
  });

  // Watch for execution status changes
  $effect(() => {
    if (effectiveStatus === 'running' && !startTime) {
      startElapsedTimer();
    } else if (isComplete && elapsedInterval) {
      stopElapsedTimer();
    }
  });

  // Watch for streaming errors and switch to polling fallback
  $effect(() => {
    if (stream.status === 'error' && enablePollingFallback && !isPolling) {
      // Wait a moment before switching to polling to allow for reconnection attempts
      const timeout = setTimeout(() => {
        if (stream.status === 'error') {
          switchToPollingFallback();
        }
      }, 3000); // Wait 3 seconds before falling back to polling

      return () => clearTimeout(timeout);
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
    stopPolling();
    stream.disconnect();
  });
</script>

<div class="realtime-output-viewer space-y-4">
  <!-- Header with status and controls -->
  <div class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800">
    <div class="flex items-center gap-3">
      {#if effectiveStatus}
        <StatusBadge status={statusBadgeMap[effectiveStatus] || 'running'} />
      {:else if stream.isConnecting || isPolling}
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

      <!-- Connection Status Indicator -->
      {#if isPolling}
        <div class="flex items-center gap-1.5 text-sm text-orange-600 dark:text-orange-400" title="Using polling fallback">
          <span class="relative flex h-2 w-2">
            <span class="relative inline-flex h-2 w-2 animate-pulse rounded-full bg-orange-500"></span>
          </span>
          <span>Polling</span>
        </div>
      {:else if stream.status === 'connected'}
        <div class="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400" title="Connected to stream">
          <span class="relative flex h-2 w-2">
            <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
            <span class="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
          </span>
          <span>Live</span>
        </div>
      {:else if stream.status === 'connecting'}
        <div class="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400" title="Connecting to stream">
          <span class="relative flex h-2 w-2">
            <span class="relative inline-flex h-2 w-2 animate-pulse rounded-full bg-blue-500"></span>
          </span>
          <span>Connecting...</span>
        </div>
      {:else if stream.status === 'reconnecting'}
        <div class="flex items-center gap-1.5 text-sm text-yellow-600 dark:text-yellow-400" title="Reconnecting to stream">
          <span class="relative flex h-2 w-2">
            <span class="relative inline-flex h-2 w-2 animate-pulse rounded-full bg-yellow-500"></span>
          </span>
          <span>Reconnecting...</span>
        </div>
      {:else if stream.status === 'error'}
        <div class="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400" title="Connection error">
          <span class="relative flex h-2 w-2">
            <span class="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
          </span>
          <span>Disconnected</span>
        </div>
      {:else if stream.status === 'disconnected' && !isComplete}
        <div class="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400" title="Not connected">
          <span class="relative flex h-2 w-2">
            <span class="relative inline-flex h-2 w-2 rounded-full bg-gray-400"></span>
          </span>
          <span>Offline</span>
        </div>
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
  {#if expertMode.enabled && effectiveCommand}
    <div>
      <h4 class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Bolt Command:</h4>
      <div class="relative rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
        <pre class="overflow-x-auto pr-10 font-mono text-sm text-blue-900 dark:text-blue-100">{effectiveCommand}</pre>
        <button
          type="button"
          class="absolute right-2 top-2 rounded p-1.5 text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-blue-800"
          onclick={() => copyToClipboard(effectiveCommand || '')}
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
          onclick={() => copyToClipboard(effectiveStdout)}
          title="Copy stdout"
        >
          Copy
        </button>
      </div>
      <div
        bind:this={stdoutContainer}
        class="max-h-96 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900"
      >
        <pre class="font-mono text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">{effectiveStdout}</pre>
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
          onclick={() => copyToClipboard(effectiveStderr)}
          title="Copy stderr"
        >
          Copy
        </button>
      </div>
      <div
        bind:this={stderrContainer}
        class="max-h-96 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20"
      >
        <pre class="font-mono text-sm text-red-900 dark:text-red-100 whitespace-pre-wrap break-words">{effectiveStderr}</pre>
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
          <h4 class="text-sm font-semibold text-red-800 dark:text-red-300">Streaming Error</h4>
          <p class="mt-1 text-sm text-red-700 dark:text-red-400">{stream.error}</p>
          {#if stream.status === 'error'}
            <div class="mt-3 flex gap-2">
              <button
                type="button"
                class="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
                onclick={() => stream.reconnect()}
              >
                Retry Connection
              </button>
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Polling Fallback Notification -->
  {#if isPolling}
    <div class="rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
      <div class="flex items-start gap-3">
        <svg class="h-5 w-5 flex-shrink-0 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div class="flex-1">
          <h4 class="text-sm font-semibold text-orange-800 dark:text-orange-300">Using Polling Mode</h4>
          <p class="mt-1 text-sm text-orange-700 dark:text-orange-400">
            Real-time streaming is unavailable. Execution status is being updated every 2 seconds via polling.
          </p>
          {#if pollingError}
            <p class="mt-2 text-xs text-orange-600 dark:text-orange-500">
              Polling error: {pollingError}
            </p>
          {/if}
          <div class="mt-3 flex gap-2">
            <button
              type="button"
              class="rounded bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 dark:bg-orange-700 dark:hover:bg-orange-600"
              onclick={() => {
                stopPolling();
                stream.reconnect();
              }}
            >
              Try Streaming Again
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Connection Status Messages -->
  {#if stream.status === 'connecting'}
    <div class="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center dark:border-blue-800 dark:bg-blue-900/20">
      <div class="flex items-center justify-center gap-2">
        <svg class="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="text-sm text-blue-700 dark:text-blue-300">Connecting to execution stream...</p>
      </div>
    </div>
  {:else if stream.status === 'reconnecting'}
    <div class="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-center dark:border-yellow-800 dark:bg-yellow-900/20">
      <div class="flex items-center justify-center gap-2">
        <svg class="h-5 w-5 animate-spin text-yellow-600 dark:text-yellow-400" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p class="text-sm text-yellow-700 dark:text-yellow-300">Reconnecting to execution stream...</p>
      </div>
      <p class="mt-2 text-xs text-yellow-600 dark:text-yellow-400">Connection was lost. Attempting to reconnect...</p>
    </div>
  {:else if stream.status === 'error' && !stream.error && !isPolling}
    <div class="rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
      <div class="flex items-start gap-3">
        <svg class="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div class="flex-1">
          <h4 class="text-sm font-semibold text-red-800 dark:text-red-300">Connection Failed</h4>
          <p class="mt-1 text-sm text-red-700 dark:text-red-400">
            Unable to establish a connection to the execution stream. This may be due to network issues or the server being unavailable.
          </p>
          {#if enablePollingFallback}
            <p class="mt-2 text-xs text-red-600 dark:text-red-500">
              Switching to polling mode in a moment...
            </p>
          {/if}
          <div class="mt-3 flex gap-2">
            <button
              type="button"
              class="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
              onclick={() => stream.reconnect()}
            >
              Retry Connection
            </button>
            {#if enablePollingFallback && !isPolling}
              <button
                type="button"
                class="rounded border border-red-600 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-100 dark:border-red-500 dark:text-red-400 dark:hover:bg-red-900/30"
                onclick={switchToPollingFallback}
              >
                Use Polling Now
              </button>
            {/if}
          </div>
        </div>
      </div>
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
  :global(.dark) .realtime-output-viewer ::-webkit-scrollbar-thumb {
    background: rgba(75, 85, 99, 0.5);
  }

  :global(.dark) .realtime-output-viewer ::-webkit-scrollbar-thumb:hover {
    background: rgba(75, 85, 99, 0.7);
  }
</style>
