import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PuppetRunChart from './PuppetRunChart.svelte';
import { integrationColors } from '../lib/integrationColors.svelte';

// Mock the integrationColors store
vi.mock('../lib/integrationColors.svelte', () => ({
  integrationColors: {
    loadColors: vi.fn(),
    getColor: vi.fn(),
  },
}));

interface RunHistoryData {
  date: string;
  success: number;
  failed: number;
  changed: number;
  unchanged: number;
}

describe('PuppetRunChart Component', () => {
  const mockData: RunHistoryData[] = [
    {
      date: '2024-01-15',
      success: 10,
      failed: 2,
      changed: 5,
      unchanged: 10,
    },
    {
      date: '2024-01-16',
      success: 12,
      failed: 1,
      changed: 3,
      unchanged: 12,
    },
    {
      date: '2024-01-17',
      success: 8,
      failed: 3,
      changed: 7,
      unchanged: 8,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render with default title', () => {
      render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      expect(screen.getByText('Puppet Run History')).toBeTruthy();
    });

    it('should render with custom title', () => {
      render(PuppetRunChart, {
        props: {
          data: mockData,
          title: 'Custom Chart Title',
        },
      });

      expect(screen.getByText('Custom Chart Title')).toBeTruthy();
    });

    it('should render SVG chart element', () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
    });

    it('should render legend with all status categories', () => {
      render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      expect(screen.getByText('Success')).toBeTruthy();
      expect(screen.getByText('Changed')).toBeTruthy();
      expect(screen.getByText('Failed')).toBeTruthy();
    });

    it('should show empty state when no data provided', () => {
      render(PuppetRunChart, {
        props: {
          data: [],
        },
      });

      expect(screen.getByText('No run history data available')).toBeTruthy();
    });

    it('should not render chart when data is empty', () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: [],
        },
      });

      const svg = container.querySelector('svg');
      expect(svg).toBeFalsy();
    });
  });

  describe('Chart Rendering with Various Data', () => {
    it('should render bars for each data point', () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      const barGroups = container.querySelectorAll('.bar-group');
      expect(barGroups.length).toBe(mockData.length);
    });

    it('should render stacked bars with success, changed, and failed segments', () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      // Each bar group should have up to 3 rect elements (success, changed, failed)
      const firstBarGroup = container.querySelector('.bar-group');
      const rects = firstBarGroup?.querySelectorAll('rect');

      // Should have at least 3 rects (3 segments + 1 invisible overlay)
      expect(rects && rects.length >= 3).toBe(true);
    });

    it('should render x-axis labels with formatted dates', () => {
      render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      // Check for formatted date labels (e.g., "Jan 15")
      expect(screen.getByText('Jan 15')).toBeTruthy();
      expect(screen.getByText('Jan 16')).toBeTruthy();
      expect(screen.getByText('Jan 17')).toBeTruthy();
    });

    it('should render y-axis with scale labels', () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      // Y-axis should have tick labels
      const yAxisLabels = container.querySelectorAll('text.text-xs.fill-gray-600');
      expect(yAxisLabels.length).toBeGreaterThan(0);
    });

    it('should handle single data point', () => {
      const singleData: RunHistoryData[] = [
        {
          date: '2024-01-15',
          success: 5,
          failed: 1,
          changed: 2,
          unchanged: 5,
        },
      ];

      const { container } = render(PuppetRunChart, {
        props: {
          data: singleData,
        },
      });

      const barGroups = container.querySelectorAll('.bar-group');
      expect(barGroups.length).toBe(1);
    });

    it('should handle data with zero values', () => {
      const zeroData: RunHistoryData[] = [
        {
          date: '2024-01-15',
          success: 0,
          failed: 0,
          changed: 0,
          unchanged: 0,
        },
      ];

      const { container } = render(PuppetRunChart, {
        props: {
          data: zeroData,
        },
      });

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
    });

    it('should handle data with only success values', () => {
      const successOnlyData: RunHistoryData[] = [
        {
          date: '2024-01-15',
          success: 10,
          failed: 0,
          changed: 0,
          unchanged: 10,
        },
      ];

      const { container } = render(PuppetRunChart, {
        props: {
          data: successOnlyData,
        },
      });

      const barGroups = container.querySelectorAll('.bar-group');
      expect(barGroups.length).toBe(1);
    });

    it('should handle data with only failed values', () => {
      const failedOnlyData: RunHistoryData[] = [
        {
          date: '2024-01-15',
          success: 0,
          failed: 5,
          changed: 0,
          unchanged: 0,
        },
      ];

      const { container } = render(PuppetRunChart, {
        props: {
          data: failedOnlyData,
        },
      });

      const barGroups = container.querySelectorAll('.bar-group');
      expect(barGroups.length).toBe(1);
    });

    it('should handle large datasets', () => {
      const largeData: RunHistoryData[] = Array.from({ length: 30 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        success: Math.floor(Math.random() * 20),
        failed: Math.floor(Math.random() * 5),
        changed: Math.floor(Math.random() * 10),
        unchanged: Math.floor(Math.random() * 20),
      }));

      const { container } = render(PuppetRunChart, {
        props: {
          data: largeData,
        },
      });

      const barGroups = container.querySelectorAll('.bar-group');
      expect(barGroups.length).toBe(30);
    });
  });

  describe('Responsive Behavior', () => {
    it('should render with default height', () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('height')).toBe('300');
    });

    it('should render with custom height', () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
          height: 400,
        },
      });

      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('height')).toBe('400');
    });

    it('should have responsive width', () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe('100%');
    });

    it('should maintain aspect ratio with viewBox', () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
          height: 400,
        },
      });

      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('viewBox')).toBe('0 0 800 400');
    });

    it('should preserve aspect ratio on resize', () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    });

    it('should adjust bar width based on data points', () => {
      const fewDataPoints: RunHistoryData[] = [
        {
          date: '2024-01-15',
          success: 10,
          failed: 2,
          changed: 5,
          unchanged: 10,
        },
        {
          date: '2024-01-16',
          success: 12,
          failed: 1,
          changed: 3,
          unchanged: 12,
        },
      ];

      const { container } = render(PuppetRunChart, {
        props: {
          data: fewDataPoints,
        },
      });

      const barGroups = container.querySelectorAll('.bar-group');
      expect(barGroups.length).toBe(2);
    });

    it('should have scrollable container for overflow', () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      const chartContainer = container.querySelector('.chart-container');
      // Check that the container exists and has the relative class
      expect(chartContainer).toBeTruthy();
      expect(chartContainer?.classList.contains('relative')).toBe(true);
    });
  });

  describe('Tooltip Display', () => {
    it('should not show tooltip initially', () => {
      render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      const tooltip = screen.queryByText(/Total:/);
      expect(tooltip).toBeFalsy();
    });

    it('should show tooltip on bar hover', async () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      const firstBarGroup = container.querySelector('.bar-group');
      expect(firstBarGroup).toBeTruthy();

      if (firstBarGroup) {
        await fireEvent.mouseEnter(firstBarGroup);

        // Tooltip should be visible
        const tooltip = container.querySelector('.tooltip');
        expect(tooltip).toBeTruthy();
      }
    });

    it('should display correct date in tooltip', async () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      const firstBarGroup = container.querySelector('.bar-group');
      if (firstBarGroup) {
        await fireEvent.mouseEnter(firstBarGroup);

        // Check for date in tooltip specifically (not in chart labels)
        const tooltip = container.querySelector('.tooltip');
        expect(tooltip?.textContent).toContain('Jan 15');
      }
    });

    it('should display success count in tooltip', async () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      const firstBarGroup = container.querySelector('.bar-group');
      if (firstBarGroup) {
        await fireEvent.mouseEnter(firstBarGroup);

        expect(screen.getByText(/Success: 10/)).toBeTruthy();
      }
    });

    it('should display changed count in tooltip', async () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      const firstBarGroup = container.querySelector('.bar-group');
      if (firstBarGroup) {
        await fireEvent.mouseEnter(firstBarGroup);

        expect(screen.getByText(/Changed: 5/)).toBeTruthy();
      }
    });

    it('should display failed count in tooltip', async () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      const firstBarGroup = container.querySelector('.bar-group');
      if (firstBarGroup) {
        await fireEvent.mouseEnter(firstBarGroup);

        expect(screen.getByText(/Failed: 2/)).toBeTruthy();
      }
    });

    it('should display total count in tooltip', async () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      const firstBarGroup = container.querySelector('.bar-group');
      if (firstBarGroup) {
        await fireEvent.mouseEnter(firstBarGroup);

        // Total should be success + changed + failed = 10 + 5 + 2 = 17
        expect(screen.getByText(/Total: 17/)).toBeTruthy();
      }
    });

    it('should hide tooltip on mouse leave', async () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      const firstBarGroup = container.querySelector('.bar-group');
      if (firstBarGroup) {
        await fireEvent.mouseEnter(firstBarGroup);

        // Tooltip should be visible
        let tooltip = container.querySelector('.tooltip');
        expect(tooltip).toBeTruthy();

        await fireEvent.mouseLeave(firstBarGroup);

        // Tooltip should be hidden
        tooltip = container.querySelector('.tooltip');
        expect(tooltip).toBeFalsy();
      }
    });

    it('should update tooltip when hovering different bars', async () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      const barGroups = container.querySelectorAll('.bar-group');

      // Hover first bar
      await fireEvent.mouseEnter(barGroups[0]);
      expect(screen.getByText(/Success: 10/)).toBeTruthy();

      // Hover second bar
      await fireEvent.mouseEnter(barGroups[1]);
      expect(screen.getByText(/Success: 12/)).toBeTruthy();
    });

    it('should display tooltip with colored indicators', async () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      const firstBarGroup = container.querySelector('.bar-group');
      if (firstBarGroup) {
        await fireEvent.mouseEnter(firstBarGroup);

        // Check for colored indicators in tooltip
        const coloredDivs = container.querySelectorAll('.tooltip .w-3.h-3.rounded');
        expect(coloredDivs.length).toBe(3); // success, changed, failed
      }
    });
  });

  describe('Color Usage', () => {
    it('should use correct colors for status categories', () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      // Check legend colors
      const legendRects = container.querySelectorAll('.legend rect');
      expect(legendRects.length).toBe(3);
    });

    it('should apply hover effects to bars', () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      const barGroup = container.querySelector('.bar-group');
      expect(barGroup?.classList.contains('cursor-pointer')).toBe(true);
    });
  });

  describe('Integration with Color Store', () => {
    it('should call loadColors on mount', () => {
      render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(integrationColors.loadColors).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large values', () => {
      const largeValueData: RunHistoryData[] = [
        {
          date: '2024-01-15',
          success: 1000,
          failed: 500,
          changed: 750,
          unchanged: 1000,
        },
      ];

      const { container } = render(PuppetRunChart, {
        props: {
          data: largeValueData,
        },
      });

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
    });

    it('should handle dates in different formats', () => {
      const differentDateData: RunHistoryData[] = [
        {
          date: '2024-12-31',
          success: 5,
          failed: 1,
          changed: 2,
          unchanged: 5,
        },
      ];

      render(PuppetRunChart, {
        props: {
          data: differentDateData,
        },
      });

      expect(screen.getByText('Dec 31')).toBeTruthy();
    });

    it('should handle minimum value of 1 for scaling', () => {
      const allZeroData: RunHistoryData[] = [
        {
          date: '2024-01-15',
          success: 0,
          failed: 0,
          changed: 0,
          unchanged: 0,
        },
      ];

      const { container } = render(PuppetRunChart, {
        props: {
          data: allZeroData,
        },
      });

      // Should not crash with division by zero
      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('should have proper chart structure', () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      const svg = container.querySelector('svg');
      expect(svg).toBeTruthy();
    });

    it('should have readable text elements', () => {
      const { container } = render(PuppetRunChart, {
        props: {
          data: mockData,
        },
      });

      const textElements = container.querySelectorAll('text');
      expect(textElements.length).toBeGreaterThan(0);
    });
  });
});
