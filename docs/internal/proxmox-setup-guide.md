# Proxmox Integration Setup Guide

## Overview

This guide walks you through configuring the Proxmox integration in Pabawi, enabling you to manage Proxmox Virtual Environment infrastructure through the web interface. The integration provides inventory discovery, lifecycle management, and provisioning capabilities for VMs and LXC containers.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Configuration Methods](#configuration-methods)
- [Web Interface Setup](#web-interface-setup)
- [Environment Variable Setup](#environment-variable-setup)
- [Authentication Options](#authentication-options)
- [Testing the Connection](#testing-the-connection)
- [Troubleshooting](#troubleshooting)
- [Security Best Practices](#security-best-practices)

## Prerequisites

Before configuring the Proxmox integration, ensure you have:

### Proxmox Requirements

- **Proxmox VE**: Version 6.x or 7.x installed and running
- **API Access**: Proxmox API enabled (default on port 8006)
- **Network Access**: Pabawi server can reach Proxmox on port 8006
- **Credentials**: Either API token or username/password for authentication

### Pabawi Requirements

- **Administrator Access**: You need administrator permissions in Pabawi
- **Integration Permissions**: Permission to configure integrations
- **Network Connectivity**: Pabawi server can reach Proxmox server

### Proxmox Permissions

The Proxmox user or token needs these permissions:

- `VM.Allocate` - Create VMs and containers
- `VM.Config.*` - Configure VMs and containers  
- `VM.PowerMgmt` - Start, stop, and manage power state
- `VM.Audit` - Read VM information
- `Datastore.Allocate` - Allocate disk space

## Configuration Methods

You can configure the Proxmox integration using two methods:

1. **Web Interface** (Recommended): User-friendly form with validation and connection testing
2. **Environment Variables**: Configuration file for automated deployments

Both methods achieve the same result. Choose based on your preference and deployment method.

## Web Interface Setup

### Step 1: Access Integration Setup

1. **Log in to Pabawi**:
   - Open your web browser
   - Navigate to your Pabawi URL
   - Log in with administrator credentials

2. **Navigate to Setup Page**:
   - Click on **"Setup"** or **"Integrations"** in the main menu
   - Look for the **"Proxmox"** section
   - Click to expand the Proxmox configuration form

### Step 2: Configure Connection Settings

**Host (Required)**:

- Enter the Proxmox server hostname or IP address
- Do not include `https://` or port number
- Examples:
  - `proxmox.example.com`
  - `192.168.1.100`
  - `pve.local`

**Port (Required)**:

- Default: `8006`
- Only change if you've customized Proxmox API port
- Must be between 1 and 65535

### Step 3: Choose Authentication Method

You have two authentication options:

#### Option A: API Token Authentication (Recommended)

**Token (Required for this method)**:

- Format: `user@realm!tokenid=uuid`
- Example: `automation@pve!api-token=12345678-1234-1234-1234-123456789abc`
- See [Creating an API Token](#creating-an-api-token) below

**Advantages**:

- More secure than password authentication
- Fine-grained permission control
- No password expiration issues
- Can be easily revoked

#### Option B: Username/Password Authentication

**Username (Required for this method)**:

- Proxmox username
- Example: `root`, `admin`, `automation`

**Password (Required for this method)**:

- User's password
- Stored securely (encrypted)

**Realm (Required for this method)**:

- Authentication realm
- Options:
  - `pam` - Linux PAM authentication
  - `pve` - Proxmox VE authentication
- Default: `pam`

**Note**: Authentication tickets expire after 2 hours. Pabawi automatically refreshes them.

### Step 4: Configure SSL Options

**Reject Unauthorized Certificates**:

- Toggle: On (recommended) / Off
- When **On**: Verifies SSL certificates (secure)
- When **Off**: Accepts self-signed certificates (less secure)

**Warning**: Disabling certificate verification is insecure and should only be used for testing.

**For Self-Signed Certificates**:

- Keep verification enabled
- Provide the CA certificate path (see Environment Variable Setup)
- Or add the certificate to your system's trust store

### Step 5: Test Connection

Before saving, test the connection:

1. **Click "Test Connection"**:
   - Button sends a test request to Proxmox
   - Verifies credentials and connectivity
   - Shows result message

2. **Review Test Results**:
   - **Success**: Green message "Connection successful"
     - Proxmox version displayed
     - Ready to save configuration
   - **Failure**: Red message with error details
     - Review error message
     - Fix issues before saving

3. **Common Test Errors**:
   - "Connection refused": Check host and port
   - "Authentication failed": Verify credentials
   - "Certificate error": Check SSL settings
   - "Timeout": Check network connectivity

### Step 6: Save Configuration

1. **Review All Settings**:
   - Verify host and port are correct
   - Confirm authentication method is configured
   - Check SSL settings are appropriate

2. **Click "Save Configuration"**:
   - Button saves settings to backend
   - Success message appears
   - Integration becomes active

3. **Verify Integration Status**:
   - Integration status should show "Connected"
   - Green indicator appears
   - Ready to use

## Environment Variable Setup

For automated deployments or when you prefer configuration files:

### Step 1: Edit Environment File

1. **Locate the .env file**:

   ```bash
   cd /path/to/pabawi
   nano backend/.env
   ```

2. **Add Proxmox Configuration**:

### Step 2: Basic Configuration

```bash
# Proxmox Integration
PROXMOX_ENABLED=true
PROXMOX_HOST=proxmox.example.com
PROXMOX_PORT=8006
```

### Step 3: Choose Authentication Method

**Option A: Token Authentication (Recommended)**:

```bash
# Token format: user@realm!tokenid=uuid
PROXMOX_TOKEN=automation@pve!api-token=12345678-1234-1234-1234-123456789abc
```

**Option B: Username/Password Authentication**:

```bash
PROXMOX_USERNAME=root
PROXMOX_PASSWORD=your-secure-password
PROXMOX_REALM=pam
```

### Step 4: SSL Configuration

**For Production (Verified Certificates)**:

```bash
PROXMOX_SSL_VERIFY=true
```

**For Self-Signed Certificates**:

```bash
PROXMOX_SSL_VERIFY=true
PROXMOX_CA_CERT=/path/to/proxmox-ca.pem
```

**For Testing Only (Insecure)**:

```bash
PROXMOX_SSL_VERIFY=false
```

### Step 5: Optional Advanced Settings

```bash
# Request timeout (milliseconds)
PROXMOX_TIMEOUT=30000

# Client certificate authentication (optional)
PROXMOX_CLIENT_CERT=/path/to/client-cert.pem
PROXMOX_CLIENT_KEY=/path/to/client-key.pem
```

### Step 6: Restart Pabawi

After editing the .env file:

```bash
# For systemd
sudo systemctl restart pabawi

# For Docker
docker-compose restart

# For development
npm run dev:backend
```

## Authentication Options

### Creating an API Token

API tokens provide secure, fine-grained access control.

#### Step 1: Access Proxmox Web Interface

1. Open your browser
2. Navigate to `https://your-proxmox-host:8006`
3. Log in with administrator credentials

#### Step 2: Navigate to API Tokens

1. Click on **"Datacenter"** in the left sidebar
2. Expand **"Permissions"**
3. Click on **"API Tokens"**

#### Step 3: Create New Token

1. **Click "Add"** button
2. **Configure Token**:
   - **User**: Select or create a user (e.g., `automation@pve`)
   - **Token ID**: Enter a descriptive ID (e.g., `pabawi-api`)
   - **Privilege Separation**:
     - **Unchecked**: Token has full user permissions (recommended for Pabawi)
     - **Checked**: Token has limited permissions (requires additional configuration)
   - **Expire**: Set expiration date or leave empty for no expiration
   - **Comment**: Optional description

3. **Click "Add"**
4. **Copy the Token**:
   - Token is displayed once
   - Format: `user@realm!tokenid=uuid`
   - Example: `automation@pve!pabawi-api=12345678-1234-1234-1234-123456789abc`
   - **Save it securely** - you cannot retrieve it later

#### Step 4: Configure Permissions

If you enabled Privilege Separation, grant these permissions:

1. **Navigate to Permissions**:
   - Datacenter → Permissions → Add → API Token Permission

2. **Grant Required Permissions**:
   - Path: `/`
   - API Token: Select your token
   - Role: Create a custom role with:
     - `VM.Allocate`
     - `VM.Config.*`
     - `VM.PowerMgmt`
     - `VM.Audit`
     - `Datastore.Allocate`

3. **Click "Add"**

### Using Username/Password

If you prefer password authentication:

#### Step 1: Create Dedicated User (Recommended)

1. **Navigate to Users**:
   - Datacenter → Permissions → Users
   - Click "Add"

2. **Configure User**:
   - **User name**: `pabawi-automation`
   - **Realm**: `pve` (Proxmox VE)
   - **Password**: Generate a strong password
   - **Email**: Optional
   - **Enabled**: Checked

3. **Click "Add"**

#### Step 2: Grant Permissions

1. **Navigate to Permissions**:
   - Datacenter → Permissions → Add → User Permission

2. **Configure Permissions**:
   - Path: `/`
   - User: `pabawi-automation@pve`
   - Role: Create or select role with required permissions

3. **Click "Add"**

#### Step 3: Use in Pabawi

Configure Pabawi with:

- Username: `pabawi-automation`
- Password: (the password you set)
- Realm: `pve`

## Testing the Connection

### Via Web Interface

1. **Navigate to Setup Page**
2. **Locate Proxmox Configuration**
3. **Click "Test Connection"**
4. **Review Results**:
   - Success: Shows Proxmox version
   - Failure: Shows error message

### Via Command Line

Test the connection manually:

```bash
# Test with token
curl -k https://proxmox.example.com:8006/api2/json/version \
  -H "Authorization: PVEAPIToken=automation@pve!pabawi-api=your-token-uuid"

# Test with username/password (get ticket first)
curl -k https://proxmox.example.com:8006/api2/json/access/ticket \
  -d "username=root@pam&password=your-password"
```

Expected response:

```json
{
  "data": {
    "version": "7.4-3",
    "release": "7.4",
    "repoid": "6f2f0a33"
  }
}
```

### Verify Integration Status

After configuration:

1. **Check Integration Status**:

   ```bash
   curl http://localhost:3000/api/integrations/status
   ```

2. **Look for Proxmox**:

   ```json
   {
     "integrations": {
       "proxmox": {
         "enabled": true,
         "connected": true,
         "healthy": true,
         "message": "Proxmox API is reachable"
       }
     }
   }
   ```

3. **Test Inventory Discovery**:
   - Navigate to Inventory page
   - Look for Proxmox nodes
   - Verify VMs and containers appear

## Troubleshooting

### Connection Issues

#### Problem: "Connection refused"

**Symptoms**:

```
Error: connect ECONNREFUSED 192.168.1.100:8006
```

**Solutions**:

1. Verify Proxmox is running:

   ```bash
   systemctl status pveproxy
   ```

2. Check firewall allows port 8006:

   ```bash
   # On Proxmox server
   iptables -L -n | grep 8006
   ```

3. Test connectivity from Pabawi server:

   ```bash
   telnet proxmox.example.com 8006
   nc -zv proxmox.example.com 8006
   ```

4. Verify host and port in configuration

#### Problem: "Authentication failed"

**Symptoms**:

```
Error: Authentication failed: 401 Unauthorized
Error: Authentication failed: 403 Forbidden
```

**Solutions**:

1. **For Token Authentication**:
   - Verify token format: `user@realm!tokenid=uuid`
   - Check token hasn't expired
   - Verify token exists in Proxmox
   - Check token permissions

2. **For Password Authentication**:
   - Verify username is correct
   - Check password is correct
   - Verify realm is correct (`pam` or `pve`)
   - Check user account isn't locked

3. **Test Manually**:

   ```bash
   # Test token
   curl -k https://proxmox.example.com:8006/api2/json/version \
     -H "Authorization: PVEAPIToken=your-token"
   
   # Test password
   curl -k https://proxmox.example.com:8006/api2/json/access/ticket \
     -d "username=root@pam&password=your-password"
   ```

#### Problem: "Certificate verification failed"

**Symptoms**:

```
Error: unable to verify the first certificate
Error: self signed certificate in certificate chain
```

**Solutions**:

1. **Provide CA Certificate** (Recommended):

   ```bash
   # Export Proxmox CA
   scp root@proxmox:/etc/pve/pve-root-ca.pem ./proxmox-ca.pem
   
   # Configure in Pabawi
   PROXMOX_CA_CERT=/path/to/proxmox-ca.pem
   ```

2. **Disable Verification** (Testing Only):

   ```bash
   PROXMOX_SSL_VERIFY=false
   ```

   **Warning**: This is insecure. Use only for testing.

3. **Add Certificate to System Trust Store**:

   ```bash
   # On Ubuntu/Debian
   sudo cp proxmox-ca.pem /usr/local/share/ca-certificates/proxmox.crt
   sudo update-ca-certificates
   ```

#### Problem: "Timeout"

**Symptoms**:

```
Error: Request timeout after 30000ms
```

**Solutions**:

1. Check network latency:

   ```bash
   ping proxmox.example.com
   ```

2. Increase timeout:

   ```bash
   PROXMOX_TIMEOUT=60000  # 60 seconds
   ```

3. Check Proxmox server load:

   ```bash
   ssh root@proxmox 'uptime'
   ```

### Permission Issues

#### Problem: "Permission denied" for operations

**Symptoms**:

```
Error: Permission denied
Error: Insufficient privileges
```

**Solutions**:

1. **Verify Token Permissions**:
   - Log in to Proxmox web interface
   - Navigate to Datacenter → Permissions
   - Check token has required permissions

2. **Grant Missing Permissions**:
   - Add → API Token Permission
   - Path: `/`
   - Token: Your token
   - Role: Administrator or custom role with required permissions

3. **Check Privilege Separation**:
   - If enabled, token needs explicit permissions
   - If disabled, token inherits user permissions

4. **Test Specific Operations**:

   ```bash
   # Test VM creation permission
   curl -k https://proxmox.example.com:8006/api2/json/nodes/pve/qemu \
     -H "Authorization: PVEAPIToken=your-token" \
     -X POST -d "vmid=999&name=test"
   ```

### Configuration Issues

#### Problem: "Integration not appearing"

**Symptoms**:

- Proxmox not listed in integrations
- No Proxmox nodes in inventory

**Solutions**:

1. Verify integration is enabled:

   ```bash
   grep PROXMOX_ENABLED backend/.env
   # Should show: PROXMOX_ENABLED=true
   ```

2. Check configuration is valid:

   ```bash
   # All required fields present
   grep PROXMOX backend/.env
   ```

3. Restart Pabawi:

   ```bash
   sudo systemctl restart pabawi
   ```

4. Check logs for errors:

   ```bash
   sudo journalctl -u pabawi -f | grep -i proxmox
   ```

## Security Best Practices

### Authentication

1. **Use API Tokens**:
   - More secure than passwords
   - Easier to rotate and revoke
   - Fine-grained permissions

2. **Dedicated User Account**:
   - Create a separate user for Pabawi
   - Don't use root account
   - Limit permissions to what's needed

3. **Strong Passwords**:
   - Use password generator
   - Minimum 16 characters
   - Mix of letters, numbers, symbols
   - Store in password manager

4. **Regular Rotation**:
   - Rotate tokens every 90 days
   - Change passwords regularly
   - Revoke unused tokens

### Network Security

1. **Use HTTPS**:
   - Always use encrypted connections
   - Never disable SSL in production
   - Verify certificates

2. **Firewall Rules**:
   - Restrict access to Proxmox API
   - Allow only Pabawi server IP
   - Block public access

3. **Network Segmentation**:
   - Place Proxmox in management network
   - Separate from production networks
   - Use VPN for remote access

### Access Control

1. **Least Privilege**:
   - Grant minimum required permissions
   - Review permissions regularly
   - Remove unused permissions

2. **Audit Logging**:
   - Enable Proxmox audit logging
   - Monitor API access
   - Review logs regularly

3. **Multi-Factor Authentication**:
   - Enable MFA for Proxmox web interface
   - Use MFA for Pabawi access
   - Protect administrator accounts

### Configuration Security

1. **Secure Storage**:
   - Protect .env file permissions:

     ```bash
     chmod 600 backend/.env
     ```

   - Don't commit secrets to git
   - Use secrets management tools

2. **Environment Variables**:
   - Use environment variables for secrets
   - Don't hardcode credentials
   - Rotate secrets regularly

3. **Backup Configuration**:
   - Backup configuration securely
   - Encrypt backups
   - Test restore procedures

## Related Documentation

- [Proxmox Integration](integrations/proxmox.md) - Detailed integration documentation
- [Provisioning Guide](provisioning-guide.md) - How to create VMs and containers
- [Permissions and RBAC](permissions-rbac.md) - Permission requirements
- [Troubleshooting Guide](troubleshooting.md) - General troubleshooting

## Support

For additional help:

- **Pabawi Documentation**: [pabawi.dev/docs](https://pabawi.dev/docs)
- **GitHub Issues**: [pabawi/issues](https://github.com/pabawi/pabawi/issues)
- **Proxmox Documentation**: [pve.proxmox.com/wiki](https://pve.proxmox.com/wiki)
- **Proxmox Forum**: [forum.proxmox.com](https://forum.proxmox.com)
