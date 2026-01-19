import { describe, it, expect, beforeEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import { expertModeMiddleware, requestIdMiddleware } from "../src/middleware";

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
    const response = await request(app)
      .get("/test")
      .expect(200);

    console.log("Response body:", JSON.stringify(response.body, null, 2));
    expect(response.body.expertMode).toBe(false);
  });

  it("should have expertMode=true when header is set", async () => {
    const response = await request(app)
      .get("/test")
      .set("X-Expert-Mode", "true")
      .expect(200);

    console.log("Response body:", JSON.stringify(response.body, null, 2));
    expect(response.body.expertMode).toBe(true);
  });
});
