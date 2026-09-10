INSERT INTO config (key, value, updated_at)
SELECT 'setup_completed', 'true', CAST(CURRENT_TIMESTAMP AS TEXT)
WHERE EXISTS (SELECT 1 FROM users WHERE is_admin = 1)
ON CONFLICT(key) DO NOTHING;
