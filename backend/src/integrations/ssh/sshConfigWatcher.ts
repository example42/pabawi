/**
 * SSH Config File Watcher
 *
 * This module provides file watching functionality for SSH config files,
 * with debouncing to avoid multiple reloads and error recovery to maintain
 * the last valid configuration when parse errors occur.
 *
 * Validates: Requirements 2.4, 2.7
 */

import { watch, FSWatcher } from 'fs';
import { readFile } from 'fs/promises';
import { LoggerService } from '../../services/LoggerService';
import { parseSSHConfig, SSHConfigParseResult } from './sshConfigParser';
import { SSHHost } from './types';

/**
 * Callback function type for SSH config reload events
 */
export type SSHConfigReloadCallback = (hosts: SSHHost[]) => void;

/**
 * Options for SSH config watcher
 */
export interface SSHConfigWatcherOptions {
  /** Path to SSH config file to watch */
  filePath: string;

  /** Debounce delay in milliseconds (default: 1000) */
  debounceDelay?: number;

  /** Logger service for logging events */
  logger?: LoggerService;

  /** Callback function called when config is successfully reloaded */
  onReload?: SSHConfigReloadCallback;

  /** Callback function called when reload fails */
  onError?: (error: Error) => void;
}

/**
 * SSH config file watcher with debouncing and error recovery
 *
 * Features:
 * - Monitors SSH config file for changes using fs.watch()
 * - Debounces file change events (default: 1 second)
 * - Reloads configuration on file modification
 * - Maintains last valid configuration on parse errors
 * - Logs all reload events
 *
 * Validates: Requirements 2.4, 2.7
 */
export class SSHConfigWatcher {
  private readonly filePath: string;
  private readonly debounceDelay: number;
  private readonly logger?: LoggerService;
  private readonly onReload?: SSHConfigReloadCallback;
  private readonly onError?: (error: Error) => void;

  private watcher?: FSWatcher;
  private debounceTimer?: NodeJS.Timeout;
  private lastValidHosts: SSHHost[] = [];
  private isWatching = false;

  /**
   * Create a new SSH config watcher
   *
   * @param options - Watcher configuration options
   */
  constructor(options: SSHConfigWatcherOptions) {
    this.filePath = options.filePath;
    this.debounceDelay = options.debounceDelay ?? 1000;
    this.logger = options.logger;
    this.onReload = options.onReload;
    this.onError = options.onError;
  }

  /**
   * Start watching the SSH config file
   *
   * @param initialHosts - Initial hosts to use as last valid configuration
   */
  public start(initialHosts?: SSHHost[]): void {
    if (this.isWatching) {
      this.logger?.warn('SSH config watcher already started', {
        component: 'SSHConfigWatcher',
        operation: 'start',
        metadata: { filePath: this.filePath }
      });
      return;
    }

    // Set initial hosts as last valid
    if (initialHosts) {
      this.lastValidHosts = initialHosts;
    }

    try {
      // Start watching the file
      this.watcher = watch(this.filePath, (eventType, filename) => {
        this.handleFileChange(eventType, filename);
      });

      this.isWatching = true;

      this.logger?.info('Started watching SSH config file', {
        component: 'SSHConfigWatcher',
        operation: 'start',
        metadata: {
          filePath: this.filePath,
          debounceDelay: this.debounceDelay
        }
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger?.error('Failed to start SSH config watcher', {
        component: 'SSHConfigWatcher',
        operation: 'start',
        metadata: { filePath: this.filePath, error: errorMessage }
      }, error instanceof Error ? error : undefined);

      if (this.onError && error instanceof Error) {
        this.onError(error);
      }
    }
  }

  /**
   * Stop watching the SSH config file
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

    this.logger?.info('Stopped watching SSH config file', {
      component: 'SSHConfigWatcher',
      operation: 'stop',
      metadata: { filePath: this.filePath }
    });
  }

  /**
   * Get the last valid SSH hosts configuration
   *
   * @returns Last successfully parsed SSH hosts
   */
  public getLastValidHosts(): SSHHost[] {
    return this.lastValidHosts;
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

    this.logger?.debug('SSH config file change detected', {
      component: 'SSHConfigWatcher',
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
      this.reloadConfig();
    }, this.debounceDelay);
  }

  /**
   * Reload SSH config from file
   *
   * On success: Updates last valid hosts and calls onReload callback
   * On error: Maintains last valid hosts and calls onError callback
   *
   * Validates: Requirements 2.4, 2.7
   */
  private async reloadConfig(): Promise<void> {
    this.logger?.info('Reloading SSH config file', {
      component: 'SSHConfigWatcher',
      operation: 'reloadConfig',
      metadata: { filePath: this.filePath }
    });

    try {
      // Read file content
      const content = await readFile(this.filePath, 'utf-8');

      // Parse SSH config
      const result: SSHConfigParseResult = parseSSHConfig(content);

      // Check for parse errors
      if (!result.success || result.errors.length > 0) {
        const error = new Error(
          `SSH config parse errors: ${result.errors.join('; ')}`
        );

        this.logger?.error('Failed to parse SSH config file, maintaining last valid configuration', {
          component: 'SSHConfigWatcher',
          operation: 'reloadConfig',
          metadata: {
            filePath: this.filePath,
            errors: result.errors,
            lastValidHostCount: this.lastValidHosts.length
          }
        }, error);

        // Call error callback but don't throw - maintain last valid config
        if (this.onError) {
          this.onError(error);
        }
        return;
      }

      // Update last valid hosts
      this.lastValidHosts = result.hosts;

      this.logger?.info('SSH config file reloaded successfully', {
        component: 'SSHConfigWatcher',
        operation: 'reloadConfig',
        metadata: {
          filePath: this.filePath,
          hostCount: result.hosts.length
        }
      });

      // Call reload callback
      if (this.onReload) {
        this.onReload(result.hosts);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.logger?.error('Failed to reload SSH config file', {
        component: 'SSHConfigWatcher',
        operation: 'reloadConfig',
        metadata: {
          filePath: this.filePath,
          error: errorMessage,
          lastValidHostCount: this.lastValidHosts.length
        }
      }, error instanceof Error ? error : undefined);

      // Call error callback
      if (this.onError && error instanceof Error) {
        this.onError(error);
      }
    }
  }
}
