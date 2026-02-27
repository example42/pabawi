/**
 * Unit tests for SSH Config File Watcher
 *
 * Tests file modification detection, debouncing behavior, and error recovery
 *
 * Validates: Requirements 2.4, 2.7
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { SSHConfigWatcher, SSHConfigWatcherOptions } from '../sshConfigWatcher';
import { SSHHost } from '../types';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('SSHConfigWatcher', () => {
  let testDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    // Create a temporary directory for test files
    testDir = join(tmpdir(), `ssh-config-watcher-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    testFilePath = join(testDir, 'ssh_config');
  });

  afterEach(async () => {
    // Clean up test files
    try {
      if (existsSync(testFilePath)) {
        await unlink(testFilePath);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('File modification detection', () => {
    test('should detect file changes and reload configuration', async () => {
      // Create initial SSH config file
      const initialConfig = `
Host web-server-01
    HostName 192.168.1.10
    User deploy
    Port 22
`;
      await writeFile(testFilePath, initialConfig, 'utf-8');

      // Set up watcher with callback
      const reloadCallback = vi.fn();
      const watcher = new SSHConfigWatcher({
        filePath: testFilePath,
        debounceDelay: 100, // Short delay for testing
        onReload: reloadCallback,
      });

      // Start watching
      watcher.start();

      // Modify the file
      const updatedConfig = `
Host web-server-01
    HostName 192.168.1.10
    User deploy
    Port 22

Host db-server-01
    HostName 192.168.1.20
    User dbadmin
    Port 2222
`;
      await writeFile(testFilePath, updatedConfig, 'utf-8');

      // Wait for debounce + processing
      await new Promise(resolve => setTimeout(resolve, 300));

      // Verify callback was called
      expect(reloadCallback).toHaveBeenCalled();
      const reloadedHosts = reloadCallback.mock.calls[0][0] as SSHHost[];
      expect(reloadedHosts).toHaveLength(2);
      expect(reloadedHosts[0].name).toBe('web-server-01');
      expect(reloadedHosts[1].name).toBe('db-server-01');

      // Clean up
      watcher.stop();
    });

    test('should not reload if watcher is not started', async () => {
      // Create initial SSH config file
      const initialConfig = `
Host web-server-01
    HostName 192.168.1.10
`;
      await writeFile(testFilePath, initialConfig, 'utf-8');

      const reloadCallback = vi.fn();
      const watcher = new SSHConfigWatcher({
        filePath: testFilePath,
        onReload: reloadCallback,
      });

      // Don't start watcher

      // Modify the file
      await writeFile(testFilePath, initialConfig + '\n# Comment', 'utf-8');

      // Wait
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify callback was not called
      expect(reloadCallback).not.toHaveBeenCalled();
    });
  });

  describe('Debouncing behavior', () => {
    test('should debounce multiple rapid file changes', async () => {
      // Create initial SSH config file
      const initialConfig = `
Host web-server-01
    HostName 192.168.1.10
`;
      await writeFile(testFilePath, initialConfig, 'utf-8');

      const reloadCallback = vi.fn();
      const watcher = new SSHConfigWatcher({
        filePath: testFilePath,
        debounceDelay: 200, // 200ms debounce
        onReload: reloadCallback,
      });

      watcher.start();

      // Make multiple rapid changes
      await writeFile(testFilePath, initialConfig + '\n# Change 1', 'utf-8');
      await new Promise(resolve => setTimeout(resolve, 50));

      await writeFile(testFilePath, initialConfig + '\n# Change 2', 'utf-8');
      await new Promise(resolve => setTimeout(resolve, 50));

      await writeFile(testFilePath, initialConfig + '\n# Change 3', 'utf-8');

      // Wait for debounce to complete
      await new Promise(resolve => setTimeout(resolve, 400));

      // Should only reload once due to debouncing
      expect(reloadCallback).toHaveBeenCalledTimes(1);

      watcher.stop();
    });

    test('should use custom debounce delay', async () => {
      const initialConfig = `Host test\n    HostName 1.2.3.4`;
      await writeFile(testFilePath, initialConfig, 'utf-8');

      const reloadCallback = vi.fn();
      const customDelay = 500;
      const watcher = new SSHConfigWatcher({
        filePath: testFilePath,
        debounceDelay: customDelay,
        onReload: reloadCallback,
      });

      watcher.start();

      await writeFile(testFilePath, initialConfig + '\n# Modified', 'utf-8');

      // Check before debounce completes
      await new Promise(resolve => setTimeout(resolve, customDelay - 100));
      expect(reloadCallback).not.toHaveBeenCalled();

      // Check after debounce completes
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(reloadCallback).toHaveBeenCalled();

      watcher.stop();
    });
  });

  describe('Error recovery', () => {
    test('should maintain last valid configuration on parse errors', async () => {
      // Create valid initial config
      const validConfig = `
Host web-server-01
    HostName 192.168.1.10
    User deploy
`;
      await writeFile(testFilePath, validConfig, 'utf-8');

      const reloadCallback = vi.fn();
      const errorCallback = vi.fn();
      const watcher = new SSHConfigWatcher({
        filePath: testFilePath,
        debounceDelay: 100,
        onReload: reloadCallback,
        onError: errorCallback,
      });

      // Parse initial valid config
      watcher.start();
      await new Promise(resolve => setTimeout(resolve, 50));

      // Get initial valid hosts
      const initialHosts = watcher.getLastValidHosts();
      expect(initialHosts).toHaveLength(0); // No initial load, only on change

      // First change - valid config
      await writeFile(testFilePath, validConfig, 'utf-8');
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(reloadCallback).toHaveBeenCalled();
      const validHosts = watcher.getLastValidHosts();
      expect(validHosts).toHaveLength(1);
      expect(validHosts[0].name).toBe('web-server-01');

      // Second change - invalid config (invalid port number)
      const invalidConfig = `
Host web-server-02
    HostName 192.168.1.20
    Port invalid_port
    User deploy
`;
      await writeFile(testFilePath, invalidConfig, 'utf-8');
      await new Promise(resolve => setTimeout(resolve, 200));

      // Error callback should be called due to parse errors
      expect(errorCallback).toHaveBeenCalled();

      // Should still have the last valid configuration
      const hostsAfterError = watcher.getLastValidHosts();
      expect(hostsAfterError).toHaveLength(1);
      expect(hostsAfterError[0].name).toBe('web-server-01');

      watcher.stop();
    });

    test('should call error callback on file read errors', async () => {
      const errorCallback = vi.fn();
      const watcher = new SSHConfigWatcher({
        filePath: '/nonexistent/path/ssh_config',
        debounceDelay: 100,
        onError: errorCallback,
      });

      // Starting watcher on nonexistent file should trigger error
      watcher.start();

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Error should be logged during start
      expect(errorCallback).toHaveBeenCalled();

      watcher.stop();
    });
  });

  describe('Watcher lifecycle', () => {
    test('should start and stop watcher correctly', async () => {
      const config = `Host test\n    HostName 1.2.3.4`;
      await writeFile(testFilePath, config, 'utf-8');

      const watcher = new SSHConfigWatcher({
        filePath: testFilePath,
      });

      expect(watcher.isActive()).toBe(false);

      watcher.start();
      expect(watcher.isActive()).toBe(true);

      watcher.stop();
      expect(watcher.isActive()).toBe(false);
    });

    test('should not start watcher twice', async () => {
      const config = `Host test\n    HostName 1.2.3.4`;
      await writeFile(testFilePath, config, 'utf-8');

      const watcher = new SSHConfigWatcher({
        filePath: testFilePath,
      });

      watcher.start();
      expect(watcher.isActive()).toBe(true);

      // Try to start again
      watcher.start();
      expect(watcher.isActive()).toBe(true);

      watcher.stop();
    });

    test('should preserve initial hosts when provided', () => {
      const initialHosts: SSHHost[] = [
        {
          name: 'initial-host',
          uri: 'ssh://192.168.1.1',
          user: 'admin',
        },
      ];

      const watcher = new SSHConfigWatcher({
        filePath: testFilePath,
      });

      watcher.start(initialHosts);

      const hosts = watcher.getLastValidHosts();
      expect(hosts).toEqual(initialHosts);

      watcher.stop();
    });
  });

  describe('Logging integration', () => {
    test('should log reload events when logger is provided', async () => {
      const config = `Host test\n    HostName 1.2.3.4`;
      await writeFile(testFilePath, config, 'utf-8');

      const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      };

      const watcher = new SSHConfigWatcher({
        filePath: testFilePath,
        debounceDelay: 100,
        logger: mockLogger as any,
      });

      watcher.start();

      // Should log start event
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Started watching SSH config file',
        expect.objectContaining({
          component: 'SSHConfigWatcher',
          operation: 'start',
        })
      );

      // Modify file
      await writeFile(testFilePath, config + '\n# Modified', 'utf-8');
      await new Promise(resolve => setTimeout(resolve, 300));

      // Should log reload events
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Reloading SSH config file',
        expect.any(Object)
      );

      watcher.stop();

      // Should log stop event
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Stopped watching SSH config file',
        expect.objectContaining({
          component: 'SSHConfigWatcher',
          operation: 'stop',
        })
      );
    });
  });
});
