<script lang="ts">
  import { post } from '../lib/api';
  import { showSuccess } from '../lib/toast.svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onCreated: () => void;
  }

  let { isOpen = $bindable(), onClose, onCreated }: Props = $props();

  // Form state
  let roleName = $state('');
  let description = $state('');
  let isSubmitting = $state(false);
  let errorMessage = $state('');

  // Validation derived state
  let nameError = $derived(
    roleName.length > 0 && roleName.length < 3
      ? 'Role name must be at least 3 characters'
      : roleName.length > 100
        ? 'Role name must not exceed 100 characters'
        : ''
  );

  let descriptionError = $derived(
    description.length > 500
      ? 'Description must not exceed 500 characters'
      : ''
  );

  let isValid = $derived(
    roleName.length >= 3 &&
    roleName.length <= 100 &&
    description.length <= 500
  );

  let dialogRef = $state<HTMLDialogElement | null>(null);

  // Open/close the native dialog when isOpen changes
  $effect(() => {
    if (isOpen && dialogRef) {
      dialogRef.showModal();
    } else if (!isOpen && dialogRef) {
      dialogRef.close();
    }
  });

  async function handleSubmit(event: Event): Promise<void> {
    event.preventDefault();
    if (!isValid || isSubmitting) return;

    isSubmitting = true;
    errorMessage = '';

    try {
      await post('/api/roles', { name: roleName.trim(), description: description.trim() });
      showSuccess('Role created', `Role "${roleName.trim()}" has been created successfully`);
      resetForm();
      isOpen = false;
      onCreated();
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('409') || error.message.toLowerCase().includes('already exists') || error.message.toLowerCase().includes('conflict')) {
          errorMessage = 'A role with this name already exists';
        } else {
          errorMessage = error.message || 'Failed to create role. Please try again.';
        }
      } else {
        errorMessage = 'An unexpected error occurred. Please try again.';
      }
    } finally {
      isSubmitting = false;
    }
  }

  function resetForm(): void {
    roleName = '';
    description = '';
    errorMessage = '';
  }

  function handleClose(): void {
    if (isSubmitting) return;
    resetForm();
    isOpen = false;
    onClose();
  }

  function handleDialogCancel(event: Event): void {
    event.preventDefault();
    handleClose();
  }

  function handleBackdropClick(event: MouseEvent): void {
    if (event.target === dialogRef) {
      handleClose();
    }
  }
</script>

<dialog
  bind:this={dialogRef}
  oncancel={handleDialogCancel}
  onclick={handleBackdropClick}
  class="backdrop:bg-gray-500/75 dark:backdrop:bg-gray-900/75 bg-transparent p-0 max-w-lg w-full rounded-lg"
  aria-labelledby="create-role-title"
>
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl">
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
      <h2 id="create-role-title" class="text-lg font-medium text-gray-900 dark:text-white">
        Create Role
      </h2>
      <button
        type="button"
        onclick={handleClose}
        disabled={isSubmitting}
        class="rounded-md text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Close dialog"
      >
        <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Form -->
    <form onsubmit={handleSubmit} class="px-6 py-4 space-y-4">
      <!-- Error message -->
      {#if errorMessage}
        <div class="rounded-md bg-red-50 dark:bg-red-900/20 p-3" role="alert" aria-live="assertive">
          <p class="text-sm text-red-700 dark:text-red-400">{errorMessage}</p>
        </div>
      {/if}

      <!-- Role Name -->
      <div>
        <label for="role-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Role Name <span class="text-red-500">*</span>
        </label>
        <input
          id="role-name"
          type="text"
          bind:value={roleName}
          disabled={isSubmitting}
          placeholder="Enter role name"
          class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-describedby={nameError ? 'name-error' : undefined}
          aria-invalid={nameError ? 'true' : undefined}
          maxlength="101"
        />
        {#if nameError}
          <p id="name-error" class="mt-1 text-sm text-red-600 dark:text-red-400">{nameError}</p>
        {/if}
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {roleName.length}/100 characters
        </p>
      </div>

      <!-- Description -->
      <div>
        <label for="role-description" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Description
        </label>
        <textarea
          id="role-description"
          bind:value={description}
          disabled={isSubmitting}
          placeholder="Enter role description"
          rows="3"
          class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-describedby={descriptionError ? 'description-error' : undefined}
          aria-invalid={descriptionError ? 'true' : undefined}
          maxlength="501"
        ></textarea>
        {#if descriptionError}
          <p id="description-error" class="mt-1 text-sm text-red-600 dark:text-red-400">{descriptionError}</p>
        {/if}
        <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {description.length}/500 characters
        </p>
      </div>

      <!-- Actions -->
      <div class="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onclick={handleClose}
          disabled={isSubmitting}
          class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!isValid || isSubmitting}
          class="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {#if isSubmitting}
            Creating...
          {:else}
            Create Role
          {/if}
        </button>
      </div>
    </form>
  </div>
</dialog>
