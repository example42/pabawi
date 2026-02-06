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
      // Use v1 API endpoint for plugin colors
      const response = await fetch('/api/v1/plugins');

      if (!response.ok) {
        throw new Error(`Failed to load plugin colors: ${response.statusText}`);
      }

      const data = await response.json() as { plugins?: Array<{ metadata: { name: string; color?: string } }> };

      // Build colors map from plugin metadata
      const colorsMap: IntegrationColors = {};
      if (data.plugins) {
        for (const plugin of data.plugins) {
          if (plugin.metadata.color) {
            const name = plugin.metadata.name.toLowerCase();
            colorsMap[name] = this.generateColorConfig(plugin.metadata.color);
          }
        }
      }

      this.colors = colorsMap;
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
   * Generate color configuration from a primary hex color
   * Creates light and dark variants automatically
   */
  private generateColorConfig(primaryColor: string): IntegrationColorConfig {
    // For now, use the primary color and generate simple variants
    // In the future, this could use a color manipulation library
    return {
      primary: primaryColor,
      light: this.lightenColor(primaryColor),
      dark: this.darkenColor(primaryColor),
    };
  }

  /**
   * Lighten a hex color (simple implementation)
   */
  private lightenColor(hex: string): string {
    // Remove # if present
    const color = hex.replace('#', '');

    // Parse RGB
    const r = parseInt(color.substring(0, 2), 16);
    const g = parseInt(color.substring(2, 4), 16);
    const b = parseInt(color.substring(4, 6), 16);

    // Lighten by mixing with white (80% original, 20% white)
    const newR = Math.round(r * 0.8 + 255 * 0.2);
    const newG = Math.round(g * 0.8 + 255 * 0.2);
    const newB = Math.round(b * 0.8 + 255 * 0.2);

    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
  }

  /**
   * Darken a hex color (simple implementation)
   */
  private darkenColor(hex: string): string {
    // Remove # if present
    const color = hex.replace('#', '');

    // Parse RGB
    const r = parseInt(color.substring(0, 2), 16);
    const g = parseInt(color.substring(2, 4), 16);
    const b = parseInt(color.substring(4, 6), 16);

    // Darken by reducing brightness (70% of original)
    const newR = Math.round(r * 0.7);
    const newG = Math.round(g * 0.7);
    const newB = Math.round(b * 0.7);

    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
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
