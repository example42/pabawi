/**
 * Accessibility utilities and CSS class patterns for consistent UI interactions
 *
 * This file documents the standard patterns used throughout the application
 * for hover states, focus indicators, and keyboard navigation.
 */

/**
 * Standard button classes with hover and focus states
 */
export const buttonClasses = {
  primary:
    "rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
  secondary:
    "rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700",
  danger:
    "rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
  ghost:
    "rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:text-gray-300 dark:hover:bg-gray-800",
};

/**
 * Standard input classes with focus states
 */
export const inputClasses = {
  base: "block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500",
  error:
    "block w-full rounded-lg border border-red-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 dark:border-red-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500",
};

/**
 * Standard link classes with hover states
 */
export const linkClasses = {
  base: "text-blue-600 hover:text-blue-700 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:text-blue-400 dark:hover:text-blue-300",
  subtle:
    "text-gray-600 hover:text-gray-900 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:text-gray-400 dark:hover:text-gray-200",
};

/**
 * Standard card/container classes with hover states for interactive elements
 */
export const cardClasses = {
  base: "rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800",
  interactive:
    "rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-blue-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-400",
};

/**
 * Keyboard navigation helpers
 */
export const keyboardHandlers = {
  /**
   * Handle Enter and Space key presses for custom interactive elements
   */
  activateOnEnterOrSpace:
    (callback: () => void) =>
    (event: KeyboardEvent): void => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        callback();
      }
    },

  /**
   * Handle Escape key press
   */
  closeOnEscape:
    (callback: () => void) =>
    (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        callback();
      }
    },

  /**
   * Handle arrow key navigation in lists
   */
  navigateList:
    (
      currentIndex: number,
      listLength: number,
      onNavigate: (newIndex: number) => void,
    ) =>
    (event: KeyboardEvent): void => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        onNavigate(Math.min(currentIndex + 1, listLength - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        onNavigate(Math.max(currentIndex - 1, 0));
      } else if (event.key === "Home") {
        event.preventDefault();
        onNavigate(0);
      } else if (event.key === "End") {
        event.preventDefault();
        onNavigate(listLength - 1);
      }
    },
};

/**
 * ARIA attributes helpers
 */
export const ariaHelpers = {
  /**
   * Get ARIA attributes for a button that controls a disclosure (e.g., dropdown, modal)
   */
  disclosure: (
    isExpanded: boolean,
    controlsId: string,
  ): Record<string, boolean | string> => ({
    "aria-expanded": isExpanded,
    "aria-controls": controlsId,
  }),

  /**
   * Get ARIA attributes for a tab
   */
  tab: (
    isSelected: boolean,
    controlsId: string,
  ): Record<string, string | boolean | number> => ({
    role: "tab",
    "aria-selected": isSelected,
    "aria-controls": controlsId,
    tabindex: isSelected ? 0 : -1,
  }),

  /**
   * Get ARIA attributes for a tab panel
   */
  tabPanel: (labelledById: string): Record<string, string | number> => ({
    role: "tabpanel",
    "aria-labelledby": labelledById,
    tabindex: 0,
  }),
};

/**
 * Focus management utilities
 */
export const focusManagement = {
  /**
   * Trap focus within a container (useful for modals)
   */
  trapFocus: (container: HTMLElement): ((event: KeyboardEvent) => void) => {
    const focusableElements = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    return (event: KeyboardEvent): void => {
      if (event.key !== "Tab") return;

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };
  },

  /**
   * Return focus to a previously focused element
   */
  returnFocus: (element: HTMLElement | null): void => {
    if (element && typeof element.focus === "function") {
      element.focus();
    }
  },
};
