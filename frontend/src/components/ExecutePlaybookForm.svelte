<script lang="ts">
  /**
   * ExecutePlaybookForm Component
   *
   * Reusable form component for Ansible playbook execution configuration.
   * Extracted from AnsiblePlaybookInterface for use in both single-node
   * and multi-node contexts (ParallelExecutionModal, GroupActionModal).
   *
   * @component
   * @example
   * ```svelte
   * <ExecutePlaybookForm
   *   multiNode={true}
   *   onSubmit={(data) => handlePlaybookExecution(data)}
   * />
   * ```
   */

  import IntegrationBadge from './IntegrationBadge.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';

  interface ExecutePlaybookFormData {
    playbookPath: string;
    extraVars?: Record<string, unknown>;
  }

  interface Props {
    /** Initial playbook path (for re-execution) */
    initialPlaybookPath?: string;
    /** Initial extra vars (for re-execution) */
    initialExtraVars?: Record<string, unknown>;
    /** Whether the form is in a loading/executing state */
    executing?: boolean;
    /** Error message to display */
    error?: string | null;
    /** Whether this is for multi-node context (affects UI hints) */
    multiNode?: boolean;
    /** Callback when form is submitted */
    onSubmit?: (data: ExecutePlaybookFormData) => void;
  }

  let {
    initialPlaybookPath = '',
    initialExtraVars = undefined,
    executing = false,
    error = null,
    multiNode = false,
    onSubmit
  }: Props = $props();

  // Form state
  let playbookPath = $state('');
  let extraVarsJson = $state('');
  let extraVarsError = $state<string | null>(null);

  // Initialize form state from props
  $effect(() => {
    if (initialPlaybookPath) {
      playbookPath = initialPlaybookPath;
    }
  });

  $effect(() => {
    if (initialExtraVars) {
      extraVarsJson = JSON.stringify(initialExtraVars, null, 2);
    }
  });

  // Handle form submission
  function handleSubmit(event: Event): void {
    event.preventDefault();

    if (!playbookPath.trim()) {
      return;
    }

    // Parse extra vars if provided
    let parsedExtraVars: Record<string, unknown> | undefined;
    extraVarsError = null;

    if (extraVarsJson.trim()) {
      try {
        const parsed = JSON.parse(extraVarsJson) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          extraVarsError = 'Extra vars must be a JSON object';
          return;
        }
        parsedExtraVars = parsed as Record<string, unknown>;
      } catch (err) {
        extraVarsError = 'Invalid JSON format';
        return;
      }
    }

    onSubmit?.({
      playbookPath: playbookPath.trim(),
      extraVars: parsedExtraVars
    });
  }
</script>

<div class="space-y-4">
  {#if multiNode}
    <div class="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
      <div class="flex items-start gap-2">
        <svg class="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div class="flex-1">
          <p class="text-sm text-blue-800 dark:text-blue-400">
            This playbook will be executed on all selected nodes in parallel.
          </p>
        </div>
      </div>
    </div>
  {/if}

  <form onsubmit={handleSubmit} class="space-y-4">
    <!-- Ansible Integration Badge -->
    <div class="flex items-center gap-2">
      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Execution Tool:</span>
      <IntegrationBadge integration="ansible" variant="badge" size="sm" />
    </div>

    <!-- Playbook Path Input -->
    <div>
      <label for="playbook-path" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Playbook Path <span class="text-red-500">*</span>
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
      <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Path to the Ansible playbook file (relative to Ansible configuration)
      </p>
    </div>

    <!-- Extra Vars Input (Optional) -->
    <div>
      <label for="extra-vars" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Extra Vars (Optional)
      </label>
      <textarea
        id="extra-vars"
        bind:value={extraVarsJson}
        placeholder='&#123;"app_version": "1.2.3", "environment": "production"&#125;'
        rows="4"
        class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
        disabled={executing}
      ></textarea>
      {#if extraVarsError}
        <p class="mt-1 text-xs text-red-600 dark:text-red-400">
          {extraVarsError}
        </p>
      {:else}
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Optional JSON object with variables to pass to the playbook
        </p>
      {/if}
    </div>

    <!-- Submit Button -->
    <button
      type="submit"
      class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={executing || !playbookPath.trim()}
    >
      {executing ? 'Executing...' : 'Execute Playbook'}
    </button>
  </form>

  <!-- Loading State -->
  {#if executing}
    <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
      <LoadingSpinner size="sm" />
      <span>Executing playbook...</span>
    </div>
  {/if}

  <!-- Error Display -->
  {#if error}
    <ErrorAlert message="Playbook execution failed" details={error} />
  {/if}
</div>
