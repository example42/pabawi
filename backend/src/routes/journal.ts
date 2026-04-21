import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { ZodError } from "zod";
import { asyncHandler } from "./asyncHandler";
import { JournalService } from "../services/journal/JournalService";
import {
  collectExecutionEntries,
  collectPuppetDBEntries,
  collectProxmoxTaskEntries,
  collectAWSStateEntry,
  collectGlobalExecutionEntries,
  collectGlobalPuppetDBEntries,
  type PuppetDBLike,
  type AWSServiceLike,
} from "../services/journal/JournalCollectors";
import type { ProxmoxIntegration } from "../integrations/proxmox/ProxmoxIntegration";
import type { AWSPlugin } from "../integrations/aws/AWSPlugin";
import { JournalEventTypeSchema, JournalSourceSchema } from "../services/journal/types";
import type { IntegrationManager } from "../integrations/IntegrationManager";
import type { DatabaseService } from "../database/DatabaseService";
import { LoggerService } from "../services/LoggerService";
import { sendValidationError, ERROR_CODES } from "../utils/errorHandling";
import { createAuthMiddleware } from "../middleware/authMiddleware";
import { createRbacMiddleware } from "../middleware/rbacMiddleware";

const logger = new LoggerService();

/**
 * Zod schema for timeline query parameters
 */
const TimelineQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * Zod schema for adding a manual note
 */
const AddNoteSchema = z.object({
  content: z.string().min(1, "Note content is required").max(5000),
});

/**
 * Zod schema for search query parameters
 */
const SearchQuerySchema = z.object({
  q: z.string().min(1, "Search query is required"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * Helper: transform a comma-separated string of enum values into an array.
 * Accepts a single value or comma-separated list, validates each against the enum.
 */
function csvToEnumArray<T extends z.ZodEnum<[string, ...string[]]>>(
  schema: T,
): z.ZodEffects<z.ZodString, z.infer<T>[]> {
  return z.string().transform((val, ctx) => {
    const items = val.split(",").map((s) => s.trim()).filter(Boolean);
    const results: z.infer<T>[] = [];
    for (const item of items) {
      const parsed = schema.safeParse(item);
      if (!parsed.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid value: ${item}` });
        return z.NEVER;
      }
      results.push(parsed.data as z.infer<T>);
    }
    return results;
  });
}

/**
 * Zod schema for global stream query parameters
 */
const GlobalStreamQuerySchema = z.object({
  nodeIds: z.string().optional(),
  groupId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  eventType: csvToEnumArray(JournalEventTypeSchema).optional(),
  source: csvToEnumArray(JournalSourceSchema).optional(),
});

/**
 * Zod schema for node stream query parameters
 * Supports the same source/eventType/date filters as the global stream.
 */
const NodeStreamQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  eventType: csvToEnumArray(JournalEventTypeSchema).optional(),
  source: csvToEnumArray(JournalSourceSchema).optional(),
});

export interface JournalRouterDeps {
  puppetdb?: PuppetDBLike;
  integrationManager?: IntegrationManager;
}

/**
 * Create journal routes
 *
 * Requirements: 22.4, 23.1, 24.1, 27.3
 */
export function createJournalRouter(
  databaseService: DatabaseService,
  deps: JournalRouterDeps = {},
): Router {
  const router = Router();
  const journalService = new JournalService(databaseService.getAdapter());
  const authMiddleware = createAuthMiddleware(databaseService.getAdapter());
  const rbacMiddleware = createRbacMiddleware(databaseService.getAdapter());
  const db = databaseService.getAdapter();

  /**
   * GET /api/journal/search
   * Search journal entries across summary and details
   *
   * Requirements: 24.1
   */
  router.get(
    "/search",
    asyncHandler(authMiddleware),
    asyncHandler(rbacMiddleware("journal", "read")),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      logger.info("Processing journal search request", {
        component: "JournalRouter",
        operation: "searchEntries",
        metadata: { userId: req.user?.userId },
      });

      try {
        const validatedQuery = SearchQuerySchema.parse(req.query);

        const entries = await journalService.searchEntries(validatedQuery.q, {
          limit: validatedQuery.limit,
          offset: validatedQuery.offset,
        });

        res.status(200).json({ entries });
      } catch (error) {
        if (error instanceof ZodError) {
          logger.warn("Journal search validation failed", {
            component: "JournalRouter",
            operation: "searchEntries",
            metadata: { errors: error.errors },
          });
          sendValidationError(res, error);
          return;
        }

        logger.error("Journal search failed", {
          component: "JournalRouter",
          operation: "searchEntries",
          metadata: { userId: req.user?.userId },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to search journal entries",
          },
        });
      }
    })
  );

  /**
   * GET /api/journal/global/stream
   * Stream journal events via SSE across all nodes.
   * Supports filtering by nodeIds, groupId, eventType, source, and date range.
   *
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8
   */
  router.get(
    "/global/stream",
    asyncHandler(authMiddleware),
    asyncHandler(rbacMiddleware("journal", "read")),
    (req: Request, res: Response): void => {
      const parsed = GlobalStreamQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: "Invalid query parameters",
            details: parsed.error.errors,
          },
        });
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      function send(eventName: string, data: unknown): void {
        if (res.writableEnded) return;
        res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
      }

      const heartbeat = setInterval(() => {
        if (!res.writableEnded) res.write(": heartbeat\n\n");
      }, 25000);

      req.on("close", () => { clearInterval(heartbeat); });

      const query = parsed.data;

      void (async (): Promise<void> => {
        try {
          // Resolve groupId to nodeIds if provided
          let nodeIds: string[] | undefined;
          if (query.nodeIds) {
            nodeIds = query.nodeIds.split(",").map((s) => s.trim()).filter(Boolean);
          }

          if (query.groupId && deps.integrationManager) {
            const inventory = await deps.integrationManager.getAggregatedInventory();
            const group = inventory.groups.find((g) => g.id === query.groupId);
            if (!group) {
              send("source_error", { source: "global", message: "Group not found" });
              clearInterval(heartbeat);
              send("complete", {});
              res.end();
              return;
            }
            nodeIds = group.nodes;
          }

          // Determine active sources
          const activeSources: string[] = ["journal", "executions"];
          if (deps.puppetdb?.isInitialized()) activeSources.push("puppetdb");

          send("init", { sources: activeSources });

          const tasks: Promise<void>[] = [];

          // Source 1: stored journal entries (DB)
          const journalFilters = {
            nodeIds,
            eventType: query.eventType,
            source: query.source,
            startDate: query.startDate,
            endDate: query.endDate,
            limit: 200,
          };

          tasks.push(
            journalService
              .getGlobalTimeline(journalFilters)
              .then((entries) => { send("batch", { source: "journal", entries }); })
              .catch(() => { send("source_error", { source: "journal", message: "Failed to load journal entries" }); }),
          );

          // Source 2: execution history (commands, tasks, puppet runs, ansible)
          // Skip if source filter excludes execution-related sources
          const execSources = new Set(["bolt", "ansible", "ssh"]);
          const execEventTypes = new Set(["command_execution", "task_execution", "puppet_run", "package_install"]);
          const skipExecBySource = query.source !== undefined && !query.source.some((s) => execSources.has(s));
          const skipExecByType = query.eventType !== undefined && !query.eventType.some((t) => execEventTypes.has(t));

          if (!skipExecBySource && !skipExecByType) {
            tasks.push(
              collectGlobalExecutionEntries(db, 100, {
                nodeIds,
                startDate: query.startDate,
                endDate: query.endDate,
              })
                .then((entries) => { send("batch", { source: "executions", entries }); })
                .catch(() => { send("source_error", { source: "executions", message: "Failed to load execution history" }); }),
            );
          }

          // Source 3: PuppetDB reports (if configured)
          // Skip if source filter excludes puppetdb or event type excludes puppet_run
          const skipPuppetBySource = query.source !== undefined && !query.source.includes("puppetdb");
          const skipPuppetByType = query.eventType !== undefined && !query.eventType.includes("puppet_run");

          if (deps.puppetdb?.isInitialized() && !skipPuppetBySource && !skipPuppetByType) {
            tasks.push(
              collectGlobalPuppetDBEntries(deps.puppetdb, nodeIds, 50)
                .then((entries) => { send("batch", { source: "puppetdb", entries }); })
                .catch(() => { send("source_error", { source: "puppetdb", message: "Failed to load PuppetDB reports" }); }),
            );
          }

          await Promise.all(tasks);
        } catch (error) {
          logger.error("Global journal stream failed", {
            component: "JournalRouter",
            operation: "globalStream",
          }, error instanceof Error ? error : undefined);
          send("source_error", { source: "journal", message: "Failed to load global journal entries" });
        } finally {
          clearInterval(heartbeat);
          if (!res.writableEnded) {
            send("complete", {});
            res.end();
          }
        }
      })();
    },
  );

  /**
   * GET /api/journal/:nodeId/stream
   * Stream journal events via SSE as each source responds.
   * Sources: stored journal entries, pabawi execution history, PuppetDB reports.
   * Supports filtering by eventType, source, and date range.
   *
   * Uses fetch-based SSE on the client (not EventSource) so the Authorization
   * header is sent normally.
   */
  router.get(
    "/:nodeId/stream",
    asyncHandler(authMiddleware),
    asyncHandler(rbacMiddleware("journal", "read")),
    (req: Request, res: Response): void => {
      const { nodeId } = req.params;

      const parsed = NodeStreamQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: ERROR_CODES.VALIDATION_ERROR,
            message: "Invalid query parameters",
            details: parsed.error.errors,
          },
        });
        return;
      }

      const query = parsed.data;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      function send(eventName: string, data: unknown): void {
        if (res.writableEnded) return;
        res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
      }

      // Heartbeat to prevent proxies from closing idle connections
      const heartbeat = setInterval(() => {
        if (!res.writableEnded) res.write(": heartbeat\n\n");
      }, 25000);

      req.on("close", () => { clearInterval(heartbeat); });

      void (async (): Promise<void> => {
        const activeSources: string[] = ["journal", "executions"];
        if (deps.puppetdb?.isInitialized()) activeSources.push("puppetdb");

        // Detect integration source for additional collectors
        if (deps.integrationManager) {
          try {
            const inventory = await deps.integrationManager.getAggregatedInventory();
            const node = inventory.nodes.find((n) => n.id === nodeId);

            if (node?.source === "proxmox" || nodeId.startsWith("proxmox:")) {
              const proxmoxPlugin = deps.integrationManager.getExecutionTool("proxmox") as ProxmoxIntegration | null;
              if (proxmoxPlugin?.getClient()) {
                activeSources.push("proxmox_tasks");
              }
            }

            if (node?.source === "aws" || nodeId.startsWith("aws:")) {
              const awsPlugin = deps.integrationManager.getExecutionTool("aws") as AWSPlugin | null;
              if (awsPlugin?.isInitialized()) {
                activeSources.push("aws_states");
              }
            }
          } catch {
            // Continue without additional sources
          }
        }

        send("init", { sources: activeSources });

        const tasks: Promise<void>[] = [];

        // Source 1: stored journal entries (DB) — pass filters through
        tasks.push(
          journalService
            .getNodeTimeline(nodeId, {
              limit: 100,
              offset: 0,
              eventType: query.eventType,
              source: query.source,
              startDate: query.startDate,
              endDate: query.endDate,
            })
            .then((entries) => { send("batch", { source: "journal", entries }); })
            .catch(() => { send("source_error", { source: "journal", message: "Failed to load journal entries" }); }),
        );

        // Source 2: pabawi execution history
        // Skip if source filter excludes execution-related sources
        const execSources = new Set(["bolt", "ansible", "ssh"]);
        const execEventTypes = new Set(["command_execution", "task_execution", "puppet_run", "package_install"]);
        const skipExecBySource = query.source !== undefined && !query.source.some((s) => execSources.has(s));
        const skipExecByType = query.eventType !== undefined && !query.eventType.some((t) => execEventTypes.has(t));

        if (!skipExecBySource && !skipExecByType) {
          tasks.push(
            collectExecutionEntries(db, nodeId, 50)
              .then((entries) => { send("batch", { source: "executions", entries }); })
              .catch(() => { send("source_error", { source: "executions", message: "Failed to load execution history" }); }),
          );
        }

        // Source 3: PuppetDB reports (if configured)
        // Skip if source filter excludes puppetdb or event type excludes puppet_run
        const skipPuppetBySource = query.source !== undefined && !query.source.includes("puppetdb");
        const skipPuppetByType = query.eventType !== undefined && !query.eventType.includes("puppet_run");

        if (deps.puppetdb?.isInitialized() && !skipPuppetBySource && !skipPuppetByType) {
          tasks.push(
            collectPuppetDBEntries(deps.puppetdb, nodeId, 25)
              .then((entries) => { send("batch", { source: "puppetdb", entries }); })
              .catch(() => { send("source_error", { source: "puppetdb", message: "Failed to load PuppetDB reports" }); }),
          );
        }

        // Source 4: Proxmox task history (if node belongs to Proxmox)
        // Skip if source filter excludes proxmox
        const skipProxmoxBySource = query.source !== undefined && !query.source.includes("proxmox");
        if (activeSources.includes("proxmox_tasks") && !skipProxmoxBySource && deps.integrationManager) {
          const proxmoxPlugin = deps.integrationManager.getExecutionTool("proxmox") as ProxmoxIntegration | null;
          const client = proxmoxPlugin?.getClient();
          if (client) {
            const parts = nodeId.split(":");
            if (parts.length === 3) {
              const pveNode = parts[1];
              const vmid = parseInt(parts[2], 10);
              if (!isNaN(vmid)) {
                tasks.push(
                  collectProxmoxTaskEntries(client, pveNode, vmid, nodeId)
                    .then((entries) => { send("batch", { source: "proxmox_tasks", entries }); })
                    .catch(() => { send("source_error", { source: "proxmox_tasks", message: "Failed to load Proxmox task history" }); }),
                );
              }
            }
          }
        }

        // Source 5: AWS state changes (if node belongs to AWS)
        // Skip if source filter excludes aws
        const skipAwsBySource = query.source !== undefined && !query.source.includes("aws");
        if (activeSources.includes("aws_states") && !skipAwsBySource && deps.integrationManager) {
          const awsPlugin = deps.integrationManager.getExecutionTool("aws") as AWSPlugin | null;
          if (awsPlugin) {
            const parts = nodeId.split(":");
            if (parts.length === 3) {
              const region = parts[1];
              const instanceId = parts[2];
              tasks.push(
                collectAWSStateEntry(awsPlugin as unknown as AWSServiceLike, instanceId, region, db, nodeId)
                  .then(async (entries) => {
                    for (const entry of entries) {
                      await journalService.recordEvent({
                        nodeId: entry.nodeId,
                        nodeUri: entry.nodeUri,
                        eventType: entry.eventType,
                        source: entry.source,
                        action: entry.action,
                        summary: entry.summary,
                        details: entry.details,
                        userId: null,
                      });
                    }
                    send("batch", { source: "aws_states", entries });
                  })
                  .catch(() => { send("source_error", { source: "aws_states", message: "Failed to load AWS state changes" }); }),
              );
            }
          }
        }

        await Promise.all(tasks).finally(() => {
          clearInterval(heartbeat);
          if (!res.writableEnded) {
            send("complete", {});
            res.end();
          }
        });
      })();
    },
  );

  /**
   * GET /api/journal/:nodeId
   * Get aggregated timeline for a node
   *
   * Requirements: 22.4, 23.1
   */
  router.get(
    "/:nodeId",
    asyncHandler(authMiddleware),
    asyncHandler(rbacMiddleware("journal", "read")),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { nodeId } = req.params;

      logger.info("Processing journal timeline request", {
        component: "JournalRouter",
        operation: "getTimeline",
        metadata: { userId: req.user?.userId, nodeId },
      });

      try {
        const validatedQuery = TimelineQuerySchema.parse(req.query);

        const entries = await journalService.aggregateTimeline(nodeId, {
          limit: validatedQuery.limit,
          offset: validatedQuery.offset,
          startDate: validatedQuery.startDate,
          endDate: validatedQuery.endDate,
        });

        res.status(200).json({ entries });
      } catch (error) {
        if (error instanceof ZodError) {
          logger.warn("Journal timeline validation failed", {
            component: "JournalRouter",
            operation: "getTimeline",
            metadata: { errors: error.errors },
          });
          sendValidationError(res, error);
          return;
        }

        logger.error("Journal timeline retrieval failed", {
          component: "JournalRouter",
          operation: "getTimeline",
          metadata: { userId: req.user?.userId, nodeId },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to retrieve journal timeline",
          },
        });
      }
    })
  );

  /**
   * POST /api/journal/:nodeId/notes
   * Add a manual note to a node's journal
   *
   * Requirements: 24.1
   */
  router.post(
    "/:nodeId/notes",
    asyncHandler(authMiddleware),
    asyncHandler(rbacMiddleware("journal", "note")),
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const { nodeId } = req.params;
      const userId = req.user?.userId;

      logger.info("Processing add journal note request", {
        component: "JournalRouter",
        operation: "addNote",
        metadata: { userId, nodeId },
      });

      if (!userId) {
        res.status(401).json({
          error: {
            code: ERROR_CODES.UNAUTHORIZED,
            message: "Authentication required",
          },
        });
        return;
      }

      try {
        const validatedBody = AddNoteSchema.parse(req.body);

        const entryId = await journalService.addNote(
          nodeId,
          userId,
          validatedBody.content,
        );

        logger.info("Journal note added successfully", {
          component: "JournalRouter",
          operation: "addNote",
          metadata: { userId, nodeId, entryId },
        });

        res.status(201).json({ id: entryId });
      } catch (error) {
        if (error instanceof ZodError) {
          logger.warn("Add note validation failed", {
            component: "JournalRouter",
            operation: "addNote",
            metadata: { errors: error.errors },
          });
          sendValidationError(res, error);
          return;
        }

        logger.error("Add journal note failed", {
          component: "JournalRouter",
          operation: "addNote",
          metadata: { userId, nodeId },
        }, error instanceof Error ? error : undefined);

        res.status(500).json({
          error: {
            code: ERROR_CODES.INTERNAL_SERVER_ERROR,
            message: "Failed to add journal note",
          },
        });
      }
    })
  );

  return router;
}
