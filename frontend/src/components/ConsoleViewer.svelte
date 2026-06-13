<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { post } from '../lib/api';

  interface ConsoleCapability {
    provider: string;
    transport: 'websocket-vnc' | 'websocket-terminal';
    displayName: string;
  }

  interface Props {
    nodeId: string;
    capabilities: ConsoleCapability[];
  }

  interface SessionResponse {
    sessionId: string;
    token: string;
    wsUrl: string;
    transport: 'websocket-vnc' | 'websocket-terminal';
  }

  type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

  const CLOSE_CODE_MESSAGES: Record<number, string> = {
    4401: 'Session authorization failed. Your session token may have expired.',
    4502: 'The remote host connection was lost.',
    4408: 'Maximum session duration reached.',
    4504: 'Connection to the remote host timed out.',
  };

  const HEARTBEAT_INTERVAL_MS = 30_000;

  let { nodeId, capabilities }: Props = $props();

  let status = $state<ConnectionStatus>('disconnected');
  let errorMessage = $state<string | null>(null);
  let sessionId = $state<string | null>(null);
  let isFullscreen = $state(false);

  let ws: WebSocket | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let viewportEl = $state<HTMLDivElement | null>(null);
  let vncContainerEl = $state<HTMLDivElement | null>(null);
  let terminalContainerEl = $state<HTMLDivElement | null>(null);

  // Dynamic module references (loaded on demand)
  let rfbInstance: InstanceType<typeof import('@novnc/novnc').default> | null = null;
  let terminalInstance: import('@xterm/xterm').Terminal | null = null;
  let fitAddonInstance: import('@xterm/addon-fit').FitAddon | null = null;

  const activeCapability = $derived(capabilities[0] ?? null);
  const isVnc = $derived(activeCapability?.transport === 'websocket-vnc');
  const isTerminal = $derived(activeCapability?.transport === 'websocket-terminal');

  async function connect(): Promise<void> {
    if (!activeCapability) return;

    status = 'connecting';
    errorMessage = null;

    try {
      const response = await post<SessionResponse>('/api/console/sessions', {
        nodeId,
        provider: activeCapability.provider,
      });

      sessionId = response.sessionId;
      const wsUrl = buildWsUrl(response.wsUrl, response.token);

      if (isVnc) {
        await connectVnc(wsUrl);
      } else if (isTerminal) {
        await connectTerminal(wsUrl);
      }
    } catch (err) {
      status = 'disconnected';
      errorMessage = err instanceof Error ? err.message : 'Failed to create session.';
    }
  }

  function buildWsUrl(path: string, token: string): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const base = `${protocol}//${window.location.host}`;
    const separator = path.includes('?') ? '&' : '?';
    return `${base}${path}${separator}token=${encodeURIComponent(token)}`;
  }

  async function connectVnc(wsUrl: string): Promise<void> {
    if (!vncContainerEl) return;

    try {
      const { default: RFB } = await import('@novnc/novnc');

      vncContainerEl.innerHTML = '';
      rfbInstance = new RFB(vncContainerEl, wsUrl);
      rfbInstance.scaleViewport = true;
      rfbInstance.resizeSession = true;

      rfbInstance.addEventListener('connect', () => {
        status = 'connected';
        startHeartbeat();
      });

      rfbInstance.addEventListener('disconnect', (ev: Event) => {
        const detail = (ev as CustomEvent<{ clean: boolean }>).detail;
        handleDisconnect(detail?.clean ? 1000 : 4502);
      });
    } catch {
      status = 'disconnected';
      errorMessage = 'noVNC library could not be loaded. VNC console is unavailable.';
    }
  }

  async function connectTerminal(wsUrl: string): Promise<void> {
    if (!terminalContainerEl) return;

    try {
      const { Terminal } = await import('@xterm/xterm');
      const { FitAddon } = await import('@xterm/addon-fit');
      const { AttachAddon } = await import('@xterm/addon-attach');

      terminalContainerEl.innerHTML = '';
      terminalInstance = new Terminal({
        cursorBlink: true,
        fontFamily: 'monospace',
        fontSize: 14,
      });

      fitAddonInstance = new FitAddon();
      terminalInstance.loadAddon(fitAddonInstance);
      terminalInstance.open(terminalContainerEl);
      fitAddonInstance.fit();

      ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.addEventListener('open', () => {
        if (ws && terminalInstance) {
          const attachAddon = new AttachAddon(ws);
          terminalInstance.loadAddon(attachAddon);
          status = 'connected';
          startHeartbeat();
        }
      });

      ws.addEventListener('close', (ev: CloseEvent) => {
        handleDisconnect(ev.code);
      });

      ws.addEventListener('error', () => {
        handleDisconnect(4502);
      });
    } catch {
      status = 'disconnected';
      errorMessage = 'xterm.js library could not be loaded. Terminal console is unavailable.';
    }
  }

  function handleDisconnect(code: number): void {
    stopHeartbeat();
    status = 'disconnected';

    if (code === 1000 || code === 1001) {
      // Normal closure initiated by frontend
      errorMessage = null;
      return;
    }

    const knownMessage = CLOSE_CODE_MESSAGES[code];
    errorMessage = knownMessage ?? 'Connection lost unexpectedly.';
  }

  function startHeartbeat(): void {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (status === 'connected' && sessionId) {
        void sendHeartbeat();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  function stopHeartbeat(): void {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  async function sendHeartbeat(): Promise<void> {
    if (!sessionId) return;
    try {
      await post(`/api/console/sessions/${sessionId}/heartbeat`, undefined, {
        maxRetries: 0,
        showRetryNotifications: false,
      });
    } catch {
      // Heartbeat failure is non-fatal — backend will timeout eventually
    }
  }

  function disconnect(): void {
    if (rfbInstance) {
      rfbInstance.disconnect();
      rfbInstance = null;
    }
    if (ws) {
      ws.close(1000);
      ws = null;
    }
    if (terminalInstance) {
      terminalInstance.dispose();
      terminalInstance = null;
    }
    fitAddonInstance = null;
    stopHeartbeat();
    status = 'disconnected';
    terminateSession();
  }

  function terminateSession(): void {
    if (!sessionId) return;
    const url = `/api/console/sessions/${sessionId}`;
    const payload = JSON.stringify({ action: 'terminate' });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(url, payload);
    } else {
      void fetch(url, {
        method: 'DELETE',
        body: payload,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      });
    }
    sessionId = null;
  }

  function newSession(): void {
    errorMessage = null;
    void connect();
  }

  function toggleFullscreen(): void {
    if (!viewportEl) return;

    if (!document.fullscreenElement) {
      void viewportEl.requestFullscreen().then(() => {
        isFullscreen = true;
      });
    } else {
      void document.exitFullscreen().then(() => {
        isFullscreen = false;
      });
    }
  }

  function handleFullscreenChange(): void {
    isFullscreen = !!document.fullscreenElement;
    // Resize terminal after fullscreen change
    if (fitAddonInstance) {
      setTimeout(() => fitAddonInstance?.fit(), 100);
    }
  }

  function handleBeforeUnload(): void {
    terminateSession();
  }

  onMount(() => {
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
  });

  onDestroy(() => {
    disconnect();
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
    window.removeEventListener('beforeunload', handleBeforeUnload);
  });

  const statusColor = $derived(
    status === 'connected' ? 'bg-green-500'
    : status === 'connecting' ? 'bg-yellow-500 animate-pulse'
    : 'bg-gray-400'
  );

  const statusLabel = $derived(
    status === 'connected' ? 'Connected'
    : status === 'connecting' ? 'Connecting...'
    : 'Disconnected'
  );
</script>

<div
  bind:this={viewportEl}
  class="flex flex-col border border-gray-700 rounded-lg overflow-hidden bg-gray-900"
  class:h-full={isFullscreen}
>
  <!-- Toolbar -->
  <div class="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
    <div class="flex items-center gap-2">
      <!-- Status Indicator -->
      <span class="inline-block w-2.5 h-2.5 rounded-full {statusColor}" aria-label={statusLabel}></span>
      <span class="text-sm text-gray-300">{statusLabel}</span>
      {#if activeCapability}
        <span class="text-xs text-gray-500">— {activeCapability.displayName}</span>
      {/if}
    </div>

    <div class="flex items-center gap-2">
      {#if status === 'disconnected' && !errorMessage}
        <button
          onclick={connect}
          class="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Connect
        </button>
      {/if}

      {#if status === 'connected'}
        <button
          onclick={disconnect}
          class="px-3 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
        >
          Disconnect
        </button>
      {/if}

      <button
        onclick={toggleFullscreen}
        class="p-1 text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
        aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
        title={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
      >
        {#if isFullscreen}
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        {:else}
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        {/if}
      </button>
    </div>
  </div>

  <!-- Console Viewport -->
  <div class="relative flex-1 min-h-[400px] bg-black">
    {#if errorMessage}
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 bg-gray-900/95">
        <div class="text-center">
          <svg class="w-10 h-10 mx-auto mb-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <p class="text-sm text-red-300">{errorMessage}</p>
        </div>
        <button
          onclick={newSession}
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          New Session
        </button>
      </div>
    {/if}

    {#if status === 'connecting'}
      <div class="absolute inset-0 flex items-center justify-center bg-gray-900/80">
        <div class="flex items-center gap-3">
          <svg class="w-5 h-5 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          <span class="text-sm text-gray-300">Establishing connection...</span>
        </div>
      </div>
    {/if}

    {#if !activeCapability}
      <div class="absolute inset-0 flex items-center justify-center">
        <p class="text-sm text-gray-500">No console capabilities available for this node.</p>
      </div>
    {/if}

    <!-- VNC Container -->
    {#if isVnc}
      <div
        bind:this={vncContainerEl}
        class="w-full h-full"
        class:hidden={status === 'disconnected' && !errorMessage}
      ></div>
    {/if}

    <!-- Terminal Container -->
    {#if isTerminal}
      <div
        bind:this={terminalContainerEl}
        class="w-full h-full"
        class:hidden={status === 'disconnected' && !errorMessage}
      ></div>
    {/if}
  </div>
</div>
