<script lang="ts">
  import Router from './components/Router.svelte';
  import Navigation from './components/Navigation.svelte';
  import InventoryPage from './pages/InventoryPage.svelte';
  import ExecutionsPage from './pages/ExecutionsPage.svelte';
  import NodeDetailPage from './pages/NodeDetailPage.svelte';
  import { router } from './lib/router.svelte';

  const routes = {
    '/': InventoryPage,
    '/executions': ExecutionsPage,
    '/nodes/:id': NodeDetailPage
  };
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
  <Navigation currentPath={router.currentPath} />
  <main>
    <Router {routes} />
  </main>
</div>
