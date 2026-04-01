/**
 * Unit tests for ProxmoxProvisionForm component
 * Validates Requirements: 3.1, 3.2, 4.1, 4.2, 11.1
 *
 * Task 5.5: Comprehensive unit tests for ProxmoxProvisionForm
 * Test coverage: Form rendering, tab switching, field validation, submission success/error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import ProxmoxProvisionForm from './ProxmoxProvisionForm.svelte';

// Mock the API module
vi.mock('../lib/api', () => ({
  createProxmoxVM: vi.fn(),
  createProxmoxLXC: vi.fn(),
  getProxmoxNodes: vi.fn().mockResolvedValue({ nodes: [{ node: 'pve', status: 'online' }] }),
  getProxmoxNextVMID: vi.fn().mockResolvedValue({ vmid: 100 }),
  getProxmoxISOs: vi.fn().mockResolvedValue({ isos: [] }),
  getProxmoxTemplates: vi.fn().mockResolvedValue({ templates: [] }),
  getProxmoxStorages: vi.fn().mockResolvedValue({ storages: [] }),
  getProxmoxNetworks: vi.fn().mockResolvedValue({ networks: [] }),
}));

// Mock the toast module
vi.mock('../lib/toast.svelte', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

// Mock the logger module
vi.mock('../lib/logger.svelte', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ProxmoxProvisionForm', () => {
  describe('Tab Navigation (Task 5.1)', () => {
    it('renders both VM and LXC tabs', () => {
      render(ProxmoxProvisionForm);

      // Verify both tabs are present
      expect(screen.getByText('Virtual Machine')).toBeTruthy();
      expect(screen.getByText('LXC Container')).toBeTruthy();
    });

    it('defaults to VM tab selected', () => {
      const { container } = render(ProxmoxProvisionForm);

      // Find the VM tab button
      const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
      expect(tabs.length).toBe(2);

      // VM tab (first) should have aria-current="page"
      expect(tabs[0].getAttribute('aria-current')).toBe('page');
      expect(tabs[1].getAttribute('aria-current')).toBeNull();
    });

    it('displays VM form content when VM tab is active', () => {
      render(ProxmoxProvisionForm);

      // VM form fields should be visible
      expect(screen.getByLabelText(/VMID/i)).toBeTruthy();
      expect(screen.getByLabelText(/^Name/i)).toBeTruthy();
      expect(screen.getByLabelText(/^Node/i)).toBeTruthy();
    });

    it('switches to LXC tab when clicked', async () => {
      const { container } = render(ProxmoxProvisionForm);

      // Find and click the LXC tab
      const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
      (tabs[1] as HTMLElement).click();

      // Wait for state update
      await new Promise(resolve => setTimeout(resolve, 0));

      // LXC tab should now be active
      expect(tabs[0].getAttribute('aria-current')).toBeNull();
      expect(tabs[1].getAttribute('aria-current')).toBe('page');

      // LXC form fields should be visible
      expect(screen.getByLabelText(/VMID/i)).toBeTruthy();
      expect(screen.getByLabelText(/Hostname/i)).toBeTruthy();
      expect(screen.getByLabelText(/^Node/i)).toBeTruthy();
      expect(screen.getByLabelText(/OS Template/i)).toBeTruthy();
    });

    it('switches back to VM tab when clicked', async () => {
      const { container } = render(ProxmoxProvisionForm);

      // Find tabs
      const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');

      // Click LXC tab first
      (tabs[1] as HTMLElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));

      // Verify LXC is active
      expect(tabs[1].getAttribute('aria-current')).toBe('page');

      // Click VM tab
      (tabs[0] as HTMLElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));

      // VM tab should be active again
      expect(tabs[0].getAttribute('aria-current')).toBe('page');
      expect(tabs[1].getAttribute('aria-current')).toBeNull();

      // VM form fields should be visible
      expect(screen.getByLabelText(/VMID/i)).toBeTruthy();
      expect(screen.getByLabelText(/^Name/i)).toBeTruthy();
    });

    it('displays correct icons for each tab', () => {
      const { container } = render(ProxmoxProvisionForm);

      // Both tabs should have SVG icons
      const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
      const vmIcon = tabs[0].querySelector('svg');
      const lxcIcon = tabs[1].querySelector('svg');

      expect(vmIcon).toBeTruthy();
      expect(lxcIcon).toBeTruthy();

      // Icons should have different paths (VM vs LXC)
      const vmPath = vmIcon?.querySelector('path')?.getAttribute('d');
      const lxcPath = lxcIcon?.querySelector('path')?.getAttribute('d');

      expect(vmPath).toBeTruthy();
      expect(lxcPath).toBeTruthy();
      expect(vmPath).not.toBe(lxcPath);
    });

    it('applies correct styling to active tab', () => {
      const { container } = render(ProxmoxProvisionForm);

      const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
      const vmTab = tabs[0] as HTMLElement;
      const lxcTab = tabs[1] as HTMLElement;

      // VM tab should have active styling (blue border)
      expect(vmTab.className).toContain('border-blue-500');
      expect(vmTab.className).toContain('text-blue-600');

      // LXC tab should have inactive styling (transparent border)
      expect(lxcTab.className).toContain('border-transparent');
      expect(lxcTab.className).toContain('text-gray-500');
    });

    it('renders form content area with proper styling', () => {
      const { container } = render(ProxmoxProvisionForm);

      // Form content area should exist with proper classes
      const formArea = container.querySelector('.rounded-lg.border.border-gray-200.bg-white');
      expect(formArea).toBeTruthy();
    });
  });

  describe('State Management (Task 5.1)', () => {
    it('initializes with VM tab active', () => {
      const { container } = render(ProxmoxProvisionForm);

      const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
      expect(tabs[0].getAttribute('aria-current')).toBe('page');
    });

    it('maintains tab state across interactions', async () => {
      const { container } = render(ProxmoxProvisionForm);

      const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');

      // Click LXC tab
      (tabs[1] as HTMLElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));

      // Verify state persists
      expect(tabs[1].getAttribute('aria-current')).toBe('page');
      expect(screen.getByLabelText(/Hostname/i)).toBeTruthy();

      // Click VM tab
      (tabs[0] as HTMLElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));

      // Verify state changed
      expect(tabs[0].getAttribute('aria-current')).toBe('page');
      expect(screen.getByLabelText(/^Name/i)).toBeTruthy();
    });
  });

  describe('Accessibility (Task 5.1)', () => {
    it('uses semantic navigation element', () => {
      const { container } = render(ProxmoxProvisionForm);

      const nav = container.querySelector('nav[aria-label="Provisioning type"]');
      expect(nav).toBeTruthy();
    });

    it('sets aria-current on active tab', () => {
      const { container } = render(ProxmoxProvisionForm);

      const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
      expect(tabs[0].getAttribute('aria-current')).toBe('page');
    });

    it('uses aria-hidden for decorative icons', () => {
      const { container } = render(ProxmoxProvisionForm);

      const icons = container.querySelectorAll('svg[aria-hidden="true"]');
      expect(icons.length).toBeGreaterThan(0);
    });

    it('uses button elements for tabs', () => {
      const { container } = render(ProxmoxProvisionForm);

      const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
      expect(tabs.length).toBe(2);
      expect(tabs[0].tagName).toBe('BUTTON');
      expect(tabs[1].tagName).toBe('BUTTON');
    });
  });
});

describe('VM Form Rendering (Task 5.2)', () => {
  it('renders all required VM form fields', () => {
    render(ProxmoxProvisionForm);

    // Check required fields are present
    expect(screen.getByLabelText(/VMID/i)).toBeTruthy();
    expect(screen.getByLabelText(/^Name/i)).toBeTruthy();
    expect(screen.getByLabelText(/^Node/i)).toBeTruthy();

    // Check optional fields are present
    expect(screen.getByLabelText(/^Cores/i)).toBeTruthy();
    expect(screen.getByLabelText(/Memory/i)).toBeTruthy();
    expect(screen.getByLabelText(/Sockets/i)).toBeTruthy();
    expect(screen.getByLabelText(/CPU Type/i)).toBeTruthy();
    expect(screen.getByLabelText(/SCSI0 Disk/i)).toBeTruthy();
    expect(screen.getByLabelText(/IDE2/i)).toBeTruthy();
    expect(screen.getByLabelText(/Network Interface/i)).toBeTruthy();
    expect(screen.getByLabelText(/OS Type/i)).toBeTruthy();
  });

  it('displays required field indicators for VM form', () => {
    const { container } = render(ProxmoxProvisionForm);

    // Check for required field asterisks
    const labels = container.querySelectorAll('label');
    const requiredLabels = Array.from(labels).filter(label =>
      label.textContent?.includes('*')
    );

    // Should have 3 required fields: VMID, Name, Node
    expect(requiredLabels.length).toBeGreaterThanOrEqual(3);
  });

  it('has submit button disabled by default for VM form', () => {
    render(ProxmoxProvisionForm);

    // Submit button should be disabled when form is empty
    const submitButton = screen.getByText(/Create Virtual Machine/i) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
  });

  it('uses correct input types for VM fields', () => {
    render(ProxmoxProvisionForm);

    // Check input types
    const vmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;
    const nameInput = screen.getByLabelText(/^Name/i) as HTMLInputElement;
    const coresInput = screen.getByLabelText(/^Cores/i) as HTMLInputElement;
    const memoryInput = screen.getByLabelText(/Memory/i) as HTMLInputElement;
    const socketsInput = screen.getByLabelText(/Sockets/i) as HTMLInputElement;

    expect(vmidInput.type).toBe('number');
    expect(nameInput.type).toBe('text');
    expect(coresInput.type).toBe('number');
    expect(memoryInput.type).toBe('number');
    expect(socketsInput.type).toBe('number');
  });

  it('has proper placeholders for VM fields', async () => {
    render(ProxmoxProvisionForm);

    await waitFor(() => {
      // Check placeholders
      const vmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;
      const nameInput = screen.getByLabelText(/^Name/i) as HTMLInputElement;

      expect(vmidInput.placeholder).toBe('100');
      expect(nameInput.placeholder).toBe('my-vm');
    });
  });

  it('displays submit button with correct text for VM form', () => {
    render(ProxmoxProvisionForm);

    // Check submit button text
    expect(screen.getByText(/Create Virtual Machine/i)).toBeTruthy();
  });

  it('has OS Type dropdown with correct options', () => {
    render(ProxmoxProvisionForm);

    const osTypeSelect = screen.getByLabelText(/OS Type/i) as HTMLSelectElement;
    const options = Array.from(osTypeSelect.options).map(opt => opt.value);

    expect(options).toContain('');
    expect(options).toContain('l26');
    expect(options).toContain('win10');
    expect(options).toContain('win11');
    expect(options).toContain('other');
  });
});

describe('LXC Form Rendering (Task 5.3)', () => {
  it('renders all required LXC form fields', async () => {
    const { container } = render(ProxmoxProvisionForm);

    // Switch to LXC tab
    const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
    (tabs[1] as HTMLElement).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    // Check required fields are present
    expect(screen.getByLabelText(/VMID/i)).toBeTruthy();
    expect(screen.getByLabelText(/Hostname/i)).toBeTruthy();
    expect(screen.getByLabelText(/^Node/i)).toBeTruthy();
    expect(screen.getByLabelText(/OS Template/i)).toBeTruthy();

    // Check optional fields are present
    expect(screen.getByLabelText(/^Cores/i)).toBeTruthy();
    expect(screen.getByLabelText(/Memory/i)).toBeTruthy();
    expect(screen.getByLabelText(/Root Filesystem/i)).toBeTruthy();
    expect(screen.getByLabelText(/Network Interface/i)).toBeTruthy();
    expect(screen.getByLabelText(/Root Password/i)).toBeTruthy();
  });

  it('displays required field indicators', async () => {
    const { container } = render(ProxmoxProvisionForm);

    // Switch to LXC tab
    const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
    (tabs[1] as HTMLElement).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    // Check for required field asterisks
    const labels = container.querySelectorAll('label');
    const requiredLabels = Array.from(labels).filter(label =>
      label.textContent?.includes('*')
    );

    // Should have 4 required fields: VMID, Hostname, Node, OS Template
    expect(requiredLabels.length).toBeGreaterThanOrEqual(4);
  });

  it('has submit button disabled by default', async () => {
    const { container } = render(ProxmoxProvisionForm);

    // Switch to LXC tab
    const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
    (tabs[1] as HTMLElement).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    // Submit button should be disabled when form is empty
    const submitButton = screen.getByText(/Create LXC Container/i) as HTMLButtonElement;
    expect(submitButton.disabled).toBe(true);
  });

  it('uses correct input types for LXC fields', async () => {
    const { container } = render(ProxmoxProvisionForm);

    // Switch to LXC tab
    const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
    (tabs[1] as HTMLElement).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    // Check input types
    const vmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;
    const hostnameInput = screen.getByLabelText(/Hostname/i) as HTMLInputElement;
    const coresInput = screen.getByLabelText(/^Cores/i) as HTMLInputElement;
    const memoryInput = screen.getByLabelText(/Memory/i) as HTMLInputElement;
    const passwordInput = screen.getByLabelText(/Root Password/i) as HTMLInputElement;

    expect(vmidInput.type).toBe('number');
    expect(hostnameInput.type).toBe('text');
    expect(coresInput.type).toBe('number');
    expect(memoryInput.type).toBe('number');
    expect(passwordInput.type).toBe('password');
  });

  it('has proper placeholders for LXC fields', async () => {
    const { container } = render(ProxmoxProvisionForm);

    // Wait for API calls to resolve
    await waitFor(() => {
      expect((screen.getByLabelText(/VMID/i) as HTMLInputElement).placeholder).not.toBe('Loading...');
    });

    // Switch to LXC tab
    const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
    (tabs[1] as HTMLElement).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    await waitFor(() => {
      // Check placeholders
      const vmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;
      const hostnameInput = screen.getByLabelText(/Hostname/i) as HTMLInputElement;

      expect(vmidInput.placeholder).toBe('100');
      expect(hostnameInput.placeholder).toBe('my-container');
    });
  });

  it('displays submit button with correct text', async () => {
    const { container } = render(ProxmoxProvisionForm);

    // Switch to LXC tab
    const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
    (tabs[1] as HTMLElement).click();
    await new Promise(resolve => setTimeout(resolve, 0));

    // Check submit button text
    expect(screen.getByText(/Create LXC Container/i)).toBeTruthy();
  });
});

describe('Field Validation (Task 5.2, 5.3)', () => {
  describe('VM Form Validation', () => {
    it('validates VMID field on input', async () => {
      render(ProxmoxProvisionForm);

      const vmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;

      // Test invalid VMID (too low)
      await fireEvent.input(vmidInput, { target: { value: '50' } });
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(screen.getByText(/VMID must be between 100 and 999999999/i)).toBeTruthy();
    });

    it('validates name field format', async () => {
      render(ProxmoxProvisionForm);

      const nameInput = screen.getByLabelText(/^Name/i) as HTMLInputElement;

      // Test invalid name (uppercase)
      await fireEvent.input(nameInput, { target: { value: 'MyVM' } });
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(screen.getByText(/must contain only lowercase letters/i)).toBeTruthy();
    });

    it('validates memory minimum value', async () => {
      render(ProxmoxProvisionForm);

      const memoryInput = screen.getByLabelText(/Memory/i) as HTMLInputElement;

      // Test invalid memory (too low)
      await fireEvent.input(memoryInput, { target: { value: '256' } });
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(screen.getByText(/Memory must be at least 512/i)).toBeTruthy();
    });

    it('validates cores range', async () => {
      render(ProxmoxProvisionForm);

      const coresInput = screen.getByLabelText(/^Cores/i) as HTMLInputElement;

      // Test invalid cores (too high)
      await fireEvent.input(coresInput, { target: { value: '200' } });
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(screen.getByText(/Cores must be between 1 and 128/i)).toBeTruthy();
    });

    it('validates sockets range', async () => {
      render(ProxmoxProvisionForm);

      const socketsInput = screen.getByLabelText(/Sockets/i) as HTMLInputElement;

      // Test invalid sockets (too high)
      await fireEvent.input(socketsInput, { target: { value: '10' } });
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(screen.getByText(/Sockets must be between 1 and 4/i)).toBeTruthy();
    });

    it('clears validation errors when valid input is provided', async () => {
      render(ProxmoxProvisionForm);

      const vmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;

      // First, enter invalid value
      await fireEvent.input(vmidInput, { target: { value: '50' } });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(screen.getByText(/VMID must be between 100 and 999999999/i)).toBeTruthy();

      // Then, enter valid value
      await fireEvent.input(vmidInput, { target: { value: '100' } });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(screen.queryByText(/VMID must be between 100 and 999999999/i)).toBeFalsy();
    });

    it('enables submit button when all required fields are valid', async () => {
      render(ProxmoxProvisionForm);

      // Wait for API data to load
      await waitFor(() => {
        expect((screen.getByLabelText(/VMID/i) as HTMLInputElement).placeholder).not.toBe('Loading...');
      });

      const vmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;
      const nameInput = screen.getByLabelText(/^Name/i) as HTMLInputElement;
      const nodeSelect = screen.getByLabelText(/^Node/i) as HTMLSelectElement;

      // Fill in all required fields with valid values
      await fireEvent.input(vmidInput, { target: { value: '100' } });
      await fireEvent.input(nameInput, { target: { value: 'test-vm' } });
      await fireEvent.change(nodeSelect, { target: { value: 'pve' } });
      await new Promise(resolve => setTimeout(resolve, 0));

      const submitButton = screen.getByText(/Create Virtual Machine/i) as HTMLButtonElement;
      expect(submitButton.disabled).toBe(false);
    });

    it('keeps submit button disabled when required fields are missing', async () => {
      render(ProxmoxProvisionForm);

      const vmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;
      const nameInput = screen.getByLabelText(/^Name/i) as HTMLInputElement;

      // Fill in only some required fields
      await fireEvent.input(vmidInput, { target: { value: '100' } });
      await fireEvent.input(nameInput, { target: { value: 'test-vm' } });
      await new Promise(resolve => setTimeout(resolve, 0));

      const submitButton = screen.getByText(/Create Virtual Machine/i) as HTMLButtonElement;
      expect(submitButton.disabled).toBe(true);
    });
  });

  describe('LXC Form Validation', () => {
    it('validates hostname field format', async () => {
      const { container } = render(ProxmoxProvisionForm);

      // Switch to LXC tab
      const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
      (tabs[1] as HTMLElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));

      const hostnameInput = screen.getByLabelText(/Hostname/i) as HTMLInputElement;

      // Test invalid hostname (uppercase)
      await fireEvent.input(hostnameInput, { target: { value: 'MyContainer' } });
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(screen.getByText(/must contain only lowercase letters/i)).toBeTruthy();
    });

    it('validates required ostemplate field', async () => {
      const { container } = render(ProxmoxProvisionForm);

      // Switch to LXC tab
      const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
      (tabs[1] as HTMLElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));

      const vmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;
      const hostnameInput = screen.getByLabelText(/Hostname/i) as HTMLInputElement;
      const nodeSelect = screen.getByLabelText(/^Node/i) as HTMLSelectElement;

      // Fill in all fields except ostemplate
      await fireEvent.input(vmidInput, { target: { value: '200' } });
      await fireEvent.input(hostnameInput, { target: { value: 'test-lxc' } });
      await fireEvent.change(nodeSelect, { target: { value: 'pve' } });
      await new Promise(resolve => setTimeout(resolve, 0));

      const submitButton = screen.getByText(/Create LXC Container/i) as HTMLButtonElement;
      expect(submitButton.disabled).toBe(true);
    });

    it('enables submit button when all LXC required fields are valid', async () => {
      const { container } = render(ProxmoxProvisionForm);

      // Switch to LXC tab
      const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
      (tabs[1] as HTMLElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));

      const vmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;
      const hostnameInput = screen.getByLabelText(/Hostname/i) as HTMLInputElement;
      const nodeSelect = screen.getByLabelText(/^Node/i) as HTMLSelectElement;
      const ostemplateInput = screen.getByLabelText(/OS Template/i) as HTMLInputElement;

      // Fill in all required fields with valid values
      await fireEvent.input(vmidInput, { target: { value: '200' } });
      await fireEvent.input(hostnameInput, { target: { value: 'test-lxc' } });
      await fireEvent.change(nodeSelect, { target: { value: 'pve' } });
      await fireEvent.input(ostemplateInput, { target: { value: 'local:vztmpl/debian-12.tar.zst' } });
      await new Promise(resolve => setTimeout(resolve, 0));

      const submitButton = screen.getByText(/Create LXC Container/i) as HTMLButtonElement;
      expect(submitButton.disabled).toBe(false);
    });
  });

  describe('Tab Switching Resets Form', () => {
    it('clears form data when switching from VM to LXC', async () => {
      const { container } = render(ProxmoxProvisionForm);

      // Fill in VM form
      const vmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;
      const nameInput = screen.getByLabelText(/^Name/i) as HTMLInputElement;
      await fireEvent.input(vmidInput, { target: { value: '100' } });
      await fireEvent.input(nameInput, { target: { value: 'test-vm' } });
      await new Promise(resolve => setTimeout(resolve, 0));

      // Switch to LXC tab
      const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
      (tabs[1] as HTMLElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));

      // Form should be cleared
      const newVmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;
      expect(newVmidInput.value).toBe('');
    });

    it('clears validation errors when switching tabs', async () => {
      const { container } = render(ProxmoxProvisionForm);

      // Enter invalid VM data
      const vmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;
      await fireEvent.input(vmidInput, { target: { value: '50' } });
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(screen.getByText(/VMID must be between 100 and 999999999/i)).toBeTruthy();

      // Switch to LXC tab
      const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
      (tabs[1] as HTMLElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));

      // Validation error should be cleared
      expect(screen.queryByText(/VMID must be between 100 and 999999999/i)).toBeFalsy();
    });
  });
});

describe('Form Submission (Task 5.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup default mocks after clearAllMocks
    const api = require('../lib/api');
    vi.mocked(api.getProxmoxNodes).mockResolvedValue({ nodes: [{ node: 'pve', status: 'online' }] });
    vi.mocked(api.getProxmoxNextVMID).mockResolvedValue({ vmid: 100 });
    vi.mocked(api.getProxmoxISOs).mockResolvedValue({ isos: [] });
    vi.mocked(api.getProxmoxTemplates).mockResolvedValue({ templates: [] });
    vi.mocked(api.getProxmoxStorages).mockResolvedValue({ storages: [] });
    vi.mocked(api.getProxmoxNetworks).mockResolvedValue({ networks: [] });
  });

  async function fillVMForm(): Promise<void> {
    await waitFor(() => {
      expect((screen.getByLabelText(/VMID/i) as HTMLInputElement).placeholder).not.toBe('Loading...');
    });
    const vmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;
    const nameInput = screen.getByLabelText(/^Name/i) as HTMLInputElement;
    const nodeSelect = screen.getByLabelText(/^Node/i) as HTMLSelectElement;
    await fireEvent.input(vmidInput, { target: { value: '100' } });
    await fireEvent.input(nameInput, { target: { value: 'test-vm' } });
    await fireEvent.change(nodeSelect, { target: { value: 'pve' } });
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  describe('VM Form Submission', () => {
    it('submits VM form with valid data', async () => {
      const api = require('../lib/api');
      vi.mocked(api.createProxmoxVM).mockResolvedValue({
        success: true,
        taskId: 'task-123',
        vmid: 100,
        message: 'VM created successfully',
      });

      render(ProxmoxProvisionForm);
      await fillVMForm();

      const submitButton = screen.getByText(/Create Virtual Machine/i) as HTMLButtonElement;
      await fireEvent.click(submitButton);

      await waitFor(() => {
        expect(api.createProxmoxVM).toHaveBeenCalled();
      });
    });

    it('disables submit button during submission', async () => {
      const api = require('../lib/api');
      vi.mocked(api.createProxmoxVM).mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({
          success: true,
          taskId: 'task-123',
          vmid: 100,
          message: 'VM created successfully',
        }), 200))
      );

      render(ProxmoxProvisionForm);
      await fillVMForm();

      const submitButton = screen.getByText(/Create Virtual Machine/i) as HTMLButtonElement;
      await fireEvent.click(submitButton);

      expect(submitButton.disabled).toBe(true);

      await waitFor(() => {
        expect(submitButton.disabled).toBe(false);
      }, { timeout: 500 });
    });

    it('shows loading spinner during submission', async () => {
      const api = require('../lib/api');
      vi.mocked(api.createProxmoxVM).mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({
          success: true,
          taskId: 'task-123',
          vmid: 100,
          message: 'VM created successfully',
        }), 200))
      );

      render(ProxmoxProvisionForm);
      await fillVMForm();

      const submitButton = screen.getByText(/Create Virtual Machine/i) as HTMLButtonElement;
      await fireEvent.click(submitButton);

      expect(screen.getByText(/Creating/i)).toBeTruthy();

      await waitFor(() => {
        expect(screen.queryByText(/Creating/i)).toBeFalsy();
      }, { timeout: 500 });
    });

    it('resets form after successful submission', async () => {
      const api = require('../lib/api');
      vi.mocked(api.createProxmoxVM).mockResolvedValue({
        success: true,
        taskId: 'task-123',
        vmid: 100,
        message: 'VM created successfully',
      });

      render(ProxmoxProvisionForm);
      await fillVMForm();

      const submitButton = screen.getByText(/Create Virtual Machine/i) as HTMLButtonElement;
      await fireEvent.click(submitButton);

      await waitFor(() => {
        expect((screen.getByLabelText(/^Name/i) as HTMLInputElement).value).toBe('');
      });
    });

    it('includes optional fields in submission', async () => {
      const api = require('../lib/api');
      vi.mocked(api.createProxmoxVM).mockResolvedValue({
        success: true,
        taskId: 'task-123',
        vmid: 100,
        message: 'VM created successfully',
      });

      render(ProxmoxProvisionForm);
      await fillVMForm();

      // Fill optional fields
      const coresInput = screen.getByLabelText(/^Cores/i) as HTMLInputElement;
      const memoryInput = screen.getByLabelText(/Memory/i) as HTMLInputElement;
      await fireEvent.input(coresInput, { target: { value: '4' } });
      await fireEvent.input(memoryInput, { target: { value: '2048' } });
      await new Promise(resolve => setTimeout(resolve, 0));

      const submitButton = screen.getByText(/Create Virtual Machine/i) as HTMLButtonElement;
      await fireEvent.click(submitButton);

      await waitFor(() => {
        const callArgs = vi.mocked(api.createProxmoxVM).mock.calls[0][0];
        expect(callArgs.cores).toBe(4);
        expect(callArgs.memory).toBe(2048);
      });
    });
  });

  describe('LXC Form Submission', () => {
    it('submits LXC form with valid data', async () => {
      const api = require('../lib/api');
      vi.mocked(api.createProxmoxLXC).mockResolvedValue({
        success: true,
        taskId: 'task-456',
        vmid: 200,
        message: 'LXC created successfully',
      });

      const { container } = render(ProxmoxProvisionForm);

      // Wait for API data to load
      await waitFor(() => {
        expect((screen.getByLabelText(/VMID/i) as HTMLInputElement).placeholder).not.toBe('Loading...');
      });

      // Switch to LXC tab
      const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
      (tabs[1] as HTMLElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));

      // Fill in required fields
      const vmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;
      const hostnameInput = screen.getByLabelText(/Hostname/i) as HTMLInputElement;
      const nodeSelect = screen.getByLabelText(/^Node/i) as HTMLSelectElement;
      const ostemplateInput = screen.getByLabelText(/OS Template/i) as HTMLInputElement;

      await fireEvent.input(vmidInput, { target: { value: '200' } });
      await fireEvent.input(hostnameInput, { target: { value: 'test-lxc' } });
      await fireEvent.change(nodeSelect, { target: { value: 'pve' } });
      await fireEvent.input(ostemplateInput, { target: { value: 'local:vztmpl/debian-12.tar.zst' } });
      await new Promise(resolve => setTimeout(resolve, 0));

      const submitButton = screen.getByText(/Create LXC Container/i) as HTMLButtonElement;
      await fireEvent.click(submitButton);

      await waitFor(() => {
        expect(api.createProxmoxLXC).toHaveBeenCalled();
      });
    });

    it('disables submit button during LXC submission', async () => {
      const api = require('../lib/api');
      vi.mocked(api.createProxmoxLXC).mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({
          success: true,
          taskId: 'task-456',
          vmid: 200,
          message: 'LXC created successfully',
        }), 200))
      );

      const { container } = render(ProxmoxProvisionForm);

      await waitFor(() => {
        expect((screen.getByLabelText(/VMID/i) as HTMLInputElement).placeholder).not.toBe('Loading...');
      });

      const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
      (tabs[1] as HTMLElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));

      const vmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;
      const hostnameInput = screen.getByLabelText(/Hostname/i) as HTMLInputElement;
      const nodeSelect = screen.getByLabelText(/^Node/i) as HTMLSelectElement;
      const ostemplateInput = screen.getByLabelText(/OS Template/i) as HTMLInputElement;

      await fireEvent.input(vmidInput, { target: { value: '200' } });
      await fireEvent.input(hostnameInput, { target: { value: 'test-lxc' } });
      await fireEvent.change(nodeSelect, { target: { value: 'pve' } });
      await fireEvent.input(ostemplateInput, { target: { value: 'local:vztmpl/debian-12.tar.zst' } });
      await new Promise(resolve => setTimeout(resolve, 0));

      const submitButton = screen.getByText(/Create LXC Container/i) as HTMLButtonElement;
      await fireEvent.click(submitButton);

      expect(submitButton.disabled).toBe(true);

      await waitFor(() => {
        expect(submitButton.disabled).toBe(false);
      }, { timeout: 500 });
    });

    it('resets LXC form after successful submission', async () => {
      const api = require('../lib/api');
      vi.mocked(api.createProxmoxLXC).mockResolvedValue({
        success: true,
        taskId: 'task-456',
        vmid: 200,
        message: 'LXC created successfully',
      });

      const { container } = render(ProxmoxProvisionForm);

      await waitFor(() => {
        expect((screen.getByLabelText(/VMID/i) as HTMLInputElement).placeholder).not.toBe('Loading...');
      });

      const tabs = container.querySelectorAll('nav[aria-label="Provisioning type"] button');
      (tabs[1] as HTMLElement).click();
      await new Promise(resolve => setTimeout(resolve, 0));

      const vmidInput = screen.getByLabelText(/VMID/i) as HTMLInputElement;
      const hostnameInput = screen.getByLabelText(/Hostname/i) as HTMLInputElement;
      const nodeSelect = screen.getByLabelText(/^Node/i) as HTMLSelectElement;
      const ostemplateInput = screen.getByLabelText(/OS Template/i) as HTMLInputElement;

      await fireEvent.input(vmidInput, { target: { value: '200' } });
      await fireEvent.input(hostnameInput, { target: { value: 'test-lxc' } });
      await fireEvent.change(nodeSelect, { target: { value: 'pve' } });
      await fireEvent.input(ostemplateInput, { target: { value: 'local:vztmpl/debian-12.tar.zst' } });
      await new Promise(resolve => setTimeout(resolve, 0));

      const submitButton = screen.getByText(/Create LXC Container/i) as HTMLButtonElement;
      await fireEvent.click(submitButton);

      await waitFor(() => {
        expect((screen.getByLabelText(/Hostname/i) as HTMLInputElement).value).toBe('');
      });
    });
  });
});
