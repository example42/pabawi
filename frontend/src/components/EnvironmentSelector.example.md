# EnvironmentSelector Component

A Svelte component for displaying and managing Puppet environments from Puppetserver.

## Features

- Display list of available Puppet environments
- Show environment metadata (name, last deployed timestamp, status)
- Environment selection interface
- Optional environment deployment trigger
- Loading and error states
- Confirmation dialog for deployments
- Automatic refresh capability

## Props

```typescript
interface EnvironmentSelectorProps {
  selectedEnvironment?: string;  // Currently selected environment (bindable)
  onSelect?: (environment: string) => void;  // Callback when environment is selected
  showDeployButton?: boolean;  // Show deploy button for each environment (default: false)
}
```

## Usage Examples

### Basic Usage (Selection Only)

```svelte
<script lang="ts">
  import EnvironmentSelector from './components/EnvironmentSelector.svelte';
  
  let selectedEnv = $state<string>();
  
  function handleSelect(env: string) {
    console.log('Selected environment:', env);
  }
</script>

<EnvironmentSelector 
  bind:selectedEnvironment={selectedEnv}
  onSelect={handleSelect}
/>
```

### With Deployment Support

```svelte
<script lang="ts">
  import EnvironmentSelector from './components/EnvironmentSelector.svelte';
  
  let selectedEnv = $state<string>();
</script>

<EnvironmentSelector 
  bind:selectedEnvironment={selectedEnv}
  showDeployButton={true}
/>
```

### In a Page Component

```svelte
<script lang="ts">
  import EnvironmentSelector from '../components/EnvironmentSelector.svelte';
  
  let selectedEnvironment = $state<string>();
  
  $effect(() => {
    if (selectedEnvironment) {
      console.log('Environment changed to:', selectedEnvironment);
      // Load environment-specific data
    }
  });
</script>

<div class="container mx-auto px-4 py-8">
  <EnvironmentSelector 
    bind:selectedEnvironment
    showDeployButton={true}
  />
  
  {#if selectedEnvironment}
    <div class="mt-6">
      <h2>Selected: {selectedEnvironment}</h2>
      <!-- Display environment-specific content -->
    </div>
  {/if}
</div>
```

## API Endpoints Used

- `GET /api/integrations/puppetserver/environments` - List all environments
- `POST /api/integrations/puppetserver/environments/:name/deploy` - Deploy an environment

## Environment Data Structure

```typescript
interface Environment {
  name: string;
  last_deployed?: string;  // ISO 8601 timestamp
  status?: 'deployed' | 'deploying' | 'failed';
}
```

## Component Behavior

### Visual States

- **Selected**: Highlighted with primary color and checkmark icon
- **Deploying**: Shows spinner and disabled state
- **Status Badges**: Color-coded badges for deployment status
  - Green: deployed
  - Blue: deploying
  - Red: failed
  - Gray: unknown

### Error Handling

- Displays error messages when environment loading fails
- Shows actionable error messages for deployment failures
- Graceful degradation when Puppetserver is unavailable

### Accessibility

- Proper ARIA labels and roles
- Keyboard navigation support
- Screen reader friendly
- Focus management in dialogs

## Requirements Validated

This component validates the following requirements from the Puppetserver integration spec:

- **7.2**: Display environment names and metadata
- **7.3**: Environment selection interface
- **7.4**: Environment deployment trigger (when enabled)
- **7.5**: Display deployment timestamp and status
