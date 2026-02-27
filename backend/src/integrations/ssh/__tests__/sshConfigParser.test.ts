/**
 * Unit tests for SSH Config Parser
 *
 * Tests parsing of OpenSSH config files and extraction of host definitions.
 */

import { parseSSHConfig, serializeSSHConfig } from '../sshConfigParser';
import { SSHHost } from '../types';

describe('SSH Config Parser', () => {
  describe('parseSSHConfig', () => {
    it('should parse a simple host entry', () => {
      const config = `
Host web-server-01
    HostName 192.168.1.10
    User deploy
    Port 22
    IdentityFile /path/to/key
`;

      const result = parseSSHConfig(config);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.hosts).toHaveLength(1);

      const host = result.hosts[0];
      expect(host.name).toBe('web-server-01');
      expect(host.uri).toBe('ssh://192.168.1.10');
      expect(host.user).toBe('deploy');
      expect(host.port).toBe(22);
      expect(host.privateKeyPath).toBe('/path/to/key');
    });

    it('should parse host with alias', () => {
      const config = `
Host web-server-01 web01
    HostName 192.168.1.10
    User deploy
`;

      const result = parseSSHConfig(config);

      expect(result.success).toBe(true);
      expect(result.hosts).toHaveLength(1);

      const host = result.hosts[0];
      expect(host.name).toBe('web-server-01');
      expect(host.alias).toBe('web01');
    });

    it('should parse multiple aliases (use first as alias)', () => {
      const config = `
Host web-server-01 web01 web-prod
    HostName 192.168.1.10
`;

      const result = parseSSHConfig(config);

      expect(result.success).toBe(true);
      expect(result.hosts).toHaveLength(1);

      const host = result.hosts[0];
      expect(host.name).toBe('web-server-01');
      expect(host.alias).toBe('web01');
    });

    it('should parse group metadata from comments', () => {
      const config = `
Host web-server-01
    HostName 192.168.1.10
    # Groups: webservers,production
`;

      const result = parseSSHConfig(config);

      expect(result.success).toBe(true);
      expect(result.hosts).toHaveLength(1);

      const host = result.hosts[0];
      expect(host.groups).toEqual(['webservers', 'production']);
    });

    it('should parse group metadata with spaces', () => {
      const config = `
Host web-server-01
    HostName 192.168.1.10
    # Groups: webservers, production, us-east
`;

      const result = parseSSHConfig(config);

      expect(result.success).toBe(true);
      const host = result.hosts[0];
      expect(host.groups).toEqual(['webservers', 'production', 'us-east']);
    });

    it('should parse multiple hosts', () => {
      const config = `
Host web-server-01
    HostName 192.168.1.10
    User deploy

Host db-server-01
    HostName 192.168.1.20
    User dbadmin
    Port 2222
`;

      const result = parseSSHConfig(config);

      expect(result.success).toBe(true);
      expect(result.hosts).toHaveLength(2);

      expect(result.hosts[0].name).toBe('web-server-01');
      expect(result.hosts[0].uri).toBe('ssh://192.168.1.10');
      expect(result.hosts[0].user).toBe('deploy');

      expect(result.hosts[1].name).toBe('db-server-01');
      expect(result.hosts[1].uri).toBe('ssh://192.168.1.20');
      expect(result.hosts[1].user).toBe('dbadmin');
      expect(result.hosts[1].port).toBe(2222);
    });

    it('should skip wildcard host patterns', () => {
      const config = `
Host web-server-01
    HostName 192.168.1.10

Host *.prod
    User deploy

Host *
    ServerAliveInterval 60
`;

      const result = parseSSHConfig(config);

      expect(result.success).toBe(true);
      expect(result.hosts).toHaveLength(1);
      expect(result.hosts[0].name).toBe('web-server-01');
    });

    it('should skip hosts without HostName', () => {
      const config = `
Host web-server-01
    User deploy
    Port 22

Host web-server-02
    HostName 192.168.1.20
    User deploy
`;

      const result = parseSSHConfig(config);

      expect(result.success).toBe(true);
      expect(result.hosts).toHaveLength(1);
      expect(result.hosts[0].name).toBe('web-server-02');
    });

    it('should handle invalid port numbers gracefully', () => {
      const config = `
Host web-server-01
    HostName 192.168.1.10
    Port invalid
`;

      const result = parseSSHConfig(config);

      expect(result.success).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Invalid port number');

      // Should still parse the host without the port
      expect(result.hosts).toHaveLength(1);
      expect(result.hosts[0].port).toBeUndefined();
    });

    it('should handle port numbers out of range', () => {
      const config = `
Host web-server-01
    HostName 192.168.1.10
    Port 99999
`;

      const result = parseSSHConfig(config);

      expect(result.success).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Invalid port number');
    });

    it('should ignore unsupported keywords', () => {
      const config = `
Host web-server-01
    HostName 192.168.1.10
    User deploy
    StrictHostKeyChecking yes
    ServerAliveInterval 60
    ServerAliveCountMax 3
`;

      const result = parseSSHConfig(config);

      expect(result.success).toBe(true);
      expect(result.hosts).toHaveLength(1);
      expect(result.hosts[0].name).toBe('web-server-01');
    });

    it('should handle empty config file', () => {
      const config = '';

      const result = parseSSHConfig(config);

      expect(result.success).toBe(true);
      expect(result.hosts).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle config with only comments', () => {
      const config = `
# This is a comment
# Another comment
`;

      const result = parseSSHConfig(config);

      expect(result.success).toBe(true);
      expect(result.hosts).toHaveLength(0);
    });

    it('should handle Host directive without pattern', () => {
      const config = `
Host
    HostName 192.168.1.10
`;

      const result = parseSSHConfig(config);

      expect(result.success).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Host directive without pattern');
      expect(result.hosts).toHaveLength(0);
    });

    it('should remove quotes from IdentityFile', () => {
      const config = `
Host web-server-01
    HostName 192.168.1.10
    IdentityFile "/path/to/key with spaces"
`;

      const result = parseSSHConfig(config);

      expect(result.success).toBe(true);
      expect(result.hosts[0].privateKeyPath).toBe('/path/to/key with spaces');
    });

    it('should handle case-insensitive keywords', () => {
      const config = `
host web-server-01
    hostname 192.168.1.10
    user deploy
    port 22
    identityfile /path/to/key
`;

      const result = parseSSHConfig(config);

      expect(result.success).toBe(true);
      expect(result.hosts).toHaveLength(1);

      const host = result.hosts[0];
      expect(host.name).toBe('web-server-01');
      expect(host.uri).toBe('ssh://192.168.1.10');
      expect(host.user).toBe('deploy');
      expect(host.port).toBe(22);
      expect(host.privateKeyPath).toBe('/path/to/key');
    });
  });

  describe('serializeSSHConfig', () => {
    it('should serialize a simple host', () => {
      const hosts: SSHHost[] = [
        {
          name: 'web-server-01',
          uri: 'ssh://192.168.1.10',
          user: 'deploy',
          port: 22,
          privateKeyPath: '/path/to/key',
        },
      ];

      const config = serializeSSHConfig(hosts);

      expect(config).toContain('Host web-server-01');
      expect(config).toContain('HostName 192.168.1.10');
      expect(config).toContain('User deploy');
      expect(config).toContain('Port 22');
      expect(config).toContain('IdentityFile /path/to/key');
    });

    it('should serialize host with alias', () => {
      const hosts: SSHHost[] = [
        {
          name: 'web-server-01',
          uri: 'ssh://192.168.1.10',
          alias: 'web01',
        },
      ];

      const config = serializeSSHConfig(hosts);

      expect(config).toContain('Host web-server-01 web01');
    });

    it('should serialize host with groups', () => {
      const hosts: SSHHost[] = [
        {
          name: 'web-server-01',
          uri: 'ssh://192.168.1.10',
          groups: ['webservers', 'production'],
        },
      ];

      const config = serializeSSHConfig(hosts);

      expect(config).toContain('# Groups: webservers,production');
    });

    it('should serialize multiple hosts with blank lines', () => {
      const hosts: SSHHost[] = [
        {
          name: 'web-server-01',
          uri: 'ssh://192.168.1.10',
        },
        {
          name: 'db-server-01',
          uri: 'ssh://192.168.1.20',
        },
      ];

      const config = serializeSSHConfig(hosts);

      expect(config).toContain('Host web-server-01');
      expect(config).toContain('Host db-server-01');

      // Should have blank lines between hosts
      const lines = config.split('\n');
      expect(lines.some(line => line === '')).toBe(true);
    });
  });

  describe('round-trip parsing', () => {
    it('should preserve data through serialize and parse cycle', () => {
      const originalHosts: SSHHost[] = [
        {
          name: 'web-server-01',
          uri: 'ssh://192.168.1.10',
          alias: 'web01',
          user: 'deploy',
          port: 22,
          privateKeyPath: '/path/to/key',
          groups: ['webservers', 'production'],
        },
        {
          name: 'db-server-01',
          uri: 'ssh://192.168.1.20',
          user: 'dbadmin',
          port: 2222,
          privateKeyPath: '/path/to/db_key',
          groups: ['databases', 'production'],
        },
      ];

      const serialized = serializeSSHConfig(originalHosts);
      const parsed = parseSSHConfig(serialized);

      expect(parsed.success).toBe(true);
      expect(parsed.errors).toHaveLength(0);
      expect(parsed.hosts).toHaveLength(2);

      // Check first host
      expect(parsed.hosts[0]).toMatchObject({
        name: 'web-server-01',
        uri: 'ssh://192.168.1.10',
        alias: 'web01',
        user: 'deploy',
        port: 22,
        privateKeyPath: '/path/to/key',
        groups: ['webservers', 'production'],
      });

      // Check second host
      expect(parsed.hosts[1]).toMatchObject({
        name: 'db-server-01',
        uri: 'ssh://192.168.1.20',
        user: 'dbadmin',
        port: 2222,
        privateKeyPath: '/path/to/db_key',
        groups: ['databases', 'production'],
      });
    });
  });
});
