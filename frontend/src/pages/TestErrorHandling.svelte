<script lang="ts">
  import { showSuccess, showError, showInfo, showWarning } from '../lib/toast.svelte';
  import { get } from '../lib/api';
  import ErrorAlert from '../components/ErrorAlert.svelte';

  let testError = $state<string | null>(null);

  function testSuccessToast(): void {
    showSuccess('Operation completed successfully!');
  }

  function testErrorToast(): void {
    showError('Operation failed', 'This is a detailed error message that provides more context about what went wrong.');
  }

  function testInfoToast(): void {
    showInfo('Processing your request...');
  }

  function testWarningToast(): void {
    showWarning('This action cannot be undone');
  }

  async function testRetryLogic(): Promise<void> {
    try {
      showInfo('Testing retry logic...');
      await get('/api/nonexistent-endpoint', {
        maxRetries: 2,
        onRetry: (attempt) => {
          showInfo(`Retry attempt ${attempt}...`);
        },
      });
    } catch (error) {
      showError('Request failed after retries', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  function testErrorBoundary(): void {
    // This will trigger an error that should be caught by ErrorBoundary
    throw new Error('Test error for ErrorBoundary');
  }

  function testErrorAlert(): void {
    testError = 'This is a test error message with actionable guidance';
  }

  function clearTestError(): void {
    testError = null;
  }
</script>

<div class="container mx-auto px-4 py-8">
  <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-6">
    Error Handling Test Page
  </h1>

  <div class="space-y-6">
    <!-- Toast Notifications -->
    <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
        Toast Notifications
      </h2>
      <div class="flex flex-wrap gap-3">
        <button
          type="button"
          class="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          onclick={testSuccessToast}
        >
          Test Success Toast
        </button>
        <button
          type="button"
          class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          onclick={testErrorToast}
        >
          Test Error Toast
        </button>
        <button
          type="button"
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          onclick={testInfoToast}
        >
          Test Info Toast
        </button>
        <button
          type="button"
          class="rounded-lg bg-yellow-600 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-700"
          onclick={testWarningToast}
        >
          Test Warning Toast
        </button>
      </div>
    </div>

    <!-- Retry Logic -->
    <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
        Retry Logic
      </h2>
      <button
        type="button"
        class="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700"
        onclick={testRetryLogic}
      >
        Test Retry Logic (will fail)
      </button>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
        This will attempt to fetch a non-existent endpoint and retry 2 times before failing.
      </p>
    </div>

    <!-- Error Alert -->
    <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
        Error Alert Component
      </h2>
      <button
        type="button"
        class="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
        onclick={testErrorAlert}
      >
        Show Error Alert
      </button>
      {#if testError}
        <div class="mt-4">
          <ErrorAlert
            message="Test Error"
            details={testError}
            onRetry={testErrorAlert}
            onDismiss={clearTestError}
          />
        </div>
      {/if}
    </div>

    <!-- Error Boundary -->
    <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-4">
        Error Boundary
      </h2>
      <button
        type="button"
        class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        onclick={testErrorBoundary}
      >
        Trigger Error Boundary
      </button>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
        This will throw an error that should be caught by the ErrorBoundary component.
      </p>
    </div>
  </div>
</div>
