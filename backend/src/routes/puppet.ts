import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { ExecutionRepository, ExecutionTool } from "../database/ExecutionRepository";
import { asyncHandler } from "./asyncHandler";
import type { StreamingExecutionManager } from "../services/StreamingExecutionManager";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import type { JournalService } from "../services/journal/JournalService";
import type { CreateJournalEntry } from "../services/journal/types";
import type { LoggerService } from "../services/LoggerService";
import { NodeIdParamSchema, PuppetEnvironmentSchema, PuppetTagSchema } from "../validation/commonSchemas";
import { type DIContainer, createDefaultContainer } from "../container/DIContainer";
import type { ExecutionResult } from "../integrations/bolt/types";

const PuppetRunBodySchema = z.object({
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

type PuppetRunBody = z.infer<typeof PuppetRunBodySchema>;

const MultiNodePuppetRunBodySchema = z.object({
  targetNodeIds: z.array(z.string().min(1)).min(1, "At least one target node is required"),
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

/**
 * Build the puppet agent command string from configuration options.
 * Uses the absolute path to the puppet binary and explicitly sets --confdir
 * to the system-wide config directory. Without --confdir, puppet resolves
 * its config based on the effective uid: root → /etc/puppetlabs/puppet,
 * any other user → ~/.puppetlabs/etc/puppet (which typically doesn't exist
 * and causes fallback to compiled-in defaults like server=puppet).
 */
function buildPuppetCommand(config: PuppetRunBody): string {
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
async function recordPuppetJournal(
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

/**
 * Context for a single puppet execution against one node.
 * Used by `runPuppetOn` to encapsulate all dependencies needed for the
 * execute → update → journal → stream cycle.
 */
export interface PuppetExecutionContext {
  executionId: string;
  nodeId: string;
  puppetCommand: string;
  tool: ExecutionTool;
  body: PuppetRunBody;
  expertMode: boolean;
  userId: string;
  integrationManager: IntegrationManager;
  executionRepository: ExecutionRepository;
  journalService?: JournalService;
  streamingManager?: StreamingExecutionManager;
  logger?: LoggerService;
}

/**
 * Execute a puppet agent run on a single node, updating the execution record,
 * recording a journal entry, and emitting streaming events.
 *
 * Handles both success and failure paths:
 * - Success: updates record with result, records success/failed journal, emits complete.
 * - Error: updates record with failed status, records failed journal, emits error event.
 */

/**
 * Puppet agent exit codes:
 *   0 = run succeeded, no changes applied
 *   1 = run failed (compilation error, resource failure, etc.)
 *   2 = run succeeded, changes were applied
 *   4 = run succeeded with failures (some resources failed)
 *   6 = run succeeded with changes and failures
 *
 * Exit code 2 is NOT a failure — it indicates a successful run that made changes.
 * This function mutates the result in-place, promoting exit-code-2 node results
 * from "failed" to "success" and clearing spurious error messages.
 */
function normalizePuppetExitCodes(result: ExecutionResult): void {
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

export async function runPuppetOn(ctx: PuppetExecutionContext): Promise<void> {
  try {
    const streamingCallback = ctx.streamingManager?.createStreamingCallback(
      ctx.executionId,
      ctx.expertMode,
    );

    const result = await ctx.integrationManager.executeAction(ctx.tool, {
      type: "command",
      target: ctx.nodeId,
      action: ctx.puppetCommand,
      parameters: { sudo: true },
      metadata: { streamingCallback },
    });

    // Puppet agent exit code 2 means "run succeeded with changes applied".
    // Normalize this to success so it is not reported as a failure.
    normalizePuppetExitCodes(result);

    await ctx.executionRepository.update(ctx.executionId, {
      status: result.status,
      completedAt: result.completedAt,
      results: result.results,
      error: result.error,
      command: result.command ?? ctx.puppetCommand,
      stdout: ctx.expertMode ? result.stdout : undefined,
      stderr: ctx.expertMode ? result.stderr : undefined,
    });

    await recordPuppetJournal(
      ctx.journalService,
      ctx.nodeId,
      ctx.tool,
      ctx.body,
      result.status === "success" ? "success" : "failed",
      result.error,
      ctx.userId,
      ctx.logger,
    );

    if (ctx.streamingManager) {
      ctx.streamingManager.emitComplete(ctx.executionId, result);
    }
  } catch (error) {
    ctx.logger?.error("Error executing Puppet run", {
      component: "PuppetRouter",
      operation: "runPuppetOn",
      metadata: { executionId: ctx.executionId, nodeId: ctx.nodeId },
    }, error instanceof Error ? error : undefined);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await ctx.executionRepository.update(ctx.executionId, {
      status: "failed",
      completedAt: new Date().toISOString(),
      results: [{ nodeId: ctx.nodeId, status: "failed", error: errorMessage, duration: 0 }],
      error: errorMessage,
    });

    await recordPuppetJournal(
      ctx.journalService,
      ctx.nodeId,
      ctx.tool,
      ctx.body,
      "failed",
      errorMessage,
      ctx.userId,
      ctx.logger,
    );

    if (ctx.streamingManager) {
      ctx.streamingManager.emitError(ctx.executionId, errorMessage);
    }
  }
}

/**
 * Create Puppet router
 */
export function createPuppetRouter(
  integrationManager: IntegrationManager,
  executionRepository: ExecutionRepository,
  journalService?: JournalService,
  streamingManager?: StreamingExecutionManager,
  container: DIContainer = createDefaultContainer(),
): Router {
  const router = Router();
  const logger = container.resolve("logger");
  const expertModeService = container.resolve("expertMode");

  /**
   * Select the best available execution tool.
   */
  function selectTool(requested?: string): ExecutionTool | null {
    if (requested && integrationManager.getExecutionTool(requested)) {
      return requested as ExecutionTool;
    }
    // Fallback priority: bolt > ansible > ssh
    for (const tool of ["bolt", "ansible", "ssh"] as const) {
      if (integrationManager.getExecutionTool(tool)) {
        return tool;
      }
    }
    return null;
  }

  /**
   * POST /api/nodes/:id/puppet-run
   * Execute Puppet run on a single node
   */
  router.post(
    "/:id/puppet-run",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const requestId = req.id ?? expertModeService.generateRequestId();

      logger.info("Processing Puppet run request", {
        component: "PuppetRouter",
        operation: "puppet-run",
        metadata: { nodeId: req.params.id },
      });

      try {
        const params = NodeIdParamSchema.parse(req.params);
        const body: PuppetRunBody = PuppetRunBodySchema.parse(req.body);
        const nodeId = params.id;
        const expertMode = body.expertMode ?? false;

        // Select execution tool
        const selectedTool = selectTool(body.tool);
        if (!selectedTool) {
          res.status(503).json({
            error: {
              code: "EXECUTION_TOOL_NOT_AVAILABLE",
              message: "No execution tool available for puppet run",
            },
          });
          return;
        }

        // Verify node exists in inventory
        const aggregatedInventory = await integrationManager.getAggregatedInventory();
        const node = aggregatedInventory.nodes.find(
          (n) => n.id === nodeId || n.name === nodeId,
        );

        if (!node) {
          const duration = Date.now() - startTime;
          logger.warn("Node not found in inventory", {
            component: "PuppetRouter",
            operation: "puppet-run",
            metadata: { nodeId },
          });

          const errorResponse = {
            error: {
              code: "INVALID_NODE_ID",
              message: `Node '${nodeId}' not found in inventory`,
            },
          };

          if (req.expertMode) {
            const debugInfo = expertModeService.createDebugInfo(
              "POST /api/nodes/:id/puppet-run",
              requestId,
              duration,
            );
            expertModeService.addWarning(debugInfo, {
              message: `Node '${nodeId}' not found in inventory`,
              level: "warn",
            });
            debugInfo.performance = expertModeService.collectPerformanceMetrics();
            debugInfo.context = expertModeService.collectRequestContext(req);
            res.status(404).json(expertModeService.attachDebugInfo(errorResponse, debugInfo));
          } else {
            res.status(404).json(errorResponse);
          }
          return;
        }

        // Build puppet command for display/logging
        const puppetCommand = buildPuppetCommand(body);

        // Create initial execution record
        const executionId = await executionRepository.create({
          type: "puppet",
          targetNodes: [nodeId],
          action: "puppet_agent",
          parameters: {
            ...(body.tags ? { tags: body.tags } : {}),
            ...(body.environment ? { environment: body.environment } : {}),
            ...(body.noop ? { noop: true } : {}),
            ...(body.noNoop ? { noNoop: true } : {}),
            ...(body.debug ? { debug: true } : {}),
            ...(body.splay ? { splay: true, splayLimit: body.splayLimit } : {}),
          },
          status: "running",
          startedAt: new Date().toISOString(),
          results: [],
          expertMode,
          executionTool: selectedTool,
          command: puppetCommand,
        });

        logger.info("Execution record created, starting Puppet run", {
          component: "PuppetRouter",
          operation: "puppet-run",
          metadata: { executionId, nodeId, tool: selectedTool },
        });

        // Get user ID from request (set by auth middleware)
        const userId: string = req.user?.userId ?? "unknown";

        // Execute puppet run asynchronously via shared helper
        void runPuppetOn({
          executionId,
          nodeId,
          puppetCommand,
          tool: selectedTool,
          body,
          expertMode,
          userId,
          integrationManager,
          executionRepository,
          journalService,
          streamingManager,
          logger,
        });

        const duration = Date.now() - startTime;

        const responseData = {
          executionId,
          status: "running",
          message: "Puppet run started",
          tool: selectedTool,
        };

        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            "POST /api/nodes/:id/puppet-run",
            requestId,
            duration,
          );
          expertModeService.setIntegration(debugInfo, selectedTool);
          expertModeService.addMetadata(debugInfo, "executionId", executionId);
          expertModeService.addMetadata(debugInfo, "nodeId", nodeId);
          expertModeService.addMetadata(debugInfo, "command", puppetCommand);
          expertModeService.addMetadata(debugInfo, "tool", selectedTool);
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.status(202).json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.status(202).json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof z.ZodError) {
          logger.warn("Request validation failed", {
            component: "PuppetRouter",
            operation: "puppet-run",
            metadata: { errors: error.errors },
          });

          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Request validation failed",
              details: error.errors,
            },
          });
          return;
        }

        logger.error("Unexpected error processing Puppet run request", {
          component: "PuppetRouter",
          operation: "puppet-run",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to process Puppet run request",
          },
        });
      }
    }),
  );

  /**
   * POST /api/puppet-run
   * Execute Puppet run on multiple nodes (global action)
   */
  router.post(
    "/",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const requestId = req.id ?? expertModeService.generateRequestId();

      logger.info("Processing multi-node Puppet run request", {
        component: "PuppetRouter",
        operation: "puppet-run-multi",
      });

      try {
        const body = MultiNodePuppetRunBodySchema.parse(req.body);
        const expertMode = body.expertMode ?? false;

        // Select execution tool
        const selectedTool = selectTool(body.tool);
        if (!selectedTool) {
          res.status(503).json({
            error: {
              code: "EXECUTION_TOOL_NOT_AVAILABLE",
              message: "No execution tool available for puppet run",
            },
          });
          return;
        }

        // Validate all nodes exist
        const aggregatedInventory = await integrationManager.getAggregatedInventory();
        const validNodeIds = new Set(aggregatedInventory.nodes.map((n) => n.id));
        const invalidIds = body.targetNodeIds.filter((id) => !validNodeIds.has(id));

        if (invalidIds.length > 0) {
          res.status(400).json({
            error: {
              code: "INVALID_NODE_IDS",
              message: `Invalid node IDs: ${invalidIds.join(", ")}`,
            },
          });
          return;
        }

        const puppetCommand = buildPuppetCommand(body);
        const userId: string = req.user?.userId ?? "unknown";

        // Create execution records for each node
        const executionIds: string[] = [];
        for (const nodeId of body.targetNodeIds) {
          const executionId = await executionRepository.create({
            type: "puppet",
            targetNodes: [nodeId],
            action: "puppet_agent",
            parameters: {
              ...(body.tags ? { tags: body.tags } : {}),
              ...(body.environment ? { environment: body.environment } : {}),
              ...(body.noop ? { noop: true } : {}),
              ...(body.noNoop ? { noNoop: true } : {}),
              ...(body.debug ? { debug: true } : {}),
              ...(body.splay ? { splay: true, splayLimit: body.splayLimit } : {}),
            },
            status: "running",
            startedAt: new Date().toISOString(),
            results: [],
            expertMode,
            executionTool: selectedTool,
            command: puppetCommand,
          });
          executionIds.push(executionId);
        }

        // Execute puppet runs asynchronously for each node via shared helper
        for (let i = 0; i < body.targetNodeIds.length; i++) {
          const nodeId = body.targetNodeIds[i];
          const executionId = executionIds[i];

          void runPuppetOn({
            executionId,
            nodeId,
            puppetCommand,
            tool: selectedTool,
            body,
            expertMode,
            userId,
            integrationManager,
            executionRepository,
            journalService,
            streamingManager,
            logger,
          });
        }

        const duration = Date.now() - startTime;

        const responseData = {
          executionIds,
          targetCount: body.targetNodeIds.length,
          status: "running",
          message: `Puppet run started on ${String(body.targetNodeIds.length)} node(s)`,
          tool: selectedTool,
        };

        if (req.expertMode) {
          const debugInfo = expertModeService.createDebugInfo(
            "POST /api/puppet-run",
            requestId,
            duration,
          );
          expertModeService.setIntegration(debugInfo, selectedTool);
          expertModeService.addMetadata(debugInfo, "targetCount", body.targetNodeIds.length);
          expertModeService.addMetadata(debugInfo, "tool", selectedTool);
          expertModeService.addMetadata(debugInfo, "command", puppetCommand);
          debugInfo.performance = expertModeService.collectPerformanceMetrics();
          debugInfo.context = expertModeService.collectRequestContext(req);
          res.status(202).json(expertModeService.attachDebugInfo(responseData, debugInfo));
        } else {
          res.status(202).json(responseData);
        }
      } catch (error) {
        const duration = Date.now() - startTime;

        if (error instanceof z.ZodError) {
          logger.warn("Request validation failed", {
            component: "PuppetRouter",
            operation: "puppet-run-multi",
            metadata: { errors: error.errors },
          });

          res.status(400).json({
            error: {
              code: "INVALID_REQUEST",
              message: "Request validation failed",
              details: error.errors,
            },
          });
          return;
        }

        logger.error("Unexpected error processing multi-node Puppet run", {
          component: "PuppetRouter",
          operation: "puppet-run-multi",
          metadata: { duration },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to process Puppet run request",
          },
        });
      }
    }),
  );

  return router;
}
