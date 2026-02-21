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
  import SetupPage from './pages/SetupPage.svelte';
  import UserManagementPage from './pages/UserManagementPage.svelte';
  import GroupManagementPage from './pages/GroupManagementPage.svelte';
  import RoleManagementPage from './pages/RoleManagementPage.svelte';
  import { router } from './lib/router.svelte';
  import type { RouteConfig } from './lib/router.svelte';
  import { get } from './lib/api';
  import { onMount } from 'svelte';

  const routes: Record<string, any> = {
    '/': { component: HomePage, requiresAuth: true },
    '/login': LoginPage,
    '/register': RegisterPage,
    '/setup': SetupPage,
    '/inventory': { component: InventoryPage, requiresAuth: true },
    '/executions': { component: ExecutionsPage, requiresAuth: true },
    '/puppet': { component: PuppetPage, requiresAuth: true },
    '/users': { component: UserManagementPage, requiresAuth: true, requiresAdmin: true },
    '/groups': { component: GroupManagementPage, requiresAuth: true, requiresAdmin: true },
    '/roles': { component: RoleManagementPage, requiresAuth: true, requiresAdmin: true },
    '/nodes/:id': { component: NodeDetailPage, requiresAuth: true },
    '/integrations/:integration/setup': { component: IntegrationSetupPage, requiresAuth: true }
  };

  let setupComplete = $state(true); // Default to true to avoid flashing
  let checkingSetup = $state(true);

  // Check setup status on mount
  onMount(async () => {
    try {
      const status = await get<{ isComplete: boolean }>('/api/setup/status');
      setupComplete = status.isComplete;

      // Redirect to setup if not complete and not already on setup page
      if (!setupComplete && router.currentPath !== '/setup') {
        router.navigate('/setup');
      }
    } catch (error) {
      console.error('Failed to check setup status:', error);
      // Assume setup is complete if we can't check
      setupComplete = true;
    } finally {
      checkingSetup = false;
    }
  });

  function handleError(error: Error, errorInfo: { componentStack?: string }): void {
    // Log error to console for debugging
    console.error('Application error:', error, errorInfo);

    // In production, you could send this to an error tracking service
    // e.g., Sentry, LogRocket, etc.
  }
</script>

<ErrorBoundary onError={handleError}>
  {#if checkingSetup}
    <!-- Show loading state while checking setup -->
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        <p class="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    </div>
  {:else if !setupComplete && router.currentPath !== '/setup'}
    <!-- Redirect to setup if not complete -->
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
      <div class="text-center">
        <p class="text-gray-600 dark:text-gray-400">Redirecting to setup...</p>
      </div>
    </div>
  {:else}
    <div class="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
      {#if setupComplete}
        <Navigation currentPath={router.currentPath} />
      {/if}
      <main class="flex-1">
        <Router {routes} />
      </main>

      {#if setupComplete}
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
      {/if}
    </div>
  {/if}

  <!-- Toast notifications -->
  <ToastContainer />
</ErrorBoundary>
