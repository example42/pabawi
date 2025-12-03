/**
 * Puppetserver Error Classes
 *
 * Custom error classes for Puppetserver integration operations.
 */

/**
 * Base error class for all Puppetserver-related errors
 */
export class PuppetserverError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'PuppetserverError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error for Puppetserver connection failures
 */
export class PuppetserverConnectionError extends PuppetserverError {
  constructor(message: string, details?: unknown) {
    super(message, 'PUPPETSERVER_CONNECTION_ERROR', details);
    this.name = 'PuppetserverConnectionError';
  }
}

/**
 * Error for Puppetserver authentication failures
 */
export class PuppetserverAuthenticationError extends PuppetserverError {
  constructor(message: string, details?: unknown) {
    super(message, 'PUPPETSERVER_AUTH_ERROR', details);
    this.name = 'PuppetserverAuthenticationError';
  }
}

/**
 * Error for certificate operation failures
 */
export class CertificateOperationError extends PuppetserverError {
  constructor(
    message: string,
    public readonly operation: 'sign' | 'revoke',
    public readonly certname: string,
    details?: unknown
  ) {
    super(message, 'CERTIFICATE_OPERATION_ERROR', details);
    this.name = 'CertificateOperationError';
  }
}

/**
 * Error for catalog compilation failures
 */
export class CatalogCompilationError extends PuppetserverError {
  constructor(
    message: string,
    public readonly certname: string,
    public readonly environment: string,
    public readonly compilationErrors?: string[],
    details?: unknown
  ) {
    super(message, 'CATALOG_COMPILATION_ERROR', details);
    this.name = 'CatalogCompilationError';
  }
}

/**
 * Error for environment deployment failures
 */
export class EnvironmentDeploymentError extends PuppetserverError {
  constructor(
    message: string,
    public readonly environment: string,
    details?: unknown
  ) {
    super(message, 'ENVIRONMENT_DEPLOYMENT_ERROR', details);
    this.name = 'EnvironmentDeploymentError';
  }
}

/**
 * Error for Puppetserver timeout
 */
export class PuppetserverTimeoutError extends PuppetserverError {
  constructor(message: string, details?: unknown) {
    super(message, 'PUPPETSERVER_TIMEOUT_ERROR', details);
    this.name = 'PuppetserverTimeoutError';
  }
}

/**
 * Error for invalid Puppetserver configuration
 */
export class PuppetserverConfigurationError extends PuppetserverError {
  constructor(message: string, details?: unknown) {
    super(message, 'PUPPETSERVER_CONFIGURATION_ERROR', details);
    this.name = 'PuppetserverConfigurationError';
  }
}

/**
 * Error for data validation failures
 */
export class PuppetserverValidationError extends PuppetserverError {
  constructor(message: string, details?: unknown) {
    super(message, 'PUPPETSERVER_VALIDATION_ERROR', details);
    this.name = 'PuppetserverValidationError';
  }
}
