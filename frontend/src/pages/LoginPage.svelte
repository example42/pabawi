<script lang="ts">
  import { authManager } from '../lib/auth.svelte';
  import { router } from '../lib/router.svelte';
  import { showError, showSuccess } from '../lib/toast.svelte';
  import { entraIdAuth } from '../lib/entraIdAuth.svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import EntraIdLoginButton from '../components/EntraIdLoginButton.svelte';
  import { get } from '../lib/api';

  let username = $state('');
  let password = $state(''); // pragma: allowlist secret
  let isSubmitting = $state(false);
  let validationErrors = $state<{ username?: string; password?: string }>({});
  let selfRegistrationAllowed = $state(false);
  let checkingConfig = $state(true);
  let initialized = false;

  // Redirect if already authenticated
  $effect(() => {
    if (authManager.isAuthenticated) {
      router.navigate('/');
    }
  });

  // On mount: check for SSO callback code, then discover providers and config
  $effect(() => {
    if (initialized) return;
    initialized = true;
    void initializeLoginPage();
  });

  async function initializeLoginPage(): Promise<void> {
    // First, check if this is an SSO callback with ?code= parameter
    const handled = await entraIdAuth.handleSsoCallback();
    if (handled) {
      // Callback was handled (code was exchanged or failed) — don't proceed with discovery
      return;
    }

    // Discover available auth providers and check self-registration in parallel
    await Promise.all([
      entraIdAuth.discoverProviders(),
      checkSelfRegistration(),
    ]);
  }

  async function checkSelfRegistration(): Promise<void> {
    try {
      const status = await get<{ config: { allowSelfRegistration: boolean } | null }>('/api/setup/status');
      selfRegistrationAllowed = status.config?.allowSelfRegistration ?? false;
    } catch {
      selfRegistrationAllowed = false;
    } finally {
      checkingConfig = false;
    }
  }

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
      router.navigateToIntendedOrDefault('/');
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

    <!-- SSO code exchange in progress -->
    {#if entraIdAuth.isExchangingCode}
      <div class="flex flex-col items-center justify-center py-8">
        <LoadingSpinner size="lg" />
        <p class="mt-4 text-sm text-gray-600 dark:text-gray-400">
          Completing sign-in...
        </p>
      </div>

    <!-- SSO token exchange error -->
    {:else if entraIdAuth.exchangeError}
      <div class="space-y-6">
        <div class="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
          <div class="flex">
            <div class="flex-shrink-0">
              <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="ml-3">
              <p class="text-sm font-medium text-red-800 dark:text-red-200">
                SSO authentication failed
              </p>
              <p class="mt-1 text-sm text-red-700 dark:text-red-300">
                {entraIdAuth.exchangeError}
              </p>
            </div>
          </div>
        </div>

        <!-- Show SSO button and local form below the error -->
        {#if entraIdAuth.isEntraIdEnabled}
          <EntraIdLoginButton providerName={entraIdAuth.entraIdProviderName} />
          <div class="relative">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-gray-300 dark:border-gray-600"></div>
            </div>
            <div class="relative flex justify-center text-sm">
              <span class="px-2 bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">or</span>
            </div>
          </div>
        {/if}
      </div>

    {:else}
      <!-- Normal login state: SSO button + local form -->
      <div class="mt-8 space-y-6">
        <!-- Entra ID SSO button (when enabled) -->
        {#if entraIdAuth.isEntraIdEnabled}
          <EntraIdLoginButton providerName={entraIdAuth.entraIdProviderName} />

          <!-- Divider -->
          <div class="relative">
            <div class="absolute inset-0 flex items-center">
              <div class="w-full border-t border-gray-300 dark:border-gray-600"></div>
            </div>
            <div class="relative flex justify-center text-sm">
              <span class="px-2 bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400">or</span>
            </div>
          </div>
        {/if}

        <!-- Provider discovery error warning -->
        {#if entraIdAuth.providerDiscoveryError}
          <div class="rounded-md bg-yellow-50 dark:bg-yellow-900/20 p-3">
            <div class="flex">
              <div class="flex-shrink-0">
                <svg class="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                </svg>
              </div>
              <div class="ml-3">
                <p class="text-sm text-yellow-700 dark:text-yellow-200">
                  SSO availability could not be determined. You can still sign in with your local credentials.
                </p>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <!-- Local login form (always shown unless code exchange is in progress) -->
    {#if !entraIdAuth.isExchangingCode}
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

        <!-- Register link (only show if self-registration is allowed) -->
        {#if !checkingConfig && selfRegistrationAllowed}
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
        {/if}
      </form>
    {/if}
  </div>
</div>
