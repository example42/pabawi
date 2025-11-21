<script lang="ts">
  interface TaskParameter {
    name: string;
    type: 'String' | 'Integer' | 'Boolean' | 'Array' | 'Hash';
    description?: string;
    required: boolean;
    default?: unknown;
    enum?: string[]; // For Enum types, list of allowed values
    puppetType?: string; // Original Puppet type string for reference
  }

  interface Props {
    parameters: TaskParameter[];
    values: Record<string, unknown>;
    onValuesChange: (values: Record<string, unknown>) => void;
    disabled?: boolean;
  }

  let { parameters, values, onValuesChange, disabled = false }: Props = $props();

  // State for validation errors
  let validationErrors = $state<Record<string, string>>({});

  // State for JSON editor errors
  let jsonErrors = $state<Record<string, string>>({});

  // Handle parameter value change
  function handleChange(paramName: string, value: string, type: TaskParameter['type']): void {
    const newValues = { ...values };

    // Clear validation error for this parameter
    delete validationErrors[paramName];
    delete jsonErrors[paramName];

    try {
      if (type === 'Integer') {
        const intValue = parseInt(value, 10);
        if (isNaN(intValue)) {
          validationErrors[paramName] = 'Must be a valid integer';
          validationErrors = { ...validationErrors };
          return;
        }
        newValues[paramName] = intValue;
      } else if (type === 'Boolean') {
        newValues[paramName] = value === 'true';
      } else if (type === 'Array' || type === 'Hash') {
        // Try to parse JSON
        if (value.trim() === '') {
          delete newValues[paramName];
        } else {
          try {
            const parsed = JSON.parse(value);

            // Validate type
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
          } catch (e) {
            jsonErrors[paramName] = 'Invalid JSON format';
            jsonErrors = { ...jsonErrors };
            return;
          }
        }
      } else {
        // String type
        if (value.trim() === '') {
          delete newValues[paramName];
        } else {
          newValues[paramName] = value;
        }
      }

      onValuesChange(newValues);
    } catch (e) {
      console.error('Error handling parameter change:', e);
    }
  }

  // Handle checkbox change for Boolean type
  function handleCheckboxChange(paramName: string, checked: boolean): void {
    const newValues = { ...values };
    newValues[paramName] = checked;
    onValuesChange(newValues);
  }

  // Get current value as string for input
  function getValueAsString(paramName: string, type: TaskParameter['type']): string {
    const value = values[paramName];

    if (value === undefined || value === null) {
      return '';
    }

    if (type === 'Array' || type === 'Hash') {
      return JSON.stringify(value, null, 2);
    }

    return String(value);
  }

  // Get current boolean value
  function getBooleanValue(paramName: string): boolean {
    const value = values[paramName];
    return value === true;
  }

  // Validate all required parameters
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

  // Expose validation function
  export function validate(): boolean {
    return validateRequired() && Object.keys(jsonErrors).length === 0;
  }
</script>

<div class="space-y-4">
  {#if parameters.length === 0}
    <p class="text-sm text-gray-500 dark:text-gray-400">
      This task has no parameters.
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
              rows="4"
              class="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-mono placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500 {jsonErrors[param.name] ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}"
              disabled={disabled}
            ></textarea>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Enter valid JSON {param.type === 'Array' ? 'array' : 'object'}
            </p>
          </div>

        <!-- Integer Type: Number Input -->
        {:else if param.type === 'Integer'}
          <input
            id="param-{param.name}"
            type="number"
            value={getValueAsString(param.name, param.type)}
            oninput={(e) => handleChange(param.name, (e.target as HTMLInputElement).value, param.type)}
            placeholder={param.default !== undefined ? `Default: ${param.default}` : 'Enter integer value'}
            class="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white dark:placeholder-gray-500 {validationErrors[param.name] ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}"
            disabled={disabled}
          />

        <!-- String Type with Enum: Dropdown -->
        {:else if param.enum && param.enum.length > 0}
          <select
            id="param-{param.name}"
            value={getValueAsString(param.name, param.type)}
            onchange={(e) => handleChange(param.name, (e.target as HTMLSelectElement).value, param.type)}
            class="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900 dark:text-white {validationErrors[param.name] ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}"
            disabled={disabled}
          >
            <option value="">-- Select {param.name} --</option>
            {#each param.enum as enumValue}
              <option value={enumValue}>{enumValue}</option>
            {/each}
          </select>

        <!-- String Type: Text Input -->
        {:else}
          <input
            id="param-{param.name}"
            type="text"
            value={getValueAsString(param.name, param.type)}
            oninput={(e) => handleChange(param.name, (e.target as HTMLInputElement).value, param.type)}
            placeholder={param.default !== undefined ? `Default: ${param.default}` : 'Enter value'}
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
        <span class="text-red-500">*</span> Required fields
      </p>
    {/if}
  {/if}
</div>
