<!--
  Settings Administration Page

  Manages application settings and configuration.

  @module pages/admin/SettingsPage
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../../components/LoadingSpinner.svelte';
  import ErrorAlert from '../../components/ErrorAlert.svelte';
  import { AdminOnly } from '../../components';
  import { get, post } from '../../lib/api';
  import { showSuccess, showError } from '../../lib/toast.svelte';
  import type { DebugInfo } from '../../lib/api';

  const pageTitle = 'Pabawi - Settings';

  // ==========================================================================
  // Types
  // ==========================================================================

  interface SettingsSection {
    id: string;
    title: string;
    description: string;
    settings: Setting[];
  }

  interface Setting {
    key: string;
    label: string;
    description: string;
    type: 'string' | 'number' | 'boolean' | 'select';
    value: unknown;
    options?: { label: string; value: string }[];
    readOnly?: boolean;
  }

  // ==========================================================================
  // State
  // ==========================================================================

  let sections = $state<SettingsSection[]>([]);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let debugInfo = $state<DebugInfo | null>(null);

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    document.title = pageTitle;
    void loadSettings();
  });

  // ==========================================================================
  // API Functions
  // ==========================================================================

  async function loadSettings(): Promise<void> {
    loading = true;
    error = null;

    try {
      const response = await get<{ sections: SettingsSection[]; debugInfo?: DebugInfo }>('/api/settings');
      sections = response.sections || [];
      debugInfo = response.debugInfo || null;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load settings';
      // Settings API might not be implemented yet
      sections = [];
    } finally {
      loading = false;
    }
  }

  async function saveSettings(): Promise<void> {
    saving = true;
    try {
      const settingsData: Record<string, unknown> = {};
      for (const section of sections) {
        for (const setting of section.settings) {
          if (!setting.readOnly) {
            settingsData[setting.key] = setting.value;
          }
        }
      }
      await post('/api/settings', settingsData);
      showSuccess('Settings saved successfully');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      saving = false;
    }
  }
</script>

<AdminOnly>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="mb-8 flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
            Configure application settings and preferences.
          </p>
        </div>
        {#if sections.length > 0}
          <button
            onclick={saveSettings}
            disabled={saving}
            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if saving}
              <LoadingSpinner size="sm" class="mr-2" />
              Saving...
            {:else}
              Save Changes
            {/if}
          </button>
        {/if}
      </div>

      {#if loading}
        <div class="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      {:else if error}
        <ErrorAlert
          title="Failed to load settings"
          message={error}
          onRetry={loadSettings}
        />
      {:else if sections.length === 0}
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">No configurable settings</h3>
          <p class="mt-2 text-gray-500 dark:text-gray-400">
            Settings are managed via environment variables and configuration files.
          </p>
        </div>
      {:else}
        <!-- Settings Sections -->
        <div class="space-y-6">
          {#each sections as section}
            <div class="bg-white dark:bg-gray-800 shadow rounded-lg">
              <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-lg font-medium text-gray-900 dark:text-white">{section.title}</h2>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{section.description}</p>
              </div>
              <div class="px-6 py-4 space-y-4">
                {#each section.settings as setting}
                  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                    <div class="mb-2 sm:mb-0">
                      <label for={setting.key} class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {setting.label}
                      </label>
                      <p class="text-xs text-gray-500 dark:text-gray-400">{setting.description}</p>
                    </div>
                    <div class="sm:ml-4">
                      {#if setting.type === 'boolean'}
                        <button
                          type="button"
                          onclick={() => setting.value = !setting.value}
                          disabled={setting.readOnly}
                          class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed {setting.value ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'}"
                        >
                          <span class="sr-only">Toggle {setting.label}</span>
                          <span
                            class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out {setting.value ? 'translate-x-5' : 'translate-x-0'}"
                          ></span>
                        </button>
                      {:else if setting.type === 'select'}
                        <select
                          id={setting.key}
                          bind:value={setting.value}
                          disabled={setting.readOnly}
                          class="block w-full sm:w-48 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {#each setting.options || [] as option}
                            <option value={option.value}>{option.label}</option>
                          {/each}
                        </select>
                      {:else if setting.type === 'number'}
                        <input
                          type="number"
                          id={setting.key}
                          bind:value={setting.value}
                          disabled={setting.readOnly}
                          class="block w-full sm:w-32 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      {:else}
                        <input
                          type="text"
                          id={setting.key}
                          bind:value={setting.value}
                          disabled={setting.readOnly}
                          class="block w-full sm:w-64 rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Fallback for non-admins -->
  {#snippet fallback()}
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
      <div class="text-center p-8">
        <svg class="mx-auto h-16 w-16 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <h2 class="mt-4 text-2xl font-bold text-gray-900 dark:text-white">Administrator Access Required</h2>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
          You need administrator privileges to access Settings.
        </p>
      </div>
    </div>
  {/snippet}
</AdminOnly>
