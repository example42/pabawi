<script lang="ts">
  import { router } from '../lib/router.svelte';
  import { authManager } from '../lib/auth.svelte';
  import type { RouteConfig } from '../lib/router.svelte';

  interface Props {
    routes: Record<string, any>;
  }

  let { routes }: Props = $props();

  const currentRoute = $derived(router.findRoute(routes));

  // Check authentication and authorization
  $effect(() => {
    if (!currentRoute) return;

    const config = currentRoute.config as RouteConfig | undefined;
    const currentPath = router.currentPath;

    // Skip auth checks for public routes
    if (!config?.requiresAuth) return;

    // Check if user is authenticated
    if (!authManager.isAuthenticated) {
      // Store intended path and redirect to login
      router.setIntendedPath(currentPath);
      router.navigate('/login');
      return;
    }

    // Check admin requirement
    if (config.requiresAdmin && !authManager.user?.isAdmin) {
      // Redirect to home if not admin
      router.navigate('/');
      return;
    }
  });

  const Component = $derived(currentRoute?.component);
  const params = $derived(currentRoute?.params || {});
</script>

{#if Component}
  <Component {params} />
{:else}
  <div class="container mx-auto px-4 py-8">
    <h2 class="text-3xl font-bold text-gray-900 dark:text-white">
      404 - Page Not Found
    </h2>
    <p class="mt-4 text-gray-600 dark:text-gray-400">
      The page you're looking for doesn't exist.
    </p>
  </div>
{/if}
