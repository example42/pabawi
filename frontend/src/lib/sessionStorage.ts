/**
 * Session Storage Utilities
 *
 * Provides safe access to sessionStorage with browser environment checks.
 * Used for persisting user preferences during a session (not across browser restarts).
 */

/**
 * Load page size preference from session storage
 * @param key - Storage key
 * @param defaultValue - Default value if not found or invalid
 * @returns The stored page size or default value
 */
export function loadPageSize(key = 'puppetReportsPageSize', defaultValue = 100): number {
  if (typeof window === 'undefined') {
    return defaultValue;
  }

  try {
    const stored = sessionStorage.getItem(key);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed > 0) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn('Failed to load page size from session storage:', error);
  }

  return defaultValue;
}

/**
 * Save page size preference to session storage
 * @param size - Page size to save
 * @param key - Storage key
 */
export function savePageSize(size: number, key = 'puppetReportsPageSize'): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    sessionStorage.setItem(key, size.toString());
  } catch (error) {
    console.warn('Failed to save page size to session storage:', error);
  }
}

/**
 * Generic session storage getter
 * @param key - Storage key
 * @param defaultValue - Default value if not found
 * @returns The stored value or default value
 */
export function getSessionItem(key: string, defaultValue: unknown): unknown {
  if (typeof window === 'undefined') {
    return defaultValue;
  }

  try {
    const stored = sessionStorage.getItem(key);
    if (stored) {
      return JSON.parse(stored) as unknown;
    }
  } catch (error) {
    console.warn(`Failed to load ${key} from session storage:`, error);
  }

  return defaultValue;
}

/**
 * Generic session storage setter
 * @param key - Storage key
 * @param value - Value to store
 */
export function setSessionItem(key: string, value: unknown): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Failed to save ${key} to session storage:`, error);
  }
}

/**
 * Remove item from session storage
 * @param key - Storage key
 */
export function removeSessionItem(key: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    sessionStorage.removeItem(key);
  } catch (error) {
    console.warn(`Failed to remove ${key} from session storage:`, error);
  }
}

/**
 * Clear all session storage
 */
export function clearSessionStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    sessionStorage.clear();
  } catch (error) {
    console.warn('Failed to clear session storage:', error);
  }
}
