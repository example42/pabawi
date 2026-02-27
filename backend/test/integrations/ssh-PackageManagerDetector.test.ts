/**
 * Unit tests for PackageManagerDetector
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Client } from 'ssh2';
import { PackageManagerDetector } from '../../src/integrations/ssh/PackageManagerDetector';
import { PackageManager } from '../../src/integrations/ssh/types';

describe('PackageManagerDetector', () => {
  let detector: PackageManagerDetector;
  let mockConnection: any;

  beforeEach(() => {
    detector = new PackageManagerDetector();
    mockConnection = {
      exec: vi.fn(),
    } as unknown as Client;
  });

  describe('getInstallCommand', () => {
    it('should generate apt install command', () => {
      const cmd = detector.getInstallCommand('apt', 'nginx');
      expect(cmd).toBe('apt-get install -y nginx');
    });

    it('should generate yum install command', () => {
      const cmd = detector.getInstallCommand('yum', 'httpd');
      expect(cmd).toBe('yum install -y httpd');
    });

    it('should generate dnf install command', () => {
      const cmd = detector.getInstallCommand('dnf', 'httpd');
      expect(cmd).toBe('dnf install -y httpd');
    });

    it('should generate zypper install command', () => {
      const cmd = detector.getInstallCommand('zypper', 'apache2');
      expect(cmd).toBe('zypper install -y apache2');
    });

    it('should generate pacman install command', () => {
      const cmd = detector.getInstallCommand('pacman', 'nginx');
      expect(cmd).toBe('pacman -S --noconfirm nginx');
    });

    it('should throw error for unknown package manager', () => {
      expect(() => {
        detector.getInstallCommand('unknown', 'nginx');
      }).toThrow('Cannot generate install command: package manager unknown');
    });
  });

  describe('getRemoveCommand', () => {
    it('should generate apt remove command', () => {
      const cmd = detector.getRemoveCommand('apt', 'nginx');
      expect(cmd).toBe('apt-get remove -y nginx');
    });

    it('should generate yum remove command', () => {
      const cmd = detector.getRemoveCommand('yum', 'httpd');
      expect(cmd).toBe('yum remove -y httpd');
    });

    it('should generate dnf remove command', () => {
      const cmd = detector.getRemoveCommand('dnf', 'httpd');
      expect(cmd).toBe('dnf remove -y httpd');
    });

    it('should generate zypper remove command', () => {
      const cmd = detector.getRemoveCommand('zypper', 'apache2');
      expect(cmd).toBe('zypper remove -y apache2');
    });

    it('should generate pacman remove command', () => {
      const cmd = detector.getRemoveCommand('pacman', 'nginx');
      expect(cmd).toBe('pacman -R --noconfirm nginx');
    });

    it('should throw error for unknown package manager', () => {
      expect(() => {
        detector.getRemoveCommand('unknown', 'nginx');
      }).toThrow('Cannot generate remove command: package manager unknown');
    });
  });

  describe('getUpdateCommand', () => {
    it('should generate apt update command', () => {
      const cmd = detector.getUpdateCommand('apt', 'nginx');
      expect(cmd).toBe('apt-get install --only-upgrade -y nginx');
    });

    it('should generate yum update command', () => {
      const cmd = detector.getUpdateCommand('yum', 'httpd');
      expect(cmd).toBe('yum update -y httpd');
    });

    it('should generate dnf update command', () => {
      const cmd = detector.getUpdateCommand('dnf', 'httpd');
      expect(cmd).toBe('dnf update -y httpd');
    });

    it('should generate zypper update command', () => {
      const cmd = detector.getUpdateCommand('zypper', 'apache2');
      expect(cmd).toBe('zypper update -y apache2');
    });

    it('should generate pacman update command', () => {
      const cmd = detector.getUpdateCommand('pacman', 'nginx');
      expect(cmd).toBe('pacman -S --noconfirm nginx');
    });

    it('should throw error for unknown package manager', () => {
      expect(() => {
        detector.getUpdateCommand('unknown', 'nginx');
      }).toThrow('Cannot generate update command: package manager unknown');
    });
  });

  describe('detect', () => {
    const setupMockExec = (commandResults: Record<string, number>) => {
      mockConnection.exec.mockImplementation((cmd: string, callback: any) => {
        const command = cmd.replace('command -v ', '');
        const exitCode = commandResults[command] ?? 1;

        const mockStream = {
          on: vi.fn((event: string, handler: any) => {
            if (event === 'close') {
              setTimeout(() => handler(exitCode), 0);
            }
            return mockStream;
          }),
          stderr: {
            on: vi.fn(() => mockStream),
          },
        };

        callback(null, mockStream);
        return mockStream;
      });
    };

    it('should detect apt and cache result', async () => {
      setupMockExec({ 'apt-get': 0 });

      const result = await detector.detect(mockConnection, 'host1');
      expect(result).toBe('apt');

      // Second call should use cache
      const result2 = await detector.detect(mockConnection, 'host1');
      expect(result2).toBe('apt');
      expect(mockConnection.exec).toHaveBeenCalledTimes(1);
    });

    it('should detect dnf when apt is not available', async () => {
      setupMockExec({ 'apt-get': 1, 'dnf': 0 });

      const result = await detector.detect(mockConnection, 'host2');
      expect(result).toBe('dnf');
    });

    it('should detect yum when apt and dnf are not available', async () => {
      setupMockExec({ 'apt-get': 1, 'dnf': 1, 'yum': 0 });

      const result = await detector.detect(mockConnection, 'host3');
      expect(result).toBe('yum');
    });

    it('should detect zypper when apt, dnf, and yum are not available', async () => {
      setupMockExec({ 'apt-get': 1, 'dnf': 1, 'yum': 1, 'zypper': 0 });

      const result = await detector.detect(mockConnection, 'host4');
      expect(result).toBe('zypper');
    });

    it('should detect pacman when other package managers are not available', async () => {
      setupMockExec({ 'apt-get': 1, 'dnf': 1, 'yum': 1, 'zypper': 1, 'pacman': 0 });

      const result = await detector.detect(mockConnection, 'host5');
      expect(result).toBe('pacman');
    });

    it('should return unknown when no package manager is detected', async () => {
      setupMockExec({});

      const result = await detector.detect(mockConnection, 'host6');
      expect(result).toBe('unknown');
    });

    it('should handle connection errors gracefully', async () => {
      mockConnection.exec.mockImplementation((cmd: string, callback: any) => {
        callback(new Error('Connection failed'), null);
      });

      const result = await detector.detect(mockConnection, 'host7');
      expect(result).toBe('unknown');
    });
  });

  describe('cache management', () => {
    it('should clear cache for specific host', async () => {
      const setupMockExec = (exitCode: number) => {
        mockConnection.exec.mockImplementation((cmd: string, callback: any) => {
          const mockStream = {
            on: vi.fn((event: string, handler: any) => {
              if (event === 'close') {
                setTimeout(() => handler(exitCode), 0);
              }
              return mockStream;
            }),
            stderr: {
              on: vi.fn(() => mockStream),
            },
          };

          callback(null, mockStream);
          return mockStream;
        });
      };

      setupMockExec(0);
      await detector.detect(mockConnection, 'host1');

      detector.clearCache('host1');

      // Should re-detect after cache clear
      await detector.detect(mockConnection, 'host1');
      expect(mockConnection.exec).toHaveBeenCalledTimes(2);
    });

    it('should clear all cache', async () => {
      const setupMockExec = (exitCode: number) => {
        mockConnection.exec.mockImplementation((cmd: string, callback: any) => {
          const mockStream = {
            on: vi.fn((event: string, handler: any) => {
              if (event === 'close') {
                setTimeout(() => handler(exitCode), 0);
              }
              return mockStream;
            }),
            stderr: {
              on: vi.fn(() => mockStream),
            },
          };

          callback(null, mockStream);
          return mockStream;
        });
      };

      setupMockExec(0);
      await detector.detect(mockConnection, 'host1');
      await detector.detect(mockConnection, 'host2');

      detector.clearAllCache();

      // Should re-detect after cache clear
      await detector.detect(mockConnection, 'host1');
      await detector.detect(mockConnection, 'host2');
      expect(mockConnection.exec).toHaveBeenCalledTimes(4);
    });
  });
});
