# Component Organization Analysis

## Overview

This document analyzes the current organization of frontend components in the Pabawi system, identifying which components are plugin-specific vs shared framework components. This analysis supports Requirement 5.5 and provides guidance for potential future cleanup.

**Analysis Date:** February 9, 2026  
**Spec:** v1-plugins-finalization

---

## Summary

### Current State

- **Total components in `frontend/src/components/`:** 62 files (including tests)
- **Plugin-specific components still in shared directory:** 28 components
- **True framework components:** 15 components
- **Test files:** 5 files
- **Documentation/Example files:** 3 files

### Migration Status

Most plugin-specific components have been successfully migrated to their respective plugin directories in previous work. However, several plugin-specific components remain in the shared `frontend/src/components/` directory.

---

## Component Categories

### 1. True Framework Components (Should Stay in Shared Directory)

These are genuinely shared components used across multiple plugins and pages:

| Component | Purpose | Usage Pattern |
|-----------|---------|---------------|
| `CommandOutput.svelte` | Display command execution output | Used by ExecutionsPage, NodeDetailPage, multiple plugins |
| `RealtimeOutputViewer.svelte` | Stream real-time command output | Used by ExecutionsPage, NodeDetailPage, PluginContextProvider |
| `PermissionGuard.svelte` | Permission-based access control | Framework-level authorization component |
| `IntegrationBadge.svelte` | Display integration type badges | Used across IntegrationHomePage, ExecutionsPage, InventoryPage, NodeDetailPage |
| `LoadingSpinner.svelte` | Loading state indicator | Used across 10+ pages and components |
| `SkeletonLoader.svelte` | Content loading placeholder | Used in IntegrationHomePage, WidgetSlot |
| `DebugPanel.svelte` | Development debugging interface | Used across multiple pages for debugging |
| `ErrorAlert.svelte` | Error message display | Used across 10+ pages |
| `ErrorBoundary.svelte` | Error boundary wrapper | Framework error handling |
| `DetailedErrorDisplay.svelte` | Detailed error information | Framework error handling |
| `StatusBadge.svelte` | Status indicator badges | Used across ExecutionsPage, NodeDetailPage |
| `RequireAuth.svelte` | Authentication guard | Framework authentication |
| `AdminOnly.svelte` | Admin-only access guard | Framework authorization |
| `Router.svelte` | Application routing | Framework routing |
| `ToastContainer.svelte` | Toast notification container | Framework notifications |

**Total: 15 components**

---

### 2. Plugin-Specific Components (Candidates for Migration)

These components are specific to individual plugins and should ideally be in plugin directories:

#### Ansible Plugin Components (Still in Shared)

| Component | Current Location | Should Be In |
|-----------|-----------------|--------------|
| `AnsibleSetupGuide.svelte` | `frontend/src/components/` | `plugins/native/ansible/frontend/` |

**Note:** Other Ansible components (CommandExecutor, PlaybookRunner, InventoryViewer, NodeDetailTabs) have already been migrated.

#### Bolt Plugin Components (Still in Shared)

| Component | Current Location | Should Be In |
|-----------|-----------------|--------------|
| `BoltSetupGuide.svelte` | `frontend/src/components/` | `plugins/native/bolt/frontend/` |
| `TaskParameterForm.svelte` | `frontend/src/components/` | `plugins/native/bolt/frontend/` |
| `TaskRunInterface.svelte` | `frontend/src/components/` | `plugins/native/bolt/frontend/` |
| `PackageInstallInterface.svelte` | `frontend/src/components/` | `plugins/native/bolt/frontend/` |

**Note:** Other Bolt components (CommandExecutor, TaskRunner, FactsViewer, PackageManager, TaskBrowser) have already been migrated.

#### Hiera Plugin Components (Still in Shared)

| Component | Current Location | Should Be In |
|-----------|-----------------|--------------|
| `HieraSetupGuide.svelte` | `frontend/src/components/` | `plugins/native/hiera/frontend/` |
| `CodeAnalysisTab.svelte` | `frontend/src/components/` | `plugins/native/hiera/frontend/` |
| `GlobalHieraTab.svelte` | `frontend/src/components/` | `plugins/native/hiera/frontend/` |
| `NodeHieraTab.svelte` | `frontend/src/components/` | `plugins/native/hiera/frontend/` |

**Note:** Other Hiera components (HieraExplorer, HierarchyViewer, KeyLookup, etc.) have already been migrated.

#### PuppetDB Plugin Components (Still in Shared)

| Component | Current Location | Should Be In |
|-----------|-----------------|--------------|
| `PuppetdbSetupGuide.svelte` | `frontend/src/components/` | `plugins/native/puppetdb/frontend/` |
| `CatalogViewer.svelte` | `frontend/src/components/` | `plugins/native/puppetdb/frontend/` |
| `CatalogComparison.svelte` | `frontend/src/components/` | `plugins/native/puppetdb/frontend/` |
| `EventsViewer.svelte` | `frontend/src/components/` | `plugins/native/puppetdb/frontend/` |
| `ReportViewer.svelte` | `frontend/src/components/` | `plugins/native/puppetdb/frontend/` |
| `ReportFilterPanel.svelte` | `frontend/src/components/` | `plugins/native/puppetdb/frontend/` |
| `PuppetReportsListView.svelte` | `frontend/src/components/` | `plugins/native/puppetdb/frontend/` |
| `PuppetReportsSummary.svelte` | `frontend/src/components/` | `plugins/native/puppetdb/frontend/` |
| `PuppetDBAdmin.svelte` | `frontend/src/components/` | `plugins/native/puppetdb/frontend/` |
| `ManagedResourcesViewer.svelte` | `frontend/src/components/` | `plugins/native/puppetdb/frontend/` |

**Note:** Other PuppetDB components (CatalogViewer, EventsViewer, FactsExplorer, etc.) have already been migrated to the plugin directory.

#### Puppetserver Plugin Components (Still in Shared)

| Component | Current Location | Should Be In |
|-----------|-----------------|--------------|
| `PuppetserverSetupGuide.svelte` | `frontend/src/components/` | `plugins/native/puppetserver/frontend/` |
| `PuppetserverStatus.svelte` | `frontend/src/components/` | `plugins/native/puppetserver/frontend/` |
| `PuppetRunInterface.svelte` | `frontend/src/components/` | `plugins/native/puppetserver/frontend/` |
| `PuppetOutputViewer.svelte` | `frontend/src/components/` | `plugins/native/puppetserver/frontend/` |
| `PuppetRunChart.svelte` | `frontend/src/components/` | `plugins/native/puppetserver/frontend/` |

**Note:** Other Puppetserver components (CatalogCompilation, EnvironmentInfo, etc.) have already been migrated.

#### SSH Plugin Components (Still in Shared)

| Component | Current Location | Should Be In |
|-----------|-----------------|--------------|
| `SSHSetupGuide.svelte` | `frontend/src/components/` | `plugins/native/ssh/frontend/` |

**Note:** SSH HomeWidget has already been migrated.

**Total Plugin-Specific Components: 28**

---

### 3. Ambiguous/Multi-Plugin Components

These components are used by multiple plugins or have cross-cutting concerns:

| Component | Current Usage | Recommendation |
|-----------|---------------|----------------|
| `FactsViewer.svelte` | Used by NodeDetailPage, imported from shared | Consider keeping shared or creating plugin-specific versions |
| `MultiSourceFactsViewer.svelte` | Multi-source facts aggregation | Keep shared - framework-level multi-source functionality |
| `NodeStatus.svelte` | Node status display | Keep shared - used across multiple contexts |
| `EnvironmentSelector.svelte` | Environment selection UI | Keep shared - used by multiple Puppet-related features |
| `ExecutionList.svelte` | Execution history list | Keep shared - framework-level execution tracking |
| `ReExecutionButton.svelte` | Re-run execution button | Keep shared - framework-level execution control |
| `PaginationControls.svelte` | Pagination UI component | Keep shared - generic UI component |
| `DynamicNavigation.svelte` | Dynamic navigation menu | Keep shared - framework navigation |
| `IntegrationStatus.svelte` | Integration status display | Keep shared - framework-level status |
| `DebugCopyButton.svelte` | Debug copy functionality | Keep shared - framework debugging |

**Total: 10 components**

---

### 4. Test and Documentation Files

| File | Type | Purpose |
|------|------|---------|
| `DebugCopyButton.test.ts` | Test | Unit tests for DebugCopyButton |
| `DebugPanel.test.ts` | Test | Unit tests for DebugPanel |
| `IntegrationBadge.test.ts` | Test | Unit tests for IntegrationBadge |
| `PaginationControls.test.ts` | Test | Unit tests for PaginationControls |
| `PuppetReportsListView.test.ts` | Test | Unit tests for PuppetReportsListView |
| `EnvironmentSelector.example.md` | Documentation | Usage examples |
| `ExpertModeCopyButton.example.md` | Documentation | Usage examples |
| `MultiSourceFactsViewer.example.md` | Documentation | Usage examples |
| `NodeStatus.example.md` | Documentation | Usage examples |
| `PermissionGuard.example.md` | Documentation | Usage examples |
| `RealtimeOutputViewer.example.svelte` | Example | Live example component |

**Total: 11 files**

---

## Migration Impact Analysis

### High Priority (Setup Guides)

Setup guides are only used by `IntegrationSetupPage.svelte` via dynamic imports. Migration would be straightforward:

```typescript
// Current (IntegrationSetupPage.svelte)
const setupComponents: Record<string, () => Promise<{ default: Component }>> = {
  'puppetserver': () => import('../components/PuppetserverSetupGuide.svelte'),
  'puppetdb': () => import('../components/PuppetdbSetupGuide.svelte'),
  'bolt': () => import('../components/BoltSetupGuide.svelte'),
  'hiera': () => import('../components/HieraSetupGuide.svelte'),
};

// After Migration
const setupComponents: Record<string, () => Promise<{ default: Component }>> = {
  'puppetserver': () => import('../../plugins/native/puppetserver/frontend/SetupGuide.svelte'),
  'puppetdb': () => import('../../plugins/native/puppetdb/frontend/SetupGuide.svelte'),
  'bolt': () => import('../../plugins/native/bolt/frontend/SetupGuide.svelte'),
  'hiera': () => import('../../plugins/native/hiera/frontend/SetupGuide.svelte'),
  'ansible': () => import('../../plugins/native/ansible/frontend/SetupGuide.svelte'),
  'ssh': () => import('../../plugins/native/ssh/frontend/SetupGuide.svelte'),
};
```

**Impact:** Low - Single file update, dynamic imports already in place

### Medium Priority (Plugin-Specific Viewers)

Components like `CatalogViewer`, `EventsViewer`, `ReportViewer` are only used by `NodeDetailPage.svelte`. Migration would require:

1. Move components to plugin directories
2. Update imports in NodeDetailPage
3. Ensure widget manifests reference correct paths

**Impact:** Medium - Multiple import updates, potential widget manifest changes

### Low Priority (Interface Components)

Components like `TaskRunInterface`, `PuppetRunInterface`, `PackageInstallInterface` are used by NodeDetailPage and potentially by plugin widgets. Migration requires careful analysis of all usage points.

**Impact:** Medium-High - Multiple usage points, potential breaking changes

---

## Recommendations

### Immediate Actions (v1 Finalization)

1. **Document current state** ✓ (This document)
2. **No migration in v1** - Focus on completing widget registration and category tabs
3. **Defer cleanup** - Schedule for v1.1 or v2.0

### Future Cleanup (v1.1 or v2.0)

#### Phase 1: Setup Guides (Low Risk)

- Move all `*SetupGuide.svelte` files to respective plugin directories
- Update `IntegrationSetupPage.svelte` import paths
- Test setup page for all plugins

#### Phase 2: Plugin-Specific Viewers (Medium Risk)

- Move viewer components (CatalogViewer, EventsViewer, ReportViewer, etc.)
- Update NodeDetailPage imports
- Update widget manifests if needed
- Test node detail page functionality

#### Phase 3: Interface Components (Higher Risk)

- Analyze all usage points for TaskRunInterface, PuppetRunInterface, etc.
- Create migration plan with backward compatibility
- Move components with careful testing
- Update all import references

#### Phase 4: Tab Components (Medium Risk)

- Move Hiera tab components (GlobalHieraTab, NodeHieraTab, CodeAnalysisTab)
- Update PuppetPage and NodeDetailPage imports
- Test Hiera functionality

---

## Component Usage Matrix

### Framework Components (Keep Shared)

| Component | Used By | Plugin-Specific? |
|-----------|---------|------------------|
| CommandOutput | ExecutionsPage, NodeDetailPage, PuppetRunInterface | No - Multi-plugin |
| RealtimeOutputViewer | ExecutionsPage, NodeDetailPage, PluginContextProvider | No - Multi-plugin |
| IntegrationBadge | 5+ pages | No - Framework |
| LoadingSpinner | 10+ pages | No - Framework |
| SkeletonLoader | IntegrationHomePage, WidgetSlot | No - Framework |

### Plugin-Specific Components (Migration Candidates)

| Component | Used By | Plugin | Migration Priority |
|-----------|---------|--------|-------------------|
| AnsibleSetupGuide | IntegrationSetupPage | Ansible | High |
| BoltSetupGuide | IntegrationSetupPage | Bolt | High |
| HieraSetupGuide | IntegrationSetupPage | Hiera | High |
| PuppetdbSetupGuide | IntegrationSetupPage | PuppetDB | High |
| PuppetserverSetupGuide | IntegrationSetupPage | Puppetserver | High |
| SSHSetupGuide | IntegrationSetupPage | SSH | High |
| CatalogViewer | NodeDetailPage | PuppetDB | Medium |
| EventsViewer | NodeDetailPage | PuppetDB | Medium |
| ReportViewer | NodeDetailPage | PuppetDB | Medium |
| PuppetRunInterface | NodeDetailPage | Puppetserver | Medium |
| TaskRunInterface | NodeDetailPage | Bolt | Medium |
| PackageInstallInterface | NodeDetailPage | Bolt | Medium |

---

## Migration Checklist (For Future Work)

When migrating a component, ensure:

- [ ] Component moved to correct plugin directory
- [ ] All import paths updated in consuming files
- [ ] Widget manifest updated if component is a widget
- [ ] Tests moved and updated
- [ ] Documentation/examples moved
- [ ] No broken imports remain
- [ ] All functionality tested
- [ ] Git history preserved (use `git mv`)

---

## Conclusion

The component organization is in a transitional state. Most plugin-specific components have been successfully migrated to plugin directories, but 28 components remain in the shared directory. These are primarily:

1. **Setup guides** (6 components) - Easy to migrate
2. **Plugin-specific viewers** (10 components) - Medium complexity
3. **Interface components** (5 components) - Higher complexity
4. **Tab components** (4 components) - Medium complexity
5. **Admin/status components** (3 components) - Medium complexity

**For v1 finalization:** Document current state (complete) and defer migration to future release.

**For future releases:** Follow phased migration approach starting with low-risk setup guides.

---

## Related Requirements

- **Requirement 5.5:** Document which components are plugin-specific vs shared
- **Requirement 5.1:** Identify components in frontend/src/components/ that are plugin-specific
- **Requirement 5.2:** Identify truly shared framework components
- **Requirement 5.3:** Move plugin-specific components to plugin directories (deferred)
- **Requirement 5.4:** Ensure migrated widgets follow v1 interface (deferred)

---

**Document Status:** Complete  
**Next Steps:** Review with team, schedule migration for v1.1 or v2.0
