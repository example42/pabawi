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

    // Should have applied all migrations (000 through 019, no 012 in source)
    expect(status.applied).toHaveLength(19);
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
    expect(status.applied[10].id).toBe('010');
    expect(status.applied[11].id).toBe('011');
    expect(status.applied[12].id).toBe('013');
    expect(status.applied[13].id).toBe('014');
    expect(status.applied[14].id).toBe('015');
    expect(status.applied[15].id).toBe('016');
    expect(status.applied[16].id).toBe('017');
    expect(status.applied[17].id).toBe('018');
    expect(status.applied[18].id).toBe('019');
    expect(status.pending).toHaveLength(0);
  });

  it('should have seeded data available after initialization', async () => {
    const db = dbService.getConnection();

    // Check that roles exist
    const roles = await db.query<{ name: string }>('SELECT name FROM roles WHERE is_built_in = 1');

    expect(roles).toHaveLength(4);
    expect(roles.map(r => r.name).sort()).toEqual(['Administrator', 'Operator', 'Provisioner', 'Viewer']);

    // Check that config table exists and has default values
    const config = await db.query<{ key: string; value: string }>('SELECT key, value FROM config');

    expect(config.length).toBeGreaterThan(0);
    const configMap = Object.fromEntries(config.map((c) => [c.key, c.value]));
    expect(configMap).toHaveProperty('allow_self_registration');
    expect(configMap).toHaveProperty('default_new_user_role');
  });

  it('should not have any admin users initially (setup required)', async () => {
    const db = dbService.getConnection();

    // Check that no admin users exist
    const row = await db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM users WHERE is_admin = 1');
    const adminCount = row?.count ?? 0;

    expect(adminCount).toBe(0);
  });

  it('should not re-apply migrations on subsequent initializations', async () => {
    // Close and reinitialize
    await dbService.close();

    const dbService2 = new DatabaseService(testDbPath);
    await dbService2.initialize();

    const status = await dbService2.getMigrationStatus();

    // Should still have 19 applied, 0 pending
    expect(status.applied).toHaveLength(19);
    expect(status.pending).toHaveLength(0);

    await dbService2.close();
  });
});
