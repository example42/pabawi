/**
 * Crash Dumps Routes
 *
 * Admin-only endpoints for listing and retrieving crash dump files
 * written by the process-level crash handler.
 */

import { Router, type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { asyncHandler } from "./asyncHandler";
import type { DIContainer } from "../container/DIContainer";

const FilenameParamSchema = z.object({
  filename: z.string()
    .min(1)
    .max(255)
    .regex(/^[\w\-.]+$/, "Invalid filename characters"),
});

interface CrashDumpEntry {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  pid?: number;
  reason?: string;
  errorMessage?: string;
}

function resolveDumpDir(configuredDir: string | undefined): string {
  return configuredDir ?? process.env.PABAWI_CRASH_DUMP_DIR ?? path.join(process.cwd(), "crash-dumps");
}

function extractMetadata(filePath: string): Partial<Pick<CrashDumpEntry, "pid" | "reason" | "errorMessage">> {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    const errorObj = data.error;
    let errorMessage: string | undefined;
    if (errorObj && typeof errorObj === "object") {
      const errRecord = errorObj as Record<string, unknown>;
      errorMessage = typeof errRecord.message === "string" ? errRecord.message : undefined;
    }
    return {
      pid: typeof data.pid === "number" ? data.pid : undefined,
      reason: typeof data.reason === "string" ? data.reason : undefined,
      errorMessage,
    };
  } catch {
    return {};
  }
}

/**
 * Create crash dumps router (admin-only)
 */
export function createCrashDumpsRouter(container: DIContainer): Router {
  const router = Router();
  const logger = container.resolve("logger");
  const config = container.resolve("config");

  const dumpDir = resolveDumpDir(config.getCrashDumpDir());

  /**
   * GET /api/crash-dumps
   * List all crash dump files with summary metadata
   */
  router.get(
    "/",
    asyncHandler(async (_req: Request, res: Response): Promise<void> => {
      logger.info("Listing crash dumps", {
        component: "CrashDumpsRouter",
        operation: "listCrashDumps",
      });

      if (!fs.existsSync(dumpDir)) {
        res.json({ dumps: [], total: 0, dumpDir });
        return;
      }

      const files = await fs.promises.readdir(dumpDir);
      const jsonFiles = files.filter((f) => f.endsWith(".json"));

      const dumps: CrashDumpEntry[] = [];

      for (const filename of jsonFiles) {
        const filePath = path.join(dumpDir, filename);
        try {
          const stat = await fs.promises.stat(filePath);
          const metadata = extractMetadata(filePath);
          dumps.push({
            filename,
            sizeBytes: stat.size,
            createdAt: stat.birthtime.toISOString(),
            ...metadata,
          });
        } catch {
          // Skip files we can't stat
        }
      }

      // Sort newest first
      dumps.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json({ dumps, total: dumps.length, dumpDir });
    }),
  );

  /**
   * GET /api/crash-dumps/:filename
   * Retrieve the full contents of a specific crash dump
   */
  router.get(
    "/:filename",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const parseResult = FilenameParamSchema.safeParse(req.params);
      if (!parseResult.success) {
        res.status(400).json({
          error: { code: "INVALID_FILENAME", message: "Invalid filename" },
        });
        return;
      }

      const { filename } = parseResult.data;
      const filePath = path.join(dumpDir, filename);

      // Prevent directory traversal
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(path.resolve(dumpDir))) {
        res.status(403).json({
          error: { code: "FORBIDDEN", message: "Access denied" },
        });
        return;
      }

      if (!fs.existsSync(resolved)) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "Crash dump not found" },
        });
        return;
      }

      logger.info("Retrieving crash dump", {
        component: "CrashDumpsRouter",
        operation: "getCrashDump",
        metadata: { filename },
      });

      const content = await fs.promises.readFile(resolved, "utf-8");

      // Return as JSON if valid, otherwise as text
      try {
        const parsed = JSON.parse(content) as unknown;
        res.json({ filename, content: parsed });
      } catch {
        res.json({ filename, content, format: "text" });
      }
    }),
  );

  /**
   * GET /api/crash-dumps/:filename/download
   * Download a crash dump file
   */
  router.get(
    "/:filename/download",
    asyncHandler((req: Request, res: Response): void => {
      const parseResult = FilenameParamSchema.safeParse(req.params);
      if (!parseResult.success) {
        res.status(400).json({
          error: { code: "INVALID_FILENAME", message: "Invalid filename" },
        });
        return;
      }

      const { filename } = parseResult.data;
      const filePath = path.join(dumpDir, filename);

      // Prevent directory traversal
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(path.resolve(dumpDir))) {
        res.status(403).json({
          error: { code: "FORBIDDEN", message: "Access denied" },
        });
        return;
      }

      if (!fs.existsSync(resolved)) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "Crash dump not found" },
        });
        return;
      }

      logger.info("Downloading crash dump", {
        component: "CrashDumpsRouter",
        operation: "downloadCrashDump",
        metadata: { filename },
      });

      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "application/json");
      const stream = fs.createReadStream(resolved);
      stream.pipe(res);
    }),
  );

  /**
   * DELETE /api/crash-dumps/:filename
   * Delete a specific crash dump
   */
  router.delete(
    "/:filename",
    asyncHandler(async (req: Request, res: Response): Promise<void> => {
      const parseResult = FilenameParamSchema.safeParse(req.params);
      if (!parseResult.success) {
        res.status(400).json({
          error: { code: "INVALID_FILENAME", message: "Invalid filename" },
        });
        return;
      }

      const { filename } = parseResult.data;
      const filePath = path.join(dumpDir, filename);

      // Prevent directory traversal
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(path.resolve(dumpDir))) {
        res.status(403).json({
          error: { code: "FORBIDDEN", message: "Access denied" },
        });
        return;
      }

      if (!fs.existsSync(resolved)) {
        res.status(404).json({
          error: { code: "NOT_FOUND", message: "Crash dump not found" },
        });
        return;
      }

      logger.info("Deleting crash dump", {
        component: "CrashDumpsRouter",
        operation: "deleteCrashDump",
        metadata: { filename },
      });

      await fs.promises.unlink(resolved);
      res.json({ success: true, filename });
    }),
  );

  return router;
}
