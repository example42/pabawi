/**
 * Toast notification system using Svelte 5 runes
 */

export interface Toast {
  id: string;
  type: "success" | "error" | "info" | "warning";
  message: string;
  details?: string;
  duration?: number;
  dismissible?: boolean;
}

interface ToastState {
  toasts: Toast[];
}

// Create reactive state for toasts
const state = $state<ToastState>({
  toasts: [],
});

let nextId = 0;

/**
 * Add a toast notification
 */
export function addToast(
  type: Toast["type"],
  message: string,
  options?: {
    details?: string;
    duration?: number;
    dismissible?: boolean;
  },
): string {
  const id = `toast-${String(nextId++)}`;

  // Determine duration based on type:
  // - Error notifications: 0 (no auto-dismiss, remain until user dismisses)
  // - Success notifications: 5000ms (5 seconds)
  // - Other types: 3000ms (3 seconds)
  let defaultDuration: number;
  if (type === "error") {
    defaultDuration = 0; // No auto-dismiss for errors
  } else if (type === "success") {
    defaultDuration = 5000; // 5 seconds for success
  } else {
    defaultDuration = 3000; // 3 seconds for info/warning
  }

  const toast: Toast = {
    id,
    type,
    message,
    details: options?.details,
    duration: options?.duration ?? defaultDuration,
    dismissible: options?.dismissible ?? true,
  };

  state.toasts = [...state.toasts, toast];

  // Log errors to console for debugging
  if (type === "error") {
    console.error(`[Toast Error] ${message}`, options?.details ? `\nDetails: ${options.details}` : '');
  }

  // Auto-dismiss after duration (if duration > 0)
  if (toast.duration && toast.duration > 0) {
    setTimeout(() => {
      removeToast(id);
    }, toast.duration);
  }

  return id;
}

/**
 * Remove a toast notification
 */
export function removeToast(id: string): void {
  state.toasts = state.toasts.filter((t) => t.id !== id);
}

/**
 * Show success toast
 */
export function showSuccess(message: string, details?: string): string {
  return addToast("success", message, { details });
}

/**
 * Show error toast
 */
export function showError(message: string, details?: string): string {
  return addToast("error", message, { details, duration: 0 }); // duration: 0 means no auto-dismiss
}

/**
 * Show info toast
 */
export function showInfo(message: string, details?: string): string {
  return addToast("info", message, { details });
}

/**
 * Show warning toast
 */
export function showWarning(message: string, details?: string): string {
  return addToast("warning", message, { details, duration: 4000 });
}

/**
 * Clear all toasts
 */
export function clearAllToasts(): void {
  state.toasts = [];
}

/**
 * Get all toasts (reactive)
 */
export function getToasts(): Toast[] {
  return state.toasts;
}
