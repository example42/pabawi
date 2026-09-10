-- Database triggers keep independent processes on the same authorization state.
CREATE FUNCTION pabawi_revoke_user_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash OR NEW.is_active IS DISTINCT FROM OLD.is_active OR NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    NEW.session_version := replace(gen_random_uuid()::text, '-', '');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER revoke_user_sessions BEFORE UPDATE OF password_hash, is_active, is_admin ON users
FOR EACH ROW EXECUTE FUNCTION pabawi_revoke_user_sessions();

CREATE FUNCTION pabawi_authorization_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE authorization_state SET revision = replace(gen_random_uuid()::text, '-', '') WHERE id = 1;
  RETURN NULL;
END;
$$;
CREATE TRIGGER authz_users AFTER INSERT OR UPDATE OF is_active, is_admin OR DELETE ON users
FOR EACH STATEMENT EXECUTE FUNCTION pabawi_authorization_changed();
CREATE TRIGGER authz_roles AFTER INSERT OR UPDATE OR DELETE ON roles
FOR EACH STATEMENT EXECUTE FUNCTION pabawi_authorization_changed();
CREATE TRIGGER authz_permissions AFTER INSERT OR UPDATE OR DELETE ON permissions
FOR EACH STATEMENT EXECUTE FUNCTION pabawi_authorization_changed();
CREATE TRIGGER authz_user_roles AFTER INSERT OR UPDATE OR DELETE ON user_roles
FOR EACH STATEMENT EXECUTE FUNCTION pabawi_authorization_changed();
CREATE TRIGGER authz_user_groups AFTER INSERT OR UPDATE OR DELETE ON user_groups
FOR EACH STATEMENT EXECUTE FUNCTION pabawi_authorization_changed();
CREATE TRIGGER authz_group_roles AFTER INSERT OR UPDATE OR DELETE ON group_roles
FOR EACH STATEMENT EXECUTE FUNCTION pabawi_authorization_changed();
CREATE TRIGGER authz_role_permissions AFTER INSERT OR UPDATE OR DELETE ON role_permissions
FOR EACH STATEMENT EXECUTE FUNCTION pabawi_authorization_changed();
CREATE TRIGGER authz_groups AFTER INSERT OR UPDATE OR DELETE ON groups
FOR EACH STATEMENT EXECUTE FUNCTION pabawi_authorization_changed();
