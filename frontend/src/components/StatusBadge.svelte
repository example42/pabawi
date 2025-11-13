<script lang="ts">
  type Status = 'success' | 'failed' | 'running' | 'partial';

  interface Props {
    status: Status;
    size?: 'sm' | 'md';
  }

  let { status, size = 'md' }: Props = $props();

  const statusConfig: Record<Status, { label: string; classes: string }> = {
    success: {
      label: 'Success',
      classes: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
    },
    failed: {
      label: 'Failed',
      classes: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
    },
    running: {
      label: 'Running',
      classes: 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
    },
    partial: {
      label: 'Partial',
      classes: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
    }
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm'
  };

  const config = $derived(statusConfig[status]);
</script>

<span
  class="inline-flex items-center rounded-full font-medium {config.classes} {sizeClasses[size]}"
  role="status"
>
  {#if status === 'running'}
    <svg class="mr-1 h-3 w-3 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  {/if}
  {config.label}
</span>
