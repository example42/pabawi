/**
 * Feature: hiera-codebase-integration, Property 3: Hiera Configuration Parsing Round-Trip
 * Validates: Requirements 2.1, 2.2
 *
 * This property test verifies that:
 * For any valid Hiera 5 configuration object, serializing it to YAML and then
 * parsing it back SHALL produce an equivalent configuration with all hierarchy
 * levels, paths, and data providers preserved.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { HieraParser } from '../../../src/integrations/hiera/HieraParser';
import type { HieraConfig, HierarchyLevel, HieraDefaults } from '../../../src/integrations/hiera/types';

describe('Property 3: Hiera Configuration Parsing Round-Trip', () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  // Generator for valid hierarchy level names (alphanumeric with spaces and dashes)
  const hierarchyNameArb = fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => /^[a-zA-Z0-9 _-]+$/.test(s) && s.trim().length > 0);

  // Generator for valid file paths (alphanumeric with path separators and extensions)
  const filePathArb = fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => /^[a-zA-Z0-9/_.-]+$/.test(s))
    .map(s => s.endsWith('.yaml') ? s : s + '.yaml');

  // Generator for data directory paths
  const datadirArb = fc.string({ minLength: 1, maxLength: 30 })
    .filter(s => /^[a-zA-Z0-9/_-]+$/.test(s));

  // Generator for data_hash values
  const dataHashArb = fc.constantFrom('yaml_data', 'json_data');

  // Generator for lookup_key values
  const lookupKeyArb = fc.constantFrom('eyaml_lookup_key', 'hiera_lookup_key');

  // Generator for a single hierarchy level with path
  const hierarchyLevelWithPathArb: fc.Arbitrary<HierarchyLevel> = fc.record({
    name: hierarchyNameArb,
    path: filePathArb,
    datadir: fc.option(datadirArb, { nil: undefined }),
    data_hash: fc.option(dataHashArb, { nil: undefined }),
  });

  // Generator for a hierarchy level with multiple paths
  const hierarchyLevelWithPathsArb: fc.Arbitrary<HierarchyLevel> = fc.record({
    name: hierarchyNameArb,
    paths: fc.array(filePathArb, { minLength: 1, maxLength: 3 }),
    datadir: fc.option(datadirArb, { nil: undefined }),
    data_hash: fc.option(dataHashArb, { nil: undefined }),
  });

  // Generator for a hierarchy level with glob
  const hierarchyLevelWithGlobArb: fc.Arbitrary<HierarchyLevel> = fc.record({
    name: hierarchyNameArb,
    glob: filePathArb.map(p => p.replace('.yaml', '/*.yaml')),
    datadir: fc.option(datadirArb, { nil: undefined }),
    data_hash: fc.option(dataHashArb, { nil: undefined }),
  });

  // Combined hierarchy level generator
  const hierarchyLevelArb: fc.Arbitrary<HierarchyLevel> = fc.oneof(
    hierarchyLevelWithPathArb,
    hierarchyLevelWithPathsArb,
    hierarchyLevelWithGlobArb
  );

  // Generator for defaults
  const hieraDefaultsArb: fc.Arbitrary<HieraDefaults> = fc.record({
    datadir: fc.option(datadirArb, { nil: undefined }),
    data_hash: fc.option(dataHashArb, { nil: undefined }),
    lookup_key: fc.option(lookupKeyArb, { nil: undefined }),
  });

  // Generator for complete HieraConfig
  const hieraConfigArb: fc.Arbitrary<HieraConfig> = fc.record({
    version: fc.constant(5 as const),
    defaults: fc.option(hieraDefaultsArb, { nil: undefined }),
    hierarchy: fc.array(hierarchyLevelArb, { minLength: 1, maxLength: 5 }),
  });

  /**
   * Helper to clean undefined values from objects for comparison
   */
  function cleanUndefined<T>(obj: T): T {
    if (obj === null || obj === undefined) {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(cleanUndefined) as T;
    }
    if (typeof obj === 'object') {
      const cleaned: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (value !== undefined) {
          cleaned[key] = cleanUndefined(value);
        }
      }
      return cleaned as T;
    }
    return obj;
  }

  /**
   * Helper to compare hierarchy levels
   */
  function compareHierarchyLevel(original: HierarchyLevel, parsed: HierarchyLevel): boolean {
    // Name must match
    if (original.name !== parsed.name) return false;

    // Path must match
    if (original.path !== parsed.path) return false;

    // Paths array must match
    if (original.paths && parsed.paths) {
      if (original.paths.length !== parsed.paths.length) return false;
      for (let i = 0; i < original.paths.length; i++) {
        if (original.paths[i] !== parsed.paths[i]) return false;
      }
    } else if (original.paths !== parsed.paths) {
      return false;
    }

    // Glob must match
    if (original.glob !== parsed.glob) return false;

    // Globs array must match
    if (original.globs && parsed.globs) {
      if (original.globs.length !== parsed.globs.length) return false;
      for (let i = 0; i < original.globs.length; i++) {
        if (original.globs[i] !== parsed.globs[i]) return false;
      }
    } else if (original.globs !== parsed.globs) {
      return false;
    }

    // Datadir must match
    if (original.datadir !== parsed.datadir) return false;

    // Data hash must match
    if (original.data_hash !== parsed.data_hash) return false;

    // Lookup key must match
    if (original.lookup_key !== parsed.lookup_key) return false;

    return true;
  }

  /**
   * Helper to compare HieraConfig objects
   */
  function compareConfigs(original: HieraConfig, parsed: HieraConfig): boolean {
    // Version must match
    if (original.version !== parsed.version) return false;

    // Hierarchy length must match
    if (original.hierarchy.length !== parsed.hierarchy.length) return false;

    // Compare each hierarchy level
    for (let i = 0; i < original.hierarchy.length; i++) {
      if (!compareHierarchyLevel(original.hierarchy[i], parsed.hierarchy[i])) {
        return false;
      }
    }

    // Compare defaults
    const origDefaults = cleanUndefined(original.defaults);
    const parsedDefaults = cleanUndefined(parsed.defaults);

    if (origDefaults && parsedDefaults) {
      if (origDefaults.datadir !== parsedDefaults.datadir) return false;
      if (origDefaults.data_hash !== parsedDefaults.data_hash) return false;
      if (origDefaults.lookup_key !== parsedDefaults.lookup_key) return false;
    } else if ((origDefaults && Object.keys(origDefaults).length > 0) !==
               (parsedDefaults && Object.keys(parsedDefaults).length > 0)) {
      return false;
    }

    return true;
  }

  it('should preserve all hierarchy levels after round-trip for any valid config', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    fc.assert(
      fc.property(hieraConfigArb, (originalConfig) => {
        // Serialize to YAML
        const yaml = parser.serializeConfig(originalConfig);

        // Parse back
        const parseResult = parser.parseContent(yaml);

        // Should parse successfully
        expect(parseResult.success).toBe(true);
        expect(parseResult.config).toBeDefined();

        const parsedConfig = parseResult.config!;

        // Version should be preserved
        expect(parsedConfig.version).toBe(originalConfig.version);

        // Hierarchy length should be preserved
        expect(parsedConfig.hierarchy.length).toBe(originalConfig.hierarchy.length);

        // Each hierarchy level should be preserved
        for (let i = 0; i < originalConfig.hierarchy.length; i++) {
          const origLevel = originalConfig.hierarchy[i];
          const parsedLevel = parsedConfig.hierarchy[i];

          expect(parsedLevel.name).toBe(origLevel.name);

          if (origLevel.path) {
            expect(parsedLevel.path).toBe(origLevel.path);
          }
          if (origLevel.paths) {
            expect(parsedLevel.paths).toEqual(origLevel.paths);
          }
          if (origLevel.glob) {
            expect(parsedLevel.glob).toBe(origLevel.glob);
          }
          if (origLevel.datadir) {
            expect(parsedLevel.datadir).toBe(origLevel.datadir);
          }
          if (origLevel.data_hash) {
            expect(parsedLevel.data_hash).toBe(origLevel.data_hash);
          }
        }
      }),
      propertyTestConfig
    );
  });

  it('should preserve defaults after round-trip for any valid config with defaults', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    const configWithDefaultsArb = fc.record({
      version: fc.constant(5 as const),
      defaults: hieraDefaultsArb,
      hierarchy: fc.array(hierarchyLevelArb, { minLength: 1, maxLength: 3 }),
    });

    fc.assert(
      fc.property(configWithDefaultsArb, (originalConfig) => {
        // Serialize to YAML
        const yaml = parser.serializeConfig(originalConfig);

        // Parse back
        const parseResult = parser.parseContent(yaml);

        // Should parse successfully
        expect(parseResult.success).toBe(true);
        expect(parseResult.config).toBeDefined();

        const parsedConfig = parseResult.config!;

        // Defaults should be preserved
        if (originalConfig.defaults) {
          if (originalConfig.defaults.datadir) {
            expect(parsedConfig.defaults?.datadir).toBe(originalConfig.defaults.datadir);
          }
          if (originalConfig.defaults.data_hash) {
            expect(parsedConfig.defaults?.data_hash).toBe(originalConfig.defaults.data_hash);
          }
          if (originalConfig.defaults.lookup_key) {
            expect(parsedConfig.defaults?.lookup_key).toBe(originalConfig.defaults.lookup_key);
          }
        }
      }),
      propertyTestConfig
    );
  });

  it('should produce equivalent configs after round-trip for any valid config', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    fc.assert(
      fc.property(hieraConfigArb, (originalConfig) => {
        // Serialize to YAML
        const yaml = parser.serializeConfig(originalConfig);

        // Parse back
        const parseResult = parser.parseContent(yaml);

        // Should parse successfully
        expect(parseResult.success).toBe(true);
        expect(parseResult.config).toBeDefined();

        // Configs should be equivalent
        expect(compareConfigs(originalConfig, parseResult.config!)).toBe(true);
      }),
      propertyTestConfig
    );
  });

  it('should handle configs with multiple paths arrays after round-trip', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    const multiPathConfigArb = fc.record({
      version: fc.constant(5 as const),
      hierarchy: fc.array(hierarchyLevelWithPathsArb, { minLength: 1, maxLength: 3 }),
    });

    fc.assert(
      fc.property(multiPathConfigArb, (originalConfig) => {
        // Serialize to YAML
        const yaml = parser.serializeConfig(originalConfig);

        // Parse back
        const parseResult = parser.parseContent(yaml);

        // Should parse successfully
        expect(parseResult.success).toBe(true);
        expect(parseResult.config).toBeDefined();

        const parsedConfig = parseResult.config!;

        // Each hierarchy level's paths array should be preserved
        for (let i = 0; i < originalConfig.hierarchy.length; i++) {
          const origLevel = originalConfig.hierarchy[i];
          const parsedLevel = parsedConfig.hierarchy[i];

          if (origLevel.paths) {
            expect(parsedLevel.paths).toBeDefined();
            expect(parsedLevel.paths).toEqual(origLevel.paths);
          }
        }
      }),
      propertyTestConfig
    );
  });

  it('should handle configs with glob patterns after round-trip', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    const globConfigArb = fc.record({
      version: fc.constant(5 as const),
      hierarchy: fc.array(hierarchyLevelWithGlobArb, { minLength: 1, maxLength: 3 }),
    });

    fc.assert(
      fc.property(globConfigArb, (originalConfig) => {
        // Serialize to YAML
        const yaml = parser.serializeConfig(originalConfig);

        // Parse back
        const parseResult = parser.parseContent(yaml);

        // Should parse successfully
        expect(parseResult.success).toBe(true);
        expect(parseResult.config).toBeDefined();

        const parsedConfig = parseResult.config!;

        // Each hierarchy level's glob should be preserved
        for (let i = 0; i < originalConfig.hierarchy.length; i++) {
          const origLevel = originalConfig.hierarchy[i];
          const parsedLevel = parsedConfig.hierarchy[i];

          if (origLevel.glob) {
            expect(parsedLevel.glob).toBe(origLevel.glob);
          }
        }
      }),
      propertyTestConfig
    );
  });
});
