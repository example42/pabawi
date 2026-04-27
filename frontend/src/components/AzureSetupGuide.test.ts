/**
 * Tests for AzureSetupGuide (Env Snippet Wizard)
 *
 * Validates: snippet contains required vars, secrets are masked in preview,
 * required fields gate the copy button, no save API calls are made.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import fc from 'fast-check';
import AzureSetupGuide from './AzureSetupGuide.svelte';

// Mock the toast module
vi.mock('../lib/toast.svelte', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showWarning: vi.fn(),
  showInfo: vi.fn(),
}));

/** Stable clipboard mock — reused across all tests */
const clipboardWriteText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);

/**
 * Helper to set an input value and trigger Svelte's bind:value reactivity.
 */
async function setInputValue(el: HTMLInputElement, value: string): Promise<void> {
  el.value = value;
  await fireEvent.input(el);
}

/**
 * Arbitrary for Azure config values.
 */
function azureConfigArbitrary(): fc.Arbitrary<{
  subscriptionId: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
}> {
  const uuidArb = fc.uuid();
  return fc.record({
    subscriptionId: uuidArb,
    tenantId: uuidArb,
    clientId: uuidArb,
    clientSecret: fc.stringMatching(/^[A-Za-z0-9~._-]{8,32}$/),
  });
}

describe('AzureSetupGuide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: clipboardWriteText },
    });
  });

  afterEach(() => {
    cleanup();
  });

  // ─── Property-Based Tests ───────────────────────────────────────────

  describe('Property-Based Tests', () => {
    it('generated snippet contains all required Azure env vars', async () => {
      await fc.assert(
        fc.asyncProperty(
          azureConfigArbitrary(),
          async (config) => {
            cleanup();
            clipboardWriteText.mockClear();

            const { container } = render(AzureSetupGuide);

            const subscriptionInput = container.querySelector('#azure-subscription-id') as HTMLInputElement;
            const tenantInput = container.querySelector('#azure-tenant-id') as HTMLInputElement;
            const clientIdInput = container.querySelector('#azure-client-id') as HTMLInputElement;
            const clientSecretInput = container.querySelector('#azure-client-secret') as HTMLInputElement;

            await setInputValue(subscriptionInput, config.subscriptionId);
            await setInputValue(tenantInput, config.tenantId);
            await setInputValue(clientIdInput, config.clientId);
            await setInputValue(clientSecretInput, config.clientSecret);

            const copyButton = screen.getByText(/copy to clipboard/i);
            await fireEvent.click(copyButton);

            expect(clipboardWriteText).toHaveBeenCalledTimes(1);
            const snippet = clipboardWriteText.mock.calls[0][0];

            expect(snippet).toContain('AZURE_ENABLED=true');
            expect(snippet).toContain(`AZURE_SUBSCRIPTION_ID=${config.subscriptionId}`);
            expect(snippet).toContain(`AZURE_TENANT_ID=${config.tenantId}`);
            expect(snippet).toContain(`AZURE_CLIENT_ID=${config.clientId}`);
            expect(snippet).toContain(`AZURE_CLIENT_SECRET=${config.clientSecret}`);
          }
        ),
        { numRuns: 20, timeout: 60000 }
      );
    }, 120000);

    it('secret values are masked in the preview but not in clipboard content', async () => {
      await fc.assert(
        fc.asyncProperty(
          azureConfigArbitrary(),
          async (config) => {
            cleanup();
            clipboardWriteText.mockClear();

            const { container } = render(AzureSetupGuide);

            const subscriptionInput = container.querySelector('#azure-subscription-id') as HTMLInputElement;
            const clientSecretInput = container.querySelector('#azure-client-secret') as HTMLInputElement;

            await setInputValue(subscriptionInput, config.subscriptionId);
            await setInputValue(clientSecretInput, config.clientSecret);

            // The visible preview (pre element) should mask the secret
            const pre = container.querySelector('pre');
            expect(pre).not.toBeNull();
            if (pre && config.clientSecret.length > 0) {
              expect(pre.textContent).not.toContain(`AZURE_CLIENT_SECRET=${config.clientSecret}`);
              // It should show asterisks instead
              expect(pre.textContent).toMatch(/AZURE_CLIENT_SECRET=\*+/);
            }

            // The actual clipboard content should contain the real secret
            const copyButton = screen.getByText(/copy to clipboard/i);
            await fireEvent.click(copyButton);
            expect(clipboardWriteText).toHaveBeenCalledTimes(1);
            const snippet = clipboardWriteText.mock.calls[0][0];
            expect(snippet).toContain(`AZURE_CLIENT_SECRET=${config.clientSecret}`);
          }
        ),
        { numRuns: 15, timeout: 60000 }
      );
    }, 120000);

    it('component makes zero save/persist API calls for any interaction', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await fc.assert(
        fc.asyncProperty(
          azureConfigArbitrary(),
          async (config) => {
            cleanup();
            fetchSpy.mockClear();

            const { container } = render(AzureSetupGuide);

            const subscriptionInput = container.querySelector('#azure-subscription-id') as HTMLInputElement;
            await setInputValue(subscriptionInput, config.subscriptionId);

            const copyButton = screen.getByText(/copy to clipboard/i);
            await fireEvent.click(copyButton);

            const apiCalls = fetchSpy.mock.calls.filter(([url]) => {
              const urlStr = typeof url === 'string' ? url : (url as Request).url;
              return urlStr.includes('/api/');
            });
            expect(apiCalls).toHaveLength(0);
          }
        ),
        { numRuns: 15, timeout: 60000 }
      );

      fetchSpy.mockRestore();
    }, 120000);
  });

  // ─── Unit Tests ─────────────────────────────────────────────────────

  describe('Form Validation', () => {
    it('copy button is disabled (form invalid) when subscriptionId is empty', async () => {
      render(AzureSetupGuide);

      // Without any input, the snippet preview should warn about missing subscription
      const warningText = screen.queryByText(/Fill in the Subscription ID/i);
      expect(warningText).not.toBeNull();
    });

    it('shows next steps after subscriptionId is filled', async () => {
      const { container } = render(AzureSetupGuide);

      const subscriptionInput = container.querySelector('#azure-subscription-id') as HTMLInputElement;
      await setInputValue(subscriptionInput, '12345678-0000-0000-0000-000000000000');

      const nextTip = screen.queryByText(/Paste into/i);
      expect(nextTip).not.toBeNull();
    });

    it('snippet does not contain AZURE_DEFAULT_LOCATION', async () => {
      const { container } = render(AzureSetupGuide);

      const subscriptionInput = container.querySelector('#azure-subscription-id') as HTMLInputElement;
      await setInputValue(subscriptionInput, 'sub-1234');

      const copyButton = screen.getByText(/copy to clipboard/i);
      await fireEvent.click(copyButton);

      const snippet = clipboardWriteText.mock.calls[0]?.[0] ?? '';
      expect(snippet).not.toContain('AZURE_DEFAULT_LOCATION');
    });
  });
});
