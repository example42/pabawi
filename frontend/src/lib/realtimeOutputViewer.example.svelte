<script lang="ts">
  /**
   * Example usage of RealtimeOutputViewer component
   *
   * This example demonstrates how to use the RealtimeOutputViewer component
   * to display streaming execution output in real-time.
   */

  import { useExecutionStream } from './executionStream.svelte';
  import RealtimeOutputViewer from '../components/RealtimeOutputViewer.svelte';

  // Example 1: Basic usage with auto-connect
  const executionId = 'example-execution-id';
  const stream = useExecutionStream(executionId, {
    onComplete: (result) => {
      console.log('Execution completed:', result);
    },
    onError: (error) => {
      console.error('Execution error:', error);
    },
  });
</script>

<div class="p-4">
  <h1 class="mb-4 text-2xl font-bold">RealtimeOutputViewer Example</h1>

  <!-- Basic usage - auto-connects on mount -->
  <RealtimeOutputViewer {stream} />

  <!-- Manual connection control -->
  <div class="mt-4 flex gap-2">
    <button
      class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
      onclick={() => stream.connect()}
      disabled={stream.isConnected}
    >
      Connect
    </button>
    <button
      class="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
      onclick={() => stream.disconnect()}
      disabled={!stream.isConnected}
    >
      Disconnect
    </button>
    <button
      class="rounded bg-gray-600 px-4 py-2 text-white hover:bg-gray-700"
      onclick={() => stream.clearOutput()}
    >
      Clear Output
    </button>
  </div>
</div>

<!--
Example 2: With custom options and manual connection

<script lang="ts">
  const stream2 = useExecutionStream('another-execution-id', {
    maxReconnectAttempts: 5,
    reconnectDelay: 2000,
    autoReconnect: true,
    onStatusChange: (status) => {
      console.log('Connection status changed:', status);
    },
    onEvent: (event) => {
      console.log('Received event:', event);
    },
  });
</script>

<RealtimeOutputViewer stream={stream2} autoConnect={false} />

Example 3: Integration in Node Detail Page

<script lang="ts">
  import { useExecutionStream } from '$lib/executionStream.svelte';
  import RealtimeOutputViewer from '$components/RealtimeOutputViewer.svelte';
  import { expertMode } from '$lib/expertMode.svelte';

  let executionId: string | null = null;
  let stream: ReturnType<typeof useExecutionStream> | null = null;

  async function executeCommand(nodeId: string, command: string) {
    // Execute command via API
    const response = await fetch(`/api/nodes/${nodeId}/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(expertMode.enabled && { 'X-Expert-Mode': 'true' }),
      },
      body: JSON.stringify({ command }),
    });

    const result = await response.json();
    executionId = result.executionId;

    // Create stream for this execution
    stream = useExecutionStream(executionId, {
      onComplete: (result) => {
        console.log('Command completed:', result);
      },
    });
  }
</script>

{#if stream && executionId}
  <RealtimeOutputViewer {stream} />
{/if}
-->
