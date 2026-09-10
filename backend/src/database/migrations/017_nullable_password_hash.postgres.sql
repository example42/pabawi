-- Migration 017 (PostgreSQL): make password_hash nullable for federated (SSO) users
--
-- Federated users authenticated via Entra ID (or another OIDC provider) have no
-- local password, so password_hash stores NULL for those accounts.
--
-- PostgreSQL supports ALTER COLUMN directly. The previous shared migration used
-- the SQLite table-rebuild recipe, and DROP TABLE users fails outright here
-- ("cannot drop table users because other objects depend on it"), which blocked
-- every PostgreSQL deployment at this migration.

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
