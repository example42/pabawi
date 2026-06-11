# Requirements Document: SSH Integration

## Introduction

This document defines the requirements for adding native SSH integration to Pabawi. The SSH integration will provide direct remote execution capabilities similar to those available in lab42-ansible and lab42-bolt, enabling Pabawi to execute commands and manage packages on remote hosts without requiring external automation tools. This integration will follow Pabawi's plugin architecture pattern and provide both execution and information source capabilities.

## Glossary

- **SSH_Plugin**: The integration plugin that provides SSH-based remote execution and inventory management
- **Inventory_Source**: A configuration source that defines target hosts and their connection parameters
- **Target_Host**: A remote system accessible via SSH that can receive commands
- **SSH_Connection**: An authenticated SSH session to a Target_Host
- **Remote_Command**: A shell command executed on a Target_Host via SSH
- **Package_Manager**: A system package management tool (apt, yum, dnf, zypper, pacman)
- **Execution_Result**: The output, exit code, and metadata from a Remote_Command
- **Connection_Pool**: A managed set of reusable SSH_Connections
- **Host_Key**: An SSH server's public key used for host verification
- **Private_Key**: An SSH client private key used for authentication
- **Inventory_File**: An SSH config file (OpenSSH format) defining Target_Hosts and their properties
- **Integration_Manager**: Pabawi's central orchestrator for all plugins

## Requirements

### Requirement 1: SSH Plugin Registration

**User Story:** As a Pabawi administrator, I want the SSH plugin to integrate seamlessly with the existing plugin architecture, so that it behaves consistently with other integrations.

#### Acceptance Criteria

1. THE SSH_Plugin SHALL extend the BasePlugin class
2. THE SSH_Plugin SHALL implement both ExecutionToolPlugin and InformationSourcePlugin interfaces
3. WHEN the SSH_Plugin is registered, THE Integration_Manager SHALL add it to both executionTools and informationSources maps
4. THE SSH_Plugin SHALL have a configurable priority value for inventory deduplication
5. THE SSH_Plugin SHALL support enable/disable configuration via environment variables

### Requirement 2: Inventory Source Management

**User Story:** As a Pabawi administrator, I want to define SSH target hosts in SSH config files, so that I can use my existing SSH configurations and manage infrastructure as code.

#### Acceptance Criteria

1. WHEN an SSH config file path is configured, THE SSH_Plugin SHALL load Target_Hosts from the file
2. THE SSH_Plugin SHALL support standard OpenSSH config file format
3. THE SSH_Plugin SHALL parse Host directives with HostName, User, Port, and IdentityFile keywords
4. WHEN an SSH config file is modified, THE SSH_Plugin SHALL reload the configuration within 60 seconds
5. THE SSH_Plugin SHALL extract host aliases from Host directive patterns
6. WHERE a Host directive includes custom group metadata in comments, THE SSH_Plugin SHALL parse group assignments
7. IF an SSH config file contains syntax errors, THEN THE SSH_Plugin SHALL log the error and continue with the last valid configuration

### Requirement 3: SSH Connection Establishment

**User Story:** As a Pabawi user, I want to connect to remote hosts via SSH, so that I can execute commands on my infrastructure.

#### Acceptance Criteria

1. WHEN a Remote_Command is requested, THE SSH_Plugin SHALL establish an SSH_Connection to the Target_Host
2. THE SSH_Plugin SHALL support SSH key-based authentication using Private_Keys
3. THE SSH_Plugin SHALL support password authentication when configured
4. THE SSH_Plugin SHALL validate Host_Keys against known_hosts file
5. WHERE host_key_check is disabled in configuration, THE SSH_Plugin SHALL skip Host_Key validation
6. THE SSH_Plugin SHALL support configurable connection timeout between 5 and 300 seconds
7. WHEN an SSH_Connection fails, THE SSH_Plugin SHALL return an Execution_Result with error details
8. THE SSH_Plugin SHALL support SSH agent forwarding when configured

### Requirement 4: Connection Pool Management

**User Story:** As a Pabawi administrator, I want SSH connections to be reused efficiently, so that command execution is fast and resource usage is optimized.

#### Acceptance Criteria

1. THE SSH_Plugin SHALL maintain a Connection_Pool for active SSH_Connections
2. WHEN a Remote_Command is requested for a Target_Host with an active SSH_Connection, THE SSH_Plugin SHALL reuse the connection
3. THE SSH_Plugin SHALL support configurable maximum connections per Target_Host
4. WHEN an SSH_Connection is idle for more than 300 seconds, THE SSH_Plugin SHALL close the connection
5. THE SSH_Plugin SHALL support configurable Connection_Pool size limits
6. WHEN the Connection_Pool reaches maximum size, THE SSH_Plugin SHALL close the least recently used connection
7. THE SSH_Plugin SHALL handle connection failures by removing invalid connections from the Connection_Pool

### Requirement 5: Remote Command Execution

**User Story:** As a Pabawi user, I want to execute shell commands on remote hosts, so that I can perform ad-hoc operations on my infrastructure.

#### Acceptance Criteria

1. WHEN a Remote_Command is submitted, THE SSH_Plugin SHALL execute it on the specified Target_Host
2. THE SSH_Plugin SHALL capture stdout from the Remote_Command
3. THE SSH_Plugin SHALL capture stderr from the Remote_Command
4. THE SSH_Plugin SHALL capture the exit code from the Remote_Command
5. THE SSH_Plugin SHALL support command execution timeout between 10 and 3600 seconds
6. WHEN a Remote_Command exceeds the timeout, THE SSH_Plugin SHALL terminate the command and return a timeout error
7. THE SSH_Plugin SHALL support streaming output for long-running commands
8. THE SSH_Plugin SHALL record execution start time and end time
9. THE SSH_Plugin SHALL return an Execution_Result containing stdout, stderr, exit_code, duration, and Target_Host information

### Requirement 6: Privilege Escalation

**User Story:** As a Pabawi user, I want to execute commands with elevated privileges, so that I can perform administrative operations on remote hosts.

#### Acceptance Criteria

1. WHERE privilege escalation is configured, THE SSH_Plugin SHALL execute Remote_Commands using sudo
2. THE SSH_Plugin SHALL support configurable sudo command prefix
3. THE SSH_Plugin SHALL support passwordless sudo execution
4. WHERE sudo requires a password, THE SSH_Plugin SHALL support password input via configuration
5. THE SSH_Plugin SHALL support configurable run-as user for privilege escalation
6. WHEN privilege escalation fails, THE SSH_Plugin SHALL return an Execution_Result with error details

### Requirement 7: Package Management Operations

**User Story:** As a Pabawi user, I want to install and manage packages on remote hosts, so that I can maintain software across my infrastructure.

#### Acceptance Criteria

1. THE SSH_Plugin SHALL detect the Package_Manager available on each Target_Host
2. WHEN a package installation is requested, THE SSH_Plugin SHALL use the appropriate Package_Manager command
3. THE SSH_Plugin SHALL support apt package manager for Debian-based systems
4. THE SSH_Plugin SHALL support yum package manager for RHEL-based systems
5. THE SSH_Plugin SHALL support dnf package manager for Fedora-based systems
6. THE SSH_Plugin SHALL support zypper package manager for SUSE-based systems
7. THE SSH_Plugin SHALL support pacman package manager for Arch-based systems
8. WHEN a package operation is requested, THE SSH_Plugin SHALL return an Execution_Result indicating success or failure
9. THE SSH_Plugin SHALL support package installation, removal, and update operations
10. WHEN a Package_Manager is not detected, THE SSH_Plugin SHALL return an error indicating the system is unsupported

### Requirement 8: Inventory Information Source

**User Story:** As a Pabawi user, I want to see SSH-managed hosts in the unified inventory view, so that I have a complete picture of my infrastructure.

#### Acceptance Criteria

1. WHEN inventory is requested, THE SSH_Plugin SHALL return all Target_Hosts from configured Inventory_Sources
2. THE SSH_Plugin SHALL tag each Target_Host with source name "ssh"
3. THE SSH_Plugin SHALL provide Target_Host properties: name, uri, alias, groups, connection_parameters
4. THE SSH_Plugin SHALL participate in node linking when Target_Hosts match nodes from other sources
5. THE SSH_Plugin SHALL support getInventory() method returning normalized inventory data

### Requirement 9: Health Check Implementation

**User Story:** As a Pabawi administrator, I want to monitor SSH plugin health, so that I can identify connectivity issues quickly.

#### Acceptance Criteria

1. WHEN a health check is requested, THE SSH_Plugin SHALL verify Inventory_File accessibility
2. THE SSH_Plugin SHALL test SSH_Connection to a configurable subset of Target_Hosts
3. WHEN all tested connections succeed, THE SSH_Plugin SHALL return healthy status
4. WHEN some connections fail, THE SSH_Plugin SHALL return degraded status with details
5. WHEN no connections succeed, THE SSH_Plugin SHALL return unhealthy status
6. THE SSH_Plugin SHALL complete health checks within 30 seconds
7. THE SSH_Plugin SHALL cache health check results according to Integration_Manager TTL settings

### Requirement 10: Configuration Management

**User Story:** As a Pabawi administrator, I want to configure SSH integration via environment variables, so that configuration is consistent with other Pabawi integrations.

#### Acceptance Criteria

1. THE SSH_Plugin SHALL support SSH_ENABLED environment variable to enable/disable the integration
2. THE SSH_Plugin SHALL support SSH_CONFIG_PATH environment variable for SSH config file location
3. THE SSH_Plugin SHALL support SSH_DEFAULT_USER environment variable for default SSH username
4. THE SSH_Plugin SHALL support SSH_DEFAULT_KEY environment variable for default Private_Key path
5. THE SSH_Plugin SHALL support SSH_DEFAULT_PORT environment variable for default SSH port
6. THE SSH_Plugin SHALL support SSH_HOST_KEY_CHECK environment variable to enable/disable host key verification
7. THE SSH_Plugin SHALL support SSH_CONNECTION_TIMEOUT environment variable for connection timeout
8. THE SSH_Plugin SHALL support SSH_COMMAND_TIMEOUT environment variable for command execution timeout
9. THE SSH_Plugin SHALL support SSH_MAX_CONNECTIONS environment variable for Connection_Pool size
10. THE SSH_Plugin SHALL support SSH_SUDO_ENABLED environment variable to enable privilege escalation
11. WHEN required configuration is missing, THE SSH_Plugin SHALL log an error and set initialized to false

### Requirement 11: Error Handling and Logging

**User Story:** As a Pabawi administrator, I want detailed error messages and logs, so that I can troubleshoot SSH connectivity and execution issues.

#### Acceptance Criteria

1. WHEN an SSH_Connection fails, THE SSH_Plugin SHALL log the error with Target_Host details
2. WHEN a Remote_Command fails, THE SSH_Plugin SHALL log the command, exit code, and error output
3. THE SSH_Plugin SHALL log all configuration validation errors during initialization
4. THE SSH_Plugin SHALL log Inventory_File reload events
5. THE SSH_Plugin SHALL log Connection_Pool management events at debug level
6. WHEN authentication fails, THE SSH_Plugin SHALL return an error message indicating authentication failure
7. THE SSH_Plugin SHALL obfuscate sensitive data (passwords, private keys) in logs

### Requirement 12: Concurrent Execution Support

**User Story:** As a Pabawi user, I want to execute commands on multiple hosts simultaneously, so that operations complete quickly across my infrastructure.

#### Acceptance Criteria

1. WHEN Remote_Commands are submitted for multiple Target_Hosts, THE SSH_Plugin SHALL execute them in parallel
2. THE SSH_Plugin SHALL support configurable concurrency limit between 1 and 100
3. THE SSH_Plugin SHALL queue commands when concurrency limit is reached
4. THE SSH_Plugin SHALL return individual Execution_Results for each Target_Host
5. WHEN one Target_Host fails, THE SSH_Plugin SHALL continue executing on remaining Target_Hosts

### Requirement 13: Security and Authentication

**User Story:** As a Pabawi administrator, I want secure SSH authentication and connection handling, so that my infrastructure remains protected.

#### Acceptance Criteria

1. THE SSH_Plugin SHALL support RSA, ECDSA, and ED25519 Private_Key formats
2. THE SSH_Plugin SHALL support encrypted Private_Keys with passphrase
3. THE SSH_Plugin SHALL read Private_Keys from filesystem with appropriate permission checks
4. WHEN a Private_Key has incorrect permissions, THE SSH_Plugin SHALL log a warning
5. THE SSH_Plugin SHALL support SSH agent for key management
6. THE SSH_Plugin SHALL validate Target_Host fingerprints against known_hosts when host_key_check is enabled
7. THE SSH_Plugin SHALL never log Private_Keys or passwords in plain text

### Requirement 14: Integration with Execution History

**User Story:** As a Pabawi user, I want SSH command executions to appear in execution history, so that I can track and re-execute operations.

#### Acceptance Criteria

1. WHEN a Remote_Command completes, THE SSH_Plugin SHALL return an Execution_Result compatible with ExecutionRepository
2. THE Execution_Result SHALL include tool name "ssh"
3. THE Execution_Result SHALL include command text, Target_Host, timestamp, duration, and output
4. THE Execution_Result SHALL support re-execution through the standard execution history interface
5. THE SSH_Plugin SHALL support executeAction() method accepting action parameters from execution history
