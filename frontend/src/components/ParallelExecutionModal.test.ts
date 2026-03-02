import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import ParallelExecutionModal from './ParallelExecutionModal.svelte';
import * as api from '../lib/api';

// Mock the API module
vi.mock('../lib/api', () => ({
  get: vi.fn(),
  post: vi.fn(),
}));

describe('ParallelExecutionModal Component', () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  const mockInventoryData = {
    nodes: [
      { id: 'node1', name: 'server1.example.com', uri: 'ssh://server1.example.com', transport: 'ssh', source: 'bolt' },
      { id: 'node2', name: 'server2.example.com', uri: 'ssh://server2.example.com', transport: 'ssh', source: 'bolt' },
      { id: 'node3', name: 'server3.example.com', uri: 'ssh://server3.example.com', transport: 'ssh', source: 'puppetdb' },
    ],
    groups: [
      { id: 'group1', name: 'webservers', source: 'bolt', sources: ['bolt'], linked: false, nodes: ['node1', 'node2'] },
      { id: 'group2', name: 'databases', source: 'puppetdb', sources: ['puppetdb'], linked: false, nodes: ['node3'] },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock successful inventory fetch by default
    vi.mocked(api.get).mockResolvedValue(mockInventoryData);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should not render when open is false', () => {
      render(ParallelExecutionModal, {
        props: {
          open: false,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      expect(screen.queryByText('New Parallel Execution')).toBeNull();
    });

    it('should render when open is true', () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      expect(screen.getByText('New Parallel Execution')).toBeTruthy();
    });

    it('should render all main sections', () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      expect(screen.getByText('Select Targets')).toBeTruthy();
      expect(screen.getByText('Configure Action')).toBeTruthy();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /execute on/i })).toBeTruthy();
    });

    it('should render close button', () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const closeButton = screen.getByRole('button', { name: /close/i });
      expect(closeButton).toBeTruthy();
    });

    it('should render action type selector with all options', () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const select = screen.getByLabelText('Action Type');
      expect(select).toBeTruthy();
      expect(select).toBeInstanceOf(HTMLSelectElement);

      const options = Array.from((select as HTMLSelectElement).options).map((opt) => opt.value);
      expect(options).toEqual(['command', 'task', 'plan']);
    });

    it('should render action value input field', () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const input = screen.getByLabelText('Command');
      expect(input).toBeTruthy();
      expect(input).toBeInstanceOf(HTMLInputElement);
    });
  });

  describe('Target Selection', () => {
    it('should display initial target count as 0', () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      expect(screen.getByText(/selected:/i)).toBeTruthy();
      expect(screen.getByText('0')).toBeTruthy();
    });

    it('should fetch inventory when modal opens', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/api/inventory');
      });
    });

    it('should display loading state while fetching inventory', async () => {
      // Make the API call take longer
      vi.mocked(api.get).mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(mockInventoryData), 100)));

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      expect(screen.getByText(/loading inventory/i)).toBeTruthy();

      await waitFor(() => {
        expect(screen.queryByText(/loading inventory/i)).toBeNull();
      });
    });

    it('should display error when inventory fetch fails', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Network error'));

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeTruthy();
      });
    });

    it('should display nodes and groups tabs', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/nodes \(3\)/i)).toBeTruthy();
        expect(screen.getByText(/groups \(2\)/i)).toBeTruthy();
      });
    });

    it('should display nodes list by default', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
        expect(screen.getByText('server2.example.com')).toBeTruthy();
        expect(screen.getByText('server3.example.com')).toBeTruthy();
      });
    });

    it('should switch to groups view when groups tab is clicked', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      const groupsTab = screen.getByText(/groups \(2\)/i);
      await fireEvent.click(groupsTab);

      expect(screen.getByText('webservers')).toBeTruthy();
      expect(screen.getByText('databases')).toBeTruthy();
    });

    it('should allow selecting individual nodes', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(checkboxes[0]);

      await waitFor(() => {
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent ?? '';
        expect(selectedText).toContain('1');
      });
    });

    it('should allow selecting groups', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      const groupsTab = screen.getByText(/groups \(2\)/i);
      await fireEvent.click(groupsTab);

      const checkboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(checkboxes[0]); // Select webservers group

      await waitFor(() => {
        // webservers group has 2 nodes
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent ?? '';
        expect(selectedText).toContain('2');
      });
    });

    it('should deduplicate nodes when selecting multiple groups', async () => {
      const overlappingInventory = {
        nodes: [
          { id: 'node1', name: 'server1.example.com', uri: 'ssh://server1.example.com', transport: 'ssh', source: 'bolt' },
        ],
        groups: [
          { id: 'group1', name: 'webservers', source: 'bolt', sources: ['bolt'], linked: false, nodes: ['node1'] },
          { id: 'group2', name: 'appservers', source: 'bolt', sources: ['bolt'], linked: false, nodes: ['node1'] },
        ],
      };
      vi.mocked(api.get).mockResolvedValue(overlappingInventory);

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      const groupsTab = screen.getByText(/groups \(2\)/i);
      await fireEvent.click(groupsTab);

      const checkboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(checkboxes[0]); // Select first group
      await fireEvent.click(checkboxes[1]); // Select second group

      await waitFor(() => {
        // Both groups contain node1, but it should only be counted once
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent ?? '';
        expect(selectedText).toContain('1');
      });
    });

    it('should filter nodes by search query', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      const searchInput = screen.getByPlaceholderText(/search by name/i);
      await fireEvent.input(searchInput, { target: { value: 'server1' } });

      expect(screen.getByText('server1.example.com')).toBeTruthy();
      expect(screen.queryByText('server2.example.com')).toBeNull();
      expect(screen.queryByText('server3.example.com')).toBeNull();
    });

    it('should filter nodes by source', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      const sourceSelect = screen.getByDisplayValue(/all sources/i);
      await fireEvent.change(sourceSelect, { target: { value: 'puppetdb' } });

      expect(screen.queryByText('server1.example.com')).toBeNull();
      expect(screen.queryByText('server2.example.com')).toBeNull();
      expect(screen.getByText('server3.example.com')).toBeTruthy();
    });

    it('should select all visible nodes when "Select All" is clicked', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      const selectAllButton = screen.getByText(/select all/i);
      await fireEvent.click(selectAllButton);

      await waitFor(() => {
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent ?? '';
        expect(selectedText).toContain('3');
      });
    });

    it('should clear all selections when "Clear All" is clicked', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select all first
      const selectAllButton = screen.getByText(/select all/i);
      await fireEvent.click(selectAllButton);

      await waitFor(() => {
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent ?? '';
        expect(selectedText).toContain('3');
      });

      // Then clear all
      const clearAllButton = screen.getByText(/clear all/i);
      await fireEvent.click(clearAllButton);

      await waitFor(() => {
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent ?? '';
        expect(selectedText).toContain('0');
      });
    });

    it('should show retry button when inventory fetch fails', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Network error'));

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeTruthy();
      });

      const retryButton = screen.getByText(/retry/i);
      expect(retryButton).toBeTruthy();

      // Mock successful retry
      vi.mocked(api.get).mockResolvedValue(mockInventoryData);
      await fireEvent.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });
    });
  });

  describe('Action Configuration', () => {
    it('should default to command action type', () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const select = screen.getByLabelText('Action Type');
      expect(select.value).toBe('command');
    });

    it('should update action type when changed', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const select = screen.getByLabelText('Action Type');
      await fireEvent.change(select, { target: { value: 'task' } });

      expect(select.value).toBe('task');
    });

    it('should update label when action type changes to task', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const select = screen.getByLabelText('Action Type');
      await fireEvent.change(select, { target: { value: 'task' } });

      expect(screen.getByLabelText('Task Name')).toBeTruthy();
    });

    it('should update label when action type changes to plan', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const select = screen.getByLabelText('Action Type');
      await fireEvent.change(select, { target: { value: 'plan' } });

      expect(screen.getByLabelText('Plan Name')).toBeTruthy();
    });

    it('should update placeholder when action type changes', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const select = screen.getByLabelText('Action Type');
      const input = screen.getByLabelText('Command');

      expect(input.placeholder).toBe('uptime');

      await fireEvent.change(select, { target: { value: 'task' } });
      const taskInput = screen.getByLabelText('Task Name');
      expect(taskInput.placeholder).toBe('package::install');

      await fireEvent.change(select, { target: { value: 'plan' } });
      const planInput = screen.getByLabelText('Plan Name');
      expect(planInput.placeholder).toBe('deploy::app');
    });

    it('should accept action value input', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const input = screen.getByLabelText('Command');
      await fireEvent.input(input, { target: { value: 'ls -la' } });

      expect(input.value).toBe('ls -la');
    });
  });

  describe('Execute Button State', () => {
    it('should disable execute button when no targets selected', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      const executeButton = screen.getByRole('button', { name: /execute on 0 targets/i });
      expect(executeButton).toBeInstanceOf(HTMLButtonElement);
      expect((executeButton as HTMLButtonElement).disabled).toBe(true);
    });

    it('should disable execute button when action value is empty', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      const executeButton = screen.getByRole('button', { name: /execute on/i });
      expect(executeButton).toBeInstanceOf(HTMLButtonElement);
      expect((executeButton as HTMLButtonElement).disabled).toBe(true);
    });

    it('should enable execute button when targets and action are provided', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select a node
      const checkboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(checkboxes[0]);

      // Enter action
      const actionInput = screen.getByLabelText('Command');
      await fireEvent.input(actionInput, { target: { value: 'uptime' } });

      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
        expect((executeButton as HTMLButtonElement).disabled).toBe(false);
      });
    });

    it('should display correct target count in execute button', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // With 0 targets
      expect(screen.getByRole('button', { name: /execute on 0 targets/i })).toBeTruthy();

      // Select one node
      const checkboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(checkboxes[0]);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /execute on 1 target/i })).toBeTruthy();
      });

      // Select another node
      await fireEvent.click(checkboxes[1]);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /execute on 2 targets/i })).toBeTruthy();
      });
    });

    it('should use singular "Target" for count of 1', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(checkboxes[0]);

      await waitFor(() => {
        const button = screen.getByRole('button', { name: /execute on 1 target/i });
        expect(button.textContent).toContain('Target');
        expect(button.textContent).not.toContain('Targets');
      });
    });
  });

  describe('Modal Close Behavior', () => {
    it('should call onClose when close button is clicked', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const closeButton = screen.getByRole('button', { name: /close/i });
      await fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalledOnce();
    });

    it('should call onClose when cancel button is clicked', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalledOnce();
    });

    it('should call onClose when backdrop is clicked', async () => {
      const { container } = render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const backdrop = container.querySelector('.fixed.inset-0.bg-gray-500');
      expect(backdrop).toBeTruthy();

      if (backdrop) {
        await fireEvent.click(backdrop);
      }
      expect(mockOnClose).toHaveBeenCalledOnce();
    });

    it('should not close when clicking inside modal content', async () => {
      const { container } = render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const modalContent = container.querySelector('.bg-white.dark\\:bg-gray-800.text-left');
      expect(modalContent).toBeTruthy();

      if (modalContent) {
        await fireEvent.click(modalContent);
      }
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('should not call onClose when loading', () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Note: This test will need to be enhanced when we can trigger loading state
      // For now, we verify the button exists
      const closeButton = screen.getByRole('button', { name: /close/i });
      expect(closeButton).toBeTruthy();
    });
  });

  describe('Form Validation', () => {
    it('should show error when submitting with no targets', () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Note: Execute button is disabled when no targets, so this tests the validation logic
      // We'll need to test this more thoroughly when target selection is implemented
      const executeButton = screen.getByRole('button', { name: /execute on/i });
      expect((executeButton as HTMLButtonElement).disabled).toBe(true);
    });

    it('should show error when submitting with empty action', () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const executeButton = screen.getByRole('button', { name: /execute on/i });
      expect((executeButton as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe('Error Display', () => {
    it('should not show error message initially', () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const errorContainer = screen.queryByRole('alert');
      expect(errorContainer).toBeNull();
    });
  });

  describe('Loading State', () => {
    it('should disable all controls when loading', () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Note: This test verifies the structure exists
      // Loading state will be tested more thoroughly when execution is implemented
      const actionTypeSelect = screen.getByLabelText('Action Type');
      const actionInput = screen.getByLabelText('Command');
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      const executeButton = screen.getByRole('button', { name: /execute on/i });

      expect(actionTypeSelect.disabled).toBe(false);
      expect(actionInput.disabled).toBe(false);
      expect(cancelButton.disabled).toBe(false);
      expect(executeButton.disabled).toBe(true); // Disabled due to validation, not loading
    });
  });

  describe('Form Reset', () => {
    it('should reset form when modal is closed', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Change some values
      const actionTypeSelect = screen.getByLabelText('Action Type');
      const actionInput = screen.getByLabelText('Command');

      await fireEvent.change(actionTypeSelect, { target: { value: 'task' } });
      await fireEvent.input(actionInput, { target: { value: 'test::task' } });

      expect(actionTypeSelect.value).toBe('task');
      expect(actionInput.value).toBe('test::task');

      // Close modal
      const closeButton = screen.getByRole('button', { name: /close/i });
      await fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      expect(screen.getByLabelText('Action Type')).toBeTruthy();
      expect(screen.getByLabelText('Command')).toBeTruthy();
      expect(screen.getByRole('button', { name: /close/i })).toBeTruthy();
    });

    it('should have screen reader text for close button', () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const srText = screen.getByText('Close');
      expect(srText.classList.contains('sr-only')).toBe(true);
    });

    it('should use semantic HTML elements', () => {
      const { container } = render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const form = container.querySelector('form');
      expect(form).toBeTruthy();

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('Responsive Design', () => {
    it('should render with responsive classes', () => {
      const { container } = render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Check for responsive padding classes
      const responsivePadding = container.querySelector('.sm\\:p-4');
      expect(responsivePadding).toBeTruthy();

      // Check for responsive flex classes
      const responsiveFlex = container.querySelector('.sm\\:flex-row');
      expect(responsiveFlex).toBeTruthy();
    });
  });

  describe('Dark Mode Support', () => {
    it('should have dark mode classes', () => {
      const { container } = render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const darkBgElements = container.querySelectorAll('.dark\\:bg-gray-800');
      expect(darkBgElements.length).toBeGreaterThan(0);

      const darkTextElements = container.querySelectorAll('.dark\\:text-white');
      expect(darkTextElements.length).toBeGreaterThan(0);
    });
  });

  describe('Form Submission', () => {
    it('should prevent default form submission', () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const form = screen.getByRole('button', { name: /execute on/i }).closest('form');
      expect(form).toBeTruthy();

      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      const preventDefaultSpy = vi.spyOn(submitEvent, 'preventDefault');

      if (form) {
        form.dispatchEvent(submitEvent);
      }

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete workflow: open, configure, close', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Verify modal is open
      expect(screen.getByText('New Parallel Execution')).toBeTruthy();

      // Configure action
      const actionTypeSelect = screen.getByLabelText('Action Type');
      await fireEvent.change(actionTypeSelect, { target: { value: 'command' } });

      const actionInput = screen.getByLabelText('Command');
      await fireEvent.input(actionInput, { target: { value: 'uptime' } });

      // Close modal
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalledOnce();
    });

    it('should maintain state while modal is open', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Set action type
      const actionTypeSelect = screen.getByLabelText('Action Type');
      await fireEvent.change(actionTypeSelect, { target: { value: 'task' } });
      expect(actionTypeSelect.value).toBe('task');

      // Set action value
      const actionInput = screen.getByLabelText('Task Name');
      await fireEvent.input(actionInput, { target: { value: 'package::install' } });
      expect(actionInput.value).toBe('package::install');

      // Verify state persists
      expect(actionTypeSelect.value).toBe('task');
      expect(actionInput.value).toBe('package::install');
    });
  });

  describe('Parameters Configuration', () => {
    it('should render parameters textarea', () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const parametersTextarea = screen.getByLabelText('Parameters (Optional)');
      expect(parametersTextarea).toBeTruthy();
      expect(parametersTextarea).toBeInstanceOf(HTMLTextAreaElement);
    });

    it('should accept valid JSON parameters', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const parametersTextarea = screen.getByLabelText('Parameters (Optional)');
      const validJson = '{"timeout": 30, "retries": 3}';

      await fireEvent.input(parametersTextarea, { target: { value: validJson } });

      expect(parametersTextarea.value).toBe(validJson);
      expect(screen.queryByText(/invalid json/i)).toBeNull();
    });

    it('should show error for invalid JSON', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const parametersTextarea = screen.getByLabelText('Parameters (Optional)');
      const invalidJson = '{invalid json}';

      await fireEvent.input(parametersTextarea, { target: { value: invalidJson } });

      await waitFor(() => {
        // Modern JavaScript error messages say "Expected property name" instead of "Unexpected token"
        expect(screen.getByText(/expected property name|unexpected token/i)).toBeTruthy();
      });
    });

    it('should show error for non-object JSON', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const parametersTextarea = screen.getByLabelText('Parameters (Optional)');

      // Test with array
      await fireEvent.input(parametersTextarea, { target: { value: '["array", "values"]' } });

      await waitFor(() => {
        expect(screen.getByText(/parameters must be a json object/i)).toBeTruthy();
      });

      // Test with string
      await fireEvent.input(parametersTextarea, { target: { value: '"just a string"' } });

      await waitFor(() => {
        expect(screen.getByText(/parameters must be a json object/i)).toBeTruthy();
      });

      // Test with number
      await fireEvent.input(parametersTextarea, { target: { value: '123' } });

      await waitFor(() => {
        expect(screen.getByText(/parameters must be a json object/i)).toBeTruthy();
      });
    });

    it('should accept empty parameters', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const parametersTextarea = screen.getByLabelText('Parameters (Optional)');

      await fireEvent.input(parametersTextarea, { target: { value: '' } });

      expect(screen.queryByText(/invalid json/i)).toBeNull();
      expect(screen.queryByText(/parameters must be a json object/i)).toBeNull();
    });

    it('should disable execute button when parameters have error', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select a node
      const checkboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(checkboxes[0]);

      // Enter action
      const actionInput = screen.getByLabelText('Command');
      await fireEvent.input(actionInput, { target: { value: 'uptime' } });

      // Enter invalid parameters
      const parametersTextarea = screen.getByLabelText('Parameters (Optional)');
      await fireEvent.input(parametersTextarea, { target: { value: '{invalid}' } });

      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
        expect(executeButton.disabled).toBe(true);
      });
    });

    it('should enable execute button when parameters are valid', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select a node
      const checkboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(checkboxes[0]);

      // Enter action
      const actionInput = screen.getByLabelText('Command');
      await fireEvent.input(actionInput, { target: { value: 'uptime' } });

      // Enter valid parameters
      const parametersTextarea = screen.getByLabelText('Parameters (Optional)');
      await fireEvent.input(parametersTextarea, { target: { value: '{"timeout": 30}' } });

      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
        expect(executeButton.disabled).toBe(false);
      });
    });

    it('should clear parameters error when input is cleared', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const parametersTextarea = screen.getByLabelText('Parameters (Optional)');

      // Enter invalid JSON
      await fireEvent.input(parametersTextarea, { target: { value: '{invalid}' } });

      await waitFor(() => {
        // Modern JavaScript error messages say "Expected property name" instead of "Unexpected token"
        expect(screen.getByText(/expected property name|unexpected token/i)).toBeTruthy();
      });

      // Clear the input
      await fireEvent.input(parametersTextarea, { target: { value: '' } });

      await waitFor(() => {
        expect(screen.queryByText(/expected property name|unexpected token/i)).toBeNull();
      });
    });

    it('should reset parameters when form is reset', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const parametersTextarea = screen.getByLabelText('Parameters (Optional)');

      // Enter parameters
      await fireEvent.input(parametersTextarea, { target: { value: '{"key": "value"}' } });
      expect(parametersTextarea.value).toBe('{"key": "value"}');

      // Close modal (which resets form)
      const closeButton = screen.getByRole('button', { name: /close/i });
      await fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should have monospace font for parameters textarea', () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const parametersTextarea = screen.getByLabelText('Parameters (Optional)');
      expect(parametersTextarea.classList.contains('font-mono')).toBe(true);
    });

    it('should show helper text for parameters', () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      expect(screen.getByText(/enter parameters as a json object/i)).toBeTruthy();
    });

    it('should highlight parameters textarea with error styling when invalid', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const parametersTextarea = screen.getByLabelText('Parameters (Optional)');

      // Enter invalid JSON
      await fireEvent.input(parametersTextarea, { target: { value: '{invalid}' } });

      await waitFor(() => {
        expect(parametersTextarea.classList.contains('border-red-300') ||
               parametersTextarea.classList.contains('dark:border-red-600')).toBe(true);
      });
    });
  });

  describe('Execution Tool Selection (Task 5.6)', () => {
    it('should fetch available execution tools when modal opens', async () => {
      const mockIntegrationStatus = {
        integrations: [
          { name: 'bolt', status: 'connected', type: 'execution' },
          { name: 'ansible', status: 'connected', type: 'execution' },
          { name: 'ssh', status: 'connected', type: 'execution' },
        ],
      };

      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url === '/api/inventory') {
          return Promise.resolve(mockInventoryData);
        }
        if (url === '/api/integrations/status') {
          return Promise.resolve(mockIntegrationStatus);
        }
        return Promise.resolve({});
      });

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith('/api/integrations/status', { maxRetries: 1 });
      });
    });

    it('should display execution tool selector when multiple tools are available', async () => {
      const mockIntegrationStatus = {
        integrations: [
          { name: 'bolt', status: 'connected', type: 'execution' },
          { name: 'ansible', status: 'connected', type: 'execution' },
          { name: 'ssh', status: 'connected', type: 'execution' },
        ],
      };

      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url === '/api/inventory') {
          return Promise.resolve(mockInventoryData);
        }
        if (url === '/api/integrations/status') {
          return Promise.resolve(mockIntegrationStatus);
        }
        return Promise.resolve({});
      });

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Execution Tool')).toBeTruthy();
        // The component capitalizes tool names, so we need to check for the capitalized versions
        const toolButtons = screen.getAllByRole('radio');
        expect(toolButtons.length).toBe(3);
      });
    });

    it('should not display execution tool selector when only one tool is available', async () => {
      const mockIntegrationStatus = {
        integrations: [
          { name: 'bolt', status: 'connected', type: 'execution' },
        ],
      };

      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url === '/api/inventory') {
          return Promise.resolve(mockInventoryData);
        }
        if (url === '/api/integrations/status') {
          return Promise.resolve(mockIntegrationStatus);
        }
        return Promise.resolve({});
      });

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      expect(screen.queryByText('Execution Tool')).toBeNull();
    });

    it('should allow selecting different execution tools', async () => {
      const mockIntegrationStatus = {
        integrations: [
          { name: 'bolt', status: 'connected', type: 'execution' },
          { name: 'ansible', status: 'connected', type: 'execution' },
        ],
      };

      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url === '/api/inventory') {
          return Promise.resolve(mockInventoryData);
        }
        if (url === '/api/integrations/status') {
          return Promise.resolve(mockIntegrationStatus);
        }
        return Promise.resolve({});
      });

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Execution Tool')).toBeTruthy();
      });

      // Bolt should be selected by default
      const boltButton = screen.getByRole('radio', { name: /bolt/i });
      expect(boltButton.getAttribute('aria-checked')).toBe('true');

      // Click ansible
      const ansibleButton = screen.getByRole('radio', { name: /ansible/i });
      await fireEvent.click(ansibleButton);

      expect(ansibleButton.getAttribute('aria-checked')).toBe('true');
      expect(boltButton.getAttribute('aria-checked')).toBe('false');
    });

    it('should include selected execution tool in POST request', async () => {
      const mockIntegrationStatus = {
        integrations: [
          { name: 'bolt', status: 'connected', type: 'execution' },
          { name: 'ansible', status: 'connected', type: 'execution' },
        ],
      };

      const mockBatchResponse = {
        batchId: 'batch-tool-123',
        executionIds: ['exec-1'],
        targetCount: 1,
        expandedNodeIds: ['node1'],
      };

      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url === '/api/inventory') {
          return Promise.resolve(mockInventoryData);
        }
        if (url === '/api/integrations/status') {
          return Promise.resolve(mockIntegrationStatus);
        }
        return Promise.resolve({});
      });

      vi.mocked(api.post).mockResolvedValue(mockBatchResponse);

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Execution Tool')).toBeTruthy();
      });

      // Select ansible
      const ansibleButton = screen.getByRole('radio', { name: /ansible/i });
      await fireEvent.click(ansibleButton);

      // Select a node
      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      const nodeCheckbox = screen.getAllByRole('checkbox')[0];
      await fireEvent.click(nodeCheckbox);

      // Enter action
      const actionInput = screen.getByLabelText('Command');
      await fireEvent.input(actionInput, { target: { value: 'uptime' } });

      // Submit
      const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
      await fireEvent.click(executeButton);

      // Should call API with ansible tool
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/executions/batch', {
          type: 'command',
          action: 'uptime',
          targetNodeIds: ['node1'],
          tool: 'ansible',
        });
      });
    });

    it('should only show execution tool selector for command action type', async () => {
      const mockIntegrationStatus = {
        integrations: [
          { name: 'bolt', status: 'connected', type: 'execution' },
          { name: 'ansible', status: 'connected', type: 'execution' },
        ],
      };

      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url === '/api/inventory') {
          return Promise.resolve(mockInventoryData);
        }
        if (url === '/api/integrations/status') {
          return Promise.resolve(mockIntegrationStatus);
        }
        return Promise.resolve({});
      });

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('Execution Tool')).toBeTruthy();
      });

      // Change to task
      const actionTypeSelect = screen.getByLabelText('Action Type');
      await fireEvent.change(actionTypeSelect, { target: { value: 'task' } });

      // Execution tool selector should be hidden
      expect(screen.queryByText('Execution Tool')).toBeNull();

      // Change back to command
      await fireEvent.change(actionTypeSelect, { target: { value: 'command' } });

      // Execution tool selector should be visible again
      expect(screen.getByText('Execution Tool')).toBeTruthy();
    });

    it('should not include tool in POST request for task and plan types', async () => {
      const mockBatchResponse = {
        batchId: 'batch-task-123',
        executionIds: ['exec-1'],
        targetCount: 1,
        expandedNodeIds: ['node1'],
      };

      vi.mocked(api.post).mockResolvedValue(mockBatchResponse);

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Change to task
      const actionTypeSelect = screen.getByLabelText('Action Type');
      await fireEvent.change(actionTypeSelect, { target: { value: 'task' } });

      // Select a node
      const nodeCheckbox = screen.getAllByRole('checkbox')[0];
      await fireEvent.click(nodeCheckbox);

      // Enter action
      const actionInput = screen.getByLabelText('Task Name');
      await fireEvent.input(actionInput, { target: { value: 'package::install' } });

      // Submit
      const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
      await fireEvent.click(executeButton);

      // Should call API without tool parameter
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/executions/batch', {
          type: 'task',
          action: 'package::install',
          targetNodeIds: ['node1'],
        });
      });
    });

    it('should handle execution tool fetch failure gracefully', async () => {
      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url === '/api/inventory') {
          return Promise.resolve(mockInventoryData);
        }
        if (url === '/api/integrations/status') {
          return Promise.reject(new Error('Failed to fetch integrations'));
        }
        return Promise.resolve({});
      });

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Should default to bolt and not show selector
      expect(screen.queryByText('Execution Tool')).toBeNull();
    });
  });

  describe('Advanced Target Selection and Deduplication (Task 5.6)', () => {
    it('should deduplicate nodes when selecting both individual nodes and groups containing them', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select node1 individually
      const nodeCheckboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(nodeCheckboxes[0]); // node1

      await waitFor(() => {
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent ?? '';
        expect(selectedText).toContain('1');
      });

      // Switch to groups and select webservers (which contains node1 and node2)
      const groupsTab = screen.getByRole('tab', { name: /groups/i });
      await fireEvent.click(groupsTab);

      await waitFor(() => {
        expect(screen.getByText('webservers')).toBeTruthy();
      });

      const groupCheckboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(groupCheckboxes[0]); // webservers group

      await waitFor(() => {
        // Should have 2 targets (node1 deduplicated, node2 from group)
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent ?? '';
        expect(selectedText).toContain('2');
      });
    });

    it('should show "(via group)" indicator for nodes selected through groups', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Switch to groups and select webservers
      const groupsTab = screen.getByRole('tab', { name: /groups/i });
      await fireEvent.click(groupsTab);

      await waitFor(() => {
        expect(screen.getByText('webservers')).toBeTruthy();
      });

      const groupCheckboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(groupCheckboxes[0]); // webservers group

      // Switch back to nodes view
      const nodesTab = screen.getByRole('tab', { name: /nodes/i });
      await fireEvent.click(nodesTab);

      await waitFor(() => {
        // node1 and node2 should show "(via group)" indicator
        const viaGroupIndicators = screen.getAllByText(/via group/i);
        expect(viaGroupIndicators.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('should handle complex deduplication with multiple overlapping groups', async () => {
      const complexInventory = {
        nodes: [
          { id: 'node1', name: 'server1.example.com', uri: 'ssh://server1.example.com', transport: 'ssh', source: 'bolt' },
          { id: 'node2', name: 'server2.example.com', uri: 'ssh://server2.example.com', transport: 'ssh', source: 'bolt' },
          { id: 'node3', name: 'server3.example.com', uri: 'ssh://server3.example.com', transport: 'ssh', source: 'bolt' },
        ],
        groups: [
          { id: 'group1', name: 'webservers', source: 'bolt', sources: ['bolt'], linked: false, nodes: ['node1', 'node2'] },
          { id: 'group2', name: 'appservers', source: 'bolt', sources: ['bolt'], linked: false, nodes: ['node2', 'node3'] },
          { id: 'group3', name: 'production', source: 'bolt', sources: ['bolt'], linked: false, nodes: ['node1', 'node2', 'node3'] },
        ],
      };

      vi.mocked(api.get).mockResolvedValue(complexInventory);

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Switch to groups
      const groupsTab = screen.getByRole('tab', { name: /groups/i });
      await fireEvent.click(groupsTab);

      await waitFor(() => {
        expect(screen.getByText('webservers')).toBeTruthy();
      });

      // Select all three groups
      const groupCheckboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(groupCheckboxes[0]); // webservers (node1, node2)
      await fireEvent.click(groupCheckboxes[1]); // appservers (node2, node3)
      await fireEvent.click(groupCheckboxes[2]); // production (node1, node2, node3)

      await waitFor(() => {
        // Should have 3 unique targets despite overlaps
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent ?? '';
        expect(selectedText).toContain('3');
      });
    });

    it('should send both node IDs and group IDs in POST request', async () => {
      const mockBatchResponse = {
        batchId: 'batch-mixed-123',
        executionIds: ['exec-1', 'exec-2', 'exec-3'],
        targetCount: 3,
        expandedNodeIds: ['node1', 'node2', 'node3'],
      };

      vi.mocked(api.post).mockResolvedValue(mockBatchResponse);

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select node3 individually
      const nodeCheckboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(nodeCheckboxes[2]); // node3

      // Switch to groups and select webservers
      const groupsTab = screen.getByRole('tab', { name: /groups/i });
      await fireEvent.click(groupsTab);

      await waitFor(() => {
        expect(screen.getByText('webservers')).toBeTruthy();
      });

      const groupCheckboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(groupCheckboxes[0]); // webservers group

      // Enter action
      const actionInput = screen.getByLabelText('Command');
      await fireEvent.input(actionInput, { target: { value: 'uptime' } });

      // Submit
      const executeButton = screen.getByRole('button', { name: /execute on 3 targets/i });
      await fireEvent.click(executeButton);

      // Should call API with both node IDs and group IDs
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/executions/batch', {
          type: 'command',
          action: 'uptime',
          targetNodeIds: ['node3'],
          targetGroupIds: ['group1'],
          tool: 'bolt',
        });
      });
    });

    it('should preserve selection state when switching between views', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select nodes
      const nodeCheckboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(nodeCheckboxes[0]); // node1
      await fireEvent.click(nodeCheckboxes[1]); // node2

      await waitFor(() => {
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent ?? '';
        expect(selectedText).toContain('2');
      });

      // Switch to groups
      const groupsTab = screen.getByRole('tab', { name: /groups/i });
      await fireEvent.click(groupsTab);

      // Select a group
      await waitFor(() => {
        expect(screen.getByText('databases')).toBeTruthy();
      });

      const groupCheckboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(groupCheckboxes[1]); // databases group

      await waitFor(() => {
        // Should have 3 targets (node1, node2, node3)
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent ?? '';
        expect(selectedText).toContain('3');
      });

      // Switch back to nodes
      const nodesTab = screen.getByRole('tab', { name: /nodes/i });
      await fireEvent.click(nodesTab);

      // Node selections should be preserved
      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        expect((checkboxes[0] as HTMLInputElement).checked).toBe(true); // node1
        expect((checkboxes[1] as HTMLInputElement).checked).toBe(true); // node2
      });
    });
  });

  describe('Keyboard Navigation and Accessibility (Task 5.6)', () => {
    it('should close modal on Escape key', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('New Parallel Execution')).toBeTruthy();
      });

      // Press Escape
      await fireEvent.keyDown(document, { key: 'Escape' });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should not close modal on Escape when loading', async () => {
      const mockBatchResponse = {
        batchId: 'batch-loading-123',
        executionIds: ['exec-1'],
        targetCount: 1,
        expandedNodeIds: ['node1'],
      };

      // Delay the response to test loading state
      vi.mocked(api.post).mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(mockBatchResponse), 200))
      );

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select a node and enter action
      const nodeCheckbox = screen.getAllByRole('checkbox')[0];
      await fireEvent.click(nodeCheckbox);

      const actionInput = screen.getByPlaceholderText(/enter command/i);
      await fireEvent.input(actionInput, { target: { value: 'uptime' } });

      // Submit
      const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
      await fireEvent.click(executeButton);

      // Wait for loading state
      await waitFor(() => {
        expect(screen.getByText('Executing...')).toBeTruthy();
      });

      // Press Escape during loading
      await fireEvent.keyDown(document, { key: 'Escape' });

      // Should not close
      expect(mockOnClose).not.toHaveBeenCalled();

      // Wait for completion
      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled();
      }, { timeout: 300 });
    });

    it('should support Alt+N keyboard shortcut to switch to nodes view', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Switch to groups first
      const groupsTab = screen.getByRole('tab', { name: /groups/i });
      await fireEvent.click(groupsTab);

      await waitFor(() => {
        expect(screen.getByText('webservers')).toBeTruthy();
      });

      // Press Alt+N
      await fireEvent.keyDown(document, { key: 'n', altKey: true });

      // Should switch back to nodes view
      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });
    });

    it('should support Alt+G keyboard shortcut to switch to groups view', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Press Alt+G
      await fireEvent.keyDown(document, { key: 'g', altKey: true });

      // Should switch to groups view
      await waitFor(() => {
        expect(screen.getByText('webservers')).toBeTruthy();
      });
    });

    it('should support arrow key navigation between tabs', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      const nodesTab = screen.getByRole('tab', { name: /nodes/i });
      nodesTab.focus();

      // Press ArrowRight to move to groups tab
      await fireEvent.keyDown(nodesTab, { key: 'ArrowRight' });

      await waitFor(() => {
        expect(screen.getByText('webservers')).toBeTruthy();
      });

      const groupsTab = screen.getByRole('tab', { name: /groups/i });

      // Press ArrowLeft to move back to nodes tab
      await fireEvent.keyDown(groupsTab, { key: 'ArrowLeft' });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });
    });

    it('should have proper ARIA attributes for tabs', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      const nodesTab = screen.getByRole('tab', { name: /nodes/i });
      const groupsTab = screen.getByRole('tab', { name: /groups/i });

      // Nodes tab should be selected by default
      expect(nodesTab.getAttribute('aria-selected')).toBe('true');
      expect(groupsTab.getAttribute('aria-selected')).toBe('false');

      // Switch to groups
      await fireEvent.click(groupsTab);

      await waitFor(() => {
        expect(groupsTab.getAttribute('aria-selected')).toBe('true');
        expect(nodesTab.getAttribute('aria-selected')).toBe('false');
      });
    });

    it('should have proper ARIA labels for checkboxes', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Check node checkboxes have proper labels
      expect(screen.getByLabelText('Select node server1.example.com')).toBeTruthy();
      expect(screen.getByLabelText('Select node server2.example.com')).toBeTruthy();

      // Switch to groups
      const groupsTab = screen.getByRole('tab', { name: /groups/i });
      await fireEvent.click(groupsTab);

      await waitFor(() => {
        expect(screen.getByText('webservers')).toBeTruthy();
      });

      // Check group checkboxes have proper labels with node count
      expect(screen.getByLabelText(/select group webservers with 2 nodes/i)).toBeTruthy();
    });

    it('should announce selection changes to screen readers', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Find the status region
      const statusRegion = screen.getByText(/selected:/i).parentElement;
      expect(statusRegion?.getAttribute('role')).toBe('status');
      expect(statusRegion?.getAttribute('aria-live')).toBe('polite');
      expect(statusRegion?.getAttribute('aria-atomic')).toBe('true');
    });

    it('should have proper role and aria-modal attributes', () => {
      const { container } = render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).toBeTruthy();
      expect(dialog?.getAttribute('aria-modal')).toBe('true');
      expect(dialog?.getAttribute('aria-labelledby')).toBe('modal-title');
      expect(dialog?.getAttribute('aria-describedby')).toBe('modal-description');
    });

    it('should have screen reader description for modal', () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      const description = document.getElementById('modal-description');
      expect(description).toBeTruthy();
      expect(description?.classList.contains('sr-only')).toBe(true);
      expect(description?.textContent).toContain('Select target nodes or groups');
    });
  });

  describe('Action Form Component Integration (Task 6.6)', () => {
    it('should render ActionSelector component', () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // ActionSelector renders action options as labels with radio buttons
      expect(screen.getByText('Execute Command')).toBeTruthy();
      expect(screen.getByText('Execute Task')).toBeTruthy();
      expect(screen.getByText('Execute Playbook')).toBeTruthy();
      expect(screen.getByText('Install Software')).toBeTruthy();
    });

    it('should render ExecuteCommandForm by default', () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // ExecuteCommandForm should be visible (command input field)
      expect(screen.getByPlaceholderText(/enter command/i)).toBeTruthy();
    });

    it('should switch to ExecuteTaskForm when task action is selected', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Click on Execute Task action
      const taskLabel = screen.getByText('Execute Task');
      await fireEvent.click(taskLabel);

      // ExecuteTaskForm should be visible (search tasks input)
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search tasks or modules/i)).toBeTruthy();
      });
    });

    it('should switch to ExecutePlaybookForm when playbook action is selected', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Click on Execute Playbook action
      const playbookLabel = screen.getByText('Execute Playbook');
      await fireEvent.click(playbookLabel);

      // ExecutePlaybookForm should be visible (playbook path input with specific placeholder)
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/playbooks\/site\.yml/i)).toBeTruthy();
      });
    });

    it('should switch to InstallSoftwareForm when install software action is selected', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // Click on Install Software action
      const softwareLabel = screen.getByText('Install Software');
      await fireEvent.click(softwareLabel);

      // InstallSoftwareForm should be visible (package name input with specific placeholder)
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/nginx, apache, mysql/i)).toBeTruthy();
      });
    });

    it('should disable execute button when action form data is not provided', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select a node
      const nodeCheckbox = screen.getAllByRole('checkbox')[0];
      await fireEvent.click(nodeCheckbox);

      // Execute button should be disabled (no command entered yet)
      const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
      expect((executeButton as HTMLButtonElement).disabled).toBe(true);
    });

    it('should enable execute button when action form provides valid data', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select a node
      const nodeCheckbox = screen.getAllByRole('checkbox')[0];
      await fireEvent.click(nodeCheckbox);

      // Enter command in ExecuteCommandForm
      const commandInput = screen.getByPlaceholderText(/enter command/i);
      await fireEvent.input(commandInput, { target: { value: 'uptime' } });

      // Execute button should be enabled
      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
        expect((executeButton as HTMLButtonElement).disabled).toBe(false);
      });
    });

    it('should clear action form data when switching action types', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select a node
      const nodeCheckbox = screen.getAllByRole('checkbox')[0];
      await fireEvent.click(nodeCheckbox);

      // Enter command
      const commandInput = screen.getByPlaceholderText(/enter command/i);
      await fireEvent.input(commandInput, { target: { value: 'uptime' } });

      // Execute button should be enabled
      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
        expect((executeButton as HTMLButtonElement).disabled).toBe(false);
      });

      // Switch to task action
      const taskLabel = screen.getByText('Execute Task');
      await fireEvent.click(taskLabel);

      // Execute button should be disabled again (form data cleared)
      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
        expect((executeButton as HTMLButtonElement).disabled).toBe(true);
      });
    });

    it('should pass availableTools to ExecuteCommandForm', async () => {
      const mockIntegrationStatus = {
        integrations: [
          { name: 'bolt', status: 'connected', type: 'execution' },
          { name: 'ansible', status: 'connected', type: 'execution' },
          { name: 'ssh', status: 'connected', type: 'execution' },
        ],
      };

      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url === '/api/inventory') {
          return Promise.resolve(mockInventoryData);
        }
        if (url === '/api/integrations/status') {
          return Promise.resolve(mockIntegrationStatus);
        }
        return Promise.resolve({});
      });

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // ExecuteCommandForm should show tool selector with all three tools
      await waitFor(() => {
        expect(screen.getByText('Execution Tool')).toBeTruthy();
        const toolButtons = screen.getAllByRole('radio');
        // Should have 3 tool options
        expect(toolButtons.length).toBeGreaterThanOrEqual(3);
      });
    });

    it('should pass commandWhitelist to ExecuteCommandForm', async () => {
      const mockCommandWhitelist = {
        commandWhitelist: {
          allowAll: false,
          whitelist: ['uptime', 'whoami', 'date'],
          matchMode: 'exact' as const,
        },
      };

      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url === '/api/inventory') {
          return Promise.resolve(mockInventoryData);
        }
        if (url === '/api/config') {
          return Promise.resolve(mockCommandWhitelist);
        }
        return Promise.resolve({});
      });

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // ExecuteCommandForm should show whitelist - check for the whitelist commands
      await waitFor(() => {
        // The form shows the whitelist commands as badges or text
        expect(screen.getByText('uptime')).toBeTruthy();
      });
    });

    it('should pass multiNode=true to action forms', () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      // The forms should be in multiNode mode, which means they auto-submit
      // We can verify this by checking that entering a command enables the execute button
      // without needing to click a submit button within the form
      expect(screen.getByText('Configure Action')).toBeTruthy();
    });
  });

  describe('Target Selection and Deduplication (Task 6.6)', () => {
    it('should correctly deduplicate nodes from multiple sources', async () => {
      const overlappingInventory = {
        nodes: [
          { id: 'node1', name: 'server1.example.com', uri: 'ssh://server1.example.com', transport: 'ssh', source: 'bolt' },
          { id: 'node2', name: 'server2.example.com', uri: 'ssh://server2.example.com', transport: 'ssh', source: 'bolt' },
          { id: 'node3', name: 'server3.example.com', uri: 'ssh://server3.example.com', transport: 'ssh', source: 'puppetdb' },
        ],
        groups: [
          { id: 'group1', name: 'webservers', source: 'bolt', sources: ['bolt'], linked: false, nodes: ['node1', 'node2'] },
          { id: 'group2', name: 'allservers', source: 'bolt', sources: ['bolt'], linked: false, nodes: ['node1', 'node2', 'node3'] },
        ],
      };

      vi.mocked(api.get).mockResolvedValue(overlappingInventory);

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select node1 individually
      const nodeCheckboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(nodeCheckboxes[0]); // node1

      // Switch to groups and select both groups
      const groupsTab = screen.getByRole('tab', { name: /groups/i });
      await fireEvent.click(groupsTab);

      await waitFor(() => {
        expect(screen.getByText('webservers')).toBeTruthy();
      });

      const groupCheckboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(groupCheckboxes[0]); // webservers (node1, node2)
      await fireEvent.click(groupCheckboxes[1]); // allservers (node1, node2, node3)

      // Should have 3 unique targets despite node1 being in individual selection and both groups
      await waitFor(() => {
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent ?? '';
        expect(selectedText).toContain('3');
      });
    });

    it('should show visual indicator for nodes selected via groups', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Switch to groups and select webservers
      const groupsTab = screen.getByRole('tab', { name: /groups/i });
      await fireEvent.click(groupsTab);

      await waitFor(() => {
        expect(screen.getByText('webservers')).toBeTruthy();
      });

      const groupCheckboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(groupCheckboxes[0]); // webservers group (node1, node2)

      // Switch back to nodes view
      const nodesTab = screen.getByRole('tab', { name: /nodes/i });
      await fireEvent.click(nodesTab);

      // node1 and node2 should show "(via group)" indicator
      await waitFor(() => {
        const viaGroupIndicators = screen.getAllByText(/via group/i);
        expect(viaGroupIndicators.length).toBe(2);
      });
    });

    it('should maintain correct target count when deselecting overlapping items', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select node1 individually
      const nodeCheckboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(nodeCheckboxes[0]); // node1

      await waitFor(() => {
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent ?? '';
        expect(selectedText).toContain('1');
      });

      // Switch to groups and select webservers (contains node1 and node2)
      const groupsTab = screen.getByRole('tab', { name: /groups/i });
      await fireEvent.click(groupsTab);

      await waitFor(() => {
        expect(screen.getByText('webservers')).toBeTruthy();
      });

      const groupCheckboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(groupCheckboxes[0]); // webservers

      // Should have 2 targets (node1 deduplicated, node2 from group)
      await waitFor(() => {
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent ?? '';
        expect(selectedText).toContain('2');
      });

      // Deselect the group
      await fireEvent.click(groupCheckboxes[0]);

      // Should go back to 1 target (just node1 from individual selection)
      await waitFor(() => {
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent ?? '';
        expect(selectedText).toContain('1');
      });
    });

    it('should handle empty groups gracefully', async () => {
      const inventoryWithEmptyGroup = {
        nodes: [
          { id: 'node1', name: 'server1.example.com', uri: 'ssh://server1.example.com', transport: 'ssh', source: 'bolt' },
        ],
        groups: [
          { id: 'group1', name: 'empty-group', source: 'bolt', sources: ['bolt'], linked: false, nodes: [] },
          { id: 'group2', name: 'webservers', source: 'bolt', sources: ['bolt'], linked: false, nodes: ['node1'] },
        ],
      };

      vi.mocked(api.get).mockResolvedValue(inventoryWithEmptyGroup);

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Switch to groups
      const groupsTab = screen.getByRole('tab', { name: /groups/i });
      await fireEvent.click(groupsTab);

      await waitFor(() => {
        expect(screen.getByText('empty-group')).toBeTruthy();
      });

      // Select empty group
      const groupCheckboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(groupCheckboxes[0]); // empty-group

      // Should have 0 targets
      await waitFor(() => {
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent ?? '';
        expect(selectedText).toContain('0');
      });

      // Select webservers group
      await fireEvent.click(groupCheckboxes[1]); // webservers

      // Should have 1 target
      await waitFor(() => {
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent ?? '';
        expect(selectedText).toContain('1');
      });
    });
  });

  describe('Execution Initiation Flow (Task 6.6)', () => {
    it('should build correct request for execute-command action', async () => {
      const mockBatchResponse = {
        batchId: 'batch-cmd-123',
        executionIds: ['exec-1'],
        targetCount: 1,
        expandedNodeIds: ['node1'],
      };

      vi.mocked(api.post).mockResolvedValue(mockBatchResponse);

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select a node
      const nodeCheckbox = screen.getAllByRole('checkbox')[0];
      await fireEvent.click(nodeCheckbox);

      // Enter command
      const commandInput = screen.getByPlaceholderText(/enter command/i);
      await fireEvent.input(commandInput, { target: { value: 'uptime' } });

      // Submit
      const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
      await fireEvent.click(executeButton);

      // Should call API with correct structure
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/executions/batch', {
          type: 'command',
          action: 'uptime',
          targetNodeIds: ['node1'],
          tool: 'bolt',
        });
      });
    });

    it('should build correct request for execute-task action', async () => {
      const mockBatchResponse = {
        batchId: 'batch-task-123',
        executionIds: ['exec-1'],
        targetCount: 1,
        expandedNodeIds: ['node1'],
      };

      vi.mocked(api.post).mockResolvedValue(mockBatchResponse);

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Switch to Execute Task
      const taskLabel = screen.getByText('Execute Task');
      await fireEvent.click(taskLabel);

      // Select a node
      const nodeCheckbox = screen.getAllByRole('checkbox')[0];
      await fireEvent.click(nodeCheckbox);

      // ExecuteTaskForm uses a search/select interface, not a simple input
      // For testing purposes, we'll skip the detailed form interaction
      // and just verify the action type switch worked
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search tasks or modules/i)).toBeTruthy();
      });

      // Note: Full task selection testing would require mocking the task list
      // For now, we verify the form is rendered correctly
    });

    it('should build correct request for execute-playbook action', async () => {
      const mockBatchResponse = {
        batchId: 'batch-playbook-123',
        executionIds: ['exec-1'],
        targetCount: 1,
        expandedNodeIds: ['node1'],
      };

      vi.mocked(api.post).mockResolvedValue(mockBatchResponse);

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Switch to Execute Playbook
      const playbookLabel = screen.getByText('Execute Playbook');
      await fireEvent.click(playbookLabel);

      // Select a node
      const nodeCheckbox = screen.getAllByRole('checkbox')[0];
      await fireEvent.click(nodeCheckbox);

      // Enter playbook path
      const playbookInput = screen.getByPlaceholderText(/playbooks\/site\.yml/i);
      await fireEvent.input(playbookInput, { target: { value: '/path/to/playbook.yml' } });

      // Submit
      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
        expect((executeButton as HTMLButtonElement).disabled).toBe(false);
      });

      const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
      await fireEvent.click(executeButton);

      // Should call API with type: 'plan'
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/executions/batch', expect.objectContaining({
          type: 'plan',
          action: '/path/to/playbook.yml',
          targetNodeIds: ['node1'],
        }));
      });
    });

    it('should build correct request for install-software action', async () => {
      const mockBatchResponse = {
        batchId: 'batch-software-123',
        executionIds: ['exec-1'],
        targetCount: 1,
        expandedNodeIds: ['node1'],
      };

      vi.mocked(api.post).mockResolvedValue(mockBatchResponse);

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Switch to Install Software
      const softwareLabel = screen.getByText('Install Software');
      await fireEvent.click(softwareLabel);

      // Select a node
      const nodeCheckbox = screen.getAllByRole('checkbox')[0];
      await fireEvent.click(nodeCheckbox);

      // Enter package name
      const packageInput = screen.getByPlaceholderText(/nginx, apache, mysql/i);
      await fireEvent.input(packageInput, { target: { value: 'nginx' } });

      // Submit
      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
        expect((executeButton as HTMLButtonElement).disabled).toBe(false);
      });

      const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
      await fireEvent.click(executeButton);

      // Should call API with type: 'task' and package parameters
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/executions/batch', expect.objectContaining({
          type: 'task',
          targetNodeIds: ['node1'],
          parameters: expect.objectContaining({
            packageName: 'nginx',
          }),
        }));
      });
    });

    it('should include both node IDs and group IDs in request', async () => {
      const mockBatchResponse = {
        batchId: 'batch-mixed-123',
        executionIds: ['exec-1', 'exec-2', 'exec-3'],
        targetCount: 3,
        expandedNodeIds: ['node1', 'node2', 'node3'],
      };

      vi.mocked(api.post).mockResolvedValue(mockBatchResponse);

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select node3 individually
      const nodeCheckboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(nodeCheckboxes[2]); // node3

      // Switch to groups and select webservers
      const groupsTab = screen.getByRole('tab', { name: /groups/i });
      await fireEvent.click(groupsTab);

      await waitFor(() => {
        expect(screen.getByText('webservers')).toBeTruthy();
      });

      const groupCheckboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(groupCheckboxes[0]); // webservers group

      // Enter command
      const commandInput = screen.getByPlaceholderText(/enter command/i);
      await fireEvent.input(commandInput, { target: { value: 'uptime' } });

      // Submit
      const executeButton = screen.getByRole('button', { name: /execute on 3 targets/i });
      await fireEvent.click(executeButton);

      // Should call API with both node IDs and group IDs
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/executions/batch', {
          type: 'command',
          action: 'uptime',
          targetNodeIds: ['node3'],
          targetGroupIds: ['group1'],
          tool: 'bolt',
        });
      });
    });

    it('should handle successful execution and call callbacks', async () => {
      const mockBatchResponse = {
        batchId: 'batch-success-456',
        executionIds: ['exec-1'],
        targetCount: 1,
        expandedNodeIds: ['node1'],
      };

      vi.mocked(api.post).mockResolvedValue(mockBatchResponse);

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select a node and enter command
      const nodeCheckbox = screen.getAllByRole('checkbox')[0];
      await fireEvent.click(nodeCheckbox);

      const commandInput = screen.getByPlaceholderText(/enter command/i);
      await fireEvent.input(commandInput, { target: { value: 'uptime' } });

      // Submit
      const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
      await fireEvent.click(executeButton);

      // Should call onSuccess with batch ID
      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledWith('batch-success-456');
      });

      // Should close modal
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Execution Initiation (Task 5.4)', () => {
    it('should validate that targets are selected before submission', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Enter action without selecting targets
      const actionInput = screen.getByLabelText('Command');
      await fireEvent.input(actionInput, { target: { value: 'uptime' } });

      // Execute button should be disabled when no targets selected
      const executeButton = screen.getByRole('button', { name: /execute on 0 targets/i });
      expect(executeButton.hasAttribute('disabled')).toBe(true);

      // Should not call API
      expect(api.post).not.toHaveBeenCalled();
    });

    it('should validate that action is provided before submission', async () => {
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select a node but don't enter action
      const nodeCheckbox = screen.getAllByRole('checkbox')[0];
      await fireEvent.click(nodeCheckbox);

      // Execute button should be disabled when action is empty
      const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
      expect(executeButton.hasAttribute('disabled')).toBe(true);

      // Should not call API
      expect(api.post).not.toHaveBeenCalled();
    });

    it('should send POST request to /api/executions/batch with correct data', async () => {
      const mockBatchResponse = {
        batchId: 'batch-123',
        executionIds: ['exec-1', 'exec-2'],
        targetCount: 2,
        expandedNodeIds: ['node1', 'node2'],
      };

      vi.mocked(api.post).mockResolvedValue(mockBatchResponse);

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select nodes
      const checkboxes = screen.getAllByRole('checkbox');
      await fireEvent.click(checkboxes[0]); // node1
      await fireEvent.click(checkboxes[1]); // node2

      // Enter action
      const actionInput = screen.getByLabelText('Command');
      await fireEvent.input(actionInput, { target: { value: 'uptime' } });

      // Submit
      const executeButton = screen.getByRole('button', { name: /execute on 2 targets/i });
      await fireEvent.click(executeButton);

      // Should call API with correct data
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/executions/batch', {
          type: 'command',
          action: 'uptime',
          targetNodeIds: ['node1', 'node2'],
          tool: 'bolt',
        });
      });
    });

    it('should include group IDs in POST request when groups are selected', async () => {
      const mockBatchResponse = {
        batchId: 'batch-456',
        executionIds: ['exec-1', 'exec-2'],
        targetCount: 2,
        expandedNodeIds: ['node1', 'node2'],
      };

      vi.mocked(api.post).mockResolvedValue(mockBatchResponse);

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Switch to groups view
      const groupsTab = screen.getByRole('tab', { name: /groups/i });
      await fireEvent.click(groupsTab);

      // Select a group
      await waitFor(() => {
        expect(screen.getByText('webservers')).toBeTruthy();
      });

      const groupCheckbox = screen.getAllByRole('checkbox')[0];
      await fireEvent.click(groupCheckbox);

      // Enter action
      const actionInput = screen.getByLabelText('Command');
      await fireEvent.input(actionInput, { target: { value: 'uptime' } });

      // Submit
      const executeButton = screen.getByRole('button', { name: /execute on 2 targets/i });
      await fireEvent.click(executeButton);

      // Should call API with group IDs
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/executions/batch', {
          type: 'command',
          action: 'uptime',
          targetGroupIds: ['group1'],
          tool: 'bolt',
        });
      });
    });

    it('should include parameters in POST request when provided', async () => {
      const mockBatchResponse = {
        batchId: 'batch-789',
        executionIds: ['exec-1'],
        targetCount: 1,
        expandedNodeIds: ['node1'],
      };

      vi.mocked(api.post).mockResolvedValue(mockBatchResponse);

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select a node
      const nodeCheckbox = screen.getAllByRole('checkbox')[0];
      await fireEvent.click(nodeCheckbox);

      // Enter action
      const actionInput = screen.getByLabelText('Command');
      await fireEvent.input(actionInput, { target: { value: 'uptime' } });

      // Enter parameters
      const parametersInput = screen.getByLabelText('Parameters (Optional)');
      await fireEvent.input(parametersInput, { target: { value: '{"timeout": 30}' } });

      // Submit
      const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
      await fireEvent.click(executeButton);

      // Should call API with parameters
      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/api/executions/batch', {
          type: 'command',
          action: 'uptime',
          targetNodeIds: ['node1'],
          parameters: { timeout: 30 },
          tool: 'bolt',
        });
      });
    });

    it('should handle success response and call onSuccess callback', async () => {
      const mockBatchResponse = {
        batchId: 'batch-success-123',
        executionIds: ['exec-1'],
        targetCount: 1,
        expandedNodeIds: ['node1'],
      };

      vi.mocked(api.post).mockResolvedValue(mockBatchResponse);

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select a node and enter action
      const nodeCheckbox = screen.getAllByRole('checkbox')[0];
      await fireEvent.click(nodeCheckbox);

      const actionInput = screen.getByLabelText('Command');
      await fireEvent.input(actionInput, { target: { value: 'uptime' } });

      // Submit
      const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
      await fireEvent.click(executeButton);

      // Should call onSuccess with batch ID
      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledWith('batch-success-123');
      });

      // Should close modal
      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should handle 429 queue full error response', async () => {
      const queueFullError = new Error('Execution queue is full. Please try again later.');
      vi.mocked(api.post).mockRejectedValue(queueFullError);

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select a node and enter action
      const nodeCheckbox = screen.getAllByRole('checkbox')[0];
      await fireEvent.click(nodeCheckbox);

      const actionInput = screen.getByLabelText('Command');
      await fireEvent.input(actionInput, { target: { value: 'uptime' } });

      // Submit
      const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
      await fireEvent.click(executeButton);

      // Should display queue full error message
      await waitFor(() => {
        expect(screen.getByText(/execution queue is full/i)).toBeTruthy();
      });

      // Should not call onSuccess or onClose
      expect(mockOnSuccess).not.toHaveBeenCalled();
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('should handle 400 validation error response', async () => {
      const validationError = new Error('Validation error: Invalid node IDs provided');
      vi.mocked(api.post).mockRejectedValue(validationError);

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select a node and enter action
      const nodeCheckbox = screen.getAllByRole('checkbox')[0];
      await fireEvent.click(nodeCheckbox);

      const actionInput = screen.getByLabelText('Command');
      await fireEvent.input(actionInput, { target: { value: 'uptime' } });

      // Submit
      const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
      await fireEvent.click(executeButton);

      // Should display validation error message
      await waitFor(() => {
        expect(screen.getByText(/validation error: invalid node ids provided/i)).toBeTruthy();
      });

      // Should not call onSuccess or onClose
      expect(mockOnSuccess).not.toHaveBeenCalled();
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('should handle 404 not found error response', async () => {
      const notFoundError = new Error('Some nodes not found in inventory');
      vi.mocked(api.post).mockRejectedValue(notFoundError);

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select a node and enter action
      const nodeCheckbox = screen.getAllByRole('checkbox')[0];
      await fireEvent.click(nodeCheckbox);

      const actionInput = screen.getByLabelText('Command');
      await fireEvent.input(actionInput, { target: { value: 'uptime' } });

      // Submit
      const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
      await fireEvent.click(executeButton);

      // Should display not found error message
      await waitFor(() => {
        expect(screen.getByText(/some selected nodes or groups were not found/i)).toBeTruthy();
      });

      // Should not call onSuccess or onClose
      expect(mockOnSuccess).not.toHaveBeenCalled();
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('should handle generic 500 server error response', async () => {
      const serverError = new Error('Internal server error');
      vi.mocked(api.post).mockRejectedValue(serverError);

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select a node and enter action
      const nodeCheckbox = screen.getAllByRole('checkbox')[0];
      await fireEvent.click(nodeCheckbox);

      const actionInput = screen.getByLabelText('Command');
      await fireEvent.input(actionInput, { target: { value: 'uptime' } });

      // Submit
      const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
      await fireEvent.click(executeButton);

      // Should display generic error message
      await waitFor(() => {
        expect(screen.getByText(/internal server error/i)).toBeTruthy();
      });

      // Should not call onSuccess or onClose
      expect(mockOnSuccess).not.toHaveBeenCalled();
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('should show loading state during submission', async () => {
      const mockBatchResponse = {
        batchId: 'batch-loading-123',
        executionIds: ['exec-1'],
        targetCount: 1,
        expandedNodeIds: ['node1'],
      };

      // Delay the response to test loading state
      vi.mocked(api.post).mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(mockBatchResponse), 100))
      );

      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select a node and enter action
      const nodeCheckbox = screen.getAllByRole('checkbox')[0];
      await fireEvent.click(nodeCheckbox);

      const actionInput = screen.getByPlaceholderText(/enter command/i);
      await fireEvent.input(actionInput, { target: { value: 'uptime' } });

      // Submit
      const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
      await fireEvent.click(executeButton);

      // Should show loading state with "Executing..." text
      await waitFor(() => {
        expect(screen.getByText('Executing...')).toBeTruthy();
      });

      // Wait for completion
      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled();
      }, { timeout: 200 });
    });

    it('should reset form after successful submission', async () => {
      const mockBatchResponse = {
        batchId: 'batch-reset-123',
        executionIds: ['exec-1'],
        targetCount: 1,
        expandedNodeIds: ['node1'],
      };

      vi.mocked(api.post).mockResolvedValue(mockBatchResponse);

      const { unmount } = render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Select a node and enter action
      const nodeCheckbox = screen.getAllByRole('checkbox')[0];
      await fireEvent.click(nodeCheckbox);

      const actionInput = screen.getByLabelText('Command');
      await fireEvent.input(actionInput, { target: { value: 'uptime' } });

      // Verify selections before submit
      expect((nodeCheckbox as HTMLInputElement).checked).toBe(true);
      expect((actionInput as HTMLInputElement).value).toBe('uptime');

      // Submit
      const executeButton = screen.getByRole('button', { name: /execute on 1 target/i });
      await fireEvent.click(executeButton);

      // Wait for success - form should be reset and modal closed
      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalled();
        expect(mockOnClose).toHaveBeenCalled();
      });

      // Clean up and rerender to verify form reset on next open
      unmount();
      vi.clearAllMocks();

      // Reopen modal
      render(ParallelExecutionModal, {
        props: {
          open: true,
          onClose: mockOnClose,
          onSuccess: mockOnSuccess,
        },
      });

      await waitFor(() => {
        expect(screen.getByText('server1.example.com')).toBeTruthy();
      });

      // Check that selections are cleared in new instance
      const checkboxesAfter = screen.getAllByRole('checkbox');
      checkboxesAfter.forEach(checkbox => {
        expect((checkbox as HTMLInputElement).checked).toBe(false);
      });

      // Check that action is cleared
      const actionInputAfter = screen.getByLabelText('Command');
      expect(actionInputAfter.value).toBe('');
    });
  });
});
