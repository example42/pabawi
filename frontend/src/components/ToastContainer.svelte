<script lang="ts">
  import { getToasts, removeToast, type Toast } from '../lib/toast.svelte';

  // Get reactive toasts
  const toasts = $derived(getToasts());

  function getToastStyles(type: Toast['type']): string {
    switch (type) {
      case 'success':
        return 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-200';
      case 'error':
        return 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200';
      case 'warning':
        return 'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200';
      case 'info':
        return 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200';
      default:
        return 'border-gray-200 bg-gray-50 text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200';
    }
  }

  function getIcon(type: Toast['type']): string {
    switch (type) {
      case 'success':
        return 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z';
      case 'error':
        return 'M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z';
      case 'warning':
        return 'M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z';
      case 'info':
        return 'M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z';
      default:
        return '';
    }
  }

  function handleDismiss(id: string): void {
    removeToast(id);
  }

  let showDetails = $state<Record<string, boolean>>({});

  function toggleDetails(id: string): void {
    showDetails[id] = !showDetails[id];
  }
</script>

<!-- Toast Container - Fixed position at top right -->
<div
  class="pointer-events-none fixed right-0 top-0 z-50 flex max-h-screen w-full flex-col items-end gap-2 overflow-hidden p-4 sm:max-w-md"
  aria-live="polite"
  aria-atomic="true"
>
  {#each toasts as toast (toast.id)}
    <div
      class="pointer-events-auto w-full transform rounded-lg border shadow-lg transition-all duration-300 ease-in-out {getToastStyles(toast.type)}"
      role="alert"
    >
      <div class="flex items-start gap-3 p-4">
        <!-- Icon -->
        <svg
          class="h-5 w-5 flex-shrink-0"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            d={getIcon(toast.type)}
            clip-rule="evenodd"
          />
        </svg>

        <!-- Content -->
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium">
            {toast.message}
          </p>

          {#if toast.details}
            <button
              type="button"
              class="mt-1 text-xs underline opacity-75 hover:opacity-100"
              onclick={() => toggleDetails(toast.id)}
            >
              {showDetails[toast.id] ? 'Hide' : 'Show'} details
            </button>
            {#if showDetails[toast.id]}
              <pre class="mt-2 overflow-x-auto rounded bg-black/10 p-2 text-xs dark:bg-white/10">{toast.details}</pre>
            {/if}
          {/if}
        </div>

        <!-- Dismiss Button -->
        {#if toast.dismissible}
          <button
            type="button"
            class="flex-shrink-0 rounded-md opacity-75 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2"
            onclick={() => handleDismiss(toast.id)}
            aria-label="Dismiss notification"
          >
            <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fill-rule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
        {/if}
      </div>
    </div>
  {/each}
</div>
