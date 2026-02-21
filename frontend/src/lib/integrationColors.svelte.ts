// Integration color management for visual identification of data sources
import { get } from './api';

/**
 * Integration color configuration
 */
export interface IntegrationColorConfig {
  primary: string;   // Main color for badges and labels
  light: string;     // Background color for highlighted sections
  dark: string;      // Hover and active states
}

/**
 * All integration colors
 */
export interface IntegrationColors {
  bolt: IntegrationColorConfig;
  ansible: IntegrationColorConfig;
  puppetdb: IntegrationColorConfig;
  puppetserver: IntegrationColorConfig;
  hiera: IntegrationColorConfig;
}

/**
 * Integration type
 */
export type IntegrationType = keyof IntegrationColors;

/**
 * API response for colors endpoint
 */
interface ColorsApiResponse {
  colors: IntegrationColors;
  integrations: IntegrationType[];
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
      const data = await get<ColorsApiResponse>('/api/integrations/colors');
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
   * Get list of valid integration names
   *
   * @returns Array of valid integration names
   */
  getValidIntegrations(): IntegrationType[] {
    return ['bolt', 'ansible', 'puppetdb', 'puppetserver', 'hiera'];
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
   */
  private getDefaultColors(): IntegrationColors {
    return {
      bolt: {
        primary: '#FFAE1A',
        light: '#FFF4E0',
        dark: '#CC8B15',
      },
      ansible: {
        primary: '#1A4D8F',
        light: '#E8F1FF',
        dark: '#133A6D',
      },
      puppetdb: {
        primary: '#9063CD',
        light: '#F0E6FF',
        dark: '#7249A8',
      },
      puppetserver: {
        primary: '#2E3A87',
        light: '#E8EAFF',
        dark: '#1F2760',
      },
      hiera: {
        primary: '#C1272D',
        light: '#FFE8E9',
        dark: '#9A1F24',
      },
    };
  }
}

export const integrationColors = new IntegrationColorStore();
