<script lang="ts">
  import type { ProxmoxVMParams, ProxmoxLXCParams, PVENode, StorageContent } from '../lib/types/provisioning';
  import { validateVMID, validateHostname, validateMemory, validateRequired, validateNumericRange } from '../lib/validation';
  import { createProxmoxVM, createProxmoxLXC, getProxmoxNodes, getProxmoxNextVMID, getProxmoxISOs, getProxmoxTemplates } from '../lib/api';
  import { showSuccess, showError } from '../lib/toast.svelte';
  import { logger } from '../lib/logger.svelte';

  /**
   * ProxmoxProvisionForm Component
   *
   * Provides a tabbed interface for creating Proxmox VMs and LXC containers.
   * Auto-populates VMID (next available), PVE node (dropdown), and ISO/template (dropdown)
   * from the Proxmox API.
   */

  // State management using Svelte 5 runes
  let activeTab = $state<'vm' | 'lxc'>('vm');
  let formData = $state<ProxmoxVMParams | ProxmoxLXCParams>({} as ProxmoxVMParams);
  let validationErrors = $state<Record<string, string>>({});
  let submitting = $state(false);

  // Dynamic data from Proxmox API
  let pveNodes = $state<PVENode[]>([]);
  let isoImages = $state<StorageContent[]>([]);
  let osTemplates = $state<StorageContent[]>([]);
  let loadingNodes = $state(false);
  let loadingVMID = $state(false);
  let loadingISOs = $state(false);
  let loadingTemplates = $state(false);

  /**
   * Computed property to check if form is valid
   */
  let isFormValid = $derived.by(() => {
    if (activeTab === 'vm') {
      const vmData = formData as ProxmoxVMParams;
      if (!vmData.vmid || !vmData.name || !vmData.node) return false;
      return Object.keys(validationErrors).length === 0;
    } else {
      const lxcData = formData as ProxmoxLXCParams;
      if (!lxcData.vmid || !lxcData.hostname || !lxcData.node || !lxcData.ostemplate) return false;
      return Object.keys(validationErrors).length === 0;
    }
  });

  /**
   * Fetch PVE nodes and next VMID on mount
   */
  async function loadInitialData(): Promise<void> {
    loadingNodes = true;
    loadingVMID = true;
    try {
      const [nodes, vmid] = await Promise.all([
        getProxmoxNodes().catch((e) => { logger.error('ProxmoxProvisionForm', 'loadInitialData', 'Failed to fetch nodes', e); return [] as PVENode[]; }),
        getProxmoxNextVMID().catch((e) => { logger.error('ProxmoxProvisionForm', 'loadInitialData', 'Failed to fetch next VMID', e); return undefined; }),
      ]);
      pveNodes = nodes;
      if (vmid !== undefined) {
        (formData as ProxmoxVMParams).vmid = vmid;
      }
    } finally {
      loadingNodes = false;
      loadingVMID = false;
    }
  }

  // Load initial data on component mount
  loadInitialData();

  /**
   * When node selection changes, fetch ISOs or templates for that node
   */
  async function onNodeChange(node: string): Promise<void> {
    if (!node) return;

    if (activeTab === 'vm') {
      loadingISOs = true;
      isoImages = [];
      try {
        isoImages = await getProxmoxISOs(node);
      } catch (e) {
        logger.error('ProxmoxProvisionForm', 'onNodeChange', 'Failed to fetch ISOs', e as Error);
      } finally {
        loadingISOs = false;
      }
    } else {
      loadingTemplates = true;
      osTemplates = [];
      try {
        osTemplates = await getProxmoxTemplates(node);
      } catch (e) {
        logger.error('ProxmoxProvisionForm', 'onNodeChange', 'Failed to fetch templates', e as Error);
      } finally {
        loadingTemplates = false;
      }
    }
  }

  /**
   * Validate a single field
   */
  function validateField(fieldName: string): void {
    let error: string | null = null;

    if (activeTab === 'vm') {
      const vmData = formData as ProxmoxVMParams;
      switch (fieldName) {
        case 'vmid':
          error = validateRequired(vmData.vmid, 'VMID') || validateVMID(vmData.vmid);
          break;
        case 'name':
          error = validateRequired(vmData.name, 'Name') || validateHostname(vmData.name);
          break;
        case 'node':
          error = validateRequired(vmData.node, 'Node');
          break;
        case 'cores':
          if (vmData.cores !== undefined && vmData.cores !== null) error = validateNumericRange(vmData.cores, 1, 128, 'Cores');
          break;
        case 'memory':
          if (vmData.memory !== undefined && vmData.memory !== null) error = validateMemory(vmData.memory);
          break;
        case 'sockets':
          if (vmData.sockets !== undefined && vmData.sockets !== null) error = validateNumericRange(vmData.sockets, 1, 4, 'Sockets');
          break;
      }
    } else {
      const lxcData = formData as ProxmoxLXCParams;
      switch (fieldName) {
        case 'vmid':
          error = validateRequired(lxcData.vmid, 'VMID') || validateVMID(lxcData.vmid);
          break;
        case 'hostname':
          error = validateRequired(lxcData.hostname, 'Hostname') || validateHostname(lxcData.hostname);
          break;
        case 'node':
          error = validateRequired(lxcData.node, 'Node');
          break;
        case 'ostemplate':
          error = validateRequired(lxcData.ostemplate, 'OS Template');
          break;
        case 'cores':
          if (lxcData.cores !== undefined && lxcData.cores !== null) error = validateNumericRange(lxcData.cores, 1, 128, 'Cores');
          break;
        case 'memory':
          if (lxcData.memory !== undefined && lxcData.memory !== null) error = validateMemory(lxcData.memory);
          break;
      }
    }

    if (error) {
      validationErrors[fieldName] = error;
    } else {
      delete validationErrors[fieldName];
    }
    validationErrors = { ...validationErrors };
  }

  /**
   * Switch between VM and LXC tabs
   */
  async function switchTab(tab: 'vm' | 'lxc'): Promise<void> {
    activeTab = tab;
    validationErrors = {};
    isoImages = [];
    osTemplates = [];

    // Preserve VMID from current form or fetch a new one
    const currentVmid = (formData as ProxmoxVMParams).vmid;
    formData = {} as ProxmoxVMParams | ProxmoxLXCParams;

    // Re-fetch next VMID
    loadingVMID = true;
    try {
      const vmid = await getProxmoxNextVMID();
      (formData as ProxmoxVMParams).vmid = vmid;
    } catch {
      if (currentVmid) (formData as ProxmoxVMParams).vmid = currentVmid;
    } finally {
      loadingVMID = false;
    }
  }

  /**
   * Refresh the VMID to get the latest available
   */
  async function refreshVMID(): Promise<void> {
    loadingVMID = true;
    try {
      const vmid = await getProxmoxNextVMID();
      (formData as ProxmoxVMParams).vmid = vmid;
      validateField('vmid');
    } catch (e) {
      showError('Failed to fetch next VMID', (e as Error).message);
    } finally {
      loadingVMID = false;
    }
  }

  /**
   * Handle VM form submission
   */
  async function handleVMSubmit(event: Event): Promise<void> {
    event.preventDefault();
    submitting = true;

    try {
      const vmData = formData as ProxmoxVMParams;
      logger.info('ProxmoxProvisionForm', 'handleVMSubmit', 'Submitting VM creation request', {
        vmid: vmData.vmid, name: vmData.name, node: vmData.node,
      });

      const result = await createProxmoxVM(vmData);

      if (result.success) {
        const details = result.vmid
          ? `VM ID: ${result.vmid}${result.taskId ? `, Task ID: ${result.taskId}` : ''}`
          : result.message;
        showSuccess('VM created successfully', details);
        logger.info('ProxmoxProvisionForm', 'handleVMSubmit', 'VM creation succeeded', { vmid: result.vmid, taskId: result.taskId });
        formData = {} as ProxmoxVMParams;
        validationErrors = {};
        // Fetch new VMID for next creation
        refreshVMID();
      } else {
        const errorMessage = result.message || 'Failed to create VM';
        showError('VM creation failed', errorMessage);
        logger.error('ProxmoxProvisionForm', 'handleVMSubmit', 'VM creation failed', new Error(errorMessage), { error: result.error });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      showError('VM creation failed', errorMessage);
      logger.error('ProxmoxProvisionForm', 'handleVMSubmit', 'VM creation exception', error as Error);
    } finally {
      submitting = false;
    }
  }

  /**
   * Handle LXC form submission
   */
  async function handleLXCSubmit(event: Event): Promise<void> {
    event.preventDefault();
    submitting = true;

    try {
      const lxcData = formData as ProxmoxLXCParams;
      logger.info('ProxmoxProvisionForm', 'handleLXCSubmit', 'Submitting LXC creation request', {
        vmid: lxcData.vmid, hostname: lxcData.hostname, node: lxcData.node,
      });

      const result = await createProxmoxLXC(lxcData);

      if (result.success) {
        const details = result.vmid
          ? `VM ID: ${result.vmid}${result.taskId ? `, Task ID: ${result.taskId}` : ''}`
          : result.message;
        showSuccess('LXC container created successfully', details);
        logger.info('ProxmoxProvisionForm', 'handleLXCSubmit', 'LXC creation succeeded', { vmid: result.vmid, taskId: result.taskId });
        formData = {} as ProxmoxLXCParams;
        validationErrors = {};
        refreshVMID();
      } else {
        const errorMessage = result.message || 'Failed to create LXC container';
        showError('LXC creation failed', errorMessage);
        logger.error('ProxmoxProvisionForm', 'handleLXCSubmit', 'LXC creation failed', new Error(errorMessage), { error: result.error });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      showError('LXC creation failed', errorMessage);
      logger.error('ProxmoxProvisionForm', 'handleLXCSubmit', 'LXC creation exception', error as Error);
    } finally {
      submitting = false;
    }
  }

  /**
   * Helper to extract display name from volid (e.g. "local:iso/debian-12.iso" -> "debian-12.iso")
   */
  function volIdDisplayName(volid: string): string {
    const parts = volid.split('/');
    return parts.length > 1 ? parts[parts.length - 1] : volid;
  }
</script>

<div class="space-y-6">
  <!-- Tab Navigation -->
  <div class="border-b border-gray-200 dark:border-gray-700">
    <nav class="-mb-px flex space-x-8" aria-label="Provisioning type">
      <button
        type="button"
        class="whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors {activeTab === 'vm'
          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
        onclick={() => switchTab('vm')}
        aria-current={activeTab === 'vm' ? 'page' : undefined}
      >
        <div class="flex items-center gap-2">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
          </svg>
          <span>Virtual Machine</span>
        </div>
      </button>

      <button
        type="button"
        class="whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors {activeTab === 'lxc'
          ? 'border-blue-500 text-blue-600 dark:text-blue-400'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
        onclick={() => switchTab('lxc')}
        aria-current={activeTab === 'lxc' ? 'page' : undefined}
      >
        <div class="flex items-center gap-2">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <span>LXC Container</span>
        </div>
      </button>
    </nav>
  </div>

  <!-- Form Content Area -->
  <div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
    {#if activeTab === 'vm'}
      <!-- VM Creation Form -->
      <form onsubmit={handleVMSubmit} class="space-y-6">
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <!-- VMID (Auto-populated, with refresh) -->
          <div>
            <label for="vm-vmid" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              VMID <span class="text-red-500">*</span>
            </label>
            <div class="mt-1 flex gap-2">
              <input
                type="number"
                id="vm-vmid"
                name="vmid"
                bind:value={(formData as ProxmoxVMParams).vmid}
                oninput={() => validateField('vmid')}
                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
                placeholder={loadingVMID ? 'Loading...' : '100'}
                required
              />
              <button
                type="button"
                onclick={refreshVMID}
                disabled={loadingVMID}
                class="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
                title="Get next available VMID"
              >
                {#if loadingVMID}
                  <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                {:else}
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                {/if}
              </button>
            </div>
            {#if validationErrors.vmid}
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.vmid}</p>
            {/if}
          </div>

          <!-- Name (Required) -->
          <div>
            <label for="vm-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Name <span class="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="vm-name"
              name="name"
              bind:value={(formData as ProxmoxVMParams).name}
              oninput={() => validateField('name')}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="my-vm"
              required
            />
            {#if validationErrors.name}
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.name}</p>
            {/if}
          </div>

          <!-- Node (Dropdown from Proxmox API) -->
          <div>
            <label for="vm-node" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Node <span class="text-red-500">*</span>
            </label>
            <select
              id="vm-node"
              name="node"
              bind:value={(formData as ProxmoxVMParams).node}
              onchange={(e) => { validateField('node'); onNodeChange((e.target as HTMLSelectElement).value); }}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              required
            >
              <option value="">{loadingNodes ? 'Loading nodes...' : 'Select a PVE node'}</option>
              {#each pveNodes as node}
                <option value={node.node}>{node.node} ({node.status})</option>
              {/each}
            </select>
            {#if validationErrors.node}
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.node}</p>
            {/if}
          </div>

          <!-- Cores (Optional) -->
          <div>
            <label for="vm-cores" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Cores</label>
            <input type="number" id="vm-cores" name="cores" bind:value={(formData as ProxmoxVMParams).cores} oninput={() => validateField('cores')} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder="1" min="1" />
            {#if validationErrors.cores}<p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.cores}</p>{/if}
          </div>

          <!-- Memory (Optional) -->
          <div>
            <label for="vm-memory" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Memory (MB)</label>
            <input type="number" id="vm-memory" name="memory" bind:value={(formData as ProxmoxVMParams).memory} oninput={() => validateField('memory')} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder="512" min="512" />
            {#if validationErrors.memory}<p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.memory}</p>{/if}
          </div>

          <!-- Sockets (Optional) -->
          <div>
            <label for="vm-sockets" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Sockets</label>
            <input type="number" id="vm-sockets" name="sockets" bind:value={(formData as ProxmoxVMParams).sockets} oninput={() => validateField('sockets')} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder="1" min="1" />
            {#if validationErrors.sockets}<p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.sockets}</p>{/if}
          </div>
        </div>

        <!-- Full-width fields -->
        <div class="space-y-6">
          <!-- CPU Type (Optional) -->
          <div>
            <label for="vm-cpu" class="block text-sm font-medium text-gray-700 dark:text-gray-300">CPU Type</label>
            <input type="text" id="vm-cpu" name="cpu" bind:value={(formData as ProxmoxVMParams).cpu} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder="host" />
          </div>

          <!-- SCSI0 (Optional) -->
          <div>
            <label for="vm-scsi0" class="block text-sm font-medium text-gray-700 dark:text-gray-300">SCSI0 Disk</label>
            <input type="text" id="vm-scsi0" name="scsi0" bind:value={(formData as ProxmoxVMParams).scsi0} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder="local-lvm:32" />
          </div>

          <!-- IDE2 / ISO (Dropdown from Proxmox API) -->
          <div>
            <label for="vm-ide2" class="block text-sm font-medium text-gray-700 dark:text-gray-300">IDE2 (ISO)</label>
            {#if isoImages.length > 0}
              <select
                id="vm-ide2"
                name="ide2"
                bind:value={(formData as ProxmoxVMParams).ide2}
                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              >
                <option value="">No ISO</option>
                {#each isoImages as iso}
                  <option value="{iso.volid},media=cdrom">{volIdDisplayName(iso.volid)}</option>
                {/each}
              </select>
            {:else}
              <input
                type="text"
                id="vm-ide2"
                name="ide2"
                bind:value={(formData as ProxmoxVMParams).ide2}
                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
                placeholder={loadingISOs ? 'Loading ISOs...' : (formData as ProxmoxVMParams).node ? 'No ISOs found — enter manually' : 'Select a node first to load ISOs'}
              />
            {/if}
          </div>

          <!-- Net0 (Optional) -->
          <div>
            <label for="vm-net0" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Network Interface</label>
            <input type="text" id="vm-net0" name="net0" bind:value={(formData as ProxmoxVMParams).net0} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder="virtio,bridge=vmbr0" />
          </div>

          <!-- OS Type (Optional) -->
          <div>
            <label for="vm-ostype" class="block text-sm font-medium text-gray-700 dark:text-gray-300">OS Type</label>
            <select id="vm-ostype" name="ostype" bind:value={(formData as ProxmoxVMParams).ostype} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm">
              <option value="">Select OS Type</option>
              <option value="l26">Linux 2.6+</option>
              <option value="win10">Windows 10/2016/2019</option>
              <option value="win11">Windows 11/2022</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <!-- Submit Button -->
        <div class="flex justify-end">
          <button type="submit" disabled={!isFormValid || submitting} class="inline-flex justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600">
            {#if submitting}
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              Creating VM...
            {:else}
              Create Virtual Machine
            {/if}
          </button>
        </div>
      </form>
    {:else}
      <!-- LXC Creation Form -->
      <form onsubmit={handleLXCSubmit} class="space-y-6">
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <!-- VMID (Auto-populated, with refresh) -->
          <div>
            <label for="lxc-vmid" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              VMID <span class="text-red-500">*</span>
            </label>
            <div class="mt-1 flex gap-2">
              <input
                type="number"
                id="lxc-vmid"
                name="vmid"
                bind:value={(formData as ProxmoxLXCParams).vmid}
                oninput={() => validateField('vmid')}
                class="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
                placeholder={loadingVMID ? 'Loading...' : '100'}
                required
              />
              <button
                type="button"
                onclick={refreshVMID}
                disabled={loadingVMID}
                class="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
                title="Get next available VMID"
              >
                {#if loadingVMID}
                  <svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                {:else}
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                {/if}
              </button>
            </div>
            {#if validationErrors.vmid}
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.vmid}</p>
            {/if}
          </div>

          <!-- Hostname (Required) -->
          <div>
            <label for="lxc-hostname" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Hostname <span class="text-red-500">*</span>
            </label>
            <input type="text" id="lxc-hostname" name="hostname" bind:value={(formData as ProxmoxLXCParams).hostname} oninput={() => validateField('hostname')} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder="my-container" required />
            {#if validationErrors.hostname}<p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.hostname}</p>{/if}
          </div>

          <!-- Node (Dropdown from Proxmox API) -->
          <div>
            <label for="lxc-node" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Node <span class="text-red-500">*</span>
            </label>
            <select
              id="lxc-node"
              name="node"
              bind:value={(formData as ProxmoxLXCParams).node}
              onchange={(e) => { validateField('node'); onNodeChange((e.target as HTMLSelectElement).value); }}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              required
            >
              <option value="">{loadingNodes ? 'Loading nodes...' : 'Select a PVE node'}</option>
              {#each pveNodes as node}
                <option value={node.node}>{node.node} ({node.status})</option>
              {/each}
            </select>
            {#if validationErrors.node}<p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.node}</p>{/if}
          </div>

          <!-- OS Template (Dropdown from Proxmox API) -->
          <div>
            <label for="lxc-ostemplate" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              OS Template <span class="text-red-500">*</span>
            </label>
            {#if osTemplates.length > 0}
              <select
                id="lxc-ostemplate"
                name="ostemplate"
                bind:value={(formData as ProxmoxLXCParams).ostemplate}
                onchange={() => validateField('ostemplate')}
                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
                required
              >
                <option value="">Select a template</option>
                {#each osTemplates as tpl}
                  <option value={tpl.volid}>{volIdDisplayName(tpl.volid)}</option>
                {/each}
              </select>
            {:else}
              <input
                type="text"
                id="lxc-ostemplate"
                name="ostemplate"
                bind:value={(formData as ProxmoxLXCParams).ostemplate}
                oninput={() => validateField('ostemplate')}
                class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
                placeholder={loadingTemplates ? 'Loading templates...' : (formData as ProxmoxLXCParams).node ? 'No templates found — enter manually' : 'Select a node first to load templates'}
                required
              />
            {/if}
            {#if validationErrors.ostemplate}<p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.ostemplate}</p>{/if}
          </div>

          <!-- Cores (Optional) -->
          <div>
            <label for="lxc-cores" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Cores</label>
            <input type="number" id="lxc-cores" name="cores" bind:value={(formData as ProxmoxLXCParams).cores} oninput={() => validateField('cores')} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder="1" min="1" />
            {#if validationErrors.cores}<p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.cores}</p>{/if}
          </div>

          <!-- Memory (Optional) -->
          <div>
            <label for="lxc-memory" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Memory (MB)</label>
            <input type="number" id="lxc-memory" name="memory" bind:value={(formData as ProxmoxLXCParams).memory} oninput={() => validateField('memory')} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder="512" min="512" />
            {#if validationErrors.memory}<p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.memory}</p>{/if}
          </div>
        </div>

        <!-- Full-width fields -->
        <div class="space-y-6">
          <!-- Root Filesystem (Optional) -->
          <div>
            <label for="lxc-rootfs" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Root Filesystem</label>
            <input type="text" id="lxc-rootfs" name="rootfs" bind:value={(formData as ProxmoxLXCParams).rootfs} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder="local-lvm:8" />
          </div>

          <!-- Network Interface (Optional) -->
          <div>
            <label for="lxc-net0" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Network Interface</label>
            <input type="text" id="lxc-net0" name="net0" bind:value={(formData as ProxmoxLXCParams).net0} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder="name=eth0,bridge=vmbr0,ip=dhcp" />
          </div>

          <!-- Password (Optional) -->
          <div>
            <label for="lxc-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Root Password</label>
            <input type="password" id="lxc-password" name="password" bind:value={(formData as ProxmoxLXCParams).password} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder="Enter root password" />
          </div>
        </div>

        <!-- Submit Button -->
        <div class="flex justify-end">
          <button type="submit" disabled={!isFormValid || submitting} class="inline-flex justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600">
            {#if submitting}
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              Creating Container...
            {:else}
              Create LXC Container
            {/if}
          </button>
        </div>
      </form>
    {/if}
  </div>
</div>
