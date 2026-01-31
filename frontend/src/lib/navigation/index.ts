/**
 * Navigation Module
 *
 * Provides dynamic menu generation from loaded plugins.
 *
 * @module lib/navigation
 * @version 1.0.0
 */

// Types
export type {
  MenuIcon,
  MenuItemType,
  BaseMenuItem,
  LinkMenuItem,
  GroupMenuItem,
  DividerMenuItem,
  ActionMenuItem,
  MenuItem,
  MenuSection,
  Menu,
  PluginMenuContribution,
  MenuBuilderConfig,
  MenuBuilderEvent,
  MenuBuilderEventHandler,
  IntegrationTypeMetadata,
} from "./types";

export {
  DEFAULT_MENU_BUILDER_CONFIG,
  INTEGRATION_TYPE_METADATA,
} from "./types";

// Menu Builder
export {
  MenuBuilder,
  getMenuBuilder,
  resetMenuBuilder,
  useMenu,
  useMenuSection,
  useMenuIsBuilding,
} from "./MenuBuilder.svelte";
