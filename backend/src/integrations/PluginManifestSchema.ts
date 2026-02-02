/**
 * Plugin Manifest Schema
 *
 * Zod schemas for validating plugin.json manifest files.
 * This schema defines the structure that all plugins must follow,
 * enabling consistent plugin discovery, loading, and validation.
 *
 * @module integrations/PluginManifestSchema
 * @version 1.0.0
 */

import { z } from "zod";

// ============================================================================
// Integration Type Schema
// ============================================================================

/**
 * Valid integration types for plugins
 *
 * Every integration type can potentially write entries to the Node Journal.
 * Journal logging is configurable per-plugin (when/what to write and logging level).
 */
export const IntegrationTypeSchema = z.enum([
  "InventorySource",
  "RemoteExecution",
  "Info",
  "ConfigurationManagement",
  "Event",
  "Monitoring",
  "Provisioning",
  "Deployment",
  "SecretManagement",
  "Schedule",
  "SoftwareInstall",
  "Orchestration",
  "Logging",
  "AuditCompliance",
  "BackupRecovery",
]);

export type IntegrationTypeValue = z.infer<typeof IntegrationTypeSchema>;

// ============================================================================
// Capability Schemas
// ============================================================================

/**
 * Risk level for capabilities
 */
export const CapabilityRiskLevelSchema = z.enum([
  "read",
  "write",
  "execute",
  "admin",
]);

export type CapabilityRiskLevelValue = z.infer<typeof CapabilityRiskLevelSchema>;

/**
 * Standard capability categories
 */
export const CapabilityCategorySchema = z.enum([
  "command",
  "task",
  "info",
  "config",
  "inventory",
  "package",
  "file",
  "service",
  "user",
  "audit",
  "secret",
  "custom",
]);

export type CapabilityCategoryValue = z.infer<typeof CapabilityCategorySchema>;

/**
 * Argument definition for capability schema
 */
export const ArgumentDefinitionSchema = z.object({
  type: z.enum(["string", "number", "boolean", "array", "object"]),
  description: z.string(),
  required: z.boolean(),
  default: z.unknown().optional(),
  choices: z.array(z.unknown()).optional(),
});

export type ArgumentDefinitionValue = z.infer<typeof ArgumentDefinitionSchema>;

/**
 * Capability schema definition (for manifest)
 */
export const CapabilitySchemaDefinitionSchema = z.object({
  arguments: z.record(z.string(), ArgumentDefinitionSchema).optional(),
  returns: z.object({
    type: z.string(),
    description: z.string(),
  }).optional(),
});

export type CapabilitySchemaDefinitionValue = z.infer<typeof CapabilitySchemaDefinitionSchema>;

/**
 * Capability definition in plugin manifest
 */
export const ManifestCapabilitySchema = z.object({
  /** Unique capability name (e.g., 'command.execute', 'facts.query') */
  name: z.string()
    .min(1, "Capability name is required")
    .regex(
      /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/i,
      "Capability name must be in format 'category.action' (e.g., 'command.execute')"
    ),
  /** Category for grouping capabilities */
  category: z.union([CapabilityCategorySchema, z.string()]),
  /** Human-readable description */
  description: z.string().min(1, "Capability description is required"),
  /** Risk level for permission defaults and UI warnings */
  riskLevel: CapabilityRiskLevelSchema,
  /** Permissions required to invoke this capability */
  requiredPermissions: z.array(z.string()).min(1, "At least one permission is required"),
  /** Optional schema for argument validation */
  schema: CapabilitySchemaDefinitionSchema.optional(),
});

export type ManifestCapabilityValue = z.infer<typeof ManifestCapabilitySchema>;

// ============================================================================
// Widget Schemas
// ============================================================================

/**
 * Widget slot types
 */
export const WidgetSlotSchema = z.enum([
  "home-summary",
  "dashboard",
  "node-detail",
  "node-journal",
  "inventory-panel",
  "standalone-page",
  "sidebar",
  "modal",
]);

export type WidgetSlotValue = z.infer<typeof WidgetSlotSchema>;

/**
 * Widget size hint
 */
export const WidgetSizeSchema = z.enum([
  "small",
  "medium",
  "large",
  "full",
]);

export type WidgetSizeValue = z.infer<typeof WidgetSizeSchema>;

/**
 * Widget definition in plugin manifest
 */
export const ManifestWidgetSchema = z.object({
  /** Unique widget ID (format: 'pluginName:widgetName') */
  id: z.string()
    .min(1, "Widget ID is required")
    .regex(
      /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*$/i,
      "Widget ID must be in format 'pluginName:widgetName'"
    ),
  /** Display name for the widget */
  name: z.string().min(1, "Widget name is required"),
  /** Path to Svelte component relative to plugin directory */
  component: z.string().min(1, "Widget component path is required"),
  /** UI slots where this widget can render */
  slots: z.array(WidgetSlotSchema).min(1, "At least one slot is required"),
  /** Default size hint for layout */
  size: WidgetSizeSchema.default("medium"),
  /** Capabilities required - widget hidden if user lacks permissions */
  requiredCapabilities: z.array(z.string()).default([]),
  /** Optional widget-specific configuration */
  config: z.record(z.string(), z.unknown()).optional(),
  /** Optional icon name or path */
  icon: z.string().optional(),
  /** Priority for ordering within a slot (higher = first) */
  priority: z.number().int().default(0),
  /** Category for tab grouping */
  category: z.string().optional(),
  /** Whether widget requires node context */
  nodeScoped: z.boolean().default(false),
  /** Auto-refresh interval in milliseconds */
  refreshInterval: z.number().int().positive().optional(),
});

export type ManifestWidgetValue = z.infer<typeof ManifestWidgetSchema>;

// ============================================================================
// CLI Command Schemas
// ============================================================================

/**
 * CLI action definition
 */
export const ManifestCLIActionSchema = z.object({
  /** Action name (becomes subcommand) */
  name: z.string().min(1, "Action name is required"),
  /** Capability this action invokes */
  capability: z.string().min(1, "Capability reference is required"),
  /** Description shown in help */
  description: z.string().min(1, "Action description is required"),
  /** Command aliases */
  aliases: z.array(z.string()).optional(),
  /** Usage examples */
  examples: z.array(z.string()).optional(),
});

export type ManifestCLIActionValue = z.infer<typeof ManifestCLIActionSchema>;

/**
 * CLI command definition in plugin manifest
 */
export const ManifestCLICommandSchema = z.object({
  /** Command name (becomes top-level command) */
  name: z.string()
    .min(1, "Command name is required")
    .regex(/^[a-z][a-z0-9-]*$/i, "Command name must be lowercase alphanumeric with hyphens"),
  /** Actions (subcommands) this command provides */
  actions: z.array(ManifestCLIActionSchema).min(1, "At least one action is required"),
});

export type ManifestCLICommandValue = z.infer<typeof ManifestCLICommandSchema>;

// ============================================================================
// Plugin Manifest Schema
// ============================================================================

/**
 * Complete plugin manifest schema (plugin.json)
 *
 * This schema validates the structure of plugin.json files that describe
 * plugin metadata, capabilities, widgets, and CLI commands.
 */
export const PluginManifestSchema = z.object({
  // -------------------------------------------------------------------------
  // Required Metadata
  // -------------------------------------------------------------------------

  /** Unique plugin name (lowercase, alphanumeric with hyphens) */
  name: z.string()
    .min(1, "Plugin name is required")
    .max(50, "Plugin name must be 50 characters or less")
    .regex(
      /^[a-z][a-z0-9-]*$/,
      "Plugin name must be lowercase alphanumeric with hyphens, starting with a letter"
    ),

  /** Semantic version (e.g., '1.0.0') */
  version: z.string()
    .min(1, "Version is required")
    .regex(
      /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/,
      "Version must be valid semver (e.g., '1.0.0', '1.0.0-beta.1')"
    ),

  /** Author name or organization */
  author: z.string().min(1, "Author is required"),

  /** Human-readable description */
  description: z.string().min(1, "Description is required"),

  /** Primary integration type */
  integrationType: IntegrationTypeSchema,

  // -------------------------------------------------------------------------
  // Optional Metadata
  // -------------------------------------------------------------------------

  /** Additional integration types this plugin provides */
  integrationTypes: z.array(IntegrationTypeSchema).optional(),

  /** Homepage or documentation URL */
  homepage: z.string().url().optional(),

  /** Repository URL */
  repository: z.string().url().optional(),

  /** License identifier (e.g., 'MIT', 'Apache-2.0') */
  license: z.string().optional(),

  /** Color for UI theming (hex format) */
  color: z.string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a valid hex color (e.g., '#FFAE1A')")
    .optional(),

  /** Icon name or path */
  icon: z.string().optional(),

  /** Tags for search and filtering */
  tags: z.array(z.string()).default([]),

  /** Minimum Pabawi version required */
  minPabawiVersion: z.string()
    .regex(/^\d+\.\d+\.\d+$/, "minPabawiVersion must be valid semver")
    .optional(),

  /** Other plugins this plugin depends on */
  dependencies: z.array(z.string()).default([]),

  // -------------------------------------------------------------------------
  // Entry Points
  // -------------------------------------------------------------------------

  /** Path to backend entry point (relative to plugin directory) */
  entryPoint: z.string().default("backend/index.ts"),

  /** Path to frontend entry point (relative to plugin directory) */
  frontendEntryPoint: z.string().optional(),

  // -------------------------------------------------------------------------
  // Capabilities, Widgets, and CLI
  // -------------------------------------------------------------------------

  /** Capabilities this plugin provides */
  capabilities: z.array(ManifestCapabilitySchema).default([]),

  /** Frontend widgets */
  widgets: z.array(ManifestWidgetSchema).default([]),

  /** CLI commands */
  cliCommands: z.array(ManifestCLICommandSchema).default([]),

  // -------------------------------------------------------------------------
  // Default Permissions
  // -------------------------------------------------------------------------

  /** Default permission mapping: capability name -> role names */
  defaultPermissions: z.record(z.string(), z.array(z.string())).optional(),

  // -------------------------------------------------------------------------
  // Configuration Schema
  // -------------------------------------------------------------------------

  /** JSON Schema for plugin configuration (optional) */
  configSchema: z.record(z.string(), z.unknown()).optional(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a plugin manifest object
 *
 * @param manifest - The manifest object to validate
 * @returns Validation result with parsed data or errors
 */
export function validatePluginManifest(
  manifest: unknown
): z.SafeParseReturnType<unknown, PluginManifest> {
  return PluginManifestSchema.safeParse(manifest);
}

/**
 * Parse and validate a plugin manifest, throwing on error
 *
 * @param manifest - The manifest object to validate
 * @returns Validated and typed manifest
 * @throws ZodError if validation fails
 */
export function parsePluginManifest(manifest: unknown): PluginManifest {
  return PluginManifestSchema.parse(manifest);
}

/**
 * Validate manifest capabilities reference valid categories
 *
 * @param manifest - The validated manifest
 * @returns Array of validation warnings (non-fatal issues)
 */
export function validateManifestConsistency(manifest: PluginManifest): string[] {
  const warnings: string[] = [];

  // Check that widget requiredCapabilities reference declared capabilities
  const capabilityNames = new Set(manifest.capabilities.map(c => c.name));

  for (const widget of manifest.widgets) {
    for (const reqCap of widget.requiredCapabilities) {
      if (!capabilityNames.has(reqCap)) {
        warnings.push(
          `Widget '${widget.id}' requires capability '${reqCap}' which is not declared in the manifest`
        );
      }
    }
  }

  // Check that CLI actions reference declared capabilities
  for (const cmd of manifest.cliCommands) {
    for (const action of cmd.actions) {
      if (!capabilityNames.has(action.capability)) {
        warnings.push(
          `CLI action '${cmd.name} ${action.name}' references capability '${action.capability}' which is not declared`
        );
      }
    }
  }

  // Check widget ID format matches plugin name
  for (const widget of manifest.widgets) {
    const [pluginPart] = widget.id.split(":");
    if (pluginPart !== manifest.name) {
      warnings.push(
        `Widget ID '${widget.id}' should start with plugin name '${manifest.name}:'`
      );
    }
  }

  return warnings;
}

// ============================================================================
// Example Manifest
// ============================================================================

/**
 * Example plugin manifest for documentation and testing
 */
export const examplePluginManifest: PluginManifest = {
  name: "example-plugin",
  version: "1.0.0",
  author: "Pabawi Team",
  description: "An example plugin demonstrating the manifest structure",
  integrationType: "RemoteExecution",
  color: "#FFAE1A",
  icon: "terminal",
  tags: ["example", "demo"],
  minPabawiVersion: "1.0.0",
  dependencies: [],
  entryPoint: "backend/index.ts",
  capabilities: [
    {
      name: "example.hello",
      category: "custom",
      description: "A simple hello world capability",
      riskLevel: "read",
      requiredPermissions: ["example.hello"],
    },
  ],
  widgets: [
    {
      id: "example-plugin:home-widget",
      name: "Example Summary",
      component: "frontend/HomeWidget.svelte",
      slots: ["home-summary"],
      size: "medium",
      requiredCapabilities: ["example.hello"],
      priority: 0,
      nodeScoped: false,
    },
  ],
  cliCommands: [
    {
      name: "example",
      actions: [
        {
          name: "hello",
          capability: "example.hello",
          description: "Say hello",
          examples: ["pab example hello"],
        },
      ],
    },
  ],
};
