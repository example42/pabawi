# ActionSelector Component

A reusable component for selecting action types in execution interfaces. Supports both single and multiple action type display modes.

## Features

- Single selection mode (radio buttons)
- Multiple selection mode (checkboxes)
- Visual feedback for selected actions
- Accessible with ARIA labels
- Customizable available actions
- Disabled state support
- Icons and descriptions for each action type

## Usage

### Single Selection Mode

```svelte
<script lang="ts">
  import ActionSelector from './components/ActionSelector.svelte';
  
  let selectedAction = $state<'install-software' | 'execute-playbook' | 'execute-command' | 'execute-task'>('execute-command');
  
  function handleActionSelect(action: string) {
    console.log('Selected action:', action);
  }
</script>

<ActionSelector
  mode="single"
  bind:selectedAction={selectedAction}
  onActionSelect={handleActionSelect}
/>
```

### Multiple Selection Mode

```svelte
<script lang="ts">
  import ActionSelector from './components/ActionSelector.svelte';
  
  let selectedActions = $state<Array<'install-software' | 'execute-playbook' | 'execute-command' | 'execute-task'>>([]);
  
  function handleActionsSelect(actions: string[]) {
    console.log('Selected actions:', actions);
  }
</script>

<ActionSelector
  mode="multiple"
  bind:selectedActions={selectedActions}
  onActionsSelect={handleActionsSelect}
/>
```

### Limited Available Actions

```svelte
<ActionSelector
  mode="single"
  bind:selectedAction={selectedAction}
  availableActions={['execute-command', 'execute-task']}
/>
```

### Disabled State

```svelte
<ActionSelector
  mode="single"
  bind:selectedAction={selectedAction}
  disabled={true}
/>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `mode` | `'single' \| 'multiple'` | `'single'` | Display mode: 'single' shows radio buttons, 'multiple' shows checkboxes |
| `selectedAction` | `ActionType` | `'execute-command'` | Currently selected action (for single mode) |
| `selectedActions` | `ActionType[]` | `[]` | Currently selected actions (for multiple mode) |
| `onActionSelect` | `(action: ActionType) => void` | `undefined` | Callback when action is selected (single mode) |
| `onActionsSelect` | `(actions: ActionType[]) => void` | `undefined` | Callback when actions are selected (multiple mode) |
| `availableActions` | `ActionType[]` | All actions | Actions to display |
| `disabled` | `boolean` | `false` | Whether the selector is disabled |

## Action Types

- `install-software` - Install packages on target nodes
- `execute-playbook` - Run Ansible playbooks
- `execute-command` - Run shell commands
- `execute-task` - Run Bolt tasks

## Accessibility

- Uses proper ARIA labels for screen readers
- Keyboard navigation support
- Visual and text indicators for selected state
- Semantic HTML with radio/checkbox inputs

## Styling

The component uses Tailwind CSS classes and follows the application's design system:

- Blue accent color for selected states
- Gray for unselected states
- Hover effects for better UX
- Dark mode support
