<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from '../lib/router.svelte';
  import {
    getIntegrationConfigs,
    getIntegrationConfig,
    saveIntegrationConfig,
    deleteIntegrationConfig,
  } from '../lib/api';
  import type { IntegrationConfigRecord } from '../lib/api';
  import { showSuccess, showWarning } from '../lib/toast.svelte';

  /**
   * Known integrations with their display names and expected config fields.
   * Validates Requirements: 21.1
   */
  const KNOWN_INTEGRATIONS = [
    { name: 'proxmox', displayName: 'Proxmox', icon: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2' },
    { name: 'aws', displayName: 'AWS', icon: 'M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z' },
    { name: 'puppetdb', displayName: 'PuppetDB', icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4' },
    { name: 'puppetserver', displayName: 'Puppet Server', icon: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
    { name: 'ansible', displayName: 'Ansible', icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { name: 'hiera', displayName: 'Hiera', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
    { name: 'ssh', displayName: 'SSH', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
  ] as const;

  /** Patterns that indicate a sensitive field */
  const SENSITIVE_PATTERNS = ['token', 'password', 'secret', 'key'];

  /** Check if a field name is sensitive */
  function isSensitiveField(fieldName: string): boolean {
    const lower = fieldName.toLowerCase();
    return SENSITIVE_PATTERNS.some((p) => lower.includes(p));
  }

  // State
  let configs = $state<IntegrationConfigRecord[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let selectedIntegration = $state<string | null>(null);
  let editConfig = $state<Record<string, unknown>>({});
  let saving = $state(false);
  let deleting = $state(false);
  let loadingConfig = $state(false);
  let revealedFields = $state<Set<string>>(new Set());

  /** Map of integration name -> config record for quick lookup */
  const configMap = $derived(
    new Map(configs.map((c) => [c.integrationName, c]))
  );

  /** Get config status for an integration */
  function getStatus(name: string): 'configured' | 'not_configured' {
    return configMap.has(name) ? 'configured' : 'not_configured';
  }

  /** Load all configs */
  async function loadConfigs(): Promise<void> {
    loading = true;
    error = null;
    try {
      configs = await getIntegrationConfigs();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load configs';
    } finally {
      loading = false;
    }
  }

  /** Select an integration and load its effective config */
  async function selectIntegration(name: string): Promise<void> {
    if (selectedIntegration === name) {
      selectedIntegration = null;
      editConfig = {};
      revealedFields = new Set();
      return;
    }
    selectedIntegration = name;
    revealedFields = new Set();
    loadingConfig = true;
    try {
      const effective = await getIntegrationConfig(name);
      editConfig = { ...effective };
    } catch {
      // If no config exists yet, start with empty
      editConfig = {};
    } finally {
      loadingConfig = false;
    }
  }

  /** Save the current config */
  async function handleSave(): Promise<void> {
    if (!selectedIntegration) return;
    saving = true;
    try {
      await saveIntegrationConfig(selectedIntegration, editConfig);
      showSuccess('Config saved', `${selectedIntegration} configuration saved successfully`);
      await loadConfigs();
    } catch (err) {
      showWarning('Save failed', err instanceof Error ? err.message : 'Failed to save config');
    } finally {
      saving = false;
    }
  }

  /** Delete the current config */
  async function handleDelete(): Promise<void> {
    if (!selectedIntegration) return;
    deleting = true;
    try {
      await deleteIntegrationConfig(selectedIntegration);
      showSuccess('Config deleted', `${selectedIntegration} configuration deleted`);
      editConfig = {};
      selectedIntegration = null;
      await loadConfigs();
    } catch (err) {
      showWarning('Delete failed', err instanceof Error ? err.message : 'Failed to delete config');
    } finally {
      deleting = false;
    }
  }

  /** Add a new field to the config */
  function addField(): void {
    const fieldName = prompt('Enter field name:');
    if (fieldName && fieldName.trim()) {
      editConfig = { ...editConfig, [fieldName.trim()]: '' };
    }
  }

  /** Remove a field from the config */
  function removeField(key: string): void {
    const { [key]: _, ...rest } = editConfig;
    editConfig = rest;
  }

  /** Update a field value */
  function updateField(key: string, value: string): void {
    editConfig = { ...editConfig, [key]: value };
  }

  /** Toggle field visibility */
  function toggleReveal(key: string): void {
    const next = new Set(revealedFields);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    revealedFields = next;
  }

  /** Get display value for a field */
  function getDisplayValue(key: string, value: unknown): string {
    const strVal = String(value ?? '');
    if (isSensitiveField(key) && !revealedFields.has(key)) {
      return strVal ? '••••••••' : '';
    }
    return strVal;
  }

  function goBack(): void {
    router.navigate('/');
  }

  onMount(() => {
    void loadConfigs();
  });
</script>

<svelte:head>
  <title>Pabawi - Integration Configs</title>
</svelte:head>

<div class="w-full px-4 sm:px-6 lg:px-8 py-8">
  <!-- Header -->
  <div class="mb-8">
    <button
      type="button"
      onclick={goBack}
      class="mb-4 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
    >
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      Back to Home
    </button>

    <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Integration Configurations</h1>
    <p class="mt-2 text-gray-600 dark:text-gray-400">
      Manage configuration for each registered integration. Sensitive fields are masked by default.
    </p>
  </div>

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      <span class="ml-3 text-gray-600 dark:text-gray-400">Loading configurations...</span>
    </div>
  {:else if error}
    <div class="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-900/20">
      <p class="text-sm text-red-700 dark:text-red-300">{error}</p>
      <button type="button" onclick={() => void loadConfigs()} class="mt-2 text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200 underline">
        Retry
      </button>
    </div>
  {:else}
    <!-- Integration list -->
    <div class="space-y-3">
      {#each KNOWN_INTEGRATIONS as integration}
        {@const status = getStatus(integration.name)}
        {@const isSelected = selectedIntegration === integration.name}

        <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
          <!-- Integration header row -->
          <button
            type="button"
            onclick={() => void selectIntegration(integration.name)}
            class="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left"
            aria-expanded={isSelected}
          >
            <div class="flex items-center gap-3">
              <svg class="h-6 w-6 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={integration.icon} />
              </svg>
              <div>
                <span class="font-medium text-gray-900 dark:text-white">{integration.displayName}</span>
                <span class="ml-2 text-xs text-gray-500 dark:text-gray-400">({integration.name})</span>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {status === 'configured'
                ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}">
                {status === 'configured' ? 'Configured' : 'Not Configured'}
              </span>
              <svg class="h-5 w-5 text-gray-400 transition-transform {isSelected ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          <!-- Config form (expanded) -->
          {#if isSelected}
            <div class="border-t border-gray-200 dark:border-gray-700 p-4">
              {#if loadingConfig}
                <div class="flex items-center justify-center py-6">
                  <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                  <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading config...</span>
                </div>
              {:else}
                <!-- Config fields -->
                <div class="space-y-3">
                  {#each Object.entries(editConfig) as [key, value]}
                    {@const sensitive = isSensitiveField(key)}
                    {@const revealed = revealedFields.has(key)}
                    <div class="flex items-center gap-2">
                      <label for="field-{integration.name}-{key}" class="w-48 text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0 truncate" title={key}>
                        {key}
                      </label>
                      <div class="flex-1 relative">
                        <input
                          id="field-{integration.name}-{key}"
                          type={sensitive && !revealed ? 'password' : 'text'}
                          value={getDisplayValue(key, value)}
                          oninput={(e) => updateField(key, (e.target as HTMLInputElement).value)}
                          class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-500 {sensitive ? 'pr-10' : ''}"
                          placeholder={sensitive ? 'Enter sensitive value...' : 'Enter value...'}
                        />
                        {#if sensitive}
                          <button
                            type="button"
                            onclick={() => toggleReveal(key)}
                            class="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            title={revealed ? 'Hide value' : 'Reveal value'}
                            aria-label={revealed ? `Hide ${key}` : `Reveal ${key}`}
                          >
                            {#if revealed}
                              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                              </svg>
                            {:else}
                              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            {/if}
                          </button>
                        {/if}
                      </div>
                      <button
                        type="button"
                        onclick={() => removeField(key)}
                        class="text-red-400 hover:text-red-600 dark:hover:text-red-300 shrink-0"
                        title="Remove field"
                        aria-label={`Remove ${key}`}
                      >
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  {/each}

                  {#if Object.keys(editConfig).length === 0}
                    <p class="text-sm text-gray-500 dark:text-gray-400 py-2">No configuration fields. Add a field to get started.</p>
                  {/if}
                </div>

                <!-- Actions -->
                <div class="mt-4 flex items-center gap-3 border-t border-gray-200 dark:border-gray-700 pt-4">
                  <button
                    type="button"
                    onclick={addField}
                    class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  >
                    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Add Field
                  </button>
                  <button
                    type="button"
                    onclick={handleSave}
                    disabled={saving || Object.keys(editConfig).length === 0}
                    class="inline-flex items-center gap-1.5 rounded-md bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {#if saving}
                      <div class="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    {/if}
                    Save Config
                  </button>
                  {#if status === 'configured'}
                    <button
                      type="button"
                      onclick={handleDelete}
                      disabled={deleting}
                      class="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:bg-gray-700 dark:text-red-400 dark:hover:bg-red-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {#if deleting}
                        <div class="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                      {/if}
                      Delete Config
                    </button>
                  {/if}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
