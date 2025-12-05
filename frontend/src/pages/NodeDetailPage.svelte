<script lang="ts">
  import { onMount } from 'svelte';
  import { router } from '../lib/router.svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import ErrorAlert from '../components/ErrorAlert.svelte';
  import StatusBadge from '../components/StatusBadge.svelte';
  import FactsViewer from '../components/FactsViewer.svelte';
  import MultiSourceFactsViewer from '../components/MultiSourceFactsViewer.svelte';
  import CommandOutput from '../components/CommandOutput.svelte';
  import RealtimeOutputViewer from '../components/RealtimeOutputViewer.svelte';
  import TaskRunInterface from '../components/TaskRunInterface.svelte';
  import PuppetRunInterface from '../components/PuppetRunInterface.svelte';
  import PackageInstallInterface from '../components/PackageInstallInterface.svelte';
  import ReportViewer from '../components/ReportViewer.svelte';
  import PuppetReportsListView from '../components/PuppetReportsListView.svelte';
  import CatalogViewer from '../components/CatalogViewer.svelte';
  import EventsViewer from '../components/EventsViewer.svelte';
  import ReExecutionButton from '../components/ReExecutionButton.svelte';
  import NodeStatus from '../components/NodeStatus.svelte';
  import EnvironmentSelector from '../components/EnvironmentSelector.svelte';
  import CatalogComparison from '../components/CatalogComparison.svelte';
  import { get, post } from '../lib/api';
  import { showError, showSuccess, showInfo } from '../lib/toast.svelte';
  import { expertMode } from '../lib/expertMode.svelte';
  import { useExecutionStream, type ExecutionStream } from '../lib/executionStream.svelte';

  interface Props {
    params?: { id: string };
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

  interface Facts {
    nodeId: string;
    gatheredAt: string;
    facts: Record<string, unknown>;
    command?: string;
  }



  interface ExecutionResult {
    id: string;
    type: 'command' | 'task' | 'facts' | 'puppet' | 'package';
    targetNodes: string[];
    action: string;
    parameters?: Record<string, unknown>;
    status: 'running' | 'success' | 'failed' | 'partial';
    startedAt: string;
    completedAt?: string;
    results: NodeResult[];
    error?: string;
    command?: string;
    expertMode?: boolean;
  }

  interface NodeResult {
    nodeId: string;
    status: 'success' | 'failed';
    output?: {
      stdout?: string;
      stderr?: string;
      exitCode?: number;
    };
    value?: unknown;
    error?: string;
    duration: number;
  }

  interface CommandWhitelistConfig {
    allowAll: boolean;
    whitelist: string[];
    matchMode: 'exact' | 'prefix';
  }

  let { params }: Props = $props();
  const nodeId = $derived(params?.id || '');

  // Tab types
  type TabId = 'overview' | 'facts' | 'execution-history' | 'puppet-reports' | 'catalog' | 'events' | 'certificate-status' | 'node-status' | 'catalog-compilation' | 'environments';

  // State
  let node = $state<Node | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Tab state with URL sync
  let activeTab = $state<TabId>('overview');

  // Track which tabs have been loaded (for lazy loading)
  let loadedTabs = $state<Set<TabId>>(new Set(['overview']));

  // Command whitelist state
  let commandWhitelist = $state<CommandWhitelistConfig | null>(null);

  // Facts state
  let facts = $state<Facts | null>(null);
  let factsLoading = $state(false);
  let factsError = $state<string | null>(null);

  // Command execution state
  let commandInput = $state('');
  let commandExecuting = $state(false);
  let commandError = $state<string | null>(null);
  let commandResult = $state<ExecutionResult | null>(null);
  let commandExecutionId = $state<string | null>(null);
  let commandStream = $state<ExecutionStream | null>(null);

  // Re-execution state
  let initialTaskName = $state<string | undefined>(undefined);
  let initialTaskParameters = $state<Record<string, unknown> | undefined>(undefined);

  // Execution history state
  let executions = $state<ExecutionResult[]>([]);
  let executionsLoading = $state(false);
  let executionsError = $state<string | null>(null);

  // PuppetDB data state (for lazy loading)
  let puppetReports = $state<any[]>([]);
  let puppetReportsLoading = $state(false);
  let puppetReportsError = $state<string | null>(null);
  let selectedReport = $state<any | null>(null);

  let catalog = $state<any | null>(null);
  let catalogLoading = $state(false);
  let catalogError = $state<string | null>(null);

  let events = $state<any[]>([]);
  let eventsLoading = $state(false);
  let eventsError = $state<string | null>(null);

  // Puppetserver data state (for lazy loading)
  let certificateStatus = $state<any | null>(null);
  let certificateLoading = $state(false);
  let certificateError = $state<string | null>(null);

  let nodeStatus = $state<any | null>(null);
  let nodeStatusLoading = $state(false);
  let nodeStatusError = $state<string | null>(null);

  let puppetserverFacts = $state<any | null>(null);
  let puppetserverFactsLoading = $state(false);
  let puppetserverFactsError = $state<string | null>(null);

  let puppetdbFacts = $state<any | null>(null);
  let puppetdbFactsLoading = $state(false);
  let puppetdbFactsError = $state<string | null>(null);

  let environments = $state<any[]>([]);
  let environmentsLoading = $state(false);
  let environmentsError = $state<string | null>(null);

  // Cache for loaded data
  let dataCache = $state<Record<TabId, any>>({});

  // Fetch node details
  async function fetchNode(): Promise<void> {
    loading = true;
    error = null;

    try {
      const data = await get<{ node: Node }>(`/api/nodes/${nodeId}`, {
        maxRetries: 2,
      });

      node = data.node;
    } catch (err) {
      error = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching node:', err);
      showError('Failed to load node details', error);
    } finally {
      loading = false;
    }
  }

  // Gather facts
  async function gatherFacts(): Promise<void> {
    factsLoading = true;
    factsError = null;

    try {
      showInfo('Gathering facts...');

      const data = await post<{ facts: Facts }>(`/api/nodes/${nodeId}/facts`, undefined, {
        maxRetries: 1,
      });

      facts = data.facts;
      showSuccess('Facts gathered successfully');
    } catch (err) {
      factsError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error gathering facts:', err);
      showError('Failed to gather facts', factsError);
    } finally {
      factsLoading = false;
    }
  }

  // Execute command
  async function executeCommand(event: Event): Promise<void> {
    event.preventDefault();

    if (!commandInput.trim()) {
      commandError = 'Command cannot be empty';
      showError('Command cannot be empty');
      return;
    }

    commandExecuting = true;
    commandError = null;
    commandResult = null;
    commandExecutionId = null;
    commandStream = null;

    try {
      showInfo('Executing command...');

      const data = await post<{ executionId: string }>(
        `/api/nodes/${nodeId}/command`,
        { command: commandInput, expertMode: expertMode.enabled },
        { maxRetries: 0 } // Don't retry command executions
      );

      const executionId = data.executionId;
      commandExecutionId = executionId;

      // If expert mode is enabled, create a stream for real-time output
      if (expertMode.enabled) {
        commandStream = useExecutionStream(executionId, {
          onComplete: (result) => {
            // Fetch final execution result
            pollExecutionResult(executionId);
            showSuccess('Command executed successfully');
          },
          onError: (error) => {
            commandError = error;
            showError('Command execution failed', error);
          },
        });
        commandStream.connect();
      } else {
        // Poll for execution result (non-streaming)
        await pollExecutionResult(executionId);
        showSuccess('Command executed successfully');
      }
    } catch (err) {
      commandError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error executing command:', err);
      showError('Command execution failed', commandError);
    } finally {
      commandExecuting = false;
    }
  }

  // Poll for execution result (for command execution)
  async function pollExecutionResult(executionId: string): Promise<void> {
    const maxAttempts = 60; // 60 seconds max
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`/api/executions/${executionId}`);

        if (response.ok) {
          const data = await response.json();
          const execution = data.execution;

          if (execution.status !== 'running') {
            // Execution completed
            commandResult = execution;

            // Refresh execution history
            fetchExecutions();
            return;
          }
        }

        // Wait 1 second before next poll
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      } catch (err) {
        console.error('Error polling execution result:', err);
        break;
      }
    }

    // Timeout
    commandError = 'Execution timed out';
  }

  // Fetch execution history
  async function fetchExecutions(): Promise<void> {
    executionsLoading = true;
    executionsError = null;

    try {
      const data = await get<{ executions: ExecutionResult[] }>(
        `/api/executions?targetNode=${nodeId}&pageSize=10`,
        { maxRetries: 2 }
      );

      executions = data.executions || [];
    } catch (err) {
      executionsError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching executions:', err);
    } finally {
      executionsLoading = false;
    }
  }

  // Fetch command whitelist configuration
  async function fetchCommandWhitelist(): Promise<void> {
    try {
      const data = await get<{ commandWhitelist: CommandWhitelistConfig }>(
        '/api/config',
        { maxRetries: 2 }
      );

      commandWhitelist = data.commandWhitelist;
    } catch (err) {
      console.error('Error fetching command whitelist:', err);
    }
  }

  // Lazy load Puppet Reports
  async function fetchPuppetReports(): Promise<void> {
    // Check cache first
    if (dataCache['puppet-reports']) {
      puppetReports = dataCache['puppet-reports'];
      return;
    }

    puppetReportsLoading = true;
    puppetReportsError = null;

    try {
      const data = await get<{ reports: any[] }>(
        `/api/integrations/puppetdb/nodes/${nodeId}/reports`,
        { maxRetries: 2 }
      );

      puppetReports = data.reports || [];
      dataCache['puppet-reports'] = puppetReports;
    } catch (err) {
      puppetReportsError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching Puppet reports:', err);
      showError('Failed to load Puppet reports', puppetReportsError);
    } finally {
      puppetReportsLoading = false;
    }
  }

  // Lazy load Catalog
  async function fetchCatalog(): Promise<void> {
    // Check cache first
    if (dataCache['catalog']) {
      catalog = dataCache['catalog'];
      return;
    }

    catalogLoading = true;
    catalogError = null;

    try {
      const data = await get<{ catalog: any }>(
        `/api/integrations/puppetdb/nodes/${nodeId}/catalog`,
        { maxRetries: 2 }
      );

      catalog = data.catalog;
      dataCache['catalog'] = catalog;
    } catch (err) {
      catalogError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching catalog:', err);
      showError('Failed to load catalog', catalogError);
    } finally {
      catalogLoading = false;
    }
  }

  // Lazy load Events
  async function fetchEvents(): Promise<void> {
    // Check cache first
    if (dataCache['events']) {
      events = dataCache['events'];
      return;
    }

    eventsLoading = true;
    eventsError = null;

    try {
      const data = await get<{ events: any[] }>(
        `/api/integrations/puppetdb/nodes/${nodeId}/events`,
        { maxRetries: 2 }
      );

      events = data.events || [];
      dataCache['events'] = events;
    } catch (err) {
      eventsError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching events:', err);
      showError('Failed to load events', eventsError);
    } finally {
      eventsLoading = false;
    }
  }

  // Lazy load Certificate Status
  async function fetchCertificateStatus(): Promise<void> {
    // Check cache first
    if (dataCache['certificate-status']) {
      certificateStatus = dataCache['certificate-status'];
      return;
    }

    certificateLoading = true;
    certificateError = null;

    try {
      const data = await get<{ certificate: any }>(
        `/api/integrations/puppetserver/certificates/${nodeId}`,
        { maxRetries: 2 }
      );

      certificateStatus = data.certificate;
      dataCache['certificate-status'] = certificateStatus;
    } catch (err) {
      certificateError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching certificate status:', err);
      // Don't show error toast - display inline error instead
    } finally {
      certificateLoading = false;
    }
  }

  // Lazy load Node Status
  async function fetchNodeStatus(): Promise<void> {
    // Check cache first
    if (dataCache['node-status']) {
      nodeStatus = dataCache['node-status'];
      return;
    }

    nodeStatusLoading = true;
    nodeStatusError = null;

    try {
      const data = await get<{ status: any }>(
        `/api/integrations/puppetserver/nodes/${nodeId}/status`,
        { maxRetries: 2 }
      );

      nodeStatus = data.status;
      dataCache['node-status'] = nodeStatus;
    } catch (err) {
      nodeStatusError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching node status:', err);
      // Don't show error toast - display inline error instead
    } finally {
      nodeStatusLoading = false;
    }
  }

  // Lazy load Puppetserver Facts
  async function fetchPuppetserverFacts(): Promise<void> {
    // Check cache first
    if (dataCache['puppetserver-facts']) {
      puppetserverFacts = dataCache['puppetserver-facts'];
      return;
    }

    puppetserverFactsLoading = true;
    puppetserverFactsError = null;

    try {
      const data = await get<{ facts: any }>(
        `/api/integrations/puppetserver/nodes/${nodeId}/facts`,
        { maxRetries: 2 }
      );

      puppetserverFacts = data.facts;
      dataCache['puppetserver-facts'] = puppetserverFacts;
    } catch (err) {
      puppetserverFactsError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching Puppetserver facts:', err);
      // Don't show error toast - display inline error instead
    } finally {
      puppetserverFactsLoading = false;
    }
  }

  // Lazy load PuppetDB Facts
  async function fetchPuppetDBFacts(): Promise<void> {
    // Check cache first
    if (dataCache['puppetdb-facts']) {
      puppetdbFacts = dataCache['puppetdb-facts'];
      return;
    }

    puppetdbFactsLoading = true;
    puppetdbFactsError = null;

    try {
      const data = await get<{ facts: any }>(
        `/api/integrations/puppetdb/nodes/${nodeId}/facts`,
        { maxRetries: 2 }
      );

      puppetdbFacts = data.facts;
      dataCache['puppetdb-facts'] = puppetdbFacts;
    } catch (err) {
      puppetdbFactsError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching PuppetDB facts:', err);
      // Don't show error toast - display inline error instead
    } finally {
      puppetdbFactsLoading = false;
    }
  }

  // Lazy load Environments
  async function fetchEnvironments(): Promise<void> {
    // Check cache first
    if (dataCache['environments']) {
      environments = dataCache['environments'];
      return;
    }

    environmentsLoading = true;
    environmentsError = null;

    try {
      const data = await get<{ environments: any[] }>(
        `/api/integrations/puppetserver/environments`,
        { maxRetries: 2 }
      );

      environments = data.environments || [];
      dataCache['environments'] = environments;
    } catch (err) {
      environmentsError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching environments:', err);
      // Don't show error toast - display inline error instead
    } finally {
      environmentsLoading = false;
    }
  }

  // Sign certificate
  async function signCertificate(): Promise<void> {
    try {
      showInfo('Signing certificate...');
      await post(`/api/integrations/puppetserver/certificates/${nodeId}/sign`, undefined, {
        maxRetries: 0,
      });
      showSuccess('Certificate signed successfully');

      // Refresh certificate status
      delete dataCache['certificate-status'];
      await fetchCertificateStatus();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error signing certificate:', err);
      showError('Failed to sign certificate', errorMsg);
    }
  }

  // Revoke certificate
  async function revokeCertificate(): Promise<void> {
    if (!confirm('Are you sure you want to revoke this certificate? This action cannot be undone.')) {
      return;
    }

    try {
      showInfo('Revoking certificate...');
      await fetch(`/api/integrations/puppetserver/certificates/${nodeId}`, {
        method: 'DELETE',
      });
      showSuccess('Certificate revoked successfully');

      // Refresh certificate status
      delete dataCache['certificate-status'];
      await fetchCertificateStatus();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error revoking certificate:', err);
      showError('Failed to revoke certificate', errorMsg);
    }
  }



  // Format timestamp
  function formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  // Navigate back to inventory
  function navigateBack(): void {
    router.navigate('/');
  }

  // Switch tab and update URL
  function switchTab(tabId: TabId): void {
    activeTab = tabId;

    // Update URL with tab parameter (preserves browser history)
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tabId);
    window.history.pushState({}, '', url.toString());

    // Lazy load data for the tab if not already loaded
    if (!loadedTabs.has(tabId)) {
      loadedTabs.add(tabId);
      loadTabData(tabId);
    }
  }

  // Load data for a specific tab
  async function loadTabData(tabId: TabId): Promise<void> {
    switch (tabId) {
      case 'facts':
        // Load facts from all sources in parallel
        await Promise.all([
          fetchPuppetDBFacts(),
          fetchPuppetserverFacts(),
        ]);
        break;
      case 'puppet-reports':
        await fetchPuppetReports();
        break;
      case 'catalog':
        await fetchCatalog();
        break;
      case 'events':
        await fetchEvents();
        break;
      case 'execution-history':
        if (executions.length === 0) {
          await fetchExecutions();
        }
        break;
      case 'certificate-status':
        await fetchCertificateStatus();
        break;
      case 'node-status':
        await fetchNodeStatus();
        break;
      case 'catalog-compilation':
        await fetchEnvironments();
        break;
      case 'environments':
        await fetchEnvironments();
        break;
      // 'overview' is loaded on mount
    }
  }

  // Read tab from URL on mount
  function readTabFromURL(): void {
    const url = new URL(window.location.href);
    const tabParam = url.searchParams.get('tab') as TabId | null;

    if (tabParam && ['overview', 'facts', 'execution-history', 'puppet-reports', 'catalog', 'events', 'certificate-status', 'node-status', 'catalog-compilation', 'environments'].includes(tabParam)) {
      activeTab = tabParam;

      // Load data for the tab if not already loaded
      if (!loadedTabs.has(tabParam)) {
        loadedTabs.add(tabParam);
        loadTabData(tabParam);
      }
    }
  }

  // Handle browser back/forward buttons
  function handlePopState(): void {
    readTabFromURL();
  }

  // Helper function to render source badge
  function getSourceBadge(source: 'bolt' | 'puppetdb'): string {
    return source === 'bolt' ? 'Bolt' : 'PuppetDB';
  }

  function getSourceBadgeClass(source: 'bolt' | 'puppetdb'): string {
    return source === 'bolt'
      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400'
      : 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
  }

  // Check for re-execution parameters in sessionStorage
  function checkReExecutionParams(): void {
    // Check for command re-execution
    const reExecuteCommand = sessionStorage.getItem('reExecuteCommand');
    if (reExecuteCommand) {
      commandInput = reExecuteCommand;
      sessionStorage.removeItem('reExecuteCommand');
      showInfo('Command pre-filled from previous execution');
    }

    // Check for task re-execution
    const reExecuteTask = sessionStorage.getItem('reExecuteTask');
    if (reExecuteTask) {
      try {
        const taskData = JSON.parse(reExecuteTask);
        initialTaskName = taskData.taskName;
        initialTaskParameters = taskData.parameters;
        sessionStorage.removeItem('reExecuteTask');
        showInfo('Task pre-filled from previous execution');
      } catch (err) {
        console.error('Error parsing re-execute task data:', err);
      }
    }

    // Check for puppet re-execution
    const reExecutePuppet = sessionStorage.getItem('reExecutePuppet');
    if (reExecutePuppet) {
      try {
        const puppetData = JSON.parse(reExecutePuppet);
        // The puppet parameters will be handled by PuppetRunInterface
        // For now, we'll just clear it and show a message
        sessionStorage.removeItem('reExecutePuppet');
        showInfo('Puppet run parameters pre-filled from previous execution');
      } catch (err) {
        console.error('Error parsing re-execute puppet data:', err);
      }
    }

    // Check for package re-execution
    const reExecutePackage = sessionStorage.getItem('reExecutePackage');
    if (reExecutePackage) {
      try {
        const packageData = JSON.parse(reExecutePackage);
        // The package parameters will be handled by PackageInstallInterface
        // For now, we'll just clear it and show a message
        sessionStorage.removeItem('reExecutePackage');
        showInfo('Package installation parameters pre-filled from previous execution');
      } catch (err) {
        console.error('Error parsing re-execute package data:', err);
      }
    }
  }

  // On mount
  onMount(() => {
    fetchNode();
    fetchExecutions();
    fetchCommandWhitelist();
    readTabFromURL();
    checkReExecutionParams();

    // Listen for browser back/forward
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  });
</script>

<div class="container mx-auto px-4 py-8">
  <!-- Back button -->
  <button
    type="button"
    class="mb-4 flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
    onclick={navigateBack}
  >
    <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
    </svg>
    Back to Inventory
  </button>

  <!-- Loading State -->
  {#if loading}
    <div class="flex justify-center py-12">
      <LoadingSpinner size="lg" message="Loading node details..." />
    </div>
  {:else if error}
    <!-- Error State -->
    <ErrorAlert
      message="Failed to load node details"
      details={error}
      onRetry={fetchNode}
    />
  {:else if node}
    <!-- Node Header -->
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
        {node.name}
      </h1>
      <div class="mt-2 flex items-center gap-3">
        <span class="inline-flex items-center rounded-full px-2.5 py-1 text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400">
          {node.transport}
        </span>
        <span class="text-gray-600 dark:text-gray-400">{node.uri}</span>
      </div>
    </div>

    <!-- Tab Navigation -->
    <div class="mb-6 border-b border-gray-200 dark:border-gray-700">
      <nav class="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
        <button
          type="button"
          class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'overview' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
          onclick={() => switchTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'facts' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
          onclick={() => switchTab('facts')}
        >
          Facts
        </button>
        <button
          type="button"
          class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'execution-history' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
          onclick={() => switchTab('execution-history')}
        >
          Execution History
        </button>
        <button
          type="button"
          class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'certificate-status' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
          onclick={() => switchTab('certificate-status')}
        >
          Certificate Status
        </button>
        <button
          type="button"
          class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'node-status' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
          onclick={() => switchTab('node-status')}
        >
          Node Status
        </button>
        <button
          type="button"
          class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'catalog-compilation' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
          onclick={() => switchTab('catalog-compilation')}
        >
          Catalog Compilation
        </button>
        <button
          type="button"
          class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'environments' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
          onclick={() => switchTab('environments')}
        >
          Environments
        </button>
        <button
          type="button"
          class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'puppet-reports' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
          onclick={() => switchTab('puppet-reports')}
        >
          Puppet Reports
        </button>
        <button
          type="button"
          class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'catalog' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
          onclick={() => switchTab('catalog')}
        >
          Catalog
        </button>
        <button
          type="button"
          class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'events' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
          onclick={() => switchTab('events')}
        >
          Events
        </button>
      </nav>
    </div>

    <!-- Tab Content -->
    <div class="tab-content">
      <!-- Overview Tab -->
      {#if activeTab === 'overview'}
        <div class="space-y-6">
          <!-- Node Metadata -->
          <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Configuration</h2>
              <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium {getSourceBadgeClass('bolt')}">
                {getSourceBadge('bolt')}
              </span>
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
          </div>

          <!-- Puppet Run Section -->
          <div>
            <PuppetRunInterface
              nodeId={nodeId}
              onExecutionComplete={fetchExecutions}
            />
          </div>

          <!-- Package Installation Section -->
          <div>
            <PackageInstallInterface
              nodeId={nodeId}
              onExecutionComplete={fetchExecutions}
            />
          </div>

          <!-- Command Execution Section -->
    <div class="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Execute Command</h2>

      <!-- Available Commands Display -->
      {#if commandWhitelist}
        <div class="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/50">
          <h3 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Available Commands
          </h3>
          {#if commandWhitelist.allowAll}
            <p class="text-sm text-gray-600 dark:text-gray-400">
              All commands are allowed
            </p>
          {:else if commandWhitelist.whitelist.length === 0}
            <p class="text-sm text-red-600 dark:text-red-400">
              No commands are allowed (whitelist is empty)
            </p>
          {:else}
            <div class="flex flex-wrap gap-2">
              {#each commandWhitelist.whitelist as cmd}
                <button
                  type="button"
                  onclick={() => commandInput = cmd}
                  class="inline-flex items-center rounded-md px-2.5 py-1 text-sm font-mono bg-white text-gray-700 border border-gray-300 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  {cmd}
                  {#if commandWhitelist.matchMode === 'prefix'}
                    <span class="ml-1 text-gray-400">*</span>
                  {/if}
                </button>
              {/each}
            </div>
            {#if commandWhitelist.matchMode === 'prefix'}
              <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
                * Prefix match mode: commands starting with these prefixes are allowed
              </p>
            {/if}
          {/if}
        </div>
      {/if}

      <form onsubmit={executeCommand} class="space-y-4">
        <div>
          <label for="command-input" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Command
          </label>
          <input
            id="command-input"
            type="text"
            bind:value={commandInput}
            placeholder="Enter command to execute..."
            class="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500"
            disabled={commandExecuting}
          />
        </div>

        <button
          type="submit"
          class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={commandExecuting || !commandInput.trim()}
        >
          {commandExecuting ? 'Executing...' : 'Execute'}
        </button>
      </form>

      {#if commandExecuting}
        <div class="mt-4 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <LoadingSpinner size="sm" />
          <span>Executing command...</span>
        </div>
      {/if}

      {#if commandError}
        <div class="mt-4">
          <ErrorAlert message="Command execution failed" details={commandError} />
        </div>
      {/if}

      {#if commandStream && expertMode.enabled && (commandStream.executionStatus === 'running' || commandStream.isConnecting)}
        <!-- Real-time output viewer for running executions in expert mode -->
        <div class="mt-4">
          <h3 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Real-time Output:</h3>
          <RealtimeOutputViewer stream={commandStream} autoConnect={false} />
        </div>
      {:else if commandResult}
        <!-- Static output for completed executions or when expert mode is disabled -->
        <div class="mt-4">
          <h3 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Result:</h3>
          <div class="mb-2">
            <StatusBadge status={commandResult.status} />
          </div>
          {#if commandResult.results.length > 0}
            {#each commandResult.results as result}
              {#if result.output}
                <CommandOutput
                  stdout={result.output.stdout}
                  stderr={result.output.stderr}
                  exitCode={result.output.exitCode}
                  boltCommand={commandResult.command}
                />
              {/if}
              {#if result.error}
                <div class="mt-2">
                  <ErrorAlert message="Execution error" details={result.error} />
                </div>
              {/if}
            {/each}
          {/if}
        </div>
      {/if}
    </div>

          <!-- Task Execution Section -->
          <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Execute Task</h2>

            <TaskRunInterface
              nodeId={nodeId}
              onExecutionComplete={fetchExecutions}
              initialTaskName={initialTaskName}
              initialParameters={initialTaskParameters}
            />
          </div>
        </div>
      {/if}

      <!-- Facts Tab -->
      {#if activeTab === 'facts'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div class="mb-4">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Facts</h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              View facts from multiple sources with timestamps and categorization
            </p>
          </div>

          <MultiSourceFactsViewer
            boltFacts={facts}
            boltLoading={factsLoading}
            boltError={factsError}
            onGatherBoltFacts={gatherFacts}
            puppetdbFacts={puppetdbFacts}
            puppetdbLoading={puppetdbFactsLoading}
            puppetdbError={puppetdbFactsError}
            puppetserverFacts={puppetserverFacts}
            puppetserverLoading={puppetserverFactsLoading}
            puppetserverError={puppetserverFactsError}
          />
        </div>
      {/if}

      <!-- Execution History Tab -->
      {#if activeTab === 'execution-history'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div class="mb-4 flex items-center gap-3">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Recent Executions</h2>
            <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium {getSourceBadgeClass('bolt')}">
              {getSourceBadge('bolt')}
            </span>
          </div>

          {#if executionsLoading}
            <div class="flex justify-center py-4">
              <LoadingSpinner message="Loading executions..." />
            </div>
          {:else if executionsError}
            <ErrorAlert message="Failed to load executions" details={executionsError} onRetry={fetchExecutions} />
          {:else if executions.length === 0}
            <p class="text-sm text-gray-500 dark:text-gray-400">
              No executions found for this node.
            </p>
          {:else}
            <div class="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead class="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th scope="col" class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Type
                    </th>
                    <th scope="col" class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Action
                    </th>
                    {#if expertMode.enabled}
                      <th scope="col" class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        Command
                      </th>
                    {/if}
                    <th scope="col" class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Status
                    </th>
                    <th scope="col" class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Started
                    </th>
                    <th scope="col" class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                  {#each executions as execution}
                    <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td class="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-white cursor-pointer" onclick={() => router.navigate('/executions')}>
                        {execution.type}
                      </td>
                      <td class="px-4 py-3 text-sm text-gray-900 dark:text-white cursor-pointer" onclick={() => router.navigate('/executions')}>
                        <div class="max-w-xs truncate">{execution.action}</div>
                      </td>
                      {#if expertMode.enabled}
                        <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 cursor-pointer" onclick={() => router.navigate('/executions')}>
                          {#if execution.command}
                            <div class="max-w-md truncate font-mono text-xs" title={execution.command}>
                              {execution.command}
                            </div>
                          {:else}
                            <span class="text-gray-400 dark:text-gray-600">-</span>
                          {/if}
                        </td>
                      {/if}
                      <td class="whitespace-nowrap px-4 py-3 text-sm cursor-pointer" onclick={() => router.navigate('/executions')}>
                        <StatusBadge status={execution.status} size="sm" />
                      </td>
                      <td class="whitespace-nowrap px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        <button
                          type="button"
                          class="text-left hover:text-blue-600 dark:hover:text-blue-400"
                          onclick={() => router.navigate('/executions')}
                        >
                          {formatTimestamp(execution.startedAt)}
                        </button>
                      </td>
                      <td class="whitespace-nowrap px-4 py-3 text-sm text-gray-600 dark:text-gray-400" onclick={(e) => e.stopPropagation()}>
                        <div class="flex items-center justify-end gap-2">
                          <ReExecutionButton execution={execution} currentNodeId={nodeId} size="sm" variant="icon" />
                          <button
                            type="button"
                            class="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                            onclick={(e) => {
                              e.stopPropagation();
                              router.navigate('/executions');
                            }}
                            title="View execution details"
                          >
                            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Puppet Reports Tab -->
      {#if activeTab === 'puppet-reports'}
        <div class="space-y-4">
          <!-- Source Badge Header -->
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Puppet Reports</h2>
              <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium {getSourceBadgeClass('puppetdb')}">
                {getSourceBadge('puppetdb')}
              </span>
            </div>
            {#if selectedReport}
              <button
                type="button"
                class="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                onclick={() => selectedReport = null}
              >
                ← Back to list
              </button>
            {/if}
          </div>

          {#if puppetReportsLoading}
            <div class="flex justify-center py-12">
              <LoadingSpinner size="lg" message="Loading Puppet reports..." />
            </div>
          {:else if puppetReportsError}
            <ErrorAlert
              message="Failed to load Puppet reports"
              details={puppetReportsError}
              onRetry={fetchPuppetReports}
            />
          {:else if puppetReports.length === 0}
            <div class="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
              <p class="text-gray-500 dark:text-gray-400">
                No Puppet reports found for this node.
              </p>
            </div>
          {:else if selectedReport}
            <!-- Detailed view of selected report -->
            <ReportViewer report={selectedReport} />
          {:else}
            <!-- Compact list view -->
            <PuppetReportsListView
              reports={puppetReports}
              onReportClick={(report) => selectedReport = report}
            />
          {/if}
        </div>
      {/if}

      <!-- Catalog Tab -->
      {#if activeTab === 'catalog'}
        <!-- Source Badge Header -->
        <div class="mb-4 flex items-center gap-3">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Catalog</h2>
          <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium {getSourceBadgeClass('puppetdb')}">
            {getSourceBadge('puppetdb')}
          </span>
        </div>

        {#if catalogLoading}
          <div class="flex justify-center py-12">
            <LoadingSpinner size="lg" message="Loading catalog..." />
          </div>
        {:else if catalogError}
          <ErrorAlert
            message="Failed to load catalog"
            details={catalogError}
            onRetry={fetchCatalog}
          />
        {:else if !catalog}
          <div class="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
            <p class="text-gray-500 dark:text-gray-400">
              No catalog found for this node.
            </p>
          </div>
        {:else}
          <CatalogViewer catalog={catalog} />
        {/if}
      {/if}

      <!-- Events Tab -->
      {#if activeTab === 'events'}
        <!-- Source Badge Header -->
        <div class="mb-4 flex items-center gap-3">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Events</h2>
          <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium {getSourceBadgeClass('puppetdb')}">
            {getSourceBadge('puppetdb')}
          </span>
        </div>

        {#if eventsLoading}
          <div class="flex justify-center py-12">
            <LoadingSpinner size="lg" message="Loading events..." />
          </div>
        {:else if eventsError}
          <ErrorAlert
            message="Failed to load events"
            details={eventsError}
            onRetry={fetchEvents}
          />
        {:else if events.length === 0}
          <div class="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-800">
            <p class="text-gray-500 dark:text-gray-400">
              No events found for this node.
            </p>
          </div>
        {:else}
          <EventsViewer events={events} />
        {/if}
      {/if}

      <!-- Certificate Status Tab -->
      {#if activeTab === 'certificate-status'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div class="mb-4 flex items-center gap-3">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Certificate Status</h2>
            <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
              Puppetserver
            </span>
          </div>

          {#if certificateLoading}
            <div class="flex justify-center py-12">
              <LoadingSpinner size="lg" message="Loading certificate status..." />
            </div>
          {:else if certificateError}
            <ErrorAlert
              message="Failed to load certificate status"
              details={certificateError}
              onRetry={fetchCertificateStatus}
            />
          {:else if !certificateStatus}
            <div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-900/50">
              <p class="text-gray-500 dark:text-gray-400">
                No certificate found for this node.
              </p>
            </div>
          {:else}
            <div class="space-y-6">
              <!-- Certificate Details -->
              <div>
                <h3 class="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Certificate Details</h3>
                <dl class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Certname</dt>
                    <dd class="mt-1 text-sm text-gray-900 dark:text-white">{certificateStatus.certname}</dd>
                  </div>
                  <div>
                    <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Status</dt>
                    <dd class="mt-1">
                      <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium {
                        certificateStatus.status === 'signed' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' :
                        certificateStatus.status === 'requested' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                        'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
                      }">
                        {certificateStatus.status}
                      </span>
                    </dd>
                  </div>
                  {#if certificateStatus.fingerprint}
                    <div class="sm:col-span-2">
                      <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Fingerprint</dt>
                      <dd class="mt-1 font-mono text-xs text-gray-900 dark:text-white break-all">{certificateStatus.fingerprint}</dd>
                    </div>
                  {/if}
                  {#if certificateStatus.not_before}
                    <div>
                      <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Valid From</dt>
                      <dd class="mt-1 text-sm text-gray-900 dark:text-white">{formatTimestamp(certificateStatus.not_before)}</dd>
                    </div>
                  {/if}
                  {#if certificateStatus.not_after}
                    <div>
                      <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">Valid Until</dt>
                      <dd class="mt-1 text-sm text-gray-900 dark:text-white">{formatTimestamp(certificateStatus.not_after)}</dd>
                    </div>
                  {/if}
                  {#if certificateStatus.dns_alt_names && certificateStatus.dns_alt_names.length > 0}
                    <div class="sm:col-span-2">
                      <dt class="text-sm font-medium text-gray-500 dark:text-gray-400">DNS Alt Names</dt>
                      <dd class="mt-1 text-sm text-gray-900 dark:text-white">
                        {certificateStatus.dns_alt_names.join(', ')}
                      </dd>
                    </div>
                  {/if}
                </dl>
              </div>

              <!-- Certificate Operations -->
              <div class="flex gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                {#if certificateStatus.status === 'requested'}
                  <button
                    type="button"
                    class="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                    onclick={signCertificate}
                  >
                    Sign Certificate
                  </button>
                {/if}
                {#if certificateStatus.status === 'signed'}
                  <button
                    type="button"
                    class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                    onclick={revokeCertificate}
                  >
                    Revoke Certificate
                  </button>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Node Status Tab -->
      {#if activeTab === 'node-status'}
        <NodeStatus
          status={nodeStatus}
          loading={nodeStatusLoading}
          error={nodeStatusError}
          onRefresh={fetchNodeStatus}
        />
      {/if}

      <!-- Catalog Compilation Tab -->
      {#if activeTab === 'catalog-compilation'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div class="mb-4 flex items-center gap-3">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Catalog Compilation</h2>
            <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
              Puppetserver
            </span>
          </div>

          <CatalogComparison certname={nodeId} />
        </div>
      {/if}

      <!-- Environments Tab -->
      {#if activeTab === 'environments'}
        <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div class="mb-4 flex items-center gap-3">
            <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Environments</h2>
            <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
              Puppetserver
            </span>
          </div>

          {#if environmentsLoading}
            <div class="flex justify-center py-12">
              <LoadingSpinner size="lg" message="Loading environments..." />
            </div>
          {:else if environmentsError}
            <ErrorAlert
              message="Failed to load environments"
              details={environmentsError}
              onRetry={fetchEnvironments}
            />
          {:else if environments.length === 0}
            <div class="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-900/50">
              <p class="text-gray-500 dark:text-gray-400">
                No environments found.
              </p>
            </div>
          {:else}
            <div class="space-y-4">
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Available Puppet environments for this node:
              </p>
              <EnvironmentSelector
                environments={environments}
                showDeployButton={true}
              />
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>
