<!--
  Login Page

  Part of v1.0.0 Modular Plugin Architecture (Phase 4, Step 22)

  Provides user authentication UI with:
  - Username/password login form
  - Error handling and validation
  - Redirect after successful login
  - Dark mode support

  @module pages/LoginPage
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { auth } from '../lib/auth.svelte';
  import { router } from '../lib/router.svelte';
  import { showError, showSuccess } from '../lib/toast.svelte';

  const pageTitle = 'Pabawi - Login';

  // ==========================================================================
  // State
  // ==========================================================================

  let username = $state('');
  let password = $state('');
  let loading = $state(false);
  let error = $state<string | null>(null);
  let rememberMe = $state(false);

  // Get redirect URL from query params
  let redirectUrl = $derived.by(() => {
    const returnTo = router.currentQuery.get('returnTo');
    return returnTo || '/';
  });

  // ==========================================================================
  // Functions
  // ==========================================================================

  async function handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (!username.trim() || !password.trim()) {
      error = 'Please enter both username and password';
      return;
    }

    loading = true;
    error = null;

    try {
      const success = await auth.login({ username: username.trim(), password });

      if (success) {
        showSuccess(`Welcome back, ${auth.user?.displayName || auth.user?.username || username}!`);
        router.navigate(redirectUrl);
      } else {
        error = 'Login failed. Please check your credentials.';
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'An unexpected error occurred';
      showError('Login failed', error);
    } finally {
      loading = false;
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !loading) {
      // Trigger form submit
      const form = document.querySelector('form');
      if (form) {
        form.requestSubmit();
      }
    }
  }

  // ==========================================================================
  // Lifecycle
  // ==========================================================================

  onMount(() => {
    document.title = pageTitle;

    // If already authenticated, redirect
    if (auth.isAuthenticated) {
      router.navigate(redirectUrl);
    }
  });
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

<div class="min-h-[calc(100vh-12rem)] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
  <div class="w-full max-w-md space-y-8">
    <!-- Header -->
    <div class="text-center">
      <!-- Logo/Brand -->
      <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600">
        <svg class="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
        </svg>
      </div>
      <h1 class="mt-4 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
        Pabawi
      </h1>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Infrastructure Management Interface
      </p>
    </div>

    <!-- Login Form -->
    <div class="rounded-xl bg-white p-8 shadow-lg dark:bg-gray-800">
      <h2 class="mb-6 text-center text-xl font-semibold text-gray-900 dark:text-white">
        Sign in to your account
      </h2>

      <form onsubmit={handleSubmit} class="space-y-6">
        <!-- Error Alert -->
        {#if error}
          <div class="rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
            <div class="flex items-center">
              <svg class="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p class="ml-3 text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          </div>
        {/if}

        <!-- Username Field -->
        <div>
          <label for="username" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Username
          </label>
          <div class="relative mt-1">
            <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <input
              id="username"
              name="username"
              type="text"
              autocomplete="username"
              required
              bind:value={username}
              onkeydown={handleKeyDown}
              disabled={loading}
              class="block w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-400 dark:disabled:bg-gray-800"
              placeholder="Enter your username"
            />
          </div>
        </div>

        <!-- Password Field -->
        <div>
          <label for="password" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Password
          </label>
          <div class="relative mt-1">
            <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autocomplete="current-password"
              required
              bind:value={password}
              onkeydown={handleKeyDown}
              disabled={loading}
              class="block w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-400 dark:disabled:bg-gray-800"
              placeholder="Enter your password"
            />
          </div>
        </div>

        <!-- Remember Me & Forgot Password -->
        <div class="flex items-center justify-between">
          <label class="flex items-center">
            <input
              type="checkbox"
              bind:checked={rememberMe}
              disabled={loading}
              class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
            />
            <span class="ml-2 text-sm text-gray-600 dark:text-gray-400">Remember me</span>
          </label>
          <a
            href="/forgot-password"
            class="text-sm font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Forgot password?
          </a>
        </div>

        <!-- Submit Button -->
        <button
          type="submit"
          disabled={loading}
          class="relative flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:from-blue-700 hover:to-purple-700 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 dark:focus:ring-offset-gray-800"
        >
          {#if loading}
            <svg class="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Signing in...
          {:else}
            Sign in
          {/if}
        </button>
      </form>

      <!-- Alternative Sign-in Options (future) -->
      <div class="mt-6">
        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-gray-300 dark:border-gray-600"></div>
          </div>
          <div class="relative flex justify-center text-xs uppercase">
            <span class="bg-white px-2 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              Pabawi v1.0.0
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Help Text -->
    <p class="text-center text-sm text-gray-500 dark:text-gray-400">
      Don't have an account?{' '}
      <span class="font-medium text-gray-700 dark:text-gray-300">
        Contact your administrator
      </span>
    </p>
  </div>
</div>
