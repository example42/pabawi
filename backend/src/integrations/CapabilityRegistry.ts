/**
 * Capability Registry
 *
 * Central registry for plugin capabilities in the v1.0.0 modular architecture.
 * Maps capability names to plugin handlers and provides:
 * - Registration of capabilities from plugins
 * - Priority-based routing when multiple plugins provide the same capability
 * - Permission-aware capability listing
 * - Capability execution with context
 * - Widget-to-capability linking for permission resolution
 *
 * @module integrations/CapabilityRegistry
 * @version 1.0.0
 */

import type {
  PluginCapability,
  PluginWidget,
  ExecutionContext,
  CapabilityRiskLevel,
} from "./types";
import { LoggerService } from "../services/LoggerService";

/**
 * Registered capability with plugin metadata
 */
export interface RegisteredCapability {
  /** The capability definition */
  capability: PluginCapability;
  /** Name of the plugin providing this capability */
  pluginName: string;
  /** Priority for routing (higher = preferred) */
  priority: number;
  /** When the capability was registered */
  registeredAt: string;
}

/**
 * Registered widget with plugin metadata
 */
export interface RegisteredWidget {
  /** The widget definition */
  widget: PluginWidget;
  /** Name of the plugin providing this widget */
  pluginName: string;
  /** When the widget was registered */
  registeredAt: string;
}

/**
 * User context for permission checking
 */
export interface User {
  id: string;
  username: string;
  roles: string[];
  permissions?: string[];
}

/**
 * Debug context for capability execution tracing
 */
export interface DebugContext {
  /** Correlation ID for request tracing */
  correlationId: string;
  /** Start time for performance measurement */
  startTime: number;
  /** Additional debug metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Result of capability execution
 */
export interface CapabilityExecutionResult<T = unknown> {
  /** Whether execution succeeded */
  success: boolean;
  /** Result data if successful */
  data?: T;
  /** Error if failed */
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  /** Plugin that handled the capability */
  handledBy: string;
  /** Execution duration in milliseconds */
  durationMs: number;
  /** Debug information (when debug mode enabled) */
  debug?: {
    correlationId: string;
    capabilityName: string;
    pluginName: string;
    priority: number;
    providersCount: number;
  };
}

/**
 * Options for capability listing
 */
export interface ListCapabilitiesOptions {
  /** Filter by category */
  category?: string;
  /** Filter by risk level */
  riskLevel?: CapabilityRiskLevel;
  /** Filter by plugin name */
  pluginName?: string;
  /** Include capabilities user doesn't have permission for (marked as unauthorized) */
  includeUnauthorized?: boolean;
}

/**
 * Capability Registry
 *
 * Manages registration and execution of plugin capabilities.
 * Supports priority-based routing when multiple plugins provide the same capability.
 *
 * @example
 * ```typescript
 * const registry = new CapabilityRegistry(logger);
 *
 * // Register capabilities
 * registry.registerCapability('bolt', {
 *   category: 'command',
 *   name: 'command.execute',
 *   description: 'Execute a command on target nodes',
 *   handler: async (params, context) => { ... },
 *   requiredPermissions: ['command.execute'],
 *   riskLevel: 'execute'
 * }, 10);
 *
 * // Execute capability
 * const result = await registry.executeCapability(
 *   user,
 *   'command.execute',
 *   { command: 'whoami', targets: ['node1'] }
 * );
 * ```
 */
export class CapabilityRegistry {
  /** Map of capability name to registered capabilities (sorted by priority) */
  private capabilities = new Map<string, RegisteredCapability[]>();

  /** Map of widget ID to registered widget */
  private widgets = new Map<string, RegisteredWidget>();

  /** Map of capability name to widget IDs that require it */
  private capabilityWidgetLinks = new Map<string, Set<string>>();

  private logger: LoggerService;

  constructor(logger?: LoggerService) {
    this.logger = logger ?? new LoggerService();
    this.logger.debug("CapabilityRegistry created", {
      component: "CapabilityRegistry",
    });
  }

  /**
   * Register a capability from a plugin
   *
   * @param pluginName - Name of the plugin providing this capability
   * @param capability - Capability definition
   * @param priority - Priority for routing (default: 10, higher = preferred)
   * @throws Error if capability name is invalid
   */
  registerCapability(
    pluginName: string,
    capability: PluginCapability,
    priority = 10
  ): void {
    this.validateCapabilityName(capability.name);

    const registered: RegisteredCapability = {
      capability,
      pluginName,
      priority,
      registeredAt: new Date().toISOString(),
    };

    // Get or create capability list
    const existing = this.capabilities.get(capability.name) ?? [];
    existing.push(registered);

    // Sort by priority (highest first)
    existing.sort((a, b) => b.priority - a.priority);

    this.capabilities.set(capability.name, existing);

    this.logger.info(
      `Registered capability: ${capability.name} from plugin: ${pluginName}`,
      {
        component: "CapabilityRegistry",
        operation: "registerCapability",
        metadata: {
          capabilityName: capability.name,
          pluginName,
          priority,
          category: capability.category,
          riskLevel: capability.riskLevel,
          totalProviders: existing.length,
        },
      }
    );
  }

  /**
   * Unregister all capabilities from a plugin
   *
   * @param pluginName - Name of the plugin to unregister
   * @returns Number of capabilities unregistered
   */
  unregisterPlugin(pluginName: string): number {
    let count = 0;

    for (const [capName, registrations] of this.capabilities) {
      const filtered = registrations.filter((r) => r.pluginName !== pluginName);
      if (filtered.length !== registrations.length) {
        count += registrations.length - filtered.length;
        if (filtered.length === 0) {
          this.capabilities.delete(capName);
        } else {
          this.capabilities.set(capName, filtered);
        }
      }
    }

    // Also unregister widgets from this plugin
    for (const [widgetId, registration] of this.widgets) {
      if (registration.pluginName === pluginName) {
        this.unregisterWidget(widgetId);
      }
    }

    this.logger.info(`Unregistered ${count} capabilities from plugin: ${pluginName}`, {
      component: "CapabilityRegistry",
      operation: "unregisterPlugin",
      metadata: { pluginName, capabilitiesRemoved: count },
    });

    return count;
  }

  /**
   * Register a widget from a plugin
   *
   * @param pluginName - Name of the plugin providing this widget
   * @param widget - Widget definition
   */
  registerWidget(pluginName: string, widget: PluginWidget): void {
    const registered: RegisteredWidget = {
      widget,
      pluginName,
      registeredAt: new Date().toISOString(),
    };

    this.widgets.set(widget.id, registered);

    // Link widget to required capabilities
    for (const capName of widget.requiredCapabilities) {
      const links = this.capabilityWidgetLinks.get(capName) ?? new Set();
      links.add(widget.id);
      this.capabilityWidgetLinks.set(capName, links);
    }

    this.logger.debug(`Registered widget: ${widget.id} from plugin: ${pluginName}`, {
      component: "CapabilityRegistry",
      operation: "registerWidget",
      metadata: {
        widgetId: widget.id,
        pluginName,
        slots: widget.slots,
        requiredCapabilities: widget.requiredCapabilities,
      },
    });
  }

  /**
   * Unregister a widget
   *
   * @param widgetId - ID of the widget to unregister
   */
  unregisterWidget(widgetId: string): void {
    const registration = this.widgets.get(widgetId);
    if (!registration) return;

    // Remove widget-capability links
    for (const capName of registration.widget.requiredCapabilities) {
      const links = this.capabilityWidgetLinks.get(capName);
      if (links) {
        links.delete(widgetId);
        if (links.size === 0) {
          this.capabilityWidgetLinks.delete(capName);
        }
      }
    }

    this.widgets.delete(widgetId);
  }

  /**
   * Get all plugins providing a specific capability
   *
   * @param capabilityName - Name of the capability
   * @returns Array of registered capabilities, sorted by priority
   */
  getProvidersForCapability(capabilityName: string): RegisteredCapability[] {
    return this.capabilities.get(capabilityName) ?? [];
  }

  /**
   * Get the highest-priority provider for a capability
   *
   * @param capabilityName - Name of the capability
   * @returns Highest-priority registered capability, or undefined if none
   */
  getPrimaryProvider(capabilityName: string): RegisteredCapability | undefined {
    const providers = this.capabilities.get(capabilityName);
    return providers?.[0];
  }

  /**
   * Get all registered capabilities, optionally filtered
   *
   * @param user - User for permission filtering (optional)
   * @param options - Filter options
   * @returns Array of capabilities the user can access
   */
  getAllCapabilities(
    user?: User,
    options: ListCapabilitiesOptions = {}
  ): (RegisteredCapability & { authorized: boolean })[] {
    const result: (RegisteredCapability & { authorized: boolean })[] = [];
    const seen = new Set<string>();

    for (const [, registrations] of this.capabilities) {
      for (const reg of registrations) {
        // Only include primary provider unless asked for all
        if (seen.has(reg.capability.name)) continue;
        seen.add(reg.capability.name);

        // Apply filters
        if (options.category && reg.capability.category !== options.category) {
          continue;
        }
        if (options.riskLevel && reg.capability.riskLevel !== options.riskLevel) {
          continue;
        }
        if (options.pluginName && reg.pluginName !== options.pluginName) {
          continue;
        }

        // Check authorization
        const authorized = user
          ? this.userHasPermission(user, reg.capability.requiredPermissions)
          : true;

        if (!authorized && !options.includeUnauthorized) {
          continue;
        }

        result.push({ ...reg, authorized });
      }
    }

    return result;
  }

  /**
   * Get all registered widgets, optionally filtered by permissions
   *
   * @param user - User for permission filtering (optional)
   * @param slot - Filter by widget slot (optional)
   * @returns Array of widgets the user can access
   */
  getAllWidgets(
    user?: User,
    slot?: string
  ): (RegisteredWidget & { authorized: boolean })[] {
    const result: (RegisteredWidget & { authorized: boolean })[] = [];

    for (const [, registration] of this.widgets) {
      // Filter by slot if specified
      if (slot && !registration.widget.slots.includes(slot as never)) {
        continue;
      }

      // Check if user has permission for all required capabilities
      const authorized = user
        ? this.userHasCapabilityPermissions(
            user,
            registration.widget.requiredCapabilities
          )
        : true;

      result.push({ ...registration, authorized });
    }

    // Sort by priority (higher first)
    result.sort(
      (a, b) => (b.widget.priority ?? 0) - (a.widget.priority ?? 0)
    );

    return result;
  }

  /**
   * Execute a capability
   *
   * Routes to the highest-priority plugin providing the capability.
   * Checks user permissions before execution.
   *
   * @param user - User executing the capability
   * @param capabilityName - Name of the capability to execute
   * @param params - Parameters to pass to the handler
   * @param debugContext - Optional debug context for tracing
   * @returns Execution result with success/error information
   * @throws Error if capability not found or user unauthorized
   */
  async executeCapability<T = unknown>(
    user: User,
    capabilityName: string,
    params: Record<string, unknown>,
    debugContext?: DebugContext
  ): Promise<CapabilityExecutionResult<T>> {
    const startTime = debugContext?.startTime ?? Date.now();
    const providers = this.capabilities.get(capabilityName);

    // Capability not found
    if (!providers || providers.length === 0) {
      this.logger.warn(`Capability not found: ${capabilityName}`, {
        component: "CapabilityRegistry",
        operation: "executeCapability",
        metadata: { capabilityName, userId: user.id },
      });

      return {
        success: false,
        error: {
          code: "CAPABILITY_NOT_FOUND",
          message: `Capability '${capabilityName}' is not registered`,
        },
        handledBy: "none",
        durationMs: Date.now() - startTime,
      };
    }

    // Get primary provider (highest priority)
    const primary = providers[0];

    // Check permissions
    if (!this.userHasPermission(user, primary.capability.requiredPermissions)) {
      this.logger.warn(
        `Permission denied for capability: ${capabilityName}`,
        {
          component: "CapabilityRegistry",
          operation: "executeCapability",
          metadata: {
            capabilityName,
            userId: user.id,
            userRoles: user.roles,
            requiredPermissions: primary.capability.requiredPermissions,
          },
        }
      );

      return {
        success: false,
        error: {
          code: "PERMISSION_DENIED",
          message: `User '${user.username}' lacks permission for capability '${capabilityName}'`,
          details: {
            required: primary.capability.requiredPermissions,
            userRoles: user.roles,
          },
        },
        handledBy: "none",
        durationMs: Date.now() - startTime,
      };
    }

    // Build execution context
    const context: ExecutionContext = {
      user: {
        id: user.id,
        username: user.username,
        roles: user.roles,
      },
      correlationId: debugContext?.correlationId,
      metadata: debugContext?.metadata,
    };

    // Execute the capability
    try {
      this.logger.info(`Executing capability: ${capabilityName}`, {
        component: "CapabilityRegistry",
        operation: "executeCapability",
        metadata: {
          capabilityName,
          pluginName: primary.pluginName,
          userId: user.id,
          correlationId: debugContext?.correlationId,
        },
      });

      const data = (await primary.capability.handler(params, context)) as T;
      const durationMs = Date.now() - startTime;

      this.logger.info(
        `Capability executed successfully: ${capabilityName} (${durationMs}ms)`,
        {
          component: "CapabilityRegistry",
          operation: "executeCapability",
          metadata: {
            capabilityName,
            pluginName: primary.pluginName,
            durationMs,
            correlationId: debugContext?.correlationId,
          },
        }
      );

      const result: CapabilityExecutionResult<T> = {
        success: true,
        data,
        handledBy: primary.pluginName,
        durationMs,
      };

      // Include debug info if context provided
      if (debugContext) {
        result.debug = {
          correlationId: debugContext.correlationId,
          capabilityName,
          pluginName: primary.pluginName,
          priority: primary.priority,
          providersCount: providers.length,
        };
      }

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(`Capability execution failed: ${capabilityName}`, {
        component: "CapabilityRegistry",
        operation: "executeCapability",
        metadata: {
          capabilityName,
          pluginName: primary.pluginName,
          error: errorMessage,
          durationMs,
          correlationId: debugContext?.correlationId,
        },
      });

      return {
        success: false,
        error: {
          code: "EXECUTION_ERROR",
          message: errorMessage,
          details: error instanceof Error ? error.stack : undefined,
        },
        handledBy: primary.pluginName,
        durationMs,
        debug: debugContext
          ? {
              correlationId: debugContext.correlationId,
              capabilityName,
              pluginName: primary.pluginName,
              priority: primary.priority,
              providersCount: providers.length,
            }
          : undefined,
      };
    }
  }

  /**
   * Check if a capability is registered
   *
   * @param capabilityName - Name of the capability
   * @returns true if at least one plugin provides this capability
   */
  hasCapability(capabilityName: string): boolean {
    const providers = this.capabilities.get(capabilityName);
    return providers !== undefined && providers.length > 0;
  }

  /**
   * Get widgets that require a specific capability
   *
   * @param capabilityName - Name of the capability
   * @returns Array of widget IDs that require this capability
   */
  getWidgetsForCapability(capabilityName: string): string[] {
    const links = this.capabilityWidgetLinks.get(capabilityName);
    return links ? Array.from(links) : [];
  }

  /**
   * Get all unique capability names
   *
   * @returns Array of capability names
   */
  getCapabilityNames(): string[] {
    return Array.from(this.capabilities.keys());
  }

  /**
   * Get all unique plugin names that have registered capabilities
   *
   * @returns Array of plugin names
   */
  getPluginNames(): string[] {
    const plugins = new Set<string>();
    for (const registrations of this.capabilities.values()) {
      for (const reg of registrations) {
        plugins.add(reg.pluginName);
      }
    }
    return Array.from(plugins);
  }

  /**
   * Get statistics about the registry
   */
  getStats(): {
    totalCapabilities: number;
    totalProviders: number;
    totalWidgets: number;
    pluginCount: number;
    capabilitiesByCategory: Record<string, number>;
    capabilitiesByRiskLevel: Record<string, number>;
  } {
    const stats = {
      totalCapabilities: this.capabilities.size,
      totalProviders: 0,
      totalWidgets: this.widgets.size,
      pluginCount: 0,
      capabilitiesByCategory: {} as Record<string, number>,
      capabilitiesByRiskLevel: {} as Record<string, number>,
    };

    const plugins = new Set<string>();

    for (const registrations of this.capabilities.values()) {
      stats.totalProviders += registrations.length;
      for (const reg of registrations) {
        plugins.add(reg.pluginName);
        const category = reg.capability.category;
        const riskLevel = reg.capability.riskLevel;
        stats.capabilitiesByCategory[category] =
          (stats.capabilitiesByCategory[category] ?? 0) + 1;
        stats.capabilitiesByRiskLevel[riskLevel] =
          (stats.capabilitiesByRiskLevel[riskLevel] ?? 0) + 1;
      }
    }

    stats.pluginCount = plugins.size;
    return stats;
  }

  /**
   * Clear all registrations (useful for testing)
   */
  clear(): void {
    this.capabilities.clear();
    this.widgets.clear();
    this.capabilityWidgetLinks.clear();
    this.logger.debug("CapabilityRegistry cleared", {
      component: "CapabilityRegistry",
    });
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Validate capability name format
   */
  private validateCapabilityName(name: string): void {
    if (!name || typeof name !== "string") {
      throw new Error("Capability name must be a non-empty string");
    }
    // Allow format: category.action or category.sub.action
    if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/i.test(name)) {
      throw new Error(
        `Invalid capability name '${name}'. Must be in format 'category.action' (e.g., 'command.execute')`
      );
    }
  }

  /**
   * Check if user has at least one of the required permissions
   */
  private userHasPermission(user: User, requiredPermissions: string[]): boolean {
    // Empty permissions = public capability
    if (requiredPermissions.length === 0) {
      return true;
    }

    // Check explicit permissions first
    if (user.permissions) {
      for (const perm of requiredPermissions) {
        if (user.permissions.includes(perm) || user.permissions.includes("*")) {
          return true;
        }
      }
    }

    // Check role-based permissions
    // In v1.0.0 MVP, we use a simple mapping: admin role has all permissions
    // This will be enhanced with RBAC in Phase 2
    if (user.roles.includes("admin")) {
      return true;
    }

    // Check if any role matches required permission (simple role-as-permission)
    for (const perm of requiredPermissions) {
      if (user.roles.includes(perm)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if user has permissions for all required capabilities
   */
  private userHasCapabilityPermissions(
    user: User,
    capabilityNames: string[]
  ): boolean {
    for (const capName of capabilityNames) {
      const provider = this.getPrimaryProvider(capName);
      if (!provider) {
        return false;
      }
      if (!this.userHasPermission(user, provider.capability.requiredPermissions)) {
        return false;
      }
    }
    return true;
  }
}
