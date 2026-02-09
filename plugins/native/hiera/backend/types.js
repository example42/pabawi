"use strict";
/**
 * Types for Hiera service operations
 *
 * @module plugins/native/hiera/backend/types
 * @version 1.0.0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HieraResolutionError = exports.HieraParseError = exports.HieraConfigurationError = exports.HieraServiceError = exports.HIERA_ERROR_CODES = void 0;
// ============================================================================
// Error Types
// ============================================================================
/**
 * Hiera error codes
 */
exports.HIERA_ERROR_CODES = {
    NOT_CONFIGURED: "HIERA_NOT_CONFIGURED",
    INVALID_PATH: "HIERA_INVALID_PATH",
    PARSE_ERROR: "HIERA_PARSE_ERROR",
    RESOLUTION_ERROR: "HIERA_RESOLUTION_ERROR",
    FACTS_UNAVAILABLE: "HIERA_FACTS_UNAVAILABLE",
    CATALOG_COMPILATION_FAILED: "HIERA_CATALOG_COMPILATION_FAILED",
    ANALYSIS_ERROR: "HIERA_ANALYSIS_ERROR",
    FORGE_UNAVAILABLE: "HIERA_FORGE_UNAVAILABLE",
};
/**
 * Base error class for Hiera errors
 */
class HieraServiceError extends Error {
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = "HieraServiceError";
    }
}
exports.HieraServiceError = HieraServiceError;
/**
 * Error for Hiera configuration issues
 */
class HieraConfigurationError extends HieraServiceError {
    constructor(message, details) {
        super(message, exports.HIERA_ERROR_CODES.NOT_CONFIGURED, details);
        this.name = "HieraConfigurationError";
    }
}
exports.HieraConfigurationError = HieraConfigurationError;
/**
 * Error for Hiera parse failures
 */
class HieraParseError extends HieraServiceError {
    constructor(message, details) {
        super(message, exports.HIERA_ERROR_CODES.PARSE_ERROR, details);
        this.name = "HieraParseError";
    }
}
exports.HieraParseError = HieraParseError;
/**
 * Error for Hiera resolution failures
 */
class HieraResolutionError extends HieraServiceError {
    constructor(message, details) {
        super(message, exports.HIERA_ERROR_CODES.RESOLUTION_ERROR, details);
        this.name = "HieraResolutionError";
    }
}
exports.HieraResolutionError = HieraResolutionError;
