<script lang="ts">
  import { useExecutionStream } from '../lib/executionStream.svelte';
  import RealtimeOutputViewer from './RealtimeOutputViewer.svelte';

  // Example execution ID (would come from API response)
  const executionId = 'exec-123456';

  // Create execution stream
  const stream = useExecutionStream(executionId, {
    maxReconnectAttempts: 3,
    reconnectDelay: 1000,
    autoReconnect: true,
    onStatusChange: (status) => {
      console.log('Connection status changed:', status);
    },
    onComplete: (result) => {
      console.log('Execution completed:', result);
    },
    onError: (error) => {
      console.error('Execution error:', error);
    },
  });
</script>

<div class="p-4">
  <h1 class="mb-4 text-2xl font-bold">Realtime Output Viewer Example</h1>

  <p class="mb-4 text-gray-600">
    This example demonstrates the RealtimeOutputViewer component with error handling and polling fallback.
  </p>

  <div class="space-y-4">
    <div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 class="mb-2 text-lg font-semibold">Features:</h2>
      <ul class="list-inside list-disc space-y-1 text-sm text-gray-700">
        <li>Real-time streaming via Server-Sent Events (SSE)</li>
        <li>Connection status indicator (connected, connecting, reconnecting, error)</li>
        <li>Automatic reconnection on connection loss (up to 3 attempts)</li>
        <li>Automatic fallback to polling when streaming is unavailable</li>
        <li>Manual retry button for failed connections</li>
        <li>Switch between streaming and polling modes</li>
        <li>Auto-scroll with pause/resume control</li>
        <li>Copy to clipboard functionality</li>
        <li>Expert mode support for Bolt command display</li>
      </ul>
    </div>

    <!-- The RealtimeOutputViewer component -->
    <RealtimeOutputViewer
      {stream}
      {executionId}
      autoConnect={true}
      enablePollingFallback={true}
    />

    <!-- Manual controls for testing -->
    <div class="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h3 class="mb-2 font-semibold">Manual Controls (for testing):</h3>
      <div class="flex gap-2">
        <button
          type="button"
          class="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          onclick={() => stream.connect()}
        >
          Connect
        </button>
        <button
          type="button"
          class="rounded bg-gray-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
          onclick={() => stream.disconnect()}
        >
          Disconnect
        </button>
        <button
          type="button"
          class="rounded bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
          onclick={() => stream.reconnect()}
        >
          Reconnect
        </button>
        <button
          type="button"
          class="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          onclick={() => stream.reset()}
        >
          Reset
        </button>
      </div>
    </div>
  </div>
</div>
