/**
 * Tests for ProxmoxSetupGuide (Env Snippet Wizard)
 *
 * Property tests: snippet contains required vars (Property 5),
 * no save calls (Property 6), sensitive masking (Property 7)
 *
 * Validates: Requirements 6.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import fc from 'fast-check';
import ProxmoxSetupGuide from './ProxmoxSetupGuide.svelte';

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
 * Arbitrary for Proxmox token-auth config values.
 */
function proxmoxTokenConfigArbitrary(): fc.Arbitrary<{
  host: string;
  port: number;
  token: string;
}> {
  return fc.record({
    host: fc.stringMatching(/^[a-z][a-z0-9.-]{2,30}$/).filter(h => !h.endsWith('.')),
    port: fc.integer({ min: 1, max: 65535 }),
    token: fc.stringMatching(/^[A-Za-z0-9@!=-]{8,40}$/),
  });
}

/**
 * Arbitrary for Proxmox password-auth config values.
 */
function proxmoxPasswordConfigArbitrary(): fc.Arbitrary<{
  host: string;
  port: number;
  username: string;
  password: string;
  realm: string;
}> {
  return fc.record({
    host: fc.stringMatching(/^[a-z][a-z0-9.-]{2,30}$/).filter(h => !h.endsWith('.')),
    port: fc.integer({ min: 1, max: 65535 }),
    username: fc.stringMatching(/^[a-z][a-z0-9_]{1,15}$/),
    password: fc.stringMatching(/^[A-Za-z0-9!@#$%^&*]{4,30}$/),
    realm: fc.constantFrom('pam', 'pve'),
  });
}

describe('ProxmoxSetupGuide', () => {
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
    it('Property 5: generated snippet contains all required Proxmox env vars (token auth)', async () => {
      await fc.assert(
        fc.asyncProperty(
          proxmoxTokenConfigArbitrary(),
          async (config) => {
            cleanup();
            clipboardWriteText.mockClear();

            const { container } = render(ProxmoxSetupGuide);

            const hostInput = container.querySelector('#proxmox-host') as HTMLInputElement;
            const portInput = container.querySelector('#proxmox-port') as HTMLInputElement;
            const tokenInput = container.querySelector('#proxmox-token') as HTMLInputElement;

            await setInputValue(hostInput, config.host);
            await setInputValue(portInput, String(config.port));
            await setInputValue(tokenInput, config.token);

            const copyButton = screen.getByText(/copy to clipboard/i);
            await fireEvent.click(copyButton);

            expect(clipboardWriteText).toHaveBeenCalledTimes(1);
            const snippet = clipboardWriteText.mock.calls[0][0];

            expect(snippet).toContain('PROXMOX_ENABLED=true');
            expect(snippet).toContain(`PROXMOX_HOST=${config.host}`);
            expect(snippet).toContain(`PROXMOX_PORT=${config.port}`);
            expect(snippet).toContain(`PROXMOX_TOKEN=${config.token}`);
            expect(snippet).toContain('PROXMOX_SSL_REJECT_UNAUTHORIZED=');
          }
        ),
        { numRuns: 100, timeout: 60000 }
      );
    }, 120000);

    // Feature: v1-release-prep, Property 5: Env snippet contains required variables (password auth)
    it('Property 5: generated snippet contains all required Proxmox env vars (password auth)', async () => {
      await fc.assert(
        fc.asyncProperty(
          proxmoxPasswordConfigArbitrary(),
          async (config) => {
            cleanup();
            clipboardWriteText.mockClear();

            const { container } = render(ProxmoxSetupGuide);

            // Switch to password auth
            const passwordButton = screen.getByText('Password');
            await fireEvent.click(passwordButton);

            const hostInput = container.querySelector('#proxmox-host') as HTMLInputElement;
            const portInput = container.querySelector('#proxmox-port') as HTMLInputElement;
            const usernameInput = container.querySelector('#proxmox-username') as HTMLInputElement;
            const passwordInput = container.querySelector('#proxmox-password') as HTMLInputElement;

            await setInputValue(hostInput, config.host);
            await setInputValue(portInput, String(config.port));
            await setInputValue(usernameInput, config.username);
            await setInputValue(passwordInput, config.password);

            // Set realm via select element
            const realmSelect = container.querySelector('#proxmox-realm') as HTMLSelectElement;
            realmSelect.value = config.realm;
            await fireEvent.change(realmSelect);

            const copyButton = screen.getByText(/copy to clipboard/i);
            await fireEvent.click(copyButton);

            expect(clipboardWriteText).toHaveBeenCalledTimes(1);
            const snippet = clipboardWriteText.mock.calls[0][0];

            expect(snippet).toContain('PROXMOX_ENABLED=true');
            expect(snippet).toContain(`PROXMOX_HOST=${config.host}`);
            expect(snippet).toContain(`PROXMOX_PORT=${config.port}`);
            expect(snippet).toContain(`PROXMOX_USERNAME=${config.username}`);
            expect(snippet).toContain(`PROXMOX_PASSWORD=${config.password}`);
            expect(snippet).toContain(`PROXMOX_REALM=${config.realm}`);
            expect(snippet).toContain('PROXMOX_SSL_REJECT_UNAUTHORIZED=');
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
          proxmoxTokenConfigArbitrary(),
          async (config) => {
            cleanup();
            fetchSpy.mockClear();

            render(ProxmoxSetupGuide);

            const hostInput = document.querySelector('#proxmox-host') as HTMLInputElement;
            const portInput = document.querySelector('#proxmox-port') as HTMLInputElement;
            const tokenInput = document.querySelector('#proxmox-token') as HTMLInputElement;

            await setInputValue(hostInput, config.host);
            await setInputValue(portInput, String(config.port));
            await setInputValue(tokenInput, config.token);

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

    // Feature: v1-release-prep, Property 7: Sensitive values masked in preview, present in clipboard
    it('Property 7: sensitive values are masked in preview but present in clipboard (token auth)', async () => {
      await fc.assert(
        fc.asyncProperty(
          proxmoxTokenConfigArbitrary(),
          async (config) => {
            cleanup();
            clipboardWriteText.mockClear();

            const { container } = render(ProxmoxSetupGuide);

            const hostInput = container.querySelector('#proxmox-host') as HTMLInputElement;
            const portInput = container.querySelector('#proxmox-port') as HTMLInputElement;
            const tokenInput = container.querySelector('#proxmox-token') as HTMLInputElement;

            await setInputValue(hostInput, config.host);
            await setInputValue(portInput, String(config.port));
            await setInputValue(tokenInput, config.token);

            // Check preview (masked)
            const preElement = container.querySelector('pre');
            expect(preElement).not.toBeNull();
            const previewText = preElement!.textContent ?? '';

            const tokenLine = previewText.split('\n').find(l => l.startsWith('PROXMOX_TOKEN='));
            expect(tokenLine).toBeDefined();
            expect(tokenLine).not.toContain(config.token);
            expect(tokenLine).toMatch(/PROXMOX_TOKEN=\*+/);

            // Check clipboard (unmasked)
            const copyButton = screen.getByText(/copy to clipboard/i);
            await fireEvent.click(copyButton);

            expect(clipboardWriteText).toHaveBeenCalledTimes(1);
            const clipboardText = clipboardWriteText.mock.calls[0][0];
            expect(clipboardText).toContain(`PROXMOX_TOKEN=${config.token}`);
          }
        ),
        { numRuns: 100, timeout: 60000 }
      );
    }, 120000);

    // Feature: v1-release-prep, Property 7: Sensitive values masked in preview (password auth)
    it('Property 7: password is masked in preview but present in clipboard', async () => {
      await fc.assert(
        fc.asyncProperty(
          proxmoxPasswordConfigArbitrary(),
          async (config) => {
            cleanup();
            clipboardWriteText.mockClear();

            const { container } = render(ProxmoxSetupGuide);

            // Switch to password auth
            const passwordButton = screen.getByText('Password');
            await fireEvent.click(passwordButton);

            const hostInput = container.querySelector('#proxmox-host') as HTMLInputElement;
            const portInput = container.querySelector('#proxmox-port') as HTMLInputElement;
            const usernameInput = container.querySelector('#proxmox-username') as HTMLInputElement;
            const passwordInput = container.querySelector('#proxmox-password') as HTMLInputElement;

            await setInputValue(hostInput, config.host);
            await setInputValue(portInput, String(config.port));
            await setInputValue(usernameInput, config.username);
            await setInputValue(passwordInput, config.password);

            // Set realm via select element
            const realmSelect = container.querySelector('#proxmox-realm') as HTMLSelectElement;
            realmSelect.value = config.realm;
            await fireEvent.change(realmSelect);

            // Check preview (masked)
            const preElement = container.querySelector('pre');
            expect(preElement).not.toBeNull();
            const previewText = preElement!.textContent ?? '';

            const passwordLine = previewText.split('\n').find(l => l.startsWith('PROXMOX_PASSWORD='));
            expect(passwordLine).toBeDefined();
            expect(passwordLine).not.toContain(config.password);
            expect(passwordLine).toMatch(/PROXMOX_PASSWORD=\*+/);

            // Check clipboard (unmasked)
            const copyButton = screen.getByText(/copy to clipboard/i);
            await fireEvent.click(copyButton);

            expect(clipboardWriteText).toHaveBeenCalledTimes(1);
            const clipboardText = clipboardWriteText.mock.calls[0][0];
            expect(clipboardText).toContain(`PROXMOX_PASSWORD=${config.password}`);
          }
        ),
        { numRuns: 100, timeout: 60000 }
      );
    }, 120000);
  });
});
