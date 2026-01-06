<script lang="ts">
  import StatusBadge from './StatusBadge.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import { expertMode } from '../lib/expertMode.svelte';

  interface IntegrationStatus {
    name: string;
    type: 'execution' | 'information' | 'both';
    status: 'connected' | 'disconnected' | 'error' | 'not_configured' | 'degraded';
    lastCheck: string;
    message?: string;
    details?: unknown;
    workingCapabilities?: string[];
    failingCapabilities?: string[];
    // Expert mode fields
    endpoint?: string;
    lastError?: string;
    connectionAttempts?: number;
    responseTime?: number;
  }

  interface Props {
    integrations: IntegrationStatus[];
    loading?: boolean;
    onRefresh?: () => void;
  }

  let { integrations, loading = false, onRefresh }: Props = $props();

  // Map integration status to badge status
  function getStatusBadgeType(status: string): 'success' | 'failed' | 'running' | 'pending' {
    switch (status) {
      case 'connected':
        return 'success';
      case 'degraded':
        return 'running'; // Use warning/running badge for degraded
      case 'error':
      case 'disconnected':
        return 'failed';
      case 'not_configured':
        return 'pending';
      default:
        return 'running';
    }
  }

  // Get setup URL for integration
  function getSetupUrl(name: string): string {
    return `/integrations/${name}/setup`;
  }



  // Format last check time
  function formatLastCheck(timestamp: string): string {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;

      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;

      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return 'Unknown';
    }
  }

  // Get icon for integration type
  function getTypeIcon(type: string): string {
    switch (type) {
      case 'execution':
        return 'M13 10V3L4 14h7v7l9-11h-7z'; // Lightning bolt
      case 'information':
        return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'; // Info circle
      case 'both':
        return 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'; // Shield check
      default:
        return 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'; // Check circle
    }
  }

  // Get integration-specific icon (overrides type icon for specific integrations)
  function getIntegrationIcon(name: string, type: string): string {
    switch (name) {
      case 'hiera':
        // Hiera uses a hierarchical/layers icon
        return 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10';
      case 'puppetdb':
        // Database icon
        return 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4';
      case 'puppetserver':
        // Server icon
        return 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01';
      case 'bolt':
        // Lightning bolt icon
        return 'M13 10V3L4 14h7v7l9-11h-7z';
      default:
        return getTypeIcon(type);
    }
  }

  // Get Hiera-specific details for display
  function getHieraDetails(integration: IntegrationStatus): {
    keyCount?: number;
    fileCount?: number;
    controlRepoPath?: string;
    lastScanTime?: string;
    hieraConfigValid?: boolean;
    factSourceAvailable?: boolean;
    controlRepoAccessible?: boolean;
    status?: string;
    structure?: Record<string, boolean>;
    warnings?: string[];
  } | null {
    if (integration.name !== 'hiera' || !integration.details) {
      return null;
    }
    const details = integration.details as Record<string, unknown>;
    return {
      keyCount: typeof details.keyCount === 'number' ? details.keyCount : undefined,
      fileCount: typeof details.fileCount === 'number' ? details.fileCount : undefined,
      controlRepoPath: typeof details.controlRepoPath === 'string' ? details.controlRepoPath : undefined,
      lastScanTime: typeof details.lastScanTime === 'string' ? details.lastScanTime : undefined,
      hieraConfigValid: typeof details.hieraConfigValid === 'boolean' ? details.hieraConfigValid : undefined,
      factSourceAvailable: typeof details.factSourceAvailable === 'boolean' ? details.factSourceAvailable : undefined,
      controlRepoAccessible: typeof details.controlRepoAccessible === 'boolean' ? details.controlRepoAccessible : undefined,
      status: typeof details.status === 'string' ? details.status : undefined,
      structure: typeof details.structure === 'object' && details.structure !== null
        ? details.structure as Record<string, boolean>
        : undefined,
      warnings: Array.isArray(details.warnings) ? details.warnings as string[] : undefined,
    };
  }

  // Get integration-specific troubleshooting steps
  function getTroubleshootingSteps(integration: IntegrationStatus): string[] {
    if (integration.name === 'hiera') {
      if (integration.status === 'not_configured') {
        return [
          'Set HIERA_CONTROL_REPO_PATH environment variable to your control repository path',
          'Ensure the control repository contains a valid hiera.yaml file',
          'Verify the hieradata directory exists (data/, hieradata/, or hiera/)',
          'Check the setup instructions for required configuration options',
        ];
      } else if (integration.status === 'error' || integration.status === 'disconnected') {
        return [
          'Verify the control repository path exists and is accessible',
          'Check that hiera.yaml is valid YAML and follows Hiera 5 format',
          'Ensure the hieradata directory contains valid YAML/JSON files',
          'Review the error details for specific file or syntax issues',
          'Try reloading the integration after fixing any issues',
        ];
      } else if (integration.status === 'degraded') {
        return [
          'Some Hiera features may be unavailable - check warnings for details',
          'Verify PuppetDB connection if fact resolution is failing',
          'Check for syntax errors in hieradata files',
          'Try refreshing to see if issues resolve',
        ];
      }
    }

    // Default troubleshooting steps
    if (integration.status === 'not_configured') {
      return [
        'Configure the integration using environment variables or config file',
        'Check the setup instructions for required parameters',
      ];
    } else if (integration.status === 'error' || integration.status === 'disconnected') {
      return [
        'Verify if you have the command available',
        'Verify the service is running and accessible',
        'Check network connectivity and firewall rules',
        'Verify authentication credentials are correct',
        'Review service logs for detailed error information',
      ];
    } else if (integration.status === 'degraded') {
      return [
        'Some capabilities are failing - check logs for details',
        'Working capabilities can still be used normally',
        'Try refreshing to see if issues resolve',
      ];
    }

    return [];
  }

  // Get Hiera-specific error information for actionable display
  function getHieraErrorInfo(integration: IntegrationStatus): { errors: string[]; warnings: string[]; structure?: Record<string, boolean> } | null {
    if (integration.name !== 'hiera' || !integration.details) {
      return null;
    }
    const details = integration.details as Record<string, unknown>;
    return {
      errors: Array.isArray(details.errors) ? details.errors as string[] : [],
      warnings: Array.isArray(details.warnings) ? details.warnings as string[] : [],
      structure: typeof details.structure === 'object' && details.structure !== null
        ? details.structure as Record<string, boolean>
        : undefined,
    };
  }

  // Get actionable message for Hiera errors
  function getHieraActionableMessage(errorInfo: { errors: string[]; warnings: string[]; structure?: Record<string, boolean> }): string {
    if (errorInfo.errors.length > 0) {
      const firstError = errorInfo.errors[0];
      if (firstError.includes('does not exist')) {
        return 'The control repository path does not exist. Check the HIERA_CONTROL_REPO_PATH environment variable.';
      }
      if (firstError.includes('hiera.yaml not found')) {
        return 'No hiera.yaml file found. Ensure your control repository has a valid Hiera 5 configuration.';
      }
      if (firstError.includes('not a directory')) {
        return 'The configured path is not a directory. Provide a path to your control repository root.';
      }
      if (firstError.includes('Cannot access')) {
        return 'Cannot access the control repository. Check file permissions and path accessibility.';
      }
    }
    return 'Check the error details below for more information.';
  }

  // Get display name for integration
  function getDisplayName(name: string): string {
    // Capitalize first letter and replace hyphens with spaces
    return name
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
</script>

<div class="space-y-4">
  <!-- Header with refresh button -->
  <div class="flex items-center justify-between">
    <h3 class="text-lg font-medium text-gray-900 dark:text-white">
      Integration Status
    </h3>
    {#if onRefresh}
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-600 dark:hover:bg-gray-700"
        onclick={onRefresh}
        disabled={loading}
      >
        <svg
          class="h-4 w-4 {loading ? 'animate-spin' : ''}"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        Refresh
      </button>
    {/if}
  </div>

  <!-- Loading state -->
  {#if loading && integrations.length === 0}
    <div class="flex justify-center py-8">
      <LoadingSpinner size="md" message="Loading integration status..." />
    </div>
  {:else if integrations.length === 0}
    <!-- Empty state -->
    <div class="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center dark:border-gray-700">
      <svg
        class="mx-auto h-12 w-12 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
      <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">
        No integrations configured
      </h3>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Configure integrations to see their status here
      </p>
    </div>
  {:else}
    <!-- Integration cards -->
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each integrations as integration (integration.name)}
        <div
          class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
        >
          <!-- Header with icon and name -->
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-3">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-lg {integration.status === 'connected'
                  ? 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400'
                  : integration.status === 'degraded'
                    ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400'
                    : integration.status === 'not_configured'
                      ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                      : 'bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400'}"
              >
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d={getIntegrationIcon(integration.name, integration.type)}
                  />
                </svg>
              </div>
              <div>
                <h4 class="text-sm font-medium text-gray-900 dark:text-white">
                  {getDisplayName(integration.name)}
                </h4>
                <p class="text-xs text-gray-500 dark:text-gray-400 capitalize">
                  {integration.type}
                </p>
              </div>
            </div>
            <StatusBadge status={getStatusBadgeType(integration.status)} size="sm" />
          </div>

          <!-- Status details -->
          <div class="mt-4 space-y-2">
            <div class="flex items-center justify-between text-xs">
              <span class="text-gray-500 dark:text-gray-400">Last checked:</span>
              <span class="font-medium text-gray-700 dark:text-gray-300">
                {formatLastCheck(integration.lastCheck)}
              </span>
            </div>

            {#if integration.status === 'degraded' && (integration.workingCapabilities || integration.failingCapabilities)}
              <div class="mt-3 space-y-2">
                {#if integration.workingCapabilities && integration.workingCapabilities.length > 0}
                  <div>
                    <p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Working:</p>
                    <div class="flex flex-wrap gap-1">
                      {#each integration.workingCapabilities as capability}
                        <span class="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20 dark:bg-green-900/20 dark:text-green-400">
                          {capability}
                        </span>
                      {/each}
                    </div>
                  </div>
                {/if}
                {#if integration.failingCapabilities && integration.failingCapabilities.length > 0}
                  <div>
                    <p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Failing:</p>
                    <div class="flex flex-wrap gap-1">
                      {#each integration.failingCapabilities as capability}
                        <span class="inline-flex items-center rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20 dark:bg-red-900/20 dark:text-red-400">
                          {capability}
                        </span>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>
            {/if}

            {#if integration.message}
              <div class="mt-2">
                <p
                  class="text-xs {integration.status === 'connected'
                    ? 'text-gray-600 dark:text-gray-400'
                    : integration.status === 'degraded'
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : integration.status === 'not_configured'
                        ? 'text-gray-600 dark:text-gray-400'
                        : 'text-red-600 dark:text-red-400'}"
                >
                  {integration.message}
                </p>
              </div>
            {/if}

            <!-- Hiera-specific connected status details -->
            {#if integration.name === 'hiera' && integration.status === 'connected'}
              {@const hieraDetails = getHieraDetails(integration)}
              {#if hieraDetails}
                <div class="mt-3 grid grid-cols-2 gap-2">
                  {#if hieraDetails.keyCount !== undefined}
                    <div class="rounded-md bg-green-50 px-2 py-1 dark:bg-green-900/20">
                      <p class="text-xs text-green-600 dark:text-green-400">
                        <span class="font-semibold">{hieraDetails.keyCount}</span> keys
                      </p>
                    </div>
                  {/if}
                  {#if hieraDetails.fileCount !== undefined}
                    <div class="rounded-md bg-green-50 px-2 py-1 dark:bg-green-900/20">
                      <p class="text-xs text-green-600 dark:text-green-400">
                        <span class="font-semibold">{hieraDetails.fileCount}</span> files
                      </p>
                    </div>
                  {/if}
                </div>
              {/if}
            {/if}

            <!-- Setup Instructions link - always visible -->
            <div class="mt-3">
              <a
                href={getSetupUrl(integration.name)}
                class="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                Setup Instructions
              </a>
            </div>



            {#if integration.details && integration.status === 'error'}
              <!-- Hiera-specific error display -->
              {#if integration.name === 'hiera'}
                {@const hieraErrorInfo = getHieraErrorInfo(integration)}
                {#if hieraErrorInfo}
                  <div class="mt-3 space-y-2">
                    <!-- Actionable message -->
                    <div class="rounded-md bg-red-50 p-3 dark:bg-red-900/20">
                      <div class="flex items-start gap-2">
                        <svg class="h-4 w-4 text-red-500 dark:text-red-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <p class="text-xs text-red-700 dark:text-red-300">
                          {getHieraActionableMessage(hieraErrorInfo)}
                        </p>
                      </div>
                    </div>

                    <!-- Specific errors -->
                    {#if hieraErrorInfo.errors.length > 0}
                      <div class="space-y-1">
                        <p class="text-xs font-medium text-red-700 dark:text-red-300">Errors:</p>
                        <ul class="list-inside list-disc space-y-1 pl-2">
                          {#each hieraErrorInfo.errors as error}
                            <li class="text-xs text-red-600 dark:text-red-400">{error}</li>
                          {/each}
                        </ul>
                      </div>
                    {/if}

                    <!-- Warnings -->
                    {#if hieraErrorInfo.warnings.length > 0}
                      <div class="space-y-1">
                        <p class="text-xs font-medium text-yellow-700 dark:text-yellow-300">Warnings:</p>
                        <ul class="list-inside list-disc space-y-1 pl-2">
                          {#each hieraErrorInfo.warnings as warning}
                            <li class="text-xs text-yellow-600 dark:text-yellow-400">{warning}</li>
                          {/each}
                        </ul>
                      </div>
                    {/if}

                    <!-- Repository structure -->
                    {#if hieraErrorInfo.structure}
                      <details class="mt-2">
                        <summary class="cursor-pointer text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
                          Repository structure check
                        </summary>
                        <div class="mt-2 grid grid-cols-2 gap-1 text-xs">
                          {#each Object.entries(hieraErrorInfo.structure) as [key, value]}
                            <div class="flex items-center gap-1">
                              {#if value}
                                <svg class="h-3 w-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                                </svg>
                              {:else}
                                <svg class="h-3 w-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              {/if}
                              <span class="text-gray-600 dark:text-gray-400">{key.replace(/^has/, '').replace(/([A-Z])/g, ' $1').trim()}</span>
                            </div>
                          {/each}
                        </div>
                      </details>
                    {/if}
                  </div>
                {/if}
              {:else}
                <!-- Generic error details for other integrations -->
                <details class="mt-2">
                  <summary
                    class="cursor-pointer text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                  >
                    Show error details
                  </summary>
                  <pre
                    class="mt-2 overflow-x-auto rounded bg-gray-100 p-2 text-xs text-gray-900 dark:bg-gray-900 dark:text-gray-100"
                  >{JSON.stringify(integration.details, null, 2)}</pre>
                </details>
              {/if}
            {/if}

            <!-- Expert Mode Information -->
            {#if expertMode.enabled}
              <div class="mt-3 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
                <div class="flex items-center gap-2">
                  <svg class="h-4 w-4 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <h5 class="text-xs font-semibold text-amber-900 dark:text-amber-200">Expert Mode Details</h5>
                </div>

                {#if integration.endpoint}
                  <div class="text-xs">
                    <span class="font-medium text-amber-800 dark:text-amber-300">Endpoint:</span>
                    <code class="ml-1 rounded bg-amber-100 px-1 py-0.5 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">{integration.endpoint}</code>
                  </div>
                {/if}

                <!-- Hiera-specific expert mode details -->
                {#if integration.name === 'hiera'}
                  {@const hieraDetails = getHieraDetails(integration)}
                  {#if hieraDetails?.controlRepoPath}
                    <div class="text-xs">
                      <span class="font-medium text-amber-800 dark:text-amber-300">Control Repo:</span>
                      <code class="ml-1 rounded bg-amber-100 px-1 py-0.5 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">{hieraDetails.controlRepoPath}</code>
                    </div>
                  {/if}

                  <!-- Diagnostic status indicators -->
                  <div class="mt-2 grid grid-cols-2 gap-2">
                    {#if hieraDetails?.controlRepoAccessible !== undefined}
                      <div class="flex items-center gap-1 text-xs">
                        {#if hieraDetails.controlRepoAccessible}
                          <svg class="h-3 w-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                          <span class="text-amber-700 dark:text-amber-300">Repo accessible</span>
                        {:else}
                          <svg class="h-3 w-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          <span class="text-red-600 dark:text-red-400">Repo inaccessible</span>
                        {/if}
                      </div>
                    {/if}
                    {#if hieraDetails?.hieraConfigValid !== undefined}
                      <div class="flex items-center gap-1 text-xs">
                        {#if hieraDetails.hieraConfigValid}
                          <svg class="h-3 w-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                          <span class="text-amber-700 dark:text-amber-300">hiera.yaml valid</span>
                        {:else}
                          <svg class="h-3 w-3 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          <span class="text-red-600 dark:text-red-400">hiera.yaml invalid</span>
                        {/if}
                      </div>
                    {/if}
                    {#if hieraDetails?.factSourceAvailable !== undefined}
                      <div class="flex items-center gap-1 text-xs">
                        {#if hieraDetails.factSourceAvailable}
                          <svg class="h-3 w-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                          </svg>
                          <span class="text-amber-700 dark:text-amber-300">Facts available</span>
                        {:else}
                          <svg class="h-3 w-3 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <span class="text-yellow-600 dark:text-yellow-400">No fact source</span>
                        {/if}
                      </div>
                    {/if}
                  </div>

                  {#if hieraDetails?.lastScanTime}
                    <div class="text-xs">
                      <span class="font-medium text-amber-800 dark:text-amber-300">Last Scan:</span>
                      <span class="ml-1 text-amber-700 dark:text-amber-300">{hieraDetails.lastScanTime}</span>
                    </div>
                  {/if}
                  {#if hieraDetails?.keyCount !== undefined}
                    <div class="text-xs">
                      <span class="font-medium text-amber-800 dark:text-amber-300">Total Keys:</span>
                      <span class="ml-1 text-amber-700 dark:text-amber-300">{hieraDetails.keyCount}</span>
                    </div>
                  {/if}
                  {#if hieraDetails?.fileCount !== undefined}
                    <div class="text-xs">
                      <span class="font-medium text-amber-800 dark:text-amber-300">Total Files:</span>
                      <span class="ml-1 text-amber-700 dark:text-amber-300">{hieraDetails.fileCount}</span>
                    </div>
                  {/if}

                  <!-- Repository structure in expert mode -->
                  {#if hieraDetails?.structure}
                    <details class="mt-2">
                      <summary class="cursor-pointer text-xs font-medium text-amber-800 dark:text-amber-300">
                        Repository Structure
                      </summary>
                      <div class="mt-2 grid grid-cols-2 gap-1 text-xs">
                        {#each Object.entries(hieraDetails.structure) as [key, value]}
                          <div class="flex items-center gap-1">
                            {#if value}
                              <svg class="h-3 w-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                              </svg>
                            {:else}
                              <svg class="h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
                              </svg>
                            {/if}
                            <span class="text-amber-700 dark:text-amber-300">{key.replace(/^has/, '').replace(/([A-Z])/g, ' $1').trim()}</span>
                          </div>
                        {/each}
                      </div>
                    </details>
                  {/if}

                  <!-- Warnings in expert mode -->
                  {#if hieraDetails?.warnings && hieraDetails.warnings.length > 0}
                    <div class="mt-2 rounded-md bg-yellow-100 p-2 dark:bg-yellow-900/30">
                      <p class="text-xs font-medium text-yellow-800 dark:text-yellow-200">⚠️ Warnings:</p>
                      <ul class="mt-1 list-inside list-disc space-y-1 pl-2">
                        {#each hieraDetails.warnings as warning}
                          <li class="text-xs text-yellow-700 dark:text-yellow-300">{warning}</li>
                        {/each}
                      </ul>
                    </div>
                  {/if}
                {/if}

                {#if integration.responseTime !== undefined}
                  <div class="text-xs">
                    <span class="font-medium text-amber-800 dark:text-amber-300">Response Time:</span>
                    <span class="ml-1 text-amber-700 dark:text-amber-300">{integration.responseTime}ms</span>
                  </div>
                {/if}

                {#if integration.connectionAttempts !== undefined}
                  <div class="text-xs">
                    <span class="font-medium text-amber-800 dark:text-amber-300">Connection Attempts:</span>
                    <span class="ml-1 text-amber-700 dark:text-amber-300">{integration.connectionAttempts}</span>
                  </div>
                {/if}

                {#if integration.lastError}
                  <div class="text-xs">
                    <span class="font-medium text-amber-800 dark:text-amber-300">Last Error:</span>
                    <pre class="mt-1 overflow-x-auto rounded bg-amber-100 p-2 text-xs text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">{integration.lastError}</pre>
                  </div>
                {/if}

                <!-- Integration-specific troubleshooting -->
                {#if getTroubleshootingSteps(integration).length > 0}
                  {@const troubleshootingSteps = getTroubleshootingSteps(integration)}
                  <div class="pt-2 text-xs text-amber-700 dark:text-amber-300">
                    <p class="font-medium">🔧 Troubleshooting:</p>
                    <ul class="mt-1 list-inside list-disc space-y-1 pl-2">
                      {#each troubleshootingSteps as step}
                        <li>{step}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
