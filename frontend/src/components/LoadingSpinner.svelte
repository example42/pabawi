<script lang="ts">
  interface Props {
    size?: 'sm' | 'md' | 'lg';
    message?: string;
  }

  let { size = 'md', message }: Props = $props();

  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-3',
    lg: 'h-12 w-12 border-4'
  };
</script>

<div class="flex flex-col items-center justify-center gap-3">
  <div
    class="animate-spin rounded-full border-primary-600 border-t-transparent {sizeClasses[size]}"
    role="status"
    aria-label="Loading"
  ></div>
  {#if message}
    <p class="text-sm text-gray-600 dark:text-gray-400">{message}</p>
  {/if}
</div>
