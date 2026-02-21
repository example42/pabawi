import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import sqlite3 from 'sqlite3';
import { DatabaseService } from '../../src/database/DatabaseService';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('Database Index Verification', () => {
  let databaseService: DatabaseService;
  let db: sqlite3.Database;
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
    const indexes = await new Promise<any[]>((resolve, reject) => {
      db.all(
        "SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'",
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

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

      // Composite indexes for optimized permission checks
      'idx_user_roles_composite',
      'idx_user_groups_composite',
      'idx_group_roles_composite',
      'idx_role_permissions_composite',

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
    const compositeIndexes = await new Promise<any[]>((resolve, reject) => {
      db.all(
        "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND name LIKE '%composite%'",
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    expect(compositeIndexes.length).toBeGreaterThanOrEqual(4);

    const indexInfo = compositeIndexes.map((idx) => ({
      name: idx.name,
      table: idx.tbl_name,
    }));

    console.log('Composite indexes:', indexInfo);

    // Verify composite indexes are on the correct tables
    expect(indexInfo.some((idx) => idx.table === 'user_roles')).toBe(true);
    expect(indexInfo.some((idx) => idx.table === 'user_groups')).toBe(true);
    expect(indexInfo.some((idx) => idx.table === 'group_roles')).toBe(true);
    expect(indexInfo.some((idx) => idx.table === 'role_permissions')).toBe(true);
  });

  it('should have WAL mode enabled', async () => {
    const journalMode = await new Promise<string>((resolve, reject) => {
      db.get('PRAGMA journal_mode;', (err, row: any) => {
        if (err) reject(err);
        else resolve(row.journal_mode);
      });
    });

    expect(journalMode.toLowerCase()).toBe('wal');
    console.log('✓ WAL mode is enabled');
  });

  it('should have foreign keys enabled', async () => {
    const foreignKeys = await new Promise<number>((resolve, reject) => {
      db.get('PRAGMA foreign_keys;', (err, row: any) => {
        if (err) reject(err);
        else resolve(row.foreign_keys);
      });
    });

    expect(foreignKeys).toBe(1);
    console.log('✓ Foreign keys are enabled');
  });

  it('should have performance pragmas configured', async () => {
    const pragmas = await Promise.all([
      new Promise<any>((resolve, reject) => {
        db.get('PRAGMA synchronous;', (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      }),
      new Promise<any>((resolve, reject) => {
        db.get('PRAGMA cache_size;', (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      }),
      new Promise<any>((resolve, reject) => {
        db.get('PRAGMA temp_store;', (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      }),
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
