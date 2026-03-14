# Dynamic Form Generation Utilities

This module provides utilities for generating form field configurations dynamically from integration capability metadata. This enables the frontend to support new provisioning integrations without code changes.

## Purpose

The form generator supports **Requirement 13: Extensibility for Future Integrations** by:

- Generating form fields from capability parameter metadata
- Creating validation rules automatically
- Initializing form data with default values
- Supporting multiple input types (text, number, checkbox, select, textarea)

## Usage

### Basic Example

```typescript
import { generateFormFields, generateValidationRules, initializeFormData } from './formGenerator';
import { validateForm } from './validation';

// Get capability metadata from backend
const capability = {
  name: 'create_vm',
  parameters: [
    { name: 'vmid', type: 'number', required: true, validation: { min: 100, max: 999999999 } },
    { name: 'name', type: 'string', required: true },
    { name: 'cores', type: 'number', required: false, default: 1 }
  ]
};

// Generate form configuration
const fields = generateFormFields(capability.parameters);
const rules = generateValidationRules(fields);
const initialData = initializeFormData(fields);

// Use in your component
let formData = $state(initialData);
let errors = $state({});

function handleSubmit() {
  const result = validateForm(formData, rules);
  if (!result.valid) {
    errors = result.errors;
    return;
  }
  // Submit form...
}
```

### Rendering Form Fields

```svelte
{#each fields as field}
  <div>
    <label for={field.name}>
      {field.label}
      {#if field.required}<span>*</span>{/if}
    </label>
    
    {#if field.type === 'text' || field.type === 'number'}
      <input
        id={field.name}
        type={field.type}
        bind:value={formData[field.name]}
        placeholder={field.placeholder}
      />
    {:else if field.type === 'select'}
      <select id={field.name} bind:value={formData[field.name]}>
        {#each field.options ?? [] as option}
          <option value={option}>{option}</option>
        {/each}
      </select>
    {/if}
    
    {#if errors[field.name]}
      <p class="error">{errors[field.name]}</p>
    {/if}
  </div>
{/each}
```

## API Reference

### `generateFormFields(parameters: CapabilityParameter[]): FormFieldConfig[]`

Generates form field configurations from capability parameters.

**Parameters:**

- `parameters` - Array of capability parameters from integration metadata

**Returns:**

- Array of form field configurations with:
  - `name` - Field name
  - `label` - Human-readable label
  - `type` - Input type (text, number, checkbox, select, textarea)
  - `required` - Whether field is required
  - `description` - Optional field description
  - `defaultValue` - Optional default value
  - `placeholder` - Optional placeholder text
  - `options` - Options for select fields
  - `validation` - Validation rules

### `generateValidationRules(fields: FormFieldConfig[]): Record<string, ValidationRule>`

Extracts validation rules from form field configurations.

**Parameters:**

- `fields` - Array of form field configurations

**Returns:**

- Object mapping field names to validation rules

### `initializeFormData(fields: FormFieldConfig[]): Record<string, unknown>`

Initializes form data with default values.

**Parameters:**

- `fields` - Array of form field configurations

**Returns:**

- Object with initial form data values

## Supported Parameter Types

| Parameter Type | Input Type | Default Value |
|---------------|------------|---------------|
| `string` | `text` | `''` |
| `number` | `number` | `undefined` |
| `boolean` | `checkbox` | `false` |
| `array` | `textarea` | `''` |
| `object` | `textarea` | `''` |

## Validation Support

The form generator automatically applies validation rules from parameter metadata:

- **Required fields**: `required: true`
- **Numeric ranges**: `validation: { min: 100, max: 999 }`
- **String patterns**: `validation: { pattern: '^[a-z0-9-]+$' }`
- **Enum values**: `validation: { enum: ['option1', 'option2'] }` (renders as select)

## Label Generation

Field labels are automatically generated from parameter names:

- `vmid` → "VM ID"
- `ostemplate` → "Ostemplate"
- `cpu_cores` → "CPU Cores"
- `memorySize` → "Memory Size"

Common abbreviations (VM, CPU, OS, ID, IP, URL, API) are automatically capitalized.

## Example Component

See `formGenerator.example.svelte` for a complete working example demonstrating:

- Dynamic form generation
- Real-time validation
- Form submission
- Error handling
- Form reset

## Testing

The form generator includes comprehensive unit tests covering:

- Field generation from various parameter types
- Label generation
- Validation rule extraction
- Form data initialization
- Integration with real capability metadata

Run tests:

```bash
npm test -- formGenerator.test.ts
```

## Integration with Existing Code

The form generator integrates seamlessly with:

- `validation.ts` - Uses existing validation utilities
- `types/provisioning.ts` - Uses standard type definitions
- Svelte 5 runes - Compatible with `$state` and `$derived`

## Future Enhancements

Potential improvements:

- Support for nested object parameters
- Custom field renderers
- Conditional field visibility
- Field dependencies
- Advanced validation (async, cross-field)
