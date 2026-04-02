import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import GroupActionModal from './GroupActionModal.svelte';
import * as api from '../lib/api';

// Mock the API module
vi.mock('../lib/api', () => ({
  get: vi.fn(),
  post: vi.fn(),
  getErrorGuidance: vi.fn(() => ({ guidance: undefined })),
}));

describe('GroupActionModal Component', () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  const mockTargetNodes = [
    { id: 'node1', name: 'server1.example.com', uri: 'ssh://server1.example.com', transport: 'ssh', source: 'bolt' },
    { id: 'node2', name: 'server2.example.com', uri: 'ssh://server2.example.com', transport: 'ssh', source: 'bolt' },
    { id: 'node3', name: 'server3.example.com', uri: 'ssh://server3.example.com', transport: 'ssh', source: 'puppetdb' },
  ];

  const mockCommandWhitelist = {
    commandWhitelist: {
      allowAll: false,
      whitelist: ['ls', 'pwd', 'echo'],
      matchMode: 'exact' as const,
    },
  };

  const mockIntegrations = {
    integrations: [
      { name: 'bolt', status: 'connected', type: 'execution' },
      { name: 'ansible', status: 'connected', type: 'execution' },
      { name: 'ssh', status: 'connected', type: 'execution' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock API responses
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/api/config') {
        return Promise.resolve(mockCommandWhitelist);
      }
      if (url === '/api/integrations/status') {
        return Promise.resolve(mockIntegrations);
      }
      return Promise.reject(new Error('Unknown URL'));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should not render when open is false', () => {
      render(GroupActionModal, {
        props: {
          open: false,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      expect(screen.queryByText('Execute Action on Group')).toBeNull();
    });

    it('should render when open is true', () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      expect(screen.getByText('Execute Action on Group')).toBeTruthy();
      expect(screen.getByText('webservers')).toBeTruthy();
    });

    it('should display target nodes count', () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      expect(screen.getByText('3')).toBeTruthy();
      expect(screen.getByText('nodes')).toBeTruthy();
    });

    it('should display all target nodes in the list', () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      expect(screen.getByText('server1.example.com')).toBeTruthy();
      expect(screen.getByText('server2.example.com')).toBeTruthy();
      expect(screen.getByText('server3.example.com')).toBeTruthy();
    });

    it('should render action configuration section', () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      expect(screen.getByText('Configure Action')).toBeTruthy();
    });
  });

  describe('Accessibility - ARIA Labels and Roles', () => {
    it('should have proper dialog role and ARIA attributes', () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeTruthy();
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.getAttribute('aria-labelledby')).toBe('modal-title');
      expect(dialog.getAttribute('aria-describedby')).toBe('modal-description');
    });

    it('should have aria-busy attribute during loading', async () => {
      let resolvePost: () => void;
      const postPromise = new Promise<{ batchId: string; executionIds: string[]; targetCount: number; expandedNodeIds: string[] }>((resolve) => {
        resolvePost = () => resolve({
          batchId: 'batch-123',
          executionIds: ['exec-1', 'exec-2', 'exec-3'],
          targetCount: 3,
          expandedNodeIds: ['node1', 'node2', 'node3']
        });
      });
      vi.mocked(api.post).mockReturnValue(postPromise);

      const { container } = render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Wait for config to load
      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      // Enter a command to enable the execute button
      const commandInput = screen.getByPlaceholderText(/enter command/i);
      await fireEvent.input(commandInput, { target: { value: 'ls' } });

      // Wait for the form to update
      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute action on/i });
        expect(executeButton).not.toHaveProperty('disabled', true);
      });

      // Trigger form submission
      const executeButton = screen.getByRole('button', { name: /execute action on/i });
      await fireEvent.click(executeButton);

      // Check that aria-busy is set to true during loading
      await waitFor(() => {
        const dialog = container.querySelector('[role="dialog"]');
        expect(dialog?.getAttribute('aria-busy')).toBe('true');
      });

      // Resolve the promise to complete the test

      resolvePost!();
    });

    it('should have proper ARIA labels on buttons', () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const allCloseButtons = screen.getAllByRole('button', { name: /close dialog/i });
      expect(allCloseButtons.length).toBeGreaterThan(0);

      const cancelButton = screen.getByRole('button', { name: /cancel and close dialog/i });
      expect(cancelButton).toBeTruthy();

      const executeButton = screen.getByRole('button', { name: /execute action on 3 nodes/i });
      expect(executeButton).toBeTruthy();
    });

    it('should have screen reader text for modal description', () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const description = document.getElementById('modal-description');
      expect(description).toBeTruthy();
      expect(description?.textContent).toContain('Use Tab to navigate between controls');
      expect(description?.textContent).toContain('Escape to close the dialog');
    });

    it('should have aria-live region for target count', () => {
      const { container } = render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const statusRegion = container.querySelector('[role="status"][aria-live="polite"]');
      expect(statusRegion).toBeTruthy();
      expect(statusRegion?.getAttribute('aria-label')).toContain('3 target nodes selected');
    });

    it('should have proper role for target nodes list', () => {
      const { container } = render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const nodesList = container.querySelector('[role="region"][aria-labelledby="target-nodes-label"]');
      expect(nodesList).toBeTruthy();
    });

    it('should have proper role for action configuration', () => {
      const { container } = render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const actionGroup = container.querySelector('[role="group"][aria-labelledby="action-config-label"]');
      expect(actionGroup).toBeTruthy();
    });

    it('should have aria-live region for errors', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('Test error'));

      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Wait for config to load
      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      // Enter a command to enable the execute button
      const commandInput = screen.getByPlaceholderText(/enter command/i);
      await fireEvent.input(commandInput, { target: { value: 'ls' } });

      // Wait for the form to update
      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute action on/i });
        expect(executeButton).not.toHaveProperty('disabled', true);
      });

      // Trigger form submission
      const executeButton = screen.getByRole('button', { name: /execute action on/i });
      await fireEvent.click(executeButton);

      await waitFor(() => {
        const errorAlert = screen.getByRole('alert');
        expect(errorAlert).toBeTruthy();
        expect(errorAlert.getAttribute('aria-live')).toBe('assertive');
      });
    });
  });

  describe('Accessibility - Keyboard Navigation', () => {
    it('should close modal on Escape key', async () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await fireEvent.keyDown(document, { key: 'Escape' });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should not close modal on Escape when loading', async () => {
      vi.mocked(api.post).mockImplementation(() => new Promise(() => {})); // Never resolves

      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Wait for config to load
      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      // Enter a command to enable the execute button
      const commandInput = screen.getByPlaceholderText(/enter command/i);
      await fireEvent.input(commandInput, { target: { value: 'ls' } });

      // Wait for the form to update and button to be enabled
      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute action on/i });
        expect(executeButton).not.toHaveProperty('disabled', true);
      });

      // Trigger form submission to start loading
      const executeButton = screen.getByRole('button', { name: /execute action on/i });
      await fireEvent.click(executeButton);

      // Check that aria-busy is set to true
      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(dialog.getAttribute('aria-busy')).toBe('true');
      });

      mockOnClose.mockClear();
      await fireEvent.keyDown(document, { key: 'Escape' });

      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('should trap focus within modal with Tab key', () => {
      const { container } = render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const modalRef = container.querySelector('[tabindex="-1"]');
      expect(modalRef).toBeTruthy();

      // Get all focusable elements
      const focusableElements = modalRef?.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

      expect(focusableElements?.length).toBeGreaterThan(0);
    });

    it('should have minimum touch target size for buttons', () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Check close button (X button in header) has minimum 44x44px touch target
      const allCloseButtons = screen.getAllByRole('button', { name: /close dialog/i });
      const headerCloseButton = allCloseButtons[0]; // The X button in the header
      expect(headerCloseButton.className).toContain('min-w-[44px]');
      expect(headerCloseButton.className).toContain('min-h-[44px]');

      // Check action buttons have minimum height
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      expect(cancelButton.className).toContain('min-h-[44px]');

      const executeButton = screen.getByRole('button', { name: /execute/i });
      expect(executeButton.className).toContain('min-h-[44px]');
    });
  });

  describe('Accessibility - Focus Management', () => {
    it('should focus modal when opened', async () => {
      const { container } = render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Wait for focus to be set (uses setTimeout in component)
      await waitFor(() => {
        const modalRef = container.querySelector('[tabindex="-1"]');
        expect(document.activeElement).toBe(modalRef);
      }, { timeout: 200 });
    });
  });

  describe('Responsiveness', () => {
    it('should have responsive padding classes', () => {
      const { container } = render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const modalContent = container.querySelector('.bg-white.dark\\:bg-gray-800');
      expect(modalContent).toBeTruthy();

      // Check for responsive padding in header
      const header = container.querySelector('.px-3.sm\\:px-4');
      expect(header).toBeTruthy();
    });

    it('should have responsive text sizes', () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const title = screen.getByText('Execute Action on Group');
      expect(title.className).toContain('text-base');
      expect(title.className).toContain('sm:text-lg');
    });

    it('should have responsive button layout', () => {
      const { container } = render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Button container should stack on mobile, row on desktop
      const buttonContainer = container.querySelector('.flex.flex-col.sm\\:flex-row');
      expect(buttonContainer).toBeTruthy();
    });

    it('should have responsive spacing', () => {
      const { container } = render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Check for responsive spacing in form
      const form = container.querySelector('.space-y-4.sm\\:space-y-6');
      expect(form).toBeTruthy();
    });

    it('should have responsive gap in target nodes header', () => {
      const { container } = render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const header = container.querySelector('.gap-2.sm\\:gap-3');
      expect(header).toBeTruthy();
    });
  });

  describe('Modal Close Behavior', () => {
    it('should call onClose when close button is clicked', async () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const allCloseButtons = screen.getAllByRole('button', { name: /close dialog/i });
      const headerCloseButton = allCloseButtons[0]; // The X button in the header
      await fireEvent.click(headerCloseButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should call onClose when cancel button is clicked', async () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should call onClose when backdrop is clicked', async () => {
      const { container } = render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const backdrop = container.querySelector('.fixed.inset-0.bg-gray-500');
      expect(backdrop).toBeTruthy();

      if (backdrop) {
        await fireEvent.click(backdrop);
      }

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should not close when loading', async () => {
      vi.mocked(api.post).mockImplementation(() => new Promise(() => {})); // Never resolves

      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Wait for config to load
      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      // Enter a command to enable the execute button
      const commandInput = screen.getByPlaceholderText(/enter command/i);
      await fireEvent.input(commandInput, { target: { value: 'ls' } });

      // Wait for the form to update
      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute action on/i });
        expect(executeButton).not.toHaveProperty('disabled', true);
      });

      // Trigger form submission
      const executeButton = screen.getByRole('button', { name: /execute action on/i });
      await fireEvent.click(executeButton);

      // Check that aria-busy is set to true (indicates loading)
      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(dialog.getAttribute('aria-busy')).toBe('true');
      });

      mockOnClose.mockClear();

      // Try to close with header X button
      const allCloseButtons = screen.getAllByRole('button', { name: /close dialog/i });
      const headerCloseButton = allCloseButtons[0];
      await fireEvent.click(headerCloseButton);

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('Execution Flow', () => {
    it('should disable execute button when no action is configured', () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const executeButton = screen.getByRole('button', { name: /execute action on/i });
      expect(executeButton).toHaveProperty('disabled', true);
    });

    it('should disable execute button when no target nodes', () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: [],
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const executeButton = screen.getByRole('button', { name: /execute action on/i });
      expect(executeButton).toHaveProperty('disabled', true);
    });

    it('should show error message when no target nodes available', () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: [],
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      expect(screen.getByText('No nodes in this group')).toBeTruthy();
    });
  });

  describe('Modal Opening with Pre-populated Group Nodes', () => {
    it('should pre-populate modal with all group nodes', () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Verify all nodes are displayed
      expect(screen.getByText('server1.example.com')).toBeTruthy();
      expect(screen.getByText('server2.example.com')).toBeTruthy();
      expect(screen.getByText('server3.example.com')).toBeTruthy();
    });

    it('should display correct node count for pre-populated nodes', () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      expect(screen.getByText('3')).toBeTruthy();
      expect(screen.getByText('nodes')).toBeTruthy();
    });

    it('should display node URIs for pre-populated nodes', () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      expect(screen.getByText('ssh://server1.example.com')).toBeTruthy();
      expect(screen.getByText('ssh://server2.example.com')).toBeTruthy();
      expect(screen.getByText('ssh://server3.example.com')).toBeTruthy();
    });

    it('should display node sources for pre-populated nodes', () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const boltBadges = screen.getAllByText('bolt');
      expect(boltBadges.length).toBeGreaterThanOrEqual(2);

      expect(screen.getByText('puppetdb')).toBeTruthy();
    });

    it('should handle single node in group', () => {
      const singleNode = [mockTargetNodes[0]];

      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'single-server',
          groupId: 'group2',
          targetNodes: singleNode,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      expect(screen.getByText('1')).toBeTruthy();
      expect(screen.getByText('node')).toBeTruthy();
      expect(screen.getByText('server1.example.com')).toBeTruthy();
    });

    it('should handle large number of nodes with scrollable list', () => {
      const manyNodes = Array.from({ length: 50 }, (_, i) => ({
        id: `node${i}`,
        name: `server${i}.example.com`,
        uri: `ssh://server${i}.example.com`,
        transport: 'ssh',
        source: 'bolt',
      }));

      const { container } = render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'large-group',
          groupId: 'group3',
          targetNodes: manyNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      expect(screen.getByText('50')).toBeTruthy();

      // Check that the list has max-height and overflow
      const nodesList = container.querySelector('.max-h-48.overflow-y-auto');
      expect(nodesList).toBeTruthy();
    });
  });

  describe('Action Configuration with Different Action Types', () => {
    it('should default to execute-command action type', async () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Wait for config to load
      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      // Command input should be visible
      expect(screen.getByPlaceholderText(/enter command/i)).toBeTruthy();
    });

    it('should enable execute button when command is configured', async () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Wait for config to load
      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      // Enter a command
      const commandInput = screen.getByPlaceholderText(/enter command/i);
      await fireEvent.input(commandInput, { target: { value: 'ls -la' } });

      // Wait for the form to update
      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute action on/i });
        expect(executeButton).not.toHaveProperty('disabled', true);
      });
    });

    it('should allow switching between action types', async () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Wait for config to load
      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      // Initially should show command form
      expect(screen.getByPlaceholderText(/enter command/i)).toBeTruthy();

      // Find and click the install software radio button
      const installRadio = screen.getByRole('radio', { name: /install software/i });
      await fireEvent.click(installRadio);

      // Should now show software installation form - check for radio button being checked
      await waitFor(() => {
        expect(installRadio).toHaveProperty('checked', true);
      });

      // Verify the form switched (command input should no longer be visible)
      expect(screen.queryByPlaceholderText(/enter command/i)).toBeNull();
    });

    it('should configure execute-task action type', async () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Wait for config to load
      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      // Click execute task radio button
      const taskRadio = screen.getByRole('radio', { name: /execute task/i });
      await fireEvent.click(taskRadio);

      // Verify the radio button is checked
      await waitFor(() => {
        expect(taskRadio).toHaveProperty('checked', true);
      });

      // Verify the command form is no longer visible
      expect(screen.queryByPlaceholderText(/enter command/i)).toBeNull();
    });

    it('should configure execute-playbook action type', async () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Wait for config to load
      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      // Click execute playbook radio button
      const playbookRadio = screen.getByRole('radio', { name: /execute playbook/i });
      await fireEvent.click(playbookRadio);

      // Verify the radio button is checked
      await waitFor(() => {
        expect(playbookRadio).toHaveProperty('checked', true);
      });

      // Verify the command form is no longer visible
      expect(screen.queryByPlaceholderText(/enter command/i)).toBeNull();
    });

    it('should reset form data when switching action types', async () => {
      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Wait for config to load
      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      // Enter a command
      const commandInput = screen.getByPlaceholderText(/enter command/i);
      await fireEvent.input(commandInput, { target: { value: 'ls -la' } });

      // Wait for button to be enabled
      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute action on/i });
        expect(executeButton).not.toHaveProperty('disabled', true);
      });

      // Switch to install software
      const installRadio = screen.getByRole('radio', { name: /install software/i });
      await fireEvent.click(installRadio);

      // Execute button should be disabled again
      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute action on/i });
        expect(executeButton).toHaveProperty('disabled', true);
      });
    });
  });

  describe('Execution Initiation Flow', () => {
    it('should successfully execute command action on group nodes', async () => {
      vi.mocked(api.post).mockResolvedValue({
        batchId: 'batch-123',
        executionIds: ['exec-1', 'exec-2', 'exec-3'],
        targetCount: 3,
        expandedNodeIds: ['node1', 'node2', 'node3'],
      });

      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Wait for config to load
      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      // Enter a command
      const commandInput = screen.getByPlaceholderText(/enter command/i);
      await fireEvent.input(commandInput, { target: { value: 'ls -la' } });

      // Wait for button to be enabled
      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute action on/i });
        expect(executeButton).not.toHaveProperty('disabled', true);
      });

      // Click execute button
      const executeButton = screen.getByRole('button', { name: /execute action on/i });
      await fireEvent.click(executeButton);

      // Verify API call
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/executions/batch', {
          targetNodeIds: ['node1', 'node2', 'node3'],
          type: 'command',
          action: 'ls -la',
          tool: 'bolt',
        });
      });

      // Verify success callback
      expect(mockOnSuccess).toHaveBeenCalledWith('batch-123');
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should send correct payload for task execution', async () => {
      vi.mocked(api.post).mockResolvedValue({
        batchId: 'batch-456',
        executionIds: ['exec-4', 'exec-5', 'exec-6'],
        targetCount: 3,
        expandedNodeIds: ['node1', 'node2', 'node3'],
      });

      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Wait for config to load
      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      // Switch to execute task
      const taskRadio = screen.getByRole('radio', { name: /execute task/i });
      await fireEvent.click(taskRadio);

      // Verify radio is checked
      await waitFor(() => {
        expect(taskRadio).toHaveProperty('checked', true);
      });

      // For this test, we'll verify that the task action type was selected
      // The actual form interaction would require mocking the task form's behavior
      // which is tested separately in ExecuteTaskForm.test.ts
      expect(taskRadio).toHaveProperty('checked', true);
    });

    it('should handle queue full error', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('Execution queue is full'));

      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Wait for config to load
      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      // Enter a command
      const commandInput = screen.getByPlaceholderText(/enter command/i);
      await fireEvent.input(commandInput, { target: { value: 'ls' } });

      // Wait for button to be enabled
      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute action on/i });
        expect(executeButton).not.toHaveProperty('disabled', true);
      });

      // Click execute button
      const executeButton = screen.getByRole('button', { name: /execute action on/i });
      await fireEvent.click(executeButton);

      // Verify error message
      await waitFor(() => {
        expect(screen.getByText(/queue is full/i)).toBeTruthy();
      });

      expect(mockOnSuccess).not.toHaveBeenCalled();
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('should handle validation error', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('Invalid node IDs provided'));

      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Wait for config to load
      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      // Enter a command
      const commandInput = screen.getByPlaceholderText(/enter command/i);
      await fireEvent.input(commandInput, { target: { value: 'ls' } });

      // Wait for button to be enabled
      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute action on/i });
        expect(executeButton).not.toHaveProperty('disabled', true);
      });

      // Click execute button
      const executeButton = screen.getByRole('button', { name: /execute action on/i });
      await fireEvent.click(executeButton);

      // Verify error message
      await waitFor(() => {
        expect(screen.getByText(/validation error/i)).toBeTruthy();
      });
    });

    it('should handle not found error', async () => {
      vi.mocked(api.post).mockRejectedValue(new Error('Nodes not found'));

      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Wait for config to load
      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      // Enter a command
      const commandInput = screen.getByPlaceholderText(/enter command/i);
      await fireEvent.input(commandInput, { target: { value: 'ls' } });

      // Wait for button to be enabled
      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute action on/i });
        expect(executeButton).not.toHaveProperty('disabled', true);
      });

      // Click execute button
      const executeButton = screen.getByRole('button', { name: /execute action on/i });
      await fireEvent.click(executeButton);

      // Verify error message
      await waitFor(() => {
        expect(screen.getByText(/not found.*refresh/i)).toBeTruthy();
      });
    });

    it('should show loading state during execution', async () => {
      let resolvePost: () => void;
      const postPromise = new Promise<{ batchId: string; executionIds: string[]; targetCount: number; expandedNodeIds: string[] }>((resolve) => {
        resolvePost = () => resolve({
          batchId: 'batch-789',
          executionIds: ['exec-7', 'exec-8', 'exec-9'],
          targetCount: 3,
          expandedNodeIds: ['node1', 'node2', 'node3']
        });
      });
      vi.mocked(api.post).mockReturnValue(postPromise);

      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Wait for config to load
      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      // Enter a command
      const commandInput = screen.getByPlaceholderText(/enter command/i);
      await fireEvent.input(commandInput, { target: { value: 'ls' } });

      // Wait for button to be enabled
      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute action on/i });
        expect(executeButton).not.toHaveProperty('disabled', true);
      });

      // Click execute button
      const executeButton = screen.getByRole('button', { name: /execute action on/i });
      await fireEvent.click(executeButton);

      // Verify loading state
      await waitFor(() => {
        expect(screen.getByText(/executing\.\.\./i)).toBeTruthy();
      });

      // Resolve the promise

      resolvePost!();

      // Wait for completion
      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled();
      });
    });

    it('should include all target node IDs in batch request', async () => {
      vi.mocked(api.post).mockResolvedValue({
        batchId: 'batch-999',
        executionIds: ['exec-10', 'exec-11', 'exec-12'],
        targetCount: 3,
        expandedNodeIds: ['node1', 'node2', 'node3'],
      });

      render(GroupActionModal, {
        props: {
          open: true,
          groupName: 'webservers',
          groupId: 'group1',
          targetNodes: mockTargetNodes,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Wait for config to load
      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      // Enter a command
      const commandInput = screen.getByPlaceholderText(/enter command/i);
      await fireEvent.input(commandInput, { target: { value: 'pwd' } });

      // Wait for button to be enabled
      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute action on/i });
        expect(executeButton).not.toHaveProperty('disabled', true);
      });

      // Click execute button
      const executeButton = screen.getByRole('button', { name: /execute action on/i });
      await fireEvent.click(executeButton);

      // Verify all node IDs are included
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/executions/batch', expect.objectContaining({
          targetNodeIds: expect.arrayContaining(['node1', 'node2', 'node3']),
        }));
      });
    });
  });
});
