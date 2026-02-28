import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sqlite3 from 'sqlite3';
import { AuditLoggingService, AuditEventType, AuditAction, AuditResult } from '../../src/services/AuditLoggingService';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('AuditLoggingService', () => {
  let db: sqlite3.Database;
  let auditLogger: AuditLoggingService;

  beforeEach(async () => {
    // Create in-memory database
    db = new sqlite3.Database(':memory:');

    // Load and execute audit schema
    const schemaPath = join(__dirname, '../../src/database/migrations/004_audit_logging.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    await new Promise<void>((resolve, reject) => {
      db.exec(schema, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    auditLogger = new AuditLoggingService(db);
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  describe('logAuthenticationAttempt', () => {
    it('should log successful authentication', async () => {
      await auditLogger.logAuthenticationAttempt(
        'testuser',
        true,
        'user-123',
        '192.168.1.1',
        'Mozilla/5.0'
      );

      const logs = await auditLogger.queryLogs({
        eventType: AuditEventType.AUTH,
        action: AuditAction.LOGIN_SUCCESS
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].userId).toBe('user-123');
      expect(logs[0].ipAddress).toBe('192.168.1.1');
      expect(logs[0].userAgent).toBe('Mozilla/5.0');
      expect(logs[0].result).toBe(AuditResult.SUCCESS);
      expect(logs[0].details?.username).toBe('testuser');
    });

    it('should log failed authentication with reason', async () => {
      await auditLogger.logAuthenticationAttempt(
        'testuser',
        false,
        null,
        '192.168.1.1',
        'Mozilla/5.0',
        'Invalid password'
      );

      const logs = await auditLogger.queryLogs({
        eventType: AuditEventType.AUTH,
        action: AuditAction.LOGIN_FAILURE
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].userId).toBeNull();
      expect(logs[0].result).toBe(AuditResult.FAILURE);
      expect(logs[0].details?.reason).toBe('Invalid password');
    });
  });

  describe('logAuthorizationFailure', () => {
    it('should log authorization denial', async () => {
      await auditLogger.logAuthorizationFailure(
        'user-123',
        'ansible',
        'execute',
        '192.168.1.1',
        'Mozilla/5.0'
      );

      const logs = await auditLogger.queryLogs({
        eventType: AuditEventType.AUTHZ,
        result: AuditResult.DENIED
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].userId).toBe('user-123');
      expect(logs[0].action).toBe(AuditAction.PERMISSION_DENIED);
      expect(logs[0].details?.resource).toBe('ansible');
      expect(logs[0].details?.requiredAction).toBe('execute');
    });
  });

  describe('logUserChange', () => {
    it('should log user creation by admin', async () => {
      await auditLogger.logUserChange(
        AuditAction.USER_CREATED,
        'admin-123',
        'user-456',
        { username: 'newuser', email: 'new@example.com' },
        '192.168.1.1',
        'Mozilla/5.0'
      );

      const logs = await auditLogger.queryLogs({
        eventType: AuditEventType.USER
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].userId).toBe('admin-123');
      expect(logs[0].targetUserId).toBe('user-456');
      expect(logs[0].targetResourceType).toBe('user');
      expect(logs[0].details?.username).toBe('newuser');
    });
  });

  describe('queryLogs', () => {
    beforeEach(async () => {
      // Create test data
      await auditLogger.logAuthenticationAttempt('user1', true, 'user-1', '192.168.1.1');
      await auditLogger.logAuthenticationAttempt('user2', false, null, '192.168.1.2');
      await auditLogger.logAuthorizationFailure('user-1', 'bolt', 'admin', '192.168.1.1');
    });

    it('should filter by event type', async () => {
      const logs = await auditLogger.queryLogs({
        eventType: AuditEventType.AUTH
      });

      expect(logs).toHaveLength(2);
      expect(logs.every(log => log.eventType === AuditEventType.AUTH)).toBe(true);
    });

    it('should filter by user ID', async () => {
      const logs = await auditLogger.queryLogs({
        userId: 'user-1'
      });

      expect(logs).toHaveLength(2);
      expect(logs.every(log => log.userId === 'user-1')).toBe(true);
    });

    it('should filter by result', async () => {
      const logs = await auditLogger.queryLogs({
        result: AuditResult.FAILURE
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].result).toBe(AuditResult.FAILURE);
    });

    it('should apply limit', async () => {
      const logs = await auditLogger.queryLogs({
        limit: 2
      });

      expect(logs).toHaveLength(2);
    });

    it('should filter by IP address', async () => {
      const logs = await auditLogger.queryLogs({
        ipAddress: '192.168.1.1'
      });

      expect(logs).toHaveLength(2);
      expect(logs.every(log => log.ipAddress === '192.168.1.1')).toBe(true);
    });
  });

  describe('getStatistics', () => {
    beforeEach(async () => {
      // Create test data
      await auditLogger.logAuthenticationAttempt('user1', true, 'user-1', '192.168.1.1');
      await auditLogger.logAuthenticationAttempt('user2', false, null, '192.168.1.2');
      await auditLogger.logAuthenticationAttempt('user3', false, null, '192.168.1.3');
      await auditLogger.logAuthorizationFailure('user-1', 'bolt', 'admin', '192.168.1.1');
      await auditLogger.logAdminAction('user_promoted', 'admin-1', {}, '192.168.1.1');
    });

    it('should return correct statistics', async () => {
      const stats = await auditLogger.getStatistics();

      expect(stats.totalLogs).toBe(5);
      expect(stats.authenticationAttempts).toBe(3);
      expect(stats.authenticationFailures).toBe(2);
      expect(stats.authorizationFailures).toBe(1);
      expect(stats.adminActions).toBe(1);
    });
  });

  describe('getUserAuditLogs', () => {
    it('should return logs for specific user', async () => {
      await auditLogger.logAuthenticationAttempt('user1', true, 'user-123', '192.168.1.1');
      await auditLogger.logAuthorizationFailure('user-123', 'ansible', 'write', '192.168.1.1');
      await auditLogger.logAuthenticationAttempt('user2', true, 'user-456', '192.168.1.2');

      const logs = await auditLogger.getUserAuditLogs('user-123');

      expect(logs).toHaveLength(2);
      expect(logs.every(log => log.userId === 'user-123')).toBe(true);
    });
  });

  describe('getRecentFailedLogins', () => {
    it('should return only failed login attempts', async () => {
      await auditLogger.logAuthenticationAttempt('user1', true, 'user-1', '192.168.1.1');
      await auditLogger.logAuthenticationAttempt('user2', false, null, '192.168.1.2');
      await auditLogger.logAuthenticationAttempt('user3', false, null, '192.168.1.3');

      const logs = await auditLogger.getRecentFailedLogins();

      expect(logs).toHaveLength(2);
      expect(logs.every(log => log.action === AuditAction.LOGIN_FAILURE)).toBe(true);
    });
  });

  describe('getAuthorizationFailures', () => {
    it('should return only authorization failures', async () => {
      await auditLogger.logAuthenticationAttempt('user1', false, null, '192.168.1.1');
      await auditLogger.logAuthorizationFailure('user-1', 'ansible', 'admin', '192.168.1.1');
      await auditLogger.logAuthorizationFailure('user-2', 'bolt', 'write', '192.168.1.2');

      const logs = await auditLogger.getAuthorizationFailures();

      expect(logs).toHaveLength(2);
      expect(logs.every(log => log.eventType === AuditEventType.AUTHZ)).toBe(true);
      expect(logs.every(log => log.result === AuditResult.DENIED)).toBe(true);
    });
  });
});
