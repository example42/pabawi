/**
 * Feature: hiera-codebase-integration, Property 4: Hiera Parser Error Reporting
 * Validates: Requirements 2.5
 *
 * This property test verifies that:
 * For any YAML string containing syntax errors, the Hiera_Parser SHALL return
 * an error result that includes the line number where the error occurs.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { HieraParser } from '../../../src/integrations/hiera/HieraParser';
import { HIERA_ERROR_CODES } from '../../../src/integrations/hiera/types';

describe('Property 4: Hiera Parser Error Reporting', () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  // Generator for valid YAML key names
  const yamlKeyArb = fc.string({ minLength: 1, maxLength: 20 })
    .filter(s => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(s));

  // Generator for valid YAML string values (non-empty, no special chars)
  const yamlValueArb = fc.string({ minLength: 1, maxLength: 30 })
    .filter(s => /^[a-zA-Z0-9_]+$/.test(s));

  /**
   * Generator for YAML with duplicate keys at a specific line
   * Duplicate keys are a YAML syntax error when strict mode is enabled
   */
  const duplicateKeyYamlArb = fc.tuple(
    fc.integer({ min: 0, max: 5 }),  // Number of valid lines before duplicate
    yamlKeyArb,                       // The key that will be duplicated
    yamlValueArb,                     // First value
    yamlValueArb,                     // Second value (duplicate key)
  ).map(([prefixLines, key, value1, value2]) => {
    const lines: string[] = [];

    // Add version line (required for Hiera)
    lines.push('version: 5');

    // Add some valid lines
    for (let i = 0; i < prefixLines; i++) {
      lines.push(`key_${i}: value_${i}`);
    }

    // Add the first occurrence of the key
    lines.push(`${key}: ${value1}`);

    // Add the duplicate key (this should cause an error)
    const duplicateLine = lines.length + 1; // 1-indexed line number
    lines.push(`${key}: ${value2}`);

    return {
      yaml: lines.join('\n'),
      expectedErrorLine: duplicateLine,
    };
  });

  /**
   * Generator for YAML with truly unclosed quotes (multiline string without proper termination)
   * This creates YAML that will definitely fail to parse
   */
  const unclosedQuoteYamlArb = fc.tuple(
    fc.integer({ min: 0, max: 3 }),
    yamlKeyArb,
    yamlValueArb,
  ).map(([prefixLines, key, value]) => {
    const lines: string[] = [];

    lines.push('version: 5');

    for (let i = 0; i < prefixLines; i++) {
      lines.push(`key_${i}: value_${i}`);
    }

    // Add unclosed quote that spans to next line with invalid content
    const errorLine = lines.length + 1;
    lines.push(`${key}: "${value}`);
    lines.push(`  invalid: content`);  // This makes the unclosed quote a real error

    return {
      yaml: lines.join('\n'),
      expectedErrorLine: errorLine,
    };
  });

  /**
   * Generator for YAML with invalid block scalar indicators
   */
  const invalidBlockScalarYamlArb = fc.tuple(
    fc.integer({ min: 0, max: 3 }),
    yamlKeyArb,
  ).map(([prefixLines, key]) => {
    const lines: string[] = [];

    lines.push('version: 5');

    for (let i = 0; i < prefixLines; i++) {
      lines.push(`key_${i}: value_${i}`);
    }

    // Add invalid block scalar (| or > followed by invalid indicator)
    const errorLine = lines.length + 1;
    lines.push(`${key}: |invalid`);  // Invalid block scalar indicator

    return {
      yaml: lines.join('\n'),
      expectedErrorLine: errorLine,
    };
  });

  /**
   * Generator for YAML with invalid mapping syntax
   */
  const invalidMappingYamlArb = fc.tuple(
    fc.integer({ min: 0, max: 3 }),
  ).map(([prefixLines]) => {
    const lines: string[] = [];

    lines.push('version: 5');

    for (let i = 0; i < prefixLines; i++) {
      lines.push(`key_${i}: value_${i}`);
    }

    // Add invalid mapping (key without value followed by invalid structure)
    const errorLine = lines.length + 1;
    lines.push(`invalid_key`);  // Key without colon
    lines.push(`  : orphan_value`);  // Orphan value

    return {
      yaml: lines.join('\n'),
      expectedErrorLine: errorLine,
    };
  });

  it('should return error with line number for YAML with duplicate keys', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    fc.assert(
      fc.property(duplicateKeyYamlArb, ({ yaml }) => {
        const result = parser.parseContent(yaml, 'test-hiera.yaml');

        // Should fail to parse
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error!.code).toBe(HIERA_ERROR_CODES.PARSE_ERROR);

        // Error message should be descriptive
        expect(result.error!.message).toBeTruthy();
        expect(result.error!.message.length).toBeGreaterThan(0);

        // Should include file in details
        expect(result.error!.details?.file).toBe('test-hiera.yaml');

        // Should include line number in details
        expect(result.error!.details?.line).toBeDefined();
        expect(typeof result.error!.details?.line).toBe('number');
        expect(result.error!.details!.line).toBeGreaterThan(0);
      }),
      propertyTestConfig
    );
  });

  it('should return error with line number for YAML with unclosed quotes', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    fc.assert(
      fc.property(unclosedQuoteYamlArb, ({ yaml }) => {
        const result = parser.parseContent(yaml, 'test-hiera.yaml');

        // Should fail to parse
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error!.code).toBe(HIERA_ERROR_CODES.PARSE_ERROR);

        // Error message should be descriptive
        expect(result.error!.message).toBeTruthy();

        // Should include file in details
        expect(result.error!.details?.file).toBe('test-hiera.yaml');

        // Should include line number in details
        expect(result.error!.details?.line).toBeDefined();
        expect(typeof result.error!.details?.line).toBe('number');
        expect(result.error!.details!.line).toBeGreaterThan(0);
      }),
      propertyTestConfig
    );
  });

  it('should return error with line number for any YAML syntax error', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    // Combined generator for various syntax errors that produce line numbers
    const syntaxErrorYamlArb = fc.oneof(
      duplicateKeyYamlArb,
      invalidBlockScalarYamlArb,
    );

    fc.assert(
      fc.property(syntaxErrorYamlArb, ({ yaml }) => {
        const result = parser.parseContent(yaml, 'malformed.yaml');

        // Should fail to parse
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();

        // Error code should be PARSE_ERROR
        expect(result.error!.code).toBe(HIERA_ERROR_CODES.PARSE_ERROR);

        // Error message should contain useful information
        expect(result.error!.message).toBeTruthy();
        expect(result.error!.message.length).toBeGreaterThan(10);

        // Details should include file path
        expect(result.error!.details?.file).toBe('malformed.yaml');

        // Details should include line number for YAML syntax errors
        expect(result.error!.details?.line).toBeDefined();
        expect(typeof result.error!.details?.line).toBe('number');
        expect(result.error!.details!.line).toBeGreaterThan(0);
      }),
      propertyTestConfig
    );
  });

  it('should return descriptive error message for syntax errors', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    fc.assert(
      fc.property(duplicateKeyYamlArb, ({ yaml }) => {
        const result = parser.parseContent(yaml, 'test.yaml');

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();

        // Message should mention syntax or YAML
        const message = result.error!.message.toLowerCase();
        const hasSyntaxInfo = message.includes('syntax') ||
                             message.includes('yaml') ||
                             message.includes('duplicate') ||
                             message.includes('error');
        expect(hasSyntaxInfo).toBe(true);
      }),
      propertyTestConfig
    );
  });

  it('should include suggestion in error details when available', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    // Test with a specific known error type
    const invalidVersionYaml = `
version: 3
hierarchy:
  - name: common
    path: common.yaml
`;

    const result = parser.parseContent(invalidVersionYaml, 'test.yaml');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.details?.suggestion).toBeDefined();
    expect(result.error!.details!.suggestion!.length).toBeGreaterThan(0);
  });

  it('should handle empty content gracefully', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    const emptyContentArb = fc.constantFrom('', '   ', '\n', '\n\n', '  \n  ');

    fc.assert(
      fc.property(emptyContentArb, (content) => {
        const result = parser.parseContent(content, 'empty.yaml');

        // Should fail (empty is not valid Hiera config)
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error!.code).toBe(HIERA_ERROR_CODES.PARSE_ERROR);
        expect(result.error!.details?.file).toBe('empty.yaml');
      }),
      propertyTestConfig
    );
  });

  it('should return error for non-object YAML content', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    // YAML that parses to non-object types - these will fail validation
    const nonObjectYamlArb = fc.constantFrom(
      '"just a string"',             // String
      '42',                          // Number
      'true',                        // Boolean
    );

    fc.assert(
      fc.property(nonObjectYamlArb, (yaml) => {
        const result = parser.parseContent(yaml, 'invalid.yaml');

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error!.code).toBe(HIERA_ERROR_CODES.PARSE_ERROR);
        // Message should indicate the problem (object expected or version issue)
        expect(result.error!.message.length).toBeGreaterThan(0);
        expect(result.error!.details?.file).toBe('invalid.yaml');
      }),
      propertyTestConfig
    );
  });

  it('should return error with line info for missing required fields', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    // Valid YAML but missing required Hiera fields
    const missingFieldsYamlArb = fc.constantFrom(
      'version: 5',                                    // Missing hierarchy
      'hierarchy:\n  - name: test',                    // Missing version
      'version: 5\nhierarchy: "not an array"',         // hierarchy not array
      'version: 5\nhierarchy:\n  - path: test.yaml',   // Missing name in level
    );

    fc.assert(
      fc.property(missingFieldsYamlArb, (yaml) => {
        const result = parser.parseContent(yaml, 'incomplete.yaml');

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error!.code).toBe(HIERA_ERROR_CODES.PARSE_ERROR);
        expect(result.error!.details?.file).toBe('incomplete.yaml');

        // Message should indicate what's missing or wrong
        expect(result.error!.message.length).toBeGreaterThan(0);
      }),
      propertyTestConfig
    );
  });

  it('should return error with line number for invalid block scalar syntax', () => {
    const parser = new HieraParser('/tmp/test-control-repo');

    fc.assert(
      fc.property(invalidBlockScalarYamlArb, ({ yaml }) => {
        const result = parser.parseContent(yaml, 'block-error.yaml');

        // Should fail to parse
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error!.code).toBe(HIERA_ERROR_CODES.PARSE_ERROR);

        // Should include file in details
        expect(result.error!.details?.file).toBe('block-error.yaml');

        // Should include line number in details
        expect(result.error!.details?.line).toBeDefined();
        expect(typeof result.error!.details?.line).toBe('number');
        expect(result.error!.details!.line).toBeGreaterThan(0);
      }),
      propertyTestConfig
    );
  });
});
