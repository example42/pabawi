<script lang="ts">
  import { post } from '../lib/api';
  import { showError, showSuccess } from '../lib/toast.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void;
  }

  let { isOpen = $bindable(), onClose, onCreated }: Props = $props();

  interface CreateGroupRequest {
    name: string;
    description: string;
  }

  // Form state
  let formData = $state<CreateGroupRequest>({
    name: '',
    description: '',
  });

  let isSaving = $state(false);
  let errors = $state<Record<string, string>>({});

  function validateForm(): boolean {
    errors = {};

    if (!formData.name.trim()) {
      errors.name = 'Group name is required';
    } else if (formData.name.length < 3) {
      errors.name = 'Group name must be at least 3 characters';
    }

    if (!formData.description.trim()) {
      errors.description = 'Description is required';
    }

    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(): Promise<void> {
    if (!validateForm()) {
      return;
    }

    isSaving = true;
    try {
      await post('/api/groups', formData);
      showSuccess('Group created', `Group "${formData.name}" has been created successfully`);
      resetForm();
      onCreated();
      onClose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create group';
      showError('Failed to create group', errorMessage);
    } finally {
      isSaving = false;
    }
  }

  function resetForm(): void {
    formData = {
      name: '',
      description: '',
    };
    errors = {};
  }

  function handleClose(): void {
    if (!isSaving) {
      resetForm();
      onClose();
    }
  }

  function handleBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  }
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-gray-500 bg-opacity-75 dark:bg-gray-900 dark:bg-opacity-75 transition-opacity z-40"
    onclick={handleBackdropClick}
    role="presentation"
  ></div>

  <!-- Dialog -->
  <div class="fixed inset-0 z-50 overflow-y-auto">
    <div class="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
      <div class="relative transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
        <!-- Header -->
        <div class="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6">
          <div class="flex items-start justify-between mb-4">
            <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">
              Create New Group
            </h3>
            <button
              type="button"
              onclick={handleClose}
              disabled={isSaving}
              class="rounded-md text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span class="sr-only">Close</span>
              <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Form -->
          <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
            <!-- Group Name -->
            <div>
              <label for="name" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Group Name <span class="text-red-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                bind:value={formData.name}
                disabled={isSaving}
                class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Developers"
              />
              {#if errors.name}
                <p class="mt-1 text-sm text-red-600 dark:text-red-400">{errors.name}</p>
              {/if}
            </div>

            <!-- Description -->
            <div>
              <label for="description" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Description <span class="text-red-500">*</span>
              </label>
              <textarea
                id="description"
                bind:value={formData.description}
                disabled={isSaving}
                rows="3"
                class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Group for development team members"
              ></textarea>
              {#if errors.description}
                <p class="mt-1 text-sm text-red-600 dark:text-red-400">{errors.description}</p>
              {/if}
            </div>

            <!-- Action Buttons -->
            <div class="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onclick={handleClose}
                disabled={isSaving}
                class="flex-1 inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                class="flex-1 inline-flex justify-center items-center gap-2 rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {#if isSaving}
                  <LoadingSpinner size="sm" />
                {/if}
                Create Group
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
{/if}
