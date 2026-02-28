import { describe, it, expect, beforeEach } from 'vitest';
import { IntegrationColorService } from '../../src/services/IntegrationColorService';

describe('IntegrationColorService', () => {
  let service: IntegrationColorService;

  beforeEach(() => {
    service = new IntegrationColorService();
  });

  describe('getColor', () => {
    it('should return correct color for bolt integration', () => {
      const color = service.getColor('bolt');
      expect(color).toEqual({
        primary: '#FFAE1A',
        light: '#FFF4E0',
        dark: '#CC8B15',
      });
    });

    it('should return correct color for puppetdb integration', () => {
      const color = service.getColor('puppetdb');
      expect(color).toEqual({
        primary: '#9063CD',
        light: '#F0E6FF',
        dark: '#7249A8',
      });
    });

    it('should return correct color for puppetserver integration', () => {
      const color = service.getColor('puppetserver');
      expect(color).toEqual({
        primary: '#2E3A87',
        light: '#E8EAFF',
        dark: '#1F2760',
      });
    });

    it('should return correct color for hiera integration', () => {
      const color = service.getColor('hiera');
      expect(color).toEqual({
        primary: '#C1272D',
        light: '#FFE8E9',
        dark: '#9A1F24',
      });
    });

    it('should be case-insensitive', () => {
      const lowerCase = service.getColor('bolt');
      const upperCase = service.getColor('BOLT');
      const mixedCase = service.getColor('BoLt');

      expect(lowerCase).toEqual(upperCase);
      expect(lowerCase).toEqual(mixedCase);
    });

    it('should return default gray color for unknown integration', () => {
      const color = service.getColor('unknown');
      expect(color).toEqual({
        primary: '#6B7280',
        light: '#F3F4F6',
        dark: '#4B5563',
      });
    });

    it('should return default color for empty string', () => {
      const color = service.getColor('');
      expect(color).toEqual({
        primary: '#6B7280',
        light: '#F3F4F6',
        dark: '#4B5563',
      });
    });
  });

  describe('getAllColors', () => {
    it('should return all integration colors', () => {
      const colors = service.getAllColors();
      expect(colors).toHaveProperty('bolt');
      expect(colors).toHaveProperty('puppetdb');
      expect(colors).toHaveProperty('puppetserver');
      expect(colors).toHaveProperty('hiera');
    });

    it('should return a copy of colors (not reference)', () => {
      const colors1 = service.getAllColors();
      const colors2 = service.getAllColors();
      expect(colors1).not.toBe(colors2);
      expect(colors1).toEqual(colors2);
    });
  });

  describe('getValidIntegrations', () => {
    it('should return array of valid integration names', () => {
      const integrations = service.getValidIntegrations();
      expect(integrations).toEqual(['bolt', 'ansible', 'puppetdb', 'puppetserver', 'hiera']);
    });
  });

  describe('color format validation', () => {
    it('should validate all colors are in hex format on initialization', () => {
      // This test passes if constructor doesn't throw
      expect(() => new IntegrationColorService()).not.toThrow();
    });

    it('should have all colors in valid hex format', () => {
      const hexColorRegex = /^#[0-9A-F]{6}$/i;
      const colors = service.getAllColors();

      for (const integration of Object.values(colors)) {
        expect(hexColorRegex.test(integration.primary)).toBe(true);
        expect(hexColorRegex.test(integration.light)).toBe(true);
        expect(hexColorRegex.test(integration.dark)).toBe(true);
      }
    });
  });

  describe('color consistency', () => {
    it('should return same color object for multiple calls with same integration', () => {
      const color1 = service.getColor('bolt');
      const color2 = service.getColor('bolt');
      expect(color1).toEqual(color2);
    });

    it('should have distinct colors for each integration', () => {
      const boltColor = service.getColor('bolt');
      const puppetdbColor = service.getColor('puppetdb');
      const puppetserverColor = service.getColor('puppetserver');
      const hieraColor = service.getColor('hiera');

      // Check that primary colors are all different
      const primaryColors = [
        boltColor.primary,
        puppetdbColor.primary,
        puppetserverColor.primary,
        hieraColor.primary,
      ];
      const uniquePrimaryColors = new Set(primaryColors);
      expect(uniquePrimaryColors.size).toBe(4);
    });
  });
});
