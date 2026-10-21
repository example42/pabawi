import type { DatabaseAdapter } from '../../src/database/DatabaseAdapter';

export async function ensureConsoleUser(db: DatabaseAdapter, userId: string): Promise<void> {
  await db.execute(
    `INSERT INTO users (id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at)
     VALUES (?, ?, ?, 'hash', 'Console', 'User', 1, 1, 'now', 'now') ON CONFLICT DO NOTHING`,
    [userId, userId, `${userId}@example.test`],
  );
}

export async function consoleAuthentication(db: DatabaseAdapter, userId: string) {
  const row = await db.queryOne<{ sessionVersion: string }>('SELECT session_version AS "sessionVersion" FROM users WHERE id = ?', [userId]);
  if (!row) throw new Error('Missing console fixture account');
  return { authContext: { provider: 'local' as const, identityId: null }, sessionVersion: row.sessionVersion };
}
