/**
 * Tests for AWSSetupGuide (Env Snippet Wizard)
 *
 * Property tests: snippet contains required vars (Property 5),
 * no save calls (Property 6)
 *
 * Validates: Requirements 6.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import fc from 'fast-check';
import AWSSetupGuide from './AWSSetupGuide.svelte';

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
 * Arbitrary for AWS config values.
 * Generates realistic access key / secret / region combos.
 */
function awsConfigArbitrary(): fc.Arbitrary<{
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}> {
  return fc.record({
    accessKeyId: fc.stringMatching(/^AKIA[A-Z0-9]{12,16}$/),
    secretAccessKey: fc.stringMatching(/^[A-Za-z0-9/+=]{20,40}$/),
    region: fc.constantFrom(
      'us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1',
      'ap-southeast-1', 'ap-northeast-1', 'sa-east-1'
    ),
  });
}

describe('AWSSetupGuide', () => {
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
    // Feature: v1-release-prep, Property 5: Env snippet contains required variables
    it('Property 5: generated snippet contains all required AWS env vars', async () => {
      await fc.assert(
        fc.asyncProperty(
          awsConfigArbitrary(),
          async (config) => {
            cleanup();
            clipboardWriteText.mockClear();

            const { container } = render(AWSSetupGuide);

            const accessKeyInput = container.querySelector('#aws-access-key') as HTMLInputElement;
            const secretKeyInput = container.querySelector('#aws-secret-key') as HTMLInputElement;
            const regionInput = container.querySelector('#aws-region') as HTMLInputElement;

            await setInputValue(accessKeyInput, config.accessKeyId);
            await setInputValue(secretKeyInput, config.secretAccessKey);
            await setInputValue(regionInput, config.region);

            const copyButton = screen.getByText(/copy to clipboard/i);
            await fireEvent.click(copyButton);

            expect(clipboardWriteText).toHaveBeenCalledTimes(1);
            const snippet = clipboardWriteText.mock.calls[0][0];

            expect(snippet).toContain('AWS_ENABLED=true');
            expect(snippet).toContain(`AWS_DEFAULT_REGION=${config.region}`);
            expect(snippet).toContain(`AWS_ACCESS_KEY_ID=${config.accessKeyId}`);
            expect(snippet).toContain(`AWS_SECRET_ACCESS_KEY=${config.secretAccessKey}`);
          }
        ),
        { numRuns: 100, timeout: 60000 }
      );
    }, 120000);

    // Feature: v1-release-prep, Property 6: Setup wizard makes no save API calls
    it('Property 6: component makes zero save/persist API calls for any interaction', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      await fc.assert(
        fc.asyncProperty(
          awsConfigArbitrary(),
          async (config) => {
            cleanup();
            fetchSpy.mockClear();

            render(AWSSetupGuide);

            const accessKeyInput = document.querySelector('#aws-access-key') as HTMLInputElement;
            const secretKeyInput = document.querySelector('#aws-secret-key') as HTMLInputElement;
            const regionInput = document.querySelector('#aws-region') as HTMLInputElement;

            await setInputValue(accessKeyInput, config.accessKeyId);
            await setInputValue(secretKeyInput, config.secretAccessKey);
            await setInputValue(regionInput, config.region);

            const copyButton = screen.getByText(/copy to clipboard/i);
            await fireEvent.click(copyButton);

            // Verify zero fetch calls (no save/persist API calls)
            const apiCalls = fetchSpy.mock.calls.filter(([url]) => {
              const urlStr = typeof url === 'string' ? url : (url as Request).url;
              return urlStr.includes('/api/');
            });
            expect(apiCalls).toHaveLength(0);
          }
        ),
        { numRuns: 100, timeout: 60000 }
      );

      fetchSpy.mockRestore();
    }, 120000);
  });
});
