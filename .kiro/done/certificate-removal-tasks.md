# Certificate Removal Tasks

## Overview

Remove all certificate management functionality from the codebase while preserving SSL/TLS authentication configuration.

## Priority 1: Critical Removals (Broken Code)

### [ ] Remove Non-Existent Component Export

- **File**: `frontend/src/components/index.ts`
- **Line**: 3
- **Action**: Delete line `export { default as CertificateManagement } from "./CertificateManagement.svelte";`
- **Reason**: Component doesn't exist, causes import errors
- **Impact**: HIGH - Breaks build if component is imported

### [ ] Remove CertificatesPage

- **File**: `frontend/src/pages/CertificatesPage.svelte`
- **Action**: Delete entire file
- **Reason**: Page imports non-existent component
- **Impact**: HIGH - Broken page

### [ ] Remove Certificate Tab from PuppetPage

- **File**: `frontend/src/pages/PuppetPage.svelte`
- **Lines**: 16, 140, 149, 227-238, 371-392
- **Actions**:
  - [ ] Line 16: Remove `'certificates'` from `TabId` type union
  - [ ] Line 140: Remove certificate from comment
  - [ ] Line 149: Remove `'certificates'` from array check
  - [ ] Lines 227-238: Delete entire certificate tab button
  - [ ] Lines 371-392: Delete entire certificate tab content
- **Reason**: Certificate management removed
- **Impact**: MEDIUM - Removes UI element

## Priority 2: Backend Cleanup

### [ ] Remove CertificateOperationError

- **File**: `backend/src/middleware/errorHandler.ts`
- **Line**: 122
- **Action**: Delete `case "CertificateOperationError":`
- **Reason**: Error type no longer used
- **Impact**: LOW - Unused error handler

### [ ] Remove Certificate Test Script

- **File**: `backend/test-certificate-api-verification.ts`
- **Action**: Delete entire file
- **Reason**: Tests certificate API that no longer exists
- **Impact**: LOW - Unused test file

### [ ] Update PuppetserverService Comments

- **File**: `backend/src/integrations/puppetserver/PuppetserverService.ts`
- **Actions**:
  - [ ] Search for certificate-related comments
  - [ ] Update class documentation
  - [ ] Remove references to certificate management
  - [ ] Keep stub methods (already gutted)
- **Reason**: Documentation accuracy
- **Impact**: LOW - Documentation only

### [ ] Update PuppetserverClient Comments

- **File**: `backend/src/integrations/puppetserver/PuppetserverClient.ts`
- **Actions**:
  - [ ] Search for certificate-related comments
  - [ ] Update class documentation
  - [ ] Remove certificate method references
- **Reason**: Documentation accuracy
- **Impact**: LOW - Documentation only

## Priority 3: Test Updates

### [ ] Remove Certificate Assertions from Tests

- **File**: `backend/test/integration/puppetserver-nodes.test.ts`
- **Lines**: 28, 37, 300, 314
- **Actions**:
  - [ ] Line 28: Remove `certificateStatus: "signed"` from mock data
  - [ ] Line 37: Remove `certificateStatus: "requested"` from mock data
  - [ ] Line 300: Remove certificate status assertion
  - [ ] Line 314: Remove certificate status assertion
- **Reason**: Certificate status no longer tracked
- **Impact**: MEDIUM - Test data cleanup

### [ ] Search for Other Certificate References in Tests

- **Files**: `backend/test/**/*.test.ts`
- **Action**: Search for `certificateStatus` and `certificate` patterns
- **Reason**: Ensure all test references removed
- **Impact**: MEDIUM - Test consistency

## Priority 4: Documentation Updates

### [ ] Remove Certificate Authorization Fix Note

- **File**: `.kiro/todo/puppetserver-ca-authorization-fix.md`
- **Action**: Delete entire file
- **Reason**: Issue no longer relevant
- **Impact**: LOW - Development notes

### [ ] Update API Endpoints Documentation

- **File**: `.kiro/puppetdb-puppetserver-api-endpoints.md`
- **Lines**: 95-113
- **Action**: Delete "Certificate Authority (CA) Endpoints" section
- **Reason**: Endpoints no longer exist
- **Impact**: LOW - Development documentation

### [ ] Update Puppetserver Integration Requirements

- **File**: `.kiro/specs/puppetserver-integration/requirements.md`
- **Actions**:
  - [ ] Remove Requirement 2: "Fix Puppetserver Certificate API"
  - [ ] Update Requirement 3: Remove certificate inventory references
  - [ ] Update Requirement 13: Remove "Certificates" from navigation
  - [ ] Update Requirement 14: Remove "Certificate Status" from node detail tabs
  - [ ] Renumber remaining requirements
- **Reason**: Requirements no longer valid
- **Impact**: LOW - Spec documentation

## Priority 5: Frontend Component Updates

### [ ] Update PuppetserverSetupGuide

- **File**: `frontend/src/components/PuppetserverSetupGuide.svelte`
- **Action**: Search for and remove certificate generation instructions
- **Reason**: Certificate management removed
- **Impact**: LOW - Setup documentation

### [ ] Check NodeDetailPage for Certificate References

- **File**: `frontend/src/pages/NodeDetailPage.svelte`
- **Action**: Search for `certificate` and `cert` patterns
- **Reason**: Remove any certificate status display
- **Impact**: MEDIUM - May have certificate tab

### [ ] Verify PuppetdbSetupGuide

- **File**: `frontend/src/components/PuppetdbSetupGuide.svelte`
- **Action**: Verify SSL certificate config is kept (not certificate management)
- **Reason**: SSL/TLS config should remain
- **Impact**: LOW - Verification only

## Priority 6: Verification & Testing

### [ ] Run Build

- **Command**: `npm run build` (frontend) and `npm run build` (backend)
- **Reason**: Verify no broken imports
- **Expected**: Build succeeds

### [ ] Run Tests

- **Command**: `npm test -- --silent` (frontend and backend)
- **Reason**: Verify no broken test references
- **Expected**: All tests pass

### [ ] Search for Remaining References

- **Command**: `grep -r "certificate" --include="*.ts" --include="*.tsx" --include="*.svelte" --exclude-dir=node_modules .`
- **Reason**: Find any remaining certificate references
- **Expected**: Only SSL/TLS and certname references remain

### [ ] Verify SSL/TLS Still Works

- **Action**: Confirm SSL certificate configuration still present
- **Files to check**:
  - `backend/.env` - SSL paths
  - `backend/src/integrations/puppetserver/PuppetserverClient.ts` - SSL agent
  - `backend/src/integrations/puppetdb/PuppetDBClient.ts` - SSL agent
- **Expected**: SSL/TLS authentication functional

## Notes

- **Keep**: `generate-pabawi-cert.sh` script (mentioned in requirements)
- **Keep**: SSL/TLS certificate configuration (used for authentication)
- **Keep**: `certname` references (node identifier)
- **Keep**: `ca.pem` references (SSL/TLS CA certificate)
- **Exclude**: `node_modules` directory from searches

## Completion Criteria

- [ ] All Priority 1 items completed
- [ ] All Priority 2 items completed
- [ ] All Priority 3 items completed
- [ ] All Priority 4 items completed
- [ ] All Priority 5 items completed
- [ ] All Priority 6 verification items pass
- [ ] No broken imports
- [ ] All tests pass
- [ ] SSL/TLS authentication still works
- [ ] No certificate management references remain
