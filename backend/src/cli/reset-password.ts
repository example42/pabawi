/**
 * Reset a local user's password from the command line (account recovery).
 *
 * Usage (from the backend directory, with the same environment as the server):
 *   npm run reset-password -- [--username admin] [--generate | --password-stdin] [--activate]
 *   node dist/cli/reset-password.js ...        (built / Docker image)
 *
 * The password is never accepted as an argument: it is read from a hidden
 * prompt, from stdin (--password-stdin), or generated (--generate).
 * Run it on the host that owns the database; shell access is the trust boundary.
 */
import { userInfo } from 'os';
import { ConfigService } from '../config/ConfigService';
import { DatabaseService } from '../database/DatabaseService';
import { AuditLoggingService } from '../services/AuditLoggingService';
import { AuthenticationService } from '../services/AuthenticationService';
import { UserService } from '../services/UserService';
import { generatePassword, resetUserPassword } from './resetUserPassword';

interface CliArgs {
  username: string;
  generate: boolean;
  passwordStdin: boolean;
  activate: boolean;
  help: boolean;
}

const USAGE = `Usage: reset-password [options]

  --username <name>   Account to reset (default: admin)
  --generate          Generate a random password and print it once
  --password-stdin    Read the new password from stdin (one line)
  --activate          Also reactivate the account if it is disabled
  -h, --help          Show this help

Without --generate or --password-stdin the password is prompted for twice.`;

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    username: 'admin', generate: false, passwordStdin: false, activate: false, help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--username': {
        const value = argv[++i];
        if (!value || value.startsWith('--')) throw new Error('--username requires a value');
        args.username = value;
        break;
      }
      case '--generate': args.generate = true; break;
      case '--password-stdin': args.passwordStdin = true; break;
      case '--activate': args.activate = true; break;
      case '-h':
      case '--help': args.help = true; break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (args.generate && args.passwordStdin) {
    throw new Error('--generate and --password-stdin are mutually exclusive');
  }
  return args;
}

async function readStdinLine(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8').split(/\r?\n/)[0];
}

/** Prompt without echoing input. Requires an interactive TTY. */
function promptHidden(label: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error('No TTY available: use --password-stdin or --generate'));
      return;
    }
    process.stderr.write(label);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (key: string): void => {
      for (const ch of key) {
        if (ch === '\u0003') { // Ctrl-C
          cleanup();
          reject(new Error('Aborted'));
          return;
        }
        if (ch === '\r' || ch === '\n' || ch === '\u0004') {
          cleanup();
          process.stderr.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    const cleanup = (): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
    };
    stdin.on('data', onData);
  });
}

async function obtainPassword(args: CliArgs): Promise<{ password: string; generated: boolean }> {
  if (args.generate) return { password: generatePassword(), generated: true };
  if (args.passwordStdin) return { password: await readStdinLine(), generated: false };
  const first = await promptHidden('New password: ');
  const second = await promptHidden('Repeat password: ');
  if (first !== second) throw new Error('Passwords do not match');
  return { password: first, generated: false };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }

  const { password, generated } = await obtainPassword(args);

  const configService = new ConfigService();
  const config = configService.getConfig();

  const databaseService = new DatabaseService(config.databasePath, config.dbType, config.databaseUrl);
  await databaseService.initialize();
  try {
    const db = databaseService.getAdapter();
    const auditLogger = new AuditLoggingService(db);
    const authService = new AuthenticationService(db, configService.getJwtSecret(), auditLogger);
    const userService = new UserService(db, authService);

    const result = await resetUserPassword(
      { db, userService, authService, auditLogger },
      { username: args.username, password, activate: args.activate, invokedBy: userInfo().username },
    );

    process.stdout.write(`Password reset for "${result.username}". All existing sessions were revoked.\n`);
    if (result.reactivated) process.stdout.write('Account was reactivated.\n');
    if (result.federationOnly) {
      process.stdout.write('Note: this account had no local password (SSO only); local login is now enabled.\n');
    }
    if (generated) process.stdout.write(`Generated password (shown once): ${password}\n`);
  } finally {
    await databaseService.close();
  }
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    (error: unknown) => {
      process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exit(1);
    },
  );
}
