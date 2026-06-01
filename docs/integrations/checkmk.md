# Checkmk Integration

Pabawi connects to Checkmk to provide live monitoring data: host inventory, service status, and state-change events. All data is fetched live on each request — no caching.

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
| `CHECKMK_SERVER_URL` | When enabled | — | Base URL of the Checkmk server (e.g. `https://checkmk.example.com`). Must start with `http://` or `https://`. |
| `CHECKMK_SITE` | When enabled | — | Checkmk site name (appears in the URL path) |
| `CHECKMK_USERNAME` | When enabled | — | Automation user name |
| `CHECKMK_PASSWORD` | When enabled | — | Automation user secret/password |
| `CHECKMK_SSL_VERIFY` | No | `true` | Set to `"false"` to skip TLS certificate verification (for self-signed certs) |

## What It Provides

| Feature | Details |
|---|---|
| **Inventory** | Hosts from Checkmk (priority 8), merged into unified inventory |
| **Service monitoring** | Live status of all services on a node (OK, WARN, CRIT, UNKNOWN) |
| **State-change events** | Historical events from the Event Console, shown in the Monitor tab and node journal |
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

Checkmk state-change events appear in the node journal timeline alongside events from other sources. Events are fetched from:

```
GET /{site}/check_mk/api/1.0/domain-types/historical_event/collections/all
```

Events are filtered by hostname, limited to the last 7 days and 500 entries maximum.

## Authentication

Checkmk uses Bearer authentication with the format:

```
Authorization: Bearer {username} {password}
```

The automation user must have sufficient permissions to read hosts, services, and events via the REST API. In Checkmk, this typically means the user needs the "Can use the REST API" permission and read access to the relevant hosts/services.

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

The Checkmk integration exposes two API endpoints:

| Method | Path | Description |
|---|---|---|
| GET | `/api/nodes/:nodeId/services` | Live service monitoring status |
| GET | `/api/nodes/:nodeId/monitoring-events` | State-change events (supports `?limit=N`, default 200, max 1000) |

Both endpoints require JWT authentication and the `monitoring:read` RBAC permission.

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
| Events not appearing in journal | Events are fetched live — check that the Event Console has entries for the host in the last 7 days |
