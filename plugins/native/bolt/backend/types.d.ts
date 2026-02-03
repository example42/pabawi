/**
 * Types for Bolt service operations
 *
 * @module plugins/native/bolt/backend/types
 * @version 1.0.0
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
export type BoltJsonOutput = Record<string, unknown> & {
    inventory?: {
        targets?: unknown[];
        [key: string]: unknown;
    };
    targets?: unknown[];
};
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
export declare class BoltExecutionError extends Error {
    readonly exitCode: number | null;
    readonly stderr: string;
    readonly stdout: string;
    constructor(message: string, exitCode: number | null, stderr: string, stdout: string);
}
/**
 * Error thrown when Bolt execution times out
 */
export declare class BoltTimeoutError extends Error {
    readonly timeout: number;
    constructor(message: string, timeout: number);
}
/**
 * Error thrown when Bolt JSON output cannot be parsed
 */
export declare class BoltParseError extends Error {
    readonly output: string;
    readonly parseError: Error;
    constructor(message: string, output: string, parseError: Error);
}
/**
 * Error thrown when inventory file is not found
 */
export declare class BoltInventoryNotFoundError extends Error {
    constructor(message: string);
}
/**
 * Error thrown when a node is unreachable
 */
export declare class BoltNodeUnreachableError extends Error {
    readonly nodeId: string;
    readonly details?: string | undefined;
    constructor(message: string, nodeId: string, details?: string | undefined);
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
    source?: string;
    certificateStatus?: "signed" | "requested" | "revoked";
}
/**
 * Facts gathered from a target node
 */
export interface Facts {
    nodeId: string;
    gatheredAt: string;
    source?: string;
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
    type: "command" | "task" | "facts" | "puppet" | "package";
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
    stdout?: string;
    stderr?: string;
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
    enum?: string[];
    puppetType?: string;
}
/**
 * Error thrown when a task is not found
 */
export declare class BoltTaskNotFoundError extends Error {
    readonly taskName: string;
    constructor(message: string, taskName: string);
}
/**
 * Error thrown when task parameters are invalid
 */
export declare class BoltTaskParameterError extends Error {
    readonly taskName: string;
    readonly parameterErrors: string[];
    constructor(message: string, taskName: string, parameterErrors: string[]);
}
//# sourceMappingURL=types.d.ts.map
