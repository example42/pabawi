<script lang="ts">
  import type { ProxmoxVMParams, ProxmoxLXCParams } from '../lib/types/provisioning';
  import { validateVMID, validateHostname, validateMemory, validateRequired, validateNumericRange } from '../lib/validation';
  import { createProxmoxVM, createProxmoxLXC } from '../lib/api';
  import { showSuccess, showError } from '../lib/toast.svelte';
  import { logger } from '../lib/logger.svelte';

  /**
   * ProxmoxProvisionForm Component
   *
   * Provides a tabbed interface for creating Proxmox VMs and LXC containers.
   * Validates Requirements: 3.1, 4.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.2, 4.3, 4.4, 4.5, 4.6, 11.1, 11.2, 11.6, 12.1, 12.2, 12.4, 12.5
   *
   * Features:
   * - Tab switching between VM and LXC modes
   * - State management using Svelte 5 runes
   * - Real-time form validation with inline error display
   * - Loading states during submission
   * - Submit button disabled when validation fails
   * - Form submission handlers with success/error handling
   */

  // State management using Svelte 5 runes (Validates Requirements: 3.1, 4.1)
  let activeTab = $state<'vm' | 'lxc'>('vm');
  let formData = $state<ProxmoxVMParams | ProxmoxLXCParams>({} as ProxmoxVMParams);
  let validationErrors = $state<Record<string, string>>({});
  let submitting = $state(false);

  /**
   * Computed property to check if form is valid
   * Validates Requirements: 11.6
   */
  let isFormValid = $derived.by(() => {
    if (activeTab === 'vm') {
      const vmData = formData as ProxmoxVMParams;
      // Check required fields are present
      if (!vmData.vmid || !vmData.name || !vmData.node) {
        return false;
      }
      // Check no validation errors exist
      return Object.keys(validationErrors).length === 0;
    } else {
      const lxcData = formData as ProxmoxLXCParams;
      // Check required fields are present
      if (!lxcData.vmid || !lxcData.hostname || !lxcData.node || !lxcData.ostemplate) {
        return false;
      }
      // Check no validation errors exist
      return Object.keys(validationErrors).length === 0;
    }
  });

  /**
   * Validate a single field
   * Validates Requirements: 11.1, 11.2, 11.3
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
          if (vmData.cores !== undefined && vmData.cores !== null) {
            error = validateNumericRange(vmData.cores, 1, 128, 'Cores');
          }
          break;
        case 'memory':
          if (vmData.memory !== undefined && vmData.memory !== null) {
            error = validateMemory(vmData.memory);
          }
          break;
        case 'sockets':
          if (vmData.sockets !== undefined && vmData.sockets !== null) {
            error = validateNumericRange(vmData.sockets, 1, 4, 'Sockets');
          }
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
          if (lxcData.cores !== undefined && lxcData.cores !== null) {
            error = validateNumericRange(lxcData.cores, 1, 128, 'Cores');
          }
          break;
        case 'memory':
          if (lxcData.memory !== undefined && lxcData.memory !== null) {
            error = validateMemory(lxcData.memory);
          }
          break;
      }
    }

    // Update validation errors
    if (error) {
      validationErrors[fieldName] = error;
    } else {
      delete validationErrors[fieldName];
    }
    // Trigger reactivity
    validationErrors = { ...validationErrors };
  }

  /**
   * Switch between VM and LXC tabs
   * Resets form data and validation errors when switching
   */
  function switchTab(tab: 'vm' | 'lxc'): void {
    activeTab = tab;
    formData = {} as ProxmoxVMParams | ProxmoxLXCParams;
    validationErrors = {};
  }

  /**
   * Handle VM form submission
   * Validates Requirements: 3.3, 3.4, 3.5, 3.6, 12.1, 12.2, 12.4, 12.5
   */
  async function handleVMSubmit(event: Event): Promise<void> {
    event.preventDefault();

    // Set submitting state (Validates Requirements: 3.6)
    submitting = true;

    try {
      const vmData = formData as ProxmoxVMParams;

      // Log submission attempt (Validates Requirements: 12.4)
      logger.info('ProxmoxProvisionForm', 'handleVMSubmit', 'Submitting VM creation request', {
        vmid: vmData.vmid,
        name: vmData.name,
        node: vmData.node,
      });

      // Call API to create VM (Validates Requirements: 3.3)
      const result = await createProxmoxVM(vmData);

      // Handle success (Validates Requirements: 3.4, 12.5)
      if (result.success) {
        const successMessage = `VM created successfully`;
        const details = result.vmid
          ? `VM ID: ${result.vmid}${result.taskId ? `, Task ID: ${result.taskId}` : ''}`
          : result.message;

        showSuccess(successMessage, details);

        logger.info('ProxmoxProvisionForm', 'handleVMSubmit', 'VM creation succeeded', {
          vmid: result.vmid,
          taskId: result.taskId,
        });

        // Reset form after successful submission
        formData = {} as ProxmoxVMParams;
        validationErrors = {};
      } else {
        // Handle API error response (Validates Requirements: 3.5, 12.1, 12.2)
        const errorMessage = result.message || 'Failed to create VM';
        showError('VM creation failed', errorMessage);

        logger.error('ProxmoxProvisionForm', 'handleVMSubmit', 'VM creation failed', new Error(errorMessage), {
          error: result.error,
        });
      }
    } catch (error) {
      // Handle exception (Validates Requirements: 3.5, 12.1, 12.2, 12.4)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      showError('VM creation failed', errorMessage);

      logger.error('ProxmoxProvisionForm', 'handleVMSubmit', 'VM creation exception', error as Error);
    } finally {
      // Clear submitting state (Validates Requirements: 3.6)
      submitting = false;
    }
  }

  /**
   * Handle LXC form submission
   * Validates Requirements: 4.3, 4.4, 4.5, 4.6, 12.1, 12.2, 12.4, 12.5
   */
  async function handleLXCSubmit(event: Event): Promise<void> {
    event.preventDefault();

    // Set submitting state (Validates Requirements: 4.6)
    submitting = true;

    try {
      const lxcData = formData as ProxmoxLXCParams;

      // Log submission attempt (Validates Requirements: 12.4)
      logger.info('ProxmoxProvisionForm', 'handleLXCSubmit', 'Submitting LXC creation request', {
        vmid: lxcData.vmid,
        hostname: lxcData.hostname,
        node: lxcData.node,
      });

      // Call API to create LXC (Validates Requirements: 4.3)
      const result = await createProxmoxLXC(lxcData);

      // Handle success (Validates Requirements: 4.4, 12.5)
      if (result.success) {
        const successMessage = `LXC container created successfully`;
        const details = result.vmid
          ? `VM ID: ${result.vmid}${result.taskId ? `, Task ID: ${result.taskId}` : ''}`
          : result.message;

        showSuccess(successMessage, details);

        logger.info('ProxmoxProvisionForm', 'handleLXCSubmit', 'LXC creation succeeded', {
          vmid: result.vmid,
          taskId: result.taskId,
        });

        // Reset form after successful submission
        formData = {} as ProxmoxLXCParams;
        validationErrors = {};
      } else {
        // Handle API error response (Validates Requirements: 4.5, 12.1, 12.2)
        const errorMessage = result.message || 'Failed to create LXC container';
        showError('LXC creation failed', errorMessage);

        logger.error('ProxmoxProvisionForm', 'handleLXCSubmit', 'LXC creation failed', new Error(errorMessage), {
          error: result.error,
        });
      }
    } catch (error) {
      // Handle exception (Validates Requirements: 4.5, 12.1, 12.2, 12.4)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      showError('LXC creation failed', errorMessage);

      logger.error('ProxmoxProvisionForm', 'handleLXCSubmit', 'LXC creation exception', error as Error);
    } finally {
      // Clear submitting state (Validates Requirements: 4.6)
      submitting = false;
    }
  }
</script>

<div class="space-y-6">
  <!-- Tab Navigation (Validates Requirements: 3.1, 4.1) -->
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
          <svg
            class="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
            />
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
          <svg
            class="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
          </svg>
          <span>LXC Container</span>
        </div>
      </button>
    </nav>
  </div>

  <!-- Form Content Area -->
  <div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
    {#if activeTab === 'vm'}
      <!-- VM Creation Form (Validates Requirements: 3.2, 3.3, 3.6, 11.1, 11.2, 11.6) -->
      <form onsubmit={handleVMSubmit} class="space-y-6">
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <!-- VMID (Required) -->
          <div>
            <label for="vm-vmid" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              VMID <span class="text-red-500">*</span>
            </label>
            <input
              type="number"
              id="vm-vmid"
              name="vmid"
              bind:value={(formData as ProxmoxVMParams).vmid}
              oninput={() => validateField('vmid')}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="100"
              required
            />
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

          <!-- Node (Required) -->
          <div>
            <label for="vm-node" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Node <span class="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="vm-node"
              name="node"
              bind:value={(formData as ProxmoxVMParams).node}
              oninput={() => validateField('node')}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="pve"
              required
            />
            {#if validationErrors.node}
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.node}</p>
            {/if}
          </div>

          <!-- Cores (Optional) -->
          <div>
            <label for="vm-cores" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Cores
            </label>
            <input
              type="number"
              id="vm-cores"
              name="cores"
              bind:value={(formData as ProxmoxVMParams).cores}
              oninput={() => validateField('cores')}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="1"
              min="1"
            />
            {#if validationErrors.cores}
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.cores}</p>
            {/if}
          </div>

          <!-- Memory (Optional) -->
          <div>
            <label for="vm-memory" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Memory (MB)
            </label>
            <input
              type="number"
              id="vm-memory"
              name="memory"
              bind:value={(formData as ProxmoxVMParams).memory}
              oninput={() => validateField('memory')}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="512"
              min="512"
            />
            {#if validationErrors.memory}
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.memory}</p>
            {/if}
          </div>

          <!-- Sockets (Optional) -->
          <div>
            <label for="vm-sockets" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Sockets
            </label>
            <input
              type="number"
              id="vm-sockets"
              name="sockets"
              bind:value={(formData as ProxmoxVMParams).sockets}
              oninput={() => validateField('sockets')}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="1"
              min="1"
            />
            {#if validationErrors.sockets}
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.sockets}</p>
            {/if}
          </div>
        </div>

        <!-- Full-width fields -->
        <div class="space-y-6">
          <!-- CPU (Optional) -->
          <div>
            <label for="vm-cpu" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              CPU Type
            </label>
            <input
              type="text"
              id="vm-cpu"
              name="cpu"
              bind:value={(formData as ProxmoxVMParams).cpu}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="host"
            />
          </div>

          <!-- SCSI0 (Optional) -->
          <div>
            <label for="vm-scsi0" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              SCSI0 Disk
            </label>
            <input
              type="text"
              id="vm-scsi0"
              name="scsi0"
              bind:value={(formData as ProxmoxVMParams).scsi0}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="local-lvm:32"
            />
          </div>

          <!-- IDE2 (Optional) -->
          <div>
            <label for="vm-ide2" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              IDE2 (ISO)
            </label>
            <input
              type="text"
              id="vm-ide2"
              name="ide2"
              bind:value={(formData as ProxmoxVMParams).ide2}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="local:iso/debian-12.iso,media=cdrom"
            />
          </div>

          <!-- Net0 (Optional) -->
          <div>
            <label for="vm-net0" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Network Interface
            </label>
            <input
              type="text"
              id="vm-net0"
              name="net0"
              bind:value={(formData as ProxmoxVMParams).net0}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="virtio,bridge=vmbr0"
            />
          </div>

          <!-- OS Type (Optional) -->
          <div>
            <label for="vm-ostype" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              OS Type
            </label>
            <select
              id="vm-ostype"
              name="ostype"
              bind:value={(formData as ProxmoxVMParams).ostype}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
            >
              <option value="">Select OS Type</option>
              <option value="l26">Linux 2.6+</option>
              <option value="win10">Windows 10/2016/2019</option>
              <option value="win11">Windows 11/2022</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <!-- Submit Button (Validates Requirements: 3.6, 11.6) -->
        <div class="flex justify-end">
          <button
            type="submit"
            disabled={!isFormValid || submitting}
            class="inline-flex justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {#if submitting}
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Creating VM...
            {:else}
              Create Virtual Machine
            {/if}
          </button>
        </div>
      </form>
    {:else}
      <!-- LXC Creation Form (Validates Requirements: 4.2, 4.3, 4.6, 11.1, 11.2, 11.6) -->
      <form onsubmit={handleLXCSubmit} class="space-y-6">
        <div class="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <!-- VMID (Required) -->
          <div>
            <label for="lxc-vmid" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              VMID <span class="text-red-500">*</span>
            </label>
            <input
              type="number"
              id="lxc-vmid"
              name="vmid"
              bind:value={(formData as ProxmoxLXCParams).vmid}
              oninput={() => validateField('vmid')}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="100"
              required
            />
            {#if validationErrors.vmid}
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.vmid}</p>
            {/if}
          </div>

          <!-- Hostname (Required) -->
          <div>
            <label for="lxc-hostname" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Hostname <span class="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="lxc-hostname"
              name="hostname"
              bind:value={(formData as ProxmoxLXCParams).hostname}
              oninput={() => validateField('hostname')}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="my-container"
              required
            />
            {#if validationErrors.hostname}
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.hostname}</p>
            {/if}
          </div>

          <!-- Node (Required) -->
          <div>
            <label for="lxc-node" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Node <span class="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="lxc-node"
              name="node"
              bind:value={(formData as ProxmoxLXCParams).node}
              oninput={() => validateField('node')}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="pve"
              required
            />
            {#if validationErrors.node}
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.node}</p>
            {/if}
          </div>

          <!-- OS Template (Required) -->
          <div>
            <label for="lxc-ostemplate" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              OS Template <span class="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="lxc-ostemplate"
              name="ostemplate"
              bind:value={(formData as ProxmoxLXCParams).ostemplate}
              oninput={() => validateField('ostemplate')}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="local:vztmpl/debian-12-standard_12.2-1_amd64.tar.zst"
              required
            />
            {#if validationErrors.ostemplate}
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.ostemplate}</p>
            {/if}
          </div>

          <!-- Cores (Optional) -->
          <div>
            <label for="lxc-cores" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Cores
            </label>
            <input
              type="number"
              id="lxc-cores"
              name="cores"
              bind:value={(formData as ProxmoxLXCParams).cores}
              oninput={() => validateField('cores')}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="1"
              min="1"
            />
            {#if validationErrors.cores}
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.cores}</p>
            {/if}
          </div>

          <!-- Memory (Optional) -->
          <div>
            <label for="lxc-memory" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Memory (MB)
            </label>
            <input
              type="number"
              id="lxc-memory"
              name="memory"
              bind:value={(formData as ProxmoxLXCParams).memory}
              oninput={() => validateField('memory')}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="512"
              min="512"
            />
            {#if validationErrors.memory}
              <p class="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.memory}</p>
            {/if}
          </div>
        </div>

        <!-- Full-width fields -->
        <div class="space-y-6">
          <!-- Root Filesystem (Optional) -->
          <div>
            <label for="lxc-rootfs" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Root Filesystem
            </label>
            <input
              type="text"
              id="lxc-rootfs"
              name="rootfs"
              bind:value={(formData as ProxmoxLXCParams).rootfs}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="local-lvm:8"
            />
          </div>

          <!-- Network Interface (Optional) -->
          <div>
            <label for="lxc-net0" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Network Interface
            </label>
            <input
              type="text"
              id="lxc-net0"
              name="net0"
              bind:value={(formData as ProxmoxLXCParams).net0}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="name=eth0,bridge=vmbr0,ip=dhcp"
            />
          </div>

          <!-- Password (Optional) -->
          <div>
            <label for="lxc-password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Root Password
            </label>
            <input
              type="password"
              id="lxc-password"
              name="password"
              bind:value={(formData as ProxmoxLXCParams).password}
              class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
              placeholder="Enter root password"
            />
          </div>
        </div>

        <!-- Submit Button (Validates Requirements: 4.6, 11.6) -->
        <div class="flex justify-end">
          <button
            type="submit"
            disabled={!isFormValid || submitting}
            class="inline-flex justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {#if submitting}
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Creating LXC...
            {:else}
              Create LXC Container
            {/if}
          </button>
        </div>
      </form>
    {/if}
  </div>
</div>
