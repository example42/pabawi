<script lang="ts">
  import { router } from '../lib/router.svelte';
  import { PuppetserverSetupGuide } from '../components';

  interface Props {
    params?: { integration: string };
  }

  let { params }: Props = $props();

  const integration = $derived(params?.integration || '');

  const setupGuides: Record<string, { title: string; description: string; steps: string[] }> = {
    puppetdb: {
      title: 'PuppetDB Integration Setup',
      description: 'Configure PuppetDB integration to access node inventory, facts, reports, catalogs, and events.',
      steps: [
        'Ensure you have a running PuppetDB instance',
        'Obtain the PuppetDB server URL (e.g., https://puppetdb.example.com)',
        'If using SSL, prepare your certificate files (CA, cert, key)',
        'If using token authentication, generate an API token',
        'Update your backend/.env file with the following variables:',
        'PUPPETDB_ENABLED=true',
        'PUPPETDB_SERVER_URL=https://your-puppetdb-server.com',
        'PUPPETDB_PORT=8081 (optional, defaults to 8081)',
        'PUPPETDB_TOKEN=your-api-token (optional)',
        'PUPPETDB_SSL_ENABLED=true (optional)',
        'PUPPETDB_SSL_CA=/path/to/ca.pem (optional)',
        'PUPPETDB_SSL_CERT=/path/to/cert.pem (optional)',
        'PUPPETDB_SSL_KEY=/path/to/key.pem (optional)',
        'PUPPETDB_SSL_REJECT_UNAUTHORIZED=true (optional, defaults to true)',
        'PUPPETDB_TIMEOUT=30000 (optional, in milliseconds)',
        'PUPPETDB_RETRY_ATTEMPTS=3 (optional)',
        'PUPPETDB_RETRY_DELAY=1000 (optional, in milliseconds)',
        'Restart the backend server to apply changes',
        'Verify the integration status on the home page'
      ]
    }
  };

  const guide = $derived(setupGuides[integration] || {
    title: 'Integration Setup',
    description: 'Setup guide not available for this integration.',
    steps: []
  });

  function goBack(): void {
    router.navigate('/');
  }
</script>

{#if integration === 'puppetserver'}
  <!-- Use the dedicated Puppetserver setup guide component -->
  <div class="mx-auto max-w-4xl px-4 py-8">
    <button
      type="button"
      onclick={goBack}
      class="mb-4 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M10 19l-7-7m0 0l7-7m-7 7h18"
        />
      </svg>
      Back to Home
    </button>
    <PuppetserverSetupGuide />
  </div>
{:else}
  <!-- Generic setup guide for other integrations -->
  <div class="mx-auto max-w-4xl px-4 py-8">
    <!-- Header -->
    <div class="mb-8">
      <button
        type="button"
        onclick={goBack}
        class="mb-4 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 19l-7-7m0 0l7-7m-7 7h18"
          />
        </svg>
        Back to Home
      </button>

      <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
        {guide.title}
      </h1>
      <p class="mt-2 text-gray-600 dark:text-gray-400">
        {guide.description}
      </p>
    </div>

    <!-- Setup Steps -->
    <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">
        Setup Instructions
      </h2>

      {#if guide.steps.length > 0}
        <ol class="space-y-4">
          {#each guide.steps as step, index}
            <li class="flex gap-4">
              <span
                class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
              >
                {index + 1}
              </span>
              <div class="flex-1 pt-1">
                {#if step.startsWith('PUPPETDB_') || step.includes('=')}
                  <code
                    class="block rounded bg-gray-100 px-3 py-2 text-sm text-gray-900 dark:bg-gray-900 dark:text-gray-100"
                  >
                    {step}
                  </code>
                {:else}
                  <p class="text-gray-700 dark:text-gray-300">{step}</p>
                {/if}
              </div>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="text-gray-600 dark:text-gray-400">
          No setup instructions available for this integration.
        </p>
      {/if}
    </div>

    <!-- Additional Resources -->
    <div class="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-900/20">
      <div class="flex gap-3">
        <svg
          class="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div>
          <h3 class="text-sm font-medium text-blue-900 dark:text-blue-200">
            Need Help?
          </h3>
          <p class="mt-1 text-sm text-blue-700 dark:text-blue-300">
            Check the backend/.env.example file for more configuration options and examples.
          </p>
        </div>
      </div>
    </div>
  </div>
{/if}
