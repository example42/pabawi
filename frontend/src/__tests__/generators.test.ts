/**
 * Tests for custom fast-check generators
 *
 * These tests verify that generators produce valid data structures
 * that conform to the expected types and constraints.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  integrationArbitrary,
  provisioningCapabilityArbitrary,
  capabilityParameterArbitrary,
  lifecycleActionArbitrary,
  nodeStateArbitrary,
  proxmoxVMParamsArbitrary,
  proxmoxLXCParamsArbitrary,
  provisioningResultArbitrary,
  userPermissionsArbitrary,
  validVMFormDataArbitrary,
  invalidVMFormDataArbitrary
} from './generators';

describe('generators', () => {
  it('integrationArbitrary produces valid integrations', () => {
    fc.assert(
      fc.property(integrationArbitrary(), (integration) => {
        expect(integration).toHaveProperty('name');
        expect(integration).toHaveProperty('displayName');
        expect(integration).toHaveProperty('type');
        expect(integration).toHaveProperty('status');
        expect(integration).toHaveProperty('capabilities');
        expect(Array.isArray(integration.capabilities)).toBe(true);
        expect(['virtualization', 'cloud', 'container']).toContain(integration.type);
        expect(['connected', 'degraded', 'not_configured']).toContain(integration.status);
      }),
      { numRuns: 50 }
    );
  });

  it('provisioningCapabilityArbitrary produces valid capabilities', () => {
    fc.assert(
      fc.property(provisioningCapabilityArbitrary(), (capability) => {
        expect(capability).toHaveProperty('name');
        expect(capability).toHaveProperty('description');
        expect(capability).toHaveProperty('operation');
        expect(capability).toHaveProperty('parameters');
        expect(['create', 'destroy']).toContain(capability.operation);
        expect(Array.isArray(capability.parameters)).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  it('capabilityParameterArbitrary produces valid parameters', () => {
    fc.assert(
      fc.property(capabilityParameterArbitrary(), (param) => {
        expect(param).toHaveProperty('name');
        expect(param).toHaveProperty('type');
        expect(param).toHaveProperty('required');
        expect(['string', 'number', 'boolean', 'object', 'array']).toContain(param.type);
        expect(typeof param.required).toBe('boolean');
      }),
      { numRuns: 50 }
    );
  });

  it('lifecycleActionArbitrary produces valid actions', () => {
    fc.assert(
      fc.property(lifecycleActionArbitrary(), (action) => {
        expect(action).toHaveProperty('name');
        expect(action).toHaveProperty('displayName');
        expect(action).toHaveProperty('description');
        expect(action).toHaveProperty('requiresConfirmation');
        expect(action).toHaveProperty('destructive');
        expect(action).toHaveProperty('availableWhen');
        expect(Array.isArray(action.availableWhen)).toBe(true);
        expect(typeof action.requiresConfirmation).toBe('boolean');
        expect(typeof action.destructive).toBe('boolean');
      }),
      { numRuns: 50 }
    );
  });

  it('nodeStateArbitrary produces valid states', () => {
    fc.assert(
      fc.property(nodeStateArbitrary(), (state) => {
        expect(['stopped', 'running', 'suspended', 'paused', 'unknown']).toContain(state);
      }),
      { numRuns: 50 }
    );
  });

  it('proxmoxVMParamsArbitrary produces valid VM parameters', () => {
    fc.assert(
      fc.property(proxmoxVMParamsArbitrary(), (params) => {
        expect(params).toHaveProperty('vmid');
        expect(params).toHaveProperty('name');
        expect(params).toHaveProperty('node');
        expect(params.vmid).toBeGreaterThanOrEqual(100);
        expect(params.vmid).toBeLessThanOrEqual(999999999);
        expect(typeof params.name).toBe('string');
        expect(typeof params.node).toBe('string');

        if (params.cores !== undefined && params.cores !== null) {
          expect(params.cores).toBeGreaterThanOrEqual(1);
          expect(params.cores).toBeLessThanOrEqual(64);
        }

        if (params.memory !== undefined && params.memory !== null) {
          expect(params.memory).toBeGreaterThanOrEqual(512);
          expect(params.memory).toBeLessThanOrEqual(65536);
        }
      }),
      { numRuns: 50 }
    );
  });

  it('proxmoxLXCParamsArbitrary produces valid LXC parameters', () => {
    fc.assert(
      fc.property(proxmoxLXCParamsArbitrary(), (params) => {
        expect(params).toHaveProperty('vmid');
        expect(params).toHaveProperty('hostname');
        expect(params).toHaveProperty('node');
        expect(params).toHaveProperty('ostemplate');
        expect(params.vmid).toBeGreaterThanOrEqual(100);
        expect(params.vmid).toBeLessThanOrEqual(999999999);
        expect(typeof params.hostname).toBe('string');
        expect(typeof params.node).toBe('string');
        expect(typeof params.ostemplate).toBe('string');

        if (params.cores !== undefined && params.cores !== null) {
          expect(params.cores).toBeGreaterThanOrEqual(1);
          expect(params.cores).toBeLessThanOrEqual(64);
        }

        if (params.memory !== undefined && params.memory !== null) {
          expect(params.memory).toBeGreaterThanOrEqual(512);
          expect(params.memory).toBeLessThanOrEqual(65536);
        }
      }),
      { numRuns: 50 }
    );
  });

  it('provisioningResultArbitrary produces valid results', () => {
    fc.assert(
      fc.property(provisioningResultArbitrary(), (result) => {
        expect(result).toHaveProperty('success');
        expect(result).toHaveProperty('message');
        expect(typeof result.success).toBe('boolean');
        expect(typeof result.message).toBe('string');

        if (result.success) {
          expect(result.error).toBeUndefined();
        } else {
          expect(result.error).toBeDefined();
        }
      }),
      { numRuns: 50 }
    );
  });

  it('userPermissionsArbitrary produces valid permissions', () => {
    fc.assert(
      fc.property(userPermissionsArbitrary(), (permissions) => {
        expect(permissions).toHaveProperty('canProvision');
        expect(permissions).toHaveProperty('canManageVMs');
        expect(permissions).toHaveProperty('canDestroyVMs');
        expect(permissions).toHaveProperty('allowedIntegrations');
        expect(permissions).toHaveProperty('allowedActions');
        expect(typeof permissions.canProvision).toBe('boolean');
        expect(typeof permissions.canManageVMs).toBe('boolean');
        expect(typeof permissions.canDestroyVMs).toBe('boolean');
        expect(Array.isArray(permissions.allowedIntegrations)).toBe(true);
        expect(Array.isArray(permissions.allowedActions)).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  it('validVMFormDataArbitrary produces valid form data', () => {
    fc.assert(
      fc.property(validVMFormDataArbitrary(), (formData) => {
        expect(formData).toHaveProperty('vmid');
        expect(formData).toHaveProperty('name');
        expect(formData).toHaveProperty('node');
        expect(typeof formData.vmid).toBe('number');
        expect(formData.vmid).toBeGreaterThanOrEqual(100);
        expect(formData.vmid).toBeLessThanOrEqual(999999999);
        expect(typeof formData.name).toBe('string');
        expect(typeof formData.node).toBe('string');
      }),
      { numRuns: 50 }
    );
  });

  it('invalidVMFormDataArbitrary produces data with expected errors', () => {
    fc.assert(
      fc.property(invalidVMFormDataArbitrary(), (formWithErrors) => {
        expect(formWithErrors).toHaveProperty('data');
        expect(formWithErrors).toHaveProperty('expectedErrors');
        expect(Array.isArray(formWithErrors.expectedErrors)).toBe(true);
        expect(formWithErrors.expectedErrors.length).toBeGreaterThan(0);
      }),
      { numRuns: 50 }
    );
  });
});
