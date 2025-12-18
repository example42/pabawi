type Theme = 'light' | 'dark' | 'system';

class ThemeManager {
  private _theme = $state<Theme>('system');
  private _resolvedTheme = $state<'light' | 'dark'>('light');

  constructor() {
    // Initialize theme from localStorage or default to system
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme');
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        this._theme = stored;
      }

      this.updateResolvedTheme();
      this.applyTheme();

      // Listen for system theme changes
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', () => {
        if (this._theme === 'system') {
          this.updateResolvedTheme();
          this.applyTheme();
        }
      });
    }
  }

  get theme(): Theme {
    return this._theme;
  }

  get resolvedTheme(): 'light' | 'dark' {
    return this._resolvedTheme;
  }

  get isDark(): boolean {
    return this._resolvedTheme === 'dark';
  }

  setTheme(theme: Theme): void {
    this._theme = theme;
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', theme);
    }
    this.updateResolvedTheme();
    this.applyTheme();
  }

  toggle(): void {
    if (this._theme === 'system') {
      // If currently system, toggle to the opposite of current resolved theme
      this.setTheme(this._resolvedTheme === 'dark' ? 'light' : 'dark');
    } else {
      // If manually set, toggle between light and dark
      this.setTheme(this._theme === 'dark' ? 'light' : 'dark');
    }
  }

  private updateResolvedTheme(): void {
    if (this._theme === 'system') {
      if (typeof window !== 'undefined') {
        this._resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
    } else {
      this._resolvedTheme = this._theme;
    }
  }

  private applyTheme(): void {
    if (typeof window !== 'undefined') {
      const root = document.documentElement;
      if (this._resolvedTheme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
  }
}

export const themeManager = new ThemeManager();
