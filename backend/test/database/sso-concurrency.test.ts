import { describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQLiteAdapter } from '../../src/database/SQLiteAdapter';
import { PostgresAdapter } from '../../src/database/PostgresAdapter';
import { MigrationRunner } from '../../src/database/MigrationRunner';
import { EntraIdService, type IdTokenClaims } from '../../src/services/EntraIdService';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { UserService } from '../../src/services/UserService';
import { PermissionService } from '../../src/services/PermissionService';
import { RoleService } from '../../src/services/RoleService';
import { AuditLoggingService } from '../../src/services/AuditLoggingService';
import { LoggerService } from '../../src/services/LoggerService';
import type { DatabaseAdapter } from '../../src/database/DatabaseAdapter';

for (const dialect of ['sqlite', 'postgres'] as const) {
  describe.skipIf(dialect === 'postgres' && !process.env.TEST_DATABASE_URL)(`${dialect} SSO across connections`, () => {
    it('converges concurrent first login and permits one redemption across independent service instances', async () => {
      const schema = `sso_${randomUUID().replaceAll('-', '')}`;
      let control: PostgresAdapter | undefined;
      let make: () => DatabaseAdapter;
      if (dialect === 'postgres') {
        control = new PostgresAdapter(process.env.TEST_DATABASE_URL!);
        await control.initialize();
        await control.execute(`CREATE SCHEMA ${schema}`);
        const url = new URL(process.env.TEST_DATABASE_URL!);
        url.searchParams.set('options', `-c search_path=${schema}`);
        make = () => new PostgresAdapter(url.toString());
      } else {
        const file = join(mkdtempSync(join(tmpdir(), 'pabawi-a08-')), 'sso.db');
        make = () => new SQLiteAdapter(file);
      }
      const adapters = [make(), make()];
      try {
        await adapters[0].initialize();
        await new MigrationRunner(adapters[0]).runPendingMigrations();
        await adapters[1].initialize();
        const services = adapters.map(db => {
          const auth = new AuthenticationService(db, 'sso-concurrency-fixture-secret');
          return new EntraIdService(db, { enabled: true, tenantId: 'tenant', clientId: 'client', clientSecret: 'fixture',
            redirectUri: 'http://localhost/callback', scopes: ['openid'], groupMapping: { A: 'Viewer' }, jwksCacheTtlMs: 1000 },
          auth, new UserService(db, auth), new RoleService(db), new AuditLoggingService(db), new LoggerService());
        });
        const claims: IdTokenClaims = { sub: 'subject', iss: 'https://login.microsoftonline.com/tenant/v2.0', aud: 'client',
          exp: Math.floor(Date.now() / 1000) + 60, nonce: 'nonce', email: 'new@example.test', preferred_username: 'newuser', given_name: 'New', family_name: 'User' };
        const users = await Promise.all(services.map(service => service.provisionUser(claims)));
        expect(new Set(users.map(user => user.id)).size).toBe(1);
        expect(await adapters[0].query('SELECT * FROM federated_identities')).toHaveLength(1);
        await adapters[0].execute('DELETE FROM user_roles WHERE user_id = ?', [users[0].id]);
        const permissions = new PermissionService(adapters[1]);
        await Promise.all(services.map(service => service.syncGroupRoles(users[0].id, ['a'])));
        expect(await permissions.hasPermission(users[0].id, 'executions', 'read')).toBe(true);
        await services[0].syncGroupRoles(users[0].id, undefined);
        expect(await permissions.hasPermission(users[0].id, 'executions', 'read')).toBe(false);
        const { token, refreshToken } = await services[0].authService.generateTokenPair(users[0]);
        const binding = 'a'.repeat(64);
        await adapters[0].execute(`INSERT INTO oauth_auth_codes
          (code, access_token, refresh_token, user_id, created_at, expires_at, browser_binding)
          VALUES ('code', ?, ?, ?, ?, ?, ?)`, [token, refreshToken, users[0].id, new Date().toISOString(),
          new Date(Date.now() + 60000).toISOString(), createHash('sha256').update(binding).digest('hex')]);
        const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => services[i % 2].exchangeAuthCode('code', binding)));
        expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(result => result.status === 'rejected')).toHaveLength(11);
      } finally {
        for (const db of adapters) await db.close();
        if (control) {
          await control.execute(`DROP SCHEMA ${schema} CASCADE`);
          await control.close();
        }
      }
    });
  });
}
