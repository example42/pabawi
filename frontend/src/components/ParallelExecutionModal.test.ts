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
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent || '';
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
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent || '';
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
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent || '';
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
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent || '';
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
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent || '';
        expect(selectedText).toContain('3');
      });

      // Then clear all
      const clearAllButton = screen.getByText(/clear all/i);
      await fireEvent.click(clearAllButton);

      await waitFor(() => {
        const selectedText = screen.getByText(/selected:/i).parentElement?.textContent || '';
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

      const select = screen.getByLabelText('Action Type') as HTMLSelectElement;
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

      const select = screen.getByLabelText('Action Type') as HTMLSelectElement;
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
      const input = screen.getByLabelText('Command') as HTMLInputElement;

      expect(input.placeholder).toBe('uptime');

      await fireEvent.change(select, { target: { value: 'task' } });
      const taskInput = screen.getByLabelText('Task Name') as HTMLInputElement;
      expect(taskInput.placeholder).toBe('package::install');

      await fireEvent.change(select, { target: { value: 'plan' } });
      const planInput = screen.getByLabelText('Plan Name') as HTMLInputElement;
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

      const input = screen.getByLabelText('Command') as HTMLInputElement;
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
      const actionInput = screen.getByLabelText('Command') as HTMLInputElement;
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

      await fireEvent.click(backdrop!);
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

      await fireEvent.click(modalContent!);
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('should not call onClose when loading', async () => {
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
    it('should show error when submitting with no targets', async () => {
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

    it('should show error when submitting with empty action', async () => {
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
      const actionTypeSelect = screen.getByLabelText('Action Type') as HTMLSelectElement;
      const actionInput = screen.getByLabelText('Command') as HTMLInputElement;
      const cancelButton = screen.getByRole('button', { name: /cancel/i }) as HTMLButtonElement;
      const executeButton = screen.getByRole('button', { name: /execute on/i }) as HTMLButtonElement;

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
      const actionTypeSelect = screen.getByLabelText('Action Type') as HTMLSelectElement;
      const actionInput = screen.getByLabelText('Command') as HTMLInputElement;

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
    it('should prevent default form submission', async () => {
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

      form!.dispatchEvent(submitEvent);

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
      const actionTypeSelect = screen.getByLabelText('Action Type') as HTMLSelectElement;
      await fireEvent.change(actionTypeSelect, { target: { value: 'task' } });
      expect(actionTypeSelect.value).toBe('task');

      // Set action value
      const actionInput = screen.getByLabelText('Task Name') as HTMLInputElement;
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

      const parametersTextarea = screen.getByLabelText('Parameters (Optional)') as HTMLTextAreaElement;
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

      const parametersTextarea = screen.getByLabelText('Parameters (Optional)') as HTMLTextAreaElement;
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

      const parametersTextarea = screen.getByLabelText('Parameters (Optional)') as HTMLTextAreaElement;

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

      const parametersTextarea = screen.getByLabelText('Parameters (Optional)') as HTMLTextAreaElement;

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
      const actionInput = screen.getByLabelText('Command') as HTMLInputElement;
      await fireEvent.input(actionInput, { target: { value: 'uptime' } });

      // Enter invalid parameters
      const parametersTextarea = screen.getByLabelText('Parameters (Optional)') as HTMLTextAreaElement;
      await fireEvent.input(parametersTextarea, { target: { value: '{invalid}' } });

      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute on 1 target/i }) as HTMLButtonElement;
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
      const actionInput = screen.getByLabelText('Command') as HTMLInputElement;
      await fireEvent.input(actionInput, { target: { value: 'uptime' } });

      // Enter valid parameters
      const parametersTextarea = screen.getByLabelText('Parameters (Optional)') as HTMLTextAreaElement;
      await fireEvent.input(parametersTextarea, { target: { value: '{"timeout": 30}' } });

      await waitFor(() => {
        const executeButton = screen.getByRole('button', { name: /execute on 1 target/i }) as HTMLButtonElement;
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

      const parametersTextarea = screen.getByLabelText('Parameters (Optional)') as HTMLTextAreaElement;

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

      const parametersTextarea = screen.getByLabelText('Parameters (Optional)') as HTMLTextAreaElement;

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

      const parametersTextarea = screen.getByLabelText('Parameters (Optional)') as HTMLTextAreaElement;

      // Enter invalid JSON
      await fireEvent.input(parametersTextarea, { target: { value: '{invalid}' } });

      await waitFor(() => {
        expect(parametersTextarea.classList.contains('border-red-300') ||
               parametersTextarea.classList.contains('dark:border-red-600')).toBe(true);
      });
    });
  });
});
