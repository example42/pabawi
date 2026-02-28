<script lang="ts">
  import { router } from '../lib/router.svelte';
  import { showError, showSuccess } from '../lib/toast.svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import { post } from '../lib/api';

  let username = $state('');
  let email = $state('');
  let password = $state(''); // pragma: allowlist secret
  let confirmPassword = $state(''); // pragma: allowlist secret
  let firstName = $state('');
  let lastName = $state('');
  let allowSelfRegistration = $state(false);
  let defaultNewUserRole = $state<string | null>('role-viewer-001'); // Default to Viewer
  let isSubmitting = $state(false);
  let validationErrors = $state<Record<string, string>>({});

  // Password strength indicators
  let passwordStrength = $derived.by(() => {
    if (!password) return { score: 0, label: '', color: '' };

    let score = 0;
    if (password.length >= 8) score++;
    if (/[a-z]/.test(password)) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    if (score <= 2) return { score, label: 'Weak', color: 'text-red-600 dark:text-red-400' };
    if (score === 3) return { score, label: 'Fair', color: 'text-yellow-600 dark:text-yellow-400' };
    if (score === 4) return { score, label: 'Good', color: 'text-blue-600 dark:text-blue-400' };
    return { score, label: 'Strong', color: 'text-green-600 dark:text-green-400' };
  });

  function validateForm(): boolean {
    const errors: Record<string, string> = {};

    // Username validation
    if (!username.trim()) {
      errors.username = 'Username is required';
    } else if (username.length < 3 || username.length > 50) {
      errors.username = 'Username must be 3-50 characters';
    } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      errors.username = 'Username can only contain letters, numbers, and underscores';
    }

    // Email validation
    if (!email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email address';
    }

    // First name validation
    if (!firstName.trim()) {
      errors.firstName = 'First name is required';
    } else if (firstName.length > 100) {
      errors.firstName = 'First name must be less than 100 characters';
    }

    // Last name validation
    if (!lastName.trim()) {
      errors.lastName = 'Last name is required';
    } else if (lastName.length > 100) {
      errors.lastName = 'Last name must be less than 100 characters';
    }

    // Password validation
    if (!password) {
      errors.password = 'Password is required'; // pragma: allowlist secret
    } else {
      const passwordErrors: string[] = [];

      if (password.length < 8) {
        passwordErrors.push('at least 8 characters');
      }
      if (!/[a-z]/.test(password)) {
        passwordErrors.push('a lowercase letter');
      }
      if (!/[A-Z]/.test(password)) {
        passwordErrors.push('an uppercase letter');
      }
      if (!/[0-9]/.test(password)) {
        passwordErrors.push('a number');
      }
      if (!/[^a-zA-Z0-9]/.test(password)) {
        passwordErrors.push('a special character');
      }

      if (passwordErrors.length > 0) {
        errors.password = `Password must contain ${passwordErrors.join(', ')}`;
      }
    }

    // Confirm password validation
    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your password'; // pragma: allowlist secret
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match'; // pragma: allowlist secret
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
      await post('/api/setup/initialize', {
        username,
        email,
        password,
        firstName,
        lastName,
        allowSelfRegistration,
        defaultNewUserRole,
      });

      showSuccess('Setup complete', 'Your administrator account has been created. You can now log in.');
      router.navigate('/login');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Setup failed';
      showError('Setup failed', errorMessage);
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
  <div class="max-w-2xl w-full space-y-8">
    <div>
      <div class="flex justify-center">
        <img
          src="/favicon/web-app-manifest-512x512.png"
          alt="Pabawi Logo"
          class="h-20 w-20"
        />
      </div>
      <h2 class="mt-6 text-center text-4xl font-extrabold text-gray-900 dark:text-white">
        Welcome to Pabawi
      </h2>
      <p class="mt-2 text-center text-base text-gray-600 dark:text-gray-400">
        Let's set up your administrator account
      </p>
    </div>

    <form class="mt-8 space-y-6 bg-white dark:bg-gray-800 shadow-lg rounded-lg p-8" onsubmit={handleSubmit}>
      <div class="space-y-6">
        <!-- Admin Account Section -->
        <div>
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Administrator Account
          </h3>
          <div class="space-y-4">
            <!-- Username field -->
            <div>
              <label for="username" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Username *
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autocomplete="username"
                required
                bind:value={username}
                disabled={isSubmitting}
                class="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Choose an admin username"
              />
              {#if validationErrors.username}
                <p class="mt-1 text-sm text-red-600 dark:text-red-400">
                  {validationErrors.username}
                </p>
              {/if}
            </div>

            <!-- Email field -->
            <div>
              <label for="email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email *
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autocomplete="email"
                required
                bind:value={email}
                disabled={isSubmitting}
                class="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="admin@example.com"
              />
              {#if validationErrors.email}
                <p class="mt-1 text-sm text-red-600 dark:text-red-400">
                  {validationErrors.email}
                </p>
              {/if}
            </div>

            <!-- Name fields -->
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="firstName" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  First Name *
                </label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  autocomplete="given-name"
                  required
                  bind:value={firstName}
                  disabled={isSubmitting}
                  class="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="John"
                />
                {#if validationErrors.firstName}
                  <p class="mt-1 text-sm text-red-600 dark:text-red-400">
                    {validationErrors.firstName}
                  </p>
                {/if}
              </div>

              <div>
                <label for="lastName" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Last Name *
                </label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  autocomplete="family-name"
                  required
                  bind:value={lastName}
                  disabled={isSubmitting}
                  class="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Doe"
                />
                {#if validationErrors.lastName}
                  <p class="mt-1 text-sm text-red-600 dark:text-red-400">
                    {validationErrors.lastName}
                  </p>
                {/if}
              </div>
            </div>

            <!-- Password field -->
            <div>
              <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Password *
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autocomplete="new-password"
                required
                bind:value={password}
                disabled={isSubmitting}
                class="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Create a strong password"
              />
              {#if password && passwordStrength.score > 0}
                <p class="mt-1 text-sm {passwordStrength.color}">
                  Password strength: {passwordStrength.label}
                </p>
              {/if}
              {#if validationErrors.password}
                <p class="mt-1 text-sm text-red-600 dark:text-red-400">
                  {validationErrors.password}
                </p>
              {/if}
            </div>

            <!-- Confirm password field -->
            <div>
              <label for="confirmPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Confirm Password *
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autocomplete="new-password"
                required
                bind:value={confirmPassword}
                disabled={isSubmitting}
                class="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm bg-white dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder="Confirm your password"
              />
              {#if validationErrors.confirmPassword}
                <p class="mt-1 text-sm text-red-600 dark:text-red-400">
                  {validationErrors.confirmPassword}
                </p>
              {/if}
            </div>
          </div>
        </div>

        <!-- Configuration Section -->
        <div class="border-t border-gray-200 dark:border-gray-700 pt-6">
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
            User Registration Settings
          </h3>
          <div class="space-y-4">
            <!-- Self-registration toggle -->
            <div class="flex items-start">
              <div class="flex items-center h-5">
                <input
                  id="allowSelfRegistration"
                  name="allowSelfRegistration"
                  type="checkbox"
                  bind:checked={allowSelfRegistration}
                  disabled={isSubmitting}
                  class="focus:ring-primary-500 h-4 w-4 text-primary-600 border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <div class="ml-3 text-sm">
                <label for="allowSelfRegistration" class="font-medium text-gray-700 dark:text-gray-300">
                  Allow self-registration
                </label>
                <p class="text-gray-500 dark:text-gray-400">
                  When enabled, users can create their own accounts. When disabled, only administrators can create user accounts.
                </p>
              </div>
            </div>

            <!-- Default role selection -->
            <div>
              <label for="defaultRole" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Default role for new users
              </label>
              <select
                id="defaultRole"
                name="defaultRole"
                bind:value={defaultNewUserRole}
                disabled={isSubmitting}
                class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="role-viewer-001">Viewer (Read-only access)</option>
                <option value="role-operator-001">Operator (Read and execute access)</option>
                <option value={null}>None (No default permissions)</option>
              </select>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                This role will be automatically assigned to new users. You can change individual user permissions later.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Password requirements info -->
      <div class="rounded-md bg-blue-50 dark:bg-blue-900/20 p-4">
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
            <div class="mt-2 text-sm text-blue-700 dark:text-blue-300">
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

      <!-- Submit button -->
      <div>
        <button
          type="submit"
          disabled={isSubmitting}
          class="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed dark:focus:ring-offset-gray-900"
        >
          {#if isSubmitting}
            <span class="flex items-center gap-2">
              <LoadingSpinner size="sm" />
              Setting up...
            </span>
          {:else}
            Complete Setup
          {/if}
        </button>
      </div>
    </form>
  </div>
</div>
