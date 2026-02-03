<!--
  Permission Guard Component

  Part of v1.0.0 Modular Plugin Architecture (Phase 4, Step 20)

  Conditionally renders content based on user capabilities/roles.
  Supports:
  - Single or multiple capability checks
  - Any/all capability modes
  - Role-based checks
  - Fallback content when permission denied
  - Loading state during auth check
  - Optional silent mode (no fallback shown)

  @example Basic usage
  ```svelte
  <PermissionGuard capability="command.execute">
    <CommandExecutor />
  </PermissionGuard>
  ```

  @example With fallback
  ```svelte
  <PermissionGuard capability="admin.*">
    <AdminPanel />
    {#snippet fallback()}
      <p>You don't have admin access.</p>
    {/snippet}
  </PermissionGuard>
  ```

  @example Multiple capabilities (any)
  ```svelte
  <PermissionGuard capabilities={["bolt.command", "bolt.task"]} mode="any">
    <BoltInterface />
  </PermissionGuard>
  ```

  @example Role-based
  ```svelte
  <PermissionGuard role="admin">
    <AdminSettings />
  </PermissionGuard>
  ```

  @module components/PermissionGuard
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { auth, useCapability, useAnyCapability, useAllCapabilities, useRole, useIsAuthenticated } from "../lib/auth.svelte";

  /**
   * Component props
   */
  interface Props {
    /** Single capability to check */
    capability?: string;
    /** Multiple capabilities to check (use with mode) */
    capabilities?: string[];
    /** Check mode for multiple capabilities: "any" or "all" */
    mode?: "any" | "all";
    /** Role to check (alternative to capability) */
    role?: string;
    /** Multiple roles to check */
    roles?: string[];
    /** Require authentication (default: true) */
    requireAuth?: boolean;
    /** Show loading state while checking (default: true) */
    showLoading?: boolean;
    /** Silent mode - don't show fallback when denied (default: false) */
    silent?: boolean;
    /** Custom loading text */
    loadingText?: string;
    /** Invert the check (show content when permission is denied) */
    invert?: boolean;
    /** Children to render when permitted */
    children: Snippet;
    /** Fallback content when permission denied */
    fallback?: Snippet;
    /** Loading content snippet */
    loading?: Snippet;
  }

  let {
    capability,
    capabilities,
    mode = "any",
    role,
    roles,
    requireAuth = true,
    showLoading = true,
    silent = false,
    loadingText = "Checking permissions...",
    invert = false,
    children,
    fallback,
    loading,
  }: Props = $props();

  // Reactive auth state
  const isAuthenticated = useIsAuthenticated();

  // Compute permission result
  const hasPermission = $derived.by(() => {
    // If not authenticated and auth required, deny
    if (requireAuth && !isAuthenticated.value) {
      return false;
    }

    // Skip permission check if not authenticated and auth not required
    if (!isAuthenticated.value) {
      return true;
    }

    // Role-based check
    if (role) {
      return auth.hasRole(role);
    }

    // Multiple roles check
    if (roles && roles.length > 0) {
      if (mode === "all") {
        return roles.every((r) => auth.hasRole(r));
      }
      return roles.some((r) => auth.hasRole(r));
    }

    // Single capability check
    if (capability) {
      return auth.hasCapability(capability);
    }

    // Multiple capabilities check
    if (capabilities && capabilities.length > 0) {
      if (mode === "all") {
        return auth.hasAllCapabilities(capabilities);
      }
      return auth.hasAnyCapability(capabilities);
    }

    // No permission specified, allow
    return true;
  });

  // Apply inversion if needed
  const shouldShow = $derived(invert ? !hasPermission : hasPermission);

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
      <span>{loadingText}</span>
    </div>
  {/if}
{:else if shouldShow}
  <!-- Permitted - render children -->
  {@render children()}
{:else if !silent}
  <!-- Denied - render fallback -->
  {#if fallback}
    {@render fallback()}
  {:else}
    <!-- Default fallback -->
    <div
      class="flex flex-col items-center justify-center p-6 text-center bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
    >
      <svg
        class="w-12 h-12 text-gray-400 dark:text-gray-500 mb-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        ></path>
      </svg>
      <h3 class="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
        Access Denied
      </h3>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        {#if !isAuthenticated.value}
          Please sign in to access this content.
        {:else if capability}
          You don't have permission: <code class="text-xs bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded">{capability}</code>
        {:else if capabilities && capabilities.length > 0}
          You don't have the required permissions.
        {:else if role}
          You need the <code class="text-xs bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded">{role}</code> role.
        {:else}
          You don't have permission to view this content.
        {/if}
      </p>
    </div>
  {/if}
{/if}
