import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { ZodError } from "zod";
import { asyncHandler } from "./asyncHandler";
import { JournalService } from "../services/journal/JournalService";
import {
  collectExecutionEntries,
  collectPuppetDBEntries,
  type PuppetDBLike,
} from "../services/journal/JournalCollectors";
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

export interface JournalRouterDeps {
  puppetdb?: PuppetDBLike;
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
  const journalService = new JournalService(databaseService.getConnection());
  const authMiddleware = createAuthMiddleware(databaseService.getConnection());
  const rbacMiddleware = createRbacMiddleware(databaseService.getConnection());
  const db = databaseService.getConnection();

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
   * GET /api/journal/:nodeId/stream
   * Stream journal events via SSE as each source responds.
   * Sources: stored journal entries, pabawi execution history, PuppetDB reports.
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

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      function send(eventName: string, data: unknown): void {
        if (res.writableEnded) return;
        res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
      }

      const activeSources: string[] = ["journal", "executions"];
      if (deps.puppetdb?.isInitialized()) activeSources.push("puppetdb");

      send("init", { sources: activeSources });

      // Heartbeat to prevent proxies from closing idle connections
      const heartbeat = setInterval(() => {
        if (!res.writableEnded) res.write(": heartbeat\n\n");
      }, 25000);

      req.on("close", () => clearInterval(heartbeat));

      const tasks: Promise<void>[] = [];

      // Source 1: stored journal entries (DB)
      tasks.push(
        journalService
          .getNodeTimeline(nodeId, { limit: 100, offset: 0 })
          .then((entries) => {
            send("batch", { source: "journal", entries });
          })
          .catch(() => {
            send("source_error", { source: "journal", message: "Failed to load journal entries" });
          }),
      );

      // Source 2: pabawi execution history
      tasks.push(
        collectExecutionEntries(db, nodeId, 50)
          .then((entries) => {
            send("batch", { source: "executions", entries });
          })
          .catch(() => {
            send("source_error", { source: "executions", message: "Failed to load execution history" });
          }),
      );

      // Source 3: PuppetDB reports (if configured)
      if (deps.puppetdb?.isInitialized()) {
        tasks.push(
          collectPuppetDBEntries(deps.puppetdb, nodeId, 25)
            .then((entries) => {
              send("batch", { source: "puppetdb", entries });
            })
            .catch(() => {
              send("source_error", { source: "puppetdb", message: "Failed to load PuppetDB reports" });
            }),
        );
      }

      Promise.all(tasks)
        .finally(() => {
          clearInterval(heartbeat);
          if (!res.writableEnded) {
            send("complete", {});
            res.end();
          }
        });
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
