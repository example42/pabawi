<script lang="ts">
  import JournalTimeline from '../components/JournalTimeline.svelte';

  const pageTitle = 'Pabawi - Journal';

  // Filter input state
  let nodeIdsInput = $state('');
  let groupIdInput = $state('');
  let startDateInput = $state('');
  let endDateInput = $state('');
  let eventTypeInput = $state('');
  let sourceInput = $state('');

  // Applied filters (only update on Apply click)
  let appliedNodeIds = $state<string[] | undefined>(undefined);
  let appliedGroupId = $state<string | undefined>(undefined);
  let appliedStartDate = $state<string | undefined>(undefined);
  let appliedEndDate = $state<string | undefined>(undefined);
  let appliedEventType = $state<string | undefined>(undefined);
  let appliedSource = $state<string | undefined>(undefined);

  const eventTypes = [
    { value: '', label: 'All Event Types' },
    { value: 'provision', label: 'Provisioned' },
    { value: 'destroy', label: 'Destroyed' },
    { value: 'start', label: 'Started' },
    { value: 'stop', label: 'Stopped' },
    { value: 'reboot', label: 'Rebooted' },
    { value: 'suspend', label: 'Suspended' },
    { value: 'resume', label: 'Resumed' },
    { value: 'command_execution', label: 'Command' },
    { value: 'task_execution', label: 'Task' },
    { value: 'puppet_run', label: 'Puppet Run' },
    { value: 'package_install', label: 'Package' },
    { value: 'config_change', label: 'Config Change' },
    { value: 'note', label: 'Note' },
    { value: 'error', label: 'Error' },
    { value: 'warning', label: 'Warning' },
    { value: 'info', label: 'Info' },
  ];

  const sources = [
    { value: '', label: 'All Sources' },
    { value: 'proxmox', label: 'Proxmox' },
    { value: 'aws', label: 'AWS' },
    { value: 'bolt', label: 'Bolt' },
    { value: 'ansible', label: 'Ansible' },
    { value: 'ssh', label: 'SSH' },
    { value: 'puppetdb', label: 'PuppetDB' },
    { value: 'user', label: 'User' },
    { value: 'system', label: 'System' },
  ];

  function applyFilters(): void {
    appliedNodeIds = nodeIdsInput.trim()
      ? nodeIdsInput.split(',').map(s => s.trim()).filter(Boolean)
      : undefined;
    appliedGroupId = groupIdInput.trim() || undefined;
    appliedStartDate = startDateInput
      ? new Date(startDateInput).toISOString()
      : undefined;
    appliedEndDate = endDateInput
      ? new Date(endDateInput).toISOString()
      : undefined;
    appliedEventType = eventTypeInput || undefined;
    appliedSource = sourceInput || undefined;
  }

  function clearFilters(): void {
    nodeIdsInput = '';
    groupIdInput = '';
    startDateInput = '';
    endDateInput = '';
    eventTypeInput = '';
    sourceInput = '';
    applyFilters();
  }
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<div class="w-full px-4 sm:px-6 lg:px-8 py-8">
  <!-- Page Header -->
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-gray-900 dark:text-white">Journal</h1>
    <p class="mt-2 text-gray-600 dark:text-gray-400">
      Cross-node journal timeline
    </p>
  </div>

  <!-- Filter Bar -->
  <div class="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <!-- Node IDs -->
      <div>
        <label for="filter-node-ids" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Node IDs
        </label>
        <input
          id="filter-node-ids"
          type="text"
          bind:value={nodeIdsInput}
          placeholder="Comma-separated node IDs"
          class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
        />
      </div>

      <!-- Group ID -->
      <div>
        <label for="filter-group-id" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Group ID
        </label>
        <input
          id="filter-group-id"
          type="text"
          bind:value={groupIdInput}
          placeholder="Group ID"
          class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
        />
      </div>

      <!-- Event Type -->
      <div>
        <label for="filter-event-type" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Event Type
        </label>
        <select
          id="filter-event-type"
          bind:value={eventTypeInput}
          class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        >
          {#each eventTypes as et}
            <option value={et.value}>{et.label}</option>
          {/each}
        </select>
      </div>

      <!-- Source -->
      <div>
        <label for="filter-source" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Source
        </label>
        <select
          id="filter-source"
          bind:value={sourceInput}
          class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        >
          {#each sources as src}
            <option value={src.value}>{src.label}</option>
          {/each}
        </select>
      </div>

      <!-- Start Date -->
      <div>
        <label for="filter-start-date" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Start Date
        </label>
        <input
          id="filter-start-date"
          type="datetime-local"
          bind:value={startDateInput}
          class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </div>

      <!-- End Date -->
      <div>
        <label for="filter-end-date" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
          End Date
        </label>
        <input
          id="filter-end-date"
          type="datetime-local"
          bind:value={endDateInput}
          class="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
        />
      </div>
    </div>

    <!-- Filter Actions -->
    <div class="mt-4 flex items-center gap-3">
      <button
        type="button"
        onclick={applyFilters}
        class="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
      >
        Apply
      </button>
      <button
        type="button"
        onclick={clearFilters}
        class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 dark:focus:ring-offset-gray-800"
      >
        Clear
      </button>
    </div>
  </div>

  <!-- Journal Timeline -->
  <JournalTimeline
    mode="global"
    active={true}
    nodeIds={appliedNodeIds}
    groupId={appliedGroupId}
    startDate={appliedStartDate}
    endDate={appliedEndDate}
    eventType={appliedEventType}
    source={appliedSource}
  />
</div>
