/**
 * Unit tests for CircuitBreaker
 *
 * Covers consecutive-failure semantics while closed (issue #59).
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
} from "../../../src/integrations/puppetdb/CircuitBreaker";

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 1000,
    });
  });

  describe("failure counting while closed", () => {
    it("opens after consecutive failures reach the threshold", async () => {
      const fail = async (): Promise<never> => {
        throw new Error("boom");
      };

      await expect(breaker.execute(fail)).rejects.toThrow("boom");
      await expect(breaker.execute(fail)).rejects.toThrow("boom");
      expect(breaker.getState()).toBe("closed");

      await expect(breaker.execute(fail)).rejects.toThrow("boom");
      expect(breaker.getState()).toBe("open");
      expect(breaker.getStats().failureCount).toBe(3);
    });

    it("resets failureCount on success while closed so sparse failures do not trip", async () => {
      const fail = async (): Promise<never> => {
        throw new Error("boom");
      };
      const succeed = async (): Promise<string> => "ok";

      // Two failures, then a success (still under threshold)
      await expect(breaker.execute(fail)).rejects.toThrow("boom");
      await expect(breaker.execute(fail)).rejects.toThrow("boom");
      expect(breaker.getStats().failureCount).toBe(2);

      await expect(breaker.execute(succeed)).resolves.toBe("ok");
      expect(breaker.getState()).toBe("closed");
      expect(breaker.getStats().failureCount).toBe(0);

      // Two more failures after the success must not open the circuit
      // (would have been 4 cumulative without the reset)
      await expect(breaker.execute(fail)).rejects.toThrow("boom");
      await expect(breaker.execute(fail)).rejects.toThrow("boom");
      expect(breaker.getState()).toBe("closed");
      expect(breaker.getStats().failureCount).toBe(2);

      // A third consecutive failure does open it
      await expect(breaker.execute(fail)).rejects.toThrow("boom");
      expect(breaker.getState()).toBe("open");
    });

    it("rejects requests while open", async () => {
      const fail = async (): Promise<never> => {
        throw new Error("boom");
      };

      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(fail)).rejects.toThrow("boom");
      }

      await expect(breaker.execute(async () => "ok")).rejects.toThrow(
        CircuitBreakerOpenError,
      );
    });
  });
});
