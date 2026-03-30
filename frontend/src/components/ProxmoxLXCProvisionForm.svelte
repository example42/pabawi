<script lang="ts">
  import type { ProxmoxLXCParams, PVENode, StorageContent, PVEStorage, PVENetwork } from '../lib/types/provisioning';
  import { validateVMID, validateHostname, validateMemory, validateRequired, validateNumericRange } from '../lib/validation';
  import { createProxmoxLXC, getProxmoxNodes, getProxmoxNextVMID, getProxmoxTemplates, getProxmoxStorages, getProxmoxNetworks } from '../lib/api';
  import { showSuccess, showError } from '../lib/toast.svelte';
  import { logger } from '../lib/logger.svelte';

  /**
   * ProxmoxLXCProvisionForm Component
   *
   * LXC-specific provisioning form with container parameters:
   * OS templates, unprivileged flag, nesting, root filesystem.
   * Submits to the "proxmox" backend plugin with computeType metadata.
   *
   * Validates Requirements: 17.2, 17.3
   */

  let formData = $state<ProxmoxLXCParams>({} as ProxmoxLXCParams);
  let validationErrors = $state<Record<string, string>>({});
  let submitting = $state(false);

  // Dynamic data from Proxmox API
  let pveNodes = $state<PVENode[]>([]);
  let osTemplates = $state<StorageContent[]>([]);
  let storages = $state<PVEStorage[]>([]);
  let networks = $state<PVENetwork[]>([]);
  let loadingNodes = $state(false);
  let loadingVMID = $state(false);
  let loadingTemplates = $state(false);
  let loadingStorages = $state(false);
  let loadingNetworks = $state(false);

  // LXC-specific fields
  let unprivileged = $state(true);
  let nesting = $state(false);

  let isFormValid = $derived.by(() => {
    if (!formData.vmid || !formData.hostname || !formData.node || !formData.ostemplate) return false;
    return Object.keys(validationErrors).length === 0;
  });

  async function loadInitialData(): Promise<void> {
    loadingNodes = true;
    loadingVMID = true;
    try {
      const [nodes, vmid] = await Promise.all([
        getProxmoxNodes().catch((e) => { logger.error('ProxmoxLXCProvisionForm', 'loadInitialData', 'Failed to fetch nodes', e); return [] as PVENode[]; }),
        getProxmoxNextVMID().catch((e) => { logger.error('ProxmoxLXCProvisionForm', 'loadInitialData', 'Failed to fetch next VMID', e); return undefined; }),
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
    loadingTemplates = true;
    storages = [];
    networks = [];
    osTemplates = [];

    Promise.all([
      getProxmoxStorages(node).catch((e) => { logger.error('ProxmoxLXCProvisionForm', 'onNodeChange', 'Failed to fetch storages', e as Error); return [] as PVEStorage[]; }),
      getProxmoxNetworks(node).catch((e) => { logger.error('ProxmoxLXCProvisionForm', 'onNodeChange', 'Failed to fetch networks', e as Error); return [] as PVENetwork[]; }),
    ]).then(([s, n]) => {
      storages = s;
      networks = n;
      loadingStorages = false;
      loadingNetworks = false;
    });

    try {
      osTemplates = await getProxmoxTemplates(node);
    } catch (e) {
      logger.error('ProxmoxLXCProvisionForm', 'onNodeChange', 'Failed to fetch templates', e as Error);
    } finally {
      loadingTemplates = false;
    }
  }

  function validateField(fieldName: string): void {
    let error: string | null = null;

    switch (fieldName) {
      case 'vmid':
        error = validateRequired(formData.vmid, 'VMID') || validateVMID(formData.vmid);
        break;
      case 'hostname':
        error = validateRequired(formData.hostname, 'Hostname') || validateHostname(formData.hostname);
        break;
      case 'node':
        error = validateRequired(formData.node, 'Node');
        break;
      case 'ostemplate':
        error = validateRequired(formData.ostemplate, 'OS Template');
        break;
      case 'cores':
        if (formData.cores !== undefined && formData.cores !== null) error = validateNumericRange(formData.cores, 1, 128, 'Cores');
        break;
      case 'memory':
        if (formData.memory !== undefined && formData.memory !== null) error = validateMemory(formData.memory);
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
      const params: ProxmoxLXCParams = { ...formData };
      logger.info('ProxmoxLXCProvisionForm', 'handleSubmit', 'Submitting LXC creation request', {
        vmid: params.vmid, hostname: params.hostname, node: params.node,
      });

      const result = await createProxmoxLXC(params);

      if (result.success) {
        const details = result.vmid
          ? `VM ID: ${result.vmid}${result.taskId ? `, Task ID: ${result.taskId}` : ''}`
          : result.message;
        showSuccess('LXC container created successfully', details);
        logger.info('ProxmoxLXCProvisionForm', 'handleSubmit', 'LXC creation succeeded', { vmid: result.vmid, taskId: result.taskId });
        formData = {} as ProxmoxLXCParams;
        validationErrors = {};
        unprivileged = true;
        nesting = false;
        refreshVMID();
      } else {
        const errorMessage = result.message || 'Failed to create LXC container';
        showError('LXC creation failed', errorMessage);
        logger.error('ProxmoxLXCProvisionForm', 'handleSubmit', 'LXC creation failed', new Error(errorMessage), { error: result.error });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      showError('LXC creation failed', errorMessage);
      logger.error('ProxmoxLXCProvisionForm', 'handleSubmit', 'LXC creation exception', error as Error);
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
      <label for="lxc-vmid" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        VMID <span class="text-red-500">*</span>
      </label>
      <div class="mt-1 flex gap-2">
        <input
          type="number"
          id="lxc-vmid"
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

    <!-- Hostname -->
    <div>
      <label for="lxc-hostname" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Hostname <span class="text-red-500">*</span>
      </label>
      <input type="text" id="lxc-hostname" name="hostname" bind:value={formData.hostname} oninput={() => validateField('hostname')} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder="my-container" required />
      {#if validationErrors.hostname}<p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.hostname}</p>{/if}
    </div>

    <!-- Node -->
    <div>
      <label for="lxc-node" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Node <span class="text-red-500">*</span>
      </label>
      <select
        id="lxc-node"
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
      {#if validationErrors.node}<p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.node}</p>{/if}
    </div>

    <!-- OS Template -->
    <div>
      <label for="lxc-ostemplate" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        OS Template <span class="text-red-500">*</span>
      </label>
      {#if osTemplates.length > 0}
        <select
          id="lxc-ostemplate"
          name="ostemplate"
          bind:value={formData.ostemplate}
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
          bind:value={formData.ostemplate}
          oninput={() => validateField('ostemplate')}
          class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
          placeholder={loadingTemplates ? 'Loading templates...' : formData.node ? 'No templates found — enter manually' : 'Select a node first to load templates'}
          required
        />
      {/if}
      {#if validationErrors.ostemplate}<p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.ostemplate}</p>{/if}
    </div>

    <!-- Cores -->
    <div>
      <label for="lxc-cores" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Cores</label>
      <input type="number" id="lxc-cores" name="cores" bind:value={formData.cores} oninput={() => validateField('cores')} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder="1" min="1" />
      {#if validationErrors.cores}<p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.cores}</p>{/if}
    </div>

    <!-- Memory -->
    <div>
      <label for="lxc-memory" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Memory (MB)</label>
      <input type="number" id="lxc-memory" name="memory" bind:value={formData.memory} oninput={() => validateField('memory')} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder="512" min="512" />
      {#if validationErrors.memory}<p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.memory}</p>{/if}
    </div>
  </div>

  <!-- Full-width fields -->
  <div class="space-y-6">
    <!-- Unprivileged (LXC-specific) -->
    <div class="flex items-center gap-3">
      <input
        type="checkbox"
        id="lxc-unprivileged"
        name="unprivileged"
        bind:checked={unprivileged}
        class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
      />
      <label for="lxc-unprivileged" class="text-sm font-medium text-gray-700 dark:text-gray-300">
        Unprivileged Container
      </label>
      <p class="text-sm text-gray-500 dark:text-gray-400">Recommended for security. Runs with reduced kernel privileges.</p>
    </div>

    <!-- Nesting (LXC-specific) -->
    <div class="flex items-center gap-3">
      <input
        type="checkbox"
        id="lxc-nesting"
        name="nesting"
        bind:checked={nesting}
        class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
      />
      <label for="lxc-nesting" class="text-sm font-medium text-gray-700 dark:text-gray-300">
        Enable Nesting
      </label>
      <p class="text-sm text-gray-500 dark:text-gray-400">Allow running containers or Docker inside this container.</p>
    </div>

    <!-- Root Filesystem -->
    <div>
      <label for="lxc-rootfs" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Root Filesystem</label>
      {#if storages.length > 0}
        <select
          id="lxc-rootfs"
          name="rootfs"
          bind:value={formData.rootfs}
          class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
        >
          <option value="">Select storage</option>
          {#each storages.filter(s => s.content.includes('rootdir')) as s}
            <option value="{s.storage}:8">{s.storage} ({s.type})</option>
          {/each}
        </select>
      {:else}
        <input type="text" id="lxc-rootfs" name="rootfs" bind:value={formData.rootfs} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder={loadingStorages ? 'Loading storages...' : formData.node ? 'No storages found — enter manually' : 'Select a node first'} />
      {/if}
    </div>

    <!-- Network Interface -->
    <div>
      <label for="lxc-net0" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Network Interface</label>
      {#if networks.length > 0}
        <select
          id="lxc-net0"
          name="net0"
          bind:value={formData.net0}
          class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
        >
          <option value="">Select bridge</option>
          {#each networks as net}
            <option value="name=eth0,bridge={net.iface},ip=dhcp">{net.iface}{net.cidr ? ` (${net.cidr})` : ''}</option>
          {/each}
        </select>
      {:else}
        <input type="text" id="lxc-net0" name="net0" bind:value={formData.net0} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder={loadingNetworks ? 'Loading networks...' : formData.node ? 'No bridges found — enter manually' : 'Select a node first'} />
      {/if}
    </div>

    <!-- Password -->
    <div>
      <label for="lxc-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">Root Password</label>
      <input type="password" id="lxc-password" name="password" bind:value={formData.password} class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm" placeholder="Enter root password" />
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
