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
 * A single item in the Bolt JSON output `items` array.
 * Each item represents the result of executing against one target node.
 */
export interface BoltJsonOutputItem {
  target: string;
  status: "success" | "failure";
  value?: {
    stdout?: string;
    stderr?: string;
    exit_code?: number;
    _error?: {
      kind?: string;
      msg?: string;
      message?: string;
      details?: Record<string, unknown>;
    };
    [key: string]: unknown;
  };
  error?: {
    kind?: string;
    msg?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
  [key: string]: unknown;
}

/**
 * Parsed JSON output from Bolt CLI.
 *
 * Bolt returns structured JSON with an `items` array containing per-node results
 * for command/task executions, or `inventory`/`targets` for inventory queries.
 */
export interface BoltJsonOutput {
  /** Per-node execution results (commands, tasks, plans) */
  items?: BoltJsonOutputItem[];
  /** Inventory query results */
  inventory?: {
    targets?: unknown[];
    [key: string]: unknown;
  };
  /** Direct targets array (alternative inventory format) */
  targets?: unknown[];
  /** Allow additional Bolt-specific fields */
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
 * Error thrown when a node is unreachable
 */
export class BoltNodeUnreachableError extends Error {
  constructor(
    message: string,
    public readonly nodeId: string,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "BoltNodeUnreachableError";
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
  config: Record<string, unknown> & {
    user?: string;
    port?: number;
  };
  source?: string; // Source of the node data (e.g., 'bolt', 'puppetdb', 'puppetserver')
  certificateStatus?: "signed" | "requested" | "revoked"; // Certificate status for Puppetserver nodes
}

/**
 * Facts gathered from a target node
 */
export interface Facts {
  nodeId: string;
  gatheredAt: string;
  source?: string; // Source of facts (e.g., 'bolt', 'puppetdb')
  facts: {
    os: {
      family: string;
      name: string;
      release: {
        full: string;
        major: string;
      };
    };
    processors: {
      count: number;
      models: string[];
    };
    memory: {
      system: {
        total: string;
        available: string;
      };
    };
    networking: {
      hostname: string;
      interfaces: Record<string, unknown>;
    };
    // Categories for organized fact display (requirement 2.3)
    categories?: {
      system: Record<string, unknown>;
      network: Record<string, unknown>;
      hardware: Record<string, unknown>;
      custom: Record<string, unknown>;
    };
    [key: string]: unknown;
  };
  command?: string;
}

/**
 * Result of executing a command or task on target nodes
 */
export interface ExecutionResult {
  id: string;
  type: "command" | "task" | "facts" | "puppet" | "package" | "plan";
  targetNodes: string[];
  action: string;
  parameters?: Record<string, unknown>;
  status: "running" | "success" | "failed" | "partial";
  startedAt: string;
  completedAt?: string;
  results: NodeResult[];
  error?: string;
  command?: string;
  expertMode?: boolean;
  stdout?: string; // Complete stdout output (captured when expert mode enabled)
  stderr?: string; // Complete stderr output (captured when expert mode enabled)
}

/**
 * Result of executing a command or task on a single node
 */
export interface NodeResult {
  nodeId: string;
  status: "success" | "failed";
  output?: {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
  };
  value?: unknown;
  error?: string;
  duration: number;
}

/**
 * Bolt task definition
 */
export interface Task {
  name: string;
  module: string;
  description?: string;
  parameters: TaskParameter[];
  modulePath: string;
}

/**
 * Tasks grouped by module
 */
export type TasksByModule = Record<string, Task[]>;

/**
 * Task parameter definition
 */
export interface TaskParameter {
  name: string;
  type: "String" | "Integer" | "Boolean" | "Array" | "Hash";
  description?: string;
  required: boolean;
  default?: unknown;
  enum?: string[]; // For Enum types, list of allowed values
  puppetType?: string; // Original Puppet type string for reference
}

/**
 * Error thrown when a task is not found
 */
export class BoltTaskNotFoundError extends Error {
  constructor(
    message: string,
    public readonly taskName: string,
  ) {
    super(message);
    this.name = "BoltTaskNotFoundError";
  }
}

/**
 * Error thrown when task parameters are invalid
 */
export class BoltTaskParameterError extends Error {
  constructor(
    message: string,
    public readonly taskName: string,
    public readonly parameterErrors: string[],
  ) {
    super(message);
    this.name = "BoltTaskParameterError";
  }
}

/**
 * Structured JSON error format returned by Bolt CLI
 *
 * Bolt emits errors as JSON objects with an `_error` field containing
 * a `kind` (namespaced error type), `msg` (human-readable message),
 * and optional `details` object.
 */
export interface BoltJsonError {
  _error: {
    kind: string;
    msg: string;
    details?: Record<string, unknown>;
  };
}
