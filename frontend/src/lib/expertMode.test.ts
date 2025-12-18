import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = ((): Storage => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string): string | null => store[key] || null,
    setItem: (key: string, value: string): void => {
      store[key] = value;
    },
    removeItem: (key: string): void => {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete store[key];
    },
    clear: (): void => {
      store = {};
    },
    get length(): number {
      return Object.keys(store).length;
    },
    key: (index: number): string | null => {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
  };
})();

// Setup global mocks
Object.defineProperty(global, 'window', {
  value: {
    localStorage: localStorageMock,
  },
  writable: true,
});

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('ExpertMode Store', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.resetModules();
  });

  it('should initialize with enabled=false when no stored value exists', async (): Promise<void> => {
    const { expertMode } = await import('./expertMode.svelte');
    expect(expertMode.enabled).toBe(false);
  });

  it('should initialize with stored value when it exists', async (): Promise<void> => {
    localStorageMock.setItem('pabawi_expert_mode', 'true');
    vi.resetModules();
    const { expertMode } = await import('./expertMode.svelte');
    expect(expertMode.enabled).toBe(true);
  });

  it('should toggle expert mode and persist to localStorage', async (): Promise<void> => {
    const { expertMode } = await import('./expertMode.svelte');

    expect(expertMode.enabled).toBe(false);
    expect(localStorageMock.getItem('pabawi_expert_mode')).toBe(null);

    expertMode.toggle();

    expect(expertMode.enabled).toBe(true);
    expect(localStorageMock.getItem('pabawi_expert_mode')).toBe('true');

    expertMode.toggle();

    expect(expertMode.enabled).toBe(false);
    expect(localStorageMock.getItem('pabawi_expert_mode')).toBe('false');
  });

  it('should set enabled value and persist to localStorage', async (): Promise<void> => {
    const { expertMode } = await import('./expertMode.svelte');

    expertMode.setEnabled(true);

    expect(expertMode.enabled).toBe(true);
    expect(localStorageMock.getItem('pabawi_expert_mode')).toBe('true');

    expertMode.setEnabled(false);

    expect(expertMode.enabled).toBe(false);
    expect(localStorageMock.getItem('pabawi_expert_mode')).toBe('false');
  });

  it('should persist user preference across page reloads', async (): Promise<void> => {
    // First session
    const { expertMode: session1 } = await import('./expertMode.svelte');
    session1.setEnabled(true);
    expect(localStorageMock.getItem('pabawi_expert_mode')).toBe('true');

    // Simulate page reload by resetting modules
    vi.resetModules();

    // Second session - should load from localStorage
    const { expertMode: session2 } = await import('./expertMode.svelte');
    expect(session2.enabled).toBe(true);
  });
});
