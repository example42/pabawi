<script lang="ts">
  import { onMount } from 'svelte';
  import ErrorAlert from './ErrorAlert.svelte';

  interface Props {
    children: import('svelte').Snippet;
    fallback?: import('svelte').Snippet<[Error]>;
    onError?: (error: Error, errorInfo: { componentStack?: string }) => void;
  }

  let { children, fallback, onError }: Props = $props();

  let error = $state<Error | null>(null);
  let errorInfo = $state<{ componentStack?: string }>({});

  function handleError(event: ErrorEvent): void {
    const err = event.error || new Error(event.message);
    error = err;
    errorInfo = { componentStack: event.filename ? `at ${event.filename}:${event.lineno}:${event.colno}` : undefined };

    // Call custom error handler if provided
    if (onError) {
      onError(err, errorInfo);
    }

    // Log to console
    console.error('ErrorBoundary caught an error:', err, errorInfo);

    // Prevent default error handling
    event.preventDefault();
  }

  function handleUnhandledRejection(event: PromiseRejectionEvent): void {
    const err = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
    error = err;
    errorInfo = { componentStack: 'Unhandled Promise Rejection' };

    // Call custom error handler if provided
    if (onError) {
      onError(err, errorInfo);
    }

    // Log to console
    console.error('ErrorBoundary caught an unhandled rejection:', err, errorInfo);

    // Prevent default error handling
    event.preventDefault();
  }

  function resetError(): void {
    error = null;
    errorInfo = {};
  }

  onMount(() => {
    // Add global error listeners
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      // Cleanup listeners
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  });
</script>

{#if error}
  {#if fallback}
    {@render fallback(error)}
  {:else}
    <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div class="max-w-2xl w-full">
        <div class="mb-6 text-center">
          <svg
            class="mx-auto h-16 w-16 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <h1 class="mt-4 text-2xl font-bold text-gray-900 dark:text-white">
            Something went wrong
          </h1>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
            An unexpected error occurred. Please try refreshing the page.
          </p>
        </div>

        <ErrorAlert
          message={error.message || 'An unknown error occurred'}
          details={errorInfo.componentStack}
          onRetry={resetError}
        />

        <div class="mt-6 flex justify-center gap-3">
          <button
            type="button"
            class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            onclick={resetError}
          >
            Try Again
          </button>
          <button
            type="button"
            class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            onclick={() => window.location.reload()}
          >
            Reload Page
          </button>
        </div>
      </div>
    </div>
  {/if}
{:else}
  {@render children()}
{/if}
