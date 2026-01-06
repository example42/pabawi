/**
 * Feature: hiera-codebase-integration, Property 5: Hierarchy Path Interpolation
 * Validates: Requirements 2.6
 *
 * This property test verifies that:
 * For any hierarchy path template containing fact variables (e.g., %{facts.os.family})
 * and any valid fact set, interpolating the path SHALL replace all variables with
 * their corresponding fact values.
 *
 * Supported variable syntaxes:
 * - %{facts.xxx} - Hiera 5 fact syntax
 * - %{::xxx} - Legacy top-scope variable syntax
 * - %{trusted.xxx} - Trusted facts syntax
 * - %{server_facts.xxx} - Server facts syntax
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { HieraParser } from '../../../src/integrations/hiera/HieraParser';
import type { Facts } from '../../../src/integrations/hiera/types';

describe('Property 5: Hierarchy Path Interpolation', () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  // Generator for valid fact names (alphanumeric with underscores)
  const factNameArb = fc.string({ minLength: 1, maxLength: 20 })
    .filter(s => /^[a-z][a-z0-9_]*$/.test(s));

  // Generator for valid fact values (strings that are safe for paths)
  const factValueArb = fc.string({ minLength: 1, maxLength: 30 })
    .filter(s => /^[a-zA-Z0-9_-]+$/.test(s));

  // Generator for nested fact paths (e.g., "os.family", "networking.ip")
  const nestedFactPathArb = fc.array(factNameArb, { minLength: 1, maxLength: 3 })
    .map(parts => parts.join('.'));

  // Generator for simple facts (flat key-value pairs)
  const simpleFacts = fc.dictionary(factNameArb, factValueArb, { minKeys: 1, maxKeys: 5 });

  // Generator for nested facts (e.g., os: { family: 'RedHat' })
  const nestedFactsArb = fc.record({
    os: fc.record({
      family: factValueArb,
      name: factValueArb,
      release: fc.record({
        major: fc.integer({ min: 1, max: 20 }).map(String),
        minor: fc.integer({ min: 0, max: 10 }).map(String),
      }),
    }),
    networking: fc.record({
      hostname: factValueArb,
      domain: factValueArb,
      ip: fc.ipV4(),
    }),
    environment: factValueArb,
    hostname: factValueArb,
    fqdn: factValueArb,
  });

  // Generator for trusted facts
  const trustedFactsArb = fc.record({
    certname: factValueArb,
    domain: factValueArb,
    hostname: factValueArb,
  });

  // Generator for server facts
  const serverFactsArb = fc.record({
    serverversion: factValueArb,
    servername: factValueArb,
  });

  /**
   * Helper to create a Facts object from raw facts
   */
  function createFacts(rawFacts: Record<string, unknown>): Facts {
    return {
      nodeId: 'test-node',
      gatheredAt: new Date().toISOString(),
      facts: rawFacts,
    };
  }

  /**
   * Helper to get nested value from object
   * Uses Object.hasOwn() to prevent prototype pollution attacks
   */
  function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      // Use Object.hasOwn to prevent prototype pollution
      if (!Object.hasOwn(current as Record<string, unknown>, part)) {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  it('should replace %{facts.xxx} variables with corresponding fact values', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    fc.assert(
      fc.property(nestedFactsArb, (rawFacts) => {
        const facts = createFacts(rawFacts);

        // Test with os.family
        const template1 = 'nodes/%{facts.os.family}.yaml';
        const result1 = parser.interpolatePath(template1, facts);
        expect(result1).toBe(`nodes/${rawFacts.os.family}.yaml`);

        // Test with hostname
        const template2 = 'nodes/%{facts.hostname}.yaml';
        const result2 = parser.interpolatePath(template2, facts);
        expect(result2).toBe(`nodes/${rawFacts.hostname}.yaml`);

        // Test with nested os.release.major
        const template3 = 'os/%{facts.os.name}/%{facts.os.release.major}.yaml';
        const result3 = parser.interpolatePath(template3, facts);
        expect(result3).toBe(`os/${rawFacts.os.name}/${rawFacts.os.release.major}.yaml`);
      }),
      propertyTestConfig
    );
  });

  it('should replace %{::xxx} legacy syntax with corresponding fact values', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    fc.assert(
      fc.property(nestedFactsArb, (rawFacts) => {
        const facts = createFacts(rawFacts);

        // Test with ::hostname (legacy syntax)
        const template1 = 'nodes/%{::hostname}.yaml';
        const result1 = parser.interpolatePath(template1, facts);
        expect(result1).toBe(`nodes/${rawFacts.hostname}.yaml`);

        // Test with ::environment
        const template2 = 'environments/%{::environment}.yaml';
        const result2 = parser.interpolatePath(template2, facts);
        expect(result2).toBe(`environments/${rawFacts.environment}.yaml`);

        // Test with nested ::os.family
        const template3 = 'os/%{::os.family}.yaml';
        const result3 = parser.interpolatePath(template3, facts);
        expect(result3).toBe(`os/${rawFacts.os.family}.yaml`);
      }),
      propertyTestConfig
    );
  });

  it('should replace %{trusted.xxx} variables with trusted fact values', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    fc.assert(
      fc.property(trustedFactsArb, (trustedFacts) => {
        const facts = createFacts({ trusted: trustedFacts });

        // Test with trusted.certname
        const template1 = 'nodes/%{trusted.certname}.yaml';
        const result1 = parser.interpolatePath(template1, facts);
        expect(result1).toBe(`nodes/${trustedFacts.certname}.yaml`);

        // Test with trusted.domain
        const template2 = 'domains/%{trusted.domain}.yaml';
        const result2 = parser.interpolatePath(template2, facts);
        expect(result2).toBe(`domains/${trustedFacts.domain}.yaml`);
      }),
      propertyTestConfig
    );
  });

  it('should replace %{server_facts.xxx} variables with server fact values', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    fc.assert(
      fc.property(serverFactsArb, (serverFacts) => {
        const facts = createFacts({ server_facts: serverFacts });

        // Test with server_facts.serverversion
        const template1 = 'puppet/%{server_facts.serverversion}.yaml';
        const result1 = parser.interpolatePath(template1, facts);
        expect(result1).toBe(`puppet/${serverFacts.serverversion}.yaml`);

        // Test with server_facts.servername
        const template2 = 'servers/%{server_facts.servername}.yaml';
        const result2 = parser.interpolatePath(template2, facts);
        expect(result2).toBe(`servers/${serverFacts.servername}.yaml`);
      }),
      propertyTestConfig
    );
  });

  it('should handle multiple variables in a single path template', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    fc.assert(
      fc.property(nestedFactsArb, (rawFacts) => {
        const facts = createFacts(rawFacts);

        // Template with multiple variables
        const template = '%{facts.os.family}/%{facts.os.name}/%{facts.hostname}.yaml';
        const result = parser.interpolatePath(template, facts);
        expect(result).toBe(`${rawFacts.os.family}/${rawFacts.os.name}/${rawFacts.hostname}.yaml`);
      }),
      propertyTestConfig
    );
  });

  it('should preserve unresolved variables when fact is not found', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    fc.assert(
      fc.property(simpleFacts, (rawFacts) => {
        const facts = createFacts(rawFacts);

        // Template with non-existent fact
        const template = 'nodes/%{facts.nonexistent_fact}.yaml';
        const result = parser.interpolatePath(template, facts);

        // Should preserve the original variable syntax when fact doesn't exist
        expect(result).toBe('nodes/%{facts.nonexistent_fact}.yaml');
      }),
      propertyTestConfig
    );
  });

  it('should handle paths without variables unchanged', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    fc.assert(
      fc.property(simpleFacts, (rawFacts) => {
        const facts = createFacts(rawFacts);

        // Template without variables
        const template = 'common/defaults.yaml';
        const result = parser.interpolatePath(template, facts);

        // Should return unchanged
        expect(result).toBe('common/defaults.yaml');
      }),
      propertyTestConfig
    );
  });

  it('should handle mixed variable syntaxes in the same template', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    fc.assert(
      fc.property(
        fc.tuple(nestedFactsArb, trustedFactsArb),
        ([rawFacts, trustedFacts]) => {
          const facts = createFacts({
            ...rawFacts,
            trusted: trustedFacts,
          });

          // Template mixing facts and trusted syntaxes
          const template = '%{facts.os.family}/%{trusted.certname}.yaml';
          const result = parser.interpolatePath(template, facts);
          expect(result).toBe(`${rawFacts.os.family}/${trustedFacts.certname}.yaml`);
        }
      ),
      propertyTestConfig
    );
  });

  it('should correctly interpolate all variables in any valid path template', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    // Generator for path templates with embedded variables
    // When key1 === key2, the second value overwrites the first in the facts object
    const pathTemplateArb = fc.tuple(
      factNameArb,
      factValueArb,
      factNameArb,
      factValueArb,
    ).map(([key1, val1, key2, val2]) => {
      // Build the facts object - if keys are the same, val2 overwrites val1
      const factsObj: Record<string, string | number> = { [key1]: val1, [key2]: val2 };
      // Calculate expected based on actual fact values that will be used
      const expectedVal1 = key1 === key2 ? val2 : val1;
      const expectedVal2 = val2;
      return {
        template: `data/%{facts.${key1}}/%{facts.${key2}}.yaml`,
        facts: factsObj,
        expected: `data/${expectedVal1}/${expectedVal2}.yaml`,
      };
    });

    fc.assert(
      fc.property(pathTemplateArb, ({ template, facts: rawFacts, expected }) => {
        const facts = createFacts(rawFacts);
        const result = parser.interpolatePath(template, facts);
        expect(result).toBe(expected);
      }),
      propertyTestConfig
    );
  });

  it('should handle deeply nested fact paths', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    fc.assert(
      fc.property(
        fc.tuple(factValueArb, factValueArb, factValueArb),
        ([level1, level2, level3]) => {
          const rawFacts = {
            deep: {
              nested: {
                value: level1,
                another: {
                  level: level2,
                },
              },
            },
            simple: level3,
          };
          const facts = createFacts(rawFacts);

          // Test deeply nested path
          const template1 = 'data/%{facts.deep.nested.value}.yaml';
          const result1 = parser.interpolatePath(template1, facts);
          expect(result1).toBe(`data/${level1}.yaml`);

          // Test even deeper nesting
          const template2 = 'data/%{facts.deep.nested.another.level}.yaml';
          const result2 = parser.interpolatePath(template2, facts);
          expect(result2).toBe(`data/${level2}.yaml`);
        }
      ),
      propertyTestConfig
    );
  });

  it('should handle simple variable syntax without prefix', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    fc.assert(
      fc.property(simpleFacts, (rawFacts) => {
        const facts = createFacts(rawFacts);
        const factKeys = Object.keys(rawFacts);

        if (factKeys.length > 0) {
          const key = factKeys[0];
          const template = `data/%{${key}}.yaml`;
          const result = parser.interpolatePath(template, facts);
          expect(result).toBe(`data/${rawFacts[key]}.yaml`);
        }
      }),
      propertyTestConfig
    );
  });

  it('should convert non-string fact values to strings during interpolation', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    fc.assert(
      fc.property(
        fc.tuple(fc.integer({ min: 0, max: 1000 }), fc.boolean()),
        ([numValue, boolValue]) => {
          const rawFacts = {
            port: numValue,
            enabled: boolValue,
          };
          const facts = createFacts(rawFacts);

          // Test with integer value
          const template1 = 'ports/%{facts.port}.yaml';
          const result1 = parser.interpolatePath(template1, facts);
          expect(result1).toBe(`ports/${numValue}.yaml`);

          // Test with boolean value
          const template2 = 'flags/%{facts.enabled}.yaml';
          const result2 = parser.interpolatePath(template2, facts);
          expect(result2).toBe(`flags/${boolValue}.yaml`);
        }
      ),
      propertyTestConfig
    );
  });
});
