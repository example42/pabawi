import { PuppetRunBodySchema, type PuppetRunBody } from "../services/PuppetExecution";
import type { PermissionMiddlewareFactory } from "../middleware/routeAuthorization";
import { Router, type Request, type Response, type RequestHandler } from "express";
import { z } from "zod";
import type { ExecutionTool } from "../database/ExecutionRepository";
import { type ExecutionService, ExecutionLifecycleError, type ExecutionSubmission } from "../services/ExecutionService";
import { ExecutionQueueFullError } from "../services/ExecutionQueue";
import { asyncHandler } from "./asyncHandler";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import { NodeIdParamSchema, PuppetEnvironmentSchema, PuppetTagSchema } from "../validation/commonSchemas";
import { type DIContainer, createDefaultContainer } from "../container/DIContainer";
import {
  IdempotencyConflictError,
  IdempotencyKeyError,
  RequestIdempotencyService,
} from "../services/RequestIdempotencyService";

/** Route identity the multi-node Puppet run key is scoped to. */
const PUPPET_RUN_IDEMPOTENCY_SCOPE = "POST /api/puppet-run";

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

export function createPuppetRouter(
  integrationManager: IntegrationManager,
  requirePermission: PermissionMiddlewareFactory,
  executionService: ExecutionService,
  container: DIContainer = createDefaultContainer(),
): Router {
  const router = Router();
  const logger = container.resolve("logger");
  const expertModeService = container.resolve("expertMode");

  function puppetSubmission(nodeId: string, body: PuppetRunBody, tool: ExecutionTool): ExecutionSubmission {
    const expertMode = body.expertMode ?? false;
    return {
      type: "puppet", targetNodes: [nodeId], action: "puppet_agent",
      parameters: {
        ...(body.tags ? { tags: body.tags } : {}),
        ...(body.environment ? { environment: body.environment } : {}),
        ...(body.noop ? { noop: true } : {}),
        ...(body.noNoop ? { noNoop: true } : {}),
        ...(body.debug ? { debug: true } : {}),
        ...(body.splay ? { splay: true, splayLimit: body.splayLimit } : {}),
      },
      expertMode, executionTool: tool,
    };
  }

  /**
   * Select the best available execution tool.
   */
  function selectTool(requested?: string): ExecutionTool | null {
    if (requested) return integrationManager.getExecutionTool(requested) ? requested as ExecutionTool : null;
    // Fallback priority: bolt > ansible > ssh
    for (const tool of ["bolt", "ansible", "ssh"] as const) {
      if (integrationManager.getExecutionTool(tool)) {
        return tool;
      }
    }
    return null;
  }

  const requireTool: RequestHandler = (req, res, next) => {
    const requested = z.enum(["bolt", "ansible", "ssh"]).optional().safeParse((req.body as { tool?: unknown } | undefined)?.tool);
    if (!requested.success) {
      res.status(400).json({ error: { code: "INVALID_REQUEST", message: "Invalid execution tool" } });
      return;
    }
    const tool = selectTool(requested.data) ?? requested.data ?? "bolt";
    req.body = { ...req.body as Record<string, unknown>, tool };
    requirePermission(tool, "execute")(req, res, next);
  };

  /**
   * POST /api/nodes/:id/puppet-run
   * Execute Puppet run on a single node
   */
  router.post(
    "/:id/puppet-run",
    requireTool,
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

        const userId = req.user?.userId ?? "unknown";
        const submission = puppetSubmission(nodeId, body, selectedTool);
        const admission = await executionService.submit([submission], userId, (ids) => ({
          status: 202, body: { executionId: ids[0], status: "queued", message: "Puppet run queued", tool: selectedTool },
        }));
        const responseData = admission.body as { executionId: string; status: string; message: string; tool: string };
        const { executionId } = responseData;
        const puppetCommand = submission.command;
        const duration = Date.now() - startTime;

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
        if (error instanceof ExecutionQueueFullError || error instanceof ExecutionLifecycleError) {
          res.status(503).json({ error: { code: "EXECUTION_UNAVAILABLE", message: error.message } });
          return;
        }
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
    requireTool,
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const startTime = Date.now();
      const requestId = req.id ?? expertModeService.generateRequestId();

      logger.info("Processing multi-node Puppet run request", {
        component: "PuppetRouter",
        operation: "puppet-run-multi",
      });

      try {
        const body = MultiNodePuppetRunBodySchema.parse(req.body);
        const userId = req.user?.userId ?? "unknown";
        const suppliedKey = req.get("Idempotency-Key");
        const identity = {
          userId, key: suppliedKey === undefined ? undefined : RequestIdempotencyService.validateKey(suppliedKey),
          scope: PUPPET_RUN_IDEMPOTENCY_SCOPE,
          fingerprint: RequestIdempotencyService.fingerprint(PUPPET_RUN_IDEMPOTENCY_SCOPE, body),
        };
        const replay = await executionService.replay(identity);
        if (replay) {
          res.status(replay.status).json(replay.body);
          return;
        }


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

        const submissions = body.targetNodeIds.map(nodeId => puppetSubmission(nodeId, body, selectedTool));
        const admission = await executionService.submit(submissions, userId, (ids) => ({
          status: 202, body: {
            executionIds: ids, targetCount: ids.length, status: "queued",
            message: `Puppet run queued on ${String(ids.length)} node(s)`, tool: selectedTool,
          },
        }), identity);
        const responseData = admission.body;
        const puppetCommand = submissions[0].command;

        const duration = Date.now() - startTime;

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
        if (error instanceof ExecutionQueueFullError || error instanceof ExecutionLifecycleError) {
          res.status(503).json({ error: { code: "EXECUTION_UNAVAILABLE", message: error.message } });
          return;
        }
        const duration = Date.now() - startTime;

        // An unusable or reused key is the client's to correct; neither dispatches work.
        if (error instanceof IdempotencyKeyError) {
          logger.warn("Rejected Puppet run with an unusable idempotency key", {
            component: "PuppetRouter",
            operation: "puppet-run-multi",
          });
          res.status(400).json({
            error: { code: "INVALID_IDEMPOTENCY_KEY", message: error.message },
          });
          return;
        }
        if (error instanceof IdempotencyConflictError) {
          logger.warn("Rejected Puppet run reusing an idempotency key", {
            component: "PuppetRouter",
            operation: "puppet-run-multi",
          });
          res.status(409).json({
            error: { code: "IDEMPOTENCY_KEY_CONFLICT", message: error.message },
          });
          return;
        }

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
