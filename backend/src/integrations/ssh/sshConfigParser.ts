/**
 * SSH Config File Parser
 *
 * Parses OpenSSH client configuration files (~/.ssh/config format) to extract
 * host definitions and connection parameters for the SSH integration plugin.
 *
 * Supports:
 * - Host directives with patterns and aliases
 * - HostName, User, Port, IdentityFile keywords
 * - Custom group metadata in comments (# Groups: group1,group2)
 * - Graceful error handling for syntax errors
 */

import { SSHHost } from './types';

/**
 * Parsed SSH config host entry
 */
interface ParsedHost {
  /** Host pattern/alias from Host directive */
  pattern: string;

  /** Additional aliases from Host directive */
  aliases: string[];

  /** Target hostname or IP */
  hostname?: string;

  /** SSH username */
  user?: string;

  /** SSH port */
  port?: number;

  /** Path to private key file */
  identityFile?: string;

  /** Host groups from comment metadata */
  groups?: string[];
}

/**
 * Result of parsing SSH config file
 */
export interface SSHConfigParseResult {
  /** Successfully parsed hosts */
  hosts: SSHHost[];

  /** Parse errors encountered */
  errors: string[];

  /** Whether parsing was successful (may have warnings) */
  success: boolean;
}

/**
 * Parse an OpenSSH config file and extract host definitions
 *
 * @param content - SSH config file content
 * @returns Parse result with hosts and any errors
 */
export function parseSSHConfig(content: string): SSHConfigParseResult {
  const result: SSHConfigParseResult = {
    hosts: [],
    errors: [],
    success: true,
  };

  try {
    const lines = content.split('\n');
    let currentHost: ParsedHost | null = null;
    let lineNumber = 0;

    for (const rawLine of lines) {
      lineNumber++;
      const line = rawLine.trim();

      // Skip empty lines
      if (!line) {
        continue;
      }

      // Check for group metadata comment
      if (line.startsWith('#')) {
        const groupMatch = line.match(/^#\s*Groups:\s*(.+)$/i);
        if (groupMatch && currentHost) {
          // Parse comma-separated groups
          const groups = groupMatch[1]
            .split(',')
            .map(g => g.trim())
            .filter(g => g.length > 0);
          currentHost.groups = groups;
        }
        continue;
      }

      // Parse Host directive
      const hostMatch = line.match(/^Host(\s+(.+))?$/i);
      if (hostMatch) {
        // Save previous host if exists
        if (currentHost) {
          const host = convertToSSHHost(currentHost);
          if (host) {
            result.hosts.push(host);
          }
        }

        // Extract host patterns/aliases
        const hostLine = hostMatch[2] || '';
        const patterns = hostLine.split(/\s+/).filter(p => p.length > 0);

        if (patterns.length === 0) {
          result.errors.push(`Line ${lineNumber}: Host directive without pattern`);
          currentHost = null;
          continue;
        }

        // Skip wildcard patterns (Host *, Host *.prod, etc.)
        if (patterns[0].includes('*') || patterns[0].includes('?')) {
          currentHost = null;
          continue;
        }

        // First pattern is the primary name, rest are aliases
        currentHost = {
          pattern: patterns[0],
          aliases: patterns.slice(1),
        };
        continue;
      }

      // Parse configuration keywords (only if we have a current host)
      if (currentHost) {
        const keywordMatch = line.match(/^(\w+)\s+(.+)$/);
        if (keywordMatch) {
          const keyword = keywordMatch[1].toLowerCase();
          const value = keywordMatch[2].trim();

          switch (keyword) {
            case 'hostname':
              currentHost.hostname = value;
              break;

            case 'user':
              currentHost.user = value;
              break;

            case 'port':
              const port = parseInt(value, 10);
              if (isNaN(port) || port < 1 || port > 65535) {
                result.errors.push(`Line ${lineNumber}: Invalid port number "${value}"`);
              } else {
                currentHost.port = port;
              }
              break;

            case 'identityfile':
              // Remove quotes if present
              currentHost.identityFile = value.replace(/^["']|["']$/g, '');
              break;

            // Ignore other keywords (StrictHostKeyChecking, ServerAliveInterval, etc.)
            default:
              break;
          }
        }
      }
    }

    // Save last host if exists
    if (currentHost) {
      const host = convertToSSHHost(currentHost);
      if (host) {
        result.hosts.push(host);
      }
    }

    // If we encountered errors but still parsed some hosts, mark as success
    // (graceful error handling)
    result.success = true;

  } catch (error) {
    result.errors.push(`Parse error: ${error instanceof Error ? error.message : String(error)}`);
    result.success = false;
  }

  return result;
}

/**
 * Convert parsed host entry to SSHHost format
 *
 * @param parsed - Parsed host entry
 * @returns SSHHost or null if invalid
 */
function convertToSSHHost(parsed: ParsedHost): SSHHost | null {
  // Must have at least a hostname to be valid
  if (!parsed.hostname) {
    return null;
  }

  // Use pattern as the primary name
  const name = parsed.pattern;

  // Build SSH URI
  const uri = `ssh://${parsed.hostname}`;

  // Use first alias if available, otherwise use pattern
  const alias = parsed.aliases.length > 0 ? parsed.aliases[0] : undefined;

  return {
    name,
    uri,
    alias,
    user: parsed.user,
    port: parsed.port,
    privateKeyPath: parsed.identityFile,
    groups: parsed.groups,
  };
}

/**
 * Serialize SSH hosts back to SSH config format
 *
 * This is primarily used for testing round-trip parsing.
 *
 * @param hosts - Array of SSH hosts
 * @returns SSH config file content
 */
export function serializeSSHConfig(hosts: SSHHost[]): string {
  const lines: string[] = [];

  for (const host of hosts) {
    // Build Host line with name and alias
    const hostLine = host.alias ? `Host ${host.name} ${host.alias}` : `Host ${host.name}`;
    lines.push(hostLine);

    // Extract hostname from URI
    const hostname = host.uri.replace(/^ssh:\/\//, '');
    lines.push(`    HostName ${hostname}`);

    // Add optional fields
    if (host.user) {
      lines.push(`    User ${host.user}`);
    }

    if (host.port) {
      lines.push(`    Port ${host.port}`);
    }

    if (host.privateKeyPath) {
      lines.push(`    IdentityFile ${host.privateKeyPath}`);
    }

    // Add groups as comment metadata
    if (host.groups && host.groups.length > 0) {
      lines.push(`    # Groups: ${host.groups.join(',')}`);
    }

    // Add blank line between hosts
    lines.push('');
  }

  return lines.join('\n');
}
