<!--
  Bolt Command Executor Widget

  A reusable widget for executing shell commands on target nodes via Bolt.
  Can be rendered in dashboard, node-detail, or standalone-page slots.

  Features:
  - Target node selector (single or multiple)
  - Command input with history
  - Real-time streaming output
  - Execution history
  - Command whitelist validation

  @module plugins/native/bolt/frontend/CommandExecutor
  @version 1.0.0
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../../../../frontend/src/components/LoadingSpinner.svelte';
  import ErrorAlert from '../../../../frontend/src/components/ErrorAlert.svelte';
  import RealtimeOutputViewer from '../../../../frontend/src/components/RealtimeOutputViewer.svelte';
  import StatusBadge from '../../../../frontend/src/components/StatusBadge.svelte';
  import { get, post } from '../../../../frontend/src/lib/api';
  import { showError, showSuccess } from '../../../../frontend/src/lib/toast.svelte';
  import { debugMode } from '../../../../frontend/src/lib/debug';
  import { useExecutionStream, type ExecutionStream } from '../../../../frontend/src/lib/executionStream.svelte';

  // ==========================================================================
  // Types
  // ==========================================================================

  interface Node {
    id: string;
    name: string;
    uri?: string;
    transport?: string;
    source?: string;
  }

  interface ExecutionResult {
    id: string;
    type: 'command';
    targetNodes: string[];
    action: string;
    status: 'running' | 'success' | 'failed' | 'partial';
    startedAt: string;
    completedAt?: string;
    results: NodeResult[];
    error?: string;
    command?: string;
  }

  interface NodeResult {
    nodeId: string;
    status: 'success' | 'failed';
    output?: {
      stdout?: string;
      stderr?: string;
      exitCode?: number;
    };
    error?: string;
    duration: number;
  }

  interface CommandHistory {
    command: string;
    timestamp: string;
    status: 'success' | 'failed';
  }

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Pre-selected target node(s) */
    targetNodes?: string | string[];
    /** Show target selector */
    showTargetSelector?: boolean;
    /** Show output panel */
    showOutputPanel?: boolean;
    /** Compact mode for smaller spaces */
    compact?: boolean;
    /** Widget configuration from plugin */
    config?: Record<string, unknown>;
    /** Callback when execution completes */
    onExecutionComplete?: (result: ExecutionResult) => void;
  }

  let {
    targetNodes = [],
    showTargetSelector = true,
    showOutputPanel = true,
    compact = false,
    config = {},
    onExecutionComplete,
  }: Props = $props();

  // ==========================================================================
  // Helpers
  // ==========================================================================

  function normalizeTargets(targets: string | string[] | undefined): string[] {
    if (!targets) return [];
    return Array.isArray(targets) ? targets : [targets];
  }

  // ==========================================================================
  // State
  // ==========================================================================

  const initialTargets = normalizeTargets(targetNodes);
  let command = $state('');
  let selectedTargets = $state<string[]>(initialTargets);
  let nodes = $state<Node[]>([]);
  let nodesLoading = $state(false);
  let nodesError = $state<string | null>(null);

  let executing = $state(false);
  let executionError = $state<string | null>(null);
  let executionResult = $state<ExecutionResult | null>(null);
  let executionStream = $state<ExecutionStream | null>(null);

  let commandHistory = $state<CommandHistory[]>([]);
  let showHistory = $state(false);
  let commandWhitelist = $state<{ allowAll: boolean; whitelist: string[] } | null>(null);

  // ==========================================================================
  // Derived
  // ==========================================================================

  let canExecute = $derived(command.trim().length > 0 && selectedTargets.length > 0 && !executing);
  let isStreaming = $derived(executionStream?.status === 'streaming');
  let hasOutput = $derived(executionResult?.results && executionResult.results.length > 0);

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    if (showTargetSelector) {
      void fetchNodes();
    }
    void fetchCommandWhitelist();
    loadCommandHistory();
  });

  // ==========================================================================
  // Data Fetching
  // ==========================================================================

  async function fetchNodes(): Promise<void> {
    nodesLoading = true;
    nodesError = null;
    try {
      const response = await get<{ nodes: Node[] }>('/api/inventory');
      nodes = response.nodes || [];
    } catch (err) {
      nodesError = err instanceof Error ? err.message : 'Failed to load nodes';
    } finally {
      nodesLoading = false;
    }
  }

  async function fetchCommandWhitelist(): Promise<void> {
    try {
      const response = await get<{ allowAll: boolean; whitelist: string[] }>('/api/commands/whitelist');
      commandWhitelist = response;
    } catch {
      // Non-critical, continue without whitelist info
    }
  }

  function loadCommandHistory(): void {
    try {
      const stored = localStorage.getItem('bolt:commandHistory');
      if (stored) {
        commandHistory = JSON.parse(stored);
      }
    } catch {
      commandHistory = [];
    }
  }

  function saveCommandHistory(): void {
    try {
      // Keep last 20 commands
      const history = commandHistory.slice(0, 20);
      localStorage.setItem('bolt:commandHistory', JSON.stringify(history));
    } catch {
      // Ignore storage errors
    }
  }

  // ==========================================================================
  // Command Execution
  // ==========================================================================

  async function executeCommand(): Promise<void> {
    if (!canExecute) return;

    executing = true;
    executionError = null;
    executionResult = null;

    try {
      // Determine targets string
      const targetsParam = selectedTargets.length === 1
        ? selectedTargets[0]
        : selectedTargets.join(',');

      const response = await post<ExecutionResult>('/api/commands', {
        command: command.trim(),
        targets: targetsParam,
        expertMode: debugMode.enabled,
      });

      // Start streaming if we have an execution ID
      if (response.id) {
        executionStream = useExecutionStream(response.id);
      }

      executionResult = response;

      // Add to history
      commandHistory = [
        { command: command.trim(), timestamp: new Date().toISOString(), status: response.status === 'failed' ? 'failed' : 'success' },
        ...commandHistory.filter(h => h.command !== command.trim()),
      ];
      saveCommandHistory();

      if (response.status === 'success') {
        showSuccess('Command executed successfully');
      } else if (response.status === 'failed') {
        showError('Command execution failed');
      }

      onExecutionComplete?.(response);
    } catch (err) {
      executionError = err instanceof Error ? err.message : 'Command execution failed';
      showError(executionError);
    } finally {
      executing = false;
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      void executeCommand();
    }
  }

  function selectHistoryCommand(cmd: string): void {
    command = cmd;
    showHistory = false;
  }

  function toggleTarget(nodeId: string): void {
    if (selectedTargets.includes(nodeId)) {
      selectedTargets = selectedTargets.filter(id => id !== nodeId);
    } else {
      selectedTargets = [...selectedTargets, nodeId];
    }
  }

  function selectAllTargets(): void {
    selectedTargets = nodes.map(n => n.name);
  }

  function clearTargets(): void {
    selectedTargets = [];
  }

  // ==========================================================================
  // Formatting
  // ==========================================================================

  function getStatusColor(status: string): string {
    switch (status) {
      case 'success': return 'text-green-600 dark:text-green-400';
      case 'failed': return 'text-red-600 dark:text-red-400';
      case 'running': return 'text-blue-600 dark:text-blue-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  }
</script>

<div class="bolt-command-executor {compact ? 'space-y-3' : 'space-y-4'}">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      <h3 class="{compact ? 'text-sm' : 'text-base'} font-medium text-gray-900 dark:text-white">
        Command Executor
      </h3>
    </div>
    {#if commandWhitelist && !commandWhitelist.allowAll}
      <span class="text-xs text-amber-600 dark:text-amber-400" title="Only whitelisted commands allowed">
        Restricted
      </span>
    {/if}
  </div>

  <!-- Target Selector -->
  {#if showTargetSelector}
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <label for="target-nodes-section" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Target Nodes ({selectedTargets.length} selected)
        </label>
        <div class="flex gap-2">
          <button
            type="button"
            onclick={selectAllTargets}
            class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Select All
          </button>
          <button
            type="button"
            onclick={clearTargets}
            class="text-xs text-gray-500 dark:text-gray-400 hover:underline"
          >
            Clear
          </button>
        </div>
      </div>

      {#if nodesLoading}
        <div class="flex items-center gap-2 text-sm text-gray-500">
          <LoadingSpinner size="sm" />
          Loading nodes...
        </div>
      {:else if nodesError}
        <ErrorAlert message={nodesError} variant="inline" />
      {:else}
        <div id="target-nodes-section" class="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          {#each nodes as node (node.id)}
            <button
              type="button"
              onclick={() => toggleTarget(node.name)}
              class="px-2 py-1 text-xs rounded-full transition-colors {
                selectedTargets.includes(node.name)
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:border-amber-300 dark:hover:border-amber-700'
              }"
            >
              {node.name}
            </button>
          {:else}
            <span class="text-sm text-gray-500 dark:text-gray-400">No nodes available</span>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Command Input -->
  <div class="space-y-2">
    <label for="command-input" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
      Command
    </label>
    <div class="relative">
      <input
        id="command-input"
        type="text"
        bind:value={command}
        onkeydown={handleKeyDown}
        placeholder="Enter shell command (Ctrl/Cmd+Enter to execute)"
        disabled={executing}
        class="w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:opacity-50 font-mono text-sm"
      />
      {#if commandHistory.length > 0}
        <button
          type="button"
          onclick={() => showHistory = !showHistory}
          class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          title="Command history"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      {/if}

      <!-- History Dropdown -->
      {#if showHistory && commandHistory.length > 0}
        <div class="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {#each commandHistory as item (item.timestamp)}
            <button
              type="button"
              onclick={() => selectHistoryCommand(item.command)}
              class="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between border-b border-gray-100 dark:border-gray-700 last:border-b-0"
            >
              <code class="font-mono text-gray-700 dark:text-gray-300 truncate flex-1">{item.command}</code>
              <span class="ml-2 {getStatusColor(item.status)}">●</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Execute Button -->
  <button
    type="button"
    onclick={executeCommand}
    disabled={!canExecute}
    class="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
  >
    {#if executing}
      <LoadingSpinner size="sm" />
      Executing...
    {:else}
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      Execute Command
    {/if}
  </button>

  <!-- Execution Error -->
  {#if executionError}
    <ErrorAlert message={executionError} variant="inline" />
  {/if}

  <!-- Output Panel -->
  {#if showOutputPanel && (isStreaming || hasOutput)}
    <div class="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
      <div class="flex items-center justify-between mb-2">
        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300">Output</h4>
        {#if executionResult}
          <StatusBadge status={executionResult.status} size="sm" />
        {/if}
      </div>

      {#if executionStream && isStreaming}
        <RealtimeOutputViewer
          executionId={executionResult?.id || ''}
          initialStdout={executionStream.stdout}
          initialStderr={executionStream.stderr}
          status={executionResult?.status || 'running'}
        />
      {:else if executionResult?.results}
        <div class="space-y-2">
          {#each executionResult.results as result (result.nodeId)}
            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{result.nodeId}</span>
                <span class="{getStatusColor(result.status)} text-xs">
                  {result.status} ({result.duration}ms)
                </span>
              </div>
              {#if result.output?.stdout}
                <pre class="text-xs font-mono text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 p-2 rounded overflow-x-auto max-h-32">{result.output.stdout}</pre>
              {/if}
              {#if result.output?.stderr}
                <pre class="text-xs font-mono text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded mt-2 overflow-x-auto max-h-32">{result.output.stderr}</pre>
              {/if}
              {#if result.error}
                <div class="text-xs text-red-600 dark:text-red-400 mt-2">{result.error}</div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
