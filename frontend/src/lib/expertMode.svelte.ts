// Expert mode state management with localStorage persistence

const STORAGE_KEY = "pabawi_expert_mode";

function getStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage && typeof window.localStorage.getItem === "function") {
      return window.localStorage;
    }
  } catch {
    // SecurityError in sandboxed iframes or restricted contexts
  }
  return null;
}

class ExpertModeStore {
  enabled = $state(false);

  constructor() {
    const storage = getStorage();
    if (storage) {
      const stored = storage.getItem(STORAGE_KEY);
      this.enabled = stored === "true";
    }
  }

  toggle(): void {
    this.enabled = !this.enabled;
    const storage = getStorage();
    if (storage) {
      storage.setItem(STORAGE_KEY, String(this.enabled));
    }
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    const storage = getStorage();
    if (storage) {
      storage.setItem(STORAGE_KEY, String(value));
    }
  }
}

export const expertMode = new ExpertModeStore();
