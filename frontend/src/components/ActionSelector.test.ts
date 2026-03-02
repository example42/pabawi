import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ActionSelector from './ActionSelector.svelte';

describe('ActionSelector', () => {
  describe('Single Mode', () => {
    it('renders all action options by default', () => {
      render(ActionSelector, { props: { mode: 'single' } });

      expect(screen.getByText('Install Software')).toBeTruthy();
      expect(screen.getByText('Execute Playbook')).toBeTruthy();
      expect(screen.getByText('Execute Command')).toBeTruthy();
      expect(screen.getByText('Execute Task')).toBeTruthy();
    });

    it('renders only specified available actions', () => {
      render(ActionSelector, {
        props: {
          mode: 'single',
          availableActions: ['execute-command', 'execute-task'],
        },
      });

      expect(screen.getByText('Execute Command')).toBeTruthy();
      expect(screen.getByText('Execute Task')).toBeTruthy();
      expect(screen.queryByText('Install Software')).toBeFalsy();
      expect(screen.queryByText('Execute Playbook')).toBeFalsy();
    });

    it('selects execute-command by default', () => {
      render(ActionSelector, { props: { mode: 'single' } });

      const commandRadio = screen.getByRole('radio', { name: /execute command/i });
      expect(commandRadio.checked).toBe(true);
    });

    it('allows selecting a different action', async () => {
      const onActionSelect = vi.fn();
      render(ActionSelector, {
        props: {
          mode: 'single',
          onActionSelect,
        },
      });

      const taskRadio = screen.getByRole('radio', { name: /execute task/i });
      await fireEvent.click(taskRadio);

      expect(onActionSelect).toHaveBeenCalledWith('execute-task');
    });

    it('shows selected state with visual indicators', () => {
      render(ActionSelector, {
        props: {
          mode: 'single',
          selectedAction: 'install-software',
        },
      });

      const softwareLabel = screen.getByText('Install Software').closest('label');
      expect(softwareLabel?.classList.contains('border-blue-500')).toBe(true);
      expect(softwareLabel?.classList.contains('bg-blue-50')).toBe(true);
    });

    it('disables all options when disabled prop is true', () => {
      render(ActionSelector, {
        props: {
          mode: 'single',
          disabled: true,
        },
      });

      const radios = screen.getAllByRole('radio');
      radios.forEach((radio) => {
        expect(radio.disabled).toBe(true);
      });
    });

    it('does not call onActionSelect when disabled', async () => {
      const onActionSelect = vi.fn();
      render(ActionSelector, {
        props: {
          mode: 'single',
          disabled: true,
          onActionSelect,
        },
      });

      const taskRadio = screen.getByRole('radio', { name: /execute task/i });
      await fireEvent.click(taskRadio);

      expect(onActionSelect).not.toHaveBeenCalled();
    });
  });

  describe('Multiple Mode', () => {
    it('renders checkboxes instead of radio buttons', () => {
      render(ActionSelector, { props: { mode: 'multiple' } });

      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes).toHaveLength(4);
    });

    it('allows selecting multiple actions', async () => {
      const onActionsSelect = vi.fn();
      render(ActionSelector, {
        props: {
          mode: 'multiple',
          selectedActions: [],
          onActionsSelect,
        },
      });

      const commandCheckbox = screen.getByRole('checkbox', { name: /execute command/i });
      const taskCheckbox = screen.getByRole('checkbox', { name: /execute task/i });

      await fireEvent.click(commandCheckbox);
      expect(onActionsSelect).toHaveBeenCalledWith(['execute-command']);

      await fireEvent.click(taskCheckbox);
      expect(onActionsSelect).toHaveBeenCalledWith(['execute-command', 'execute-task']);
    });

    it('allows deselecting actions', async () => {
      const onActionsSelect = vi.fn();
      render(ActionSelector, {
        props: {
          mode: 'multiple',
          selectedActions: ['execute-command', 'execute-task'],
          onActionsSelect,
        },
      });

      const commandCheckbox = screen.getByRole('checkbox', { name: /execute command/i });
      await fireEvent.click(commandCheckbox);

      expect(onActionsSelect).toHaveBeenCalledWith(['execute-task']);
    });

    it('shows selected state for multiple actions', () => {
      render(ActionSelector, {
        props: {
          mode: 'multiple',
          selectedActions: ['execute-command', 'install-software'],
        },
      });

      const commandCheckbox = screen.getByRole('checkbox', { name: /execute command/i });
      const softwareCheckbox = screen.getByRole('checkbox', { name: /install software/i });
      const taskCheckbox = screen.getByRole('checkbox', { name: /execute task/i });

      expect(commandCheckbox.checked).toBe(true);
      expect(softwareCheckbox.checked).toBe(true);
      expect(taskCheckbox.checked).toBe(false);
    });

    it('disables all checkboxes when disabled prop is true', () => {
      render(ActionSelector, {
        props: {
          mode: 'multiple',
          disabled: true,
        },
      });

      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach((checkbox) => {
        expect(checkbox.disabled).toBe(true);
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper ARIA labels', () => {
      render(ActionSelector, { props: { mode: 'single' } });

      const group = screen.getByRole('group', { name: /action type selection/i });
      expect(group).toBeTruthy();
    });

    it('associates labels with inputs', () => {
      render(ActionSelector, { props: { mode: 'single' } });

      const commandRadio = screen.getByRole('radio', { name: /execute command/i });
      expect(commandRadio).toBeTruthy();
    });

    it('shows descriptions for each action', () => {
      render(ActionSelector, { props: { mode: 'single' } });

      expect(screen.getByText('Install packages on target nodes')).toBeTruthy();
      expect(screen.getByText('Run Ansible playbooks')).toBeTruthy();
      expect(screen.getByText('Run shell commands')).toBeTruthy();
      expect(screen.getByText('Run Bolt tasks')).toBeTruthy();
    });
  });

  describe('Visual Feedback', () => {
    it('shows checkmark icon for selected action in single mode', () => {
      render(ActionSelector, {
        props: {
          mode: 'single',
          selectedAction: 'execute-command',
        },
      });

      // Check for checkmark SVG in the selected action's label
      const commandLabel = screen.getByText('Execute Command').closest('label');
      const checkmark = commandLabel?.querySelector('svg[fill="currentColor"]');
      expect(checkmark).toBeTruthy();
    });

    it('shows checkmark icon for selected actions in multiple mode', () => {
      render(ActionSelector, {
        props: {
          mode: 'multiple',
          selectedActions: ['execute-command', 'execute-task'],
        },
      });

      const commandLabel = screen.getByText('Execute Command').closest('label');
      const taskLabel = screen.getByText('Execute Task').closest('label');

      expect(commandLabel?.querySelector('svg[fill="currentColor"]')).toBeTruthy();
      expect(taskLabel?.querySelector('svg[fill="currentColor"]')).toBeTruthy();
    });

    it('shows action icons for all options', () => {
      const { container } = render(ActionSelector, { props: { mode: 'single' } });

      // Each action should have an icon SVG
      const icons = container.querySelectorAll('svg[stroke="currentColor"]');
      expect(icons.length).toBeGreaterThanOrEqual(4);
    });
  });
});
