/**
 * Pabawi Plugin SDK
 *
 * This SDK provides the interface between Pabawi core and plugins.
 * Plugins receive all dependencies through the PluginContext, ensuring
 * they remain decoupled from Pabawi's internal implementation.
 *
 * Usage in plugin widgets:
 * ```svelte
 * <script lang="ts">
 *   import { getPluginContext } from '@pabawi/plugin-sdk';
 *   const { ui, api, router, toast } = getPluginContext();
 * </script>
 * ```
 *
 * @module @pabawi/plugin-sdk
 * @version 1.0.0
 */

import { getContext, setContext } from 'svelte';
import type { Component } from 'svelte';

// =============================================================================
// Context Key
// =============================================================================

export const PLUGIN_CONTEXT_KEY = 'pabawi:plugin-context';

// =============================================================================
// UI Component Interfaces
// =============================================================================

/**
 * Props for LoadingSpinner component
 */
export interface LoadingSpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  color?: string;
  label?: string;
}

/**
 * Props for ErrorAlert component
 */
export interface ErrorAlertProps {
  title?: string;
  message: string;
  dismissible?: boolean;
  onDismiss?: () => void;
}

/**
 * Props for StatusBadge component
 */
export interface StatusBadgeProps {
  status: 'success' | 'failed' | 'running' | 'pending' | 'partial' | 'unknown';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

/**
 * Props for RealtimeOutputViewer component
 */
export interface RealtimeOutputViewerProps {
  output: string;
  isStreaming?: boolean;
  maxHeight?: string;
  showTimestamps?: boolean;
  onClear?: () => void;
}

/**
 * Props for TaskParameterForm component
 */
export interface TaskParameterFormProps {
  parameters: TaskParameter[];
  values?: Record<string, unknown>;
  onChange?: (values: Record<string, unknown>) => void;
  disabled?: boolean;
}

/**
 * Task parameter definition
 */
export interface TaskParameter {
  name: string;
  type: 'String' | 'Integer' | 'Boolean' | 'Array' | 'Hash';
  description?: string;
  required: boolean;
  default?: unknown;
}

// =============================================================================
// UI Components Interface
// =============================================================================

/**
 * UI components provided by Pabawi to plugins
 */
export interface PluginUIComponents {
  /** Loading spinner for async operations */
  LoadingSpinner: Component<LoadingSpinnerProps>;

  /** Error alert for displaying errors */
  ErrorAlert: Component<ErrorAlertProps>;

  /** Status badge for showing execution status */
  StatusBadge: Component<StatusBadgeProps>;

  /** Real-time output viewer for streaming command output */
  RealtimeOutputViewer: Component<RealtimeOutputViewerProps>;

  /** Form for task parameters */
  TaskParameterForm: Component<TaskParameterFormProps>;
}

// =============================================================================
// API Interface
// =============================================================================

/**
 * HTTP response wrapper
 */
export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

/**
 * API request options
 */
export interface ApiRequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
}

/**
 * API client provided by Pabawi to plugins
 */
export interface PluginApiClient {
  /**
   * Make a GET request
   * @param url - API endpoint (relative to /api)
   * @param options - Request options
   */
  get<T>(url: string, options?: ApiRequestOptions): Promise<T>;

  /**
   * Make a POST request
   * @param url - API endpoint (relative to /api)
   * @param body - Request body
   * @param options - Request options
   */
  post<T>(url: string, body?: unknown, options?: ApiRequestOptions): Promise<T>;

  /**
   * Make a PUT request
   * @param url - API endpoint (relative to /api)
   * @param body - Request body
   * @param options - Request options
   */
  put<T>(url: string, body?: unknown, options?: ApiRequestOptions): Promise<T>;

  /**
   * Make a DELETE request
   * @param url - API endpoint (relative to /api)
   * @param options - Request options
   */
  delete<T>(url: string, options?: ApiRequestOptions): Promise<T>;
}

// =============================================================================
// Router Interface
// =============================================================================

/**
 * Router provided by Pabawi to plugins
 */
export interface PluginRouter {
  /**
   * Navigate to a route
   * @param path - Route path
   * @param options - Navigation options
   */
  navigate(path: string, options?: { replace?: boolean }): void;

  /**
   * Get current route path
   */
  getCurrentPath(): string;

  /**
   * Get route parameters
   */
  getParams(): Record<string, string>;
}

// =============================================================================
// Toast Interface
// =============================================================================

/**
 * Toast notification options
 */
export interface ToastOptions {
  duration?: number;
  dismissible?: boolean;
}

/**
 * Toast notifications provided by Pabawi to plugins
 */
export interface PluginToast {
  /**
   * Show a success toast
   * @param message - Toast message
   * @param options - Toast options
   */
  success(message: string, options?: ToastOptions): void;

  /**
   * Show an error toast
   * @param message - Toast message
   * @param options - Toast options
   */
  error(message: string, options?: ToastOptions): void;

  /**
   * Show an info toast
   * @param message - Toast message
   * @param options - Toast options
   */
  info(message: string, options?: ToastOptions): void;

  /**
   * Show a warning toast
   * @param message - Toast message
   * @param options - Toast options
   */
  warning(message: string, options?: ToastOptions): void;
}

// =============================================================================
// Debug Interface
// =============================================================================

/**
 * Debug utilities provided by Pabawi to plugins
 */
export interface PluginDebug {
  /**
   * Check if debug mode is enabled
   */
  isEnabled(): boolean;

  /**
   * Log debug information
   * @param message - Debug message
   * @param data - Additional data
   */
  log(message: string, data?: unknown): void;
}

// =============================================================================
// Execution Stream Interface
// =============================================================================

/**
 * Execution stream state
 */
export interface ExecutionStreamState {
  isConnected: boolean;
  isStreaming: boolean;
  output: string;
  error: string | null;
  executionId: string | null;
}

/**
 * Execution stream controller
 */
export interface ExecutionStream {
  /** Current stream state */
  state: ExecutionStreamState;

  /**
   * Start streaming execution output
   * @param executionId - Execution ID to stream
   */
  start(executionId: string): void;

  /**
   * Stop streaming
   */
  stop(): void;

  /**
   * Clear output buffer
   */
  clear(): void;
}

/**
 * Execution stream factory
 */
export interface PluginExecutionStream {
  /**
   * Create a new execution stream
   */
  create(): ExecutionStream;
}

// =============================================================================
// Plugin Context
// =============================================================================

/**
 * Complete plugin context provided by Pabawi
 *
 * This is the main interface plugins use to interact with Pabawi.
 * All dependencies are injected through this context.
 */
export interface PluginContext {
  /** UI components */
  ui: PluginUIComponents;

  /** API client */
  api: PluginApiClient;

  /** Router */
  router: PluginRouter;

  /** Toast notifications */
  toast: PluginToast;

  /** Debug utilities */
  debug: PluginDebug;

  /** Execution stream factory */
  executionStream: PluginExecutionStream;

  /** Plugin metadata */
  plugin: {
    name: string;
    version: string;
    color: string;
  };
}

// =============================================================================
// Context Helpers
// =============================================================================

/**
 * Get the plugin context from Svelte context
 *
 * @throws Error if called outside of a plugin widget
 * @returns The plugin context
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { getPluginContext } from '@pabawi/plugin-sdk';
 *   const { ui, api, toast } = getPluginContext();
 *   const { LoadingSpinner, ErrorAlert } = ui;
 * </script>
 * ```
 */
export function getPluginContext(): PluginContext {
  const context = getContext<PluginContext>(PLUGIN_CONTEXT_KEY);

  if (!context) {
    throw new Error(
      'Plugin context not found. Make sure the widget is rendered within a PluginContextProvider.'
    );
  }

  return context;
}

/**
 * Set the plugin context (used by Pabawi core)
 *
 * @param context - The plugin context to set
 */
export function setPluginContext(context: PluginContext): void {
  setContext(PLUGIN_CONTEXT_KEY, context);
}

// =============================================================================
// Type Exports
// =============================================================================

export type {
  Component,
};
