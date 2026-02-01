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
  import IntegrationHomePage from './pages/IntegrationHomePage.svelte';
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
  import { getPluginLoader } from './lib/plugins';

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
    '/integrations/:integrationName': IntegrationHomePage,
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

  // Check if initial setup is required and initialize plugins on app load
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

    // Initialize plugin loader to populate widget registry
    try {
      console.log('[App] Starting plugin initialization...');
      const pluginLoader = getPluginLoader();
      const { getWidgetRegistry } = await import('./lib/plugins');
      const widgetRegistry = getWidgetRegistry();

      console.log('[App] Loading plugins for widget registry...');
      const loadedPlugins = await pluginLoader.loadAll();
      console.log(`[App] Successfully loaded ${loadedPlugins.length} plugins:`,
        loadedPlugins.map(p => p.info.metadata.name));

      // Manually register plugins with widget registry
      for (const plugin of loadedPlugins) {
        console.log(`[App] Registering ${plugin.widgets.length} widgets from ${plugin.info.metadata.name}`);
        widgetRegistry.registerPluginWidgets(plugin);
      }

      // Log widget count
      const totalWidgets = loadedPlugins.reduce((sum, p) => sum + p.widgets.length, 0);
      console.log(`[App] Total widgets loaded: ${totalWidgets}`);

      // Verify widgets are in registry
      const registryWidgetCount = widgetRegistry.widgetCount;
      console.log(`[App] Widgets in registry: ${registryWidgetCount}`);

      // Log widgets with dashboard slot
      const dashboardWidgets = widgetRegistry.getWidgetsForSlot('dashboard');
      console.log(`[App] Dashboard widgets in registry: ${dashboardWidgets.length}`,
        dashboardWidgets.map(w => w.id));
    } catch (err) {
      console.error('[App] Failed to load plugins:', err);
      // Don't block the app if plugin loading fails
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
