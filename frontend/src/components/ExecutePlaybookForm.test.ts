import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ExecutePlaybookForm from './ExecutePlaybookForm.svelte';

describe('ExecutePlaybookForm', () => {
  describe('Basic Rendering', () => {
    it('should render playbook path input field', () => {
      render(ExecutePlaybookForm);

      const input = screen.getByLabelText(/Playbook Path/i);
      expect(input).toBeTruthy();
      expect(input.placeholder).toBe('e.g., playbooks/site.yml');
    });

    it('should render execute button', () => {
      render(ExecutePlaybookForm);

      const button = screen.getByRole('button', { name: /execute playbook/i });
      expect(button).toBeTruthy();
    });

    it('should render extra vars input field', () => {
      render(ExecutePlaybookForm);

      const textarea = screen.getByLabelText(/Extra Vars/i);
      expect(textarea).toBeTruthy();
    });

    it('should display Ansible integration badge', () => {
      render(ExecutePlaybookForm);

      expect(screen.getByText('Execution Tool:')).toBeTruthy();
    });
  });

  describe('Form Submission', () => {
    it('should call onSubmit with playbook data', async () => {
      const onSubmit = vi.fn();
      render(ExecutePlaybookForm, {
        props: {
          onSubmit
        }
      });

      const input = screen.getByLabelText(/Playbook Path/i);
      await fireEvent.input(input, { target: { value: 'playbooks/site.yml' } });

      const button = screen.getByRole('button', { name: /execute playbook/i });
      await fireEvent.click(button);

      expect(onSubmit).toHaveBeenCalledWith({
        playbookPath: 'playbooks/site.yml',
        extraVars: undefined
      });
    });

    it('should trim whitespace from playbook path', async () => {
      const onSubmit = vi.fn();
      render(ExecutePlaybookForm, {
        props: {
          onSubmit
        }
      });

      const input = screen.getByLabelText(/Playbook Path/i);
      await fireEvent.input(input, { target: { value: '  playbooks/site.yml  ' } });

      const button = screen.getByRole('button', { name: /execute playbook/i });
      await fireEvent.click(button);

      expect(onSubmit).toHaveBeenCalledWith({
        playbookPath: 'playbooks/site.yml',
        extraVars: undefined
      });
    });

    it('should not submit when playbook path is empty', async () => {
      const onSubmit = vi.fn();
      render(ExecutePlaybookForm, {
        props: {
          onSubmit
        }
      });

      const button = screen.getByRole('button', { name: /execute playbook/i });
      await fireEvent.click(button);

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should disable submit button when playbook path is empty', () => {
      render(ExecutePlaybookForm);

      const button = screen.getByRole('button', { name: /execute playbook/i });
      expect(button.disabled).toBe(true);
    });

    it('should enable submit button when playbook path is entered', async () => {
      render(ExecutePlaybookForm);

      const input = screen.getByLabelText(/Playbook Path/i);
      await fireEvent.input(input, { target: { value: 'playbooks/site.yml' } });

      const button = screen.getByRole('button', { name: /execute playbook/i });
      expect(button.disabled).toBe(false);
    });
  });

  describe('Extra Vars Handling', () => {
    it('should parse valid JSON extra vars', async () => {
      const onSubmit = vi.fn();
      render(ExecutePlaybookForm, {
        props: {
          onSubmit
        }
      });

      const playbookInput = screen.getByLabelText(/Playbook Path/i);
      await fireEvent.input(playbookInput, { target: { value: 'playbooks/site.yml' } });

      const varsInput = screen.getByLabelText(/Extra Vars/i);
      await fireEvent.input(varsInput, { target: { value: '{"app_version": "1.2.3"}' } });

      const button = screen.getByRole('button', { name: /execute playbook/i });
      await fireEvent.click(button);

      expect(onSubmit).toHaveBeenCalledWith({
        playbookPath: 'playbooks/site.yml',
        extraVars: { app_version: '1.2.3' }
      });
    });

    it('should show error for invalid JSON', async () => {
      const onSubmit = vi.fn();
      render(ExecutePlaybookForm, {
        props: {
          onSubmit
        }
      });

      const playbookInput = screen.getByLabelText(/Playbook Path/i);
      await fireEvent.input(playbookInput, { target: { value: 'playbooks/site.yml' } });

      const varsInput = screen.getByLabelText(/Extra Vars/i);
      await fireEvent.input(varsInput, { target: { value: '{invalid json}' } });

      const button = screen.getByRole('button', { name: /execute playbook/i });
      await fireEvent.click(button);

      expect(screen.getByText('Invalid JSON format')).toBeTruthy();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should show error for non-object JSON', async () => {
      const onSubmit = vi.fn();
      render(ExecutePlaybookForm, {
        props: {
          onSubmit
        }
      });

      const playbookInput = screen.getByLabelText(/Playbook Path/i);
      await fireEvent.input(playbookInput, { target: { value: 'playbooks/site.yml' } });

      const varsInput = screen.getByLabelText(/Extra Vars/i);
      await fireEvent.input(varsInput, { target: { value: '["array"]' } });

      const button = screen.getByRole('button', { name: /execute playbook/i });
      await fireEvent.click(button);

      expect(screen.getByText('Extra vars must be a JSON object')).toBeTruthy();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should submit without extra vars when field is empty', async () => {
      const onSubmit = vi.fn();
      render(ExecutePlaybookForm, {
        props: {
          onSubmit
        }
      });

      const playbookInput = screen.getByLabelText(/Playbook Path/i);
      await fireEvent.input(playbookInput, { target: { value: 'playbooks/site.yml' } });

      const button = screen.getByRole('button', { name: /execute playbook/i });
      await fireEvent.click(button);

      expect(onSubmit).toHaveBeenCalledWith({
        playbookPath: 'playbooks/site.yml',
        extraVars: undefined
      });
    });

    it('should handle complex extra vars object', async () => {
      const onSubmit = vi.fn();
      render(ExecutePlaybookForm, {
        props: {
          onSubmit
        }
      });

      const playbookInput = screen.getByLabelText(/Playbook Path/i);
      await fireEvent.input(playbookInput, { target: { value: 'playbooks/site.yml' } });

      const varsInput = screen.getByLabelText(/Extra Vars/i);
      const complexVars = JSON.stringify({
        app_version: '1.2.3',
        environment: 'production',
        features: {
          logging: true,
          monitoring: false
        }
      });
      await fireEvent.input(varsInput, { target: { value: complexVars } });

      const button = screen.getByRole('button', { name: /execute playbook/i });
      await fireEvent.click(button);

      expect(onSubmit).toHaveBeenCalledWith({
        playbookPath: 'playbooks/site.yml',
        extraVars: {
          app_version: '1.2.3',
          environment: 'production',
          features: {
            logging: true,
            monitoring: false
          }
        }
      });
    });
  });

  describe('Executing State', () => {
    it('should disable inputs when executing', () => {
      render(ExecutePlaybookForm, {
        props: {
          executing: true
        }
      });

      const playbookInput = screen.getByLabelText(/Playbook Path/i);
      const varsInput = screen.getByLabelText(/Extra Vars/i);
      const button = screen.getByRole('button', { name: /executing/i });

      expect(playbookInput.disabled).toBe(true);
      expect(varsInput.disabled).toBe(true);
      expect(button.disabled).toBe(true);
    });

    it('should show executing text on button', () => {
      render(ExecutePlaybookForm, {
        props: {
          executing: true
        }
      });

      expect(screen.getByText('Executing...')).toBeTruthy();
    });

    it('should show loading spinner when executing', () => {
      render(ExecutePlaybookForm, {
        props: {
          executing: true
        }
      });

      expect(screen.getByText('Executing playbook...')).toBeTruthy();
    });
  });

  describe('Error Display', () => {
    it('should display error message', () => {
      render(ExecutePlaybookForm, {
        props: {
          error: 'Playbook not found'
        }
      });

      expect(screen.getByText('Playbook execution failed')).toBeTruthy();
    });
  });

  describe('Multi-Node Context', () => {
    it('should show multi-node info message', () => {
      render(ExecutePlaybookForm, {
        props: {
          multiNode: true
        }
      });

      expect(screen.getByText(/executed on all selected nodes in parallel/i)).toBeTruthy();
    });

    it('should not show multi-node message for single node', () => {
      render(ExecutePlaybookForm, {
        props: {
          multiNode: false
        }
      });

      expect(screen.queryByText(/executed on all selected nodes/i)).toBeFalsy();
    });
  });

  describe('Initial Values', () => {
    it('should populate initial playbook path', () => {
      render(ExecutePlaybookForm, {
        props: {
          initialPlaybookPath: 'playbooks/deploy.yml'
        }
      });

      const input = screen.getByLabelText(/Playbook Path/i);
      expect(input.value).toBe('playbooks/deploy.yml');
    });

    it('should populate initial extra vars', () => {
      const initialVars = { app_version: '1.0.0', env: 'staging' };
      render(ExecutePlaybookForm, {
        props: {
          initialExtraVars: initialVars
        }
      });

      const textarea = screen.getByLabelText(/Extra Vars/i);
      expect(textarea.value).toBe(JSON.stringify(initialVars, null, 2));
    });

    // Note: Svelte 5 removed $set API, so we test initial values only
    // Dynamic prop updates would require re-rendering the component
  });

  describe('Help Text', () => {
    it('should display playbook path help text', () => {
      render(ExecutePlaybookForm);

      expect(screen.getByText(/Path to the Ansible playbook file/i)).toBeTruthy();
    });

    it('should display extra vars help text', () => {
      render(ExecutePlaybookForm);

      expect(screen.getByText(/Optional JSON object with variables/i)).toBeTruthy();
    });
  });

  describe('Required Field Indicators', () => {
    it('should mark playbook path as required', () => {
      render(ExecutePlaybookForm);

      const label = screen.getByText(/Playbook Path/i);
      expect(label.innerHTML).toContain('*');
    });

    it('should not mark extra vars as required', () => {
      render(ExecutePlaybookForm);

      const label = screen.getByText(/Extra Vars/i);
      expect(label.innerHTML).not.toContain('*');
    });
  });
});
