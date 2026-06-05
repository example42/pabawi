<script lang="ts">
  /**
   * PlaybookParameterForm Component
   *
   * Renders dynamic form inputs for Ansible playbook parameters
   * extracted from vars_prompt and vars. Similar to TaskParameterForm
   * but handles Ansible-specific conventions (private vars, prompts).
   */

  interface PlaybookParameter {
    name: string;
    type: 'String' | 'Boolean' | 'Integer' | 'Array' | 'Hash';
    description?: string;
    required: boolean;
    default?: unknown;
    private?: boolean;
  }

  interface Props {
    parameters: PlaybookParameter[];
    values: Record<string, unknown>;
    onValuesChange: (values: Record<string, unknown>) => void;
    disabled?: boolean;
  }

  let { parameters, values, onValuesChange, disabled = false }: Props = $props();

  // State for validation errors
  let validationErrors = $state<Record<string, string>>({});
  let jsonErrors = $state<Record<string, string>>({});

  function handleChange(paramName: string, value: string, type: PlaybookParameter['type']): void {
    const newValues = { ...values };

    delete validationErrors[paramName];
    delete jsonErrors[paramName];

    try {
      if (type === 'Integer') {
        if (value.trim() === '') {
          delete newValues[paramName];
        } else {
          const intValue = parseInt(value, 10);
          if (isNaN(intValue)) {
            validationErrors[paramName] = 'Must be a valid integer';
            validationErrors = { ...validationErrors };
            return;
          }
          newValues[paramName] = intValue;
        }
      } else if (type === 'Boolean') {
        newValues[paramName] = value === 'true';
      } else if (type === 'Array' || type === 'Hash') {
        if (value.trim() === '') {
          delete newValues[paramName];
        } else {
          try {
            const parsed = JSON.parse(value) as unknown;
            if (type === 'Array' && !Array.isArray(parsed)) {
              jsonErrors[paramName] = 'Must be a valid JSON array';
              jsonErrors = { ...jsonErrors };
              return;
            }
            if (type === 'Hash' && (typeof parsed !== 'object' || Array.isArray(parsed) || parsed === null)) {
              jsonErrors[paramName] = 'Must be a valid JSON object';
              jsonErrors = { ...jsonErrors };
              return;
            }
            newValues[paramName] = parsed;
          } catch {
            jsonErrors[paramName] = 'Invalid JSON format';
            jsonErrors = { ...jsonErrors };
            return;
          }
        }
      } else {
        if (value.trim() === '') {
          delete newValues[paramName];
        } else {
          newValues[paramName] = value;
        }
      }

      onValuesChange(newValues);
    } catch {
      // Silently ignore unexpected errors in change handler
    }
  }

  function handleCheckboxChange(paramName: string, checked: boolean): void {
    const newValues = { ...values };
    newValues[paramName] = checked;
    onValuesChange(newValues);
  }

  function getValueAsString(paramName: string, type: PlaybookParameter['type']): string {
    const value = values[paramName];
    if (value === undefined || value === null) return '';
    if (type === 'Array' || type === 'Hash') return JSON.stringify(value, null, 2);
    return String(value);
  }

  function getBooleanValue(paramName: string): boolean {
    return values[paramName] === true;
  }

  function validateRequired(): boolean {
    const errors: Record<string, string> = {};

    for (const param of parameters) {
      if (param.required && (values[param.name] === undefined || values[param.name] === null || values[param.name] === '')) {
        errors[param.name] = 'This parameter is required';
      }
    }

    validationErrors = errors;
    return Object.keys(errors).length === 0;
  }

  export function validate(): boolean {
    return validateRequired() && Object.keys(jsonErrors).length === 0;
  }
</script>

<div class="space-y-4">
  {#if parameters.length === 0}
    <p class="text-sm text-gray-500 dark:text-gray-400">
      No parameters detected.
    </p>
  {:else}
    {#each parameters as param}
      <div class="parameter-field">
        <label for="param-{param.name}" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {param.name}
          {#if param.required}
            <span class="text-red-500">*</span>
          {/if}
          <span class="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
            ({param.type})
          </span>
          {#if param.private}
            <span class="ml-1 inline-flex items-center rounded-full bg-yellow-100 px-1.5 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
              sensitive
            </span>
          {/if}
        </label>

        {#if param.description}
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {param.description}
          </p>
        {/if}

        <!-- Boolean Type: Checkbox -->
        {#if param.type === 'Boolean'}
          <div class="mt-2 flex items-center">
            <input
              id="param-{param.name}"
              type="checkbox"
              checked={getBooleanValue(param.name)}
              onchange={(e) => handleCheckboxChange(param.name, (e.target as HTMLInputElement).checked)}
              class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800"
              disabled={disabled}
            />
            <label for="param-{param.name}" class="ml-2 text-sm text-gray-700 dark:text-gray-300">
              Enable
            </label>
          </div>

        <!-- Array or Hash Type: JSON Editor -->
        {:else if param.type === 'Array' || param.type === 'Hash'}
          <div class="mt-2">
            <textarea
              id="param-{param.name}"
              value={getValueAsString(param.name, param.type)}
              oninput={(e) => handleChange(param.name, (e.target as HTMLTextAreaElement).value, param.type)}
              placeholder={param.type === 'Array' ? '["item1", "item2"]' : '{"key": "value"}'}
              rows="3"
              class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500 {jsonErrors[param.name] ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}"
              disabled={disabled}
            ></textarea>
          </div>

        <!-- Integer Type: Number Input -->
        {:else if param.type === 'Integer'}
          <input
            id="param-{param.name}"
            type="number"
            value={getValueAsString(param.name, param.type)}
            oninput={(e) => handleChange(param.name, (e.target as HTMLInputElement).value, param.type)}
            placeholder={param.default !== undefined ? `Default: ${String(param.default)}` : 'Enter integer value'}
            class="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500 {validationErrors[param.name] ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}"
            disabled={disabled}
          />

        <!-- String Type: Text or Password Input -->
        {:else}
          <input
            id="param-{param.name}"
            type={param.private ? 'password' : 'text'}
            value={getValueAsString(param.name, param.type)}
            oninput={(e) => handleChange(param.name, (e.target as HTMLInputElement).value, param.type)}
            placeholder={param.default !== undefined ? `Default: ${String(param.default)}` : 'Enter value'}
            class="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500 {validationErrors[param.name] ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}"
            disabled={disabled}
          />
        {/if}

        <!-- Validation Error -->
        {#if validationErrors[param.name]}
          <p class="mt-1 text-xs text-red-600 dark:text-red-400">
            {validationErrors[param.name]}
          </p>
        {/if}

        <!-- JSON Error -->
        {#if jsonErrors[param.name]}
          <p class="mt-1 text-xs text-red-600 dark:text-red-400">
            {jsonErrors[param.name]}
          </p>
        {/if}
      </div>
    {/each}

    <!-- Required Fields Note -->
    {#if parameters.some(p => p.required)}
      <p class="text-xs text-gray-500 dark:text-gray-400">
        <span class="text-red-500">*</span> Required fields (from vars_prompt)
      </p>
    {/if}
  {/if}
</div>
