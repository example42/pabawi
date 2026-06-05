<script lang="ts">
  /**
   * ExecutePlaybookForm Component
   *
   * Reusable form component for Ansible playbook execution configuration.
   * Supports browsing available playbooks, viewing their content,
   * and auto-detecting parameters (vars_prompt, vars).
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

  import { onMount } from 'svelte';
  import { get } from '../lib/api';
  import { showError } from '../lib/toast.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';
  import PlaybookParameterForm from './PlaybookParameterForm.svelte';

  interface PlaybookFile {
    path: string;
    name: string;
    directory: string;
  }

  interface PlaybookPlay {
    name?: string;
    hosts?: string;
    roles?: string[];
    tasks?: number;
  }

  interface PlaybookParameter {
    name: string;
    type: 'String' | 'Boolean' | 'Integer' | 'Array' | 'Hash';
    description?: string;
    required: boolean;
    default?: unknown;
    private?: boolean;
  }

  interface PlaybookDetails {
    path: string;
    name: string;
    content: string;
    plays: PlaybookPlay[];
    parameters: PlaybookParameter[];
  }

  interface PlaybooksByDirectory {
    [directory: string]: PlaybookFile[];
  }

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
    onSubmit?: (data: ExecutePlaybookFormData) => void | Promise<void>;
  }

  let {
    initialPlaybookPath = '',
    initialExtraVars = undefined,
    executing = false,
    error = null,
    multiNode = false,
    onSubmit
  }: Props = $props();

  // State
  let playbooks = $state<PlaybookFile[]>([]);
  let playbooksByDir = $state<PlaybooksByDirectory>({});
  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let searchQuery = $state('');
  let expandedDirs = $state<Set<string>>(new Set());
  let selectedPlaybook = $state<PlaybookFile | null>(null);
  let playbookDetails = $state<PlaybookDetails | null>(null);
  let detailsLoading = $state(false);
  let parameterValues = $state<Record<string, unknown>>({});
  let parameterFormRef = $state<PlaybookParameterForm | null>(null);
  let showContent = $state(false);
  let manualPathMode = $state(false);
  let manualPath = $state('');

  // Computed
  const directories = $derived(Object.keys(playbooksByDir).sort());

  const filteredPlaybooksByDir = $derived(() => {
    if (!searchQuery.trim()) {
      return playbooksByDir;
    }

    const query = searchQuery.toLowerCase();
    const filtered: PlaybooksByDirectory = {};

    for (const [dir, pbs] of Object.entries(playbooksByDir)) {
      const matching = pbs.filter(
        pb =>
          pb.path.toLowerCase().includes(query) ||
          pb.name.toLowerCase().includes(query) ||
          dir.toLowerCase().includes(query)
      );

      if (matching.length > 0) {
        filtered[dir] = matching;
      }
    }

    return filtered;
  });

  // Group playbooks by directory
  function groupByDirectory(files: PlaybookFile[]): PlaybooksByDirectory {
    const grouped: PlaybooksByDirectory = {};
    for (const pb of files) {
      const dir = pb.directory || '.';
      if (!(dir in grouped)) {
        grouped[dir] = [];
      }
      grouped[dir].push(pb);
    }
    return grouped;
  }

  // Fetch available playbooks
  async function fetchPlaybooks(): Promise<void> {
    loading = true;
    loadError = null;

    try {
      const data = await get<{ playbooks: PlaybookFile[] }>('/api/playbooks', {
        maxRetries: 2,
      });

      playbooks = data.playbooks || [];
      playbooksByDir = groupByDirectory(playbooks);

      // Auto-expand if only one directory
      if (directories.length === 1) {
        expandedDirs.add(directories[0]);
      }
      // Auto-expand all if few total playbooks
      if (playbooks.length <= 10) {
        expandedDirs = new Set(directories);
      }
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'An unknown error occurred';
      showError('Failed to load playbooks', loadError);
      // Fall back to manual path mode
      manualPathMode = true;
      if (initialPlaybookPath) {
        manualPath = initialPlaybookPath;
      }
    } finally {
      loading = false;
    }
  }

  // Fetch details for a selected playbook
  async function fetchPlaybookDetails(playbookPath: string): Promise<void> {
    detailsLoading = true;
    playbookDetails = null;
    parameterValues = {};

    try {
      const data = await get<{ playbook: PlaybookDetails }>(
        `/api/playbooks/details?path=${encodeURIComponent(playbookPath)}`,
        { maxRetries: 1 }
      );

      playbookDetails = data.playbook;

      // Pre-fill parameter defaults
      if (playbookDetails?.parameters) {
        const defaults: Record<string, unknown> = {};
        for (const param of playbookDetails.parameters) {
          if (param.default !== undefined) {
            defaults[param.name] = param.default;
          }
        }
        parameterValues = defaults;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load playbook details';
      showError('Failed to load playbook details', msg);
    } finally {
      detailsLoading = false;
    }
  }

  // Toggle directory expansion
  function toggleDir(dir: string): void {
    if (expandedDirs.has(dir)) {
      expandedDirs.delete(dir);
    } else {
      expandedDirs.add(dir);
    }
    expandedDirs = new Set(expandedDirs);
  }

  // Select a playbook
  function selectPlaybook(pb: PlaybookFile): void {
    selectedPlaybook = pb;
    showContent = false;
    fetchPlaybookDetails(pb.path);
  }

  // Handle parameter changes
  function handleParametersChange(values: Record<string, unknown>): void {
    parameterValues = values;
  }

  // Handle form submission
  function handleSubmit(event: Event): void {
    event.preventDefault();

    const playbookPath = manualPathMode ? manualPath.trim() : selectedPlaybook?.path;

    if (!playbookPath) {
      return;
    }

    // Validate parameters if we have a form
    if (parameterFormRef && !parameterFormRef.validate()) {
      return;
    }

    // Build extra vars from parameter values (only non-empty values)
    let extraVars: Record<string, unknown> | undefined;
    const entries = Object.entries(parameterValues).filter(
      ([, v]) => v !== undefined && v !== null && v !== ''
    );
    if (entries.length > 0) {
      extraVars = Object.fromEntries(entries);
    }

    onSubmit?.({
      playbookPath,
      extraVars,
    });
  }

  // Pre-select playbook if initial path is provided
  function preselectPlaybook(): void {
    if (!initialPlaybookPath) return;

    const pb = playbooks.find(p => p.path === initialPlaybookPath);
    if (pb) {
      selectPlaybook(pb);
    } else {
      // Path not found in browser — switch to manual mode with the path
      manualPathMode = true;
      manualPath = initialPlaybookPath;
    }
  }

  // Watch for playbooks load to pre-select
  $effect(() => {
    if (playbooks.length > 0 && initialPlaybookPath) {
      preselectPlaybook();
    }
  });

  // Pre-fill extra vars from initial values
  $effect(() => {
    if (initialExtraVars && Object.keys(parameterValues).length === 0) {
      parameterValues = { ...initialExtraVars };
    }
  });

  onMount(() => {
    fetchPlaybooks();
  });
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

  <!-- Ansible Integration Badge -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">Execution Tool:</span>
      <IntegrationBadge integration="ansible" variant="badge" size="sm" />
    </div>
    <!-- Toggle between browse and manual mode -->
    <button
      type="button"
      onclick={() => { manualPathMode = !manualPathMode; }}
      class="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
      disabled={executing}
    >
      {manualPathMode ? 'Browse playbooks' : 'Enter path manually'}
    </button>
  </div>

  {#if manualPathMode}
    <!-- Manual Path Input (fallback/legacy mode) -->
    <div>
      <label for="playbook-path-manual" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Playbook Path <span class="text-red-500">*</span>
      </label>
      <input
        id="playbook-path-manual"
        type="text"
        bind:value={manualPath}
        placeholder="e.g., playbooks/site.yml"
        class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
        disabled={executing}
        required
      />
      <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Relative path to playbook file within Ansible project
      </p>
    </div>
  {:else}
    <!-- Playbook Browser -->
    <div>
      <div class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Select Playbook <span class="text-red-500">*</span>
      </div>

      {#if loading}
        <div class="flex justify-center py-8">
          <LoadingSpinner message="Discovering playbooks..." />
        </div>
      {:else if loadError && !manualPathMode}
        <ErrorAlert
          message="Failed to load playbooks"
          details={loadError}
          onRetry={fetchPlaybooks}
        />
      {:else if playbooks.length === 0}
        <div class="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center dark:border-gray-700 dark:bg-gray-900">
          <p class="text-sm text-gray-500 dark:text-gray-400">
            No playbook files found in the Ansible project directory.
          </p>
          <button
            type="button"
            onclick={() => { manualPathMode = true; }}
            class="mt-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Enter path manually instead
          </button>
        </div>
      {:else}
        <!-- Search -->
        <div class="mb-3">
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Search playbooks..."
            class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
            disabled={executing}
          />
        </div>

        <!-- Playbook List by Directory -->
        <div class="max-h-64 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
          {#each Object.entries(filteredPlaybooksByDir()) as [dir, pbs]}
            <div class="border-b border-gray-200 last:border-b-0 dark:border-gray-700">
              <!-- Directory Header -->
              <button
                type="button"
                onclick={() => toggleDir(dir)}
                class="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                disabled={executing}
              >
                <div class="flex items-center gap-2">
                  <svg
                    class="h-4 w-4 text-gray-400 transition-transform {expandedDirs.has(dir) ? 'rotate-90' : ''}"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                  </svg>
                  <svg class="h-4 w-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {dir === '.' ? '(root)' : dir}
                  </span>
                </div>
                <span class="text-xs text-gray-500 dark:text-gray-400">
                  {pbs.length}
                </span>
              </button>

              <!-- Playbook Files -->
              {#if expandedDirs.has(dir)}
                <div class="border-t border-gray-100 dark:border-gray-700">
                  {#each pbs as pb}
                    <button
                      type="button"
                      onclick={() => selectPlaybook(pb)}
                      class="flex w-full items-center gap-2 px-6 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors {selectedPlaybook?.path === pb.path ? 'bg-blue-100 dark:bg-blue-900/30' : ''}"
                      disabled={executing}
                    >
                      <svg class="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span class="text-sm text-gray-900 dark:text-white truncate flex-1">
                        {pb.name}
                      </span>
                      {#if selectedPlaybook?.path === pb.path}
                        <svg class="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                        </svg>
                      {/if}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Selected Playbook Details -->
  {#if selectedPlaybook && !manualPathMode}
    <div class="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-sm font-semibold text-gray-900 dark:text-white">
          {selectedPlaybook.path}
        </h4>
        {#if playbookDetails}
          <button
            type="button"
            onclick={() => { showContent = !showContent; }}
            class="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            {showContent ? 'Hide content' : 'View content'}
          </button>
        {/if}
      </div>

      {#if detailsLoading}
        <LoadingSpinner size="sm" message="Loading playbook details..." />
      {:else if playbookDetails}
        <!-- Play summaries -->
        {#if playbookDetails.plays.length > 0}
          <div class="mb-3 space-y-1">
            {#each playbookDetails.plays as play}
              <div class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <span class="font-medium">{play.name ?? 'Unnamed play'}</span>
                {#if play.hosts}
                  <span class="text-gray-400">→</span>
                  <span class="font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded">{play.hosts}</span>
                {/if}
                {#if play.roles && play.roles.length > 0}
                  <span class="text-gray-400">({play.roles.length} roles)</span>
                {/if}
                {#if play.tasks}
                  <span class="text-gray-400">({play.tasks} tasks)</span>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        <!-- Playbook content viewer -->
        {#if showContent}
          <div class="mb-3">
            <pre class="max-h-48 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-gray-100 font-mono">{playbookDetails.content}</pre>
          </div>
        {/if}

        <!-- Parameter Form -->
        {#if playbookDetails.parameters.length > 0}
          <div class="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <h5 class="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
              Parameters ({playbookDetails.parameters.length})
            </h5>
            <PlaybookParameterForm
              bind:this={parameterFormRef}
              parameters={playbookDetails.parameters}
              values={parameterValues}
              onValuesChange={handleParametersChange}
              disabled={executing}
            />
          </div>
        {:else}
          <p class="text-sm text-gray-500 dark:text-gray-400 italic">
            No parameters detected for this playbook
          </p>
        {/if}
      {/if}
    </div>
  {/if}

  <!-- Submit Button -->
  <form onsubmit={handleSubmit}>
    <button
      type="submit"
      class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={executing || (manualPathMode ? !manualPath.trim() : !selectedPlaybook)}
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
