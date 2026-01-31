<!--
  Dynamic Navigation Component

  Part of v1.0.0 Modular Plugin Architecture (Phase 4, Step 21)

  Uses the MenuBuilder to generate navigation from loaded plugins with:
  - Permission-based filtering
  - Integration type grouping
  - Priority-based ordering
  - Collapsible menu groups
  - Active route highlighting

  @component
  @version 1.0.0
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { link } from "../lib/router.svelte";
  import { debugMode } from "../lib/debug";
  import { themeManager } from "../lib/theme.svelte";
  import { auth } from "../lib/auth.svelte";
  import {
    getMenuBuilder,
    useMenu,
    type MenuItem,
    type MenuSection,
    type LinkMenuItem,
    type GroupMenuItem,
    INTEGRATION_TYPE_METADATA,
  } from "../lib/navigation";
  import { getPluginLoader } from "../lib/plugins";

  interface Props {
    currentPath?: string;
  }

  let { currentPath = "" }: Props = $props();

  // Menu state
  const menu = useMenu();
  let menuError = $state<string | null>(null);
  let menuLoading = $state(true);
  let collapsedGroups = $state<Set<string>>(new Set());

  // Initialize menu builder on mount
  onMount(() => {
    const menuBuilder = getMenuBuilder();

    // Subscribe to menu events for error handling
    const unsubscribe = menuBuilder.subscribe((event) => {
      if (event.type === "error") {
        menuError = event.error;
        menuLoading = false;
      } else if (event.type === "menu:built" || event.type === "menu:updated") {
        menuError = null;
        menuLoading = false;
      }
    });

    // Initialize the menu builder (loads plugins and builds menu)
    void menuBuilder.initialize().finally(() => {
      menuLoading = false;
    });

    return () => {
      unsubscribe();
    };
  });

  /**
   * Check if a menu item is currently active
   */
  function isActive(item: MenuItem): boolean {
    if (item.type !== "link") return false;
    const linkItem = item as LinkMenuItem;
    if (linkItem.exact) {
      return currentPath === linkItem.path;
    }
    if (linkItem.path === "/") {
      return currentPath === "/" || currentPath === "";
    }
    return currentPath.startsWith(linkItem.path);
  }

  /**
   * Check if any child of a group is active
   */
  function isGroupActive(group: GroupMenuItem): boolean {
    return group.children.some((child) => {
      if (child.type === "link") {
        return isActive(child);
      }
      if (child.type === "group") {
        return isGroupActive(child as GroupMenuItem);
      }
      return false;
    });
  }

  /**
   * Toggle group collapse state
   */
  function toggleGroup(groupId: string): void {
    if (collapsedGroups.has(groupId)) {
      collapsedGroups.delete(groupId);
    } else {
      collapsedGroups.add(groupId);
    }
    // Trigger reactivity
    collapsedGroups = new Set(collapsedGroups);
  }

  /**
   * Get integration color for a group
   */
  function getIntegrationColor(item: GroupMenuItem): string {
    if (item.integrationType) {
      // Use integration type colors from metadata or CSS variables
      const colorMap: Record<string, string> = {
        RemoteExecution: "text-orange-500",
        ConfigurationManagement: "text-blue-500",
        InventorySource: "text-violet-500",
        Provisioning: "text-green-500",
        Monitoring: "text-cyan-500",
        Orchestration: "text-purple-500",
        SecretManagement: "text-red-500", // pragma: allowlist secret
        ReportingAnalytics: "text-indigo-500",
        AuditCompliance: "text-amber-500",
        BackupRecovery: "text-emerald-500",
        InstallSoftware: "text-lime-500",
        Info: "text-gray-500",
      };
      return colorMap[item.integrationType] || "text-gray-500";
    }
    return "text-gray-500";
  }

  function handleDebugToggle(): void {
    debugMode.toggle();
  }

  function handleThemeToggle(): void {
    themeManager.toggle();
  }

  function handleLogout(): void {
    auth.logout();
  }
</script>

<nav class="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
  <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
    <div class="flex h-16 items-center justify-between">
      <!-- Logo and Brand -->
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
            <span class="text-xs text-gray-500 dark:text-gray-400">v1.0.0</span>
          </div>
        </div>

        <!-- Main Navigation -->
        <div class="ml-10 flex items-baseline space-x-1">
          {#if menu.value}
            {#each menu.value.sections as section}
              {#if section.items.length > 0}
                {#if section.showTitle && section.title}
                  <span class="px-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    {section.title}
                  </span>
                {/if}

                {#each section.items as item}
                  {#if item.type === "link"}
                    {@const linkItem = item as LinkMenuItem}
                    <a
                      href={linkItem.path}
                      use:link
                      class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors {isActive(item)
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'}"
                    >
                      {#if item.icon}
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={item.icon} />
                        </svg>
                      {/if}
                      <span>{item.label}</span>
                      {#if item.badge}
                        <span class="ml-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                          {item.badge}
                        </span>
                      {/if}
                    </a>
                  {:else if item.type === "group"}
                    {@const groupItem = item as GroupMenuItem}
                    <!-- Dropdown Menu for Groups -->
                    <div class="relative group/menu">
                      <button
                        type="button"
                        class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors {isGroupActive(groupItem)
                          ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                          : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'}"
                      >
                        {#if groupItem.icon}
                          <svg class="h-5 w-5 {getIntegrationColor(groupItem)}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={groupItem.icon} />
                          </svg>
                        {/if}
                        <span>{groupItem.label}</span>
                        <svg class="h-4 w-4 transition-transform group-hover/menu:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      <!-- Dropdown Content -->
                      <div class="absolute left-0 z-50 mt-1 hidden w-56 origin-top-left rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none group-hover/menu:block dark:bg-gray-800 dark:ring-gray-700">
                        <div class="py-1">
                          {#each groupItem.children as child}
                            {#if child.type === "link"}
                              {@const childLink = child as LinkMenuItem}
                              <a
                                href={childLink.path}
                                use:link
                                class="flex items-center gap-2 px-4 py-2 text-sm transition-colors {isActive(child)
                                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                                  : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'}"
                              >
                                {#if child.icon}
                                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={child.icon} />
                                  </svg>
                                {/if}
                                <span>{child.label}</span>
                              </a>
                            {:else if child.type === "divider"}
                              <div class="my-1 border-t border-gray-200 dark:border-gray-700"></div>
                            {/if}
                          {/each}
                        </div>
                      </div>
                    </div>
                  {:else if item.type === "divider"}
                    <div class="mx-2 h-6 w-px bg-gray-200 dark:bg-gray-700"></div>
                  {/if}
                {/each}
              {/if}
            {/each}
          {:else}
            <!-- Loading state -->
            <div class="flex items-center gap-2 text-gray-400">
              <svg class="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span class="text-sm">Loading menu...</span>
            </div>
          {/if}
        </div>
      </div>

      <!-- Right Side Controls -->
      <div class="flex items-center gap-3">
        <!-- User Info (if authenticated) -->
        {#if auth.isAuthenticated && auth.user}
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-600 dark:text-gray-400">
              {auth.user.displayName || auth.user.username}
            </span>
            <button
              type="button"
              onclick={handleLogout}
              class="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              aria-label="Logout"
              title="Logout"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        {/if}

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

        <!-- Debug Mode Toggle -->
        <label class="flex items-center gap-2 cursor-pointer group">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
            Debug
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={debugMode.enabled}
            aria-label="Toggle debug mode"
            onclick={handleDebugToggle}
            class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 {debugMode.enabled
              ? 'bg-primary-600'
              : 'bg-gray-200 dark:bg-gray-700'}"
          >
            <span
              class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform {debugMode.enabled
                ? 'translate-x-6'
                : 'translate-x-1'}"
            ></span>
          </button>
        </label>
      </div>
    </div>
  </div>

  {#if menuError}
    <div class="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
      Menu error: {menuError}
    </div>
  {/if}
</nav>
