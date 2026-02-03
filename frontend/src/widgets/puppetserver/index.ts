/**
 * Puppetserver Plugin Widgets
 *
 * Re-exports widget components from the plugin directory.
 *
 * @module widgets/puppetserver
 * @version 1.0.0
 */

// ==========================================================================
// Re-exports from Plugin Directory
// ==========================================================================

export {
  HomeWidget,
  CatalogCompilation,
  EnvironmentInfo,
  EnvironmentManager,
  NodeStatus,
  StatusDashboard,
  PUPPETSERVER_WIDGET_MANIFEST,
  getPuppetserverWidgetIds,
  getPuppetserverWidget,
  type PuppetserverWidgetId,
} from '@plugins/native/puppetserver/frontend';
