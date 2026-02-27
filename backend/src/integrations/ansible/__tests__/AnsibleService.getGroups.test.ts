/**
 * Unit tests for AnsibleService.getGroups()
 *
 * Tests group extraction from Ansible inventory
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnsibleService } from '../AnsibleService';
import { spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
vi.mock('child_process');

describe('AnsibleService.getGroups()', () => {
  let ansibleService: AnsibleService;
  const mockProjectPath = '/test/ansible/project';
  const mockInventoryPath = 'inventory/hosts.yml';

  beforeEach(() => {
    ansibleService = new AnsibleService(mockProjectPath, mockInventoryPath);
    vi.clearAllMocks();
  });

  it('should parse groups from ansible-inventory output', async () => {
    // Mock ansible-inventory output with groups
    const mockInventoryOutput = JSON.stringify({
      _meta: {
        hostvars: {
          'web1.example.com': {},
          'web2.example.com': {},
          'db1.example.com': {},
        },
      },
      webservers: {
        hosts: ['web1.example.com', 'web2.example.com'],
        vars: {
          http_port: 80,
          ansible_user: 'deploy',
        },
      },
      databases: {
        hosts: ['db1.example.com'],
        vars: {
          db_port: 5432,
        },
      },
    });

    mockSpawnSuccess(mockInventoryOutput);

    const groups = await ansibleService.getGroups();

    expect(groups).toHaveLength(2);

    // Check webservers group
    const webserversGroup = groups.find(g => g.name === 'webservers');
    expect(webserversGroup).toBeDefined();
    expect(webserversGroup?.id).toBe('ansible:webservers');
    expect(webserversGroup?.source).toBe('ansible');
    expect(webserversGroup?.sources).toEqual(['ansible']);
    expect(webserversGroup?.linked).toBe(false);
    expect(webserversGroup?.nodes).toEqual([
      'ansible:web1.example.com',
      'ansible:web2.example.com',
    ]);
    expect(webserversGroup?.metadata?.variables).toEqual({
      http_port: 80,
      ansible_user: 'deploy',
    });

    // Check databases group
    const databasesGroup = groups.find(g => g.name === 'databases');
    expect(databasesGroup).toBeDefined();
    expect(databasesGroup?.id).toBe('ansible:databases');
    expect(databasesGroup?.nodes).toEqual(['ansible:db1.example.com']);
    expect(databasesGroup?.metadata?.variables).toEqual({
      db_port: 5432,
    });
  });

  it('should handle groups with children (hierarchy)', async () => {
    const mockInventoryOutput = JSON.stringify({
      _meta: {
        hostvars: {
          'web1.example.com': {},
          'db1.example.com': {},
        },
      },
      webservers: {
        hosts: ['web1.example.com'],
      },
      databases: {
        hosts: ['db1.example.com'],
      },
      production: {
        children: ['webservers', 'databases'],
        hosts: [],
        vars: {
          environment: 'prod',
        },
      },
    });

    mockSpawnSuccess(mockInventoryOutput);

    const groups = await ansibleService.getGroups();

    const productionGroup = groups.find(g => g.name === 'production');
    expect(productionGroup).toBeDefined();
    expect(productionGroup?.metadata?.hierarchy).toEqual(['webservers', 'databases']);
    expect(productionGroup?.metadata?.variables).toEqual({
      environment: 'prod',
    });
  });

  it('should skip special groups (all, ungrouped, _meta)', async () => {
    const mockInventoryOutput = JSON.stringify({
      _meta: {
        hostvars: {},
      },
      all: {
        hosts: ['host1'],
      },
      ungrouped: {
        hosts: ['host2'],
      },
      webservers: {
        hosts: ['web1.example.com'],
      },
    });

    mockSpawnSuccess(mockInventoryOutput);

    const groups = await ansibleService.getGroups();

    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('webservers');
  });

  it('should handle empty groups', async () => {
    const mockInventoryOutput = JSON.stringify({
      _meta: {
        hostvars: {},
      },
      webservers: {
        hosts: [],
      },
    });

    mockSpawnSuccess(mockInventoryOutput);

    const groups = await ansibleService.getGroups();

    expect(groups).toHaveLength(1);
    expect(groups[0].nodes).toEqual([]);
  });

  it('should handle groups without variables', async () => {
    const mockInventoryOutput = JSON.stringify({
      _meta: {
        hostvars: {},
      },
      webservers: {
        hosts: ['web1.example.com'],
      },
    });

    mockSpawnSuccess(mockInventoryOutput);

    const groups = await ansibleService.getGroups();

    expect(groups).toHaveLength(1);
    expect(groups[0].metadata).toBeUndefined();
  });

  it('should throw error when ansible-inventory command fails', async () => {
    mockSpawnFailure('Inventory file not found');

    await expect(ansibleService.getGroups()).rejects.toThrow(
      'Failed to get Ansible inventory: Inventory file not found'
    );
  });

  it('should throw error when inventory output is invalid JSON', async () => {
    mockSpawnSuccess('invalid json {');

    await expect(ansibleService.getGroups()).rejects.toThrow(
      'Failed to parse Ansible inventory groups'
    );
  });

  // Helper function to mock successful spawn
  function mockSpawnSuccess(stdout: string) {
    const mockProcess = new EventEmitter() as ChildProcess;
    mockProcess.stdout = new EventEmitter() as any;
    mockProcess.stderr = new EventEmitter() as any;

    vi.mocked(spawn).mockReturnValue(mockProcess);

    // Simulate async execution
    setImmediate(() => {
      mockProcess.stdout?.emit('data', Buffer.from(stdout));
      mockProcess.emit('close', 0);
    });
  }

  // Helper function to mock failed spawn
  function mockSpawnFailure(stderr: string) {
    const mockProcess = new EventEmitter() as ChildProcess;
    mockProcess.stdout = new EventEmitter() as any;
    mockProcess.stderr = new EventEmitter() as any;

    vi.mocked(spawn).mockReturnValue(mockProcess);

    setImmediate(() => {
      mockProcess.stderr?.emit('data', Buffer.from(stderr));
      mockProcess.emit('close', 1);
    });
  }
});
