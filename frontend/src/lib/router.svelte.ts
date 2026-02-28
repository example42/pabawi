// Simple router implementation compatible with Svelte 5 runes

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ComponentType = any;

export interface RouteConfig {
  component: ComponentType;
  requiresAuth?: boolean;
  requiresAdmin?: boolean;
}

class Router {
  currentPath = $state("/");
  currentParams = $state<Record<string, string>>({});
  currentQuery = $state<URLSearchParams>(new URLSearchParams());
  private _intendedPath = $state<string | null>(null);

  constructor() {
    // Initialize with current path and query
    this.currentPath = window.location.pathname;
    this.currentQuery = new URLSearchParams(window.location.search);

    // Listen for popstate (back/forward buttons)
    window.addEventListener("popstate", () => {
      this.currentPath = window.location.pathname;
      this.currentQuery = new URLSearchParams(window.location.search);
    });
  }

  navigate(path: string): void {
    const [pathname, search] = path.split("?");
    const fullPath = window.location.pathname + window.location.search;

    if (path !== fullPath) {
      window.history.pushState({}, "", path);
      this.currentPath = pathname;
      this.currentQuery = new URLSearchParams(search || "");
    }
  }

  get intendedPath(): string | null {
    return this._intendedPath;
  }

  setIntendedPath(path: string | null): void {
    this._intendedPath = path;
  }

  navigateToIntendedOrDefault(defaultPath: string = '/'): void {
    const path = this._intendedPath || defaultPath;
    this._intendedPath = null;
    this.navigate(path);
  }

  matchRoute(
    pattern: string,
    path: string,
  ): { match: boolean; params: Record<string, string> } {
    const patternParts = pattern.split("/").filter(Boolean);
    const pathParts = path.split("/").filter(Boolean);

    if (patternParts.length !== pathParts.length) {
      return { match: false, params: {} };
    }

    const params: Record<string, string> = {};

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];

      if (patternPart.startsWith(":")) {
        // Dynamic segment
        const paramName = patternPart.slice(1);
        params[paramName] = pathPart;
      } else if (patternPart !== pathPart) {
        // Static segment doesn't match
        return { match: false, params: {} };
      }
    }

    return { match: true, params };
  }

  findRoute(
    routes: Record<string, ComponentType | RouteConfig>,
  ): { component: ComponentType; params: Record<string, string>; config?: RouteConfig } | null {
    for (const [pattern, routeOrConfig] of Object.entries(routes)) {
      const { match, params } = this.matchRoute(pattern, this.currentPath);
      if (match) {
        // Check if it's a RouteConfig or just a component
        if (routeOrConfig && typeof routeOrConfig === 'object' && 'component' in routeOrConfig) {
          const config = routeOrConfig as RouteConfig;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          return { component: config.component, params, config };
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          return { component: routeOrConfig, params };
        }
      }
    }
    return null;
  }

  get params(): Record<string, string> {
    return this.currentParams;
  }

  get query(): URLSearchParams {
    return this.currentQuery;
  }
}

export const router = new Router();

export function link(node: HTMLAnchorElement): { destroy: () => void } {
  function handleClick(event: MouseEvent): void {
    // Only handle left clicks
    if (event.button !== 0) return;

    // Don't handle if modifier keys are pressed
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;

    // Don't handle if default is prevented
    if (event.defaultPrevented) return;

    const href = node.getAttribute("href");
    if (!href || href.startsWith("http") || href.startsWith("//")) return;

    event.preventDefault();
    router.navigate(href);
  }

  node.addEventListener("click", handleClick);

  return {
    destroy(): void {
      node.removeEventListener("click", handleClick);
    },
  };
}
