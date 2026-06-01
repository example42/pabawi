# Checkmk state-change events: Livestatus primary, REST fallback

## Status

accepted

## Context

The Checkmk integration must surface service state-change events live (no local DB persistence). The original spec fetched them from `GET /domain-types/historical_event/collections/all`, but that domain type does not exist in the Checkmk REST API v1. The real options are: the REST service-status response (`last_state`/`state`/`last_state_change` columns, which yields only the *single latest* transition per service), or the Livestatus `log` table (class=1 alerts, which yields full multi-event history but requires a separate transport).

## Decision

Use the **Livestatus `log` table** (over TCP, default port 6557) as the primary source of state-change events when a Livestatus endpoint is configured and reachable. When it is not configured or not reachable, **fall back** to synthesizing the latest transition per service from the REST service-status response (`last_state` → `state` at `last_state_change`).

The REST API remains the sole source of host inventory and live service status, and the plugin's health is tied to the REST transport only — Livestatus unavailability degrades silently to the REST fallback and never marks the plugin unhealthy.

## Consequences

- Two transports: HTTPS+Bearer (REST) and raw LQL over TCP (Livestatus). Livestatus has no native auth and, classically, no TLS — it requires the operator to enable `LIVESTATUS_TCP` and secure the port at the network/stunnel layer. The spec's auth/SSL requirements (Bearer, `CHECKMK_SSL_VERIFY`) cover only the REST channel; the Livestatus channel needs its own config (`CHECKMK_LIVESTATUS_*`) and security story.
- Event fidelity depends on deployment: full history where Livestatus is reachable, latest-transition-only where it is not. The Monitor/journal UI must not assume completeness.
