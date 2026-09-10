import type { DatabaseAdapter } from '../../src/database/DatabaseAdapter';

export async function ensureConsoleUser(db: DatabaseAdapter, userId: string): Promise<void> {
  await db.execute(
    `INSERT INTO users (id, username, email, password_hash, first_name, last_name, is_active, is_admin, created_at, updated_at)
     VALUES (?, ?, ?, 'hash', 'Console', 'User', 1, 1, 'now', 'now') ON CONFLICT DO NOTHING`,
    [userId, userId, `${userId}@example.test`],
  );
}
