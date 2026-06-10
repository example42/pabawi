import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../../src/database/DatabaseService';
import { unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('RBAC Database Schema', () => {
  let dbService: DatabaseService;
  let testDbPath: string;

  beforeEach(async () => {
    // Create temporary database for testing
    testDbPath = join(tmpdir(), `test-rbac-${Date.now()}.db`);
    dbService = new DatabaseService(testDbPath);
    await dbService.initialize();
  });

  afterEach(async () => {
    // Clean up
    await dbService.close();
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  it('should create users table with correct schema', async () => {
    const db = dbService.getConnection();

    const result = await db.queryOne<any>("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'");

    expect(result).toBeDefined();
    expect(result.sql).toContain('id TEXT PRIMARY KEY');
    expect(result.sql).toContain('username TEXT NOT NULL UNIQUE');
    expect(result.sql).toContain('email TEXT NOT NULL UNIQUE');
    expect(result.sql).toContain('password_hash TEXT');
    expect(result.sql).toContain('is_active INTEGER NOT NULL DEFAULT 1');
    expect(result.sql).toContain('is_admin INTEGER NOT NULL DEFAULT 0');
  });

  it('should create groups table', async () => {
    const db = dbService.getConnection();

    const result = await db.queryOne<any>("SELECT sql FROM sqlite_master WHERE type='table' AND name='groups'");

    expect(result).toBeDefined();
    expect(result.sql).toContain('id TEXT PRIMARY KEY');
    expect(result.sql).toContain('name TEXT NOT NULL UNIQUE');
  });

  it('should create roles table', async () => {
    const db = dbService.getConnection();

    const result = await db.queryOne<any>("SELECT sql FROM sqlite_master WHERE type='table' AND name='roles'");

    expect(result).toBeDefined();
    expect(result.sql).toContain('id TEXT PRIMARY KEY');
    expect(result.sql).toContain('name TEXT NOT NULL UNIQUE');
    expect(result.sql).toContain('is_built_in INTEGER NOT NULL DEFAULT 0');
  });

  it('should create permissions table with unique constraint', async () => {
    const db = dbService.getConnection();

    const result = await db.queryOne<any>("SELECT sql FROM sqlite_master WHERE type='table' AND name='permissions'");

    expect(result).toBeDefined();
    expect(result.sql).toContain('id TEXT PRIMARY KEY');
    expect(result.sql).toContain('resource TEXT NOT NULL');
    expect(result.sql).toContain('"action" TEXT NOT NULL');
    expect(result.sql).toContain('UNIQUE(resource, "action")');
  });

  it('should create junction tables with composite primary keys', async () => {
    const db = dbService.getConnection();

    const tables = ['user_groups', 'user_roles', 'group_roles', 'role_permissions'];

    for (const tableName of tables) {
      const result = await db.queryOne<any>(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${tableName}'`);

      expect(result).toBeDefined();
      expect(result.sql).toContain('PRIMARY KEY');
      expect(result.sql).toContain('FOREIGN KEY');
    }
  });

  it('should create revoked_tokens table', async () => {
    const db = dbService.getConnection();

    const result = await db.queryOne<any>("SELECT sql FROM sqlite_master WHERE type='table' AND name='revoked_tokens'");

    expect(result).toBeDefined();
    expect(result.sql).toContain('token TEXT PRIMARY KEY');
    expect(result.sql).toContain('user_id TEXT NOT NULL');
    expect(result.sql).toContain('revoked_at TEXT NOT NULL');
    expect(result.sql).toContain('expires_at TEXT NOT NULL');
  });

  it('should create performance indexes', async () => {
    const db = dbService.getConnection();

    const expectedIndexes = [
      'idx_users_username',
      'idx_users_email',
      'idx_users_active',
      'idx_user_roles_user',
      'idx_user_roles_role',
      'idx_user_groups_user',
      'idx_user_groups_group',
      'idx_group_roles_group',
      'idx_group_roles_role',
      'idx_role_permissions_role',
      'idx_role_permissions_perm',
      'idx_permissions_resource_action',
      'idx_revoked_tokens_token',
      'idx_revoked_tokens_expires',
      'idx_revoked_tokens_user'
    ];

    for (const indexName of expectedIndexes) {
      const result = await db.queryOne<any>(`SELECT name FROM sqlite_master WHERE type='index' AND name='${indexName}'`);

      expect(result).toBeDefined();
      expect(result.name).toBe(indexName);
    }
  });

  it('should enforce unique constraints on users table', async () => {
    const db = dbService.getConnection();

    // Insert first user
    await db.execute(`INSERT INTO users (id, username, email, password_hash, first_name, last_name, created_at, updated_at)
         VALUES ('user1', 'testuser', 'test@example.com', 'hash123', 'Test', 'User', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')`);

    // Try to insert duplicate username
    await expect(
      db.execute(`INSERT INTO users (id, username, email, password_hash, first_name, last_name, created_at, updated_at)
           VALUES ('user2', 'testuser', 'other@example.com', 'hash456', 'Other', 'User', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z')`)
    ).rejects.toThrow();
  });

  it('should enforce unique constraint on permissions resource-action combination', async () => {
    const db = dbService.getConnection();

    // Insert first permission (use unique test values to avoid conflicts with seed data)
    await db.execute(`INSERT INTO permissions (id, resource, "action", description, created_at)
         VALUES ('perm-test-1', 'test-resource', 'test-read', 'Test permission', '2024-01-01T00:00:00Z')`);

    // Try to insert duplicate resource-action
    await expect(
      db.execute(`INSERT INTO permissions (id, resource, "action", description, created_at)
           VALUES ('perm-test-2', 'test-resource', 'test-read', 'Another test permission', '2024-01-01T00:00:00Z')`)
    ).rejects.toThrow();
  });
});
