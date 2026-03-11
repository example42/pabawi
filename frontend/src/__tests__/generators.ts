/**
 * Custom fast-check generators for property-based testing
 *
 * These generators produce realistic test data for the Proxmox Frontend UI feature.
 * They generate valid data structures for integrations, capabilities, permissions,
 * and node states used throughout the provisioning system.
 *
 * Validates: Testing strategy requirements
 */

import fc from 'fast-check';
import type {
  ProvisioningIntegration,
  ProvisioningCapability,
  CapabilityParameter,
  ParameterValidation,
  LifecycleAction,
  ProxmoxVMParams,
  ProxmoxLXCParams,
  ProvisioningResult
} from '../lib/types/provisioning';

/**
 * Generates valid parameter validation rules
 */
export function parameterValidationArbitrary(): fc.Arbitrary<ParameterValidation> {
  return fc.record({
    min: fc.option(fc.integer({ min: 0, max: 1000 })),
    max: fc.option(fc.integer({ min: 1000, max: 999999999 })),
    pattern: fc.option(fc.constantFrom(
      '^[a-z0-9-]+$',
      '^[a-zA-Z0-9_-]+$',
      '^[0-9]+$'
    )),
    enum: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }))
  });
}

/**
 * Generates valid capability parameters with realistic constraints
 */
export function capabilityParameterArbitrary(): fc.Arbitrary<CapabilityParameter> {
  return fc.record({
    name: fc.constantFrom('vmid', 'name', 'hostname', 'node', 'cores', 'memory', 'ostemplate', 'password'),
    type: fc.constantFrom('string', 'number', 'boolean', 'object', 'array'),
    required: fc.boolean(),
    description: fc.option(fc.string({ minLength: 10, maxLength: 100 })),
    default: fc.option(fc.oneof(
      fc.string(),
      fc.integer(),
      fc.boolean(),
      fc.constant(null)
    )),
    validation: fc.option(parameterValidationArbitrary())
  });
}

/**
 * Generates valid provisioning capabilities
 */
export function provisioningCapabilityArbitrary(): fc.Arbitrary<ProvisioningCapability> {
  return fc.record({
    name: fc.constantFrom('create_vm', 'create_lxc', 'destroy_vm', 'destroy_lxc', 'start', 'stop'),
    description: fc.string({ minLength: 20, maxLength: 100 }),
    operation: fc.constantFrom('create', 'destroy'),
    parameters: fc.array(capabilityParameterArbitrary(), { minLength: 0, maxLength: 10 })
  });
}

/**
 * Generates valid provisioning integrations
 * Produces realistic integration data with varying capability counts
 */
export function integrationArbitrary(): fc.Arbitrary<ProvisioningIntegration> {
  return fc.record({
    name: fc.constantFrom('proxmox', 'ec2', 'azure', 'terraform', 'openstack'),
    displayName: fc.oneof(
      fc.constant('Proxmox VE'),
      fc.constant('Amazon EC2'),
      fc.constant('Azure Virtual Machines'),
      fc.constant('Terraform'),
      fc.constant('OpenStack')
    ),
    type: fc.constantFrom('virtualization', 'cloud', 'container'),
    status: fc.constantFrom('connected', 'degraded', 'not_configured'),
    capabilities: fc.array(provisioningCapabilityArbitrary(), { minLength: 0, maxLength: 10 })
  });
}

/**
 * Generates valid lifecycle actions with realistic state constraints
 */
export function lifecycleActionArbitrary(): fc.Arbitrary<LifecycleAction> {
  return fc.oneof(
    fc.record({
      name: fc.constant('start'),
      displayName: fc.constant('Start'),
      description: fc.constant('Start the virtual machine'),
      requiresConfirmation: fc.constant(false),
      destructive: fc.constant(false),
      availableWhen: fc.constant(['stopped'])
    }),
    fc.record({
      name: fc.constant('stop'),
      displayName: fc.constant('Stop'),
      description: fc.constant('Stop the virtual machine'),
      requiresConfirmation: fc.constant(false),
      destructive: fc.constant(false),
      availableWhen: fc.constant(['running'])
    }),
    fc.record({
      name: fc.constant('reboot'),
      displayName: fc.constant('Reboot'),
      description: fc.constant('Reboot the virtual machine'),
      requiresConfirmation: fc.constant(false),
      destructive: fc.constant(false),
      availableWhen: fc.constant(['running'])
    }),
    fc.record({
      name: fc.constant('shutdown'),
      displayName: fc.constant('Shutdown'),
      description: fc.constant('Gracefully shutdown the virtual machine'),
      requiresConfirmation: fc.constant(false),
      destructive: fc.constant(false),
      availableWhen: fc.constant(['running'])
    }),
    fc.record({
      name: fc.constant('suspend'),
      displayName: fc.constant('Suspend'),
      description: fc.constant('Suspend the virtual machine'),
      requiresConfirmation: fc.constant(false),
      destructive: fc.constant(false),
      availableWhen: fc.constant(['running'])
    }),
    fc.record({
      name: fc.constant('resume'),
      displayName: fc.constant('Resume'),
      description: fc.constant('Resume the virtual machine'),
      requiresConfirmation: fc.constant(false),
      destructive: fc.constant(false),
      availableWhen: fc.constant(['suspended'])
    }),
    fc.record({
      name: fc.constant('destroy'),
      displayName: fc.constant('Destroy'),
      description: fc.constant('Permanently delete the virtual machine'),
      requiresConfirmation: fc.constant(true),
      destructive: fc.constant(true),
      availableWhen: fc.constant(['stopped', 'running', 'suspended'])
    })
  );
}

/**
 * Generates valid node states
 */
export function nodeStateArbitrary(): fc.Arbitrary<string> {
  return fc.constantFrom('stopped', 'running', 'suspended', 'paused', 'unknown');
}

/**
 * Generates valid Proxmox VM parameters
 * Produces realistic VM configurations with proper constraints
 */
export function proxmoxVMParamsArbitrary(): fc.Arbitrary<ProxmoxVMParams> {
  return fc.record({
    vmid: fc.integer({ min: 100, max: 999999999 }),
    name: fc.string({ minLength: 1, maxLength: 50 }).map(s => s.toLowerCase().replace(/[^a-z0-9-]/g, '-')),
    node: fc.constantFrom('pve1', 'pve2', 'pve3', 'node1', 'node2'),
    cores: fc.option(fc.integer({ min: 1, max: 64 })),
    memory: fc.option(fc.integer({ min: 512, max: 65536 })),
    sockets: fc.option(fc.integer({ min: 1, max: 4 })),
    cpu: fc.option(fc.constantFrom('host', 'kvm64', 'qemu64')),
    scsi0: fc.option(fc.string()),
    ide2: fc.option(fc.string()),
    net0: fc.option(fc.string()),
    ostype: fc.option(fc.constantFrom('l26', 'win10', 'win11', 'other'))
  });
}

/**
 * Generates valid Proxmox LXC parameters
 * Produces realistic container configurations with proper constraints
 */
export function proxmoxLXCParamsArbitrary(): fc.Arbitrary<ProxmoxLXCParams> {
  return fc.record({
    vmid: fc.integer({ min: 100, max: 999999999 }),
    hostname: fc.string({ minLength: 1, maxLength: 50 }).map(s => s.toLowerCase().replace(/[^a-z0-9-]/g, '-')),
    node: fc.constantFrom('pve1', 'pve2', 'pve3', 'node1', 'node2'),
    ostemplate: fc.constantFrom(
      'local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst',
      'local:vztmpl/debian-12-standard_12.0-1_amd64.tar.zst',
      'local:vztmpl/alpine-3.18-default_20230607_amd64.tar.xz'
    ),
    cores: fc.option(fc.integer({ min: 1, max: 64 })),
    memory: fc.option(fc.integer({ min: 512, max: 65536 })),
    rootfs: fc.option(fc.string()),
    net0: fc.option(fc.string()),
    password: fc.option(fc.string({ minLength: 8, maxLength: 32 }))
  });
}

/**
 * Generates valid provisioning results
 */
export function provisioningResultArbitrary(): fc.Arbitrary<ProvisioningResult> {
  return fc.oneof(
    // Success case
    fc.record({
      success: fc.constant(true),
      taskId: fc.uuid(),
      vmid: fc.option(fc.integer({ min: 100, max: 999999999 })),
      nodeId: fc.option(fc.uuid()),
      message: fc.constantFrom(
        'VM created successfully',
        'LXC container created successfully',
        'Action completed successfully'
      ),
      error: fc.constant(undefined)
    }),
    // Error case
    fc.record({
      success: fc.constant(false),
      taskId: fc.option(fc.uuid()),
      vmid: fc.constant(undefined),
      nodeId: fc.constant(undefined),
      message: fc.constantFrom(
        'Failed to create VM',
        'Failed to create LXC container',
        'Action failed'
      ),
      error: fc.constantFrom(
        'Connection timeout',
        'Invalid parameters',
        'Insufficient permissions',
        'Resource not found',
        'Internal server error'
      )
    })
  );
}

/**
 * Generates user permissions for testing RBAC
 */
export interface UserPermissions {
  canProvision: boolean;
  canManageVMs: boolean;
  canDestroyVMs: boolean;
  allowedIntegrations: string[];
  allowedActions: string[];
}

export function userPermissionsArbitrary(): fc.Arbitrary<UserPermissions> {
  return fc.record({
    canProvision: fc.boolean(),
    canManageVMs: fc.boolean(),
    canDestroyVMs: fc.boolean(),
    allowedIntegrations: fc.array(
      fc.constantFrom('proxmox', 'ec2', 'azure', 'terraform'),
      { minLength: 0, maxLength: 4 }
    ),
    allowedActions: fc.array(
      fc.constantFrom('start', 'stop', 'reboot', 'shutdown', 'suspend', 'resume', 'destroy'),
      { minLength: 0, maxLength: 7 }
    )
  });
}

/**
 * Generates form data with validation errors
 * Useful for testing validation logic
 */
export interface FormDataWithErrors {
  data: Record<string, unknown>;
  expectedErrors: string[];
}

export function invalidVMFormDataArbitrary(): fc.Arbitrary<FormDataWithErrors> {
  return fc.oneof(
    // Invalid VMID (too low)
    fc.record({
      data: fc.record({
        vmid: fc.integer({ min: -1000, max: 99 }),
        name: fc.string({ minLength: 1 }),
        node: fc.string({ minLength: 1 })
      }),
      expectedErrors: fc.constant(['vmid'])
    }),
    // Invalid VMID (too high)
    fc.record({
      data: fc.record({
        vmid: fc.integer({ min: 1000000000, max: 2000000000 }),
        name: fc.string({ minLength: 1 }),
        node: fc.string({ minLength: 1 })
      }),
      expectedErrors: fc.constant(['vmid'])
    }),
    // Missing required fields
    fc.record({
      data: fc.record({
        vmid: fc.option(fc.integer({ min: 100, max: 999999999 })),
        name: fc.constant(''),
        node: fc.constant('')
      }),
      expectedErrors: fc.constant(['name', 'node'])
    }),
    // Invalid memory (too low)
    fc.record({
      data: fc.record({
        vmid: fc.integer({ min: 100, max: 999999999 }),
        name: fc.string({ minLength: 1 }),
        node: fc.string({ minLength: 1 }),
        memory: fc.integer({ min: 0, max: 511 })
      }),
      expectedErrors: fc.constant(['memory'])
    })
  );
}

/**
 * Generates valid form data (should pass validation)
 */
export function validVMFormDataArbitrary(): fc.Arbitrary<Record<string, unknown>> {
  return fc.record({
    vmid: fc.integer({ min: 100, max: 999999999 }),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    node: fc.string({ minLength: 1, maxLength: 50 }),
    cores: fc.option(fc.integer({ min: 1, max: 64 })),
    memory: fc.option(fc.integer({ min: 512, max: 65536 }))
  });
}
