import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import sqlite3 from 'sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Helper to run SQL against the in-memory database.
 */
function execSQL(db: sqlite3.Database, sql: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/**
 * Helper to query rows from the database.
 */
function queryAll<T = Record<string, unknown>>(
  db: sqlite3.Database,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  return new Promise<T[]>((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
}

const migrationsDir = join(__dirname, '../../src/database/migrations');

function readMigration(filename: string): string {
  return readFileSync(join(migrationsDir, filename), 'utf-8');
}

/**
 * Apply all prerequisite migrations (000 through 011) plus 012.
 * We only need the schema and seed migrations that define the tables and
 * roles/permissions referenced by migration 012.
 */
async function applyPrerequisites(db: sqlite3.Database): Promise<void> {
  // 000 — initial schema (executions, revoked_tokens)
  await execSQL(db, readMigration('000_initial_schema.sql'));
  // 001 — RBAC tables (users, roles, permissions, role_permissions, etc.)
  await execSQL(db, readMigration('001_initial_rbac.sql'));
  // 002 — seed roles + permissions (Viewer, Operator, Administrator)
  await execSQL(db, readMigration('002_seed_rbac_data.sql'));
  // 007 — proxmox, aws, journal, integration_config permissions + Provisioner role
  await execSQL(db, readMigration('007_permissions_and_provisioner_role.sql'));
}

async function applyMigration012(db: sqlite3.Database): Promise<void> {
  await execSQL(db, readMigration('013_azure_hiera_ssh_permissions.sql'));
}

describe('013_azure_hiera_ssh_permissions migration', () => {
  let db: sqlite3.Database;

  beforeEach(async () => {
    db = new sqlite3.Database(':memory:');
    await applyPrerequisites(db);
    await applyMigration012(db);
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      db.close(() => resolve());
    });
  });

  // ---------------------------------------------------------------------------
  // Permission creation tests
  // ---------------------------------------------------------------------------

  it('should create all 5 Azure permissions', async () => {
    const perms = await queryAll<{ id: string; resource: string; action: string }>(
      db,
      'SELECT id, resource, "action" as action FROM permissions WHERE resource = ? ORDER BY "action"',
      ['azure']
    );

    expect(perms).toHaveLength(5);
    expect(perms.map(p => p.action).sort()).toEqual([
      'admin', 'destroy', 'lifecycle', 'provision', 'read',
    ]);
    expect(perms.map(p => p.id).sort()).toEqual([
      'azure-admin-001', 'azure-destroy-001', 'azure-lifecycle-001',
      'azure-provision-001', 'azure-read-001',
    ]);
  });

  it('should create all 2 Hiera permissions', async () => {
    const perms = await queryAll<{ id: string; action: string }>(
      db,
      'SELECT id, "action" as action FROM permissions WHERE resource = ? ORDER BY "action"',
      ['hiera']
    );

    expect(perms).toHaveLength(2);
    expect(perms.map(p => p.action).sort()).toEqual(['admin', 'read']);
  });

  it('should create all 3 SSH permissions', async () => {
    const perms = await queryAll<{ id: string; action: string }>(
      db,
      'SELECT id, "action" as action FROM permissions WHERE resource = ? ORDER BY "action"',
      ['ssh']
    );

    expect(perms).toHaveLength(3);
    expect(perms.map(p => p.action).sort()).toEqual(['admin', 'execute', 'read']);
  });

  // ---------------------------------------------------------------------------
  // Viewer role assignments
  // ---------------------------------------------------------------------------

  it('should assign correct permissions to Viewer role', async () => {
    const perms = await queryAll<{ resource: string; action: string }>(
      db,
      `SELECT p.resource, p."action" as action
       FROM permissions p
       INNER JOIN role_permissions rp ON rp.permissionId = p.id
       WHERE rp.roleId = 'role-viewer-001'
       ORDER BY p.resource, p."action"`,
    );

    // Original 002 seed: ansible-read, bolt-read, puppetdb-read (3)
    // Migration 012 adds: proxmox-read, aws-read, journal-read,
    //   integration_config-read, azure-read, hiera-read, ssh-read (7)
    // Total: 10
    expect(perms).toHaveLength(10);

    const permSet = new Set(perms.map(p => `${p.resource}/${p.action}`));
    // Original
    expect(permSet.has('ansible/read')).toBe(true);
    expect(permSet.has('bolt/read')).toBe(true);
    expect(permSet.has('puppetdb/read')).toBe(true);
    // Backfilled
    expect(permSet.has('proxmox/read')).toBe(true);
    expect(permSet.has('aws/read')).toBe(true);
    expect(permSet.has('journal/read')).toBe(true);
    expect(permSet.has('integration_config/read')).toBe(true);
    // New
    expect(permSet.has('azure/read')).toBe(true);
    expect(permSet.has('hiera/read')).toBe(true);
    expect(permSet.has('ssh/read')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Operator role assignments
  // ---------------------------------------------------------------------------

  it('should assign correct permissions to Operator role', async () => {
    const perms = await queryAll<{ resource: string; action: string }>(
      db,
      `SELECT p.resource, p."action" as action
       FROM permissions p
       INNER JOIN role_permissions rp ON rp.permissionId = p.id
       WHERE rp.roleId = 'role-operator-001'
       ORDER BY p.resource, p."action"`,
    );

    const permSet = new Set(perms.map(p => `${p.resource}/${p.action}`));

    // Original from 002: ansible-read, ansible-exec, bolt-read, bolt-exec, puppetdb-read (5)
    // Migration 012 adds: proxmox-read, aws-read, journal-read, integration_config-read,
    //   azure-read, hiera-read, ssh-read, proxmox-lifecycle, aws-lifecycle,
    //   azure-lifecycle, ssh-execute (11)
    // Total: 16
    expect(perms).toHaveLength(16);

    // Read permissions
    expect(permSet.has('proxmox/read')).toBe(true);
    expect(permSet.has('aws/read')).toBe(true);
    expect(permSet.has('journal/read')).toBe(true);
    expect(permSet.has('integration_config/read')).toBe(true);
    expect(permSet.has('azure/read')).toBe(true);
    expect(permSet.has('hiera/read')).toBe(true);
    expect(permSet.has('ssh/read')).toBe(true);

    // Lifecycle permissions
    expect(permSet.has('proxmox/lifecycle')).toBe(true);
    expect(permSet.has('aws/lifecycle')).toBe(true);
    expect(permSet.has('azure/lifecycle')).toBe(true);

    // Execute permissions
    expect(permSet.has('ssh/execute')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Administrator role assignments
  // ---------------------------------------------------------------------------

  it('should assign all 10 new permissions to Administrator role', async () => {
    const perms = await queryAll<{ permissionId: string }>(
      db,
      `SELECT permissionId FROM role_permissions
       WHERE roleId = 'role-admin-001'
         AND permissionId IN (
           'azure-read-001', 'azure-lifecycle-001', 'azure-provision-001',
           'azure-destroy-001', 'azure-admin-001',
           'hiera-read-001', 'hiera-admin-001',
           'ssh-read-001', 'ssh-execute-001', 'ssh-admin-001'
         )
       ORDER BY permissionId`,
    );

    expect(perms).toHaveLength(10);
  });

  // ---------------------------------------------------------------------------
  // Provisioner role assignments
  // ---------------------------------------------------------------------------

  it('should assign Azure provisioning + Hiera read to Provisioner role', async () => {
    const perms = await queryAll<{ permissionId: string }>(
      db,
      `SELECT permissionId FROM role_permissions
       WHERE roleId = 'role-provisioner-001'
         AND permissionId IN (
           'azure-read-001', 'azure-lifecycle-001', 'azure-provision-001',
           'azure-destroy-001', 'hiera-read-001'
         )
       ORDER BY permissionId`,
    );

    expect(perms).toHaveLength(5);
    expect(perms.map(p => p.permissionId)).toEqual([
      'azure-destroy-001',
      'azure-lifecycle-001',
      'azure-provision-001',
      'azure-read-001',
      'hiera-read-001',
    ]);
  });

  // ---------------------------------------------------------------------------
  // Idempotency
  // ---------------------------------------------------------------------------

  it('should be idempotent — running migration twice causes no errors', async () => {
    // Migration was already applied in beforeEach. Apply it again.
    await expect(applyMigration012(db)).resolves.not.toThrow();

    // Verify counts are unchanged after second run
    const azurePerms = await queryAll(
      db,
      'SELECT id FROM permissions WHERE resource = ?',
      ['azure']
    );
    expect(azurePerms).toHaveLength(5);

    const viewerAssignments = await queryAll(
      db,
      `SELECT permissionId FROM role_permissions WHERE roleId = 'role-viewer-001'`,
    );
    expect(viewerAssignments).toHaveLength(10);
  });
});
