<script lang="ts">
  interface Props {
    message: string;
    details?: string;
    onRetry?: () => void;
    onDismiss?: () => void;
  }

  let { message, details, onRetry, onDismiss }: Props = $props();
  let showDetails = $state(false);
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
      <h3 class="text-sm font-medium text-red-800 dark:text-red-200">
        {message}
      </h3>
      {#if details}
        <button
          type="button"
          class="mt-2 text-sm text-red-700 underline hover:text-red-800 dark:text-red-300 dark:hover:text-red-200"
          onclick={() => showDetails = !showDetails}
        >
          {showDetails ? 'Hide' : 'Show'} details
        </button>
        {#if showDetails}
          <pre class="mt-2 overflow-x-auto rounded bg-red-100 p-2 text-xs text-red-900 dark:bg-red-950 dark:text-red-100">{details}</pre>
        {/if}
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
