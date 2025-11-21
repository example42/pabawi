// Expert mode state management with localStorage persistence

const STORAGE_KEY = "pabawi_expert_mode";

class ExpertModeStore {
  enabled = $state(false);

  constructor() {
    // Load from localStorage on initialization
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      this.enabled = stored === "true";
    }
  }

  toggle(): void {
    this.enabled = !this.enabled;
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(this.enabled));
    }
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(value));
    }
  }
}

export const expertMode = new ExpertModeStore();
