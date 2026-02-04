// Integration color management for visual identification of data sources

/**
 * Integration color configuration
 */
export interface IntegrationColorConfig {
  primary: string;   // Main color for badges and labels
  light: string;     // Background color for highlighted sections
  dark: string;      // Hover and active states
}

/**
 * All integration colors - dynamically loaded from backend
 */
export type IntegrationColors = Record<string, IntegrationColorConfig>;

/**
 * Integration type - any string representing a plugin name
 */
export type IntegrationType = string;

/**
 * API response for colors endpoint
 */
interface ColorsApiResponse {
  colors: IntegrationColors;
  integrations: string[];
}

/**
 * Store for managing integration colors
 * Loads colors from backend API and provides access to color configurations
 */
class IntegrationColorStore {
  colors = $state<IntegrationColors | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);

  /**
   * Load colors from the backend API
   */
  async loadColors(): Promise<void> {
    if (this.colors) {
      // Already loaded
      return;
    }

    this.loading = true;
    this.error = null;

    try {
      const response = await fetch('/api/integrations/colors');

      if (!response.ok) {
        throw new Error(`Failed to load integration colors: ${response.statusText}`);
      }

      const data = await response.json() as ColorsApiResponse;
      this.colors = data.colors;
    } catch (err: unknown) {
      this.error = err instanceof Error ? err.message : 'Unknown error loading colors';
      console.error('Error loading integration colors:', err);

      // Set default colors as fallback
      this.colors = this.getDefaultColors();
    } finally {
      this.loading = false;
    }
  }

  /**
   * Get color configuration for a specific integration
   * Returns default gray color if integration is unknown or colors not loaded
   *
   * @param integration - The integration name
   * @returns Color configuration for the integration
   */
  getColor(integration: string): IntegrationColorConfig {
    if (!this.colors) {
      return this.getDefaultColor();
    }

    const normalizedIntegration = integration.toLowerCase() as IntegrationType;

    if (normalizedIntegration in this.colors) {
      return this.colors[normalizedIntegration];
    }

    return this.getDefaultColor();
  }

  /**
   * Get all integration colors
   * Returns default colors if not loaded
   *
   * @returns All integration color configurations
   */
  getAllColors(): IntegrationColors {
    return this.colors ?? this.getDefaultColors();
  }

  /**
   * Get list of valid integration names from loaded colors
   *
   * @returns Array of valid integration names
   */
  getValidIntegrations(): string[] {
    if (!this.colors) {
      return []; // Return empty array if colors not loaded yet
    }
    return Object.keys(this.colors);
  }

  /**
   * Get default gray color for unknown integrations
   */
  private getDefaultColor(): IntegrationColorConfig {
    return {
      primary: '#6B7280',
      light: '#F3F4F6',
      dark: '#4B5563',
    };
  }

  /**
   * Get default color palette (fallback if API fails)
   * Returns empty object - colors should be loaded from API
   */
  private getDefaultColors(): IntegrationColors {
    return {};
  }
}

export const integrationColors = new IntegrationColorStore();
