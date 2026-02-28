/**
 * Package Manager Detector for SSH Integration
 *
 * This module provides detection and command generation for various Linux
 * package managers. It detects which package manager is available on a
 * target host and generates appropriate commands for package operations.
 *
 * Supported package managers:
 * - apt (Debian/Ubuntu)
 * - yum (RHEL/CentOS)
 * - dnf (Fedora 22+)
 * - zypper (SUSE/openSUSE)
 * - pacman (Arch Linux)
 */

import { Client } from 'ssh2';
import { PackageManager } from './types';
import { sanitizePackageName } from '../../validation/commonSchemas';
import { LoggerService } from '../../services/LoggerService';

/**
 * Package manager detector with caching
 *
 * Detects available package managers on remote hosts and caches results
 * to avoid repeated detection. Provides command generation for install,
 * remove, and update operations.
 */
export class PackageManagerDetector {
  /** Cache of detected package managers per host */
  private cache: Map<string, PackageManager>;
  private logger?: LoggerService;

  constructor(logger?: LoggerService) {
    this.cache = new Map();
    this.logger = logger;
  }

  /**
   * Detect package manager on a remote host
   *
   * Checks for package managers in priority order:
   * 1. apt-get (Debian/Ubuntu)
   * 2. dnf (Fedora 22+)
   * 3. yum (RHEL/CentOS)
   * 4. zypper (SUSE/openSUSE)
   * 5. pacman (Arch Linux)
   *
   * Results are cached per host to avoid repeated detection.
   *
   * @param connection - Active SSH connection
   * @param hostKey - Unique host identifier for caching
   * @returns Detected package manager type
   */
  async detect(connection: Client, hostKey: string): Promise<PackageManager> {
    // Check cache first
    const cached = this.cache.get(hostKey);
    if (cached) {
      this.logger?.debug('Using cached package manager detection', {
        component: 'PackageManagerDetector',
        integration: 'ssh',
        operation: 'detect',
        metadata: {
          hostKey,
          packageManager: cached,
        },
      });
      return cached;
    }

    this.logger?.debug('Detecting package manager', {
      component: 'PackageManagerDetector',
      integration: 'ssh',
      operation: 'detect',
      metadata: {
        hostKey,
      },
    });

    // Detect in priority order
    if (await this.detectApt(connection)) {
      this.cache.set(hostKey, 'apt');
      this.logger?.info('Package manager detected', {
        component: 'PackageManagerDetector',
        integration: 'ssh',
        operation: 'detect',
        metadata: {
          hostKey,
          packageManager: 'apt',
        },
      });
      return 'apt';
    }

    if (await this.detectDnf(connection)) {
      this.cache.set(hostKey, 'dnf');
      this.logger?.info('Package manager detected', {
        component: 'PackageManagerDetector',
        integration: 'ssh',
        operation: 'detect',
        metadata: {
          hostKey,
          packageManager: 'dnf',
        },
      });
      return 'dnf';
    }

    if (await this.detectYum(connection)) {
      this.cache.set(hostKey, 'yum');
      this.logger?.info('Package manager detected', {
        component: 'PackageManagerDetector',
        integration: 'ssh',
        operation: 'detect',
        metadata: {
          hostKey,
          packageManager: 'yum',
        },
      });
      return 'yum';
    }

    if (await this.detectZypper(connection)) {
      this.cache.set(hostKey, 'zypper');
      this.logger?.info('Package manager detected', {
        component: 'PackageManagerDetector',
        integration: 'ssh',
        operation: 'detect',
        metadata: {
          hostKey,
          packageManager: 'zypper',
        },
      });
      return 'zypper';
    }

    if (await this.detectPacman(connection)) {
      this.cache.set(hostKey, 'pacman');
      this.logger?.info('Package manager detected', {
        component: 'PackageManagerDetector',
        integration: 'ssh',
        operation: 'detect',
        metadata: {
          hostKey,
          packageManager: 'pacman',
        },
      });
      return 'pacman';
    }

    // No package manager detected
    this.cache.set(hostKey, 'unknown');
    this.logger?.warn('No supported package manager detected', {
      component: 'PackageManagerDetector',
      integration: 'ssh',
      operation: 'detect',
      metadata: {
        hostKey,
      },
    });
    return 'unknown';
  }

  /**
   * Generate install command for a package
   *
   * @param pm - Package manager type
   * @param packageName - Name of package to install
   * @returns Install command string
   */
  getInstallCommand(pm: PackageManager, packageName: string): string {
    // Defense-in-depth: validate package name even if route already validated
    const safeName = sanitizePackageName(packageName);
    switch (pm) {
      case 'apt':
        return `apt-get install -y ${safeName}`;
      case 'yum':
        return `yum install -y ${safeName}`;
      case 'dnf':
        return `dnf install -y ${safeName}`;
      case 'zypper':
        return `zypper install -y ${safeName}`;
      case 'pacman':
        return `pacman -S --noconfirm ${safeName}`;
      case 'unknown':
        throw new Error('Cannot generate install command: package manager unknown');
      default:
        throw new Error(`Unsupported package manager: ${pm}`);
    }
  }

  /**
   * Generate remove command for a package
   *
   * @param pm - Package manager type
   * @param packageName - Name of package to remove
   * @returns Remove command string
   */
  getRemoveCommand(pm: PackageManager, packageName: string): string {
    // Defense-in-depth: validate package name even if route already validated
    const safeName = sanitizePackageName(packageName);
    switch (pm) {
      case 'apt':
        return `apt-get remove -y ${safeName}`;
      case 'yum':
        return `yum remove -y ${safeName}`;
      case 'dnf':
        return `dnf remove -y ${safeName}`;
      case 'zypper':
        return `zypper remove -y ${safeName}`;
      case 'pacman':
        return `pacman -R --noconfirm ${safeName}`;
      case 'unknown':
        throw new Error('Cannot generate remove command: package manager unknown');
      default:
        throw new Error(`Unsupported package manager: ${pm}`);
    }
  }

  /**
   * Generate update command for a package
   *
   * @param pm - Package manager type
   * @param packageName - Name of package to update
   * @returns Update command string
   */
  getUpdateCommand(pm: PackageManager, packageName: string): string {
    // Defense-in-depth: validate package name even if route already validated
    const safeName = sanitizePackageName(packageName);
    switch (pm) {
      case 'apt':
        return `apt-get install --only-upgrade -y ${safeName}`;
      case 'yum':
        return `yum update -y ${safeName}`;
      case 'dnf':
        return `dnf update -y ${safeName}`;
      case 'zypper':
        return `zypper update -y ${safeName}`;
      case 'pacman':
        return `pacman -S --noconfirm ${safeName}`;
      case 'unknown':
        throw new Error('Cannot generate update command: package manager unknown');
      default:
        throw new Error(`Unsupported package manager: ${pm}`);
    }
  }

  /**
   * Clear cached detection result for a host
   *
   * @param hostKey - Host identifier
   */
  clearCache(hostKey: string): void {
    this.cache.delete(hostKey);
  }

  /**
   * Clear all cached detection results
   */
  clearAllCache(): void {
    this.cache.clear();
  }

  /**
   * Detect apt package manager
   *
   * @param connection - Active SSH connection
   * @returns True if apt is available
   */
  private async detectApt(connection: Client): Promise<boolean> {
    return this.commandExists(connection, 'apt-get');
  }

  /**
   * Detect yum package manager
   *
   * @param connection - Active SSH connection
   * @returns True if yum is available
   */
  private async detectYum(connection: Client): Promise<boolean> {
    return this.commandExists(connection, 'yum');
  }

  /**
   * Detect dnf package manager
   *
   * @param connection - Active SSH connection
   * @returns True if dnf is available
   */
  private async detectDnf(connection: Client): Promise<boolean> {
    return this.commandExists(connection, 'dnf');
  }

  /**
   * Detect zypper package manager
   *
   * @param connection - Active SSH connection
   * @returns True if zypper is available
   */
  private async detectZypper(connection: Client): Promise<boolean> {
    return this.commandExists(connection, 'zypper');
  }

  /**
   * Detect pacman package manager
   *
   * @param connection - Active SSH connection
   * @returns True if pacman is available
   */
  private async detectPacman(connection: Client): Promise<boolean> {
    return this.commandExists(connection, 'pacman');
  }

  /**
   * Check if a command exists on the remote system
   *
   * Uses 'command -v' to check for command existence, which is
   * POSIX-compliant and works across all shells.
   *
   * @param connection - Active SSH connection
   * @param commandName - Command to check
   * @returns True if command exists
   */
  private async commandExists(connection: Client, commandName: string): Promise<boolean> {
    return new Promise((resolve) => {
      connection.exec(`command -v ${commandName}`, (err, stream) => {
        if (err) {
          resolve(false);
          return;
        }

        let exitCode = -1;

        stream.on('close', (code: number) => {
          exitCode = code;
          resolve(exitCode === 0);
        });

        stream.on('error', () => {
          resolve(false);
        });

        // Drain stdout and stderr to prevent hanging
        stream.on('data', () => {});
        stream.stderr.on('data', () => {});
      });
    });
  }
}
