/**
 * Feature: pabawi-v0.5.0-release, Property 1: Integration Color Consistency
 * Validates: Requirements 1.2, 1.3, 1.4
 *
 * This property test verifies that:
 * For any UI element that displays integration-attributed data, all elements
 * associated with the same integration should use the same color values
 * (primary, light, dark) consistently across labels, badges, tabs, and status indicators.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { IntegrationColorService } from '../../../src/services/IntegrationColorService';

describe('Property 1: Integration Color Consistency', () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  // Generator for valid integration names
  const validIntegrationArb = fc.constantFrom('bolt', 'puppetdb', 'puppetserver', 'hiera');

  // Generator for UI element types that use integration colors
  const uiElementTypeArb = fc.constantFrom('badge', 'label', 'dot', 'tab', 'indicator', 'status');

  it('should return consistent colors for the same integration across multiple calls', () => {
    const service = new IntegrationColorService();

    fc.assert(
      fc.property(
        validIntegrationArb,
        fc.integer({ min: 2, max: 10 }), // Number of times to call getColor
        (integration, callCount) => {
          // Get color multiple times for the same integration
          const colors = Array.from({ length: callCount }, () =>
            service.getColor(integration)
          );

          // All calls should return the same color values
          const firstColor = colors[0];
          return colors.every(color =>
            color.primary === firstColor.primary &&
            color.light === firstColor.light &&
            color.dark === firstColor.dark
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should return consistent colors regardless of case sensitivity', () => {
    const service = new IntegrationColorService();

    fc.assert(
      fc.property(
        validIntegrationArb,
        (integration) => {
          // Get colors with different case variations
          const lowerCase = service.getColor(integration.toLowerCase());
          const upperCase = service.getColor(integration.toUpperCase());
          const mixedCase = service.getColor(
            integration.charAt(0).toUpperCase() + integration.slice(1).toLowerCase()
          );

          // All variations should return identical colors
          return (
            lowerCase.primary === upperCase.primary &&
            lowerCase.primary === mixedCase.primary &&
            lowerCase.light === upperCase.light &&
            lowerCase.light === mixedCase.light &&
            lowerCase.dark === upperCase.dark &&
            lowerCase.dark === mixedCase.dark
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain color consistency across simulated UI element rendering', () => {
    const service = new IntegrationColorService();

    fc.assert(
      fc.property(
        validIntegrationArb,
        fc.array(uiElementTypeArb, { minLength: 1, maxLength: 6 }),
        (integration, elementTypes) => {
          // Simulate getting colors for different UI element types
          // In a real UI, each element type would call getColor for the same integration
          const expectedColor = service.getColor(integration);

          // All UI elements for this integration should use the same color
          const elementColors = elementTypes.map(() => service.getColor(integration));

          return elementColors.every(color =>
            color.primary === expectedColor.primary &&
            color.light === expectedColor.light &&
            color.dark === expectedColor.dark
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should ensure each integration has distinct primary colors', () => {
    const service = new IntegrationColorService();

    fc.assert(
      fc.property(
        fc.array(validIntegrationArb, { minLength: 2, maxLength: 4 }).map(arr => [...new Set(arr)]),
        (integrations) => {
          // Get colors for all integrations
          const colors = integrations.map(integration => service.getColor(integration));

          // Extract primary colors
          const primaryColors = colors.map(c => c.primary);

          // All primary colors should be unique (no duplicates)
          const uniquePrimaryColors = new Set(primaryColors);
          return uniquePrimaryColors.size === primaryColors.length;
        }
      ),
      propertyTestConfig
    );
  });

  it('should return valid hex color format for all color variants', () => {
    const service = new IntegrationColorService();
    const hexColorRegex = /^#[0-9A-F]{6}$/i;

    fc.assert(
      fc.property(
        validIntegrationArb,
        (integration) => {
          const color = service.getColor(integration);

          // All color variants should be valid hex colors
          return (
            hexColorRegex.test(color.primary) &&
            hexColorRegex.test(color.light) &&
            hexColorRegex.test(color.dark)
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should return consistent default color for any unknown integration', () => {
    const service = new IntegrationColorService();

    // Generator for invalid/unknown integration names
    const unknownIntegrationArb = fc.string({ minLength: 1, maxLength: 20 })
      .filter(s => !['bolt', 'puppetdb', 'puppetserver', 'hiera'].includes(s.toLowerCase()));

    fc.assert(
      fc.property(
        unknownIntegrationArb,
        fc.integer({ min: 2, max: 5 }),
        (unknownIntegration, callCount) => {
          // Get color multiple times for unknown integration
          const colors = Array.from({ length: callCount }, () =>
            service.getColor(unknownIntegration)
          );

          // All calls should return the same default color
          const firstColor = colors[0];
          return colors.every(color =>
            color.primary === firstColor.primary &&
            color.light === firstColor.light &&
            color.dark === firstColor.dark
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should maintain color consistency when getAllColors is called multiple times', () => {
    const service = new IntegrationColorService();

    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        (callCount) => {
          // Get all colors multiple times
          const allColorsCalls = Array.from({ length: callCount }, () =>
            service.getAllColors()
          );

          // Compare each call with the first one
          const firstCall = allColorsCalls[0];
          return allColorsCalls.every(colors => {
            // Check each integration's colors match
            return (
              colors.bolt.primary === firstCall.bolt.primary &&
              colors.bolt.light === firstCall.bolt.light &&
              colors.bolt.dark === firstCall.bolt.dark &&
              colors.puppetdb.primary === firstCall.puppetdb.primary &&
              colors.puppetdb.light === firstCall.puppetdb.light &&
              colors.puppetdb.dark === firstCall.puppetdb.dark &&
              colors.puppetserver.primary === firstCall.puppetserver.primary &&
              colors.puppetserver.light === firstCall.puppetserver.light &&
              colors.puppetserver.dark === firstCall.puppetserver.dark &&
              colors.hiera.primary === firstCall.hiera.primary &&
              colors.hiera.light === firstCall.hiera.light &&
              colors.hiera.dark === firstCall.hiera.dark
            );
          });
        }
      ),
      propertyTestConfig
    );
  });

  it('should ensure color consistency between getColor and getAllColors', () => {
    const service = new IntegrationColorService();

    fc.assert(
      fc.property(
        validIntegrationArb,
        (integration) => {
          // Get color via getColor
          const individualColor = service.getColor(integration);

          // Get color via getAllColors
          const allColors = service.getAllColors();
          const colorFromAll = allColors[integration as keyof typeof allColors];

          // Both methods should return identical colors
          return (
            individualColor.primary === colorFromAll.primary &&
            individualColor.light === colorFromAll.light &&
            individualColor.dark === colorFromAll.dark
          );
        }
      ),
      propertyTestConfig
    );
  });
});
