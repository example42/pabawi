/**
 * Types for Bolt service operations
 */

/**
 * Result from executing a Bolt command
 */
export interface BoltExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
}

/**
 * Parsed JSON output from Bolt CLI
 */
export interface BoltJsonOutput {
  [key: string]: unknown;
}

/**
 * Options for executing Bolt commands
 */
export interface BoltExecutionOptions {
  timeout?: number;
  cwd?: string;
  format?: "json" | "human";
}

/**
 * Error thrown when Bolt execution fails
 */
export class BoltExecutionError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number | null,
    public readonly stderr: string,
    public readonly stdout: string,
  ) {
    super(message);
    this.name = "BoltExecutionError";
  }
}

/**
 * Error thrown when Bolt execution times out
 */
export class BoltTimeoutError extends Error {
  constructor(
    message: string,
    public readonly timeout: number,
  ) {
    super(message);
    this.name = "BoltTimeoutError";
  }
}

/**
 * Error thrown when Bolt JSON output cannot be parsed
 */
export class BoltParseError extends Error {
  constructor(
    message: string,
    public readonly output: string,
    public readonly parseError: Error,
  ) {
    super(message);
    this.name = "BoltParseError";
  }
}

/**
 * Error thrown when inventory file is not found
 */
export class BoltInventoryNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BoltInventoryNotFoundError";
  }
}

/**
 * Node from Bolt inventory
 */
export interface Node {
  id: string;
  name: string;
  uri: string;
  transport: "ssh" | "winrm" | "docker" | "local";
  config: {
    user?: string;
    port?: number;
    [key: string]: unknown;
  };
}
