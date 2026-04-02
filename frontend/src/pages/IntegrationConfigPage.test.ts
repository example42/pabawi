/**
 * Tests for IntegrationConfigPage (Integration Status Dashboard)
 *
 * Property tests: dashboard renders all integrations (Property 2),
 * no mutation controls (Property 3), correct status colors (Property 4)
 * Unit tests: test connection button behavior, error states, loading states
 *
 * Validates: Requirements 6.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import fc from 'fast-check';
import IntegrationConfigPage from './IntegrationConfigPage.svelte';
import * as api from '../lib/api';

// Mock the API module
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    get: vi.fn(),
    testProxmoxConnection: vi.fn(),
    testAWSConnection: vi.fn(),
  };
});

// Mock the toast module
vi.mock('../lib/toast.svelte', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showWarning: vi.fn(),
  showInfo: vi.fn(),
}));

// Mock the router module
vi.mock('../lib/router.svelte', () => ({
  router: {
    navigate: vi.fn(),
  },
}));

/**
 * Integration status type matching the component's internal interface
 */
interface IntegrationStatus {
  name: string;
  type: string;
  status: 'connected' | 'degraded' | 'error' | 'not_configured';
  healthy: boolean;
  message?: string;
  lastCheck?: string;
}

/**
 * fast-check arbitrary for generating valid integration status objects
 */
function integrationStatusArbitrary(): fc.Arbitrary<IntegrationStatus> {
  return fc.record({
    name: fc.stringMatching(/^[a-z][a-z0-9_]{2,15}$/),
    type: fc.constantFrom('proxmox', 'aws', 'puppetdb', 'puppetserver', 'ansible', 'hiera', 'ssh', 'bolt'),
    status: fc.constantFrom('connected' as const, 'degraded' as const, 'error' as const, 'not_configured' as const),
    healthy: fc.boolean(),
    message: fc.option(fc.string({ minLength: 1, maxLength: 80 }), { nil: undefined }),
    lastCheck: fc.option(
      fc.integer({ min: 1577836800000, max: 1893456000000 }).map(ts => new Date(ts).toISOString()),
      { nil: undefined }
    ),
  });
}

/**
 * Helper to mock the GET /api/integrations/status response
 */
function mockStatusResponse(integrations: IntegrationStatus[]): void {
  vi.mocked(api.get).mockResolvedValue({ integrations });
}

describe('IntegrationConfigPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // ─── Property-Based Tests ───────────────────────────────────────────

  describe('Property-Based Tests', () => {
    // Feature: v1-release-prep, Property 2: Dashboard displays all integrations
    it('Property 2: dashboard renders a card for each integration with name and status indicator', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(integrationStatusArbitrary(), { minLength: 1, maxLength: 8 })
            .map(arr => {
              // Ensure unique names to avoid Svelte keyed each block issues
              const seen = new Set<string>();
              return arr.filter(i => {
                if (seen.has(i.name)) return false;
                seen.add(i.name);
                return true;
              });
            })
            .filter(arr => arr.length > 0),
          async (integrations) => {
            cleanup();
            mockStatusResponse(integrations);

            render(IntegrationConfigPage);

            await waitFor(() => {
              expect(screen.queryByText(/loading integration status/i)).not.toBeInTheDocument();
            }, { timeout: 2000 });

            // Each integration should have its name rendered
            for (const integration of integrations) {
              const nameElements = screen.queryAllByText(integration.name);
              expect(nameElements.length).toBeGreaterThanOrEqual(1);
            }

            // Each integration should have a status indicator dot (rounded-full span)
            const statusDots = document.querySelectorAll('span.rounded-full');
            expect(statusDots.length).toBeGreaterThanOrEqual(integrations.length);
          }
        ),
        { numRuns: 100, timeout: 30000 }
      );
    }, 60000);

    // Feature: v1-release-prep, Property 3: Dashboard has no mutation controls
    it('Property 3: dashboard contains zero form inputs, save buttons, and delete buttons', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(integrationStatusArbitrary(), { minLength: 0, maxLength: 8 })
            .map(arr => {
              const seen = new Set<string>();
              return arr.filter(i => {
                if (seen.has(i.name)) return false;
                seen.add(i.name);
                return true;
              });
            }),
          async (integrations) => {
            cleanup();
            mockStatusResponse(integrations);

            render(IntegrationConfigPage);

            await waitFor(() => {
              expect(screen.queryByText(/loading integration status/i)).not.toBeInTheDocument();
            }, { timeout: 2000 });

            // No form input fields (text, email, password, number, etc.)
            const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="password"], input[type="number"], textarea, select');
            expect(inputs.length).toBe(0);

            // No save buttons
            const saveButtons = screen.queryAllByRole('button', { name: /save/i });
            expect(saveButtons.length).toBe(0);

            // No delete buttons
            const deleteButtons = screen.queryAllByRole('button', { name: /delete/i });
            expect(deleteButtons.length).toBe(0);
          }
        ),
        { numRuns: 100, timeout: 30000 }
      );
    }, 60000);

    // Feature: v1-release-prep, Property 4: Status indicator color matches health state
    it('Property 4: status indicator color matches the integration health state', async () => {
      await fc.assert(
        fc.asyncProperty(
          integrationStatusArbitrary(),
          async (integration) => {
            cleanup();
            mockStatusResponse([integration]);

            const { container } = render(IntegrationConfigPage);

            await waitFor(() => {
              expect(screen.queryByText(/loading integration status/i)).not.toBeInTheDocument();
            }, { timeout: 2000 });

            // Find the status indicator dot within the integration card
            const statusDots = container.querySelectorAll('span.rounded-full');

            // Map expected CSS class per status
            const expectedColorClass: Record<string, string> = {
              connected: 'bg-green-400',
              error: 'bg-red-400',
              not_configured: 'bg-gray-400',
              degraded: 'bg-yellow-400',
            };

            const expected = expectedColorClass[integration.status];

            // At least one status dot should have the expected color class
            const matchingDots = Array.from(statusDots).filter(dot =>
              dot.classList.contains(expected)
            );
            expect(matchingDots.length).toBeGreaterThanOrEqual(1);
          }
        ),
        { numRuns: 100, timeout: 30000 }
      );
    }, 60000);
  });

  // ─── Unit Tests ─────────────────────────────────────────────────────

  describe('Loading State', () => {
    it('displays loading spinner while fetching status', () => {
      // Mock API to never resolve
      vi.mocked(api.get).mockImplementation(() => new Promise(() => {}));

      render(IntegrationConfigPage);

      expect(screen.getByText(/loading integration status/i)).toBeInTheDocument();
    });
  });

  describe('Error State', () => {
    it('displays error message when API call fails', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Network error'));

      render(IntegrationConfigPage);

      await waitFor(() => {
        expect(screen.getByText(/network error|failed to load/i)).toBeInTheDocument();
      });
    });

    it('displays retry button on error', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Server error'));

      render(IntegrationConfigPage);

      await waitFor(() => {
        expect(screen.getByText(/retry/i)).toBeInTheDocument();
      });
    });

    it('retries loading when retry button is clicked', async () => {
      let callCount = 0;
      vi.mocked(api.get).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('Temporary error'));
        }
        return Promise.resolve({
          integrations: [
            { name: 'Proxmox', type: 'proxmox', status: 'connected', healthy: true },
          ],
        });
      });

      render(IntegrationConfigPage);

      await waitFor(() => {
        expect(screen.getByText(/retry/i)).toBeInTheDocument();
      });

      await fireEvent.click(screen.getByText(/retry/i));

      await waitFor(() => {
        expect(screen.getByText('Proxmox')).toBeInTheDocument();
      });

      expect(callCount).toBe(2);
    });
  });

  describe('Empty State', () => {
    it('displays empty state when no integrations are returned', async () => {
      mockStatusResponse([]);

      render(IntegrationConfigPage);

      await waitFor(() => {
        expect(screen.getByText(/no integrations registered/i)).toBeInTheDocument();
      });
    });
  });

  describe('Test Connection Button', () => {
    it('shows Test Connection button for enabled Proxmox integration', async () => {
      mockStatusResponse([
        { name: 'Proxmox', type: 'proxmox', status: 'connected', healthy: true },
      ]);

      render(IntegrationConfigPage);

      await waitFor(() => {
        expect(screen.getByText('Proxmox')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /test connection/i })).toBeInTheDocument();
    });

    it('shows Test Connection button for enabled AWS integration', async () => {
      mockStatusResponse([
        { name: 'AWS', type: 'aws', status: 'connected', healthy: true },
      ]);

      render(IntegrationConfigPage);

      await waitFor(() => {
        expect(screen.getByText('AWS')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: /test connection/i })).toBeInTheDocument();
    });

    it('does not show Test Connection button for not_configured integrations', async () => {
      mockStatusResponse([
        { name: 'Proxmox', type: 'proxmox', status: 'not_configured', healthy: false },
      ]);

      render(IntegrationConfigPage);

      await waitFor(() => {
        expect(screen.getByText('Proxmox')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /test connection/i })).not.toBeInTheDocument();
    });

    it('does not show Test Connection button for non-testable integrations', async () => {
      mockStatusResponse([
        { name: 'PuppetDB', type: 'puppetdb', status: 'connected', healthy: true },
      ]);

      render(IntegrationConfigPage);

      await waitFor(() => {
        expect(screen.getByText('PuppetDB')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /test connection/i })).not.toBeInTheDocument();
    });

    it('calls testProxmoxConnection when Proxmox test button is clicked', async () => {
      vi.mocked(api.testProxmoxConnection).mockResolvedValue({
        success: true,
        message: 'Connected to Proxmox VE 8.0',
      });

      mockStatusResponse([
        { name: 'Proxmox', type: 'proxmox', status: 'connected', healthy: true },
      ]);

      render(IntegrationConfigPage);

      await waitFor(() => {
        expect(screen.getByText('Proxmox')).toBeInTheDocument();
      });

      await fireEvent.click(screen.getByRole('button', { name: /test connection/i }));

      await waitFor(() => {
        expect(api.testProxmoxConnection).toHaveBeenCalledTimes(1);
      });
    });

    it('calls testAWSConnection when AWS test button is clicked', async () => {
      vi.mocked(api.testAWSConnection).mockResolvedValue({
        success: true,
        message: 'Connected to AWS us-east-1',
      });

      mockStatusResponse([
        { name: 'AWS', type: 'aws', status: 'connected', healthy: true },
      ]);

      render(IntegrationConfigPage);

      await waitFor(() => {
        expect(screen.getByText('AWS')).toBeInTheDocument();
      });

      await fireEvent.click(screen.getByRole('button', { name: /test connection/i }));

      await waitFor(() => {
        expect(api.testAWSConnection).toHaveBeenCalledTimes(1);
      });
    });

    it('displays success message after successful connection test', async () => {
      vi.mocked(api.testProxmoxConnection).mockResolvedValue({
        success: true,
        message: 'Connected to Proxmox VE 8.0',
      });

      mockStatusResponse([
        { name: 'Proxmox', type: 'proxmox', status: 'connected', healthy: true },
      ]);

      render(IntegrationConfigPage);

      await waitFor(() => {
        expect(screen.getByText('Proxmox')).toBeInTheDocument();
      });

      await fireEvent.click(screen.getByRole('button', { name: /test connection/i }));

      await waitFor(() => {
        expect(screen.getByText(/connected to proxmox ve 8\.0/i)).toBeInTheDocument();
      });
    });

    it('displays error message after failed connection test', async () => {
      vi.mocked(api.testProxmoxConnection).mockResolvedValue({
        success: false,
        message: 'Connection refused',
      });

      mockStatusResponse([
        { name: 'Proxmox', type: 'proxmox', status: 'error', healthy: false },
      ]);

      render(IntegrationConfigPage);

      await waitFor(() => {
        expect(screen.getByText('Proxmox')).toBeInTheDocument();
      });

      await fireEvent.click(screen.getByRole('button', { name: /test connection/i }));

      await waitFor(() => {
        expect(screen.getByText(/connection refused/i)).toBeInTheDocument();
      });
    });

    it('displays error message when test connection throws', async () => {
      vi.mocked(api.testProxmoxConnection).mockRejectedValue(new Error('Network timeout'));

      mockStatusResponse([
        { name: 'Proxmox', type: 'proxmox', status: 'connected', healthy: true },
      ]);

      render(IntegrationConfigPage);

      await waitFor(() => {
        expect(screen.getByText('Proxmox')).toBeInTheDocument();
      });

      await fireEvent.click(screen.getByRole('button', { name: /test connection/i }));

      await waitFor(() => {
        expect(screen.getByText(/network timeout/i)).toBeInTheDocument();
      });
    });

    it('disables test button while testing is in progress', async () => {
      // Mock to never resolve so we can check the disabled state
      vi.mocked(api.testProxmoxConnection).mockImplementation(
        () => new Promise(() => {})
      );

      mockStatusResponse([
        { name: 'Proxmox', type: 'proxmox', status: 'connected', healthy: true },
      ]);

      render(IntegrationConfigPage);

      await waitFor(() => {
        expect(screen.getByText('Proxmox')).toBeInTheDocument();
      });

      const testButton = screen.getByRole('button', { name: /test connection/i });
      await fireEvent.click(testButton);

      await waitFor(() => {
        const button = screen.getByRole('button', { name: /testing/i });
        expect(button).toBeDisabled();
      });
    });
  });

  describe('Status Display', () => {
    it('displays correct status labels for each status type', async () => {
      mockStatusResponse([
        { name: 'Int1', type: 'proxmox', status: 'connected', healthy: true },
        { name: 'Int2', type: 'aws', status: 'degraded', healthy: false },
        { name: 'Int3', type: 'puppetdb', status: 'error', healthy: false },
        { name: 'Int4', type: 'ansible', status: 'not_configured', healthy: false },
      ]);

      render(IntegrationConfigPage);

      await waitFor(() => {
        expect(screen.getByText('Int1')).toBeInTheDocument();
      });

      expect(screen.getByText('Connected')).toBeInTheDocument();
      expect(screen.getByText('Degraded')).toBeInTheDocument();
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Not Configured')).toBeInTheDocument();
    });

    it('displays integration message when provided', async () => {
      mockStatusResponse([
        { name: 'Proxmox', type: 'proxmox', status: 'connected', healthy: true, message: 'Proxmox VE 8.0.4' },
      ]);

      render(IntegrationConfigPage);

      await waitFor(() => {
        expect(screen.getByText('Proxmox VE 8.0.4')).toBeInTheDocument();
      });
    });

    it('sets the correct page title', () => {
      mockStatusResponse([]);
      render(IntegrationConfigPage);
      expect(document.title).toBe('Pabawi - Integration Status');
    });
  });
});
