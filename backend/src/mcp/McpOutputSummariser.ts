/**
 * MCP Output Summarisation Helpers
 *
 * Transforms verbose service responses into compact, LLM-friendly output.
 * Strips large, duplicated, or low-value fields while preserving the
 * information an AI consumer actually needs to reason about infrastructure.
 */

/* ------------------------------------------------------------------ */
/*  Type utility                                                       */
/* ------------------------------------------------------------------ */

/**
 * Safely converts a typed object to Record<string, unknown> for generic
 * field access in summarisation functions. This is safe because all inputs
 * are plain data objects from service calls (no class instances with methods).
 */
function toRecord(obj: object): Record<string, unknown> {
  return obj as Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/*  Facts summarisation                                                */
/* ------------------------------------------------------------------ */

/**
 * Essential top-level fact keys that are useful for an LLM consumer.
 * Everything else (docker internals, mountpoints, ssh host keys,
 * legacy flat facts from Bolt, etc.) is noise.
 */
const ESSENTIAL_FACT_KEYS = new Set([
  'os', 'processors', 'memory', 'networking', 'kernel',
  'system_uptime', 'virtual', 'is_virtual', 'identity',
  'timezone', 'filesystems', 'disks', 'partitions',
  'load_averages', 'architecture', 'fqdn', 'hostname',
  'domain', 'kernelrelease', 'uptime', 'mountpoints',
  'trusted',
]);

/**
 * Keys that are always stripped — they are huge and rarely useful.
 */
const STRIPPED_FACT_KEYS = new Set([
  'categories',       // Duplicated structured view of other facts (~22 KB)
  'docker',           // Full Docker daemon info (~11 KB)
  'docker_version',   // Verbose Docker version blob (~1 KB)
  'ssh',              // SSH host key material (~1 KB)
  'sshecdsakey', 'sshed25519key', 'sshrsakey',
  'sshfp_ecdsa', 'sshfp_ed25519', 'sshfp_rsa',
  'ruby',             // Ruby runtime details
  'path',             // $PATH string
  'augeas',           // Augeas version
]);

/** Strip a single source's facts down to essentials. */
function summariseFacts(
  facts: Record<string, unknown>,
  includeAll: boolean,
): Record<string, unknown> {
  if (includeAll) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(facts)) {
      if (!STRIPPED_FACT_KEYS.has(k)) {
        result[k] = v;
      }
    }
    return result;
  }

  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(facts)) {
    if (ESSENTIAL_FACT_KEYS.has(k)) {
      result[k] = v;
    }
  }
  return result;
}

/**
 * Deduplicate and summarise facts from multiple integration sources.
 * PuppetDB and Hiera often return identical data — only sources with
 * actual data are included.
 */
export function deduplicateFactSources(
  factsBySource: Record<string, { facts: Record<string, unknown>; [k: string]: unknown }>,
  includeAll: boolean,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [source, data] of Object.entries(factsBySource)) {
    const rawFacts = data.facts;
    const summarised = summariseFacts(rawFacts, includeAll);

    if (Object.keys(summarised).length > 0) {
      result[source] = {
        source,
        gatheredAt: data.gatheredAt,
        facts: summarised,
      };
    }
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Report summarisation                                               */
/* ------------------------------------------------------------------ */

/** Statuses that represent actionable resource changes. */
const ACTIONABLE_EVENT_STATUSES = new Set(['failure', 'success']);

/** Compact a resource event to the fields an LLM actually needs. */
function compactEvent(event: Record<string, unknown>): Record<string, unknown> {
  return {
    status: event.status,
    resource_type: event.resource_type,
    resource_title: event.resource_title,
    message: event.message,
    file: event.file,
    line: event.line,
    containing_class: event.containing_class,
    ...(event.property ? { property: event.property } : {}),
    ...(event.old_value !== undefined && event.old_value !== '' ? { old_value: event.old_value } : {}),
    ...(event.new_value !== undefined && event.new_value !== '' ? { new_value: event.new_value } : {}),
    ...(event.corrective_change ? { corrective_change: event.corrective_change } : {}),
  };
}

/**
 * Summarise a Puppet report.
 *
 * Default mode keeps failed/success resource events (the actionable ones)
 * and drops noop/skipped events and full logs.  The consumer still sees
 * what changed or broke without wading through 30+ noop entries.
 */
export function summariseReport(
  reportObj: object,
  includeDetails: boolean,
): Record<string, unknown> {
  const report = toRecord(reportObj);
  if (includeDetails) return report;

  const {
    logs: _logs,
    resource_events: _events,
    transaction_uuid: _uuid,
    report_format: _fmt,
    receive_time: _recv,
    configuration_version: _confVer,
    ...summary
  } = report;

  // Condense metrics.time to just total
  if (summary.metrics && typeof summary.metrics === 'object') {
    const metrics = summary.metrics as Record<string, unknown>;
    if (metrics.time && typeof metrics.time === 'object') {
      const time = metrics.time as Record<string, number>;
      metrics.time = { total: time.total };
    }
  }

  // Keep only actionable resource events (failed / success)
  const allEvents = Array.isArray(_events) ? _events as Record<string, unknown>[] : [];
  const actionable = allEvents
    .filter((e) => ACTIONABLE_EVENT_STATUSES.has(String(e.status)))
    .map(compactEvent);

  const noopCount = allEvents.filter((e) => e.status === 'noop').length;
  const skippedCount = allEvents.filter((e) => e.status === 'skipped').length;

  (summary).resource_events = actionable;
  (summary).event_counts = {
    total: allEvents.length,
    failure: actionable.filter((e) => e.status === 'failure').length,
    success: actionable.filter((e) => e.status === 'success').length,
    noop: noopCount,
    skipped: skippedCount,
  };

  // Log count only — full logs are still stripped (mostly noise)
  const logs = Array.isArray(_logs) ? _logs as Record<string, unknown>[] : [];
  (summary).log_count = logs.length;

  return summary;
}

/* ------------------------------------------------------------------ */
/*  Catalog summarisation                                              */
/* ------------------------------------------------------------------ */

/** Summarise a catalog — strip resource parameters by default. */
export function summariseCatalog(
  catalogObj: object,
  includeParameters: boolean,
): Record<string, unknown> {
  const catalog = toRecord(catalogObj);
  if (includeParameters) return catalog;

  const result = { ...catalog };

  if (Array.isArray(result.resources)) {
    result.resources = (result.resources as Record<string, unknown>[]).map((r) => ({
      type: r.type,
      title: r.title,
      file: r.file,
      line: r.line,
      exported: r.exported,
    }));
  }

  return result;
}

/* ------------------------------------------------------------------ */
/*  Inventory summarisation                                            */
/* ------------------------------------------------------------------ */

/** Summarise an inventory node — strip config (connection details). */
export function summariseNode(nodeObj: object): Record<string, unknown> {
  const node = toRecord(nodeObj);
  return {
    id: node.id,
    name: node.name,
    uri: node.uri,
    transport: node.transport,
    source: node.source,
    certificateStatus: node.certificateStatus,
  };
}

/* ------------------------------------------------------------------ */
/*  Execution summarisation                                            */
/* ------------------------------------------------------------------ */

/** Summarise an execution record — strip per-node results and raw output. */
export function summariseExecution(
  execObj: object,
  includeOutput: boolean,
): Record<string, unknown> {
  const exec = toRecord(execObj);
  if (includeOutput) return exec;

  const {
    results: rawResults,
    stdout: _stdout,
    stderr: _stderr,
    parameters: _params,
    ...summary
  } = exec;

  if (Array.isArray(rawResults)) {
    const results = rawResults as { status?: string }[];
    const succeeded = results.filter((r) => r.status === 'success').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    (summary).result_summary = {
      total: results.length,
      succeeded,
      failed,
    };
  }

  return summary;
}

/* ------------------------------------------------------------------ */
/*  Journal summarisation                                              */
/* ------------------------------------------------------------------ */

/** Summarise a journal entry — strip verbose details. */
export function summariseJournalEntry(entryObj: object): Record<string, unknown> {
  const entry = toRecord(entryObj);
  const { details: _details, ...summary } = entry;

  if (_details && typeof _details === 'object') {
    const d = _details as Record<string, unknown>;
    if (d.status) {
      (summary).status = d.status;
    }
  }

  return summary;
}

/* ------------------------------------------------------------------ */
/*  Checkmk service summarisation                                      */
/* ------------------------------------------------------------------ */

/** State number → human-readable name for MCP output. */
const SERVICE_STATE_NAMES: Record<number, string> = {
  0: 'OK',
  1: 'WARN',
  2: 'CRIT',
  3: 'UNKNOWN',
};

/** Summarise a Checkmk service status for LLM consumption. */
export function summariseService(serviceObj: object): Record<string, unknown> {
  const svc = toRecord(serviceObj);
  return {
    description: svc.description,
    state: SERVICE_STATE_NAMES[svc.state as number] ?? `UNKNOWN(${String(svc.state)})`,
    pluginOutput: svc.pluginOutput,
    lastCheck: svc.lastCheck,
  };
}
