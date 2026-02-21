import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sqlite3 from 'sqlite3';
import { MigrationRunner } from '../../src/database/MigrationRunner';
import { readFileSync } from 'fs';
import { join } from 'path';
import bcrypt from 'bcrypt';

describe('002_seed_rbac_data migration', () => {
  let db: sqlite3.Database;

  beforeEach(async () => {
    // Create in-memory database
    db = new sqlite3.Database(':memory:');

    // Apply initial RBAC schema (001_initial_rbac.sql)
    const schema001 = readFileSync(
      join(__dirname, '../../src/database/migrations/001_initial_rbac.sql'),
      'utf-8'
    );

    await new Promise<void>((resolve, reject) => {
      db.exec(schema001, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Apply seed data migration (002_seed_rbac_data.sql)
    const schema002 = readFileSync(
      join(__dirname, '../../src/database/migrations/002_seed_rbac_data.sql'),
      'utf-8'
    );

    await new Promise<void>((resolve, reject) => {
      db.exec(schema002, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      db.close(() => resolve());
    });
  });

  it('should create all required permissions', async () => {
    const permissions = await new Promise<any[]>((resolve, reject) => {
      db.all('SELECT * FROM permissions ORDER BY resource, action', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    // Should have permissions for ansible (4), bolt (4), puppetdb (3), users (3), groups (3), roles (3) = 20 total
    expect(permissions).toHaveLength(20);

    // Check ansible permissions
    const ansiblePerms = permissions.filter(p => p.resource === 'ansible');
    expect(ansiblePerms).toHaveLength(4);
    expect(ansiblePerms.map(p => p.action).sort()).toEqual(['admin', 'execute', 'read', 'write']);

    // Check bolt permissions
    const boltPerms = permissions.filter(p => p.resource === 'bolt');
    expect(boltPerms).toHaveLength(4);
    expect(boltPerms.map(p => p.action).sort()).toEqual(['admin', 'execute', 'read', 'write']);

    // Check puppetdb permissions
    const puppetdbPerms = permissions.filter(p => p.resource === 'puppetdb');
    expect(puppetdbPerms).toHaveLength(3);
    expect(puppetdbPerms.map(p => p.action).sort()).toEqual(['admin', 'read', 'write']);
  });

  it('should create three built-in roles', async () => {
    const roles = await new Promise<any[]>((resolve, reject) => {
      db.all('SELECT * FROM roles WHERE isBuiltIn = 1 ORDER BY name', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    expect(roles).toHaveLength(3);
    expect(roles.map(r => r.name)).toEqual(['Administrator', 'Operator', 'Viewer']);

    // All should be marked as built-in
    roles.forEach(role => {
      expect(role.isBuiltIn).toBe(1);
    });
  });

  it('should assign correct permissions to Viewer role', async () => {
    const viewerRole = await new Promise<any>((resolve, reject) => {
      db.get('SELECT * FROM roles WHERE name = ?', ['Viewer'], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    const permissions = await new Promise<any[]>((resolve, reject) => {
      db.all(
        `SELECT p.resource, p.action
         FROM permissions p
         INNER JOIN role_permissions rp ON rp.permissionId = p.id
         WHERE rp.roleId = ?
         ORDER BY p.resource, p.action`,
        [viewerRole.id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    // Viewer should have read permissions for ansible, bolt, puppetdb
    expect(permissions).toHaveLength(3);
    expect(permissions).toEqual([
      { resource: 'ansible', action: 'read' },
      { resource: 'bolt', action: 'read' },
      { resource: 'puppetdb', action: 'read' }
    ]);
  });

  it('should assign correct permissions to Operator role', async () => {
    const operatorRole = await new Promise<any>((resolve, reject) => {
      db.get('SELECT * FROM roles WHERE name = ?', ['Operator'], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    const permissions = await new Promise<any[]>((resolve, reject) => {
      db.all(
        `SELECT p.resource, p.action
         FROM permissions p
         INNER JOIN role_permissions rp ON rp.permissionId = p.id
         WHERE rp.roleId = ?
         ORDER BY p.resource, p.action`,
        [operatorRole.id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    // Operator should have read and execute permissions for ansible, bolt, and read for puppetdb
    expect(permissions).toHaveLength(5);
    expect(permissions).toEqual([
      { resource: 'ansible', action: 'execute' },
      { resource: 'ansible', action: 'read' },
      { resource: 'bolt', action: 'execute' },
      { resource: 'bolt', action: 'read' },
      { resource: 'puppetdb', action: 'read' }
    ]);
  });

  it('should assign all permissions to Administrator role', async () => {
    const adminRole = await new Promise<any>((resolve, reject) => {
      db.get('SELECT * FROM roles WHERE name = ?', ['Administrator'], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    const permissions = await new Promise<any[]>((resolve, reject) => {
      db.all(
        `SELECT p.resource, p.action
         FROM permissions p
         INNER JOIN role_permissions rp ON rp.permissionId = p.id
         WHERE rp.roleId = ?
         ORDER BY p.resource, p.action`,
        [adminRole.id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    // Administrator should have all 20 permissions
    expect(permissions).toHaveLength(20);
  });

  it('should create default admin user', async () => {
    const adminUser = await new Promise<any>((resolve, reject) => {
      db.get('SELECT * FROM users WHERE username = ?', ['admin'], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    expect(adminUser).toBeDefined();
    expect(adminUser.username).toBe('admin');
    expect(adminUser.email).toBe('admin@pabawi.local');
    expect(adminUser.firstName).toBe('System');
    expect(adminUser.lastName).toBe('Administrator');
    expect(adminUser.isActive).toBe(1);
    expect(adminUser.isAdmin).toBe(1);
    expect(adminUser.passwordHash).toBeDefined();
  });

  it('should have valid bcrypt hash for admin password', async () => {
    const adminUser = await new Promise<any>((resolve, reject) => {
      db.get('SELECT * FROM users WHERE username = ?', ['admin'], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // Verify the password hash is valid and matches 'Admin123!'
    const isValid = await bcrypt.compare('Admin123!', adminUser.passwordHash);
    expect(isValid).toBe(true);

    // Verify wrong password doesn't match
    const isInvalid = await bcrypt.compare('WrongPassword', adminUser.passwordHash);
    expect(isInvalid).toBe(false);
  });

  it('should assign Administrator role to default admin user', async () => {
    const adminUser = await new Promise<any>((resolve, reject) => {
      db.get('SELECT * FROM users WHERE username = ?', ['admin'], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    const roles = await new Promise<any[]>((resolve, reject) => {
      db.all(
        `SELECT r.name
         FROM roles r
         INNER JOIN user_roles ur ON ur.roleId = r.id
         WHERE ur.userId = ?`,
        [adminUser.id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    expect(roles).toHaveLength(1);
    expect(roles[0].name).toBe('Administrator');
  });

  it('should have unique resource-action combinations', async () => {
    const duplicates = await new Promise<any[]>((resolve, reject) => {
      db.all(
        `SELECT resource, action, COUNT(*) as count
         FROM permissions
         GROUP BY resource, action
         HAVING count > 1`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    expect(duplicates).toHaveLength(0);
  });
});
