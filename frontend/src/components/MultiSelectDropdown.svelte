<script lang="ts">
  interface Option {
    value: string;
    label: string;
  }

  interface Props {
    id: string;
    label: string;
    options: Option[];
    selected: string[];
    onchange: (selected: string[]) => void;
  }

  let { id, label, options, selected, onchange }: Props = $props();

  let open = $state(false);
  let dropdownRef = $state<HTMLDivElement | null>(null);

  const summary = $derived(
    selected.length === 0
      ? `All ${label}`
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
        : `${String(selected.length)} selected`
  );

  function toggle(value: string): void {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    onchange(next);
  }

  function clearAll(): void {
    onchange([]);
  }

  function handleClickOutside(e: MouseEvent): void {
    if (dropdownRef && !dropdownRef.contains(e.target as Node)) {
      open = false;
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') open = false;
  }
</script>

<svelte:document onclick={handleClickOutside} onkeydown={handleKeydown} />

<div class="relative" bind:this={dropdownRef}>
  <button
    type="button"
    {id}
    onclick={() => open = !open}
    class="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-left focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
    aria-haspopup="listbox"
    aria-expanded={open}
  >
    <span class="truncate {selected.length === 0 ? 'text-gray-500 dark:text-gray-400' : ''}">{summary}</span>
    <svg class="ml-2 h-4 w-4 shrink-0 text-gray-400 transition-transform {open ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  {#if open}
    <div
      class="absolute z-50 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-700"
      role="listbox"
      aria-multiselectable="true"
    >
      {#if selected.length > 0}
        <div class="border-b border-gray-200 px-3 py-1.5 dark:border-gray-600">
          <button type="button" onclick={clearAll}
            class="text-xs font-medium text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-300">
            Clear all
          </button>
        </div>
      {/if}
      <div class="max-h-48 overflow-y-auto py-1">
        {#each options as opt (opt.value)}
          <label
            class="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-600"
            role="option"
            aria-selected={selected.includes(opt.value)}
          >
            <input
              type="checkbox"
              checked={selected.includes(opt.value)}
              onchange={() => toggle(opt.value)}
              class="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-gray-500"
            />
            <span class="text-gray-800 dark:text-gray-200">{opt.label}</span>
          </label>
        {/each}
      </div>
    </div>
  {/if}
</div>
