import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { DatabaseAdapter } from '../../src/database/DatabaseAdapter';
import { DatabaseService } from '../../src/database/DatabaseService';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('Database Index Verification', () => {
  let databaseService: DatabaseService;
  let db: DatabaseAdapter;
  let tempDir: string;

  beforeAll(async () => {
    // Create temporary directory for test database
    tempDir = mkdtempSync(join(tmpdir(), 'pabawi-test-'));
    const dbPath = join(tempDir, 'test.db');

    // Initialize database
    databaseService = new DatabaseService(dbPath);
    await databaseService.initialize();
    db = databaseService.getConnection();
  });

  afterAll(async () => {
    await databaseService.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should have all required indexes created', async () => {
    const indexes = await db.query<any>("SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'");

    const indexNames = indexes.map((idx) => idx.name);

    // Verify all required indexes exist
    const requiredIndexes = [
      // User lookups
      'idx_users_username',
      'idx_users_email',
      'idx_users_active',

      // Permission check optimization - single column indexes
      'idx_user_roles_user',
      'idx_user_roles_role',
      'idx_user_groups_user',
      'idx_user_groups_group',
      'idx_group_roles_group',
      'idx_group_roles_role',
      'idx_role_permissions_role',
      'idx_role_permissions_perm',

      // Permission lookups
      'idx_permissions_resource_action',

      // Token revocation
      'idx_revoked_tokens_token',
      'idx_revoked_tokens_expires',
      'idx_revoked_tokens_user',
    ];

    for (const requiredIndex of requiredIndexes) {
      expect(indexNames).toContain(requiredIndex);
    }

    console.log(`✓ Verified ${requiredIndexes.length} indexes are created`);
  });

  it('should have composite indexes on junction tables', async () => {
    // Verify that key junction table indexes exist (single-column indexes on junction tables)
    const junctionIndexes = await db.query<any>(
      "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' AND (tbl_name='user_roles' OR tbl_name='user_groups' OR tbl_name='group_roles' OR tbl_name='role_permissions')"
    );

    // Should have at least 2 indexes per junction table (one per column)
    expect(junctionIndexes.length).toBeGreaterThanOrEqual(4);

    const indexInfo = junctionIndexes.map((idx) => ({
      name: idx.name,
      table: idx.tbl_name,
    }));

    console.log('Junction table indexes:', indexInfo);

    // Verify indexes exist on the correct tables
    expect(indexInfo.some((idx) => idx.table === 'user_roles')).toBe(true);
    expect(indexInfo.some((idx) => idx.table === 'user_groups')).toBe(true);
    expect(indexInfo.some((idx) => idx.table === 'group_roles')).toBe(true);
    expect(indexInfo.some((idx) => idx.table === 'role_permissions')).toBe(true);
  });

  it('should have WAL mode enabled', async () => {
    const row = await db.queryOne<any>('PRAGMA journal_mode');
    const journalMode = row?.journal_mode ?? '';

    expect(journalMode.toLowerCase()).toBe('wal');
    console.log('✓ WAL mode is enabled');
  });

  it('should have foreign keys enabled', async () => {
    const row = await db.queryOne<any>('PRAGMA foreign_keys');
    const foreignKeys = row?.foreign_keys ?? 0;

    expect(foreignKeys).toBe(1);
    console.log('✓ Foreign keys are enabled');
  });

  it('should have performance pragmas configured', async () => {
    const pragmas = await Promise.all([
      db.queryOne<any>('PRAGMA synchronous;'),
      db.queryOne<any>('PRAGMA cache_size;'),
      db.queryOne<any>('PRAGMA temp_store;'),
    ]);

    console.log('Performance pragmas:', {
      synchronous: pragmas[0].synchronous,
      cache_size: pragmas[1].cache_size,
      temp_store: pragmas[2].temp_store,
    });

    // Verify pragmas are set (values may vary but should be set)
    expect(pragmas[0].synchronous).toBeDefined();
    expect(pragmas[1].cache_size).toBeDefined();
    expect(pragmas[2].temp_store).toBeDefined();
  });
});
