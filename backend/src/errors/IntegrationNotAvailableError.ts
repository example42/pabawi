/**
 * Error thrown when an integration (e.g., execution tool) is not available or enabled.
 * Used for graceful degradation in multi-source scenarios.
 */
export class IntegrationNotAvailableError extends Error {
  public readonly statusCode: number = 503; // Service Unavailable

  constructor(message: string) {
    super(message);
    this.name = 'IntegrationNotAvailableError';
  }
}
