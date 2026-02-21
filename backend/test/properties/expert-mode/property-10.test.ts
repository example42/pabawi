/**
 * Feature: pabawi-v0.5.0-release, Property 10: External API Error Visibility
 * Validates: Requirements 3.14
 *
 * This property test verifies that:
 * For any external integration API call (PuppetDB, PuppetServer, Bolt, Hiera) that fails,
 * the debug information should capture the error message, stack trace, and connection details
 * when expert mode is enabled.
 */

import { describe, it } from 'vitest';
import fc from 'fast-check';
import { ExpertModeService } from '../../../src/services/ExpertModeService';
import type { DebugInfo, ErrorInfo } from '../../../src/services/ExpertModeService';

describe('Property 10: External API Error Visibility', () => {
  const propertyTestConfig = {
    numRuns: 100,
    verbose: false,
  };

  // Generator for integration names
  const integrationArb = fc.constantFrom('bolt', 'puppetdb', 'puppetserver', 'hiera');

  // Generator for error types
  const errorTypeArb = fc.constantFrom(
    'connection',
    'authentication',
    'timeout',
    'query',
    'network',
    'certificate',
    'permission'
  );

  // Generator for HTTP status codes (error codes)
  const errorStatusCodeArb = fc.constantFrom(400, 401, 403, 404, 500, 502, 503, 504);

  // Generator for external API error details
  const externalApiErrorArb = fc.record({
    integration: integrationArb,
    errorType: errorTypeArb,
    errorMessage: fc.string({ minLength: 10, maxLength: 200 }),
    statusCode: fc.option(errorStatusCodeArb),
    endpoint: fc.webUrl(),
    stack: fc.option(fc.string({ minLength: 20, maxLength: 500 })),
    connectionDetails: fc.option(
      fc.record({
        host: fc.domain(),
        port: fc.integer({ min: 1, max: 65535 }),
        protocol: fc.constantFrom('http', 'https'),
        timeout: fc.integer({ min: 1000, max: 60000 }),
      })
    ),
  });

  it('should capture external API errors in debug info', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        externalApiErrorArb,
        fc.string({ minLength: 10, maxLength: 30 }),
        fc.integer({ min: 0, max: 10000 }),
        (apiError, requestId, duration) => {
          // Create debug info
          const debugInfo = service.createDebugInfo(
            `${apiError.integration}-api-call`,
            requestId,
            duration
          );

          // Set integration
          service.setIntegration(debugInfo, apiError.integration);

          // Add external API error
          const errorInfo: ErrorInfo = {
            message: `${apiError.integration} ${apiError.errorType} error: ${apiError.errorMessage}`,
            stack: apiError.stack,
            code: apiError.statusCode?.toString(),
            level: 'error',
          };
          service.addError(debugInfo, errorInfo);

          // Verify error is captured
          return (
            debugInfo.integration === apiError.integration &&
            Array.isArray(debugInfo.errors) &&
            debugInfo.errors.length > 0 &&
            debugInfo.errors[0].message.includes(apiError.integration) &&
            debugInfo.errors[0].message.includes(apiError.errorType) &&
            debugInfo.errors[0].level === 'error'  // pragma: allowlist secret
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should capture error message for all integration types', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        integrationArb,
        errorTypeArb,
        fc.string({ minLength: 10, maxLength: 200 }),
        fc.string({ minLength: 10, maxLength: 30 }),
        (integration, errorType, errorMessage, requestId) => {
          const debugInfo = service.createDebugInfo(`${integration}-call`, requestId, 0);
          service.setIntegration(debugInfo, integration);

          const errorInfo: ErrorInfo = {
            message: `${integration} ${errorType}: ${errorMessage}`,
            level: 'error',
          };
          service.addError(debugInfo, errorInfo);

          return (
            debugInfo.errors !== undefined &&
            debugInfo.errors.length > 0 &&
            debugInfo.errors[0].message.includes(integration) &&
            debugInfo.errors[0].message.includes(errorType)
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should capture stack trace when available', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        externalApiErrorArb.filter(err => err.stack !== undefined),
        fc.string({ minLength: 10, maxLength: 30 }),
        (apiError, requestId) => {
          const debugInfo = service.createDebugInfo(`${apiError.integration}-call`, requestId, 0);
          service.setIntegration(debugInfo, apiError.integration);

          const errorInfo: ErrorInfo = {
            message: apiError.errorMessage,
            stack: apiError.stack,
            level: 'error',
          };
          service.addError(debugInfo, errorInfo);

          return (
            debugInfo.errors !== undefined &&
            debugInfo.errors.length > 0 &&
            debugInfo.errors[0].stack !== undefined &&
            debugInfo.errors[0].stack === apiError.stack
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should capture error code/status code when available', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        externalApiErrorArb.filter(err => err.statusCode !== undefined && err.statusCode !== null),
        fc.string({ minLength: 10, maxLength: 30 }),
        (apiError, requestId) => {
          const debugInfo = service.createDebugInfo(`${apiError.integration}-call`, requestId, 0);
          service.setIntegration(debugInfo, apiError.integration);

          const errorInfo: ErrorInfo = {
            message: apiError.errorMessage,
            code: apiError.statusCode?.toString(),
            level: 'error',
          };
          service.addError(debugInfo, errorInfo);

          return (
            debugInfo.errors !== undefined &&
            debugInfo.errors.length > 0 &&
            debugInfo.errors[0].code !== undefined &&
            debugInfo.errors[0].code === apiError.statusCode?.toString()
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should capture connection details in metadata', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        externalApiErrorArb.filter(err => err.connectionDetails !== undefined && err.connectionDetails !== null),
        fc.string({ minLength: 10, maxLength: 30 }),
        (apiError, requestId) => {
          const debugInfo = service.createDebugInfo(`${apiError.integration}-call`, requestId, 0);
          service.setIntegration(debugInfo, apiError.integration);

          // Add connection details to metadata
          if (apiError.connectionDetails) {
            service.addMetadata(debugInfo, 'connectionDetails', apiError.connectionDetails);
          }

          // Add error
          const errorInfo: ErrorInfo = {
            message: apiError.errorMessage,
            level: 'error',
          };
          service.addError(debugInfo, errorInfo);

          return (
            debugInfo.metadata !== undefined &&
            'connectionDetails' in debugInfo.metadata &&
            debugInfo.errors !== undefined &&
            debugInfo.errors.length > 0
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should capture multiple external API errors', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        fc.array(externalApiErrorArb, { minLength: 2, maxLength: 5 }),
        fc.string({ minLength: 10, maxLength: 30 }),
        (apiErrors, requestId) => {
          const debugInfo = service.createDebugInfo('multiple-api-calls', requestId, 0);

          // Add all errors
          apiErrors.forEach(apiError => {
            const errorInfo: ErrorInfo = {
              message: `${apiError.integration} ${apiError.errorType}: ${apiError.errorMessage}`,
              stack: apiError.stack,
              code: apiError.statusCode?.toString(),
              level: 'error',
            };
            service.addError(debugInfo, errorInfo);
          });

          // All errors should be captured
          return (
            debugInfo.errors !== undefined &&
            debugInfo.errors.length === apiErrors.length &&
            debugInfo.errors.every((err, idx) =>
              err.message.includes(apiErrors[idx].integration) &&
              err.message.includes(apiErrors[idx].errorType)
            )
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should capture API endpoint information', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        externalApiErrorArb,
        fc.string({ minLength: 10, maxLength: 30 }),
        (apiError, requestId) => {
          const debugInfo = service.createDebugInfo(`${apiError.integration}-call`, requestId, 0);
          service.setIntegration(debugInfo, apiError.integration);

          // Add endpoint to metadata
          service.addMetadata(debugInfo, 'endpoint', apiError.endpoint);

          // Add error
          const errorInfo: ErrorInfo = {
            message: apiError.errorMessage,
            level: 'error',
          };
          service.addError(debugInfo, errorInfo);

          return (
            debugInfo.metadata !== undefined &&
            debugInfo.metadata.endpoint === apiError.endpoint &&
            debugInfo.errors !== undefined &&
            debugInfo.errors.length > 0
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should distinguish between different error types', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        integrationArb,
        fc.array(errorTypeArb, { minLength: 2, maxLength: 5 }),
        fc.string({ minLength: 10, maxLength: 30 }),
        (integration, errorTypes, requestId) => {
          const debugInfo = service.createDebugInfo(`${integration}-calls`, requestId, 0);
          service.setIntegration(debugInfo, integration);

          // Add different error types
          errorTypes.forEach(errorType => {
            const errorInfo: ErrorInfo = {
              message: `${integration} ${errorType} error occurred`,
              level: 'error',
            };
            service.addError(debugInfo, errorInfo);
          });

          // All error types should be captured
          return (
            debugInfo.errors !== undefined &&
            debugInfo.errors.length === errorTypes.length &&
            errorTypes.every(errorType =>
              debugInfo.errors!.some(err => err.message.includes(errorType))
            )
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should capture timeout errors with duration information', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        integrationArb,
        fc.integer({ min: 1000, max: 60000 }),
        fc.string({ minLength: 10, maxLength: 30 }),
        (integration, timeout, requestId) => {
          const debugInfo = service.createDebugInfo(`${integration}-timeout`, requestId, timeout);
          service.setIntegration(debugInfo, integration);

          const errorInfo: ErrorInfo = {
            message: `${integration} timeout error after ${timeout}ms`,
            level: 'error',
          };
          service.addError(debugInfo, errorInfo);

          return (
            debugInfo.duration === timeout &&
            debugInfo.errors !== undefined &&
            debugInfo.errors.length > 0 &&
            debugInfo.errors[0].message.includes('timeout')
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should capture authentication errors with context', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        integrationArb,
        fc.string({ minLength: 10, maxLength: 100 }),
        fc.string({ minLength: 10, maxLength: 30 }),
        (integration, authContext, requestId) => {
          const debugInfo = service.createDebugInfo(`${integration}-auth`, requestId, 0);
          service.setIntegration(debugInfo, integration);

          const errorInfo: ErrorInfo = {
            message: `${integration} authentication failed`,
            context: authContext,
            level: 'error',
          };
          service.addError(debugInfo, errorInfo);

          return (
            debugInfo.errors !== undefined &&
            debugInfo.errors.length > 0 &&
            debugInfo.errors[0].message.includes('authentication') &&
            debugInfo.errors[0].context === authContext
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should capture network errors with connection details', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        integrationArb,
        fc.record({
          host: fc.domain(),
          port: fc.integer({ min: 1, max: 65535 }),
          protocol: fc.constantFrom('http', 'https'),
        }),
        fc.string({ minLength: 10, maxLength: 30 }),
        (integration, connectionDetails, requestId) => {
          const debugInfo = service.createDebugInfo(`${integration}-network`, requestId, 0);
          service.setIntegration(debugInfo, integration);

          // Add connection details
          service.addMetadata(debugInfo, 'connectionDetails', connectionDetails);

          const errorInfo: ErrorInfo = {
            message: `${integration} network error: connection refused`,
            level: 'error',
          };
          service.addError(debugInfo, errorInfo);

          return (
            debugInfo.metadata !== undefined &&
            'connectionDetails' in debugInfo.metadata &&
            debugInfo.errors !== undefined &&
            debugInfo.errors.length > 0 &&
            debugInfo.errors[0].message.includes('network')
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should preserve error information when attaching to response', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        externalApiErrorArb,
        fc.string({ minLength: 10, maxLength: 30 }),
        fc.record({ error: fc.string(), statusCode: fc.integer() }),
        (apiError, requestId, errorResponse) => {
          const debugInfo = service.createDebugInfo(`${apiError.integration}-call`, requestId, 0);
          service.setIntegration(debugInfo, apiError.integration);

          const errorInfo: ErrorInfo = {
            message: `${apiError.integration} ${apiError.errorType}: ${apiError.errorMessage}`,
            stack: apiError.stack,
            code: apiError.statusCode?.toString(),
            level: 'error',
          };
          service.addError(debugInfo, errorInfo);

          // Attach to error response
          const result = service.attachDebugInfo(errorResponse, debugInfo);

          return (
            '_debug' in result &&
            result._debug !== undefined &&
            result._debug.integration === apiError.integration &&
            Array.isArray(result._debug.errors) &&
            result._debug.errors.length > 0 &&
            result._debug.errors[0].message.includes(apiError.integration)
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should capture certificate errors with details', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        integrationArb,
        fc.string({ minLength: 10, maxLength: 200 }),
        fc.string({ minLength: 10, maxLength: 30 }),
        (integration, certError, requestId) => {
          const debugInfo = service.createDebugInfo(`${integration}-cert`, requestId, 0);
          service.setIntegration(debugInfo, integration);

          const errorInfo: ErrorInfo = {
            message: `${integration} certificate error: ${certError}`,
            code: 'CERT_ERROR',
            level: 'error',
          };
          service.addError(debugInfo, errorInfo);

          return (
            debugInfo.errors !== undefined &&
            debugInfo.errors.length > 0 &&
            debugInfo.errors[0].message.includes('certificate') &&
            debugInfo.errors[0].code === 'CERT_ERROR'  // pragma: allowlist secret
          );
        }
      ),
      propertyTestConfig
    );
  });

  it('should capture query errors with query details', () => {
    const service = new ExpertModeService();

    fc.assert(
      fc.property(
        fc.constantFrom('puppetdb', 'puppetserver'),
        fc.string({ minLength: 10, maxLength: 200 }),
        fc.string({ minLength: 10, maxLength: 30 }),
        (integration, query, requestId) => {
          const debugInfo = service.createDebugInfo(`${integration}-query`, requestId, 0);
          service.setIntegration(debugInfo, integration);

          // Add query to metadata
          service.addMetadata(debugInfo, 'query', query);

          const errorInfo: ErrorInfo = {
            message: `${integration} query error: invalid syntax`,
            level: 'error',
          };
          service.addError(debugInfo, errorInfo);

          return (
            debugInfo.metadata !== undefined &&
            debugInfo.metadata.query === query &&
            debugInfo.errors !== undefined &&
            debugInfo.errors.length > 0 &&
            debugInfo.errors[0].message.includes('query')
          );
        }
      ),
      propertyTestConfig
    );
  });
});
