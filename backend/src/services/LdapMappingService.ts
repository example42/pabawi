import { randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '../database/DatabaseAdapter';
import type { LdapDirectoryService } from './LdapDirectoryService';
import { AuditLoggingService } from './AuditLoggingService';
import { canonicalUuid } from './ldap/identity';

export class LdapAdministrationError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'STALE_REVISION' | 'INVALID_CURSOR') {
    super('LDAP administration failed: ' + code);
    this.name = 'LdapAdministrationError';
  }
}

export interface LdapMapping {
  id: string; directoryId: string; groupSubject: string; groupDn: string; groupName: string;
  roleId: string; roleName: string; enabled: boolean; createdAt: string; updatedAt: string;
  source: 'ldap';
}
interface MappingRow extends Omit<LdapMapping, 'enabled' | 'source'> { enabled: number }
export interface LdapMappingRevision { directoryId: string; mappingRevision: string; configRevision: string }
export interface LdapAuditActor { userId: string; ip?: string; userAgent?: string }

const columns = `m.id, m.directory_id AS "directoryId", m.group_subject AS "groupSubject",
  m.group_dn AS "groupDn", m.group_name AS "groupName", m.role_id AS "roleId", r.name AS "roleName",
  m.enabled, m.created_at AS "createdAt", m.updated_at AS "updatedAt"`;

export class LdapMappingService {
  private readonly audit: AuditLoggingService;

  constructor(
    private readonly db: DatabaseAdapter,
    private readonly directoryId: string,
    private readonly directory: Pick<LdapDirectoryService, 'resolveGroup'>,
  ) { this.audit = new AuditLoggingService(db); }

  public async revision(): Promise<LdapMappingRevision> {
    await this.db.execute('INSERT INTO ldap_directory_state (directory_id) VALUES (?) ON CONFLICT DO NOTHING', [this.directoryId]);
    const row = await this.db.queryOne<{ mapping_revision: string | number; config_revision: string }>(
      'SELECT mapping_revision, config_revision FROM ldap_directory_state WHERE directory_id = ?', [this.directoryId]);
    if (!row) throw new LdapAdministrationError('STALE_REVISION');
    return { directoryId: this.directoryId, mappingRevision: String(row.mapping_revision), configRevision: row.config_revision };
  }

  // The directory row serializes mapping edits with publication of validation results on both adapters.
  // Callers supply only database work; directory I/O must finish before acquiring this lock.
  public async withRevision<T>(revision: LdapMappingRevision, work: () => Promise<T>): Promise<T> {
    return this.db.withTransaction(async () => {
      if (revision.directoryId !== this.directoryId) throw new LdapAdministrationError('STALE_REVISION');
      const locked = await this.db.execute(`UPDATE ldap_directory_state SET mapping_revision = mapping_revision
        WHERE directory_id = ? AND mapping_revision = ? AND config_revision = ?`,
      [this.directoryId, revision.mappingRevision, revision.configRevision]);
      if (locked.changes !== 1) throw new LdapAdministrationError('STALE_REVISION');
      return work();
    });
  }

  public async list(): Promise<LdapMapping[]> {
    const rows = await this.db.query<MappingRow>(`SELECT ${columns} FROM external_group_mappings m
      JOIN roles r ON r.id = m.role_id WHERE m.directory_id = ? ORDER BY m.group_name, m.role_id, m.id`, [this.directoryId]);
    return rows.map(row => ({ ...row, enabled: row.enabled === 1, source: 'ldap' }));
  }

  public async get(id: string): Promise<LdapMapping> {
    const row = await this.db.queryOne<MappingRow>(`SELECT ${columns} FROM external_group_mappings m
      JOIN roles r ON r.id = m.role_id WHERE m.id = ? AND m.directory_id = ?`, [id, this.directoryId]);
    if (!row) throw new LdapAdministrationError('NOT_FOUND');
    return { ...row, enabled: row.enabled === 1, source: 'ldap' };
  }

  public async create(groupSubject: string, roleId: string, actor: LdapAuditActor): Promise<LdapMapping> {
    const revision = await this.revision();
    const group = await this.directory.resolveGroup(canonicalUuid(groupSubject));
    return this.withRevision(revision, async () => {
      await this.checkRoleAndDuplicate(group.subject, roleId);
      const id = randomUUID();
      const now = new Date().toISOString();
      await this.db.execute(`INSERT INTO external_group_mappings
        (id, directory_id, group_subject, group_dn, group_name, role_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, this.directoryId, group.subject, group.dn, group.name, roleId, now, now]);
      const mapping = await this.get(id);
      await this.record('createLdapMapping', mapping, actor);
      return mapping;
    });
  }

  public async update(id: string, input: { roleId?: string; enabled?: boolean }, actor: LdapAuditActor): Promise<LdapMapping> {
    const revision = await this.revision();
    const previous = await this.get(id);
    // Withdrawal remains available during an outage. Granting or changing a role requires fresh identity proof.
    const group = input.enabled === false && input.roleId === undefined ? null
      : await this.directory.resolveGroup(previous.groupSubject);
    return this.withRevision(revision, async () => {
      const roleId = input.roleId ?? previous.roleId;
      await this.checkRoleAndDuplicate(previous.groupSubject, roleId, id);
      await this.db.execute(`UPDATE external_group_mappings SET group_dn = ?, group_name = ?, role_id = ?, enabled = ?, updated_at = ?
        WHERE id = ? AND directory_id = ?`, [group?.dn ?? previous.groupDn, group?.name ?? previous.groupName,
        roleId, (input.enabled ?? previous.enabled) ? 1 : 0, new Date().toISOString(), id, this.directoryId]);
      const mapping = await this.get(id);
      await this.record('updateLdapMapping', mapping, actor);
      return mapping;
    });
  }

  public async remove(id: string, actor: LdapAuditActor): Promise<void> {
    const revision = await this.revision();
    await this.withRevision(revision, async () => {
      const mapping = await this.get(id);
      await this.db.execute('DELETE FROM external_group_mappings WHERE id = ? AND directory_id = ?', [id, this.directoryId]);
      await this.record('deleteLdapMapping', mapping, actor);
    });
  }

  private async checkRoleAndDuplicate(subject: string, roleId: string, exceptId = ''): Promise<void> {
    // Keep role deletion from racing the insert on PostgreSQL; SQLite already holds its writer lock.
    const suffix = this.db.getDialect() === 'postgres' ? ' FOR KEY SHARE' : '';
    if (!await this.db.queryOne('SELECT id FROM roles WHERE id = ?' + suffix, [roleId])) {
      throw new LdapAdministrationError('NOT_FOUND');
    }
    if (await this.db.queryOne(`SELECT id FROM external_group_mappings
      WHERE directory_id = ? AND group_subject = ? AND role_id = ? AND id <> ?`, [this.directoryId, subject, roleId, exceptId])) {
      throw new LdapAdministrationError('CONFLICT');
    }
  }

  private async record(action: string, mapping: LdapMapping, actor: LdapAuditActor): Promise<void> {
    await this.audit.logAdminAction(action, actor.userId, {
      directoryId: this.directoryId, mappingId: mapping.id, groupSubject: mapping.groupSubject,
      roleId: mapping.roleId, enabled: mapping.enabled,
    }, actor.ip, actor.userAgent);
  }
}
