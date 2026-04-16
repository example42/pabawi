# Troubleshooting

## Quick Diagnostics

```bash
# Health check
curl http://localhost:3000/api/health

# Integration status
curl http://localhost:3000/api/integrations/status

# Logs (systemd)
sudo journalctl -u pabawi -f

# Logs (Docker)
docker logs pabawi -f

# Logs (dev)
npm run dev:backend
```

Enable **Expert Mode** in the UI to see raw API responses and detailed error output.

---

## Bolt

| Problem | Likely Cause | Fix |
|---|---|---|
| "Bolt configuration files not found" | `BOLT_PROJECT_PATH` is wrong or `bolt-project.yaml` / `inventory.yaml` missing | Verify path exists and contains both files. Check permissions: `chmod 644 inventory.yaml bolt-project.yaml` |
| "Cannot parse Bolt output" | Bolt returning colored output | Set `color: false` in `bolt-project.yaml` |
| "Execution exceeded timeout" | Operation longer than `BOLT_EXECUTION_TIMEOUT` | Increase `BOLT_EXECUTION_TIMEOUT` (ms). Default: 300000 |
| "Node not found in inventory" | Node ID doesn't match inventory | Run `bolt inventory show --format json` to verify names. Clear cache: restart server or set `CACHE_INVENTORY_TTL=0` |
| "Task does not exist" | Module not installed or wrong module path | Run `bolt task show --format json`. Install: `bolt module install` from `$BOLT_PROJECT_PATH` |
| Tasks return `_error` output | Task failed on target | Check `_error.msg` in response. Enable Expert Mode to see raw output |
| Whitelist blocks a command | Command not in `COMMAND_WHITELIST` | Add the exact command (or prefix) to the whitelist. See [configuration.md](./configuration.md#command-whitelist) |

**Minimal `bolt-project.yaml`:**

```yaml
name: my-project
modulepath:
  - modules
color: false
```

---

## PuppetDB

| Problem | Likely Cause | Fix |
|---|---|---|
| No nodes from PuppetDB | `PUPPETDB_ENABLED` not set or wrong `PUPPETDB_SERVER_URL` | Check `/api/integrations/status` for PuppetDB errors |
| "Connection refused" | PuppetDB not running or wrong port | Default port is 8081. Test: `curl http://puppetdb:8081/pdb/query/v4/nodes` |
| SSL errors | Wrong cert paths or CA mismatch | Verify `PUPPETDB_SSL_CA`, `PUPPETDB_SSL_CERT`, `PUPPETDB_SSL_KEY`. Test with `openssl s_client` |
| "0 0 0" for all report metrics | Report data not populated | Node must have a recent Puppet run. Check `puppet agent -t` on the node |
| Facts missing for a node | Node hasn't reported in | Check when node last checked in via `PUPPETDB_SERVER_URL/pdb/query/v4/nodes/<certname>` |
| Query timeout | PuppetDB under load or large dataset | Increase `CACHE_FACTS_TTL` to reduce query frequency |

---

## Puppetserver

| Problem | Likely Cause | Fix |
|---|---|---|
| No nodes from Puppetserver | `PUPPETSERVER_ENABLED` not set | Check `/api/integrations/status` |
| 403 Forbidden on certificate API | Token missing `certificate_status` permission or `cli_auth` extension not in cert | Verify token permissions in PE RBAC. For cert auth: cert must have `cli_auth` OID `1.3.6.1.4.1.34380.1.3.39` |
| SSL verification failure | Self-signed cert or wrong CA | Set `PUPPETSERVER_SSL_CA=/path/to/ca.pem`. Dev only: `PUPPETSERVER_SSL_REJECT_UNAUTHORIZED=false` |
| Facts tab shows "No facts available" | Node hasn't checked in or wrong facts endpoint | Trigger a Puppet run: `sudo puppet agent -t`. Verify `PUPPETSERVER_SERVER_URL` |
| Catalog compilation fails | Puppet code errors or missing modules | Test manually: `sudo puppet catalog compile node.example.com`. Check syntax: `puppet parser validate` |
| Environments show placeholder values | Environments API not reachable | Test: `GET /puppet/v3/environments` with your auth token |
| "Node not found" | Node hasn't checked in or certificate not signed | Sign certificate: `sudo puppetserver ca sign --certname <name>` |

---

## Hiera

| Problem | Likely Cause | Fix |
|---|---|---|
| Hiera lookup returns nothing | `HIERA_CONTROL_REPO_PATH` is wrong | Verify path contains `hiera.yaml` |
| "No hiera.yaml found" | Control repo path doesn't have a Hiera config | Create or copy `hiera.yaml` into the control repo root |
| Wrong facts used in lookups | Facts source not connected | Enable PuppetDB or Puppetserver for live facts |
| Code analysis fails | `HIERA_CODE_MANAGER_ENABLED=true` but no control repo | Set `HIERA_CODE_MANAGER_ENABLED=false` or provide a valid `HIERA_CONTROL_REPO_PATH` |

---

## Ansible

| Problem | Likely Cause | Fix |
|---|---|---|
| "Ansible not found" | `ansible-playbook` not in PATH | Install Ansible on the host. Verify: `ansible --version` |
| "No inventory found" | `ANSIBLE_PROJECT_PATH` wrong or inventory file missing | Verify path contains `inventory/` or an inventory file |
| Playbook fails | Syntax errors or missing roles | Test locally: `ansible-playbook playbook.yml --check` |
| "Connection refused" / SSH errors | Ansible can't reach targets | Check SSH connectivity, keys, and user in inventory |
| No nodes from Ansible | Inventory parse error | Run `ansible-inventory --list` from `ANSIBLE_PROJECT_PATH` |

---

## SSH

| Problem | Likely Cause | Fix |
|---|---|---|
| SSH nodes not in inventory | SSH integration reads from Bolt inventory — no dedicated env var | Define SSH hosts in `BOLT_PROJECT_PATH/inventory.yaml` with `transport: ssh` |
| "Permission denied (publickey)" | Wrong key or key not authorized on target | Verify `SSH_DEFAULT_KEY` path and that the public key is in `authorized_keys` on target |
| "Host key verification failed" | Unknown host | Add host to `known_hosts` or set `StrictHostKeyChecking no` in `SSH_OPTIONS` |
| Key file not readable | Permissions too open | `chmod 600 ~/.ssh/id_rsa` |
| Docker: key not found | Wrong mount path | Key must be at `SSH_DEFAULT_KEY` inside the container (`/opt/pabawi/ssh/id_rsa`) |

---

## Proxmox

| Problem | Likely Cause | Fix |
|---|---|---|
| "Failed to validate Proxmox credentials" | Wrong host, token ID, or secret | Test: `curl -k https://proxmox:8006/api2/json/version -H "Authorization: PVEAPIToken=..."` |
| SSL errors | Self-signed cert | Set `PROXMOX_SSL_REJECT_UNAUTHORIZED=false` (dev) or provide `PROXMOX_SSL_CA` |
| 403 on VM operations | Token lacks required privileges | See [integrations/proxmox.md](./integrations/proxmox.md) for required permissions |
| Terminate blocked (403) | `ALLOW_DESTRUCTIVE_PROVISIONING=false` | Set `ALLOW_DESTRUCTIVE_PROVISIONING=true` |
| VM creation fails | Template doesn't exist or wrong node | Verify `template_id` is a valid VM/template on the target Proxmox node |
| LXC creation fails | Template incompatible or kernel missing | Use official Proxmox templates. Check `lsmod | grep overlay` |
| No VMs in inventory | Wrong `PROXMOX_NODE` or API scope | Verify node name and that the token has access to the correct cluster/node |

---

## AWS

| Problem | Likely Cause | Fix |
|---|---|---|
| "Failed to validate AWS credentials" | Wrong key/secret or instance profile not attached | Verify `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. Or confirm instance profile is attached |
| "AccessDenied" on an operation | Missing IAM permission | Check IAM policy against the required permissions in [integrations/aws.md](./integrations/aws.md) |
| No instances in inventory | Region not in `AWS_REGIONS` | Add the region: `AWS_REGIONS='["us-east-1","eu-west-1"]'` |
| Multi-region discovery fails for one region | Regional endpoint error | A per-region failure won't block other regions. Check backend logs |
| Terminate blocked (403) | `ALLOW_DESTRUCTIVE_PROVISIONING=false` | Set `ALLOW_DESTRUCTIVE_PROVISIONING=true` |

---

## Common Node/OS Errors

| Error | Fix |
|---|---|
| `ENOENT: no such file or directory` | Check `BOLT_PROJECT_PATH` and other path env vars. Create missing directories |
| `EACCES: permission denied` | Fix permissions: `chmod 644 <file>`. For Docker data dir: `chown -R 1001:1001 ./data` |
| `EADDRINUSE: address already in use :::3000` | `lsof -i :3000`, kill the process, or change `PORT` |
| `Cannot find module 'express'` | Run `npm run install:all` from the repo root |

---

## Database

| Problem | Fix |
|---|---|
| "Database locked" | Pabawi uses SQLite — only one process may write. Kill duplicate instances |
| "Migration failed" | Check backend logs. Delete `pabawi.db` to start fresh (loses all data) |
| Database file not found on startup | Ensure `DATABASE_PATH` directory exists and is writable. Docker: check volume mount |
| Execution history missing after restart | Expected if using in-memory SQLite (`DATABASE_PATH=:memory:`) |

---

## Streaming / SSE

| Problem | Fix |
|---|---|
| Real-time output not appearing | Check browser supports SSE. Disable any proxy buffering (nginx: `proxy_buffering off`) |
| Stream cuts off early | Proxy timeout too low. Set `proxy_read_timeout 300s` in nginx |
| "Connection dropped" mid-stream | Network interruption. The execution continues — reload and check execution history |

---

## Performance

| Problem | Fix |
|---|---|
| Inventory loads slowly | Increase `CACHE_INVENTORY_TTL` (default 60000ms). Consider reducing number of enabled integrations |
| Facts load slowly | Increase `CACHE_FACTS_TTL` (default 300000ms) |
| Commands queue and don't run | `CONCURRENT_EXECUTION_LIMIT` reached. Increase it or wait for running tasks to complete |
| High memory usage | Each Bolt execution spawns a subprocess. Reduce `CONCURRENT_EXECUTION_LIMIT` |

---

## Auth / RBAC

| Problem | Fix |
|---|---|
| Login returns 401 | Wrong username or password. Admin token: check `backend/.env` for `JWT_SECRET` setup and use the setup API to reset |
| 403 on an API endpoint | User's role lacks required permission. See [permissions-rbac.md](./permissions-rbac.md) |
| "JWT malformed" | Token expired or tampered. Log out and log in again |
| Auth not required (no login prompt) | `AUTH_ENABLED` is not set to `true` |

---

## FAQ

**Does Pabawi require Bolt?**
No. Bolt is one of several execution plugins alongside SSH and Ansible. You need at least one execution plugin enabled to run commands, but none is strictly required — if all are disabled, execution features are unavailable while inventory from information-source integrations still works.

**Can I use my existing Bolt project?**
Yes. Point `BOLT_PROJECT_PATH` at your existing project directory.

**Can I run multiple Bolt projects?**
One project per instance. Run multiple Pabawi instances on different ports with different `BOLT_PROJECT_PATH` values.

**Why is an execution stuck in "running"?**
The server was probably restarted mid-execution — execution state is not persisted across restarts. Check execution history for the last recorded output.

**Can I cancel a running execution?**
Currently no. The underlying Bolt process will complete (or timeout). Plan for this when setting `BOLT_EXECUTION_TIMEOUT`.

**Are SSH credentials stored in the database?**
No. Credentials live in your Bolt inventory config or SSH key files. Pabawi's database stores only execution history.

**How do I enable auth?**
Set `AUTH_ENABLED=true` and `JWT_SECRET=<strong-random-value>` in `.env`. See [permissions-rbac.md](./permissions-rbac.md).
