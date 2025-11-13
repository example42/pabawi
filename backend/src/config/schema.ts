import { z } from 'zod';

/**
 * Command whitelist configuration schema
 */
export const WhitelistConfigSchema = z.object({
  allowAll: z.boolean().default(false),
  whitelist: z.array(z.string()).default([]),
  matchMode: z.enum(['exact', 'prefix']).default('exact'),
});

export type WhitelistConfig = z.infer<typeof WhitelistConfigSchema>;

/**
 * Application configuration schema with Zod validation
 */
export const AppConfigSchema = z.object({
  port: z.number().int().positive().default(3000),
  boltProjectPath: z.string().default(process.cwd()),
  commandWhitelist: WhitelistConfigSchema,
  executionTimeout: z.number().int().positive().default(300000), // 5 minutes
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  databasePath: z.string().default('./data/executions.db'),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
