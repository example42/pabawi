<script lang="ts">
  interface Props {
    output: string;
    value?: unknown;
  }

  interface PuppetMetrics {
    changedResources?: number;
    failedResources?: number;
    skippedResources?: number;
    totalResources?: number;
    executionTime?: number;
  }

  let { output, value }: Props = $props();

  // Parse Puppet output for metrics
  const metrics = $derived.by(() => {
    const m: PuppetMetrics = {};

    if (typeof value === 'object' && value !== null) {
      const v = value as Record<string, unknown>;

      // Try to extract metrics from value object
      if (typeof v.changed === 'number') m.changedResources = v.changed;
      if (typeof v.failed === 'number') m.failedResources = v.failed;
      if (typeof v.skipped === 'number') m.skippedResources = v.skipped;
      if (typeof v.total === 'number') m.totalResources = v.total;
      if (typeof v.time === 'number') m.executionTime = v.time;
    }

    // Parse from output text if not in value
    if (output) {
      const changedMatch = /(\d+)\s+resources?\s+changed/i.exec(output);
      if (changedMatch && !m.changedResources) {
        m.changedResources = parseInt(changedMatch[1], 10);
      }

      const failedMatch = /(\d+)\s+resources?\s+failed/i.exec(output);
      if (failedMatch && !m.failedResources) {
        m.failedResources = parseInt(failedMatch[1], 10);
      }

      const skippedMatch = /(\d+)\s+resources?\s+skipped/i.exec(output);
      if (skippedMatch && !m.skippedResources) {
        m.skippedResources = parseInt(skippedMatch[1], 10);
      }

      const timeMatch = /Finished catalog run in ([\d.]+) seconds/i.exec(output);
      if (timeMatch && !m.executionTime) {
        m.executionTime = parseFloat(timeMatch[1]);
      }
    }

    return m;
  });

  // Parse resource changes from output
  const resourceChanges = $derived.by(() => {
    if (!output) return [];

    const changes: Array<{
      type: string;
      title: string;
      status: 'changed' | 'failed' | 'skipped' | 'unchanged';
      message?: string;
    }> = [];

    // Look for resource change patterns in Puppet output
    // Example: "Notice: /Stage[main]/Profile::Base/Package[vim]/ensure: created"
    const changePattern = /(Notice|Warning|Error):\s+\/([^/]+(?:\/[^/]+)*?)\/([^:]+):\s+(.+)/g;
    let match;

    while ((match = changePattern.exec(output)) !== null) {
      const [, level, path, resource, message] = match;

      let status: 'changed' | 'failed' | 'skipped' | 'unchanged' = 'unchanged';
      if (level === 'Error') {
        status = 'failed';
      } else if (message.includes('created') || message.includes('changed') || message.includes('ensure changed')) {
        status = 'changed';
      } else if (message.includes('skipped')) {
        status = 'skipped';
      }

      changes.push({
        type: path,
        title: resource,
        status,
        message,
      });
    }

    return changes;
  });

  // Format execution time
  function formatTime(seconds?: number): string {
    if (seconds === undefined) return 'N/A';
    if (seconds < 60) return `${seconds.toFixed(2)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
  }
</script>

<div class="space-y-4">
  <!-- Metrics Summary -->
  {#if Object.keys(metrics).length > 0}
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {#if metrics.changedResources !== undefined}
        <div class="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900/50 dark:bg-green-900/20">
          <div class="text-2xl font-bold text-green-700 dark:text-green-400">
            {metrics.changedResources}
          </div>
          <div class="text-xs text-green-600 dark:text-green-500">Changed</div>
        </div>
      {/if}

      {#if metrics.failedResources !== undefined}
        <div class="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-900/20">
          <div class="text-2xl font-bold text-red-700 dark:text-red-400">
            {metrics.failedResources}
          </div>
          <div class="text-xs text-red-600 dark:text-red-500">Failed</div>
        </div>
      {/if}

      {#if metrics.skippedResources !== undefined}
        <div class="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900/50 dark:bg-yellow-900/20">
          <div class="text-2xl font-bold text-yellow-700 dark:text-yellow-400">
            {metrics.skippedResources}
          </div>
          <div class="text-xs text-yellow-600 dark:text-yellow-500">Skipped</div>
        </div>
      {/if}

      {#if metrics.executionTime !== undefined}
        <div class="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/50 dark:bg-blue-900/20">
          <div class="text-2xl font-bold text-blue-700 dark:text-blue-400">
            {formatTime(metrics.executionTime)}
          </div>
          <div class="text-xs text-blue-600 dark:text-blue-500">Duration</div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Resource Changes -->
  {#if resourceChanges.length > 0}
    <div>
      <h4 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        Resource Changes ({resourceChanges.length})
      </h4>
      <div class="space-y-2">
        {#each resourceChanges as change}
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
            <div class="flex items-start gap-2">
              <!-- Status Indicator -->
              <div class="mt-0.5">
                {#if change.status === 'changed'}
                  <svg class="h-5 w-5 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                  </svg>
                {:else if change.status === 'failed'}
                  <svg class="h-5 w-5 text-red-600 dark:text-red-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                  </svg>
                {:else if change.status === 'skipped'}
                  <svg class="h-5 w-5 text-yellow-600 dark:text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z" clip-rule="evenodd" />
                  </svg>
                {:else}
                  <svg class="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-2a6 6 0 100-12 6 6 0 000 12z" clip-rule="evenodd" />
                  </svg>
                {/if}
              </div>

              <!-- Resource Info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {change.type}
                  </span>
                  <span class="text-sm font-mono text-gray-900 dark:text-white">
                    {change.title}
                  </span>
                </div>
                {#if change.message}
                  <div class="mt-1 text-xs text-gray-600 dark:text-gray-400">
                    {change.message}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Full Output -->
  {#if output}
    <div>
      <h4 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
        Full Output
      </h4>
      <div class="rounded-lg border border-gray-200 bg-gray-900 p-4 dark:border-gray-700">
        <pre class="whitespace-pre-wrap text-xs text-gray-100 font-mono overflow-x-auto">{output}</pre>
      </div>
    </div>
  {/if}
</div>
