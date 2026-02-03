"use strict";
/**
 * Types for Bolt service operations
 *
 * @module plugins/native/bolt/backend/types
 * @version 1.0.0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BoltTaskParameterError = exports.BoltTaskNotFoundError = exports.BoltNodeUnreachableError = exports.BoltInventoryNotFoundError = exports.BoltParseError = exports.BoltTimeoutError = exports.BoltExecutionError = void 0;
/**
 * Error thrown when Bolt execution fails
 */
class BoltExecutionError extends Error {
    exitCode;
    stderr;
    stdout;
    constructor(message, exitCode, stderr, stdout) {
        super(message);
        this.exitCode = exitCode;
        this.stderr = stderr;
        this.stdout = stdout;
        this.name = "BoltExecutionError";
    }
}
exports.BoltExecutionError = BoltExecutionError;
/**
 * Error thrown when Bolt execution times out
 */
class BoltTimeoutError extends Error {
    timeout;
    constructor(message, timeout) {
        super(message);
        this.timeout = timeout;
        this.name = "BoltTimeoutError";
    }
}
exports.BoltTimeoutError = BoltTimeoutError;
/**
 * Error thrown when Bolt JSON output cannot be parsed
 */
class BoltParseError extends Error {
    output;
    parseError;
    constructor(message, output, parseError) {
        super(message);
        this.output = output;
        this.parseError = parseError;
        this.name = "BoltParseError";
    }
}
exports.BoltParseError = BoltParseError;
/**
 * Error thrown when inventory file is not found
 */
class BoltInventoryNotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = "BoltInventoryNotFoundError";
    }
}
exports.BoltInventoryNotFoundError = BoltInventoryNotFoundError;
/**
 * Error thrown when a node is unreachable
 */
class BoltNodeUnreachableError extends Error {
    nodeId;
    details;
    constructor(message, nodeId, details) {
        super(message);
        this.nodeId = nodeId;
        this.details = details;
        this.name = "BoltNodeUnreachableError";
    }
}
exports.BoltNodeUnreachableError = BoltNodeUnreachableError;
/**
 * Error thrown when a task is not found
 */
class BoltTaskNotFoundError extends Error {
    taskName;
    constructor(message, taskName) {
        super(message);
        this.taskName = taskName;
        this.name = "BoltTaskNotFoundError";
    }
}
exports.BoltTaskNotFoundError = BoltTaskNotFoundError;
/**
 * Error thrown when task parameters are invalid
 */
class BoltTaskParameterError extends Error {
    taskName;
    parameterErrors;
    constructor(message, taskName, parameterErrors) {
        super(message);
        this.taskName = taskName;
        this.parameterErrors = parameterErrors;
        this.name = "BoltTaskParameterError";
    }
}
exports.BoltTaskParameterError = BoltTaskParameterError;
//# sourceMappingURL=types.js.map
