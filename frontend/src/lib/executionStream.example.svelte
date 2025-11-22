<script lang="ts">
/**
 * Example component demonstrating useExecutionStream usage
 * This file serves as documentation and can be used for testing
 */

import { useExecutionStream } from './executionStream.svelte';
import { onMount, onDestroy } from 'svelte';

interface Props {
  executionId: string;
  autoConnect?: boolean;
}

let { executionId, autoConnect = true }: Props = $props();

// Create execution stream
const stream = useExecutionStream(executionId, {
  maxReconnectAttempts: 3,
  reconnectDelay: 1000,
  autoReconnect: true,
  onStatusChange: (status) => {
    console.log('Connection status changed:', status);
  },
  onEvent: (event) => {
    console.log('Received event:', event.type, event.data);
  },
  onComplete: (result) => {
    console.log('Execution completed:', result);
  },
  onError: (error) => {
    console.error('Execution error:', error);
  },
});

// Auto-connect on mount if enabled
onMount(() => {
  if (autoConnect) {
    stream.connect();
  }
});

// Cleanup on unmount
onDestroy(() => {
  stream.disconnect();
});
</script>

<div class="execution-stream-example">
  <div class="header">
    <h3>Execution Stream: {executionId}</h3>
    <div class="status">
      Status: <span class="status-badge" class:connected={stream.isConnected} class:error={stream.hasError}>
        {stream.status}
      </span>
    </div>
  </div>

  <div class="controls">
    <button onclick={() => stream.connect()} disabled={stream.isConnected}>
      Connect
    </button>
    <button onclick={() => stream.disconnect()} disabled={!stream.isConnected}>
      Disconnect
    </button>
    <button onclick={() => stream.reconnect()}>
      Reconnect
    </button>
    <button onclick={() => stream.clearOutput()}>
      Clear Output
    </button>
    <button onclick={() => stream.reset()}>
      Reset
    </button>
  </div>

  {#if stream.command}
    <div class="command-section">
      <h4>Command</h4>
      <pre><code>{stream.command}</code></pre>
    </div>
  {/if}

  {#if stream.executionStatus}
    <div class="execution-status">
      <strong>Execution Status:</strong> {stream.executionStatus}
    </div>
  {/if}

  <div class="output-section">
    <div class="stdout">
      <h4>Standard Output</h4>
      <pre><code>{stream.stdout || '(no output)'}</code></pre>
    </div>

    {#if stream.stderr}
      <div class="stderr">
        <h4>Standard Error</h4>
        <pre><code>{stream.stderr}</code></pre>
      </div>
    {/if}
  </div>

  {#if stream.error}
    <div class="error-section">
      <h4>Error</h4>
      <p class="error-message">{stream.error}</p>
    </div>
  {/if}

  {#if stream.result}
    <div class="result-section">
      <h4>Result</h4>
      <pre><code>{JSON.stringify(stream.result, null, 2)}</code></pre>
    </div>
  {/if}

  <div class="events-section">
    <h4>Events ({stream.events.length})</h4>
    <div class="events-list">
      {#each stream.events as event}
        <div class="event-item">
          <span class="event-type">{event.type}</span>
          <span class="event-timestamp">{new Date(event.timestamp).toLocaleTimeString()}</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .execution-stream-example {
    padding: 1rem;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    background: white;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .status-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.875rem;
    font-weight: 500;
    background: #f3f4f6;
    color: #6b7280;
  }

  .status-badge.connected {
    background: #d1fae5;
    color: #065f46;
  }

  .status-badge.error {
    background: #fee2e2;
    color: #991b1b;
  }

  .controls {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .controls button {
    padding: 0.5rem 1rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    background: white;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .controls button:hover:not(:disabled) {
    background: #f9fafb;
  }

  .controls button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .command-section,
  .execution-status,
  .output-section,
  .error-section,
  .result-section,
  .events-section {
    margin-bottom: 1rem;
  }

  h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
  }

  pre {
    margin: 0;
    padding: 0.75rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    overflow-x: auto;
    font-size: 0.875rem;
  }

  code {
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  }

  .stderr pre {
    background: #fef2f2;
    border-color: #fecaca;
  }

  .error-message {
    color: #dc2626;
    margin: 0;
    padding: 0.75rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 0.375rem;
  }

  .events-list {
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
  }

  .event-item {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem;
    border-bottom: 1px solid #f3f4f6;
    font-size: 0.875rem;
  }

  .event-item:last-child {
    border-bottom: none;
  }

  .event-type {
    font-weight: 500;
    color: #374151;
  }

  .event-timestamp {
    color: #6b7280;
  }
</style>
