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

  interface CreateUserRequest {
    username: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
    isAdmin: boolean;
  }

  // Form state
  let formData = $state<CreateUserRequest>({
    username: '',
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    isActive: true,
    isAdmin: false,
  });

  let isSaving = $state(false);
  let errors = $state<Record<string, string>>({});

  function validateForm(): boolean {
    errors = {};

    if (!formData.username.trim()) {
      errors.username = 'Username is required';
    } else if (formData.username.length < 3) {
      errors.username = 'Username must be at least 3 characters';
    }

    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Invalid email format';
    }

    if (!formData.password) {  // pragma: allowlist secret
      errors.password = 'Password is required';  // pragma: allowlist secret
    } else if (formData.password.length < 8) {  // pragma: allowlist secret
      errors.password = 'Password must be at least 8 characters';  // pragma: allowlist secret
    }

    if (!formData.firstName.trim()) {
      errors.firstName = 'First name is required';
    }

    if (!formData.lastName.trim()) {
      errors.lastName = 'Last name is required';
    }

    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(): Promise<void> {
    if (!validateForm()) {
      return;
    }

    isSaving = true;
    try {
      await post('/api/users', formData);
      showSuccess('User created', `User "${formData.username}" has been created successfully`);
      resetForm();
      onCreated();
      onClose();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create user';
      showError('Failed to create user', errorMessage);
    } finally {
      isSaving = false;
    }
  }

  function resetForm(): void {
    formData = {
      username: '',
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      isActive: true,
      isAdmin: false,
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
              Create New User
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
            <!-- Username -->
            <div>
              <label for="username" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Username <span class="text-red-500">*</span>
              </label>
              <input
                id="username"
                type="text"
                bind:value={formData.username}
                disabled={isSaving}
                class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="johndoe"
              />
              {#if errors.username}
                <p class="mt-1 text-sm text-red-600 dark:text-red-400">{errors.username}</p>
              {/if}
            </div>

            <!-- Email -->
            <div>
              <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email <span class="text-red-500">*</span>
              </label>
              <input
                id="email"
                type="email"
                bind:value={formData.email}
                disabled={isSaving}
                class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="john.doe@example.com"
              />
              {#if errors.email}
                <p class="mt-1 text-sm text-red-600 dark:text-red-400">{errors.email}</p>
              {/if}
            </div>

            <!-- Password -->
            <div>
              <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password <span class="text-red-500">*</span>
              </label>
              <input
                id="password"
                type="password"
                bind:value={formData.password}
                disabled={isSaving}
                autocomplete="new-password"
                class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="••••••••"
              />
              {#if errors.password}
                <p class="mt-1 text-sm text-red-600 dark:text-red-400">{errors.password}</p>
              {/if}
            </div>

            <!-- First Name -->
            <div>
              <label for="firstName" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                First Name <span class="text-red-500">*</span>
              </label>
              <input
                id="firstName"
                type="text"
                bind:value={formData.firstName}
                disabled={isSaving}
                class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="John"
              />
              {#if errors.firstName}
                <p class="mt-1 text-sm text-red-600 dark:text-red-400">{errors.firstName}</p>
              {/if}
            </div>

            <!-- Last Name -->
            <div>
              <label for="lastName" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Last Name <span class="text-red-500">*</span>
              </label>
              <input
                id="lastName"
                type="text"
                bind:value={formData.lastName}
                disabled={isSaving}
                class="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Doe"
              />
              {#if errors.lastName}
                <p class="mt-1 text-sm text-red-600 dark:text-red-400">{errors.lastName}</p>
              {/if}
            </div>

            <!-- Status Checkboxes -->
            <div class="space-y-3">
              <div class="flex items-center">
                <input
                  id="isActive"
                  type="checkbox"
                  bind:checked={formData.isActive}
                  disabled={isSaving}
                  class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <label for="isActive" class="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                  Active (user can log in)
                </label>
              </div>

              <div class="flex items-center">
                <input
                  id="isAdmin"
                  type="checkbox"
                  bind:checked={formData.isAdmin}
                  disabled={isSaving}
                  class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <label for="isAdmin" class="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                  Administrator
                </label>
              </div>
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
                Create User
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
{/if}
