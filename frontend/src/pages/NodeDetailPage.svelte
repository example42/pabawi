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
  import ManagedResourcesViewer from '../components/ManagedResourcesViewer.svelte';
  import ReExecutionButton from '../components/ReExecutionButton.svelte';
  import NodeStatus from '../components/NodeStatus.svelte';
  import PuppetRunChart from '../components/PuppetRunChart.svelte';
  import CatalogComparison from '../components/CatalogComparison.svelte';
  import NodeHieraTab from '../components/NodeHieraTab.svelte';
  import IntegrationBadge from '../components/IntegrationBadge.svelte';
  import ExpertModeDebugPanel from '../components/ExpertModeDebugPanel.svelte';
  import ExecutionList from '../components/ExecutionList.svelte';
  import { get, post } from '../lib/api';
  import { showError, showSuccess, showInfo } from '../lib/toast.svelte';
  import { expertMode } from '../lib/expertMode.svelte';
  import { useExecutionStream, type ExecutionStream } from '../lib/executionStream.svelte';
  import type { DebugInfo, LabeledDebugInfo } from '../lib/api';

  // Dynamic page title based on node name
  const pageTitle = $derived(node ? `Pabawi - ${node.name}` : 'Pabawi - Node Details');

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
  type TabId = 'overview' | 'facts' | 'actions' | 'puppet' | 'hiera';
  type PuppetSubTabId = 'node-status' | 'catalog-compilation' | 'puppet-reports' | 'catalog' | 'events' | 'managed-resources';

  // State
  let node = $state<Node | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  // Tab state with URL sync
  let activeTab = $state<TabId>('overview');
  let activePuppetSubTab = $state<PuppetSubTabId>('node-status');

  // Track which tabs have been loaded (for lazy loading)
  let loadedTabs = $state<Set<TabId>>(new Set(['overview']));
  let loadedPuppetSubTabs = $state<Set<PuppetSubTabId>>(new Set());

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
  let selectedReportLoading = $state(false);
  let selectedReportError = $state<string | null>(null);

  let catalog = $state<any | null>(null);
  let catalogLoading = $state(false);
  let catalogError = $state<string | null>(null);

  let events = $state<any[]>([]);
  let eventsLoading = $state(false);
  let eventsError = $state<string | null>(null);
  let eventsAbortController = $state<AbortController | null>(null);

  let managedResources = $state<Record<string, any[]> | null>(null);
  let managedResourcesLoading = $state(false);
  let managedResourcesError = $state<string | null>(null);

  // Puppetserver data state (for lazy loading)
  let nodeStatus = $state<any | null>(null);
  let nodeStatusLoading = $state(false);
  let nodeStatusError = $state<string | null>(null);

  // Puppet run history state
  interface RunHistoryData {
    date: string;
    success: number;
    failed: number;
    changed: number;
    unchanged: number;
  }

  interface NodeRunHistory {
    nodeId: string;
    history: RunHistoryData[];
    summary: {
      totalRuns: number;
      successRate: number;
      avgDuration: number;
      lastRun: string;
    };
  }

  let runHistory = $state<NodeRunHistory | null>(null);
  let runHistoryLoading = $state(false);
  let runHistoryError = $state<string | null>(null);
  let runHistoryLastUpdate = $state<Date | null>(null);

  // Puppetserver facts removed per task 16 requirements
  // let puppetserverFacts = $state<any | null>(null);
  // let puppetserverFactsLoading = $state(false);
  // let puppetserverFactsError = $state<string | null>(null);

  let puppetdbFacts = $state<any | null>(null);
  let puppetdbFactsLoading = $state(false);
  let puppetdbFactsError = $state<string | null>(null);

  let environments = $state<any[]>([]);
  let environmentsLoading = $state(false);
  let environmentsError = $state<string | null>(null);

  // Cache for loaded data
  let dataCache = $state<Record<TabId, any>>({});

  // Debug info state for expert mode - support multiple debug blocks
  let debugInfoBlocks = $state<LabeledDebugInfo[]>([]);

  // Sorted debug blocks in chronological order (newest first)
  const sortedDebugInfoBlocks = $derived.by(() => {
    return [...debugInfoBlocks].sort((a, b) => {
      const timeA = new Date(a.debugInfo.timestamp).getTime();
      const timeB = new Date(b.debugInfo.timestamp).getTime();
      return timeB - timeA; // Newest first
    });
  });

  // Callback to receive debug info from API calls
  function handleDebugInfo(label: string, info: DebugInfo | null): void {
    if (info) {
      // Add or update debug info for this label
      const existingIndex = debugInfoBlocks.findIndex(block => block.label === label);
      if (existingIndex >= 0) {
        // Update existing block
        debugInfoBlocks[existingIndex] = { label, debugInfo: info };
      } else {
        // Add new block
        debugInfoBlocks = [...debugInfoBlocks, { label, debugInfo: info }];
      }
    } else {
      // Remove debug info for this label
      debugInfoBlocks = debugInfoBlocks.filter(block => block.label !== label);
    }
  }

  // Fetch node details
  async function fetchNode(): Promise<void> {
    loading = true;
    error = null;

    try {
      const data = await get<{ node: Node; _debug?: DebugInfo }>(`/api/nodes/${nodeId}`, {
        maxRetries: 2,
      });

      node = data.node;

      // Store debug info if present
      if (data._debug) {
        handleDebugInfo('Node Details', data._debug);
      }
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
      const data = await get<{ executions: ExecutionResult[]; _debug?: DebugInfo }>(
        `/api/executions?targetNode=${nodeId}&pageSize=10`,
        { maxRetries: 2 }
      );

      executions = data.executions || [];

      // Store debug info if present
      if (data._debug) {
        handleDebugInfo('Execution History', data._debug);
      }
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

  // Lazy load Puppet Reports (for overview - limited to 5)
  async function fetchPuppetReports(): Promise<void> {
    // Check cache first
    if (dataCache['puppet-reports']) {
      puppetReports = dataCache['puppet-reports'];
      return;
    }

    puppetReportsLoading = true;
    puppetReportsError = null;

    try {
      const data = await get<{ reports: any[]; _debug?: DebugInfo }>(
        `/api/integrations/puppetdb/nodes/${nodeId}/reports?limit=5`,
        { maxRetries: 2 }
      );

      puppetReports = data.reports || [];
      dataCache['puppet-reports'] = puppetReports;

      // Store debug info if present
      if (data._debug) {
        handleDebugInfo('Puppet Reports (Overview)', data._debug);
      }
    } catch (err) {
      puppetReportsError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching Puppet reports:', err);
      showError('Failed to load Puppet reports', puppetReportsError);
    } finally {
      puppetReportsLoading = false;
    }
  }

  // Fetch full report details including events and logs
  async function fetchReportDetails(report: any): Promise<void> {
    selectedReportLoading = true;
    selectedReportError = null;
    selectedReport = null;

    try {
      const data = await get<{ report: any; _debug?: DebugInfo }>(
        `/api/integrations/puppetdb/nodes/${nodeId}/reports/${report.hash}`,
        { maxRetries: 2 }
      );

      selectedReport = data.report;

      // Store debug info if present
      if (data._debug) {
        handleDebugInfo('Report Details', data._debug);
      }
    } catch (err) {
      selectedReportError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching report details:', err);
      showError('Failed to load report details', selectedReportError);
    } finally {
      selectedReportLoading = false;
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
      // Fetch both catalog metadata and resources in parallel
      const [catalogData, resourcesData] = await Promise.all([
        get<{ catalog: any; _debug?: DebugInfo }>(
          `/api/integrations/puppetdb/nodes/${nodeId}/catalog`,
          { maxRetries: 2 }
        ),
        get<{ resources: Record<string, any[]>; _debug?: DebugInfo }>(
          `/api/integrations/puppetdb/nodes/${nodeId}/resources`,
          { maxRetries: 2 }
        )
      ]);

      // Flatten resources from grouped format to array
      const resourcesArray: any[] = [];
      if (resourcesData.resources) {
        for (const typeResources of Object.values(resourcesData.resources)) {
          resourcesArray.push(...typeResources);
        }
      }

      // Merge catalog metadata with resources
      catalog = {
        ...catalogData.catalog,
        resources: resourcesArray
      };
      dataCache['catalog'] = catalog;

      // Store debug info if present (prefer catalog debug info)
      if (catalogData._debug) {
        handleDebugInfo('Catalog', catalogData._debug);
      }
      if (resourcesData._debug) {
        handleDebugInfo('Catalog Resources', resourcesData._debug);
      }
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

    // Cancel any existing request
    if (eventsAbortController) {
      eventsAbortController.abort();
    }

    // Create new abort controller for this request
    eventsAbortController = new AbortController();
    const currentController = eventsAbortController;

    eventsLoading = true;
    eventsError = null;

    try {
      // Add timeout to prevent hanging (requirement 10.4)
      // Default limit of 100 events is applied by backend (requirement 10.3)
      const data = await get<{ events: any[]; _debug?: DebugInfo }>(
        `/api/integrations/puppetdb/nodes/${nodeId}/events?limit=100`,
        {
          maxRetries: 1, // Reduce retries for events to fail faster
          timeout: 30000, // 30 second timeout (requirement 10.4)
          signal: currentController.signal // Allow cancellation
        }
      );

      // Check if this request was cancelled
      if (currentController.signal.aborted) {
        return;
      }

      events = data.events || [];
      dataCache['events'] = events;

      // Store debug info if present
      if (data._debug) {
        handleDebugInfo('Events', data._debug);
      }
    } catch (err) {
      // Ignore abort errors (user cancelled)
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      eventsError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching events:', err);

      // Provide more specific error message for timeout
      if (err instanceof Error && err.message.includes('timeout')) {
        eventsError = 'Request timed out after 30 seconds. Try filtering events to reduce the dataset size.';
      }

      showError('Failed to load events', eventsError);
    } finally {
      // Only clear loading if this is still the current request
      if (currentController === eventsAbortController) {
        eventsLoading = false;
        eventsAbortController = null;
      }
    }
  }

  // Cancel events loading
  function cancelEventsLoading(): void {
    if (eventsAbortController) {
      eventsAbortController.abort();
      eventsAbortController = null;
      eventsLoading = false;
      showInfo('Events loading cancelled');
    }
  }

  // Lazy load Managed Resources
  async function fetchManagedResources(): Promise<void> {
    // Check cache first
    if (dataCache['managed-resources']) {
      managedResources = dataCache['managed-resources'];
      return;
    }

    managedResourcesLoading = true;
    managedResourcesError = null;

    try {
      const data = await get<{ resources: Record<string, any[]>; _debug?: DebugInfo }>(
        `/api/integrations/puppetdb/nodes/${nodeId}/resources`,
        { maxRetries: 2 }
      );

      managedResources = data.resources || {};
      dataCache['managed-resources'] = managedResources;

      // Store debug info if present
      if (data._debug) {
        handleDebugInfo('Managed Resources', data._debug);
      }
    } catch (err) {
      managedResourcesError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching managed resources:', err);
      // Don't show error toast - display inline error instead
    } finally {
      managedResourcesLoading = false;
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
      const data = await get<{ status: any; _debug?: DebugInfo }>(
        `/api/integrations/puppetserver/nodes/${nodeId}/status`,
        { maxRetries: 2 }
      );

      nodeStatus = data.status;
      dataCache['node-status'] = nodeStatus;

      // Store debug info if present
      if (data._debug) {
        handleDebugInfo('Node Status', data._debug);
      }
    } catch (err) {
      nodeStatusError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching node status:', err);
      // Don't show error toast - display inline error instead
    } finally {
      nodeStatusLoading = false;
    }
  }

  // Lazy load Puppet Run History
  async function fetchRunHistory(days = 7): Promise<void> {
    // Check cache first
    const cacheKey = `run-history-${days}`;
    if (dataCache[cacheKey]) {
      runHistory = dataCache[cacheKey];
      return;
    }

    runHistoryLoading = true;
    runHistoryError = null;

    try {
      const data = await get<NodeRunHistory & { _debug?: DebugInfo }>(
        `/api/puppet/nodes/${nodeId}/history?days=${days}`,
        { maxRetries: 2 }
      );

      runHistory = {
        nodeId: data.nodeId,
        history: data.history,
        summary: data.summary,
      };
      dataCache[cacheKey] = runHistory;
      runHistoryLastUpdate = new Date();

      // Store debug info if present
      if (data._debug) {
        handleDebugInfo('Run History', data._debug);
      }
    } catch (err) {
      runHistoryError = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Error fetching run history:', err);
      // Don't show error toast - display inline error instead
    } finally {
      runHistoryLoading = false;
    }
  }

  // Puppetserver facts removed per task 16 requirements
  // async function fetchPuppetserverFacts(): Promise<void> {
  //   // Check cache first
  //   if (dataCache['puppetserver-facts']) {
  //     puppetserverFacts = dataCache['puppetserver-facts'];
  //     return;
  //   }

  //   puppetserverFactsLoading = true;
  //   puppetserverFactsError = null;

  //   try {
  //     const data = await get<{ facts: any }>(
  //       `/api/integrations/puppetserver/nodes/${nodeId}/facts`,
  //       { maxRetries: 2 }
  //     );

  //     puppetserverFacts = data.facts;
  //     dataCache['puppetserver-facts'] = puppetserverFacts;
  //   } catch (err) {
  //     puppetserverFactsError = err instanceof Error ? err.message : 'An unknown error occurred';
  //     console.error('Error fetching Puppetserver facts:', err);
  //     // Don't show error toast - display inline error instead
  //   } finally {
  //     puppetserverFactsLoading = false;
  //   }
  // }

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
      const data = await get<{ facts: any; _debug?: DebugInfo }>(
        `/api/integrations/puppetdb/nodes/${nodeId}/facts`,
        { maxRetries: 2 }
      );

      puppetdbFacts = data.facts;
      dataCache['puppetdb-facts'] = puppetdbFacts;

      // Store debug info if present
      if (data._debug) {
        handleDebugInfo('PuppetDB Facts', data._debug);
      }
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

  // Format timestamp
  function formatTimestamp(timestamp: string): string {
    return new Date(timestamp).toLocaleString();
  }

  // Get duration between start and end time
  function getDuration(startTime: string, endTime: string): string {
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    const seconds = Math.round((end - start) / 1000);
    return seconds > 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
  }

  // Get status badge status based on report status and config retrieval time
  function getStatusBadgeStatus(status: string, configRetrievalTime?: number): 'success' | 'failed' | 'changed' {
    if (configRetrievalTime === 0) return 'failed';

    if (status === 'failed') return 'failed';
    if (status === 'changed') return 'changed';
    return 'success';
  }

  // Format compilation time
  function formatCompilationTime(configRetrievalTime?: number): string {
    if (configRetrievalTime === undefined || configRetrievalTime === null) {
      return 'N/A';
    }

    if (configRetrievalTime === 0) {
      return 'Catalog Failure';
    }

    return `${configRetrievalTime.toFixed(2)}s`;
  }

  // Get unchanged resources count
  function getUnchanged(metrics: any): number {
    return metrics.resources.total - metrics.resources.out_of_sync;
  }

  // Get intentional changes - should be 0 if calculation would be negative
  function getIntentionalChanges(metrics: any): number {
    const intentional = metrics.resources.changed - (metrics.resources.corrective_change || 0);
    return Math.max(0, intentional);
  }

  // Navigate back to inventory
  function navigateBack(): void {
    router.navigate('/');
  }

  // Switch tab and update URL
  function switchTab(tabId: TabId): void {
    activeTab = tabId;
    debugInfoBlocks = []; // Clear debug info when switching tabs

    // Update URL with tab parameter (preserves browser history)
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tabId);
    url.searchParams.delete('subtab'); // Clear subtab when switching main tabs
    window.history.pushState({}, '', url.toString());

    // Lazy load data for the tab if not already loaded
    if (!loadedTabs.has(tabId)) {
      loadedTabs.add(tabId);
      loadTabData(tabId);
    }

    // If switching to puppet tab, load the first sub-tab
    if (tabId === 'puppet' && !loadedPuppetSubTabs.has(activePuppetSubTab)) {
      loadedPuppetSubTabs.add(activePuppetSubTab);
      loadPuppetSubTabData(activePuppetSubTab);
    }
  }

  // Switch puppet sub-tab and update URL
  function switchPuppetSubTab(subTabId: PuppetSubTabId): void {
    activePuppetSubTab = subTabId;
    debugInfoBlocks = []; // Clear debug info when switching sub-tabs

    // Update URL with subtab parameter
    const url = new URL(window.location.href);
    url.searchParams.set('subtab', subTabId);
    window.history.pushState({}, '', url.toString());

    // Lazy load data for the sub-tab if not already loaded
    if (!loadedPuppetSubTabs.has(subTabId)) {
      loadedPuppetSubTabs.add(subTabId);
      loadPuppetSubTabData(subTabId);
    }
  }

  // Load data for a specific tab
  async function loadTabData(tabId: TabId): Promise<void> {
    switch (tabId) {
      case 'overview':
        // Load PuppetDB facts for OS/IP info display (if not already loaded)
        if (!puppetdbFacts && !puppetdbFactsLoading && !puppetdbFactsError) {
          await fetchPuppetDBFacts();
        }
        // Load latest puppet reports for overview (if not already loaded)
        if (puppetReports.length === 0 && !puppetReportsLoading && !puppetReportsError) {
          await fetchPuppetReports();
        }
        break;
      case 'facts':
        // Load facts from PuppetDB only (Puppetserver facts removed per task 16)
        await fetchPuppetDBFacts();
        break;
      case 'actions':
        // Execution history is loaded on demand in the actions tab
        if (executions.length === 0) {
          await fetchExecutions();
        }
        break;
      case 'puppet':
        // Puppet sub-tabs are loaded on demand
        break;
    }
  }

  // Load data for a specific puppet sub-tab
  async function loadPuppetSubTabData(subTabId: PuppetSubTabId): Promise<void> {
    switch (subTabId) {
      case 'node-status':
        await fetchNodeStatus();
        await fetchRunHistory(); // Also load run history for visualization
        break;
      case 'catalog-compilation':
        await fetchEnvironments();
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
      case 'managed-resources':
        await fetchManagedResources();
        break;
    }
  }

  // Read tab from URL on mount
  function readTabFromURL(): void {
    const url = new URL(window.location.href);
    const tabParam = url.searchParams.get('tab') as TabId | null;
    const subTabParam = url.searchParams.get('subtab') as PuppetSubTabId | null;

    // Set main tab
    if (tabParam && ['overview', 'facts', 'actions', 'puppet', 'hiera'].includes(tabParam)) {
      activeTab = tabParam;

      // Load data for the tab if not already loaded
      if (!loadedTabs.has(tabParam)) {
        loadedTabs.add(tabParam);
        loadTabData(tabParam);
      }
    }

    // Set puppet sub-tab if on puppet tab
    if (activeTab === 'puppet' && subTabParam && ['node-status', 'catalog-compilation', 'puppet-reports', 'catalog', 'events', 'managed-resources'].includes(subTabParam)) {
      activePuppetSubTab = subTabParam;

      // Load data for the sub-tab if not already loaded
      if (!loadedPuppetSubTabs.has(subTabParam)) {
        loadedPuppetSubTabs.add(subTabParam);
        loadPuppetSubTabData(subTabParam);
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

  // Extract general info from facts
  function extractGeneralInfo(): {
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
  } {
    const info: {
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
    } = {};

    // Try to get info from PuppetDB facts first (most reliable)
    if (puppetdbFacts?.facts) {
      const facts = puppetdbFacts.facts;

      // OS information
      if (facts.os?.name && facts.os?.release?.full) {
        info.os = `${facts.os.name} ${facts.os.release.full}`;
      } else if (facts.operatingsystem && facts.operatingsystemrelease) {
        info.os = `${facts.operatingsystem} ${facts.operatingsystemrelease}`;
      } else if (facts.osfamily) {
        info.os = facts.osfamily;
      }

      // IP address - try multiple fact names
      info.ip = facts.ipaddress || facts.networking?.ip || facts.ipaddress_eth0 || facts.ipaddress_ens0;

      // Hostname
      info.hostname = facts.hostname || facts.fqdn;

      // Kernel
      info.kernel = facts.kernel || facts.kernelversion;

      // Architecture
      info.architecture = facts.architecture || facts.hardwaremodel;

      // Puppet version
      info.puppetVersion = facts.aio_agent_version;

      // Memory
      info.memory = facts.memory?.system?.total;

      // CPU count
      info.cpuCount = facts.processors?.count;

      // Uptime
      info.uptime = facts.system_uptime?.uptime;

      // Disks - get first level keys from disks fact
      if (facts.disks && typeof facts.disks === 'object') {
        info.disks = Object.keys(facts.disks);
      }
    }

    // Fallback to Bolt facts if PuppetDB facts not available
    if (!info.os && facts?.facts) {
      const boltFacts = facts.facts;

      if (boltFacts.os?.name && boltFacts.os?.release?.full) {
        info.os = `${boltFacts.os.name} ${boltFacts.os.release.full}`;
      } else if (boltFacts.operatingsystem && boltFacts.operatingsystemrelease) {
        info.os = `${boltFacts.operatingsystem} ${boltFacts.operatingsystemrelease}`;
      }

      info.ip = info.ip || boltFacts.ipaddress || boltFacts.networking?.ip;
      info.hostname = info.hostname || boltFacts.hostname || boltFacts.fqdn;
      info.kernel = info.kernel || boltFacts.kernel;
      info.architecture = info.architecture || boltFacts.architecture;
      info.puppetVersion = info.puppetVersion || boltFacts.aio_agent_version;
      info.memory = info.memory || boltFacts.memory?.system?.total;
      info.cpuCount = info.cpuCount || boltFacts.processors?.count;
      info.uptime = info.uptime || boltFacts.system_uptime?.uptime;

      if (!info.disks && boltFacts.disks && typeof boltFacts.disks === 'object') {
        info.disks = Object.keys(boltFacts.disks);
      }
    }

    return info;
  }

  // Derived general info
  let generalInfo = $derived(extractGeneralInfo());

  // Watch for URL query parameter changes (for re-execution and tab switching)
  $effect(() => {
    // Access router.currentQuery to make this effect reactive to URL changes
    const _ = router.query;

    // When URL changes, read the tab and check for re-execution params
    // This handles both initial load and navigation to the same node with different params
    readTabFromURL();
    checkReExecutionParams();
  });

  // On mount
  onMount(() => {
    debugInfoBlocks = []; // Clear debug info blocks on mount
    fetchNode();
    fetchExecutions();
    fetchCommandWhitelist();

    // Load overview tab data if it's the active tab
    if (activeTab === 'overview') {
      loadTabData('overview');
    }

    // Listen for browser back/forward
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  });
</script>

<svelte:head>
  <title>{pageTitle}</title>
</svelte:head>

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
          class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'actions' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
          onclick={() => switchTab('actions')}
        >
          Actions
        </button>
        <button
          type="button"
          class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'puppet' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
          onclick={() => switchTab('puppet')}
        >
          Puppet
        </button>
        <button
          type="button"
          class="whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium {activeTab === 'hiera' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
          onclick={() => switchTab('hiera')}
        >
          Hiera
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
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">General Information</h2>
              <div class="flex items-center gap-2">
                <IntegrationBadge integration="bolt" variant="badge" size="sm" />
                {#if generalInfo.os || generalInfo.ip}
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
            {#if !generalInfo.os && !generalInfo.ip && !puppetdbFactsLoading}
              <div class="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-900/20">
                <div class="flex items-start gap-2">
                  <svg class="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div class="flex-1">
                    <p class="text-sm text-blue-800 dark:text-blue-400">
                      Additional system information (OS, IP) will appear here once facts are gathered. Visit the <button type="button" class="font-medium underline hover:no-underline" onclick={() => switchTab('facts')}>Facts tab</button> to gather facts.
                    </p>
                  </div>
                </div>
              </div>
            {/if}
          </div>

          <!-- Latest Puppet Runs (if PuppetDB active) -->
          <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Latest Puppet Runs</h2>
              <IntegrationBadge integration="puppetdb" variant="badge" size="sm" />
            </div>
            {#if !puppetReports}
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Loading Puppet runs... <button type="button" class="text-blue-600 hover:text-blue-700 dark:text-blue-400" onclick={async () => { await fetchPuppetReports(); }}>Load now</button>
              </p>
            {:else if puppetReports.length === 0}
              <p class="text-sm text-gray-500 dark:text-gray-400">
                No Puppet runs found for this node.
              </p>
            {:else}
              <div class="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 overflow-hidden">
                <div class="overflow-x-auto">
                  <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead class="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        <th scope="col" class="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Start Time
                        </th>
                        <th scope="col" class="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Duration
                        </th>
                        <th scope="col" class="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Environment
                        </th>
                        <th scope="col" class="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Total
                        </th>
                        <th scope="col" class="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Corrective
                        </th>
                        <th scope="col" class="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Intentional
                        </th>
                        <th scope="col" class="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Unchanged
                        </th>
                        <th scope="col" class="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Failed
                        </th>
                        <th scope="col" class="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Skipped
                        </th>
                        <th scope="col" class="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Noop
                        </th>
                        <th scope="col" class="px-2 py-2 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Compile Time
                        </th>
                        <th scope="col" class="px-2 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                      {#each puppetReports.slice(0, 5) as report}
                        <tr class="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td class="whitespace-nowrap px-2 py-2 text-sm text-gray-900 dark:text-white">
                            {formatTimestamp(report.start_time)}
                          </td>
                          <td class="whitespace-nowrap px-2 py-2 text-sm text-gray-600 dark:text-gray-400">
                            {getDuration(report.start_time, report.end_time)}
                          </td>
                          <td class="whitespace-nowrap px-2 py-2 text-sm text-gray-900 dark:text-white">
                            <div class="flex items-center gap-2">
                              {report.environment}
                              {#if report.noop}
                                <span class="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900/20 dark:text-purple-400">
                                  No-op
                                </span>
                              {/if}
                            </div>
                          </td>
                          <td class="whitespace-nowrap px-2 py-2 text-right text-sm text-gray-900 dark:text-white">
                            {report.metrics.resources.total}
                          </td>
                          <td class="whitespace-nowrap px-2 py-2 text-right text-sm text-yellow-700 dark:text-yellow-400">
                            {report.metrics.resources.corrective_change || 0}
                          </td>
                          <td class="whitespace-nowrap px-2 py-2 text-right text-sm text-blue-700 dark:text-blue-400">
                            {getIntentionalChanges(report.metrics)}
                          </td>
                          <td class="whitespace-nowrap px-2 py-2 text-right text-sm text-gray-600 dark:text-gray-400">
                            {getUnchanged(report.metrics)}
                          </td>
                          <td class="whitespace-nowrap px-2 py-2 text-right text-sm text-red-700 dark:text-red-400">
                            {report.metrics.resources.failed}
                          </td>
                          <td class="whitespace-nowrap px-2 py-2 text-right text-sm text-gray-600 dark:text-gray-400">
                            {report.metrics.resources.skipped}
                          </td>
                          <td class="whitespace-nowrap px-2 py-2 text-right text-sm text-purple-700 dark:text-purple-400">
                            {report.metrics.events?.noop || 0}
                          </td>
                          <td class="whitespace-nowrap px-2 py-2 text-right text-sm text-gray-900 dark:text-white">
                            {formatCompilationTime(report.metrics.time?.config_retrieval)}
                          </td>
                          <td class="whitespace-nowrap px-2 py-2 text-sm">
                            <StatusBadge status={getStatusBadgeStatus(report.status, report.metrics.time?.config_retrieval)} size="sm" />
                          </td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              </div>
              {#if puppetReports.length >= 5}
                <div class="mt-4">
                  <button
                    type="button"
                    class="w-full text-center text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    onclick={() => {
                      switchTab('puppet');
                      switchPuppetSubTab('puppet-reports');
                    }}
                  >
                    View all runs →
                  </button>
                </div>
              {/if}
            {/if}
          </div>

          <!-- Latest Executions -->
          <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div class="mb-4 flex items-center justify-between">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Latest Executions</h2>
              <IntegrationBadge integration="bolt" variant="badge" size="sm" />
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
              <ExecutionList
                executions={executions.slice(0, 5)}
                currentNodeId={nodeId}
                onExecutionClick={(execution) => router.navigate(`/executions?id=${execution.id}`)}
                showTargets={false}
              />
              {#if executions.length > 5}
                <button
                  type="button"
                  class="mt-4 w-full text-center text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  onclick={() => switchTab('actions')}
                >
                  View all executions →
                </button>
              {/if}
            {/if}
          </div>
        </div>
      {/if}

      <!-- Facts Tab -->
      {#if activeTab === 'facts'}
        <div class="space-y-6">
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
            />
          </div>
        </div>
      {/if}

      <!-- Actions Tab -->
      {#if activeTab === 'actions'}
        <div class="space-y-6">
          <!-- Package Installation Section -->
          <div>
            <PackageInstallInterface
              nodeId={nodeId}
              onExecutionComplete={fetchExecutions}
            />
          </div>

          <!-- Command Execution Section -->
    <div class="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div class="mb-4 flex items-center gap-3">
        <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Execute Command</h2>
        <IntegrationBadge integration="bolt" variant="badge" size="sm" />
      </div>

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
        <div class="mt-4 space-y-3">
          <h3 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">Result:</h3>
          <div class="mb-2">
            <StatusBadge status={commandResult.status} />
          </div>
          {#if commandResult.results.length > 0}
            {#each commandResult.results as result}
              {#if result.error}
                <div class="mt-2">
                  <ErrorAlert message="Execution error" details={result.error} />
                </div>
              {/if}
              {#if result.output}
                <CommandOutput
                  stdout={result.output.stdout}
                  stderr={result.output.stderr}
                  exitCode={result.output.exitCode}
                  boltCommand={commandResult.command}
                />
              {/if}
            {/each}
          {/if}
        </div>
      {/if}
    </div>

          <!-- Task Execution Section -->
          <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div class="mb-4 flex items-center gap-3">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Execute Task</h2>
              <IntegrationBadge integration="bolt" variant="badge" size="sm" />
            </div>

            <TaskRunInterface
              nodeId={nodeId}
              onExecutionComplete={fetchExecutions}
              initialTaskName={initialTaskName}
              initialParameters={initialTaskParameters}
            />
          </div>

          <!-- Execution History Section -->
          <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div class="mb-4 flex items-center gap-3">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Execution History</h2>
              <IntegrationBadge integration="bolt" variant="badge" size="sm" />
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
              <ExecutionList
                {executions}
                currentNodeId={nodeId}
                onExecutionClick={(execution) => router.navigate(`/executions?id=${execution.id}`)}
                showTargets={false}
              />
            {/if}
          </div>
        </div>
      {/if}

      <!-- Puppet Tab -->
      {#if activeTab === 'puppet'}
        <div class="space-y-6">
          <!-- Puppet Sub-Tab Navigation -->
          <div class="border-b border-gray-200 dark:border-gray-700">
            <nav class="-mb-px flex space-x-8 overflow-x-auto" aria-label="Puppet Sub-Tabs">
              <button
                type="button"
                class="whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium {activePuppetSubTab === 'node-status' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
                onclick={() => switchPuppetSubTab('node-status')}
              >
                Node Status
              </button>
              <button
                type="button"
                class="whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium {activePuppetSubTab === 'catalog-compilation' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
                onclick={() => switchPuppetSubTab('catalog-compilation')}
              >
                Catalog Diff
              </button>
              <button
                type="button"
                class="whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium {activePuppetSubTab === 'puppet-reports' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
                onclick={() => switchPuppetSubTab('puppet-reports')}
              >
                Reports
              </button>
              <button
                type="button"
                class="whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium {activePuppetSubTab === 'catalog' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
                onclick={() => switchPuppetSubTab('catalog')}
              >
                Catalog
              </button>
              <button
                type="button"
                class="whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium {activePuppetSubTab === 'events' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
                onclick={() => switchPuppetSubTab('events')}
              >
                Events
              </button>
              <button
                type="button"
                class="whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium {activePuppetSubTab === 'managed-resources' ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'}"
                onclick={() => switchPuppetSubTab('managed-resources')}
              >
                Managed Resources
              </button>
            </nav>
          </div>

          <!-- Catalog Sub-Tab -->
          {#if activePuppetSubTab === 'catalog'}
            <div class="space-y-6">
              <!-- Source Badge Header -->
              <div class="mb-4 flex items-center gap-3">
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Catalog</h2>
                <IntegrationBadge integration="puppetdb" variant="badge" size="sm" />
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
            </div>
          {/if}

          <!-- Events Sub-Tab -->
          {#if activePuppetSubTab === 'events'}
            <div class="space-y-6">
              <!-- Source Badge Header -->
              <div class="mb-4 flex items-center gap-3">
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Events</h2>
                <IntegrationBadge integration="puppetdb" variant="badge" size="sm" />
              </div>

              {#if eventsLoading}
                <div class="rounded-lg border border-gray-200 bg-white p-8 dark:border-gray-700 dark:bg-gray-800">
                  <div class="flex flex-col items-center gap-4 py-8">
                    <LoadingSpinner size="lg" message="Loading events..." />
                    <p class="text-sm text-gray-600 dark:text-gray-400">
                      This may take a moment for nodes with many events...
                    </p>
                    <button
                      type="button"
                      onclick={cancelEventsLoading}
                      class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
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
            </div>
          {/if}

          <!-- Node Status Sub-Tab -->
          {#if activePuppetSubTab === 'node-status'}
            <div class="space-y-6">
              <NodeStatus
                status={nodeStatus}
                loading={nodeStatusLoading}
                error={nodeStatusError}
                onRefresh={fetchNodeStatus}
              />

              <!-- Puppet Run History Chart -->
              <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                {#if runHistoryLoading}
                  <div class="flex items-center justify-center py-12">
                    <LoadingSpinner />
                  </div>
                {:else if runHistoryError}
                  <ErrorAlert
                    message="Failed to load run history"
                    details={runHistoryError}
                    onRetry={() => fetchRunHistory()}
                  />
                {:else if runHistory}
                  <div class="mb-4 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <h3 class="text-lg font-semibold">Puppet Run History (Last 7 Days)</h3>
                      {#if runHistoryLastUpdate}
                        <span class="text-sm text-gray-500 dark:text-gray-400">
                          Last updated: {runHistoryLastUpdate.toLocaleTimeString()}
                        </span>
                      {/if}
                    </div>
                    <button
                      type="button"
                      onclick={() => {
                        // Clear cache to force refresh
                        delete dataCache['run-history-7'];
                        fetchRunHistory();
                      }}
                      class="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-white dark:ring-gray-600 dark:hover:bg-gray-600"
                      disabled={runHistoryLoading}
                    >
                      {runHistoryLoading ? 'Refreshing...' : 'Refresh'}
                    </button>
                  </div>
                  <PuppetRunChart
                    data={runHistory.history}
                    title=""
                  />

                  <!-- Summary Statistics -->
                  <div class="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
                      <div class="text-sm text-gray-500 dark:text-gray-400">Total Runs</div>
                      <div class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                        {runHistory.summary.totalRuns}
                      </div>
                    </div>
                    <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
                      <div class="text-sm text-gray-500 dark:text-gray-400">Success Rate</div>
                      <div class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                        {runHistory.summary.successRate.toFixed(1)}%
                      </div>
                    </div>
                    <div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-900">
                      <div class="text-sm text-gray-500 dark:text-gray-400">Avg Duration</div>
                      <div class="mt-1 text-2xl font-semibold text-gray-900 dark:text-white">
                        {runHistory.summary.avgDuration.toFixed(1)}s
                      </div>
                    </div>
                  </div>
                {:else}
                  <div class="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                    No run history available
                  </div>
                {/if}
              </div>
            </div>
          {/if}

          <!-- Catalog Diff Sub-Tab -->
          {#if activePuppetSubTab === 'catalog-compilation'}
            <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div class="mb-4 flex items-center gap-3">
                <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Catalog Diff</h2>
                <IntegrationBadge integration="puppetserver" variant="badge" size="sm" />
              </div>

              <CatalogComparison certname={nodeId} />
            </div>
          {/if}

          <!-- Puppet Reports Sub-Tab -->
          {#if activePuppetSubTab === 'puppet-reports'}
            <div class="space-y-4">
              <!-- Source Badge Header -->
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Puppet Reports</h2>
                  <IntegrationBadge integration="puppetdb" variant="badge" size="sm" />
                </div>
                {#if selectedReport || selectedReportLoading}
                  <button
                    type="button"
                    class="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    onclick={() => {
                      selectedReport = null;
                      selectedReportError = null;
                      selectedReportLoading = false;
                    }}
                    disabled={selectedReportLoading}
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
              {:else if selectedReportLoading}
                <!-- Loading report details -->
                <div class="flex justify-center py-12">
                  <LoadingSpinner size="lg" message="Loading report details..." />
                </div>
              {:else if selectedReportError}
                <!-- Error loading report details -->
                <ErrorAlert
                  message="Failed to load report details"
                  details={selectedReportError}
                  onRetry={() => {
                    if (selectedReport) {
                      fetchReportDetails(selectedReport);
                    }
                  }}
                />
              {:else if selectedReport}
                <!-- Detailed view of selected report -->
                <ReportViewer report={selectedReport} />
              {:else}
                <!-- Compact list view with pagination -->
                <PuppetReportsListView
                  certname={nodeId}
                  onReportClick={fetchReportDetails}
                  onDebugInfo={(info) => handleDebugInfo('Puppet Reports', info)}
                  enablePagination={true}
                />
              {/if}
            </div>
          {/if}

          <!-- Managed Resources Sub-Tab -->
          {#if activePuppetSubTab === 'managed-resources'}
            <div class="space-y-6">
              <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                <div class="mb-4 flex items-center gap-3">
                  <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Managed Resources</h2>
                  <IntegrationBadge integration="puppetdb" variant="badge" size="sm" />
                </div>
                <p class="mb-6 text-sm text-gray-500 dark:text-gray-400">
                  View all resources managed by Puppet on this node, organized by resource type.
                </p>

                <ManagedResourcesViewer
                  certname={nodeId}
                  resources={managedResources}
                  loading={managedResourcesLoading}
                  error={managedResourcesError}
                  onRetry={fetchManagedResources}
                />
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Hiera Tab -->
      {#if activeTab === 'hiera'}
        <div class="space-y-6">
          <div class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div class="mb-4 flex items-center gap-3">
              <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Hiera Data</h2>
              <span class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400">
                Hiera
              </span>
            </div>
            <p class="mb-6 text-sm text-gray-500 dark:text-gray-400">
              View Hiera configuration data for this node, including resolved values from all hierarchy levels.
            </p>

            <NodeHieraTab nodeId={nodeId} />
          </div>
        </div>
      {/if}

    </div>
  {/if}

  <!-- Unified Expert Mode Debug Panel - Shows all debug blocks from current tab -->
  {#if expertMode.enabled && sortedDebugInfoBlocks.length > 0}
    <div class="mt-8 space-y-4">
      {#each sortedDebugInfoBlocks as block (block.label)}
        <div>
          <h3 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{block.label}</h3>
          <ExpertModeDebugPanel debugInfo={block.debugInfo} />
        </div>
      {/each}
    </div>
  {/if}
</div>
