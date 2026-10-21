import express from 'express';
import { resolve } from 'node:path';
import { DatabaseService } from '../../../src/database/DatabaseService';
import { createDefaultContainer, resolveAuthenticationService } from '../../../src/container/DIContainer';
import { LdapDirectoryService, LdapDirectoryError, type LdapDiagnostics } from '../../../src/services/LdapDirectoryService';
import { LdapMappingService } from '../../../src/services/LdapMappingService';
import { LdapAuthenticationService } from '../../../src/services/LdapAuthenticationService';
import { UserService } from '../../../src/services/UserService';
import { createAuthRouter } from '../../../src/routes/auth';
import { createLdapAdministrationRouter } from '../../../src/routes/ldapAdministration';
import { createUsersRouter } from '../../../src/routes/users';
import { createRolesRouter } from '../../../src/routes/roles';
import { createGroupsRouter } from '../../../src/routes/groups';
import { inputSanitizationMiddleware } from '../../../src/middleware/securityMiddleware';

const group = { subject: '10112233-4455-6677-8899-aabbccddeeff',
  dn: 'cn=operators,dc=example,dc=test', name: 'Operators' };
const result = { user: { subject: '00112233-4455-6677-8899-aabbccddeeff',
  dn: 'uid=a,dc=example,dc=test', loginName: 'a', displayName: 'Directory A',
  email: null, firstName: '', lastName: '' }, groupSubjects: [group.subject] };
const directoryPassword = 'x'; // pragma: allowlist secret
const localPassword = 'LocalTest123!'; // pragma: allowlist secret

// Synthetic directory responses isolate browser contracts from LDAP protocol acceptance.
class BrowserDirectory extends LdapDirectoryService {
  override async authenticate(username: string, password: string) {
    if (username !== 'a' || password !== directoryPassword) throw new LdapDirectoryError('INVALID_CREDENTIALS');
    return result;
  }
  override async revalidate() { return result; }
  override async searchGroups(query: string) { return query === 'empty' ? [] : [group]; }
  override async resolveGroup(subject: string) {
    if (subject !== group.subject) throw new LdapDirectoryError('INVALID_IDENTITY');
    return group;
  }
  override async diagnose(input: { username?: string; groupSubjects?: string[] }): Promise<LdapDiagnostics> {
    if (input.username === 'outage') return { authenticated: false, stages: [
      { stage: 'tls', status: 'failed', durationMs: 2, code: 'UNAVAILABLE' },
    ] };
    return { authenticated: false, stages: [
      { stage: 'tls', status: 'passed', durationMs: 1 }, { stage: 'lookup', status: 'passed', durationMs: 1 },
      ...(input.username ? [{ stage: 'identity' as const, status: 'passed' as const, durationMs: 1 },
        { stage: 'eligibility' as const, status: 'passed' as const, durationMs: 1 }] : []),
    ], ...(input.groupSubjects ? { groupSubjects: input.groupSubjects } : {}) };
  }
}

async function start(): Promise<void> {
  const database = new DatabaseService(':memory:');
  await database.initialize();
  const container = createDefaultContainer();
  const config = container.resolve('config').getLdapConfig();
  if (!config) throw new Error('Browser fixture requires LDAP configuration');
  const db = database.getAdapter();
  const auth = resolveAuthenticationService(db, container);
  const users = new UserService(db, auth);
  const admin = await users.createUser({ username: 'browseradmin', email: 'admin@example.test',
    password: localPassword, firstName: 'Browser', lastName: 'Admin', isAdmin: true });
  await users.createUser({ username: 'browserviewer', email: 'viewer@example.test',
    password: localPassword, firstName: 'Browser', lastName: 'Viewer' });
  const directory = new BrowserDirectory(config, container.resolve('logger'));
  const mappings = new LdapMappingService(db, config.directoryId, directory);
  await mappings.create(group.subject, 'role-viewer-001', { userId: admin.id });
  await users.createFederatedUser({ provider: 'ldap', issuer: config.directoryId,
    ...result.user, defaultRole: 'none' });
  const ldap = new LdapAuthenticationService(db, config, directory, mappings, users);
  await ldap.initialize();
  container.register('ldapDirectory', directory);
  container.register('ldapMappings', mappings);
  container.register('ldapAuthentication', ldap);
  
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(inputSanitizationMiddleware);
  app.get('/api/setup/status', (_req, res) => res.json({ isComplete: true, config: { allowSelfRegistration: false } }));
  app.use('/api/auth/ldap', createLdapAdministrationRouter(database, container));
  app.use('/api/auth', createAuthRouter(database, container));
  app.use('/api/users', createUsersRouter(database, container));
  app.use('/api/roles', createRolesRouter(database, container));
  app.use('/api/groups', createGroupsRouter(database, container));
  app.use('/api', (_req, res) => res.status(404).json({ error: { message: 'Outside browser fixture scope' } }));
  app.use(express.static(resolve('frontend/dist')));
  app.get('*', (_req, res) => res.sendFile(resolve('frontend/dist/index.html')));
  const server = app.listen(3186, '127.0.0.1');
  async function close(): Promise<void> {
    await new Promise<void>((yes, no) => server.close(error => error ? no(error) : yes()));
    await database.close();
  }
  process.once('SIGTERM', () => { void close(); });
  process.once('SIGINT', () => { void close(); });
}

void start();
