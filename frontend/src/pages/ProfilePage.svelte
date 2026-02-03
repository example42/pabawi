<!--
  User Profile Page

  Displays and manages the current user's profile information.

  @module pages/ProfilePage
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ErrorAlert from '../components/ErrorAlert.svelte';
  import { auth } from '../lib/auth.svelte';
  import { get, put } from '../lib/api';
  import { showSuccess, showError } from '../lib/toast.svelte';
  import { navigate } from '../lib/router.svelte';
  import type { DebugInfo } from '../lib/api';

  const pageTitle = 'Pabawi - User Profile';

  // ==========================================================================
  // Types
  // ==========================================================================

  interface PasswordChangeRequest {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }

  // ==========================================================================
  // State
  // ==========================================================================

  let loading = $state(true);
  let saving = $state(false);
  let changingPassword = $state(false);
  let error = $state<string | null>(null);
  let debugInfo = $state<DebugInfo | null>(null);

  // Profile form
  let displayName = $state('');
  let email = $state('');

  // Password change form
  let showPasswordForm = $state(false);
  let passwordForm = $state<PasswordChangeRequest>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  let passwordError = $state<string | null>(null);

  // ==========================================================================
  // Derived State
  // ==========================================================================

  const user = $derived(auth.user);
  const isAuthenticated = $derived(auth.isAuthenticated);

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    document.title = pageTitle;

    // Redirect if not authenticated
    if (!isAuthenticated) {
      navigate('/login?redirect=/profile');
      return;
    }

    // Initialize form with current user data
    if (user) {
      displayName = user.displayName || '';
      email = user.email || '';
    }

    loading = false;
  });

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  async function handleSaveProfile(): Promise<void> {
    if (!user) return;

    saving = true;
    error = null;

    try {
      await put(`/api/users/${user.id}`, {
        displayName: displayName.trim() || undefined,
        email: email.trim()
      });

      // Refresh user data
      await auth.fetchPermissions();

      showSuccess('Profile updated successfully');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to update profile';
      showError(error);
    } finally {
      saving = false;
    }
  }

  async function handleChangePassword(): Promise<void> {
    if (!user) return;

    passwordError = null;

    // Validate passwords match
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      passwordError = 'New passwords do not match'; // pragma: allowlist secret
      return;
    }

    // Validate password length
    if (passwordForm.newPassword.length < 8) {
      passwordError = 'Password must be at least 8 characters'; // pragma: allowlist secret
      return;
    }

    changingPassword = true;

    try {
      await put(`/api/users/${user.id}/password`, {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });

      // Reset form
      passwordForm = {
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      };
      showPasswordForm = false;

      showSuccess('Password changed successfully');
    } catch (err) {
      passwordError = err instanceof Error ? err.message : 'Failed to change password';
      showError(passwordError);
    } finally {
      changingPassword = false;
    }
  }

  function togglePasswordForm(): void {
    showPasswordForm = !showPasswordForm;
    if (!showPasswordForm) {
      passwordForm = {
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      };
      passwordError = null;
    }
  }
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<div class="py-6">
  <div class="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white">User Profile</h1>
      <p class="mt-2 text-gray-600 dark:text-gray-400">
        Manage your account settings and preferences
      </p>
    </div>

    {#if loading}
      <div class="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    {:else if !isAuthenticated}
      <ErrorAlert message="You must be logged in to view this page." />
    {:else if user}
      <!-- Account Information -->
      <div class="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Account Information</h2>

        <dl class="grid gap-4 sm:grid-cols-2">
          <div>
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Username</dt>
            <dd class="mt-1 text-gray-900 dark:text-white">{user.username}</dd>
          </div>
          <div>
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">User ID</dt>
            <dd class="mt-1 font-mono text-sm text-gray-600 dark:text-gray-400">{user.id}</dd>
          </div>
          <div>
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Roles</dt>
            <dd class="mt-1 flex flex-wrap gap-1">
              {#if user.roles.length > 0}
                {#each user.roles as role}
                  <span class="inline-flex items-center rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-800 dark:bg-primary-900/30 dark:text-primary-400">
                    {role}
                  </span>
                {/each}
              {:else}
                <span class="text-gray-500 dark:text-gray-400">No roles assigned</span>
              {/if}
            </dd>
          </div>
          <div>
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Groups</dt>
            <dd class="mt-1 flex flex-wrap gap-1">
              {#if user.groups.length > 0}
                {#each user.groups as group}
                  <span class="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                    {group}
                  </span>
                {/each}
              {:else}
                <span class="text-gray-500 dark:text-gray-400">No groups</span>
              {/if}
            </dd>
          </div>
          <div>
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Account Created</dt>
            <dd class="mt-1 text-gray-900 dark:text-white">
              {new Date(user.createdAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </dd>
          </div>
          <div>
            <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Last Login</dt>
            <dd class="mt-1 text-gray-900 dark:text-white">
              {#if user.lastLoginAt}
                {new Date(user.lastLoginAt).toLocaleString()}
              {:else}
                <span class="text-gray-500 dark:text-gray-400">Never</span>
              {/if}
            </dd>
          </div>
        </dl>
      </div>

      <!-- Edit Profile -->
      <div class="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Edit Profile</h2>

        {#if error}
          <ErrorAlert message={error} class="mb-4" />
        {/if}

        <form onsubmit={(e) => { e.preventDefault(); handleSaveProfile(); }} class="space-y-4">
          <div>
            <label for="displayName" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Display Name
            </label>
            <input
              type="text"
              id="displayName"
              bind:value={displayName}
              placeholder="Enter your display name"
              class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-primary-500"
            />
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              This name will be displayed in the navigation and throughout the application.
            </p>
          </div>

          <div>
            <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              bind:value={email}
              placeholder="Enter your email"
              required
              class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-primary-500"
            />
          </div>

          <div class="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              class="inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-gray-800"
            >
              {#if saving}
                <svg class="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              {:else}
                Save Changes
              {/if}
            </button>
          </div>
        </form>
      </div>

      <!-- Change Password -->
      <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div class="flex items-center justify-between">
          <div>
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Change Password</h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Update your password to keep your account secure
            </p>
          </div>
          <button
            type="button"
            onclick={togglePasswordForm}
            class="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 dark:focus:ring-offset-gray-800"
          >
            {showPasswordForm ? 'Cancel' : 'Change Password'}
          </button>
        </div>

        {#if showPasswordForm}
          <form onsubmit={(e) => { e.preventDefault(); handleChangePassword(); }} class="mt-6 space-y-4">
            {#if passwordError}
              <ErrorAlert message={passwordError} />
            {/if}

            <div>
              <label for="currentPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Current Password
              </label>
              <input
                type="password"
                id="currentPassword"
                bind:value={passwordForm.currentPassword}
                required
                class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-primary-500"
              />
            </div>

            <div>
              <label for="newPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                New Password
              </label>
              <input
                type="password"
                id="newPassword"
                bind:value={passwordForm.newPassword}
                required
                minlength="8"
                class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-primary-500"
              />
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Must be at least 8 characters long
              </p>
            </div>

            <div>
              <label for="confirmPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Confirm New Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                bind:value={passwordForm.confirmPassword}
                required
                class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:focus:border-primary-500"
              />
            </div>

            <div class="flex justify-end">
              <button
                type="submit"
                disabled={changingPassword}
                class="inline-flex items-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-gray-800"
              >
                {#if changingPassword}
                  <svg class="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Changing...
                {:else}
                  Update Password
                {/if}
              </button>
            </div>
          </form>
        {/if}
      </div>
    {/if}
  </div>
</div>
