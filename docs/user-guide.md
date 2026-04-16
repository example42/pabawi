# User Guide

Pabawi is a web UI for managing infrastructure through Bolt, Ansible, SSH, PuppetDB, Puppetserver, Hiera, Proxmox, and AWS. All integrations that are enabled and connected are available from the same interface.

## Navigation

The top navigation bar has five sections:

| Section | What it shows |
|---|---|
| **Home** | Integration status, aggregated Puppet run chart, system health |
| **Inventory** | All nodes from all enabled information sources |
| **Executions** | Full execution history with filtering |
| **Manage** | Provisioning (Proxmox/AWS) — visible when provisioning integrations are enabled |
| **Expert Mode toggle** | Adds diagnostic detail to all pages |

## Inventory

The Inventory page aggregates nodes from every enabled information source (Bolt, PuppetDB, Puppetserver). Nodes that appear in multiple sources are linked and shown as one entry with a **sources** badge listing where they came from.

**Search and filter:** Type in the search box to filter by node name. Use the transport or source dropdown to narrow further.

**View modes:** Toggle between grid and list view with the button in the top right.

**Performance:** Virtual scrolling handles inventories of 1000+ nodes without lag.

### Integration color coding

Each integration has a color that appears on badges and tabs:

| Integration | Color |
|---|---|
| Bolt | Orange (#FFAE1A) |
| PuppetDB | Purple (#9063CD) |
| Puppetserver | Dark blue (#2E3A87) |
| Hiera | Dark red (#C1272D) |
| Ansible | Green |
| SSH | Teal |
| Proxmox | Yellow-orange |
| AWS | Amber |

## Node Detail Page

Click any node to open its detail page. Sections are collapsible. What you see depends on which integrations are enabled.

| Section | Requires |
|---|---|
| Node info | Any source |
| Facts | Bolt, PuppetDB, or Puppetserver |
| Hiera data | Hiera |
| PuppetDB reports | PuppetDB |
| Run Puppet | Bolt |
| Execute command | Bolt or Ansible or SSH |
| Run task | Bolt |
| Install package | Bolt |
| Execution history | Always (SQLite) |

## Gathering Facts

Facts are system information (OS, hardware, network, memory) collected from the node.

1. Open the **Facts** section on a node's detail page.
2. Click **Gather Facts**.
3. Facts appear in a collapsible tree. Expand sections to browse.

Facts from multiple sources (Bolt, PuppetDB, Puppetserver) are shown in separate tabs labeled with their source color.

Facts are cached per node (default 5 min). Click **Gather Facts** again to force a refresh.

## Executing Commands

Ad-hoc shell commands via Bolt, Ansible, or SSH, depending on what's available for the node.

1. Open the **Execute Command** section.
2. Type your command (e.g., `uptime`, `df -h`, `systemctl status nginx`).
3. Select the execution tool (if multiple are available).
4. Click **Execute**.

Results show stdout, stderr, exit code, and duration. In expert mode, the exact CLI command is shown.

**Command whitelist:** Commands are validated against the `COMMAND_WHITELIST` before execution. If rejected, you'll see `Command not in whitelist`. Contact your administrator to add commands.

### SSH execution

SSH commands run directly on the target without Bolt — useful when Bolt isn't configured but the node is reachable via SSH. Credentials come from the SSH integration configuration (`SSH_*` env vars) or the Bolt inventory.

### Ansible execution

Ansible commands run as `ansible` ad-hoc module calls using the configured inventory. The command field maps to the `shell` module by default.

## Running Bolt Tasks

Bolt tasks are reusable scripts that accept parameters. Tasks come from Bolt modules installed in your project.

1. Open the **Run Task** section.
2. Browse or search available tasks — they're grouped by module.
3. Select a task to see its parameters and description.
4. Fill in parameters. Required fields are marked with `*`.
5. Click **Execute Task**.

**Parameter types:** String, Integer, Boolean (checkbox), Array (JSON), Hash (JSON).

Results appear below the form. In expert mode, the full `bolt task run` command is shown.

### Useful tasks

| Task | Purpose |
|---|---|
| `package` | Install/remove/upgrade packages |
| `service` | Start/stop/restart services |
| `psick::puppet_agent` | Run Puppet agent |
| `tp::install` | Install via Tiny Puppet |
| `tp::test` | Verify application installation |

## Running Puppet

Runs `puppet agent` on the target node via Bolt.

1. Open the **Run Puppet** section.
2. Configure options:

| Option | Effect |
|---|---|
| **Tags** | Comma-separated Puppet tags to apply. Empty = all tags. |
| **Environment** | Override Puppet environment. Empty = node default. |
| **Noop** | Dry run — shows what would change, applies nothing. |
| **No-noop** | Force changes even if node is in noop mode. |
| **Debug** | Enable verbose Puppet output. |

1. Click **Run Puppet**.

Results show resource change summary (changed/failed/skipped/total) and full agent output.

**Always test in noop mode first.** Running Puppet in production without noop can change running systems.

### Puppet reports (PuppetDB required)

The **Reports** tab on a node shows Puppet run history from PuppetDB.

Filter by:

- Time period: 24h / 7d / 30d / all time
- Status: changed / unchanged / failed
- Environment

Reports are color-coded: blue (changed), green (unchanged), red (failed).

Click a report to see resource changes, timeline, and dependency graph.

## Installing Packages

Shortcut UI for the `package` task (or `tp::install` if configured).

1. Open the **Install Package** section.
2. Select the package task if multiple are configured.
3. Fill in:
   - **Package name** (required): e.g. `nginx`, `postgresql-14`
   - **Version** (optional): leave empty for latest
   - **Ensure**: `present` / `absent` / `latest`
   - **Settings** (optional): JSON for task-specific options
4. Click **Install Package**.

## Ansible

When Ansible is enabled, the **Execute Command** section offers Ansible as an execution option. Ansible runs ad-hoc commands against the configured inventory.

For playbooks, use **Run Task** with Ansible-specific tasks if your project includes them.

## Provisioning (Proxmox / AWS)

The **Manage** tab appears when at least one provisioning integration (Proxmox or AWS) is enabled.

### Proxmox

Lists VMs and LXC containers from Proxmox VE. Actions:

| Action | Description |
|---|---|
| Start | Power on a stopped VM/container |
| Stop | ACPI shutdown |
| Shutdown | Force stop |
| Reboot | Restart |
| Create VM | Provision a new VM from a template |
| Create LXC | Provision a new container |
| Destroy | Delete VM/container — **blocked unless `ALLOW_DESTRUCTIVE_PROVISIONING=true`** |

### AWS

Lists EC2 instances across configured regions. Actions:

| Action | Description |
|---|---|
| Start | Start a stopped instance |
| Stop | Stop a running instance |
| Reboot | Restart an instance |
| Terminate | Permanently delete — **blocked unless `ALLOW_DESTRUCTIVE_PROVISIONING=true`** |
| Launch | Launch a new EC2 instance |

## Execution History

The **Executions** page shows all operations performed through Pabawi.

**Filter by:**

- Date range (today / 7d / 30d / custom)
- Status (success / failed / running / partial)
- Target node
- Free text search on action

**Status values:**

- Success — completed without error
- Failed — returned an error
- Running — currently executing
- Partial — some nodes succeeded, some failed

Click any row to see full output, parameters, and (in expert mode) the raw CLI command and request ID.

## Expert Mode

Expert mode adds technical detail everywhere. Toggle it in the navigation bar.

When enabled, every execution result includes:

- The exact CLI command executed (Bolt, Ansible, etc.)
- Full error stack traces
- Request ID for log correlation
- Raw API output from integrations
- Performance metrics (memory, CPU, cache stats)
- Frontend and backend log timeline

**Log correlation:** Copy the Request ID from an expert-mode error and grep your server logs:

```bash
journalctl -u pabawi | grep "req-abc123-def456"
```

Expert mode state persists in browser localStorage. It is per-browser, not per-user.

**Security:** Expert mode exposes internal paths and stack traces. Only enable for trusted users in production.

## Real-Time Streaming Output

Long-running executions stream output live via Server-Sent Events. No setup required — streaming activates automatically when you start an execution.

The output window shows stdout and stderr as they arrive. Auto-scroll follows new output; click the output window to pause auto-scroll and scroll manually.

If streaming drops, the output window shows a reconnect indicator. Completed output is preserved.

## Interpreting Bolt Output

Bolt returns JSON. Pabawi displays it formatted, but expert mode shows the raw structure.

**Successful command:**

```json
{
  "items": [{
    "target": "web-01",
    "status": "success",
    "result": { "stdout": "up 45 days\n", "stderr": "", "exit_code": 0 }
  }]
}
```

**Failed command:**

```json
{
  "items": [{
    "target": "web-01",
    "status": "failure",
    "result": {
      "stderr": "cat: /no/such/file: No such file or directory\n",
      "exit_code": 1,
      "_error": { "kind": "puppetlabs.tasks/command-error", "msg": "exit code 1" }
    }
  }]
}
```

**Connection error:**

```json
{
  "items": [{
    "target": "web-02",
    "status": "failure",
    "result": {
      "_error": { "kind": "puppetlabs.tasks/connect-error", "msg": "Connection refused" }
    }
  }]
}
```

The `_error` field is always present on failure. The `_output` field contains the human-readable output from tasks.

## Tips

- **Verify connectivity first** before running tasks: execute `uptime` on a node to confirm it's reachable.
- **Use noop for Puppet** before applying changes in production.
- **Use expert mode for debugging** — the raw CLI command is the fastest way to reproduce issues manually.
- **Refresh inventory** after adding nodes: inventory is cached for 30 s by default, or restart the server.
- **Filter execution history** before concluding something never ran — the default view is paginated.
- **ALLOW_DESTRUCTIVE_PROVISIONING** defaults to `false`. Destroy/terminate actions return 403 until you enable it explicitly.
