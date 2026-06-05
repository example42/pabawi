<script lang="ts">
  import { get, post } from '../lib/api';
  import { showError, showInfo, showSuccess } from '../lib/toast.svelte';
  import ErrorAlert from './ErrorAlert.svelte';
  import StatusBadge from './StatusBadge.svelte';
  import CommandOutput from './CommandOutput.svelte';
  import RealtimeOutputViewer from './RealtimeOutputViewer.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';
  import ExecutePlaybookForm from './ExecutePlaybookForm.svelte';
  import { expertMode } from '../lib/expertMode.svelte';
  import { useExecutionStream, type ExecutionStream } from '../lib/executionStream.svelte';

  interface Props {
    nodeId: string;
    onExecutionComplete?: () => void;
  }

  interface IntegrationStatus {
    name: string;
    status: 'connected' | 'degraded' | 'not_configured' | 'error' | 'disconnected';
  }

  interface ExecutionResult {
    id: string;
    type: 'command' | 'task' | 'facts' | 'puppet' | 'package';
    targetNodes: string[];
    action: string;
    status: 'running' | 'success' | 'failed' | 'partial';
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
  }

  interface PlaybookSubmitData {
    playbookPath: string;
    extraVars?: Record<string, unknown>;
  }

  let { nodeId, onExecutionComplete }: Props = $props();

  let expanded = $state(false);
  let executing = $state(false);
  let error = $state<string | null>(null);
  let result = $state<ExecutionResult | null>(null);
  let currentExecutionId = $state<string>('');
  let executionStream = $state<ExecutionStream | null>(null);
  let ansibleAvailable = $state(false);
  let statusChecked = $state(false);

  async function checkAnsibleStatus(): Promise<void> {
    try {
      const data = await get<{ integrations: IntegrationStatus[] }>('/api/integrations/status', {
        maxRetries: 1,
      });

      const ansible = data.integrations.find((integration) => integration.name === 'ansible');
      ansibleAvailable = ansible?.status === 'connected' || ansible?.status === 'degraded';
    } catch {
      ansibleAvailable = false;
    } finally {
      statusChecked = true;
    }
  }

  async function handlePlaybookSubmit(data: PlaybookSubmitData): Promise<void> {
    executing = true;
    error = null;
    result = null;
    currentExecutionId = '';
    executionStream = null;

    try {
      showInfo('Executing playbook...');

      const responseData = await post<{ executionId: string }>(
        `/api/nodes/${nodeId}/playbook`,
        {
          playbookPath: data.playbookPath,
          extraVars: data.extraVars,
          expertMode: expertMode.enabled,
          tool: 'ansible',
        },
        { maxRetries: 0 },
      );

      const executionId = responseData.executionId;
      currentExecutionId = executionId;

      if (expertMode.enabled) {
        executionStream = useExecutionStream(executionId, {
          onComplete: () => {
            pollExecutionResult(executionId);
            showSuccess('Playbook execution completed');
            if (onExecutionComplete) {
              onExecutionComplete();
            }
          },
          onError: (message) => {
            error = message;
            showError('Playbook execution failed', message);
          },
        });
        executionStream.connect();
      } else {
        await pollExecutionResult(executionId);
        showSuccess('Playbook execution completed');
        if (onExecutionComplete) {
          onExecutionComplete();
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'An unknown error occurred';
      showError('Playbook execution failed', error);
    } finally {
      executing = false;
    }
  }

  async function pollExecutionResult(executionId: string): Promise<void> {
    const maxAttempts = 120;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`/api/executions/${executionId}`);
        if (response.ok) {
          const data = await response.json() as { execution: ExecutionResult };
          if (data.execution.status !== 'running') {
            result = data.execution;
            return;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
        attempts++;
      } catch {
        break;
      }
    }

    error = 'Execution timed out';
  }

  $effect(() => {
    if (expanded && !statusChecked) {
      checkAnsibleStatus();
    }
  });
</script>

<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
  <button
    type="button"
    class="flex w-full items-center justify-between text-left"
    onclick={() => (expanded = !expanded)}
  >
    <h2 class="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-3">
      <svg class="h-6 w-6 text-gray-700 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      Execute Playbook
      <IntegrationBadge integration="ansible" variant="badge" size="sm" />
    </h2>
    <svg
      class="h-5 w-5 transform text-gray-500 transition-transform dark:text-gray-400"
      class:rotate-180={expanded}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {#if expanded}
    <div class="mt-4 space-y-4">
      {#if statusChecked && !ansibleAvailable}
        <ErrorAlert message="Ansible integration is not available" details="Enable and configure the Ansible integration to run playbooks." />
      {:else}
        <ExecutePlaybookForm
          executing={executing}
          error={error}
          onSubmit={handlePlaybookSubmit}
        />
      {/if}

      {#if executionStream && currentExecutionId && expertMode.enabled && (executionStream.executionStatus === 'running' || executionStream.isConnecting)}
        <div>
          <h3 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Real-time Output:</h3>
          <RealtimeOutputViewer stream={executionStream} executionId={currentExecutionId} autoConnect={false} />
        </div>
      {:else if result}
        <div class="space-y-3">
          <StatusBadge status={result.status} />
          {#if result.results.length > 0}
            {#each result.results as nodeResult}
              {#if nodeResult.error}
                <ErrorAlert message="Execution error" details={nodeResult.error} />
              {/if}
              {#if nodeResult.output}
                <CommandOutput
                  stdout={nodeResult.output.stdout}
                  stderr={nodeResult.output.stderr}
                  exitCode={nodeResult.output.exitCode}
                  boltCommand={result.command}
                />
              {/if}
            {/each}
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
