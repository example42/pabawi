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

    // Should have applied all migrations (000 through 009)
    expect(status.applied).toHaveLength(10);
    expect(status.applied[0].id).toBe('000');
    expect(status.applied[1].id).toBe('001');
    expect(status.applied[2].id).toBe('002');
    expect(status.applied[3].id).toBe('003');
    expect(status.applied[4].id).toBe('004');
    expect(status.applied[5].id).toBe('005');
    expect(status.applied[6].id).toBe('006');
    expect(status.applied[7].id).toBe('007');
    expect(status.applied[8].id).toBe('008');
    expect(status.applied[9].id).toBe('009');
    expect(status.pending).toHaveLength(0);
  });

  it('should have seeded data available after initialization', async () => {
    const db = dbService.getConnection();

    // Check that roles exist
    const roles = await db.query<any>('SELECT * FROM roles WHERE isBuiltIn = 1');

    expect(roles).toHaveLength(4);
    expect(roles.map(r => r.name).sort()).toEqual(['Administrator', 'Operator', 'Provisioner', 'Viewer']);

    // Check that config table exists and has default values
    const config = await db.query<any>('SELECT * FROM config');

    expect(config.length).toBeGreaterThan(0);
    const configMap = Object.fromEntries(config.map((c: any) => [c.key, c.value]));
    expect(configMap).toHaveProperty('allow_self_registration');
    expect(configMap).toHaveProperty('default_new_user_role');
  });

  it('should not have any admin users initially (setup required)', async () => {
    const db = dbService.getConnection();

    // Check that no admin users exist
    const row = await db.queryOne<any>('SELECT COUNT(*) as count FROM users WHERE isAdmin = 1');
    const adminCount = row?.count ?? 0;

    expect(adminCount).toBe(0);
  });

  it('should not re-apply migrations on subsequent initializations', async () => {
    // Close and reinitialize
    await dbService.close();

    const dbService2 = new DatabaseService(testDbPath);
    await dbService2.initialize();

    const status = await dbService2.getMigrationStatus();

    // Should still have 10 applied, 0 pending
    expect(status.applied).toHaveLength(10);
    expect(status.pending).toHaveLength(0);

    await dbService2.close();
  });
});
