/**
 * Unit tests and property tests for ProvisionPage component
 *
 * Tests integration discovery, loading states, error handling, and empty states
 * Validates Requirements: 1.2, 1.4, 2.1, 2.3, 2.4, 13.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, within } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import fc from 'fast-check';
import ProvisionPage from './ProvisionPage.svelte';
import * as api from '../lib/api';
import type { ProvisioningIntegration } from '../lib/types/provisioning';
import { integrationArbitrary } from '../__tests__/generators';

// Mock the API module
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getProvisioningIntegrations: vi.fn(),
    getErrorGuidance: actual.getErrorGuidance,
  };
});

describe('ProvisionPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Loading State', () => {
    it('displays loading spinner while fetching integrations', async () => {
      // Mock API to delay response
      vi.mocked(api.getProvisioningIntegrations).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(ProvisionPage);

      // Check for loading spinner
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.getByText(/loading provisioning integrations/i)).toBeInTheDocument();
    });

    it('shows loading state initially before API call completes', () => {
      vi.mocked(api.getProvisioningIntegrations).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ integrations: [] }), 100))
      );

      render(ProvisionPage);

      // Loading spinner should be visible
      const loadingSpinner = screen.getByRole('status');
      expect(loadingSpinner).toBeInTheDocument();
    });
  });

  describe('Integration Discovery', () => {
    it('displays integrations with capabilities after successful fetch', async () => {
      const mockIntegrations: ProvisioningIntegration[] = [
        {
          name: 'proxmox',
          displayName: 'Proxmox VE',
          type: 'virtualization',
          status: 'connected',
          capabilities: [
            {
              name: 'create_vm',
              description: 'Create a virtual machine',
              operation: 'create',
              parameters: [],
            },
          ],
        },
      ];

      vi.mocked(api.getProvisioningIntegrations).mockResolvedValue({
        integrations: mockIntegrations,
      });

      render(ProvisionPage);

      // Wait for integrations to load
      await waitFor(() => {
        expect(screen.getByText('Proxmox VE')).toBeInTheDocument();
      });

      // Check that integration details are displayed
      expect(screen.getByText('Proxmox VE')).toBeInTheDocument();
      expect(screen.getByText(/virtualization/i)).toBeInTheDocument();
      expect(screen.getByText(/1 capability/i)).toBeInTheDocument();
    });

    it('filters out integrations with no capabilities', async () => {
      const mockIntegrations: ProvisioningIntegration[] = [
        {
          name: 'proxmox',
          displayName: 'Proxmox VE',
          type: 'virtualization',
          status: 'connected',
          capabilities: [
            {
              name: 'create_vm',
              description: 'Create a virtual machine',
              operation: 'create',
              parameters: [],
            },
          ],
        },
        {
          name: 'ec2',
          displayName: 'Amazon EC2',
          type: 'cloud',
          status: 'not_configured',
          capabilities: [], // No capabilities
        },
      ];

      vi.mocked(api.getProvisioningIntegrations).mockResolvedValue({
        integrations: mockIntegrations,
      });

      render(ProvisionPage);

      await waitFor(() => {
        expect(screen.getByText('Proxmox VE')).toBeInTheDocument();
      });

      // Proxmox should be displayed
      expect(screen.getByText('Proxmox VE')).toBeInTheDocument();

      // EC2 should NOT be displayed (no capabilities)
      expect(screen.queryByText('Amazon EC2')).not.toBeInTheDocument();
    });

    it('displays multiple integrations when available', async () => {
      const mockIntegrations: ProvisioningIntegration[] = [
        {
          name: 'proxmox',
          displayName: 'Proxmox VE',
          type: 'virtualization',
          status: 'connected',
          capabilities: [
            {
              name: 'create_vm',
              description: 'Create a virtual machine',
              operation: 'create',
              parameters: [],
            },
          ],
        },
        {
          name: 'ec2',
          displayName: 'Amazon EC2',
          type: 'cloud',
          status: 'connected',
          capabilities: [
            {
              name: 'create_instance',
              description: 'Create an EC2 instance',
              operation: 'create',
              parameters: [],
            },
          ],
        },
      ];

      vi.mocked(api.getProvisioningIntegrations).mockResolvedValue({
        integrations: mockIntegrations,
      });

      render(ProvisionPage);

      // Wait for integration selector to appear (indicates multiple integrations)
      await waitFor(() => {
        expect(screen.getByRole('navigation', { name: /integration selector/i })).toBeInTheDocument();
      });

      // Both integrations should be displayed in the selector
      expect(screen.getByRole('button', { name: /proxmox ve/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /amazon ec2/i })).toBeInTheDocument();
    });

    it('displays integration status badges correctly', async () => {
      const mockIntegrations: ProvisioningIntegration[] = [
        {
          name: 'proxmox',
          displayName: 'Proxmox VE',
          type: 'virtualization',
          status: 'connected',
          capabilities: [
            {
              name: 'create_vm',
              description: 'Create a virtual machine',
              operation: 'create',
              parameters: [],
            },
          ],
        },
      ];

      vi.mocked(api.getProvisioningIntegrations).mockResolvedValue({
        integrations: mockIntegrations,
      });

      render(ProvisionPage);

      await waitFor(() => {
        expect(screen.getByText('Proxmox VE')).toBeInTheDocument();
      });

      // Check for status badge
      expect(screen.getByText('connected')).toBeInTheDocument();
    });

    it('displays capability count correctly', async () => {
      const mockIntegrations: ProvisioningIntegration[] = [
        {
          name: 'proxmox',
          displayName: 'Proxmox VE',
          type: 'virtualization',
          status: 'connected',
          capabilities: [
            {
              name: 'create_vm',
              description: 'Create a virtual machine',
              operation: 'create',
              parameters: [],
            },
            {
              name: 'create_lxc',
              description: 'Create an LXC container',
              operation: 'create',
              parameters: [],
            },
            {
              name: 'destroy_vm',
              description: 'Destroy a virtual machine',
              operation: 'destroy',
              parameters: [],
            },
          ],
        },
      ];

      vi.mocked(api.getProvisioningIntegrations).mockResolvedValue({
        integrations: mockIntegrations,
      });

      render(ProvisionPage);

      await waitFor(() => {
        expect(screen.getByText('Proxmox VE')).toBeInTheDocument();
      });

      // Check for capability count (plural)
      expect(screen.getByText(/3 capabilities/i)).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('displays error message when API call fails', async () => {
      const errorMessage = 'Network connection failed';
      vi.mocked(api.getProvisioningIntegrations).mockRejectedValue(
        new Error(errorMessage)
      );

      render(ProvisionPage);

      // Wait for error to be displayed
      await waitFor(() => {
        expect(screen.getByText(/failed to load provisioning integrations/i)).toBeInTheDocument();
      });

      // Check that error details are shown
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('logs error to console when fetch fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const errorMessage = 'API Error';

      vi.mocked(api.getProvisioningIntegrations).mockRejectedValue(
        new Error(errorMessage)
      );

      render(ProvisionPage);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ProvisionPage]'),
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('provides retry functionality on error', async () => {
      let callCount = 0;
      vi.mocked(api.getProvisioningIntegrations).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          integrations: [
            {
              name: 'proxmox',
              displayName: 'Proxmox VE',
              type: 'virtualization',
              status: 'connected',
              capabilities: [
                {
                  name: 'create_vm',
                  description: 'Create a virtual machine',
                  operation: 'create',
                  parameters: [],
                },
              ],
            },
          ],
        });
      });

      const { container } = render(ProvisionPage);

      // Wait for error to be displayed
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // Find and click retry button
      const retryButton = screen.getByRole('button', { name: /retry/i });
      expect(retryButton).toBeInTheDocument();

      await retryButton.click();

      // Wait for successful load after retry
      await waitFor(() => {
        expect(screen.getByText('Proxmox VE')).toBeInTheDocument();
      });

      expect(callCount).toBe(2);
    });

    it('handles non-Error objects thrown by API', async () => {
      vi.mocked(api.getProvisioningIntegrations).mockRejectedValue('String error');

      render(ProvisionPage);

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
      });

      // Should display generic error message
      expect(screen.getByText(/failed to load provisioning integrations/i)).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('displays empty state when no integrations are available', async () => {
      vi.mocked(api.getProvisioningIntegrations).mockResolvedValue({
        integrations: [],
      });

      render(ProvisionPage);

      await waitFor(() => {
        expect(screen.getByText(/no provisioning integrations available/i)).toBeInTheDocument();
      });

      // Check for empty state message
      expect(screen.getByText(/no provisioning integrations available/i)).toBeInTheDocument();
      expect(screen.getByText(/configure a provisioning integration/i)).toBeInTheDocument();
    });

    it('displays empty state when all integrations have no capabilities', async () => {
      const mockIntegrations: ProvisioningIntegration[] = [
        {
          name: 'proxmox',
          displayName: 'Proxmox VE',
          type: 'virtualization',
          status: 'not_configured',
          capabilities: [], // No capabilities
        },
        {
          name: 'ec2',
          displayName: 'Amazon EC2',
          type: 'cloud',
          status: 'not_configured',
          capabilities: [], // No capabilities
        },
      ];

      vi.mocked(api.getProvisioningIntegrations).mockResolvedValue({
        integrations: mockIntegrations,
      });

      render(ProvisionPage);

      await waitFor(() => {
        expect(screen.getByText(/no provisioning integrations available/i)).toBeInTheDocument();
      });

      // Empty state should be shown
      expect(screen.getByText(/no provisioning integrations available/i)).toBeInTheDocument();
    });

    it('provides link to setup page in empty state', async () => {
      vi.mocked(api.getProvisioningIntegrations).mockResolvedValue({
        integrations: [],
      });

      render(ProvisionPage);

      await waitFor(() => {
        expect(screen.getByText(/no provisioning integrations available/i)).toBeInTheDocument();
      });

      // Check for setup link
      const setupLink = screen.getByRole('link', { name: /configure integrations/i });
      expect(setupLink).toBeInTheDocument();
      expect(setupLink).toHaveAttribute('href', '/setup');
    });
  });

  describe('Integration Selector', () => {
    it('displays integration selector when multiple integrations are available', async () => {
      const mockIntegrations: ProvisioningIntegration[] = [
        {
          name: 'proxmox',
          displayName: 'Proxmox VE',
          type: 'virtualization',
          status: 'connected',
          capabilities: [
            {
              name: 'create_vm',
              description: 'Create a virtual machine',
              operation: 'create',
              parameters: [],
            },
          ],
        },
        {
          name: 'ec2',
          displayName: 'Amazon EC2',
          type: 'cloud',
          status: 'connected',
          capabilities: [
            {
              name: 'create_instance',
              description: 'Create an EC2 instance',
              operation: 'create',
              parameters: [],
            },
          ],
        },
      ];

      vi.mocked(api.getProvisioningIntegrations).mockResolvedValue({
        integrations: mockIntegrations,
      });

      render(ProvisionPage);

      // Wait for integration selector to appear
      await waitFor(() => {
        expect(screen.getByRole('navigation', { name: /integration selector/i })).toBeInTheDocument();
      });

      // Check for integration selector tabs
      const proxmoxTab = screen.getByRole('button', { name: /proxmox ve/i });
      const ec2Tab = screen.getByRole('button', { name: /amazon ec2/i });

      expect(proxmoxTab).toBeInTheDocument();
      expect(ec2Tab).toBeInTheDocument();
    });

    it('does not display integration selector when only one integration is available', async () => {
      const mockIntegrations: ProvisioningIntegration[] = [
        {
          name: 'proxmox',
          displayName: 'Proxmox VE',
          type: 'virtualization',
          status: 'connected',
          capabilities: [
            {
              name: 'create_vm',
              description: 'Create a virtual machine',
              operation: 'create',
              parameters: [],
            },
          ],
        },
      ];

      vi.mocked(api.getProvisioningIntegrations).mockResolvedValue({
        integrations: mockIntegrations,
      });

      render(ProvisionPage);

      await waitFor(() => {
        expect(screen.getByText('Proxmox VE')).toBeInTheDocument();
      });

      // Integration selector should not be present
      const tabs = screen.queryByRole('navigation', { name: /integration selector/i });
      expect(tabs).not.toBeInTheDocument();
    });

    it('switches between integrations when selector tabs are clicked', async () => {
      const mockIntegrations: ProvisioningIntegration[] = [
        {
          name: 'proxmox',
          displayName: 'Proxmox VE',
          type: 'virtualization',
          status: 'connected',
          capabilities: [
            {
              name: 'create_vm',
              description: 'Create a virtual machine',
              operation: 'create',
              parameters: [],
            },
          ],
        },
        {
          name: 'ec2',
          displayName: 'Amazon EC2',
          type: 'cloud',
          status: 'connected',
          capabilities: [
            {
              name: 'create_instance',
              description: 'Create an EC2 instance',
              operation: 'create',
              parameters: [],
            },
          ],
        },
      ];

      vi.mocked(api.getProvisioningIntegrations).mockResolvedValue({
        integrations: mockIntegrations,
      });

      render(ProvisionPage);

      // Wait for integration selector to appear
      await waitFor(() => {
        expect(screen.getByRole('navigation', { name: /integration selector/i })).toBeInTheDocument();
      });

      // Initially, Proxmox should be selected (first integration)
      const proxmoxTab = screen.getByRole('button', { name: /proxmox ve/i });
      expect(proxmoxTab).toHaveAttribute('aria-current', 'page');

      // Click EC2 tab
      const ec2Tab = screen.getByRole('button', { name: /amazon ec2/i });
      await ec2Tab.click();

      // EC2 should now be selected
      await waitFor(() => {
        expect(ec2Tab).toHaveAttribute('aria-current', 'page');
      });
    });
  });

  describe('Page Title', () => {
    it('sets the correct page title', () => {
      vi.mocked(api.getProvisioningIntegrations).mockResolvedValue({
        integrations: [],
      });

      render(ProvisionPage);

      // Check that the title is set in the document head
      expect(document.title).toBe('Provision - Pabawi');
    });
  });

  describe('Integration Cards', () => {
    it('displays integration type icon', async () => {
      const mockIntegrations: ProvisioningIntegration[] = [
        {
          name: 'proxmox',
          displayName: 'Proxmox VE',
          type: 'virtualization',
          status: 'connected',
          capabilities: [
            {
              name: 'create_vm',
              description: 'Create a virtual machine',
              operation: 'create',
              parameters: [],
            },
          ],
        },
      ];

      vi.mocked(api.getProvisioningIntegrations).mockResolvedValue({
        integrations: mockIntegrations,
      });

      render(ProvisionPage);

      await waitFor(() => {
        expect(screen.getByText('Proxmox VE')).toBeInTheDocument();
      });

      // Check that SVG icons are present
      const svgElements = document.querySelectorAll('svg');
      expect(svgElements.length).toBeGreaterThan(0);
    });

    it('displays "Create Resource" button for connected integrations', async () => {
      const mockIntegrations: ProvisioningIntegration[] = [
        {
          name: 'proxmox',
          displayName: 'Proxmox VE',
          type: 'virtualization',
          status: 'connected',
          capabilities: [
            {
              name: 'create_vm',
              description: 'Create a virtual machine',
              operation: 'create',
              parameters: [],
            },
          ],
        },
      ];

      vi.mocked(api.getProvisioningIntegrations).mockResolvedValue({
        integrations: mockIntegrations,
      });

      render(ProvisionPage);

      await waitFor(() => {
        expect(screen.getByText('Proxmox VE')).toBeInTheDocument();
      });

      // Check for "Create Resource" button
      const createButton = screen.getByRole('button', { name: /create resource/i });
      expect(createButton).toBeInTheDocument();
      expect(createButton).not.toBeDisabled();
    });

    it('displays "Configure" link for not_configured integrations', async () => {
      const mockIntegrations: ProvisioningIntegration[] = [
        {
          name: 'proxmox',
          displayName: 'Proxmox VE',
          type: 'virtualization',
          status: 'not_configured',
          capabilities: [
            {
              name: 'create_vm',
              description: 'Create a virtual machine',
              operation: 'create',
              parameters: [],
            },
          ],
        },
      ];

      vi.mocked(api.getProvisioningIntegrations).mockResolvedValue({
        integrations: mockIntegrations,
      });

      render(ProvisionPage);

      await waitFor(() => {
        expect(screen.getByText('Proxmox VE')).toBeInTheDocument();
      });

      // Check for "Configure" link
      const configureLink = screen.getByRole('link', { name: /configure/i });
      expect(configureLink).toBeInTheDocument();
      expect(configureLink).toHaveAttribute('href', '/setup/proxmox');
    });

    it('displays disabled "Degraded" button for degraded integrations', async () => {
      const mockIntegrations: ProvisioningIntegration[] = [
        {
          name: 'proxmox',
          displayName: 'Proxmox VE',
          type: 'virtualization',
          status: 'degraded',
          capabilities: [
            {
              name: 'create_vm',
              description: 'Create a virtual machine',
              operation: 'create',
              parameters: [],
            },
          ],
        },
      ];

      vi.mocked(api.getProvisioningIntegrations).mockResolvedValue({
        integrations: mockIntegrations,
      });

      render(ProvisionPage);

      await waitFor(() => {
        expect(screen.getByText('Proxmox VE')).toBeInTheDocument();
      });

      // Check for "Degraded" button
      const degradedButton = screen.getByRole('button', { name: /degraded/i });
      expect(degradedButton).toBeInTheDocument();
      expect(degradedButton).toBeDisabled();
    });

    it('displays capability names in integration card', async () => {
      const mockIntegrations: ProvisioningIntegration[] = [
        {
          name: 'proxmox',
          displayName: 'Proxmox VE',
          type: 'virtualization',
          status: 'connected',
          capabilities: [
            {
              name: 'create_vm',
              description: 'Create a virtual machine',
              operation: 'create',
              parameters: [],
            },
            {
              name: 'create_lxc',
              description: 'Create an LXC container',
              operation: 'create',
              parameters: [],
            },
          ],
        },
      ];

      vi.mocked(api.getProvisioningIntegrations).mockResolvedValue({
        integrations: mockIntegrations,
      });

      render(ProvisionPage);

      await waitFor(() => {
        expect(screen.getByText('Proxmox VE')).toBeInTheDocument();
      });

      // Check for capability names
      expect(screen.getByText('create_vm')).toBeInTheDocument();
      expect(screen.getByText('create_lxc')).toBeInTheDocument();
    });
  });

  describe('Property-Based Tests', () => {
    /**
     * Property 1: Integration Discovery and Display
     *
     * For any list of provisioning integrations returned by the backend,
     * the Provision page should display all integrations that have at least
     * one provisioning capability, and hide integrations with zero capabilities.
     *
     * **Validates: Requirements 1.4, 2.2, 2.3**
     */
    it('Feature: proxmox-frontend-ui, Property 1: displays only integrations with capabilities', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(integrationArbitrary(), { minLength: 0, maxLength: 10 }),
          async (generatedIntegrations) => {
            // Cleanup before rendering to ensure clean state
            cleanup();

            // Ensure unique integration names to avoid Svelte keyed each block errors
            const integrations = generatedIntegrations.map((integration, index) => ({
              ...integration,
              name: `${integration.name}-${index}`,
              displayName: `${integration.displayName}-${index}`,
            }));

            // Mock API to return the generated integrations
            vi.mocked(api.getProvisioningIntegrations).mockResolvedValue({
              integrations,
            });

            // Render the component
            const { container } = render(ProvisionPage);

            // Wait for loading to complete by checking for the absence of loading text
            await waitFor(() => {
              expect(screen.queryByText(/loading provisioning integrations/i)).not.toBeInTheDocument();
            }, { timeout: 2000 });

            // Filter integrations that should be displayed (have at least one capability)
            const displayableIntegrations = integrations.filter(
              (integration) => integration.capabilities.length > 0
            );

            // Filter integrations that should be hidden (have zero capabilities)
            const hiddenIntegrations = integrations.filter(
              (integration) => integration.capabilities.length === 0
            );

            if (displayableIntegrations.length === 0) {
              // If no integrations have capabilities, empty state should be shown
              expect(screen.getByText(/no provisioning integrations available/i)).toBeInTheDocument();
            } else {
              // All integrations with capabilities should be displayed
              for (const integration of displayableIntegrations) {
                // Check if integration name appears in the document
                // Use getAllByText since the name might appear multiple times (selector + card)
                const elements = screen.queryAllByText(integration.displayName);
                expect(elements.length).toBeGreaterThan(0);
              }

              // All integrations without capabilities should NOT be displayed in cards
              // They might appear in selector tabs, but not in the cards grid
              const cardsGrid = container.querySelector('[data-testid="integration-cards-grid"]');
              if (cardsGrid && hiddenIntegrations.length > 0) {
                // Check that hidden integrations don't have their own card
                // by verifying they don't appear as a heading in the cards
                for (const integration of hiddenIntegrations) {
                  const headings = Array.from(cardsGrid.querySelectorAll('h3'));
                  const hasCard = headings.some(h => h.textContent?.includes(integration.displayName));
                  expect(hasCard).toBe(false);
                }
              }
            }
          }
        ),
        { numRuns: 20, timeout: 10000 }
      );
    }, 15000);

    /**
     * Property 16: Integration Extensibility
     *
     * For any new provisioning integration added to the backend with valid
     * capability metadata, the frontend should automatically discover it on
     * the next page load and render appropriate UI without code changes.
     *
     * **Validates: Requirements 13.3**
     */
    it('Feature: proxmox-frontend-ui, Property 16: automatically discovers new integrations', async () => {
      await fc.assert(
        fc.asyncProperty(
          integrationArbitrary(),
          async (newIntegration) => {
            // Cleanup before rendering to ensure clean state
            cleanup();

            // Ensure the integration has at least one capability to be displayable
            if (newIntegration.capabilities.length === 0) {
              newIntegration.capabilities = [
                {
                  name: 'test_capability',
                  description: 'Test capability',
                  operation: 'create',
                  parameters: [],
                },
              ];
            }

            // Mock API to return the new integration
            vi.mocked(api.getProvisioningIntegrations).mockResolvedValue({
              integrations: [newIntegration],
            });

            // Render the component
            const { container } = render(ProvisionPage);

            // Wait for loading to complete by checking for the absence of loading text
            await waitFor(() => {
              expect(screen.queryByText(/loading provisioning integrations/i)).not.toBeInTheDocument();
            }, { timeout: 2000 });

            // The new integration should be automatically discovered and displayed
            // Use within(container) to scope queries to this specific render
            const { getByText, getByRole, queryByRole } = within(container);

            // Check for integration display name
            expect(getByText(newIntegration.displayName)).toBeInTheDocument();

            // Check for integration type (use queryAllByText to handle multiple matches)
            const typeElements = screen.queryAllByText(new RegExp(newIntegration.type, 'i'));
            expect(typeElements.length).toBeGreaterThan(0);

            // Check for integration status
            const statusText = newIntegration.status.replace('_', ' ');
            const statusElements = screen.queryAllByText(new RegExp(statusText, 'i'));
            expect(statusElements.length).toBeGreaterThan(0);

            // Check for capability count
            const capabilityCount = newIntegration.capabilities.length;
            const capabilityText = capabilityCount === 1 ? 'capability' : 'capabilities';
            expect(getByText(new RegExp(`${capabilityCount} ${capabilityText}`, 'i'))).toBeInTheDocument();

            // Check that capability names are displayed
            for (const capability of newIntegration.capabilities) {
              const capElements = screen.queryAllByText(capability.name);
              expect(capElements.length).toBeGreaterThan(0);
            }

            // Verify appropriate action button is rendered based on status
            if (newIntegration.status === 'connected') {
              expect(getByRole('button', { name: /create resource/i })).toBeInTheDocument();
            } else if (newIntegration.status === 'not_configured') {
              expect(getByRole('link', { name: /configure/i })).toBeInTheDocument();
            } else if (newIntegration.status === 'degraded') {
              const degradedButton = getByRole('button', { name: /degraded/i });
              expect(degradedButton).toBeInTheDocument();
              expect(degradedButton).toBeDisabled();
            }
          }
        ),
        { numRuns: 20, timeout: 10000 }
      );
    }, 15000);

    /**
     * Property 16 (variant): Multiple new integrations are discovered together
     *
     * Tests that when multiple new integrations are added simultaneously,
     * all are discovered and rendered correctly with proper selector UI.
     *
     * **Validates: Requirements 13.3, 2.2**
     */
    it('Feature: proxmox-frontend-ui, Property 16: discovers multiple new integrations with selector', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(integrationArbitrary(), { minLength: 2, maxLength: 5 }),
          async (generatedIntegrations) => {
            // Cleanup before rendering to ensure clean state
            cleanup();

            // Ensure unique integration names and all have capabilities
            const integrations = generatedIntegrations.map((integration, index) => {
              const uniqueIntegration = {
                ...integration,
                name: `${integration.name}-${index}`,
                displayName: `${integration.displayName}-${index}`,
              };

              if (uniqueIntegration.capabilities.length === 0) {
                uniqueIntegration.capabilities = [
                  {
                    name: 'test_capability',
                    description: 'Test capability',
                    operation: 'create' as const,
                    parameters: [],
                  },
                ];
              }

              return uniqueIntegration;
            });

            // Mock API to return multiple integrations
            vi.mocked(api.getProvisioningIntegrations).mockResolvedValue({
              integrations,
            });

            // Render the component
            const { container } = render(ProvisionPage);

            // Wait for loading to complete by checking for the absence of loading text
            await waitFor(() => {
              expect(screen.queryByText(/loading provisioning integrations/i)).not.toBeInTheDocument();
            }, { timeout: 2000 });

            // Use within(container) to scope queries to this specific render
            const { getByRole, getByTestId } = within(container);

            // When multiple integrations are available, selector should be displayed
            if (integrations.length > 1) {
              expect(getByRole('navigation', { name: /integration selector/i })).toBeInTheDocument();

              // All integrations should appear in the selector
              for (const integration of integrations) {
                const selectorButton = getByRole('button', { name: new RegExp(integration.displayName, 'i') });
                expect(selectorButton).toBeInTheDocument();
              }
            }

            // At least one integration card should be visible
            const cardsGrid = getByTestId('integration-cards-grid');
            expect(cardsGrid).toBeInTheDocument();
            expect(cardsGrid.children.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 20, timeout: 10000 }
      );
    }, 15000);

    /**
     * Property 1 (edge case): Empty integration list shows empty state
     *
     * Tests that when the backend returns an empty list or all integrations
     * have zero capabilities, the appropriate empty state is displayed.
     *
     * **Validates: Requirements 2.3**
     */
    it('Feature: proxmox-frontend-ui, Property 1: shows empty state when no displayable integrations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(integrationArbitrary(), { minLength: 0, maxLength: 5 }),
          async (generatedIntegrations) => {
            // Cleanup before rendering to ensure clean state
            cleanup();

            // Force all integrations to have zero capabilities and ensure unique names
            const integrations = generatedIntegrations.map((integration, index) => ({
              ...integration,
              name: `${integration.name}-${index}`,
              capabilities: [],
            }));

            // Mock API to return integrations with no capabilities
            vi.mocked(api.getProvisioningIntegrations).mockResolvedValue({
              integrations,
            });

            // Render the component
            render(ProvisionPage);

            // Wait for loading to complete by checking for the absence of loading text
            await waitFor(() => {
              expect(screen.queryByText(/loading provisioning integrations/i)).not.toBeInTheDocument();
            }, { timeout: 2000 });

            // Empty state should always be displayed - use getAllByText since there might be multiple from previous renders
            const emptyStateElements = screen.getAllByText(/no provisioning integrations available/i);
            expect(emptyStateElements.length).toBeGreaterThan(0);

            const configureElements = screen.getAllByText(/configure a provisioning integration/i);
            expect(configureElements.length).toBeGreaterThan(0);

            // Setup link should be present
            const setupLinks = screen.getAllByRole('link', { name: /configure integrations/i });
            expect(setupLinks.length).toBeGreaterThan(0);
            expect(setupLinks[0]).toHaveAttribute('href', '/setup');

            // No integration cards should be displayed
            const cardsGrid = screen.queryByTestId('integration-cards-grid');
            expect(cardsGrid).not.toBeInTheDocument();
          }
        ),
        { numRuns: 20, timeout: 10000 }
      );
    }, 15000);
  });
});
