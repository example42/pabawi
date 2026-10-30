import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import request from "supertest";
import { createHttpHarness, type HttpHarness } from "../helpers/httpHarness";
import { createDebugRouter } from "../../src/routes/debug";
import type { DIContainer } from "../../src/container/DIContainer";

let harness: HttpHarness;

beforeAll(async () => {
  harness = await createHttpHarness();
});

afterAll(async () => {
  await harness.close();
});

function buildApp() {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const container = { resolve: () => logger } as unknown as DIContainer;
  const app = express();
  app.use(express.json());
  app.use("/api/debug", createDebugRouter(container));
  return app;
}

const entry = {
  timestamp: "2026-10-30T00:00:00Z",
  level: "info",
  component: "test",
  operation: "op",
  message: "hello",
};

describe("POST /api/debug/frontend-logs batch size", () => {
  it("accepts a batch at the limit", async () => {
    const logs = Array.from({ length: 100 }, () => entry);
    await request(harness.use(buildApp())).post("/api/debug/frontend-logs").send({ logs }).expect(200);
  });

  it("rejects an oversized batch with one issue, without parsing each entry", async () => {
    const logs = Array.from({ length: 5000 }, () => ({}));
    const res = await request(harness.use(buildApp())).post("/api/debug/frontend-logs").send({ logs }).expect(400);
    expect(res.body.error.code).toBe("INVALID_LOG_BATCH");
    expect(res.body.error.details).toEqual([
      { path: "logs", message: "Too many log entries in batch (max 100)" },
    ]);
  });

  it("still reports per-entry errors for a small invalid batch", async () => {
    const res = await request(harness.use(buildApp())).post("/api/debug/frontend-logs").send({ logs: [{}] }).expect(400);
    expect(res.body.error.details.length).toBeGreaterThan(1);
  });
});
