import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteAdapter } from '../../../src/database/SQLiteAdapter';
import { AuthenticationService } from '../../../src/services/AuthenticationService';
import { AuditLoggingService } from '../../../src/services/AuditLoggingService';
import { UserService } from '../../../src/services/UserService';
import { validatePassword } from '../../../src/utils/passwordValidation';
import { generatePassword, resetUserPassword } from '../../../src/cli/resetUserPassword';
import { parseArgs } from '../../../src/cli/reset-password';
import { initializeTestSchema } from '../../helpers/schema';

const OLD_PASSWORD = 'OldPass123!'; // pragma: allowlist secret
const NEW_PASSWORD = 'NewPass456@'; // pragma: allowlist secret

describe('resetUserPassword', () => {
  let db: SQLiteAdapter;
  let authService: AuthenticationService;
  let userService: UserService;
  let auditLogger: AuditLoggingService;
  let userId: string;

  const deps = () => ({ db, userService, authService, auditLogger });

  beforeEach(async () => {
    db = new SQLiteAdapter(':memory:');
    await db.initialize();
    await initializeTestSchema(db);
    auditLogger = new AuditLoggingService(db);
    authService = new AuthenticationService(db, 'test-secret-test-secret-test-secret', auditLogger);
    userService = new UserService(db, authService);
    const user = await userService.createUser({
      username: 'admin',
      email: 'admin@example.com',
      password: OLD_PASSWORD,
      firstName: 'Ad',
      lastName: 'Min',
      isActive: true,
      isAdmin: true,
    });
    userId = user.id;
  });

  afterEach(async () => {
    await db.close();
  });

  it('sets the new password, which verifies, and invalidates the old one', async () => {
    await resetUserPassword(deps(), { username: 'admin', password: NEW_PASSWORD });
    const user = await userService.getUserById(userId);
    expect(await authService.verifyPassword(NEW_PASSWORD, user!.passwordHash)).toBe(true);
    expect(await authService.verifyPassword(OLD_PASSWORD, user!.passwordHash)).toBe(false);
  });

  it('rotates the session version so issued tokens are revoked', async () => {
    const before = await db.queryOne<{ v: string }>('SELECT session_version AS v FROM users WHERE id = ?', [userId]);
    await resetUserPassword(deps(), { username: 'admin', password: NEW_PASSWORD });
    const after = await db.queryOne<{ v: string }>('SELECT session_version AS v FROM users WHERE id = ?', [userId]);
    expect(after!.v).not.toBe(before!.v);
  });

  it('clears lockouts and failed-login counters', async () => {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO account_lockouts (username, lockout_type, locked_at, locked_until, failed_attempts, last_attempt_at)
       VALUES (?, 'permanent', ?, NULL, 5, ?)`,
      ['admin', now, now],
    );
    await db.execute(
      'INSERT INTO login_attempt_counters (username, cumulative_failed_attempts, last_failed_at) VALUES (?, 7, ?)',
      ['admin', now],
    );
    await resetUserPassword(deps(), { username: 'admin', password: NEW_PASSWORD });
    expect(await db.query('SELECT 1 FROM account_lockouts WHERE username = ?', ['admin'])).toHaveLength(0);
    expect(await db.query('SELECT 1 FROM login_attempt_counters WHERE username = ?', ['admin'])).toHaveLength(0);
  });

  it('writes an audit entry that does not contain the password', async () => {
    await resetUserPassword(deps(), { username: 'admin', password: NEW_PASSWORD, invokedBy: 'root' });
    const rows = await db.query<{ action: string; details: string }>(
      'SELECT "action", details FROM audit_logs WHERE "action" = ?',
      ['cli_password_reset'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].details).toContain('root');
    expect(rows[0].details).not.toContain(NEW_PASSWORD);
  });

  it('rejects a weak password and leaves the account untouched', async () => {
    const before = await userService.getUserById(userId);
    await expect(resetUserPassword(deps(), { username: 'admin', password: 'weak' }))
      .rejects.toThrow('Password validation failed');
    const after = await userService.getUserById(userId);
    expect(after!.passwordHash).toBe(before!.passwordHash);
  });

  it('fails for an unknown user', async () => {
    await expect(resetUserPassword(deps(), { username: 'nobody', password: NEW_PASSWORD }))
      .rejects.toThrow('User not found: nobody');
  });

  it('does not reactivate a disabled account unless asked', async () => {
    await db.execute('UPDATE users SET is_active = 0 WHERE id = ?', [userId]);
    const plain = await resetUserPassword(deps(), { username: 'admin', password: NEW_PASSWORD });
    expect(plain.reactivated).toBe(false);
    expect((await userService.getUserById(userId))!.isActive).toBe(0);

    const activated = await resetUserPassword(deps(), { username: 'admin', password: NEW_PASSWORD, activate: true });
    expect(activated.reactivated).toBe(true);
    expect((await userService.getUserById(userId))!.isActive).toBe(1);
  });
});

describe('generatePassword', () => {
  it('always satisfies the password policy and is not constant', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generatePassword();
      expect(validatePassword(p).valid).toBe(true);
      seen.add(p);
    }
    expect(seen.size).toBe(200);
  });
});

describe('parseArgs', () => {
  it('defaults to admin with prompt mode', () => {
    expect(parseArgs([])).toMatchObject({ username: 'admin', generate: false, passwordStdin: false, activate: false });
  });

  it('parses flags', () => {
    expect(parseArgs(['--username', 'bob', '--generate', '--activate']))
      .toMatchObject({ username: 'bob', generate: true, activate: true });
  });

  it('rejects unknown args, including a password on the command line', () => {
    expect(() => parseArgs(['--password', 'x'])).toThrow('Unknown argument');
  });

  it('rejects conflicting modes and missing values', () => {
    expect(() => parseArgs(['--generate', '--password-stdin'])).toThrow('mutually exclusive');
    expect(() => parseArgs(['--username'])).toThrow('requires a value');
  });
});
