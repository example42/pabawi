<script lang="ts">
  import { link } from '../lib/router.svelte';
  import { expertMode } from '../lib/expertMode.svelte';

  interface Props {
    currentPath?: string;
  }

  let { currentPath = '' }: Props = $props();

  const navItems = [
    { path: '/', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { path: '/inventory', label: 'Inventory', icon: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01' },
    { path: '/executions', label: 'Executions', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { path: '/puppet', label: 'Puppet', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' }
  ];

  function isActive(path: string): boolean {
    if (path === '/') {
      return currentPath === '/' || currentPath === '';
    }
    return currentPath.startsWith(path);
  }

  function handleToggle(): void {
    expertMode.toggle();
  }
</script>

<nav class="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
  <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
    <div class="flex h-16 items-center justify-between">
      <div class="flex items-center">
        <div class="flex flex-shrink-0 items-baseline gap-2">
          <h1 class="text-2xl font-bold text-primary-600 dark:text-primary-400">
            Pabawi
          </h1>
          <span class="text-xs text-gray-500 dark:text-gray-400">v0.3.0</span>
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

      <!-- Expert Mode Toggle -->
      <div class="flex items-center gap-3">
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

        {#if expertMode.enabled}
          <div class="flex items-center gap-1 rounded-md bg-amber-100 dark:bg-amber-900/30 px-2 py-1 text-xs font-medium text-amber-800 dark:text-amber-300">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>Expert</span>
          </div>
        {/if}
      </div>
    </div>
  </div>
</nav>
