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
   * Check if a command is allowed based on whitelist configuration
   *
   * @param command - The command string to validate
   * @returns true if the command is allowed, false otherwise
   */
  public isCommandAllowed(command: string): boolean {
    // If allowAll is enabled, permit all commands
    if (this.config.allowAll) {
      return true;
    }

    // If allowAll is disabled and whitelist is empty, reject all commands
    if (this.config.whitelist.length === 0) {
      return false;
    }

    // Trim the command for consistent matching
    const trimmedCommand = command.trim();

    // Check against whitelist based on match mode
    if (this.config.matchMode === "exact") {
      return this.config.whitelist.includes(trimmedCommand);
    } else {
      // Prefix match mode
      return this.config.whitelist.some((allowed) =>
        trimmedCommand.startsWith(allowed),
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
