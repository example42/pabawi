# Bugfix Requirements Document

## Introduction

On the "Manage" tab of a node detail page, users only see the "Destroy" action button. All other lifecycle actions (start, stop, shutdown, reboot, suspend, resume, snapshot) are missing. This effectively prevents users from managing the lifecycle of their Proxmox VMs and containers through the UI.

The root cause is a broken status resolution chain in `NodeDetailPage.svelte`. The `ManageTab` component filters available actions based on `currentStatus`, but the status value passed to it resolves to `'unknown'` because the frontend `Node` interface does not declare `status` or `sourceData` fields. The property access chain `proxmoxMetadata?.status || proxmoxData?.status || currentStatus` silently fails, and since `'unknown'` only appears in the `destroy` action's availability list, only "Destroy" is shown.

Additionally, `ManageTab` performs no case normalization on the status string before comparing it against the `actionAvailability` map, which expects lowercase values (`'running'`, `'stopped'`, `'suspended'`). If a status value arrives in a different case, it would also fail to match.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a Proxmox node has a valid status (e.g., `running`, `stopped`, `suspended`) AND the user navigates to the Manage tab THEN the system resolves `currentStatus` to `'unknown'` because the `sourceData.proxmox` property path does not resolve correctly from the API response, causing the status fallback chain to terminate at the default `'unknown'` value.

1.2 WHEN `currentStatus` is `'unknown'` THEN the system filters out all lifecycle actions except `destroy`, because `'unknown'` is only present in the `destroy` entry of the `actionAvailability` map.

1.3 WHEN the backend returns a status value in an unexpected case (e.g., `'Running'` instead of `'running'`) THEN the system fails to match it against the lowercase keys in `actionAvailability`, resulting in no actions being displayed for that status.

### Expected Behavior (Correct)

2.1 WHEN a Proxmox node has a valid status (`running`, `stopped`, `suspended`, or `paused`) AND the user navigates to the Manage tab THEN the system SHALL correctly resolve the node's status from the API response data and pass it to the `ManageTab` component.

2.2 WHEN `currentStatus` is a recognized Proxmox status (`running`, `stopped`, `suspended`, `paused`) THEN the system SHALL display all lifecycle actions whose `actionAvailability` entry includes that status (e.g., for `running`: stop, shutdown, reboot, suspend, snapshot, destroy).

2.3 WHEN the backend returns a status value in any case variation THEN the system SHALL normalize the status to lowercase before comparing against the `actionAvailability` map.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `currentStatus` is genuinely `'unknown'` (no Proxmox status data available) THEN the system SHALL CONTINUE TO show only the `destroy` action, as this is the correct fallback behavior.

3.2 WHEN a destructive action (destroy) is selected THEN the system SHALL CONTINUE TO display a confirmation dialog before executing the action.

3.3 WHEN an action is executed successfully THEN the system SHALL CONTINUE TO call `onStatusChange` to refresh the node data and update the displayed actions accordingly.

3.4 WHEN the node is not a Proxmox node (no `sourceData.proxmox`) THEN the system SHALL CONTINUE TO fall back to the node's top-level status or `'unknown'`.

---

### Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type NodeDetailPageInput (node data from API response)
  OUTPUT: boolean

  // The bug triggers when the node has a valid Proxmox status but the
  // frontend status resolution chain fails to extract it, resulting in 'unknown'
  LET apiStatus = X.sourceData?.proxmox?.status
                  OR X.sourceData?.proxmox?.metadata?.status
                  OR X.status
  LET resolvedStatus = frontendResolveStatus(X)

  RETURN apiStatus IN {'running', 'stopped', 'suspended', 'paused'}
         AND resolvedStatus = 'unknown'
END FUNCTION
```

### Fix Checking Property

```pascal
// Property: Fix Checking - Status Resolution
FOR ALL X WHERE isBugCondition(X) DO
  resolvedStatus ← resolveStatus'(X)
  ASSERT resolvedStatus IN {'running', 'stopped', 'suspended', 'paused'}
  ASSERT resolvedStatus = normalizeCase(X.actualProxmoxStatus)
END FOR

// Property: Fix Checking - Action Visibility
FOR ALL X WHERE isBugCondition(X) DO
  actions ← displayableActions'(X)
  ASSERT |actions| > 1
  ASSERT actions CONTAINS relevant actions for resolvedStatus
END FOR
```

### Preservation Checking Property

```pascal
// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT resolveStatus(X) = resolveStatus'(X)
  ASSERT displayableActions(X) = displayableActions'(X)
END FOR
```
