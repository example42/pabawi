<script lang="ts">
  import IntegrationBadge from './IntegrationBadge.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import ErrorAlert from './ErrorAlert.svelte';

  interface CommandWhitelistConfig {
    allowAll: boolean;
    whitelist: string[];
    matchMode: 'exact' | 'prefix';
  }

  interface ExecuteCommandFormData {
    command: string;
    tool: 'bolt' | 'ansible' | 'ssh';
    parameters?: Record<string, unknown>;
  }

  interface Props {
    /** Available execution tools (bolt, ansible, ssh) */
    availableTools?: Array<'bolt' | 'ansible' | 'ssh'>;
    /** Command whitelist configuration */
    commandWhitelist?: CommandWhitelistConfig | null;
    /** Initial command value (for re-execution) */
    initialCommand?: string;
    /** Initial tool selection */
    initialTool?: 'bolt' | 'ansible' | 'ssh';
    /** Whether the form is in a loading/executing state */
    executing?: boolean;
    /** Error message to display */
    error?: string | null;
    /** Whether this is for multi-node context (affects UI hints) */
    multiNode?: boolean;
    /** Callback when form is submitted */
    onSubmit?: (data: ExecuteCommandFormData) => void;
  }

  let {
    availableTools = ['bolt'],
    commandWhitelist = null,
    initialCommand = '',
    initialTool = 'bolt',
    executing = false,
    error = null,
    multiNode = false,
    onSubmit
  }: Props = $props();

  // Form state
  let commandInput = $state('');
  let commandTool = $state<'bolt' | 'ansible' | 'ssh'>('bolt');
  let parametersJson = $state<string>('');
  let parametersError = $state<string | null>(null);

  // Initialize form state from props
  $effect(() => {
    if (initialCommand) {
      commandInput = initialCommand;
    }
  });

  $effect(() => {
    if (availableTools.includes(initialTool)) {
      commandTool = initialTool;
    } else if (availableTools.length > 0) {
      commandTool = availableTools[0];
    }
  });

  // Automatically notify parent of form data changes in multiNode mode
  $effect(() => {
    if (multiNode && onSubmit) {
      // Only notify if command is provided
      if (commandInput.trim()) {
        // Parse parameters if provided
        let parsedParameters: Record<string, unknown> | undefined;

        if (parametersJson.trim()) {
          try {
            parsedParameters = JSON.parse(parametersJson);
            if (typeof parsedParameters === 'object' && parsedParameters !== null && !Array.isArray(parsedParameters)) {
              // Valid parameters
              onSubmit({
                command: commandInput.trim(),
                tool: commandTool,
                parameters: parsedParameters
              });
            } else {
              // Invalid parameters format - don't notify parent
              return;
            }
          } catch (err) {
            // Invalid JSON - don't notify parent
            return;
          }
        } else {
          // No parameters, just command
          onSubmit({
            command: commandInput.trim(),
            tool: commandTool
          });
        }
      }
    }
  });

  // Handle form submission
  function handleSubmit(event: Event): void {
    event.preventDefault();

    if (!commandInput.trim()) {
      return;
    }

    // Parse parameters if provided
    let parsedParameters: Record<string, unknown> | undefined;
    parametersError = null;

    if (parametersJson.trim()) {
      try {
        parsedParameters = JSON.parse(parametersJson);
        if (typeof parsedParameters !== 'object' || parsedParameters === null || Array.isArray(parsedParameters)) {
          parametersError = 'Parameters must be a valid JSON object';
          return;
        }
      } catch (err) {
        parametersError = 'Invalid JSON format';
        return;
      }
    }

    onSubmit?.({
      command: commandInput.trim(),
      tool: commandTool,
      parameters: parsedParameters
    });
  }

  // Set command from whitelist
  function setCommand(cmd: string): void {
    commandInput = cmd;
  }

  // Set execution tool
  function setTool(tool: 'bolt' | 'ansible' | 'ssh'): void {
    commandTool = tool;
  }
</script>

<div class="space-y-4">
  <!-- Available Commands Display -->
  {#if commandWhitelist}
    <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
      <h3 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        Available Commands
      </h3>
      {#if commandWhitelist.allowAll}
        <p class="text-sm text-gray-600 dark:text-gray-400">
          All commands are allowed
        </p>
      {:else if !commandWhitelist.whitelist || commandWhitelist.whitelist.length === 0}
        <p class="text-sm text-red-600 dark:text-red-400">
          No commands are allowed (whitelist is empty)
        </p>
      {:else}
        <div class="flex flex-wrap gap-2">
          {#each commandWhitelist.whitelist as cmd}
            <button
              type="button"
              onclick={() => setCommand(cmd)}
              class="inline-flex items-center rounded-md px-2.5 py-1 text-sm font-mono bg-white text-gray-700 border border-gray-300 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
              disabled={executing}
            >
              {cmd}
              {#if commandWhitelist.matchMode === 'prefix'}
                <span class="ml-1 text-gray-400">*</span>
              {/if}
            </button>
          {/each}
        </div>
        {#if commandWhitelist.matchMode === 'prefix'}
          <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
            * Prefix match mode: commands starting with these prefixes are allowed
          </p>
        {/if}
      {/if}
    </div>
  {/if}

  {#if multiNode}
    <div class="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
      <div class="flex items-start gap-2">
        <svg class="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div class="flex-1">
          <p class="text-sm text-blue-800 dark:text-blue-400">
            This command will be executed on all selected nodes in parallel.
          </p>
        </div>
      </div>
    </div>
  {/if}

  <form onsubmit={handleSubmit} class="space-y-4">
    <!-- Execution Tool Selector -->
    {#if availableTools.length > 1}
      <div>
        <div class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Execution Tool
        </div>
        <div class="flex gap-2" role="group" aria-label="Execution Tool">
          {#each availableTools as tool}
            <button
              type="button"
              onclick={() => setTool(tool)}
              class="flex items-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all {commandTool === tool
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-blue-400 dark:hover:bg-gray-700'}"
              disabled={executing}
            >
              <IntegrationBadge integration={tool} variant="dot" size="md" />
              <span class="capitalize">{tool}</span>
              {#if commandTool === tool}
                <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                </svg>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Command Input -->
    <div>
      <label for="command-input" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Command
      </label>
      <input
        id="command-input"
        type="text"
        bind:value={commandInput}
        placeholder="Enter command to execute..."
        class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
        disabled={executing}
      />
    </div>

    <!-- Parameters Input (Optional) -->
    <div>
      <label for="parameters-input" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Parameters (Optional)
      </label>
      <textarea
        id="parameters-input"
        bind:value={parametersJson}
        placeholder={'{"key": "value"}'}
        rows="3"
        class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500 font-mono"
        disabled={executing}
      ></textarea>
      {#if parametersError}
        <p class="mt-1 text-xs text-red-600 dark:text-red-400">
          {parametersError}
        </p>
      {:else}
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Optional JSON parameters for the command
        </p>
      {/if}
    </div>

    <!-- Submit Button (only shown in single-node mode) -->
    {#if !multiNode}
      <button
        type="submit"
        class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={executing || !commandInput.trim()}
      >
        {executing ? 'Executing...' : 'Execute'}
      </button>
    {/if}
  </form>

  <!-- Loading State -->
  {#if executing}
    <div class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
      <LoadingSpinner size="sm" />
      <span>Executing command...</span>
    </div>
  {/if}

  <!-- Error Display -->
  {#if error}
    <ErrorAlert message="Command execution failed" details={error} />
  {/if}
</div>
