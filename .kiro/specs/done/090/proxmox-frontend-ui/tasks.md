# Implementation Plan: Proxmox Frontend UI

## Overview

This implementation plan adds Proxmox provisioning capabilities to the Pabawi frontend. The feature includes a new Provision page for creating VMs and LXC containers, a Manage tab on node detail pages for lifecycle operations, and integration setup UI for Proxmox configuration. The implementation follows a dynamic, integration-agnostic architecture using Svelte 5 with TypeScript.

## Tasks

- [x] 1. Create core type definitions and API client methods
  - [x] 1.1 Define TypeScript interfaces for provisioning types
    - Create `frontend/src/lib/types/provisioning.ts` with interfaces for ProvisioningIntegration, ProvisioningCapability, CapabilityParameter, ProxmoxVMParams, ProxmoxLXCParams, LifecycleAction, ProvisioningResult, and API response types
    - _Requirements: 2.1, 2.2, 13.1_
  
  - [x] 1.2 Add provisioning API methods to api.ts
    - Add methods: `getProvisioningIntegrations()`, `createProxmoxVM()`, `createProxmoxLXC()`, `executeNodeAction()`, `destroyNode()`, `saveProxmoxConfig()`, `testProxmoxConnection()`
    - Configure retry logic: no retries for provisioning operations, 2 retries for status queries
    - _Requirements: 2.1, 3.3, 4.3, 6.4, 7.3, 8.3, 10.4_
  
  - [x] 1.3 Write property test for API client methods
    - **Property 4: Action Execution Triggers API Call**
    - **Validates: Requirements 6.4**

- [x] 2. Create form validation utilities
  - [x] 2.1 Implement validation functions in lib/validation.ts
    - Create validation functions: `validateVMID()`, `validateHostname()`, `validateMemory()`, `validateRequired()`, `validateNumericRange()`, `validateStringPattern()`
    - Each function returns error message string or null
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  
  - [x] 2.2 Implement generic form validation utility
    - Create `validateForm()` function that accepts data and validation rules, returns ValidationResult with errors object
    - Support validation types: required, number (min/max), string (minLength/maxLength/pattern)
    - _Requirements: 11.1, 11.6_
  
  - [x] 2.3 Write property tests for validation utilities
    - **Property 8: Form Validation Completeness**
    - **Property 9: Valid Form Enables Submission**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.5, 11.6**

- [x] 3. Implement ProvisionPage component
  - [x] 3.1 Create ProvisionPage.svelte with integration discovery
    - Create `frontend/src/pages/ProvisionPage.svelte` with state management using Svelte 5 runes
    - Implement `fetchIntegrations()` to query `/api/integrations/provisioning`
    - Display loading state, error state, and integration list
    - Filter and display only integrations with at least one capability
    - _Requirements: 1.2, 1.4, 2.1, 2.2, 2.3, 2.4_
  
  - [x] 3.2 Add integration selector for multiple integrations
    - Implement tab or dropdown selector when multiple integrations are available
    - Default to first available integration
    - _Requirements: 1.4, 2.2_
  
  - [x] 3.3 Write unit tests for ProvisionPage
    - Test integration discovery, loading states, error handling, empty states
    - _Requirements: 1.2, 1.4, 2.1, 2.3, 2.4_
  
  - [x] 3.4 Write property tests for ProvisionPage
    - **Property 1: Integration Discovery and Display**
    - **Property 16: Integration Extensibility**
    - **Validates: Requirements 1.4, 2.2, 2.3, 13.3**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement ProxmoxProvisionForm component
  - [x] 5.1 Create ProxmoxProvisionForm.svelte with tabbed interface
    - Create `frontend/src/components/ProxmoxProvisionForm.svelte` with VM and LXC tabs
    - Implement state management for activeTab, formData, validationErrors, submitting
    - Add tab switching between 'vm' and 'lxc' modes
    - _Requirements: 3.1, 4.1_
  
  - [x] 5.2 Implement VM creation form
    - Add form fields: vmid (required), name (required), node (required), cores, memory, sockets, cpu, scsi0, ide2, net0, ostype
    - Implement real-time validation using validation utilities
    - Display validation errors inline below each field
    - Disable submit button when validation fails or submission in progress
    - _Requirements: 3.2, 3.3, 3.6, 11.1, 11.2, 11.6_
  
  - [x] 5.3 Implement LXC creation form
    - Add form fields: vmid (required), hostname (required), node (required), ostemplate (required), cores, memory, rootfs, net0, password
    - Implement real-time validation using validation utilities
    - Display validation errors inline below each field
    - Disable submit button when validation fails or submission in progress
    - _Requirements: 4.2, 4.3, 4.6, 11.1, 11.2, 11.6_
  
  - [x] 5.4 Implement form submission handlers
    - Create `submitVMForm()` and `submitLXCForm()` functions
    - Call appropriate API methods with form data
    - Handle success: display success notification with VM/LXC ID, reset form
    - Handle errors: display error notification with backend message
    - Show loading indicator during submission
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 4.3, 4.4, 4.5, 4.6, 12.1, 12.2, 12.5_
  
  - [x] 5.5 Write unit tests for ProxmoxProvisionForm
    - Test form rendering, tab switching, field validation, submission success/error handling
    - _Requirements: 3.1, 3.2, 4.1, 4.2, 11.1_
  
  - [x] 5.6 Write property tests for form validation
    - **Property 8: Form Validation Completeness**
    - **Property 9: Valid Form Enables Submission**
    - **Validates: Requirements 11.1, 11.6**

- [x] 6. Implement ManageTab component for node lifecycle actions
  - [x] 6.1 Create ManageTab.svelte component
    - Create `frontend/src/components/ManageTab.svelte` with state management for availableActions, nodeStatus, actionInProgress, confirmDialog
    - Accept props: nodeId, nodeType, currentStatus
    - Implement `fetchAvailableActions()` to query backend for permitted actions
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  
  - [x] 6.2 Implement action button rendering with availability logic
    - Define actionAvailability mapping (start: ['stopped'], stop: ['running'], etc.)
    - Render action buttons only when node state matches availableWhen conditions
    - Display "no actions available" message when appropriate
    - _Requirements: 5.5, 6.1, 6.2, 6.3_
  
  - [x] 6.3 Implement action execution handlers
    - Create `executeAction(action: string)` function
    - Call API with action name and node identifier
    - Disable all buttons and show loading indicator during execution
    - Handle success: display success notification, refresh node status
    - Handle errors: display error notification with backend message
    - _Requirements: 6.4, 6.5, 6.6, 6.7, 12.1, 12.2, 12.5_
  
  - [x] 6.4 Implement confirmation dialog for destructive actions
    - Create confirmation dialog component for destroy actions
    - Show VM/LXC identifier in confirmation message
    - Handle confirm: execute destroy action, navigate away on success
    - Handle cancel: close dialog, take no action
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_
  
  - [x] 6.5 Write unit tests for ManageTab
    - Test action button rendering, availability logic, execution handlers, confirmation dialogs
    - _Requirements: 5.1, 5.2, 6.1, 6.2, 6.3, 7.1, 8.1_
  
  - [x] 6.6 Write property tests for ManageTab
    - **Property 3: Action Button Availability**
    - **Property 5: Successful Action Handling**
    - **Property 6: Failed Action Error Display**
    - **Property 7: Loading State During Actions**
    - **Property 17: Dynamic Action Rendering**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.5, 6.6, 6.7, 13.5**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Integrate ManageTab into NodeDetailPage
  - [x] 8.1 Add ManageTab to NodeDetailPage.svelte
    - Import ManageTab component
    - Add "Manage" tab to existing tab navigation
    - Pass nodeId, nodeType, and currentStatus props to ManageTab
    - _Requirements: 5.1, 5.2_
  
  - [x] 8.2 Write integration tests for NodeDetailPage with ManageTab
    - Test tab navigation, prop passing, action execution flow
    - _Requirements: 5.1, 5.2_

- [x] 9. Implement ProxmoxSetupGuide component
  - [x] 9.1 Create ProxmoxSetupGuide.svelte configuration form
    - Create `frontend/src/components/ProxmoxSetupGuide.svelte` with state management for config, testResult, saving
    - Add form fields: host (required), port (required, 1-65535), username, password, realm, token, ssl.rejectUnauthorized
    - Implement validation: host (valid hostname/IP), port (numeric range), authentication (username+password+realm OR token)
    - Display warning when ssl.rejectUnauthorized is false
    - _Requirements: 10.1, 10.2, 10.3_
  
  - [x] 9.2 Implement connection test functionality
    - Add "Test Connection" button
    - Call `testProxmoxConnection()` API method with current config
    - Display test result (success/failure) with message
    - _Requirements: 10.7_
  
  - [x] 9.3 Implement configuration save handler
    - Create `saveConfiguration()` function
    - Validate all required fields before submission
    - Call `saveProxmoxConfig()` API method
    - Handle success: display success notification
    - Handle errors: display error notification with backend message
    - _Requirements: 10.3, 10.4, 10.5, 10.6_
  
  - [x] 9.4 Write unit tests for ProxmoxSetupGuide
    - Test form rendering, validation, connection test, save handler
    - _Requirements: 10.1, 10.2, 10.3, 10.7_
  
  - [x] 9.5 Write property tests for configuration validation
    - **Property 10: Configuration Validation**
    - **Validates: Requirements 10.3**

- [x] 10. Update navigation and routing
  - [x] 10.1 Add Provision route to Router.svelte
    - Add route: '/provision': { component: ProvisionPage, requiresAuth: true }
    - _Requirements: 1.2_
  
  - [x] 10.2 Add Provision menu item to Navigation.svelte
    - Add "Provision" link to top menu with icon
    - Conditionally render based on user provisioning permissions
    - Hide menu item if user lacks provisioning permissions
    - _Requirements: 1.1, 1.3, 9.2, 9.3_
  
  - [x] 10.3 Add permission check utility
    - Create `hasProvisioningPermission()` function in auth context
    - Check user permissions from auth manager
    - _Requirements: 1.3, 9.1, 9.2, 9.3_
  
  - [x] 10.4 Write unit tests for navigation updates
    - Test route registration, menu item rendering, permission checks
    - _Requirements: 1.1, 1.2, 1.3_
  
  - [x] 10.5 Write property tests for permission-based UI visibility
    - **Property 2: Permission-Based UI Visibility**
    - **Validates: Requirements 1.3, 5.4, 9.2, 9.3**

- [x] 11. Implement notification system enhancements
  - [x] 11.1 Add error notification with expandable details
    - Enhance toast notification to support expandable error details section
    - Display main error message prominently
    - Show additional details in collapsible section when available
    - _Requirements: 12.1, 12.2, 12.3_
  
  - [x] 11.2 Implement notification persistence logic
    - Error notifications: remain visible until user dismisses
    - Success notifications: auto-dismiss after exactly 5 seconds
    - _Requirements: 12.6, 12.7_
  
  - [x] 11.3 Add error logging to console
    - Log all errors to browser console with context
    - Include error type, message, stack trace, and operation context
    - _Requirements: 12.4_
  
  - [x] 11.4 Write unit tests for notification system
    - Test error display, success display, auto-dismiss timing, expandable details
    - _Requirements: 12.1, 12.2, 12.3, 12.6, 12.7_
  
  - [x] 11.5 Write property tests for notification behavior
    - **Property 11: Error Notification Persistence**
    - **Property 12: Success Notification Auto-Dismiss**
    - **Property 13: Error Details Expandability**
    - **Property 14: Error Logging**
    - **Validates: Requirements 12.1, 12.3, 12.4, 12.6, 12.7**

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement dynamic form generation utilities
  - [x] 13.1 Create form field generator from capability metadata
    - Create `frontend/src/lib/formGenerator.ts` with `generateFormFields()` function
    - Accept CapabilityParameter[] and return form field configuration
    - Map parameter types to appropriate input types
    - Apply validation rules from parameter metadata
    - _Requirements: 13.1, 13.4_
  
  - [x] 13.2 Write property tests for dynamic form generation
    - **Property 15: Dynamic Form Generation**
    - **Validates: Requirements 13.1, 13.4**

- [x] 14. Create custom fast-check generators for property tests
  - [x] 14.1 Implement test data generators
    - Create `frontend/src/__tests__/generators.ts` with custom arbitraries
    - Implement: `integrationArbitrary()`, `capabilityParameterArbitrary()`, `permissionsArbitrary()`, `nodeStateArbitrary()`
    - Configure generators to produce realistic test data
    - _Requirements: Testing strategy_
  
  - [x] 14.2 Write tests for generators
    - Verify generators produce valid data structures
    - _Requirements: Testing strategy_

- [x] 15. Integration and wiring
  - [x] 15.1 Wire all components together
    - Verify ProvisionPage renders ProxmoxProvisionForm correctly
    - Verify NodeDetailPage renders ManageTab correctly
    - Verify IntegrationSetupPage renders ProxmoxSetupGuide correctly
    - Test navigation flow: menu → provision page → form submission → success
    - Test management flow: node detail → manage tab → action execution → status refresh
    - _Requirements: All requirements_
  
  - [x] 15.2 Write end-to-end integration tests
    - Test complete provisioning flow from navigation to VM creation
    - Test complete management flow from node detail to action execution
    - Test error handling across component boundaries
    - _Requirements: All requirements_

- [x] 16. Update documentation
  - [x] 16.1 Create user guide for Provision page
    - Document how to access and use the Provision page
    - Include screenshots of VM and LXC creation forms
    - Explain form fields and validation requirements
    - _Requirements: 14.1, 14.4_
  
  - [x] 16.2 Create Proxmox integration setup guide
    - Document configuration steps for Proxmox integration
    - Include connection test instructions
    - Explain authentication options (username/password vs token)
    - _Requirements: 14.2_
  
  - [x] 16.3 Document permissions and RBAC
    - List required permissions for each provisioning action
    - Explain how permissions affect UI visibility
    - _Requirements: 14.3_
  
  - [x] 16.4 Create Manage tab usage guide
    - Document lifecycle operations available in Manage tab
    - Explain action availability based on node state
    - Include screenshots of action buttons and confirmation dialogs
    - _Requirements: 14.5_
  
  - [x] 16.5 Add troubleshooting section
    - Document common provisioning errors and solutions
    - Include API error codes and meanings
    - Provide debugging tips
    - _Requirements: 14.6_

- [x] 17. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (17 properties total)
- Unit tests validate specific examples and edge cases
- The implementation uses Svelte 5 with runes-based reactivity and TypeScript
- All API interactions use the existing api.ts client with proper retry logic
- RBAC is enforced at both backend and frontend levels
- The design is integration-agnostic to support future provisioning integrations
