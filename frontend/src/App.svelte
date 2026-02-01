<script lang="ts">
  import { onMount } from 'svelte';
  import Router from './components/Router.svelte';
  import DynamicNavigation from './components/DynamicNavigation.svelte';
  import ErrorBoundary from './components/ErrorBoundary.svelte';
  import ToastContainer from './components/ToastContainer.svelte';
  import HomePage from './pages/HomePage.svelte';
  import InventoryPage from './pages/InventoryPage.svelte';
  import ExecutionsPage from './pages/ExecutionsPage.svelte';
  import NodeDetailPage from './pages/NodeDetailPage.svelte';
  import IntegrationSetupPage from './pages/IntegrationSetupPage.svelte';
  import PuppetPage from './pages/PuppetPage.svelte';
  import LoginPage from './pages/LoginPage.svelte';
  import SetupPage from './pages/SetupPage.svelte';
  import PluginManagerPage from './pages/PluginManagerPage.svelte';
  // Admin pages
  import UsersPage from './pages/admin/UsersPage.svelte';
  import RolesPage from './pages/admin/RolesPage.svelte';
  import SettingsPage from './pages/admin/SettingsPage.svelte';
  import { router, navigate } from './lib/router.svelte';
  import { get } from './lib/api';

  interface SetupStatus {
    setupRequired: boolean;
    initialized: boolean;
    userCount: number;
    hasDefaultRoles: boolean;
  }

  const routes = {
    '/': HomePage,
    '/inventory': InventoryPage,
    '/executions': ExecutionsPage,
    '/puppet': PuppetPage,
    '/nodes/:id': NodeDetailPage,
    '/integrations/:integration/setup': IntegrationSetupPage,
    '/login': LoginPage,
    '/setup': SetupPage,
    '/plugins': PluginManagerPage,
    // Admin routes
    '/admin/users': UsersPage,
    '/admin/roles': RolesPage,
    '/admin/plugins': PluginManagerPage,
    '/admin/settings': SettingsPage
  };

  function handleError(error: Error, errorInfo: { componentStack?: string }): void {
    // Log error to console for debugging
    // Use $state.snapshot to avoid Svelte 5 proxy warnings
    console.error('[snapshot] Application error:', $state.snapshot(error), $state.snapshot(errorInfo));

    // In production, you could send this to an error tracking service
    // e.g., Sentry, LogRocket, etc.
  }

  // Check if initial setup is required on app load
  onMount(async () => {
    try {
      // Only check if not already on setup page
      if (router.currentPath !== '/setup') {
        const status = await get<SetupStatus>('/api/setup/status');

        // If setup is required, redirect to setup page
        if (status.setupRequired) {
          navigate('/setup');
        }
      }
    } catch (err) {
      // If setup endpoint fails, it might not be implemented yet
      // Don't block the app from loading
      console.warn('Could not check setup status:', err);
    }
  });
</script>

<ErrorBoundary onError={handleError}>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
    <DynamicNavigation currentPath={router.currentPath} />
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
