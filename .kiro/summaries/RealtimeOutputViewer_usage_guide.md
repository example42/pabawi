# RealtimeOutputViewer Component Usage Guide

## Overview

The RealtimeOutputViewer component displays streaming execution output in real-time with support for expert mode, auto-scrolling, and comprehensive status tracking.

## Basic Usage

```svelte
<script lang="ts">
  import { useExecutionStream } from '$lib/executionStream.svelte';
  import RealtimeOutputViewer from '$components/RealtimeOutputViewer.svelte';

  const executionId = 'your-execution-id';
  const stream = useExecutionStream(executionId);
</script>

<RealtimeOutputViewer {stream} />
```

## Props

- `stream: ExecutionStream` (required) - The execution stream object from useExecutionStream
- `autoConnect?: boolean` (optional, default: true) - Whether to auto-connect on mount

## Features

### 1. Bolt Command Display (Expert Mode)

When expert mode is enabled, the full Bolt command is displayed at the top with a copy button.

### 2. Auto-scroll

Output automatically scrolls to the bottom as new content arrives. Users can pause auto-scrolling with the toggle button.

### 3. Execution Status

Shows current execution status with color-coded badges:

- Running (blue)
- Success (green)
- Failed (red)

### 4. Elapsed Time

Displays real-time elapsed time during execution and final duration on completion.

### 5. Separate Output Sections

- stdout: Gray background
- stderr: Red background
Each section has its own copy button.

### 6. Copy to Clipboard

- Individual copy buttons for command, stdout, stderr
- "Copy all output" button for complete output

### 7. Connection Status

Shows connection state: connecting, connected, reconnecting, error

## Advanced Usage

### With Custom Options

```svelte
<script lang="ts">
  const stream = useExecutionStream(executionId, {
    maxReconnectAttempts: 5,
    reconnectDelay: 2000,
    autoReconnect: true,
    onComplete: (result) => {
      console.log('Execution completed:', result);
    },
    onError: (error) => {
      console.error('Execution error:', error);
    },
  });
</script>

<RealtimeOutputViewer {stream} autoConnect={false} />
```

### Manual Connection Control

```svelte
<script lang="ts">
  const stream = useExecutionStream(executionId);
  
  function handleConnect() {
    stream.connect();
  }
  
  function handleDisconnect() {
    stream.disconnect();
  }
</script>

<RealtimeOutputViewer {stream} autoConnect={false} />

<button onclick={handleConnect}>Connect</button>
<button onclick={handleDisconnect}>Disconnect</button>
```

## Integration Example (Node Detail Page)

```svelte
<script lang="ts">
  import { useExecutionStream } from '$lib/executionStream.svelte';
  import RealtimeOutputViewer from '$components/RealtimeOutputViewer.svelte';
  import CommandOutput from '$components/CommandOutput.svelte';
  import { expertMode } from '$lib/expertMode.svelte';

  let executionId: string | null = null;
  let stream: ReturnType<typeof useExecutionStream> | null = null;
  let staticResult: any = null;

  async function executeCommand(command: string) {
    const response = await fetch(`/api/nodes/${nodeId}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });

    const result = await response.json();
    executionId = result.executionId;

    if (expertMode.enabled) {
      stream = useExecutionStream(executionId, {
        onComplete: (result) => {
          staticResult = result;
        },
      });
    } else {
      staticResult = result;
    }
  }
</script>

{#if expertMode.enabled && stream}
  <RealtimeOutputViewer {stream} />
{:else if staticResult}
  <CommandOutput {...staticResult} />
{/if}
```

## Styling

The component uses Tailwind CSS and includes:

- Dark mode support
- Custom scrollbar styling
- Responsive design
- Accessible color contrast

## Requirements Satisfied

- 3.1: Expert mode detailed error output
- 3.4: Expandable error details  
- 11.4: Web interface responsiveness
