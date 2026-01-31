/**
 * Expert Mode (Legacy)
 *
 * @deprecated This module is deprecated. Use the new debug module instead:
 *
 * ```typescript
 * // Old way (deprecated)
 * import { expertMode } from '$lib/expertMode.svelte';
 *
 * // New way (recommended)
 * import { debugMode, useDebugContext } from '$lib/debug';
 * ```
 *
 * The `expertMode` export is preserved for backward compatibility and
 * is now an alias for `debugMode`. All existing code using `expertMode`
 * will continue to work without changes.
 *
 * Migration Guide:
 * - `expertMode.enabled` → `debugMode.enabled`
 * - `expertMode.toggle()` → `debugMode.toggle()`
 * - `expertMode.setEnabled(value)` → `debugMode.setEnabled(value)`
 *
 * New features available in the debug module:
 * - Per-widget debug contexts with `useDebugContext()`
 * - API request tracking with `trackedFetch()`
 * - Correlation ID management
 * - Configuration management
 *
 * @module expertMode
 */

// Re-export from the new debug module for backward compatibility
// eslint-disable-next-line @typescript-eslint/no-deprecated
export { debugMode, expertMode } from './debug';

// Re-export types for backward compatibility
export type { DebugConfig, TrackedRequest, DebugContext } from './debug';
