<script lang="ts">
  import type { ProxmoxVMParams, PVENode, StorageContent, PVEStorage, PVENetwork } from '../lib/types/provisioning';
  import { validateVMID, validateHostname, validateMemory, validateRequired, validateNumericRange } from '../lib/validation';
  import { createProxmoxVM, getProxmoxNodes, getProxmoxNextVMID, getProxmoxISOs, getProxmoxStorages, getProxmoxNetworks } from '../lib/api';
  import { showSuccess, showError } from '../lib/toast.svelte';
  import { logger } from '../lib/logger.svelte';

  /**
   * ProxmoxVMProvisionForm Component
   *
   * VM-specific provisioning form with QEMU parameters:
   * ISO images, CPU sockets, BIOS, machine type, OS type.
   * Submits to the "proxmox" backend plugin with computeType metadata.
   *
   * Validates Requirements: 17.1, 17.3
   */

  let formData = $state<ProxmoxVMParams>({} as ProxmoxVMParams);
  let validationErrors = $state<Record<string, string>>({});
  let submitting = $state(false);

  // Dynamic data from Proxmox API
  let pveNodes = $state<PVENode[]>([]);
  let isoImages = $state<StorageContent[]>([]);
  let storages = $state<PVEStorage[]>([]);
  let networks = $state<PVENetwork[]>([]);
  let loadingNodes = $state(false);
  let loadingVMID = $state(false);
  let loadingISOs = $state(false);
  let loadingStorages = $state(false);
  let loadingNetworks = $state(false);

  // QEMU-specific fields
  let bios = $state<string>('seabios');
  let machineType = $state<string>('');

  let isFormValid = $derived.by(() => {
    if (!formData.vmid || !formData.name || !formData.node) return false;
    return Object.keys(validationErrors).length === 0;
  });

  async function loadInitialData(): Promise<void> {
    loadingNodes = true;
    loadingVMID = true;
    try {
      const [nodes, vmid] = await Promise.all([
        getProxmoxNodes().catch((e) => { logger.error('ProxmoxVMProvisionForm', 'loadInitialData', 'Failed to fetch nodes', e); return [] as PVENode[]; }),
        getProxmoxNextVMID().catch((e) => { logger.error('ProxmoxVMProvisionForm', 'loadInitialData', 'Failed to fetch next VMID', e); return undefined; }),
      ]);
      pveNodes = nodes;
      if (vmid !== undefined) {
        formData.vmid = vmid;
      }
    } finally {
      loadingNodes = false;
      loadingVMID = false;
    }
  }

  loadInitialData();

  async function onNodeChange(node: string): Promise<void> {
    if (!node) return;

    loadingStorages = true;
    loadingNetworks = true;
    loadingISOs = true;
    storages = [];
    networks = [];
    isoImages = [];

    Promise.all([
      getProxmoxStorages(node).catch((e) => { logger.error('ProxmoxVMProvisionForm', 'onNodeChange', 'Failed to fetch storages', e as Error); return [] as PVEStorage[]; }),
      getProxmoxNetworks(node).catch((e) => { logger.error('ProxmoxVMProvisionForm', 'onNodeChange', 'Failed to fetch networks', e as Error); return [] as PVENetwork[]; }),
    ]).then(([s, n]) => {
      storages = s;
      networks = n;
      loadingStorages = false;
      loadingNetworks = false;
    });

    try {
      isoImages = await getProxmoxISOs(node);
    } catch (e) {
      logger.error('ProxmoxVMProvisionForm', 'onNodeChange', 'Failed to fetch ISOs', e as Error);
    } finally {
      loadingISOs = false;
    }
  }

  function validateField(fieldName: string): void {
    let error: string | null = null;

    switch (fieldName) {
      case 'vmid':
        error = validateRequired(formData.vmid, 'VMID') || validateVMID(formData.vmid);
        break;
      case 'name':
        error = validateRequired(formData.name, 'Name') || validateHostname(formData.name);
        break;
      case 'node':
        error = validateRequired(formData.node, 'Node');
        break;
      case 'cores':
        if (formData.cores !== undefined && formData.cores !== null) error = validateNumericRange(formData.cores, 1, 128, 'Cores');
        break;
      case 'memory':
        if (formData.memory !== undefined && formData.memory !== null) error = validateMemory(formData.memory);
        break;
      case 'sockets':
        if (formData.sockets !== undefined && formData.sockets !== null) error = validateNumericRange(formData.sockets, 1, 4, 'Sockets');
        break;
    }

    if (error) {
      validationErrors[fieldName] = error;
    } else {
      delete validationErrors[fieldName];
    }
    validationErrors = { ...validationErrors };
  }

  async function refreshVMID(): Promise<void> {
    loadingVMID = true;
    try {
      const vmid = await getProxmoxNextVMID();
      formData.vmid = vmid;
      validateField('vmid');
    } catch (e) {
      showError('Failed to fetch next VMID', (e as Error).message);
    } finally {
      loadingVMID = false;
    }
  }

  async function handleSubmit(event: Event): Promise<void> {
    event.preventDefault();
    submitting = true;

    try {
      const params: ProxmoxVMParams = { ...formData };
      logger.info('ProxmoxVMProvisionForm', 'handleSubmit', 'Submitting VM creation request', {
        vmid: params.vmid, name: params.name, node: params.node,
      });

      const result = await createProxmoxVM(params);

      if (result.success) {
        const details = result.vmid
          ? `VM ID: ${result.vmid}${result.taskId ? `, Task ID: ${result.taskId}` : ''}`
          : result.message;
        showSuccess('VM created successfully', details);
        logger.info('ProxmoxVMProvisionForm', 'handleSubmit', 'VM creation succeeded', { vmid: result.vmid, taskId: result.taskId });
        formData = {} as ProxmoxVMParams;
        validationErrors = {};
        bios = 'seabios';
        machineType = '';
        refreshVMID();
      } else {
        const errorMessage = result.message || 'Failed to create VM';
        showError('VM creation failed', errorMessage);
        logger.error('ProxmoxVMProvisionForm', 'handleSubmit', 'VM creation failed', new Error(errorMessage), { error: result.error });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      showError('VM creation failed', errorMessage);
      logger.error('ProxmoxVMProvisionForm', 'handleSubmit', 'VM creation exception', error as Error);
    } finally {
      submitting = false;
    }
  }

  function volIdDisplayName(volid: string): string {
    const parts = volid.split('/');
    return parts.length > 1 ? parts[parts.length - 1] : volid;
  }
</script>

<form onsubmit={handleSubmit} class="space-y-6">
  <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
    <!-- VMID -->
    <div>
      <label for="vm-vmid" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        VMID <span class="text-red-500">*</span>
      </label>
      <div class="mt-1 flex gap-2">
        <input
          type="number"
          id="vm-vmid"
          name="vmid"
          bind:value={formData.vmid}
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

    <!-- Name -->
    <div>
      <label for="vm-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Name <span class="text-red-500">*</span>
      </label>
      <input
        type="text"
        id="vm-name"
        name="name"
        bind:value={formData.name}
        oninput={() => validateField('name')}
        class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
        placeholder="my-vm"
        required
      />
      {#if validationErrors.name}
        <p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.name}</p>
      {/if}
    </div>

    <!-- Node -->
    <div>
      <label for="vm-node" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Node <span class="text-red-500">*</span>
      </label>
      <select
        id="vm-node"
        name="node"
        bind:value={formData.node}
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

    <!-- Cores -->
    <div>
      <label for="vm-cores" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Cores</label>
      <input type="number" id="vm-cores" name="cores" bind:value={formData.cores} oninput={() => validateField('cores')} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder="1" min="1" />
      {#if validationErrors.cores}<p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.cores}</p>{/if}
    </div>

    <!-- Memory -->
    <div>
      <label for="vm-memory" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Memory (MB)</label>
      <input type="number" id="vm-memory" name="memory" bind:value={formData.memory} oninput={() => validateField('memory')} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder="512" min="512" />
      {#if validationErrors.memory}<p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.memory}</p>{/if}
    </div>

    <!-- Sockets (QEMU-specific) -->
    <div>
      <label for="vm-sockets" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Sockets</label>
      <input type="number" id="vm-sockets" name="sockets" bind:value={formData.sockets} oninput={() => validateField('sockets')} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder="1" min="1" />
      {#if validationErrors.sockets}<p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.sockets}</p>{/if}
    </div>
  </div>

  <!-- Full-width fields -->
  <div class="space-y-6">
    <!-- CPU Type -->
    <div>
      <label for="vm-cpu" class="block text-sm font-medium text-gray-700 dark:text-gray-300">CPU Type</label>
      <input type="text" id="vm-cpu" name="cpu" bind:value={formData.cpu} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder="host" />
    </div>

    <!-- BIOS (QEMU-specific) -->
    <div>
      <label for="vm-bios" class="block text-sm font-medium text-gray-700 dark:text-gray-300">BIOS</label>
      <select id="vm-bios" name="bios" bind:value={bios} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm">
        <option value="seabios">SeaBIOS (Legacy)</option>
        <option value="ovmf">OVMF (UEFI)</option>
      </select>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">SeaBIOS for legacy boot, OVMF for UEFI boot</p>
    </div>

    <!-- Machine Type (QEMU-specific) -->
    <div>
      <label for="vm-machine" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Machine Type</label>
      <select id="vm-machine" name="machine" bind:value={machineType} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm">
        <option value="">Default (i440fx)</option>
        <option value="q35">Q35</option>
        <option value="i440fx">i440fx</option>
      </select>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Q35 recommended for PCIe passthrough and modern guests</p>
    </div>

    <!-- SCSI0 Disk -->
    <div>
      <label for="vm-scsi0" class="block text-sm font-medium text-gray-700 dark:text-gray-300">SCSI0 Disk</label>
      <input type="text" id="vm-scsi0" name="scsi0" bind:value={formData.scsi0} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder="local-lvm:32" />
    </div>

    <!-- IDE2 / ISO -->
    <div>
      <label for="vm-ide2" class="block text-sm font-medium text-gray-700 dark:text-gray-300">IDE2 (ISO)</label>
      {#if isoImages.length > 0}
        <select
          id="vm-ide2"
          name="ide2"
          bind:value={formData.ide2}
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
          bind:value={formData.ide2}
          class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
          placeholder={loadingISOs ? 'Loading ISOs...' : formData.node ? 'No ISOs found — enter manually' : 'Select a node first to load ISOs'}
        />
      {/if}
    </div>

    <!-- Network Interface -->
    <div>
      <label for="vm-net0" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Network Interface</label>
      {#if networks.length > 0}
        <select
          id="vm-net0"
          name="net0"
          bind:value={formData.net0}
          class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
        >
          <option value="">Select bridge</option>
          {#each networks as net}
            <option value="virtio,bridge={net.iface}">{net.iface}{net.cidr ? ` (${net.cidr})` : ''}</option>
          {/each}
        </select>
      {:else}
        <input type="text" id="vm-net0" name="net0" bind:value={formData.net0} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder={loadingNetworks ? 'Loading networks...' : formData.node ? 'No bridges found — enter manually' : 'Select a node first'} />
      {/if}
    </div>

    <!-- OS Type -->
    <div>
      <label for="vm-ostype" class="block text-sm font-medium text-gray-700 dark:text-gray-300">OS Type</label>
      <select id="vm-ostype" name="ostype" bind:value={formData.ostype} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm">
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
