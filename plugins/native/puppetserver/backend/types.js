"use strict";
/**
 * Types for Puppetserver service operations
 *
 * @module plugins/native/puppetserver/backend/types
 * @version 1.0.0
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.PuppetserverValidationError = exports.PuppetserverConfigurationError = exports.PuppetserverTimeoutError = exports.EnvironmentDeploymentError = exports.CatalogCompilationError = exports.PuppetserverAuthenticationError = exports.PuppetserverConnectionError = exports.PuppetserverError = void 0;
// =============================================================================
// Error Classes
// =============================================================================
/**
 * Base error class for all Puppetserver-related errors
 */
class PuppetserverError extends Error {
    code;
    details;
    constructor(message, code, details) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = "PuppetserverError";
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.PuppetserverError = PuppetserverError;
/**
 * Error for Puppetserver connection failures
 */
class PuppetserverConnectionError extends PuppetserverError {
    constructor(message, details) {
        super(message, "PUPPETSERVER_CONNECTION_ERROR", details);
        this.name = "PuppetserverConnectionError";
    }
}
exports.PuppetserverConnectionError = PuppetserverConnectionError;
/**
 * Error for Puppetserver authentication failures
 */
class PuppetserverAuthenticationError extends PuppetserverError {
    constructor(message, details) {
        super(message, "PUPPETSERVER_AUTH_ERROR", details);
        this.name = "PuppetserverAuthenticationError";
    }
}
exports.PuppetserverAuthenticationError = PuppetserverAuthenticationError;
/**
 * Error for catalog compilation failures
 */
class CatalogCompilationError extends PuppetserverError {
    certname;
    environment;
    compilationErrors;
    constructor(message, certname, environment, compilationErrors, details) {
        super(message, "CATALOG_COMPILATION_ERROR", details);
        this.certname = certname;
        this.environment = environment;
        this.compilationErrors = compilationErrors;
        this.name = "CatalogCompilationError";
    }
}
exports.CatalogCompilationError = CatalogCompilationError;
/**
 * Error for environment deployment failures
 */
class EnvironmentDeploymentError extends PuppetserverError {
    environment;
    constructor(message, environment, details) {
        super(message, "ENVIRONMENT_DEPLOYMENT_ERROR", details);
        this.environment = environment;
        this.name = "EnvironmentDeploymentError";
    }
}
exports.EnvironmentDeploymentError = EnvironmentDeploymentError;
/**
 * Error for Puppetserver timeout
 */
class PuppetserverTimeoutError extends PuppetserverError {
    constructor(message, details) {
        super(message, "PUPPETSERVER_TIMEOUT_ERROR", details);
        this.name = "PuppetserverTimeoutError";
    }
}
exports.PuppetserverTimeoutError = PuppetserverTimeoutError;
/**
 * Error for invalid Puppetserver configuration
 */
class PuppetserverConfigurationError extends PuppetserverError {
    constructor(message, details) {
        super(message, "PUPPETSERVER_CONFIGURATION_ERROR", details);
        this.name = "PuppetserverConfigurationError";
    }
}
exports.PuppetserverConfigurationError = PuppetserverConfigurationError;
/**
 * Error for data validation failures
 */
class PuppetserverValidationError extends PuppetserverError {
    constructor(message, details) {
        super(message, "PUPPETSERVER_VALIDATION_ERROR", details);
        this.name = "PuppetserverValidationError";
    }
}
exports.PuppetserverValidationError = PuppetserverValidationError;
//# sourceMappingURL=types.js.map
