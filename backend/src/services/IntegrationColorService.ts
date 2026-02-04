/**
 * Integration color configuration
 */
export interface IntegrationColorConfig {
  primary: string;   // Main color for badges and labels
  light: string;     // Background color for highlighted sections
  dark: string;      // Hover and active states
}

/**
 * Map of integration names to their color configurations
 */
export type IntegrationColors = Record<string, IntegrationColorConfig>;

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
    // Define default color palette for native integrations
    // Colors inspired by Puppet logo for better visibility and brand consistency
    // These can be overridden by plugin configurations
    this.colors = {
      bolt: {
        primary: '#FFAE1A',  // Bright orange from Puppet logo
        light: '#FFF4E0',
        dark: '#CC8B15',
      },
      puppetdb: {
        primary: '#9063CD',  // Violet/purple from Puppet logo
        light: '#F0E6FF',
        dark: '#7249A8',
      },
      puppetserver: {
        primary: '#2E3A87',  // Dark blue from Puppet logo
        light: '#E8EAFF',
        dark: '#1F2760',
      },
      hiera: {
        primary: '#C1272D',  // Dark red
        light: '#FFE8E9',
        dark: '#9A1F24',
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
   * Register a color configuration for an integration
   * This allows plugins to register their own colors dynamically
   *
   * @param integration - The integration name
   * @param colorConfig - Color configuration for the integration
   */
  public registerColor(integration: string, colorConfig: IntegrationColorConfig): void {
    const normalizedIntegration = integration.toLowerCase();

    // Validate the color configuration
    this.validateColorConfig(colorConfig);

    this.colors[normalizedIntegration] = colorConfig;

    this.logger.info(`Registered color for integration "${integration}"`, {
      component: "IntegrationColorService",
      operation: "registerColor",
      metadata: {
        integration: normalizedIntegration,
        primary: colorConfig.primary,
      },
    });
  }

  /**
   * Get color configuration for a specific integration
   * Returns default gray color if integration is unknown
   *
   * @param integration - The integration name
   * @returns Color configuration for the integration
   */
  public getColor(integration: string): IntegrationColorConfig {
    const normalizedIntegration = integration.toLowerCase();

    if (normalizedIntegration in this.colors) {
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
  public getValidIntegrations(): string[] {
    return Object.keys(this.colors);
  }

  /**
   * Validate a single color configuration
   * Throws error if any color is invalid
   *
   * @param colorConfig - Color configuration to validate
   */
  private validateColorConfig(colorConfig: IntegrationColorConfig): void {
    const hexColorRegex = /^#[0-9A-F]{6}$/i;

    // Validate each color property
    const colors: Array<[string, string]> = [
      ['primary', colorConfig.primary],
      ['light', colorConfig.light],
      ['dark', colorConfig.dark],
    ];

    for (const [variant, color] of colors) {
      if (!hexColorRegex.test(color)) {
        throw new Error(
          `Invalid color format for ${variant}: "${color}". Expected hex format (e.g., #FF6B35)`
        );
      }
    }
  }

  /**
   * Validate that all color values are in valid hex format
   * Throws error if any color is invalid
   */
  private validateColors(): void {
    for (const [integration, colorConfig] of Object.entries(this.colors)) {
      try {
        this.validateColorConfig(colorConfig);
      } catch (error) {
        throw new Error(
          `Invalid color configuration for integration "${integration}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Validate default color as well
    this.validateColorConfig(this.defaultColor);
  }
}
