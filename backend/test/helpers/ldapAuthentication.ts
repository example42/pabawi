import { vi } from 'vitest';
import express from 'express';
import { DatabaseService } from '../../src/database/DatabaseService';
import { createDefaultContainer, resolveAuthenticationService } from '../../src/container/DIContainer';
import { parseLdapConfig } from '../../src/config/ldap';
import { LdapAuthenticationService } from '../../src/services/LdapAuthenticationService';
import { LdapMappingService } from '../../src/services/LdapMappingService';
import { UserService } from '../../src/services/UserService';
import { createAuthRouter } from '../../src/routes/auth';
import { createAuthMiddleware } from '../../src/middleware/authMiddleware';
import { inputSanitizationMiddleware } from '../../src/middleware/securityMiddleware';
import type { LdapDirectoryResult } from '../../src/services/LdapDirectoryService';

export const ldapPassword = 'synthetic-directory-password'; // pragma: allowlist secret
export const ldapGroup = '10112233-4455-6677-8899-aabbccddeeff';
export const ldapResult: LdapDirectoryResult = { user: { subject: '00112233-4455-6677-8899-aabbccddeeff',
  dn: 'uid=a,dc=example,dc=test', loginName: 'a', displayName: 'Directory A', email: null, firstName: '', lastName: '' },
groupSubjects: [ldapGroup] };

export async function createLdapTestContext(database = new DatabaseService(':memory:')) {
  vi.stubEnv('JWT_SECRET', 'ldap-http-fixture-signing-secret-key');
  vi.stubEnv('LDAP_ENABLED', 'false');
  vi.stubEnv('ENTRA_ID_ENABLED', 'false');
  await database.initialize();
  const db = database.getAdapter();
  const container = createDefaultContainer();
  const config = parseLdapConfig({ LDAP_ENABLED: 'true', LDAP_DIRECTORY_ID: 'directory', LDAP_DIRECTORY_TYPE: 'openldap',
    LDAP_HOSTNAME: 'ldap.example.test', LDAP_ANONYMOUS_LOOKUP: 'true', LDAP_BASE_DN: 'dc=example,dc=test',
    LDAP_USER_ELIGIBILITY_FILTER: '(employeeType=active)' })!;
  vi.spyOn(container.resolve('config'), 'getLdapConfig').mockReturnValue(config);
  const auth = resolveAuthenticationService(db, container);
  const users = new UserService(db, auth);
  const administrator = await users.createUser({ username: 'administrator', email: 'admin@example.test', password: 'LocalTest123!', // pragma: allowlist secret
    firstName: '', lastName: '', isAdmin: true }); // pragma: allowlist secret
  const directory = { authenticate: vi.fn().mockResolvedValue(ldapResult), revalidate: vi.fn().mockResolvedValue(ldapResult) };
  const mappings = new LdapMappingService(db, config.directoryId, { resolveGroup: async subject => ({
    subject, dn: 'cn=operators,dc=example,dc=test', name: 'Operators',
  }) });
  await mappings.create(ldapGroup, 'role-viewer-001', { userId: administrator.id });
  const ldap = new LdapAuthenticationService(db, config, directory, mappings, users);
  await ldap.initialize();
  container.register('ldapAuthentication', ldap);
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(inputSanitizationMiddleware);
  app.use('/api/auth', createAuthRouter(database, container));
  const authenticate = createAuthMiddleware(auth);
  app.get('/protected', authenticate, (req, res) => { res.json({ context: req.authContext }); });
  return { database, db, container, config, auth, users, administrator, directory, mappings, ldap, app, authenticate };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
