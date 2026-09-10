import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseService } from '../../src/database/DatabaseService';
import { AuthenticationService } from '../../src/services/AuthenticationService';
import { UserService, type User } from '../../src/services/UserService';
import { RoleService } from '../../src/services/RoleService';
import { GroupService } from '../../src/services/GroupService';
import { PermissionService } from '../../src/services/PermissionService';
import { AuditLoggingService } from '../../src/services/AuditLoggingService';
import { createUsersRouter } from '../../src/routes/users';
import { createGroupsRouter } from '../../src/routes/groups';
import { createRolesRouter } from '../../src/routes/roles';
import { createPermissionsRouter } from '../../src/routes/permissions';
import { createHttpHarness, type HttpHarness } from '../helpers/httpHarness';

const secret = 'entitlement-administration-test-secret'; // pragma: allowlist secret
let harness: HttpHarness;
beforeAll(async () => { harness = await createHttpHarness(); });
afterAll(async () => { await harness.close(); });

describe('A07: deliberate entitlement administration', () => {
  let database: DatabaseService;
  let auth: AuthenticationService;
  let users: UserService;
  let roles: RoleService;
  let permissions: PermissionService;
  let editor: User;
  let target: User;
  let delegate: User;
  let editorToken: string;
  let delegateToken: string;
  let groupId: string;
  let roleId: string;
  let delegationRoleId: string;
  let app: express.Express;

  beforeEach(async () => {
    process.env.JWT_SECRET = secret;
    database = new DatabaseService(':memory:');
    await database.initialize();
    const db = database.getAdapter();
    await db.execute("UPDATE config SET value = '' WHERE key = 'default_new_user_role'");
    auth = new AuthenticationService(db, secret);
    users = new UserService(db, auth);
    roles = new RoleService(db);
    permissions = new PermissionService(db);
    const createUser = (username: string) => users.createUser({ username, email: `${username}@example.test`, password: 'Password123!', firstName: username, lastName: 'Test' });
    editor = await createUser('editor');
    target = await createUser('target');
    delegate = await createUser('delegate');
    const editorRole = await roles.createRole({ name: 'Helpdesk', description: '' });
    for (const resource of ['users', 'roles', 'groups', 'permissions']) {
      for (const action of ['read', 'write', 'admin']) {
        const permission = await permissions.getPermissionByResourceAction(resource, action)
          ?? await permissions.createPermission({ resource, action });
        await roles.assignPermissionToRole(editorRole.id, permission.id);
      }
    }
    await users.assignRoleToUser(editor.id, editorRole.id);
    const delegationRole = await roles.createRole({ name: 'Entitlement administrator', description: '' });
    delegationRoleId = delegationRole.id;
    await roles.assignPermissionToRole(delegationRole.id, 'rbac-admin-001');
    await users.assignRoleToUser(delegate.id, delegationRole.id);
    groupId = (await new GroupService(db).createGroup({ name: 'Privileged group', description: '' })).id;
    await new GroupService(db).assignRoleToGroup(groupId, 'role-admin-001');
    roleId = (await roles.createRole({ name: 'Custom role', description: '' })).id;
    await users.assignRoleToUser(editor.id, roleId);
    editorToken = await auth.generateToken(editor);
    delegateToken = await auth.generateToken(delegate);
    app = express();
    app.use(express.json());
    app.use('/api/users', createUsersRouter(database));
    app.use('/api/groups', createGroupsRouter(database));
    app.use('/api/roles', createRolesRouter(database));
    app.use('/api/permissions', createPermissionsRouter(database));
  });
  afterEach(async () => { await database.close(); });

  const mutations = () => [
    ['post', `/api/users/${editor.id}/roles/role-admin-001`, {}],
    ['post', `/api/users/${target.id}/roles/role-admin-001`, {}],
    ['delete', `/api/users/${editor.id}/roles/${roleId}`, {}],
    ['post', `/api/users/${editor.id}/groups/${groupId}`, {}],
    ['post', `/api/users/${target.id}/groups/${groupId}`, {}],
    ['delete', `/api/users/${editor.id}/groups/${groupId}`, {}],
    ['post', `/api/groups/${groupId}/roles/${roleId}`, {}],
    ['delete', `/api/groups/${groupId}/roles/role-admin-001`, {}],
    ['delete', `/api/groups/${groupId}`, {}],
    ['post', `/api/roles/${roleId}/permissions/rbac-admin-001`, {}],
    ['delete', `/api/roles/${roleId}/permissions/rbac-admin-001`, {}],
    ['post', '/api/roles', { name: 'Mapped SSO role', description: '' }],
    ['put', `/api/roles/${roleId}`, { name: 'Mapped SSO role' }],
    ['delete', `/api/roles/${roleId}`, {}],
    ['post', '/api/permissions', { resource: 'custom', action: 'admin', description: '' }],
    ['put', `/api/users/${target.id}/admin-status`, { isAdmin: true }],
  ] as const;

  it('rejects anonymous, no-role and legacy management grants on every entitlement mutation', async () => {
    const tables = ['users', 'roles', 'groups', 'permissions', 'user_roles', 'user_groups', 'group_roles', 'role_permissions'];
    const snapshot = () => Promise.all(tables.map(table => database.getAdapter().query(`SELECT * FROM ${table} ORDER BY 1`)));
    const before = await snapshot();
    for (const token of [undefined, await auth.generateToken(target), editorToken]) {
      for (const [method, path, body] of mutations()) {
        const call = request(harness.use(app))[method](path).send(body);
        if (token) call.set('Authorization', `Bearer ${token}`);
        const response = await call;
        expect(response.status, `${method} ${path}`).toBe(token ? 403 : 401);
        if (token) expect(response.body.error.required).toMatchObject({ resource: 'rbac', action: 'admin' });
      }
    }
    expect(await snapshot()).toEqual(before);
    const denials = await new AuditLoggingService(database.getAdapter()).queryLogs({ userId: editor.id });
    expect(denials).toHaveLength(mutations().length);
    expect(denials.every(log => log.result === 'denied')).toBe(true);
    expect(await permissions.hasPermission(editor.id, 'rbac', 'admin')).toBe(false);
    expect(await users.getUserGroups(editor.id)).toEqual([]);
    expect(await roles.getRolePermissions(roleId)).toEqual([]);
    expect((await users.getUserById(target.id))?.isAdmin).toBe(0);
  });

  it('preserves profile and group metadata editing without entitlement authority', async () => {
    await request(harness.use(app)).put(`/api/users/${target.id}`).set('Authorization', `Bearer ${editorToken}`).send({ firstName: 'Updated' }).expect(200);
    await request(harness.use(app)).put(`/api/groups/${groupId}`).set('Authorization', `Bearer ${editorToken}`).send({ description: 'Updated' }).expect(200);
  });

  it('allows full delegation, including self-assignment, only with explicit authority and persists attribution', async () => {
    expect(await permissions.hasPermission(delegate.id, 'aws', 'destroy')).toBe(false);
    const actions = [
      ['post', `/api/users/${target.id}/roles/role-admin-001`],
      ['delete', `/api/users/${target.id}/roles/role-admin-001`],
      ['post', `/api/users/${target.id}/groups/${groupId}`],
      ['delete', `/api/users/${target.id}/groups/${groupId}`],
      ['post', `/api/groups/${groupId}/roles/${roleId}`],
      ['delete', `/api/groups/${groupId}/roles/${roleId}`],
      ['post', `/api/roles/${roleId}/permissions/rbac-admin-001`],
      ['delete', `/api/roles/${roleId}/permissions/rbac-admin-001`],
      ['post', `/api/users/${delegate.id}/roles/role-admin-001`],
    ] as const;
    for (const [method, path] of actions) {
      await request(harness.use(app))[method](path).set('Authorization', `Bearer ${delegateToken}`).expect(204);
    }
    const logs = await new AuditLoggingService(database.getAdapter()).queryLogs({ userId: delegate.id });
    expect(logs).toHaveLength(actions.length);
    expect(logs.every(log => log.result === 'success' && log.details)).toBe(true);
    expect(logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'assignRoleToUser', details: { targetUserId: target.id, roleId: 'role-admin-001' } }),
      expect.objectContaining({ action: 'assignPermissionToRole', details: { roleId, permissionId: 'rbac-admin-001' } }),
    ]));
  });

  it('revokes warmed delegation authority on the next request', async () => {
    await request(harness.use(app)).post(`/api/users/${target.id}/roles/${roleId}`).set('Authorization', `Bearer ${delegateToken}`).expect(204);
    await roles.removePermissionFromRole(delegationRoleId, 'rbac-admin-001');
    await request(harness.use(app)).delete(`/api/users/${target.id}/roles/${roleId}`).set('Authorization', `Bearer ${delegateToken}`).expect(403);
    expect((await users.getUserRoles(target.id)).map(role => role.id)).toContain(roleId);
  });

  it('allows audited role and permission management and preserves the self admin-flag restriction', async () => {
    const api = () => request(harness.use(app));
    const header = `Bearer ${delegateToken}`;
    const created = await api().post('/api/roles').set('Authorization', header).send({ name: 'Managed role', description: '' }).expect(201);
    await api().put(`/api/roles/${created.body.id}`).set('Authorization', header).send({ name: 'Renamed role' }).expect(200);
    await api().delete(`/api/roles/${created.body.id}`).set('Authorization', header).expect(204);
    await api().post('/api/permissions').set('Authorization', header).send({ resource: 'custom', action: 'admin', description: '' }).expect(201);
    await api().delete(`/api/groups/${groupId}`).set('Authorization', header).expect(204);
    await api().put(`/api/users/${target.id}/admin-status`).set('Authorization', header).send({ isAdmin: true }).expect(200);
    await api().put(`/api/users/${delegate.id}/admin-status`).set('Authorization', header).send({ isAdmin: true }).expect(403);
    const logs = await new AuditLoggingService(database.getAdapter()).queryLogs({ userId: delegate.id });
    expect(logs.map(log => log.action).sort()).toEqual(['createRole', 'updateRole', 'deleteRole', 'createPermission', 'deleteGroup', 'setAdminStatus'].sort());
  });

  it('accepts group-derived delegation and denies it after membership removal or deactivation', async () => {
    await users.removeRoleFromUser(delegate.id, delegationRoleId);
    await users.addUserToGroup(delegate.id, groupId);
    const path = `/api/users/${target.id}/roles/${roleId}`;
    await request(harness.use(app)).post(path).set('Authorization', `Bearer ${delegateToken}`).expect(204);
    await users.removeUserFromGroup(delegate.id, groupId);
    await request(harness.use(app)).delete(path).set('Authorization', `Bearer ${delegateToken}`).expect(403);
    await users.assignRoleToUser(delegate.id, delegationRoleId);
    await users.deactivateUser(delegate.id);
    await request(harness.use(app)).delete(path).set('Authorization', `Bearer ${delegateToken}`).expect(401);
  });

  it('seeds only Administrator and preserves existing grants', async () => {
    const assignments = await database.getAdapter().query<{ role_id: string }>('SELECT role_id FROM role_permissions WHERE permission_id = ?', ['rbac-admin-001']);
    expect(assignments.map(row => row.role_id).sort()).toEqual([delegationRoleId, 'role-admin-001'].sort());
    expect(await permissions.hasPermission(editor.id, 'users', 'write')).toBe(true);
  });
});
