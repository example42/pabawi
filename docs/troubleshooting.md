# Pabawi Troubleshooting Guide

Version: 0.1.0

## Overview

This guide helps you diagnose and resolve common issues with Pabawi. It covers installation problems, configuration errors, Bolt integration issues, and runtime errors.

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Installation Issues](#installation-issues)
- [Bolt Integration Issues](#bolt-integration-issues)
- [Configuration Issues](#configuration-issues)
- [Connection and Network Issues](#connection-and-network-issues)
- [Execution Issues](#execution-issues)
- [Database Issues](#database-issues)
- [Streaming Issues](#streaming-issues)
- [Performance Issues](#performance-issues)
- [Expert Mode Debugging](#expert-mode-debugging)
- [Interpreting Bolt Command Output](#interpreting-bolt-command-output)
- [Common Error Messages](#common-error-messages)
- [FAQ](#faq)

## Quick Diagnostics

Before diving into specific issues, run these quick checks:

### 1. Check Server Status

```bash
# Check if the server is running
curl http://localhost:3000/api/health

# Expected response:
# {"status":"ok","message":"Backend API is running","config":{...}}
```

### 2. Verify Bolt CLI

```bash
# Check Bolt is installed
bolt --version

# Test Bolt inventory
bolt inventory show --format json

# Test Bolt command execution
bolt command run 'uptime' --targets localhost --format json
```

### 3. Check Logs

```bash
# View server logs (if running with systemd)
sudo journalctl -u pabawi -f

# View Docker logs
docker logs -f pabawi

# View development logs
npm run dev:backend
```

### 4. Enable Expert Mode

For detailed error information:

1. Open the web interface
2. Click the "Expert Mode" toggle in the navigation
3. Retry the failing operation
4. Review the detailed error output

## Installation Issues

### Problem: "Cannot find module" errors during npm install

**Symptoms:**

```
Error: Cannot find module 'express'
```

**Causes:**

- Dependencies not installed
- Corrupted node_modules
- Wrong Node.js version

**Solutions:**

1. **Install all dependencies:**

   ```bash
   # From project root
   npm run install:all
   
   # Or install individually
   cd backend && npm install
   cd frontend && npm install
   ```

2. **Clear and reinstall:**

   ```bash
   # Remove node_modules and package-lock.json
   rm -rf node_modules package-lock.json
   rm -rf backend/node_modules backend/package-lock.json
   rm -rf frontend/node_modules frontend/package-lock.json
   
   # Reinstall
   npm run install:all
   ```

3. **Verify Node.js version:**

   ```bash
   node --version  # Should be 20.x or higher
   npm --version   # Should be 9.x or higher
   ```

### Problem: "Bolt command not found"

**Symptoms:**

```
Error: spawn bolt ENOENT
```

**Causes:**

- Bolt CLI not installed
- Bolt not in PATH
- Wrong Bolt installation

**Solutions:**

1. **Install Bolt:**

   ```bash
   # macOS with Homebrew
   brew install puppet-bolt
   
   # Linux (Debian/Ubuntu)
   wget https://apt.puppet.com/puppet-tools-release-focal.deb
   sudo dpkg -i puppet-tools-release-focal.deb
   sudo apt-get update
   sudo apt-get install puppet-bolt
   
   # Linux (RHEL/CentOS)
   sudo rpm -Uvh https://yum.puppet.com/puppet-tools-release-el-7.noarch.rpm
   sudo yum install puppet-bolt
   ```

2. **Verify installation:**

   ```bash
   which bolt
   bolt --version
   ```

3. **Add Bolt to PATH (if needed):**

   ```bash
   # Add to ~/.bashrc or ~/.zshrc
   export PATH="/opt/puppetlabs/bin:$PATH"
   
   # Reload shell
   source ~/.bashrc
   ```

### Problem: TypeScript compilation errors

**Symptoms:**

```
error TS2307: Cannot find module 'express' or its corresponding type declarations
```

**Causes:**

- Missing type definitions
- TypeScript configuration issues

**Solutions:**

1. **Install type definitions:**

   ```bash
   cd backend
   npm install --save-dev @types/node @types/express
   ```

2. **Verify tsconfig.json:**

   ```bash
   # Check TypeScript configuration
   cat backend/tsconfig.json
   ```

3. **Clean and rebuild:**

   ```bash
   cd backend
   rm -rf dist
   npm run build
   ```

## Bolt Integration Issues

### Problem: "Bolt configuration files not found"

**Symptoms:**

```json
{
  "error": {
    "code": "BOLT_CONFIG_MISSING",
    "message": "Required Bolt configuration files not found"
  }
}
```

**Causes:**

- `BOLT_PROJECT_PATH` points to wrong directory
- Missing `inventory.yaml` or `bolt-project.yaml`
- Incorrect file permissions

**Solutions:**

1. **Verify Bolt project structure:**

   ```bash
   # Check directory exists
   ls -la $BOLT_PROJECT_PATH
   
   # Check required files
   ls -la $BOLT_PROJECT_PATH/inventory.yaml
   ls -la $BOLT_PROJECT_PATH/bolt-project.yaml
   ls -la $BOLT_PROJECT_PATH/modules/
   ```

2. **Set correct BOLT_PROJECT_PATH:**

   ```bash
   # In .env file
   BOLT_PROJECT_PATH=/absolute/path/to/bolt-project
   
   # Or as environment variable
   export BOLT_PROJECT_PATH=/absolute/path/to/bolt-project
   ```

3. **Create minimal Bolt project:**

   ```bash
   mkdir -p my-bolt-project/modules
   cd my-bolt-project
   
   # Create bolt-project.yaml
   cat > bolt-project.yaml << EOF
   name: my-bolt-project
   modulepath:
     - modules
   color: false
   EOF
   
   # Create inventory.yaml
   cat > inventory.yaml << EOF
   groups:
     - name: local
       targets:
         - name: localhost
           uri: localhost
       config:
         transport: local
   EOF
   ```

4. **Check file permissions:**

   ```bash
   # Ensure files are readable
   chmod 644 $BOLT_PROJECT_PATH/inventory.yaml
   chmod 644 $BOLT_PROJECT_PATH/bolt-project.yaml
   chmod 755 $BOLT_PROJECT_PATH/modules
   ```

### Problem: "Cannot parse Bolt output"

**Symptoms:**

```json
{
  "error": {
    "code": "BOLT_PARSE_ERROR",
    "message": "Cannot parse Bolt CLI output"
  }
}
```

**Causes:**

- Bolt returning colored output
- Bolt version incompatibility
- Malformed JSON output

**Solutions:**

1. **Disable color output in bolt-project.yaml:**

   ```yaml
   name: my-bolt-project
   modulepath:
     - modules
   color: false  # CRITICAL: Must be false
   ```

2. **Verify Bolt version:**

   ```bash
   bolt --version
   # Recommended: 3.x or higher
   ```

3. **Test Bolt JSON output:**

   ```bash
   # Test command execution
   bolt command run 'uptime' --targets localhost --format json
   
   # Verify output is valid JSON
   bolt command run 'uptime' --targets localhost --format json | jq .
   ```

4. **Enable expert mode to see raw output:**
   - Turn on expert mode in the web interface
   - Retry the operation
   - Review the `rawResponse` field in the error

### Problem: "Bolt execution timeout"

**Symptoms:**

```json
{
  "error": {
    "code": "BOLT_TIMEOUT",
    "message": "Execution exceeded timeout limit"
  }
}
```

**Causes:**

- Operation takes longer than `EXECUTION_TIMEOUT`
- Slow network connection to target nodes
- Target node unresponsive

**Solutions:**

1. **Increase timeout:**

   ```bash
   # In .env file (milliseconds)
   EXECUTION_TIMEOUT=600000  # 10 minutes
   ```

2. **Test connectivity to target:**

   ```bash
   # Test SSH connection
   ssh user@target-host uptime
   
   # Test Bolt connection
   bolt command run 'uptime' --targets target-host
   ```

3. **Optimize Bolt tasks:**
   - Reduce task complexity
   - Minimize output verbosity
   - Use more efficient commands

4. **Check target node performance:**

   ```bash
   # Check load average
   bolt command run 'uptime' --targets target-host
   
   # Check available resources
   bolt command run 'free -m' --targets target-host
   ```

### Problem: "Node not found in inventory"

**Symptoms:**

```json
{
  "error": {
    "code": "INVALID_NODE_ID",
    "message": "Node not found in inventory"
  }
}
```

**Causes:**

- Node ID doesn't match inventory
- Inventory not loaded correctly
- Typo in node name

**Solutions:**

1. **List all nodes in inventory:**

   ```bash
   bolt inventory show --format json
   ```

2. **Check node name in inventory.yaml:**

   ```yaml
   groups:
     - name: servers
       targets:
         - name: web-01  # This is the node ID
           uri: web-01.example.com
   ```

3. **Verify node ID in API:**

   ```bash
   # List all nodes
   curl http://localhost:3000/api/inventory
   
   # Check specific node
   curl http://localhost:3000/api/nodes/web-01
   ```

4. **Clear inventory cache:**

   ```bash
   # Restart server to clear cache
   # Or set CACHE_INVENTORY_TTL=0 to disable caching
   ```

### Problem: "Task not found"

**Symptoms:**

```json
{
  "error": {
    "code": "INVALID_TASK_NAME",
    "message": "Task does not exist"
  }
}
```

**Causes:**

- Task name incorrect
- Module not installed
- Module path not configured

**Solutions:**

1. **List available tasks:**

   ```bash
   # Via Bolt CLI
   bolt task show --format json
   
   # Via API
   curl http://localhost:3000/api/tasks
   ```

2. **Install missing module:**

   ```bash
   cd $BOLT_PROJECT_PATH
   
   # Install from Puppet Forge
   bolt module install example42-tp
   
   # Or add to Puppetfile and install
   bolt module install
   ```

3. **Verify module path in bolt-project.yaml:**

   ```yaml
   name: my-bolt-project
   modulepath:
     - modules
     - site-modules  # Add if using custom modules
   ```

4. **Check task exists in module:**

   ```bash
   ls -la $BOLT_PROJECT_PATH/modules/*/tasks/
   ```

## Configuration Issues

### Problem: "All commands are rejected"

**Symptoms:**

```json
{
  "error": {
    "code": "COMMAND_NOT_ALLOWED",
    "message": "Command not in whitelist"
  }
}
```

**Causes:**

- `COMMAND_WHITELIST_ALLOW_ALL=false` with empty whitelist
- Command not in whitelist
- Wrong match mode

**Solutions:**

1. **Enable allow-all mode (development only):**

   ```bash
   # In .env file
   COMMAND_WHITELIST_ALLOW_ALL=true
   ```

2. **Add commands to whitelist:**

   ```bash
   # In .env file
   COMMAND_WHITELIST='["ls","pwd","whoami","uptime"]'
   ```

3. **Use prefix match mode:**

   ```bash
   # Allow commands with arguments
   COMMAND_WHITELIST='["ls","systemctl"]'
   COMMAND_WHITELIST_MATCH_MODE=prefix
   # Now allows: "ls -la", "systemctl status nginx"
   ```

4. **Check current configuration:**

   ```bash
   curl http://localhost:3000/api/config
   ```

### Problem: "Environment variables not loaded"

**Symptoms:**

- Configuration not applied
- Using default values instead of custom settings

**Causes:**

- `.env` file in wrong location
- `.env` file not readable
- Syntax errors in `.env` file

**Solutions:**

1. **Verify .env file location:**

   ```bash
   # Should be in backend directory
   ls -la backend/.env
   ```

2. **Check file permissions:**

   ```bash
   chmod 644 backend/.env
   ```

3. **Validate .env syntax:**

   ```bash
   # No spaces around =
   # Correct:
   PORT=3000
   
   # Incorrect:
   PORT = 3000
   ```

4. **Test environment variables:**

   ```bash
   # Load .env and check
   source backend/.env
   echo $PORT
   echo $BOLT_PROJECT_PATH
   ```

5. **Restart server after changes:**

   ```bash
   # Development
   npm run dev:backend
   
   # Production
   sudo systemctl restart pabawi
   
   # Docker
   docker-compose restart
   ```

### Problem: "JSON parse error in configuration"

**Symptoms:**

```
SyntaxError: Unexpected token in JSON
```

**Causes:**

- Invalid JSON in `COMMAND_WHITELIST` or `PACKAGE_TASKS`
- Missing quotes or brackets
- Unescaped special characters

**Solutions:**

1. **Validate JSON syntax:**

   ```bash
   # Test COMMAND_WHITELIST
   echo $COMMAND_WHITELIST | jq .
   
   # Should output:
   # ["ls","pwd","whoami"]
   ```

2. **Use correct quoting:**

   ```bash
   # Correct (single quotes around value)
   COMMAND_WHITELIST='["ls","pwd"]'
   
   # Incorrect (double quotes)
   COMMAND_WHITELIST=["ls","pwd"]
   ```

3. **Escape special characters:**

   ```bash
   # For complex JSON, use single quotes
   PACKAGE_TASKS='[{"name":"tp::install","label":"Tiny Puppet"}]'
   ```

## Connection and Network Issues

### Problem: "Node unreachable"

**Symptoms:**

```json
{
  "error": {
    "code": "NODE_UNREACHABLE",
    "message": "Cannot connect to node"
  }
}
```

**Causes:**

- Network connectivity issues
- Incorrect credentials
- Firewall blocking connection
- SSH key not configured

**Solutions:**

1. **Test network connectivity:**

   ```bash
   # Ping the target
   ping target-host
   
   # Test SSH port
   telnet target-host 22
   nc -zv target-host 22
   ```

2. **Verify SSH credentials:**

   ```bash
   # Test SSH connection manually
   ssh user@target-host
   
   # Test with specific key
   ssh -i ~/.ssh/id_rsa user@target-host
   ```

3. **Check inventory configuration:**

   ```yaml
   groups:
     - name: servers
       targets:
         - name: web-01
           uri: web-01.example.com
       config:
         transport: ssh
         ssh:
           user: admin
           private-key: ~/.ssh/id_rsa  # Verify path
           port: 22
           host-key-check: true
   ```

4. **Test with Bolt CLI:**

   ```bash
   # Test connection
   bolt command run 'uptime' --targets web-01 --verbose
   ```

5. **Check firewall rules:**

   ```bash
   # On target node
   sudo iptables -L -n | grep 22
   sudo firewall-cmd --list-all
   ```

### Problem: "Connection timeout"

**Symptoms:**

```
Error: Connection timeout after 30s
```

**Causes:**

- Slow network
- Target node overloaded
- SSH timeout too short

**Solutions:**

1. **Increase SSH timeout in inventory:**

   ```yaml
   config:
     ssh:
       connect-timeout: 30  # Increase to 60 or more
   ```

2. **Check network latency:**

   ```bash
   # Test latency
   ping -c 10 target-host
   
   # Test SSH connection time
   time ssh user@target-host exit
   ```

3. **Verify target node load:**

   ```bash
   # Check if node is responsive
   ssh user@target-host 'uptime'
   ```

### Problem: "Authentication failed"

**Symptoms:**

```
Error: Authentication failed for user@host
```

**Causes:**

- Wrong username or password
- SSH key not authorized
- Incorrect key permissions

**Solutions:**

1. **Verify credentials:**

   ```bash
   # Test SSH login
   ssh user@target-host
   ```

2. **Check SSH key permissions:**

   ```bash
   # Private key should be 600
   chmod 600 ~/.ssh/id_rsa
   
   # Public key should be 644
   chmod 644 ~/.ssh/id_rsa.pub
   ```

3. **Verify authorized_keys on target:**

   ```bash
   # On target node
   cat ~/.ssh/authorized_keys
   chmod 600 ~/.ssh/authorized_keys
   ```

4. **Use password authentication (if needed):**

   ```yaml
   config:
     ssh:
       user: admin
       password: ${SSH_PASSWORD}  # Use environment variable
   ```

5. **Check SSH agent:**

   ```bash
   # Start SSH agent
   eval $(ssh-agent)
   
   # Add key
   ssh-add ~/.ssh/id_rsa
   
   # List keys
   ssh-add -l
   ```

## Execution Issues

### Problem: "Execution stuck in 'running' state"

**Symptoms:**

- Execution never completes
- Status remains "running" indefinitely
- No output received

**Causes:**

- Bolt process hung
- Network connection lost
- Target node unresponsive

**Solutions:**

1. **Check execution status:**

   ```bash
   curl http://localhost:3000/api/executions/{execution-id}
   ```

2. **Check server logs:**

   ```bash
   # Look for timeout or error messages
   sudo journalctl -u pabawi -f
   ```

3. **Verify target node is responsive:**

   ```bash
   bolt command run 'uptime' --targets target-host
   ```

4. **Restart the server:**

   ```bash
   sudo systemctl restart pabawi
   ```

5. **Increase execution timeout:**

   ```bash
   # In .env file
   EXECUTION_TIMEOUT=600000  # 10 minutes
   ```

### Problem: "Command execution fails with exit code 1"

**Symptoms:**

```json
{
  "status": "failed",
  "output": {
    "exitCode": 1,
    "stderr": "command not found"
  }
}
```

**Causes:**

- Command doesn't exist on target
- Insufficient permissions
- Command syntax error

**Solutions:**

1. **Verify command exists on target:**

   ```bash
   bolt command run 'which <command>' --targets target-host
   ```

2. **Check command syntax:**

   ```bash
   # Test locally first
   <command>
   
   # Then test via Bolt
   bolt command run '<command>' --targets target-host
   ```

3. **Check permissions:**

   ```bash
   # Run with sudo if needed
   bolt command run 'sudo <command>' --targets target-host
   ```

4. **Enable expert mode to see full error:**
   - Turn on expert mode in web interface
   - Retry the command
   - Review stderr output

### Problem: "Task execution fails with parameter error"

**Symptoms:**

```json
{
  "error": {
    "code": "BOLT_EXECUTION_FAILED",
    "message": "Task parameter validation failed"
  }
}
```

**Causes:**

- Missing required parameters
- Wrong parameter type
- Invalid parameter value

**Solutions:**

1. **Check task parameter requirements:**

   ```bash
   # View task metadata
   bolt task show <task-name>
   
   # Via API
   curl http://localhost:3000/api/tasks
   ```

2. **Verify parameter types:**

   ```json
   {
     "taskName": "psick::puppet_agent",
     "parameters": {
       "noop": true,        // Boolean
       "tags": "web,db",    // String
       "debug": false       // Boolean
     }
   }
   ```

3. **Test task with Bolt CLI:**

   ```bash
   bolt task run <task-name> \
     --targets target-host \
     param1=value1 \
     param2=value2
   ```

4. **Enable expert mode to see parameter validation errors:**
   - Turn on expert mode
   - Review the full error message
   - Check the Bolt command being executed

## Database Issues

### Problem: "Database error: unable to open database file"

**Symptoms:**

```json
{
  "error": {
    "code": "DATABASE_ERROR",
    "message": "SQLITE_CANTOPEN: unable to open database file"
  }
}
```

**Causes:**

- Database directory doesn't exist
- Insufficient permissions
- Disk full
- File system read-only

**Solutions:**

1. **Create database directory:**

   ```bash
   mkdir -p $(dirname $DATABASE_PATH)
   
   # Example:
   mkdir -p ./data
   ```

2. **Set correct permissions:**

   ```bash
   # Make directory writable
   chmod 755 $(dirname $DATABASE_PATH)
   
   # If database file exists
   chmod 644 $DATABASE_PATH
   ```

3. **Check disk space:**

   ```bash
   df -h $(dirname $DATABASE_PATH)
   ```

4. **Verify file system is writable:**

   ```bash
   touch $(dirname $DATABASE_PATH)/test.txt
   rm $(dirname $DATABASE_PATH)/test.txt
   ```

5. **For Docker deployments:**

   ```bash
   # On Linux, set ownership to container user (UID 1001)
   sudo chown -R 1001:1001 ./data
   
   # Or use the docker-run.sh script which handles this
   ./scripts/docker-run.sh
   ```

### Problem: "Database is locked"

**Symptoms:**

```json
{
  "error": {
    "code": "DATABASE_ERROR",
    "message": "SQLITE_BUSY: database is locked"
  }
}
```

**Causes:**

- Multiple processes accessing database
- Stale lock file
- Long-running transaction

**Solutions:**

1. **Ensure only one instance is running:**

   ```bash
   # Check for running processes
   ps aux | grep pabawi
   
   # Stop all instances
   sudo systemctl stop pabawi
   pkill -f "node.*server.js"
   ```

2. **Remove stale lock files:**

   ```bash
   # Check for lock files
   ls -la $DATABASE_PATH-*
   
   # Remove if stale
   rm -f $DATABASE_PATH-shm $DATABASE_PATH-wal
   ```

3. **Restart the server:**

   ```bash
   sudo systemctl start pabawi
   ```

4. **Use separate database for each instance:**

   ```bash
   # If running multiple instances, use different database paths
   DATABASE_PATH=/data/executions-instance1.db
   ```

### Problem: "Database corruption"

**Symptoms:**

```
Error: database disk image is malformed
```

**Causes:**

- Unexpected shutdown
- Disk errors
- File system issues

**Solutions:**

1. **Backup current database:**

   ```bash
   cp $DATABASE_PATH $DATABASE_PATH.backup
   ```

2. **Try to recover:**

   ```bash
   # Dump and restore
   sqlite3 $DATABASE_PATH ".dump" | sqlite3 recovered.db
   mv recovered.db $DATABASE_PATH
   ```

3. **Check database integrity:**

   ```bash
   sqlite3 $DATABASE_PATH "PRAGMA integrity_check;"
   ```

4. **If recovery fails, start fresh:**

   ```bash
   # Backup old database
   mv $DATABASE_PATH $DATABASE_PATH.corrupted
   
   # Restart server (will create new database)
   sudo systemctl restart pabawi
   ```

## Streaming Issues

### Problem: "Streaming connection drops"

**Symptoms:**

- Real-time output stops updating
- Connection closed unexpectedly
- "EventSource failed" errors in browser console

**Causes:**

- Network timeout
- Proxy configuration
- Server restart
- Browser tab inactive

**Solutions:**

1. **Check network connectivity:**

   ```bash
   # Test SSE endpoint
   curl -N http://localhost:3000/api/executions/{id}/stream
   ```

2. **Configure proxy for SSE:**

   ```nginx
   # Nginx configuration
   location /api/executions/ {
       proxy_pass http://localhost:3000;
       proxy_http_version 1.1;
       proxy_set_header Connection "";
       proxy_buffering off;
       proxy_cache off;
       proxy_read_timeout 3600s;
   }
   ```

3. **Increase streaming buffer:**

   ```bash
   # In .env file
   STREAMING_BUFFER_MS=200
   ```

4. **Check browser console for errors:**
   - Open browser DevTools (F12)
   - Check Console tab for EventSource errors
   - Check Network tab for connection status

5. **Reconnection is automatic:**
   - The frontend automatically reconnects on connection loss
   - Wait a few seconds for reconnection
   - If it doesn't reconnect, refresh the page

### Problem: "Output truncated"

**Symptoms:**

```
[Output truncated: maximum size exceeded]
```

**Causes:**

- Output exceeds `STREAMING_MAX_OUTPUT_SIZE`
- Very verbose command or task

**Solutions:**

1. **Increase output size limit:**

   ```bash
   # In .env file (bytes)
   STREAMING_MAX_OUTPUT_SIZE=52428800  # 50 MB
   ```

2. **Reduce command verbosity:**

   ```bash
   # Use less verbose options
   # Instead of: ls -laR /
   # Use: ls -la /
   ```

3. **Filter output:**

   ```bash
   # Use grep to filter
   bolt command run 'journalctl | grep error' --targets target-host
   ```

4. **Check logs for full output:**

   ```bash
   # Server logs contain full output
   sudo journalctl -u pabawi -f
   ```

### Problem: "Streaming shows no output"

**Symptoms:**

- Execution is running but no output appears
- Streaming connection established but no events

**Causes:**

- Command produces no output
- Output buffering
- Execution hasn't started yet

**Solutions:**

1. **Verify execution is running:**

   ```bash
   curl http://localhost:3000/api/executions/{id}
   ```

2. **Check if command produces output:**

   ```bash
   # Test command locally
   bolt command run '<command>' --targets target-host
   ```

3. **Wait for buffering:**
   - Output is buffered for 100ms by default
   - Wait a few seconds for output to appear

4. **Enable expert mode:**
   - Turn on expert mode to see the Bolt command
   - Verify the command is correct

## Performance Issues

### Problem: "Slow inventory loading"

**Symptoms:**

- Inventory page takes long to load
- API requests timeout
- High CPU usage

**Causes:**

- Large inventory (1000+ nodes)
- No caching enabled
- Slow Bolt CLI execution

**Solutions:**

1. **Enable inventory caching:**

   ```bash
   # In .env file (milliseconds)
   CACHE_INVENTORY_TTL=60000  # 1 minute
   ```

2. **Optimize Bolt inventory:**

   ```yaml
   # Use groups to organize nodes
   groups:
     - name: web-servers
       targets:
         - web-01
         - web-02
     - name: db-servers
       targets:
         - db-01
         - db-02
   ```

3. **Test Bolt inventory performance:**

   ```bash
   time bolt inventory show --format json
   ```

4. **Use virtual scrolling in UI:**
   - The web interface uses virtual scrolling for large lists
   - Only visible items are rendered

### Problem: "Too many concurrent executions"

**Symptoms:**

```json
{
  "error": {
    "code": "QUEUE_FULL",
    "message": "Execution queue is full"
  }
}
```

**Causes:**

- More executions than `MAX_QUEUE_SIZE`
- `CONCURRENT_EXECUTION_LIMIT` too low
- Long-running executions blocking queue

**Solutions:**

1. **Increase queue size:**

   ```bash
   # In .env file
   MAX_QUEUE_SIZE=100
   ```

2. **Increase concurrent execution limit:**

   ```bash
   # In .env file
   CONCURRENT_EXECUTION_LIMIT=10
   ```

3. **Monitor queue status:**

   ```bash
   curl http://localhost:3000/api/executions/queue
   ```

4. **Wait for executions to complete:**
   - Check execution history
   - Cancel or wait for long-running executions

5. **Optimize execution timeout:**

   ```bash
   # Reduce timeout for quick operations
   EXECUTION_TIMEOUT=120000  # 2 minutes
   ```

### Problem: "High memory usage"

**Symptoms:**

- Server becomes unresponsive
- Out of memory errors
- System swap usage high

**Causes:**

- Too many concurrent executions
- Large execution output
- Memory leak

**Solutions:**

1. **Reduce concurrent executions:**

   ```bash
   CONCURRENT_EXECUTION_LIMIT=5
   ```

2. **Limit output size:**

   ```bash
   STREAMING_MAX_OUTPUT_SIZE=10485760  # 10 MB
   ```

3. **Monitor memory usage:**

   ```bash
   # Check process memory
   ps aux | grep node
   
   # Monitor in real-time
   top -p $(pgrep -f "node.*server.js")
   ```

4. **Restart server periodically:**

   ```bash
   # Add to cron for daily restart
   0 2 * * * systemctl restart pabawi
   ```

5. **Increase system memory:**
   - Consider upgrading server resources
   - Use swap space if needed

## Expert Mode Debugging

Expert mode provides detailed diagnostic information for troubleshooting complex issues. This section explains how to use expert mode effectively.

### Enabling Expert Mode

**In the Web Interface:**

1. Click the "Expert Mode" toggle in the navigation bar
2. The setting persists across browser sessions
3. All subsequent requests include expert mode headers

**Via API:**

```bash
# Include X-Expert-Mode header
curl -X POST http://localhost:3000/api/nodes/node1/command \
  -H "Content-Type: application/json" \
  -H "X-Expert-Mode: true" \
  -d '{"command": "ls -la"}'
```

### What Expert Mode Provides

When expert mode is enabled, error responses include:

1. **Full Stack Traces:**

   ```json
   {
     "error": {
       "stackTrace": "Error: Command execution failed\n    at BoltService.runCommand (/app/dist/bolt/BoltService.js:123:15)\n    at async /app/dist/routes/command.js:45:20"
     }
   }
   ```

2. **Request IDs for Log Correlation:**

   ```json
   {
     "error": {
       "requestId": "req-abc123-def456"
     }
   }
   ```

3. **Execution Context:**

   ```json
   {
     "error": {
       "executionContext": {
         "endpoint": "/api/nodes/node1/command",
         "method": "POST",
         "timestamp": "2024-01-01T00:00:00.000Z"
       }
     }
   }
   ```

4. **Raw Bolt Output:**

   ```json
   {
     "error": {
       "rawResponse": "Error: Connection timeout after 30s\nFailed to connect to node1.example.com:22"
     }
   }
   ```

5. **Bolt Command Executed:**

   ```json
   {
     "error": {
       "executionContext": {
         "boltCommand": "bolt command run 'ls -la' --targets node1 --format json"
       }
     }
   }
   ```

### Using Expert Mode for Debugging

#### Scenario 1: Command Execution Fails

1. **Enable expert mode**
2. **Retry the command**
3. **Review the error response:**

   ```json
   {
     "error": {
       "code": "BOLT_EXECUTION_FAILED",
       "message": "Command execution failed",
       "stackTrace": "...",
       "rawResponse": "Error: Connection refused",
       "executionContext": {
         "boltCommand": "bolt command run 'ls -la' --targets node1 --format json"
       }
     }
   }
   ```

4. **Test the Bolt command manually:**

   ```bash
   bolt command run 'ls -la' --targets node1 --format json
   ```

5. **Diagnose the issue:**
   - Check network connectivity
   - Verify credentials
   - Test SSH connection

#### Scenario 2: Task Parameter Error

1. **Enable expert mode**
2. **Execute the task**
3. **Review the Bolt command:**

   ```json
   {
     "executionContext": {
       "boltCommand": "bolt task run psick::puppet_agent --targets node1 noop=true tags=web --format json"
     }
   }
   ```

4. **Test the command manually:**

   ```bash
   bolt task run psick::puppet_agent --targets node1 noop=true tags=web --format json
   ```

5. **Fix parameter issues:**
   - Verify parameter names
   - Check parameter types
   - Validate parameter values

#### Scenario 3: Parsing Error

1. **Enable expert mode**
2. **Trigger the error**
3. **Review raw Bolt output:**

   ```json
   {
     "error": {
       "rawResponse": "\u001b[31mError: Invalid JSON\u001b[0m\n{\"status\":\"success\"}"
     }
   }
   ```

4. **Identify the issue:**
   - Colored output (ANSI codes)
   - Malformed JSON
   - Extra output before JSON
5. **Fix the issue:**
   - Set `color: false` in bolt-project.yaml
   - Update Bolt version
   - Check task output format

### Correlating Logs with Request IDs

When expert mode is enabled, each request gets a unique ID that appears in both the error response and server logs.

**In error response:**

```json
{
  "error": {
    "requestId": "req-abc123-def456"
  }
}
```

**In server logs:**

```bash
# Search logs for request ID
sudo journalctl -u pabawi | grep "req-abc123-def456"

# Example log entry:
# [2024-01-01T00:00:00.000Z] ERROR [req-abc123-def456] Command execution failed: Connection timeout
```

This allows you to:

- Find all log entries related to a specific request
- Trace the execution flow
- Identify where errors occurred
- Debug complex issues

### Security Considerations

Expert mode exposes sensitive information:

- Internal file paths
- System configuration
- Bolt project structure
- Full error stack traces

**Best practices:**

- Only enable for trusted users
- Disable in production by default
- Enable temporarily for troubleshooting
- Review exposed information before sharing

## Interpreting Bolt Command Output

Understanding Bolt command output is essential for troubleshooting. This section explains how to read and interpret Bolt CLI output.

### Bolt Command Structure

A typical Bolt command looks like:

```bash
bolt command run 'uptime' --targets node1 --format json
```

Components:

- `bolt`: The Bolt CLI executable
- `command run`: Subcommand for running shell commands
- `'uptime'`: The command to execute (in quotes)
- `--targets node1`: Target node(s) to execute on
- `--format json`: Output format (JSON for API parsing)

### Successful Command Output

**Example:**

```json
{
  "items": [
    {
      "target": "node1",
      "status": "success",
      "value": {
        "stdout": " 10:30:15 up 5 days, 2:15, 1 user, load average: 0.15, 0.10, 0.08\n",
        "stderr": "",
        "exit_code": 0
      }
    }
  ]
}
```

**Key fields:**

- `target`: Node where command executed
- `status`: "success" or "failure"
- `value.stdout`: Standard output from command
- `value.stderr`: Standard error output
- `value.exit_code`: Command exit code (0 = success)

### Failed Command Output

**Example:**

```json
{
  "items": [
    {
      "target": "node1",
      "status": "failure",
      "value": {
        "_error": {
          "kind": "puppetlabs.tasks/command-error",
          "msg": "The command failed with exit code 127",
          "details": {
            "exit_code": 127
          }
        },
        "stdout": "",
        "stderr": "bash: invalidcommand: command not found\n",
        "exit_code": 127
      }
    }
  ]
}
```

**Common exit codes:**

- `0`: Success
- `1`: General error
- `2`: Misuse of shell command
- `126`: Command cannot execute
- `127`: Command not found
- `130`: Script terminated by Ctrl+C
- `255`: Exit status out of range

### Task Execution Output

**Example:**

```json
{
  "items": [
    {
      "target": "node1",
      "status": "success",
      "value": {
        "status": "installed",
        "version": "1.18.0",
        "message": "Package nginx installed successfully"
      }
    }
  ]
}
```

**Key differences from commands:**

- `value` contains task-specific fields
- No `stdout`/`stderr` (unless task provides them)
- Task-defined return values

### Connection Errors

**Example:**

```json
{
  "items": [
    {
      "target": "node1",
      "status": "failure",
      "value": {
        "_error": {
          "kind": "puppetlabs.tasks/connect-error",
          "msg": "Failed to connect to node1: Connection timeout",
          "details": {
            "host": "node1.example.com",
            "port": 22
          }
        }
      }
    }
  ]
}
```

**Common connection errors:**

- `connect-error`: Cannot establish connection
- `authentication-error`: Invalid credentials
- `host-key-error`: SSH host key mismatch

### Multiple Target Output

**Example:**

```json
{
  "items": [
    {
      "target": "node1",
      "status": "success",
      "value": { "stdout": "node1 output\n", "exit_code": 0 }
    },
    {
      "target": "node2",
      "status": "failure",
      "value": {
        "_error": {
          "msg": "Connection refused"
        }
      }
    }
  ]
}
```

**Interpreting multi-target results:**

- Each target has separate result
- Overall status is "partial" if some succeed and some fail
- Check each target's status individually

### Bolt Error Messages

**Common error patterns:**

1. **"Could not find a node with name 'xyz'"**
   - Node not in inventory
   - Check `bolt inventory show`

2. **"Task 'xyz' not found"**
   - Task doesn't exist
   - Check `bolt task show`

3. **"Connection timeout"**
   - Network issue
   - Target unreachable
   - Firewall blocking

4. **"Authentication failed"**
   - Wrong credentials
   - SSH key not authorized
   - Check inventory config

5. **"Permission denied"**
   - Insufficient privileges
   - Need sudo
   - Check user permissions

### Debugging with Verbose Output

Add `--verbose` or `--debug` to Bolt commands for more details:

```bash
# Verbose output
bolt command run 'uptime' --targets node1 --verbose

# Debug output (very detailed)
bolt command run 'uptime' --targets node1 --debug
```

**Verbose output includes:**

- Connection details
- Authentication steps
- Command execution trace
- Timing information

**When to use:**

- Connection issues
- Authentication problems
- Unexpected behavior
- Performance debugging

## Common Error Messages

This section provides quick solutions for common error messages you might encounter.

### "ENOENT: no such file or directory"

**Full error:**

```
Error: ENOENT: no such file or directory, open '/path/to/file'
```

**Causes:**

- File or directory doesn't exist
- Wrong path
- Permissions issue

**Solutions:**

1. Verify path exists: `ls -la /path/to/file`
2. Check `BOLT_PROJECT_PATH` configuration
3. Create missing directories: `mkdir -p /path/to/directory`
4. Check file permissions: `chmod 644 /path/to/file`

### "EACCES: permission denied"

**Full error:**

```
Error: EACCES: permission denied, open '/path/to/file'
```

**Causes:**

- Insufficient file permissions
- Wrong user/group ownership
- SELinux/AppArmor restrictions

**Solutions:**

1. Check permissions: `ls -la /path/to/file`
2. Fix permissions: `chmod 644 /path/to/file`
3. Fix ownership: `chown user:group /path/to/file`
4. For Docker: `chown -R 1001:1001 ./data`

### "EADDRINUSE: address already in use"

**Full error:**

```
Error: listen EADDRINUSE: address already in use :::3000
```

**Causes:**

- Another process using the port
- Previous instance still running

**Solutions:**

1. Find process using port: `lsof -i :3000`
2. Kill process: `kill -9 <PID>`
3. Or use different port: `PORT=3001`

### "Cannot find module 'express'"

**Full error:**

```
Error: Cannot find module 'express'
```

**Causes:**

- Dependencies not installed
- Wrong working directory

**Solutions:**

1. Install dependencies: `npm install`
2. Check node_modules exists: `ls -la node_modules`
3. Clear and reinstall: `rm -rf node_modules && npm install`

### "spawn bolt ENOENT"

**Full error:**

```
Error: spawn bolt ENOENT
```

**Causes:**

- Bolt CLI not installed
- Bolt not in PATH

**Solutions:**

1. Install Bolt: See [Installation Issues](#installation-issues)
2. Verify installation: `which bolt`
3. Add to PATH: `export PATH="/opt/puppetlabs/bin:$PATH"`

### "SQLITE_CANTOPEN: unable to open database file"

**Full error:**

```
Error: SQLITE_CANTOPEN: unable to open database file
```

**Causes:**

- Database directory doesn't exist
- Insufficient permissions
- Disk full

**Solutions:**

1. Create directory: `mkdir -p ./data`
2. Fix permissions: `chmod 755 ./data`
3. Check disk space: `df -h`
4. For Docker: `chown -R 1001:1001 ./data`

### "SQLITE_BUSY: database is locked"

**Full error:**

```
Error: SQLITE_BUSY: database is locked
```

**Causes:**

- Multiple processes accessing database
- Stale lock file

**Solutions:**

1. Stop all instances: `pkill -f "node.*server.js"`
2. Remove lock files: `rm -f ./data/executions.db-*`
3. Restart server: `npm run dev:backend`

### "Connection timeout"

**Full error:**

```
Error: Connection timeout after 30s
```

**Causes:**

- Network connectivity issue
- Target node unreachable
- Firewall blocking

**Solutions:**

1. Test connectivity: `ping target-host`
2. Test SSH: `ssh user@target-host`
3. Increase timeout in inventory.yaml
4. Check firewall rules

### "Authentication failed"

**Full error:**

```
Error: Authentication failed for user@host
```

**Causes:**

- Wrong credentials
- SSH key not authorized
- Key permissions incorrect

**Solutions:**

1. Test SSH: `ssh user@target-host`
2. Check key permissions: `chmod 600 ~/.ssh/id_rsa`
3. Verify authorized_keys on target
4. Check inventory configuration

### "Command not in whitelist"

**Full error:**

```json
{
  "error": {
    "code": "COMMAND_NOT_ALLOWED",
    "message": "Command not in whitelist"
  }
}
```

**Causes:**

- Command whitelist enabled
- Command not in allowed list

**Solutions:**

1. Add command to whitelist: `COMMAND_WHITELIST='["ls","pwd","uptime"]'`
2. Or enable allow-all: `COMMAND_WHITELIST_ALLOW_ALL=true`
3. Check current config: `curl http://localhost:3000/api/config`

### "Task 'xyz' not found"

**Full error:**

```json
{
  "error": {
    "code": "INVALID_TASK_NAME",
    "message": "Task does not exist"
  }
}
```

**Causes:**

- Task name incorrect
- Module not installed

**Solutions:**

1. List tasks: `bolt task show`
2. Install module: `bolt module install example42-tp`
3. Check module path in bolt-project.yaml

### "Node not found in inventory"

**Full error:**

```json
{
  "error": {
    "code": "INVALID_NODE_ID",
    "message": "Node not found in inventory"
  }
}
```

**Causes:**

- Node ID doesn't match inventory
- Typo in node name

**Solutions:**

1. List nodes: `bolt inventory show`
2. Check inventory.yaml for correct node names
3. Clear cache and retry

## FAQ

### General Questions

#### Q: What is Pabawi?

**A:** Pabawi is a web interface for the Bolt automation tool. It provides a user-friendly way to manage infrastructure, execute commands, run tasks, and monitor executions through a browser instead of the command line.

#### Q: Do I need to know Bolt to use Pabawi?

**A:** Basic Bolt knowledge is helpful but not required. Pabawi abstracts most Bolt complexity. However, understanding Bolt concepts (inventory, tasks, targets) will help you use Pabawi more effectively.

#### Q: Can I use Pabawi with my existing Bolt project?

**A:** Yes! Pabawi is designed to work with existing Bolt projects. Just point `BOLT_PROJECT_PATH` to your Bolt project directory, and Pabawi will use your existing inventory, modules, and configuration.

#### Q: Is Pabawi production-ready?

**A:** Version 0.1.0 is suitable for internal use and controlled environments. For production use, ensure you:

- Configure command whitelist appropriately
- Use proper authentication (future version)
- Monitor resource usage
- Keep backups of execution history

### Configuration Questions

#### Q: Where should I put my configuration?

**A:** Configuration goes in the `backend/.env` file. Copy `backend/.env.example` to `backend/.env` and customize the values. For Docker deployments, use environment variables in docker-compose.yml.

#### Q: How do I allow all commands?

**A:** Set `COMMAND_WHITELIST_ALLOW_ALL=true` in your .env file. **Warning:** Only use this in trusted environments, as it allows execution of any command on target nodes.

#### Q: Can I use multiple Bolt projects?

**A:** Currently, Pabawi supports one Bolt project per instance. To manage multiple projects, run separate Pabawi instances with different `BOLT_PROJECT_PATH` and `PORT` values.

#### Q: How do I change the default port?

**A:** Set `PORT=<number>` in your .env file. For example: `PORT=8080`. Remember to update firewall rules and access URLs accordingly.

### Security Questions

#### Q: Is Pabawi secure?

**A:** Pabawi includes security features like command whitelisting and input validation. However, version 0.1.0 does not include authentication. For production use:

- Use command whitelist (don't enable allow-all)
- Run behind a reverse proxy with authentication
- Restrict network access with firewall rules
- Use HTTPS for encrypted communication

#### Q: How does the command whitelist work?

**A:** The whitelist controls which commands can be executed. In `exact` mode, commands must match exactly. In `prefix` mode, commands must start with a whitelist entry. If `COMMAND_WHITELIST_ALLOW_ALL=true`, all commands are allowed.

#### Q: Can I restrict access to specific users?

**A:** Version 0.1.0 doesn't include user authentication. Use external authentication (reverse proxy, VPN, firewall rules) to control access. Future versions will include built-in authentication.

#### Q: Are credentials stored in Pabawi?

**A:** No. Pabawi uses credentials from your Bolt inventory configuration. Credentials remain in your Bolt project files and are never stored in Pabawi's database.

### Execution Questions

#### Q: Why is my execution stuck in "running" state?

**A:** This can happen if:

- The operation is taking longer than expected (check target node)
- Network connection was lost (check connectivity)
- Execution exceeded timeout (check logs)
- Server was restarted (execution state is lost)

Enable expert mode and check server logs for details.

#### Q: Can I cancel a running execution?

**A:** Version 0.1.0 doesn't support canceling executions. If an execution is stuck, you can:

- Wait for timeout (default 5 minutes)
- Restart the server (will terminate all running executions)
- Manually kill the Bolt process on the server

#### Q: How long is execution history kept?

**A:** Execution history is stored indefinitely in the SQLite database. To manage database size:

- Manually delete old records from the database
- Backup and archive old data
- Future versions will include automatic cleanup

#### Q: Can I run commands on multiple nodes at once?

**A:** Version 0.1.0 focuses on single-node operations through the web interface. For multi-node operations, use Bolt CLI directly or wait for future Pabawi versions.

### Performance Questions

#### Q: How many nodes can Pabawi handle?

**A:** Pabawi has been tested with inventories up to 1000 nodes. Performance depends on:

- Server resources (CPU, memory)
- Bolt inventory complexity
- Caching configuration
- Concurrent execution limit

For large inventories, enable caching and adjust concurrent execution limits.

#### Q: Why is the inventory page slow?

**A:** Large inventories can be slow to load. Solutions:

- Enable inventory caching: `CACHE_INVENTORY_TTL=60000`
- Optimize Bolt inventory structure
- Use groups to organize nodes
- Increase server resources

#### Q: How many concurrent executions are supported?

**A:** Default is 5 concurrent executions. Adjust with `CONCURRENT_EXECUTION_LIMIT` based on:

- Server CPU and memory
- Network bandwidth
- Target node capacity
- Execution complexity

### Troubleshooting Questions

#### Q: How do I enable debug logging?

**A:** Set `LOG_LEVEL=debug` in your .env file and restart the server. Debug logs include detailed information about all operations.

#### Q: What is expert mode?

**A:** Expert mode provides detailed diagnostic information when errors occur, including:

- Full stack traces
- Raw Bolt output
- Bolt commands executed
- Request IDs for log correlation
- Execution context

Enable it in the web interface or via API headers.

#### Q: Where are the logs?

**A:** Log location depends on how you're running Pabawi:

- Development: Console output
- Systemd: `sudo journalctl -u pabawi -f`
- Docker: `docker logs -f pabawi`
- PM2: `pm2 logs pabawi`

#### Q: How do I report a bug?

**A:** When reporting bugs:

1. Enable expert mode
2. Reproduce the issue
3. Capture the error response
4. Check server logs for the request ID
5. Include Bolt version and Pabawi version
6. Describe steps to reproduce

### Docker Questions

#### Q: How do I run Pabawi in Docker?

**A:** Use the provided docker-compose.yml or docker-run.sh script:

```bash
./scripts/docker-run.sh
```

Or manually:

```bash
docker run -d -p 3000:3000 \
  -v /path/to/bolt-project:/bolt-project:ro \
  -v ./data:/data \
  example42/pabawi:latest
```

#### Q: Why do I get database permission errors in Docker?

**A:** The container runs as UID 1001. On Linux, set ownership:

```bash
sudo chown -R 1001:1001 ./data
```

Or use the docker-run.sh script which handles this automatically.

#### Q: Can I use Docker Compose?

**A:** Yes! A docker-compose.yml file is provided:

```bash
docker-compose up -d
```

#### Q: How do I update the Docker image?

**A:** Pull the latest image and restart:

```bash
docker-compose pull
docker-compose up -d
```

### Integration Questions

#### Q: Can I integrate Pabawi with other tools?

**A:** Yes! Pabawi provides a REST API that can be integrated with:

- CI/CD pipelines
- Monitoring systems
- Custom automation scripts
- Other management tools

See the [API documentation](./api.md) for details.

#### Q: Does Pabawi support Puppet Enterprise?

**A:** Pabawi works with Bolt, which can manage both open-source Puppet and Puppet Enterprise nodes. Configure your Bolt inventory with appropriate credentials and endpoints.

#### Q: Can I use Pabawi with Ansible?

**A:** No. Pabawi is specifically designed for Bolt. For Ansible, consider tools like AWX or Ansible Tower.

### Future Features

#### Q: Will Pabawi support authentication?

**A:** Yes! Authentication is planned for version 0.2.0, including:

- User login
- Role-based access control
- API tokens
- Audit logging

#### Q: Will Pabawi support other automation tools?

**A:** Yes! Multi-tool support is planned for version 0.3.0, including:

- Ansible
- Salt
- Chef
- Custom scripts

#### Q: Can I contribute to Pabawi?

**A:** Contributions are welcome! Check the project repository for contribution guidelines.

## Getting Help

If you can't find a solution in this guide:

1. **Check the documentation:**
   - [Configuration Guide](./configuration.md)
   - [API Documentation](./api.md)
   - [README](../README.md)

2. **Enable expert mode:**
   - Turn on expert mode in the web interface
   - Retry the operation
   - Review detailed error information

3. **Check server logs:**
   - Look for error messages and stack traces
   - Use request IDs to correlate errors

4. **Test with Bolt CLI:**
   - Verify Bolt works independently
   - Test commands and tasks directly

5. **Contact support:**
   - Provide error messages and logs
   - Include Pabawi and Bolt versions
   - Describe steps to reproduce

## Additional Resources

- [Bolt Documentation](https://puppet.com/docs/bolt/)
- [Puppet Documentation](https://puppet.com/docs/)
- [Pabawi GitHub Repository](https://github.com/example42/pabawi)
- [Pabawi API Documentation](./api.md)
- [Pabawi Configuration Guide](./configuration.md)
