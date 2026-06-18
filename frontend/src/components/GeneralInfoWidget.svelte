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

  interface ResourceUsage {
    used: number;
    total: number;
    percent: number;
    label: string;
  }

  interface NetworkInterface {
    name: string;
    ip?: string;
    mac?: string;
  }

  interface GeneralInfo {
    os?: string;
    osFamily?: string;
    ip?: string;
    hostname?: string;
    kernel?: string;
    kernelRelease?: string;
    architecture?: string;
    puppetVersion?: string;
    memory?: ResourceUsage;
    cpuCount?: number;
    cpuModel?: string;
    uptime?: string;
    uptimeSeconds?: number;
    disks?: ResourceUsage[];
    networkInterfaces?: NetworkInterface[];
  }

  let { nodeId, onReady, onError }: Props = $props();

  let node = $state<Node | null>(null);
  let generalInfo = $state<GeneralInfo>({});
  let factsSource = $state<string | null>(null);

  function parseMemoryBytes(value: unknown): number | null {
    if (typeof value === 'number') return value;
    if (typeof value !== 'string') return null;
    const match = value.match(/^([\d.]+)\s*(GiB|MiB|TiB|GB|MB|TB|KiB|KB)$/i);
    if (!match) return null;
    const num = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers: Record<string, number> = {
      kib: 1024, kb: 1000,
      mib: 1024 ** 2, mb: 1000 ** 2,
      gib: 1024 ** 3, gb: 1000 ** 3,
      tib: 1024 ** 4, tb: 1000 ** 4,
    };
    return num * (multipliers[unit] ?? 1);
  }

  function formatBytes(bytes: number): string {
    if (bytes >= 1024 ** 4) return `${(bytes / 1024 ** 4).toFixed(1)} TiB`;
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
    return `${(bytes / 1024).toFixed(0)} KiB`;
  }

  function extractGeneralInfo(facts: Record<string, unknown>): GeneralInfo {
    const info: GeneralInfo = {};

    // OS
    const os = facts.os as Record<string, unknown> | undefined;
    if (os?.name && (os.release as Record<string, unknown>)?.full) {
      info.os = `${os.name} ${(os.release as Record<string, unknown>).full}`;
      info.osFamily = os.family as string | undefined;
    } else if (facts.operatingsystem && facts.operatingsystemrelease) {
      info.os = `${facts.operatingsystem} ${facts.operatingsystemrelease}`;
      info.osFamily = facts.osfamily as string | undefined;
    } else if (facts.osfamily) {
      info.os = String(facts.osfamily);
      info.osFamily = facts.osfamily as string | undefined;
    }

    // Networking
    const networking = facts.networking as Record<string, unknown> | undefined;
    info.ip = (networking?.ip as string | undefined)
      ?? (facts.ipaddress as string | undefined)
      ?? (facts.ipaddress_eth0 as string | undefined);

    info.hostname = (facts.hostname as string | undefined)
      ?? (facts.fqdn as string | undefined);

    // Kernel
    info.kernel = facts.kernel as string | undefined;
    info.kernelRelease = facts.kernelrelease as string | undefined;

    info.architecture = (facts.architecture as string | undefined)
      ?? (facts.hardwaremodel as string | undefined);

    info.puppetVersion = facts.aio_agent_version as string | undefined;

    // Memory with usage calculation
    const memory = facts.memory as Record<string, unknown> | undefined;
    const system = memory?.system as Record<string, unknown> | undefined;
    if (system) {
      const totalBytes = parseMemoryBytes(system.total_bytes ?? system.total);
      const availBytes = parseMemoryBytes(system.available_bytes ?? system.available);
      const usedBytes = parseMemoryBytes(system.used_bytes ?? system.used);
      if (totalBytes && totalBytes > 0) {
        const used = usedBytes ?? (availBytes ? totalBytes - availBytes : null);
        if (used !== null) {
          info.memory = {
            used,
            total: totalBytes,
            percent: Math.round((used / totalBytes) * 100),
            label: `${formatBytes(used)} / ${formatBytes(totalBytes)}`,
          };
        } else {
          info.memory = {
            used: 0, total: totalBytes, percent: 0,
            label: formatBytes(totalBytes),
          };
        }
      }
    }

    // CPU
    const processors = facts.processors as Record<string, unknown> | undefined;
    info.cpuCount = processors?.count as number | undefined;
    const models = processors?.models as string[] | undefined;
    if (models && models.length > 0) {
      info.cpuModel = models[0].replace(/\s+/g, ' ').trim();
    }

    // Uptime
    const systemUptime = facts.system_uptime as Record<string, unknown> | undefined;
    info.uptime = systemUptime?.uptime as string | undefined;
    info.uptimeSeconds = systemUptime?.seconds as number | undefined;

    // Disks with usage
    const mountpoints = facts.mountpoints as Record<string, unknown> | undefined;
    if (mountpoints && typeof mountpoints === 'object') {
      const diskUsages: ResourceUsage[] = [];
      for (const [mount, data] of Object.entries(mountpoints)) {
        const mp = data as Record<string, unknown>;
        const sizeBytes = mp.size_bytes as number | undefined;
        const availableBytes = mp.available_bytes as number | undefined;
        if (sizeBytes && sizeBytes > 0 && availableBytes !== undefined) {
          const usedBytes = sizeBytes - availableBytes;
          diskUsages.push({
            used: usedBytes,
            total: sizeBytes,
            percent: Math.round((usedBytes / sizeBytes) * 100),
            label: mount,
          });
        }
      }
      // Show only significant mountpoints (> 1GB), sorted by size desc
      info.disks = diskUsages
        .filter(d => d.total > 1024 ** 3)
        .sort((a, b) => b.total - a.total)
        .slice(0, 4);
    }

    // Network interfaces
    const interfaces = networking?.interfaces as Record<string, unknown> | undefined;
    if (interfaces && typeof interfaces === 'object') {
      const nets: NetworkInterface[] = [];
      for (const [name, iface] of Object.entries(interfaces)) {
        if (name === 'lo' || name.startsWith('veth') || name.startsWith('docker')) continue;
        const ifData = iface as Record<string, unknown>;
        const bindings = ifData.bindings as Array<Record<string, unknown>> | undefined;
        const ip4 = bindings?.[0]?.address as string | undefined;
        nets.push({ name, ip: ip4 ?? (ifData.ip as string | undefined), mac: ifData.mac as string | undefined });
      }
      if (nets.length > 0) info.networkInterfaces = nets.slice(0, 4);
    }

    return info;
  }

  function getProgressColor(percent: number): string {
    if (percent >= 90) return 'bg-red-500 dark:bg-red-400';
    if (percent >= 75) return 'bg-amber-500 dark:bg-amber-400';
    return 'bg-emerald-500 dark:bg-emerald-400';
  }

  function getOsIcon(osFamily?: string): string {
    if (!osFamily) return '🖥️';
    const family = osFamily.toLowerCase();
    if (family.includes('debian') || family.includes('ubuntu')) return '🐧';
    if (family.includes('redhat') || family.includes('centos') || family.includes('rocky')) return '🎩';
    if (family.includes('suse')) return '🦎';
    if (family.includes('windows')) return '🪟';
    if (family.includes('darwin') || family.includes('macos')) return '🍎';
    return '🐧';
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

    // Fetch facts from all passive sources (backend excludes SSH-based ones).
    // The backend fans out to puppetdb, puppetserver, etc. in parallel with
    // a 5s per-source timeout — fastest source wins.
    try {
      const data = await get<{
        sources: Record<string, { facts: Record<string, unknown>; timestamp: string }>;
        errors?: Record<string, string>;
      }>(`/api/nodes/${nodeId}/facts`, { maxRetries: 1 });

      // Pick the first source with facts, preferring puppetdb > puppetserver > others
      const preferredOrder = ['puppetdb', 'puppetserver'];
      let chosen: string | null = null;
      for (const name of preferredOrder) {
        if (data.sources?.[name]?.facts) { chosen = name; break; }
      }
      if (!chosen) {
        chosen = Object.keys(data.sources ?? {}).find(k => data.sources[k]?.facts) ?? null;
      }
      if (chosen && data.sources[chosen]?.facts) {
        generalInfo = extractGeneralInfo(data.sources[chosen].facts);
        factsSource = chosen;
      }
    } catch {
      // Facts are optional enrichment — widget still shows basic node info
    }

    onReady();
  });
</script>

{#if node}
  <div class="rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-gray-200 px-5 py-3 dark:border-gray-700">
      <div class="flex items-center gap-3">
        <span class="text-lg">{getOsIcon(generalInfo.osFamily)}</span>
        <div>
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">{node.name || node.id}</h2>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {#if generalInfo.os}{generalInfo.os}{:else}{node.uri}{/if}
            {#if generalInfo.architecture}
              <span class="mx-1">·</span>{generalInfo.architecture}
            {/if}
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <IntegrationBadge integration="bolt" variant="badge" size="sm" />
        {#if factsSource}
          <span class="text-xs text-gray-400 dark:text-gray-500">+</span>
          <IntegrationBadge integration={factsSource} variant="label" size="sm" />
        {/if}
      </div>
    </div>

    <div class="p-5">
      <!-- Resource Usage Section -->
      {#if generalInfo.memory || generalInfo.cpuCount || (generalInfo.disks && generalInfo.disks.length > 0)}
        <div class="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <!-- CPU Card -->
          {#if generalInfo.cpuCount}
            <div class="rounded-lg border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
              <div class="mb-2 flex items-center gap-2">
                <svg class="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
                <span class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">CPU</span>
              </div>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">{generalInfo.cpuCount} <span class="text-sm font-normal text-gray-500">cores</span></p>
              {#if generalInfo.cpuModel}
                <p class="mt-1 truncate text-xs text-gray-500 dark:text-gray-400" title={generalInfo.cpuModel}>{generalInfo.cpuModel}</p>
              {/if}
            </div>
          {/if}

          <!-- Memory Card -->
          {#if generalInfo.memory}
            <div class="rounded-lg border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
              <div class="mb-2 flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <svg class="h-4 w-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Memory</span>
                </div>
                <span class="text-xs font-semibold {generalInfo.memory.percent >= 90 ? 'text-red-600 dark:text-red-400' : generalInfo.memory.percent >= 75 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}">{generalInfo.memory.percent}%</span>
              </div>
              <div class="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <div class="h-full rounded-full transition-all {getProgressColor(generalInfo.memory.percent)}" style="width: {generalInfo.memory.percent}%"></div>
              </div>
              <p class="text-xs text-gray-500 dark:text-gray-400">{generalInfo.memory.label}</p>
            </div>
          {/if}

          <!-- Disk Cards -->
          {#if generalInfo.disks && generalInfo.disks.length > 0}
            {#each generalInfo.disks as disk (disk.label)}
              <div class="rounded-lg border border-gray-100 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/50">
                <div class="mb-2 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <svg class="h-4 w-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                    </svg>
                    <span class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Disk</span>
                  </div>
                  <span class="text-xs font-semibold {disk.percent >= 90 ? 'text-red-600 dark:text-red-400' : disk.percent >= 75 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}">{disk.percent}%</span>
                </div>
                <div class="mb-2 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                  <div class="h-full rounded-full transition-all {getProgressColor(disk.percent)}" style="width: {disk.percent}%"></div>
                </div>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  <span class="font-medium text-gray-700 dark:text-gray-300">{disk.label}</span>
                  <span class="mx-1">·</span>{formatBytes(disk.used)} / {formatBytes(disk.total)}
                </p>
              </div>
            {/each}
          {/if}
        </div>
      {/if}

      <!-- System Info + Networking Grid -->
      <div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <!-- System Details -->
        <div>
          <h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">System</h3>
          <div class="space-y-2">
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-500 dark:text-gray-400">Transport</span>
              <span class="text-sm font-medium text-gray-900 dark:text-white">{node.transport}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm text-gray-500 dark:text-gray-400">URI</span>
              <span class="text-sm font-medium text-gray-900 dark:text-white">{node.uri}</span>
            </div>
            {#if generalInfo.kernel}
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-500 dark:text-gray-400">Kernel</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white">{generalInfo.kernel}{#if generalInfo.kernelRelease} {generalInfo.kernelRelease}{/if}</span>
              </div>
            {/if}
            {#if generalInfo.uptime}
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-500 dark:text-gray-400">Uptime</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white">{generalInfo.uptime}</span>
              </div>
            {/if}
            {#if generalInfo.puppetVersion}
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-500 dark:text-gray-400">Puppet Agent</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white">v{generalInfo.puppetVersion}</span>
              </div>
            {/if}
            {#if node.config.user}
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-500 dark:text-gray-400">User</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white">{node.config.user}</span>
              </div>
            {/if}
            {#if node.config.port}
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-500 dark:text-gray-400">Port</span>
                <span class="text-sm font-medium text-gray-900 dark:text-white">{node.config.port}</span>
              </div>
            {/if}
          </div>
        </div>

        <!-- Networking -->
        <div>
          <h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Networking</h3>
          {#if generalInfo.networkInterfaces && generalInfo.networkInterfaces.length > 0}
            <div class="space-y-2">
              {#each generalInfo.networkInterfaces as iface (iface.name)}
                <div class="flex items-center justify-between rounded border border-gray-100 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/30">
                  <span class="text-xs font-mono font-medium text-gray-700 dark:text-gray-300">{iface.name}</span>
                  <div class="text-right">
                    {#if iface.ip}
                      <span class="text-xs font-mono text-gray-900 dark:text-white">{iface.ip}</span>
                    {/if}
                    {#if iface.mac}
                      <p class="text-[10px] text-gray-400 dark:text-gray-500">{iface.mac}</p>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          {:else if generalInfo.ip}
            <div class="space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-500 dark:text-gray-400">Primary IP</span>
                <span class="text-sm font-mono font-medium text-gray-900 dark:text-white">{generalInfo.ip}</span>
              </div>
              {#if generalInfo.hostname}
                <div class="flex items-center justify-between">
                  <span class="text-sm text-gray-500 dark:text-gray-400">Hostname</span>
                  <span class="text-sm font-medium text-gray-900 dark:text-white">{generalInfo.hostname}</span>
                </div>
              {/if}
            </div>
          {:else}
            <p class="text-sm text-gray-400 dark:text-gray-500">No network data available</p>
          {/if}
        </div>
      </div>

      <!-- No facts hint -->
      {#if !generalInfo.os && !generalInfo.memory && !factsSource}
        <div class="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
          <div class="flex items-start gap-2">
            <svg class="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="text-xs text-blue-700 dark:text-blue-400">
              System details (CPU, memory, disks) will appear once facts are available from PuppetDB or another passive source.
            </p>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}
