# Design Document: Proxmox Frontend UI

## Overview

This design document specifies the frontend implementation for Proxmox provisioning capabilities in the Pabawi web interface. The feature adds a new Provision page for creating VMs and LXC containers, a Manage tab on node detail pages for lifecycle operations, and integration setup UI for Proxmox configuration.

The design follows a dynamic, integration-agnostic architecture that discovers provisioning capabilities from the backend at runtime. This approach ensures the frontend automatically supports new integrations (EC2, Azure, Terraform) without code changes, while maintaining type safety and proper error handling.

### Key Design Principles

1. **Dynamic Discovery**: Frontend queries backend for available integrations and their capabilities
2. **RBAC Integration**: All UI elements respect user permissions from the backend
3. **Extensibility**: Generic components support multiple integration types
4. **Type Safety**: TypeScript interfaces for all API contracts
5. **Error Handling**: Comprehensive validation and user feedback
6. **State Management**: Svelte 5 runes for reactive state

### Technology Stack

- **Framework**: Svelte 5 with runes-based reactivity
- **Routing**: Custom router with URL parameter support
- **API Client**: Existing `api.ts` with retry logic and auth integration
- **Styling**: Tailwind CSS (existing pattern)
- **State**: Svelte 5 `$state` and `$derived` runes
- **Testing**: Vitest with property-based testing

## Architecture

### Component Hierarchy

```
ProvisionPage
├── IntegrationSelector (if multiple integrations)
├── ProxmoxProvisionForm
│   ├── VMCreateForm
│   └── LXCCreateForm
└── ProvisioningHistory (optional)

NodeDetailPage (existing)
└── ManageTab (new)
    ├── LifecycleActions
    │   ├── StartButton
    │   ├── StopButton
    │   ├── RebootButton
    │   └── DestroyButton
    └── ActionConfirmationDialog

IntegrationSetupPage (existing)
└── ProxmoxSetupGuide (new)
    ├── ConfigurationForm
    └── ConnectionTest
```

### Data Flow

1. **Page Load**: Component queries `/api/integrations/provisioning` for available integrations
2. **Capability Discovery**: For each integration, fetch supported operations and parameters
3. **Permission Check**: Backend returns only permitted actions for current user
4. **Form Rendering**: Dynamic form generation based on capability metadata
5. **Action Execution**: POST to integration-specific endpoint with parameters
6. **Status Polling**: Monitor operation status and display results

### API Integration Points

The frontend will interact with these backend endpoints:

```typescript
// Integration discovery
GET /api/integrations/provisioning
Response: {
  integrations: Array<{
    name: string;
    type: string;
    capabilities: ProvisioningCapability[];
  }>;
}

// Proxmox VM creation
POST /api/integrations/proxmox/provision/vm
Body: VMCreateParams
Response: { taskId: string; vmid: number; }

// Proxmox LXC creation
POST /api/integrations/proxmox/provision/lxc
Body: LXCCreateParams
Response: { taskId: string; vmid: number; }

// Node lifecycle actions
POST /api/integrations/proxmox/nodes/:nodeId/action
Body: { action: string; parameters?: Record<string, unknown> }
Response: { taskId: string; status: string; }

// Node destruction
DELETE /api/integrations/proxmox/nodes/:nodeId
Response: { taskId: string; status: string; }

// Integration configuration
PUT /api/integrations/proxmox/config
Body: ProxmoxConfig
Response: { success: boolean; }

// Connection test
POST /api/integrations/proxmox/test
Body: ProxmoxConfig
Response: { success: boolean; message: string; }
```

## Components and Interfaces

### Core Types

```typescript
// Integration capability metadata
interface ProvisioningCapability {
  name: string;
  description: string;
  operation: 'create' | 'destroy';
  parameters: CapabilityParameter[];
}

interface CapabilityParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description?: string;
  default?: unknown;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };
}

// Integration metadata
interface ProvisioningIntegration {
  name: string;
  displayName: string;
  type: 'virtualization' | 'cloud' | 'container';
  status: 'connected' | 'degraded' | 'not_configured';
  capabilities: ProvisioningCapability[];
}

// Proxmox-specific types
interface ProxmoxVMParams {
  vmid: number;
  name: string;
  node: string;
  cores?: number;
  memory?: number;
  sockets?: number;
  cpu?: string;
  scsi0?: string;
  ide2?: string;
  net0?: string;
  ostype?: string;
}

interface ProxmoxLXCParams {
  vmid: number;
  hostname: string;
  node: string;
  ostemplate: string;
  cores?: number;
  memory?: number;
  rootfs?: string;
  net0?: string;
  password?: string;
}

// Lifecycle action types
interface LifecycleAction {
  name: string;
  displayName: string;
  description: string;
  requiresConfirmation: boolean;
  destructive: boolean;
  availableWhen: string[]; // Node states when action is available
}

// Operation result
interface ProvisioningResult {
  success: boolean;
  taskId?: string;
  vmid?: number;
  nodeId?: string;
  message: string;
  error?: string;
}
```

### ProvisionPage Component

**Purpose**: Main page for creating new VMs and containers

**State Management**:

```typescript
let integrations = $state<ProvisioningIntegration[]>([]);
let selectedIntegration = $state<string>('proxmox');
let loading = $state(true);
let error = $state<string | null>(null);
```

**Key Functions**:

- `fetchIntegrations()`: Load available provisioning integrations
- `selectIntegration(name: string)`: Switch between integrations
- `handleProvisionSuccess(result: ProvisioningResult)`: Navigate to new node

**Routing**: `/provision`

**RBAC**: Hidden from navigation if user lacks provisioning permissions

### ProxmoxProvisionForm Component

**Purpose**: Tabbed interface for VM and LXC creation

**State Management**:

```typescript
let activeTab = $state<'vm' | 'lxc'>('vm');
let formData = $state<ProxmoxVMParams | ProxmoxLXCParams>({});
let validationErrors = $state<Record<string, string>>({});
let submitting = $state(false);
```

**Key Functions**:

- `validateForm()`: Client-side validation before submission
- `submitForm()`: POST to provisioning endpoint
- `resetForm()`: Clear form after successful submission

**Validation Rules**:

- VMID: Required, positive integer, unique
- Name/Hostname: Required, alphanumeric with hyphens
- Node: Required, must be valid Proxmox node
- Memory: Optional, minimum 512MB
- Cores: Optional, minimum 1

### ManageTab Component

**Purpose**: Lifecycle actions on node detail page

**State Management**:

```typescript
let availableActions = $state<LifecycleAction[]>([]);
let nodeStatus = $state<string>('unknown');
let actionInProgress = $state<string | null>(null);
let confirmDialog = $state<{ action: string; open: boolean }>({ action: '', open: false });
```

**Key Functions**:

- `fetchAvailableActions()`: Query backend for permitted actions
- `executeAction(action: string)`: Perform lifecycle operation
- `confirmDestructiveAction(action: string)`: Show confirmation dialog
- `pollActionStatus(taskId: string)`: Monitor operation completion

**Action Availability Logic**:

```typescript
const actionAvailability = {
  start: ['stopped'],
  stop: ['running'],
  shutdown: ['running'],
  reboot: ['running'],
  suspend: ['running'],
  resume: ['suspended'],
  destroy: ['stopped', 'running', 'suspended']
};
```

### ProxmoxSetupGuide Component

**Purpose**: Configuration form for Proxmox integration

**State Management**:

```typescript
let config = $state<ProxmoxConfig>({
  host: '',
  port: 8006,
  username: '',
  password: '',
  realm: 'pam',
  ssl: { rejectUnauthorized: true }
});
let testResult = $state<{ success: boolean; message: string } | null>(null);
let saving = $state(false);
```

**Key Functions**:

- `testConnection()`: Verify Proxmox connectivity
- `saveConfiguration()`: Persist config to backend
- `validateConfig()`: Client-side validation

**Validation Rules**:

- Host: Required, valid hostname or IP
- Port: Required, 1-65535
- Authentication: Either (username + password + realm) OR token
- SSL: Warning if rejectUnauthorized is false

### Form Validation Utilities

**Purpose**: Reusable validation functions

```typescript
// lib/validation.ts
export function validateVMID(vmid: number): string | null {
  if (!vmid || vmid < 100 || vmid > 999999999) {
    return 'VMID must be between 100 and 999999999';
  }
  return null;
}

export function validateHostname(hostname: string): string | null {
  const pattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
  if (!pattern.test(hostname)) {
    return 'Hostname must contain only lowercase letters, numbers, and hyphens';
  }
  return null;
}

export function validateMemory(memory: number): string | null {
  if (memory < 512) {
    return 'Memory must be at least 512 MB';
  }
  return null;
}

export function validateRequired(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined || value === '') {
    return `${fieldName} is required`;
  }
  return null;
}
```

## Data Models

### Frontend State Models

```typescript
// Provisioning state
interface ProvisioningState {
  integrations: ProvisioningIntegration[];
  selectedIntegration: string | null;
  loading: boolean;
  error: string | null;
}

// Form state
interface FormState<T> {
  data: T;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
  submitting: boolean;
  submitError: string | null;
}

// Action state
interface ActionState {
  availableActions: LifecycleAction[];
  executingAction: string | null;
  lastResult: ProvisioningResult | null;
}
```

### API Response Models

```typescript
// Integration list response
interface IntegrationListResponse {
  integrations: ProvisioningIntegration[];
  _debug?: DebugInfo;
}

// Provisioning response
interface ProvisioningResponse {
  success: boolean;
  taskId: string;
  vmid?: number;
  nodeId?: string;
  message: string;
  _debug?: DebugInfo;
}

// Action response
interface ActionResponse {
  success: boolean;
  taskId: string;
  status: string;
  message: string;
  _debug?: DebugInfo;
}

// Configuration response
interface ConfigResponse {
  success: boolean;
  message: string;
  _debug?: DebugInfo;
}
```

### Navigation Updates

```typescript
// Add to Router.svelte routes
const routes = {
  '/': HomePage,
  '/provision': { component: ProvisionPage, requiresAuth: true },
  '/nodes/:id': NodeDetailPage,
  '/setup/:integration': IntegrationSetupPage,
  // ... existing routes
};
```

### Navigation Component Updates

```typescript
// Add to Navigation.svelte
{#if authManager.isAuthenticated && hasProvisioningPermission}
  <a href="/provision" use:link class="nav-link">
    <svg><!-- provision icon --></svg>
    Provision
  </a>
{/if}
```

## Data Models (continued)

### Permission Model

```typescript
// User permissions (from auth context)
interface UserPermissions {
  canProvision: boolean;
  canManageVMs: boolean;
  canDestroyVMs: boolean;
  allowedIntegrations: string[];
  allowedActions: string[];
}

// Permission check utility
function hasPermission(action: string, integration: string): boolean {
  const permissions = authManager.user?.permissions;
  if (!permissions) return false;
  
  return permissions.allowedActions.includes(action) &&
         permissions.allowedIntegrations.includes(integration);
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, I identified the following redundancies:

- Properties 6.4-6.7 cover action execution, success handling, error handling, and loading states for all lifecycle actions
- Properties 11.2-11.5 all test form validation for different field types and can be combined into comprehensive validation properties
- Properties 12.1-12.7 cover error and success notification patterns that apply across all operations
- Multiple "example" tests for VM and LXC operations follow the same patterns and can be consolidated

The properties below represent the unique, non-redundant correctness guarantees for this feature.

### Property 1: Integration Discovery and Display

*For any* list of provisioning integrations returned by the backend, the Provision page should display all integrations that have at least one provisioning capability, and hide integrations with zero capabilities.

**Validates: Requirements 1.4, 2.2, 2.3**

### Property 2: Permission-Based UI Visibility

*For any* UI element (menu item, button, form, tab) that requires a specific permission, if the current user lacks that permission, the element should not be rendered in the DOM.

**Validates: Requirements 1.3, 5.4, 9.2, 9.3**

### Property 3: Action Button Availability

*For any* lifecycle action and node state combination, action buttons should only be displayed when the node's current state matches one of the action's `availableWhen` states.

**Validates: Requirements 6.1, 6.2, 6.3**

### Property 4: Action Execution Triggers API Call

*For any* lifecycle action button that is clicked, the frontend should send an API request to the integration endpoint with the correct action name and node identifier.

**Validates: Requirements 6.4**

### Property 5: Successful Action Handling

*For any* action that completes successfully, the frontend should display a success notification containing relevant details and refresh the node status data.

**Validates: Requirements 6.5, 12.5**

### Property 6: Failed Action Error Display

*For any* action that fails, the frontend should display an error notification containing the error message from the backend response.

**Validates: Requirements 6.6, 12.1, 12.2**

### Property 7: Loading State During Actions

*For any* action that is in progress, all action buttons should be disabled and a loading indicator should be visible until the action completes or fails.

**Validates: Requirements 3.6, 4.6, 6.7**

### Property 8: Form Validation Completeness

*For any* form field with validation rules (required, format, range, length), submitting the form with invalid data should display an error message for that field and prevent submission.

**Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5**

### Property 9: Valid Form Enables Submission

*For any* form where all fields pass their validation rules, the submit button should be enabled and submission should be allowed.

**Validates: Requirements 11.6**

### Property 10: Configuration Validation

*For any* Proxmox configuration form submission, all required fields (host, port, authentication) must be validated before the configuration is sent to the backend.

**Validates: Requirements 10.3**

### Property 11: Error Notification Persistence

*For any* error notification displayed to the user, it should remain visible until explicitly dismissed by the user (no auto-dismiss).

**Validates: Requirements 12.7**

### Property 12: Success Notification Auto-Dismiss

*For any* success notification displayed to the user, it should automatically dismiss after exactly 5 seconds.

**Validates: Requirements 12.6**

### Property 13: Error Details Expandability

*For any* error response that includes additional details beyond the main message, those details should be available in an expandable section of the error notification.

**Validates: Requirements 12.3**

### Property 14: Error Logging

*For any* error that occurs (API failure, validation error, unexpected exception), the error should be logged to the browser console with sufficient context for debugging.

**Validates: Requirements 12.4**

### Property 15: Dynamic Form Generation

*For any* integration capability with parameter metadata, the frontend should generate form fields matching the parameter types, validation rules, and default values specified in the metadata.

**Validates: Requirements 13.1, 13.4**

### Property 16: Integration Extensibility

*For any* new provisioning integration added to the backend with valid capability metadata, the frontend should automatically discover it on the next page load and render appropriate UI without code changes.

**Validates: Requirements 13.3**

### Property 17: Dynamic Action Rendering

*For any* set of lifecycle capabilities returned by the backend for a node, the Manage tab should render action buttons based on the capability metadata rather than hardcoded action names.

**Validates: Requirements 13.5**

## Error Handling

### Error Categories

The frontend will handle these error categories:

1. **Network Errors**: Connection failures, timeouts
2. **Authentication Errors**: 401 responses, expired tokens
3. **Authorization Errors**: 403 responses, insufficient permissions
4. **Validation Errors**: 400 responses, invalid input
5. **Not Found Errors**: 404 responses, missing resources
6. **Server Errors**: 500+ responses, backend failures

### Error Handling Strategy

```typescript
// Centralized error handler
function handleApiError(error: unknown, context: string): void {
  // Log to console for debugging
  logger.error(context, 'API error', error);
  
  // Extract error message
  const message = error instanceof Error ? error.message : 'Unknown error';
  
  // Categorize and display appropriate notification
  if (message.includes('401') || message.includes('unauthorized')) {
    showError('Authentication required', 'Please log in and try again');
    router.navigate('/login');
  } else if (message.includes('403') || message.includes('permission')) {
    showError('Permission denied', 'You do not have permission for this action');
  } else if (message.includes('404')) {
    showError('Not found', 'The requested resource does not exist');
  } else if (message.includes('timeout')) {
    showError('Request timed out', 'The operation took too long. Please try again');
  } else {
    showError('Operation failed', message);
  }
}
```

### Form Validation Errors

```typescript
// Validation error display
interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

function validateForm(data: Record<string, unknown>, rules: ValidationRules): ValidationResult {
  const errors: Record<string, string> = {};
  
  for (const [field, rule] of Object.entries(rules)) {
    const value = data[field];
    
    // Required validation
    if (rule.required && !value) {
      errors[field] = `${rule.label} is required`;
      continue;
    }
    
    // Type-specific validation
    if (value) {
      if (rule.type === 'number') {
        const num = Number(value);
        if (isNaN(num)) {
          errors[field] = `${rule.label} must be a number`;
        } else if (rule.min !== undefined && num < rule.min) {
          errors[field] = `${rule.label} must be at least ${rule.min}`;
        } else if (rule.max !== undefined && num > rule.max) {
          errors[field] = `${rule.label} must be at most ${rule.max}`;
        }
      } else if (rule.type === 'string') {
        const str = String(value);
        if (rule.minLength && str.length < rule.minLength) {
          errors[field] = `${rule.label} must be at least ${rule.minLength} characters`;
        } else if (rule.maxLength && str.length > rule.maxLength) {
          errors[field] = `${rule.label} must be at most ${rule.maxLength} characters`;
        } else if (rule.pattern && !rule.pattern.test(str)) {
          errors[field] = rule.patternMessage || `${rule.label} format is invalid`;
        }
      }
    }
  }
  
  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}
```

### Retry Logic

The existing `api.ts` module provides retry logic for transient failures. Provisioning operations will use custom retry settings:

```typescript
// Provisioning operations - no retries (user-initiated)
await post('/api/integrations/proxmox/provision/vm', params, {
  maxRetries: 0,
  showRetryNotifications: false
});

// Status queries - retry with backoff
await get('/api/integrations/provisioning', {
  maxRetries: 2,
  retryDelay: 1000
});
```

### User Feedback

All operations provide immediate feedback:

1. **Loading States**: Spinners, disabled buttons, progress indicators
2. **Success Messages**: Toast notifications with action details
3. **Error Messages**: Toast notifications with actionable guidance
4. **Validation Feedback**: Inline error messages below form fields
5. **Confirmation Dialogs**: For destructive actions (destroy VM/LXC)

## Testing Strategy

### Dual Testing Approach

This feature will use both unit tests and property-based tests for comprehensive coverage:

- **Unit Tests**: Verify specific examples, edge cases, and integration points
- **Property Tests**: Verify universal properties across all inputs

### Unit Testing Focus

Unit tests will cover:

1. **Component Rendering**: Specific UI elements render correctly
2. **User Interactions**: Click handlers, form submissions, navigation
3. **Edge Cases**: Empty states, loading states, error states
4. **Integration Points**: API client calls, router navigation, auth checks
5. **Specific Examples**: VM creation with valid data, LXC destruction flow

Example unit tests:

```typescript
// Component rendering
test('ProvisionPage displays Proxmox integration when available', async () => {
  const mockIntegrations = [{ name: 'proxmox', capabilities: [...] }];
  // Mock API response and verify rendering
});

// User interaction
test('clicking Start button calls executeAction with correct parameters', async () => {
  const mockExecuteAction = vi.fn();
  // Render component, click button, verify API call
});

// Edge case
test('ManageTab shows "no actions available" when user has no permissions', () => {
  // Render with empty permissions, verify message
});
```

### Property-Based Testing Configuration

**Library**: fast-check (JavaScript/TypeScript property-based testing)

**Configuration**:

- Minimum 100 iterations per property test
- Each test tagged with feature name and property reference
- Custom generators for domain types (integrations, capabilities, permissions)

**Tag Format**: `Feature: proxmox-frontend-ui, Property {number}: {property_text}`

Example property tests:

```typescript
import fc from 'fast-check';

// Property 1: Integration Discovery and Display
test('Feature: proxmox-frontend-ui, Property 1: displays integrations with capabilities', () => {
  fc.assert(
    fc.property(
      fc.array(integrationArbitrary()),
      (integrations) => {
        const displayed = filterDisplayableIntegrations(integrations);
        const expected = integrations.filter(i => i.capabilities.length > 0);
        expect(displayed).toEqual(expected);
      }
    ),
    { numRuns: 100 }
  );
});

// Property 8: Form Validation Completeness
test('Feature: proxmox-frontend-ui, Property 8: invalid fields prevent submission', () => {
  fc.assert(
    fc.property(
      fc.record({
        vmid: fc.integer({ min: -1000, max: 1000000000 }),
        name: fc.string(),
        memory: fc.integer({ min: 0, max: 100000 })
      }),
      (formData) => {
        const result = validateVMForm(formData);
        const hasInvalidVMID = formData.vmid < 100 || formData.vmid > 999999999;
        const hasInvalidMemory = formData.memory < 512;
        const hasInvalidName = !formData.name || formData.name.length === 0;
        
        if (hasInvalidVMID || hasInvalidMemory || hasInvalidName) {
          expect(result.valid).toBe(false);
          expect(Object.keys(result.errors).length).toBeGreaterThan(0);
        }
      }
    ),
    { numRuns: 100 }
  );
});

// Property 15: Dynamic Form Generation
test('Feature: proxmox-frontend-ui, Property 15: generates fields from metadata', () => {
  fc.assert(
    fc.property(
      fc.array(capabilityParameterArbitrary()),
      (parameters) => {
        const fields = generateFormFields(parameters);
        expect(fields.length).toBe(parameters.length);
        
        parameters.forEach((param, index) => {
          expect(fields[index].name).toBe(param.name);
          expect(fields[index].type).toBe(param.type);
          expect(fields[index].required).toBe(param.required);
        });
      }
    ),
    { numRuns: 100 }
  );
});
```

### Custom Generators

```typescript
// Generator for provisioning integrations
function integrationArbitrary(): fc.Arbitrary<ProvisioningIntegration> {
  return fc.record({
    name: fc.constantFrom('proxmox', 'ec2', 'azure', 'terraform'),
    displayName: fc.string(),
    type: fc.constantFrom('virtualization', 'cloud', 'container'),
    status: fc.constantFrom('connected', 'degraded', 'not_configured'),
    capabilities: fc.array(capabilityArbitrary(), { minLength: 0, maxLength: 10 })
  });
}

// Generator for capability parameters
function capabilityParameterArbitrary(): fc.Arbitrary<CapabilityParameter> {
  return fc.record({
    name: fc.string({ minLength: 1 }),
    type: fc.constantFrom('string', 'number', 'boolean', 'object', 'array'),
    required: fc.boolean(),
    description: fc.option(fc.string()),
    default: fc.anything()
  });
}

// Generator for user permissions
function permissionsArbitrary(): fc.Arbitrary<UserPermissions> {
  return fc.record({
    canProvision: fc.boolean(),
    canManageVMs: fc.boolean(),
    canDestroyVMs: fc.boolean(),
    allowedIntegrations: fc.array(fc.string()),
    allowedActions: fc.array(fc.constantFrom('start', 'stop', 'reboot', 'destroy'))
  });
}
```

### Test Organization

```
frontend/src/
├── pages/
│   ├── ProvisionPage.test.ts (unit + property tests)
│   └── NodeDetailPage.test.ts (unit tests for ManageTab)
├── components/
│   ├── ProxmoxProvisionForm.test.ts (unit + property tests)
│   ├── ManageTab.test.ts (unit + property tests)
│   └── ProxmoxSetupGuide.test.ts (unit tests)
├── lib/
│   ├── validation.test.ts (property tests)
│   └── provisioning.test.ts (property tests)
└── __tests__/
    └── generators.ts (custom fast-check generators)
```

### Integration Testing

Integration tests will verify:

1. Full provisioning flow from form submission to success notification
2. Error handling across component boundaries
3. Navigation between pages
4. Permission checks across multiple components

### Test Execution

```bash
# Run all tests
npm test -- --silent

# Run specific test file
npm test -- ProvisionPage.test.ts --silent

# Run property tests only
npm test -- --grep "Property [0-9]+" --silent

# Run with coverage
npm test -- --coverage --silent
```

### Coverage Goals

- **Line Coverage**: > 80%
- **Branch Coverage**: > 75%
- **Function Coverage**: > 85%
- **Property Test Coverage**: All 17 properties implemented
