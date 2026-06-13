<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from '../lib/api';
  import IntegrationBadge from './IntegrationBadge.svelte';

  interface Props {
    nodeId: string;
    onReady: () => void;
    onError: (error: Error) => void;
  }

  interface Node {
    id: string;
    name: string;
    uri: string;
    transport: 'ssh' | 'winrm' | 'docker' | 'local';
    config: Record<string, unknown> & {
      user?: string;
      port?: number;
    };
  }

  interface GeneralInfo {
    os?: string;
    ip?: string;
    hostname?: string;
    kernel?: string;
    architecture?: string;
    puppetVersion?: string;
    memory?: string;
    cpuCount?: number;
    uptime?: string;
    disks?: string[];
  }

  let { nodeId, onReady, onError }: Props = $props();

  let node = $state<Node | null>(null);
  let generalInfo = $state<GeneralInfo>({});
  let hasPuppetFacts = $state(false);

  function extractGeneralInfo(
    facts: Record<string, unknown>,
  ): GeneralInfo {
    const info: GeneralInfo = {};

    const os = facts.os as Record<string, unknown> | undefined;
    if (os?.name && (os.release as Record<string, unknown>)?.full) {
      info.os = `${os.name} ${(os.release as Record<string, unknown>).full}`;
    } else if (facts.operatingsystem && facts.operatingsystemrelease) {
      info.os = `${facts.operatingsystem} ${facts.operatingsystemrelease}`;
    } else if (facts.osfamily) {
      info.os = String(facts.osfamily);
    }

    const networking = facts.networking as Record<string, unknown> | undefined;
    info.ip = (facts.ipaddress as string | undefined)
      ?? (networking?.ip as string | undefined)
      ?? (facts.ipaddress_eth0 as string | undefined)
      ?? (facts.ipaddress_ens0 as string | undefined);

    info.hostname = (facts.hostname as string | undefined)
      ?? (facts.fqdn as string | undefined);

    info.kernel = (facts.kernel as string | undefined)
      ?? (facts.kernelversion as string | undefined);

    info.architecture = (facts.architecture as string | undefined)
      ?? (facts.hardwaremodel as string | undefined);

    info.puppetVersion = facts.aio_agent_version as string | undefined;

    const memory = facts.memory as Record<string, unknown> | undefined;
    const system = memory?.system as Record<string, unknown> | undefined;
    info.memory = system?.total as string | undefined;

    const processors = facts.processors as Record<string, unknown> | undefined;
    info.cpuCount = processors?.count as number | undefined;

    const systemUptime = facts.system_uptime as Record<string, unknown> | undefined;
    info.uptime = systemUptime?.uptime as string | undefined;

    if (facts.disks && typeof facts.disks === 'object') {
      info.disks = Object.keys(facts.disks as Record<string, unknown>);
    }

    return info;
  }

  onMount(async () => {
    try {
      const data = await get<{ node: Node }>(
        `/api/inventory/${nodeId}`,
        { maxRetries: 2, timeout: 20000 },
      );
      node = data.node;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load node details';
      onError(new Error(msg));
      return;
    }

    // Fetch PuppetDB facts for enrichment (optional, don't fail if unavailable)
    try {
      const data = await get<{
        sources: Record<string, { facts: Record<string, unknown>; timestamp: string }>;
        errors?: Record<string, string>;
      }>(`/api/nodes/${nodeId}/facts?source=puppetdb`, { maxRetries: 1 });

      const sourceData = data.sources?.puppetdb;
      if (sourceData?.facts) {
        generalInfo = extractGeneralInfo(sourceData.facts);
        hasPuppetFacts = true;
      }
    } catch {
      // PuppetDB facts are optional enrichment — ignore failures
    }

    onReady();
  });
</script>

{#if node}
  <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-xl font-semibold text-gray-900 dark:text-white">General Information</h2>
      <div class="flex items-center gap-2">
        <IntegrationBadge integration="bolt" variant="badge" size="sm" />
        {#if hasPuppetFacts}
          <span class="text-xs text-gray-500 dark:text-gray-400">+</span>
          <IntegrationBadge integration="puppetdb" variant="label" size="sm" />
        {/if}
      </div>
    </div>
    <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Node ID</dt>
        <dd class="mt-1 text-sm text-gray-900 dark:text-white">{node.id}</dd>
      </div>
      <div>
        <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Transport</dt>
        <dd class="mt-1 text-sm text-gray-900 dark:text-white">{node.transport}</dd>
      </div>
      <div>
        <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">URI</dt>
        <dd class="mt-1 text-sm text-gray-900 dark:text-white">{node.uri}</dd>
      </div>
      {#if generalInfo.os}
        <div>
          <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Operating System</dt>
          <dd class="mt-1 text-sm text-gray-900 dark:text-white">{generalInfo.os}</dd>
        </div>
      {/if}
      {#if generalInfo.ip}
        <div>
          <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">IP Address</dt>
          <dd class="mt-1 text-sm text-gray-900 dark:text-white">{generalInfo.ip}</dd>
        </div>
      {/if}
      {#if generalInfo.hostname}
        <div>
          <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Hostname</dt>
          <dd class="mt-1 text-sm text-gray-900 dark:text-white">{generalInfo.hostname}</dd>
        </div>
      {/if}
      {#if generalInfo.kernel}
        <div>
          <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Kernel</dt>
          <dd class="mt-1 text-sm text-gray-900 dark:text-white">{generalInfo.kernel}</dd>
        </div>
      {/if}
      {#if generalInfo.architecture}
        <div>
          <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Architecture</dt>
          <dd class="mt-1 text-sm text-gray-900 dark:text-white">{generalInfo.architecture}</dd>
        </div>
      {/if}
      {#if generalInfo.puppetVersion}
        <div>
          <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Puppet Version</dt>
          <dd class="mt-1 text-sm text-gray-900 dark:text-white">{generalInfo.puppetVersion}</dd>
        </div>
      {/if}
      {#if generalInfo.memory}
        <div>
          <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Memory</dt>
          <dd class="mt-1 text-sm text-gray-900 dark:text-white">{generalInfo.memory}</dd>
        </div>
      {/if}
      {#if generalInfo.cpuCount}
        <div>
          <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Number of CPUs</dt>
          <dd class="mt-1 text-sm text-gray-900 dark:text-white">{generalInfo.cpuCount}</dd>
        </div>
      {/if}
      {#if generalInfo.uptime}
        <div>
          <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Uptime</dt>
          <dd class="mt-1 text-sm text-gray-900 dark:text-white">{generalInfo.uptime}</dd>
        </div>
      {/if}
      {#if generalInfo.disks && generalInfo.disks.length > 0}
        <div>
          <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Disks</dt>
          <dd class="mt-1 text-sm text-gray-900 dark:text-white">{generalInfo.disks.join(', ')}</dd>
        </div>
      {/if}
      {#if node.config.user}
        <div>
          <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">User</dt>
          <dd class="mt-1 text-sm text-gray-900 dark:text-white">{node.config.user}</dd>
        </div>
      {/if}
      {#if node.config.port}
        <div>
          <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Port</dt>
          <dd class="mt-1 text-sm text-gray-900 dark:text-white">{node.config.port}</dd>
        </div>
      {/if}
    </dl>
    {#if !generalInfo.os && !generalInfo.ip && !hasPuppetFacts}
      <div class="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
        <div class="flex items-start gap-2">
          <svg class="h-5 w-5 flex-shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p class="text-sm text-blue-800 dark:text-blue-400">
            Additional system information (OS, IP) will appear here once PuppetDB facts are gathered.
          </p>
        </div>
      </div>
    {/if}
  </div>
{/if}
