import { randomUUID } from 'crypto';
import type { UserService } from '../services/UserService';
import type { RoleService } from '../services/RoleService';
import type { PermissionService } from '../services/PermissionService';
import type { LoggerService } from '../services/LoggerService';

const MCP_USERNAME = 'mcp-service';
const MCP_ROLE_NAME = 'MCP Service';
const LOG_COMPONENT = 'McpServiceUser';

export interface McpServiceUserResult {
  userId: string;
  roleId: string;
}

/**
 * Idempotent provisioning of the mcp-service user at startup.
 *
 * If the user already exists, looks up the existing role and returns IDs.
 * If not, creates the user, an "MCP Service" built-in role with all read
 * permissions, and assigns the role to the user.
 */
export async function provisionMcpServiceUser(
  userService: UserService,
  roleService: RoleService,
  permissionService: PermissionService,
  logger: LoggerService,
): Promise<McpServiceUserResult> {
  const existing = await userService.getUserByUsername(MCP_USERNAME);

  if (existing) {
    logger.info('MCP service user already exists, reusing', {
      component: LOG_COMPONENT,
      operation: 'provisionMcpServiceUser',
    });

    const roles = await userService.getUserRoles(existing.id);
    const mcpRole = roles.find((r) => r.name === MCP_ROLE_NAME);

    if (!mcpRole) {
      throw new Error('MCP service user exists but MCP Service role not found');
    }

    return { userId: existing.id, roleId: mcpRole.id };
  }

  logger.info('Provisioning MCP service user', {
    component: LOG_COMPONENT,
    operation: 'provisionMcpServiceUser',
  });

  // Create user with random password (never used for login)
  const password = randomUUID(); // pragma: allowlist secret
  const user = await userService.createUser({
    username: MCP_USERNAME,
    email: `${MCP_USERNAME}@localhost`,
    password,
    firstName: 'MCP',
    lastName: 'Service',
    isActive: true,
    isAdmin: false,
  });

  // Create built-in role
  const role = await roleService.createRole({
    name: MCP_ROLE_NAME,
    description: 'Built-in role for MCP server with read-only access',
    isBuiltIn: true,
  });

  // Assign all read permissions to the role
  const readPermissions = await permissionService.listPermissions({
    action: 'read',
    limit: 1000,
  });

  for (const perm of readPermissions.items) {
    await roleService.assignPermissionToRole(role.id, perm.id);
  }

  // Assign role to user
  await userService.assignRoleToUser(user.id, role.id);

  logger.info('MCP service user provisioned successfully', {
    component: LOG_COMPONENT,
    operation: 'provisionMcpServiceUser',
    metadata: { userId: user.id, roleId: role.id },
  });

  return { userId: user.id, roleId: role.id };
}
