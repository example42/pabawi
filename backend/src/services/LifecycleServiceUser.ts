import { randomUUID } from 'crypto';
import type { UserService } from './UserService';
import type { RoleService } from './RoleService';
import type { PermissionService } from './PermissionService';
import type { LoggerService } from './LoggerService';
import { LIFECYCLE_PROVIDERS } from '../routes/lifecycleActionPolicy';

const LIFECYCLE_USERNAME = 'lifecycle-service';
const LIFECYCLE_ROLE_NAME = 'Lifecycle Service';
const LOG_COMPONENT = 'LifecycleServiceUser';

/**
 * Actions the machine credential holds on every lifecycle provider.
 *
 * `PABAWI_LIFECYCLE_TOKEN` exists for unattended clients driving
 * `POST /api/inventory/:id/action` and `DELETE /api/inventory/:id`, so the
 * scope is read, state transitions and destruction. Provisioning is not
 * included: creating a guest through a route addressed by an existing node ID
 * is not a flow, and an operator who wants it can grant
 * `<provider>:provision` to the role.
 */
const LIFECYCLE_ROLE_ACTIONS = ['read', 'lifecycle', 'destroy'] as const;

export interface LifecycleServiceUserResult {
  userId: string;
  roleId: string;
}

/**
 * Idempotent provisioning of the lifecycle-service user at startup.
 *
 * Mirrors the mcp-service account: the static token authenticates to a real
 * account holding real grants, so `PermissionService` stays the only
 * authorization authority and the machine principal appears in audit and
 * journal records like any other caller.
 *
 * Only called when a lifecycle token is configured. An existing account is
 * reused as it stands, so grants an operator has added or removed survive
 * restarts.
 */
export async function provisionLifecycleServiceUser(
  userService: UserService,
  roleService: RoleService,
  permissionService: PermissionService,
  logger: LoggerService,
): Promise<LifecycleServiceUserResult> {
  const existing = await userService.getUserByUsername(LIFECYCLE_USERNAME);

  if (existing) {
    logger.info('Lifecycle service user already exists, reusing', {
      component: LOG_COMPONENT,
      operation: 'provisionLifecycleServiceUser',
    });

    const roles = await userService.getUserRoles(existing.id);
    const lifecycleRole = roles.find((r) => r.name === LIFECYCLE_ROLE_NAME);

    if (!lifecycleRole) {
      throw new Error('Lifecycle service user exists but Lifecycle Service role not found');
    }

    return { userId: existing.id, roleId: lifecycleRole.id };
  }

  logger.info('Provisioning lifecycle service user', {
    component: LOG_COMPONENT,
    operation: 'provisionLifecycleServiceUser',
  });

  // Created with a random password: the account is never used for login.
  const password = `Lifecycle!${randomUUID()}`; // pragma: allowlist secret
  const user = await userService.createUser({
    username: LIFECYCLE_USERNAME,
    email: `${LIFECYCLE_USERNAME}@localhost`,
    password,
    firstName: 'Lifecycle',
    lastName: 'Service',
    isActive: true,
    isAdmin: false,
  });

  // createUser() attaches the configured default role (Viewer out of the box).
  // The machine credential holds exactly the scope documented for it, so drop
  // anything that arrived with the account before granting its own role.
  for (const inherited of await userService.getUserRoles(user.id)) {
    await userService.removeRoleFromUser(user.id, inherited.id);
  }

  const role = await roleService.createRole({
    name: LIFECYCLE_ROLE_NAME,
    description: 'Built-in role for the PABAWI_LIFECYCLE_TOKEN machine credential',
    isBuiltIn: true,
  });

  for (const resource of LIFECYCLE_PROVIDERS) {
    const permissions = await permissionService.listPermissions({ resource, limit: 100 });
    for (const permission of permissions.items) {
      if ((LIFECYCLE_ROLE_ACTIONS as readonly string[]).includes(permission.action)) {
        await roleService.assignPermissionToRole(role.id, permission.id);
      }
    }
  }

  await userService.assignRoleToUser(user.id, role.id);

  logger.info('Lifecycle service user provisioned successfully', {
    component: LOG_COMPONENT,
    operation: 'provisionLifecycleServiceUser',
    metadata: { userId: user.id, roleId: role.id },
  });

  return { userId: user.id, roleId: role.id };
}
