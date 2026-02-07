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
  import ProfilePage from './pages/ProfilePage.svelte';
  // Admin pages
  import UsersPage from './pages/admin/UsersPage.svelte';
  import RolesPage from './pages/admin/RolesPage.svelte';
  import SettingsPage from './pages/admin/SettingsPage.svelte';
  import { router, navigate } from './lib/router.svelte';
  import { get } from './lib/api';
  import { auth } from './lib/auth.svelte';

  interface SetupStatus {
    setupRequired: boolean;
    initialized: boolean;
    userCount: number;
    hasDefaultRoles: boolean;
    /** Whether authentication is enabled (users exist) */
    authEnabled?: boolean;
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
    '/profile': ProfilePage,
    // Admin routes
    '/admin/users': UsersPage,
    '/admin/roles': RolesPage,
    '/admin/plugins': PluginManagerPage,
    '/admin/settings': SettingsPage
  };

  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/setup'];

  // Track if auth is required (users exist in the system)
  let authRequired = $state(false);

  function handleError(error: Error, errorInfo: { componentStack?: string }): void {
    // Log error to console for debugging
    // Use $state.snapshot to avoid Svelte 5 proxy warnings
    console.error('[snapshot] Application error:', $state.snapshot(error), $state.snapshot(errorInfo));

    // In production, you could send this to an error tracking service
    // e.g., Sentry, LogRocket, etc.
  }

  /**
   * Check if current path is a public route
   */
  function isPublicRoute(path: string): boolean {
    return publicRoutes.some(route => path === route || path.startsWith(route + '/'));
  }

  /**
   * Enforce authentication - redirect to login if not authenticated
   */
  function enforceAuth(): void {
    if (authRequired && !auth.isAuthenticated && !isPublicRoute(router.currentPath)) {
      console.log('[App] Authentication required, redirecting to login');
      const returnUrl = router.currentPath;
      navigate(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
    }
  }

  // Watch for route changes and enforce auth
  $effect(() => {
    // Access currentPath to create dependency
    const _path = router.currentPath;
    // Enforce auth on route changes
    if (authRequired) {
      enforceAuth();
    }
  });

  // Check if initial setup is required on app load
  onMount(async () => {
    try {
      // Only check if not already on setup or login page
      if (router.currentPath !== '/setup' && router.currentPath !== '/login') {
        const status = await get<SetupStatus>('/api/setup/status');

        // If setup is required, redirect to setup page
        if (status.setupRequired) {
          navigate('/setup');
          return;
        }

        // If users exist (setup complete), authentication is required
        // unless explicitly disabled via environment variable
        if (status.initialized && status.userCount > 0) {
          authRequired = true;
          console.log('[App] Authentication enabled - users exist in system');

          // If not authenticated and not on a public route, redirect to login
          if (!auth.isAuthenticated && !isPublicRoute(router.currentPath)) {
            console.log('[App] User not authenticated, redirecting to login');
            const returnUrl = router.currentPath;
            navigate(`/login?returnUrl=${encodeURIComponent(returnUrl)}`);
            return;
          }
        }

        // No initialization blocking - app shell renders immediately
        console.log('[App] App shell rendered, components will load their own data');
      } else if (router.currentPath === '/login') {
        // On login page, check if auth is required but don't initialize yet
        try {
          const status = await get<SetupStatus>('/api/setup/status');
          if (status.setupRequired) {
            navigate('/setup');
            return;
          }
          if (status.initialized && status.userCount > 0) {
            authRequired = true;
          }
        } catch (err) {
          console.warn('Could not check setup status on login page:', err);
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
    <!-- Render shell immediately - no blocking on initialization -->
    {#if !isPublicRoute(router.currentPath)}
      <DynamicNavigation currentPath={router.currentPath} />
    {/if}

    <main class="flex-1">
      <Router {routes} />
    </main>

    <!-- Footer -->
    {#if !isPublicRoute(router.currentPath)}
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
    {/if}

    <!-- Toast notifications -->
    <ToastContainer />
  </div>
</ErrorBoundary>
