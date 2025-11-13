<script lang="ts">
  import Router from './components/Router.svelte';
  import Navigation from './components/Navigation.svelte';
  import ErrorBoundary from './components/ErrorBoundary.svelte';
  import ToastContainer from './components/ToastContainer.svelte';
  import InventoryPage from './pages/InventoryPage.svelte';
  import ExecutionsPage from './pages/ExecutionsPage.svelte';
  import NodeDetailPage from './pages/NodeDetailPage.svelte';
  import { router } from './lib/router.svelte';

  const routes = {
    '/': InventoryPage,
    '/executions': ExecutionsPage,
    '/nodes/:id': NodeDetailPage
  };

  function handleError(error: Error, errorInfo: { componentStack?: string }): void {
    // Log error to console for debugging
    console.error('Application error:', error, errorInfo);
    
    // In production, you could send this to an error tracking service
    // e.g., Sentry, LogRocket, etc.
  }
</script>

<ErrorBoundary onError={handleError}>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <Navigation currentPath={router.currentPath} />
    <main>
      <Router {routes} />
    </main>
  </div>
  
  <!-- Toast notifications -->
  <ToastContainer />
</ErrorBoundary>
