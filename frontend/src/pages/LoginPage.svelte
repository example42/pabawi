<script lang="ts">
  import { authManager } from '../lib/auth.svelte';
  import { router } from '../lib/router.svelte';
  import { showError, showSuccess } from '../lib/toast.svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';

  let username = $state('');
  let password = $state(''); // pragma: allowlist secret
  let isSubmitting = $state(false);
  let validationErrors = $state<{ username?: string; password?: string }>({});

  // Redirect if already authenticated
  $effect(() => {
    if (authManager.isAuthenticated) {
      router.navigate('/');
    }
  });

  function validateForm(): boolean {
    const errors: { username?: string; password?: string } = {};

    if (!username.trim()) {
      errors.username = 'Username is required';
    } else if (username.length < 3) {
      errors.username = 'Username must be at least 3 characters';
    }

    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
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
    authManager.clearError();

    const success = await authManager.login({ username, password });

    if (success) {
      showSuccess('Login successful', `Welcome back, ${username}!`);
      router.navigate('/');
    } else {
      showError('Login failed', authManager.error?.message || 'Invalid credentials');
    }

    isSubmitting = false;
  }

  function handleRegisterClick(): void {
    router.navigate('/register');
  }
</script>

<div class="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
  <div class="max-w-md w-full space-y-8">
    <div>
      <div class="flex justify-center">
        <img
          src="/favicon/web-app-manifest-512x512.png"
          alt="Pabawi Logo"
          class="h-16 w-16"
        />
      </div>
      <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
        Sign in to Pabawi
      </h2>
      <p class="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
        Infrastructure automation management
      </p>
    </div>

    <form class="mt-8 space-y-6" onsubmit={handleSubmit}>
      <div class="rounded-md shadow-sm space-y-4">
        <!-- Username field -->
        <div>
          <label for="username" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Username
          </label>
          <input
            id="username"
            name="username"
            type="text"
            autocomplete="username"
            required
            bind:value={username}
            disabled={isSubmitting}
            class="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm bg-white dark:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Enter your username"
          />
          {#if validationErrors.username}
            <p class="mt-1 text-sm text-red-600 dark:text-red-400">
              {validationErrors.username}
            </p>
          {/if}
        </div>

        <!-- Password field -->
        <div>
          <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autocomplete="current-password"
            required
            bind:value={password}
            disabled={isSubmitting}
            class="appearance-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm bg-white dark:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Enter your password"
          />
          {#if validationErrors.password}
            <p class="mt-1 text-sm text-red-600 dark:text-red-400">
              {validationErrors.password}
            </p>
          {/if}
        </div>
      </div>

      <!-- Error message -->
      {#if authManager.error}
        <div class="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
          <div class="flex">
            <div class="flex-shrink-0">
              <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="ml-3">
              <p class="text-sm text-red-800 dark:text-red-200">
                {authManager.error.message}
              </p>
            </div>
          </div>
        </div>
      {/if}

      <!-- Submit button -->
      <div>
        <button
          type="submit"
          disabled={isSubmitting}
          class="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed dark:focus:ring-offset-gray-900"
        >
          {#if isSubmitting}
            <span class="flex items-center gap-2">
              <LoadingSpinner size="sm" />
              Signing in...
            </span>
          {:else}
            Sign in
          {/if}
        </button>
      </div>

      <!-- Register link -->
      <div class="text-center">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Don't have an account?
          <button
            type="button"
            onclick={handleRegisterClick}
            class="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
          >
            Register here
          </button>
        </p>
      </div>
    </form>
  </div>
</div>
