<script lang="ts">
  import { link } from '../lib/router.svelte';

  interface Props {
    currentPath?: string;
  }

  let { currentPath = '' }: Props = $props();

  const navItems = [
    { path: '/', label: 'Inventory', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
    { path: '/executions', label: 'Executions', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' }
  ];

  function isActive(path: string): boolean {
    if (path === '/') {
      return currentPath === '/' || currentPath === '';
    }
    return currentPath.startsWith(path);
  }
</script>

<nav class="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
  <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
    <div class="flex h-16 items-center justify-between">
      <div class="flex items-center">
        <div class="flex-shrink-0">
          <h1 class="text-2xl font-bold text-primary-600 dark:text-primary-400">
            Pabawi
          </h1>
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
    </div>
  </div>
</nav>
