import fs from "node:fs";
import path from "node:path";
import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";
import type { LoggerService } from "../services/LoggerService";

/**
 * Process-level crash handlers + request ring buffer.
 *
 * Captures uncaughtException / unhandledRejection with a synchronous crash dump
 * (recent + in-flight requests, memory, event-loop lag, optional Node diagnostic
 * report) so a supervisor restart leaves forensic evidence behind.
 *
 * Dump directory: PABAWI_CRASH_DUMP_DIR env var, else <cwd>/crash-dumps.
 */

interface RequestRecord {
  ts: string;
  requestId?: string;
  method: string;
  path: string;
  userId?: string;
  statusCode?: number;
  durationMs?: number;
}

const MAX_RECENT = 200;
const recent: RequestRecord[] = [];
const inflight = new Map<string, RequestRecord>();

let eventLoopMonitor: IntervalHistogram | undefined;
let installed = false;

function inflightKey(rec: RequestRecord): string {
  return rec.requestId ?? `${rec.method}-${rec.path}-${String(Date.now())}-${String(Math.random())}`;
}

export function recordRequestStart(rec: RequestRecord): string {
  const key = inflightKey(rec);
  inflight.set(key, rec);
  return key;
}

export function recordRequestFinish(
  key: string,
  statusCode: number,
  durationMs: number,
  userId?: string,
): void {
  const rec = inflight.get(key);
  if (!rec) return;
  inflight.delete(key);
  rec.statusCode = statusCode;
  rec.durationMs = durationMs;
  if (userId) rec.userId = userId;
  recent.push(rec);
  if (recent.length > MAX_RECENT) recent.shift();
}

function resolveDumpDir(): string {
  return process.env.PABAWI_CRASH_DUMP_DIR ?? path.join(process.cwd(), "crash-dumps");
}

function writeCrashDump(reason: string, error: unknown): string | null {
  try {
    const dir = resolveDumpDir();
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(dir, `crash-${stamp}-${String(process.pid)}.json`);
    const dump = {
      timestamp: new Date().toISOString(),
      pid: process.pid,
      reason,
      error: error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : { value: String(error) },
      uptimeSec: process.uptime(),
      nodeVersion: process.version,
      memory: process.memoryUsage(),
      resourceUsage: typeof process.resourceUsage === "function" ? process.resourceUsage() : null,
      eventLoopDelayMs: eventLoopMonitor
        ? {
            mean: eventLoopMonitor.mean / 1e6,
            max: eventLoopMonitor.max / 1e6,
            p99: eventLoopMonitor.percentile(99) / 1e6,
          }
        : null,
      inflightRequests: Array.from(inflight.values()),
      recentRequests: recent.slice(),
    };
    fs.writeFileSync(file, JSON.stringify(dump, null, 2));

    // Best-effort native diagnostic report (heap, native stacks, libuv state)
    try {
      if (typeof process.report.writeReport === "function") {
        process.report.writeReport(path.join(dir, `report-${stamp}-${String(process.pid)}.json`));
      }
    } catch {
      // ignore — diagnostic report is best-effort
    }
    return file;
  } catch {
    return null;
  }
}

/**
 * Install global crash handlers. Idempotent — safe to call once at boot.
 * Pass the shared LoggerService so fatal events appear in the normal log stream
 * in addition to the on-disk dump.
 */
export function installCrashHandlers(logger: LoggerService): void {
  if (installed) return;
  installed = true;

  try {
    eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
    eventLoopMonitor.enable();
  } catch {
    // perf_hooks not available — non-fatal
  }

  process.on("uncaughtException", (err, origin) => {
    const file = writeCrashDump(`uncaughtException (${origin})`, err);
    logger.error(
      `FATAL uncaughtException [${origin}]: ${err.message}${file ? ` (dump: ${file})` : ""}`,
      {
        component: "Process",
        operation: "uncaughtException",
        metadata: { origin, dumpFile: file },
      },
      err,
    );
    // Give the logger a brief window to flush, then exit so the supervisor restarts us.
    setTimeout(() => { process.exit(1); }, 1000).unref();
  });

  process.on("unhandledRejection", (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    const file = writeCrashDump("unhandledRejection", err);
    logger.error(
      `FATAL unhandledRejection: ${err.message}${file ? ` (dump: ${file})` : ""}`,
      {
        component: "Process",
        operation: "unhandledRejection",
        metadata: { dumpFile: file },
      },
      err,
    );
    setTimeout(() => { process.exit(1); }, 1000).unref();
  });

  process.on("warning", (w: Error) => {
    logger.warn(`process warning: ${w.name}: ${w.message}`, {
      component: "Process",
      operation: "warning",
      metadata: { name: w.name, stack: w.stack },
    });
  });

  logger.info(`Crash handlers installed — dumps will be written to ${resolveDumpDir()}`, {
    component: "Process",
    operation: "installCrashHandlers",
  });
}
