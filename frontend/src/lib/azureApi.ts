/**
 * Azure API functions
 *
 * Domain-specific API functions for Azure integration including
 * provisioning, lifecycle management, and resource discovery.
 *
 * Currently a placeholder — Azure API endpoints are not yet implemented
 * in the backend. Functions will be added here as the Azure integration
 * matures.
 */

import { get, post } from './api';

/**
 * Azure configuration for setup guide
 */
export interface AzureIntegrationConfig {
  subscriptionId: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

/**
 * Test Azure connection using .env-sourced configuration
 */
export async function testAzureConnection(): Promise<{ success: boolean; message: string }> {
  return post<{ success: boolean; message: string }>('/api/integrations/azure/test', undefined, {
    maxRetries: 0,
    showRetryNotifications: false,
  });
}

/**
 * Get Azure inventory
 */
export async function getAzureInventory(): Promise<{ inventory: unknown[] }> {
  return get<{ inventory: unknown[] }>('/api/integrations/azure/inventory', {
    maxRetries: 2,
    retryDelay: 1000,
  });
}
