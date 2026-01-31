/**
 * Authorization Service - RBAC Permission Checking
 *
 * Part of v1.0.0 Modular Plugin Architecture (Phase 2, Step 8)
 *
 * Provides capability-based permission checking with role resolution,
 * permission caching, and conditional permission evaluation.
 */

import type { DatabaseAdapter } from "../database/interfaces/DatabaseInterface.js";
import type {
  User,
  Role,
  Permission,
  PermissionAction,
  PermissionCondition,
  PermissionCheckResult,
  EffectivePermissions,
  RoleRow,
  PermissionRow,
  GroupRoleRow,
} from "./types.js";
import { RoleService } from "./RoleService.js";
import { LoggerService } from "../services/LoggerService.js";

/**
 * Execution context for conditional permission checks
 */
export interface ExecutionContext {
  /** Target node name/certname */
  node?: string;
  /** Node environment */
  environment?: string;
  /** Node role/classification */
  nodeRole?: string;
  /** Client IP address */
  clientIp?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Widget access check result
 */
export interface WidgetAccessResult {
  /** Whether access is allowed */
  allowed: boolean;
  /** Required capabilities for this widget */
  requiredCapabilities: string[];
  /** Missing capabilities (if denied) */
  missingCapabilities: string[];
}

/**
 * Cached permissions entry
 */
interface CachedPermissions {
  permissions: EffectivePermissions;
  expiresAt: number;
}

/**
 * Authorization service configuration
 */
export interface AuthorizationServiceConfig {
  /** Cache TTL in milliseconds (default: 300000 = 5 minutes) */
  cacheTtl?: number;
  /** Enable permission caching (default: true) */
  enableCache?: boolean;
}

const DEFAULT_CONFIG: Required<AuthorizationServiceConfig> = {
  cacheTtl: 300000, // 5 minutes
  enableCache: true,
};

/**
 * Service for RBAC-based authorization
 */
export class AuthorizationService {
  private logger: LoggerService;
  private config: Required<AuthorizationServiceConfig>;
  private roleService: RoleService;
  private permissionCache = new Map<string, CachedPermissions>();

  constructor(
    private db: DatabaseAdapter,
    config: AuthorizationServiceConfig = {}
  ) {
    this.logger = new LoggerService();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.roleService = new RoleService(db);
  }

  /**
   * Check if a user has permission to perform a capability
   *
   * @param user - User to check
   * @param capability - Capability name (e.g., 'command.execute')
   * @param context - Optional execution context for conditional checks
   * @returns Permission check result
   */
  async checkPermission(
    user: User,
    capability: string,
    context?: ExecutionContext
  ): Promise<PermissionCheckResult> {
    this.logger.debug("Checking permission", {
      component: "AuthorizationService",
      operation: "checkPermission",
      metadata: { userId: user.id, capability, context },
    });

    // Get effective permissions
    const effectivePermissions = await this.getEffectivePermissions(user);

    // Check for explicit deny first (deny takes precedence)
    for (const permission of effectivePermissions.permissions) {
      if (permission.action === "deny" && this.matchesCapability(permission.capability, capability)) {
        // Check conditions if present
        if (permission.conditions && context) {
          if (!this.evaluateConditions(permission.conditions, context)) {
            continue; // Conditions not met, skip this deny rule
          }
        }

        this.logger.debug("Permission denied by explicit deny rule", {
          component: "AuthorizationService",
          operation: "checkPermission",
          metadata: { userId: user.id, capability, matchedPattern: permission.capability },
        });

        return {
          allowed: false,
          reason: `Denied by explicit deny rule for '${permission.capability}'`,
          matchedPermission: permission,
        };
      }
    }

    // Check for allow rules
    for (const permission of effectivePermissions.permissions) {
      if (permission.action === "allow" && this.matchesCapability(permission.capability, capability)) {
        // Check conditions if present
        if (permission.conditions && context) {
          if (!this.evaluateConditions(permission.conditions, context)) {
            continue; // Conditions not met, skip this allow rule
          }
        }

        this.logger.debug("Permission granted", {
          component: "AuthorizationService",
          operation: "checkPermission",
          metadata: { userId: user.id, capability, matchedPattern: permission.capability },
        });

        return {
          allowed: true,
          reason: `Allowed by rule for '${permission.capability}'`,
          matchedPermission: permission,
        };
      }
    }

    // No matching rule found - deny by default
    this.logger.debug("Permission denied: no matching rule", {
      component: "AuthorizationService",
      operation: "checkPermission",
      metadata: { userId: user.id, capability },
    });

    return {
      allowed: false,
      reason: "No matching permission rule found",
    };
  }

  /**
   * Get all effective permissions for a user
   * (from direct roles and group roles)
   *
   * @param user - User to get permissions for
   * @returns Effective permissions
   */
  async getEffectivePermissions(user: User): Promise<EffectivePermissions> {
    // Check cache first
    if (this.config.enableCache) {
      const cached = this.permissionCache.get(user.id);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.permissions;
      }
    }

    // Get all role IDs (direct + from groups)
    const roleIds = await this.getEffectiveRoleIds(user);

    // Get all permissions from these roles
    const allPermissions: Permission[] = [];
    const roleNamesSet = new Set<string>();

    for (const roleId of roleIds) {
      const role = await this.roleService.getRoleById(roleId);
      if (role) {
        roleNamesSet.add(role.name);
        allPermissions.push(...role.permissions);
      }
    }

    // Sort permissions by specificity and action (deny first)
    const sortedPermissions = this.sortPermissions(allPermissions);

    // Build allowed/denied capability lists
    const allowedCapabilities = new Set<string>();
    const deniedCapabilities = new Set<string>();

    for (const perm of sortedPermissions) {
      if (perm.action === "allow") {
        allowedCapabilities.add(perm.capability);
      } else {
        deniedCapabilities.add(perm.capability);
      }
    }

    const effectivePermissions: EffectivePermissions = {
      userId: user.id,
      permissions: sortedPermissions,
      allowedCapabilities: Array.from(allowedCapabilities),
      deniedCapabilities: Array.from(deniedCapabilities),
      sourceRoles: Array.from(roleNamesSet),
    };

    // Update cache
    if (this.config.enableCache) {
      this.permissionCache.set(user.id, {
        permissions: effectivePermissions,
        expiresAt: Date.now() + this.config.cacheTtl,
      });
    }

    return effectivePermissions;
  }

  /**
   * Get all effective role IDs for a user
   * (direct roles + roles from groups)
   *
   * @param user - User to get roles for
   * @returns Array of role IDs
   */
  private async getEffectiveRoleIds(user: User): Promise<string[]> {
    const roleIds = new Set<string>(user.roles);

    // Get roles from groups
    for (const groupId of user.groups) {
      const groupRoles = await this.db.query<GroupRoleRow>(
        "SELECT role_id FROM group_roles WHERE group_id = ?",
        [groupId]
      );
      for (const gr of groupRoles) {
        roleIds.add(gr.role_id);
      }
    }

    return Array.from(roleIds);
  }

  /**
   * Check if user has access to a widget based on its required capabilities
   *
   * @param user - User to check
   * @param requiredCapabilities - Capabilities required by the widget
   * @returns Widget access result
   */
  async checkWidgetAccess(
    user: User,
    requiredCapabilities: string[]
  ): Promise<WidgetAccessResult> {
    if (requiredCapabilities.length === 0) {
      return {
        allowed: true,
        requiredCapabilities: [],
        missingCapabilities: [],
      };
    }

    const missingCapabilities: string[] = [];

    for (const capability of requiredCapabilities) {
      const result = await this.checkPermission(user, capability);
      if (!result.allowed) {
        missingCapabilities.push(capability);
      }
    }

    return {
      allowed: missingCapabilities.length === 0,
      requiredCapabilities,
      missingCapabilities,
    };
  }

  /**
   * Filter capabilities by user permissions
   *
   * @param capabilities - List of capability objects with 'name' property
   * @param user - User to filter for
   * @returns Filtered capabilities
   */
  async filterCapabilitiesByPermissions<T extends { name: string }>(
    capabilities: T[],
    user: User
  ): Promise<T[]> {
    const allowed: T[] = [];

    for (const cap of capabilities) {
      const result = await this.checkPermission(user, cap.name);
      if (result.allowed) {
        allowed.push(cap);
      }
    }

    return allowed;
  }

  /**
   * Invalidate cached permissions for a user
   *
   * @param userId - User ID to invalidate
   */
  invalidateCache(userId: string): void {
    this.permissionCache.delete(userId);
    this.logger.debug("Permission cache invalidated", {
      component: "AuthorizationService",
      operation: "invalidateCache",
      metadata: { userId },
    });
  }

  /**
   * Invalidate all cached permissions
   */
  invalidateAllCaches(): void {
    this.permissionCache.clear();
    this.logger.debug("All permission caches invalidated", {
      component: "AuthorizationService",
      operation: "invalidateAllCaches",
    });
  }

  /**
   * Check if a capability pattern matches a specific capability
   *
   * Patterns:
   * - '*' matches everything
   * - 'category.*' matches all capabilities in that category
   * - 'category.action' matches exactly
   *
   * @param pattern - Permission pattern
   * @param capability - Specific capability to check
   * @returns True if pattern matches capability
   */
  private matchesCapability(pattern: string, capability: string): boolean {
    // Wildcard matches everything
    if (pattern === "*") {
      return true;
    }

    // Exact match
    if (pattern === capability) {
      return true;
    }

    // Category wildcard (e.g., 'inventory.*' matches 'inventory.list')
    if (pattern.endsWith(".*")) {
      const category = pattern.slice(0, -2);
      return capability.startsWith(category + ".");
    }

    // Prefix match with wildcard (e.g., 'command.*' matches 'command.execute.dangerous')
    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      return capability.startsWith(prefix);
    }

    return false;
  }

  /**
   * Evaluate permission conditions against execution context
   *
   * @param conditions - Permission conditions
   * @param context - Execution context
   * @returns True if conditions are met
   */
  private evaluateConditions(
    conditions: PermissionCondition,
    context: ExecutionContext
  ): boolean {
    // Check node filter
    if (conditions.nodeFilter && context.node) {
      if (!this.evaluateNodeFilter(conditions.nodeFilter, context)) {
        return false;
      }
    }

    // Check time window
    if (conditions.timeWindow) {
      if (!this.evaluateTimeWindow(conditions.timeWindow)) {
        return false;
      }
    }

    // Check IP restriction
    if (conditions.ipRestriction && context.clientIp) {
      if (!this.evaluateIpRestriction(conditions.ipRestriction, context.clientIp)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a node filter expression
   *
   * Supports:
   * - 'environment=production' - exact match
   * - 'role=webserver' - exact match
   * - 'name~web*' - pattern match
   *
   * @param filter - Node filter expression
   * @param context - Execution context
   * @returns True if filter matches
   */
  private evaluateNodeFilter(filter: string, context: ExecutionContext): boolean {
    const parts = filter.split(/([=~])/);
    if (parts.length < 3) {
      return true; // Invalid filter, allow
    }

    const [field, operator, value] = [parts[0], parts[1], parts.slice(2).join("")];

    let contextValue: string | undefined;
    switch (field.toLowerCase()) {
      case "environment":
        contextValue = context.environment;
        break;
      case "role":
        contextValue = context.nodeRole;
        break;
      case "name":
      case "node":
        contextValue = context.node;
        break;
      default:
        // Check in metadata
        contextValue = context.metadata?.[field] as string | undefined;
    }

    if (!contextValue) {
      return false;
    }

    if (operator === "=") {
      return contextValue === value;
    }

    if (operator === "~") {
      // Pattern match (simple glob)
      const regex = new RegExp("^" + value.replace(/\*/g, ".*").replace(/\?/g, ".") + "$");
      return regex.test(contextValue);
    }

    return true;
  }

  /**
   * Evaluate a time window restriction
   *
   * Supports:
   * - 'weekdays:09:00-17:00' - weekdays within time range
   * - 'always' - no restriction
   *
   * @param timeWindow - Time window expression
   * @returns True if current time is within window
   */
  private evaluateTimeWindow(timeWindow: string): boolean {
    if (timeWindow === "always") {
      return true;
    }

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
    const currentTime = now.getHours() * 60 + now.getMinutes();

    if (timeWindow.startsWith("weekdays:")) {
      // Check if it's a weekday (Monday-Friday)
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return false;
      }

      // Parse time range
      const timeRange = timeWindow.slice(9); // Remove 'weekdays:'
      return this.isWithinTimeRange(currentTime, timeRange);
    }

    if (timeWindow.startsWith("weekend:")) {
      if (dayOfWeek > 0 && dayOfWeek < 6) {
        return false;
      }
      const timeRange = timeWindow.slice(8);
      return this.isWithinTimeRange(currentTime, timeRange);
    }

    // Just a time range, any day
    if (timeWindow.includes("-")) {
      return this.isWithinTimeRange(currentTime, timeWindow);
    }

    return true;
  }

  /**
   * Check if current time (in minutes) is within a time range
   *
   * @param currentMinutes - Current time in minutes from midnight
   * @param range - Time range string (e.g., '09:00-17:00')
   * @returns True if within range
   */
  private isWithinTimeRange(currentMinutes: number, range: string): boolean {
    const [start, end] = range.split("-");
    if (!start || !end) return true;

    const parseTime = (time: string): number => {
      const [hours, minutes] = time.split(":").map(Number);
      return (hours || 0) * 60 + (minutes || 0);
    };

    const startMinutes = parseTime(start);
    const endMinutes = parseTime(end);

    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  }

  /**
   * Evaluate IP address restrictions
   *
   * @param allowedIps - List of allowed IP addresses or CIDR ranges
   * @param clientIp - Client IP address
   * @returns True if client IP is allowed
   */
  private evaluateIpRestriction(allowedIps: string[], clientIp: string): boolean {
    for (const allowed of allowedIps) {
      if (allowed === clientIp) {
        return true;
      }

      // Simple CIDR check (IPv4 only for now)
      if (allowed.includes("/")) {
        if (this.ipInCidr(clientIp, allowed)) {
          return true;
        }
      }

      // Wildcard match (e.g., '192.168.*.*')
      if (allowed.includes("*")) {
        const regex = new RegExp(
          "^" + allowed.replace(/\./g, "\\.").replace(/\*/g, "\\d+") + "$"
        );
        if (regex.test(clientIp)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if an IP address is within a CIDR range
   *
   * @param ip - IP address to check
   * @param cidr - CIDR range (e.g., '192.168.1.0/24')
   * @returns True if IP is in range
   */
  private ipInCidr(ip: string, cidr: string): boolean {
    const [range, bits] = cidr.split("/");
    if (!range || !bits) return false;

    const ipToNumber = (ipStr: string): number => {
      return ipStr.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
    };

    const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1) >>> 0;
    const ipNum = ipToNumber(ip);
    const rangeNum = ipToNumber(range);

    return (ipNum & mask) === (rangeNum & mask);
  }

  /**
   * Sort permissions by specificity (more specific first) and action (deny before allow)
   *
   * @param permissions - Permissions to sort
   * @returns Sorted permissions
   */
  private sortPermissions(permissions: Permission[]): Permission[] {
    return [...permissions].sort((a, b) => {
      // Deny always comes first
      if (a.action !== b.action) {
        return a.action === "deny" ? -1 : 1;
      }

      // More specific patterns first
      const specificityA = this.getPatternSpecificity(a.capability);
      const specificityB = this.getPatternSpecificity(b.capability);
      return specificityB - specificityA;
    });
  }

  /**
   * Calculate pattern specificity (higher = more specific)
   *
   * @param pattern - Capability pattern
   * @returns Specificity score
   */
  private getPatternSpecificity(pattern: string): number {
    if (pattern === "*") return 0;
    if (pattern.endsWith(".*")) return 1;
    if (pattern.endsWith("*")) return 2;
    return 3; // Exact match
  }
}

/**
 * Authorization-specific error class
 */
export class AuthorizationError extends Error {
  public readonly statusCode = 403;
  public readonly code = "AUTHORIZATION_ERROR";

  constructor(
    message: string,
    public readonly capability?: string
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}
