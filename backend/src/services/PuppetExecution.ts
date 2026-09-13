import { z } from "zod";
import { PuppetEnvironmentSchema, PuppetTagSchema } from "../validation/commonSchemas";
import type { JournalService } from "./journal/JournalService";
import type { CreateJournalEntry } from "./journal/types";
import type { LoggerService } from "./LoggerService";
import type { ExecutionResult } from "../integrations/bolt/types";

export const PuppetRunBodySchema = z.object({
  tags: z.array(PuppetTagSchema).optional(),
  environment: PuppetEnvironmentSchema.optional(),
  noop: z.boolean().optional(),
  noNoop: z.boolean().optional(),
  debug: z.boolean().optional(),
  splay: z.boolean().optional(),
  splayLimit: z.number().int().min(1).max(600).optional(),
  expertMode: z.boolean().optional(),
  tool: z.enum(["bolt", "ansible", "ssh"]).optional(),
});

export type PuppetRunBody = z.infer<typeof PuppetRunBodySchema>;

/**
 * Build the puppet agent command string from configuration options.
 * Uses the absolute path to the puppet binary and explicitly sets --confdir
 * to the system-wide config directory. Without --confdir, puppet resolves
 * its config based on the effective uid: root → /etc/puppetlabs/puppet,
 * any other user → ~/.puppetlabs/etc/puppet (which typically doesn't exist
 * and causes fallback to compiled-in defaults like server=puppet).
 */
export function buildPuppetCommand(config: PuppetRunBody): string {
  const parts = [
    "env", "PATH=/opt/puppetlabs/bin:$PATH", "puppet",
    "agent", "-t",
    "--confdir", "/etc/puppetlabs/puppet",
  ];

  if (config.noop) {
    parts.push("--noop");
  }

  if (config.noNoop) {
    parts.push("--no-noop");
  }

  if (config.environment) {
    parts.push("--environment", config.environment);
  }

  if (config.tags && config.tags.length > 0) {
    parts.push("--tags", config.tags.join(","));
  }

  if (config.debug) {
    parts.push("--debug");
  }

  if (config.splay && config.splayLimit) {
    const splaySeconds = Math.floor(Math.random() * config.splayLimit);
    parts.push("--splay", "--splaylimit", String(splaySeconds));
  }

  return parts.join(" ");
}

/**
 * Record a puppet run journal entry for a node.
 */
export async function recordPuppetJournal(
  journalService: JournalService | undefined,
  nodeId: string,
  tool: string,
  config: PuppetRunBody,
  status: "success" | "failed" | "partial",
  error?: string,
  userId?: string,
  logger?: LoggerService,
): Promise<void> {
  if (!journalService) return;

  const entry: CreateJournalEntry = {
    nodeId,
    nodeUri: `${tool}:${nodeId}`,
    eventType: "puppet_run",
    source: tool as "bolt" | "ansible" | "ssh",
    action: "puppet_agent",
    summary: status === "success"
      ? `Puppet agent run succeeded on ${nodeId}`
      : `Puppet agent run failed on ${nodeId}${error ? `: ${error}` : ""}`,
    details: {
      status,
      tool,
      ...(config.environment ? { environment: config.environment } : {}),
      ...(config.noop ? { noop: true } : {}),
      ...(config.noNoop ? { noNoop: true } : {}),
      ...(config.debug ? { debug: true } : {}),
      ...(config.tags && config.tags.length > 0 ? { tags: config.tags } : {}),
      ...(config.splay ? { splay: true, splayLimit: config.splayLimit } : {}),
      ...(error ? { error } : {}),
    },
    userId: userId ?? null,
  };

  try {
    await journalService.recordEvent(entry);
  } catch (err) {
    logger?.error("Failed to record puppet run journal entry", {
      component: "PuppetRouter",
      operation: "recordJournal",
      metadata: { nodeId, error: err instanceof Error ? err.message : String(err) },
    });
  }
}

export function normalizePuppetExitCodes(result: ExecutionResult): void {
  let anyNormalized = false;

  for (const nodeResult of result.results) {
    if (
      nodeResult.status === "failed"
      && nodeResult.output?.exitCode === 2
    ) {
      nodeResult.status = "success";
      // Clear the error that was generated solely from the non-zero exit code
      if (nodeResult.error && /exit code 2/i.test(nodeResult.error)) {
        nodeResult.error = undefined;
      }
      anyNormalized = true;
    }
  }

  if (anyNormalized) {
    // Recalculate overall status
    const failedCount = result.results.filter(r => r.status === "failed").length;
    if (failedCount === 0) {
      result.status = "success";
      result.error = undefined;
    } else if (failedCount < result.results.length) {
      result.status = "partial";
    }
  }
}

