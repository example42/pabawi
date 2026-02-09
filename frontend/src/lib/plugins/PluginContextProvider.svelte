<!--
  Plugin Context Provider

  Wraps plugin widgets and provides them with the PluginContext.
  This component bridges Pabawi's internal implementations with the
  plugin SDK interface.

  @module frontend/src/lib/plugins/PluginContextProvider
  @version 1.0.0
-->
<script lang="ts">
  import { setContext, type Snippet } from 'svelte';
  import {
    PLUGIN_CONTEXT_KEY,
    type PluginContext,
    type PluginUIComponents,
    type PluginApiClient,
    type PluginRouter,
    type PluginToast,
    type PluginDebug,
    type PluginExecutionStream,
  } from './sdk/index.js';

  // Import actual implementations
  import LoadingSpinner from '../../components/LoadingSpinner.svelte';
  import ErrorAlert from '../../components/ErrorAlert.svelte';
  import StatusBadge from '../../components/StatusBadge.svelte';
  import RealtimeOutputViewer from '../../components/RealtimeOutputViewer.svelte';
  import TaskParameterForm from '../../components/TaskParameterForm.svelte';
  import { get, post, put, del } from '../api.js';
  import { router } from '../router.svelte.js';
  import { showSuccess, showError, showInfo, showWarning } from '../toast.svelte.js';
  import { debugMode } from '../debug/index.js';
  import { useExecutionStream } from '../executionStream.svelte.js';

  // ==========================================================================
  // Props
  // ==========================================================================

  interface Props {
    /** Plugin name */
    pluginName: string;
    /** Plugin version */
    pluginVersion?: string;
    /** Plugin color */
    pluginColor?: string;
    /** Widget-specific context (pluginInfo, node, etc.) */
    widgetContext?: Record<string, unknown>;
    /** Child content */
    children: Snippet;
  }

  let {
    pluginName,
    pluginVersion = '1.0.0',
    pluginColor = '#6B7280',
    widgetContext = {},
    children,
  }: Props = $props();

  // ==========================================================================
  // UI Components Adapter
  // ==========================================================================

  const ui: PluginUIComponents = {
    LoadingSpinner: LoadingSpinner as PluginUIComponents['LoadingSpinner'],
    ErrorAlert: ErrorAlert as PluginUIComponents['ErrorAlert'],
    StatusBadge: StatusBadge as PluginUIComponents['StatusBadge'],
    RealtimeOutputViewer: RealtimeOutputViewer as PluginUIComponents['RealtimeOutputViewer'],
    TaskParameterForm: TaskParameterForm as PluginUIComponents['TaskParameterForm'],
  };

  // ==========================================================================
  // API Client Adapter
  // ==========================================================================

  const api: PluginApiClient = {
    get: async <T>(url: string, options?: { headers?: Record<string, string>; timeout?: number; signal?: AbortSignal }) => {
      return get<T>(url) as Promise<T>;
    },
    post: async <T>(url: string, body?: unknown, options?: { headers?: Record<string, string>; timeout?: number; signal?: AbortSignal }) => {
      return post<T>(url, body as Record<string, unknown>) as Promise<T>;
    },
    put: async <T>(url: string, body?: unknown, options?: { headers?: Record<string, string>; timeout?: number; signal?: AbortSignal }) => {
      return put<T>(url, body as Record<string, unknown>) as Promise<T>;
    },
    delete: async <T>(url: string, options?: { headers?: Record<string, string>; timeout?: number; signal?: AbortSignal }) => {
      return del<T>(url) as Promise<T>;
    },
  };

  // ==========================================================================
  // Router Adapter
  // ==========================================================================

  const routerAdapter: PluginRouter = {
    navigate: (path: string, options?: { replace?: boolean }) => {
      router.navigate(path);
    },
    getCurrentPath: () => {
      return router.currentPath;
    },
    getParams: () => {
      return router.params;
    },
  };

  // ==========================================================================
  // Toast Adapter
  // ==========================================================================

  const toast: PluginToast = {
    success: (message: string, options?: { duration?: number; dismissible?: boolean }) => {
      showSuccess(message);
    },
    error: (message: string, options?: { duration?: number; dismissible?: boolean }) => {
      showError(message);
    },
    info: (message: string, options?: { duration?: number; dismissible?: boolean }) => {
      showInfo(message);
    },
    warning: (message: string, options?: { duration?: number; dismissible?: boolean }) => {
      showWarning(message);
    },
  };

  // ==========================================================================
  // Debug Adapter
  // ==========================================================================

  const debug: PluginDebug = {
    isEnabled: () => {
      return debugMode.enabled;
    },
    log: (message: string, data?: unknown) => {
      if (debugMode.enabled) {
        console.log(`[Plugin:${pluginName}] ${message}`, data);
      }
    },
  };

  // ==========================================================================
  // Execution Stream Adapter
  // ==========================================================================

  const executionStream: PluginExecutionStream = {
    create: () => {
      const stream = useExecutionStream();
      return {
        get state() {
          return {
            isConnected: stream.isConnected,
            isStreaming: stream.isStreaming,
            output: stream.output,
            error: stream.error,
            executionId: stream.executionId,
          };
        },
        start: (executionId: string) => stream.startStreaming(executionId),
        stop: () => stream.stopStreaming(),
        clear: () => stream.clearOutput(),
      };
    },
  };

  // ==========================================================================
  // Create Context
  // ==========================================================================

  const context: PluginContext = {
    ui,
    api,
    router: routerAdapter,
    toast,
    debug,
    executionStream,
    plugin: {
      get name() { return pluginName; },
      get version() { return pluginVersion; },
      get color() { return pluginColor; },
    },
    get widgetContext() {
      return {
        pluginName,
        ...widgetContext,
      };
    },
  };

  // Set the context
  setContext(PLUGIN_CONTEXT_KEY, context);
</script>

{@render children()}
