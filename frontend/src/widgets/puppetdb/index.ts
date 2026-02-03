/**
 * PuppetDB Plugin Widgets
 *
 * Re-exports widget components from the plugin directory.
 *
 * @module widgets/puppetdb
 * @version 1.0.0
 */

// ==========================================================================
// Re-exports from Plugin Directory
// ==========================================================================

export {
  HomeWidget,
  FactsExplorer,
  ReportsViewer,
  ReportsSummary,
  EventsViewer,
  CatalogViewer,
  NodeBrowser,
  PUPPETDB_WIDGET_MANIFEST,
  getPuppetDBWidgetIds,
  getPuppetDBWidget,
  type PuppetDBWidgetId,
} from '@plugins/native/puppetdb/frontend';
