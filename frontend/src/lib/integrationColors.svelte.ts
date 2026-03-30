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
  ssh: IntegrationColorConfig;
  proxmox: IntegrationColorConfig;
  aws: IntegrationColorConfig;
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
  private loadPromise: Promise<void> | null = null;

  /**
   * Load colors from the backend API
   * Uses a singleton promise to prevent multiple simultaneous requests
   */
  async loadColors(): Promise<void> {
    // Already loaded
    if (this.colors) {
      return;
    }

    // Already loading - return existing promise
    if (this.loadPromise) {
      return this.loadPromise;
    }

    // Start new load
    this.loadPromise = this.fetchColors();
    return this.loadPromise;
  }

  /**
   * Internal method to fetch colors from API
   */
  private async fetchColors(): Promise<void> {
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
      this.loadPromise = null;
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
    return ['bolt', 'ansible', 'puppetdb', 'puppetserver', 'hiera', 'ssh', 'proxmox', 'aws'];
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
      // Provisioning tools — vivid blues
      proxmox: {
        primary: '#3B82F6',
        light: '#EFF6FF',
        dark: '#2563EB',
      },
      aws: {
        primary: '#06B6D4',
        light: '#ECFEFF',
        dark: '#0891B2',
      },
      // Remote execution tools — vivid greens
      bolt: {
        primary: '#22C55E',
        light: '#F0FDF4',
        dark: '#16A34A',
      },
      ansible: {
        primary: '#10B981',
        light: '#ECFDF5',
        dark: '#059669',
      },
      ssh: {
        primary: '#A3E635',
        light: '#F7FEE7',
        dark: '#84CC16',
      },
      // Puppet ecosystem — vivid warm tones
      puppetdb: {
        primary: '#F97316',
        light: '#FFF7ED',
        dark: '#EA580C',
      },
      puppetserver: {
        primary: '#EF4444',
        light: '#FEF2F2',
        dark: '#DC2626',
      },
      hiera: {
        primary: '#F59E0B',
        light: '#FFFBEB',
        dark: '#D97706',
      },
    };
  }
}

export const integrationColors = new IntegrationColorStore();
