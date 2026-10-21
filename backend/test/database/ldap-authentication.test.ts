import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseService } from '../../src/database/DatabaseService';
import { SQLiteAdapter } from '../../src/database/SQLiteAdapter';
import { PostgresAdapter } from '../../src/database/PostgresAdapter';
import type { DatabaseAdapter } from '../../src/database/DatabaseAdapter';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { UserService } from '../../src/services/UserService';
import { LdapAuthenticationService, type LdapAuthenticationProof } from '../../src/services/LdapAuthenticationService';
import { LdapMappingService } from '../../src/services/LdapMappingService';
import { LdapDirectoryError, type LdapDirectoryResult } from '../../src/services/LdapDirectoryService';
import { parseLdapConfig } from '../../src/config/ldap';

const password = 'directory-password-fixture'; // pragma: allowlist secret
const subject = '00112233-4455-6677-8899-aabbccddeeff';
const groupSubject = '10112233-4455-6677-8899-aabbccddeeff';
const otherGroup = '20112233-4455-6677-8899-aabbccddeeff';
const viewer = 'role-viewer-001';
const config = parseLdapConfig({ LDAP_ENABLED: 'true', LDAP_DIRECTORY_ID: 'directory', LDAP_DIRECTORY_TYPE: 'openldap',
  LDAP_HOSTNAME: 'ldap.example.test', LDAP_ANONYMOUS_LOOKUP: 'true', LDAP_BASE_DN: 'dc=example,dc=test',
  LDAP_USER_ELIGIBILITY_FILTER: '(employeeType=active)' })!;
const result: LdapDirectoryResult = { user: { subject, dn: 'uid=a,dc=example,dc=test', loginName: 'a', displayName: 'A',
  email: null, firstName: '', lastName: '' }, groupSubjects: [groupSubject] };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

for (const dialect of ['sqlite', 'postgres'] as const) {
  describe.skipIf(dialect === 'postgres' && !process.env.TEST_DATABASE_URL)(`${dialect} atomic LDAP authentication and freshness`, () => {
    let folder: string;
    let schema: string;
    let control: PostgresAdapter | undefined;
    let database: DatabaseService;
    let db: DatabaseAdapter;
    let reader: DatabaseAdapter;
    let users: UserService;
    let mappings: LdapMappingService;
    let auth: AuthenticationService;
    let service: LdapAuthenticationService;
    let other: LdapAuthenticationService;
    let directory: { authenticate: ReturnType<typeof vi.fn>; revalidate: ReturnType<typeof vi.fn> };

    beforeEach(async () => {
      folder = mkdtempSync(join(tmpdir(), 'pabawi-ldap-auth-'));
      schema = `ldapauth_${randomUUID().replaceAll('-', '')}`;
      let url = '';
      if (dialect === 'postgres') {
        control = new PostgresAdapter(process.env.TEST_DATABASE_URL!);
        await control.initialize();
        await control.execute(`CREATE SCHEMA ${schema}`);
        const scoped = new URL(process.env.TEST_DATABASE_URL!);
        scoped.searchParams.set('options', `-csearch_path=${schema}`);
        url = scoped.toString();
      }
      const file = join(folder, 'live.db');
      database = new DatabaseService(file, dialect, url);
      await database.initialize();
      db = database.getAdapter();
      reader = dialect === 'sqlite' ? new SQLiteAdapter(file) : new PostgresAdapter(url);
      await reader.initialize();
      auth = new AuthenticationService(db, 'ldap-authentication-fixture-jwt-secret');
      users = new UserService(db, auth);
      directory = { authenticate: vi.fn().mockResolvedValue(result), revalidate: vi.fn().mockResolvedValue(result) };
      const resolveGroup = async (subject: string) => ({ subject, dn: 'cn=operators,dc=example,dc=test', name: 'Operators' });
      mappings = new LdapMappingService(db, config.directoryId, { resolveGroup });
      service = new LdapAuthenticationService(db, config, directory, mappings, users);
      other = new LdapAuthenticationService(reader, config, directory,
        new LdapMappingService(reader, config.directoryId, { resolveGroup }),
        new UserService(reader, new AuthenticationService(reader, 'ldap-authentication-fixture-jwt-secret')));
      await service.initialize();
      await other.initialize();
      await db.execute(`INSERT INTO users (id, username, email, first_name, last_name, created_at, updated_at)
        VALUES ('administrator', 'administrator', 'admin@example.test', '', '', 'now', 'now')`);
      await mappings.create(groupSubject, viewer, { userId: 'administrator' });
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      await reader?.close();
      await database?.close();
      if (control) {
        await control.execute(`DROP SCHEMA ${schema} CASCADE`);
        await control.close();
        control = undefined;
      }
      rmSync(folder, { recursive: true, force: true });
    });

    async function login(): Promise<LdapAuthenticationProof> { return service.authenticate('a', password); }
    async function validate(proof: LdapAuthenticationProof, force = false, instance = service): Promise<void> {
      return instance.assertEligible(proof.user.id, proof.identityId, proof.directoryId, proof.sessionVersion, force);
    }
    async function state() { return db.queryOne('SELECT * FROM ldap_validation_state'); }
    async function expire(): Promise<void> { await db.execute('UPDATE ldap_validation_state SET last_validated_at = 1'); }

    it('publishes account, profile, exact grant provenance and freshness together, without JWT issuance', async () => {
      const token = vi.spyOn(auth, 'generateTokenPair');
      const proof = await login();
      expect(proof.user).toMatchObject({ email: null, passwordHash: null, localAuthEnabled: 0, displayName: 'A' });
      expect(directory.authenticate).toHaveBeenCalledWith('a', password, [groupSubject]);
      expect(await users.getUserRoles(proof.user.id)).toHaveLength(1);
      expect(await db.query('SELECT identity_id, mapping_id, directory_id FROM federated_user_roles'))
        .toEqual([{ identity_id: proof.identityId, mapping_id: (await mappings.list())[0].id, directory_id: 'directory' }]);
      const saved = await state();
      expect(saved).toMatchObject({ identity_id: proof.identityId });
      expect(Number((saved as { last_validated_at: number }).last_validated_at)).toBeGreaterThan(0);
      expect(token).not.toHaveBeenCalled();
      expect(await db.queryOne('SELECT lease_owner, lease_expires_at FROM ldap_validation_leases'))
        .toEqual({ lease_owner: null, lease_expires_at: null });
    });

    it('failed credentials cannot provision or alter existing freshness and grants', async () => {
      directory.authenticate.mockRejectedValueOnce(new LdapDirectoryError('INVALID_CREDENTIALS'));
      await expect(login()).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(await db.query('SELECT * FROM federated_identities')).toEqual([]);
      await login();
      const before = await state();
      directory.authenticate.mockRejectedValueOnce(new LdapDirectoryError('INVALID_CREDENTIALS'));
      await expect(login()).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
      expect(await state()).toEqual(before);
      expect(await db.query('SELECT * FROM federated_user_roles')).toHaveLength(1);
    });

    it('commits a proven zero-role account, denies access and permits a later manually assigned login', async () => {
      directory.authenticate.mockResolvedValue({ ...result, groupSubjects: [] });
      await expect(login()).rejects.toMatchObject({ code: 'DENIED' });
      const identity = await db.queryOne<{ user_id: string }>('SELECT user_id FROM federated_identities');
      expect(identity).not.toBeNull();
      expect(await state()).toMatchObject({ last_validated_at: null });
      await users.assignRoleToUser(identity!.user_id, viewer);
      const proof = await login();
      expect(proof.user.id).toBe(identity!.user_id);
      await expect(validate(proof)).resolves.toBeUndefined();
      expect(await db.query('SELECT * FROM federated_user_roles')).toEqual([]);
    });

    it('never reactivates local suspension or restores sessions on profile refresh', async () => {
      const proof = await login();
      await users.updateUser(proof.user.id, { isActive: false });
      await expect(login()).rejects.toMatchObject({ code: 'DENIED' });
      await expect(validate(proof)).rejects.toMatchObject({ code: 'INVALID_CONTEXT' });
      expect((await users.getUserById(proof.user.id))?.isActive).toBe(0);
      expect(await state()).toMatchObject({ last_validated_at: null });
    });

    it('reuses persisted fresh checks across processes while every forced refresh queries LDAP', async () => {
      const proof = await login();
      await validate(proof);
      await validate(proof, false, other);
      expect(directory.revalidate).not.toHaveBeenCalled();
      await validate(proof, true);
      await validate(proof, true, other);
      expect(directory.revalidate).toHaveBeenCalledTimes(2);
    });

    it('blocks expired freshness on transient errors without extending timestamps or erasing grants, then recovers', async () => {
      const proof = await login();
      await expire();
      const before = await state();
      directory.revalidate.mockRejectedValueOnce(new LdapDirectoryError('UNAVAILABLE'));
      await expect(validate(proof)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
      expect(await state()).toEqual(before);
      expect(await db.query('SELECT * FROM federated_user_roles')).toHaveLength(1);
      await expect(validate(proof, false, other)).resolves.toBeUndefined();
      expect(directory.revalidate).toHaveBeenCalledTimes(2);
    });

    it('does not change grants or freshness for incomplete, limited, timed-out or malformed directory work', async () => {
      const proof = await login();
      const before = await state();
      const grants = await db.query('SELECT * FROM federated_user_roles');
      for (const code of ['INCOMPLETE_RESULT', 'LIMIT_EXCEEDED', 'TIMEOUT', 'POLICY_UNREADABLE', 'IDENTITY_CHANGED'] as const) {
        directory.revalidate.mockRejectedValueOnce(new LdapDirectoryError(code));
        await expect(validate(proof, true)).rejects.toMatchObject({ code });
        expect(await state()).toEqual(before);
        expect(await db.query('SELECT * FROM federated_user_roles')).toEqual(grants);
      }
    });

    it('positive revocation is terminal for old versions even after directory recovery and a new login', async () => {
      const proof = await login();
      directory.revalidate.mockRejectedValueOnce(new LdapDirectoryError('INELIGIBLE'));
      await expect(validate(proof, true)).rejects.toMatchObject({ code: 'DENIED' });
      expect(await state()).toMatchObject({ last_validated_at: null });
      expect(await db.query('SELECT * FROM federated_user_roles')).toEqual([]);
      await expect(validate(proof)).rejects.toMatchObject({ code: 'INVALID_CONTEXT' });
      const fresh = await login();
      expect(fresh.sessionVersion).not.toBe(proof.sessionVersion);
      await expect(validate(fresh)).resolves.toBeUndefined();
      await expect(validate(proof, false, other)).rejects.toMatchObject({ code: 'INVALID_CONTEXT' });
    });

    it('preserves manual and duplicate mapped grants, then revokes when the last explicit role is removed', async () => {
      await mappings.create(otherGroup, viewer, { userId: 'administrator' });
      directory.authenticate.mockResolvedValueOnce({ ...result, groupSubjects: [groupSubject, otherGroup] });
      const proof = await login();
      await users.assignRoleToUser(proof.user.id, viewer);
      expect(await db.query('SELECT * FROM federated_user_roles')).toHaveLength(2);
      await validate(proof, true);
      expect(await db.query('SELECT * FROM federated_user_roles')).toHaveLength(1);
      directory.revalidate.mockResolvedValue({ ...result, groupSubjects: [] });
      await validate(proof, true);
      expect(await users.getUserRoles(proof.user.id)).toHaveLength(1);
      await db.execute('DELETE FROM user_roles WHERE user_id = ?', [proof.user.id]);
      await expect(validate(proof)).rejects.toMatchObject({ code: 'DENIED' });
      await expect(validate(proof)).rejects.toMatchObject({ code: 'INVALID_CONTEXT' });
    });

    it('coalesces simultaneous validation and refresh checks inside a process', async () => {
      const proof = await login();
      const pending = deferred<LdapDirectoryResult>();
      directory.revalidate.mockReturnValueOnce(pending.promise);
      const checks = Array.from({ length: 8 }, () => validate(proof, true));
      await vi.waitFor(() => expect(directory.revalidate).toHaveBeenCalledOnce());
      pending.resolve(result);
      await Promise.all(checks);
      expect(directory.revalidate).toHaveBeenCalledOnce();
    });

    it('coalesces overlapping validations through a database lease across independent connections', async () => {
      const proof = await login();
      const pending = deferred<LdapDirectoryResult>();
      directory.revalidate.mockReturnValueOnce(pending.promise);
      const first = validate(proof, true);
      await vi.waitFor(() => expect(directory.revalidate).toHaveBeenCalledOnce());
      const second = validate(proof, true, other);
      await new Promise(resolve => setTimeout(resolve, 60));
      expect(directory.revalidate).toHaveBeenCalledOnce();
      pending.resolve(result);
      await Promise.all([first, second]);
      expect(directory.revalidate).toHaveBeenCalledOnce();
    });

    it('fences an expired worker after another process publishes a newer decision', async () => {
      const proof = await login();
      const pending = deferred<LdapDirectoryResult>();
      directory.revalidate.mockReturnValueOnce(pending.promise);
      const first = validate(proof, true).catch(error => error as Error);
      await vi.waitFor(() => expect(directory.revalidate).toHaveBeenCalledOnce());
      await reader.execute('UPDATE ldap_validation_leases SET lease_expires_at = 1');
      await validate(proof, true, other);
      const before = await state();
      pending.resolve({ ...result, user: { ...result.user, displayName: 'Stale profile' }, groupSubjects: [] });
      expect(await first).toMatchObject({ code: 'STALE_VALIDATION' });
      expect(await state()).toEqual(before);
      expect((await users.getUserById(proof.user.id))?.displayName).toBe('A');
      expect(await db.query('SELECT * FROM federated_user_roles')).toHaveLength(1);
    });

    it('does not let an old positive denial revoke a newer successful login', async () => {
      const proof = await login();
      const pending = deferred<LdapDirectoryResult>();
      directory.revalidate.mockReturnValueOnce(pending.promise);
      const first = validate(proof, true).catch(error => error as Error);
      await vi.waitFor(() => expect(directory.revalidate).toHaveBeenCalledOnce());
      const fresh = await other.authenticate('a', password);
      pending.reject(new LdapDirectoryError('INELIGIBLE'));
      expect(await first).toMatchObject({ code: 'STALE_VALIDATION' });
      await expect(validate(fresh)).resolves.toBeUndefined();
    });

    it('prevents publication after a mapping edit during directory I/O', async () => {
      const proof = await login();
      const pending = deferred<LdapDirectoryResult>();
      directory.revalidate.mockReturnValueOnce(pending.promise);
      const first = validate(proof, true).catch(error => error as Error);
      await vi.waitFor(() => expect(directory.revalidate).toHaveBeenCalledOnce());
      await mappings.remove((await mappings.list())[0].id, { userId: 'administrator' });
      pending.resolve(result);
      expect(await first).toMatchObject({ code: 'STALE_REVISION' });
      expect(await db.query('SELECT * FROM federated_user_roles')).toEqual([]);
      expect(await state()).toMatchObject({ last_validated_at: null });
    });

    it('rolls back first provisioning and profile changes if freshness publication fails', async () => {
      const execute = db.execute.bind(db);
      vi.spyOn(db, 'execute').mockImplementation(async (sql, params) => {
        if (sql.includes('UPDATE ldap_validation_state SET last_validated_at = ?')) throw new Error('publication failed');
        return execute(sql, params);
      });
      await expect(login()).rejects.toThrow('publication failed');
      for (const table of ['federated_identities', 'ldap_identity_metadata', 'ldap_validation_state', 'ldap_validation_leases', 'federated_user_roles']) {
        expect(await db.query(`SELECT * FROM ${table}`)).toEqual([]);
      }
      expect(await db.query('SELECT id FROM users')).toEqual([{ id: 'administrator' }]);
    });

    it('rejects changed directory configuration in an older process and invalidates persisted freshness', async () => {
      const proof = await login();
      const newer = new LdapAuthenticationService(reader, { ...config, userEligibilityFilter: '(employeeType=approved)' }, directory,
        new LdapMappingService(reader, config.directoryId, { resolveGroup: async () => { throw new Error('unused'); } }),
        new UserService(reader, auth));
      await newer.initialize();
      expect(await state()).toMatchObject({ last_validated_at: null });
      await expect(validate(proof)).rejects.toMatchObject({ code: 'STALE_VALIDATION' });
      await expect(validate(proof, true, newer)).resolves.toBeUndefined();
      await expect(validate(proof)).rejects.toMatchObject({ code: 'STALE_VALIDATION' });
    });

    it('binds validation to exact identity, user, directory and session version', async () => {
      const proof = await login();
      for (const args of [
        ['administrator', proof.identityId, 'directory', proof.sessionVersion],
        [proof.user.id, 'foreign-identity', 'directory', proof.sessionVersion],
        [proof.user.id, proof.identityId, 'foreign-directory', proof.sessionVersion],
        [proof.user.id, proof.identityId, 'directory', 'invalid-version'],
      ] as const) {
        await expect(service.assertEligible(...args)).rejects.toMatchObject({ code: 'INVALID_CONTEXT' });
      }
      expect(directory.revalidate).not.toHaveBeenCalled();
    });

    it('does not emit an audit event for unchanged periodic revalidation', async () => {
      const proof = await login();
      const events = await db.query('SELECT action, details FROM audit_logs');
      await validate(proof, true);
      expect(await db.query('SELECT action, details FROM audit_logs')).toEqual(events);
    });

    it('enforces the exact freshness deadline using a controlled database clock', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const start = 1_800_000_000_000;
      vi.setSystemTime(start);
      const expression = dialect === 'postgres' ? 'CAST(EXTRACT(EPOCH FROM clock_timestamp()) * 1000 AS BIGINT)'
        : "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
      const query = db.queryOne.bind(db);
      const execute = db.execute.bind(db);
      vi.spyOn(db, 'queryOne').mockImplementation((sql, params) => query(sql.replaceAll(expression, String(Date.now())), params));
      vi.spyOn(db, 'execute').mockImplementation((sql, params) => execute(sql.replaceAll(expression, String(Date.now())), params));
      try {
        const proof = await login();
        vi.setSystemTime(start + 299_999);
        await validate(proof);
        expect(directory.revalidate).not.toHaveBeenCalled();
        vi.setSystemTime(start + 300_000);
        directory.revalidate.mockRejectedValueOnce(new LdapDirectoryError('UNAVAILABLE'));
        await expect(validate(proof)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
        const saved = await state() as { last_validated_at: number | string };
        expect(Number(saved.last_validated_at)).toBe(start);
        await expect(validate(proof)).resolves.toBeUndefined();
        expect(directory.revalidate).toHaveBeenCalledTimes(2);
        const pending = deferred<LdapDirectoryResult>();
        directory.authenticate.mockReturnValueOnce(pending.promise);
        const staleLogin = login().catch(error => error as Error);
        await vi.waitFor(() => expect(directory.authenticate).toHaveBeenCalledTimes(2));
        // Equal timestamps still have an unambiguous persisted decision order.
        directory.revalidate.mockRejectedValueOnce(new LdapDirectoryError('INELIGIBLE'));
        await expect(validate(proof, true)).rejects.toMatchObject({ code: 'DENIED' });
        pending.resolve(result);
        expect(await staleLogin).toMatchObject({ code: 'STALE_VALIDATION' });
      } finally { vi.useRealTimers(); }
    });

    it('cannot turn a slow credential transaction into fresh state at completion time', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      const start = 1_800_000_000_000;
      vi.setSystemTime(start);
      const expression = dialect === 'postgres' ? 'CAST(EXTRACT(EPOCH FROM clock_timestamp()) * 1000 AS BIGINT)'
        : "CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)";
      const query = db.queryOne.bind(db);
      const execute = db.execute.bind(db);
      vi.spyOn(db, 'queryOne').mockImplementation((sql, params) => query(sql.replaceAll(expression, String(Date.now())), params));
      vi.spyOn(db, 'execute').mockImplementation((sql, params) => execute(sql.replaceAll(expression, String(Date.now())), params));
      directory.authenticate.mockImplementationOnce(async () => { vi.setSystemTime(start + 300_000); return result; });
      try {
        await expect(login()).rejects.toMatchObject({ code: 'STALE_VALIDATION' });
        expect(await db.query('SELECT * FROM federated_identities')).toEqual([]);
      } finally { vi.useRealTimers(); }
    });

    it('converges concurrent credential proofs from independent connections to one account and identity', async () => {
      const attempts = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => (i % 2 ? service : other).authenticate('a', password)));
      const completed = attempts.filter(attempt => attempt.status === 'fulfilled');
      expect(completed.length).toBeGreaterThan(0);
      expect(new Set(completed.map(attempt => attempt.value.user.id)).size).toBe(1);
      expect(await db.query('SELECT * FROM federated_identities')).toHaveLength(1);
      expect(await db.query('SELECT * FROM ldap_validation_state')).toHaveLength(1);
      expect(await db.query('SELECT * FROM federated_user_roles')).toHaveLength(1);
      for (const attempt of attempts) if (attempt.status === 'rejected') expect(attempt.reason).toMatchObject({ code: 'STALE_VALIDATION' });
    });

    it('rejects a credential proof that started before a newer positive revocation', async () => {
      const proof = await login();
      const pending = deferred<LdapDirectoryResult>();
      directory.authenticate.mockReturnValueOnce(pending.promise);
      const first = login().catch(error => error as Error);
      await vi.waitFor(() => expect(directory.authenticate).toHaveBeenCalledTimes(2));
      await new Promise(resolve => setTimeout(resolve, 3));
      directory.revalidate.mockRejectedValueOnce(new LdapDirectoryError('INELIGIBLE'));
      await expect(validate(proof, true, other)).rejects.toMatchObject({ code: 'DENIED' });
      pending.resolve(result);
      expect(await first).toMatchObject({ code: 'STALE_VALIDATION' });
      expect(await state()).toMatchObject({ last_validated_at: null });
      expect(await db.query('SELECT * FROM federated_user_roles')).toEqual([]);
    });
  });
}
