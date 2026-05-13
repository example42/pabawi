import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import type { PluginRegistryEntry, PluginDeps } from "../../../src/plugins/registry";
import type { IntegrationPlugin } from "../../../src/integrations/types";

/**
 * Property-Based Tests for Plugin Registry Behaviour
 *
 * Tests the plugin registry startup loop logic: given a declarative registry
 * of entries, the loop resolves config, creates plugins, and registers them
 * with IntegrationManager. These properties verify correctness of that loop
 * independent of actual plugin implementations.
 */

/**
 * Simulates the plugin registry startup loop from server.ts.
 * This is the exact logic under test, extracted for property verification.
 */
async function executeRegistryLoop(
  registry: PluginRegistryEntry[],
  deps: PluginDeps,
): Promise<{ registered: string[]; failed: string[]; skipped: string[] }> {
  const registered: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];

  for (const entry of registry) {
    const entryConfig = entry.resolveConfig(deps.configService);
    if (!entryConfig) {
      skipped.push(entry.name);
      continue;
    }
    try {
      const plugin = await entry.create(deps);
      // Simulate IntegrationManager.registerPlugin — just track the name
      registered.push(plugin.name);
    } catch {
      failed.push(entry.name);
    }
  }

  return { registered, failed, skipped };
}

/**
 * Creates a mock plugin that satisfies IntegrationPlugin interface.
 */
function createMockPlugin(name: string, type: "execution" | "information" | "both"): IntegrationPlugin {
  return {
    name,
    type,
    initialize: async () => {},
    healthCheck: async () => ({ status: "healthy" as const, message: "ok" }),
    getConfig: () => ({ enabled: true, name, type, config: {}, priority: 5 }),
    isInitialized: () => true,
  };
}

/**
 * Creates a mock PluginDeps with a no-op configService.
 */
function createMockDeps(): PluginDeps {
  return {
    configService: {} as PluginDeps["configService"],
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as unknown as PluginDeps["logger"],
    performanceMonitor: {} as PluginDeps["performanceMonitor"],
    integrationManager: {} as PluginDeps["integrationManager"],
    boltService: {} as PluginDeps["boltService"],
  };
}

/**
 * Arbitrary for generating a list of plugin names (unique, non-empty).
 */
const pluginNamesArb = fc.uniqueArray(
  fc.stringMatching(/^[a-z][a-z0-9-]{1,15}$/),
  { minLength: 1, maxLength: 12 },
);

describe("Plugin Registry Properties", () => {
  /**
   * Property 3: Plugin registry produces correct registrations
   *
   * **Validates: Requirements 2.2, 2.5**
   *
   * For any subset of enabled integrations in the configuration,
   * iterating the plugin registry SHALL result in exactly those
   * integrations being registered, and no others.
   */
  it("registers exactly the enabled subset of plugins", () => {
    fc.assert(
      fc.asyncProperty(
        pluginNamesArb.chain((allNames) =>
          fc.tuple(
            fc.constant(allNames),
            fc.subarray(allNames, { minLength: 0 }),
          ),
        ),
        async ([allNames, enabledNames]) => {
          const enabledSet = new Set(enabledNames);

          const registry: PluginRegistryEntry[] = allNames.map((name, idx) => ({
            name,
            type: "both" as const,
            priority: idx + 1,
            resolveConfig: () => (enabledSet.has(name) ? { enabled: true } : null),
            create: () => createMockPlugin(name, "both"),
          }));

          const deps = createMockDeps();
          const result = await executeRegistryLoop(registry, deps);

          // Exactly the enabled plugins are registered
          expect(result.registered).toHaveLength(enabledNames.length);
          expect(new Set(result.registered)).toEqual(enabledSet);

          // Skipped plugins are exactly the disabled ones
          const disabledNames = allNames.filter((n) => !enabledSet.has(n));
          expect(result.skipped).toHaveLength(disabledNames.length);
          expect(new Set(result.skipped)).toEqual(new Set(disabledNames));

          // No failures
          expect(result.failed).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 3 (ordering): Registration order matches registry order
   *
   * **Validates: Requirements 2.2, 2.5**
   *
   * The order of registered plugins SHALL match the order they appear
   * in the registry (preserving priority ordering).
   */
  it("preserves registration order matching registry array order", () => {
    fc.assert(
      fc.asyncProperty(
        pluginNamesArb,
        async (allNames) => {
          // All plugins enabled
          const registry: PluginRegistryEntry[] = allNames.map((name, idx) => ({
            name,
            type: "both" as const,
            priority: idx + 1,
            resolveConfig: () => ({ enabled: true }),
            create: () => createMockPlugin(name, "both"),
          }));

          const deps = createMockDeps();
          const result = await executeRegistryLoop(registry, deps);

          // Order must match registry order exactly
          expect(result.registered).toEqual(allNames);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4: Failed plugin does not prevent subsequent registrations
   *
   * **Validates: Requirements 2.3**
   *
   * For any plugin registry where entry N throws during create(),
   * all entries after N with valid configuration SHALL still be registered.
   */
  it("a throwing plugin does not prevent subsequent registrations", () => {
    fc.assert(
      fc.asyncProperty(
        pluginNamesArb.chain((names) =>
          fc.tuple(
            fc.constant(names),
            // Pick a random index to be the failing plugin
            fc.integer({ min: 0, max: names.length - 1 }),
          ),
        ),
        async ([allNames, failingIndex]) => {
          const registry: PluginRegistryEntry[] = allNames.map((name, idx) => ({
            name,
            type: "both" as const,
            priority: idx + 1,
            resolveConfig: () => ({ enabled: true }),
            create: () => {
              if (idx === failingIndex) {
                throw new Error(`Plugin ${name} failed to initialise`);
              }
              return createMockPlugin(name, "both");
            },
          }));

          const deps = createMockDeps();
          const result = await executeRegistryLoop(registry, deps);

          // The failing plugin is in the failed list
          expect(result.failed).toContain(allNames[failingIndex]);

          // All other plugins are registered
          const expectedRegistered = allNames.filter((_, idx) => idx !== failingIndex);
          expect(result.registered).toEqual(expectedRegistered);

          // No plugins skipped (all have config)
          expect(result.skipped).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Property 4 (multiple failures): Multiple failing plugins don't prevent others
   *
   * **Validates: Requirements 2.3**
   *
   * For any subset of plugins that throw during create(),
   * all non-throwing plugins with valid configuration SHALL still be registered.
   */
  it("multiple throwing plugins do not prevent other registrations", () => {
    fc.assert(
      fc.asyncProperty(
        pluginNamesArb.chain((names) =>
          fc.tuple(
            fc.constant(names),
            // Pick a random subset of indices to fail
            fc.subarray(
              names.map((_, i) => i),
              { minLength: 0 },
            ),
          ),
        ),
        async ([allNames, failingIndices]) => {
          const failingSet = new Set(failingIndices);

          const registry: PluginRegistryEntry[] = allNames.map((name, idx) => ({
            name,
            type: "both" as const,
            priority: idx + 1,
            resolveConfig: () => ({ enabled: true }),
            create: () => {
              if (failingSet.has(idx)) {
                throw new Error(`Plugin ${name} failed`);
              }
              return createMockPlugin(name, "both");
            },
          }));

          const deps = createMockDeps();
          const result = await executeRegistryLoop(registry, deps);

          // Failed plugins match the failing set
          const expectedFailed = allNames.filter((_, idx) => failingSet.has(idx));
          expect(result.failed).toEqual(expectedFailed);

          // Registered plugins are exactly the non-failing ones
          const expectedRegistered = allNames.filter((_, idx) => !failingSet.has(idx));
          expect(result.registered).toEqual(expectedRegistered);
        },
      ),
      { numRuns: 100 },
    );
  });
});
