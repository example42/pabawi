<script lang="ts">
  interface Props {
    type?: 'text' | 'card' | 'table' | 'list';
    rows?: number;
  }

  let { type = 'text', rows = 3 }: Props = $props();
</script>

{#if type === 'text'}
  <div class="space-y-3">
    {#each Array(rows) as _, i}
      <div class="h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-700" style="width: {100 - (i * 10)}%"></div>
    {/each}
  </div>
{:else if type === 'card'}
  <div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
    <div class="space-y-4">
      <div class="h-6 bg-gray-200 rounded animate-pulse dark:bg-gray-700 w-3/4"></div>
      <div class="space-y-2">
        {#each Array(rows) as _, i}
          <div class="h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-700" style="width: {90 - (i * 5)}%"></div>
        {/each}
      </div>
    </div>
  </div>
{:else if type === 'table'}
  <div class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
      <thead class="bg-gray-50 dark:bg-gray-800">
        <tr>
          {#each Array(4) as _}
            <th class="px-6 py-3">
              <div class="h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-700 w-20"></div>
            </th>
          {/each}
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
        {#each Array(rows) as _}
          <tr>
            {#each Array(4) as _}
              <td class="px-6 py-4">
                <div class="h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-700"></div>
              </td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{:else if type === 'list'}
  <div class="space-y-3">
    {#each Array(rows) as _}
      <div class="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div class="h-10 w-10 bg-gray-200 rounded-full animate-pulse dark:bg-gray-700"></div>
        <div class="flex-1 space-y-2">
          <div class="h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-700 w-1/3"></div>
          <div class="h-3 bg-gray-200 rounded animate-pulse dark:bg-gray-700 w-2/3"></div>
        </div>
      </div>
    {/each}
  </div>
{/if}
