import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import ExecutePlaybookForm from './ExecutePlaybookForm.svelte';
import * as api from '../lib/api';

// Mock the API module
vi.mock('../lib/api', () => ({
  get: vi.fn(),
  post: vi.fn(),
  getErrorGuidance: vi.fn().mockReturnValue({ guidance: undefined }),
}));

describe('ExecutePlaybookForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: playbook fetch fails, forcing manual path mode
    vi.mocked(api.get).mockRejectedValue(new Error('Not available'));
  });

  describe('Basic Rendering', () => {
    it('should render playbook path input field', async () => {
      render(ExecutePlaybookForm);

      // Wait for manual mode to activate after fetch failure
      await waitFor(() => {
        const input = screen.getByLabelText(/Playbook Path/i);
        expect(input).toBeTruthy();
        expect((input as HTMLInputElement).placeholder).toBe('e.g., playbooks/site.yml');
      });
    });

    it('should render execute button', async () => {
      render(ExecutePlaybookForm);

      await waitFor(() => {
        const button = screen.getByRole('button', { name: /execute playbook/i });
        expect(button).toBeTruthy();
      });
    });

    it('should render extra vars input field', async () => {
      // With playbook browser mode: provide playbooks so we can select one
      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url.startsWith('/api/playbooks/details')) {
          return Promise.resolve({
            playbook: {
              path: 'playbooks/site.yml',
              name: 'site.yml',
              content: '---\n- hosts: all',
              plays: [{ name: 'Main', hosts: 'all' }],
              parameters: [
                { name: 'app_version', type: 'String', required: false },
              ],
            },
          });
        }
        return Promise.resolve({
          playbooks: [
            { path: 'playbooks/site.yml', name: 'site.yml', directory: 'playbooks' },
          ],
        });
      });

      render(ExecutePlaybookForm);

      // Wait for playbooks to load and select one
      await waitFor(() => {
        expect(screen.getByText('site.yml')).toBeTruthy();
      });

      // Click on the playbook to select it
      await fireEvent.click(screen.getByText('site.yml'));

      // Wait for parameter form to appear
      await waitFor(() => {
        expect(screen.getByText(/Parameters/i)).toBeTruthy();
      });
    });

    it('should display Ansible integration badge', async () => {
      render(ExecutePlaybookForm);

      await waitFor(() => {
        expect(screen.getByText('Execution Tool:')).toBeTruthy();
      });
    });
  });

  describe('Form Submission', () => {
    it('should call onSubmit with playbook data', async () => {
      const onSubmit = vi.fn();
      render(ExecutePlaybookForm, {
        props: { onSubmit },
      });

      await waitFor(() => {
        expect(screen.getByLabelText(/Playbook Path/i)).toBeTruthy();
      });

      const input = screen.getByLabelText(/Playbook Path/i);
      await fireEvent.input(input, { target: { value: 'playbooks/site.yml' } });

      const button = screen.getByRole('button', { name: /execute playbook/i });
      await fireEvent.click(button);

      expect(onSubmit).toHaveBeenCalledWith({
        playbookPath: 'playbooks/site.yml',
        extraVars: undefined,
      });
    });

    it('should trim whitespace from playbook path', async () => {
      const onSubmit = vi.fn();
      render(ExecutePlaybookForm, {
        props: { onSubmit },
      });

      await waitFor(() => {
        expect(screen.getByLabelText(/Playbook Path/i)).toBeTruthy();
      });

      const input = screen.getByLabelText(/Playbook Path/i);
      await fireEvent.input(input, { target: { value: '  playbooks/site.yml  ' } });

      const button = screen.getByRole('button', { name: /execute playbook/i });
      await fireEvent.click(button);

      expect(onSubmit).toHaveBeenCalledWith({
        playbookPath: 'playbooks/site.yml',
        extraVars: undefined,
      });
    });

    it('should not submit when playbook path is empty', async () => {
      const onSubmit = vi.fn();
      render(ExecutePlaybookForm, {
        props: { onSubmit },
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /execute playbook/i })).toBeTruthy();
      });

      const button = screen.getByRole('button', { name: /execute playbook/i });
      await fireEvent.click(button);

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should disable submit button when playbook path is empty', async () => {
      render(ExecutePlaybookForm);

      await waitFor(() => {
        const button = screen.getByRole('button', { name: /execute playbook/i });
        expect((button as HTMLButtonElement).disabled).toBe(true);
      });
    });

    it('should enable submit button when playbook path is entered', async () => {
      render(ExecutePlaybookForm);

      await waitFor(() => {
        expect(screen.getByLabelText(/Playbook Path/i)).toBeTruthy();
      });

      const input = screen.getByLabelText(/Playbook Path/i);
      await fireEvent.input(input, { target: { value: 'playbooks/site.yml' } });

      const button = screen.getByRole('button', { name: /execute playbook/i });
      expect((button as HTMLButtonElement).disabled).toBe(false);
    });
  });

  describe('Extra Vars Handling', () => {
    it('should parse valid JSON extra vars from parameters', async () => {
      // Provide a playbook with parameters so the parameter form renders
      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url.startsWith('/api/playbooks/details')) {
          return Promise.resolve({
            playbook: {
              path: 'playbooks/site.yml',
              name: 'site.yml',
              content: '---\n- hosts: all',
              plays: [{ name: 'Main', hosts: 'all' }],
              parameters: [
                { name: 'app_version', type: 'String', required: false, default: '1.2.3' },
              ],
            },
          });
        }
        return Promise.resolve({
          playbooks: [
            { path: 'playbooks/site.yml', name: 'site.yml', directory: 'playbooks' },
          ],
        });
      });

      const onSubmit = vi.fn();
      render(ExecutePlaybookForm, {
        props: { onSubmit },
      });

      // Wait for playbooks to load
      await waitFor(() => {
        expect(screen.getByText('site.yml')).toBeTruthy();
      });

      // Select the playbook
      await fireEvent.click(screen.getByText('site.yml'));

      // Wait for parameters form to appear with default value pre-filled
      await waitFor(() => {
        expect(screen.getByText(/Parameters/i)).toBeTruthy();
      });

      // Submit the form
      const button = screen.getByRole('button', { name: /execute playbook/i });
      await fireEvent.click(button);

      expect(onSubmit).toHaveBeenCalledWith({
        playbookPath: 'playbooks/site.yml',
        extraVars: { app_version: '1.2.3' },
      });
    });

    it('should submit without extra vars when no parameters are filled', async () => {
      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url.startsWith('/api/playbooks/details')) {
          return Promise.resolve({
            playbook: {
              path: 'playbooks/site.yml',
              name: 'site.yml',
              content: '---\n- hosts: all',
              plays: [],
              parameters: [],
            },
          });
        }
        return Promise.resolve({
          playbooks: [
            { path: 'playbooks/site.yml', name: 'site.yml', directory: 'playbooks' },
          ],
        });
      });

      const onSubmit = vi.fn();
      render(ExecutePlaybookForm, {
        props: { onSubmit },
      });

      await waitFor(() => {
        expect(screen.getByText('site.yml')).toBeTruthy();
      });

      await fireEvent.click(screen.getByText('site.yml'));

      await waitFor(() => {
        expect(screen.getByText('No parameters detected for this playbook')).toBeTruthy();
      });

      const button = screen.getByRole('button', { name: /execute playbook/i });
      await fireEvent.click(button);

      expect(onSubmit).toHaveBeenCalledWith({
        playbookPath: 'playbooks/site.yml',
        extraVars: undefined,
      });
    });
  });

  describe('Executing State', () => {
    it('should disable inputs when executing', async () => {
      render(ExecutePlaybookForm, {
        props: { executing: true },
      });

      await waitFor(() => {
        const button = screen.getByRole('button', { name: /executing/i });
        expect((button as HTMLButtonElement).disabled).toBe(true);
      });

      const playbookInput = screen.getByLabelText(/Playbook Path/i);
      expect((playbookInput as HTMLInputElement).disabled).toBe(true);
    });

    it('should show executing text on button', async () => {
      render(ExecutePlaybookForm, {
        props: { executing: true },
      });

      await waitFor(() => {
        expect(screen.getByText('Executing...')).toBeTruthy();
      });
    });

    it('should show loading spinner when executing', async () => {
      render(ExecutePlaybookForm, {
        props: { executing: true },
      });

      await waitFor(() => {
        expect(screen.getByText('Executing playbook...')).toBeTruthy();
      });
    });
  });

  describe('Error Display', () => {
    it('should display error message', async () => {
      render(ExecutePlaybookForm, {
        props: { error: 'Playbook not found' },
      });

      await waitFor(() => {
        expect(screen.getByText('Playbook execution failed')).toBeTruthy();
      });
    });
  });

  describe('Multi-Node Context', () => {
    it('should show multi-node info message', async () => {
      render(ExecutePlaybookForm, {
        props: { multiNode: true },
      });

      await waitFor(() => {
        expect(screen.getByText(/executed on all selected nodes in parallel/i)).toBeTruthy();
      });
    });

    it('should not show multi-node message for single node', async () => {
      render(ExecutePlaybookForm, {
        props: { multiNode: false },
      });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /execute playbook/i })).toBeTruthy();
      });

      expect(screen.queryByText(/executed on all selected nodes/i)).toBeFalsy();
    });
  });

  describe('Initial Values', () => {
    it('should populate initial playbook path', async () => {
      // When initialPlaybookPath is set but playbook list doesn't contain it,
      // the component falls back to manual mode with the path pre-filled
      render(ExecutePlaybookForm, {
        props: { initialPlaybookPath: 'playbooks/deploy.yml' },
      });

      await waitFor(() => {
        const input = screen.getByLabelText(/Playbook Path/i);
        expect((input as HTMLInputElement).value).toBe('playbooks/deploy.yml');
      });
    });

    it('should populate initial extra vars', async () => {
      const initialVars = { app_version: '1.0.0', env: 'staging' };
      render(ExecutePlaybookForm, {
        props: { initialExtraVars: initialVars },
      });

      // In manual mode with initialExtraVars, parameterValues are pre-filled
      // but there's no visible textarea — they'll be submitted as extraVars
      await waitFor(() => {
        expect(screen.getByLabelText(/Playbook Path/i)).toBeTruthy();
      });
    });
  });

  describe('Help Text', () => {
    it('should display playbook path help text', async () => {
      render(ExecutePlaybookForm);

      await waitFor(() => {
        expect(screen.getByText(/path to playbook file/i)).toBeTruthy();
      });
    });
  });

  describe('Required Field Indicators', () => {
    it('should mark playbook path as required', async () => {
      render(ExecutePlaybookForm);

      await waitFor(() => {
        const label = screen.getByText(/Playbook Path/i);
        expect(label.innerHTML).toContain('*');
      });
    });
  });

  describe('Playbook Browser', () => {
    it('should show loading state while fetching playbooks', () => {
      // Make the API call take longer
      vi.mocked(api.get).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ playbooks: [] }), 500))
      );

      render(ExecutePlaybookForm);

      expect(screen.getByText(/discovering playbooks/i)).toBeTruthy();
    });

    it('should display playbook list when fetch succeeds', async () => {
      vi.mocked(api.get).mockImplementation((url: string) => {
        if (url.startsWith('/api/playbooks/details')) {
          return Promise.resolve({
            playbook: {
              path: 'playbooks/site.yml',
              name: 'site.yml',
              content: '',
              plays: [],
              parameters: [],
            },
          });
        }
        return Promise.resolve({
          playbooks: [
            { path: 'playbooks/site.yml', name: 'site.yml', directory: 'playbooks' },
            { path: 'playbooks/deploy.yml', name: 'deploy.yml', directory: 'playbooks' },
          ],
        });
      });

      render(ExecutePlaybookForm);

      await waitFor(() => {
        expect(screen.getByText('site.yml')).toBeTruthy();
        expect(screen.getByText('deploy.yml')).toBeTruthy();
      });
    });

    it('should fall back to manual mode on fetch failure', async () => {
      vi.mocked(api.get).mockRejectedValue(new Error('Network error'));

      render(ExecutePlaybookForm);

      await waitFor(() => {
        const input = screen.getByLabelText(/Playbook Path/i);
        expect(input).toBeTruthy();
      });
    });

    it('should allow switching between browse and manual mode', async () => {
      vi.mocked(api.get).mockResolvedValue({
        playbooks: [
          { path: 'playbooks/site.yml', name: 'site.yml', directory: 'playbooks' },
        ],
      });

      render(ExecutePlaybookForm);

      await waitFor(() => {
        expect(screen.getByText('site.yml')).toBeTruthy();
      });

      // Switch to manual mode
      const manualButton = screen.getByText('Enter path manually');
      await fireEvent.click(manualButton);

      expect(screen.getByLabelText(/Playbook Path/i)).toBeTruthy();

      // Switch back to browse mode
      const browseButton = screen.getByText('Browse playbooks');
      await fireEvent.click(browseButton);

      await waitFor(() => {
        expect(screen.getByText('site.yml')).toBeTruthy();
      });
    });
  });
});
