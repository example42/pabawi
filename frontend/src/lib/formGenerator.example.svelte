<script lang="ts">
/**
 * Example usage of dynamic form generation utilities
 *
 * This example demonstrates how to use generateFormFields to create
 * forms dynamically from integration capability metadata.
 */

import { generateFormFields, generateValidationRules, initializeFormData } from './formGenerator';
import { validateForm } from './validation';
import type { CapabilityParameter } from './types/provisioning';

// Example capability metadata (would come from backend in real usage)
const vmCapability: CapabilityParameter[] = [
  {
    name: 'vmid',
    type: 'number',
    required: true,
    description: 'Unique VM identifier',
    validation: { min: 100, max: 999999999 },
  },
  {
    name: 'name',
    type: 'string',
    required: true,
    description: 'VM name',
  },
  {
    name: 'node',
    type: 'string',
    required: true,
    description: 'Proxmox node',
  },
  {
    name: 'cores',
    type: 'number',
    required: false,
    default: 1,
    validation: { min: 1, max: 128 },
  },
  {
    name: 'memory',
    type: 'number',
    required: false,
    default: 512,
    validation: { min: 512, max: 524288 },
  },
  {
    name: 'ostype',
    type: 'string',
    required: false,
    validation: {
      enum: ['l26', 'l24', 'win10', 'win11'],
    },
  },
];

// Generate form configuration
const fields = generateFormFields(vmCapability);
const validationRules = generateValidationRules(fields);

// Initialize form state
let formData = $state(initializeFormData(fields));
let errors = $state<Record<string, string>>({});
let submitting = $state(false);

// Handle form submission
function handleSubmit() {
  // Validate form
  const result = validateForm(formData, validationRules);
  errors = result.errors;

  if (!result.valid) {
    console.log('Form validation failed:', errors);
    return;
  }

  // Submit form
  submitting = true;
  console.log('Submitting form data:', formData);

  // Simulate API call
  setTimeout(() => {
    submitting = false;
    console.log('Form submitted successfully');
  }, 1000);
}

// Handle field changes
function handleFieldChange(fieldName: string, value: unknown) {
  formData[fieldName] = value;

  // Clear error for this field when user starts typing
  if (errors[fieldName]) {
    const newErrors = { ...errors };
    delete newErrors[fieldName];
    errors = newErrors;
  }
}
</script>

<div class="max-w-2xl mx-auto p-6">
  <h2 class="text-2xl font-bold mb-6">Dynamic Form Generation Example</h2>

  <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
    {#each fields as field}
      <div class="form-field">
        <label for={field.name} class="block text-sm font-medium mb-1">
          {field.label}
          {#if field.required}
            <span class="text-red-500">*</span>
          {/if}
        </label>

        {#if field.type === 'text' || field.type === 'number'}
          <input
            id={field.name}
            type={field.type}
            value={formData[field.name] ?? ''}
            oninput={(e) => handleFieldChange(field.name, e.currentTarget.value)}
            placeholder={field.placeholder}
            class="w-full px-3 py-2 border rounded-md"
            class:border-red-500={errors[field.name]}
          />
        {:else if field.type === 'select'}
          <select
            id={field.name}
            value={formData[field.name] ?? ''}
            onchange={(e) => handleFieldChange(field.name, e.currentTarget.value)}
            class="w-full px-3 py-2 border rounded-md"
            class:border-red-500={errors[field.name]}
          >
            <option value="">Select {field.label}</option>
            {#each field.options ?? [] as option}
              <option value={option}>{option}</option>
            {/each}
          </select>
        {:else if field.type === 'checkbox'}
          <input
            id={field.name}
            type="checkbox"
            checked={formData[field.name] === true}
            onchange={(e) => handleFieldChange(field.name, e.currentTarget.checked)}
            class="rounded"
          />
        {:else if field.type === 'textarea'}
          <textarea
            id={field.name}
            value={formData[field.name] ?? ''}
            oninput={(e) => handleFieldChange(field.name, e.currentTarget.value)}
            placeholder={field.placeholder}
            class="w-full px-3 py-2 border rounded-md"
            class:border-red-500={errors[field.name]}
            rows="3"
          ></textarea>
        {/if}

        {#if field.description}
          <p class="text-sm text-gray-600 mt-1">{field.description}</p>
        {/if}

        {#if errors[field.name]}
          <p class="text-sm text-red-500 mt-1">{errors[field.name]}</p>
        {/if}
      </div>
    {/each}

    <div class="flex gap-4 pt-4">
      <button
        type="submit"
        disabled={submitting}
        class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? 'Submitting...' : 'Submit'}
      </button>

      <button
        type="button"
        onclick={() => { formData = initializeFormData(fields); errors = {}; }}
        class="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
      >
        Reset
      </button>
    </div>
  </form>

  <div class="mt-8 p-4 bg-gray-100 rounded-md">
    <h3 class="font-semibold mb-2">Current Form Data:</h3>
    <pre class="text-sm overflow-auto">{JSON.stringify(formData, null, 2)}</pre>
  </div>

  {#if Object.keys(errors).length > 0}
    <div class="mt-4 p-4 bg-red-50 rounded-md">
      <h3 class="font-semibold text-red-800 mb-2">Validation Errors:</h3>
      <pre class="text-sm text-red-700 overflow-auto">{JSON.stringify(errors, null, 2)}</pre>
    </div>
  {/if}
</div>

<style>
  .form-field {
    margin-bottom: 1rem;
  }
</style>
