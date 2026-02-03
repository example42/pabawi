/**
 * Bolt Integration - Service Exports
 *
 * This module exports the BoltPlugin class and related types.
 *
 * NOTE: The canonical location for Bolt plugin code is now plugins/native/bolt/backend/.
 * This file is maintained for backward compatibility during the migration period.
 *
 * @module integrations/bolt
 * @version 1.0.0
 * @deprecated Use plugins/native/bolt/backend/ for new code
 */

import { BoltPlugin } from "./BoltPlugin.js";

// Re-export plugin class and types (for backward compatibility)
export {
  BoltPlugin,
  BoltPluginConfigSchema,
  type BoltPluginConfig,
  createBoltPlugin,
} from "./BoltPlugin.js";

export default BoltPlugin;
