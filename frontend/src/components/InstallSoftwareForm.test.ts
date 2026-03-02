import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import InstallSoftwareForm from './InstallSoftwareForm.svelte';
import * as api from '../lib/api';

// Mock the API module
vi.mock('../lib/api', () => ({
  get: vi.fn(),
  post: vi.fn(),
  getErrorGuidance: vi.fn(() => ({ guidance: undefined }))
}));

// Mock toast notifications
vi.mock('../lib/toast.svelte', () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
  showInfo: vi.fn()
}));

describe('InstallSoftwareForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render package name input field', () => {
      render(InstallSoftwareForm);

      const input = screen.getByLabelText(/Package Name/i);
      expect(input).toBeTruthy();
      expect(input.placeholder).toContain('nginx');
    });

    it('should render install button', () => {
      render(InstallSoftwareForm);

      const button = screen.getByRole('button', { name: /Install Package/i });
      expect(button).toBeTruthy();
    });

    it('should render version input field', () => {
      render(InstallSoftwareForm);

      const input = screen.getByLabelText(/Version \(optional\)/i);
      expect(input).toBeTruthy();
    });

    it('should render ensure selector', () => {
      render(InstallSoftwareForm);

      const select = screen.getByLabelText(/Ensure/i);
      expect(select).toBeTruthy();
    });
  });

  describe('Tool Selection', () => {
    it('should render tool selector when multiple tools available', () => {
      render(InstallSoftwareForm, {
        props: {
          availableTools: ['bolt', 'ansible', 'ssh']
        }
      });

      expect(screen.getByText('Execution Tool')).toBeTruthy();
      expect(screen.getByRole('button', { name: /bolt/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /ansible/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /ssh/i })).toBeTruthy();
    });

    it('should not render tool selector when only one tool available', () => {
      render(InstallSoftwareForm, {
        props: {
          availableTools: ['bolt']
        }
      });

      expect(screen.queryByText('Execution Tool')).toBeFalsy();
    });

    it('should allow selecting different tools', async () => {
      const onSubmit = vi.fn();

      // Mock package tasks API
      vi.mocked(api.get).mockResolvedValue({
        tasks: [
          {
            name: 'package::install',
            label: 'Install Package',
            parameterMapping: {
              packageName: 'package',
              ensure: 'ensure'
            }
          }
        ]
      });

      render(InstallSoftwareForm, {
        props: {
          availableTools: ['bolt', 'ansible', 'ssh'],
          onSubmit
        }
      });

      // Wait for tasks to load
      await waitFor(() => {
        expect(screen.queryByText('Loading tasks...')).toBeFalsy();
      });

      // Select ansible
      const ansibleButton = screen.getByRole('button', { name: /ansible/i });
      await fireEvent.click(ansibleButton);

      // Fill package name and submit
      const input = screen.getByLabelText(/Package Name/i);
      await fireEvent.input(input, { target: { value: 'nginx' } });

      const submitButton = screen.getByRole('button', { name: /Install Package/i });
      await fireEvent.click(submitButton);

      expect(onSubmit).toHaveBeenCalledWith({
        packageName: 'nginx',
        tool: 'ansible',
        taskName: undefined,
        version: undefined,
        ensure: 'present',
        settings: undefined
      });
    });
  });

  describe('Package Task Selection (Bolt)', () => {
    it('should fetch and display package tasks for bolt', async () => {
      vi.mocked(api.get).mockResolvedValue({
        tasks: [
          {
            name: 'package::install',
            label: 'Install Package',
            parameterMapping: {
              packageName: 'package',
              ensure: 'ensure'
            }
          },
          {
            name: 'apt::install',
            label: 'APT Install',
            parameterMapping: {
              packageName: 'name',
              ensure: 'state'
            }
          }
        ]
      });

      render(InstallSoftwareForm, {
        props: {
          availableTools: ['bolt']
        }
      });

      await waitFor(() => {
        expect(screen.getByLabelText(/Package Task/i)).toBeTruthy();
      });

      const select = screen.getByLabelText(/Package Task/i);
      expect(select.options.length).toBe(2);
      expect(select.options[0].text).toBe('Install Package');
      expect(select.options[1].text).toBe('APT Install');
    });

    it('should show loading state while fetching tasks', async () => {
      vi.mocked(api.get).mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ tasks: [] }), 100))
      );

      render(InstallSoftwareForm, {
        props: {
          availableTools: ['bolt']
        }
      });

      expect(screen.getByText('Loading tasks...')).toBeTruthy();

      await waitFor(() => {
        expect(screen.queryByText('Loading tasks...')).toBeFalsy();
      });
    });

    it('should show error when no tasks available', async () => {
      vi.mocked(api.get).mockResolvedValue({
        tasks: []
      });

      render(InstallSoftwareForm, {
        props: {
          availableTools: ['bolt']
        }
      });

      await waitFor(() => {
        expect(screen.getByText('No package tasks available')).toBeTruthy();
      });
    });

    it('should not fetch tasks for non-bolt tools', () => {
      render(InstallSoftwareForm, {
        props: {
          availableTools: ['ansible', 'ssh']
        }
      });

      expect(api.get).not.toHaveBeenCalled();
      expect(screen.queryByLabelText(/Package Task/i)).toBeFalsy();
    });
  });

  describe('Form Validation', () => {
    it('should require package name', async () => {
      const onSubmit = vi.fn();

      vi.mocked(api.get).mockResolvedValue({
        tasks: [
          {
            name: 'package::install',
            label: 'Install Package',
            parameterMapping: { packageName: 'package' }
          }
        ]
      });

      render(InstallSoftwareForm, {
        props: {
          onSubmit
        }
      });

      await waitFor(() => {
        expect(screen.queryByText('Loading tasks...')).toBeFalsy();
      });

      const button = screen.getByRole('button', { name: /Install Package/i });
      await fireEvent.click(button);

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should validate package name format', async () => {
      const onSubmit = vi.fn();

      vi.mocked(api.get).mockResolvedValue({
        tasks: [
          {
            name: 'package::install',
            label: 'Install Package',
            parameterMapping: { packageName: 'package' }
          }
        ]
      });

      render(InstallSoftwareForm, {
        props: {
          onSubmit
        }
      });

      await waitFor(() => {
        expect(screen.queryByText('Loading tasks...')).toBeFalsy();
      });

      const input = screen.getByLabelText(/Package Name/i);
      await fireEvent.input(input, { target: { value: 'invalid package!' } });

      const button = screen.getByRole('button', { name: /Install Package/i });
      await fireEvent.click(button);

      expect(screen.getByText(/can only contain letters, numbers, hyphens, and underscores/i)).toBeTruthy();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should accept valid package names', async () => {
      const onSubmit = vi.fn();

      vi.mocked(api.get).mockResolvedValue({
        tasks: [
          {
            name: 'package::install',
            label: 'Install Package',
            parameterMapping: { packageName: 'package' }
          }
        ]
      });

      render(InstallSoftwareForm, {
        props: {
          onSubmit
        }
      });

      await waitFor(() => {
        expect(screen.queryByText('Loading tasks...')).toBeFalsy();
      });

      const validNames = ['nginx', 'apache2', 'my-package', 'package_name', 'pkg123'];

      for (const name of validNames) {
        const input = screen.getByLabelText(/Package Name/i);
        await fireEvent.input(input, { target: { value: name } });

        const button = screen.getByRole('button', { name: /Install Package/i });
        await fireEvent.click(button);

        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            packageName: name
          })
        );

        onSubmit.mockClear();
      }
    });

    it('should validate settings JSON format', async () => {
      const onSubmit = vi.fn();

      vi.mocked(api.get).mockResolvedValue({
        tasks: [
          {
            name: 'package::install',
            label: 'Install Package',
            parameterMapping: {
              packageName: 'package',
              settings: 'settings'
            }
          }
        ]
      });

      render(InstallSoftwareForm, {
        props: {
          onSubmit
        }
      });

      await waitFor(() => {
        expect(screen.queryByText('Loading tasks...')).toBeFalsy();
      });

      const packageInput = screen.getByLabelText(/Package Name/i);
      await fireEvent.input(packageInput, { target: { value: 'nginx' } });

      const settingsInput = screen.getByLabelText(/Additional Settings/i);
      await fireEvent.input(settingsInput, { target: { value: '{invalid json}' } });

      const button = screen.getByRole('button', { name: /Install Package/i });
      await fireEvent.click(button);

      expect(screen.getByText('Settings must be valid JSON')).toBeTruthy();
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('Form Submission', () => {
    it('should submit with all form data', async () => {
      const onSubmit = vi.fn();

      vi.mocked(api.get).mockResolvedValue({
        tasks: [
          {
            name: 'package::install',
            label: 'Install Package',
            parameterMapping: {
              packageName: 'package',
              ensure: 'ensure',
              version: 'version',
              settings: 'settings'
            }
          }
        ]
      });

      render(InstallSoftwareForm, {
        props: {
          onSubmit
        }
      });

      await waitFor(() => {
        expect(screen.queryByText('Loading tasks...')).toBeFalsy();
      });

      // Fill all fields
      const packageInput = screen.getByLabelText(/Package Name/i);
      await fireEvent.input(packageInput, { target: { value: 'nginx' } });

      const versionInput = screen.getByLabelText(/Version/i);
      await fireEvent.input(versionInput, { target: { value: '1.18.0' } });

      const ensureSelect = screen.getByLabelText(/Ensure/i);
      await fireEvent.change(ensureSelect, { target: { value: 'latest' } });

      const settingsInput = screen.getByLabelText(/Additional Settings/i);
      await fireEvent.input(settingsInput, { target: { value: '{"option": "value"}' } });

      const button = screen.getByRole('button', { name: /Install Package/i });
      await fireEvent.click(button);

      expect(onSubmit).toHaveBeenCalledWith({
        packageName: 'nginx',
        tool: 'bolt',
        taskName: 'package::install',
        version: '1.18.0',
        ensure: 'latest',
        settings: { option: 'value' }
      });
    });

    it('should trim whitespace from package name', async () => {
      const onSubmit = vi.fn();

      vi.mocked(api.get).mockResolvedValue({
        tasks: [
          {
            name: 'package::install',
            label: 'Install Package',
            parameterMapping: { packageName: 'package' }
          }
        ]
      });

      render(InstallSoftwareForm, {
        props: {
          onSubmit
        }
      });

      await waitFor(() => {
        expect(screen.queryByText('Loading tasks...')).toBeFalsy();
      });

      const input = screen.getByLabelText(/Package Name/i);
      await fireEvent.input(input, { target: { value: '  nginx  ' } });

      const button = screen.getByRole('button', { name: /Install Package/i });
      await fireEvent.click(button);

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          packageName: 'nginx'
        })
      );
    });

    it('should omit optional fields when empty', async () => {
      const onSubmit = vi.fn();

      vi.mocked(api.get).mockResolvedValue({
        tasks: [
          {
            name: 'package::install',
            label: 'Install Package',
            parameterMapping: { packageName: 'package' }
          }
        ]
      });

      render(InstallSoftwareForm, {
        props: {
          onSubmit
        }
      });

      await waitFor(() => {
        expect(screen.queryByText('Loading tasks...')).toBeFalsy();
      });

      const input = screen.getByLabelText(/Package Name/i);
      await fireEvent.input(input, { target: { value: 'nginx' } });

      const button = screen.getByRole('button', { name: /Install Package/i });
      await fireEvent.click(button);

      expect(onSubmit).toHaveBeenCalledWith({
        packageName: 'nginx',
        tool: 'bolt',
        taskName: 'package::install',
        version: undefined,
        ensure: 'present',
        settings: undefined
      });
    });
  });

  describe('Executing State', () => {
    it('should disable inputs when executing', async () => {
      vi.mocked(api.get).mockResolvedValue({
        tasks: [
          {
            name: 'package::install',
            label: 'Install Package',
            parameterMapping: { packageName: 'package' }
          }
        ]
      });

      render(InstallSoftwareForm, {
        props: {
          executing: true
        }
      });

      await waitFor(() => {
        expect(screen.queryByText('Loading tasks...')).toBeFalsy();
      });

      const packageInput = screen.getByLabelText(/Package Name/i);
      const versionInput = screen.getByLabelText(/Version/i);
      const ensureSelect = screen.getByLabelText(/Ensure/i);
      const button = screen.getByRole('button', { name: /Installing/i });

      expect(packageInput.disabled).toBe(true);
      expect(versionInput.disabled).toBe(true);
      expect(ensureSelect.disabled).toBe(true);
      expect(button.disabled).toBe(true);
    });

    it('should show installing text on button', () => {
      render(InstallSoftwareForm, {
        props: {
          executing: true
        }
      });

      expect(screen.getByText('Installing...')).toBeTruthy();
    });

    it('should show loading spinner when executing', () => {
      render(InstallSoftwareForm, {
        props: {
          executing: true
        }
      });

      expect(screen.getByText('Installing package...')).toBeTruthy();
    });
  });

  describe('Error Display', () => {
    it('should display error message', () => {
      render(InstallSoftwareForm, {
        props: {
          error: 'Installation failed'
        }
      });

      expect(screen.getByText('Package installation failed')).toBeTruthy();
    });
  });

  describe('Multi-Node Context', () => {
    it('should show multi-node info message', () => {
      render(InstallSoftwareForm, {
        props: {
          multiNode: true
        }
      });

      expect(screen.getByText(/installed on all selected nodes in parallel/i)).toBeTruthy();
    });

    it('should not show multi-node message for single node', () => {
      render(InstallSoftwareForm, {
        props: {
          multiNode: false
        }
      });

      expect(screen.queryByText(/installed on all selected nodes/i)).toBeFalsy();
    });
  });

  describe('Initial Values', () => {
    it('should populate initial package name', () => {
      render(InstallSoftwareForm, {
        props: {
          initialPackageName: 'nginx'
        }
      });

      const input = screen.getByLabelText(/Package Name/i);
      expect(input.value).toBe('nginx');
    });

    it('should select initial tool', () => {
      vi.mocked(api.get).mockResolvedValue({
        tasks: []
      });

      render(InstallSoftwareForm, {
        props: {
          availableTools: ['bolt', 'ansible', 'ssh'],
          initialTool: 'ansible'
        }
      });

      const ansibleButton = screen.getByRole('button', { name: /ansible/i });
      expect(ansibleButton.className).toContain('border-blue-500');
    });

    it('should fallback to first available tool if initial tool not available', async () => {
      const onSubmit = vi.fn();

      vi.mocked(api.get).mockResolvedValue({
        tasks: [
          {
            name: 'package::install',
            label: 'Install Package',
            parameterMapping: { packageName: 'package' }
          }
        ]
      });

      render(InstallSoftwareForm, {
        props: {
          availableTools: ['bolt', 'ssh'],
          initialTool: 'ansible',
          onSubmit
        }
      });

      await waitFor(() => {
        expect(screen.queryByText('Loading tasks...')).toBeFalsy();
      });

      const packageInput = screen.getByLabelText(/Package Name/i);
      await fireEvent.input(packageInput, { target: { value: 'nginx' } });

      const button = screen.getByRole('button', { name: /Install Package/i });
      await fireEvent.click(button);

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'bolt'
        })
      );
    });
  });

  describe('Settings Field Visibility', () => {
    it('should show settings field when task supports it', async () => {
      vi.mocked(api.get).mockResolvedValue({
        tasks: [
          {
            name: 'package::install',
            label: 'Install Package',
            parameterMapping: {
              packageName: 'package',
              settings: 'settings'
            }
          }
        ]
      });

      render(InstallSoftwareForm);

      await waitFor(() => {
        expect(screen.getByLabelText(/Additional Settings/i)).toBeTruthy();
      });
    });

    it('should hide settings field when task does not support it', async () => {
      vi.mocked(api.get).mockResolvedValue({
        tasks: [
          {
            name: 'package::install',
            label: 'Install Package',
            parameterMapping: {
              packageName: 'package'
            }
          }
        ]
      });

      render(InstallSoftwareForm);

      await waitFor(() => {
        expect(screen.queryByText('Loading tasks...')).toBeFalsy();
      });

      expect(screen.queryByLabelText(/Additional Settings/i)).toBeFalsy();
    });
  });
});
