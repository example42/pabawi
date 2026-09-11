-- Durable request idempotency for admission routes.
--
-- One row records the decided outcome of a single user-initiated submission.
-- The row is written in the same transaction as the work it admits, so a lost
-- response can be replayed without repeating that work. Uniqueness is scoped
-- per user: a key is a client-chosen value and must never let one caller
-- observe another caller's stored response.
--
-- The fingerprint covers the route and the normalised request, so the same key
-- presented with a different request is a conflict rather than a replay.

CREATE TABLE IF NOT EXISTS request_idempotency (
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  scope TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_request_idempotency_created ON request_idempotency(created_at);
