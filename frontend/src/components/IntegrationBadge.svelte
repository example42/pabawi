<script lang="ts">
  import { integrationColors, type IntegrationType } from '../lib/integrationColors.svelte';
  import { onMount } from 'svelte';

  interface Props {
    integration: IntegrationType;
    variant?: 'dot' | 'label' | 'badge';
    size?: 'sm' | 'md' | 'lg';
  }

  let { integration, variant = 'badge', size = 'md' }: Props = $props();

  // Load colors on mount
  onMount(() => {
    integrationColors.loadColors();
  });

  const color = $derived(integrationColors.getColor(integration));

  const integrationLabels: Record<IntegrationType, string> = {
    bolt: 'Bolt',
    ansible: 'Ansible',
    puppetdb: 'PuppetDB',
    puppetserver: 'Puppetserver',
    hiera: 'Hiera',
  };

  const label = $derived(integrationLabels[integration]);

  // Size classes for different variants
  const dotSizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3 h-3',
  };

  const labelSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const badgeSizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  };
</script>

{#if variant === 'dot'}
  <span
    class="inline-flex items-center gap-1.5"
    title={label}
  >
    <span
      class="rounded-full {dotSizeClasses[size]}"
      style="background-color: {color.primary};"
      aria-label="{label} indicator"
    ></span>
  </span>
{:else if variant === 'label'}
  <span
    class="inline-flex items-center gap-1.5 {labelSizeClasses[size]}"
    style="color: {color.dark};"
  >
    <span
      class="rounded-full {dotSizeClasses[size]}"
      style="background-color: {color.primary};"
      aria-hidden="true"
    ></span>
    <span class="font-medium">{label}</span>
  </span>
{:else}
  <span
    class="inline-flex items-center rounded-full font-medium {badgeSizeClasses[size]}"
    style="background-color: {color.light}; color: {color.dark};"
    role="status"
  >
    {label}
  </span>
{/if}
