/**
 * Debug Module Exports
 *
 * This module provides a unified debug system for Pabawi with:
 * - Debug mode state management (replaces expertMode)
 * - Per-widget debug contexts with correlation IDs
 * - API request tracking
 * - Configuration management
 *
 * @module debug
 *
 * @example
 * ```typescript
 * // Import debug utilities
 * import { debugMode, useDebugContext, trackedFetch } from '$lib/debug';
 *
 * // Check if debug mode is enabled
 * if (debugMode.enabled) {
 *   console.log('Debug mode is active');
 * }
 *
 * // In a Svelte component
 * const debug = useDebugContext('MyWidget');
 *
 * // Track API requests
 * const response = await trackedFetch(debug, '/api/data');
 * ```
 */

// Debug mode store and types
export {
  debugMode,
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  expertMode, // Backward compatibility alias
  type DebugConfig,
  type TrackedRequest,
  type DebugContext,
  type DebugModeStore,
} from './debugMode.svelte';

// Debug context hooks and utilities
export {
  useDebugContext,
  createDebugContext,
  trackedFetch,
  type WidgetDebugContext,
} from './useDebugContext';
