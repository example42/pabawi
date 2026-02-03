/**
 * Setup Service - First Run Admin User Creation
 *
 * Part of v1.0.0 Modular Plugin Architecture
 *
 * Provides functionality to check if the system needs initial setup
 * (no users exist) and to create the first admin user without requiring
 * authentication.
 */

import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import type { DatabaseAdapter } from "../database/interfaces/DatabaseInterface.js";
import { RoleService } from "./RoleService.js";
import { LoggerService } from "../services/LoggerService.js";

/**
 * Setup status response
 */
export interface SetupStatus {
  /** Whether setup is required (no users exist) */
  setupRequired: boolean;
  /** Whether the system has been initialized */
  initialized: boolean;
  /** Number of users in the system */
  userCount: number;
  /** Whether default roles exist */
  hasDefaultRoles: boolean;
}

/**
 * Initial admin user input
 */
export interface InitialAdminInput {
  /** Admin username */
  username: string;
  /** Admin email */
  email: string;
  /** Admin password */
  password: string;
  /** Display name (optional) */
  displayName?: string;
}

/**
 * Password validation result
 */
export interface PasswordValidation {
  /** Whether the password is valid */
  valid: boolean;
  /** Validation errors */
  errors: string[];
}

/**
 * Password policy configuration
 */
export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
}

/**
 * Default password policy
 */
const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
};

/**
 * Number of salt rounds for bcrypt
 */
const BCRYPT_SALT_ROUNDS = 12;

/**
 * Service for first-run setup operations
 */
export class SetupService {
  private logger: LoggerService;
  private roleService: RoleService;
  private passwordPolicy: PasswordPolicy;

  constructor(
    private db: DatabaseAdapter,
    passwordPolicy?: Partial<PasswordPolicy>
  ) {
    this.logger = new LoggerService();
    this.roleService = new RoleService(db);
    this.passwordPolicy = {
      ...DEFAULT_PASSWORD_POLICY,
      ...passwordPolicy,
    };
  }

  /**
   * Check if initial setup is required
   */
  async getSetupStatus(): Promise<SetupStatus> {
    this.logger.info("Checking setup status", {
      component: "SetupService",
      operation: "getSetupStatus",
    });

    try {
      // Count users
      const userCountResult = await this.db.queryOne<{ count: number }>(
        "SELECT COUNT(*) as count FROM users"
      );
      const userCount = userCountResult?.count ?? 0;

      // Check if admin role exists
      const adminRole = await this.db.queryOne<{ id: string }>(
        "SELECT id FROM roles WHERE name = ?",
        ["admin"]
      );

      const status: SetupStatus = {
        setupRequired: userCount === 0,
        initialized: userCount > 0,
        userCount,
        hasDefaultRoles: !!adminRole,
      };

      this.logger.info("Setup status retrieved", {
        component: "SetupService",
        operation: "getSetupStatus",
        metadata: status as unknown as Record<string, unknown>,
      });

      return status;
    } catch (error) {
      // Tables might not exist yet
      this.logger.warn("Failed to get setup status, tables may not exist", {
        component: "SetupService",
        operation: "getSetupStatus",
        metadata: { error: error instanceof Error ? error.message : String(error) },
      });

      return {
        setupRequired: true,
        initialized: false,
        userCount: 0,
        hasDefaultRoles: false,
      };
    }
  }

  /**
   * Validate password against policy
   */
  validatePassword(password: string): PasswordValidation {
    const errors: string[] = [];

    if (password.length < this.passwordPolicy.minLength) {
      errors.push(`Password must be at least ${this.passwordPolicy.minLength} characters`);
    }

    if (this.passwordPolicy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push("Password must contain at least one uppercase letter");
    }

    if (this.passwordPolicy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push("Password must contain at least one lowercase letter");
    }

    if (this.passwordPolicy.requireNumbers && !/\d/.test(password)) {
      errors.push("Password must contain at least one number");
    }

    if (this.passwordPolicy.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push("Password must contain at least one special character");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Initialize default system roles
   */
  async initializeDefaultRoles(): Promise<void> {
    this.logger.info("Initializing default roles", {
      component: "SetupService",
      operation: "initializeDefaultRoles",
    });

    const defaultRoles = [
      {
        name: "admin",
        description: "Full system administrator with unrestricted access",
        priority: 100,
        isSystem: true,
        permissions: [
          { capability: "*", action: "allow" as const },
        ],
      },
      {
        name: "operator",
        description: "Operations team member with execution privileges",
        priority: 50,
        isSystem: true,
        permissions: [
          { capability: "command.execute", action: "allow" as const },
          { capability: "task.execute", action: "allow" as const },
          { capability: "plan.execute", action: "allow" as const },
          { capability: "inventory.read", action: "allow" as const },
          { capability: "facts.read", action: "allow" as const },
          { capability: "reports.read", action: "allow" as const },
          { capability: "node.read", action: "allow" as const },
        ],
      },
      {
        name: "viewer",
        description: "Read-only access to view system status and reports",
        priority: 10,
        isSystem: true,
        permissions: [
          { capability: "inventory.read", action: "allow" as const },
          { capability: "facts.read", action: "allow" as const },
          { capability: "reports.read", action: "allow" as const },
          { capability: "node.read", action: "allow" as const },
          { capability: "command.execute", action: "deny" as const },
          { capability: "task.execute", action: "deny" as const },
        ],
      },
    ];

    for (const roleData of defaultRoles) {
      // Check if role already exists
      const existingRole = await this.db.queryOne<{ id: string }>(
        "SELECT id FROM roles WHERE name = ?",
        [roleData.name]
      );

      if (!existingRole) {
        await this.roleService.createRole(roleData);
        this.logger.info(`Created default role: ${roleData.name}`, {
          component: "SetupService",
          operation: "initializeDefaultRoles",
        });
      } else {
        this.logger.debug(`Role already exists: ${roleData.name}`, {
          component: "SetupService",
          operation: "initializeDefaultRoles",
        });
      }
    }
  }

  /**
   * Create the initial admin user
   *
   * This should only be called when no users exist in the system.
   */
  async createInitialAdmin(input: InitialAdminInput): Promise<{ success: boolean; userId?: string; error?: string }> {
    this.logger.info("Attempting to create initial admin user", {
      component: "SetupService",
      operation: "createInitialAdmin",
      metadata: { username: input.username, email: input.email },
    });

    // Verify setup is required
    const status = await this.getSetupStatus();
    if (!status.setupRequired) {
      this.logger.warn("Setup not required - users already exist", {
        component: "SetupService",
        operation: "createInitialAdmin",
      });
      return {
        success: false,
        error: "Setup has already been completed. Cannot create initial admin when users exist.",
      };
    }

    // Validate input
    if (!input.username || input.username.length < 3) {
      return {
        success: false,
        error: "Username must be at least 3 characters",
      };
    }

    if (!input.email || !this.isValidEmail(input.email)) {
      return {
        success: false,
        error: "Valid email address is required",
      };
    }

    // Validate password
    const passwordValidation = this.validatePassword(input.password);
    if (!passwordValidation.valid) {
      return {
        success: false,
        error: passwordValidation.errors.join("; "),
      };
    }

    try {
      // Ensure default roles exist
      await this.initializeDefaultRoles();

      // Get admin role ID
      const adminRole = await this.db.queryOne<{ id: string }>(
        "SELECT id FROM roles WHERE name = ?",
        ["admin"]
      );

      if (!adminRole) {
        throw new Error("Admin role not found after initialization");
      }

      // Hash password
      const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

      // Create user
      const userId = randomUUID();
      const now = new Date().toISOString();

      await this.db.execute(
        `INSERT INTO users (id, username, email, password_hash, display_name, active, created_at)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
        [userId, input.username, input.email, passwordHash, input.displayName || "Administrator", now]
      );

      // Assign admin role
      await this.db.execute(
        "INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)",
        [userId, adminRole.id]
      );

      this.logger.info("Initial admin user created successfully", {
        component: "SetupService",
        operation: "createInitialAdmin",
        metadata: { userId, username: input.username },
      });

      return {
        success: true,
        userId,
      };
    } catch (error) {
      this.logger.error("Failed to create initial admin user", {
        component: "SetupService",
        operation: "createInitialAdmin",
        metadata: { error: error instanceof Error ? error.message : String(error) },
      }, error instanceof Error ? error : undefined);

      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create admin user",
      };
    }
  }

  /**
   * Get password policy for frontend display
   */
  getPasswordPolicy(): PasswordPolicy {
    return { ...this.passwordPolicy };
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}
