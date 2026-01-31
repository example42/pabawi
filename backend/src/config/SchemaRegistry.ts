/**
 * Schema Registry for Plugin Configuration Validation
 *
 * Provides a centralized registry for Zod schemas used to validate
 * plugin configurations. Supports:
 * - Per-plugin schema registration
 * - Schema composition for nested configs
 * - Runtime schema lookup
 * - Schema metadata and documentation
 *
 * @module config/SchemaRegistry
 * @version 1.0.0
 */

import { z, ZodSchema, ZodObject, ZodError } from "zod";
import { LoggerService } from "../services/LoggerService";

/**
 * Schema metadata for documentation and introspection
 */
export interface SchemaMetadata {
  /** Unique identifier for the schema */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what the schema validates */
  description: string;
  /** Version of the schema */
  version: string;
  /** Category for organization (e.g., 'integration', 'auth', 'database') */
  category: SchemaCategory;
  /** Plugin that registered this schema (null for core schemas) */
  pluginName: string | null;
  /** Whether this schema is for core configuration */
  isCore: boolean;
  /** Timestamp when schema was registered */
  registeredAt: Date;
  /** Optional example configuration */
  example?: Record<string, unknown>;
  /** Dependencies on other schemas */
  dependencies?: string[];
}

/**
 * Schema categories for organization
 */
export type SchemaCategory =
  | "core"
  | "integration"
  | "auth"
  | "database"
  | "frontend"
  | "plugin"
  | "custom";

/**
 * Registered schema entry
 */
export interface RegisteredSchema<T = unknown> {
  schema: ZodSchema<T>;
  metadata: SchemaMetadata;
}

/**
 * Schema validation result
 */
export interface SchemaValidationResult<T = unknown> {
  success: boolean;
  data?: T;
  errors?: SchemaValidationError[];
  warnings?: string[];
}

/**
 * Detailed validation error
 */
export interface SchemaValidationError {
  path: string;
  message: string;
  code: string;
  expected?: string;
  received?: string;
}

/**
 * Options for schema registration
 */
export interface SchemaRegistrationOptions {
  /** Override existing schema with same ID */
  override?: boolean;
  /** Mark as deprecated (will log warning on use) */
  deprecated?: boolean;
  /** Replacement schema ID if deprecated */
  replacedBy?: string;
}

/**
 * Schema Registry for configuration validation
 */
export class SchemaRegistry {
  private static instance: SchemaRegistry | null = null;
  private schemas: Map<string, RegisteredSchema> = new Map();
  private logger: LoggerService;
  private deprecationWarnings: Set<string> = new Set();

  constructor() {
    this.logger = new LoggerService({
      level: "info",
      component: "SchemaRegistry",
    });
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SchemaRegistry {
    if (!SchemaRegistry.instance) {
      SchemaRegistry.instance = new SchemaRegistry();
    }
    return SchemaRegistry.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  static resetInstance(): void {
    SchemaRegistry.instance = null;
  }

  /**
   * Register a schema with metadata
   */
  register<T>(
    schema: ZodSchema<T>,
    metadata: Omit<SchemaMetadata, "registeredAt">,
    options: SchemaRegistrationOptions = {}
  ): void {
    const id = metadata.id;

    if (this.schemas.has(id) && !options.override) {
      throw new Error(
        `Schema with ID '${id}' is already registered. Use override option to replace.`
      );
    }

    const fullMetadata: SchemaMetadata = {
      ...metadata,
      registeredAt: new Date(),
    };

    this.schemas.set(id, {
      schema,
      metadata: fullMetadata,
    });

    this.logger.debug("Schema registered", {
      component: "SchemaRegistry",
      operation: "register",
      metadata: {
        schemaId: id,
        category: metadata.category,
        pluginName: metadata.pluginName,
        isCore: metadata.isCore,
      },
    });
  }

  /**
   * Get a registered schema by ID
   */
  get<T = unknown>(id: string): RegisteredSchema<T> | undefined {
    const entry = this.schemas.get(id);
    if (!entry) {
      return undefined;
    }

    // Check for deprecation warning
    const deprecatedKey = `deprecated:${id}`;
    if (
      (entry.metadata as SchemaMetadata & { deprecated?: boolean }).deprecated &&
      !this.deprecationWarnings.has(deprecatedKey)
    ) {
      const replacedBy = (entry.metadata as SchemaMetadata & { replacedBy?: string }).replacedBy;
      this.logger.warn(`Schema '${id}' is deprecated${replacedBy ? `. Use '${replacedBy}' instead.` : "."}`, {
        component: "SchemaRegistry",
        operation: "get",
        metadata: { schemaId: id, replacedBy },
      });
      this.deprecationWarnings.add(deprecatedKey);
    }

    return entry as RegisteredSchema<T>;
  }

  /**
   * Get schema by ID, throwing if not found
   */
  getOrThrow<T = unknown>(id: string): RegisteredSchema<T> {
    const entry = this.get<T>(id);
    if (!entry) {
      throw new Error(`Schema with ID '${id}' not found`);
    }
    return entry;
  }

  /**
   * Check if a schema is registered
   */
  has(id: string): boolean {
    return this.schemas.has(id);
  }

  /**
   * Unregister a schema
   */
  unregister(id: string): boolean {
    const deleted = this.schemas.delete(id);
    if (deleted) {
      this.logger.debug("Schema unregistered", {
        component: "SchemaRegistry",
        operation: "unregister",
        metadata: { schemaId: id },
      });
    }
    return deleted;
  }

  /**
   * Unregister all schemas for a plugin
   */
  unregisterPlugin(pluginName: string): number {
    let count = 0;
    for (const [id, entry] of this.schemas) {
      if (entry.metadata.pluginName === pluginName) {
        this.schemas.delete(id);
        count++;
      }
    }

    if (count > 0) {
      this.logger.debug("Plugin schemas unregistered", {
        component: "SchemaRegistry",
        operation: "unregisterPlugin",
        metadata: { pluginName, count },
      });
    }

    return count;
  }

  /**
   * Get all registered schemas
   */
  getAll(): RegisteredSchema[] {
    return Array.from(this.schemas.values());
  }

  /**
   * Get schemas by category
   */
  getByCategory(category: SchemaCategory): RegisteredSchema[] {
    return this.getAll().filter((entry) => entry.metadata.category === category);
  }

  /**
   * Get schemas by plugin name
   */
  getByPlugin(pluginName: string): RegisteredSchema[] {
    return this.getAll().filter(
      (entry) => entry.metadata.pluginName === pluginName
    );
  }

  /**
   * Get core schemas (not plugin-specific)
   */
  getCoreSchemas(): RegisteredSchema[] {
    return this.getAll().filter((entry) => entry.metadata.isCore);
  }

  /**
   * Validate data against a registered schema
   */
  validate<T>(schemaId: string, data: unknown): SchemaValidationResult<T> {
    const entry = this.get<T>(schemaId);
    if (!entry) {
      return {
        success: false,
        errors: [
          {
            path: "",
            message: `Schema '${schemaId}' not found`,
            code: "schema_not_found",
          },
        ],
      };
    }

    return this.validateWithSchema(entry.schema, data);
  }

  /**
   * Validate data against a schema directly
   */
  validateWithSchema<T>(
    schema: ZodSchema<T>,
    data: unknown
  ): SchemaValidationResult<T> {
    try {
      const result = schema.safeParse(data);

      if (result.success) {
        return {
          success: true,
          data: result.data,
        };
      }

      const errors = this.formatZodErrors(result.error);
      return {
        success: false,
        errors,
      };
    } catch (error) {
      return {
        success: false,
        errors: [
          {
            path: "",
            message: error instanceof Error ? error.message : "Unknown error",
            code: "validation_error",
          },
        ],
      };
    }
  }

  /**
   * Format Zod errors into our error structure
   */
  private formatZodErrors(zodError: ZodError): SchemaValidationError[] {
    return zodError.errors.map((err) => ({
      path: err.path.join("."),
      message: err.message,
      code: err.code,
      expected: "expected" in err ? String(err.expected) : undefined,
      received: "received" in err ? String(err.received) : undefined,
    }));
  }

  /**
   * Compose multiple schemas into a combined schema
   */
  compose<T extends Record<string, unknown>>(
    schemaIds: string[]
  ): ZodSchema<T> | null {
    const schemas: Array<ZodObject<any>> = [];

    for (const id of schemaIds) {
      const entry = this.get(id);
      if (!entry) {
        this.logger.warn(`Cannot compose: schema '${id}' not found`, {
          component: "SchemaRegistry",
          operation: "compose",
          metadata: { schemaIds },
        });
        return null;
      }

      // Only ZodObject can be composed with .merge()
      if (!(entry.schema instanceof ZodObject)) {
        this.logger.warn(
          `Cannot compose: schema '${id}' is not a ZodObject`,
          {
            component: "SchemaRegistry",
            operation: "compose",
            metadata: { schemaId: id },
          }
        );
        return null;
      }

      schemas.push(entry.schema as ZodObject<any>);
    }

    if (schemas.length === 0) {
      return null;
    }

    // Merge all schemas
    let composed = schemas[0];
    for (let i = 1; i < schemas.length; i++) {
      composed = composed.merge(schemas[i]);
    }

    return composed as unknown as ZodSchema<T>;
  }

  /**
   * Get statistics about registered schemas
   */
  getStats(): SchemaRegistryStats {
    const all = this.getAll();
    const byCategory: Record<SchemaCategory, number> = {
      core: 0,
      integration: 0,
      auth: 0,
      database: 0,
      frontend: 0,
      plugin: 0,
      custom: 0,
    };

    const byPlugin: Record<string, number> = {};

    for (const entry of all) {
      byCategory[entry.metadata.category]++;

      if (entry.metadata.pluginName) {
        byPlugin[entry.metadata.pluginName] =
          (byPlugin[entry.metadata.pluginName] || 0) + 1;
      }
    }

    return {
      total: all.length,
      byCategory,
      byPlugin,
      coreCount: all.filter((e) => e.metadata.isCore).length,
      pluginCount: all.filter((e) => !e.metadata.isCore).length,
    };
  }

  /**
   * List all schema IDs
   */
  listIds(): string[] {
    return Array.from(this.schemas.keys());
  }

  /**
   * Export all schema metadata (for documentation)
   */
  exportMetadata(): SchemaMetadata[] {
    return this.getAll().map((entry) => entry.metadata);
  }
}

/**
 * Schema registry statistics
 */
export interface SchemaRegistryStats {
  total: number;
  byCategory: Record<SchemaCategory, number>;
  byPlugin: Record<string, number>;
  coreCount: number;
  pluginCount: number;
}

/**
 * Get the singleton schema registry instance
 */
export function getSchemaRegistry(): SchemaRegistry {
  return SchemaRegistry.getInstance();
}

/**
 * Reset the schema registry (for testing)
 */
export function resetSchemaRegistry(): void {
  SchemaRegistry.resetInstance();
}

/**
 * Convenience function to register a core schema
 */
export function registerCoreSchema<T>(
  schema: ZodSchema<T>,
  metadata: Omit<SchemaMetadata, "registeredAt" | "isCore" | "pluginName">,
  options?: SchemaRegistrationOptions
): void {
  getSchemaRegistry().register(
    schema,
    {
      ...metadata,
      isCore: true,
      pluginName: null,
    },
    options
  );
}

/**
 * Convenience function to register a plugin schema
 */
export function registerPluginSchema<T>(
  pluginName: string,
  schema: ZodSchema<T>,
  metadata: Omit<
    SchemaMetadata,
    "registeredAt" | "isCore" | "pluginName"
  >,
  options?: SchemaRegistrationOptions
): void {
  getSchemaRegistry().register(
    schema,
    {
      ...metadata,
      isCore: false,
      pluginName,
    },
    options
  );
}
