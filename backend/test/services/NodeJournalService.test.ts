/**
 * Node Journal Service Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NodeJournalService } from '../../src/services/NodeJournalService.js';
import { SQLiteAdapter } from '../../src/database/adapters/SQLiteAdapter.js';

describe('NodeJournalService', () => {
  let journalService: NodeJournalService;
  let db: SQLiteAdapter;

  beforeEach(async () => {
    // Create in-memory database for testing
    db = new SQLiteAdapter({ path: ':memory:' });
    await db.connect();

    journalService = new NodeJournalService(db);
    await journalService.initialize();
  });

  describe('writeEntry', () => {
    it('should write a journal entry', async () => {
      const entry = {
        nodeId: 'node1',
        entryType: 'execution' as const,
        timestamp: new Date().toISOString(),
        user: 'testuser',
        action: 'command.execute',
        details: {
          command: 'ls -la',
          exitCode: 0,
        },
        executionId: 'exec123',
        status: 'success' as const,
        plugin: 'bolt',
      };

      const id = await journalService.writeEntry(entry);
      expect(id).toBeDefined();
      expect(id).toMatch(/^journal_/);
    });

    it('should write multiple entries', async () => {
      const entries = [
        {
          nodeId: 'node1',
          entryType: 'execution' as const,
          timestamp: new Date().toISOString(),
          action: 'command.execute',
          details: { command: 'ls' },
          status: 'success' as const,
        },
        {
          nodeId: 'node2',
          entryType: 'package' as const,
          timestamp: new Date().toISOString(),
          action: 'package.install',
          details: { package: 'nginx' },
          status: 'success' as const,
        },
      ];

      const ids = await journalService.writeEntries(entries);
      expect(ids).toHaveLength(2);
      expect(ids[0]).toBeDefined();
      expect(ids[1]).toBeDefined();
    });
  });

  describe('getNodeJournal', () => {
    beforeEach(async () => {
      // Add test entries
      await journalService.writeEntry({
        nodeId: 'node1',
        entryType: 'execution',
        timestamp: new Date().toISOString(),
        action: 'command.execute',
        details: { command: 'ls' },
        status: 'success',
      });

      await journalService.writeEntry({
        nodeId: 'node1',
        entryType: 'package',
        timestamp: new Date().toISOString(),
        action: 'package.install',
        details: { package: 'nginx' },
        status: 'success',
      });

      await journalService.writeEntry({
        nodeId: 'node2',
        entryType: 'execution',
        timestamp: new Date().toISOString(),
        action: 'task.execute',
        details: { task: 'deploy' },
        status: 'failed',
      });
    });

    it('should get all entries for a node', async () => {
      const entries = await journalService.getNodeJournal('node1');
      expect(entries).toHaveLength(2);
      expect(entries[0].nodeId).toBe('node1');
      expect(entries[1].nodeId).toBe('node1');
    });

    it('should filter by entry type', async () => {
      const entries = await journalService.getNodeJournal('node1', {
        entryTypes: ['execution'],
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].entryType).toBe('execution');
    });

    it('should filter by status', async () => {
      const entries = await journalService.getNodeJournal('node1', {
        status: 'success',
      });
      expect(entries).toHaveLength(2);
    });

    it('should limit results', async () => {
      const entries = await journalService.getNodeJournal('node1', {
        limit: 1,
      });
      expect(entries).toHaveLength(1);
    });
  });

  describe('queryEntries', () => {
    beforeEach(async () => {
      await journalService.writeEntry({
        nodeId: 'node1',
        entryType: 'execution',
        timestamp: new Date().toISOString(),
        user: 'user1',
        action: 'command.execute',
        details: { command: 'ls' },
        status: 'success',
        plugin: 'bolt',
      });

      await journalService.writeEntry({
        nodeId: 'node2',
        entryType: 'package',
        timestamp: new Date().toISOString(),
        user: 'user2',
        action: 'package.install',
        details: { package: 'nginx' },
        status: 'success',
        plugin: 'bolt',
      });
    });

    it('should query all entries', async () => {
      const entries = await journalService.queryEntries();
      expect(entries.length).toBeGreaterThanOrEqual(2);
    });

    it('should filter by user', async () => {
      const entries = await journalService.queryEntries({ user: 'user1' });
      expect(entries).toHaveLength(1);
      expect(entries[0].user).toBe('user1');
    });

    it('should filter by plugin', async () => {
      const entries = await journalService.queryEntries({ plugin: 'bolt' });
      expect(entries.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getEntriesByExecution', () => {
    it('should get entries by execution ID', async () => {
      const executionId = 'exec123';

      await journalService.writeEntry({
        nodeId: 'node1',
        entryType: 'execution',
        timestamp: new Date().toISOString(),
        action: 'command.execute',
        details: { command: 'ls' },
        executionId,
        status: 'success',
      });

      await journalService.writeEntry({
        nodeId: 'node2',
        entryType: 'execution',
        timestamp: new Date().toISOString(),
        action: 'command.execute',
        details: { command: 'ls' },
        executionId,
        status: 'success',
      });

      const entries = await journalService.getEntriesByExecution(executionId);
      expect(entries).toHaveLength(2);
      expect(entries[0].executionId).toBe(executionId);
      expect(entries[1].executionId).toBe(executionId);
    });
  });

  describe('getNodeStatistics', () => {
    beforeEach(async () => {
      await journalService.writeEntry({
        nodeId: 'node1',
        entryType: 'execution',
        timestamp: new Date().toISOString(),
        action: 'command.execute',
        details: { command: 'ls' },
        status: 'success',
      });

      await journalService.writeEntry({
        nodeId: 'node1',
        entryType: 'package',
        timestamp: new Date().toISOString(),
        action: 'package.install',
        details: { package: 'nginx' },
        status: 'success',
      });

      await journalService.writeEntry({
        nodeId: 'node1',
        entryType: 'execution',
        timestamp: new Date().toISOString(),
        action: 'task.execute',
        details: { task: 'deploy' },
        status: 'failed',
      });
    });

    it('should get node statistics', async () => {
      const stats = await journalService.getNodeStatistics('node1');

      expect(stats.totalEntries).toBe(3);
      expect(stats.byType.execution).toBe(2);
      expect(stats.byType.package).toBe(1);
      expect(stats.byStatus.success).toBe(2);
      expect(stats.byStatus.failed).toBe(1);
      expect(stats.lastActivity).toBeDefined();
    });
  });

  describe('deleteOldEntries', () => {
    it('should delete entries before a date', async () => {
      const oldDate = new Date('2020-01-01').toISOString();
      const newDate = new Date().toISOString();

      await journalService.writeEntry({
        nodeId: 'node1',
        entryType: 'execution',
        timestamp: oldDate,
        action: 'command.execute',
        details: { command: 'ls' },
        status: 'success',
      });

      await journalService.writeEntry({
        nodeId: 'node1',
        entryType: 'execution',
        timestamp: newDate,
        action: 'command.execute',
        details: { command: 'pwd' },
        status: 'success',
      });

      const deletedCount = await journalService.deleteOldEntries('2021-01-01');
      expect(deletedCount).toBe(1);

      const entries = await journalService.getNodeJournal('node1');
      expect(entries).toHaveLength(1);
      expect(entries[0].details.command).toBe('pwd');
    });
  });
});
