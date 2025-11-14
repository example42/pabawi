<script lang="ts">
  import { router } from '../lib/router.svelte';

  interface Props {
    routes: Record<string, any>;
  }

  let { routes }: Props = $props();

  const currentRoute = $derived(router.findRoute(routes));

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
