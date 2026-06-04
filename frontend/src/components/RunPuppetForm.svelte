<script lang="ts">
  /**
   * RunPuppetForm Component
   *
   * Form for configuring Puppet agent runs in the GroupActionModal.
   * Supports tool selection (buttons), environment, noop/no-noop, debug, tags, and splay.
   */
  import IntegrationBadge from './IntegrationBadge.svelte';

  interface Props {
    availableTools: Array<'bolt' | 'ansible' | 'ssh'>;
    multiNode?: boolean;
    executing?: boolean;
    onSubmit: (data: Record<string, unknown>) => void;
  }

  let { availableTools, multiNode = false, executing = false, onSubmit }: Props = $props();

  // Form state — intentional one-time capture; tool is user-mutable after init
  // svelte-ignore state_referenced_locally
  let tool = $state<'bolt' | 'ansible' | 'ssh'>(availableTools[0] ?? 'bolt');
  let environment = $state('');
  let noop = $state(false);
  let noNoop = $state(false);
  let debug = $state(false);
  let tagsInput = $state('');
  let splay = $state(false);
  let splayLimit = $state(30);

  // Handle noop toggle - mutually exclusive with noNoop
  function handleNoopToggle(): void {
    noop = !noop;
    if (noop && noNoop) {
      noNoop = false;
    }
    emitFormData();
  }

  // Handle no-noop toggle - mutually exclusive with noop
  function handleNoNoopToggle(): void {
    noNoop = !noNoop;
    if (noNoop && noop) {
      noop = false;
    }
    emitFormData();
  }

  function emitFormData(): void {
    const data: Record<string, unknown> = { tool };

    if (environment.trim()) {
      data.environment = environment.trim();
    }
    if (noop) {
      data.noop = true;
    }
    if (noNoop) {
      data.noNoop = true;
    }
    if (debug) {
      data.debug = true;
    }
    if (tagsInput.trim()) {
      data.tags = tagsInput.split(',').map(t => t.trim()).filter(t => t.length > 0);
    }
    if (splay) {
      data.splay = true;
      data.splayLimit = splayLimit;
    }

    onSubmit(data);
  }

  // Emit form data on any change
  $effect(() => {
    void tool;
    void environment;
    void noop;
    void noNoop;
    void debug;
    void tagsInput;
    void splay;
    void splayLimit;
    emitFormData();
  });
</script>

<div class="space-y-4">
  <!-- Tool Selection (buttons) -->
  {#if availableTools.length > 1}
    <div>
      <div class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Execution Tool
      </div>
      <div class="flex gap-2" role="group" aria-label="Execution Tool">
        {#each availableTools as t}
          <button
            type="button"
            onclick={() => { tool = t; emitFormData(); }}
            class="flex items-center gap-2 rounded-lg border-2 px-4 py-2 text-sm font-medium transition-all {tool === t
              ? 'border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
              : 'border-gray-300 bg-white text-gray-700 hover:border-purple-300 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-purple-400 dark:hover:bg-gray-700'}"
            disabled={executing}
          >
            <IntegrationBadge integration={t} variant="dot" size="md" />
            <span class="capitalize">{t}</span>
            {#if tool === t}
              <svg class="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
              </svg>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Environment -->
  <div>
    <label for="puppet-form-env" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
      Environment
    </label>
    <input
      id="puppet-form-env"
      type="text"
      bind:value={environment}
      placeholder="e.g., production, development"
      class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
      disabled={executing}
    />
  </div>

  <!-- Tags -->
  <div>
    <label for="puppet-form-tags" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
      Tags (comma-separated)
    </label>
    <input
      id="puppet-form-tags"
      type="text"
      bind:value={tagsInput}
      placeholder="e.g., webserver, database"
      class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
      disabled={executing}
    />
  </div>

  <!-- Noop Toggle -->
  <div class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
    <div class="flex-1">
      <label for="puppet-form-noop" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Noop mode (dry-run)
      </label>
      <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        Run without making changes
      </p>
    </div>
    <button
      type="button"
      id="puppet-form-noop"
      role="switch"
      aria-checked={noop}
      aria-label="Toggle noop mode"
      onclick={handleNoopToggle}
      disabled={executing}
      class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed {noop ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'}"
    >
      <span
        class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {noop ? 'translate-x-5' : 'translate-x-0'}"
      ></span>
    </button>
  </div>

  <!-- No-noop Toggle -->
  <div class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
    <div class="flex-1">
      <label for="puppet-form-no-noop" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        No-noop mode (enforce changes)
      </label>
      <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        Override node noop setting
      </p>
    </div>
    <button
      type="button"
      id="puppet-form-no-noop"
      role="switch"
      aria-checked={noNoop}
      aria-label="Toggle no-noop mode"
      onclick={handleNoNoopToggle}
      disabled={executing}
      class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed {noNoop ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'}"
    >
      <span
        class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {noNoop ? 'translate-x-5' : 'translate-x-0'}"
      ></span>
    </button>
  </div>

  <!-- Debug Toggle -->
  <div class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
    <div class="flex-1">
      <label for="puppet-form-debug" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Debug mode
      </label>
      <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        Enable verbose output
      </p>
    </div>
    <button
      type="button"
      id="puppet-form-debug"
      role="switch"
      aria-checked={debug}
      aria-label="Toggle debug mode"
      onclick={() => { debug = !debug; emitFormData(); }}
      disabled={executing}
      class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed {debug ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'}"
    >
      <span
        class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {debug ? 'translate-x-5' : 'translate-x-0'}"
      ></span>
    </button>
  </div>

  <!-- Splay Toggle -->
  <div class="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
    <div class="flex-1">
      <label for="puppet-form-splay" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Splay (randomized delay)
      </label>
      <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        Avoid thundering herd on multiple nodes
      </p>
    </div>
    <button
      type="button"
      id="puppet-form-splay"
      role="switch"
      aria-checked={splay}
      aria-label="Toggle splay"
      onclick={() => { splay = !splay; emitFormData(); }}
      disabled={executing}
      class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed {splay ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-700'}"
    >
      <span
        class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {splay ? 'translate-x-5' : 'translate-x-0'}"
      ></span>
    </button>
  </div>

  <!-- Splay Limit (shown when splay is enabled) -->
  {#if splay}
    <div>
      <label for="puppet-form-splay-limit" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Splay limit (seconds)
      </label>
      <input
        id="puppet-form-splay-limit"
        type="number"
        bind:value={splayLimit}
        min="1"
        max="600"
        class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
        disabled={executing}
      />
      <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Maximum random delay in seconds (1-600)
      </p>
    </div>
  {/if}
</div>
