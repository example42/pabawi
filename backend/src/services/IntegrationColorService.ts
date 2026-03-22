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

import { LoggerService } from "./LoggerService";

/**
 * Service for managing integration color coding
 * Provides consistent colors across the application for visual identification of data sources
 */
export class IntegrationColorService {
  private readonly colors: IntegrationColors;
  private readonly defaultColor: IntegrationColorConfig;
  private readonly logger: LoggerService;

  constructor() {
    this.logger = new LoggerService();
    // Define color palette for each integration
    // Colors inspired by Puppet logo for better visibility and brand consistency
    this.colors = {
      // Provisioning tools — vivid blues
      proxmox: {
        primary: '#3B82F6',  // Vivid blue
        light: '#EFF6FF',
        dark: '#2563EB',
      },
      aws: {
        primary: '#06B6D4',  // Vivid cyan
        light: '#ECFEFF',
        dark: '#0891B2',
      },
      // Remote execution tools — vivid greens
      bolt: {
        primary: '#22C55E',  // Vivid green
        light: '#F0FDF4',
        dark: '#16A34A',
      },
      ansible: {
        primary: '#10B981',  // Vivid emerald
        light: '#ECFDF5',
        dark: '#059669',
      },
      ssh: {
        primary: '#A3E635',  // Vivid lime
        light: '#F7FEE7',
        dark: '#84CC16',
      },
      // Puppet ecosystem — vivid warm tones
      puppetdb: {
        primary: '#F97316',  // Vivid orange
        light: '#FFF7ED',
        dark: '#EA580C',
      },
      puppetserver: {
        primary: '#EF4444',  // Vivid red
        light: '#FEF2F2',
        dark: '#DC2626',
      },
      hiera: {
        primary: '#F59E0B',  // Vivid amber
        light: '#FFFBEB',
        dark: '#D97706',
      },
    };

    // Default gray color for unknown integrations
    this.defaultColor = {
      primary: '#6B7280',
      light: '#F3F4F6',
      dark: '#4B5563',
    };

    // Validate all colors on initialization
    this.validateColors();
  }

  /**
   * Get color configuration for a specific integration
   * Returns default gray color if integration is unknown
   *
   * @param integration - The integration name
   * @returns Color configuration for the integration
   */
  public getColor(integration: string): IntegrationColorConfig {
    const normalizedIntegration = integration.toLowerCase() as IntegrationType;

    if (this.isValidIntegration(normalizedIntegration)) {
      return this.colors[normalizedIntegration];
    }

    // Log warning for unknown integration
    this.logger.warn(`Unknown integration "${integration}", using default color`, {
      component: "IntegrationColorService",
      operation: "getColor",
      metadata: {
        integration,
        validIntegrations: this.getValidIntegrations(),
      },
    });

    return this.defaultColor;
  }

  /**
   * Get all integration colors
   *
   * @returns All integration color configurations
   */
  public getAllColors(): IntegrationColors {
    return { ...this.colors };
  }

  /**
   * Get list of valid integration names
   *
   * @returns Array of valid integration names
   */
  public getValidIntegrations(): IntegrationType[] {
    return Object.keys(this.colors) as IntegrationType[];
  }

  /**
   * Check if an integration name is valid
   *
   * @param integration - The integration name to check
   * @returns True if the integration is valid
   */
  private isValidIntegration(integration: string): integration is IntegrationType {
    return integration in this.colors;
  }

  /**
   * Validate that all color values are in valid hex format
   * Throws error if any color is invalid
   */
  private validateColors(): void {
    const hexColorRegex = /^#[0-9A-F]{6}$/i;

    for (const [integration, colorConfig] of Object.entries(this.colors)) {
      const config = colorConfig as Record<string, string>;
      for (const [variant, color] of Object.entries(config)) {
        if (!hexColorRegex.test(color)) {
          throw new Error(
            `Invalid color format for ${integration}.${variant}: "${color}". Expected hex format (e.g., #FF6B35)`
          );
        }
      }
    }

    // Validate default color as well
    const defaultConfig = this.defaultColor as unknown as Record<string, string>;
    for (const [variant, color] of Object.entries(defaultConfig)) {
      if (!hexColorRegex.test(color)) {
        throw new Error(
          `Invalid default color format for ${variant}: "${color}". Expected hex format (e.g., #6B7280)`
        );
      }
    }
  }
}
