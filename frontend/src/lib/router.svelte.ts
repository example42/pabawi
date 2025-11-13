// Simple router implementation compatible with Svelte 5 runes

interface Route {
  path: string;
  component: any;
  params?: Record<string, string>;
}

class Router {
  currentPath = $state('/');
  currentParams = $state<Record<string, string>>({});

  constructor() {
    // Initialize with current path
    this.currentPath = window.location.pathname;
    
    // Listen for popstate (back/forward buttons)
    window.addEventListener('popstate', () => {
      this.currentPath = window.location.pathname;
    });
  }

  navigate(path: string): void {
    if (path !== this.currentPath) {
      window.history.pushState({}, '', path);
      this.currentPath = path;
    }
  }

  matchRoute(pattern: string, path: string): { match: boolean; params: Record<string, string> } {
    const patternParts = pattern.split('/').filter(Boolean);
    const pathParts = path.split('/').filter(Boolean);

    if (patternParts.length !== pathParts.length) {
      return { match: false, params: {} };
    }

    const params: Record<string, string> = {};

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];
      const pathPart = pathParts[i];

      if (patternPart.startsWith(':')) {
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

  findRoute(routes: Record<string, any>): { component: any; params: Record<string, string> } | null {
    for (const [pattern, component] of Object.entries(routes)) {
      const { match, params } = this.matchRoute(pattern, this.currentPath);
      if (match) {
        this.currentParams = params;
        return { component, params };
      }
    }
    return null;
  }
}

export const router = new Router();

export function link(node: HTMLAnchorElement): { destroy: () => void } {
  function handleClick(event: MouseEvent): void {
    // Only handle left clicks
    if (event.button !== 0) return;
    
    // Don't handle if modifier keys are pressed
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    
    // Don't handle if default is prevented
    if (event.defaultPrevented) return;

    const href = node.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('//')) return;

    event.preventDefault();
    router.navigate(href);
  }

  node.addEventListener('click', handleClick);

  return {
    destroy() {
      node.removeEventListener('click', handleClick);
    }
  };
}
