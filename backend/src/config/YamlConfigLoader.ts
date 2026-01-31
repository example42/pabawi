import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";
import { LoggerService } from "../services/LoggerService";

const logger = new LoggerService();

/**
 * Configuration file paths (in order of precedence - last wins)
 */
export interface ConfigFilePaths {
  integrations?: string;
  rbac?: string;
  database?: string;
}

/**
 * Result of loading a YAML configuration file
 */
export interface YamlLoadResult<T> {
  success: boolean;
  data?: T;
  source?: string;
  error?: string;
}

/**
 * Environment variable interpolation result
 */
interface InterpolationResult {
  value: unknown;
  interpolatedVars: string[];
  missingVars: string[];
}

/**
 * YAML Configuration Loader
 *
 * Loads configuration from YAML files with environment variable interpolation.
 * Supports the syntax:
 * - ${VAR_NAME} - Required variable
 * - ${VAR_NAME:-default} - Variable with default value
 * - ${VAR_NAME:?error message} - Variable with custom error message if missing
 *
 * Configuration precedence (highest to lowest):
 * 1. CLI arguments (if applicable)
 * 2. Environment variables
 * 3. YAML configuration files
 * 4. Default values in schemas
 */
export class YamlConfigLoader {
  private readonly basePath: string;
  private readonly env: Record<string, string | undefined>;

  /**
   * Creates a new YamlConfigLoader
   * @param basePath - Base path for resolving relative config file paths
   * @param env - Environment variables (defaults to process.env)
   */
  constructor(
    basePath?: string,
    env?: Record<string, string | undefined>,
  ) {
    this.basePath = basePath ?? process.cwd();
    this.env = env ?? process.env;
  }

  /**
   * Load and parse a YAML configuration file
   * @param filePath - Path to the YAML file (relative to basePath or absolute)
   * @returns Parsed configuration object or undefined if file doesn't exist
   */
  loadFile<T = Record<string, unknown>>(filePath: string): YamlLoadResult<T> {
    const resolvedPath = this.resolvePath(filePath);

    if (!fs.existsSync(resolvedPath)) {
      logger.debug("Configuration file not found", {
        component: "YamlConfigLoader",
        operation: "loadFile",
        metadata: { filePath: resolvedPath },
      });
      return {
        success: false,
        error: `Configuration file not found: ${resolvedPath}`,
      };
    }

    try {
      const content = fs.readFileSync(resolvedPath, "utf-8");
      const parsed = yaml.parse(content) as unknown;

      if (parsed === null || parsed === undefined) {
        return {
          success: true,
          data: {} as T,
          source: resolvedPath,
        };
      }

      // Interpolate environment variables
      const interpolated = this.interpolateEnvVars(parsed);

      if (interpolated.missingVars.length > 0) {
        logger.warn("Missing required environment variables in config", {
          component: "YamlConfigLoader",
          operation: "loadFile",
          metadata: {
            filePath: resolvedPath,
            missingVars: interpolated.missingVars,
          },
        });
      }

      logger.info("Loaded YAML configuration", {
        component: "YamlConfigLoader",
        operation: "loadFile",
        metadata: {
          filePath: resolvedPath,
          interpolatedVars: interpolated.interpolatedVars.length,
        },
      });

      return {
        success: true,
        data: interpolated.value as T,
        source: resolvedPath,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Failed to load YAML configuration", {
        component: "YamlConfigLoader",
        operation: "loadFile",
        metadata: { filePath: resolvedPath, error: message },
      });
      return {
        success: false,
        error: `Failed to parse YAML file ${resolvedPath}: ${message}`,
      };
    }
  }

  /**
   * Load configuration from a file if it exists, otherwise return empty object
   * @param filePath - Path to the YAML file
   * @returns Configuration object (empty if file doesn't exist)
   */
  loadFileOrEmpty(filePath: string): Record<string, unknown> {
    const result = this.loadFile(filePath);
    return result.success && result.data ? result.data : {};
  }

  /**
   * Load configuration from multiple files, merging them in order
   * Later files override earlier ones
   * @param filePaths - Array of file paths to load
   * @returns Merged configuration object
   */
  loadAndMerge(...filePaths: string[]): Record<string, unknown> {
    let merged: Record<string, unknown> = {};

    for (const filePath of filePaths) {
      const result = this.loadFile(filePath);
      if (result.success && result.data) {
        merged = this.deepMerge(merged, result.data);
      }
    }

    return merged;
  }

  /**
   * Find and load the first existing configuration file from a list
   * @param filePaths - Array of file paths to try
   * @returns Load result from the first existing file
   */
  loadFirst<T = Record<string, unknown>>(
    ...filePaths: string[]
  ): YamlLoadResult<T> {
    for (const filePath of filePaths) {
      const resolvedPath = this.resolvePath(filePath);
      if (fs.existsSync(resolvedPath)) {
        return this.loadFile<T>(filePath);
      }
    }

    return {
      success: false,
      error: `No configuration file found. Tried: ${filePaths.join(", ")}`,
    };
  }

  /**
   * Interpolate environment variables in a value
   *
   * Supported syntax:
   * - ${VAR_NAME} - Uses VAR_NAME from environment (throws if missing)
   * - ${VAR_NAME:-default} - Uses default if VAR_NAME is unset or empty
   * - ${VAR_NAME:?error message} - Throws custom error if VAR_NAME is missing
   *
   * @param value - Value to interpolate (can be any type)
   * @returns Interpolated value with tracking info
   */
  private interpolateEnvVars(value: unknown): InterpolationResult {
    const interpolatedVars: string[] = [];
    const missingVars: string[] = [];

    const interpolate = (val: unknown): unknown => {
      if (typeof val === "string") {
        return this.interpolateString(val, interpolatedVars, missingVars);
      }

      if (Array.isArray(val)) {
        return val.map((item) => interpolate(item));
      }

      if (val !== null && typeof val === "object") {
        const result: Record<string, unknown> = {};
        for (const [key, v] of Object.entries(val)) {
          result[key] = interpolate(v);
        }
        return result;
      }

      return val;
    };

    return {
      value: interpolate(value),
      interpolatedVars,
      missingVars,
    };
  }

  /**
   * Interpolate environment variables in a string
   */
  private interpolateString(
    str: string,
    interpolatedVars: string[],
    missingVars: string[],
  ): string {
    // Match ${VAR_NAME}, ${VAR_NAME:-default}, or ${VAR_NAME:?error}
    const envVarPattern =
      /\$\{([A-Z_][A-Z0-9_]*)(?:(:[-?])([^}]*))?\}/gi;

    return str.replace(
      envVarPattern,
      (match, varName: string, operator?: string, operand?: string) => {
        const envValue = this.env[varName];

        if (envValue !== undefined && envValue !== "") {
          interpolatedVars.push(varName);
          return envValue;
        }

        // Handle operator cases (envValue is undefined or empty string)
        if (operator === ":-") {
          // Default value
          interpolatedVars.push(`${varName} (default)`);
          return operand ?? "";
        }

        if (operator === ":?") {
          // Required with custom error
          missingVars.push(varName);
          throw new Error(
            operand ??
              `Required environment variable ${varName} is not set`,
          );
        }

        // No operator - variable is required but missing
        missingVars.push(varName);
        // Return the original match to keep the placeholder visible
        // This allows the schema validation to catch the missing value
        return match;
      },
    );
  }

  /**
   * Deep merge two objects
   * Arrays are replaced, not concatenated
   */
  private deepMerge<T>(target: T, source: Partial<T>): T {
    const result = { ...target };

    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key];
        const targetValue = (result as Record<string, unknown>)[key];

        if (
          sourceValue !== null &&
          typeof sourceValue === "object" &&
          !Array.isArray(sourceValue) &&
          targetValue !== null &&
          typeof targetValue === "object" &&
          !Array.isArray(targetValue)
        ) {
          // Recursively merge objects
          (result as Record<string, unknown>)[key] = this.deepMerge(
            targetValue as Record<string, unknown>,
            sourceValue as Record<string, unknown>,
          );
        } else {
          // Direct assignment for primitives, arrays, and null
          (result as Record<string, unknown>)[key] = sourceValue;
        }
      }
    }

    return result;
  }

  /**
   * Resolve a file path relative to the base path
   */
  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.basePath, filePath);
  }

  /**
   * Check if a configuration file exists
   */
  fileExists(filePath: string): boolean {
    return fs.existsSync(this.resolvePath(filePath));
  }

  /**
   * Get the resolved path for a config file
   */
  getResolvedPath(filePath: string): string {
    return this.resolvePath(filePath);
  }

  /**
   * Write a configuration object to a YAML file
   * @param filePath - Path to write the file
   * @param config - Configuration object to write
   * @param comment - Optional comment to add at the top of the file
   */
  writeFile(
    filePath: string,
    config: Record<string, unknown>,
    comment?: string,
  ): void {
    const resolvedPath = this.resolvePath(filePath);
    const dir = path.dirname(resolvedPath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let content = "";
    if (comment) {
      content =
        comment
          .split("\n")
          .map((line) => `# ${line}`)
          .join("\n") + "\n\n";
    }

    content += yaml.stringify(config, {
      indent: 2,
      lineWidth: 120,
    });

    fs.writeFileSync(resolvedPath, content, "utf-8");

    logger.info("Wrote YAML configuration", {
      component: "YamlConfigLoader",
      operation: "writeFile",
      metadata: { filePath: resolvedPath },
    });
  }
}

/**
 * Default configuration file locations
 */
export const DEFAULT_CONFIG_PATHS = {
  integrations: [
    "config/integrations.yaml",
    "config/integrations.yml",
    "integrations.yaml",
    "integrations.yml",
  ],
  rbac: ["config/rbac.yaml", "config/rbac.yml", "rbac.yaml", "rbac.yml"],
  database: [
    "config/database.yaml",
    "config/database.yml",
    "database.yaml",
    "database.yml",
  ],
  main: ["config/pabawi.yaml", "config/pabawi.yml", "pabawi.yaml", "pabawi.yml"],
} as const;

/**
 * Create a singleton YAML config loader instance
 */
let yamlLoaderInstance: YamlConfigLoader | null = null;

export function getYamlConfigLoader(basePath?: string): YamlConfigLoader {
  yamlLoaderInstance ??= new YamlConfigLoader(basePath);
  return yamlLoaderInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetYamlConfigLoader(): void {
  yamlLoaderInstance = null;
}
