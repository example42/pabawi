import { z } from "zod";

/**
 * Regex for valid hostnames, IPs, and Bolt target URIs.
 * Allows alphanumeric, dots, hyphens, underscores, colons (IPv6/port), and ssh:// prefix.
 */
export const NODE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/;

/**
 * Reusable Zod string for Puppet certnames. Same charset as node IDs, capped
 * at 255 chars (Puppet's documented limit). Centralised so PuppetDB/Puppetserver
 * route params validate identically and reject command/injection payloads.
 */
export const CertnameStringSchema = z
  .string()
  .min(1, "Certname is required")
  .max(255, "Certname too long")
  .regex(NODE_ID_PATTERN, "Certname contains invalid characters");

/**
 * Reusable Zod string for PuppetDB report/catalog hashes — hex digests, 40
 * (SHA-1) to 128 (SHA-512) chars. Anything else is rejected before it can be
 * interpolated into a PQL query or URL path.
 */
export const PuppetHashStringSchema = z
  .string()
  .regex(/^[a-f0-9]{40,128}$/i, "Invalid Puppet hash (expected 40–128 hex chars)");

export const NodeIdParamSchema = z.object({
  id: z.string()
    .min(1, "Node ID is required")
    .max(253, "Node ID too long")
    .regex(NODE_ID_PATTERN, "Node ID contains invalid characters"),
});

export const NodeParamSchema = z.object({
  nodeId: z.string()
    .min(1, "Node ID is required")
    .max(253, "Node ID too long")
    .regex(NODE_ID_PATTERN, "Node ID contains invalid characters"),
});

/**
 * Strict regex for package names across apt, yum, dnf, zypper, pacman.
 * Allows alphanumeric, hyphens, underscores, dots, plus, colons, tildes.
 * Must start with alphanumeric.
 */
const PACKAGE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.+:~-]*$/;

/**
 * Validate and sanitize a package name to prevent shell injection.
 * Rejects any package name containing shell metacharacters.
 *
 * @param packageName - The package name to validate
 * @returns The validated package name
 * @throws Error if the package name contains invalid characters
 */
export function sanitizePackageName(packageName: string): string {
  const trimmed = packageName.trim();
  if (trimmed.length === 0) {
    throw new Error("Package name cannot be empty");
  }
  if (trimmed.length > 256) {
    throw new Error("Package name too long (max 256 characters)");
  }
  if (!PACKAGE_NAME_PATTERN.test(trimmed)) {
    throw new Error(
      `Invalid package name '${trimmed}': contains characters not allowed in package names`,
    );
  }
  return trimmed;
}

/**
 * Zod schema for validated package names (for use in route schemas).
 */
export const PackageNameSchema = z.string()
  .min(1, "Package name is required")
  .max(256, "Package name too long")
  .regex(PACKAGE_NAME_PATTERN, "Package name contains invalid characters");

/**
 * Strict regex for Puppet environment names.
 * Per Puppet spec: lowercase alphanumeric and underscores only.
 * Rejects any shell metacharacters to prevent command injection when the
 * environment is passed via `puppet agent --environment <name>`.
 *
 * @see https://www.puppet.com/docs/puppet/latest/environments_about.html
 */
const PUPPET_ENVIRONMENT_PATTERN = /^[a-z0-9_]+$/;

/**
 * Zod schema for validated Puppet environment names.
 */
export const PuppetEnvironmentSchema = z.string()
  .min(1, "Environment name is required")
  .max(64, "Environment name too long")
  .regex(
    PUPPET_ENVIRONMENT_PATTERN,
    "Environment name must contain only lowercase letters, digits, and underscores",
  );

/**
 * Strict regex for Puppet tag names.
 * Per Puppet source: lowercase alphanumeric, underscores, colons, dots, and hyphens.
 * Must start with an alphanumeric or underscore.
 * Rejects any shell metacharacters to prevent command injection when tags are
 * joined and passed via `puppet agent --tags <csv>`.
 *
 * @see https://github.com/puppetlabs/puppet/blob/main/lib/puppet/util/tagging.rb
 */
const PUPPET_TAG_PATTERN = /^[a-z0-9_][a-z0-9_:.-]*$/;

/**
 * Zod schema for validated Puppet tags.
 */
export const PuppetTagSchema = z.string()
  .min(1, "Tag is required")
  .max(128, "Tag too long")
  .regex(
    PUPPET_TAG_PATTERN,
    "Tag must contain only lowercase letters, digits, underscores, colons, dots, and hyphens",
  );

/**
 * Strict regex for Unix usernames.
 * POSIX: start with lowercase letter or underscore, then lowercase, digits, hyphens, underscores.
 */
const UNIX_USERNAME_PATTERN = /^[a-z_][a-z0-9_-]{0,31}$/;

/**
 * Validate a Unix username to prevent shell injection in sudo commands.
 *
 * @param username - The username to validate
 * @returns The validated username
 * @throws Error if the username contains invalid characters
 */
export function sanitizeUsername(username: string): string {
  const trimmed = username.trim();
  if (!UNIX_USERNAME_PATTERN.test(trimmed)) {
    throw new Error(
      `Invalid username '${trimmed}': must be a valid Unix username (lowercase, starts with letter or underscore, max 32 chars)`,
    );
  }
  return trimmed;
}
