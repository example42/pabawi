import { createHash } from "node:crypto";
import type { DatabaseAdapter } from "../database/DatabaseAdapter";

/**
 * How long a decided submission stays replayable. A client that lost a
 * response retries within seconds; a day of history is generous and keeps the
 * table from growing without bound.
 */
export const IDEMPOTENCY_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Longest accepted client-supplied key. */
export const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

/** Printable ASCII without whitespace, so the value survives a header round trip. */
const KEY_PATTERN = /^[\x21-\x7e]+$/;

/**
 * Thrown when a key already names a different submission.
 *
 * Returning the stored response here would answer a request that was never
 * made; repeating the work would defeat the key. The caller must surface a
 * conflict instead.
 */
export class IdempotencyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}

/** Thrown when a client-supplied key cannot be used as an identifier. */
export class IdempotencyKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdempotencyKeyError";
  }
}

/** A submission identified by its key, scope and request fingerprint. */
export interface IdempotentRequest {
  /** Owner of the key. Keys are never shared between users. */
  userId: string;

  /** Client-supplied key, already validated by {@link validateKey}. */
  key: string;

  /** Route identity, e.g. `POST /api/executions/batch`. */
  scope: string;

  /** Fingerprint of the normalised request, from {@link fingerprint}. */
  fingerprint: string;
}

/**
 * A submission that may or may not be replayable.
 *
 * Routes accept the key from a client that may omit it, so the optional key is
 * the shape they actually hold. Without one the submission is single-shot.
 */
export interface IdempotentSubmission extends Omit<IdempotentRequest, "key"> {
  key?: string;
}

/** The response a claim promises to return for every replay of a submission. */
export interface IdempotentResponse {
  status: number;
  body: unknown;
}

/** Outcome of a claim: this call admits the work, or replays a decided one. */
export type ClaimOutcome =
  | { claimed: true }
  | { claimed: false; replay: IdempotentResponse };

interface StoredRow {
  scope: string;
  fingerprint: string;
  response_status: number;
  response_body: string;
}

/**
 * Durable idempotency for admission routes.
 *
 * A submission is claimed by inserting its key together with the response the
 * claim promises, inside the same transaction as the work being admitted. The
 * insert is the claim: there is no separate existence check to race against,
 * and a rolled-back admission releases the key along with the work.
 *
 * `INSERT ... ON CONFLICT DO NOTHING` reports zero affected rows rather than
 * failing, which behaves identically on SQLite and PostgreSQL and leaves the
 * surrounding transaction usable, unlike a caught unique violation that would
 * abort a PostgreSQL transaction. Both dialects make a concurrent duplicate
 * wait for the first submission to decide: it then replays a committed one and
 * claims the key itself if the first rolled back. SQLite serialises writers
 * outright; PostgreSQL waits on the speculative insertion.
 *
 * Replay protection covers the transport, not the user: a fresh submission is
 * a fresh intent and carries a fresh key.
 */
export class RequestIdempotencyService {
  constructor(private db: DatabaseAdapter) {}

  /**
   * Validate and normalise a client-supplied key.
   *
   * @throws IdempotencyKeyError if the value cannot identify a submission
   */
  static validateKey(value: string): string {
    const key = value.trim();
    if (key.length === 0) {
      throw new IdempotencyKeyError("Idempotency-Key must not be empty");
    }
    if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      throw new IdempotencyKeyError(
        `Idempotency-Key must be at most ${String(MAX_IDEMPOTENCY_KEY_LENGTH)} characters`,
      );
    }
    if (!KEY_PATTERN.test(key)) {
      throw new IdempotencyKeyError("Idempotency-Key must be printable ASCII without whitespace");
    }
    return key;
  }

  /**
   * Fingerprint a request so a reused key with different content is detected.
   *
   * Object keys are sorted so that a semantically identical body serialised in
   * a different order still matches. Array order is content, not formatting,
   * and is preserved.
   */
  static fingerprint(scope: string, request: unknown): string {
    return createHash("sha256")
      .update(`${scope}\n${canonicalise(request)}`)
      .digest("hex");
  }

  /**
   * Claim a submission from inside an existing transaction.
   *
   * Call this as the first statement of the transaction that performs the
   * admission, so the key and the work commit or roll back together.
   *
   * @returns `{ claimed: true }` when this call owns the submission and must
   *          perform the work, or the decided response to replay
   * @throws IdempotencyConflictError if the key names a different request
   */
  async claim(request: IdempotentRequest, response: IdempotentResponse): Promise<ClaimOutcome> {
    const inserted = await this.db.execute(
      `INSERT INTO request_idempotency (
        user_id, idempotency_key, scope, fingerprint, response_status, response_body, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, idempotency_key) DO NOTHING`,
      [
        request.userId,
        request.key,
        request.scope,
        request.fingerprint,
        response.status,
        JSON.stringify(response.body),
        new Date().toISOString(),
      ],
    );

    if (inserted.changes > 0) return { claimed: true };

    const stored = await this.db.queryOne<StoredRow>(
      `SELECT scope, fingerprint, response_status, response_body
       FROM request_idempotency WHERE user_id = ? AND idempotency_key = ?`,
      [request.userId, request.key],
    );

    // A verified conflict always leaves a readable row, so this is a guard
    // rather than an expected path: the row would have to disappear between
    // the insert and this read. Nothing is decided, so nothing is replayed.
    if (!stored) {
      throw new IdempotencyConflictError(
        "Idempotency-Key is in use by a submission that did not complete; retry with a new key",
      );
    }

    if (stored.scope !== request.scope || stored.fingerprint !== request.fingerprint) {
      throw new IdempotencyConflictError(
        "Idempotency-Key was already used for a different request",
      );
    }

    return {
      claimed: false,
      replay: {
        status: stored.response_status,
        body: JSON.parse(stored.response_body) as unknown,
      },
    };
  }

  /** Replays a committed decision before mutable provider and capacity checks. */
  async lookup(request: IdempotentSubmission): Promise<IdempotentResponse | undefined> {
    if (request.key === undefined) return undefined;
    const stored = await this.db.queryOne<StoredRow>(
      `SELECT scope, fingerprint, response_status, response_body
       FROM request_idempotency WHERE user_id = ? AND idempotency_key = ?`,
      [request.userId, request.key],
    );
    if (!stored) return undefined;
    if (stored.scope !== request.scope || stored.fingerprint !== request.fingerprint) {
      throw new IdempotencyConflictError("Idempotency-Key was already used for a different request");
    }
    return { status: stored.response_status, body: JSON.parse(stored.response_body) as unknown };
  }

  /**
   * Claim a submission and perform its admission in one transaction.
   *
   * For callers that do not already own a transaction. `admit` runs only when
   * this call owns the submission; the response is fixed before the work so
   * every replay returns exactly what the first caller was promised, which
   * means identifiers must be generated by the caller rather than by the
   * admission.
   *
   * A submission without a key still gets the transaction: the admission is
   * atomic either way, it simply cannot be replayed.
   */
  async run(
    submission: IdempotentSubmission,
    response: IdempotentResponse,
    admit: () => Promise<void>,
  ): Promise<ClaimOutcome> {
    const key = submission.key;
    return this.db.withTransaction(async () => {
      if (key === undefined) {
        await admit();
        return { claimed: true };
      }
      const outcome = await this.claim({ ...submission, key }, response);
      if (outcome.claimed) await admit();
      return outcome;
    });
  }

  /**
   * Drop decided submissions older than the retention window.
   *
   * Called at startup. Keys stay claimable for far longer than any transport
   * retry, so nothing in flight is affected.
   *
   * @returns number of rows removed
   */
  async purgeExpired(retentionMs: number = IDEMPOTENCY_RETENTION_MS): Promise<number> {
    const cutoff = new Date(Date.now() - retentionMs).toISOString();
    const result = await this.db.execute(
      `DELETE FROM request_idempotency WHERE created_at < ?`,
      [cutoff],
    );
    return result.changes;
  }
}

/**
 * Serialise a value with object keys in a stable order.
 *
 * `JSON.stringify` preserves insertion order, which would make two identical
 * requests fingerprint differently purely because of how the client built the
 * body.
 */
function canonicalise(value: unknown): string {
  // `JSON.stringify(undefined)` is `undefined`, not a string. An absent value
  // and an explicit null fingerprint alike, which is what the wire format does.
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalise).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalise(entry)}`);
  return `{${entries.join(",")}}`;
}
