/**
 * HieraScanner
 *
 * Scans hieradata directories to build an index of all Hiera keys.
 * Tracks file paths, hierarchy levels, line numbers, and values for each key.
 */

import * as fs from "fs";
import * as path from "path";
import { parse as parseYaml } from "yaml";
import type {
  HieraKey,
  HieraKeyLocation,
  HieraKeyIndex,
  HieraFileInfo,
  LookupOptions,
} from "./types";
import { LoggerService } from "../../services/LoggerService";

/**
 * Result of scanning a single file
 */
export interface FileScanResult {
  success: boolean;
  keys: Map<string, HieraKeyLocation>;
  lookupOptions: Map<string, LookupOptions>;
  error?: string;
}

/**
 * Callback for file change events
 */
export type FileChangeCallback = (changedFiles: string[]) => void;

/**
 * HieraScanner class for scanning hieradata directories
 */
export class HieraScanner {
  private controlRepoPath: string;
  private hieradataPath: string;
  private keyIndex: HieraKeyIndex;
  private fileWatcher: fs.FSWatcher | null = null;
  private changeCallbacks: FileChangeCallback[] = [];
  private isWatching = false;
  private logger: LoggerService;

  constructor(controlRepoPath: string, hieradataPath = "data") {
    this.controlRepoPath = controlRepoPath;
    this.hieradataPath = hieradataPath;
    this.keyIndex = this.createEmptyIndex();
    this.logger = new LoggerService();
  }

  /**
   * Scan the hieradata directory and build the key index
   *
   * @param hieradataPath - Optional override for hieradata path
   * @returns The complete key index
   */
  async scan(hieradataPath?: string): Promise<HieraKeyIndex> {
    const dataPath = hieradataPath ?? this.hieradataPath;
    const fullPath = this.resolvePath(dataPath);

    // Reset the index
    this.keyIndex = this.createEmptyIndex();

    if (!fs.existsSync(fullPath)) {
      this.logger.warn(`[HieraScanner] Hieradata path does not exist: ${fullPath}`, {
        component: "HieraScanner",
        operation: "scan",
        metadata: { fullPath },
      });
      return this.keyIndex;
    }

    // Recursively scan all YAML/JSON files
    await this.scanDirectory(fullPath, dataPath);

    // Update metadata
    this.keyIndex.lastScan = new Date().toISOString();
    this.keyIndex.totalKeys = this.keyIndex.keys.size;
    this.keyIndex.totalFiles = this.keyIndex.files.size;

    return this.keyIndex;
  }

  /**
   * Get the current key index
   *
   * @returns The current key index
   */
  getKeyIndex(): HieraKeyIndex {
    return this.keyIndex;
  }

  /**
   * Get all keys from the index
   *
   * @returns Array of all HieraKey objects
   */
  getAllKeys(): HieraKey[] {
    return Array.from(this.keyIndex.keys.values());
  }

  /**
   * Get a specific key by name
   *
   * @param keyName - The key name to look up
   * @returns The HieraKey or undefined if not found
   */
  getKey(keyName: string): HieraKey | undefined {
    return this.keyIndex.keys.get(keyName);
  }


  /**
   * Search for keys matching a query string
   *
   * Supports partial key name matching (case-insensitive).
   *
   * @param query - Search query string
   * @returns Array of matching HieraKey objects
   */
  searchKeys(query: string): HieraKey[] {
    if (!query || query.trim() === "") {
      return this.getAllKeys();
    }

    const lowerQuery = query.toLowerCase();
    const results: HieraKey[] = [];

    for (const [keyName, key] of this.keyIndex.keys) {
      if (keyName.toLowerCase().includes(lowerQuery)) {
        results.push(key);
      }
    }

    return results;
  }

  /**
   * Scan multiple hieradata directories and build the key index
   *
   * @param datadirPaths - Array of datadir paths to scan
   * @returns The complete key index
   */
  async scanMultipleDatadirs(datadirPaths: string[]): Promise<HieraKeyIndex> {
    // Reset the index
    this.keyIndex = this.createEmptyIndex();

    for (const dataPath of datadirPaths) {
      const fullPath = this.resolvePath(dataPath);

      if (!fs.existsSync(fullPath)) {
        this.logger.warn(`[HieraScanner] Hieradata path does not exist: ${fullPath}`, {
          component: "HieraScanner",
          operation: "scanMultiplePaths",
          metadata: { fullPath },
        });
        continue;
      }

      // Recursively scan all YAML/JSON files in this datadir
      await this.scanDirectory(fullPath, dataPath);
    }

    // Update metadata
    this.keyIndex.lastScan = new Date().toISOString();
    this.keyIndex.totalKeys = this.keyIndex.keys.size;
    this.keyIndex.totalFiles = this.keyIndex.files.size;

    return this.keyIndex;
  }



  /**
   * Update the hieradata path and rescan if needed
   *
   * @param newHieradataPath - New hieradata path
   * @returns Promise that resolves when rescan is complete
   */
  async updateHieradataPath(newHieradataPath: string): Promise<HieraKeyIndex> {
    if (this.hieradataPath !== newHieradataPath) {
      this.hieradataPath = newHieradataPath;

      // Stop watching the old path
      if (this.isWatching) {
        this.stopWatching();
      }

      // Rescan with the new path
      const index = await this.scan();

      // Restart watching if it was previously enabled
      if (this.changeCallbacks.length > 0) {
        this.watchForChanges(() => {
          this.changeCallbacks.forEach(callback => {
          callback([]);
        });
        });
      }

      return index;
    }

    return this.keyIndex;
  }

  /**
   * Watch the hieradata directory for changes
   *
   * @param callback - Callback to invoke when files change
   */
  watchForChanges(callback: FileChangeCallback): void {
    this.changeCallbacks.push(callback);

    if (this.isWatching) {
      return;
    }

    const fullPath = this.resolvePath(this.hieradataPath);

    if (!fs.existsSync(fullPath)) {
      this.logger.warn(`[HieraScanner] Cannot watch non-existent path: ${fullPath}`, {
        component: "HieraScanner",
        operation: "startWatching",
        metadata: { fullPath },
      });
      return;
    }

    try {
      this.fileWatcher = fs.watch(
        fullPath,
        { recursive: true },
        (_eventType, filename) => {
          if (filename && this.isHieradataFile(filename)) {
            this.notifyChange([filename]);
          }
        }
      );
      this.isWatching = true;
    } catch (error) {
      this.logger.error(`[HieraScanner] Failed to start file watcher: ${this.getErrorMessage(error)}`, {
        component: "HieraScanner",
        operation: "startWatching",
      }, error instanceof Error ? error : undefined);
    }
  }

  /**
   * Stop watching for file changes
   */
  stopWatching(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }
    this.isWatching = false;
    this.changeCallbacks = [];
  }

  /**
   * Recursively scan a directory for hieradata files
   *
   * @param dirPath - Absolute path to directory
   * @param relativePath - Path relative to control repo
   */
  private async scanDirectory(dirPath: string, relativePath: string): Promise<void> {
    let entries: fs.Dirent[];

    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (error) {
      this.logger.warn(`[HieraScanner] Failed to read directory ${dirPath}: ${this.getErrorMessage(error)}`, {
        component: "HieraScanner",
        operation: "scanDirectory",
        metadata: { dirPath },
      });
      return;
    }

    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      const entryRelativePath = path.join(relativePath, entry.name);

      if (entry.isDirectory()) {
        await this.scanDirectory(entryPath, entryRelativePath);
      } else if (entry.isFile() && this.isHieradataFile(entry.name)) {
        this.scanFile(entryPath, entryRelativePath);
      }
    }
  }

  /**
   * Scan a single hieradata file
   *
   * @param filePath - Absolute path to file
   * @param relativePath - Path relative to control repo
   */
  private scanFile(filePath: string, relativePath: string): void {
    const result = this.scanFileContent(filePath, relativePath);

    if (!result.success) {
      this.logger.warn(`[HieraScanner] Failed to scan file ${relativePath}: ${result.error ?? 'Unknown error'}`, {
        component: "HieraScanner",
        operation: "scanDirectory",
        metadata: { relativePath, error: result.error },
      });
      return;
    }

    // Get file stats for lastModified
    let lastModified: string;
    try {
      const stats = fs.statSync(filePath);
      lastModified = stats.mtime.toISOString();
    } catch {
      lastModified = new Date().toISOString();
    }

    // Determine hierarchy level from path
    const hierarchyLevel = this.determineHierarchyLevel(relativePath);

    // Add file info
    const fileInfo: HieraFileInfo = {
      path: relativePath,
      hierarchyLevel,
      keys: Array.from(result.keys.keys()),
      lastModified,
    };
    this.keyIndex.files.set(relativePath, fileInfo);

    // Merge keys into the index
    for (const [keyName, location] of result.keys) {
      this.addKeyLocation(keyName, location, result.lookupOptions.get(keyName));
    }
  }


  /**
   * Scan a file and extract all keys with their locations
   *
   * @param filePath - Absolute path to file
   * @param relativePath - Path relative to control repo
   * @returns Scan result with keys and lookup options
   */
  scanFileContent(filePath: string, relativePath: string): FileScanResult {
    let content: string;

    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch (error) {
      return {
        success: false,
        keys: new Map(),
        lookupOptions: new Map(),
        error: `Failed to read file: ${this.getErrorMessage(error)}`,
      };
    }

    return this.parseFileContent(content, relativePath);
  }

  /**
   * Parse file content and extract keys
   *
   * @param content - File content string
   * @param relativePath - Path relative to control repo
   * @returns Scan result with keys and lookup options
   */
  parseFileContent(content: string, relativePath: string): FileScanResult {
    const keys = new Map<string, HieraKeyLocation>();
    const lookupOptions = new Map<string, LookupOptions>();

    let data: unknown;
    try {
      data = parseYaml(content, { strict: false });
    } catch (error) {
      return {
        success: false,
        keys,
        lookupOptions,
        error: `YAML parse error: ${this.getErrorMessage(error)}`,
      };
    }

    if (!data || typeof data !== "object") {
      // Empty file or non-object content
      return { success: true, keys, lookupOptions };
    }

    const hierarchyLevel = this.determineHierarchyLevel(relativePath);

    // Extract keys from the data
    this.extractKeys(
      data as Record<string, unknown>,
      "",
      relativePath,
      hierarchyLevel,
      content,
      keys
    );

    // Extract lookup_options if present
    const dataObj = data as Record<string, unknown>;
    if (dataObj.lookup_options && typeof dataObj.lookup_options === "object") {
      this.extractLookupOptions(
        dataObj.lookup_options as Record<string, unknown>,
        lookupOptions
      );
    }

    return { success: true, keys, lookupOptions };
  }

  /**
   * Extract keys from a data object recursively
   *
   * Handles nested objects and builds dot-notation keys.
   *
   * @param data - Data object to extract keys from
   * @param prefix - Current key prefix for nested keys
   * @param filePath - File path for location tracking
   * @param hierarchyLevel - Hierarchy level name
   * @param content - Original file content for line number detection
   * @param keys - Map to store extracted keys
   */
  private extractKeys(
    data: Record<string, unknown>,
    prefix: string,
    filePath: string,
    hierarchyLevel: string,
    content: string,
    keys: Map<string, HieraKeyLocation>
  ): void {
    for (const [key, value] of Object.entries(data)) {
      // Skip lookup_options - it's metadata, not data
      if (key === "lookup_options") {
        continue;
      }

      const fullKey = prefix ? `${prefix}.${key}` : key;
      const lineNumber = this.findKeyLineNumber(content, key, prefix);

      // Add the key location
      const location: HieraKeyLocation = {
        file: filePath,
        hierarchyLevel,
        lineNumber,
        value,
      };
      keys.set(fullKey, location);

      // If value is an object (but not array), recurse to extract nested keys
      // This supports both flat keys and nested structures
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        this.extractKeys(
          value as Record<string, unknown>,
          fullKey,
          filePath,
          hierarchyLevel,
          content,
          keys
        );
      }
    }
  }

  /**
   * Extract lookup options from lookup_options section
   *
   * @param lookupOptionsData - Raw lookup_options object
   * @param lookupOptions - Map to store extracted options
   */
  private extractLookupOptions(
    lookupOptionsData: Record<string, unknown>,
    lookupOptions: Map<string, LookupOptions>
  ): void {
    for (const [key, options] of Object.entries(lookupOptionsData)) {
      if (options && typeof options === "object") {
        const parsed = this.parseLookupOptions(options as Record<string, unknown>);
        if (parsed) {
          lookupOptions.set(key, parsed);
        }
      }
    }
  }


  /**
   * Parse a single lookup options object
   *
   * @param options - Raw options object
   * @returns Parsed LookupOptions or undefined
   */
  private parseLookupOptions(options: Record<string, unknown>): LookupOptions | undefined {
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
   */
  private isValidLookupMethod(method: string): method is "first" | "unique" | "hash" | "deep" {
    return ["first", "unique", "hash", "deep"].includes(method);
  }

  /**
   * Find the line number where a key is defined
   *
   * @param content - File content
   * @param key - Key name to find
   * @param _prefix - Parent key prefix (for nested keys) - unused but kept for API consistency
   * @returns Line number (1-based) or 0 if not found
   */
  private findKeyLineNumber(content: string, key: string, _prefix: string): number {
    const lines = content.split("\n");

    // Escape special regex characters in the key
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // Pattern to match the key at the start of a line (with optional indentation)
    const keyPattern = new RegExp(`^\\s*["']?${escapedKey}["']?\\s*:`);

    for (let i = 0; i < lines.length; i++) {
      if (keyPattern.test(lines[i])) {
        return i + 1; // 1-based line numbers
      }
    }

    return 0; // Not found
  }

  /**
   * Determine the hierarchy level from a file path
   *
   * @param relativePath - Path relative to hieradata directory
   * @returns Hierarchy level name
   */
  private determineHierarchyLevel(relativePath: string): string {
    // Extract meaningful hierarchy level from path
    const parts = relativePath.split(path.sep);

    // Remove the data directory prefix if present
    if (parts[0] === "data" || parts[0] === "hieradata") {
      parts.shift();
    }

    // Common patterns:
    // - nodes/hostname.yaml -> "Per-node data"
    // - os/family.yaml -> "Per-OS data"
    // - environments/env.yaml -> "Per-environment data"
    // - common.yaml -> "Common data"

    if (parts.length === 0) {
      return "Common data";
    }

    const firstPart = parts[0].toLowerCase();
    const fileName = parts[parts.length - 1];

    if (fileName === "common.yaml" || fileName === "common.json") {
      return "Common data";
    }

    if (firstPart === "nodes" || firstPart === "node") {
      return "Per-node data";
    }

    if (firstPart === "os" || firstPart === "osfamily") {
      return "Per-OS data";
    }

    if (firstPart === "environments" || firstPart === "environment") {
      return "Per-environment data";
    }

    if (firstPart === "roles" || firstPart === "role") {
      return "Per-role data";
    }

    if (firstPart === "datacenter" || firstPart === "datacenters") {
      return "Per-datacenter data";
    }

    // Default: use the directory name
    return `${parts[0]} data`;
  }

  /**
   * Add a key location to the index
   *
   * @param keyName - Full key name
   * @param location - Key location
   * @param lookupOptions - Optional lookup options for the key
   */
  private addKeyLocation(
    keyName: string,
    location: HieraKeyLocation,
    lookupOptions?: LookupOptions
  ): void {
    let key = this.keyIndex.keys.get(keyName);

    if (!key) {
      key = {
        name: keyName,
        locations: [],
        lookupOptions,
      };
      this.keyIndex.keys.set(keyName, key);
    }

    // Add the location
    key.locations.push(location);

    // Update lookup options if provided and not already set
    if (lookupOptions && !key.lookupOptions) {
      key.lookupOptions = lookupOptions;
    }
  }


  /**
   * Check if a filename is a hieradata file
   *
   * @param filename - File name to check
   * @returns True if it's a YAML or JSON file
   */
  private isHieradataFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return [".yaml", ".yml", ".json", ".eyaml"].includes(ext);
  }

  /**
   * Notify all callbacks of file changes
   *
   * @param changedFiles - Array of changed file paths
   */
  private notifyChange(changedFiles: string[]): void {
    for (const callback of this.changeCallbacks) {
      try {
        callback(changedFiles);
      } catch (error) {
        this.logger.error(`[HieraScanner] Error in change callback: ${this.getErrorMessage(error)}`, {
          component: "HieraScanner",
          operation: "notifyChangeCallbacks",
        }, error instanceof Error ? error : undefined);
      }
    }
  }

  /**
   * Create an empty key index
   *
   * @returns Empty HieraKeyIndex
   */
  private createEmptyIndex(): HieraKeyIndex {
    return {
      keys: new Map(),
      files: new Map(),
      lastScan: "",
      totalKeys: 0,
      totalFiles: 0,
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
   * Extract error message from unknown error
   *
   * @param error - Unknown error
   * @returns Error message string
   */
  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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
   * Get the hieradata path
   *
   * @returns Hieradata path
   */
  getHieradataPath(): string {
    return this.hieradataPath;
  }

  /**
   * Update the hieradata path
   *
   * @param hieradataPath - New hieradata path
   */
  setHieradataPath(hieradataPath: string): void {
    this.hieradataPath = hieradataPath;
  }

  /**
   * Check if the scanner is currently watching for changes
   *
   * @returns True if watching
   */
  isWatchingForChanges(): boolean {
    return this.isWatching;
  }

  /**
   * Invalidate the cache for specific files
   *
   * @param filePaths - Array of file paths to invalidate
   */
  invalidateFiles(filePaths: string[]): void {
    for (const filePath of filePaths) {
      const fileInfo = this.keyIndex.files.get(filePath);
      if (fileInfo) {
        // Remove keys that were only in this file
        for (const keyName of fileInfo.keys) {
          const key = this.keyIndex.keys.get(keyName);
          if (key) {
            // Remove locations from this file
            key.locations = key.locations.filter(loc => loc.file !== filePath);
            // If no locations left, remove the key
            if (key.locations.length === 0) {
              this.keyIndex.keys.delete(keyName);
            }
          }
        }
        // Remove file info
        this.keyIndex.files.delete(filePath);
      }
    }

    // Update counts
    this.keyIndex.totalKeys = this.keyIndex.keys.size;
    this.keyIndex.totalFiles = this.keyIndex.files.size;
  }

  /**
   * Rescan specific files and update the index
   *
   * @param filePaths - Array of file paths to rescan
   */
  rescanFiles(filePaths: string[]): void {
    // First invalidate the files
    this.invalidateFiles(filePaths);

    // Then rescan each file
    for (const relativePath of filePaths) {
      const fullPath = this.resolvePath(relativePath);
      if (fs.existsSync(fullPath)) {
        this.scanFile(fullPath, relativePath);
      }
    }

    // Update metadata
    this.keyIndex.lastScan = new Date().toISOString();
    this.keyIndex.totalKeys = this.keyIndex.keys.size;
    this.keyIndex.totalFiles = this.keyIndex.files.size;
  }
}
