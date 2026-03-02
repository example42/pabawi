<script lang="ts">
  /**
   * InstallSoftwareForm Component
   *
   * Reusable form component for software installation configuration.
   * Extracted from PackageInstallInterface for use in both single-node
   * and multi-node contexts (ParallelExecutionModal, GroupActionModal).
   *
   * @component
   * @example
   * ```svelte
   * <InstallSoftwareForm
   *   availableTools={['bolt', 'ansible', 'ssh']}
   *   multiNode={true}
   *   onSubmit={(data) => handleInstall(data)}
   * />
   * ```
   */

  import { get } from '../lib/api';
  import { showError } from '../lib/toast.svelte';
  import IntegrationBadge from './IntegrationBadge.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';

  interface PackageTask {
    name: string;
    label: string;
    parameterMapping: {
      packageName: string;
      ensure?: string;
      version?: string;
      settings?: string;
    };
  }

  interface InstallSoftwareFormData {
    packageName: string;
    tool: 'bolt' | 'ansible' | 'ssh';
    taskName?: string;
    version?: string;
    ensure: 'present' | 'absent' | 'latest';
    settings?: Record<string, unknown>;
  }

  interface Props {
    /** Available execution tools (bolt, ansible, ssh) */
    availableTools?: Array<'bolt' | 'ansible' | 'ssh'>;
    /** Initial package name (for re-execution) */
    initialPackageName?: string;
    /** Initial tool selection */
    initialTool?: 'bolt' | 'ansible' | 'ssh';
    /** Whether the form is in a loading/executing state */
    executing?: boolean;
    /** Error message to display */
    error?: string | null;
    /** Whether this is for multi-node context (affects UI hints) */
    multiNode?: boolean;
    /** Callback when form is submitted */
    onSubmit?: (data: InstallSoftwareFormData) => void;
  }

  let {
    availableTools = ['bolt'],
    initialPackageName = '',
    initialTool = 'bolt',
    executing = false,
    error = null,
    multiNode = false,
    onSubmit
  }: Props = $props();

  // Form state
  let packageName = $state('');
  let selectedTool = $state<'bolt' | 'ansible' | 'ssh'>('bolt');
  let selectedTask = $state<string>('');
  let packageVersion = $state('');
  let ensure = $state<'present' | 'absent' | 'latest'>('present');
  let settings = $state('');

  // Task loading state
  let availableTasks = $state<PackageTask[]>([]);
  let tasksLoading = $state(false);
  let tasksFetched = $state(false);

  // Validation state
  let validationError = $state<string | null>(null);

  // Initialize form state from props
  $effect(() => {
    if (initialPackageName) {
      packageName = initialPackageName;
    }
  });

  $effect(() => {
    if (availableTools.includes(initialTool)) {
      selectedTool = initialTool;
    } else if (availableTools.length > 0) {
      selectedTool = availableTools[0];
    }
  });

  // Automatically notify parent of form data changes in multiNode mode
  $effect(() => {
    if (multiNode && onSubmit) {
      // Only notify if package name is provided
      if (packageName.trim()) {
        // Validate package name format
        if (!/^[a-zA-Z0-9_-]+$/.test(packageName.trim())) {
          return; // Invalid format - don't notify parent
        }

        // For Bolt, require task selection
        if (selectedTool === 'bolt' && (!selectedTask || availableTasks.length === 0)) {
          return; // No task selected - don't notify parent
        }

        // Parse settings if provided and supported
        let parsedSettings: Record<string, unknown> | undefined;
        if (settings.trim() && supportsSettings) {
          try {
            parsedSettings = JSON.parse(settings);
            if (typeof parsedSettings !== 'object' || parsedSettings === null || Array.isArray(parsedSettings)) {
              return; // Invalid settings format - don't notify parent
            }
          } catch (err) {
            return; // Invalid JSON - don't notify parent
          }
        }

        // Notify parent with valid form data
        onSubmit({
          packageName: packageName.trim(),
          tool: selectedTool,
          taskName: selectedTool === 'bolt' ? selectedTask : undefined,
          version: packageVersion.trim() || undefined,
          ensure,
          settings: parsedSettings
        });
      }
    }
  });

  // Fetch tasks when tool changes to bolt
  $effect(() => {
    if (selectedTool === 'bolt' && !tasksFetched) {
      tasksFetched = true;
      fetchPackageTasks();
    }
  });

  // Get the selected task configuration
  const selectedTaskConfig = $derived(
    availableTasks.find((t) => t.name === selectedTask)
  );

  // Check if settings are supported by the selected task
  const supportsSettings = $derived(
    selectedTaskConfig?.parameterMapping.settings !== undefined
  );

  // Fetch available package tasks
  async function fetchPackageTasks(): Promise<void> {
    tasksLoading = true;
    try {
      const data = await get<{ tasks: PackageTask[] }>('/api/package-tasks', {
        maxRetries: 2,
      });
      availableTasks = data.tasks || [];
      if (availableTasks.length > 0 && !selectedTask) {
        selectedTask = availableTasks[0].name;
      }
    } catch (err) {
      console.error('Error fetching package tasks:', err);
      showError('Failed to load package tasks');
    } finally {
      tasksLoading = false;
    }
  }

  // Validate form
  function validateForm(): boolean {
    validationError = null;

    if (selectedTool === 'bolt' && !selectedTask) {
      validationError = 'Please select a package task';
      return false;
    }

    if (!packageName.trim()) {
      validationError = 'Package name is required';
      return false;
    }

    // Validate package name format (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9_-]+$/.test(packageName.trim())) {
      validationError = 'Package name can only contain letters, numbers, hyphens, and underscores';
      return false;
    }

    // Validate settings JSON if provided
    if (settings.trim()) {
      try {
        JSON.parse(settings);
      } catch (e) {
        validationError = 'Settings must be valid JSON';
        return false;
      }
    }

    return true;
  }

  // Handle form submission
  function handleSubmit(event: Event): void {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    // Parse settings if provided
    let parsedSettings: Record<string, unknown> | undefined;
    if (settings.trim() && supportsSettings) {
      try {
        parsedSettings = JSON.parse(settings);
      } catch (e) {
        // Already validated, should not happen
        return;
      }
    }

    onSubmit?.({
      packageName: packageName.trim(),
      tool: selectedTool,
      taskName: selectedTool === 'bolt' ? selectedTask : undefined,
      version: packageVersion.trim() || undefined,
      ensure,
      settings: parsedSettings
    });
  }

  // Set execution tool
  function setTool(tool: 'bolt' | 'ansible' | 'ssh'): void {
    selectedTool = tool;
    // Reset task selection when switching tools
    if (tool !== 'bolt') {
      selectedTask = '';
    } else if (availableTasks.length > 0 && !selectedTask) {
      selectedTask = availableTasks[0].name;
    }
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
            This package will be installed on all selected nodes in parallel.
          </p>
        </div>
      </div>
    </div>
  {/if}

  <form onsubmit={handleSubmit} class="space-y-4">
    <!-- Execution Tool Selector -->
    {#if availableTools.length > 1}
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Execution Tool
        </label>
        <div class="flex gap-2">
          {#each availableTools as tool}
            <button
              type="button"
              onclick={() => setTool(tool)}
              class="flex items-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all {selectedTool === tool
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-blue-400 dark:hover:bg-gray-700'}"
              disabled={executing}
            >
              <IntegrationBadge integration={tool} variant="dot" size="md" />
              <span class="capitalize">{tool}</span>
              {#if selectedTool === tool}
                <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                </svg>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Task Selection (Bolt only) -->
    {#if selectedTool === 'bolt'}
      <div>
        <label for="task-select" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Package Task <span class="text-red-500">*</span>
        </label>
        {#if tasksLoading}
          <div class="mt-1 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <LoadingSpinner size="sm" />
            <span>Loading tasks...</span>
          </div>
        {:else if availableTasks.length === 0}
          <p class="mt-1 text-sm text-red-600 dark:text-red-400">
            No package tasks available
          </p>
        {:else}
          <select
            id="task-select"
            bind:value={selectedTask}
            class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            disabled={executing}
            required
          >
            {#each availableTasks as task}
              <option value={task.name}>{task.label}</option>
            {/each}
          </select>
          {#if selectedTaskConfig}
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Task: {selectedTaskConfig.name}
            </p>
          {/if}
        {/if}
      </div>
    {/if}

    <!-- Package Name -->
    <div>
      <label for="package-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Package Name <span class="text-red-500">*</span>
      </label>
      <input
        id="package-name"
        type="text"
        bind:value={packageName}
        placeholder="e.g., nginx, apache, mysql"
        class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
        disabled={executing}
        required
      />
    </div>

    <!-- Package Version -->
    <div>
      <label for="package-version" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Version (optional)
      </label>
      <input
        id="package-version"
        type="text"
        bind:value={packageVersion}
        placeholder="e.g., 1.18.0, latest"
        class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
        disabled={executing}
      />
    </div>

    <!-- Ensure -->
    <div>
      <label for="ensure" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Ensure
      </label>
      <select
        id="ensure"
        bind:value={ensure}
        class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
        disabled={executing}
      >
        <option value="present">Present</option>
        <option value="absent">Absent</option>
        <option value="latest">Latest</option>
      </select>
      <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Present: Install if not present, Absent: Remove if present, Latest: Install/upgrade to latest version
      </p>
    </div>

    <!-- Settings (if supported by task) -->
    {#if supportsSettings}
      <div>
        <label for="settings" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Additional Settings (JSON)
        </label>
        <textarea
          id="settings"
          bind:value={settings}
          placeholder='&#123;"option1": "value1", "option2": "value2"&#125;'
          rows="3"
          class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
          disabled={executing}
        ></textarea>
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Optional JSON object with additional package-specific settings
        </p>
      </div>
    {/if}

    <!-- Validation Error -->
    {#if validationError}
      <div class="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
        <p class="text-sm text-red-600 dark:text-red-400">{validationError}</p>
      </div>
    {/if}

    <!-- Submit Button -->
    <button
      type="submit"
      class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      disabled={executing || !packageName.trim() || (selectedTool === 'bolt' && (!selectedTask || availableTasks.length === 0))}
    >
      {executing ? 'Installing...' : 'Install Package'}
    </button>
  </form>

  <!-- Loading State -->
  {#if executing}
    <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
      <LoadingSpinner size="sm" />
      <span>Installing package...</span>
    </div>
  {/if}

  <!-- Error Display -->
  {#if error}
    <ErrorAlert message="Package installation failed" details={error} />
  {/if}
</div>
