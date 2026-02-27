import type { WhitelistConfig } from "../config/schema";

/**
 * Error thrown when a command is not allowed by the whitelist
 */
export class CommandNotAllowedError extends Error {
  constructor(
    message: string,
    public readonly command: string,
    public readonly reason: string,
  ) {
    super(message);
    this.name = "CommandNotAllowedError";
  }
}

/**
 * Service for validating commands against a configurable whitelist
 * Supports exact and prefix match modes
 */
export class CommandWhitelistService {
  private config: WhitelistConfig;

  constructor(config: WhitelistConfig) {
    this.config = config;
  }

  /**
   * Shell metacharacters that are always blocked in commands.
   * Prevents command chaining, piping, subshell execution, and glob expansion.
   * Applied regardless of allowAll setting to protect remote targets.
   */
  private static readonly SHELL_META_PATTERN = /[;|&`$(){}\n\r\t><\\*?\[\]~]/;

  /**
   * Check if a command is allowed based on whitelist configuration
   *
   * @param command - The command string to validate
   * @returns true if the command is allowed, false otherwise
   */
  public isCommandAllowed(command: string): boolean {
    // Trim the command for consistent matching
    const trimmedCommand = command.trim();

    // Always block shell metacharacters — even in allowAll mode.
    // These characters are interpreted by remote shells on target nodes
    // and could enable command injection regardless of local shell safety.
    if (CommandWhitelistService.SHELL_META_PATTERN.test(trimmedCommand)) {
      return false;
    }

    // If allowAll is enabled, permit all commands (metacharacters already blocked above)
    if (this.config.allowAll) {
      return true;
    }

    // If allowAll is disabled and whitelist is empty, reject all commands
    if (this.config.whitelist.length === 0) {
      return false;
    }

    // Check against whitelist based on match mode
    if (this.config.matchMode === "exact") {
      return this.config.whitelist.includes(trimmedCommand);
    } else {
      // Prefix match mode — require word boundary (end-of-string or space after prefix)
      return this.config.whitelist.some((allowed) =>
        trimmedCommand === allowed || trimmedCommand.startsWith(allowed + " "),
      );
    }
  }

  /**
   * Validate a command and throw an error if not allowed
   *
   * @param command - The command string to validate
   * @throws {CommandNotAllowedError} if the command is not allowed
   */
  public validateCommand(command: string): void {
    if (!this.isCommandAllowed(command)) {
      const reason = this.getValidationFailureReason();
      throw new CommandNotAllowedError(
        `Command not allowed: ${command}`,
        command,
        reason,
      );
    }
  }

  /**
   * Get the whitelist configuration
   *
   * @returns The current whitelist configuration
   */
  public getWhitelist(): string[] {
    return [...this.config.whitelist];
  }

  /**
   * Check if allow-all mode is enabled
   *
   * @returns true if all commands are allowed
   */
  public isAllowAllEnabled(): boolean {
    return this.config.allowAll;
  }

  /**
   * Get the match mode (exact or prefix)
   *
   * @returns The current match mode
   */
  public getMatchMode(): "exact" | "prefix" {
    return this.config.matchMode;
  }

  /**
   * Get a detailed reason why command validation failed
   *
   * @returns A descriptive reason for the failure
   */
  private getValidationFailureReason(): string {
    if (this.config.allowAll) {
      return "Command should be allowed (allowAll is enabled)";
    }

    if (this.config.whitelist.length === 0) {
      return "No commands are allowed (whitelist is empty and allowAll is disabled)";
    }

    if (this.config.matchMode === "exact") {
      return `Command not found in whitelist (exact match mode). Allowed commands: ${this.config.whitelist.join(", ")}`;
    } else {
      return `Command does not match any whitelist prefix (prefix match mode). Allowed prefixes: ${this.config.whitelist.join(", ")}`;
    }
  }
}
