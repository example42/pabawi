import http from "node:http";
import type { RequestListener, Server } from "node:http";

/**
 * A long-lived HTTP server, bound to loopback, that supertest can be pointed at.
 *
 * ## Why this exists
 *
 * `request(app)` makes supertest call `app.listen(0)` and then connect to
 * `127.0.0.1:<port>` — a fresh listening socket for *every single request*
 * (`node_modules/supertest/lib/test.js:63`). That is unsafe on macOS, and it
 * was the root cause of the long-standing backend suite flakiness:
 *
 * - `listen(0)` with no host binds the **wildcard** address (`::`), so the
 *   kernel's ephemeral-port allocator only avoids conflicts on the wildcard.
 * - macOS hands out ephemeral ports from 49152-65535 — the same range in which
 *   unrelated desktop applications (Ollama, editor helpers, Docker, VPN agents)
 *   hold long-lived listeners bound specifically to `127.0.0.1`.
 * - A wildcard bind on a port already held on `127.0.0.1` **succeeds**, but the
 *   more specific bind wins for incoming connections. supertest then connects to
 *   `127.0.0.1:<port>` and its request is served by the foreign application.
 *
 * The test sees a plausible-looking HTTP response that its app never produced —
 * `401`, `404`, `426 Upgrade Required` — with no error and no stack trace.
 * Measured rate on a developer Mac: ~0.07% of requests (7 in 9600). Across a
 * full suite run of ~10k requests that is the observed 0-8 unrelated failures
 * per run, landing on a different, disjoint set of tests each time.
 *
 * Binding explicitly to `127.0.0.1` closes the hole — the kernel then sees the
 * real conflict and never hands out a shadowed port (measured: 0 misroutes in
 * 9600 requests). But `listen(0, "127.0.0.1")` resolves the host through
 * `dns.lookup`, so `server.address()` is not available until a later tick,
 * and supertest reads the port synchronously. A drop-in patch is therefore not
 * possible; the server has to be bound ahead of time, which is what this helper
 * does.
 *
 * Reusing one server also removes the per-request bind/close churn entirely —
 * at high request volumes that churn exhausts the loopback ephemeral range and
 * starts throwing `EADDRNOTAVAIL`.
 *
 * ## Usage
 *
 *     let harness: HttpHarness;
 *     beforeAll(async () => { harness = await createHttpHarness(); });
 *     afterAll(async () => { await harness.close(); });
 *
 *     // then, instead of `request(app)`:
 *     await request(harness.use(app)).get("/api/...").expect(200);
 *
 * `use()` swaps the mounted handler and returns the already-listening server.
 * Because that server reports an address, supertest skips its own `listen(0)`
 * and — since it only closes servers it opened itself — leaves it alone
 * (`node_modules/supertest/lib/test.js:134-145`).
 *
 * The handler is swapped rather than memoised per app so that tests which build
 * a fresh Express app per iteration (property tests, notably) still use exactly
 * one socket instead of hundreds.
 */
export interface HttpHarness {
  /**
   * Mount `app` as the current handler and return the listening server to hand
   * to supertest. Safe to call repeatedly, including with a different app.
   */
  use(app: RequestListener): Server;
  /** The loopback port the harness is bound to. */
  readonly port: number;
  /** Stop listening. Call from `afterAll`. */
  close(): Promise<void>;
}

/**
 * Create and bind a loopback HTTP harness. Bind once per test file.
 */
export async function createHttpHarness(): Promise<HttpHarness> {
  let current: RequestListener | null = null;

  const server = http.createServer((req, res) => {
    if (!current) {
      // Only reachable if a request is issued before any use() call, which
      // would otherwise surface as a confusing socket hang-up.
      res.statusCode = 503;
      res.end("httpHarness: no app mounted");
      return;
    }
    current(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    // Explicit loopback host is the whole point — see the doc comment above.
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  return {
    use(app: RequestListener): Server {
      current = app;
      return server;
    },
    get port(): number {
      return (server.address() as { port: number }).port;
    },
    close(): Promise<void> {
      return new Promise<void>((resolve) => {
        current = null;
        server.close(() => resolve());
      });
    },
  };
}
