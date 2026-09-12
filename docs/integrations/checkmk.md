# Checkmk Integration

Pabawi connects to Checkmk to provide live monitoring data: host inventory, service status, and state-change events. Inventory and monitoring data are fetched live; health probes are cached.

## Prerequisites

- Checkmk 2.1+ with the REST API enabled (available by default)
- An automation user with API access
- Network connectivity from the Pabawi host to the Checkmk server (HTTPS recommended)

Test connectivity:

```bash
curl -H "Authorization: Bearer automation myautomationsecret" \
  https://checkmk.example.com/mysite/check_mk/api/1.0/version
```

## Minimal Configuration

```bash
CHECKMK_ENABLED=true
CHECKMK_SERVER_URL=https://checkmk.example.com
CHECKMK_SITE=mysite
CHECKMK_USERNAME=automation
CHECKMK_PASSWORD=myautomationsecret
```

## Configuration Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `CHECKMK_ENABLED` | No | `false` | Set to exactly `"true"` to enable |
| `CHECKMK_SERVER_URL` | When enabled | unset | Base URL of the Checkmk server (e.g. `https://checkmk.example.com`). Must start with `http://` or `https://`. |
| `CHECKMK_SITE` | Unless URL includes site/API path | unset | Checkmk site name |
| `CHECKMK_USERNAME` | When enabled | unset | Automation user name |
| `CHECKMK_PASSWORD` | When enabled | unset | Automation user secret/password |
| `CHECKMK_SSL_VERIFY` | No | `true` | Set to `"false"` to skip TLS certificate verification (for self-signed certs) |

## What It Provides

| Feature | Details |
|---|---|
| **Inventory** | Hosts from Checkmk (priority 8), merged into unified inventory |
| **Service monitoring** | Live status of all services on a node (OK, WARN, CRIT, UNKNOWN) |
| **State-change events** | Livestatus log history with a reduced-fidelity REST fallback |
| **Acknowledge / downtime** | Operators can acknowledge service problems and schedule downtime windows from the Monitor page (requires `checkmk:write`) |
| **Node linking** | Checkmk hosts are linked to existing Pabawi nodes by hostname |

## How It Works

### Host Inventory

When inventory is requested, the plugin fetches all hosts from the Checkmk REST API:

```
GET /{site}/check_mk/api/1.0/domain-types/host_config/collections/all
```

Each host is mapped to a Pabawi node with:

- `id` / `name` = Checkmk hostname
- `uri` = IP address (if configured) or hostname
- `transport` = `"ssh"`
- `source` = `"checkmk"`

Host attributes (IP address, folder path, labels) are stored in the node's config field.

### Service Monitoring (Monitor Tab)

The node detail page shows a "Monitor" tab when the node is linked to a Checkmk host. It fetches live service data:

```
GET /{site}/check_mk/api/1.0/objects/host/{hostname}/collections/services
```

Services are displayed grouped by state: CRIT first, then WARN, UNKNOWN, and OK. Each service shows its description, state badge, plugin output, and last check time.

### State-Change Events (Journal)

History uses the Livestatus `log` table with `class=1` alerts. Per-node
queries request the last seven days and at most 500 rows; the HTTP `limit`
parameter trims that result and cannot recover rows beyond the upstream cap.

```bash
CHECKMK_LIVESTATUS_HOST=checkmk.example.com
CHECKMK_LIVESTATUS_PORT=6557
CHECKMK_LIVESTATUS_TLS=true
CHECKMK_LIVESTATUS_TIMEOUT_MS=5000
CHECKMK_HEALTHCHECK_INTERVAL_MS=300000
```

Enable a reachable Livestatus TCP or TLS listener on the Checkmk side first.
Pabawi sends raw LQL, with no REST bearer credential or client certificate on
this connection. Restrict the listener to the Pabawi host using network access
controls or a protected tunnel. `CHECKMK_LIVESTATUS_TLS=true` requires a TLS
listener; plaintext is the default when the host is set without that flag.
`CHECKMK_SSL_VERIFY` controls certificate verification on both REST and TLS
Livestatus connections. There is no separate Livestatus CA/client-key setting.

If Livestatus is absent or fails, per-node history derives at most the latest
transition per service from REST `last_state`, `state` and `last_state_change`.
Global fallback reports currently failing services as a snapshot. Neither
fallback is complete history. REST health determines plugin health, so a healthy
integration does not establish Livestatus reachability. Health probes are cached
for `CHECKMK_HEALTHCHECK_INTERVAL_MS`; check server logs for Livestatus degradation.
See [the transport decision](../adr/0001-checkmk-events-source.md).

## Authentication

Checkmk uses Bearer authentication with the format:

```
Authorization: Bearer {username} {password}
```

The automation user must have sufficient permissions to read hosts and services via the REST API. In Checkmk, this typically means the user needs the "Can use the REST API" permission and read access to the relevant hosts/services.

### Creating an Automation User

1. In Checkmk GUI: Setup → Users → Add user
2. Set "User type" to "Automation user"
3. Assign a strong automation secret
4. Ensure the user has read permissions for all hosts you want to monitor

## SSL/TLS

By default, TLS certificate verification is enabled. For self-signed certificates in development:

```bash
CHECKMK_SSL_VERIFY=false
```

A warning is logged at startup when verification is disabled.

For production, use a properly signed certificate or add the CA to the system trust store.

## API Endpoints

The Checkmk integration exposes these API endpoints:

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/api/nodes/:nodeId/services` | `checkmk:read` | Live service monitoring status |
| GET | `/api/nodes/:nodeId/monitoring-events` | `checkmk:read` | State-change events (supports `?limit=N`, default 200, max 1000) |
| GET | `/api/monitoring/overview` | `checkmk:read` | Global problem/host summary for the Monitor and Home pages |
| POST | `/api/monitoring/acknowledge` | `checkmk:read` + `checkmk:write` | Acknowledge a service problem |
| POST | `/api/monitoring/downtime` | `checkmk:read` + `checkmk:write` | Schedule a downtime window for a service |

All endpoints require JWT authentication. The `checkmk:read` permission is held
by the Viewer, Operator, Administrator, and Provisioner roles. The
`checkmk:write` permission (acknowledge / downtime) is held by the **Operator**
and **Administrator** roles only.

### Acknowledging problems and scheduling downtimes

From the Monitor page, each service problem row has **Ack** and **Downtime**
actions:

- **Acknowledge** marks the problem as handled. It stays visible but stops
  repeat notifications. A comment is required; `sticky` and `notify` are
  toggleable (sticky and notify default on). Maps to
  `POST /domain-types/acknowledge/collections/service` on the Checkmk REST API.
- **Downtime** suppresses the service for a chosen window (1h / 2h / 4h / 8h /
  24h, max 7 days). A comment is required. Maps to
  `POST /domain-types/downtime/collections/service`.

Both actions are recorded in the Pabawi audit log with the acting user, the
target host/service, and the comment.

In the problem list, services are visually distinguished:

- **Acknowledged** services are dimmed with a `✓` marker.
- **In-downtime** services use a blue-grey tint with a `⏸ DT` badge (a distinct
  treatment from acknowledgement). A service in downtime (whether through a
  service downtime or an inherited host downtime) is detected via the
  `scheduled_downtime_depth` and `host_scheduled_downtime_depth` columns.
- A **Hide downtime** toggle removes in-downtime services from the list.

> **Note:** The Checkmk automation user must have write permissions in Checkmk
> (not just read) for acknowledge and downtime calls to succeed. A read-only
> automation user will return `403 Forbidden` upstream, surfaced in Pabawi as a
> `502` with the upstream error message.

## Error Handling

The integration degrades gracefully:

- If Checkmk is unreachable, inventory returns empty and the Monitor tab shows an "unavailable" message
- Requests timeout after 15 seconds
- Other integrations are never blocked by a slow or failing Checkmk connection
- The plugin recovers automatically when Checkmk becomes reachable again (no restart needed)

## Troubleshooting

| Problem | Fix |
|---|---|
| Plugin not registering | Verify all required env vars are set and `CHECKMK_ENABLED=true` (case-sensitive) |
| "401 Unauthorized" | Check `CHECKMK_USERNAME` and `CHECKMK_PASSWORD`. Verify the user is an automation user in Checkmk. |
| "SSL handshake failed" | Set `CHECKMK_SSL_VERIFY=false` for self-signed certs, or add the CA to the system trust store |
| "Connection refused" | Verify `CHECKMK_SERVER_URL` is reachable. Test with `curl`. Check firewall rules. |
| Monitor tab not showing | The node must be linked to a Checkmk host (same hostname). Check that the integration is healthy in the Status Dashboard. |
| Empty service list | Verify the hostname in Pabawi matches the hostname in Checkmk exactly |
| Events not appearing in journal | Events are fetched live: verify Livestatus connectivity and log entries for the host in the last seven days; REST fallback provides only recent transition snapshots |
