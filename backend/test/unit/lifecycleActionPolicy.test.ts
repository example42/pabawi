import { describe, it, expect } from 'vitest';
import {
  LIFECYCLE_PROVIDERS,
  destroyActionFor,
  isDestructiveAction,
  permissionForAction,
  resolveLifecycleProvider,
  supportedActions,
} from '../../src/routes/lifecycleActionPolicy';
import type { ExecutionToolPlugin } from '../../src/integrations/types';

function tool(capabilities: string[], provisioning: { name: string; operation: 'create' | 'destroy' }[] = []): ExecutionToolPlugin {
  return {
    listCapabilities: () => capabilities.map((name) => ({ name, description: '' })),
    listProvisioningCapabilities: () => provisioning.map((p) => ({ ...p, description: '' })),
  } as unknown as ExecutionToolPlugin;
}

describe('lifecycle action policy', () => {
  it('classifies state transitions, creation and removal', () => {
    for (const action of ['start', 'stop', 'shutdown', 'reboot', 'restart', 'suspend', 'resume', 'deallocate', 'snapshot']) {
      expect(permissionForAction(action), action).toBe('lifecycle');
    }
    for (const action of ['provision', 'create_vm', 'create_lxc', 'create_instance']) {
      expect(permissionForAction(action), action).toBe('provision');
    }
    for (const action of ['destroy', 'destroy_vm', 'destroy_lxc', 'terminate', 'terminate_instance']) {
      expect(permissionForAction(action), action).toBe('destroy');
    }
  });

  it('does not classify an unknown action', () => {
    expect(permissionForAction('rm -rf /')).toBeNull();
    expect(isDestructiveAction('rm -rf /')).toBe(false);
  });

  /**
   * The discovery endpoint and the authorization gate used to hold separate
   * lists: terminate_instance required the destroy permission but was
   * advertised as non-destructive (finding I08).
   */
  it('treats every destroy-permission action as destructive', () => {
    for (const action of ['destroy', 'destroy_vm', 'destroy_lxc', 'terminate', 'terminate_instance']) {
      expect(isDestructiveAction(action), action).toBe(true);
    }
    expect(isDestructiveAction('stop')).toBe(false);
  });

  it('resolves only lifecycle providers from a node ID prefix', () => {
    expect(resolveLifecycleProvider('proxmox:pve:100')).toBe('proxmox');
    expect(resolveLifecycleProvider('aws:eu-west-1:i-1')).toBe('aws');
    expect(resolveLifecycleProvider('azure:sub:rg:vm')).toBe('azure');
    for (const nodeId of ['bolt:node', 'ssh:node', 'ansible:node', 'plain-hostname', '']) {
      expect(resolveLifecycleProvider(nodeId), nodeId).toBeNull();
    }
    expect([...LIFECYCLE_PROVIDERS]).toEqual(['proxmox', 'aws', 'azure']);
  });

  it('reads the advertised action set from both capability lists', () => {
    expect(supportedActions(tool(['start', 'stop'], [{ name: 'create_vm', operation: 'create' }])))
      .toEqual(['start', 'stop', 'create_vm']);
    expect(supportedActions({} as ExecutionToolPlugin)).toEqual([]);
  });

  it('takes the destroy action from the provider, or reports it has none', () => {
    expect(destroyActionFor(tool(['start', 'stop', 'reboot', 'terminate']))).toBe('terminate');
    expect(destroyActionFor(tool(['start'], [
      { name: 'create_vm', operation: 'create' },
      { name: 'destroy_vm', operation: 'destroy' },
      { name: 'destroy_lxc', operation: 'destroy' },
    ]))).toBe('destroy_vm');
    expect(destroyActionFor(tool(['start', 'stop', 'restart', 'deallocate']))).toBeNull();
  });
});
