/**
 * Property-Based Test for EntraIdService — Group-to-Role Synchronization (Property 15)
 *
 * Feature: azure-entra-id-auth, Property 15: Group-to-role synchronization correctness
 *
 * **Validates: Requirements 5.1, 5.2, 5.3**
 *
 * For any group mapping configuration and any groups claim array (with UUIDs
 * in any case), the user SHALL end up with exactly the Pabawi roles whose
 * group IDs are present in both the mapping keys (case-insensitive comparison)
 * and the groups claim, plus any roles that were not part of the mapping
 * (manually assigned). Roles previously assigned by the mapping whose group
 * IDs are no longer in the claim SHALL be revoked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

import { EntraIdService } from '../../src/services/EntraIdService';
import type { DatabaseAdapter } from '../../src/database/DatabaseAdapter';
import type { EntraIdConfig } from '../../src/config/schema';
import type { AuthenticationService } from '../../src/services/AuthenticationService';
import type { UserService } from '../../src/services/UserService';
import type { RoleService } from '../../src/services/RoleService';
import type { Role } from '../../src/services/RoleService';
import type { AuditLoggingService } from '../../src/services/AuditLoggingService';
import type { LoggerService } from '../../src/services/LoggerService';

// --- Mock Factories ---

function createMockDb(): DatabaseAdapter {
  return {
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn().mockResolvedValue(null),
    execute: vi.fn().mockResolvedValue({ changes: 0 }),
    beginTransaction: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue(undefined),
    rollback: vi.fn().mockResolvedValue(undefined),
    withTransaction: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
    getDialect: vi.fn().mockReturnValue('sqlite' as const),
  };
}

function createMockLogger(): LoggerService {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    shouldLog: vi.fn().mockReturnValue(true),
    formatMessage: vi.fn().mockReturnValue(''),
    getLevel: vi.fn().mockReturnValue('info'),
    setLogBuffer: vi.fn(),
    getLogBuffer: vi.fn().mockReturnValue(null),
  } as unknown as LoggerService;
}

function makeRole(id: string, name: string): Role {
  return {
    id,
    name,
    description: `Role: ${name}`,
    isBuiltIn: 0,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

// --- Arbitraries ---

/** Generate a UUID string (lowercase by default from fc.uuid()) */
const uuidArb = fc.uuid();

/** Role name arbitrary */
const roleNameArb = fc.stringMatching(/^[a-z][a-z0-9_]{2,15}$/);

/**
 * Generates a complete test scenario for group-to-role sync:
 * - A set of available Pabawi roles (with unique names and IDs)
 * - A group mapping: groupId → roleName (referencing some of the available roles, and possibly some non-existent ones)
 * - A groups claim: list of group UUIDs (some matching mapping keys, some not) in random case
 * - Existing user roles: some from the mapping, some manual (not in mapping)
 */
interface SyncScenario {
  /** All roles that exist in Pabawi */
  availableRoles: Role[];
  /** The group mapping config: groupId → roleName */
  groupMapping: Record<string, string>;
  /** The groups claim from the ID token (UUIDs in mixed case) */
  groupsClaim: string[];
  /** Roles currently assigned to the user */
  existingUserRoles: Role[];
  /** Expected final role set (role IDs) after sync */
  expectedFinalRoleIds: Set<string>;
}

const syncScenarioArb: fc.Arbitrary<SyncScenario> = fc.tuple(
  // Generate 2–8 available roles
  fc.integer({ min: 2, max: 8 }),
  // Generate 1–6 mapping entries
  fc.integer({ min: 1, max: 6 }),
  // Seed for randomizing which mapping entries have valid roles
  fc.infiniteStream(fc.boolean()),
  // Seed for randomizing which groups appear in claim
  fc.infiniteStream(fc.boolean()),
  // Seed for randomizing which mapped roles user currently has
  fc.infiniteStream(fc.boolean()),
  // Seed for randomizing which non-mapped roles user currently has
  fc.infiniteStream(fc.boolean()),
  // UUIDs for group IDs
  fc.array(uuidArb, { minLength: 8, maxLength: 14 }),
  // Role names
  fc.array(roleNameArb, { minLength: 10, maxLength: 14 }),
  // Booleans for case randomization
  fc.infiniteStream(fc.boolean()),
).map(([
  numRoles,
  numMappings,
  validRoleStream,
  groupInClaimStream,
  userHasMappedRoleStream,
  userHasManualRoleStream,
  uuids,
  roleNames,
  caseStream,
]) => {
  // Deduplicate role names
  const uniqueRoleNames = [...new Set(roleNames)].slice(0, numRoles);
  if (uniqueRoleNames.length < 2) {
    uniqueRoleNames.push('fallback_role_a', 'fallback_role_b');
  }

  // Create available roles
  const availableRoles: Role[] = uniqueRoleNames.map((name, i) =>
    makeRole(`role-id-${String(i)}`, name),
  );

  // Create group mapping
  const groupMapping: Record<string, string> = {};
  const mappingGroupIds: string[] = [];
  const validRoleIterator = validRoleStream[Symbol.iterator]();
  const actualNumMappings = Math.min(numMappings, uuids.length);

  for (let i = 0; i < actualNumMappings; i++) {
    const groupId = uuids[i];
    const useValidRole = validRoleIterator.next().value;
    if (useValidRole && availableRoles.length > 0) {
      // Map to an existing role
      const roleIdx = i % availableRoles.length;
      groupMapping[groupId] = availableRoles[roleIdx].name;
    } else {
      // Map to a non-existent role (should be skipped with warning)
      groupMapping[groupId] = `nonexistent_role_${String(i)}`;
    }
    mappingGroupIds.push(groupId);
  }

  // Create groups claim — include some mapping group IDs (with random case) and some extra
  const groupsClaim: string[] = [];
  const groupInClaimIterator = groupInClaimStream[Symbol.iterator]();
  const caseIterator = caseStream[Symbol.iterator]();

  for (const gid of mappingGroupIds) {
    const includeInClaim = groupInClaimIterator.next().value;
    if (includeInClaim) {
      // Apply random case to the group ID
      const casedGid = gid.split('').map((ch) => {
        const upper = caseIterator.next().value;
        return upper ? ch.toUpperCase() : ch.toLowerCase();
      }).join('');
      groupsClaim.push(casedGid);
    }
  }
  // Add some extra UUIDs not in the mapping
  for (let i = actualNumMappings; i < uuids.length && i < actualNumMappings + 3; i++) {
    groupsClaim.push(uuids[i]);
  }

  // Determine which role IDs are managed by the mapping (only valid ones)
  const rolesByNameLower = new Map(availableRoles.map((r) => [r.name.toLowerCase(), r]));
  const managedRoleIds = new Set<string>();
  const shouldHaveRoleIds = new Set<string>();
  const normalizedClaim = new Set(groupsClaim.map((g) => g.toLowerCase()));

  for (const [groupId, roleName] of Object.entries(groupMapping)) {
    const role = rolesByNameLower.get(roleName.toLowerCase());
    if (!role) continue; // Non-existent role, skipped
    managedRoleIds.add(role.id);
    if (normalizedClaim.has(groupId.toLowerCase())) {
      shouldHaveRoleIds.add(role.id);
    }
  }

  // Create existing user roles — mix of mapped and manual
  const existingUserRoles: Role[] = [];
  const userHasMappedIterator = userHasMappedRoleStream[Symbol.iterator]();
  const userHasManualIterator = userHasManualRoleStream[Symbol.iterator]();

  // Add some mapped roles (simulates previously synced roles)
  for (const roleId of managedRoleIds) {
    if (userHasMappedIterator.next().value) {
      const role = availableRoles.find((r) => r.id === roleId);
      if (role) existingUserRoles.push(role);
    }
  }

  // Add some manual roles (not in the mapping)
  for (const role of availableRoles) {
    if (!managedRoleIds.has(role.id) && userHasManualIterator.next().value) {
      existingUserRoles.push(role);
    }
  }

  // Compute expected final role set:
  // = (manual roles not managed by mapping) ∪ (mapped roles the user should have)
  const manualRoleIds = new Set(
    existingUserRoles
      .filter((r) => !managedRoleIds.has(r.id))
      .map((r) => r.id),
  );

  const expectedFinalRoleIds = new Set([...manualRoleIds, ...shouldHaveRoleIds]);

  return {
    availableRoles,
    groupMapping,
    groupsClaim,
    existingUserRoles,
    expectedFinalRoleIds,
  };
});

describe('EntraIdService — Group-to-Role Sync Property', () => {
  let db: DatabaseAdapter;
  let logger: LoggerService;

  beforeEach(() => {
    vi.restoreAllMocks();
    db = createMockDb();
    logger = createMockLogger();
  });

  // Feature: azure-entra-id-auth, Property 15: Group-to-role synchronization correctness
  /**
   * Property 15: Group-to-role synchronization correctness
   *
   * **Validates: Requirements 5.1, 5.2, 5.3**
   *
   * For any group mapping configuration and any groups claim array (with UUIDs
   * in any case), the user SHALL end up with exactly the Pabawi roles whose
   * group IDs are present in both the mapping keys (case-insensitive comparison)
   * and the groups claim, plus any roles that were not part of the mapping
   * (manually assigned). Roles previously assigned by the mapping whose group
   * IDs are no longer in the claim SHALL be revoked.
   */
  describe('Property 15: Group-to-role synchronization correctness', () => {
    it('after sync, user roles = (manual roles not in mapping) ∪ (mapped roles for matching groups)', async () => {
      await fc.assert(
        fc.asyncProperty(
          syncScenarioArb,
          async (scenario) => {
            const { availableRoles, groupMapping, groupsClaim, existingUserRoles, expectedFinalRoleIds } = scenario;

            // Track role mutations
            const assignedRoleIds = new Set<string>();
            const removedRoleIds = new Set<string>();

            const mockUserService = {
              getUserRoles: vi.fn().mockResolvedValue(existingUserRoles),
              assignRoleToUser: vi.fn().mockImplementation((_userId: string, roleId: string) => {
                assignedRoleIds.add(roleId);
                return Promise.resolve();
              }),
              removeRoleFromUser: vi.fn().mockImplementation((_userId: string, roleId: string) => {
                removedRoleIds.add(roleId);
                return Promise.resolve();
              }),
            } as unknown as UserService;

            const mockRoleService = {
              listRoles: vi.fn().mockResolvedValue({
                items: availableRoles,
                total: availableRoles.length,
              }),
            } as unknown as RoleService;

            const config: EntraIdConfig = {
              enabled: true,
              tenantId: 'test-tenant',
              clientId: 'test-client',
              clientSecret: 'test-secret', // pragma: allowlist secret
              redirectUri: 'http://localhost:3000/callback',
              scopes: ['openid', 'profile', 'email'],
              groupMapping,
              jwksCacheTtlMs: 86400000,
            };

            const service = new EntraIdService(
              db,
              config,
              {} as AuthenticationService,
              mockUserService,
              mockRoleService,
              {} as AuditLoggingService,
              logger,
            );

            const userId = 'test-user-id';
            await service.syncGroupRoles(userId, groupsClaim);

            // Compute actual final role set by applying mutations to existing roles
            const existingRoleIds = new Set(existingUserRoles.map((r) => r.id));
            const finalRoleIds = new Set<string>();

            // Start with existing roles
            for (const id of existingRoleIds) {
              if (!removedRoleIds.has(id)) {
                finalRoleIds.add(id);
              }
            }
            // Add newly assigned roles
            for (const id of assignedRoleIds) {
              finalRoleIds.add(id);
            }

            // Assert final role set matches expected
            expect(finalRoleIds).toEqual(expectedFinalRoleIds);
          },
        ),
        { numRuns: 100 },
      );
    });

    it('does not assign roles the user already has', async () => {
      await fc.assert(
        fc.asyncProperty(
          syncScenarioArb,
          async (scenario) => {
            const { availableRoles, groupMapping, groupsClaim, existingUserRoles } = scenario;

            const assignCalls: Array<{ userId: string; roleId: string }> = [];

            const mockUserService = {
              getUserRoles: vi.fn().mockResolvedValue(existingUserRoles),
              assignRoleToUser: vi.fn().mockImplementation((userId: string, roleId: string) => {
                assignCalls.push({ userId, roleId });
                return Promise.resolve();
              }),
              removeRoleFromUser: vi.fn().mockResolvedValue(undefined),
            } as unknown as UserService;

            const mockRoleService = {
              listRoles: vi.fn().mockResolvedValue({
                items: availableRoles,
                total: availableRoles.length,
              }),
            } as unknown as RoleService;

            const config: EntraIdConfig = {
              enabled: true,
              tenantId: 'test-tenant',
              clientId: 'test-client',
              clientSecret: 'test-secret', // pragma: allowlist secret
              redirectUri: 'http://localhost:3000/callback',
              scopes: ['openid', 'profile', 'email'],
              groupMapping,
              jwksCacheTtlMs: 86400000,
            };

            const service = new EntraIdService(
              db,
              config,
              {} as AuthenticationService,
              mockUserService,
              mockRoleService,
              {} as AuditLoggingService,
              logger,
            );

            await service.syncGroupRoles('test-user-id', groupsClaim);

            // No assign call should be for a role the user already has
            const existingRoleIds = new Set(existingUserRoles.map((r) => r.id));
            for (const call of assignCalls) {
              expect(existingRoleIds.has(call.roleId)).toBe(false);
            }
          },
        ),
        { numRuns: 100 },
      );
    });

    it('does not remove roles that are not managed by the mapping', async () => {
      await fc.assert(
        fc.asyncProperty(
          syncScenarioArb,
          async (scenario) => {
            const { availableRoles, groupMapping, groupsClaim, existingUserRoles } = scenario;

            const removeCalls: Array<{ userId: string; roleId: string }> = [];

            const mockUserService = {
              getUserRoles: vi.fn().mockResolvedValue(existingUserRoles),
              assignRoleToUser: vi.fn().mockResolvedValue(undefined),
              removeRoleFromUser: vi.fn().mockImplementation((userId: string, roleId: string) => {
                removeCalls.push({ userId, roleId });
                return Promise.resolve();
              }),
            } as unknown as UserService;

            const mockRoleService = {
              listRoles: vi.fn().mockResolvedValue({
                items: availableRoles,
                total: availableRoles.length,
              }),
            } as unknown as RoleService;

            const config: EntraIdConfig = {
              enabled: true,
              tenantId: 'test-tenant',
              clientId: 'test-client',
              clientSecret: 'test-secret', // pragma: allowlist secret
              redirectUri: 'http://localhost:3000/callback',
              scopes: ['openid', 'profile', 'email'],
              groupMapping,
              jwksCacheTtlMs: 86400000,
            };

            const service = new EntraIdService(
              db,
              config,
              {} as AuthenticationService,
              mockUserService,
              mockRoleService,
              {} as AuditLoggingService,
              logger,
            );

            await service.syncGroupRoles('test-user-id', groupsClaim);

            // Determine which role IDs are managed by the mapping
            const rolesByNameLower = new Map(availableRoles.map((r) => [r.name.toLowerCase(), r]));
            const managedRoleIds = new Set<string>();
            for (const roleName of Object.values(groupMapping)) {
              const role = rolesByNameLower.get(roleName.toLowerCase());
              if (role) managedRoleIds.add(role.id);
            }

            // Every removed role must be a managed role
            for (const call of removeCalls) {
              expect(managedRoleIds.has(call.roleId)).toBe(true);
            }
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
