# Component Organization Analysis

## Overview

This document analyzes the current organization of frontend components in the Pabawi system, identifying which components are plugin-specific vs shared framework components. This analysis supports Requirement 5.5 and provides guidance for potential future cleanup.

**Analysis Date:** February 9, 2026  
**Spec:** v1-plugins-finalization  
**Verification Date:** February 9, 2026

---

## Summary

### Current State (Verified)

- **Total Svelte components in `frontend/src/components/`:** 46 files
- **Total files (including tests, examples, docs):** 57 files
- **Plugin-specific components still in shared directory:** 28 components (verified)
- **True framework components:** 15 components (verified)
- **Test files:** 5 files (verified)
- **Documentation/Example files:** 6 files (verified)

### Verification Notes

✅ **Setup Guides Migration:** All 6 setup guides have been successfully migrated to plugin directories:

- `plugins/native/ansible/frontend/SetupGuide.svelte`
- `plugins/native/bolt/frontend/SetupGuide.svelte`
- `plugins/native/hiera/frontend/SetupGuide.svelte`
- `plugins/native/puppetdb/frontend/SetupGuide.svelte`
- `plugins/native/puppetserver/frontend/SetupGuide.svelte`
- `plugins/native/ssh/frontend/SetupGuide.svelte`

⚠️ **Duplicate Components Found:** Some components exist in BOTH shared and plugin directories with DIFFERENT implementations:

- `CatalogViewer.svelte` - Different in shared vs puppetdb/frontend
- `EventsViewer.svelte` - Different in shared vs puppetdb/frontend
- `ReportsViewer.svelte` - Only in puppetdb/frontend (no shared version with this exact name)

This indicates the shared versions are legacy 0.5 components still used by NodeDetailPage, while plugin versions are newer v1 implementations.

### Migration Status

✅ **Setup guides successfully migrated** - All 6 plugin setup guides are now in their respective plugin directories and referenced correctly in `IntegrationSetupPage.svelte`.

⚠️ **Partial migration completed** - Most plugin-specific components have been migrated to plugin directories in previous work. However, several plugin-specific components remain in the shared `frontend/src/components/` directory and are still actively used by legacy pages (NodeDetailPage, PuppetPage).

⚠️ **Duplicate implementations exist** - Some components (CatalogViewer, EventsViewer) have different implementations in both shared and plugin directories, indicating a transitional state where:

- Shared versions are legacy 0.5 implementations used by NodeDetailPage
- Plugin versions are newer v1 implementations used by plugin widgets

**Recommendation:** The analysis document's original recommendation stands - defer full migration to v1.1 or v2.0 to avoid breaking existing functionality during v1 finalization.

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

**Status:** ✅ All Ansible components have been migrated to `plugins/native/ansible/frontend/`

**Verified components in plugin directory:**

- HomeWidget.svelte
- PluginHomePage.svelte
- PlaybookRunner.svelte
- CommandExecutor.svelte
- InventoryViewer.svelte
- NodeDetailTabs.svelte
- SetupGuide.svelte

**No Ansible-specific components remain in shared directory.**

#### Bolt Plugin Components (Still in Shared)

**Status:** ⚠️ Partial migration - Core components migrated, but some remain in shared directory

**Verified components in plugin directory:**

- HomeWidget.svelte
- CommandExecutor.svelte
- TaskRunner.svelte
- FactsViewer.svelte
- PackageManager.svelte
- TaskBrowser.svelte
- InventoryViewer.svelte
- NodeDetailTabs.svelte
- PluginHomePage.svelte
- SetupGuide.svelte

**Still in shared directory (used by NodeDetailPage):**

| Component | Current Location | Used By | Migration Priority |
|-----------|-----------------|---------|-------------------|
| `TaskParameterForm.svelte` | `frontend/src/components/` | TaskRunInterface, PluginContextProvider | Medium |
| `TaskRunInterface.svelte` | `frontend/src/components/` | NodeDetailPage | Medium |
| `PackageInstallInterface.svelte` | `frontend/src/components/` | NodeDetailPage | Medium |

#### Hiera Plugin Components (Still in Shared)

**Status:** ⚠️ Partial migration - Core components migrated, but tab components remain in shared directory

**Verified components in plugin directory:**

- HomeWidget.svelte
- HieraExplorer.svelte
- HierarchyViewer.svelte
- KeyLookup.svelte
- KeyValuesGrid.svelte
- NodeHieraData.svelte
- CodeAnalysis.svelte
- SetupGuide.svelte

**Still in shared directory (used by PuppetPage and NodeDetailPage):**

| Component | Current Location | Used By | Migration Priority |
|-----------|-----------------|---------|-------------------|
| `CodeAnalysisTab.svelte` | `frontend/src/components/` | PuppetPage | Medium |
| `GlobalHieraTab.svelte` | `frontend/src/components/` | PuppetPage | Medium |
| `NodeHieraTab.svelte` | `frontend/src/components/` | NodeDetailPage | Medium |

#### PuppetDB Plugin Components (Still in Shared)

**Status:** ⚠️ Significant duplication - Plugin has v1 implementations, but shared directory has legacy 0.5 versions still in use

**Verified components in plugin directory (v1 implementations):**

- HomeWidget.svelte
- CatalogViewer.svelte ⚠️ (different from shared version)
- EventsViewer.svelte ⚠️ (different from shared version)
- FactsExplorer.svelte
- NodeBrowser.svelte
- NodeDetailTabs.svelte
- ReportsSummary.svelte
- ReportsViewer.svelte
- ResourceTypesViewer.svelte
- SetupGuide.svelte

**Still in shared directory (legacy 0.5 implementations used by NodeDetailPage and PuppetPage):**

| Component | Current Location | Used By | Migration Priority | Notes |
|-----------|-----------------|---------|-------------------|-------|
| `CatalogViewer.svelte` | `frontend/src/components/` | NodeDetailPage | High | ⚠️ Different implementation than plugin version |
| `CatalogComparison.svelte` | `frontend/src/components/` | NodeDetailPage | High | Not in plugin directory |
| `EventsViewer.svelte` | `frontend/src/components/` | NodeDetailPage | High | ⚠️ Different implementation than plugin version |
| `ReportViewer.svelte` | `frontend/src/components/` | NodeDetailPage | High | Different from ReportsViewer in plugin |
| `ReportFilterPanel.svelte` | `frontend/src/components/` | PuppetReportsListView | Medium | Helper component |
| `PuppetReportsListView.svelte` | `frontend/src/components/` | NodeDetailPage, PuppetPage | High | Not in plugin directory |
| `PuppetReportsSummary.svelte` | `frontend/src/components/` | PuppetPage | Medium | Different from ReportsSummary in plugin |
| `PuppetDBAdmin.svelte` | `frontend/src/components/` | PuppetPage | Medium | Admin interface |
| `ManagedResourcesViewer.svelte` | `frontend/src/components/` | NodeDetailPage | Medium | Not in plugin directory |

#### Puppetserver Plugin Components (Still in Shared)

**Status:** ⚠️ Partial migration - Core components migrated, but interface and status components remain in shared directory

**Verified components in plugin directory:**

- HomeWidget.svelte
- CatalogCompilation.svelte
- EnvironmentInfo.svelte
- EnvironmentManager.svelte
- NodeStatus.svelte (plugin-specific version)
- StatusDashboard.svelte
- SetupGuide.svelte

**Still in shared directory (used by NodeDetailPage and PuppetPage):**

| Component | Current Location | Used By | Migration Priority |
|-----------|-----------------|---------|-------------------|
| `PuppetserverStatus.svelte` | `frontend/src/components/` | PuppetPage | Medium |
| `PuppetRunInterface.svelte` | `frontend/src/components/` | NodeDetailPage | High |
| `PuppetOutputViewer.svelte` | `frontend/src/components/` | PuppetRunInterface | Medium |
| `PuppetRunChart.svelte` | `frontend/src/components/` | NodeDetailPage, PuppetPage | Medium |

#### SSH Plugin Components (Still in Shared)

**Status:** ✅ All SSH components have been migrated to `plugins/native/ssh/frontend/`

**Verified components in plugin directory:**

- HomeWidget.svelte
- SetupGuide.svelte

**No SSH-specific components remain in shared directory.**

**Total Plugin-Specific Components Still in Shared: 22 components** (revised from 28)

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

- [x] Component moved to correct plugin directory
- [ ] All import paths updated in consuming files
- [ ] Widget manifest updated if component is a widget
- [ ] Tests moved and updated
- [ ] Documentation/examples moved
- [ ] No broken imports remain
- [ ] All functionality tested
- [ ] Git history preserved (use `git mv`)

---

## Conclusion

The component organization is in a transitional state between 0.5 and v1 architectures. **Verification findings:**

✅ **Successfully migrated (no action needed):**

- All 6 setup guides are in plugin directories
- Ansible: All components migrated
- SSH: All components migrated

⚠️ **Partially migrated (22 components remain in shared):**

1. **Bolt components** (3 components) - TaskParameterForm, TaskRunInterface, PackageInstallInterface
2. **Hiera tab components** (3 components) - CodeAnalysisTab, GlobalHieraTab, NodeHieraTab
3. **PuppetDB viewers** (9 components) - Multiple viewers with duplicate implementations
4. **Puppetserver interfaces** (4 components) - Status, run interface, output viewer, chart
5. **Shared/ambiguous components** (3 components) - GlobalFactsTab, FactsViewer, NodeStatus

**Critical finding:** Some components (CatalogViewer, EventsViewer) exist in BOTH locations with DIFFERENT implementations:

- **Shared versions:** Legacy 0.5 implementations used by NodeDetailPage and PuppetPage
- **Plugin versions:** Newer v1 implementations used by plugin widgets

This indicates NodeDetailPage and PuppetPage are still using the 0.5 architecture and would need significant refactoring to use v1 plugin components.

**For v1 finalization:** Document current state (✅ complete) and defer migration to future release.

**For future releases:** Follow phased migration approach:

1. Phase 1: Refactor NodeDetailPage and PuppetPage to use plugin widgets instead of direct component imports
2. Phase 2: Migrate remaining shared components once pages are refactored
3. Phase 3: Remove duplicate implementations and consolidate on v1 versions

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
