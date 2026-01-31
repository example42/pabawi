/**
 * Plugin Loader
 *
 * Responsible for discovering, loading, validating, and managing plugins
 * in the v1.0.0 modular architecture. Supports:
 * - Built-in plugins (backend/src/integrations/*)
 * - External plugins (node_modules/@pabawi-plugins/*)
 * - Local plugins (custom paths)
 * - Dependency resolution with topological sorting
 *
 * @module integrations/PluginLoader
 * @version 1.0.0
 */

import { promises as fs } from "fs";
import path from "path";
import type {
  BasePluginInterface,
  PluginCapability,
  PluginWidget,
} from "./types";
import { LoggerService } from "../services/LoggerService";

/**
 * Plugin discovery result from scanning directories
 */
export interface PluginDiscoveryResult {
  /** Path to the plugin directory or module */
  path: string;
  /** How the plugin was discovered */
  source: "builtin" | "external" | "local";
  /** Plugin name (from directory or package.json) */
  name: string;
  /** Whether a package.json was found */
  hasPackageJson: boolean;
  /** Plugin entry point path */
  entryPoint: string;
}

/**
 * Loaded plugin with runtime metadata
 */
export interface LoadedPlugin {
  /** Plugin instance */
  instance: BasePluginInterface;
  /** Discovery information */
  discovery: PluginDiscoveryResult;
  /** When the plugin was loaded */
  loadedAt: string;
  /** Load duration in milliseconds */
  loadDurationMs: number;
  /** Validation warnings (non-fatal issues) */
  warnings: string[];
}

/**
 * Plugin validation result
 */
export interface PluginValidationResult {
  /** Whether the plugin passed validation */
  valid: boolean;
  /** Validation errors (fatal) */
  errors: string[];
  /** Validation warnings (non-fatal) */
  warnings: string[];
}

/**
 * Options for loading plugins
 */
export interface PluginLoaderOptions {
  /** Paths to scan for built-in plugins */
  builtinPaths?: string[];
  /** Paths to scan for external plugins (node_modules) */
  externalPaths?: string[];
  /** Additional local plugin paths */
  localPaths?: string[];
  /** Whether to fail on plugin validation errors */
  strictValidation?: boolean;
  /** Plugin names to skip loading */
  skipPlugins?: string[];
  /** Logger instance */
  logger?: LoggerService;
}

/**
 * Default paths for plugin discovery
 */
const DEFAULT_BUILTIN_PATHS = [
  path.join(__dirname, "bolt"),
  path.join(__dirname, "puppetdb"),
  path.join(__dirname, "puppetserver"),
  path.join(__dirname, "hiera"),
];

/**
 * Plugin factory function type
 * Plugins export a createPlugin function that returns the plugin instance
 */
export type PluginFactory = () => BasePluginInterface | Promise<BasePluginInterface>;

/**
 * Plugin module export structure
 */
export interface PluginModule {
  /** Factory function to create plugin instance */
  createPlugin?: PluginFactory;
  /** Direct plugin export (alternative to factory) */
  default?: BasePluginInterface | PluginFactory;
  /** Plugin class (for class-based plugins) */
  Plugin?: new () => BasePluginInterface;
}

/**
 * Plugin Loader
 *
 * Discovers, loads, validates, and manages plugins for the v1.0.0 architecture.
 *
 * @example
 * ```typescript
 * const loader = new PluginLoader({
 *   builtinPaths: ['./integrations/bolt', './integrations/puppetdb'],
 *   externalPaths: ['./node_modules/@pabawi-plugins'],
 *   logger: loggerService
 * });
 *
 * // Discover plugins
 * const discovered = await loader.discover();
 *
 * // Load all plugins
 * const loaded = await loader.loadAll();
 *
 * // Load specific plugin
 * const boltPlugin = await loader.loadPlugin('./integrations/bolt');
 * ```
 */
export class PluginLoader {
  private logger: LoggerService;
  private options: Required<PluginLoaderOptions>;
  private loadedPlugins = new Map<string, LoadedPlugin>();

  constructor(options: PluginLoaderOptions = {}) {
    this.logger = options.logger ?? new LoggerService();
    this.options = {
      builtinPaths: options.builtinPaths ?? DEFAULT_BUILTIN_PATHS,
      externalPaths: options.externalPaths ?? [],
      localPaths: options.localPaths ?? [],
      strictValidation: options.strictValidation ?? false,
      skipPlugins: options.skipPlugins ?? [],
      logger: this.logger,
    };

    this.logger.debug("PluginLoader created", {
      component: "PluginLoader",
      metadata: {
        builtinPaths: this.options.builtinPaths.length,
        externalPaths: this.options.externalPaths.length,
        localPaths: this.options.localPaths.length,
      },
    });
  }

  /**
   * Discover all available plugins without loading them
   *
   * @returns Array of discovered plugin information
   */
  async discover(): Promise<PluginDiscoveryResult[]> {
    const results: PluginDiscoveryResult[] = [];

    // Discover built-in plugins
    for (const pluginPath of this.options.builtinPaths) {
      try {
        const discovery = await this.discoverPlugin(pluginPath, "builtin");
        if (discovery) {
          results.push(discovery);
        }
      } catch (error) {
        this.logger.warn(`Failed to discover built-in plugin at ${pluginPath}`, {
          component: "PluginLoader",
          operation: "discover",
          metadata: { path: pluginPath, error: String(error) },
        });
      }
    }

    // Discover external plugins (@pabawi-plugins/*)
    for (const basePath of this.options.externalPaths) {
      try {
        const externalPlugins = await this.discoverExternalPlugins(basePath);
        results.push(...externalPlugins);
      } catch (error) {
        this.logger.warn(`Failed to scan external plugins at ${basePath}`, {
          component: "PluginLoader",
          operation: "discover",
          metadata: { path: basePath, error: String(error) },
        });
      }
    }

    // Discover local plugins
    for (const pluginPath of this.options.localPaths) {
      try {
        const discovery = await this.discoverPlugin(pluginPath, "local");
        if (discovery) {
          results.push(discovery);
        }
      } catch (error) {
        this.logger.warn(`Failed to discover local plugin at ${pluginPath}`, {
          component: "PluginLoader",
          operation: "discover",
          metadata: { path: pluginPath, error: String(error) },
        });
      }
    }

    this.logger.info(`Discovered ${results.length} plugins`, {
      component: "PluginLoader",
      operation: "discover",
      metadata: {
        total: results.length,
        builtin: results.filter((r) => r.source === "builtin").length,
        external: results.filter((r) => r.source === "external").length,
        local: results.filter((r) => r.source === "local").length,
      },
    });

    return results;
  }

  /**
   * Load all discovered plugins
   *
   * @returns Array of loaded plugins, sorted by dependency order
   */
  async loadAll(): Promise<LoadedPlugin[]> {
    const discovered = await this.discover();
    const loaded: LoadedPlugin[] = [];
    const errors: { name: string; error: string }[] = [];

    for (const discovery of discovered) {
      if (this.options.skipPlugins.includes(discovery.name)) {
        this.logger.info(`Skipping plugin: ${discovery.name}`, {
          component: "PluginLoader",
          operation: "loadAll",
          metadata: { pluginName: discovery.name, reason: "in skipPlugins" },
        });
        continue;
      }

      try {
        const plugin = await this.loadPlugin(discovery.path);
        if (plugin) {
          loaded.push(plugin);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({ name: discovery.name, error: errorMessage });
        this.logger.error(`Failed to load plugin: ${discovery.name}`, {
          component: "PluginLoader",
          operation: "loadAll",
          metadata: { pluginName: discovery.name, error: errorMessage },
        });
      }
    }

    // Resolve dependencies and sort
    const sorted = this.resolveDependencies(loaded);

    this.logger.info(`Loaded ${sorted.length} plugins`, {
      component: "PluginLoader",
      operation: "loadAll",
      metadata: {
        loaded: sorted.length,
        errors: errors.length,
        plugins: sorted.map((p) => p.instance.metadata.name),
      },
    });

    if (errors.length > 0) {
      this.logger.warn(`${errors.length} plugins failed to load`, {
        component: "PluginLoader",
        operation: "loadAll",
        metadata: { errors },
      });
    }

    return sorted;
  }

  /**
   * Load a single plugin from a path
   *
   * @param pluginPath - Path to the plugin directory or module
   * @returns Loaded plugin or null if loading failed
   */
  async loadPlugin(pluginPath: string): Promise<LoadedPlugin | null> {
    const startTime = Date.now();

    // Check if already loaded
    const existing = this.loadedPlugins.get(pluginPath);
    if (existing) {
      this.logger.debug(`Plugin already loaded: ${existing.instance.metadata.name}`, {
        component: "PluginLoader",
        operation: "loadPlugin",
        metadata: { path: pluginPath },
      });
      return existing;
    }

    // Discover plugin info
    const discovery = await this.discoverPlugin(pluginPath, "local");
    if (!discovery) {
      this.logger.warn(`No plugin found at path: ${pluginPath}`, {
        component: "PluginLoader",
        operation: "loadPlugin",
        metadata: { path: pluginPath },
      });
      return null;
    }

    // Load the module
    let pluginModule: PluginModule;
    try {
      // Try different entry points
      const entryPoints = [
        discovery.entryPoint,
        path.join(pluginPath, "index.ts"),
        path.join(pluginPath, "index.js"),
        path.join(pluginPath, "plugin.ts"),
        path.join(pluginPath, "plugin.js"),
      ];

      let loaded = false;
      for (const entryPoint of entryPoints) {
        try {
          // Use require for .js/.ts files
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          pluginModule = require(entryPoint);
          loaded = true;
          break;
        } catch {
          // Try next entry point
        }
      }

      if (!loaded) {
        throw new Error(`No valid entry point found for plugin at ${pluginPath}`);
      }
    } catch (error) {
      this.logger.error(`Failed to load plugin module: ${pluginPath}`, {
        component: "PluginLoader",
        operation: "loadPlugin",
        metadata: { path: pluginPath, error: String(error) },
      });
      return null;
    }

    // Get plugin instance from module
    let instance: BasePluginInterface;
    try {
      instance = await this.getPluginInstance(pluginModule!);
    } catch (error) {
      this.logger.error(`Failed to get plugin instance: ${pluginPath}`, {
        component: "PluginLoader",
        operation: "loadPlugin",
        metadata: { path: pluginPath, error: String(error) },
      });
      return null;
    }

    // Validate plugin
    const validation = this.validatePlugin(instance);
    if (!validation.valid) {
      if (this.options.strictValidation) {
        this.logger.error(`Plugin validation failed: ${discovery.name}`, {
          component: "PluginLoader",
          operation: "loadPlugin",
          metadata: { path: pluginPath, errors: validation.errors },
        });
        return null;
      } else {
        this.logger.warn(`Plugin has validation errors: ${discovery.name}`, {
          component: "PluginLoader",
          operation: "loadPlugin",
          metadata: { path: pluginPath, errors: validation.errors },
        });
      }
    }

    const loadDurationMs = Date.now() - startTime;
    const loadedPlugin: LoadedPlugin = {
      instance,
      discovery,
      loadedAt: new Date().toISOString(),
      loadDurationMs,
      warnings: validation.warnings,
    };

    this.loadedPlugins.set(pluginPath, loadedPlugin);
    this.loadedPlugins.set(instance.metadata.name, loadedPlugin);

    this.logger.info(`Loaded plugin: ${instance.metadata.name}`, {
      component: "PluginLoader",
      operation: "loadPlugin",
      metadata: {
        pluginName: instance.metadata.name,
        version: instance.metadata.version,
        capabilities: instance.capabilities.length,
        widgets: instance.widgets?.length ?? 0,
        loadDurationMs,
      },
    });

    return loadedPlugin;
  }

  /**
   * Validate a plugin instance
   *
   * @param plugin - Plugin instance to validate
   * @returns Validation result with errors and warnings
   */
  validatePlugin(plugin: BasePluginInterface): PluginValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate metadata
    if (!plugin.metadata) {
      errors.push("Missing plugin metadata");
    } else {
      if (!plugin.metadata.name || typeof plugin.metadata.name !== "string") {
        errors.push("Missing or invalid plugin name in metadata");
      }
      if (!plugin.metadata.version || typeof plugin.metadata.version !== "string") {
        errors.push("Missing or invalid plugin version in metadata");
      }
      if (!plugin.metadata.author || typeof plugin.metadata.author !== "string") {
        warnings.push("Missing plugin author in metadata");
      }
      if (!plugin.metadata.description) {
        warnings.push("Missing plugin description in metadata");
      }
      if (!plugin.metadata.integrationType) {
        warnings.push("Missing integration type in metadata");
      }
    }

    // Validate capabilities
    if (!plugin.capabilities || !Array.isArray(plugin.capabilities)) {
      errors.push("Missing or invalid capabilities array");
    } else {
      for (let i = 0; i < plugin.capabilities.length; i++) {
        const cap = plugin.capabilities[i];
        const capErrors = this.validateCapability(cap, i);
        errors.push(...capErrors);
      }
    }

    // Validate widgets if present
    if (plugin.widgets) {
      if (!Array.isArray(plugin.widgets)) {
        errors.push("Invalid widgets - must be an array");
      } else {
        for (let i = 0; i < plugin.widgets.length; i++) {
          const widget = plugin.widgets[i];
          const widgetErrors = this.validateWidget(widget, i);
          warnings.push(...widgetErrors); // Widget issues are warnings, not errors
        }
      }
    }

    // Validate required methods
    if (typeof plugin.initialize !== "function") {
      errors.push("Missing initialize() method");
    }
    if (typeof plugin.healthCheck !== "function") {
      errors.push("Missing healthCheck() method");
    }
    if (typeof plugin.getConfig !== "function") {
      errors.push("Missing getConfig() method");
    }
    if (typeof plugin.isInitialized !== "function") {
      errors.push("Missing isInitialized() method");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Resolve plugin dependencies using topological sort
   *
   * @param plugins - Array of loaded plugins
   * @returns Plugins sorted in dependency order (dependencies first)
   */
  resolveDependencies(plugins: LoadedPlugin[]): LoadedPlugin[] {
    const pluginMap = new Map<string, LoadedPlugin>();
    const graph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Build plugin map and dependency graph
    for (const plugin of plugins) {
      const name = plugin.instance.metadata.name;
      pluginMap.set(name, plugin);
      graph.set(name, []);
      inDegree.set(name, 0);
    }

    // Add edges for dependencies
    for (const plugin of plugins) {
      const name = plugin.instance.metadata.name;
      const deps = plugin.instance.metadata.dependencies ?? [];

      for (const dep of deps) {
        if (pluginMap.has(dep)) {
          graph.get(dep)!.push(name);
          inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
        } else {
          this.logger.warn(
            `Plugin '${name}' depends on '${dep}' which is not loaded`,
            {
              component: "PluginLoader",
              operation: "resolveDependencies",
              metadata: { plugin: name, missingDependency: dep },
            }
          );
        }
      }
    }

    // Kahn's algorithm for topological sort
    const queue: string[] = [];
    const sorted: LoadedPlugin[] = [];

    // Start with plugins that have no dependencies
    for (const [name, degree] of inDegree) {
      if (degree === 0) {
        queue.push(name);
      }
    }

    while (queue.length > 0) {
      const name = queue.shift()!;
      sorted.push(pluginMap.get(name)!);

      for (const dependent of graph.get(name) ?? []) {
        const newDegree = (inDegree.get(dependent) ?? 0) - 1;
        inDegree.set(dependent, newDegree);
        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }

    // Check for cycles
    if (sorted.length !== plugins.length) {
      const missing = plugins
        .filter((p) => !sorted.includes(p))
        .map((p) => p.instance.metadata.name);

      this.logger.error("Circular dependency detected in plugins", {
        component: "PluginLoader",
        operation: "resolveDependencies",
        metadata: { pluginsInCycle: missing },
      });

      // Return unsorted plugins that weren't in the cycle
      return sorted;
    }

    return sorted;
  }

  /**
   * Get a loaded plugin by name
   *
   * @param name - Plugin name
   * @returns Loaded plugin or undefined
   */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.loadedPlugins.get(name);
  }

  /**
   * Get all loaded plugins
   *
   * @returns Map of plugin name to loaded plugin
   */
  getAllPlugins(): Map<string, LoadedPlugin> {
    // Filter to only return by plugin name (not path)
    const byName = new Map<string, LoadedPlugin>();
    for (const [key, plugin] of this.loadedPlugins) {
      if (key === plugin.instance.metadata.name) {
        byName.set(key, plugin);
      }
    }
    return byName;
  }

  /**
   * Unload a plugin
   *
   * @param name - Plugin name
   * @returns true if plugin was unloaded
   */
  async unloadPlugin(name: string): Promise<boolean> {
    const plugin = this.loadedPlugins.get(name);
    if (!plugin) {
      return false;
    }

    // Call shutdown if available
    if (plugin.instance.shutdown) {
      try {
        await plugin.instance.shutdown();
      } catch (error) {
        this.logger.warn(`Error during plugin shutdown: ${name}`, {
          component: "PluginLoader",
          operation: "unloadPlugin",
          metadata: { pluginName: name, error: String(error) },
        });
      }
    }

    // Remove from loaded plugins
    this.loadedPlugins.delete(name);
    this.loadedPlugins.delete(plugin.discovery.path);

    this.logger.info(`Unloaded plugin: ${name}`, {
      component: "PluginLoader",
      operation: "unloadPlugin",
      metadata: { pluginName: name },
    });

    return true;
  }

  /**
   * Reload a plugin
   *
   * @param name - Plugin name
   * @returns Reloaded plugin or null if reload failed
   */
  async reloadPlugin(name: string): Promise<LoadedPlugin | null> {
    const existing = this.loadedPlugins.get(name);
    if (!existing) {
      this.logger.warn(`Cannot reload plugin: ${name} - not loaded`, {
        component: "PluginLoader",
        operation: "reloadPlugin",
        metadata: { pluginName: name },
      });
      return null;
    }

    const pluginPath = existing.discovery.path;

    // Unload existing
    await this.unloadPlugin(name);

    // Clear require cache for the module
    this.clearRequireCache(pluginPath);

    // Reload
    return this.loadPlugin(pluginPath);
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Discover a single plugin at a path
   */
  private async discoverPlugin(
    pluginPath: string,
    source: "builtin" | "external" | "local"
  ): Promise<PluginDiscoveryResult | null> {
    try {
      const stat = await fs.stat(pluginPath);
      if (!stat.isDirectory()) {
        // Might be a direct file reference
        const dir = path.dirname(pluginPath);
        const dirStat = await fs.stat(dir);
        if (dirStat.isDirectory()) {
          return {
            path: dir,
            source,
            name: path.basename(dir),
            hasPackageJson: await this.fileExists(path.join(dir, "package.json")),
            entryPoint: pluginPath,
          };
        }
        return null;
      }

      // Check for package.json
      const packageJsonPath = path.join(pluginPath, "package.json");
      const hasPackageJson = await this.fileExists(packageJsonPath);

      let name = path.basename(pluginPath);
      let entryPoint = path.join(pluginPath, "index.ts");

      if (hasPackageJson) {
        try {
          const packageJson = JSON.parse(
            await fs.readFile(packageJsonPath, "utf-8")
          );
          name = packageJson.name ?? name;
          if (packageJson.main) {
            entryPoint = path.join(pluginPath, packageJson.main);
          }
        } catch {
          // Ignore JSON parse errors
        }
      }

      // Find entry point if not specified
      if (!(await this.fileExists(entryPoint))) {
        const possibleEntryPoints = [
          "index.ts",
          "index.js",
          "plugin.ts",
          "plugin.js",
          `${name}Plugin.ts`,
          `${name}Plugin.js`,
          `${name.charAt(0).toUpperCase()}${name.slice(1)}Plugin.ts`,
        ];

        for (const ep of possibleEntryPoints) {
          const fullPath = path.join(pluginPath, ep);
          if (await this.fileExists(fullPath)) {
            entryPoint = fullPath;
            break;
          }
        }
      }

      return {
        path: pluginPath,
        source,
        name,
        hasPackageJson,
        entryPoint,
      };
    } catch (error) {
      this.logger.debug(`Failed to discover plugin at ${pluginPath}: ${error}`, {
        component: "PluginLoader",
        operation: "discoverPlugin",
      });
      return null;
    }
  }

  /**
   * Discover external plugins in a node_modules-style directory
   */
  private async discoverExternalPlugins(
    basePath: string
  ): Promise<PluginDiscoveryResult[]> {
    const results: PluginDiscoveryResult[] = [];

    try {
      const entries = await fs.readdir(basePath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // Handle scoped packages (@pabawi-plugins/*)
        if (entry.name.startsWith("@")) {
          const scopePath = path.join(basePath, entry.name);
          const scopedEntries = await fs.readdir(scopePath, {
            withFileTypes: true,
          });

          for (const scopedEntry of scopedEntries) {
            if (scopedEntry.isDirectory()) {
              const pluginPath = path.join(scopePath, scopedEntry.name);
              const discovery = await this.discoverPlugin(pluginPath, "external");
              if (discovery) {
                results.push(discovery);
              }
            }
          }
        } else if (entry.name.startsWith("pabawi-plugin-")) {
          // Handle non-scoped plugin packages
          const pluginPath = path.join(basePath, entry.name);
          const discovery = await this.discoverPlugin(pluginPath, "external");
          if (discovery) {
            results.push(discovery);
          }
        }
      }
    } catch (error) {
      this.logger.debug(`Failed to scan external plugins at ${basePath}`, {
        component: "PluginLoader",
        operation: "discoverExternalPlugins",
        metadata: { error: String(error) },
      });
    }

    return results;
  }

  /**
   * Get plugin instance from module exports
   */
  private async getPluginInstance(
    module: PluginModule
  ): Promise<BasePluginInterface> {
    // Try createPlugin factory
    if (typeof module.createPlugin === "function") {
      const result = module.createPlugin();
      return result instanceof Promise ? await result : result;
    }

    // Try default export
    if (module.default) {
      if (typeof module.default === "function") {
        const result = (module.default)();
        return result instanceof Promise ? await result : result;
      }
      return module.default;
    }

    // Try Plugin class
    if (module.Plugin && typeof module.Plugin === "function") {
      return new module.Plugin();
    }

    throw new Error(
      "Plugin module must export createPlugin(), default, or Plugin class"
    );
  }

  /**
   * Validate a single capability
   */
  private validateCapability(
    cap: PluginCapability,
    index: number
  ): string[] {
    const errors: string[] = [];
    const prefix = `capabilities[${index}]`;

    if (!cap.name || typeof cap.name !== "string") {
      errors.push(`${prefix}: Missing or invalid capability name`);
    } else if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/i.test(cap.name)) {
      errors.push(
        `${prefix}: Invalid capability name format '${cap.name}' - must be 'category.action'`
      );
    }

    if (!cap.category) {
      errors.push(`${prefix}: Missing capability category`);
    }

    if (!cap.description) {
      errors.push(`${prefix}: Missing capability description`);
    }

    if (typeof cap.handler !== "function") {
      errors.push(`${prefix}: Missing or invalid capability handler`);
    }

    if (!Array.isArray(cap.requiredPermissions)) {
      errors.push(`${prefix}: requiredPermissions must be an array`);
    }

    if (!["read", "write", "execute", "admin"].includes(cap.riskLevel)) {
      errors.push(
        `${prefix}: Invalid riskLevel '${cap.riskLevel}' - must be read|write|execute|admin`
      );
    }

    return errors;
  }

  /**
   * Validate a single widget
   */
  private validateWidget(widget: PluginWidget, index: number): string[] {
    const warnings: string[] = [];
    const prefix = `widgets[${index}]`;

    if (!widget.id || typeof widget.id !== "string") {
      warnings.push(`${prefix}: Missing or invalid widget id`);
    }

    if (!widget.name) {
      warnings.push(`${prefix}: Missing widget name`);
    }

    if (!widget.component) {
      warnings.push(`${prefix}: Missing widget component path`);
    }

    if (!Array.isArray(widget.slots) || widget.slots.length === 0) {
      warnings.push(`${prefix}: Widget has no slots defined`);
    }

    if (!Array.isArray(widget.requiredCapabilities)) {
      warnings.push(`${prefix}: requiredCapabilities must be an array`);
    }

    return warnings;
  }

  /**
   * Check if a file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear require cache for a module path
   */
  private clearRequireCache(modulePath: string): void {
    try {
      const resolvedPath = require.resolve(modulePath);
      delete require.cache[resolvedPath];

      // Also clear any child modules
      for (const key of Object.keys(require.cache)) {
        if (key.startsWith(path.dirname(resolvedPath))) {
          delete require.cache[key];
        }
      }
    } catch {
      // Module not in cache
    }
  }
}
