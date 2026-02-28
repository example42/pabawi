/**
 * Inventory file watcher for SSH Integration
 *
 * This module provides file watching functionality for inventory files,
 * with debouncing to avoid multiple reloads and error recovery to maintain
 * the last valid inventory when parse errors occur.
 */

import { watch, FSWatcher } from 'fs';
import { readFile } from 'fs/promises';
import { LoggerService } from '../../services/LoggerService';
import { parseInventoryFile, InventoryParseError } from './inventoryParser';
import { Node } from '../bolt/types';

/**
 * Callback function type for inventory reload events
 */
export type InventoryReloadCallback = (nodes: Node[]) => void;

/**
 * Options for inventory watcher
 */
export interface InventoryWatcherOptions {
  /** Path to inventory file to watch */
  filePath: string;

  /** File format ('yaml' or 'json') */
  format: 'yaml' | 'json';

  /** Debounce delay in milliseconds (default: 1000) */
  debounceDelay?: number;

  /** Logger service for logging events */
  logger?: LoggerService;

  /** Callback function called when inventory is successfully reloaded */
  onReload?: InventoryReloadCallback;

  /** Callback function called when reload fails */
  onError?: (error: Error) => void;
}

/**
 * Inventory file watcher with debouncing and error recovery
 *
 * Features:
 * - Monitors inventory file for changes using fs.watch()
 * - Debounces file change events (default: 1 second)
 * - Reloads inventory on file modification
 * - Maintains last valid inventory on parse errors
 * - Logs all reload events
 */
export class InventoryWatcher {
  private readonly filePath: string;
  private readonly format: 'yaml' | 'json';
  private readonly debounceDelay: number;
  private readonly logger?: LoggerService;
  private readonly onReload?: InventoryReloadCallback;
  private readonly onError?: (error: Error) => void;

  private watcher?: FSWatcher;
  private debounceTimer?: NodeJS.Timeout;
  private lastValidInventory: Node[] = [];
  private isWatching = false;

  /**
   * Create a new inventory watcher
   *
   * @param options - Watcher configuration options
   */
  constructor(options: InventoryWatcherOptions) {
    this.filePath = options.filePath;
    this.format = options.format;
    this.debounceDelay = options.debounceDelay ?? 1000;
    this.logger = options.logger;
    this.onReload = options.onReload;
    this.onError = options.onError;
  }

  /**
   * Start watching the inventory file
   *
   * @param initialInventory - Initial inventory to use as last valid inventory
   */
  public start(initialInventory?: Node[]): void {
    if (this.isWatching) {
      this.logger?.warn('Inventory watcher already started', {
        component: 'InventoryWatcher',
        operation: 'start',
        metadata: { filePath: this.filePath }
      });
      return;
    }

    // Set initial inventory as last valid
    if (initialInventory) {
      this.lastValidInventory = initialInventory;
    }

    try {
      // Start watching the file
      this.watcher = watch(this.filePath, (eventType, filename) => {
        this.handleFileChange(eventType, filename);
      });

      this.isWatching = true;

      this.logger?.info('Started watching inventory file', {
        component: 'InventoryWatcher',
        operation: 'start',
        metadata: {
          filePath: this.filePath,
          format: this.format,
          debounceDelay: this.debounceDelay
        }
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger?.error('Failed to start inventory watcher', {
        component: 'InventoryWatcher',
        operation: 'start',
        metadata: { filePath: this.filePath, error: errorMessage }
      }, error instanceof Error ? error : undefined);

      if (this.onError && error instanceof Error) {
        this.onError(error);
      }
    }
  }

  /**
   * Stop watching the inventory file
   */
  public stop(): void {
    if (!this.isWatching) {
      return;
    }

    // Clear any pending debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    // Close the file watcher
    if (this.watcher) {
      this.watcher.close();
      this.watcher = undefined;
    }

    this.isWatching = false;

    this.logger?.info('Stopped watching inventory file', {
      component: 'InventoryWatcher',
      operation: 'stop',
      metadata: { filePath: this.filePath }
    });
  }

  /**
   * Get the last valid inventory
   *
   * @returns Last successfully parsed inventory
   */
  public getLastValidInventory(): Node[] {
    return this.lastValidInventory;
  }

  /**
   * Check if watcher is currently active
   *
   * @returns true if watching
   */
  public isActive(): boolean {
    return this.isWatching;
  }

  /**
   * Handle file change events with debouncing
   *
   * @param eventType - Type of file system event
   * @param filename - Name of changed file
   */
  private handleFileChange(eventType: string, filename: string | null): void {
    // Only process 'change' events
    if (eventType !== 'change') {
      return;
    }

    this.logger?.debug('Inventory file change detected', {
      component: 'InventoryWatcher',
      operation: 'handleFileChange',
      metadata: {
        filePath: this.filePath,
        eventType,
        filename
      }
    });

    // Clear existing debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new debounce timer
    this.debounceTimer = setTimeout(() => {
      this.reloadInventory();
    }, this.debounceDelay);
  }

  /**
   * Reload inventory from file
   *
   * On success: Updates last valid inventory and calls onReload callback
   * On error: Maintains last valid inventory and calls onError callback
   */
  private async reloadInventory(): Promise<void> {
    this.logger?.info('Reloading inventory file', {
      component: 'InventoryWatcher',
      operation: 'reloadInventory',
      metadata: { filePath: this.filePath }
    });

    try {
      // Read file content
      const content = await readFile(this.filePath, 'utf-8');

      // Parse inventory
      const nodes = parseInventoryFile(content, this.format);

      // Update last valid inventory
      this.lastValidInventory = nodes;

      this.logger?.info('Inventory file reloaded successfully', {
        component: 'InventoryWatcher',
        operation: 'reloadInventory',
        metadata: {
          filePath: this.filePath,
          nodeCount: nodes.length
        }
      });

      // Call reload callback
      if (this.onReload) {
        this.onReload(nodes);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (error instanceof InventoryParseError) {
        this.logger?.error('Failed to parse inventory file, maintaining last valid inventory', {
          component: 'InventoryWatcher',
          operation: 'reloadInventory',
          metadata: {
            filePath: this.filePath,
            error: errorMessage,
            lastValidNodeCount: this.lastValidInventory.length
          }
        }, error);
      } else {
        this.logger?.error('Failed to reload inventory file', {
          component: 'InventoryWatcher',
          operation: 'reloadInventory',
          metadata: {
            filePath: this.filePath,
            error: errorMessage
          }
        }, error instanceof Error ? error : undefined);
      }

      // Call error callback
      if (this.onError && error instanceof Error) {
        this.onError(error);
      }
    }
  }
}
