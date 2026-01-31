<!--
  Admin Only Component

  Part of v1.0.0 Modular Plugin Architecture (Phase 4, Step 20)

  Simplified wrapper around PermissionGuard for admin-only content.
  Checks for the "admin" role.

  @example Basic usage
  ```svelte
  <AdminOnly>
    <AdminPanel />
  </AdminOnly>
  ```

  @example With custom fallback
  ```svelte
  <AdminOnly>
    <SystemSettings />
    {#snippet fallback()}
      <p>Contact an administrator for access.</p>
    {/snippet}
  </AdminOnly>
  ```

  @module components/AdminOnly
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { auth, useIsAuthenticated } from "../lib/auth.svelte";

  /**
   * Component props
   */
  interface Props {
    /** Show loading state while checking (default: true) */
    showLoading?: boolean;
    /** Silent mode - don't show fallback when denied (default: false) */
    silent?: boolean;
    /** Children to render when admin */
    children: Snippet;
    /** Fallback content when not admin */
    fallback?: Snippet;
    /** Loading content snippet */
    loading?: Snippet;
  }

  let {
    showLoading = true,
    silent = false,
    children,
    fallback,
    loading,
  }: Props = $props();

  // Reactive auth state
  const isAuthenticated = useIsAuthenticated();

  // Check if user is admin
  const isAdmin = $derived(auth.hasRole("admin"));

  // Loading state
  const isLoading = $derived(auth.isLoading);
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
      <span>Checking permissions...</span>
    </div>
  {/if}
{:else if isAdmin}
  <!-- Admin - render children -->
  {@render children()}
{:else if !silent}
  <!-- Not admin - render fallback -->
  {#if fallback}
    {@render fallback()}
  {:else}
    <!-- Default admin fallback -->
    <div
      class="flex flex-col items-center justify-center p-6 text-center bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800"
    >
      <svg
        class="w-12 h-12 text-amber-500 dark:text-amber-400 mb-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
        ></path>
      </svg>
      <h3 class="text-lg font-medium text-amber-900 dark:text-amber-100 mb-1">
        Admin Access Required
      </h3>
      <p class="text-sm text-amber-700 dark:text-amber-300">
        This content is only available to administrators.
      </p>
    </div>
  {/if}
{/if}
