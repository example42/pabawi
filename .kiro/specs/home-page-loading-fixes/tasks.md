# Implementation Plan: Home Page Loading and Menu Initialization Fixes

## Overview

This implementation plan addresses race conditions and initialization issues in the home page loading flow. The solution introduces a centralized InitializationCoordinator that manages backend readiness checks, menu building, and error handling with proper timeouts and retry mechanisms.

**Key Changes:**

- Remove all v0.5 plugin code from frontend
- Add backend readiness endpoint
- Create InitializationCoordinator for centralized state management
- Update App.svelte to use coordinator instead of direct plugin loading
- Update DynamicNavigation and MenuBuilder to coordinate through shared state
- Remove legacy route handling from menu

## Tasks

- [ ] 1. Add backend readiness endpoint
  - Create `/api/health/ready` endpoint in backend
  - Update IntegrationManager to track initialization timing
  - Add `getInitializationTime()` method to IntegrationManager
  - Return proper status codes (503 when not ready, 200 when ready)
  - _Requirements: 5.1, 5.3_

- [ ] 2. Create InitializationCoordinator
  - [ ] 2.1 Implement InitializationCoordinator class
    - Create `frontend/src/lib/initialization/InitializationCoordinator.svelte.ts`
    - Implement state machine with states: idle, checking_backend, building_menu, loaded, error
    - Use Svelte 5 runes ($state, $derived) for reactive state
    - Implement singleton pattern with `getInitializationCoordinator()`
    - Add configuration with timeout values
    - _Requirements: 4.1, 6.1, 6.2_
  
  - [ ] 2.2 Implement backend readiness polling
    - Poll `/api/health/ready` with exponential backoff
    - Handle 503 responses with retry logic
    - Implement timeout for backend readiness phase
    - _Requirements: 5.1, 5.3_
  
  - [ ] 2.3 Implement menu building coordination
    - Call MenuBuilder.initialize() after backend ready
    - Handle menu building errors
    - Implement timeout for menu building phase
    - _Requirements: 4.2, 5.2_
  
  - [ ] 2.4 Implement error handling and retry
    - Create error state with message, details, and retryable flag
    - Implement retry() method that restarts initialization
    - Add timeout handling for overall initialization
    - _Requirements: 1.3, 1.5, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4_
  
  - [ ] 2.5 Implement progress tracking
    - Update progress state with step, message, and percentage
    - Emit progress events for UI updates
    - Track timing information (startedAt, completedAt)
    - _Requirements: 2.3_
  
  - [ ] 2.6 Implement state query methods
    - Add isInitialized(), isLoading(), hasError(), canRetry()
    - Ensure methods return values consistent with state.status
    - _Requirements: 5.4_
  
  - [ ] 2.7 Make initialization idempotent
    - Check if already initialized before starting
    - Return early on subsequent calls
    - _Requirements: 5.5_
  
  - [ ]* 2.8 Write property test for InitializationCoordinator
    - **Property 1: Successful Initialization Completes All Phases**
    - **Property 12: Idempotent Initialization**
    - **Validates: Requirements 1.1, 5.1, 5.5**

- [ ] 3. Create initialization helper module
  - Create `frontend/src/lib/initialization/index.ts`
  - Export `getInitializationCoordinator()` function
  - Export types: InitializationState, InitializationConfig
  - _Requirements: 4.1_

- [ ] 4. Update App.svelte
  - [ ] 4.1 Remove v0.5 plugin initialization code
    - Remove all PluginLoader imports and usage
    - Remove all WidgetRegistry imports and usage
    - Remove plugin loading logic from onMount
    - _Requirements: 4.1, 4.2_
  
  - [ ] 4.2 Integrate InitializationCoordinator
    - Import and get coordinator instance
    - Call coordinator.initialize() in onMount (after setup check)
    - Subscribe to coordinator state for rendering decisions
    - _Requirements: 1.1, 4.1_
  
  - [ ] 4.3 Add loading state UI
    - Create LoadingDisplay component showing progress
    - Display progress.step, progress.message, progress.percentage
    - Show loading spinner during initialization
    - _Requirements: 1.4, 2.1, 2.2, 2.3_
  
  - [ ] 4.4 Add error state UI
    - Create ErrorDisplay component showing error details
    - Display error.message and error.details
    - Add retry button that calls coordinator.retry()
    - Only show retry button when error.retryable is true
    - _Requirements: 1.3, 2.5, 3.1, 3.2, 3.3, 3.4_
  
  - [ ]* 4.5 Write integration test for App initialization
    - Test full initialization flow from App.svelte
    - Test error display and retry functionality
    - Test loading state display
    - _Requirements: 1.1, 1.3, 1.4_

- [ ] 5. Update DynamicNavigation.svelte
  - [ ] 5.1 Remove independent MenuBuilder initialization
    - Remove MenuBuilder.initialize() call from onMount
    - Remove local error handling (coordinator handles it)
    - _Requirements: 4.2_
  
  - [ ] 5.2 Subscribe to InitializationCoordinator state
    - Import getInitializationCoordinator
    - Subscribe to coordinator state
    - Only render menu when state.status === 'loaded'
    - _Requirements: 4.2, 4.3_
  
  - [ ] 5.3 Update loading state display
    - Show loading indicator when status is checking_backend or building_menu
    - Remove duplicate loading logic
    - _Requirements: 1.4, 2.1, 2.2_
  
  - [ ]* 5.4 Write integration test for DynamicNavigation
    - Test menu rendering after initialization
    - Test loading state during initialization
    - _Requirements: 1.4, 4.2_

- [ ] 6. Update MenuBuilder.svelte.ts
  - [ ] 6.1 Make initialize() idempotent
    - Add initialized flag
    - Return early if already initialized
    - Log when skipping re-initialization
    - _Requirements: 5.5_
  
  - [ ] 6.2 Remove legacy route handling
    - Remove processing of response.legacy array
    - Remove customContributions for legacy routes
    - Update buildMenu() to not include legacy section
    - Remove legacy group from menu structure
    - _Requirements: 4.1_
  
  - [ ] 6.3 Improve error handling
    - Throw errors instead of just logging them
    - Ensure errors propagate to coordinator
    - Set lastError state on failures
    - _Requirements: 3.2_
  
  - [ ] 6.4 Add initialization state tracking
    - Add isInitialized() method
    - Track initialization status
    - _Requirements: 5.4_
  
  - [ ]* 6.5 Write unit tests for MenuBuilder
    - Test idempotent initialization
    - Test error propagation
    - Test menu building with v1 integrations only
    - Test that legacy routes are not processed
    - _Requirements: 5.5, 3.2_

- [ ] 7. Checkpoint - Test initialization flow
  - Ensure backend readiness endpoint works
  - Ensure InitializationCoordinator state transitions correctly
  - Ensure App.svelte displays loading/error/success states
  - Ensure menu appears after initialization
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Implement timeout handling
  - [ ] 8.1 Add timeout utility function
    - Create withTimeout() helper in InitializationCoordinator
    - Use Promise.race for timeout implementation
    - _Requirements: 1.5, 2.4_
  
  - [ ] 8.2 Apply timeouts to all phases
    - Backend readiness timeout (default 10s)
    - Menu building timeout (default 5s)
    - Overall initialization timeout (default 15s)
    - _Requirements: 1.5, 2.4_
  
  - [ ]* 8.3 Write property test for timeout handling
    - **Property 2: Initialization Timeout Prevents Infinite Loading**
    - **Validates: Requirements 1.5, 2.4**

- [ ] 9. Implement graceful degradation
  - [ ] 9.1 Handle partial plugin failures in backend
    - Update IntegrationManager to continue with available plugins
    - Log plugin failures but don't block initialization
    - _Requirements: 3.5_
  
  - [ ] 9.2 Handle partial menu data
    - MenuBuilder should build menu with available integrations
    - Don't fail if some integrations are missing
    - _Requirements: 3.5_
  
  - [ ]* 9.3 Write property test for graceful degradation
    - **Property 7: Graceful Degradation on Partial Failures**
    - **Validates: Requirements 3.5**

- [ ] 10. Add comprehensive error messages
  - [ ] 10.1 Create error message templates
    - Backend unavailable message
    - Backend timeout message
    - Menu build failure message
    - Network error message
    - _Requirements: 3.4_
  
  - [ ] 10.2 Include actionable information
    - Suggest refresh for retryable errors
    - Suggest checking logs for persistent errors
    - Include error details in debug mode
    - _Requirements: 3.4_
  
  - [ ]* 10.3 Write property test for error messages
    - **Property 4: Error Propagation to UI**
    - **Validates: Requirements 1.3, 3.1, 3.2, 3.3, 3.4**

- [ ] 11. Implement progress tracking
  - [ ] 11.1 Add progress updates in coordinator
    - Update progress at each phase transition
    - Include step name, message, and percentage
    - _Requirements: 2.3_
  
  - [ ] 11.2 Display progress in UI
    - Show current step in LoadingDisplay
    - Show progress percentage if available
    - Update progress message
    - _Requirements: 2.3_
  
  - [ ]* 11.3 Write property test for progress updates
    - **Property 5: Progress Updates Through Phases**
    - **Validates: Requirements 2.3**

- [ ] 12. Add state persistence
  - [ ] 12.1 Ensure coordinator state persists across remounts
    - Use singleton pattern for coordinator
    - Don't reset state on component remount
    - _Requirements: 6.5_
  
  - [ ]* 12.2 Write property test for state persistence
    - **Property 15: State Persistence Across Remounts**
    - **Validates: Requirements 6.5**

- [ ] 13. Implement remaining correctness properties
  - [ ]* 13.1 Write property test for loading state visibility
    - **Property 3: Loading State Visibility During Initialization**
    - **Validates: Requirements 1.4, 2.1, 2.2**
  
  - [ ]* 13.2 Write property test for retry functionality
    - **Property 6: Retry Functionality After Errors**
    - **Validates: Requirements 2.5**
  
  - [ ]* 13.3 Write property test for initialization order
    - **Property 8: Backend Initialization Before Menu Building**
    - **Validates: Requirements 4.2, 5.1, 5.2**
  
  - [ ]* 13.4 Write property test for no duplicate API calls
    - **Property 9: No Duplicate API Calls**
    - **Validates: Requirements 4.4**
  
  - [ ]* 13.5 Write property test for backend readiness
    - **Property 10: Backend Readiness Before Menu Requests**
    - **Validates: Requirements 5.1, 5.3**
  
  - [ ]* 13.6 Write property test for state query API
    - **Property 11: State Query API Correctness**
    - **Validates: Requirements 5.4**
  
  - [ ]* 13.7 Write property test for state machine transitions
    - **Property 13: State Machine Transitions**
    - **Validates: Requirements 6.2**
  
  - [ ]* 13.8 Write property test for error state structure
    - **Property 14: Error State Structure**
    - **Validates: Requirements 6.3**

- [ ] 14. Final checkpoint - Comprehensive testing
  - Run all unit tests
  - Run all property-based tests (minimum 100 iterations each)
  - Test initialization flow end-to-end
  - Test error scenarios (backend timeout, menu failure, network errors)
  - Test retry functionality
  - Test graceful degradation with partial plugin failures
  - Verify no v0.5 plugin code remains in App.svelte
  - Verify no legacy routes in menu
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional property-based tests that can be skipped for faster MVP
- Each property test should run a minimum of 100 iterations
- Use fast-check library for property-based testing in TypeScript
- All v0.5 plugin code (PluginLoader, WidgetRegistry) must be removed from frontend
- Only v1.0.0 integrations are used (backend handles all plugin loading)
- Legacy routes are completely removed from the menu system
- The InitializationCoordinator is the single source of truth for initialization state
- Backend readiness polling uses exponential backoff to reduce load
- All errors should be surfaced to users with actionable messages
