/**
 * Vitest global setup file.
 *
 * Node.js 20+ exposes a built-in `localStorage` global, but without
 * `--localstorage-file` pointing to a valid path its methods are
 * non-functional (getItem/setItem are undefined). This setup provides
 * a working in-memory localStorage before any module-level code runs,
 * preventing "localStorage.getItem is not a function" errors when
 * modules like expertMode.svelte.ts or auth.svelte.ts are imported.
 */

function createLocalStorageMock(): Storage {
  let store: Record<string, string> = {};

  return {
    getItem(key: string): string | null {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key: string, value: string): void {
      store[key] = value;
    },
    removeItem(key: string): void {
      delete store[key];
    },
    clear(): void {
      store = {};
    },
    get length(): number {
      return Object.keys(store).length;
    },
    key(index: number): string | null {
      return Object.keys(store)[index] ?? null;
    },
  };
}

const storageMock = createLocalStorageMock();

// Override the broken Node.js 20+ built-in localStorage
Object.defineProperty(globalThis, 'localStorage', {
  value: storageMock,
  writable: true,
  configurable: true,
});
