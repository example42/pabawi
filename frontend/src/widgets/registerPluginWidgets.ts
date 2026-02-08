/**
 * Plugin Widget Registration
 *
 * Imports and registers all plugin widget manifests into the global WIDGET_MANIFEST.
 * This allows widgets to be dynamically loaded from their plugin directories.
 *
 * @module widgets/registerPluginWidgets
 * @version 1.0.0
 */

import { registerWidget } from './index';

/**
 * Register all plugin widgets into the global manifest
 * This must be called during app initialization
 */
export async function registerAllPluginWidgets(): Promise<void> {
  // Import all plugin widget manifests
  const [
    { BOLT_WIDGET_MANIFEST },
    { HIERA_WIDGET_MANIFEST },
    { PUPPETDB_WIDGET_MANIFEST },
    { PUPPETSERVER_WIDGET_MANIFEST },
  ] = await Promise.all([
    import('../../../plugins/native/bolt/frontend/index'),
    import('../../../plugins/native/hiera/frontend/index'),
    import('../../../plugins/native/puppetdb/frontend/index'),
    import('../../../plugins/native/puppetserver/frontend/index'),
  ]);

  // Register all widgets from each plugin
  const manifests = [
    BOLT_WIDGET_MANIFEST,
    HIERA_WIDGET_MANIFEST,
    PUPPETDB_WIDGET_MANIFEST,
    PUPPETSERVER_WIDGET_MANIFEST,
  ];

  let totalRegistered = 0;
  for (const manifest of manifests) {
    for (const widgetEntry of Object.values(manifest)) {
      registerWidget(widgetEntry);
      totalRegistered++;
    }
  }

  console.log(`[WidgetRegistration] Registered ${totalRegistered} plugin widgets`);
}
