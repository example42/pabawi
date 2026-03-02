import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ExecuteCommandForm from './ExecuteCommandForm.svelte';

describe('ExecuteCommandForm', () => {
  describe('Basic Rendering', () => {
    it('should render command input field', () => {
      render(ExecuteCommandForm);

      const input = screen.getByLabelText('Command');
      expect(input).toBeTruthy();
      expect(input.placeholder).toBe('Enter command to execute...');
    });

    it('should render execute button', () => {
      render(ExecuteCommandForm);

      const button = screen.getByRole('button', { name: /execute/i });
      expect(button).toBeTruthy();
    });

    it('should render parameters input field', () => {
      render(ExecuteCommandForm);

      const textarea = screen.getByLabelText('Parameters (Optional)');
      expect(textarea).toBeTruthy();
    });
  });

  describe('Tool Selection', () => {
    it('should render tool selector when multiple tools available', () => {
      render(ExecuteCommandForm, {
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
      render(ExecuteCommandForm, {
        props: {
          availableTools: ['bolt']
        }
      });

      expect(screen.queryByText('Execution Tool')).toBeFalsy();
    });

    it('should allow selecting different tools', async () => {
      const onSubmit = vi.fn();
      render(ExecuteCommandForm, {
        props: {
          availableTools: ['bolt', 'ansible', 'ssh'],
          onSubmit
        }
      });

      // Select ansible
      const ansibleButton = screen.getByRole('button', { name: /ansible/i });
      await fireEvent.click(ansibleButton);

      // Fill command and submit
      const input = screen.getByLabelText('Command');
      await fireEvent.input(input, { target: { value: 'ls -la' } });

      const submitButton = screen.getByRole('button', { name: /^execute$/i });
      await fireEvent.click(submitButton);

      expect(onSubmit).toHaveBeenCalledWith({
        command: 'ls -la',
        tool: 'ansible',
        parameters: undefined
      });
    });
  });

  describe('Command Whitelist', () => {
    it('should display whitelist when allowAll is true', () => {
      render(ExecuteCommandForm, {
        props: {
          commandWhitelist: {
            allowAll: true,
            whitelist: [],
            matchMode: 'exact'
          }
        }
      });

      expect(screen.getByText('Available Commands')).toBeTruthy();
      expect(screen.getByText('All commands are allowed')).toBeTruthy();
    });

    it('should display whitelist commands', () => {
      render(ExecuteCommandForm, {
        props: {
          commandWhitelist: {
            allowAll: false,
            whitelist: ['ls', 'pwd', 'whoami'],
            matchMode: 'exact'
          }
        }
      });

      expect(screen.getByText('ls')).toBeTruthy();
      expect(screen.getByText('pwd')).toBeTruthy();
      expect(screen.getByText('whoami')).toBeTruthy();
    });

    it('should populate command input when whitelist command is clicked', async () => {
      render(ExecuteCommandForm, {
        props: {
          commandWhitelist: {
            allowAll: false,
            whitelist: ['ls -la', 'pwd'],
            matchMode: 'exact'
          }
        }
      });

      const lsButton = screen.getByRole('button', { name: /ls -la/i });
      await fireEvent.click(lsButton);

      const input = screen.getByLabelText('Command');
      expect(input.value).toBe('ls -la');
    });

    it('should show prefix indicator for prefix match mode', () => {
      render(ExecuteCommandForm, {
        props: {
          commandWhitelist: {
            allowAll: false,
            whitelist: ['ls', 'cat'],
            matchMode: 'prefix'
          }
        }
      });

      expect(screen.getByText(/Prefix match mode/i)).toBeTruthy();
    });

    it('should show error when whitelist is empty', () => {
      render(ExecuteCommandForm, {
        props: {
          commandWhitelist: {
            allowAll: false,
            whitelist: [],
            matchMode: 'exact'
          }
        }
      });

      expect(screen.getByText(/No commands are allowed/i)).toBeTruthy();
    });
  });

  describe('Form Submission', () => {
    it('should call onSubmit with command data', async () => {
      const onSubmit = vi.fn();
      render(ExecuteCommandForm, {
        props: {
          onSubmit
        }
      });

      const input = screen.getByLabelText('Command');
      await fireEvent.input(input, { target: { value: 'echo hello' } });

      const button = screen.getByRole('button', { name: /^execute$/i });
      await fireEvent.click(button);

      expect(onSubmit).toHaveBeenCalledWith({
        command: 'echo hello',
        tool: 'bolt',
        parameters: undefined
      });
    });

    it('should trim whitespace from command', async () => {
      const onSubmit = vi.fn();
      render(ExecuteCommandForm, {
        props: {
          onSubmit
        }
      });

      const input = screen.getByLabelText('Command');
      await fireEvent.input(input, { target: { value: '  echo hello  ' } });

      const button = screen.getByRole('button', { name: /^execute$/i });
      await fireEvent.click(button);

      expect(onSubmit).toHaveBeenCalledWith({
        command: 'echo hello',
        tool: 'bolt',
        parameters: undefined
      });
    });

    it('should not submit when command is empty', async () => {
      const onSubmit = vi.fn();
      render(ExecuteCommandForm, {
        props: {
          onSubmit
        }
      });

      const button = screen.getByRole('button', { name: /^execute$/i });
      await fireEvent.click(button);

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should disable submit button when command is empty', () => {
      render(ExecuteCommandForm);

      const button = screen.getByRole('button', { name: /^execute$/i });
      expect(button.disabled).toBe(true);
    });

    it('should enable submit button when command is entered', async () => {
      render(ExecuteCommandForm);

      const input = screen.getByLabelText('Command');
      await fireEvent.input(input, { target: { value: 'ls' } });

      const button = screen.getByRole('button', { name: /^execute$/i });
      expect(button.disabled).toBe(false);
    });
  });

  describe('Parameters Handling', () => {
    it('should parse valid JSON parameters', async () => {
      const onSubmit = vi.fn();
      render(ExecuteCommandForm, {
        props: {
          onSubmit
        }
      });

      const commandInput = screen.getByLabelText('Command');
      await fireEvent.input(commandInput, { target: { value: 'test' } });

      const paramsInput = screen.getByLabelText('Parameters (Optional)');
      await fireEvent.input(paramsInput, { target: { value: '{"key": "value"}' } });

      const button = screen.getByRole('button', { name: /^execute$/i });
      await fireEvent.click(button);

      expect(onSubmit).toHaveBeenCalledWith({
        command: 'test',
        tool: 'bolt',
        parameters: { key: 'value' }
      });
    });

    it('should show error for invalid JSON', async () => {
      const onSubmit = vi.fn();
      render(ExecuteCommandForm, {
        props: {
          onSubmit
        }
      });

      const commandInput = screen.getByLabelText('Command');
      await fireEvent.input(commandInput, { target: { value: 'test' } });

      const paramsInput = screen.getByLabelText('Parameters (Optional)');
      await fireEvent.input(paramsInput, { target: { value: '{invalid json}' } });

      const button = screen.getByRole('button', { name: /^execute$/i });
      await fireEvent.click(button);

      expect(screen.getByText('Invalid JSON format')).toBeTruthy();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should show error for non-object JSON', async () => {
      const onSubmit = vi.fn();
      render(ExecuteCommandForm, {
        props: {
          onSubmit
        }
      });

      const commandInput = screen.getByLabelText('Command');
      await fireEvent.input(commandInput, { target: { value: 'test' } });

      const paramsInput = screen.getByLabelText('Parameters (Optional)');
      await fireEvent.input(paramsInput, { target: { value: '["array"]' } });

      const button = screen.getByRole('button', { name: /^execute$/i });
      await fireEvent.click(button);

      expect(screen.getByText('Parameters must be a valid JSON object')).toBeTruthy();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should submit without parameters when field is empty', async () => {
      const onSubmit = vi.fn();
      render(ExecuteCommandForm, {
        props: {
          onSubmit
        }
      });

      const commandInput = screen.getByLabelText('Command');
      await fireEvent.input(commandInput, { target: { value: 'test' } });

      const button = screen.getByRole('button', { name: /^execute$/i });
      await fireEvent.click(button);

      expect(onSubmit).toHaveBeenCalledWith({
        command: 'test',
        tool: 'bolt',
        parameters: undefined
      });
    });
  });

  describe('Executing State', () => {
    it('should disable inputs when executing', () => {
      render(ExecuteCommandForm, {
        props: {
          executing: true
        }
      });

      const commandInput = screen.getByLabelText('Command');
      const paramsInput = screen.getByLabelText('Parameters (Optional)');
      const button = screen.getByRole('button', { name: /executing/i });

      expect(commandInput.disabled).toBe(true);
      expect(paramsInput.disabled).toBe(true);
      expect(button.disabled).toBe(true);
    });

    it('should show executing text on button', () => {
      render(ExecuteCommandForm, {
        props: {
          executing: true
        }
      });

      expect(screen.getByText('Executing...')).toBeTruthy();
    });

    it('should show loading spinner when executing', () => {
      render(ExecuteCommandForm, {
        props: {
          executing: true
        }
      });

      expect(screen.getByText('Executing command...')).toBeTruthy();
    });

    it('should disable tool selection when executing', () => {
      render(ExecuteCommandForm, {
        props: {
          availableTools: ['bolt', 'ansible', 'ssh'],
          executing: true
        }
      });

      const boltButton = screen.getByRole('button', { name: /bolt/i });
      const ansibleButton = screen.getByRole('button', { name: /ansible/i });

      expect(boltButton.disabled).toBe(true);
      expect(ansibleButton.disabled).toBe(true);
    });
  });

  describe('Error Display', () => {
    it('should display error message', () => {
      render(ExecuteCommandForm, {
        props: {
          error: 'Connection failed'
        }
      });

      expect(screen.getByText('Command execution failed')).toBeTruthy();
      // ErrorAlert component shows a generic message, not the specific error details
      expect(screen.getByText(/unexpected error occurred/i)).toBeTruthy();
    });
  });

  describe('Multi-Node Context', () => {
    it('should show multi-node info message', () => {
      render(ExecuteCommandForm, {
        props: {
          multiNode: true
        }
      });

      expect(screen.getByText(/executed on all selected nodes in parallel/i)).toBeTruthy();
    });

    it('should not show multi-node message for single node', () => {
      render(ExecuteCommandForm, {
        props: {
          multiNode: false
        }
      });

      expect(screen.queryByText(/executed on all selected nodes/i)).toBeFalsy();
    });
  });

  describe('Initial Values', () => {
    it('should populate initial command', () => {
      render(ExecuteCommandForm, {
        props: {
          initialCommand: 'ls -la'
        }
      });

      const input = screen.getByLabelText('Command');
      expect(input.value).toBe('ls -la');
    });

    it('should select initial tool', () => {
      render(ExecuteCommandForm, {
        props: {
          availableTools: ['bolt', 'ansible', 'ssh'],
          initialTool: 'ansible'
        }
      });

      const ansibleButton = screen.getByRole('button', { name: /ansible/i });
      expect(ansibleButton.className).toContain('border-blue-500');
    });

    it('should fallback to first available tool if initial tool not available', () => {
      const onSubmit = vi.fn();
      render(ExecuteCommandForm, {
        props: {
          availableTools: ['bolt', 'ssh'],
          initialTool: 'ansible',
          onSubmit
        }
      });

      const commandInput = screen.getByLabelText('Command');
      void fireEvent.input(commandInput, { target: { value: 'test' } });

      const button = screen.getByRole('button', { name: /^execute$/i });
      void fireEvent.click(button);

      expect(onSubmit).toHaveBeenCalledWith({
        command: 'test',
        tool: 'bolt',
        parameters: undefined
      });
    });
  });
});
