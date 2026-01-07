/**
 * HieraResolver
 *
 * Resolves Hiera keys using the configured hierarchy and node facts.
 * Supports all lookup methods: first, unique, hash, deep.
 * Tracks which hierarchy level provided the value and records all values from all levels.
 * Optionally uses catalog compilation for code-defined variable resolution.
 */

import * as fs from "fs";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import type {
  HieraConfig,
  HierarchyLevel,
  HieraResolution,
  HieraKeyLocation,
  LookupMethod,
  LookupOptions,
  ResolveOptions,
  MergeOptions,
  Facts,
} from "./types";
import { HieraParser } from "./HieraParser";

/**
 * Options for catalog-aware resolution
 */
export interface CatalogAwareResolveOptions extends ResolveOptions {
  /** Variables extracted from catalog compilation */
  catalogVariables?: Record<string, unknown>;
  /** Warnings from catalog compilation */
  catalogWarnings?: string[];
}

/**
 * HieraResolver class for resolving Hiera keys
 */
export class HieraResolver {
  private controlRepoPath: string;
  private parser: HieraParser;
  private lookupOptionsCache = new Map<string, Map<string, LookupOptions>>();

  constructor(controlRepoPath: string) {
    this.controlRepoPath = controlRepoPath;
    this.parser = new HieraParser(controlRepoPath);
  }

  /**
   * Resolve a Hiera key using the hierarchy and facts
   *
   * @param key - The Hiera key to resolve
   * @param facts - Node facts for interpolation
   * @param config - Hiera configuration
   * @param options - Optional resolve options (including catalog variables)
   * @returns Resolution result with value and metadata
   */
  resolve(
    key: string,
    facts: Facts,
    config: HieraConfig,
    options?: CatalogAwareResolveOptions
  ): Promise<HieraResolution> {
    // Collect all values from all hierarchy levels
    const allValues: HieraKeyLocation[] = [];
    const interpolatedVariables: Record<string, unknown> = {};

    // Get lookup options for this key (from hieradata or options parameter)
    const lookupOptions = this.getLookupOptionsForKey(key, config, facts);
    const lookupMethod = options?.lookupMethod ?? lookupOptions?.merge ?? "first";
    const mergeOptions = options?.mergeOptions ?? this.buildMergeOptions(lookupOptions);

    // Merge catalog variables with facts for interpolation
    const catalogVariables = options?.catalogVariables ?? {};

    // Iterate through hierarchy levels
    for (const level of config.hierarchy) {
      const levelValues = this.resolveFromLevel(key, level, config, facts, catalogVariables);

      for (const location of levelValues) {
        // Interpolate the value using both facts and catalog variables
        const { value: interpolatedValue, variables } = this.interpolateValueWithCatalog(
          location.value,
          facts,
          catalogVariables
        );

        // Track interpolated variables
        Object.assign(interpolatedVariables, variables);

        allValues.push({
          ...location,
          value: interpolatedValue,
        });
      }
    }

    // If no values found, return not found result
    if (allValues.length === 0) {
      return Promise.resolve(this.createNotFoundResult(key, lookupMethod, options?.defaultValue));
    }

    // Apply lookup method to get final value
    const resolvedValue = this.applyLookupMethod(
      allValues.map(v => v.value),
      lookupMethod,
      mergeOptions
    );

    // Find the source of the resolved value (first match for 'first', all for merge)
    const sourceLocation = allValues[0];

    const result: HieraResolution = {
      key,
      resolvedValue,
      lookupMethod,
      sourceFile: sourceLocation.file,
      hierarchyLevel: sourceLocation.hierarchyLevel,
      allValues,
      interpolatedVariables: Object.keys(interpolatedVariables).length > 0
        ? interpolatedVariables
        : undefined,
      found: true,
    };

    // Add catalog warnings if present
    if (options?.catalogWarnings && options.catalogWarnings.length > 0) {
      // Store warnings in interpolatedVariables for now (could add dedicated field later)
      result.interpolatedVariables = {
        ...result.interpolatedVariables,
        __catalogWarnings: options.catalogWarnings,
      };
    }

    return Promise.resolve(result);
  }


  /**
   * Resolve a key from a single hierarchy level
   *
   * @param key - The key to resolve
   * @param level - Hierarchy level to search
   * @param config - Hiera configuration
   * @param facts - Node facts
   * @param catalogVariables - Variables from catalog compilation
   * @returns Array of key locations found in this level
   */
  private resolveFromLevel(
    key: string,
    level: HierarchyLevel,
    config: HieraConfig,
    facts: Facts,
    catalogVariables: Record<string, unknown> = {}
  ): HieraKeyLocation[] {
    const locations: HieraKeyLocation[] = [];
    const datadir = level.datadir ?? config.defaults?.datadir ?? "data";
    const paths = this.getLevelPaths(level);

    for (const pathTemplate of paths) {
      // Interpolate the path with facts and catalog variables
      const interpolatedPath = this.parser.interpolatePath(pathTemplate, facts, catalogVariables);
      const fullPath = this.resolvePath(path.join(datadir, interpolatedPath));

      // Try to read and parse the file
      const value = this.getKeyFromFile(fullPath, key);

      if (value !== undefined) {
        locations.push({
          file: path.join(datadir, interpolatedPath),
          hierarchyLevel: level.name,
          lineNumber: this.findKeyLineNumber(fullPath, key),
          value,
        });
      }
    }

    return locations;
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
   * Get a key's value from a hieradata file
   *
   * @param filePath - Path to the hieradata file
   * @param key - Key to look up
   * @returns Value or undefined if not found
   */
  private getKeyFromFile(filePath: string, key: string): unknown {
    if (!fs.existsSync(filePath)) {
      return undefined;
    }

    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      return undefined;
    }

    let data: unknown;
    try {
      data = parseYaml(content);
    } catch {
      return undefined;
    }

    if (!data || typeof data !== "object") {
      return undefined;
    }

    return this.getNestedValue(data as Record<string, unknown>, key);
  }

  /**
   * Get a nested value from an object using dot notation
   * Uses Object.hasOwn() to prevent prototype pollution attacks
   *
   * @param obj - Object to traverse
   * @param key - Dot-separated key path
   * @returns Value at path or undefined
   */
  private getNestedValue(obj: Record<string, unknown>, key: string): unknown {
    // First try direct key lookup (for keys like "profile::nginx::port")
    // Use Object.hasOwn to prevent prototype pollution
    if (Object.hasOwn(obj, key)) {
      return obj[key];
    }

    // Then try nested lookup using dot notation
    const parts = key.split(".");
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
   * Find the line number where a key is defined in a file
   *
   * @param filePath - Path to the file
   * @param key - Key to find
   * @returns Line number (1-based) or 0 if not found
   */
  private findKeyLineNumber(filePath: string, key: string): number {
    if (!fs.existsSync(filePath)) {
      return 0;
    }

    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      return 0;
    }

    const lines = content.split("\n");

    // For direct keys (like "profile::nginx::port"), search for the key directly
    const directKeyPattern = new RegExp(`^\\s*["']?${this.escapeRegex(key)}["']?\\s*:`);

    for (let i = 0; i < lines.length; i++) {
      if (directKeyPattern.test(lines[i])) {
        return i + 1;
      }
    }

    // For nested keys, search for the last part
    const parts = key.split(".");
    const lastPart = parts[parts.length - 1];
    const nestedKeyPattern = new RegExp(`^\\s*["']?${this.escapeRegex(lastPart)}["']?\\s*:`);

    for (let i = 0; i < lines.length; i++) {
      if (nestedKeyPattern.test(lines[i])) {
        return i + 1;
      }
    }

    return 0;
  }

  /**
   * Escape special regex characters in a string
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }


  /**
   * Apply the lookup method to combine values
   *
   * @param values - Array of values from hierarchy levels
   * @param method - Lookup method to apply
   * @param mergeOptions - Options for merge operations
   * @returns Combined value
   */
  private applyLookupMethod(
    values: unknown[],
    method: LookupMethod,
    mergeOptions?: MergeOptions
  ): unknown {
    if (values.length === 0) {
      return undefined;
    }

    switch (method) {
      case "first":
        return values[0];

      case "unique":
        return this.mergeUnique(values, mergeOptions);

      case "hash":
        return this.mergeHash(values, mergeOptions);

      case "deep":
        return this.mergeDeep(values, mergeOptions);

      default:
        return values[0];
    }
  }

  /**
   * Merge values using 'unique' strategy
   * Combines arrays, removing duplicates
   *
   * @param values - Values to merge
   * @param mergeOptions - Merge options
   * @returns Merged array with unique values
   */
  private mergeUnique(values: unknown[], mergeOptions?: MergeOptions): unknown[] {
    const result: unknown[] = [];
    const seen = new Set<string>();
    const knockoutPrefix = mergeOptions?.knockoutPrefix;

    for (const value of values) {
      if (Array.isArray(value)) {
        for (const item of value) {
          // Handle knockout prefix
          if (knockoutPrefix && typeof item === "string" && item.startsWith(knockoutPrefix)) {
            const knockedOut = item.slice(knockoutPrefix.length);
            seen.add(JSON.stringify(knockedOut));
            continue;
          }

          const key = JSON.stringify(item);
          if (!seen.has(key)) {
            seen.add(key);
            result.push(item);
          }
        }
      } else if (value !== undefined && value !== null) {
        const key = JSON.stringify(value);
        if (!seen.has(key)) {
          seen.add(key);
          result.push(value);
        }
      }
    }

    if (mergeOptions?.sortMergedArrays) {
      result.sort((a, b) => {
        const aStr = JSON.stringify(a);
        const bStr = JSON.stringify(b);
        return aStr.localeCompare(bStr);
      });
    }

    return result;
  }

  /**
   * Merge values using 'hash' strategy
   * Combines hashes, with higher priority values winning
   *
   * @param values - Values to merge
   * @param mergeOptions - Merge options
   * @returns Merged hash
   */
  private mergeHash(values: unknown[], mergeOptions?: MergeOptions): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const knockoutPrefix = mergeOptions?.knockoutPrefix;

    // Process in reverse order so higher priority (earlier) values win
    for (let i = values.length - 1; i >= 0; i--) {
      const value = values[i];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
          // Handle knockout prefix
          if (knockoutPrefix && key.startsWith(knockoutPrefix)) {
            const knockedOut = key.slice(knockoutPrefix.length);
            if (Object.prototype.hasOwnProperty.call(result, knockedOut)) {
              // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
              delete result[knockedOut];
            }
            continue;
          }
          result[key] = val;
        }
      }
    }

    return result;
  }

  /**
   * Merge values using 'deep' strategy
   * Recursively merges hashes and arrays
   *
   * @param values - Values to merge
   * @param mergeOptions - Merge options
   * @returns Deep merged value
   */
  private mergeDeep(values: unknown[], mergeOptions?: MergeOptions): unknown {
    if (values.length === 0) {
      return undefined;
    }

    const knockoutPrefix = mergeOptions?.knockoutPrefix;

    // Start with the last value (lowest priority) and merge upward
    let result: unknown = this.deepClone(values[values.length - 1]);

    for (let i = values.length - 2; i >= 0; i--) {
      result = this.deepMergeTwo(result, values[i], knockoutPrefix, mergeOptions);
    }

    return result;
  }

  /**
   * Deep merge two values
   *
   * @param base - Base value
   * @param override - Override value
   * @param knockoutPrefix - Prefix for knockout entries
   * @param mergeOptions - Merge options
   * @returns Merged value
   */
  private deepMergeTwo(
    base: unknown,
    override: unknown,
    knockoutPrefix?: string,
    mergeOptions?: MergeOptions
  ): unknown {
    // If override is null/undefined, return base
    if (override === null || override === undefined) {
      return base;
    }

    // If base is null/undefined, return override
    if (base === null || base === undefined) {
      return this.deepClone(override);
    }

    // If both are arrays
    if (Array.isArray(base) && Array.isArray(override)) {
      if (mergeOptions?.mergeHashArrays) {
        // Merge arrays element by element
        const result = Array.isArray(base) ? [...(base as unknown[])] : [];
        for (const item of override) {
          if (knockoutPrefix && typeof item === "string" && item.startsWith(knockoutPrefix)) {
            const knockedOut = item.slice(knockoutPrefix.length);
            const idx = result.findIndex(r => JSON.stringify(r) === JSON.stringify(knockedOut));
            if (idx !== -1) {
              result.splice(idx, 1);
            }
          } else if (!result.some(r => JSON.stringify(r) === JSON.stringify(item))) {
            result.push(item);
          }
        }
        return result;
      }
      // Default: override replaces base for arrays
      return this.deepClone(override);
    }

    // If both are objects
    if (
      typeof base === "object" &&
      typeof override === "object" &&
      !Array.isArray(base) &&
      !Array.isArray(override)
    ) {
      const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };

      for (const [key, val] of Object.entries(override as Record<string, unknown>)) {
        // Handle knockout prefix
        if (knockoutPrefix && key.startsWith(knockoutPrefix)) {
          const knockedOut = key.slice(knockoutPrefix.length);
          if (Object.prototype.hasOwnProperty.call(result, knockedOut)) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete result[knockedOut];
          }
          continue;
        }

        if (key in result) {
          result[key] = this.deepMergeTwo(result[key], val, knockoutPrefix, mergeOptions);
        } else {
          result[key] = this.deepClone(val);
        }
      }

      return result;
    }

    // For primitives, override wins
    return this.deepClone(override);
  }

  /**
   * Deep clone a value
   */
  private deepClone<T>(value: T): T {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof value !== "object") {
      return value;
    }
    return JSON.parse(JSON.stringify(value)) as T;
  }


  /**
   * Get lookup options for a key from hieradata files
   *
   * @param key - The key to get options for
   * @param config - Hiera configuration
   * @param facts - Node facts
   * @returns Lookup options or undefined
   */
  private getLookupOptionsForKey(
    key: string,
    config: HieraConfig,
    facts: Facts
  ): LookupOptions | undefined {
    // Check each hierarchy level for lookup_options
    for (const level of config.hierarchy) {
      const datadir = level.datadir ?? config.defaults?.datadir ?? "data";
      const paths = this.getLevelPaths(level);

      for (const pathTemplate of paths) {
        const interpolatedPath = this.parser.interpolatePath(pathTemplate, facts);
        const fullPath = this.resolvePath(path.join(datadir, interpolatedPath));

        // Check cache first
        const cacheKey = fullPath;
        let lookupOptionsMap = this.lookupOptionsCache.get(cacheKey);

        if (!lookupOptionsMap) {
          lookupOptionsMap = this.parser.parseLookupOptions(fullPath);
          this.lookupOptionsCache.set(cacheKey, lookupOptionsMap);
        }

        // Check for exact key match
        if (lookupOptionsMap.has(key)) {
          return lookupOptionsMap.get(key);
        }

        // Check for pattern matches (e.g., "profile::*")
        for (const [pattern, options] of lookupOptionsMap) {
          if (this.matchesPattern(key, pattern)) {
            return options;
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Check if a key matches a pattern (supports * wildcard)
   *
   * @param key - Key to check
   * @param pattern - Pattern to match against
   * @returns True if matches
   */
  private matchesPattern(key: string, pattern: string): boolean {
    if (!pattern.includes("*")) {
      return key === pattern;
    }

    // Convert pattern to regex
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(key);
  }

  /**
   * Build merge options from lookup options
   *
   * @param lookupOptions - Lookup options
   * @returns Merge options
   */
  private buildMergeOptions(lookupOptions?: LookupOptions): MergeOptions | undefined {
    if (!lookupOptions?.merge) {
      return undefined;
    }

    return {
      strategy: lookupOptions.merge,
      knockoutPrefix: lookupOptions.knockout_prefix,
    };
  }

  /**
   * Interpolate variables in a value
   *
   * Supports:
   * - %{facts.xxx} - Hiera 5 fact syntax
   * - %{::xxx} - Legacy top-scope variable syntax
   * - %{xxx} - Simple variable syntax
   *
   * @param value - Value to interpolate
   * @param facts - Node facts
   * @returns Interpolated value and variables used
   */
  interpolateValue(
    value: unknown,
    facts: Facts
  ): { value: unknown; variables: Record<string, unknown> } {
    return this.interpolateValueWithCatalog(value, facts, {});
  }

  /**
   * Interpolate variables in a value using both facts and catalog variables
   *
   * Supports:
   * - %{facts.xxx} - Hiera 5 fact syntax
   * - %{::xxx} - Legacy top-scope variable syntax
   * - %{xxx} - Simple variable syntax (checks catalog variables first, then facts)
   *
   * @param value - Value to interpolate
   * @param facts - Node facts
   * @param catalogVariables - Variables from catalog compilation
   * @returns Interpolated value and variables used
   */
  interpolateValueWithCatalog(
    value: unknown,
    facts: Facts,
    catalogVariables: Record<string, unknown>
  ): { value: unknown; variables: Record<string, unknown> } {
    const variables: Record<string, unknown> = {};

    if (typeof value === "string") {
      const interpolated = this.interpolateStringWithCatalog(value, facts, catalogVariables, variables);
      return { value: interpolated, variables };
    }

    if (Array.isArray(value)) {
      const interpolated = value.map(item => {
        const result = this.interpolateValueWithCatalog(item, facts, catalogVariables);
        Object.assign(variables, result.variables);
        return result.value;
      });
      return { value: interpolated, variables };
    }

    if (value && typeof value === "object") {
      const interpolated: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        const result = this.interpolateValueWithCatalog(val, facts, catalogVariables);
        Object.assign(variables, result.variables);
        interpolated[key] = result.value;
      }
      return { value: interpolated, variables };
    }

    return { value, variables };
  }

  /**
   * Interpolate variables in a string using both facts and catalog variables
   *
   * @param str - String to interpolate
   * @param facts - Node facts
   * @param catalogVariables - Variables from catalog compilation
   * @param variables - Object to track used variables
   * @returns Interpolated string
   */
  private interpolateStringWithCatalog(
    str: string,
    facts: Facts,
    catalogVariables: Record<string, unknown>,
    variables: Record<string, unknown>
  ): string {
    const variablePattern = /%\{([^}]+)\}/g;

    return str.replace(variablePattern, (match, variable: string) => {
      const trimmedVar = variable.trim();
      const value = this.resolveVariableWithCatalog(trimmedVar, facts, catalogVariables);

      if (value !== undefined) {
        variables[trimmedVar] = value;
        return typeof value === 'string' ? value : JSON.stringify(value);
      }

      // Return original if not resolved
      return match;
    });
  }

  /**
   * Resolve a variable reference to its value, checking catalog variables first
   *
   * @param variable - Variable reference
   * @param facts - Node facts
   * @param catalogVariables - Variables from catalog compilation
   * @returns Resolved value or undefined
   */
  private resolveVariableWithCatalog(
    variable: string,
    facts: Facts,
    catalogVariables: Record<string, unknown>
  ): unknown {
    // Handle facts.xxx syntax - always use facts
    if (variable.startsWith("facts.")) {
      const factPath = variable.slice(6);
      return this.getNestedFactValue(facts.facts, factPath);
    }

    // Handle ::xxx legacy syntax - always use facts
    if (variable.startsWith("::")) {
      const factName = variable.slice(2);
      return this.getNestedFactValue(facts.facts, factName);
    }

    // Handle trusted.xxx syntax
    if (variable.startsWith("trusted.")) {
      const trustedPath = variable.slice(8);
      const trusted = facts.facts.trusted as Record<string, unknown> | undefined;
      if (trusted) {
        return this.getNestedFactValue(trusted, trustedPath);
      }
      return undefined;
    }

    // Handle server_facts.xxx syntax
    if (variable.startsWith("server_facts.")) {
      const serverPath = variable.slice(13);
      const serverFacts = facts.facts.server_facts as Record<string, unknown> | undefined;
      if (serverFacts) {
        return this.getNestedFactValue(serverFacts, serverPath);
      }
      return undefined;
    }

    // For other variables, check catalog variables first (code-defined variables)
    // This allows Puppet code variables to override facts
    if (Object.hasOwn(catalogVariables, variable)) {
      return catalogVariables[variable];
    }

    // Check nested catalog variables (e.g., profile::nginx::port)
    const catalogValue = this.getNestedValue(catalogVariables, variable);
    if (catalogValue !== undefined) {
      return catalogValue;
    }

    // Fall back to direct fact lookup
    return this.getNestedFactValue(facts.facts, variable);
  }

  /**
   * Get a nested value from facts using dot notation
   * Uses Object.hasOwn() to prevent prototype pollution attacks
   *
   * @param obj - Object to traverse
   * @param path - Dot-separated path
   * @returns Value at path or undefined
   */
  private getNestedFactValue(obj: Record<string, unknown>, path: string): unknown {
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
   * Create a not-found result for a key
   *
   * @param key - The key that was not found
   * @param lookupMethod - The lookup method used
   * @param defaultValue - Optional default value
   * @returns HieraResolution indicating not found
   */
  private createNotFoundResult(
    key: string,
    lookupMethod: LookupMethod,
    defaultValue?: unknown
  ): HieraResolution {
    return {
      key,
      resolvedValue: defaultValue,
      lookupMethod,
      sourceFile: "",
      hierarchyLevel: "",
      allValues: [],
      found: false,
    };
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
   * Clear the lookup options cache
   */
  clearCache(): void {
    this.lookupOptionsCache.clear();
  }

  /**
   * Get the control repository path
   *
   * @returns Control repository path
   */
  getControlRepoPath(): string {
    return this.controlRepoPath;
  }
}
