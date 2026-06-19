<script lang="ts">
  import { router } from '../lib/router.svelte';
  import { authManager } from '../lib/auth.svelte';
  import type { RouteConfig } from '../lib/router.svelte';

  interface Props {
    routes: Record<string, any>;
  }

  let { routes }: Props = $props();

  const currentRoute = $derived(router.findRoute(routes));
  const Component = $derived(currentRoute?.component);
  const params = $derived(currentRoute?.params || {});

  // Derived guard: determines whether the resolved route is authorized to render
  const routeConfig = $derived(currentRoute?.config as RouteConfig | undefined);
  const authorized = $derived.by(() => {
    if (!routeConfig?.requiresAuth) return true;
    if (!authManager.isAuthenticated) return false;
    if (routeConfig.requiresAdmin && !authManager.user?.isAdmin) return false;
    return true;
  });

  // Side-effect only: perform redirects when unauthorized
  $effect(() => {
    if (!currentRoute) return;

    const config = currentRoute.config as RouteConfig | undefined;
    const currentPath = router.currentPath;

    if (!config?.requiresAuth) return;

    if (!authManager.isAuthenticated) {
      router.setIntendedPath(currentPath);
      router.navigate('/login');
      return;
    }

    if (config.requiresAdmin && !authManager.user?.isAdmin) {
      router.navigate('/');
    }
  });
</script>

{#if !Component}
  <div class="container mx-auto px-4 py-8">
    <h2 class="text-3xl font-bold text-gray-900 dark:text-white">
      404 - Page Not Found
    </h2>
    <p class="mt-4 text-gray-600 dark:text-gray-400">
      The page you're looking for doesn't exist.
    </p>
  </div>
{:else if authorized}
  <Component {params} />
{:else}
  <div class="flex items-center justify-center py-12">
    <div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" role="status" aria-label="Loading"></div>
  </div>
{/if}
