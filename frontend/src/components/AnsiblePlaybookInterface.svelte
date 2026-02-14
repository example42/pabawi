<script lang="ts">
  import { get, post } from '../lib/api';
  import { showError, showInfo, showSuccess } from '../lib/toast.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';
  import StatusBadge from './StatusBadge.svelte';
  import CommandOutput from './CommandOutput.svelte';
  import RealtimeOutputViewer from './RealtimeOutputViewer.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';
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

  let { nodeId, onExecutionComplete }: Props = $props();

  let expanded = $state(false);
  let playbookPath = $state('');
  let extraVarsJson = $state('');
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

  async function executePlaybook(event: Event): Promise<void> {
    event.preventDefault();

    if (!playbookPath.trim()) {
      showError('Playbook path is required');
      return;
    }

    let extraVars: Record<string, unknown> | undefined;
    if (extraVarsJson.trim()) {
      try {
        const parsed = JSON.parse(extraVarsJson) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          showError('Extra vars must be a JSON object');
          return;
        }
        extraVars = parsed as Record<string, unknown>;
      } catch {
        showError('Extra vars must be valid JSON');
        return;
      }
    }

    executing = true;
    error = null;
    result = null;
    currentExecutionId = '';
    executionStream = null;

    try {
      showInfo('Executing playbook...');

      const data = await post<{ executionId: string }>(
        `/api/nodes/${nodeId}/playbook`,
        {
          playbookPath: playbookPath.trim(),
          extraVars,
          expertMode: expertMode.enabled,
          tool: 'ansible',
        },
        { maxRetries: 0 },
      );

      const executionId = data.executionId;
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
        <form onsubmit={executePlaybook} class="space-y-4">
          <div>
            <label for="playbook-path" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Playbook Path
            </label>
            <input
              id="playbook-path"
              type="text"
              bind:value={playbookPath}
              placeholder="e.g., playbooks/site.yml"
              class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
              disabled={executing}
              required
            />
          </div>

          <div>
            <label for="extra-vars" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Extra Vars (JSON, optional)
            </label>
            <textarea
              id="extra-vars"
              bind:value={extraVarsJson}
              placeholder='&#123;"app_version":"1.2.3"&#125;'
              rows="4"
              class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
              disabled={executing}
            ></textarea>
          </div>

          <button
            type="submit"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={executing || !playbookPath.trim()}
          >
            {executing ? 'Executing...' : 'Execute Playbook'}
          </button>
        </form>
      {/if}

      {#if executing}
        <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <LoadingSpinner size="sm" />
          <span>Executing playbook...</span>
        </div>
      {/if}

      {#if error}
        <ErrorAlert message="Playbook execution failed" details={error} />
      {/if}

      {#if executionStream && expertMode.enabled && (executionStream.executionStatus === 'running' || executionStream.isConnecting)}
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