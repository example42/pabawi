/**
 * Bolt Plugin Widgets
 *
 * Re-exports widget components from the plugin directory.
 *
 * @module widgets/bolt
 * @version 1.0.0
 */

// ==========================================================================
// Re-exports from Plugin Directory
// ==========================================================================

export {
  CommandExecutor,
  TaskRunner,
  InventoryViewer,
  TaskBrowser,
  FactsViewer,
  HomeWidget,
  BOLT_WIDGET_MANIFEST,
  getBoltWidgetIds,
  getBoltWidget,
  type BoltWidgetId,
} from '@plugins/native/bolt/frontend';
