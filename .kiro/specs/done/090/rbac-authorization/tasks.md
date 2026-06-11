# Implementation Plan: RBAC Authorization System

## Overview

This plan implements a comprehensive Role-Based Access Control (RBAC) system for Pabawi with user authentication, group management, role-based permissions, and integration with existing Ansible, Bolt, and PuppetDB features. The implementation follows a bottom-up approach: database schema → core services → middleware → API routes → frontend UI.

## Tasks

- [x] 1. Database schema and migrations
  - [x] 1.1 Create RBAC database schema
    - Create tables: users, groups, roles, permissions, user_groups, user_roles, group_roles, role_permissions, revoked_tokens
    - Add indexes for performance optimization
    - Add unique constraints for data integrity
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_
  
  - [x] 1.2 Create database migration system
    - Implement migration runner for schema updates
    - Create initial migration with RBAC tables
    - _Requirements: 14.7_
  
  - [x] 1.3 Seed built-in roles and permissions
    - Create Viewer, Operator, Administrator roles
    - Create permissions for ansible, bolt, puppetdb resources
    - Create default admin user account
    - _Requirements: 17.1, 17.2, 17.3, 17.6_

- [x] 2. Core authentication service
  - [x] 2.1 Implement AuthenticationService
    - Implement password hashing with bcrypt
    - Implement JWT token generation and verification
    - Implement token refresh mechanism
    - Implement token revocation
    - _Requirements: 1.1, 1.5, 1.6, 6.1, 6.2, 6.6_
  
  - [x] 2.2 Write property test for password hashing
    - **Property 1: Password Security**
    - **Validates: Requirements 1.5**
  
  - [x] 2.3 Write property test for token validity
    - **Property 2: Token Validity**
    - **Validates: Requirements 6.1, 6.6**
  
  - [x] 2.4 Implement authentication validation
    - Validate credentials against database
    - Update lastLoginAt timestamp on success
    - Log failed authentication attempts
    - _Requirements: 1.1, 1.2, 1.3, 7.3_
  
  - [x] 2.5 Write property test for authentication atomicity
    - **Property 3: Authentication Atomicity**
    - **Validates: Requirements 1.1, 1.4_

- [x] 3. User management service
  - [x] 3.1 Implement UserService CRUD operations
    - Implement createUser with validation
    - Implement getUserById, getUserByUsername
    - Implement updateUser with validation
    - Implement deleteUser (soft delete)
    - Implement listUsers with pagination
    - _Requirements: 2.1, 2.2, 2.6, 2.7, 2.8_
  
  - [x] 3.2 Implement password validation
    - Validate password complexity requirements
    - Enforce minimum length (8 characters)
    - Require uppercase, lowercase, number, special character
    - _Requirements: 2.3, 2.4, 2.5_
  
  - [x] 3.3 Write property test for username uniqueness
    - **Property 8: Username Uniqueness**
    - **Validates: Requirements 2.1, 14.1**
  
  - [x] 3.4 Write property test for email uniqueness
    - **Property 9: Email Uniqueness**
    - **Validates: Requirements 2.2, 14.2**
  
  - [x] 3.5 Implement user-group associations
    - Implement addUserToGroup
    - Implement removeUserFromGroup
    - Implement getUserGroups
    - _Requirements: 3.2, 3.3, 3.7_
  
  - [x] 3.6 Implement user-role assignments
    - Implement assignRoleToUser
    - Implement removeRoleFromUser
    - Implement getUserRoles
    - _Requirements: 4.6, 4.8_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Group and role management services
  - [x] 5.1 Implement GroupService
    - Implement createGroup with validation
    - Implement getGroupById, updateGroup, deleteGroup
    - Implement listGroups with pagination
    - Implement getGroupMembers, getGroupMemberCount
    - _Requirements: 3.1, 3.6_
  
  - [x] 5.2 Implement group-role associations
    - Implement assignRoleToGroup
    - Implement removeRoleFromGroup
    - Implement getGroupRoles
    - _Requirements: 4.7_
  
  - [x] 5.3 Implement RoleService
    - Implement createRole with validation
    - Implement getRoleById, updateRole, deleteRole
    - Implement listRoles with pagination
    - Implement getBuiltInRoles, isBuiltInRole
    - Protect built-in roles from deletion/modification
    - _Requirements: 4.1, 4.5, 17.4, 17.5_
  
  - [x] 5.4 Implement role-permission associations
    - Implement assignPermissionToRole
    - Implement removePermissionFromRole
    - Implement getRolePermissions
    - _Requirements: 4.2, 4.3_
  
  - [x] 5.5 Write property test for role assignment idempotence
    - **Property 11: Role Assignment Idempotence**
    - **Validates: Requirements 14.6**

- [x] 6. Permission service and authorization
  - [x] 6.1 Implement PermissionService
    - Implement createPermission with validation
    - Implement getPermissionById
    - Implement listPermissions with pagination
    - Enforce unique resource-action combinations
    - _Requirements: 4.4, 14.5_
  
  - [x] 6.2 Implement permission checking logic
    - Implement hasPermission with multi-path checks
    - Check direct user-role-permission path
    - Check user-group-role-permission path
    - Handle admin users (always true)
    - Handle inactive users (always false)
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6_
  
  - [x] 6.3 Write property test for permission transitivity
    - **Property 4: Permission Transitivity**
    - **Validates: Requirements 8.1, 4.6**
  
  - [x] 6.4 Write property test for group permission inheritance
    - **Property 5: Group Permission Inheritance**
    - **Validates: Requirements 8.2, 3.4**
  
  - [x] 6.5 Write property test for admin privilege
    - **Property 6: Admin Privilege**
    - **Validates: Requirements 5.5**
  
  - [x] 6.6 Write property test for inactive user denial
    - **Property 7: Inactive User Denial**
    - **Validates: Requirements 5.6**
  
  - [x] 6.7 Implement getUserPermissions aggregation
    - Aggregate permissions from all sources
    - Deduplicate permissions
    - Order by resource and action
    - _Requirements: 8.3, 8.6_
  
  - [x] 6.8 Implement permission caching
    - Cache permission check results (5 minutes TTL)
    - Implement cache invalidation on role/permission changes
    - _Requirements: 15.1, 15.2_

- [x] 7. Authentication and authorization middleware
  - [x] 7.1 Implement authentication middleware
    - Extract JWT token from Authorization header
    - Verify token signature and expiration
    - Check token revocation list
    - Attach user payload to request object
    - _Requirements: 5.1, 6.6_
  
  - [x] 7.2 Implement RBAC middleware
    - Check user permissions for resource and action
    - Return 403 Forbidden if insufficient permissions
    - Log authorization failures
    - _Requirements: 5.2, 5.3, 5.4, 7.4_
  
  - [x] 7.3 Write unit tests for authentication middleware
    - Test valid token, expired token, revoked token
    - Test missing token, invalid signature
    - _Requirements: 1.7, 6.5_
  
  - [x] 7.4 Write unit tests for RBAC middleware
    - Test sufficient permissions, insufficient permissions
    - Test admin user, inactive user
    - _Requirements: 5.3, 5.4, 5.5, 5.6_

- [x] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Authentication API routes
  - [x] 9.1 Implement POST /api/auth/register
    - Validate user input with Zod schema
    - Create user account
    - Return user DTO (no password)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  
  - [x] 9.2 Implement POST /api/auth/login
    - Authenticate user credentials
    - Generate access and refresh tokens
    - Return tokens and user DTO
    - _Requirements: 1.1, 1.2, 1.3, 6.1, 6.2_
  
  - [x] 9.3 Implement POST /api/auth/logout
    - Revoke user's tokens
    - Clear client-side token storage
    - _Requirements: 1.6, 6.4_
  
  - [x] 9.4 Implement POST /api/auth/refresh
    - Verify refresh token
    - Generate new access token
    - _Requirements: 6.3, 19.2_
  
  - [x] 9.5 Implement POST /api/auth/change-password
    - Verify current password
    - Validate new password complexity
    - Hash and update password
    - Revoke all existing tokens
    - _Requirements: 20.1, 20.2, 20.3, 20.4_
  
  - [x] 9.6 Write integration tests for authentication flow
    - Test complete registration → login → access protected endpoint flow
    - Test token refresh flow
    - Test logout flow
    - _Requirements: 1.1, 6.3, 19.1_

- [x] 10. User management API routes
  - [x] 10.1 Implement GET /api/users
    - Require authentication
    - Require 'users:read' permission
    - Return paginated user list
    - _Requirements: 12.1_
  
  - [x] 10.2 Implement GET /api/users/:id
    - Require authentication
    - Require 'users:read' permission
    - Return user with groups and roles
    - _Requirements: 12.4_
  
  - [x] 10.3 Implement PUT /api/users/:id
    - Require authentication
    - Require 'users:write' permission
    - Validate and update user
    - _Requirements: 2.6, 2.7, 2.8_
  
  - [x] 10.4 Implement DELETE /api/users/:id
    - Require authentication
    - Require 'users:admin' permission
    - Soft delete user account
    - _Requirements: 2.8_
  
  - [x] 10.5 Implement POST /api/users/:id/groups/:groupId
    - Require authentication
    - Require 'users:write' permission
    - Add user to group
    - Invalidate permission cache
    - _Requirements: 3.2, 3.4, 15.2_
  
  - [x] 10.6 Implement DELETE /api/users/:id/groups/:groupId
    - Require authentication
    - Require 'users:write' permission
    - Remove user from group
    - Invalidate permission cache
    - _Requirements: 3.3, 3.5, 15.2_
  
  - [x] 10.7 Implement POST /api/users/:id/roles/:roleId
    - Require authentication
    - Require 'users:write' permission
    - Assign role to user
    - Invalidate permission cache
    - _Requirements: 4.6, 8.1, 15.2_
  
  - [x] 10.8 Implement DELETE /api/users/:id/roles/:roleId
    - Require authentication
    - Require 'users:write' permission
    - Remove role from user
    - Invalidate permission cache
    - _Requirements: 4.8, 8.5, 15.2_

- [x] 11. Group and role management API routes
  - [x] 11.1 Implement group CRUD routes
    - POST /api/groups - Create group
    - GET /api/groups - List groups
    - GET /api/groups/:id - Get group details
    - PUT /api/groups/:id - Update group
    - DELETE /api/groups/:id - Delete group
    - _Requirements: 3.1, 3.6, 12.2, 12.5_
  
  - [x] 11.2 Implement group-role association routes
    - POST /api/groups/:id/roles/:roleId - Assign role to group
    - DELETE /api/groups/:id/roles/:roleId - Remove role from group
    - _Requirements: 4.7, 8.2_
  
  - [x] 11.3 Implement role CRUD routes
    - POST /api/roles - Create role
    - GET /api/roles - List roles
    - GET /api/roles/:id - Get role details
    - PUT /api/roles/:id - Update role
    - DELETE /api/roles/:id - Delete role (protect built-in)
    - _Requirements: 4.1, 4.5, 12.3, 12.6, 17.4, 17.5_
  
  - [x] 11.4 Implement role-permission association routes
    - POST /api/roles/:id/permissions/:permissionId - Assign permission
    - DELETE /api/roles/:id/permissions/:permissionId - Remove permission
    - _Requirements: 4.2, 4.3, 8.4_
  
  - [x] 11.5 Implement permission routes
    - POST /api/permissions - Create permission
    - GET /api/permissions - List permissions
    - _Requirements: 4.4, 18.1, 18.4_

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Integrate RBAC with existing integrations
  - [x] 13.1 Add authentication to Ansible routes
    - Apply authMiddleware to all /api/ansible/* routes
    - Apply rbacMiddleware('ansible', 'read') to GET routes
    - Apply rbacMiddleware('ansible', 'execute') to POST execute routes
    - Apply rbacMiddleware('ansible', 'write') to PUT/POST config routes
    - Apply rbacMiddleware('ansible', 'admin') to DELETE routes
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_
  
  - [x] 13.2 Add authentication to Bolt routes
    - Apply authMiddleware to all /api/bolt/* routes
    - Apply rbacMiddleware('bolt', 'read') to GET routes
    - Apply rbacMiddleware('bolt', 'execute') to POST execute routes
    - Apply rbacMiddleware('bolt', 'write') to PUT/POST config routes
    - Apply rbacMiddleware('bolt', 'admin') to DELETE routes
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  
  - [x] 13.3 Add authentication to PuppetDB routes
    - Apply authMiddleware to all /api/puppetdb/* routes
    - Apply rbacMiddleware('puppetdb', 'read') to GET routes
    - Apply rbacMiddleware('puppetdb', 'write') to POST/PUT routes
    - Apply rbacMiddleware('puppetdb', 'admin') to DELETE routes
    - _Requirements: 11.1, 11.2, 11.3, 11.4_
  
  - [x] 13.4 Write integration tests for permission inheritance
    - Test user with direct role assignment
    - Test user with group role assignment
    - Test user with multiple permission paths
    - Test permission revocation scenarios
    - _Requirements: 8.1, 8.2, 8.3, 8.5_

- [x] 14. Security features and audit logging
  - [x] 14.1 Implement brute force protection
    - Track failed login attempts per username
    - Implement temporary account lockout (5 attempts / 15 minutes)
    - Implement permanent lockout (10 attempts)
    - _Requirements: 7.1, 7.2, 7.5_
  
  - [x] 14.2 Implement audit logging service
    - Log authentication attempts (success/failure)
    - Log authorization failures
    - Log user/role/permission changes
    - Log admin actions
    - Include timestamp, user ID, IP address, action
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.6, 13.7_
  
  - [x] 14.3 Implement security headers and protections
    - Add helmet middleware for security headers
    - Implement rate limiting (100 requests/minute per user)
    - Add input sanitization
    - _Requirements: 7.6_
  
  - [x] 14.4 Write unit tests for brute force protection
    - Test account lockout after 5 failed attempts
    - Test lockout expiration
    - Test permanent lockout after 10 attempts
    - _Requirements: 7.1, 7.2, 7.5_

- [x] 15. Frontend authentication UI
  - [x] 15.1 Create authentication state management
    - Create auth store with Svelte runes
    - Store token in localStorage
    - Implement automatic token refresh
    - Handle token expiration
    - _Requirements: 19.1, 19.2, 19.3_
  
  - [x] 15.2 Create LoginPage component
    - Username and password input fields
    - Form validation
    - Error message display
    - Redirect to dashboard on success
    - _Requirements: 1.1, 1.2_
  
  - [x] 15.3 Create RegisterPage component
    - User registration form
    - Password complexity validation
    - Email validation
    - Error handling for duplicate username/email
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
  
  - [x] 15.4 Update Navigation component
    - Show login/register links when not authenticated
    - Show user menu with logout when authenticated
    - Display current user name
    - _Requirements: 1.6_
  
  - [x] 15.5 Create ChangePasswordDialog component
    - Current password verification
    - New password input with complexity validation
    - Confirm password field
    - _Requirements: 20.1, 20.2_
  
  - [x] 15.6 Update API client with authentication
    - Add Authorization header with JWT token
    - Handle 401 responses (token expired)
    - Implement automatic token refresh
    - Redirect to login on authentication failure
    - _Requirements: 5.1, 19.2_

- [x] 16. Frontend admin UI
  - [x] 16.1 Create UserManagementPage component
    - Display paginated user list
    - Search and filter users
    - Create new user button
    - Edit/delete user actions
    - Require 'users:read' permission
    - _Requirements: 12.1, 12.7_
  
  - [x] 16.2 Create UserDetailDialog component
    - Display user information
    - Show user's groups and roles
    - Add/remove group memberships
    - Add/remove role assignments
    - Activate/deactivate user
    - _Requirements: 12.4_
  
  - [x] 16.3 Create GroupManagementPage component
    - Display paginated group list
    - Create new group button
    - Edit/delete group actions
    - Require 'groups:read' permission
    - _Requirements: 12.2, 12.7_
  
  - [x] 16.4 Create GroupDetailDialog component
    - Display group information
    - Show group members
    - Show assigned roles
    - Add/remove role assignments
    - _Requirements: 12.5_
  
  - [x] 16.5 Create RoleManagementPage component
    - Display paginated role list
    - Create new role button
    - Edit/delete role actions (protect built-in)
    - Require 'roles:read' permission
    - _Requirements: 12.3, 12.7, 17.4, 17.5_
  
  - [x] 16.6 Create RoleDetailDialog component
    - Display role information
    - Show assigned permissions
    - Add/remove permission assignments
    - Indicate if role is built-in
    - _Requirements: 12.6_
  
  - [x] 16.7 Implement permission-based UI rendering
    - Hide admin menu items for non-admin users
    - Disable actions based on user permissions
    - Show permission-denied messages appropriately
    - _Requirements: 5.3, 5.4, 12.7_

- [x] 17. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Error handling and validation
  - [x] 18.1 Implement comprehensive error responses
    - Return clear error messages for authentication failures
    - Return 403 with required permission for authorization failures
    - Return 400 with validation details for input errors
    - Return 409 for duplicate username/email
    - Return 503 for database connection failures
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_
  
  - [x] 18.2 Create Zod validation schemas
    - Schema for user registration/update
    - Schema for password validation
    - Schema for group/role creation
    - Schema for permission creation
    - _Requirements: 14.7_
  
  - [x] 18.3 Implement input sanitization
    - Sanitize all user inputs
    - Prevent SQL injection with parameterized queries
    - Prevent XSS attacks
    - _Requirements: 7.6_
  
  - [x] 18.4 Write unit tests for error handling
    - Test all error scenarios
    - Verify error message format
    - Verify HTTP status codes
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7_

- [x] 19. Performance optimization and monitoring
  - [x] 19.1 Implement database query optimization
    - Add indexes for all foreign keys
    - Add composite indexes for permission checks
    - Use prepared statements
    - Implement connection pooling
    - _Requirements: 15.5_
  
  - [x] 19.2 Implement performance monitoring
    - Add timing metrics for authentication
    - Add timing metrics for permission checks
    - Add cache hit rate tracking
    - Log slow queries (>200ms)
    - _Requirements: 15.3, 15.4_
  
  - [x] 19.3 Optimize permission check queries
    - Use UNION for multi-path permission checks
    - Implement query result caching
    - Batch permission checks when possible
    - _Requirements: 15.2, 15.5_
  
  - [x] 19.4 Write performance tests
    - Test authentication response time (<200ms)
    - Test cached permission check (<50ms)
    - Test concurrent user load (1000 users)
    - _Requirements: 15.3, 15.4, 15.6_

- [x] 20. Documentation and deployment
  - [x] 20.1 Update API documentation
    - Document all authentication endpoints
    - Document all user management endpoints
    - Document all admin endpoints
    - Include authentication requirements
    - Include permission requirements
    - _Requirements: All_
  
  - [x] 20.2 Create user guide documentation
    - Document login/registration process
    - Document password requirements
    - Document admin user management
    - Document role and permission concepts
    - _Requirements: All_
  
  - [x] 20.3 Create deployment checklist
    - Environment variable configuration (JWT_SECRET)
    - Database migration execution
    - Default admin user creation
    - Security header configuration
    - Rate limiting configuration
    - _Requirements: All_

- [x] 21. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties from the design
- Unit tests validate specific examples and edge cases
- Integration tests validate end-to-end workflows
- The implementation uses TypeScript for backend and Svelte for frontend
- All passwords are hashed with bcrypt before storage
- JWT tokens are used for stateless authentication
- Permission checks support multiple inheritance paths (direct roles and group roles)
- Admin users have all permissions automatically
- Built-in roles (Viewer, Operator, Administrator) are protected from deletion
