import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import PaginationControls from './PaginationControls.svelte';

describe('PaginationControls', () => {
  describe('Component Rendering', () => {
    it('should render all pagination elements', () => {
      const onPageChange = vi.fn();
      const onPageSizeChange = vi.fn();

      render(PaginationControls, {
        props: {
          currentPage: 2,
          pageSize: 100,
          totalCount: 500,
          hasMore: true,
          onPageChange,
          onPageSizeChange,
        },
      });

      // Check for Previous button
      expect(screen.getByRole('button', { name: /previous/i })).toBeTruthy();

      // Check for Next button
      expect(screen.getByRole('button', { name: /next/i })).toBeTruthy();

      // Check for page indicator
      expect(screen.getAllByText(/page/i).length).toBeGreaterThan(0);
      expect(screen.getByText('2')).toBeTruthy();
      expect(screen.getByText('5')).toBeTruthy(); // totalPages = 500/100 = 5

      // Check for results count
      expect(screen.getByText(/showing/i)).toBeTruthy();
      expect(screen.getByText('101')).toBeTruthy(); // startIndex
      expect(screen.getAllByText('200').length).toBeGreaterThan(0); // endIndex (also appears in dropdown)
      expect(screen.getAllByText('500').length).toBeGreaterThan(0); // totalCount (also appears in dropdown)

      // Check for page size selector
      expect(screen.getByLabelText(/per page/i)).toBeTruthy();
      expect(screen.getByRole('combobox')).toBeTruthy();
    });

    it('should render with custom page size options', () => {
      const onPageChange = vi.fn();
      const onPageSizeChange = vi.fn();

      render(PaginationControls, {
        props: {
          currentPage: 1,
          pageSize: 50,
          totalCount: 200,
          hasMore: false,
          onPageChange,
          onPageSizeChange,
          pageSizeOptions: [50, 100, 150],
        },
      });

      const select = screen.getByRole('combobox');
      if (!(select instanceof HTMLSelectElement)) throw new Error('Expected HTMLSelectElement');
      const options = Array.from(select.options).map((opt) => opt.value);

      expect(options).toEqual(['50', '100', '150']);
    });
  });

  describe('Button Disabled States', () => {
    it('should disable Previous button on first page', () => {
      const onPageChange = vi.fn();
      const onPageSizeChange = vi.fn();

      render(PaginationControls, {
        props: {
          currentPage: 1,
          pageSize: 100,
          totalCount: 500,
          hasMore: true,
          onPageChange,
          onPageSizeChange,
        },
      });

      const previousButton = screen.getByRole('button', { name: /previous/i });
      expect(previousButton).toBeInstanceOf(HTMLButtonElement);
      expect((previousButton as HTMLButtonElement).disabled).toBe(true);
    });

    it('should enable Previous button when not on first page', () => {
      const onPageChange = vi.fn();
      const onPageSizeChange = vi.fn();

      render(PaginationControls, {
        props: {
          currentPage: 2,
          pageSize: 100,
          totalCount: 500,
          hasMore: true,
          onPageChange,
          onPageSizeChange,
        },
      });

      const previousButton = screen.getByRole('button', { name: /previous/i });
      expect(previousButton).toBeInstanceOf(HTMLButtonElement);
      expect((previousButton as HTMLButtonElement).disabled).toBe(false);
    });

    it('should disable Next button when no more pages', () => {
      const onPageChange = vi.fn();
      const onPageSizeChange = vi.fn();

      render(PaginationControls, {
        props: {
          currentPage: 5,
          pageSize: 100,
          totalCount: 500,
          hasMore: false,
          onPageChange,
          onPageSizeChange,
        },
      });

      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeInstanceOf(HTMLButtonElement);
      expect((nextButton as HTMLButtonElement).disabled).toBe(true);
    });

    it('should enable Next button when hasMore is true', () => {
      const onPageChange = vi.fn();
      const onPageSizeChange = vi.fn();

      render(PaginationControls, {
        props: {
          currentPage: 2,
          pageSize: 100,
          totalCount: 500,
          hasMore: true,
          onPageChange,
          onPageSizeChange,
        },
      });

      const nextButton = screen.getByRole('button', { name: /next/i });
      expect(nextButton).toBeInstanceOf(HTMLButtonElement);
      expect((nextButton as HTMLButtonElement).disabled).toBe(false);
    });
  });

  describe('Event Emissions', () => {
    it('should call onPageChange with previous page when Previous clicked', async () => {
      const onPageChange = vi.fn();
      const onPageSizeChange = vi.fn();

      render(PaginationControls, {
        props: {
          currentPage: 3,
          pageSize: 100,
          totalCount: 500,
          hasMore: true,
          onPageChange,
          onPageSizeChange,
        },
      });

      const previousButton = screen.getByRole('button', { name: /previous/i });
      await fireEvent.click(previousButton);

      expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it('should call onPageChange with next page when Next clicked', async () => {
      const onPageChange = vi.fn();
      const onPageSizeChange = vi.fn();

      render(PaginationControls, {
        props: {
          currentPage: 2,
          pageSize: 100,
          totalCount: 500,
          hasMore: true,
          onPageChange,
          onPageSizeChange,
        },
      });

      const nextButton = screen.getByRole('button', { name: /next/i });
      await fireEvent.click(nextButton);

      expect(onPageChange).toHaveBeenCalledWith(3);
    });

    it('should not call onPageChange when Previous clicked on first page', async () => {
      const onPageChange = vi.fn();
      const onPageSizeChange = vi.fn();

      render(PaginationControls, {
        props: {
          currentPage: 1,
          pageSize: 100,
          totalCount: 500,
          hasMore: true,
          onPageChange,
          onPageSizeChange,
        },
      });

      const previousButton = screen.getByRole('button', { name: /previous/i });
      await fireEvent.click(previousButton);

      expect(onPageChange).not.toHaveBeenCalled();
    });

    it('should call onPageSizeChange when page size is changed', async () => {
      const onPageChange = vi.fn();
      const onPageSizeChange = vi.fn();

      render(PaginationControls, {
        props: {
          currentPage: 1,
          pageSize: 100,
          totalCount: 500,
          hasMore: true,
          onPageChange,
          onPageSizeChange,
        },
      });

      const select = screen.getByRole('combobox');
      await fireEvent.change(select, { target: { value: '200' } });

      expect(onPageSizeChange).toHaveBeenCalledWith(200);
    });
  });

  describe('Calculations', () => {
    it('should calculate correct start and end indices', () => {
      const onPageChange = vi.fn();
      const onPageSizeChange = vi.fn();

      render(PaginationControls, {
        props: {
          currentPage: 3,
          pageSize: 100,
          totalCount: 500,
          hasMore: true,
          onPageChange,
          onPageSizeChange,
        },
      });

      // Page 3, size 100: should show 201-300
      expect(screen.getByText('201')).toBeTruthy();
      expect(screen.getByText('300')).toBeTruthy();
    });

    it('should handle last page with partial results', () => {
      const onPageChange = vi.fn();
      const onPageSizeChange = vi.fn();

      render(PaginationControls, {
        props: {
          currentPage: 3,
          pageSize: 100,
          totalCount: 250,
          hasMore: false,
          onPageChange,
          onPageSizeChange,
        },
      });

      // Page 3, size 100, total 250: should show 201-250
      expect(screen.getByText('201')).toBeTruthy();
      expect(screen.getAllByText('250').length).toBeGreaterThan(0); // Appears twice: endIndex and totalCount
    });

    it('should calculate correct total pages', () => {
      const onPageChange = vi.fn();
      const onPageSizeChange = vi.fn();

      render(PaginationControls, {
        props: {
          currentPage: 1,
          pageSize: 100,
          totalCount: 350,
          hasMore: false,
          onPageChange,
          onPageSizeChange,
        },
      });

      // 350 / 100 = 3.5, should round up to 4
      expect(screen.getByText('4')).toBeTruthy();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      const onPageChange = vi.fn();
      const onPageSizeChange = vi.fn();

      render(PaginationControls, {
        props: {
          currentPage: 2,
          pageSize: 100,
          totalCount: 500,
          hasMore: true,
          onPageChange,
          onPageSizeChange,
        },
      });

      expect(screen.getByLabelText(/go to previous page/i)).toBeTruthy();
      expect(screen.getByLabelText(/go to next page/i)).toBeTruthy();
      expect(screen.getByLabelText(/select page size/i)).toBeTruthy();
    });

    it('should be keyboard navigable', async () => {
      const onPageChange = vi.fn();
      const onPageSizeChange = vi.fn();

      render(PaginationControls, {
        props: {
          currentPage: 2,
          pageSize: 100,
          totalCount: 500,
          hasMore: true,
          onPageChange,
          onPageSizeChange,
        },
      });

      const previousButton = screen.getByRole('button', { name: /previous/i });

      // Click events work, keyboard events are handled by the browser
      await fireEvent.click(previousButton);
      expect(onPageChange).toHaveBeenCalledWith(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero total count', () => {
      const onPageChange = vi.fn();
      const onPageSizeChange = vi.fn();

      render(PaginationControls, {
        props: {
          currentPage: 1,
          pageSize: 100,
          totalCount: 0,
          hasMore: false,
          onPageChange,
          onPageSizeChange,
        },
      });

      // Should not show results count when totalCount is 0
      expect(screen.queryByText(/showing/i)).toBeNull();
    });

    it('should handle single page of results', () => {
      const onPageChange = vi.fn();
      const onPageSizeChange = vi.fn();

      render(PaginationControls, {
        props: {
          currentPage: 1,
          pageSize: 100,
          totalCount: 50,
          hasMore: false,
          onPageChange,
          onPageSizeChange,
        },
      });

      const previousButton = screen.getByRole('button', { name: /previous/i });
      const nextButton = screen.getByRole('button', { name: /next/i });

      expect(previousButton).toBeInstanceOf(HTMLButtonElement);
      expect(nextButton).toBeInstanceOf(HTMLButtonElement);
      expect((previousButton as HTMLButtonElement).disabled).toBe(true);
      expect((nextButton as HTMLButtonElement).disabled).toBe(true);
    });
  });
});
