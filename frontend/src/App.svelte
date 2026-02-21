<script lang="ts">
  import Router from './components/Router.svelte';
  import Navigation from './components/Navigation.svelte';
  import ErrorBoundary from './components/ErrorBoundary.svelte';
  import ToastContainer from './components/ToastContainer.svelte';
  import HomePage from './pages/HomePage.svelte';
  import InventoryPage from './pages/InventoryPage.svelte';
  import ExecutionsPage from './pages/ExecutionsPage.svelte';
  import NodeDetailPage from './pages/NodeDetailPage.svelte';
  import IntegrationSetupPage from './pages/IntegrationSetupPage.svelte';
  import PuppetPage from './pages/PuppetPage.svelte';
  import LoginPage from './pages/LoginPage.svelte';
  import RegisterPage from './pages/RegisterPage.svelte';
  import UserManagementPage from './pages/UserManagementPage.svelte';
  import GroupManagementPage from './pages/GroupManagementPage.svelte';
  import RoleManagementPage from './pages/RoleManagementPage.svelte';
  import { router } from './lib/router.svelte';

  const routes = {
    '/': HomePage,
    '/login': LoginPage,
    '/register': RegisterPage,
    '/inventory': InventoryPage,
    '/executions': ExecutionsPage,
    '/puppet': PuppetPage,
    '/users': UserManagementPage,
    '/groups': GroupManagementPage,
    '/roles': RoleManagementPage,
    '/nodes/:id': NodeDetailPage,
    '/integrations/:integration/setup': IntegrationSetupPage
  };

  function handleError(error: Error, errorInfo: { componentStack?: string }): void {
    // Log error to console for debugging
    console.error('Application error:', error, errorInfo);

    // In production, you could send this to an error tracking service
    // e.g., Sentry, LogRocket, etc.
  }
</script>

<ErrorBoundary onError={handleError}>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
    <Navigation currentPath={router.currentPath} />
    <main class="flex-1">
      <Router {routes} />
    </main>

    <!-- Footer -->
    <footer class="mt-auto py-8 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div class="max-w-7xl mx-auto px-4 text-left">
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Made by Alessandro Franceschi <a
            href="https://example42.com"
            target="_blank"
            class="text-blue-600 dark:text-blue-400 hover:underline"
          > (example42.com)</a> and his AI assistants
        </p>
      </div>
    </footer>
  </div>

  <!-- Toast notifications -->
  <ToastContainer />
</ErrorBoundary>
