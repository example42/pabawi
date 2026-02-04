/**
 * Generic Plugin Error Types
 *
 * These error types are used across all routes to handle plugin-specific errors
 * in a plugin-agnostic way. Plugins should throw these generic errors or errors
 * that extend from them.
 *
 * @module errors/PluginErrors
 * @version 1.0.0
 */

/**
 * Base class for all plugin errors
 */
export class PluginError extends Error {
  public readonly code: string;
  public readonly pluginName?: string;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    pluginName?: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "PluginError";
    this.code = code;
    this.pluginName = pluginName;
    this.details = details;
    Object.setPrototypeOf(this, PluginError.prototype);
  }
}

/**
 * Error thrown when a plugin is not configured
 */
export class PluginNotConfiguredError extends PluginError {
  constructor(pluginName: string, message?: string) {
    super(
      message ?? `${pluginName} integration is not configured`,
      "PLUGIN_NOT_CONFIGURED",
      pluginName
    );
    this.name = "PluginNotConfiguredError";
    Object.setPrototypeOf(this, PluginNotConfiguredError.prototype);
  }
}

/**
 * Error thrown when a plugin is not initialized
 */
export class PluginNotInitializedError extends PluginError {
  constructor(pluginName: string, message?: string) {
    super(
      message ?? `${pluginName} integration is not initialized`,
      "PLUGIN_NOT_INITIALIZED",
      pluginName
    );
    this.name = "PluginNotInitializedError";
    Object.setPrototypeOf(this, PluginNotInitializedError.prototype);
  }
}

/**
 * Error thrown when a connection to an external service fails
 */
export class ConnectionError extends PluginError {
  constructor(
    pluginName: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message, "CONNECTION_ERROR", pluginName, details);
    this.name = "ConnectionError";
    Object.setPrototypeOf(this, ConnectionError.prototype);
  }
}

/**
 * Error thrown when authentication fails
 */
export class AuthenticationError extends PluginError {
  constructor(
    pluginName: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message, "AUTHENTICATION_ERROR", pluginName, details);
    this.name = "AuthenticationError";
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Error thrown when a query fails
 */
export class QueryError extends PluginError {
  public readonly query?: string;

  constructor(
    pluginName: string,
    message: string,
    query?: string,
    details?: Record<string, unknown>
  ) {
    super(message, "QUERY_ERROR", pluginName, details);
    this.name = "QueryError";
    this.query = query;
    Object.setPrototypeOf(this, QueryError.prototype);
  }
}

/**
 * Error thrown when execution fails
 */
export class ExecutionError extends PluginError {
  public readonly stdout?: string;
  public readonly stderr?: string;
  public readonly exitCode?: number;

  constructor(
    pluginName: string,
    message: string,
    options?: {
      stdout?: string;
      stderr?: string;
      exitCode?: number;
      details?: Record<string, unknown>;
    }
  ) {
    super(message, "EXECUTION_ERROR", pluginName, options?.details);
    this.name = "ExecutionError";
    this.stdout = options?.stdout;
    this.stderr = options?.stderr;
    this.exitCode = options?.exitCode;
    Object.setPrototypeOf(this, ExecutionError.prototype);
  }
}

/**
 * Error thrown when parsing fails
 */
export class ParseError extends PluginError {
  public readonly rawData?: string;

  constructor(
    pluginName: string,
    message: string,
    rawData?: string,
    details?: Record<string, unknown>
  ) {
    super(message, "PARSE_ERROR", pluginName, details);
    this.name = "ParseError";
    this.rawData = rawData;
    Object.setPrototypeOf(this, ParseError.prototype);
  }
}

/**
 * Error thrown when a resource is not found
 */
export class NotFoundError extends PluginError {
  public readonly resourceType?: string;
  public readonly resourceId?: string;

  constructor(
    pluginName: string,
    message: string,
    resourceType?: string,
    resourceId?: string,
    details?: Record<string, unknown>
  ) {
    super(message, "NOT_FOUND", pluginName, details);
    this.name = "NotFoundError";
    this.resourceType = resourceType;
    this.resourceId = resourceId;
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Error thrown when a node is unreachable
 */
export class NodeUnreachableError extends PluginError {
  public readonly nodeId?: string;

  constructor(
    pluginName: string,
    message: string,
    nodeId?: string,
    details?: Record<string, unknown>
  ) {
    super(message, "NODE_UNREACHABLE", pluginName, details);
    this.name = "NodeUnreachableError";
    this.nodeId = nodeId;
    Object.setPrototypeOf(this, NodeUnreachableError.prototype);
  }
}

/**
 * Error thrown when an inventory is not found
 */
export class InventoryNotFoundError extends PluginError {
  constructor(
    pluginName: string,
    message?: string,
    details?: Record<string, unknown>
  ) {
    super(
      message ?? `${pluginName} inventory not found`,
      "INVENTORY_NOT_FOUND",
      pluginName,
      details
    );
    this.name = "InventoryNotFoundError";
    Object.setPrototypeOf(this, InventoryNotFoundError.prototype);
  }
}

/**
 * Error thrown when a task is not found
 */
export class TaskNotFoundError extends PluginError {
  public readonly taskName?: string;

  constructor(
    pluginName: string,
    message: string,
    taskName?: string,
    details?: Record<string, unknown>
  ) {
    super(message, "TASK_NOT_FOUND", pluginName, details);
    this.name = "TaskNotFoundError";
    this.taskName = taskName;
    Object.setPrototypeOf(this, TaskNotFoundError.prototype);
  }
}

/**
 * Error thrown when task parameters are invalid
 */
export class TaskParameterError extends PluginError {
  public readonly taskName?: string;
  public readonly parameterName?: string;

  constructor(
    pluginName: string,
    message: string,
    taskName?: string,
    parameterName?: string,
    details?: Record<string, unknown>
  ) {
    super(message, "TASK_PARAMETER_ERROR", pluginName, details);
    this.name = "TaskParameterError";
    this.taskName = taskName;
    this.parameterName = parameterName;
    Object.setPrototypeOf(this, TaskParameterError.prototype);
  }
}

/**
 * Error thrown when an operation times out
 */
export class TimeoutError extends PluginError {
  public readonly timeoutMs?: number;

  constructor(
    pluginName: string,
    message: string,
    timeoutMs?: number,
    details?: Record<string, unknown>
  ) {
    super(message, "TIMEOUT_ERROR", pluginName, details);
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Error thrown when configuration is invalid
 */
export class ConfigurationError extends PluginError {
  constructor(
    pluginName: string,
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message, "CONFIGURATION_ERROR", pluginName, details);
    this.name = "ConfigurationError";
    Object.setPrototypeOf(this, ConfigurationError.prototype);
  }
}

/**
 * Error thrown when catalog compilation fails
 */
export class CatalogCompilationError extends PluginError {
  public readonly environment?: string;
  public readonly certname?: string;

  constructor(
    pluginName: string,
    message: string,
    environment?: string,
    certname?: string,
    details?: Record<string, unknown>
  ) {
    super(message, "CATALOG_COMPILATION_ERROR", pluginName, details);
    this.name = "CatalogCompilationError";
    this.environment = environment;
    this.certname = certname;
    Object.setPrototypeOf(this, CatalogCompilationError.prototype);
  }
}

/**
 * Error thrown when environment deployment fails
 */
export class EnvironmentDeploymentError extends PluginError {
  public readonly environment?: string;

  constructor(
    pluginName: string,
    message: string,
    environment?: string,
    details?: Record<string, unknown>
  ) {
    super(message, "ENVIRONMENT_DEPLOYMENT_ERROR", pluginName, details);
    this.name = "EnvironmentDeploymentError";
    this.environment = environment;
    Object.setPrototypeOf(this, EnvironmentDeploymentError.prototype);
  }
}

/**
 * Helper function to check if an error is a plugin error
 */
export function isPluginError(error: unknown): error is PluginError {
  return error instanceof PluginError;
}

/**
 * Helper function to convert legacy plugin errors to generic errors
 * This allows routes to handle errors uniformly regardless of the plugin
 */
export function normalizePluginError(error: unknown, pluginName: string): PluginError {
  if (error instanceof PluginError) {
    return error;
  }

  if (error instanceof Error) {
    // Map known error names to generic error types
    const errorName = error.name;
    const message = error.message;

    // Connection errors
    if (
      errorName.includes("ConnectionError") ||
      message.toLowerCase().includes("connection")
    ) {
      return new ConnectionError(pluginName, message, {
        originalError: errorName,
      });
    }

    // Authentication errors
    if (
      errorName.includes("AuthenticationError") ||
      errorName.includes("AuthError")
    ) {
      return new AuthenticationError(pluginName, message, {
        originalError: errorName,
      });
    }

    // Query errors
    if (errorName.includes("QueryError")) {
      const queryError = error as Error & { query?: string };
      return new QueryError(pluginName, message, queryError.query, {
        originalError: errorName,
      });
    }

    // Execution errors
    if (errorName.includes("ExecutionError")) {
      const execError = error as Error & {
        stdout?: string;
        stderr?: string;
        exitCode?: number;
      };
      return new ExecutionError(pluginName, message, {
        stdout: execError.stdout,
        stderr: execError.stderr,
        exitCode: execError.exitCode,
        details: { originalError: errorName },
      });
    }

    // Parse errors
    if (errorName.includes("ParseError")) {
      return new ParseError(pluginName, message, undefined, {
        originalError: errorName,
      });
    }

    // Not found errors
    if (
      errorName.includes("NotFoundError") ||
      errorName.includes("NotFound")
    ) {
      return new NotFoundError(pluginName, message, undefined, undefined, {
        originalError: errorName,
      });
    }

    // Inventory not found
    if (errorName.includes("InventoryNotFoundError")) {
      return new InventoryNotFoundError(pluginName, message, {
        originalError: errorName,
      });
    }

    // Node unreachable
    if (errorName.includes("NodeUnreachableError")) {
      const nodeError = error as Error & { nodeId?: string; details?: Record<string, unknown> };
      return new NodeUnreachableError(
        pluginName,
        message,
        nodeError.nodeId,
        { originalError: errorName, ...nodeError.details }
      );
    }

    // Task not found
    if (errorName.includes("TaskNotFoundError")) {
      const taskError = error as Error & { taskName?: string };
      return new TaskNotFoundError(pluginName, message, taskError.taskName, {
        originalError: errorName,
      });
    }

    // Task parameter error
    if (errorName.includes("TaskParameterError")) {
      const paramError = error as Error & {
        taskName?: string;
        parameterName?: string;
      };
      return new TaskParameterError(
        pluginName,
        message,
        paramError.taskName,
        paramError.parameterName,
        { originalError: errorName }
      );
    }

    // Timeout errors
    if (errorName.includes("TimeoutError")) {
      const timeoutError = error as Error & { timeoutMs?: number };
      return new TimeoutError(pluginName, message, timeoutError.timeoutMs, {
        originalError: errorName,
      });
    }

    // Configuration errors
    if (errorName.includes("ConfigurationError")) {
      const configError = error as Error & { details?: Record<string, unknown> };
      return new ConfigurationError(pluginName, message, {
        originalError: errorName,
        ...configError.details,
      });
    }

    // Catalog compilation errors
    if (errorName.includes("CatalogCompilationError")) {
      const catalogError = error as Error & {
        environment?: string;
        certname?: string;
        details?: Record<string, unknown>;
      };
      return new CatalogCompilationError(
        pluginName,
        message,
        catalogError.environment,
        catalogError.certname,
        { originalError: errorName, ...catalogError.details }
      );
    }

    // Environment deployment errors
    if (errorName.includes("EnvironmentDeploymentError")) {
      const envError = error as Error & {
        environment?: string;
        details?: Record<string, unknown>;
      };
      return new EnvironmentDeploymentError(
        pluginName,
        message,
        envError.environment,
        { originalError: errorName, ...envError.details }
      );
    }

    // Default to generic plugin error
    return new PluginError(message, "PLUGIN_ERROR", pluginName, {
      originalError: errorName,
    });
  }

  // Unknown error type
  return new PluginError(
    String(error),
    "UNKNOWN_ERROR",
    pluginName
  );
}
