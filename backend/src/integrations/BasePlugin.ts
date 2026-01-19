/**
 * Base Plugin Class
 *
 * Abstract base class providing common functionality for all integration plugins.
 * Handles initialization state, configuration management, and basic health checking.
 */

import type {
  IntegrationPlugin,
  IntegrationConfig,
  HealthStatus,
} from "./types";
import { LoggerService } from "../services/LoggerService";
import { PerformanceMonitorService } from "../services/PerformanceMonitorService";

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
export abstract class BasePlugin implements IntegrationPlugin {
  protected config: IntegrationConfig;
  protected initialized = false;
  protected lastHealthCheck?: HealthStatus;
  protected logger: LoggerService;
  protected performanceMonitor: PerformanceMonitorService;

  /**
   * Create a new base plugin instance
   * @param name - Plugin name
   * @param type - Plugin type
   * @param logger - Logger service instance (optional, creates default if not provided)
   * @param performanceMonitor - Performance monitor service instance (optional, creates default if not provided)
   */
  constructor(
    public readonly name: string,
    public readonly type: "execution" | "information" | "both",
    logger?: LoggerService,
    performanceMonitor?: PerformanceMonitorService,
  ) {
    // Initialize with default config
    this.config = {
      enabled: false,
      name,
      type,
      config: {},
    };
    // Create a default logger if none provided (for backward compatibility)
    // This will be removed once all plugins are migrated to pass LoggerService
    this.logger = logger ?? new LoggerService();
    // Create a default performance monitor if none provided
    this.performanceMonitor = performanceMonitor ?? new PerformanceMonitorService();
  }

  /**
   * Initialize the plugin with configuration
   *
   * This method should be overridden by subclasses to perform
   * plugin-specific initialization (e.g., establishing connections,
   * validating credentials, loading resources).
   *
   * @param config - Integration configuration
   */
  async initialize(config: IntegrationConfig): Promise<void> {
    this.validateConfig(config);
    this.config = config;

    if (!config.enabled) {
      this.logger.info("Plugin is disabled in configuration", {
        component: "BasePlugin",
        integration: this.name,
        operation: "initialize",
      });
      return;
    }

    await this.performInitialization();
    this.initialized = true;
    this.logger.info("Plugin initialized successfully", {
      component: "BasePlugin",
      integration: this.name,
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
   * Validate configuration before initialization
   *
   * Subclasses can override this to add custom validation logic.
   *
   * @param config - Configuration to validate
   * @throws Error if configuration is invalid
   */
  protected validateConfig(config: IntegrationConfig): void {
    if (!config.name) {
      throw new Error("Plugin configuration must include a name");
    }

    if (config.name !== this.name) {
      throw new Error(
        `Configuration name '${config.name}' does not match plugin name '${this.name}'`,
      );
    }

    if (config.type !== this.type) {
      throw new Error(
        `Configuration type '${config.type}' does not match plugin type '${this.type}'`,
      );
    }
  }

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
   * Get the current configuration
   * @returns Current integration configuration
   */
  getConfig(): IntegrationConfig {
    return { ...this.config };
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
      integration: this.name,
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
      integration: this.name,
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
   * Get plugin priority for ordering
   * @returns Priority value (higher = higher priority)
   */
  getPriority(): number {
    return this.config.priority ?? 0;
  }
}
