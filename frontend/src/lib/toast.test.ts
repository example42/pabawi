import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { addToast, showSuccess, showError, showInfo, showWarning, getToasts, clearAllToasts } from './toast.svelte';

describe('Toast Notification System', () => {
  beforeEach(() => {
    clearAllToasts();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Notification Persistence Logic', () => {
    it('should auto-dismiss success notifications after 5 seconds', () => {
      showSuccess('Success message');
      expect(getToasts()).toHaveLength(1);

      // Fast-forward 4 seconds - should still be visible
      vi.advanceTimersByTime(4000);
      expect(getToasts()).toHaveLength(1);

      // Fast-forward 1 more second (total 5 seconds) - should be dismissed
      vi.advanceTimersByTime(1000);
      expect(getToasts()).toHaveLength(0);
    });

    it('should NOT auto-dismiss error notifications', () => {
      showError('Error message');
      expect(getToasts()).toHaveLength(1);

      // Fast-forward 10 seconds - should still be visible
      vi.advanceTimersByTime(10000);
      expect(getToasts()).toHaveLength(1);

      // Fast-forward 60 seconds - should still be visible
      vi.advanceTimersByTime(60000);
      expect(getToasts()).toHaveLength(1);
    });

    it('should auto-dismiss info notifications after 3 seconds', () => {
      showInfo('Info message');
      expect(getToasts()).toHaveLength(1);

      // Fast-forward 2 seconds - should still be visible
      vi.advanceTimersByTime(2000);
      expect(getToasts()).toHaveLength(1);

      // Fast-forward 1 more second (total 3 seconds) - should be dismissed
      vi.advanceTimersByTime(1000);
      expect(getToasts()).toHaveLength(0);
    });

    it('should auto-dismiss warning notifications after 4 seconds', () => {
      showWarning('Warning message');
      expect(getToasts()).toHaveLength(1);

      // Fast-forward 3 seconds - should still be visible
      vi.advanceTimersByTime(3000);
      expect(getToasts()).toHaveLength(1);

      // Fast-forward 1 more second (total 4 seconds) - should be dismissed
      vi.advanceTimersByTime(1000);
      expect(getToasts()).toHaveLength(0);
    });
  });

  describe('Error Logging to Console', () => {
    it('should log error notifications to console', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      showError('Error message', 'Detailed error information');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Toast Error] Error message',
        '\nDetails: Detailed error information'
      );

      consoleErrorSpy.mockRestore();
    });

    it('should log error notifications without details to console', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      showError('Error message');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Toast Error] Error message',
        ''
      );

      consoleErrorSpy.mockRestore();
    });

    it('should NOT log non-error notifications to console', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      showSuccess('Success message');
      showInfo('Info message');
      showWarning('Warning message');

      expect(consoleErrorSpy).not.toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Expandable Error Details', () => {
    it('should include details in error toast', () => {
      showError('Error message', 'Detailed error information');
      const toasts = getToasts();

      expect(toasts).toHaveLength(1);
      expect(toasts[0].message).toBe('Error message');
      expect(toasts[0].details).toBe('Detailed error information');
    });

    it('should include details in success toast', () => {
      showSuccess('Success message', 'Additional success details');
      const toasts = getToasts();

      expect(toasts).toHaveLength(1);
      expect(toasts[0].message).toBe('Success message');
      expect(toasts[0].details).toBe('Additional success details');
    });

    it('should handle toasts without details', () => {
      showError('Error message');
      const toasts = getToasts();

      expect(toasts).toHaveLength(1);
      expect(toasts[0].message).toBe('Error message');
      expect(toasts[0].details).toBeUndefined();
    });
  });

  describe('Custom Duration Override', () => {
    it('should allow custom duration for error notifications', () => {
      addToast('error', 'Error message', { duration: 2000 });
      expect(getToasts()).toHaveLength(1);

      // Fast-forward 1 second - should still be visible
      vi.advanceTimersByTime(1000);
      expect(getToasts()).toHaveLength(1);

      // Fast-forward 1 more second (total 2 seconds) - should be dismissed
      vi.advanceTimersByTime(1000);
      expect(getToasts()).toHaveLength(0);
    });

    it('should allow custom duration for success notifications', () => {
      addToast('success', 'Success message', { duration: 10000 });
      expect(getToasts()).toHaveLength(1);

      // Fast-forward 5 seconds - should still be visible
      vi.advanceTimersByTime(5000);
      expect(getToasts()).toHaveLength(1);

      // Fast-forward 5 more seconds (total 10 seconds) - should be dismissed
      vi.advanceTimersByTime(5000);
      expect(getToasts()).toHaveLength(0);
    });
  });
});
