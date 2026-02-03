<!--
  Require Auth Component

  Part of v1.0.0 Modular Plugin Architecture (Phase 4, Step 20)

  Simplified wrapper around PermissionGuard for authentication-only checks.
  Does not check specific capabilities/roles, just requires the user to be logged in.

  @example Basic usage
  ```svelte
  <RequireAuth>
    <UserDashboard />
  </RequireAuth>
  ```

  @example With redirect
  ```svelte
  <RequireAuth redirectTo="/login">
    <ProtectedContent />
  </RequireAuth>
  ```

  @example With custom fallback
  ```svelte
  <RequireAuth>
    <Dashboard />
    {#snippet fallback()}
      <LoginPrompt />
    {/snippet}
  </RequireAuth>
  ```

  @module components/RequireAuth
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { auth, useIsAuthenticated } from "../lib/auth.svelte";
  import { router } from "../lib/router.svelte";

  /**
   * Component props
   */
  interface Props {
    /** URL to redirect to when not authenticated */
    redirectTo?: string;
    /** Show loading state while checking auth (default: true) */
    showLoading?: boolean;
    /** Custom loading text */
    loadingText?: string;
    /** Silent mode - don't show fallback or redirect (default: false) */
    silent?: boolean;
    /** Children to render when authenticated */
    children: Snippet;
    /** Fallback content when not authenticated */
    fallback?: Snippet;
    /** Loading content snippet */
    loading?: Snippet;
  }

  let {
    redirectTo,
    showLoading = true,
    loadingText = "Checking authentication...",
    silent = false,
    children,
    fallback,
    loading,
  }: Props = $props();

  // Reactive auth state
  const isAuthenticated = useIsAuthenticated();
  const isLoading = $derived(auth.isLoading);

  // Handle redirect
  $effect(() => {
    if (!isLoading && !isAuthenticated.value && redirectTo && !silent) {
      // Store current URL for redirect back after login
      const returnUrl = typeof window !== "undefined" ? window.location.pathname : "/";
      router.navigate(`${redirectTo}?returnUrl=${encodeURIComponent(returnUrl)}`);
    }
  });
</script>

{#if isLoading && showLoading}
  <!-- Loading state -->
  {#if loading}
    {@render loading()}
  {:else}
    <div class="flex items-center justify-center p-4 text-gray-500 dark:text-gray-400">
      <svg
        class="animate-spin -ml-1 mr-3 h-5 w-5"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          class="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="4"
        ></circle>
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
      <span>{loadingText}</span>
    </div>
  {/if}
{:else if isAuthenticated.value}
  <!-- Authenticated - render children -->
  {@render children()}
{:else if !silent && !redirectTo}
  <!-- Not authenticated - render fallback -->
  {#if fallback}
    {@render fallback()}
  {:else}
    <!-- Default fallback -->
    <div
      class="flex flex-col items-center justify-center p-8 text-center bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
    >
      <svg
        class="w-16 h-16 text-gray-400 dark:text-gray-500 mb-4"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
        ></path>
      </svg>
      <h3 class="text-xl font-medium text-gray-900 dark:text-gray-100 mb-2">
        Authentication Required
      </h3>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Please sign in to access this content.
      </p>
      <a
        href="/login"
        class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
      >
        Sign In
      </a>
    </div>
  {/if}
{/if}
