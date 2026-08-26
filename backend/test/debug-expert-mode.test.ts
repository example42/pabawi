import { describe, it, expect, beforeEach, beforeAll, afterAll } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { createHttpHarness, type HttpHarness } from "./helpers/httpHarness";
import { requestIdMiddleware } from "../src/middleware/errorHandler";
import { expertModeMiddleware } from "../src/middleware/expertMode";

// One loopback-bound HTTP server for the whole file. See
// test/helpers/httpHarness.ts: supertest's default request(app) opens a
// fresh wildcard-bound socket per request, which on macOS can be shadowed
// by an unrelated process holding the same port on 127.0.0.1.
let harness: HttpHarness;

beforeAll(async () => {
  harness = await createHttpHarness();
});

afterAll(async () => {
  await harness.close();
});

describe("Debug Expert Mode", () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    app.use(expertModeMiddleware);

    app.get("/test", (req, res) => {
      res.json({
        expertMode: req.expertMode,
        headers: req.headers,
      });
    });
  });

  it("should have expertMode=false when no header is set", async () => {
    const response = await request(harness.use(app))
      .get("/test")
      .expect(200);

    console.log("Response body:", JSON.stringify(response.body, null, 2));
    expect(response.body.expertMode).toBe(false);
  });

  it("should have expertMode=true when header is set", async () => {
    const response = await request(harness.use(app))
      .get("/test")
      .set("X-Expert-Mode", "true")
      .expect(200);

    console.log("Response body:", JSON.stringify(response.body, null, 2));
    expect(response.body.expertMode).toBe(true);
  });
});
