<script lang="ts">
  /**
   * ActionSelector Component
   *
   * Reusable component for selecting action types in execution interfaces.
   * Supports both single and multiple action type display modes.
   *
   * @component
   * @example
   * ```svelte
   * <ActionSelector
   *   mode="single"
   *   selectedAction={selectedAction}
   *   onActionSelect={(action) => selectedAction = action}
   * />
   * ```
   */

  type ActionType = 'install-software' | 'execute-playbook' | 'execute-command' | 'execute-task';

  interface ActionOption {
    id: ActionType;
    label: string;
    description: string;
    icon: string;
  }

  interface Props {
    /**
     * Display mode: 'single' shows radio buttons, 'multiple' shows checkboxes
     */
    mode?: 'single' | 'multiple';

    /**
     * Currently selected action (for single mode)
     */
    selectedAction?: ActionType;

    /**
     * Currently selected actions (for multiple mode)
     */
    selectedActions?: ActionType[];

    /**
     * Callback when action is selected (single mode)
     */
    onActionSelect?: (action: ActionType) => void;

    /**
     * Callback when actions are selected (multiple mode)
     */
    onActionsSelect?: (actions: ActionType[]) => void;

    /**
     * Actions to display (defaults to all)
     */
    availableActions?: ActionType[];

    /**
     * Whether the selector is disabled
     */
    disabled?: boolean;
  }

  let {
    mode = 'single',
    selectedAction = $bindable<ActionType>('execute-command'),
    selectedActions = $bindable<ActionType[]>([]),
    onActionSelect,
    onActionsSelect,
    availableActions = ['install-software', 'execute-playbook', 'execute-command', 'execute-task'],
    disabled = false,
  }: Props = $props();

  const actionOptions: Record<ActionType, ActionOption> = {
    'install-software': {
      id: 'install-software',
      label: 'Install Software',
      description: 'Install packages on target nodes',
      icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
    },
    'execute-playbook': {
      id: 'execute-playbook',
      label: 'Execute Playbook',
      description: 'Run Ansible playbooks',
      icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    },
    'execute-command': {
      id: 'execute-command',
      label: 'Execute Command',
      description: 'Run shell commands',
      icon: 'M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    },
    'execute-task': {
      id: 'execute-task',
      label: 'Execute Task',
      description: 'Run Bolt tasks',
      icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    },
  };

  // Filter actions based on availableActions prop
  const displayedActions = $derived(
    availableActions.map(id => actionOptions[id]).filter(Boolean)
  );

  // Handle single action selection
  function handleSingleSelect(action: ActionType): void {
    if (disabled) return;

    selectedAction = action;
    onActionSelect?.(action);
  }

  // Handle multiple action selection
  function handleMultipleSelect(action: ActionType, checked: boolean): void {
    if (disabled) return;

    if (checked) {
      selectedActions = [...selectedActions, action];
    } else {
      selectedActions = selectedActions.filter(a => a !== action);
    }

    onActionsSelect?.(selectedActions);
  }

  // Check if action is selected in multiple mode
  function isActionSelected(action: ActionType): boolean {
    return selectedActions.includes(action);
  }
</script>

<div class="action-selector" role="group" aria-label="Action type selection">
  <div class="space-y-3">
    {#each displayedActions as action (action.id)}
      <label
        class="flex items-start gap-3 rounded-lg border-2 p-4 transition-all cursor-pointer {
          mode === 'single' && selectedAction === action.id
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
            : mode === 'multiple' && isActionSelected(action.id)
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
            : 'border-gray-300 bg-white hover:border-blue-300 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-blue-400 dark:hover:bg-gray-700'
        } {disabled ? 'opacity-50 cursor-not-allowed' : ''}"
      >
        <div class="flex items-center pt-0.5">
          {#if mode === 'single'}
            <input
              type="radio"
              name="action-type"
              value={action.id}
              checked={selectedAction === action.id}
              onchange={() => handleSingleSelect(action.id)}
              {disabled}
              class="h-4 w-4 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
            />
          {:else}
            <input
              type="checkbox"
              value={action.id}
              checked={isActionSelected(action.id)}
              onchange={(e) => handleMultipleSelect(action.id, e.currentTarget.checked)}
              {disabled}
              class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
            />
          {/if}
        </div>

        <div class="flex-1">
          <div class="flex items-center gap-2">
            <svg
              class="h-5 w-5 {
                (mode === 'single' && selectedAction === action.id) ||
                (mode === 'multiple' && isActionSelected(action.id))
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-400 dark:text-gray-500'
              }"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d={action.icon}
              />
            </svg>
            <span
              class="text-sm font-medium {
                (mode === 'single' && selectedAction === action.id) ||
                (mode === 'multiple' && isActionSelected(action.id))
                  ? 'text-blue-700 dark:text-blue-300'
                  : 'text-gray-900 dark:text-white'
              }"
            >
              {action.label}
            </span>
          </div>
          <p
            class="mt-1 text-sm {
              (mode === 'single' && selectedAction === action.id) ||
              (mode === 'multiple' && isActionSelected(action.id))
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-gray-500 dark:text-gray-400'
            }"
          >
            {action.description}
          </p>
        </div>

        {#if (mode === 'single' && selectedAction === action.id) || (mode === 'multiple' && isActionSelected(action.id))}
          <svg
            class="h-5 w-5 text-blue-600 dark:text-blue-400"
            fill="currentColor"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clip-rule="evenodd"
            />
          </svg>
        {/if}
      </label>
    {/each}
  </div>
</div>

<style>
  .action-selector {
    width: 100%;
  }
</style>
