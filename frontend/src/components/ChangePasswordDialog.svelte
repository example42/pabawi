<script lang="ts">
  import { authManager } from '../lib/auth.svelte';
  import { showError, showSuccess } from '../lib/toast.svelte';
  import LoadingSpinner from './LoadingSpinner.svelte';
  import { post } from '../lib/api';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen = $bindable(), onClose }: Props = $props();

  let currentPassword = $state(''); // pragma: allowlist secret
  let newPassword = $state(''); // pragma: allowlist secret
  let confirmPassword = $state(''); // pragma: allowlist secret
  let isSubmitting = $state(false);
  let validationErrors = $state<Record<string, string>>({});

  // Password strength indicators
  let passwordStrength = $derived.by(() => {
    if (!newPassword) return { score: 0, label: '', color: '' };

    let score = 0;
    if (newPassword.length >= 8) score++;
    if (/[a-z]/.test(newPassword)) score++;
    if (/[A-Z]/.test(newPassword)) score++;
    if (/[0-9]/.test(newPassword)) score++;
    if (/[^a-zA-Z0-9]/.test(newPassword)) score++;

    if (score <= 2) return { score, label: 'Weak', color: 'text-red-600 dark:text-red-400' };
    if (score === 3) return { score, label: 'Fair', color: 'text-yellow-600 dark:text-yellow-400' };
    if (score === 4) return { score, label: 'Good', color: 'text-blue-600 dark:text-blue-400' };
    return { score, label: 'Strong', color: 'text-green-600 dark:text-green-400' };
  });

  function validateForm(): boolean {
    const errors: Record<string, string> = {};

    // Current password validation
    if (!currentPassword) {
      errors.currentPassword = 'Current password is required';
    }

    // New password validation (Requirement: 20.2)
    if (!newPassword) {
      errors.newPassword = 'New password is required';
    } else {
      const passwordErrors: string[] = [];

      if (newPassword.length < 8) {
        passwordErrors.push('at least 8 characters');
      }
      if (!/[a-z]/.test(newPassword)) {
        passwordErrors.push('a lowercase letter');
      }
      if (!/[A-Z]/.test(newPassword)) {
        passwordErrors.push('an uppercase letter');
      }
      if (!/[0-9]/.test(newPassword)) {
        passwordErrors.push('a number');
      }
      if (!/[^a-zA-Z0-9]/.test(newPassword)) {
        passwordErrors.push('a special character');
      }

      if (passwordErrors.length > 0) {
        errors.newPassword = `Password must contain ${passwordErrors.join(', ')}`;
      }
    }

    // Confirm password validation
    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your new password';
    } else if (newPassword !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    // Check if new password is different from current
    if (currentPassword && newPassword && currentPassword === newPassword) {
      errors.newPassword = 'New password must be different from current password';
    }

    validationErrors = errors;
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(event: Event): Promise<void> {
    event.preventDefault();

    if (!validateForm()) {
      return;
    }

    isSubmitting = true;

    try {
      // Requirement: 20.1, 20.2, 20.3, 20.4
      await post('/api/auth/change-password', {
        currentPassword,
        newPassword,
      });

      showSuccess('Password changed', 'Your password has been updated successfully. Please log in again.');

      // Clear form
      currentPassword = '';
      newPassword = '';
      confirmPassword = '';
      validationErrors = {};

      // Close dialog
      onClose();

      // Logout user (tokens are revoked on backend)
      await authManager.logout();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to change password';

      // Handle specific error cases
      if (errorMessage.toLowerCase().includes('current password')) {
        validationErrors = { ...validationErrors, currentPassword: 'Current password is incorrect' };
      }

      showError('Password change failed', errorMessage);
    } finally {
      isSubmitting = false;
    }
  }

  function handleClose(): void {
    if (!isSubmitting) {
      currentPassword = '';
      newPassword = '';
      confirmPassword = '';
      validationErrors = {};
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
        <div class="bg-white dark:bg-gray-800 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
          <div class="flex items-start justify-between mb-4">
            <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">
              Change Password
            </h3>
            <button
              type="button"
              onclick={handleClose}
              disabled={isSubmitting}
              class="rounded-md text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span class="sr-only">Close</span>
              <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Form -->
          <form onsubmit={handleSubmit} class="space-y-4">
            <!-- Current password field -->
            <div>
              <label for="currentPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Current Password *
              </label>
              <input
                id="currentPassword"
                name="currentPassword"
                type="password"
                autocomplete="current-password"
                required
                bind:value={currentPassword}
                disabled={isSubmitting}
                class="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Enter your current password"
              />
              {#if validationErrors.currentPassword}
                <p class="mt-1 text-sm text-red-600 dark:text-red-400">
                  {validationErrors.currentPassword}
                </p>
              {/if}
            </div>

            <!-- New password field -->
            <div>
              <label for="newPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                New Password *
              </label>
              <input
                id="newPassword"
                name="newPassword"
                type="password"
                autocomplete="new-password"
                required
                bind:value={newPassword}
                disabled={isSubmitting}
                class="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Enter your new password"
              />
              {#if newPassword && passwordStrength.score > 0}
                <p class="mt-1 text-sm {passwordStrength.color}">
                  Password strength: {passwordStrength.label}
                </p>
              {/if}
              {#if validationErrors.newPassword}
                <p class="mt-1 text-sm text-red-600 dark:text-red-400">
                  {validationErrors.newPassword}
                </p>
              {/if}
            </div>

            <!-- Confirm password field -->
            <div>
              <label for="confirmPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Confirm New Password *
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autocomplete="new-password"
                required
                bind:value={confirmPassword}
                disabled={isSubmitting}
                class="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Confirm your new password"
              />
              {#if validationErrors.confirmPassword}
                <p class="mt-1 text-sm text-red-600 dark:text-red-400">
                  {validationErrors.confirmPassword}
                </p>
              {/if}
            </div>

            <!-- Password requirements -->
            <div class="rounded-md bg-blue-50 dark:bg-blue-900/20 p-3">
              <div class="flex">
                <div class="flex-shrink-0">
                  <svg class="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="ml-3">
                  <h3 class="text-sm font-medium text-blue-800 dark:text-blue-200">
                    Password Requirements
                  </h3>
                  <div class="mt-2 text-xs text-blue-700 dark:text-blue-300">
                    <ul class="list-disc list-inside space-y-1">
                      <li>At least 8 characters long</li>
                      <li>Contains uppercase and lowercase letters</li>
                      <li>Contains at least one number</li>
                      <li>Contains at least one special character</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <!-- Action buttons -->
            <div class="flex gap-3 pt-4">
              <button
                type="button"
                onclick={handleClose}
                disabled={isSubmitting}
                class="flex-1 inline-flex justify-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                class="flex-1 inline-flex justify-center rounded-md border border-transparent bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {#if isSubmitting}
                  <span class="flex items-center gap-2">
                    <LoadingSpinner size="sm" />
                    Changing...
                  </span>
                {:else}
                  Change Password
                {/if}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
{/if}
