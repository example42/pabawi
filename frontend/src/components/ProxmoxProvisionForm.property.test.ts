/**
 * Property-based tests for ProxmoxProvisionForm component
 * Feature: proxmox-frontend-ui
 * Task 5.6: Component-level property tests for form validation
 *
 * These tests verify component behavior (not just validation utilities):
 * - Property 8: Form Validation Completeness - invalid data prevents submission
 * - Property 9: Valid Form Enables Submission - valid data enables submission
 *
 * Note: Validation utility tests exist in lib/validation.property.test.ts
 * These tests verify the component integrates validation correctly
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import * as fc from 'fast-check';
import ProxmoxProvisionForm from './ProxmoxProvisionForm.svelte';
import type { ProxmoxVMParams, ProxmoxLXCParams } from '../lib/types/provisioning';

// Known test nodes that the mock API will return
const TEST_NODES = [
  { node: 'pve1', status: 'online' },
  { node: 'pve2', status: 'online' },
  { node: 'pve3', status: 'offline' },
];
const TEST_NODE_NAMES = TEST_NODES.map(n => n.node);

// Mock API functions — provide nodes so the <select> has options
vi.mock('../lib/api', () => ({
  createProxmoxVM: vi.fn(),
  createProxmoxLXC: vi.fn(),
  getProxmoxNodes: vi.fn().mockResolvedValue([
    { node: 'pve1', status: 'online' },
    { node: 'pve2', status: 'online' },
    { node: 'pve3', status: 'offline' },
  ]),
  getProxmoxNextVMID: vi.fn().mockResolvedValue(undefined),
  getProxmoxISOs: vi.fn().mockResolvedValue([]),
  getProxmoxTemplates: vi.fn().mockResolvedValue([]),
  getProxmoxStorages: vi.fn().mockResolvedValue([]),
  getProxmoxNetworks: vi.fn().mockResolvedValue([]),
}));

// Mock toast notifications
vi.mock('../lib/toast.svelte', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

// Mock logger
vi.mock('../lib/logger.svelte', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

/**
 * Custom arbitraries for generating test data
 */

// Generate valid VMID (100-999999999)
const validVMIDArbitrary = (): fc.Arbitrary<number> => fc.integer({ min: 100, max: 999999999 });

// Generate invalid VMID (outside valid range)
const invalidVMIDArbitrary = (): fc.Arbitrary<number> => fc.oneof(
  fc.integer({ min: -1000, max: 99 }),
  fc.integer({ min: 1000000000, max: 2000000000 })
);

// Generate valid hostname (lowercase alphanumeric with hyphens)
const validHostnameArbitrary = (): fc.Arbitrary<string> => fc.stringMatching(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/)
  .filter(s => s.length > 0 && s.length <= 50);

// Generate invalid hostname (contains uppercase, special chars, or invalid format)
const invalidHostnameArbitrary = (): fc.Arbitrary<string> => fc.oneof(
  fc.string().filter(s => s.length > 0 && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(s)),
  fc.constant(''), // Empty string
  fc.constant('-invalid'), // Starts with hyphen
  fc.constant('invalid-'), // Ends with hyphen
  fc.constant('UPPERCASE') // Contains uppercase
);

// Generate valid memory (>= 512)
const validMemoryArbitrary = (): fc.Arbitrary<number> => fc.integer({ min: 512, max: 100000 });

// Generate invalid memory (< 512)
const invalidMemoryArbitrary = (): fc.Arbitrary<number> => fc.integer({ min: 0, max: 511 });

// Generate valid cores (1-128)
const validCoresArbitrary = (): fc.Arbitrary<number> => fc.integer({ min: 1, max: 128 });

// Generate invalid cores (outside valid range)
const invalidCoresArbitrary = (): fc.Arbitrary<number> => fc.oneof(
  fc.integer({ min: -10, max: 0 }),
  fc.integer({ min: 129, max: 500 })
);

// Generate a valid node name from the known test nodes
const validNodeArbitrary = (): fc.Arbitrary<string> => fc.constantFrom(...TEST_NODE_NAMES);

// Generate valid VM form data
const validVMFormDataArbitrary = (): fc.Arbitrary<Partial<ProxmoxVMParams>> => fc.record({
  vmid: validVMIDArbitrary(),
  name: validHostnameArbitrary(),
  node: validNodeArbitrary(),
  cores: fc.option(validCoresArbitrary()).map(v => v ?? undefined),
  memory: fc.option(validMemoryArbitrary()).map(v => v ?? undefined),
});

// Generate invalid VM form data (at least one invalid field)
const invalidVMFormDataArbitrary = (): fc.Arbitrary<Partial<ProxmoxVMParams>> => fc.oneof(
  // Invalid VMID
  fc.record({
    vmid: invalidVMIDArbitrary(),
    name: validHostnameArbitrary(),
    node: validNodeArbitrary(),
  }),
  // Invalid name
  fc.record({
    vmid: validVMIDArbitrary(),
    name: invalidHostnameArbitrary(),
    node: validNodeArbitrary(),
  }),
  // Invalid memory
  fc.record({
    vmid: validVMIDArbitrary(),
    name: validHostnameArbitrary(),
    node: validNodeArbitrary(),
    memory: invalidMemoryArbitrary(),
  }),
  // Invalid cores
  fc.record({
    vmid: validVMIDArbitrary(),
    name: validHostnameArbitrary(),
    node: validNodeArbitrary(),
    cores: invalidCoresArbitrary(),
  })
);

// Generate valid LXC form data
const validLXCFormDataArbitrary = (): fc.Arbitrary<Partial<ProxmoxLXCParams>> => fc.record({
  vmid: validVMIDArbitrary(),
  hostname: validHostnameArbitrary(),
  node: validNodeArbitrary(),
  ostemplate: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  cores: fc.option(validCoresArbitrary()).map(v => v ?? undefined),
  memory: fc.option(validMemoryArbitrary()).map(v => v ?? undefined),
});

// Generate invalid LXC form data (at least one invalid field)
const invalidLXCFormDataArbitrary = (): fc.Arbitrary<Partial<ProxmoxLXCParams>> => fc.oneof(
  // Invalid VMID
  fc.record({
    vmid: invalidVMIDArbitrary(),
    hostname: validHostnameArbitrary(),
    node: validNodeArbitrary(),
    ostemplate: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
  }),
  // Invalid hostname
  fc.record({
    vmid: validVMIDArbitrary(),
    hostname: invalidHostnameArbitrary(),
    node: validNodeArbitrary(),
    ostemplate: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
  }),
  // Invalid memory
  fc.record({
    vmid: validVMIDArbitrary(),
    hostname: validHostnameArbitrary(),
    node: validNodeArbitrary(),
    ostemplate: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
    memory: invalidMemoryArbitrary(),
  }),
  // Invalid cores
  fc.record({
    vmid: validVMIDArbitrary(),
    hostname: validHostnameArbitrary(),
    node: validNodeArbitrary(),
    ostemplate: fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
    cores: invalidCoresArbitrary(),
  })
);

/**
 * Helper: wait for async effects (node loading, etc.)
 */
async function tick(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 10));
}

/**
 * Helper function to fill VM form fields.
 * Node is a <select> so we use fireEvent.change.
 */
async function fillVMForm(formData: Partial<ProxmoxVMParams>): Promise<void> {
  // Wait for initial data load (nodes, VMID)
  await tick();

  if (formData.vmid !== undefined) {
    const vmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;
    await fireEvent.input(vmidInput, { target: { value: String(formData.vmid) } });
  }

  if (formData.name !== undefined) {
    const nameInput = screen.getByLabelText(/^Name/i) as HTMLInputElement;
    await fireEvent.input(nameInput, { target: { value: formData.name } });
  }

  if (formData.node !== undefined) {
    const nodeSelect = screen.getByLabelText(/^Node/i) as HTMLSelectElement;
    await fireEvent.change(nodeSelect, { target: { value: formData.node } });
  }

  if (formData.cores !== undefined && formData.cores !== null) {
    const coresInput = screen.getByLabelText(/^Cores/i) as HTMLInputElement;
    await fireEvent.input(coresInput, { target: { value: String(formData.cores) } });
  }

  if (formData.memory !== undefined && formData.memory !== null) {
    const memoryInput = screen.getByLabelText(/Memory/i) as HTMLInputElement;
    await fireEvent.input(memoryInput, { target: { value: String(formData.memory) } });
  }

  // Wait for validation to complete
  await tick();
}

/**
 * Helper function to fill LXC form fields.
 * Node is a <select>, OS Template falls back to <input> when no templates loaded.
 */
async function fillLXCForm(formData: Partial<ProxmoxLXCParams>): Promise<void> {
  // Wait for initial data load
  await tick();

  if (formData.vmid !== undefined) {
    const vmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;
    await fireEvent.input(vmidInput, { target: { value: String(formData.vmid) } });
  }

  if (formData.hostname !== undefined) {
    const hostnameInput = screen.getByLabelText(/Hostname/i) as HTMLInputElement;
    await fireEvent.input(hostnameInput, { target: { value: formData.hostname } });
  }

  if (formData.node !== undefined) {
    const nodeSelect = screen.getByLabelText(/^Node/i) as HTMLSelectElement;
    await fireEvent.change(nodeSelect, { target: { value: formData.node } });
  }

  if (formData.ostemplate !== undefined) {
    const ostemplateEl = screen.getByLabelText(/OS Template/i) as HTMLInputElement;
    await fireEvent.input(ostemplateEl, { target: { value: formData.ostemplate } });
  }

  if (formData.cores !== undefined && formData.cores !== null) {
    const coresInput = screen.getByLabelText(/^Cores/i) as HTMLInputElement;
    await fireEvent.input(coresInput, { target: { value: String(formData.cores) } });
  }

  if (formData.memory !== undefined && formData.memory !== null) {
    const memoryInput = screen.getByLabelText(/Memory/i) as HTMLInputElement;
    await fireEvent.input(memoryInput, { target: { value: String(formData.memory) } });
  }

  // Wait for validation to complete
  await tick();
}

describe('Feature: proxmox-frontend-ui, Property 8: Form Validation Completeness (Component Level)', () => {
  describe('VM Form - Invalid data prevents submission', () => {
    it('Property 8: submit button is disabled for any invalid VM form data', async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidVMFormDataArbitrary(),
          async (formData) => {
            const { unmount } = render(ProxmoxProvisionForm);

            try {
              await fillVMForm(formData);

              const submitButton = screen.getByText(/Create Virtual Machine/i) as HTMLButtonElement;
              expect(submitButton.disabled).toBe(true);
            } finally {
              unmount();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Property 8: form submission is prevented when VM form has validation errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidVMFormDataArbitrary(),
          async (formData) => {
            const { unmount, container } = render(ProxmoxProvisionForm);

            try {
              await fillVMForm(formData);

              const form = container.querySelector('form');
              expect(form).toBeTruthy();

              const submitButton = screen.getByText(/Create Virtual Machine/i) as HTMLButtonElement;
              expect(submitButton.disabled).toBe(true);

              await fireEvent.click(submitButton);

              // Form should still contain the invalid data (not reset)
              if (formData.vmid !== undefined) {
                const vmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;
                expect(vmidInput.value).toBe(String(formData.vmid));
              }
            } finally {
              unmount();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Property 8: validation errors are displayed for invalid VM fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            vmid: fc.oneof(validVMIDArbitrary(), invalidVMIDArbitrary()),
            name: fc.oneof(validHostnameArbitrary(), invalidHostnameArbitrary()),
            node: validNodeArbitrary(),
            memory: fc.option(fc.oneof(validMemoryArbitrary(), invalidMemoryArbitrary())).map(v => v ?? undefined),
            cores: fc.option(fc.oneof(validCoresArbitrary(), invalidCoresArbitrary())).map(v => v ?? undefined),
          }),
          async (formData) => {
            const { unmount } = render(ProxmoxProvisionForm);

            try {
              await fillVMForm(formData);

              const isVMIDInvalid = formData.vmid < 100 || formData.vmid > 999999999;
              if (isVMIDInvalid) {
                expect(screen.queryByText(/VMID must be between 100 and 999999999/i)).toBeTruthy();
              }

              const namePattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
              const isNameInvalid = !formData.name || !namePattern.test(formData.name);
              if (isNameInvalid) {
                expect(screen.queryByText(/must contain only lowercase letters|required/i)).toBeTruthy();
              }

              if (formData.memory !== null && formData.memory !== undefined && formData.memory < 512) {
                expect(screen.queryByText(/Memory must be at least 512/i)).toBeTruthy();
              }

              if (formData.cores !== null && formData.cores !== undefined && (formData.cores < 1 || formData.cores > 128)) {
                expect(screen.queryByText(/Cores must be between 1 and 128/i)).toBeTruthy();
              }
            } finally {
              unmount();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('LXC Form - Invalid data prevents submission', () => {
    it('Property 8: submit button is disabled for any invalid LXC form data', async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidLXCFormDataArbitrary(),
          async (formData) => {
            const { unmount, container } = render(ProxmoxProvisionForm);

            try {
              // Switch to LXC tab
              const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
              (tabs[1] as HTMLElement).click();
              await tick();

              await fillLXCForm(formData);

              const submitButton = screen.getByText(/Create LXC Container/i) as HTMLButtonElement;
              expect(submitButton.disabled).toBe(true);
            } finally {
              unmount();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Property 8: form submission is prevented when LXC form has validation errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidLXCFormDataArbitrary(),
          async (formData) => {
            const { unmount, container } = render(ProxmoxProvisionForm);

            try {
              const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
              (tabs[1] as HTMLElement).click();
              await tick();

              await fillLXCForm(formData);

              const submitButton = screen.getByText(/Create LXC Container/i) as HTMLButtonElement;
              expect(submitButton.disabled).toBe(true);

              await fireEvent.click(submitButton);

              if (formData.vmid !== undefined) {
                const vmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;
                expect(vmidInput.value).toBe(String(formData.vmid));
              }
            } finally {
              unmount();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

describe('Feature: proxmox-frontend-ui, Property 9: Valid Form Enables Submission (Component Level)', () => {
  describe('VM Form - Valid data enables submission', () => {
    it('Property 9: submit button is enabled for any valid VM form data', async () => {
      await fc.assert(
        fc.asyncProperty(
          validVMFormDataArbitrary(),
          async (formData) => {
            const { unmount } = render(ProxmoxProvisionForm);

            try {
              await fillVMForm(formData);

              const submitButton = screen.getByText(/Create Virtual Machine/i) as HTMLButtonElement;
              expect(submitButton.disabled).toBe(false);

              const errorMessages = screen.queryAllByText(/must be between|must contain only|required/i);
              expect(errorMessages.length).toBe(0);
            } finally {
              unmount();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Property 9: valid VM form allows submission attempt', async () => {
      await fc.assert(
        fc.asyncProperty(
          validVMFormDataArbitrary(),
          async (formData) => {
            const { unmount } = render(ProxmoxProvisionForm);

            try {
              await fillVMForm(formData);

              const submitButton = screen.getByText(/Create Virtual Machine/i) as HTMLButtonElement;
              expect(submitButton.disabled).toBe(false);
              // Button should not have aria-disabled attribute
              expect(submitButton.getAttribute('aria-disabled')).not.toBe('true');
            } finally {
              unmount();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Property 9: valid VM form with optional fields enables submission', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            vmid: validVMIDArbitrary(),
            name: validHostnameArbitrary(),
            node: validNodeArbitrary(),
            cores: fc.option(validCoresArbitrary()).map(v => v ?? undefined),
            memory: fc.option(validMemoryArbitrary()).map(v => v ?? undefined),
            sockets: fc.option(fc.integer({ min: 1, max: 4 })).map(v => v ?? undefined),
            cpu: fc.option(fc.string({ minLength: 1, maxLength: 20 })).map(v => v ?? undefined),
          }),
          async (formData) => {
            const { unmount } = render(ProxmoxProvisionForm);

            try {
              await fillVMForm(formData);

              const submitButton = screen.getByText(/Create Virtual Machine/i) as HTMLButtonElement;
              expect(submitButton.disabled).toBe(false);
            } finally {
              unmount();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('LXC Form - Valid data enables submission', () => {
    it('Property 9: submit button is enabled for any valid LXC form data', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLXCFormDataArbitrary(),
          async (formData) => {
            const { unmount, container } = render(ProxmoxProvisionForm);

            try {
              const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
              (tabs[1] as HTMLElement).click();
              await tick();

              await fillLXCForm(formData);

              const submitButton = screen.getByText(/Create LXC Container/i) as HTMLButtonElement;
              expect(submitButton.disabled).toBe(false);

              const errorMessages = screen.queryAllByText(/must be between|must contain only|required/i);
              expect(errorMessages.length).toBe(0);
            } finally {
              unmount();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Property 9: valid LXC form allows submission attempt', async () => {
      await fc.assert(
        fc.asyncProperty(
          validLXCFormDataArbitrary(),
          async (formData) => {
            const { unmount, container } = render(ProxmoxProvisionForm);

            try {
              const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
              (tabs[1] as HTMLElement).click();
              await tick();

              await fillLXCForm(formData);

              const submitButton = screen.getByText(/Create LXC Container/i) as HTMLButtonElement;
              expect(submitButton.disabled).toBe(false);
              // Button should not have aria-disabled attribute
              expect(submitButton.getAttribute('aria-disabled')).not.toBe('true');
            } finally {
              unmount();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Form State Transitions', () => {
    it('Property 8 & 9: submit button state changes correctly when fixing validation errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidVMIDArbitrary(),
          validVMIDArbitrary(),
          validHostnameArbitrary(),
          validNodeArbitrary(),
          async (invalidVMID, validVMID, name, node) => {
            const { unmount } = render(ProxmoxProvisionForm);

            try {
              // Fill form with invalid VMID
              await fillVMForm({ vmid: invalidVMID, name, node });

              let submitButton = screen.getByText(/Create Virtual Machine/i) as HTMLButtonElement;
              expect(submitButton.disabled).toBe(true);

              // Fix the VMID
              const vmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;
              await fireEvent.input(vmidInput, { target: { value: String(validVMID) } });
              await tick();

              submitButton = screen.getByText(/Create Virtual Machine/i) as HTMLButtonElement;
              expect(submitButton.disabled).toBe(false);
            } finally {
              unmount();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('Property 8 & 9: submit button state changes correctly when introducing validation errors', async () => {
      await fc.assert(
        fc.asyncProperty(
          validVMIDArbitrary(),
          invalidVMIDArbitrary(),
          validHostnameArbitrary(),
          validNodeArbitrary(),
          async (validVMID, invalidVMID, name, node) => {
            const { unmount } = render(ProxmoxProvisionForm);

            try {
              // Fill form with valid data
              await fillVMForm({ vmid: validVMID, name, node });

              let submitButton = screen.getByText(/Create Virtual Machine/i) as HTMLButtonElement;
              expect(submitButton.disabled).toBe(false);

              // Introduce invalid VMID
              const vmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;
              await fireEvent.input(vmidInput, { target: { value: String(invalidVMID) } });
              await tick();

              submitButton = screen.getByText(/Create Virtual Machine/i) as HTMLButtonElement;
              expect(submitButton.disabled).toBe(true);
            } finally {
              unmount();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
