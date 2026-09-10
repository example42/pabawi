-- Explicit statement boundaries keep SQLite trigger bodies intact.
CREATE TRIGGER revoke_user_sessions AFTER UPDATE OF password_hash, is_active, is_admin ON users
WHEN NEW.password_hash IS NOT OLD.password_hash OR NEW.is_active IS NOT OLD.is_active OR NEW.is_admin IS NOT OLD.is_admin
BEGIN
  UPDATE users SET session_version = lower(hex(randomblob(16))) WHERE id = NEW.id;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_users_insert AFTER INSERT ON users
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_users_update AFTER UPDATE OF is_active, is_admin ON users
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_users_delete AFTER DELETE ON users
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_roles_insert AFTER INSERT ON roles
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_roles_update AFTER UPDATE ON roles
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_roles_delete AFTER DELETE ON roles
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_permissions_insert AFTER INSERT ON permissions
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_permissions_update AFTER UPDATE ON permissions
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_permissions_delete AFTER DELETE ON permissions
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_user_roles_insert AFTER INSERT ON user_roles
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_user_roles_update AFTER UPDATE ON user_roles
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_user_roles_delete AFTER DELETE ON user_roles
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_user_groups_insert AFTER INSERT ON user_groups
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_user_groups_update AFTER UPDATE ON user_groups
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_user_groups_delete AFTER DELETE ON user_groups
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_group_roles_insert AFTER INSERT ON group_roles
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_group_roles_update AFTER UPDATE ON group_roles
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_group_roles_delete AFTER DELETE ON group_roles
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_role_permissions_insert AFTER INSERT ON role_permissions
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_role_permissions_update AFTER UPDATE ON role_permissions
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_role_permissions_delete AFTER DELETE ON role_permissions
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_groups_insert AFTER INSERT ON groups
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_groups_update AFTER UPDATE ON groups
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
-- pabawi:statement-breakpoint
CREATE TRIGGER authz_groups_delete AFTER DELETE ON groups
BEGIN
  UPDATE authorization_state SET revision = lower(hex(randomblob(16))) WHERE id = 1;
END;
