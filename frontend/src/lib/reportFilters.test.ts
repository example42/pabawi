import { describe, it, expect, beforeEach } from 'vitest';
import { reportFilters } from './reportFilters.svelte';

describe('ReportFilterStore', () => {
  beforeEach(() => {
    // Clear sessionStorage before each test
    sessionStorage.clear();
    // Reset filters
    reportFilters.clearFilters();
  });

  describe('setFilter', () => {
    it('should set status filter', () => {
      reportFilters.setFilter('status', ['changed', 'failed']);
      const filters = reportFilters.getFilters();
      expect(filters.status).toEqual(['changed', 'failed']);
    });

    it('should set minDuration filter', () => {
      reportFilters.setFilter('minDuration', 300);
      const filters = reportFilters.getFilters();
      expect(filters.minDuration).toBe(300);
    });

    it('should set minCompileTime filter', () => {
      reportFilters.setFilter('minCompileTime', 60);
      const filters = reportFilters.getFilters();
      expect(filters.minCompileTime).toBe(60);
    });

    it('should set minTotalResources filter', () => {
      reportFilters.setFilter('minTotalResources', 100);
      const filters = reportFilters.getFilters();
      expect(filters.minTotalResources).toBe(100);
    });

    it('should set multiple filters', () => {
      reportFilters.setFilter('status', ['changed']);
      reportFilters.setFilter('minDuration', 300);
      reportFilters.setFilter('minCompileTime', 60);

      const filters = reportFilters.getFilters();
      expect(filters.status).toEqual(['changed']);
      expect(filters.minDuration).toBe(300);
      expect(filters.minCompileTime).toBe(60);
    });

    it('should clear individual filter by setting undefined', () => {
      reportFilters.setFilter('minDuration', 300);
      reportFilters.setFilter('minDuration', undefined);

      const filters = reportFilters.getFilters();
      expect(filters.minDuration).toBeUndefined();
    });
  });

  describe('clearFilters', () => {
    it('should clear all filters', () => {
      reportFilters.setFilter('status', ['changed', 'failed']);
      reportFilters.setFilter('minDuration', 300);
      reportFilters.setFilter('minCompileTime', 60);

      reportFilters.clearFilters();

      const filters = reportFilters.getFilters();
      expect(filters).toEqual({});
    });
  });

  describe('getFilters', () => {
    it('should return a copy of filters', () => {
      reportFilters.setFilter('status', ['changed']);

      const filters1 = reportFilters.getFilters();
      const filters2 = reportFilters.getFilters();

      // Should be equal but not the same object
      expect(filters1).toEqual(filters2);
      expect(filters1).not.toBe(filters2);
    });
  });

  describe('session persistence', () => {
    it('should persist filters to sessionStorage', () => {
      reportFilters.setFilter('status', ['changed', 'failed']);
      reportFilters.setFilter('minDuration', 300);

      const stored = sessionStorage.getItem('pabawi_report_filters');
      expect(stored).toBeTruthy();

      const parsed = JSON.parse(stored ?? '{}') as { status?: string[]; minDuration?: number };
      expect(parsed.status).toEqual(['changed', 'failed']);
      expect(parsed.minDuration).toBe(300);
    });

    it('should update sessionStorage when filters change', () => {
      reportFilters.setFilter('status', ['changed']);
      let stored = sessionStorage.getItem('pabawi_report_filters');
      let parsed = JSON.parse(stored ?? '{}') as { status?: string[]; minDuration?: number };
      expect(parsed.status).toEqual(['changed']);

      reportFilters.setFilter('minDuration', 500);
      stored = sessionStorage.getItem('pabawi_report_filters');
      parsed = JSON.parse(stored ?? '{}') as { status?: string[]; minDuration?: number };
      expect(parsed.status).toEqual(['changed']);
      expect(parsed.minDuration).toBe(500);
    });

    it('should clear sessionStorage when filters are cleared', () => {
      reportFilters.setFilter('status', ['changed']);
      expect(sessionStorage.getItem('pabawi_report_filters')).toBeTruthy();

      reportFilters.clearFilters();

      const stored = sessionStorage.getItem('pabawi_report_filters');
      const parsed = JSON.parse(stored ?? '{}') as Record<string, unknown>;
      expect(parsed).toEqual({});
    });

    it('should persist all filter types to sessionStorage', () => {
      reportFilters.setFilter('status', ['changed', 'failed']);
      reportFilters.setFilter('minDuration', 300);
      reportFilters.setFilter('minCompileTime', 60);
      reportFilters.setFilter('minTotalResources', 100);

      const stored = sessionStorage.getItem('pabawi_report_filters');
      const parsed = JSON.parse(stored ?? '{}') as { status?: string[]; minDuration?: number; minCompileTime?: number; minTotalResources?: number };

      expect(parsed.status).toEqual(['changed', 'failed']);
      expect(parsed.minDuration).toBe(300);
      expect(parsed.minCompileTime).toBe(60);
      expect(parsed.minTotalResources).toBe(100);
    });
  });

  describe('edge cases', () => {
    it('should handle empty status array', () => {
      reportFilters.setFilter('status', []);
      const filters = reportFilters.getFilters();
      expect(filters.status).toEqual([]);
    });

    it('should handle zero values for numeric filters', () => {
      reportFilters.setFilter('minDuration', 0);
      reportFilters.setFilter('minCompileTime', 0);
      reportFilters.setFilter('minTotalResources', 0);

      const filters = reportFilters.getFilters();
      expect(filters.minDuration).toBe(0);
      expect(filters.minCompileTime).toBe(0);
      expect(filters.minTotalResources).toBe(0);
    });
  });
});
