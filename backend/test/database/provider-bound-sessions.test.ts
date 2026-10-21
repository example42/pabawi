import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import jwt from 'jsonwebtoken';
import { SQLiteAdapter } from '../../src/database/SQLiteAdapter';
import { PostgresAdapter } from '../../src/database/PostgresAdapter';
import type { DatabaseAdapter } from '../../src/database/DatabaseAdapter';
import { MigrationRunner } from '../../src/database/MigrationRunner';
import { AuthenticationService, type AuthenticationContext } from '../../src/services/AuthenticationService';
import { UserService } from '../../src/services/UserService';

const secret = 'provider-context-fixture-signing-key'; // pragma: allowlist secret
const password = 'ProviderTest123!'; // pragma: allowlist secret
const localContext: AuthenticationContext = { provider: 'local', identityId: null };
const migrations = join(__dirname, '../../src/database/migrations');

for (const dialect of ['sqlite', 'postgres'] as const) {
  describe.skipIf(dialect === 'postgres' && !process.env.TEST_DATABASE_URL)(`${dialect}: provider-bound sessions`, () => {
    let db: DatabaseAdapter;
    let control: PostgresAdapter | undefined;
    let schema: string;
    let auth: AuthenticationService;
    let users: UserService;

    beforeEach(async () => {
      schema = `sessions_${randomUUID().replaceAll('-', '')}`;
      if (dialect === 'postgres') {
        control = new PostgresAdapter(process.env.TEST_DATABASE_URL!);
        await control.initialize();
        await control.execute(`CREATE SCHEMA ${schema}`);
        const scoped = new URL(process.env.TEST_DATABASE_URL!);
        scoped.searchParams.set('options', `-csearch_path=${schema}`);
        db = new PostgresAdapter(scoped.toString());
      } else {
        db = new SQLiteAdapter(':memory:');
      }
      await db.initialize();
      auth = new AuthenticationService(db, secret, undefined, 4);
      users = new UserService(db, auth);
    });

    afterEach(async () => {
      await db?.close();
      if (control) {
        await control.execute(`DROP SCHEMA ${schema} CASCADE`);
        await control.close();
        control = undefined;
      }
    });

    async function fixture(): Promise<{ user: { id: string; username: string }; context: AuthenticationContext }> {
      await new MigrationRunner(db).runPendingMigrations();
      const user = await users.createUser({ username: 'alice', email: 'alice@example.test', password,
        firstName: 'Alice', lastName: 'Test' });
      await users.linkFederatedIdentity(user.id, 'entra-id', 'immutable-subject', 'https://issuer.example.test', user.email);
      const identity = await db.queryOne<{ id: string }>('SELECT id FROM federated_identities WHERE user_id = ?', [user.id]);
      expect(identity).not.toBeNull();
      return { user, context: { provider: 'entra-id', identityId: identity!.id } };
    }

    function replaceContext(token: string, context: unknown): string {
      const payload = jwt.decode(token) as jwt.JwtPayload;
      if (context === undefined) delete payload.authContext;
      else payload.authContext = context;
      return jwt.sign(payload, secret, { algorithm: 'HS256' });
    }

    it('issues and rotates explicit local and Entra context without guessing an enrolled account provider', async () => {
      const { user, context } = await fixture();
      const local = await auth.authenticate(user.username, password);
      expect(local.success).toBe(true);
      expect(await auth.verifyToken(local.token!)).toMatchObject({ authContext: localContext });
      const federated = await auth.generateTokenPair(user, context);
      for (const [pair, expected] of [[local, localContext], [federated, context]] as const) {
        expect(jwt.decode(pair.refreshToken!)).toMatchObject({ authContext: expected, type: 'refresh' });
        const rotated = await auth.refreshToken(pair.refreshToken!);
        expect(rotated.success).toBe(true);
        expect(await auth.verifyToken(rotated.token!)).toMatchObject({ userId: user.id, authContext: expected });
        expect(jwt.decode(rotated.refreshToken!)).toMatchObject({ authContext: expected, type: 'refresh' });
        expect(rotated.refreshToken).not.toBe(pair.refreshToken);
      }
    });

    it('rejects signed malformed, legacy, mismatched and premature LDAP context for access and refresh', async () => {
      const { user, context } = await fixture();
      const pair = await auth.generateTokenPair(user, context);
      const other = await users.createUser({ username: 'other', email: 'other@example.test', password,
        firstName: '', lastName: '' });
      await users.linkFederatedIdentity(other.id, 'entra-id', 'immutable-subject', 'https://other-issuer.example.test', other.email);
      const otherIdentity = await db.queryOne<{ id: string }>('SELECT id FROM federated_identities WHERE user_id = ?', [other.id]);
      const invalid = [undefined, null, 'local', {}, { provider: 'local' },
        { provider: 'local', identityId: context.identityId }, { provider: 'entra-id', identityId: null },
        { provider: 'entra-id', identityId: '' }, { provider: 'entra-id', identityId: 42 },
        { provider: 'entra-id', identityId: 'missing' }, { provider: 'entra-id', identityId: otherIdentity!.id },
        { ...context, directoryId: 'forged' }, { provider: 'unknown', identityId: null },
        { provider: 'ldap', identityId: context.identityId, directoryId: 'directory' }];
      for (const value of invalid) {
        await expect(auth.verifyToken(replaceContext(pair.token, value))).rejects.toThrow('Invalid token');
        expect((await auth.refreshToken(replaceContext(pair.refreshToken, value))).success).toBe(false);
      }
      // Untrusted changes also fail signature validation before database context resolution.
      const [header, body, signature] = pair.token.split('.');
      const changed = JSON.parse(Buffer.from(body, 'base64url').toString()) as Record<string, unknown>;
      changed.authContext = localContext;
      await expect(auth.verifyToken(`${header}.${Buffer.from(JSON.stringify(changed)).toString('base64url')}.${signature}`))
        .rejects.toThrow('Invalid token');
      await expect(auth.verifyToken(pair.token)).resolves.toMatchObject({ authContext: context });
    });

    it('checks identity ownership at issuance and does not treat external accounts as local', async () => {
      await new MigrationRunner(db).runPendingMigrations();
      const user = await users.createFederatedUser({ provider: 'entra-id', issuer: 'tenant', subject: 'subject',
        username: 'external', email: null, firstName: '', lastName: '', displayName: null, defaultRole: 'configured' });
      for (const issue of [auth.generateToken.bind(auth), auth.generateRefreshToken.bind(auth), auth.generateTokenPair.bind(auth)]) {
        await expect(issue(user, localContext)).rejects.toThrow('Invalid token');
        await expect(issue(user, { provider: 'entra-id', identityId: 'missing' })).rejects.toThrow('Invalid token');
        await expect(issue(user, { provider: 'ldap', identityId: 'missing', directoryId: 'directory' } as unknown as AuthenticationContext))
          .rejects.toThrow('Invalid token');
      }
      const identity = await db.queryOne<{ id: string }>('SELECT id FROM federated_identities WHERE user_id = ?', [user.id]);
      const pair = await auth.generateTokenPair(user, { provider: 'entra-id', identityId: identity!.id });
      expect((await auth.refreshToken(pair.refreshToken)).user?.email).toBeNull();
    });

    it('fails after identity deletion while independent local sessions remain valid', async () => {
      const { user, context } = await fixture();
      const local = await auth.generateTokenPair(user, localContext);
      const federated = await auth.generateTokenPair(user, context);
      await db.execute('DELETE FROM federated_identities WHERE id = ?', [context.identityId]);
      await expect(auth.verifyToken(federated.token)).rejects.toThrow('Invalid token');
      expect((await auth.refreshToken(federated.refreshToken)).success).toBe(false);
      await expect(auth.verifyToken(local.token)).resolves.toMatchObject({ authContext: localContext });
      expect((await auth.refreshToken(local.refreshToken)).success).toBe(true);
    });

    it('rejects disabled local scope and preserves explicitly enrolled Entra access', async () => {
      const { user, context } = await fixture();
      const old = await auth.generateTokenPair(user, localContext);
      await db.execute('UPDATE users SET local_auth_enabled = 0, password_hash = NULL WHERE id = ?', [user.id]);
      await expect(auth.verifyToken(old.token)).rejects.toThrow('revoked');
      expect((await auth.refreshToken(old.refreshToken)).success).toBe(false);
      await expect(auth.generateTokenPair(user, localContext)).rejects.toThrow('Invalid token');
      const pair = await auth.generateTokenPair(user, context);
      await expect(auth.verifyToken(pair.token)).resolves.toMatchObject({ authContext: context });
      await auth.revokeAllUserTokens(user.id);
      await expect(auth.verifyToken(pair.token)).rejects.toThrow('revoked');
      expect((await auth.refreshToken(pair.refreshToken)).success).toBe(false);
    });

    it('invalidates legacy sessions once on upgrade while preserving identities, grants and account data', async () => {
      const partial = mkdtempSync(join(tmpdir(), 'pabawi-provider-migrations-'));
      for (const file of readdirSync(migrations).filter(file => file.endsWith('.sql') && file < '032')) {
        copyFileSync(join(migrations, file), join(partial, file));
      }
      await new MigrationRunner(db, partial).runPendingMigrations();
      const user = await users.createUser({ username: 'alice', email: 'alice@example.test', password,
        firstName: 'Alice', lastName: 'Test' });
      await users.linkFederatedIdentity(user.id, 'entra-id', 'subject', 'issuer', user.email);
      const identity = await db.queryOne<{ id: string }>('SELECT id FROM federated_identities WHERE user_id = ?', [user.id]);
      const context: AuthenticationContext = { provider: 'entra-id', identityId: identity!.id };
      const local = await auth.generateTokenPair(user, localContext);
      const federated = await auth.generateTokenPair(user, context);
      const legacy = replaceContext(local.token, undefined);
      const legacyRefresh = replaceContext(local.refreshToken, undefined);
      const now = new Date().toISOString();
      const future = new Date(Date.now() + 600_000).toISOString();
      await db.execute(`INSERT INTO oauth_state_store (state, nonce, code_verifier, created_at, expires_at)
        VALUES ('state', 'nonce', 'verifier', ?, ?)`, [now, future]);
      await db.execute(`INSERT INTO oauth_auth_codes (code, access_token, refresh_token, user_id, created_at, expires_at)
        VALUES ('code', ?, ?, ?, ?, ?)`, [local.token, local.refreshToken, user.id, now, future]);
      await db.execute(`INSERT INTO console_sessions (id, user_id, node_id, provider, transport, state, started_at, session_version)
        VALUES ('console', ?, 'node', 'proxmox', 'websocket-vnc', 'active', ?, ?)`, [user.id, now, (jwt.decode(local.token) as jwt.JwtPayload).sessionVersion]);
      const accountColumns = 'id, username, email, password_hash, local_auth_enabled, first_name, last_name, is_active, is_admin, created_at, updated_at';
      const account = await db.query(`SELECT ${accountColumns} FROM users`);
      const tables = ['federated_identities', 'user_roles', 'effective_user_roles'];
      const before = await Promise.all(tables.map(table => db.query(`SELECT * FROM ${table}`)));
      expect(await new MigrationRunner(db).runPendingMigrations()).toBe(3);
      expect(await db.query(`SELECT ${accountColumns} FROM users`)).toEqual(account);
      expect(await Promise.all(tables.map(table => db.query(`SELECT * FROM ${table}`)))).toEqual(before);
      for (const pair of [local, federated, { token: legacy, refreshToken: legacyRefresh }]) {
        await expect(auth.verifyToken(pair.token)).rejects.toThrow();
        expect((await auth.refreshToken(pair.refreshToken)).success).toBe(false);
      }
      for (const table of ['oauth_state_store', 'oauth_auth_codes']) {
        expect(await db.query(`SELECT * FROM ${table} WHERE expires_at > ?`, [now])).toEqual([]);
      }
      expect(await db.query('SELECT c.id FROM console_sessions c JOIN users u ON c.user_id = u.id WHERE c.session_version = u.session_version')).toEqual([]);
      const newLocal = await auth.authenticate(user.username, password);
      const newFederated = await auth.generateTokenPair(user, context);
      expect(newLocal.success).toBe(true);
      expect(await new MigrationRunner(db).runPendingMigrations()).toBe(0);
      await expect(auth.verifyToken(newLocal.token!)).resolves.toMatchObject({ authContext: localContext });
      await expect(auth.verifyToken(newFederated.token)).resolves.toMatchObject({ authContext: context });
      if (dialect === 'sqlite') expect(await db.query('PRAGMA foreign_key_check')).toEqual([]);
    });
  });
}
