import { createHash, randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import type { LdapConfig } from '../config/ldap';
import type { DatabaseAdapter } from '../database/DatabaseAdapter';
import type { LdapDirectoryResult, LdapDirectoryService } from './LdapDirectoryService';
import { LdapDirectoryError } from './ldap/LdapDirectoryError';
import { LdapAdministrationError, type LdapMappingService, type LdapMappingRevision } from './LdapMappingService';
import type { UserService, User } from './UserService';
import { AuditLoggingService } from './AuditLoggingService';

export class LdapAuthenticationError extends Error {
  constructor(public readonly code: 'DENIED' | 'STALE_VALIDATION' | 'INVALID_CONTEXT') {
    super('LDAP authentication failed: ' + code);
    this.name = 'LdapAuthenticationError';
  }
}

export function ldapAuthenticationFailure(error: unknown): { status: number; code: string; message: string } | undefined {
  if (error instanceof LdapAuthenticationError) {
    if (error.code === 'INVALID_CONTEXT') return { status: 401, code: 'INVALID_TOKEN', message: 'Invalid token' };
    if (error.code === 'DENIED') return { status: 403, code: 'LDAP_ACCESS_DENIED', message: 'Directory access denied' };
  } else if (error instanceof LdapDirectoryError) {
    if (['INVALID_CREDENTIALS', 'INELIGIBLE'].includes(error.code)) {
      return { status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' };
    }
    if (error.code === 'BUSY') return { status: 429, code: 'LDAP_BUSY', message: 'Directory capacity limit reached' };
  } else if (!(error instanceof LdapAdministrationError)) return undefined;
  return { status: 503, code: 'LDAP_UNAVAILABLE', message: 'Directory authentication temporarily unavailable' };
}

export interface LdapAuthenticationProof {
  user: User;
  identityId: string;
  directoryId: string;
  sessionVersion: string;
}
interface Identity { id: string; userId: string; subject: string; sessionVersion: string; isActive: number }
interface ValidationState {
  lastValidatedAt: number | string | null; generation: number | string;
  mappingRevision: number | string; configRevision: string; decisionStartedAt: number | string | null;
  decisionSequence: number | string;
}
interface Snapshot {
  revision: LdapMappingRevision;
  mappings: { id: string; groupSubject: string; roleId: string }[];
  startedAt: number;
  sequence: string;
}
interface Lease { owner: string; generation: string }

/** Directory proof and database publication. This service never handles JWTs. */
export class LdapAuthenticationService {
  private readonly configRevision: string;
  private readonly flights = new Map<string, Promise<void>>();
  private readonly audit: AuditLoggingService;
  private readonly clock: string;

  constructor(
    private readonly db: DatabaseAdapter,
    private readonly config: LdapConfig,
    private readonly directory: Pick<LdapDirectoryService, 'authenticate' | 'revalidate'>,
    private readonly mappings: LdapMappingService,
    private readonly users: UserService,
  ) {
    this.configRevision = createHash('sha256').update(JSON.stringify(config))
      .update(config.caFile ? readFileSync(config.caFile) : '').digest('hex');
    this.audit = new AuditLoggingService(db);
    this.clock = db.getDialect() === 'postgres'
      ? 'CAST(EXTRACT(EPOCH FROM clock_timestamp()) * 1000 AS BIGINT)'
      : "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
  }

  /** Call once at startup. Older processes cannot silently reinstate their configuration. */
  public async initialize(): Promise<void> {
    await this.mappings.revision();
    await this.db.withTransaction(async () => {
      const changed = await this.db.execute(`UPDATE ldap_directory_state SET config_revision = ?
        WHERE directory_id = ? AND config_revision <> ?`,
      [this.configRevision, this.config.directoryId, this.configRevision]);
      if (changed.changes) {
        await this.db.execute(`UPDATE ldap_validation_state SET last_validated_at = NULL
          WHERE identity_id IN (SELECT identity_id FROM ldap_identity_metadata WHERE directory_id = ?)`, [this.config.directoryId]);
      }
    });
  }

  public async authenticate(loginName: string, password: string): Promise<LdapAuthenticationProof> {
    const snapshot = await this.snapshot();
    const result = await this.directory.authenticate(loginName, password, this.subjects(snapshot));
    const proof = await this.users.withFederatedUser({ ...result.user, provider: 'ldap', issuer: this.config.directoryId,
      defaultRole: 'none' }, async user => {
      await this.mappings.lockRevision(snapshot.revision);
      const identity = await this.identityBySubject(result.user.subject);
      if (identity?.userId !== user.id) throw new LdapAuthenticationError('INVALID_CONTEXT');
      await this.lockAccount(identity);
      await this.assertNewerDecision(identity.id, snapshot.sequence);
      // Credential proofs cannot be shared. Fence any older lookup-only work before publishing this login.
      const lease = await this.claim(identity.id, true);
      if (!lease) throw new LdapAuthenticationError('STALE_VALIDATION');
      const allowed = await this.publish(identity, snapshot, lease, result);
      await this.release(identity.id, lease);
      if (!allowed) return null;
      await this.db.execute('UPDATE users SET last_login_at = ? WHERE id = ?', [new Date().toISOString(), user.id]);
      const current = await this.users.getUserById(user.id);
      assert(current);
      return { user: current, identityId: identity.id,
        directoryId: this.config.directoryId, sessionVersion: identity.sessionVersion };
    });
    // A proven zero-role account remains committed for subsequent manual assignment.
    if (!proof) throw new LdapAuthenticationError('DENIED');
    return proof;
  }

  public async assertEligible(userId: string, identityId: string, directoryId: string,
    expectedVersion: string, force = false): Promise<void> {
    if (directoryId !== this.config.directoryId) throw new LdapAuthenticationError('INVALID_CONTEXT');
    const identity = await this.identity(identityId, userId, expectedVersion);
    if (!force && await this.fresh(identity.id)) {
      await this.requireRoles(identity);
      if (await this.fresh(identity.id)) return;
    }
    const flightKey = JSON.stringify([identity.id, identity.sessionVersion]);
    let flight = this.flights.get(flightKey);
    if (!flight) {
      flight = this.validate(identity);
      this.flights.set(flightKey, flight);
      const release = (): void => { if (this.flights.get(flightKey) === flight) this.flights.delete(flightKey); };
      void flight.then(release, release);
    }
    await flight;
    // Never let a caller that joined work from another session version inherit its result.
    await this.identity(identityId, userId, expectedVersion);
    await this.requireRoles(identity);
    if (!await this.fresh(identityId)) throw new LdapAuthenticationError('STALE_VALIDATION');
  }

  private async validate(identity: Identity): Promise<void> {
    const initial = await this.state(identity.id);
    const deadline = performance.now() + this.config.requestTimeoutSeconds * 1000;
    let lease: Lease | null = null;
    let snapshot: Snapshot;
    for (;;) {
      snapshot = await this.snapshot();
      const acquired = await this.mappings.withRevision(snapshot.revision, async () => {
        const current = await this.state(identity.id);
        if (BigInt(current.generation) > BigInt(initial.generation) && await this.fresh(identity.id)) return { coalesced: true };
        return { coalesced: false, lease: await this.claim(identity.id) };
      });
      if (acquired.coalesced) return;
      lease = acquired.lease ?? null;
      if (lease) break;
      if (performance.now() >= deadline) throw new LdapDirectoryError('BUSY');
      await delay(25);
      await this.identity(identity.id, identity.userId, identity.sessionVersion);
      // Only an overlapping remote validation can satisfy a forced refresh.
      const state = await this.state(identity.id);
      if (BigInt(state.generation) > BigInt(initial.generation) && await this.fresh(identity.id)) return;
    }
    try {
      let result: LdapDirectoryResult;
      try {
        result = await this.directory.revalidate(identity.subject, this.subjects(snapshot));
      } catch (error) {
        if (error instanceof LdapDirectoryError && error.code === 'INELIGIBLE') {
          await this.mappings.withRevision(snapshot.revision, async () => {
            await this.lockAccount(identity);
            await this.fence(identity.id, lease);
            await this.revoke(identity, snapshot, 'INELIGIBLE');
            await this.fence(identity.id, lease);
          });
          throw new LdapAuthenticationError('DENIED');
        }
        throw error;
      }
      if (result.user.subject !== identity.subject) throw new LdapAuthenticationError('INVALID_CONTEXT');
      const allowed = await this.users.withFederatedUser({ ...result.user, provider: 'ldap', issuer: this.config.directoryId,
        defaultRole: 'none' }, async () => {
        await this.mappings.lockRevision(snapshot.revision);
        await this.lockAccount(identity);
        return this.publish(identity, snapshot, lease, result);
      });
      if (!allowed) throw new LdapAuthenticationError('DENIED');
    } finally {
      await this.release(identity.id, lease);
    }
  }

  private async snapshot(): Promise<Snapshot> {
    await this.mappings.revision();
    const decision = await this.db.withTransaction(async () => {
      const locked = await this.db.execute(`UPDATE ldap_directory_state SET validation_sequence = validation_sequence + 1
        WHERE directory_id = ? AND config_revision = ?`, [this.config.directoryId, this.configRevision]);
      if (locked.changes !== 1) throw new LdapAuthenticationError('STALE_VALIDATION');
      const row = await this.db.queryOne<{ mappingRevision: number | string; sequence: number | string }>(
        'SELECT mapping_revision AS "mappingRevision", validation_sequence AS sequence FROM ldap_directory_state WHERE directory_id = ?',
        [this.config.directoryId]);
      assert(row);
      return { revision: { directoryId: this.config.directoryId, mappingRevision: String(row.mappingRevision), configRevision: this.configRevision },
        sequence: String(row.sequence), startedAt: await this.now() };
    });
    const mappings = (await this.mappings.list()).filter(mapping => mapping.enabled);
    return { ...decision, mappings };
  }

  private subjects(snapshot: Snapshot): string[] { return [...new Set(snapshot.mappings.map(mapping => mapping.groupSubject))]; }

  private async now(): Promise<number> {
    const row = await this.db.queryOne<{ now: string | number }>(`SELECT ${this.clock} AS "now"`);
    assert(row);
    return Number(row.now);
  }

  private async identityBySubject(subject: string): Promise<Identity | null> {
    return this.db.queryOne<Identity>(`SELECT i.id, i.user_id AS "userId", i.subject,
      u.session_version AS "sessionVersion", u.is_active AS "isActive"
      FROM federated_identities i JOIN ldap_identity_metadata m ON m.identity_id = i.id AND m.directory_id = i.issuer
      JOIN users u ON u.id = i.user_id WHERE i.provider = 'ldap' AND i.issuer = ? AND i.subject = ?`,
    [this.config.directoryId, subject]);
  }

  private async identity(id: string, userId: string, version: string): Promise<Identity> {
    const identity = await this.db.queryOne<Identity>(`SELECT i.id, i.user_id AS "userId", i.subject,
      u.session_version AS "sessionVersion", u.is_active AS "isActive"
      FROM federated_identities i JOIN ldap_identity_metadata m ON m.identity_id = i.id AND m.directory_id = i.issuer
      JOIN users u ON u.id = i.user_id WHERE i.id = ? AND i.user_id = ? AND i.provider = 'ldap' AND i.issuer = ?`,
    [id, userId, this.config.directoryId]);
    if (identity?.isActive !== 1 || identity.sessionVersion !== version) throw new LdapAuthenticationError('INVALID_CONTEXT');
    return identity;
  }

  private async lockAccount(identity: Identity): Promise<void> {
    const locked = await this.db.execute('UPDATE users SET session_version = session_version WHERE id = ? AND session_version = ?',
      [identity.userId, identity.sessionVersion]);
    if (locked.changes !== 1) throw new LdapAuthenticationError('INVALID_CONTEXT');
  }

  private async state(id: string): Promise<ValidationState> {
    const state = await this.db.queryOne<ValidationState>(`SELECT last_validated_at AS "lastValidatedAt",
      validation_generation AS generation, mapping_revision AS "mappingRevision", config_revision AS "configRevision",
      decision_started_at AS "decisionStartedAt", decision_sequence AS "decisionSequence" FROM ldap_validation_state WHERE identity_id = ?`, [id]);
    if (!state) throw new LdapAuthenticationError('INVALID_CONTEXT');
    return state;
  }

  private async fresh(id: string): Promise<boolean> {
    const row = await this.db.queryOne<{ fresh: number }>(`SELECT 1 AS fresh FROM ldap_validation_state v
      JOIN ldap_identity_metadata m ON m.identity_id = v.identity_id
      JOIN ldap_directory_state d ON d.directory_id = m.directory_id
      WHERE v.identity_id = ? AND v.last_validated_at IS NOT NULL AND v.last_validated_at <= ${this.clock}
        AND v.last_validated_at + ? > ${this.clock} AND v.mapping_revision = d.mapping_revision
        AND v.config_revision = d.config_revision AND d.config_revision = ?`,
    [id, this.config.revalidationIntervalSeconds * 1000, this.configRevision]);
    return row?.fresh === 1;
  }

  private async claim(id: string, replace = false): Promise<Lease | null> {
    await this.db.execute('INSERT INTO ldap_validation_leases (identity_id) VALUES (?) ON CONFLICT DO NOTHING', [id]);
    const owner = randomUUID();
    const updated = await this.db.execute(`UPDATE ldap_validation_leases SET lease_owner = ?,
      lease_expires_at = ${this.clock} + ?, fencing_generation = fencing_generation + 1
      WHERE identity_id = ?${replace ? '' : ` AND (lease_owner IS NULL OR lease_expires_at <= ${this.clock})`}`,
    [owner, this.config.requestTimeoutSeconds * 1000, id]);
    if (!updated.changes) return null;
    const row = await this.db.queryOne<{ generation: number | string }>(
      'SELECT fencing_generation AS generation FROM ldap_validation_leases WHERE identity_id = ?', [id]);
    assert(row);
    return { owner, generation: String(row.generation) };
  }

  private async fence(id: string, lease: Lease): Promise<void> {
    const locked = await this.db.execute(`UPDATE ldap_validation_leases SET fencing_generation = fencing_generation
      WHERE identity_id = ? AND lease_owner = ? AND fencing_generation = ? AND lease_expires_at > ${this.clock}`,
    [id, lease.owner, lease.generation]);
    if (locked.changes !== 1) throw new LdapAuthenticationError('STALE_VALIDATION');
  }

  private async release(id: string, lease: Lease): Promise<void> {
    await this.db.execute(`UPDATE ldap_validation_leases SET lease_owner = NULL, lease_expires_at = NULL
      WHERE identity_id = ? AND lease_owner = ? AND fencing_generation = ?`, [id, lease.owner, lease.generation]);
  }

  private async assertNewerDecision(id: string, sequence: string): Promise<void> {
    const state = await this.state(id);
    if (BigInt(state.decisionSequence) > BigInt(sequence)) {
      throw new LdapAuthenticationError('STALE_VALIDATION');
    }
  }

  private async publish(identity: Identity, snapshot: Snapshot, lease: Lease, result: LdapDirectoryResult): Promise<boolean> {
    await this.fence(identity.id, lease);
    await this.assertNewerDecision(identity.id, snapshot.sequence);
    if (snapshot.startedAt + this.config.revalidationIntervalSeconds * 1000 <= await this.now()) {
      throw new LdapAuthenticationError('STALE_VALIDATION');
    }
    const before = await this.db.query<{ source_key: string }>('SELECT source_key FROM federated_user_roles WHERE identity_id = ?', [identity.id]);
    const selected = snapshot.mappings.filter(mapping => result.groupSubjects.includes(mapping.groupSubject));
    const keys = new Set(selected.map(mapping => 'mapping:' + mapping.id));
    for (const row of before) {
      if (!keys.has(row.source_key)) await this.db.execute('DELETE FROM federated_user_roles WHERE identity_id = ? AND source_key = ?', [identity.id, row.source_key]);
    }
    for (const mapping of selected) {
      await this.db.execute(`INSERT INTO federated_user_roles (user_id, role_id, identity_id, source_key, mapping_id, directory_id)
        VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      [identity.userId, mapping.roleId, identity.id, 'mapping:' + mapping.id, mapping.id, this.config.directoryId]);
    }
    const active = await this.db.queryOne<{ active: number }>('SELECT is_active AS active FROM users WHERE id = ?', [identity.userId]);
    if (active?.active !== 1 || !await this.hasRoles(identity.userId)) {
      await this.revoke(identity, snapshot, active?.active === 1 ? 'NO_ROLES' : 'SUSPENDED');
      return false;
    }
    await this.db.execute(`UPDATE ldap_validation_state SET last_validated_at = ?, decision_started_at = ?,
      decision_sequence = ?, validation_generation = validation_generation + 1, mapping_revision = ?, config_revision = ? WHERE identity_id = ?`,
    [snapshot.startedAt, snapshot.startedAt, snapshot.sequence, snapshot.revision.mappingRevision, this.configRevision, identity.id]);
    if (before.length !== keys.size || before.some(row => !keys.has(row.source_key))) {
      await this.audit.logAdminAction('ldapEntitlementsChanged', identity.userId,
        { directoryId: this.config.directoryId, identityId: identity.id, mappingIds: selected.map(mapping => mapping.id) });
    }
    // Database/audit work consumes the same freshness budget as directory I/O.
    if (!await this.fresh(identity.id)) throw new LdapAuthenticationError('STALE_VALIDATION');
    await this.fence(identity.id, lease);
    return true;
  }

  private async hasRoles(userId: string): Promise<boolean> {
    return !!await this.db.queryOne(`SELECT role_id FROM effective_user_roles WHERE user_id = ?
      UNION SELECT gr.role_id FROM group_roles gr JOIN user_groups ug ON ug.group_id = gr.group_id WHERE ug.user_id = ?`, [userId, userId]);
  }

  private async requireRoles(identity: Identity): Promise<void> {
    if (await this.hasRoles(identity.userId)) return;
    const snapshot = await this.snapshot();
    const denied = await this.mappings.withRevision(snapshot.revision, async () => {
      await this.lockAccount(identity);
      if (await this.hasRoles(identity.userId)) return false;
      await this.revoke(identity, snapshot, 'NO_ROLES');
      return true;
    });
    if (denied) throw new LdapAuthenticationError('DENIED');
  }

  private async revoke(identity: Identity, decision: Pick<Snapshot, 'startedAt' | 'sequence'>, reason: string): Promise<void> {
    await this.assertNewerDecision(identity.id, decision.sequence);
    await this.db.execute('DELETE FROM federated_user_roles WHERE identity_id = ?', [identity.id]);
    await this.db.execute(`UPDATE ldap_validation_state SET last_validated_at = NULL, decision_started_at = ?,
      decision_sequence = ?, validation_generation = validation_generation + 1 WHERE identity_id = ?`,
    [decision.startedAt, decision.sequence, identity.id]);
    await this.db.execute('UPDATE users SET session_version = ? WHERE id = ? AND session_version = ?',
      [randomBytes(16).toString('hex'), identity.userId, identity.sessionVersion]);
    await this.audit.logAdminAction('ldapSessionRevoked', identity.userId,
      { directoryId: this.config.directoryId, identityId: identity.id, reason });
  }
}
