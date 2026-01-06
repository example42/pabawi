/**
 * HieraParser
 *
 * Parses hiera.yaml configuration files in Hiera 5 format.
 * Extracts hierarchy levels, paths, data providers, and lookup options.
 */

import * as fs from "fs";
import * as path from "path";
import { parse as parseYaml, YAMLParseError } from "yaml";
import type {
  HieraConfig,
  HieraDefaults,
  HierarchyLevel,
  LookupOptions,
  LookupMethod,
  Facts,
  HieraError,
} from "./types";
import { HIERA_ERROR_CODES } from "./types";

/**
 * Result of parsing a Hiera configuration
 */
export interface HieraParseResult {
  success: boolean;
  config?: HieraConfig;
  error?: HieraError;
}

/**
 * Result of validating a Hiera configuration
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Supported data backends
 */
export type DataBackend = "yaml" | "json" | "eyaml";

/**
 * Detected backend information
 */
export interface BackendInfo {
  type: DataBackend;
  datadir: string;
  options?: Record<string, unknown>;
}

/**
 * HieraParser class for parsing Hiera 5 configuration files
 */
export class HieraParser {
  private controlRepoPath: string;

  constructor(controlRepoPath: string) {
    this.controlRepoPath = controlRepoPath;
  }


  /**
   * Parse a hiera.yaml configuration file
   *
   * @param configPath - Path to hiera.yaml (relative to control repo or absolute)
   * @returns Parse result with config or error
   */
  async parse(configPath: string): Promise<HieraParseResult> {
    const fullPath = this.resolvePath(configPath);

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      return {
        success: false,
        error: {
          code: HIERA_ERROR_CODES.INVALID_PATH,
          message: `Hiera configuration file not found: ${fullPath}`,
          details: {
            file: fullPath,
            suggestion: "Ensure the hiera.yaml file exists in your control repository",
          },
        },
      };
    }

    // Read file content
    let content: string;
    try {
      content = fs.readFileSync(fullPath, "utf-8");
    } catch (error) {
      return {
        success: false,
        error: {
          code: HIERA_ERROR_CODES.INVALID_PATH,
          message: `Failed to read hiera.yaml: ${error instanceof Error ? error.message : String(error)}`,
          details: {
            file: fullPath,
          },
        },
      };
    }

    // Parse YAML content
    return this.parseContent(content, fullPath);
  }

  /**
   * Parse YAML content string
   *
   * @param content - YAML content string
   * @param filePath - Path for error reporting
   * @returns Parse result with config or error
   */
  parseContent(content: string, filePath: string = "hiera.yaml"): HieraParseResult {
    let rawConfig: unknown;

    try {
      rawConfig = parseYaml(content, {
        strict: true,
        uniqueKeys: true,
      });
    } catch (error) {
      if (error instanceof YAMLParseError) {
        return {
          success: false,
          error: {
            code: HIERA_ERROR_CODES.PARSE_ERROR,
            message: `YAML syntax error: ${error.message}`,
            details: {
              file: filePath,
              line: error.linePos?.[0]?.line,
              suggestion: "Check YAML syntax at the indicated line",
            },
          },
        };
      }
      return {
        success: false,
        error: {
          code: HIERA_ERROR_CODES.PARSE_ERROR,
          message: `Failed to parse YAML: ${error instanceof Error ? error.message : String(error)}`,
          details: {
            file: filePath,
          },
        },
      };
    }

    // Validate and transform to HieraConfig
    return this.validateAndTransform(rawConfig, filePath);
  }


  /**
   * Validate raw config and transform to HieraConfig
   *
   * @param rawConfig - Raw parsed YAML object
   * @param filePath - Path for error reporting
   * @returns Parse result with validated config or error
   */
  private validateAndTransform(rawConfig: unknown, filePath: string): HieraParseResult {
    if (!rawConfig || typeof rawConfig !== "object") {
      return {
        success: false,
        error: {
          code: HIERA_ERROR_CODES.PARSE_ERROR,
          message: "Invalid hiera.yaml: expected an object",
          details: {
            file: filePath,
            suggestion: "Ensure hiera.yaml contains valid Hiera 5 configuration",
          },
        },
      };
    }

    const config = rawConfig as Record<string, unknown>;

    // Validate version
    if (config.version !== 5) {
      return {
        success: false,
        error: {
          code: HIERA_ERROR_CODES.PARSE_ERROR,
          message: `Unsupported Hiera version: ${String(config.version)}. Only Hiera 5 is supported.`,
          details: {
            file: filePath,
            suggestion: "Set version: 5 in your hiera.yaml",
          },
        },
      };
    }

    // Validate hierarchy
    if (!Array.isArray(config.hierarchy)) {
      return {
        success: false,
        error: {
          code: HIERA_ERROR_CODES.PARSE_ERROR,
          message: "Invalid hiera.yaml: 'hierarchy' must be an array",
          details: {
            file: filePath,
            suggestion: "Add a hierarchy array with at least one level",
          },
        },
      };
    }

    // Parse hierarchy levels
    const hierarchy: HierarchyLevel[] = [];
    for (let i = 0; i < config.hierarchy.length; i++) {
      const level = config.hierarchy[i];
      const parsedLevel = this.parseHierarchyLevel(level, i, filePath);
      if (!parsedLevel.success) {
        return {
          success: false,
          error: parsedLevel.error,
        };
      }
      hierarchy.push(parsedLevel.level!);
    }

    // Parse defaults if present
    const defaults = config.defaults
      ? this.parseDefaults(config.defaults as Record<string, unknown>)
      : undefined;

    const hieraConfig: HieraConfig = {
      version: 5,
      hierarchy,
      defaults,
    };

    return {
      success: true,
      config: hieraConfig,
    };
  }


  /**
   * Parse a single hierarchy level
   *
   * @param level - Raw hierarchy level object
   * @param index - Index in hierarchy array
   * @param filePath - Path for error reporting
   * @returns Parsed hierarchy level or error
   */
  private parseHierarchyLevel(
    level: unknown,
    index: number,
    filePath: string
  ): { success: boolean; level?: HierarchyLevel; error?: HieraError } {
    if (!level || typeof level !== "object") {
      return {
        success: false,
        error: {
          code: HIERA_ERROR_CODES.PARSE_ERROR,
          message: `Invalid hierarchy level at index ${index}: expected an object`,
          details: {
            file: filePath,
          },
        },
      };
    }

    const rawLevel = level as Record<string, unknown>;

    // Name is required
    if (typeof rawLevel.name !== "string" || !rawLevel.name) {
      return {
        success: false,
        error: {
          code: HIERA_ERROR_CODES.PARSE_ERROR,
          message: `Hierarchy level at index ${index} missing required 'name' field`,
          details: {
            file: filePath,
          },
        },
      };
    }

    const hierarchyLevel: HierarchyLevel = {
      name: rawLevel.name,
    };

    // Parse path/paths
    if (typeof rawLevel.path === "string") {
      hierarchyLevel.path = rawLevel.path;
    }
    if (Array.isArray(rawLevel.paths)) {
      hierarchyLevel.paths = rawLevel.paths.filter(
        (p): p is string => typeof p === "string"
      );
    }

    // Parse glob/globs
    if (typeof rawLevel.glob === "string") {
      hierarchyLevel.glob = rawLevel.glob;
    }
    if (Array.isArray(rawLevel.globs)) {
      hierarchyLevel.globs = rawLevel.globs.filter(
        (g): g is string => typeof g === "string"
      );
    }

    // Parse datadir
    if (typeof rawLevel.datadir === "string") {
      hierarchyLevel.datadir = rawLevel.datadir;
    }

    // Parse data_hash (backend type)
    if (typeof rawLevel.data_hash === "string") {
      hierarchyLevel.data_hash = rawLevel.data_hash;
    }

    // Parse lookup_key
    if (typeof rawLevel.lookup_key === "string") {
      hierarchyLevel.lookup_key = rawLevel.lookup_key;
    }

    // Parse mapped_paths
    if (Array.isArray(rawLevel.mapped_paths) && rawLevel.mapped_paths.length === 3) {
      const [var1, var2, template] = rawLevel.mapped_paths;
      if (typeof var1 === "string" && typeof var2 === "string" && typeof template === "string") {
        hierarchyLevel.mapped_paths = [var1, var2, template];
      }
    }

    // Parse options
    if (rawLevel.options && typeof rawLevel.options === "object") {
      hierarchyLevel.options = rawLevel.options as Record<string, unknown>;
    }

    return {
      success: true,
      level: hierarchyLevel,
    };
  }


  /**
   * Parse defaults section
   *
   * @param defaults - Raw defaults object
   * @returns Parsed defaults
   */
  private parseDefaults(defaults: Record<string, unknown>): HieraDefaults {
    const result: HieraDefaults = {};

    if (typeof defaults.datadir === "string") {
      result.datadir = defaults.datadir;
    }
    if (typeof defaults.data_hash === "string") {
      result.data_hash = defaults.data_hash;
    }
    if (typeof defaults.lookup_key === "string") {
      result.lookup_key = defaults.lookup_key;
    }
    if (defaults.options && typeof defaults.options === "object") {
      result.options = defaults.options as Record<string, unknown>;
    }

    return result;
  }

  /**
   * Validate a parsed Hiera configuration
   *
   * @param config - Parsed Hiera configuration
   * @returns Validation result with errors and warnings
   */
  validateConfig(config: HieraConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check version
    if (config.version !== 5) {
      errors.push(`Unsupported Hiera version: ${config.version}`);
    }

    // Check hierarchy
    if (!config.hierarchy || config.hierarchy.length === 0) {
      errors.push("Hierarchy is empty - at least one level is required");
    }

    // Validate each hierarchy level
    for (const level of config.hierarchy) {
      // Check for path specification
      const hasPath = level.path || level.paths || level.glob || level.globs || level.mapped_paths;
      if (!hasPath) {
        warnings.push(`Hierarchy level '${level.name}' has no path specification`);
      }

      // Check for data provider
      const hasProvider = level.data_hash || level.lookup_key || config.defaults?.data_hash;
      if (!hasProvider) {
        warnings.push(`Hierarchy level '${level.name}' has no data provider specified`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }


  /**
   * Detect the data backend type from a hierarchy level
   *
   * @param level - Hierarchy level
   * @param defaults - Default settings
   * @returns Detected backend info
   */
  detectBackend(level: HierarchyLevel, defaults?: HieraDefaults): BackendInfo {
    const dataHash = level.data_hash ?? defaults?.data_hash ?? "yaml_data";
    const datadir = level.datadir ?? defaults?.datadir ?? "data";

    let type: DataBackend = "yaml";

    if (dataHash.includes("json")) {
      type = "json";
    } else if (dataHash.includes("eyaml") || level.lookup_key?.includes("eyaml")) {
      type = "eyaml";
    }

    return {
      type,
      datadir,
      options: level.options ?? defaults?.options,
    };
  }

  /**
   * Expand hierarchy paths with fact interpolation
   *
   * @param config - Hiera configuration
   * @param facts - Node facts for interpolation
   * @returns Array of expanded file paths
   */
  expandHierarchyPaths(config: HieraConfig, facts: Facts): string[] {
    const paths: string[] = [];

    for (const level of config.hierarchy) {
      const datadir = level.datadir ?? config.defaults?.datadir ?? "data";
      const levelPaths = this.getLevelPaths(level);

      for (const levelPath of levelPaths) {
        const interpolatedPath = this.interpolatePath(levelPath, facts);
        const fullPath = path.join(datadir, interpolatedPath);
        paths.push(fullPath);
      }
    }

    return paths;
  }

  /**
   * Get all paths from a hierarchy level
   *
   * @param level - Hierarchy level
   * @returns Array of path templates
   */
  private getLevelPaths(level: HierarchyLevel): string[] {
    const paths: string[] = [];

    if (level.path) {
      paths.push(level.path);
    }
    if (level.paths) {
      paths.push(...level.paths);
    }
    if (level.glob) {
      paths.push(level.glob);
    }
    if (level.globs) {
      paths.push(...level.globs);
    }

    return paths;
  }


  /**
   * Interpolate variables in a path template
   *
   * Supports:
   * - %{facts.xxx} - Hiera 5 fact syntax
   * - %{::xxx} - Legacy top-scope variable syntax
   * - %{xxx} - Simple variable syntax
   *
   * @param template - Path template with variables
   * @param facts - Node facts for interpolation
   * @param catalogVariables - Optional variables from catalog compilation
   * @returns Interpolated path
   */
  interpolatePath(
    template: string,
    facts: Facts,
    catalogVariables: Record<string, unknown> = {}
  ): string {
    // Pattern to match %{...} variables
    const variablePattern = /%\{([^}]+)\}/g;

    return template.replace(variablePattern, (match, variable: string) => {
      const value = this.resolveVariable(variable.trim(), facts, catalogVariables);
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * Resolve a variable reference to its value
   *
   * @param variable - Variable reference (e.g., "facts.os.family", "::hostname")
   * @param facts - Node facts
   * @param catalogVariables - Optional variables from catalog compilation
   * @returns Resolved value or undefined
   */
  private resolveVariable(
    variable: string,
    facts: Facts,
    catalogVariables: Record<string, unknown> = {}
  ): unknown {
    // Handle facts.xxx syntax - always use facts
    if (variable.startsWith("facts.")) {
      const factPath = variable.slice(6); // Remove "facts." prefix
      return this.getNestedValue(facts.facts, factPath);
    }

    // Handle ::xxx legacy syntax (top-scope variables) - always use facts
    if (variable.startsWith("::")) {
      const factName = variable.slice(2); // Remove "::" prefix
      return this.getNestedValue(facts.facts, factName);
    }

    // Handle trusted.xxx syntax
    if (variable.startsWith("trusted.")) {
      const trustedPath = variable.slice(8);
      const trusted = facts.facts["trusted"] as Record<string, unknown> | undefined;
      if (trusted) {
        return this.getNestedValue(trusted, trustedPath);
      }
      return undefined;
    }

    // Handle server_facts.xxx syntax
    if (variable.startsWith("server_facts.")) {
      const serverPath = variable.slice(13);
      const serverFacts = facts.facts["server_facts"] as Record<string, unknown> | undefined;
      if (serverFacts) {
        return this.getNestedValue(serverFacts, serverPath);
      }
      return undefined;
    }

    // For other variables, check catalog variables first (code-defined variables)
    if (Object.hasOwn(catalogVariables, variable)) {
      return catalogVariables[variable];
    }

    // Check nested catalog variables
    const catalogValue = this.getNestedValue(catalogVariables, variable);
    if (catalogValue !== undefined) {
      return catalogValue;
    }

    // Fall back to direct fact lookup
    return this.getNestedValue(facts.facts, variable);
  }

  /**
   * Get a nested value from an object using dot notation
   * Uses Object.hasOwn() to prevent prototype pollution attacks
   *
   * @param obj - Object to traverse
   * @param path - Dot-separated path (e.g., "os.family")
   * @returns Value at path or undefined
   */
  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split(".");
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current !== "object") {
        return undefined;
      }
      // Use Object.hasOwn to prevent prototype pollution
      if (!Object.hasOwn(current as Record<string, unknown>, part)) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }


  /**
   * Parse lookup_options from a hieradata file
   *
   * @param filePath - Path to hieradata file
   * @returns Map of key to lookup options
   */
  async parseLookupOptions(filePath: string): Promise<Map<string, LookupOptions>> {
    const fullPath = this.resolvePath(filePath);
    const lookupOptionsMap = new Map<string, LookupOptions>();

    if (!fs.existsSync(fullPath)) {
      return lookupOptionsMap;
    }

    let content: string;
    try {
      content = fs.readFileSync(fullPath, "utf-8");
    } catch {
      return lookupOptionsMap;
    }

    let data: unknown;
    try {
      data = parseYaml(content);
    } catch {
      return lookupOptionsMap;
    }

    if (!data || typeof data !== "object") {
      return lookupOptionsMap;
    }

    const dataObj = data as Record<string, unknown>;
    const lookupOptions = dataObj["lookup_options"];

    if (!lookupOptions || typeof lookupOptions !== "object") {
      return lookupOptionsMap;
    }

    const optionsObj = lookupOptions as Record<string, unknown>;

    for (const [key, options] of Object.entries(optionsObj)) {
      if (options && typeof options === "object") {
        const parsedOptions = this.parseSingleLookupOptions(options as Record<string, unknown>);
        if (parsedOptions) {
          lookupOptionsMap.set(key, parsedOptions);
        }
      }
    }

    return lookupOptionsMap;
  }

  /**
   * Parse lookup options from content string
   *
   * @param content - YAML content string
   * @returns Map of key to lookup options
   */
  parseLookupOptionsFromContent(content: string): Map<string, LookupOptions> {
    const lookupOptionsMap = new Map<string, LookupOptions>();

    let data: unknown;
    try {
      data = parseYaml(content);
    } catch {
      return lookupOptionsMap;
    }

    if (!data || typeof data !== "object") {
      return lookupOptionsMap;
    }

    const dataObj = data as Record<string, unknown>;
    const lookupOptions = dataObj["lookup_options"];

    if (!lookupOptions || typeof lookupOptions !== "object") {
      return lookupOptionsMap;
    }

    const optionsObj = lookupOptions as Record<string, unknown>;

    for (const [key, options] of Object.entries(optionsObj)) {
      if (options && typeof options === "object") {
        const parsedOptions = this.parseSingleLookupOptions(options as Record<string, unknown>);
        if (parsedOptions) {
          lookupOptionsMap.set(key, parsedOptions);
        }
      }
    }

    return lookupOptionsMap;
  }


  /**
   * Parse a single lookup options object
   *
   * @param options - Raw options object
   * @returns Parsed lookup options or undefined
   */
  private parseSingleLookupOptions(options: Record<string, unknown>): LookupOptions | undefined {
    const result: LookupOptions = {};
    let hasValidOption = false;

    // Parse merge strategy
    if (typeof options.merge === "string") {
      const merge = options.merge.toLowerCase();
      if (this.isValidLookupMethod(merge)) {
        result.merge = merge;
        hasValidOption = true;
      }
    } else if (typeof options.merge === "object" && options.merge !== null) {
      // Handle merge as object with strategy
      const mergeObj = options.merge as Record<string, unknown>;
      if (typeof mergeObj.strategy === "string") {
        const strategy = mergeObj.strategy.toLowerCase();
        if (this.isValidLookupMethod(strategy)) {
          result.merge = strategy;
          hasValidOption = true;
        }
      }
    }

    // Parse convert_to
    if (typeof options.convert_to === "string") {
      const convertTo = options.convert_to;
      if (convertTo === "Array" || convertTo === "Hash") {
        result.convert_to = convertTo;
        hasValidOption = true;
      }
    }

    // Parse knockout_prefix
    if (typeof options.knockout_prefix === "string") {
      result.knockout_prefix = options.knockout_prefix;
      hasValidOption = true;
    }

    return hasValidOption ? result : undefined;
  }

  /**
   * Check if a string is a valid lookup method
   *
   * @param method - Method string to check
   * @returns true if valid
   */
  private isValidLookupMethod(method: string): method is LookupMethod {
    return ["first", "unique", "hash", "deep"].includes(method);
  }

  /**
   * Resolve a path relative to the control repository
   *
   * @param filePath - Path to resolve
   * @returns Absolute path
   */
  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.controlRepoPath, filePath);
  }

  /**
   * Get the control repository path
   *
   * @returns Control repository path
   */
  getControlRepoPath(): string {
    return this.controlRepoPath;
  }

  /**
   * Serialize a HieraConfig back to YAML string
   *
   * @param config - Hiera configuration
   * @returns YAML string
   */
  serializeConfig(config: HieraConfig): string {
    const { stringify } = require("yaml") as { stringify: (obj: unknown) => string };
    return stringify(config);
  }
}
