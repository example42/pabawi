import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../../src/database/DatabaseService';
import { unlinkSync, existsSync } from 'fs';

describe('Migration Integration Test', () => {
  const testDbPath = './test-migration.db';  // pragma: allowlist secret
  let dbService: DatabaseService;

  beforeEach(async () => {
    // Remove test database if it exists
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }

    dbService = new DatabaseService(testDbPath);
    await dbService.initialize();
  });

  afterEach(async () => {
    await dbService.close();

    // Clean up test database
    if (existsSync(testDbPath)) {
      unlinkSync(testDbPath);
    }
  });

  it('should apply all migrations on initialization', async () => {
    const status = await dbService.getMigrationStatus();

    // Should have applied both migrations
    expect(status.applied).toHaveLength(2);
    expect(status.applied[0].id).toBe('001');
    expect(status.applied[1].id).toBe('002');
    expect(status.pending).toHaveLength(0);
  });

  it('should have seeded data available after initialization', async () => {
    const db = dbService.getConnection();

    // Check that roles exist
    const roles = await new Promise<any[]>((resolve, reject) => {
      db.all('SELECT * FROM roles WHERE isBuiltIn = 1', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    expect(roles).toHaveLength(3);
    expect(roles.map(r => r.name).sort()).toEqual(['Administrator', 'Operator', 'Viewer']);

    // Check that config table exists and has default values
    const config = await new Promise<any[]>((resolve, reject) => {
      db.all('SELECT * FROM config', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    expect(config.length).toBeGreaterThan(0);
    const configMap = Object.fromEntries(config.map((c: any) => [c.key, c.value]));
    expect(configMap).toHaveProperty('allow_self_registration');
    expect(configMap).toHaveProperty('default_new_user_role');
  });

  it('should not have any admin users initially (setup required)', async () => {
    const db = dbService.getConnection();

    // Check that no admin users exist
    const adminCount = await new Promise<number>((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM users WHERE isAdmin = 1', (err, row: any) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });

    expect(adminCount).toBe(0);
  });

  it('should not re-apply migrations on subsequent initializations', async () => {
    // Close and reinitialize
    await dbService.close();

    const dbService2 = new DatabaseService(testDbPath);
    await dbService2.initialize();

    const status = await dbService2.getMigrationStatus();

    // Should still have 2 applied, 0 pending
    expect(status.applied).toHaveLength(2);
    expect(status.pending).toHaveLength(0);

    await dbService2.close();
  });
});
