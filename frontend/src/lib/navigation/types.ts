/**
 * Navigation Types
 *
 * Type definitions for the dynamic menu system.
 *
 * @module lib/navigation/types
 * @version 1.0.0
 */

import type { IntegrationType } from "../plugins/types";

// =============================================================================
// Menu Item Types
// =============================================================================

/**
 * Icon type - SVG path or named icon
 */
export type MenuIcon = string;

/**
 * Menu item type
 */
export type MenuItemType = "link" | "group" | "divider" | "action";

/**
 * Base menu item properties
 */
export interface BaseMenuItem {
  /** Unique identifier */
  id: string;
  /** Display label */
  label: string;
  /** Item type */
  type: MenuItemType;
  /** SVG icon path or named icon */
  icon?: MenuIcon;
  /** Capabilities required to view this item */
  requiredCapabilities?: string[];
  /** Priority for ordering (higher = first) */
  priority?: number;
  /** Whether item is visible */
  visible?: boolean;
  /** Whether item is disabled */
  disabled?: boolean;
  /** Badge text or count */
  badge?: string | number;
  /** Badge color variant */
  badgeVariant?: "default" | "primary" | "success" | "warning" | "error";
}

/**
 * Link menu item - navigates to a route
 */
export interface LinkMenuItem extends BaseMenuItem {
  type: "link";
  /** Route path */
  path: string;
  /** Open in new tab */
  external?: boolean;
  /** Exact path match for active state */
  exact?: boolean;
}

/**
 * Group menu item - contains sub-items
 */
export interface GroupMenuItem extends BaseMenuItem {
  type: "group";
  /** Child items */
  children: MenuItem[];
  /** Default collapsed state */
  collapsed?: boolean;
  /** Integration type for color theming */
  integrationType?: IntegrationType;
  /** Plugin name that provides this group */
  pluginName?: string;
}

/**
 * Divider menu item - visual separator
 */
export interface DividerMenuItem extends BaseMenuItem {
  type: "divider";
  label: string; // Label is optional for dividers but required by base
}

/**
 * Action menu item - triggers a callback
 */
export interface ActionMenuItem extends BaseMenuItem {
  type: "action";
  /** Action handler (not stored, referenced by ID) */
  actionId: string;
}

/**
 * Union of all menu item types
 */
export type MenuItem = LinkMenuItem | GroupMenuItem | DividerMenuItem | ActionMenuItem;

// =============================================================================
// Menu Section Types
// =============================================================================

/**
 * Menu section for grouping top-level items
 */
export interface MenuSection {
  /** Section identifier */
  id: string;
  /** Section title (shown as label) */
  title: string;
  /** Section items */
  items: MenuItem[];
  /** Priority for ordering (higher = first) */
  priority?: number;
  /** Whether to show section title */
  showTitle?: boolean;
}

/**
 * Complete menu structure
 */
export interface Menu {
  /** Unique menu identifier */
  id: string;
  /** Menu sections */
  sections: MenuSection[];
  /** Menu metadata */
  metadata?: {
    lastUpdated?: Date;
    pluginCount?: number;
    itemCount?: number;
  };
}

// =============================================================================
// Plugin Menu Contribution
// =============================================================================

/**
 * Menu items contributed by a plugin
 */
export interface PluginMenuContribution {
  /** Plugin name */
  pluginName: string;
  /** Integration type for grouping */
  integrationType: IntegrationType;
  /** Menu items to add */
  items: MenuItem[];
  /** Section to add items to (default: "plugins") */
  section?: string;
  /** Plugin color for theming */
  color?: string;
  /** Plugin icon */
  icon?: string;
}

// =============================================================================
// Menu Builder Configuration
// =============================================================================

/**
 * Menu builder configuration options
 */
export interface MenuBuilderConfig {
  /** Include core navigation items (Home, etc.) */
  includeCoreItems?: boolean;
  /** Filter out items without required capabilities */
  filterByPermissions?: boolean;
  /** Sort items by priority */
  sortByPriority?: boolean;
  /** Group plugins by integration type */
  groupByIntegrationType?: boolean;
  /** Show empty groups */
  showEmptyGroups?: boolean;
  /** Default section for plugin items */
  defaultPluginSection?: string;
  /** Custom section definitions */
  sections?: MenuSection[];
}

/**
 * Default menu builder configuration
 */
export const DEFAULT_MENU_BUILDER_CONFIG: Required<MenuBuilderConfig> = {
  includeCoreItems: true,
  filterByPermissions: true,
  sortByPriority: true,
  groupByIntegrationType: true,
  showEmptyGroups: false,
  defaultPluginSection: "integrations",
  sections: [],
};

// =============================================================================
// Menu Event Types
// =============================================================================

/**
 * Menu builder events
 */
export type MenuBuilderEvent =
  | { type: "menu:built"; menu: Menu }
  | { type: "menu:updated"; menu: Menu; changes: string[] }
  | { type: "plugin:contributed"; pluginName: string; itemCount: number }
  | { type: "plugin:removed"; pluginName: string }
  | { type: "error"; error: string };

/**
 * Menu event handler
 */
export type MenuBuilderEventHandler = (event: MenuBuilderEvent) => void;

// =============================================================================
// Integration Type Metadata
// =============================================================================

/**
 * Metadata for each integration type (display info)
 */
export interface IntegrationTypeMetadata {
  /** Display name */
  label: string;
  /** Description */
  description: string;
  /** Default icon */
  icon: string;
  /** Priority for ordering (higher = first) */
  priority: number;
}

/**
 * Default integration type metadata
 */
export const INTEGRATION_TYPE_METADATA: Record<string, IntegrationTypeMetadata> = {
  RemoteExecution: {
    label: "Remote Execution",
    description: "Execute commands and scripts on remote systems",
    icon: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
    priority: 100,
  },
  ConfigurationManagement: {
    label: "Configuration",
    description: "Manage system configurations",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
    priority: 90,
  },
  InventorySource: {
    label: "Inventory",
    description: "Query and browse infrastructure inventory",
    icon: "M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01",
    priority: 85,
  },
  Provisioning: {
    label: "Provisioning",
    description: "Provision and manage infrastructure",
    icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
    priority: 80,
  },
  Monitoring: {
    label: "Monitoring",
    description: "Monitor system health and performance",
    icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    priority: 75,
  },
  Orchestration: {
    label: "Orchestration",
    description: "Orchestrate complex workflows",
    icon: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z",
    priority: 70,
  },
  SecretManagement: {
    label: "Secrets",
    description: "Manage secrets and credentials",
    icon: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z",
    priority: 65,
  },
  ReportingAnalytics: {
    label: "Reports",
    description: "View reports and analytics",
    icon: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    priority: 60,
  },
  AuditCompliance: {
    label: "Audit",
    description: "Audit and compliance reports",
    icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
    priority: 55,
  },
  BackupRecovery: {
    label: "Backup",
    description: "Backup and recovery operations",
    icon: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12",
    priority: 50,
  },
  InstallSoftware: {
    label: "Packages",
    description: "Install and manage software packages",
    icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    priority: 45,
  },
  Info: {
    label: "Information",
    description: "General information and status",
    icon: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    priority: 40,
  },
};
