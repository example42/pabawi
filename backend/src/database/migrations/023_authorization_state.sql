-- Account revocation and RBAC revisions are committed with their mutations.
ALTER TABLE users ADD COLUMN session_version TEXT NOT NULL DEFAULT '0';
CREATE TABLE authorization_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision TEXT NOT NULL DEFAULT '0'
);
INSERT INTO authorization_state (id, revision) VALUES (1, '0');
