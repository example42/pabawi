import { z } from "zod";

/**
 * Command whitelist configuration schema
 */
export const WhitelistConfigSchema = z.object({
  allowAll: z.boolean().default(false),
  whitelist: z.array(z.string()).default([]),
  matchMode: z.enum(["exact", "prefix"]).default("exact"),
});

export type WhitelistConfig = z.infer<typeof WhitelistConfigSchema>;

/**
 * Package installation task configuration
 */
export const PackageTaskConfigSchema = z.object({
  name: z.string(),
  label: z.string(),
  parameterMapping: z.object({
    packageName: z.string(), // Maps to 'app' for tp::install, 'name' for package
    ensure: z.string().optional(), // Maps to 'ensure' for tp::install, 'action' for package
    version: z.string().optional(),
    settings: z.string().optional(),
  }),
});

export type PackageTaskConfig = z.infer<typeof PackageTaskConfigSchema>;

/**
 * Streaming configuration schema
 */
export const StreamingConfigSchema = z.object({
  bufferMs: z.number().int().positive().default(100), // 100ms buffer
  maxOutputSize: z.number().int().positive().default(10485760), // 10MB default
  maxLineLength: z.number().int().positive().default(10000), // 10k characters per line
});

export type StreamingConfig = z.infer<typeof StreamingConfigSchema>;

/**
 * Application configuration schema with Zod validation
 */
export const AppConfigSchema = z.object({
  port: z.number().int().positive().default(3000),
  host: z.string().default("localhost"),
  boltProjectPath: z.string().default(process.cwd()),
  commandWhitelist: WhitelistConfigSchema,
  executionTimeout: z.number().int().positive().default(300000), // 5 minutes
  logLevel: z.enum(["error", "warn", "info", "debug"]).default("info"),
  databasePath: z.string().default("./data/executions.db"),
  packageTasks: z.array(PackageTaskConfigSchema).default([
    {
      name: "package",
      label: "Package (built-in)",
      parameterMapping: {
        packageName: "name",
        ensure: "action",
        version: "version",
      },
    },
  ]),
  streaming: StreamingConfigSchema,
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
