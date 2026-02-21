<script lang="ts">
  import { link } from '../lib/router.svelte';
  import { expertMode } from '../lib/expertMode.svelte';
  import { themeManager } from '../lib/theme.svelte';
  import { authManager } from '../lib/auth.svelte';
  import { router } from '../lib/router.svelte';
  import { showSuccess } from '../lib/toast.svelte';
  import ChangePasswordDialog from './ChangePasswordDialog.svelte';

  interface Props {
    currentPath?: string;
  }

  let { currentPath = '' }: Props = $props();

  let showUserMenu = $state(false);
  let showChangePasswordDialog = $state(false);

  const baseNavItems = [
    { path: '/', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { path: '/inventory', label: 'Inventory', icon: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01' },
    { path: '/executions', label: 'Executions', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { path: '/puppet', label: 'Puppet', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' }
  ];

  const adminNavItems = [
    { path: '/users', label: 'Users', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', adminOnly: true },
    { path: '/groups', label: 'Groups', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z', adminOnly: true },
    { path: '/roles', label: 'Roles', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', adminOnly: true }
  ];

  // Combine nav items based on admin status
  const navItems = $derived(
    authManager.isAdmin
      ? [...baseNavItems, ...adminNavItems]
      : baseNavItems
  );

  function isActive(path: string): boolean {
    if (path === '/') {
      return currentPath === '/' || currentPath === '';
    }
    return currentPath.startsWith(path);
  }

  function handleToggle(): void {
    expertMode.toggle();
  }

  function handleThemeToggle(): void {
    themeManager.toggle();
  }

  function handleLoginClick(): void {
    router.navigate('/login');
  }

  function handleRegisterClick(): void {
    router.navigate('/register');
  }

  async function handleLogout(): Promise<void> {
    showUserMenu = false;
    await authManager.logout();
    showSuccess('Logged out', 'You have been successfully logged out');
    router.navigate('/login');
  }

  function handleChangePassword(): void {
    showUserMenu = false;
    showChangePasswordDialog = true;
  }

  function toggleUserMenu(): void {
    showUserMenu = !showUserMenu;
  }

  // Close user menu when clicking outside
  function handleClickOutside(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.user-menu-container')) {
      showUserMenu = false;
    }
  }

  $effect(() => {
    if (showUserMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  });
</script>

<nav class="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
  <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
    <div class="flex h-16 items-center justify-between">
      <div class="flex items-center">
        <div class="flex flex-shrink-0 items-center gap-3">
          <img
            src="/favicon/web-app-manifest-512x512.png"
            alt="Pabawi Logo"
            class="h-8 w-8"
          />
          <div class="flex items-baseline gap-2">
            <h1 class="text-2xl font-bold text-primary-600 dark:text-primary-400">
              Pabawi
            </h1>
            <span class="text-xs text-gray-500 dark:text-gray-400">v0.7.0</span>
          </div>
        </div>
        <div class="ml-10 flex items-baseline space-x-4">
          {#each navItems as item}
            <a
              href={item.path}
              use:link
              class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors {isActive(item.path)
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'}"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={item.icon} />
              </svg>
              {item.label}
            </a>
          {/each}
        </div>
      </div>

      <!-- Theme and Expert Mode Toggles -->
      <div class="flex items-center gap-3">
        <!-- Theme Toggle -->
        <button
          type="button"
          onclick={handleThemeToggle}
          class="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
          aria-label="Toggle theme"
          title="Toggle light/dark theme"
        >
          {#if themeManager.isDark}
            <!-- Sun icon for light mode -->
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          {:else}
            <!-- Moon icon for dark mode -->
            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          {/if}
        </button>
        <label class="flex items-center gap-2 cursor-pointer group">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
            Expert Mode
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={expertMode.enabled}
            aria-label="Toggle expert mode"
            onclick={handleToggle}
            class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 {expertMode.enabled
              ? 'bg-primary-600'
              : 'bg-gray-200 dark:bg-gray-700'}"
          >
            <span
              class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {expertMode.enabled
                ? 'translate-x-6'
                : 'translate-x-1'}"
            ></span>
          </button>
        </label>

        <!-- Authentication Section -->
        {#if authManager.isAuthenticated}
          <!-- User Menu -->
          <div class="relative user-menu-container">
            <button
              type="button"
              onclick={toggleUserMenu}
              class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              aria-expanded={showUserMenu}
              aria-haspopup="true"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>{authManager.user?.username}</span>
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {#if showUserMenu}
              <div class="absolute right-0 mt-2 w-56 origin-top-right rounded-md bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
                <div class="py-1">
                  <!-- User info -->
                  <div class="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                    <p class="text-sm font-medium text-gray-900 dark:text-white">
                      {authManager.user?.firstName} {authManager.user?.lastName}
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {authManager.user?.email}
                    </p>
                    {#if authManager.isAdmin}
                      <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary-100 text-primary-800 dark:bg-primary-900/20 dark:text-primary-400 mt-1">
                        Admin
                      </span>
                    {/if}
                  </div>

                  <!-- Menu items -->
                  <button
                    type="button"
                    onclick={handleChangePassword}
                    class="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                    Change Password
                  </button>

                  <button
                    type="button"
                    onclick={handleLogout}
                    class="w-full text-left px-4 py-2 text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                  >
                    <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Logout
                  </button>
                </div>
              </div>
            {/if}
          </div>
        {:else}
          <!-- Login/Register buttons -->
          <div class="flex items-center gap-2">
            <button
              type="button"
              onclick={handleLoginClick}
              class="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
            >
              Login
            </button>
            <button
              type="button"
              onclick={handleRegisterClick}
              class="rounded-md px-3 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
            >
              Register
            </button>
          </div>
        {/if}
      </div>
    </div>
  </div>
</nav>

<!-- Change Password Dialog -->
<ChangePasswordDialog bind:isOpen={showChangePasswordDialog} onClose={() => showChangePasswordDialog = false} />
