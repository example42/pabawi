import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CheckmkConfig } from "../../src/integrations/checkmk/types";
import type { LoggerService } from "../../src/services/LoggerService";

/**
 * Unit tests for CheckmkService write actions (acknowledge / downtime).
 *
 * The Checkmk REST API answers these POSTs with `204 No Content` (empty body).
 * These tests verify that:
 *  - an empty 204 body resolves as success (not a JSON parse error),
 *  - the request method, path, and JSON body match the Checkmk REST contract,
 *  - an HTTP error from Checkmk surfaces as `{ success: false }`.
 */

interface CapturedRequest {
  options: { method?: string; path?: string };
  body: string;
}

let captured: CapturedRequest[] = [];
let mockStatusCode = 204;
let mockBody = "";

vi.mock("node:https", () => {
  const Agent = vi.fn();
  const request = (
    options: Record<string, unknown>,
    callback?: (res: unknown) => void,
  ): unknown => {
    const entry: CapturedRequest = { options: options as CapturedRequest["options"], body: "" };
    captured.push(entry);

    const mockRes = {
      statusCode: mockStatusCode,
      on: (event: string, handler: (data?: unknown) => void) => {
        if (event === "data" && mockBody) handler(Buffer.from(mockBody));
        if (event === "end") handler();
        return mockRes;
      },
    };
    if (callback) process.nextTick(() => { callback(mockRes); });

    const req = {
      on: () => req,
      write: (payload: string) => { entry.body = payload; },
      end: () => {},
      destroy: () => {},
    };
    return req;
  };
  return { default: { request, Agent }, Agent, request };
});

function createMockLogger(): LoggerService {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    setLevel: vi.fn(),
  } as unknown as LoggerService;
}

function createConfig(): CheckmkConfig {
  return {
    enabled: true,
    serverUrl: "https://monitoring.example.com",
    site: "mysite",
    username: "automation",
    password: "secret", // pragma: allowlist secret
    sslVerify: true,
    healthCheckIntervalMs: 300_000,
  };
}

describe("CheckmkService write actions", () => {
  beforeEach(() => {
    captured = [];
    mockStatusCode = 204;
    mockBody = "";
  });

  it("acknowledgeServiceProblem posts the correct contract and treats 204 as success", async () => {
    const { CheckmkService } = await import("../../src/integrations/checkmk/CheckmkService");
    const service = new CheckmkService(createConfig(), createMockLogger());

    const result = await service.acknowledgeServiceProblem({
      hostname: "web01",
      serviceDescription: "CPU load",
      comment: "investigating",
      sticky: true,
      persistent: false,
      notify: true,
    });

    expect(result.success).toBe(true);
    expect(captured).toHaveLength(1);
    expect(captured[0].options.method).toBe("POST");
    expect(captured[0].options.path).toContain(
      "/check_mk/api/1.0/domain-types/acknowledge/collections/service",
    );
    expect(JSON.parse(captured[0].body)).toEqual({
      acknowledge_type: "service",
      sticky: true,
      persistent: false,
      notify: true,
      comment: "investigating",
      host_name: "web01",
      service_description: "CPU load",
    });
  });

  it("scheduleServiceDowntime posts the correct contract and treats 204 as success", async () => {
    const { CheckmkService } = await import("../../src/integrations/checkmk/CheckmkService");
    const service = new CheckmkService(createConfig(), createMockLogger());

    const result = await service.scheduleServiceDowntime({
      hostname: "web01",
      serviceDescription: "CPU load",
      comment: "maintenance",
      startTime: "2026-01-01T00:00:00.000Z",
      endTime: "2026-01-01T02:00:00.000Z",
    });

    expect(result.success).toBe(true);
    expect(captured[0].options.method).toBe("POST");
    expect(captured[0].options.path).toContain(
      "/check_mk/api/1.0/domain-types/downtime/collections/service",
    );
    expect(JSON.parse(captured[0].body)).toEqual({
      downtime_type: "service",
      start_time: "2026-01-01T00:00:00.000Z",
      end_time: "2026-01-01T02:00:00.000Z",
      comment: "maintenance",
      host_name: "web01",
      service_descriptions: ["CPU load"],
    });
  });

  it("returns success:false with the error message on an HTTP error response", async () => {
    mockStatusCode = 403;
    mockBody = "Forbidden";
    const { CheckmkService } = await import("../../src/integrations/checkmk/CheckmkService");
    const service = new CheckmkService(createConfig(), createMockLogger());

    const result = await service.acknowledgeServiceProblem({
      hostname: "web01",
      serviceDescription: "CPU load",
      comment: "investigating",
      sticky: true,
      persistent: false,
      notify: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("403");
  });
});
