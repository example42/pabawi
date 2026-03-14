# Test Generators

This directory contains custom [fast-check](https://github.com/dubzzz/fast-check) generators for property-based testing of the Proxmox Frontend UI feature.

## Overview

Property-based testing verifies that properties (universal truths) hold across all valid inputs. These generators produce realistic test data for the provisioning system, enabling comprehensive testing without manually writing hundreds of test cases.

## Available Generators

### Core Types

- **`integrationArbitrary()`** - Generates provisioning integrations (Proxmox, EC2, Azure, etc.)
- **`provisioningCapabilityArbitrary()`** - Generates capability definitions (create_vm, destroy_vm, etc.)
- **`capabilityParameterArbitrary()`** - Generates parameter definitions with validation rules
- **`parameterValidationArbitrary()`** - Generates validation constraints

### Lifecycle & Actions

- **`lifecycleActionArbitrary()`** - Generates lifecycle actions (start, stop, reboot, destroy, etc.)
- **`nodeStateArbitrary()`** - Generates valid node states (running, stopped, suspended, etc.)

### Proxmox-Specific

- **`proxmoxVMParamsArbitrary()`** - Generates valid VM creation parameters
- **`proxmoxLXCParamsArbitrary()`** - Generates valid LXC container parameters

### Results & Permissions

- **`provisioningResultArbitrary()`** - Generates operation results (success/failure)
- **`userPermissionsArbitrary()`** - Generates RBAC permission sets

### Form Data

- **`validVMFormDataArbitrary()`** - Generates valid form data (passes validation)
- **`invalidVMFormDataArbitrary()`** - Generates invalid form data with expected errors

## Usage Example

```typescript
import fc from 'fast-check';
import { integrationArbitrary } from './__tests__/generators';

// Property test: integrations with capabilities should be displayed
test('displays integrations with capabilities', () => {
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
```

## Configuration

All generators are configured to produce realistic data:

- **VMID**: 100 to 999,999,999 (Proxmox valid range)
- **Memory**: 512 MB to 64 GB
- **Cores**: 1 to 64
- **Names/Hostnames**: Lowercase alphanumeric with hyphens
- **Node States**: Valid Proxmox states only

## Testing the Generators

Run generator tests to verify they produce valid data:

```bash
npm test -- generators.test.ts
```

## References

- [fast-check Documentation](https://github.com/dubzzz/fast-check/tree/main/documentation)
- [Property-Based Testing Guide](https://github.com/dubzzz/fast-check/blob/main/documentation/1-Guides/PropertyBasedTesting.md)
- Design Document: `pabawi/.kiro/specs/proxmox-frontend-ui/design.md`
