import { randomInt } from 'crypto';
import type { DatabaseAdapter } from '../database/DatabaseAdapter';
import type { AuthenticationService } from '../services/AuthenticationService';
import type { AuditLoggingService } from '../services/AuditLoggingService';
import type { UserService } from '../services/UserService';
import { validatePassword } from '../utils/passwordValidation';

export interface ResetPasswordDeps {
  db: DatabaseAdapter;
  userService: UserService;
  authService: AuthenticationService;
  auditLogger: AuditLoggingService;
}

export interface ResetPasswordOptions {
  username: string;
  password: string;
  /** Reactivate the account if it is disabled. Off by default. */
  activate?: boolean;
  /** OS account that ran the CLI, recorded in the audit log. */
  invokedBy?: string;
}

export interface ResetPasswordResult {
  userId: string;
  username: string;
  reactivated: boolean;
  federationOnly: boolean;
}

const GENERATED_LENGTH = 20;
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SPECIAL = '!@#$%^&*()-_=+';

/**
 * Generate a random password that satisfies validatePassword().
 * Uses crypto.randomInt, so the output is uniformly random per character.
 */
export function generatePassword(): string {
  const all = UPPER + LOWER + DIGITS + SPECIAL;
  const pick = (set: string): string => set[randomInt(set.length)];
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SPECIAL)];
  while (chars.length < GENERATED_LENGTH) chars.push(pick(all));
  // Fisher-Yates shuffle so the guaranteed characters are not positional
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * Reset a local user's password out of band (CLI recovery path).
 *
 * Validates the password before touching anything, then: sets the new hash,
 * clears lockouts and failed-login counters, rotates the session version so
 * every issued access/refresh token stops working, and writes an audit entry.
 * The password itself is never logged or audited.
 *
 * @throws Error if the user does not exist or the password is not acceptable
 */
export async function resetUserPassword(
  deps: ResetPasswordDeps,
  options: ResetPasswordOptions,
): Promise<ResetPasswordResult> {
  const { db, userService, authService, auditLogger } = deps;

  const user = await userService.getUserByUsername(options.username);
  if (!user) {
    throw new Error(`User not found: ${options.username}`);
  }

  const validation = validatePassword(options.password);
  if (!validation.valid) {
    throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
  }

  const reactivate = options.activate === true && user.isActive !== 1;
  const federationOnly = !user.passwordHash;

  await userService.updateUser(user.id, {
    password: options.password,
    ...(reactivate ? { isActive: true } : {}),
  });

  // Unlock first, then clear the cumulative counters the unlock does not touch
  await authService.unlockAccount(user.username);
  await db.execute('DELETE FROM login_attempt_counters WHERE username = ?', [user.username]);

  // updateUser does not rotate the session version; do it explicitly
  await authService.revokeAllUserTokens(user.id);

  await auditLogger.logAdminAction('cli_password_reset', user.id, {
    source: 'cli',
    username: user.username,
    invokedBy: options.invokedBy ?? 'unknown',
    reactivated: reactivate,
    federationOnly,
  });

  return { userId: user.id, username: user.username, reactivated: reactivate, federationOnly };
}
