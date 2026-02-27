import { z } from "zod";

/**
 * Regex for valid hostnames, IPs, and Bolt target URIs.
 * Allows alphanumeric, dots, hyphens, underscores, colons (IPv6/port), and ssh:// prefix.
 */
const NODE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/;

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
