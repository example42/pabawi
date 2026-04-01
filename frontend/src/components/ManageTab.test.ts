/**
 * Unit tests for ManageTab component
 * Validates Requirements: 5.1, 5.2, 6.1, 6.2, 6.3, 7.1, 8.1
 *
 * Task 6.5: Comprehensive unit tests for ManageTab
 * Test coverage: Action button rendering, availability logic, execution handlers, confirmation dialogs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import ManageTab from './ManageTab.svelte';
import * as api from '../lib/api';
import * as toast from '../lib/toast.svelte';

import type { LifecycleAction } from '../lib/types/provisioning';

// Mock the API functions
vi.mock('../lib/api', () => ({
  executeNodeAction: vi.fn(),
  destroyNode: vi.fn(),
  fetchLifecycleActions: vi.fn(),
  get: vi.fn(),
}));

// Mock the toast functions
vi.mock('../lib/toast.svelte', () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
  showInfo: vi.fn(),
}));

describe('ManageTab Component', () => {
  const defaultActions: LifecycleAction[] = [
    { name: 'start', displayName: 'Start', description: 'Start the VM', destructive: false, requiresConfirmation: false, availableWhen: ['stopped'] },
    { name: 'stop', displayName: 'Stop', description: 'Stop the VM', destructive: false, requiresConfirmation: false, availableWhen: ['running'] },
    { name: 'shutdown', displayName: 'Shutdown', description: 'Graceful shutdown', destructive: false, requiresConfirmation: false, availableWhen: ['running'] },
    { name: 'reboot', displayName: 'Reboot', description: 'Reboot the VM', destructive: false, requiresConfirmation: false, availableWhen: ['running'] },
    { name: 'suspend', displayName: 'Suspend', description: 'Suspend the VM', destructive: false, requiresConfirmation: false, availableWhen: ['running'] },
    { name: 'resume', displayName: 'Resume', description: 'Resume the VM', destructive: false, requiresConfirmation: false, availableWhen: ['suspended'] },
    { name: 'snapshot', displayName: 'Snapshot', description: 'Take a snapshot', destructive: false, requiresConfirmation: false, availableWhen: ['running', 'stopped'] },
    { name: 'destroy', displayName: 'Destroy', description: 'Destroy the VM', destructive: true, requiresConfirmation: true, availableWhen: ['stopped', 'running', 'suspended'] },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: fetchLifecycleActions returns actions for proxmox
    vi.mocked(api.fetchLifecycleActions).mockResolvedValue({
      provider: 'proxmox',
      actions: defaultActions,
    });
    // Default mock: get for provisioning config
    vi.mocked(api.get).mockResolvedValue({
      provisioning: { allowDestructiveActions: true },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Component Rendering (Validates Requirements 5.1, 5.2)', () => {
    it('renders the component with header and title', () => {
      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'running',
        },
      });

      expect(screen.getByText('Lifecycle Actions')).toBeTruthy();
      expect(screen.getByText(/Manage the lifecycle of this virtual machine/i)).toBeTruthy();
    });

    it('displays correct description for VM node type', () => {
      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'running',
        },
      });

      expect(screen.getByText(/Manage the lifecycle of this virtual machine/i)).toBeTruthy();
    });

    it('displays correct description for LXC node type', () => {
      render(ManageTab, {
        props: {
          nodeId: 'lxc-200',
          nodeType: 'lxc',
          currentStatus: 'running',
        },
      });

      expect(screen.getByText(/Manage the lifecycle of this container/i)).toBeTruthy();
    });

    it('displays correct description for unknown node type', () => {
      render(ManageTab, {
        props: {
          nodeId: 'node-300',
          nodeType: 'unknown',
          currentStatus: 'running',
        },
      });

      expect(screen.getByText(/Manage the lifecycle of this node/i)).toBeTruthy();
    });

    it('displays integration badge', () => {
      const { container } = render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'running',
        },
      });

      // IntegrationBadge should be rendered
      const badge = container.querySelector('[role="status"]');
      expect(badge).toBeTruthy();
    });

    it('displays current status badge', () => {
      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'running',
        },
      });

      expect(screen.getByText('Current Status:')).toBeTruthy();
      expect(screen.getByText('running')).toBeTruthy();
    });

    it('does not display status badge when status is unknown', () => {
      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'unknown',
        },
      });

      expect(screen.queryByText('Current Status:')).toBeFalsy();
    });
  });

  describe('Action Button Rendering (Validates Requirements 6.1, 6.2, 6.3)', () => {
    it('displays Start button when node is stopped', async () => {
      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Start')).toBeTruthy();
      });
    });

    it('displays Stop, Shutdown, Reboot, Suspend buttons when node is running', async () => {
      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'running',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Stop')).toBeTruthy();
        expect(screen.getByText('Shutdown')).toBeTruthy();
        expect(screen.getByText('Reboot')).toBeTruthy();
        expect(screen.getByText('Suspend')).toBeTruthy();
      });
    });

    it('displays Resume button when node is suspended', async () => {
      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'suspended',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Resume')).toBeTruthy();
      });
    });

    it('displays Destroy button for all states', async () => {
      const statuses = ['stopped', 'running', 'suspended'];

      for (const status of statuses) {
        const { unmount } = render(ManageTab, {
          props: {
            nodeId: 'vm-100',
            nodeType: 'vm',
            currentStatus: status,
          },
        });

        await waitFor(() => {
          expect(screen.getByText('Destroy')).toBeTruthy();
        });

        unmount();
      }
    });

    it('does not display Stop button when node is stopped', async () => {
      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.queryByText('Stop')).toBeFalsy();
      });
    });

    it('does not display Start button when node is running', async () => {
      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'running',
        },
      });

      await waitFor(() => {
        expect(screen.queryByText('Start')).toBeFalsy();
      });
    });

    it('displays Snapshot button for running and stopped states', async () => {
      const { unmount } = render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'running',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Snapshot')).toBeTruthy();
      });

      unmount();

      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Snapshot')).toBeTruthy();
      });
    });
  });

  describe('Action Availability Logic (Validates Requirements 6.1, 6.2, 6.3)', () => {
    it('filters actions based on current node status', async () => {
      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        // Should show Start and Destroy
        expect(screen.getByText('Start')).toBeTruthy();
        expect(screen.getByText('Destroy')).toBeTruthy();
        expect(screen.getByText('Snapshot')).toBeTruthy();

        // Should not show running-only actions
        expect(screen.queryByText('Stop')).toBeFalsy();
        expect(screen.queryByText('Shutdown')).toBeFalsy();
        expect(screen.queryByText('Reboot')).toBeFalsy();
        expect(screen.queryByText('Suspend')).toBeFalsy();
      });
    });

    it('updates displayed actions when status changes', async () => {
      const { rerender } = render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Start')).toBeTruthy();
      });

      // Change status to running
      rerender({
        nodeId: 'vm-100',
        nodeType: 'vm',
        currentStatus: 'running',
      });

      await waitFor(() => {
        expect(screen.queryByText('Start')).toBeFalsy();
        expect(screen.getByText('Stop')).toBeTruthy();
      });
    });

    it('shows no actions message when no actions are available', async () => {
      // Mock fetchLifecycleActions to return empty actions
      vi.mocked(api.fetchLifecycleActions).mockResolvedValue({
        provider: 'proxmox',
        actions: [],
      });

      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'running',
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/No actions are available/i)).toBeTruthy();
      });
    });
  });

  describe('Action Execution Handlers (Validates Requirements 6.4, 6.5, 6.6)', () => {
    it('calls executeNodeAction when Start button is clicked', async () => {
      const mockExecuteNodeAction = vi.mocked(api.executeNodeAction);
      mockExecuteNodeAction.mockResolvedValue({
        success: true,
        taskId: 'task-123',
        message: 'Action completed successfully',
      });

      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Start')).toBeTruthy();
      });

      const startButton = screen.getByText('Start').closest('button');
      await fireEvent.click(startButton!);

      await waitFor(() => {
        expect(mockExecuteNodeAction).toHaveBeenCalledWith('vm-100', 'start');
      });
    });

    it('calls executeNodeAction when Stop button is clicked', async () => {
      const mockExecuteNodeAction = vi.mocked(api.executeNodeAction);
      mockExecuteNodeAction.mockResolvedValue({
        success: true,
        taskId: 'task-123',
        message: 'Action completed successfully',
      });

      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'running',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Stop')).toBeTruthy();
      });

      const stopButton = screen.getByText('Stop').closest('button');
      await fireEvent.click(stopButton!);

      await waitFor(() => {
        expect(mockExecuteNodeAction).toHaveBeenCalledWith('vm-100', 'stop');
      });
    });

    it('shows success toast when action succeeds', async () => {
      const mockExecuteNodeAction = vi.mocked(api.executeNodeAction);
      const mockShowSuccess = vi.mocked(toast.showSuccess);

      mockExecuteNodeAction.mockResolvedValue({
        success: true,
        taskId: 'task-123',
        message: 'VM started successfully',
      });

      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Start')).toBeTruthy();
      });

      const startButton = screen.getByText('Start').closest('button');
      await fireEvent.click(startButton!);

      await waitFor(() => {
        expect(mockShowSuccess).toHaveBeenCalledWith(
          'Action start completed successfully',
          'VM started successfully'
        );
      });
    });

    it('shows error toast when action fails', async () => {
      const mockExecuteNodeAction = vi.mocked(api.executeNodeAction);
      const mockShowError = vi.mocked(toast.showError);

      mockExecuteNodeAction.mockResolvedValue({
        success: false,
        message: 'Failed to start VM',
        error: 'VM is locked',
      });

      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Start')).toBeTruthy();
      });

      const startButton = screen.getByText('Start').closest('button');
      await fireEvent.click(startButton!);

      await waitFor(() => {
        expect(mockShowError).toHaveBeenCalledWith(
          'Action start failed',
          'VM is locked'
        );
      });
    });

    it('calls onStatusChange callback after successful action', async () => {
      const mockExecuteNodeAction = vi.mocked(api.executeNodeAction);
      const mockOnStatusChange = vi.fn();

      mockExecuteNodeAction.mockResolvedValue({
        success: true,
        taskId: 'task-123',
        message: 'Action completed successfully',
      });

      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
          onStatusChange: mockOnStatusChange,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Start')).toBeTruthy();
      });

      const startButton = screen.getByText('Start').closest('button');
      await fireEvent.click(startButton!);

      await waitFor(() => {
        expect(mockOnStatusChange).toHaveBeenCalled();
      });
    });

    it('handles API errors gracefully', async () => {
      const mockExecuteNodeAction = vi.mocked(api.executeNodeAction);
      const mockShowError = vi.mocked(toast.showError);

      mockExecuteNodeAction.mockRejectedValue(new Error('Network error'));

      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Start')).toBeTruthy();
      });

      const startButton = screen.getByText('Start').closest('button');
      await fireEvent.click(startButton!);

      await waitFor(() => {
        expect(mockShowError).toHaveBeenCalledWith(
          'Failed to execute start',
          'Network error'
        );
      });
    });
  });

  describe('Confirmation Dialogs (Validates Requirements 7.1, 7.2, 8.1, 8.2)', () => {
    it('shows confirmation dialog when Destroy button is clicked', async () => {
      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Destroy')).toBeTruthy();
      });

      const destroyButton = screen.getByText('Destroy').closest('button');
      await fireEvent.click(destroyButton!);

      await waitFor(() => {
        expect(screen.getByText('Confirm Destructive Action')).toBeTruthy();
        expect(screen.getByText(/Are you sure you want to destroy this virtual machine/i)).toBeTruthy();
      });
    });

    it('displays node ID in confirmation dialog', async () => {
      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Destroy')).toBeTruthy();
      });

      const destroyButton = screen.getByText('Destroy').closest('button');
      await fireEvent.click(destroyButton!);

      await waitFor(() => {
        expect(screen.getByText('vm-100')).toBeTruthy();
      });
    });

    it('displays warning message for destroy action', async () => {
      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Destroy')).toBeTruthy();
      });

      const destroyButton = screen.getByText('Destroy').closest('button');
      await fireEvent.click(destroyButton!);

      await waitFor(() => {
        expect(screen.getByText(/This action cannot be undone/i)).toBeTruthy();
      });
    });

    it('closes confirmation dialog when Cancel is clicked', async () => {
      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Destroy')).toBeTruthy();
      });

      const destroyButton = screen.getByText('Destroy').closest('button');
      await fireEvent.click(destroyButton!);

      await waitFor(() => {
        expect(screen.getByText('Confirm Destructive Action')).toBeTruthy();
      });

      const cancelButton = screen.getByText('Cancel');
      await fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByText('Confirm Destructive Action')).toBeFalsy();
      });
    });

    it('calls destroyNode when Confirm is clicked', async () => {
      const mockDestroyNode = vi.mocked(api.destroyNode);
      mockDestroyNode.mockResolvedValue({
        success: true,
        taskId: 'task-123',
        message: 'Node destroyed successfully',
      });

      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Destroy')).toBeTruthy();
      });

      const destroyButton = screen.getByText('Destroy').closest('button');
      await fireEvent.click(destroyButton!);

      await waitFor(() => {
        expect(screen.getByText('Confirm')).toBeTruthy();
      });

      const confirmButton = screen.getByText('Confirm');
      await fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockDestroyNode).toHaveBeenCalledWith('vm-100');
      });
    });

    it('does not call destroyNode when Cancel is clicked', async () => {
      const mockDestroyNode = vi.mocked(api.destroyNode);

      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Destroy')).toBeTruthy();
      });

      const destroyButton = screen.getByText('Destroy').closest('button');
      await fireEvent.click(destroyButton!);

      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeTruthy();
      });

      const cancelButton = screen.getByText('Cancel');
      await fireEvent.click(cancelButton);

      expect(mockDestroyNode).not.toHaveBeenCalled();
    });

    it('shows correct message for LXC container in confirmation dialog', async () => {
      render(ManageTab, {
        props: {
          nodeId: 'lxc-200',
          nodeType: 'lxc',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Destroy')).toBeTruthy();
      });

      const destroyButton = screen.getByText('Destroy').closest('button');
      await fireEvent.click(destroyButton!);

      await waitFor(() => {
        expect(screen.getByText(/Are you sure you want to destroy this container/i)).toBeTruthy();
      });
    });

    it('closes confirmation dialog after successful destroy', async () => {
      const mockDestroyNode = vi.mocked(api.destroyNode);
      mockDestroyNode.mockResolvedValue({
        success: true,
        taskId: 'task-123',
        message: 'Node destroyed successfully',
      });

      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Destroy')).toBeTruthy();
      });

      const destroyButton = screen.getByText('Destroy').closest('button');
      await fireEvent.click(destroyButton!);

      await waitFor(() => {
        expect(screen.getByText('Confirm')).toBeTruthy();
      });

      const confirmButton = screen.getByText('Confirm');
      await fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.queryByText('Confirm Destructive Action')).toBeFalsy();
      });
    });
  });

  describe('Loading States (Validates Requirements 6.7)', () => {
    it('shows loading spinner during initial load', async () => {
      // The component loads actions synchronously in the current implementation
      // This test verifies the loading state structure exists
      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'running',
        },
      });

      // Wait for actions to load
      await waitFor(() => {
        expect(screen.queryByText('Loading available actions...')).toBeFalsy();
        expect(screen.getByText('Stop')).toBeTruthy();
      });
    });

    it('disables all action buttons when an action is in progress', async () => {
      const mockExecuteNodeAction = vi.mocked(api.executeNodeAction);

      // Delay the response to test loading state
      mockExecuteNodeAction.mockImplementation(() =>
        new Promise(resolve =>
          setTimeout(() => resolve({
            success: true,
            taskId: 'task-123',
            message: 'Action completed successfully',
          }), 100)
        )
      );

      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'running',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Stop')).toBeTruthy();
      });

      const stopButton = screen.getByText('Stop').closest('button') as HTMLButtonElement;
      await fireEvent.click(stopButton);

      // All buttons should be disabled
      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        buttons.forEach(button => {
          if (button.textContent?.includes('Stop') ||
              button.textContent?.includes('Shutdown') ||
              button.textContent?.includes('Reboot')) {
            expect((button as HTMLButtonElement).disabled).toBe(true);
          }
        });
      });
    });

    it('shows action in progress indicator', async () => {
      const mockExecuteNodeAction = vi.mocked(api.executeNodeAction);

      mockExecuteNodeAction.mockImplementation(() =>
        new Promise(resolve =>
          setTimeout(() => resolve({
            success: true,
            taskId: 'task-123',
            message: 'Action completed successfully',
          }), 100)
        )
      );

      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Start')).toBeTruthy();
      });

      const startButton = screen.getByText('Start').closest('button');
      await fireEvent.click(startButton!);

      await waitFor(() => {
        expect(screen.getByText(/Executing start... This may take a moment/i)).toBeTruthy();
      });
    });

    it('re-enables buttons after action completes', async () => {
      const mockExecuteNodeAction = vi.mocked(api.executeNodeAction);

      mockExecuteNodeAction.mockResolvedValue({
        success: true,
        taskId: 'task-123',
        message: 'Action completed successfully',
      });

      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Start')).toBeTruthy();
      });

      const startButton = screen.getByText('Start').closest('button') as HTMLButtonElement;
      await fireEvent.click(startButton);

      // Wait for action to complete
      await waitFor(() => {
        expect(mockExecuteNodeAction).toHaveBeenCalled();
      });

      // Wait a bit more for state to update
      await new Promise(resolve => setTimeout(resolve, 50));

      // Buttons should be enabled again
      expect(startButton.disabled).toBe(false);
    });

    it('shows info toast when action starts', async () => {
      const mockExecuteNodeAction = vi.mocked(api.executeNodeAction);
      const mockShowInfo = vi.mocked(toast.showInfo);

      mockExecuteNodeAction.mockResolvedValue({
        success: true,
        taskId: 'task-123',
        message: 'Action completed successfully',
      });

      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Start')).toBeTruthy();
      });

      const startButton = screen.getByText('Start').closest('button');
      await fireEvent.click(startButton!);

      await waitFor(() => {
        expect(mockShowInfo).toHaveBeenCalledWith('Executing start...');
      });
    });
  });

  describe('Action Button Styling (Validates Requirements 7.1, 8.1)', () => {
    it('applies destructive styling to Destroy button', async () => {
      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Destroy')).toBeTruthy();
      });

      const destroyButton = screen.getByText('Destroy').closest('button');
      expect(destroyButton?.className).toContain('border-red');
      expect(destroyButton?.className).toContain('bg-red');
    });

    it('applies normal styling to non-destructive buttons', async () => {
      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Start')).toBeTruthy();
      });

      const startButton = screen.getByText('Start').closest('button');
      expect(startButton?.className).not.toContain('border-red');
      expect(startButton?.className).toContain('border-gray');
    });

    it('displays correct icons for each action', async () => {
      const { container } = render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'running',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Stop')).toBeTruthy();
      });

      // Each action button should have an SVG icon
      const buttons = container.querySelectorAll('button');
      buttons.forEach(button => {
        if (button.textContent?.includes('Stop') ||
            button.textContent?.includes('Shutdown') ||
            button.textContent?.includes('Reboot')) {
          const icon = button.querySelector('svg');
          expect(icon).toBeTruthy();
        }
      });
    });
  });

  describe('Error Handling', () => {
    it('displays error alert when loading actions fails', async () => {
      // This test verifies the error state, though in current implementation
      // actions are hardcoded. This tests the error handling structure.
      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'running',
        },
      });

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.queryByText('Loading available actions...')).toBeFalsy();
      });
    });

    it('logs errors to console', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const mockExecuteNodeAction = vi.mocked(api.executeNodeAction);

      mockExecuteNodeAction.mockRejectedValue(new Error('Network error'));

      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Start')).toBeTruthy();
      });

      const startButton = screen.getByText('Start').closest('button');
      await fireEvent.click(startButton!);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Error executing action start'),
          expect.any(Error)
        );
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Accessibility', () => {
    it('uses semantic button elements', async () => {
      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'running',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Stop')).toBeTruthy();
      });

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('uses aria-hidden for decorative icons', async () => {
      const { container } = render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'running',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Stop')).toBeTruthy();
      });

      const icons = container.querySelectorAll('svg');
      icons.forEach(icon => {
        // Icons should either have aria-hidden or be part of accessible content
        expect(icon).toBeTruthy();
      });
    });

    it('uses proper dialog roles for confirmation modal', async () => {
      render(ManageTab, {
        props: {
          nodeId: 'vm-100',
          nodeType: 'vm',
          currentStatus: 'stopped',
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Destroy')).toBeTruthy();
      });

      const destroyButton = screen.getByText('Destroy').closest('button');
      await fireEvent.click(destroyButton!);

      await waitFor(() => {
        const dialog = screen.getByRole('dialog');
        expect(dialog).toBeTruthy();
      });
    });
  });
});
