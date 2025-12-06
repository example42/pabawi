<script lang="ts">
  import { getErrorGuidance, type ApiError } from '../lib/api';
  import { expertMode } from '../lib/expertMode.svelte';
  import DetailedErrorDisplay from './DetailedErrorDisplay.svelte';

  interface Props {
    message: string;
    details?: string;
    guidance?: string;
    error?: ApiError;
    onRetry?: () => void;
    onDismiss?: () => void;
  }

  let { message, details, guidance, error, onRetry, onDismiss }: Props = $props();
  let showDetails = $state(false);
  let showTroubleshooting = $state(false);

  // Get actionable guidance if not provided
  const errorGuidance = $derived(
    guidance ||
    (error?.actionableMessage) ||
    (details ? getErrorGuidance(new Error(details)).guidance : undefined)
  );

  // Get error type icon and color
  const errorTypeInfo = $derived(() => {
    if (!error) return { icon: 'error', color: 'red' };

    switch (error.type) {
      case 'connection':
        return { icon: 'wifi-off', color: 'orange' };
      case 'authentication':
        return { icon: 'lock', color: 'yellow' };
      case 'timeout':
        return { icon: 'clock', color: 'amber' };
      case 'validation':
        return { icon: 'alert', color: 'red' };
      case 'not_found':
        return { icon: 'search', color: 'gray' };
      case 'permission':
        return { icon: 'shield', color: 'red' };
      case 'configuration':
        return { icon: 'settings', color: 'orange' };
      case 'execution':
        return { icon: 'terminal', color: 'red' };
      default:
        return { icon: 'error', color: 'red' };
    }
  });

  // Use DetailedErrorDisplay if expert mode is enabled and we have an ApiError
  const useDetailedDisplay = $derived(expertMode.enabled && error !== undefined);
</script>

<div class="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20" role="alert">
  <div class="flex items-start gap-3">
    <svg
      class="h-5 w-5 flex-shrink-0 text-red-600 dark:text-red-400"
      fill="currentColor"
      viewBox="0 0 20 20"
      aria-hidden="true"
    >
      <path
        fill-rule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
        clip-rule="evenodd"
      />
    </svg>
    <div class="flex-1">
      {#if useDetailedDisplay && error}
        <!-- Expert mode: Use DetailedErrorDisplay -->
        <DetailedErrorDisplay {error} />
      {:else}
        <!-- Standard mode: Show simplified error with actionable message -->
        <div class="space-y-2">
          <h3 class="text-sm font-medium text-red-800 dark:text-red-200">
            {message}
          </h3>

          {#if error?.type}
            <div class="flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
              <span class="rounded-full bg-red-100 px-2 py-0.5 font-medium dark:bg-red-900/40">
                {error.type.replace('_', ' ').toUpperCase()}
              </span>
              {#if error.code}
                <span class="font-mono">{error.code}</span>
              {/if}
            </div>
          {/if}

          {#if errorGuidance}
            <p class="text-sm text-red-700 dark:text-red-300">
              💡 {errorGuidance}
            </p>
          {/if}

          {#if error?.troubleshooting}
            <button
              type="button"
              class="mt-2 flex items-center gap-1 text-sm text-red-700 underline hover:text-red-800 dark:text-red-300 dark:hover:text-red-200"
              onclick={() => showTroubleshooting = !showTroubleshooting}
            >
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {showTroubleshooting ? 'Hide' : 'Show'} troubleshooting steps
            </button>
            {#if showTroubleshooting}
              <div class="mt-2 rounded-md border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/10">
                <h4 class="text-sm font-medium text-red-800 dark:text-red-200 mb-2">Troubleshooting Steps:</h4>
                <ol class="list-decimal list-inside space-y-1 text-sm text-red-700 dark:text-red-300">
                  {#each error.troubleshooting.steps as step}
                    <li>{step}</li>
                  {/each}
                </ol>
                {#if error.troubleshooting.documentation}
                  <div class="mt-2 pt-2 border-t border-red-200 dark:border-red-800">
                    <a
                      href={error.troubleshooting.documentation}
                      class="text-sm text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200 underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      📖 View documentation
                    </a>
                  </div>
                {/if}
                {#if error.troubleshooting.relatedErrors && error.troubleshooting.relatedErrors.length > 0}
                  <div class="mt-2 pt-2 border-t border-red-200 dark:border-red-800">
                    <p class="text-xs text-red-600 dark:text-red-400">
                      Related errors: {error.troubleshooting.relatedErrors.join(', ')}
                    </p>
                  </div>
                {/if}
              </div>
            {/if}
          {/if}

          {#if details}
            <button
              type="button"
              class="mt-2 text-sm text-red-700 underline hover:text-red-800 dark:text-red-300 dark:hover:text-red-200"
              onclick={() => showDetails = !showDetails}
            >
              {showDetails ? 'Hide' : 'Show'} technical details
            </button>
            {#if showDetails}
              <pre class="mt-2 overflow-x-auto rounded bg-red-100 p-2 text-xs text-red-900 dark:bg-red-950 dark:text-red-100">{details}</pre>
            {/if}
          {/if}
        </div>
      {/if}
      {#if onRetry || onDismiss}
        <div class="mt-3 flex gap-2">
          {#if onRetry}
            <button
              type="button"
              class="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:bg-red-700 dark:hover:bg-red-600"
              onclick={onRetry}
            >
              Retry
            </button>
          {/if}
          {#if onDismiss}
            <button
              type="button"
              class="rounded bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:bg-gray-800 dark:text-red-300 dark:hover:bg-gray-700"
              onclick={onDismiss}
            >
              Dismiss
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
