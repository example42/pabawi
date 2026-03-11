# Node Linking Redesign - IMPLEMENTED

## Problem

Current implementation tries to merge nodes into a single object with one ID, causing:

- ManageTab can't find Proxmox nodes (wrong ID format)
- Puppet reports can't find nodes (looking for Proxmox ID instead of hostname)
- Complex logic trying to prioritize which ID to use

## Solution Implemented

### Backend Changes

1. **Updated `LinkedNode` interface** to include `sourceData`:

   ```typescript
   interface LinkedNode extends Node {
     sources: string[];
     linked: boolean;
     sourceData: Record<string, SourceNodeData>; // NEW
   }
   
   interface SourceNodeData {
     id: string;
     uri: string;
     config?: Record<string, unknown>;
     metadata?: Record<string, unknown>;
     status?: string;
   }
   ```

2. **Simplified `NodeLinkingService.linkNodes()`**:
   - Uses node `name` as the primary ID (common identifier across sources)
   - Stores source-specific data in `sourceData` object
   - Each source keeps its original ID, URI, metadata, etc.

3. **Simplified `IntegrationManager.deduplicateNodes()`**:
   - Now just calls `linkNodes()` directly
   - No more complex priority-based merging
   - Source data is already correctly organized

### How It Works

When nodes from different sources are linked:

```typescript
// Input nodes:
// - Bolt: id="debian13.test.example42.com", name="debian13.test.example42.com"
// - Proxmox: id="proxmox:minis:100", name="debian13.test.example42.com"
// - PuppetDB: id="debian13.test.example42.com", name="debian13.test.example42.com"

// Output linked node:
{
  id: "debian13.test.example42.com",  // Primary ID (name)
  name: "debian13.test.example42.com",
  sources: ["bolt", "proxmox", "puppetdb"],
  linked: true,
  sourceData: {
    bolt: {
      id: "debian13.test.example42.com",
      uri: "ssh://debian13.test.example42.com"
    },
    proxmox: {
      id: "proxmox:minis:100",
      uri: "proxmox://minis/100",
      metadata: { vmid: 100, node: "minis", type: "qemu", status: "running" }
    },
    puppetdb: {
      id: "debian13.test.example42.com",
      uri: "ssh://debian13.test.example42.com"
    }
  }
}
```

### Frontend Usage (Next Step)

Components should use source-specific data:

```typescript
// ManageTab - use Proxmox ID
if (node.sourceData?.proxmox) {
  await executeNodeAction(node.sourceData.proxmox.id, action);
}

// Puppet Reports - use PuppetDB ID
if (node.sourceData?.puppetdb) {
  const reports = await fetchReports(node.sourceData.puppetdb.id);
}
```

## Test Results

✅ All tests pass (12/12)
✅ New test added: "should store source-specific data for each source"

## Next Steps

1. Update frontend components to use `sourceData`
2. Update API endpoints to search by any source ID or name
3. Update ManageTab to use `node.sourceData.proxmox.id`
4. Update Puppet components to use `node.sourceData.puppetdb.id`
