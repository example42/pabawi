import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../../src/database/DatabaseService';
import { unlinkSync, existsSync } from 'fs';
import bcrypt from 'bcrypt';

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
  });

  it('should have default admin user with valid credentials', async () => {
    const db = dbService.getConnection();

    // Get admin user
    const adminUser = await new Promise<any>((resolve, reject) => {
      db.get('SELECT * FROM users WHERE username = ?', ['admin'], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    expect(adminUser).toBeDefined();
    expect(adminUser.username).toBe('admin');
    expect(adminUser.email).toBe('admin@pabawi.local');
    expect(adminUser.isAdmin).toBe(1);
    expect(adminUser.isActive).toBe(1);

    // Verify password
    const isValid = await bcrypt.compare('Admin123!', adminUser.passwordHash);
    expect(isValid).toBe(true);
  });

  it('should have admin user with Administrator role', async () => {
    const db = dbService.getConnection();

    // Get admin user's roles
    const roles = await new Promise<any[]>((resolve, reject) => {
      db.all(
        `SELECT r.name
         FROM roles r
         INNER JOIN user_roles ur ON ur.roleId = r.id
         INNER JOIN users u ON u.id = ur.userId
         WHERE u.username = ?`,
        ['admin'],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    expect(roles).toHaveLength(1);
    expect(roles[0].name).toBe('Administrator');
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
