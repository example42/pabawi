/**
 * Base Plugin Class
 *
 * Abstract base class providing common functionality for all integration plugins.
 * Handles initialization state, configuration management, and basic health checking.
 *
 * v1.0.0: This class now implements BasePluginInterface for capability-based plugins.
 */

import type {
  BasePluginInterface,
  PluginMetadata,
  PluginCapability,
  PluginWidget,
  PluginCLICommand,
  PluginRoute,
  HealthStatus,
  PluginSummary,
  PluginData,
} from "./types";
import type { ZodSchema } from "zod";
import { LoggerService } from "../services/LoggerService";
import { PerformanceMonitorService } from "../services/PerformanceMonitorService";

/**
 * Plugin configuration for v1.0.0 plugins
 */
export interface PluginConfig {
  enabled: boolean;
  [key: string]: unknown;
}

/**
 * Abstract base class for integration plugins
 *
 * Provides common functionality including:
 * - Configuration management
 * - Initialization state tracking
 * - Basic health check implementation
 * - Centralized logging via LoggerService
 * - Performance monitoring via PerformanceMonitorService
 */
export abstract class BasePlugin implements BasePluginInterface {
  protected config: PluginConfig;
  protected initialized = false;
  protected lastHealthCheck?: HealthStatus;
  protected logger: LoggerService;
  protected performanceMonitor: PerformanceMonitorService;

  /**
   * Plugin metadata - must be implemented by subclasses
   * REQUIRED: All plugins must define metadata
   */
  abstract readonly metadata: PluginMetadata;

  /**
   * Capabilities provided by this plugin - must be implemented by subclasses
   * REQUIRED: All plugins must define capabilities (can be empty array)
   */
  abstract readonly capabilities: PluginCapability[];

  /**
   * Optional frontend widgets
   */
  widgets?: PluginWidget[];

  /**
   * Optional CLI commands
   */
  cliCommands?: PluginCLICommand[];

  /**
   * Optional custom routes for plugin-specific endpoints
   */
  routes?: PluginRoute[];

  /**
   * Optional configuration schema
   */
  configSchema?: ZodSchema;

  /**
   * Optional default permissions
   */
  defaultPermissions?: Record<string, string[]>;

  /**
   * Create a new base plugin instance
   * @param logger - Logger service instance (optional, creates default if not provided)
   * @param performanceMonitor - Performance monitor service instance (optional, creates default if not provided)
   */
  constructor(
    logger?: LoggerService,
    performanceMonitor?: PerformanceMonitorService,
  ) {
    // Initialize with default config
    this.config = {
      enabled: false,
    };
    // Create a default logger if none provided (for backward compatibility)
    this.logger = logger ?? new LoggerService();
    // Create a default performance monitor if none provided
    this.performanceMonitor = performanceMonitor ?? new PerformanceMonitorService();
  }

  /**
   * Initialize the plugin
   *
   * This method should be overridden by subclasses to perform
   * plugin-specific initialization (e.g., establishing connections,
   * validating credentials, loading resources).
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      this.logger.info("Plugin is disabled in configuration", {
        component: "BasePlugin",
        integration: this.metadata.name,
        operation: "initialize",
      });
      return;
    }

    await this.performInitialization();
    this.initialized = true;
    this.logger.info("Plugin initialized successfully", {
      component: "BasePlugin",
      integration: this.metadata.name,
      operation: "initialize",
    });
  }

  /**
   * Perform plugin-specific initialization
   *
   * Subclasses should override this method to implement their
   * specific initialization logic.
   */
  protected abstract performInitialization(): Promise<void>;

  /**
   * Check the health status of the integration
   *
   * Subclasses should override this to implement specific health checks.
   * The base implementation returns a basic health status.
   *
   * @returns Health status information
   */
  async healthCheck(): Promise<HealthStatus> {
    const now = new Date().toISOString();

    if (!this.initialized) {
      this.lastHealthCheck = {
        healthy: false,
        message: "Plugin is not initialized",
        lastCheck: now,
      };
      return this.lastHealthCheck;
    }

    if (!this.config.enabled) {
      this.lastHealthCheck = {
        healthy: false,
        message: "Plugin is disabled",
        lastCheck: now,
      };
      return this.lastHealthCheck;
    }

    try {
      const status = await this.performHealthCheck();
      this.lastHealthCheck = {
        ...status,
        lastCheck: now,
      };
      return this.lastHealthCheck;
    } catch (error) {
      this.lastHealthCheck = {
        healthy: false,
        message: error instanceof Error ? error.message : "Health check failed",
        lastCheck: now,
        details: {
          error: error instanceof Error ? error.stack : String(error),
        },
      };
      return this.lastHealthCheck;
    }
  }

  /**
   * Perform plugin-specific health check
   *
   * Subclasses should override this to implement their specific
   * health check logic (e.g., ping endpoint, check connection).
   *
   * @returns Health status (without lastCheck timestamp)
   */
  protected abstract performHealthCheck(): Promise<
    Omit<HealthStatus, "lastCheck">
  >;

  /**
   * Get lightweight summary for home page tiles
   *
   * Subclasses must implement this to provide plugin-specific summary data.
   * Must return in under 500ms with minimal data (counts, status only).
   * Called by /api/plugins/:name/summary endpoint.
   *
   * @returns Plugin summary with metrics
   */
  abstract getSummary(): Promise<PluginSummary>;

  /**
   * Get full plugin data for plugin home pages
   *
   * Subclasses must implement this to provide complete plugin data.
   * Called on-demand when navigating to plugin page.
   * Can load complete data (no strict time limit like getSummary).
   * Called by /api/plugins/:name/data endpoint.
   *
   * @returns Full plugin data
   */
  abstract getData(): Promise<PluginData>;

  /**
   * Get the current configuration
   * @returns Current plugin configuration
   */
  getConfig(): Record<string, unknown> {
    return { ...this.config };
  }

  /**
   * Set the plugin configuration
   * @param config - Configuration to set
   */
  setConfig(config: PluginConfig): void {
    this.config = { ...config };
  }

  /**
   * Check if the plugin is initialized and ready
   * @returns true if initialized, false otherwise
   */
  isInitialized(): boolean {
    return this.initialized && this.config.enabled;
  }

  /**
   * Get the last health check result
   * @returns Last health check status or undefined if never checked
   */
  getLastHealthCheck(): HealthStatus | undefined {
    return this.lastHealthCheck ? { ...this.lastHealthCheck } : undefined;
  }

  /**
   * Log a message with plugin context
   *
   * @param message - Message to log
   * @param level - Log level
   * @param operation - Optional operation name
   */
  protected log(
    message: string,
    level: "info" | "warn" | "error" | "debug" = "info",
    operation?: string,
  ): void {
    this.logger[level](message, {
      component: "BasePlugin",
      integration: this.metadata.name,
      operation,
    });
  }

  /**
   * Log an error with plugin context
   *
   * @param message - Error message
   * @param error - Error object
   * @param operation - Optional operation name
   */
  protected logError(message: string, error: unknown, operation?: string): void {
    const errorObj = error instanceof Error ? error : undefined;
    const errorMessage = error instanceof Error ? error.message : String(error);

    this.logger.error(`${message}: ${errorMessage}`, {
      component: "BasePlugin",
      integration: this.metadata.name,
      operation,
    }, errorObj);
  }

  /**
   * Check if the plugin is enabled
   * @returns true if enabled, false otherwise
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Optional cleanup method called during shutdown
   * Subclasses can override this to perform cleanup operations
   */
  async shutdown(): Promise<void> {
    // Default implementation does nothing
    // Subclasses can override to perform cleanup
  }
}
