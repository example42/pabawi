# Pabawi

Infrastructure management web UI. A monorepo whose backend exposes a unified view over many infrastructure integrations (Bolt, PuppetDB, Puppetserver, Hiera, Ansible, SSH, AWS, Azure, Proxmox, and Checkmk) via a plugin system, and a Svelte SPA frontend.

## Language

### Checkmk integration

**Checkmk_Plugin**:
The Pabawi `InformationSourcePlugin` that reads monitoring data from a Checkmk site.

**Service**:
A single monitored check on a Checkmk host (e.g. "CPU load"), carrying a current **Service_State**.

**Service_State**:
The numeric monitoring state of a **Service**: 0 OK, 1 WARN, 2 CRIT, 3 UNKNOWN.

**State Change Event**:
A transition of a **Service** from one **Service_State** to another at a point in time. In Pabawi this is *not* a Checkmk Event Console event — it is a service state transition.
_Avoid_: "Event" unqualified (collides with Checkmk's Event Console, which is a different, log/trap-based concept this integration does not use).

**REST source**:
The Checkmk REST API v1 (`{serverUrl}/{site}/check_mk/api/1.0`, Bearer-authed over HTTPS). Source of host inventory and live **Service** status. Can also yield the *single most recent* **State Change Event** per service via the `last_state`/`state`/`last_state_change` columns.

**Livestatus source**:
The Checkmk Livestatus `log` table reached over TCP (default 6557). Source of *full* **State Change Event** history (multiple events per service over a time window). Optional and secondary to the **REST source**.

**Monitor_Tab**:
The node-detail-page tab that displays live **Service** status grouped by **Service_State**.

## Relationships

- A **Checkmk_Plugin** discovers hosts and live **Service** status from the **REST source**.
- **State Change Events** come from the **Livestatus source** when it is configured and reachable; otherwise the **Checkmk_Plugin** falls back to the **REST source**'s last-transition-per-service.
- A Checkmk host links to a Pabawi node by hostname (case-insensitive), via the existing NodeLinkingService.

## Flagged ambiguities

- "Event" was used in the original spec to mean a Checkmk Event Console event, but the data actually wanted is a **service state transition**. Resolved: the integration sources state transitions (REST `last_state`→`state`, or Livestatus `log` class=1 alerts), and does not use the Event Console.
